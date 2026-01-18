use once_cell::sync::Lazy;
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct SystemInfo {
    pub hwid: String,
    pub os_type: String,
    pub os_ver: String,
    pub device_model: String,
}

pub static SYSTEM_INFO: Lazy<SystemInfo> = Lazy::new(|| {
    let hwid = machine_uid::get().unwrap_or_else(|_| "unknown_hwid".to_string());

    #[cfg(target_os = "windows")]
    {
        SystemInfo {
            hwid,
            os_type: "Windows".to_string(),
            os_ver: get_windows_build_name(),
            device_model: get_windows_edition(),
        }
    }

    #[cfg(target_os = "macos")]
    {
        SystemInfo {
            hwid,
            os_type: "macOS".to_string(),
            os_ver: get_macos_version(),
            device_model: get_mac_model(),
        }
    }

    #[cfg(target_os = "linux")]
    {
        SystemInfo {
            hwid,
            os_type: "Linux".to_string(),
            os_ver: get_linux_distro_version(),
            device_model: get_linux_distro_name(),
        }
    }
});

pub fn get_system_info() -> &'static SystemInfo {
    &SYSTEM_INFO
}

#[cfg(target_os = "windows")]
fn get_windows_build_name() -> String {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = match RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion")
    {
        Ok(key) => key,
        Err(_) => return "Unknown".to_string(),
    };

    // Пытаемся получить DisplayVersion (например, "24H2", "23H2", "22H2")
    if let Ok(display_version) = hklm.get_value::<String, _>("DisplayVersion") {
        return display_version;
    }

    // Если DisplayVersion нет, получаем ReleaseId
    if let Ok(release_id) = hklm.get_value::<String, _>("ReleaseId") {
        return release_id;
    }

    // В крайнем случае возвращаем номер сборки
    if let Ok(build) = hklm.get_value::<String, _>("CurrentBuild") {
        return format!("Build {}", build);
    }

    "Unknown".to_string()
}

#[cfg(target_os = "windows")]
fn get_windows_edition() -> String {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = match RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion")
    {
        Ok(key) => key,
        Err(_) => return "Windows".to_string(),
    };

    let product_name = hklm
        .get_value::<String, _>("ProductName")
        .unwrap_or_else(|_| "Windows".to_string());

    product_name
}

#[cfg(target_os = "macos")]
fn get_macos_version() -> String {
    use std::process::Command;

    let output = Command::new("sw_vers").arg("-productVersion").output();

    match output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => {
            // Fallback to os_info
            let os_info = os_info::get();
            os_info.version().to_string()
        }
    }
}

#[cfg(target_os = "macos")]
fn get_mac_model() -> String {
    use std::process::Command;

    // Получаем идентификатор модели (например, "MacBookPro18,3")
    let output = Command::new("sysctl").arg("-n").arg("hw.model").output();

    match output {
        Ok(output) if output.status.success() => {
            let model = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !model.is_empty() {
                return model;
            }
        }
        _ => {}
    }

    // Если не получилось, пробуем получить marketing name
    let output = Command::new("system_profiler")
        .arg("SPHardwareDataType")
        .output();

    if let Ok(output) = output {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("Model Name:") {
                    if let Some(name) = line.split(':').nth(1) {
                        return name.trim().to_string();
                    }
                }
            }
        }
    }

    "Mac".to_string()
}

#[cfg(target_os = "linux")]
fn get_linux_distro_version() -> String {
    let os_info = os_info::get();

    // os_info::Version может содержать версию дистрибутива
    let version = os_info.version();
    let version_str = version.to_string();

    if version_str != "Unknown" && !version_str.is_empty() {
        version_str
    } else {
        "Unknown".to_string()
    }
}

#[cfg(target_os = "linux")]
fn get_linux_distro_name() -> String {
    let os_info = os_info::get();

    // Получаем тип дистрибутива (Ubuntu, Fedora, etc.)
    let os_type = os_info.os_type();

    format!("{}", os_type)
}
