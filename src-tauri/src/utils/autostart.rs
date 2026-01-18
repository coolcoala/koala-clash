#[cfg(target_os = "windows")]
use anyhow::{anyhow, Result};
#[cfg(target_os = "windows")]
use log::info;

#[cfg(target_os = "windows")]
use std::{fs, os::windows::process::CommandExt, path::Path, path::PathBuf};

/// Windows 下的开机启动文件夹路径
#[cfg(target_os = "windows")]
pub fn get_startup_dir() -> Result<PathBuf> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| anyhow!("Unable to obtain APPDATA environment variable"))?;

    let startup_dir = Path::new(&appdata)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup");

    if !startup_dir.exists() {
        return Err(anyhow!(
            "Startup directory does not exist: {:?}",
            startup_dir
        ));
    }

    Ok(startup_dir)
}

/// 获取当前可执行文件路径
#[cfg(target_os = "windows")]
pub fn get_exe_path() -> Result<PathBuf> {
    let exe_path = std::env::current_exe().map_err(|e| {
        anyhow!(
            "Unable to obtain the path of the current executable file: {}",
            e
        )
    })?;

    Ok(exe_path)
}

/// 创建快捷方式
#[cfg(target_os = "windows")]
pub fn create_shortcut() -> Result<()> {
    let exe_path = get_exe_path()?;
    let startup_dir = get_startup_dir()?;
    let shortcut_path = startup_dir.join("Koala-Clash.lnk");

    // If the shortcut already exists, return success directly
    if shortcut_path.exists() {
        info!(target: "app", "Startup shortcut already exists");
        return Ok(());
    }

    // 使用 PowerShell 创建快捷方式
    let powershell_command = format!(
        "$WshShell = New-Object -ComObject WScript.Shell; \
         $Shortcut = $WshShell.CreateShortcut('{}'); \
         $Shortcut.TargetPath = '{}'; \
         $Shortcut.Save()",
        shortcut_path.to_string_lossy().replace("\\", "\\\\"),
        exe_path.to_string_lossy().replace("\\", "\\\\")
    );

    let output = std::process::Command::new("powershell")
        .args(["-Command", &powershell_command])
        // Hide the PowerShell window
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| anyhow!("Failed to execute PowerShell command: {}", e))?;

    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("Failed to create shortcut: {}", error_msg));
    }

    info!(target: "app", "Successfully created startup shortcut");
    Ok(())
}

/// Remove the shortcut
#[cfg(target_os = "windows")]
pub fn remove_shortcut() -> Result<()> {
    let startup_dir = get_startup_dir()?;
    let shortcut_path = startup_dir.join("Koala-Clash.lnk");

    // If the shortcut does not exist, return success directly
    if !shortcut_path.exists() {
        info!(target: "app", "Startup shortcut does not exist, nothing to remove");
        return Ok(());
    }

    // Delete the shortcut
    fs::remove_file(&shortcut_path).map_err(|e| anyhow!("Failed to delete shortcut: {}", e))?;

    info!(target: "app", "Successfully removed startup shortcut");
    Ok(())
}

/// 检查快捷方式是否存在
#[cfg(target_os = "windows")]
pub fn is_shortcut_enabled() -> Result<bool> {
    let startup_dir = get_startup_dir()?;
    let shortcut_path = startup_dir.join("Koala-Clash.lnk");

    Ok(shortcut_path.exists())
}

// 非 Windows 平台使用的空方法
// #[cfg(not(target_os = "windows"))]
// pub fn create_shortcut() -> Result<()> {
//     Ok(())
// }

// #[cfg(not(target_os = "windows"))]
// pub fn remove_shortcut() -> Result<()> {
//     Ok(())
// }

// #[cfg(not(target_os = "windows"))]
// pub fn is_shortcut_enabled() -> Result<bool> {
//     Ok(false)
// }
