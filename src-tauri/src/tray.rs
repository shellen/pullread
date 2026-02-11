// ABOUTME: System tray (menu bar) setup and event handling
// ABOUTME: Replicates the Swift AppDelegate menu with all 12 items

use crate::{commands, notifications, sidecar};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn create_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let sync_now = MenuItem::with_id(app, "sync_now", "Sync Now", true, Some("CmdOrCtrl+S"))?;
    let last_sync = MenuItem::with_id(app, "last_sync", "Last sync: Never", false, None::<&str>)?;
    let next_sync =
        MenuItem::with_id(app, "next_sync", "Next sync: —", false, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let view_articles =
        MenuItem::with_id(app, "view", "View Articles", true, Some("CmdOrCtrl+D"))?;
    let open_folder =
        MenuItem::with_id(app, "open_folder", "Open Folder", true, Some("CmdOrCtrl+O"))?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let retry_failed =
        MenuItem::with_id(app, "retry", "Retry Failed", true, Some("CmdOrCtrl+R"))?;
    let gen_review =
        MenuItem::with_id(app, "review", "Generate Review", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;

    let logs = MenuItem::with_id(app, "logs", "Logs", true, Some("CmdOrCtrl+L"))?;
    let check_updates =
        MenuItem::with_id(app, "updates", "Check for Updates\u{2026}", true, None::<&str>)?;
    let sep4 = PredefinedMenuItem::separator(app)?;

    let about = MenuItem::with_id(app, "about", "About PullRead", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit PullRead", true, Some("CmdOrCtrl+Q"))?;

    let menu = Menu::with_items(
        app,
        &[
            &sync_now,
            &last_sync,
            &next_sync,
            &sep1,
            &view_articles,
            &open_folder,
            &sep2,
            &retry_failed,
            &gen_review,
            &sep3,
            &logs,
            &check_updates,
            &sep4,
            &about,
            &quit,
        ],
    )?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("PullRead")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let handle = app.clone();
            match id {
                "sync_now" => {
                    tauri::async_runtime::spawn(async move {
                        handle_sync(&handle, false).await;
                    });
                }
                "view" => {
                    tauri::async_runtime::spawn(async move {
                        let _ = commands::open_viewer_inner(&handle).await;
                    });
                }
                "open_folder" => {
                    let state = handle.state::<sidecar::SidecarState>();
                    if let Some(path) = state.get_output_path() {
                        let _ = open::that(&path);
                    }
                }
                "retry" => {
                    tauri::async_runtime::spawn(async move {
                        handle_sync(&handle, true).await;
                    });
                }
                "review" => {
                    tauri::async_runtime::spawn(async move {
                        handle_review(&handle).await;
                    });
                }
                "logs" => {
                    let log_path = sidecar::log_path();
                    let _ = open::that(&log_path);
                }
                "updates" => {
                    tauri::async_runtime::spawn(async move {
                        handle_check_updates(&handle).await;
                    });
                }
                "about" => {
                    let version = env!("CARGO_PKG_VERSION");
                    notifications::notify(
                        &handle,
                        "About PullRead",
                        &format!("PullRead v{}\nSync articles to searchable markdown files.", version),
                    );
                }
                "quit" => {
                    let state = handle.state::<sidecar::SidecarState>();
                    state.stop_all();
                    handle.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // Left click opens the menu (default behavior with menu_on_left_click)
                let _ = tray;
            }
        })
        .build(app)?;

    Ok(())
}

async fn handle_sync(app: &AppHandle, retry_failed: bool) {
    // Update tray to show syncing state
    notifications::notify(app, "PullRead", "Syncing...");

    match sidecar::run_sync(app, retry_failed).await {
        Ok(summary) => {
            update_last_sync(app);
            notifications::notify_sync_complete(app, &summary);

            // Run autotag if enabled
            let state = app.state::<sidecar::SidecarState>();
            if state.is_autotag_enabled() {
                let _ = sidecar::run_autotag(app).await;
            }
        }
        Err(e) => {
            notifications::notify(app, "Sync Failed", &e);
        }
    }
}

async fn handle_review(app: &AppHandle) {
    match sidecar::run_review(app, 7).await {
        Ok(output) => {
            notifications::notify(app, "Review Ready", &output);
        }
        Err(e) => {
            notifications::notify(app, "Review Failed", &e);
        }
    }
}

async fn handle_check_updates(app: &AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                notifications::notify(
                    app,
                    "Update Available",
                    &format!("PullRead v{} is available. Downloading...", version),
                );
                match update.download_and_install(|_, _| {}, || {}).await {
                    Ok(_) => {
                        notifications::notify(
                            app,
                            "Update Installed",
                            "PullRead will restart to apply the update.",
                        );
                        app.restart();
                    }
                    Err(e) => {
                        notifications::notify(
                            app,
                            "Update Failed",
                            &format!("Download failed: {}", e),
                        );
                    }
                }
            }
            Ok(None) => {
                notifications::notify(app, "PullRead", "You're up to date.");
            }
            Err(e) => {
                notifications::notify(
                    app,
                    "Update Check Failed",
                    &format!("Could not check for updates: {}", e),
                );
            }
        },
        Err(e) => {
            log::warn!("Updater not configured: {}", e);
        }
    }
}

/// Update the "Last sync:" tray menu item with current time.
/// We store the last sync time in app state since Tauri 2.x doesn't expose
/// menu item getters on TrayIcon. The menu is rebuilt lazily if needed.
pub fn update_last_sync(app: &AppHandle) {
    let now = chrono::Local::now().format("%H:%M").to_string();
    log::info!("Last sync updated: {}", now);
    // Store timestamp for display in tray tooltip
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&format!("PullRead — Last sync: {}", now)));
    }
}
