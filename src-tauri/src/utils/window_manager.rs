use crate::{core::handle, logging, utils::logging::Type};
use tauri::{Manager, WebviewWindow, Wry};

#[cfg(target_os = "macos")]
use crate::AppHandleManager;

use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use scopeguard;
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

/// 窗口操作结果
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WindowOperationResult {
    /// 窗口已显示并获得焦点
    Shown,
    /// 窗口已隐藏
    Hidden,
    /// 创建了新窗口
    Created,
    /// 操作失败
    Failed,
    /// 无需操作
    NoAction,
}

/// 窗口状态
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WindowState {
    /// 窗口可见且有焦点
    VisibleFocused,
    /// 窗口可见但无焦点
    VisibleUnfocused,
    /// 窗口最小化
    Minimized,
    /// 窗口隐藏
    Hidden,
    /// 窗口不存在
    NotExist,
}

// 窗口操作防抖机制
static WINDOW_OPERATION_DEBOUNCE: OnceCell<Mutex<Instant>> = OnceCell::new();
static WINDOW_OPERATION_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
const WINDOW_OPERATION_DEBOUNCE_MS: u64 = 500;

fn get_window_operation_debounce() -> &'static Mutex<Instant> {
    WINDOW_OPERATION_DEBOUNCE.get_or_init(|| Mutex::new(Instant::now() - Duration::from_secs(1)))
}

fn should_handle_window_operation() -> bool {
    if WINDOW_OPERATION_IN_PROGRESS.load(Ordering::Acquire) {
        log::warn!(target: "app", "[debounce] Window operation already in progress, skipping duplicate call");
        return false;
    }

    let debounce_lock = get_window_operation_debounce();
    let mut last_operation = debounce_lock.lock();
    let now = Instant::now();
    let elapsed = now.duration_since(*last_operation);

    log::debug!(target: "app", "[debounce] Checking window operation interval: {}ms (need >={}ms)", 
              elapsed.as_millis(), WINDOW_OPERATION_DEBOUNCE_MS);

    if elapsed >= Duration::from_millis(WINDOW_OPERATION_DEBOUNCE_MS) {
        *last_operation = now;
        WINDOW_OPERATION_IN_PROGRESS.store(true, Ordering::Release);
        log::info!(target: "app", "[debounce] Window operation allowed to execute");
        true
    } else {
        log::warn!(target: "app", "[debounce] Window operation ignored by debounce: {}ms since last < {}ms", 
                  elapsed.as_millis(), WINDOW_OPERATION_DEBOUNCE_MS);
        false
    }
}

fn finish_window_operation() {
    WINDOW_OPERATION_IN_PROGRESS.store(false, Ordering::Release);
}

/// 统一的窗口管理器
pub struct WindowManager;

impl WindowManager {
    pub fn get_main_window_state() -> WindowState {
        match Self::get_main_window() {
            Some(window) => {
                let is_minimized = window.is_minimized().unwrap_or(false);
                let is_visible = window.is_visible().unwrap_or(false);
                let is_focused = window.is_focused().unwrap_or(false);

                if is_minimized {
                    return WindowState::Minimized;
                }

                if !is_visible {
                    return WindowState::Hidden;
                }

                if is_focused {
                    WindowState::VisibleFocused
                } else {
                    WindowState::VisibleUnfocused
                }
            }
            None => WindowState::NotExist,
        }
    }

    /// 获取主窗口实例
    pub fn get_main_window() -> Option<WebviewWindow<Wry>> {
        handle::Handle::global()
            .app_handle()
            .and_then(|app| app.get_webview_window("main"))
    }

    /// 智能显示主窗口
    pub fn show_main_window() -> WindowOperationResult {
        // 防抖检查
        if !should_handle_window_operation() {
            return WindowOperationResult::NoAction;
        }
        let _guard = scopeguard::guard((), |_| {
            finish_window_operation();
        });

        logging!(
            info,
            Type::Window,
            true,
            "Starting smart show for main window"
        );
        logging!(
            debug,
            Type::Window,
            true,
            "{}",
            Self::get_window_status_info()
        );

        let current_state = Self::get_main_window_state();

        match current_state {
            WindowState::NotExist => {
                logging!(
                    info,
                    Type::Window,
                    true,
                    "Main window not found; creating new window"
                );
                if Self::create_new_window() {
                    logging!(info, Type::Window, true, "Window created successfully");
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    WindowOperationResult::Created
                } else {
                    logging!(warn, Type::Window, true, "Window creation failed");
                    WindowOperationResult::Failed
                }
            }
            WindowState::VisibleFocused => {
                logging!(
                    info,
                    Type::Window,
                    true,
                    "Window already visible and focused; no action needed"
                );
                WindowOperationResult::NoAction
            }
            WindowState::VisibleUnfocused | WindowState::Minimized | WindowState::Hidden => {
                if let Some(window) = Self::get_main_window() {
                    let state_after_check = Self::get_main_window_state();
                    if state_after_check == WindowState::VisibleFocused {
                        logging!(
                            info,
                            Type::Window,
                            true,
                            "窗口在检查期间已变为可见和有焦点状态"
                        );
                        return WindowOperationResult::NoAction;
                    }
                    Self::activate_window(&window)
                } else {
                    WindowOperationResult::Failed
                }
            }
        }
    }

    /// 切换主窗口显示状态（显示/隐藏）
    pub fn toggle_main_window() -> WindowOperationResult {
        // 防抖检查
        if !should_handle_window_operation() {
            return WindowOperationResult::NoAction;
        }
        let _guard = scopeguard::guard((), |_| {
            finish_window_operation();
        });

        logging!(info, Type::Window, true, "Toggling main window visibility");

        let current_state = Self::get_main_window_state();
        logging!(
            info,
            Type::Window,
            true,
            "Current window state: {:?} | Details: {}",
            current_state,
            Self::get_window_status_info()
        );

        match current_state {
            WindowState::NotExist => {
                // 窗口不存在，创建新窗口
                logging!(
                    info,
                    Type::Window,
                    true,
                    "Main window not found; will create new window"
                );
                // 由于已经有防抖保护，直接调用内部方法
                if Self::create_new_window() {
                    WindowOperationResult::Created
                } else {
                    WindowOperationResult::Failed
                }
            }
            WindowState::VisibleFocused | WindowState::VisibleUnfocused => {
                logging!(
                    info,
                    Type::Window,
                    true,
                    "Window visible (focused: {}), hiding window",
                    if current_state == WindowState::VisibleFocused {
                        "focused"
                    } else {
                        "unfocused"
                    }
                );
                if let Some(window) = Self::get_main_window() {
                    match window.hide() {
                        Ok(_) => {
                            logging!(info, Type::Window, true, "Window hidden successfully");
                            WindowOperationResult::Hidden
                        }
                        Err(e) => {
                            logging!(warn, Type::Window, true, "Failed to hide window: {}", e);
                            WindowOperationResult::Failed
                        }
                    }
                } else {
                    logging!(warn, Type::Window, true, "Unable to get window instance");
                    WindowOperationResult::Failed
                }
            }
            WindowState::Minimized | WindowState::Hidden => {
                logging!(
                    info,
                    Type::Window,
                    true,
                    "Window exists but is hidden or minimized; activating"
                );
                if let Some(window) = Self::get_main_window() {
                    Self::activate_window(&window)
                } else {
                    logging!(warn, Type::Window, true, "Unable to get window instance");
                    WindowOperationResult::Failed
                }
            }
        }
    }

    /// 激活窗口（取消最小化、显示、设置焦点）
    fn activate_window(window: &WebviewWindow<Wry>) -> WindowOperationResult {
        logging!(info, Type::Window, true, "Starting to activate window");

        let mut operations_successful = true;

        // 1. 如果窗口最小化，先取消最小化
        if window.is_minimized().unwrap_or(false) {
            logging!(info, Type::Window, true, "Window minimized; unminimizing");
            if let Err(e) = window.unminimize() {
                logging!(
                    warn,
                    Type::Window,
                    true,
                    "Failed to unminimize window: {}",
                    e
                );
                operations_successful = false;
            }
        }

        // 2. 显示窗口
        if let Err(e) = window.show() {
            logging!(warn, Type::Window, true, "Failed to show window: {}", e);
            operations_successful = false;
        }

        // 3. 设置焦点
        if let Err(e) = window.set_focus() {
            logging!(
                warn,
                Type::Window,
                true,
                "Failed to set window focus: {}",
                e
            );
            operations_successful = false;
        }

        // 4. 平台特定的激活策略
        #[cfg(target_os = "macos")]
        {
            logging!(
                info,
                Type::Window,
                true,
                "Applying macOS-specific activation policy"
            );
            AppHandleManager::global().set_activation_policy_regular();
        }

        #[cfg(target_os = "windows")]
        {
            // Windows 尝试额外的激活方法
            if let Err(e) = window.set_always_on_top(true) {
                logging!(
                    debug,
                    Type::Window,
                    true,
                    "Failed to set always-on-top (non-critical): {}",
                    e
                );
            }
            // 立即取消置顶
            if let Err(e) = window.set_always_on_top(false) {
                logging!(
                    debug,
                    Type::Window,
                    true,
                    "Failed to unset always-on-top (non-critical): {}",
                    e
                );
            }
        }

        if operations_successful {
            logging!(info, Type::Window, true, "Window activation successful");
            WindowOperationResult::Shown
        } else {
            logging!(
                warn,
                Type::Window,
                true,
                "Window activation partially failed"
            );
            WindowOperationResult::Failed
        }
    }

    /// 隐藏主窗口
    pub fn hide_main_window() -> WindowOperationResult {
        logging!(info, Type::Window, true, "Starting to hide main window");

        match Self::get_main_window() {
            Some(window) => match window.hide() {
                Ok(_) => {
                    logging!(info, Type::Window, true, "Window hidden");
                    WindowOperationResult::Hidden
                }
                Err(e) => {
                    logging!(warn, Type::Window, true, "Failed to hide window: {}", e);
                    WindowOperationResult::Failed
                }
            },
            None => {
                logging!(
                    info,
                    Type::Window,
                    true,
                    "Window does not exist; nothing to hide"
                );
                WindowOperationResult::NoAction
            }
        }
    }

    /// 检查窗口是否可见
    pub fn is_main_window_visible() -> bool {
        Self::get_main_window()
            .map(|window| window.is_visible().unwrap_or(false))
            .unwrap_or(false)
    }

    /// 检查窗口是否有焦点
    pub fn is_main_window_focused() -> bool {
        Self::get_main_window()
            .map(|window| window.is_focused().unwrap_or(false))
            .unwrap_or(false)
    }

    /// 检查窗口是否最小化
    pub fn is_main_window_minimized() -> bool {
        Self::get_main_window()
            .map(|window| window.is_minimized().unwrap_or(false))
            .unwrap_or(false)
    }

    /// 创建新窗口,防抖避免重复调用
    fn create_new_window() -> bool {
        use crate::utils::resolve;
        resolve::create_window(true)
    }

    /// 获取详细的窗口状态信息
    pub fn get_window_status_info() -> String {
        let state = Self::get_main_window_state();
        let is_visible = Self::is_main_window_visible();
        let is_focused = Self::is_main_window_focused();
        let is_minimized = Self::is_main_window_minimized();

        format!(
            "WindowState: {state:?} | visible: {is_visible} | focused: {is_focused} | minimized: {is_minimized}"
        )
    }
}
