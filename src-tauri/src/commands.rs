// ABOUTME: Tauri IPC commands and URL scheme handler
// ABOUTME: Provides open_viewer, trigger_sync, trigger_review, deep link handling

use crate::{notifications, sidecar, timers, tray};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Open the viewer window, starting the sidecar server if needed
pub async fn open_viewer_inner(app: &AppHandle) -> Result<(), String> {
    open_viewer_at(app, None).await
}

/// Open the viewer window at an optional hash fragment (e.g. "tab=settings")
pub async fn open_viewer_at(app: &AppHandle, hash: Option<&str>) -> Result<(), String> {
    let port_result = sidecar::ensure_viewer_running(app).await;
    let fragment = hash.map(|h| format!("#{}", h)).unwrap_or_default();

    // If server failed to start, show a notification and fall back to browser
    let port = match port_result {
        Ok(p) => p,
        Err(e) => {
            log::error!("Sidecar failed: {}", e);
            notifications::notify(
                app,
                "PullRead Server Error",
                "The server couldn't start. Try quitting and reopening.",
            );
            // Try opening in browser anyway — server may come up late
            let fallback_url = "http://127.0.0.1:7777";
            let _ = open::that(fallback_url);
            return Ok(());
        }
    };

    // Check if user prefers default browser over the built-in WebView
    let state = app.state::<sidecar::SidecarState>();
    if state.should_open_in_browser() {
        // Use 127.0.0.1 (not localhost) — the server binds IPv4 only and
        // browsers may try IPv6 ::1 first, causing a long connection timeout.
        let browser_url = format!("http://127.0.0.1:{}{}", port, fragment);
        let _ = open::that(&browser_url);
        return Ok(());
    }

    // Keep localhost for WebView to preserve localStorage across launches
    let url = format!("http://localhost:{}{}", port, fragment);

    // Reuse existing window or create new
    if let Some(window) = app.get_webview_window("viewer") {
        let _ = window.show();
        let _ = window.set_focus();
        if hash.is_some() {
            let _ = window.navigate(url.parse().unwrap());
        }
    } else {
        let _window = WebviewWindowBuilder::new(
            app,
            "viewer",
            WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {}", e))?),
        )
        .title("Pull Read")
        .inner_size(1100.0, 750.0)
        .min_inner_size(600.0, 400.0)
        .build()
        .map_err(|e| format!("Failed to create viewer window: {}", e))?;

        // Show in dock when viewer is open
        #[cfg(target_os = "macos")]
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    }

    Ok(())
}

/// Handle the viewer window being closed — hide dock icon again
#[allow(dead_code)]
pub fn on_viewer_closed(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        // Only hide dock icon if no other windows are open
        let windows: Vec<_> = app.webview_windows().into_keys().collect();
        if windows.is_empty() {
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
        }
    }
    let _ = app;
}

/// Tauri command: open the viewer
#[tauri::command]
pub async fn open_viewer(app: AppHandle) -> Result<(), String> {
    open_viewer_inner(&app).await
}

/// Tauri command: trigger a sync
#[tauri::command]
pub async fn trigger_sync(app: AppHandle, retry_failed: bool) -> Result<String, String> {
    let result = sidecar::run_sync(&app, retry_failed).await;
    match &result {
        Ok(summary) => {
            tray::update_last_sync(&app);
            notifications::notify_sync_complete(&app, summary);
        }
        Err(e) => {
            notifications::notify(&app, "Sync Failed", e);
        }
    }
    result
}

/// Tauri command: generate a review
#[tauri::command]
pub async fn trigger_review(app: AppHandle, days: Option<u32>) -> Result<String, String> {
    sidecar::run_review(&app, days.unwrap_or(7)).await
}

/// Tauri command: get log file content
#[tauri::command]
pub async fn get_log_content() -> Result<String, String> {
    let path = sidecar::log_path();
    std::fs::read_to_string(&path).map_err(|e| format!("Cannot read log: {}", e))
}

/// Handle a pullread:// deep link URL
pub async fn handle_deep_link(app: &AppHandle, url: &str) {
    log::info!("Deep link received: {}", url);

    // Parse the URL — pullread://host?query
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(e) => {
            log::warn!("Invalid deep link URL: {} — {}", url, e);
            return;
        }
    };

    let host = parsed.host_str().unwrap_or("");

    match host {
        "open" => {
            // pullread://open or pullread://open?file=filename.md
            let hash = parsed
                .query_pairs()
                .find(|(k, _)| k == "file")
                .map(|(_, v)| format!("file={}", urlencoding::encode(&v)));
            let _ = open_viewer_at(app, hash.as_deref()).await;
        }
        "save" => {
            // pullread://save?url=<encoded_url>&title=<optional_title>
            let save_url = parsed
                .query_pairs()
                .find(|(k, _)| k == "url")
                .map(|(_, v)| v.to_string());
            let title = parsed
                .query_pairs()
                .find(|(k, _)| k == "title")
                .map(|(_, v)| v.to_string());

            if let Some(article_url) = save_url {
                save_to_inbox(app, &article_url, title.as_deref());
                notifications::notify(app, "Article Saved", "Added to inbox for next sync.");
            }
        }
        "sync" => {
            // pullread://sync — trigger a sync
            match sidecar::run_sync(app, false).await {
                Ok(summary) => {
                    tray::update_last_sync(app);
                    notifications::notify_sync_complete(app, &summary);
                    timers::start_timers(app);
                }
                Err(e) => {
                    notifications::notify(app, "Sync Failed", &e);
                }
            }
        }
        "notebook" => {
            // pullread://notebook?id=<id>
            let hash = parsed
                .query_pairs()
                .find(|(k, _)| k == "id")
                .map(|(_, v)| format!("notebook={}", urlencoding::encode(&v)));
            let _ = open_viewer_at(app, hash.as_deref()).await;
        }
        _ => {
            log::warn!("Unknown deep link host: {}", host);
        }
    }
}

/// Save a URL to the inbox file for processing during next sync
fn save_to_inbox(app: &AppHandle, url: &str, title: Option<&str>) {
    let state = app.state::<sidecar::SidecarState>();
    let inbox_path = state
        .config_path()
        .parent()
        .unwrap_or(std::path::Path::new("/tmp"))
        .join("inbox.json");

    // Read existing inbox
    let mut inbox: Vec<serde_json::Value> =
        std::fs::read_to_string(&inbox_path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default();

    // Add new entry
    let mut entry = serde_json::json!({
        "url": url,
        "addedAt": chrono::Utc::now().to_rfc3339(),
    });
    if let Some(t) = title {
        entry["title"] = serde_json::Value::String(t.to_string());
    }
    inbox.push(entry);

    // Write back
    if let Ok(json) = serde_json::to_string_pretty(&inbox) {
        let _ = std::fs::write(&inbox_path, json);
    }
}
