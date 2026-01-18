use super::{Draft, IClashTemp, IProfiles, IRuntime, IVerge};
use crate::{
    config::PrfItem,
    core::{handle, CoreManager},
    enhance, logging,
    process::AsyncHandler,
    utils::{dirs, help, logging::Type},
};
use anyhow::{anyhow, Result};
use once_cell::sync::OnceCell;
use std::path::PathBuf;
use tokio::time::{sleep, Duration};

pub const RUNTIME_CONFIG: &str = "koala-clash.yaml";
pub const CHECK_CONFIG: &str = "koala-clash-check.yaml";

pub struct Config {
    clash_config: Draft<Box<IClashTemp>>,
    verge_config: Draft<Box<IVerge>>,
    profiles_config: Draft<Box<IProfiles>>,
    runtime_config: Draft<Box<IRuntime>>,
}

impl Config {
    pub fn global() -> &'static Config {
        static CONFIG: OnceCell<Config> = OnceCell::new();

        CONFIG.get_or_init(|| Config {
            clash_config: Draft::from(Box::new(IClashTemp::new())),
            verge_config: Draft::from(Box::new(IVerge::new())),
            profiles_config: Draft::from(Box::new(IProfiles::new())),
            runtime_config: Draft::from(Box::new(IRuntime::new())),
        })
    }

    pub fn clash() -> Draft<Box<IClashTemp>> {
        Self::global().clash_config.clone()
    }

    pub fn verge() -> Draft<Box<IVerge>> {
        Self::global().verge_config.clone()
    }

    pub fn profiles() -> Draft<Box<IProfiles>> {
        Self::global().profiles_config.clone()
    }

    pub fn runtime() -> Draft<Box<IRuntime>> {
        Self::global().runtime_config.clone()
    }

    /// 初始化订阅
    pub async fn init_config() -> Result<()> {
        if Self::profiles()
            .data()
            .get_item(&"Merge".to_string())
            .is_err()
        {
            let merge_item = PrfItem::from_merge(Some("Merge".to_string()))?;
            Self::profiles().data().append_item(merge_item.clone())?;
        }
        if Self::profiles()
            .data()
            .get_item(&"Script".to_string())
            .is_err()
        {
            let script_item = PrfItem::from_script(Some("Script".to_string()))?;
            Self::profiles().data().append_item(script_item.clone())?;
        }
        // 生成运行时配置
        if let Err(err) = Self::generate().await {
            logging!(
                error,
                Type::Config,
                true,
                "Failed to generate runtime config: {}",
                err
            );
        } else {
            logging!(
                info,
                Type::Config,
                true,
                "Runtime config generated successfully"
            );
        }

        // 生成运行时配置文件并验证
        let config_result = Self::generate_file(ConfigType::Run);

        let validation_result = if config_result.is_ok() {
            // 验证配置文件
            logging!(info, Type::Config, true, "Starting config validation");

            match CoreManager::global().validate_config().await {
                Ok((is_valid, error_msg)) => {
                    if !is_valid {
                        logging!(
                            warn,
                            Type::Config,
                            true,
                            "[First launch] Config validation failed, starting with minimal default config: {}",
                            error_msg
                        );
                        CoreManager::global()
                            .use_default_config("config_validate::boot_error", &error_msg)
                            .await?;
                        Some(("config_validate::boot_error", error_msg))
                    } else {
                        logging!(info, Type::Config, true, "Config validation succeeded");
                        Some(("config_validate::success", String::new()))
                    }
                }
                Err(err) => {
                    logging!(
                        warn,
                        Type::Config,
                        true,
                        "Validation process execution failed: {}",
                        err
                    );
                    CoreManager::global()
                        .use_default_config("config_validate::process_terminated", "")
                        .await?;
                    Some(("config_validate::process_terminated", String::new()))
                }
            }
        } else {
            logging!(
                warn,
                Type::Config,
                true,
                "Failed to generate config file; using default config"
            );
            CoreManager::global()
                .use_default_config("config_validate::error", "")
                .await?;
            Some(("config_validate::error", String::new()))
        };

        // 在单独的任务中发送通知
        if let Some((msg_type, msg_content)) = validation_result {
            AsyncHandler::spawn(move || async move {
                sleep(Duration::from_secs(2)).await;
                handle::Handle::notice_message(msg_type, &msg_content);
            });
        }

        Ok(())
    }

    /// 将订阅丢到对应的文件中
    pub fn generate_file(typ: ConfigType) -> Result<PathBuf> {
        let path = match typ {
            ConfigType::Run => dirs::app_home_dir()?.join(RUNTIME_CONFIG),
            ConfigType::Check => dirs::app_home_dir()?.join(CHECK_CONFIG),
        };

        let runtime = Config::runtime();
        let runtime = runtime.latest();
        let config = runtime
            .config
            .as_ref()
            .ok_or(anyhow!("failed to get runtime config"))?;

        help::save_yaml(&path, &config, Some("# Generated by Koala Clash"))?;
        Ok(path)
    }

    /// 生成订阅存好
    pub async fn generate() -> Result<()> {
        let (config, exists_keys, logs) = enhance::enhance().await;

        *Config::runtime().draft() = Box::new(IRuntime {
            config: Some(config),
            exists_keys,
            chain_logs: logs,
        });

        Ok(())
    }
}

#[derive(Debug)]
pub enum ConfigType {
    Run,
    Check,
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::mem;

    #[test]
    fn test_prfitem_from_merge_size() {
        let merge_item = PrfItem::from_merge(Some("Merge".to_string())).unwrap();
        dbg!(&merge_item);
        let prfitem_size = mem::size_of_val(&merge_item);
        dbg!(prfitem_size);
        // Boxed version
        let boxed_merge_item = Box::new(merge_item);
        let box_prfitem_size = mem::size_of_val(&boxed_merge_item);
        dbg!(box_prfitem_size);
        // The size of Box<T> is always pointer-sized (usually 8 bytes on 64-bit)
        // assert_eq!(box_prfitem_size, mem::size_of::<Box<PrfItem>>());
        assert!(box_prfitem_size < prfitem_size);
    }

    #[test]
    fn test_draft_size_non_boxed() {
        let draft = Draft::from(IRuntime::new());
        let iruntime_size = std::mem::size_of_val(&draft);
        dbg!(iruntime_size);
        assert_eq!(iruntime_size, std::mem::size_of::<Draft<IRuntime>>());
    }

    #[test]
    fn test_draft_size_boxed() {
        let draft = Draft::from(Box::new(IRuntime::new()));
        let box_iruntime_size = std::mem::size_of_val(&draft);
        dbg!(box_iruntime_size);
        assert_eq!(
            box_iruntime_size,
            std::mem::size_of::<Draft<Box<IRuntime>>>()
        );
    }
}
