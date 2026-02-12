// ABOUTME: Cross-platform notification helpers
// ABOUTME: Wraps tauri-plugin-notification with PullRead defaults

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// Send a basic notification
pub fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        log::warn!("Failed to send notification: {}", e);
    }
}

/// Send a sync-complete notification with sound preference
pub fn notify_sync_complete(app: &AppHandle, summary: &str) {
    let sound_enabled = should_play_sound(app);

    let mut builder = app
        .notification()
        .builder()
        .title("Sync Complete")
        .body(summary);

    if sound_enabled {
        builder = builder.sound("default");
    }

    if let Err(e) = builder.show() {
        log::warn!("Failed to send sync notification: {}", e);
    }
}

/// Check if notification sounds are enabled in user settings
fn should_play_sound(app: &AppHandle) -> bool {
    let state = app.state::<crate::sidecar::SidecarState>();
    let settings_path = state
        .config_path()
        .parent()
        .unwrap_or(std::path::Path::new("/tmp"))
        .join("settings.json");

    std::fs::read_to_string(&settings_path)
        .ok()
        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
        .and_then(|v| v.get("notificationSounds")?.as_bool())
        .unwrap_or(false) // Default: sounds disabled (matches Swift app default)
}
