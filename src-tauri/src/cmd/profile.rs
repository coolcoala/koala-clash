use super::CmdResult;
use crate::{
    config::{Config, IProfiles, PrfItem, PrfOption},
    core::{handle, timer::Timer, tray::Tray, CoreManager},
    feat, logging, ret_err,
    utils::{dirs, help, logging::Type},
    wrap_err,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use percent_encoding::percent_decode_str;
use serde_yaml::Value;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};
use url::Url;

// 全局互斥锁防止并发配置更新
static PROFILE_UPDATE_MUTEX: Mutex<()> = Mutex::const_new(());

// 全局请求序列号跟踪，用于避免队列化执行
static CURRENT_REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);

static CURRENT_PROCESSING_PROFILE: RwLock<Option<String>> = RwLock::const_new(None);

/// 清理配置处理状态
async fn cleanup_processing_state(sequence: u64, reason: &str) {
    *CURRENT_PROCESSING_PROFILE.write().await = None;
    logging!(
        info,
        Type::Cmd,
        true,
        "{}，Cleanup status, serial number: {}",
        reason,
        sequence
    );
}

/// 获取配置文件避免锁竞争
#[tauri::command]
pub async fn get_profiles() -> CmdResult<IProfiles> {
    // 策略1: 尝试快速获取latest数据
    let latest_result = tokio::time::timeout(
        Duration::from_millis(500),
        tokio::task::spawn_blocking(move || {
            let profiles = Config::profiles();
            let latest = profiles.latest();
            IProfiles {
                current: latest.current.clone(),
                items: latest.items.clone(),
            }
        }),
    )
    .await;

    match latest_result {
        Ok(Ok(profiles)) => {
            logging!(
                info,
                Type::Cmd,
                false,
                "Quickly fetched profiles list successfully"
            );
            return Ok(profiles);
        }
        Ok(Err(join_err)) => {
            logging!(
                warn,
                Type::Cmd,
                true,
                "Quick profile list fetch task failed: {}",
                join_err
            );
        }
        Err(_) => {
            logging!(
                warn,
                Type::Cmd,
                true,
                "Quick profile list fetch timeout (500ms)"
            );
        }
    }

    // 策略2: 如果快速获取失败，尝试获取data()
    let data_result = tokio::time::timeout(
        Duration::from_secs(2),
        tokio::task::spawn_blocking(move || {
            let profiles = Config::profiles();
            let data = profiles.data();
            IProfiles {
                current: data.current.clone(),
                items: data.items.clone(),
            }
        }),
    )
    .await;

    match data_result {
        Ok(Ok(profiles)) => {
            logging!(
                info,
                Type::Cmd,
                false,
                "Fetched draft profile list successfully"
            );
            return Ok(profiles);
        }
        Ok(Err(join_err)) => {
            logging!(
                error,
                Type::Cmd,
                true,
                "Failed to obtain draft configuration task: {}",
                join_err
            );
        }
        Err(_) => {
            logging!(
                error,
                Type::Cmd,
                true,
                "Draft profile list fetch timeout (2s)"
            );
        }
    }

    // 策略3: fallback，尝试重新创建配置
    logging!(
        warn,
        Type::Cmd,
        true,
        "All attempts to obtain configuration policies failed. Trying fallback"
    );

    match tokio::task::spawn_blocking(IProfiles::new).await {
        Ok(profiles) => {
            logging!(
                info,
                Type::Cmd,
                true,
                "Fallback profiles created successfully"
            );
            Ok(profiles)
        }
        Err(err) => {
            logging!(
                error,
                Type::Cmd,
                true,
                "Fallback profiles creation failed: {}",
                err
            );
            // 返回空配置避免崩溃
            Ok(IProfiles {
                current: None,
                items: Some(vec![]),
            })
        }
    }
}

/// 增强配置文件
#[tauri::command]
pub async fn enhance_profiles() -> CmdResult {
    wrap_err!(feat::enhance_profiles().await)?;
    handle::Handle::refresh_clash();
    Ok(())
}

/// 导入配置文件
#[tauri::command]
pub async fn import_profile(url: String, option: Option<PrfOption>) -> CmdResult {
    let existing_uid = {
        let profiles = Config::profiles();
        let profiles = profiles.latest();

        profiles
            .items
            .as_ref()
            .and_then(|items| items.iter().find(|item| item.url.as_deref() == Some(&url)))
            .and_then(|item| item.uid.clone())
    };

    if let Some(uid) = existing_uid {
        logging!(
            info,
            Type::Cmd,
            true,
            "The profile with URL {} already exists (UID: {}). Running the update...",
            url,
            uid
        );
        update_profile(uid, option).await
    } else {
        logging!(
            info,
            Type::Cmd,
            true,
            "Profile with URL {} not found. Create a new one...",
            url
        );
        let item = wrap_err!(PrfItem::from_url(&url, None, None, option).await)?;
        let new_uid = item.uid.clone().unwrap_or_default();
        wrap_err!(Config::profiles().data().append_item(item))?;
        if !new_uid.is_empty() {
            let _ = patch_profiles_config(IProfiles {
                current: Some(new_uid),
                items: None,
            })
            .await?;
        }
        Ok(())
    }
}

/// 重新排序配置文件
#[tauri::command]
pub async fn reorder_profile(active_id: String, over_id: String) -> CmdResult {
    wrap_err!(Config::profiles().data().reorder(active_id, over_id))
}

/// 创建配置文件
#[tauri::command]
pub async fn create_profile(item: PrfItem, file_data: Option<String>) -> CmdResult {
    let item = wrap_err!(PrfItem::from(item, file_data).await)?;
    let new_uid = item.uid.clone().unwrap_or_default();
    wrap_err!(Config::profiles().data().append_item(item))?;

    if !new_uid.is_empty() {
        let _ = patch_profiles_config(IProfiles {
            current: Some(new_uid),
            items: None,
        })
        .await?;
    }
    Ok(())
}

/// 更新配置文件
#[tauri::command]
pub async fn update_profile(index: String, option: Option<PrfOption>) -> CmdResult {
    wrap_err!(feat::update_profile(index, option, Some(true)).await)
}

/// 删除配置文件
#[tauri::command]
pub async fn delete_profile(index: String) -> CmdResult {
    let should_update;

    {
        let profiles_config = Config::profiles();
        let mut profiles_data = profiles_config.data();
        should_update = profiles_data
            .delete_item(index.clone())
            .map_err(|e| e.to_string())?;

        let was_last_profile = profiles_data.items.as_ref().is_none_or(|items| {
            !items
                .iter()
                .any(|item| matches!(item.itype.as_deref(), Some("remote") | Some("local")))
        });

        if was_last_profile {
            logging!(
                info,
                Type::Cmd,
                true,
                "The last profile has been deleted. Disabling proxy modes..."
            );
            let verge_config = Config::verge();
            let mut verge_data = verge_config.data();

            if verge_data.enable_tun_mode == Some(true)
                || verge_data.enable_system_proxy == Some(true)
            {
                verge_data.enable_tun_mode = Some(false);
                verge_data.enable_system_proxy = Some(false);
                verge_data.save_file().map_err(|e| e.to_string())?;

                handle::Handle::refresh_verge();
                handle::Handle::notice_message("info", "All profiles deleted, proxy disabled.");
            }
        }
    }

    // 删除后自动清理冗余文件
    let _ = Config::profiles().latest().auto_cleanup();

    if should_update {
        wrap_err!(CoreManager::global().update_config().await)?;
        handle::Handle::refresh_clash();
    }
    Ok(())
}

/// 修改profiles的配置
#[tauri::command]
pub async fn patch_profiles_config(profiles: IProfiles) -> CmdResult<bool> {
    // 为当前请求分配序列号
    let current_sequence = CURRENT_REQUEST_SEQUENCE.fetch_add(1, Ordering::SeqCst) + 1;
    let target_profile = profiles.current.clone();

    logging!(
        info,
        Type::Cmd,
        true,
        "Starting to modify profiles, sequence: {}, target profile: {:?}",
        current_sequence,
        target_profile
    );

    let mutex_result =
        tokio::time::timeout(Duration::from_millis(100), PROFILE_UPDATE_MUTEX.lock()).await;

    let _guard = match mutex_result {
        Ok(guard) => guard,
        Err(_) => {
            let latest_sequence = CURRENT_REQUEST_SEQUENCE.load(Ordering::SeqCst);
            if current_sequence < latest_sequence {
                logging!(
                    info,
                    Type::Cmd,
                    true,
                    "Newer request detected (seq: {} < {}), abandoning current",
                    current_sequence,
                    latest_sequence
                );
                return Ok(false);
            }
            logging!(
                info,
                Type::Cmd,
                true,
                "Force acquiring lock to process latest request: {}",
                current_sequence
            );
            PROFILE_UPDATE_MUTEX.lock().await
        }
    };

    let latest_sequence = CURRENT_REQUEST_SEQUENCE.load(Ordering::SeqCst);
    if current_sequence < latest_sequence {
        logging!(
            info,
            Type::Cmd,
            true,
            "After acquiring lock, found newer request (seq: {} < {}), abandoning current",
            current_sequence,
            latest_sequence
        );
        return Ok(false);
    }

    // 保存当前配置，以便在验证失败时恢复
    let current_profile = Config::profiles().latest().current.clone();
    logging!(
        info,
        Type::Cmd,
        true,
        "Current profile: {:?}",
        current_profile
    );

    // 如果要切换配置，先检查目标配置文件是否有语法错误
    if let Some(new_profile) = profiles.current.as_ref() {
        if current_profile.as_ref() != Some(new_profile) {
            logging!(
                info,
                Type::Cmd,
                true,
                "Switching to new profile: {}",
                new_profile
            );

            // 获取目标配置文件路径
            let config_file_result = {
                let profiles_config = Config::profiles();
                let profiles_data = profiles_config.latest();
                match profiles_data.get_item(new_profile) {
                    Ok(item) => {
                        if let Some(file) = &item.file {
                            let path = dirs::app_profiles_dir().map(|dir| dir.join(file));
                            path.ok()
                        } else {
                            None
                        }
                    }
                    Err(e) => {
                        logging!(
                            error,
                            Type::Cmd,
                            true,
                            "Failed to get target profile info: {}",
                            e
                        );
                        None
                    }
                }
            };

            // 如果获取到文件路径，检查YAML语法
            if let Some(file_path) = config_file_result {
                if !file_path.exists() {
                    logging!(
                        error,
                        Type::Cmd,
                        true,
                        "Target profile does not exist: {}",
                        file_path.display()
                    );
                    handle::Handle::notice_message(
                        "config_validate::file_not_found",
                        format!("{}", file_path.display()),
                    );
                    return Ok(false);
                }

                // 超时保护
                let file_read_result = tokio::time::timeout(
                    Duration::from_secs(5),
                    tokio::fs::read_to_string(&file_path),
                )
                .await;

                match file_read_result {
                    Ok(Ok(content)) => {
                        let yaml_parse_result = tokio::task::spawn_blocking(move || {
                            serde_yaml::from_str::<serde_yaml::Value>(&content)
                        })
                        .await;

                        match yaml_parse_result {
                            Ok(Ok(_)) => {
                                logging!(
                                    info,
                                    Type::Cmd,
                                    true,
                                    "Target profile file syntax is correct"
                                );
                            }
                            Ok(Err(err)) => {
                                let error_msg = format!(" {err}");
                                logging!(
                                    error,
                                    Type::Cmd,
                                    true,
                                    "YAML syntax error in target profile file: {}",
                                    error_msg
                                );
                                handle::Handle::notice_message(
                                    "config_validate::yaml_syntax_error",
                                    &error_msg,
                                );
                                return Ok(false);
                            }
                            Err(join_err) => {
                                let error_msg = format!("YAML parse task failed: {join_err}");
                                logging!(error, Type::Cmd, true, "{}", error_msg);
                                handle::Handle::notice_message(
                                    "config_validate::yaml_parse_error",
                                    &error_msg,
                                );
                                return Ok(false);
                            }
                        }
                    }
                    Ok(Err(err)) => {
                        let error_msg = format!("Failed to read target profile file: {err}");
                        logging!(error, Type::Cmd, true, "{}", error_msg);
                        handle::Handle::notice_message(
                            "config_validate::file_read_error",
                            &error_msg,
                        );
                        return Ok(false);
                    }
                    Err(_) => {
                        let error_msg = "Reading config file timed out (5s)".to_string();
                        logging!(error, Type::Cmd, true, "{}", error_msg);
                        handle::Handle::notice_message(
                            "config_validate::file_read_timeout",
                            &error_msg,
                        );
                        return Ok(false);
                    }
                }
            }
        }
    }

    // 检查请求有效性
    let latest_sequence = CURRENT_REQUEST_SEQUENCE.load(Ordering::SeqCst);
    if current_sequence < latest_sequence {
        logging!(
            info,
            Type::Cmd,
            true,
            "Found newer request before core operation (seq: {} < {}), abandoning current",
            current_sequence,
            latest_sequence
        );
        return Ok(false);
    }

    if let Some(ref profile) = target_profile {
        *CURRENT_PROCESSING_PROFILE.write().await = Some(profile.clone());
        logging!(
            info,
            Type::Cmd,
            true,
            "Set current processing profile: {}, serial number: {}",
            profile,
            current_sequence
        );
    }

    // 更新profiles配置
    logging!(
        info,
        Type::Cmd,
        true,
        "Updating draft profiles, sequence: {}",
        current_sequence
    );

    let current_value = profiles.current.clone();

    let _ = Config::profiles().draft().patch_config(profiles);

    // 在调用内核前再次验证请求有效性
    let latest_sequence = CURRENT_REQUEST_SEQUENCE.load(Ordering::SeqCst);
    if current_sequence < latest_sequence {
        logging!(
            info,
            Type::Cmd,
            true,
            "Detect updated requests before kernel interaction (sequence number: {} < {}) and abandon the current request.",
            current_sequence,
            latest_sequence
        );
        Config::profiles().discard();
        return Ok(false);
    }

    // 为配置更新添加超时保护
    logging!(
        info,
        Type::Cmd,
        true,
        "Starting kernel config update, sequence: {}",
        current_sequence
    );
    let update_result = tokio::time::timeout(
        Duration::from_secs(30), // 30秒超时
        CoreManager::global().update_config(),
    )
    .await;

    // 更新配置并进行验证
    match update_result {
        Ok(Ok((true, _))) => {
            // 内核操作完成后再次检查请求有效性
            let latest_sequence = CURRENT_REQUEST_SEQUENCE.load(Ordering::SeqCst);
            if current_sequence < latest_sequence {
                logging!(
                    info,
                    Type::Cmd,
                    true,
                    "After kernel operation, an updated request was found (sequence number: {} < {}), ignore the current result.",
                    current_sequence,
                    latest_sequence
                );
                Config::profiles().discard();
                return Ok(false);
            }

            logging!(
                info,
                Type::Cmd,
                true,
                "Configuration update successful, serial number: {}",
                current_sequence
            );
            Config::profiles().apply();
            handle::Handle::refresh_clash();

            // 强制刷新代理缓存，确保profile切换后立即获取最新节点数据
            crate::process::AsyncHandler::spawn(|| async move {
                if let Err(e) = super::proxy::force_refresh_proxies().await {
                    log::warn!(target: "app", "Force refresh proxy cache failed: {e}");
                }
            });

            crate::process::AsyncHandler::spawn(|| async move {
                if let Err(e) = Tray::global().update_tooltip() {
                    log::warn!(target: "app", "Async tray tooltip update failed: {e}");
                }

                if let Err(e) = Tray::global().update_menu() {
                    log::warn!(target: "app", "Async tray menu update failed: {e}");
                }

                // 保存配置文件
                if let Err(e) = Config::profiles().data().save_file() {
                    log::warn!(target: "app", "Async save profiles file failed: {e}");
                }
            });

            // 立即通知前端配置变更
            if let Some(current) = &current_value {
                logging!(
                    info,
                    Type::Cmd,
                    true,
                    "Sending profile change event to frontend: {}, sequence: {}",
                    current,
                    current_sequence
                );
                handle::Handle::notify_profile_changed(current.clone());
            }

            cleanup_processing_state(current_sequence, "Profile switch completed").await;

            Ok(true)
        }
        Ok(Ok((false, error_msg))) => {
            logging!(
                warn,
                Type::Cmd,
                true,
                "Profile validation failed: {}",
                error_msg
            );
            Config::profiles().discard();
            // 如果验证失败，恢复到之前的配置
            if let Some(prev_profile) = current_profile {
                logging!(
                    info,
                    Type::Cmd,
                    true,
                    "Attempting to restore previous profile: {}",
                    prev_profile
                );
                let restore_profiles = IProfiles {
                    current: Some(prev_profile),
                    items: None,
                };
                // 静默恢复，不触发验证
                wrap_err!({ Config::profiles().draft().patch_config(restore_profiles) })?;
                Config::profiles().apply();

                crate::process::AsyncHandler::spawn(|| async move {
                    if let Err(e) = Config::profiles().data().save_file() {
                        log::warn!(target: "app", "Failed to save and restore configuration file asynchronously: {e}");
                    }
                });

                logging!(
                    info,
                    Type::Cmd,
                    true,
                    "Successfully restored previous profile"
                );
            }

            // 发送验证错误通知
            handle::Handle::notice_message("config_validate::error", &error_msg);

            cleanup_processing_state(current_sequence, "Profile validation failed").await;

            Ok(false)
        }
        Ok(Err(e)) => {
            logging!(
                warn,
                Type::Cmd,
                true,
                "Error occurred during update: {}, sequence: {}",
                e,
                current_sequence
            );
            Config::profiles().discard();
            handle::Handle::notice_message("config_validate::boot_error", e.to_string());

            cleanup_processing_state(current_sequence, "Update process error").await;

            Ok(false)
        }
        Err(_) => {
            // 超时处理
            let timeout_msg = "Profile update timed out (30s), possibly due to validation or kernel communication";
            logging!(
                error,
                Type::Cmd,
                true,
                "{}, sequence: {}",
                timeout_msg,
                current_sequence
            );
            Config::profiles().discard();

            if let Some(prev_profile) = current_profile {
                logging!(
                    info,
                    Type::Cmd,
                    true,
                    "After timeout, attempting to restore previous profile: {}, sequence: {}",
                    prev_profile,
                    current_sequence
                );
                let restore_profiles = IProfiles {
                    current: Some(prev_profile),
                    items: None,
                };
                wrap_err!({ Config::profiles().draft().patch_config(restore_profiles) })?;
                Config::profiles().apply();
            }

            handle::Handle::notice_message("config_validate::timeout", timeout_msg);

            cleanup_processing_state(current_sequence, "Profile update timeout").await;

            Ok(false)
        }
    }
}

/// 根据profile name修改profiles
#[tauri::command]
pub async fn patch_profiles_config_by_profile_index(
    _app_handle: tauri::AppHandle,
    profile_index: String,
) -> CmdResult<bool> {
    logging!(
        info,
        Type::Cmd,
        true,
        "Switching profile to: {}",
        profile_index
    );

    let profiles = IProfiles {
        current: Some(profile_index),
        items: None,
    };
    patch_profiles_config(profiles).await
}

/// 修改某个profile item的
#[tauri::command]
pub fn patch_profile(index: String, profile: PrfItem) -> CmdResult {
    // 保存修改前检查是否有更新 update_interval
    let update_interval_changed =
        if let Ok(old_profile) = Config::profiles().latest().get_item(&index) {
            let old_interval = old_profile.option.as_ref().and_then(|o| o.update_interval);
            let new_interval = profile.option.as_ref().and_then(|o| o.update_interval);
            old_interval != new_interval
        } else {
            false
        };

    // 保存修改
    wrap_err!(Config::profiles().data().patch_item(index.clone(), profile))?;

    // 如果更新间隔变更，异步刷新定时器
    if update_interval_changed {
        let index_clone = index.clone();
        crate::process::AsyncHandler::spawn(move || async move {
            logging!(
                info,
                Type::Timer,
                "Timer update interval changed; refreshing timers..."
            );
            if let Err(e) = crate::core::Timer::global().refresh() {
                logging!(error, Type::Timer, "Failed to refresh timers: {}", e);
            } else {
                // 刷新成功后发送自定义事件，不触发配置重载
                crate::core::handle::Handle::notify_timer_updated(index_clone);
            }
        });
    }

    Ok(())
}

/// 查看配置文件
#[tauri::command]
pub fn view_profile(app_handle: tauri::AppHandle, index: String) -> CmdResult {
    let file = {
        wrap_err!(Config::profiles().latest().get_item(&index))?
            .file
            .clone()
            .ok_or("the file field is null")
    }?;

    let path = wrap_err!(dirs::app_profiles_dir())?.join(file);
    if !path.exists() {
        ret_err!("the file not found");
    }

    wrap_err!(help::open_file(app_handle, path))
}

/// 读取配置文件内容
#[tauri::command]
pub fn read_profile_file(index: String) -> CmdResult<String> {
    let profiles = Config::profiles();
    let profiles = profiles.latest();
    let item = wrap_err!(profiles.get_item(&index))?;
    let data = wrap_err!(item.read_file())?;
    Ok(data)
}

/// 获取下一次更新时间
#[tauri::command]
pub fn get_next_update_time(uid: String) -> CmdResult<Option<i64>> {
    let timer = Timer::global();
    let next_time = timer.get_next_update_time(&uid);
    Ok(next_time)
}

#[tauri::command]
pub async fn update_profiles_on_startup() -> CmdResult {
    logging!(
        info,
        Type::Cmd,
        true,
        "Checking profiles for updates at startup..."
    );

    let profiles_to_update = {
        let profiles = Config::profiles();
        let profiles = profiles.latest();

        profiles.items.as_ref().map_or_else(Vec::new, |items| {
            items
                .iter()
                .filter(|item| {
                    item.option
                        .as_ref()
                        .is_some_and(|opt| opt.update_always == Some(true))
                })
                .filter_map(|item| item.uid.clone())
                .collect()
        })
    };

    if profiles_to_update.is_empty() {
        logging!(info, Type::Cmd, true, "No profiles to update immediately.");
        return Ok(());
    }

    logging!(
        info,
        Type::Cmd,
        true,
        "Found profiles to update: {:?}",
        profiles_to_update
    );

    let mut update_futures = Vec::new();
    for uid in profiles_to_update {
        update_futures.push(update_profile(uid, None));
    }

    let results = futures::future::join_all(update_futures).await;

    if results.iter().any(|res| res.is_ok()) {
        logging!(
            info,
            Type::Cmd,
            true,
            "The startup update is complete, restart the kernel..."
        );
        CoreManager::global()
            .update_config()
            .await
            .map_err(|e| e.to_string())?;
        handle::Handle::refresh_clash();
    } else {
        logging!(
            warn,
            Type::Cmd,
            true,
            "All updates completed with errors on startup."
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn create_profile_from_share_link(link: String, template_name: String) -> CmdResult {
    const DEFAULT_TEMPLATE: &str = r#"
    mixed-port: 2080
    allow-lan: true
    tcp-concurrent: true
    enable-process: true
    find-process-mode: always
    global-client-fingerprint: chrome
    mode: rule
    log-level: debug
    ipv6: false
    keep-alive-interval: 30
    unified-delay: false
    profile:
      store-selected: true
      store-fake-ip: true
    sniffer:
      enable: true
      sniff:
        HTTP:
          ports: [80, 8080-8880]
          override-destination: true
        TLS:
          ports: [443, 8443]
        QUIC:
          ports: [443, 8443]
    tun:
      enable: true
      stack: mixed
      dns-hijack: ['any:53']
      auto-route: true
      auto-detect-interface: true
      strict-route: true
    dns:
      enable: true
      listen: :1053
      prefer-h3: false
      ipv6: false
      enhanced-mode: fake-ip
      fake-ip-filter: ['+.lan', '+.local']
      nameserver: ['https://doh.dns.sb/dns-query']
    proxies:
      - name: myproxy
        type: vless
        server: YOURDOMAIN
        port: 443
        uuid: YOURUUID
        network: tcp
        flow: xtls-rprx-vision
        udp: true
        tls: true
        reality-opts:
          public-key: YOURPUBLIC
          short-id: YOURSHORTID
        servername: YOURREALITYDEST
        client-fingerprint: chrome
    proxy-groups:
      - name: PROXY
        type: select
        proxies:
          - myproxy
    rule-providers:
      ru-bundle:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/ru-bundle/rule.mrs
        path: ./ru-bundle/rule.mrs
        interval: 86400
      refilter_domains:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/re-filter/domain-rule.mrs
        path: ./re-filter/domain-rule.mrs
        interval: 86400
      refilter_ipsum:
        type: http
        behavior: ipcidr
        format: mrs
        url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/re-filter/ip-rule.mrs
        path: ./re-filter/ip-rule.mrs
        interval: 86400
      oisd_big:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/oisd/big.mrs
        path: ./oisd/big.mrs
        interval: 86400
    rules:
      - OR,((DOMAIN,ipwhois.app),(DOMAIN,ipwho.is),(DOMAIN,api.ip.sb),(DOMAIN,ipapi.co),(DOMAIN,ipinfo.io)),PROXY
      - RULE-SET,oisd_big,REJECT
      - PROCESS-NAME,Discord.exe,PROXY
      - RULE-SET,ru-bundle,PROXY
      - RULE-SET,refilter_domains,PROXY
      - RULE-SET,refilter_ipsum,PROXY
      - MATCH,DIRECT
    "#;

    const WITHOUT_RU_TEMPLATE: &str = r#"
    mixed-port: 7890
    allow-lan: true
    tcp-concurrent: true
    enable-process: true
    find-process-mode: always
    mode: rule
    log-level: debug
    ipv6: false
    keep-alive-interval: 30
    unified-delay: false
    profile:
      store-selected: true
      store-fake-ip: true
    sniffer:
      enable: true
      force-dns-mapping: true
      parse-pure-ip: true
      sniff:
        HTTP:
          ports:
            - 80
            - 8080-8880
          override-destination: true
        TLS:
          ports:
            - 443
            - 8443
    tun:
      enable: true
      stack: gvisor
      auto-route: true
      auto-detect-interface: false
      dns-hijack:
        - any:53
      strict-route: true
      mtu: 1500
    dns:
      enable: true
      prefer-h3: true
      use-hosts: true
      use-system-hosts: true
      listen: 127.0.0.1:6868
      ipv6: false
      enhanced-mode: redir-host
      default-nameserver:
        - tls://1.1.1.1
        - tls://1.0.0.1
      proxy-server-nameserver:
        - tls://1.1.1.1
        - tls://1.0.0.1
      direct-nameserver:
        - tls://77.88.8.8
      nameserver:
        - https://cloudflare-dns.com/dns-query

    proxies:
      - name: myproxy
        type: vless
        server: YOURDOMAIN
        port: 443
        uuid: YOURUUID
        network: tcp
        flow: xtls-rprx-vision
        udp: true
        tls: true
        reality-opts:
          public-key: YOURPUBLIC
          short-id: YOURSHORTID
        servername: YOURREALITYDEST
        client-fingerprint: chrome

    proxy-groups:
      - name: PROXY
        icon: https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Hijacking.png
        type: select
        proxies:
          - ⚡️ Fastest
          - 📶 First Available
          - myproxy
      - name: ⚡️ Fastest
        icon: https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Auto.png
        type: url-test
        tolerance: 150
        url: https://cp.cloudflare.com/generate_204
        interval: 300
        proxies:
          - myproxy
      - name: 📶 First Available
        icon: https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Download.png
        type: fallback
        url: https://cp.cloudflare.com/generate_204
        interval: 300
        proxies:
          - myproxy


    rule-providers:
      torrent-trackers:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/other/torrent-trackers.mrs
        path: ./rule-sets/torrent-trackers.mrs
        interval: 86400
      torrent-clients:
        type: http
        behavior: classical
        format: yaml
        url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/other/torrent-clients.yaml
        path: ./rule-sets/torrent-clients.yaml
        interval: 86400
      geosite-ru:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/category-ru.mrs
        path: ./geosite-ru.mrs
        interval: 86400
      xiaomi:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/xiaomi.mrs
        path: ./rule-sets/xiaomi.mrs
        interval: 86400
      blender:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/blender.mrs
        path: ./rule-sets/blender.mrs
        interval: 86400
      drweb:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/drweb.mrs
        path: ./rule-sets/drweb.mrs
        interval: 86400
      debian:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/debian.mrs
        path: ./rule-sets/debian.mrs
        interval: 86400
      canonical:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/canonical.mrs
        path: ./rule-sets/canonical.mrs
        interval: 86400
      python:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/python.mrs
        path: ./rule-sets/python.mrs
        interval: 86400
      geoip-ru:
        type: http
        behavior: ipcidr
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geoip/ru.mrs
        path: ./geoip-ru.mrs
        interval: 86400
      geosite-private:
        type: http
        behavior: domain
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/private.mrs
        path: ./geosite-private.mrs
        interval: 86400
      geoip-private:
        type: http
        behavior: ipcidr
        format: mrs
        url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geoip/private.mrs
        path: ./geoip-private.mrs
        interval: 86400

    rules:
      - DOMAIN-SUFFIX,habr.com,PROXY
      - DOMAIN-SUFFIX,kemono.su,PROXY
      - DOMAIN-SUFFIX,jut.su,PROXY
      - DOMAIN-SUFFIX,kara.su,PROXY
      - DOMAIN-SUFFIX,theins.ru,PROXY
      - DOMAIN-SUFFIX,tvrain.ru,PROXY
      - DOMAIN-SUFFIX,echo.msk.ru,PROXY
      - DOMAIN-SUFFIX,the-village.ru,PROXY
      - DOMAIN-SUFFIX,snob.ru,PROXY
      - DOMAIN-SUFFIX,novayagazeta.ru,PROXY
      - DOMAIN-SUFFIX,moscowtimes.ru,PROXY
      - DOMAIN-KEYWORD,animego,PROXY
      - DOMAIN-KEYWORD,yummyanime,PROXY
      - DOMAIN-KEYWORD,yummy-anime,PROXY
      - DOMAIN-KEYWORD,animeportal,PROXY
      - DOMAIN-KEYWORD,anime-portal,PROXY
      - DOMAIN-KEYWORD,animedub,PROXY
      - DOMAIN-KEYWORD,anidub,PROXY
      - DOMAIN-KEYWORD,animelib,PROXY
      - DOMAIN-KEYWORD,ikianime,PROXY
      - DOMAIN-KEYWORD,anilibria,PROXY
      - PROCESS-NAME,Discord.exe,PROXY
      - PROCESS-NAME,discord,PROXY
      - RULE-SET,geosite-private,DIRECT,no-resolve
      - RULE-SET,geoip-private,DIRECT
      - RULE-SET,torrent-clients,DIRECT
      - RULE-SET,torrent-trackers,DIRECT
      - DOMAIN-SUFFIX,.ru,DIRECT
      - DOMAIN-SUFFIX,.su,DIRECT
      - DOMAIN-SUFFIX,.ru.com,DIRECT
      - DOMAIN-SUFFIX,.ru.net,DIRECT
      - DOMAIN-SUFFIX,wikipedia.org,DIRECT
      - DOMAIN-SUFFIX,kudago.com,DIRECT
      - DOMAIN-SUFFIX,kinescope.io,DIRECT
      - DOMAIN-SUFFIX,redheadsound.studio,DIRECT
      - DOMAIN-SUFFIX,plplayer.online,DIRECT
      - DOMAIN-SUFFIX,lomont.site,DIRECT
      - DOMAIN-SUFFIX,remanga.org,DIRECT
      - DOMAIN-SUFFIX,shopstory.live,DIRECT
      - DOMAIN-KEYWORD,miradres,DIRECT
      - DOMAIN-KEYWORD,premier,DIRECT
      - DOMAIN-KEYWORD,shutterstock,DIRECT
      - DOMAIN-KEYWORD,2gis,DIRECT
      - DOMAIN-KEYWORD,diginetica,DIRECT
      - DOMAIN-KEYWORD,kinescopecdn,DIRECT
      - DOMAIN-KEYWORD,researchgate,DIRECT
      - DOMAIN-KEYWORD,springer,DIRECT
      - DOMAIN-KEYWORD,nextcloud,DIRECT
      - DOMAIN-KEYWORD,wiki,DIRECT
      - DOMAIN-KEYWORD,kaspersky,DIRECT
      - DOMAIN-KEYWORD,stepik,DIRECT
      - DOMAIN-KEYWORD,likee,DIRECT
      - DOMAIN-KEYWORD,snapchat,DIRECT
      - DOMAIN-KEYWORD,yappy,DIRECT
      - DOMAIN-KEYWORD,pikabu,DIRECT
      - DOMAIN-KEYWORD,okko,DIRECT
      - DOMAIN-KEYWORD,wink,DIRECT
      - DOMAIN-KEYWORD,kion,DIRECT
      - DOMAIN-KEYWORD,roblox,DIRECT
      - DOMAIN-KEYWORD,ozon,DIRECT
      - DOMAIN-KEYWORD,wildberries,DIRECT
      - DOMAIN-KEYWORD,aliexpress,DIRECT
      - RULE-SET,geosite-ru,DIRECT
      - RULE-SET,xiaomi,DIRECT
      - RULE-SET,blender,DIRECT
      - RULE-SET,drweb,DIRECT
      - RULE-SET,debian,DIRECT
      - RULE-SET,canonical,DIRECT
      - RULE-SET,python,DIRECT
      - RULE-SET,geoip-ru,DIRECT
      - MATCH,PROXY
    "#;

    let template_yaml = match template_name.as_str() {
        "without_ru" => WITHOUT_RU_TEMPLATE,
        _ => DEFAULT_TEMPLATE,
    };

    let parsed_url = Url::parse(&link).map_err(|e| e.to_string())?;
    let scheme = parsed_url.scheme();
    let proxy_name = parsed_url
        .fragment()
        .map(|f| percent_decode_str(f).decode_utf8_lossy().to_string())
        .unwrap_or_else(|| "Proxy from Link".to_string());

    let mut proxy_map: BTreeMap<String, Value> = BTreeMap::new();
    proxy_map.insert("name".into(), proxy_name.clone().into());
    proxy_map.insert("type".into(), scheme.into());
    proxy_map.insert(
        "server".into(),
        parsed_url.host_str().unwrap_or_default().into(),
    );
    proxy_map.insert("port".into(), parsed_url.port().unwrap_or(443).into());
    proxy_map.insert("udp".into(), true.into());

    match scheme {
        "vless" | "trojan" => {
            proxy_map.insert("uuid".into(), parsed_url.username().into());
            let mut reality_opts: BTreeMap<String, Value> = BTreeMap::new();
            for (key, value) in parsed_url.query_pairs() {
                match key.as_ref() {
                    "security" if value == "reality" => {
                        proxy_map.insert("tls".into(), true.into());
                    }
                    "security" if value == "tls" => {
                        proxy_map.insert("tls".into(), true.into());
                    }
                    "flow" => {
                        proxy_map.insert("flow".into(), value.to_string().into());
                    }
                    "sni" => {
                        proxy_map.insert("servername".into(), value.to_string().into());
                    }
                    "fp" => {
                        proxy_map.insert("client-fingerprint".into(), value.to_string().into());
                    }
                    "pbk" => {
                        reality_opts.insert("public-key".into(), value.to_string().into());
                    }
                    "sid" => {
                        reality_opts.insert("short-id".into(), value.to_string().into());
                    }
                    _ => {}
                }
            }
            if !reality_opts.is_empty() {
                proxy_map.insert(
                    "reality-opts".into(),
                    serde_yaml::to_value(reality_opts).map_err(|e| e.to_string())?,
                );
            }
        }
        "ss" => {
            if let Ok(decoded_user) = STANDARD.decode(parsed_url.username()) {
                if let Ok(user_str) = String::from_utf8(decoded_user) {
                    if let Some((cipher, password)) = user_str.split_once(':') {
                        proxy_map.insert("cipher".into(), cipher.into());
                        proxy_map.insert("password".into(), password.into());
                    }
                }
            }
        }
        "vmess" => {
            if let Ok(decoded_bytes) = STANDARD.decode(parsed_url.host_str().unwrap_or_default()) {
                if let Ok(json_str) = String::from_utf8(decoded_bytes) {
                    if let Ok(vmess_params) =
                        serde_json::from_str::<BTreeMap<String, Value>>(&json_str)
                    {
                        if let Some(add) = vmess_params.get("add") {
                            proxy_map.insert("server".into(), add.clone());
                        }
                        if let Some(port) = vmess_params.get("port") {
                            proxy_map.insert("port".into(), port.clone());
                        }
                        if let Some(id) = vmess_params.get("id") {
                            proxy_map.insert("uuid".into(), id.clone());
                        }
                        if let Some(aid) = vmess_params.get("aid") {
                            proxy_map.insert("alterId".into(), aid.clone());
                        }
                        if let Some(net) = vmess_params.get("net") {
                            proxy_map.insert("network".into(), net.clone());
                        }
                        if let Some(ps) = vmess_params.get("ps") {
                            proxy_map.insert("name".into(), ps.clone());
                        }
                    }
                }
            }
        }
        _ => {}
    }

    let mut config: Value = serde_yaml::from_str(template_yaml).map_err(|e| e.to_string())?;

    if let Some(proxies) = config.get_mut("proxies").and_then(|v| v.as_sequence_mut()) {
        proxies.clear();
        proxies.push(serde_yaml::to_value(proxy_map).map_err(|e| e.to_string())?);
    }

    if let Some(groups) = config
        .get_mut("proxy-groups")
        .and_then(|v| v.as_sequence_mut())
    {
        for group in groups.iter_mut() {
            if let Some(mapping) = group.as_mapping_mut() {
                if let Some(proxies_list) =
                    mapping.get_mut("proxies").and_then(|p| p.as_sequence_mut())
                {
                    let new_proxies_list: Vec<Value> = proxies_list
                        .iter()
                        .map(|p| {
                            if p.as_str() == Some("myproxy") {
                                proxy_name.clone().into()
                            } else {
                                p.clone()
                            }
                        })
                        .collect();
                    *proxies_list = new_proxies_list;
                }
            }
        }
    }

    let new_yaml_content = serde_yaml::to_string(&config).map_err(|e| e.to_string())?;

    let item = PrfItem::from_local(
        proxy_name,
        "Created from share link".into(),
        Some(new_yaml_content),
        None,
    )
    .map_err(|e| e.to_string())?;

    wrap_err!(Config::profiles().data().append_item(item))
}
