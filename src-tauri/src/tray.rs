// ABOUTME: System tray (menu bar) setup and event handling
// ABOUTME: Replicates the Swift AppDelegate menu with all 12 items

use crate::{commands, notifications, sidecar};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

pub struct TrayItems {
    sync_now: Mutex<MenuItem<tauri::Wry>>,
    last_sync: Mutex<MenuItem<tauri::Wry>>,
    next_sync: Mutex<MenuItem<tauri::Wry>>,
}

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

    let settings =
        MenuItem::with_id(app, "settings", "Settings\u{2026}", true, Some("CmdOrCtrl+,"))?;
    let logs = MenuItem::with_id(app, "logs", "Logs", true, Some("CmdOrCtrl+L"))?;
    let check_updates =
        MenuItem::with_id(app, "updates", "Check for Updates\u{2026}", true, None::<&str>)?;
    let sep4 = PredefinedMenuItem::separator(app)?;

    let about = MenuItem::with_id(app, "about", "About Pull Read", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Pull Read", true, Some("CmdOrCtrl+Q"))?;

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
            &settings,
            &logs,
            &check_updates,
            &sep4,
            &about,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("main")
        .icon(tauri::include_image!("icons/tray-icon.png"))
        .icon_as_template(true)
        .tooltip("Pull Read")
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
                "settings" => {
                    tauri::async_runtime::spawn(async move {
                        let _ = commands::open_viewer_inner(&handle).await;
                        if let Some(window) = handle.get_webview_window("viewer") {
                            let port =
                                handle.state::<sidecar::SidecarState>().get_viewer_port();
                            let nav_url =
                                format!("http://localhost:{}/#tab=settings", port);
                            let _ = window.navigate(nav_url.parse().unwrap());
                        }
                    });
                }
                "about" => {
                    let version = env!("CARGO_PKG_VERSION");
                    handle
                        .dialog()
                        .message(format!(
                            "Pull Read v{}\n\nSync articles to searchable markdown files.\n\n\u{00A9} A Little Drive LLC",
                            version
                        ))
                        .title("About Pull Read")
                        .kind(MessageDialogKind::Info)
                        .show(|_| {});
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

    app.manage(TrayItems {
        sync_now: Mutex::new(sync_now),
        last_sync: Mutex::new(last_sync),
        next_sync: Mutex::new(next_sync),
    });

    Ok(())
}

async fn handle_sync(app: &AppHandle, retry_failed: bool) {
    // Show syncing state in tray
    set_sync_active(app, true);

    match sidecar::run_sync(app, retry_failed).await {
        Ok(summary) => {
            set_sync_active(app, false);
            update_last_sync(app);
            notifications::notify_sync_complete(app, &summary);

            // Run autotag if enabled
            let state = app.state::<sidecar::SidecarState>();
            if state.is_autotag_enabled() {
                let _ = sidecar::run_autotag(app).await;
            }
        }
        Err(e) => {
            set_sync_active(app, false);
            notifications::notify(app, "Sync Failed", &e);
        }
    }
}

/// Toggle tray state to show sync activity.
fn set_sync_active(app: &AppHandle, active: bool) {
    let items = app.state::<TrayItems>();

    // Disable/enable "Sync Now" menu item
    if let Ok(item) = items.sync_now.lock() {
        let _ = item.set_enabled(!active);
        let _ = item.set_text(if active { "Syncing\u{2026}" } else { "Sync Now" });
    }

    // Update tooltip
    if let Some(tray) = app.tray_by_id("main") {
        if active {
            let _ = tray.set_tooltip(Some("Pull Read — Syncing\u{2026}"));
        }
    }

    // Update "Last sync" text during sync
    if active {
        if let Ok(item) = items.last_sync.lock() {
            let _ = item.set_text("Syncing\u{2026}");
        }
    }
}

async fn handle_review(app: &AppHandle) {
    match sidecar::run_review(app, 7).await {
        Ok(output) => {
            notifications::notify(app, "Review Ready", &output);
            // Open the review in the viewer
            let _ = commands::open_viewer_inner(app).await;
            // Navigate to the review file if we can extract the filename
            if let Some(filename) = output
                .strip_prefix("Review saved: ")
                .map(|s| s.trim().to_string())
            {
                if let Some(window) = app.get_webview_window("viewer") {
                    let port = app.state::<sidecar::SidecarState>().get_viewer_port();
                    let nav_url = format!(
                        "http://localhost:{}/#file={}",
                        port,
                        urlencoding::encode(&filename)
                    );
                    let _ = window.navigate(nav_url.parse().unwrap());
                }
            }
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
                let app2 = app.clone();
                app.dialog()
                    .message(format!(
                        "Pull Read v{} is available.\n\nWould you like to download and install it?",
                        version
                    ))
                    .title("Update Available")
                    .kind(MessageDialogKind::Info)
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Update".into(),
                        "Later".into(),
                    ))
                    .show(move |confirmed| {
                        if confirmed {
                            tauri::async_runtime::spawn(async move {
                                match update.download_and_install(|_, _| {}, || {}).await {
                                    Ok(_) => {
                                        let app3 = app2.clone();
                                        app2.dialog()
                                            .message("Pull Read will restart to apply the update.")
                                            .title("Update Installed")
                                            .kind(MessageDialogKind::Info)
                                            .show(move |_| {
                                                app3.restart();
                                            });
                                    }
                                    Err(e) => {
                                        app2.dialog()
                                            .message(format!("Download failed: {}", e))
                                            .title("Update Failed")
                                            .kind(MessageDialogKind::Error)
                                            .show(|_| {});
                                    }
                                }
                            });
                        }
                    });
            }
            Ok(None) => {
                let version = env!("CARGO_PKG_VERSION");
                app.dialog()
                    .message(format!("Pull Read v{} is the latest version.", version))
                    .title("No Updates Available")
                    .kind(MessageDialogKind::Info)
                    .show(|_| {});
            }
            Err(e) => {
                app.dialog()
                    .message(format!("Could not check for updates: {}", e))
                    .title("Update Check Failed")
                    .kind(MessageDialogKind::Error)
                    .show(|_| {});
            }
        },
        Err(e) => {
            log::warn!("Updater not configured: {}", e);
        }
    }
}

/// Check for updates silently — only notify if an update is found.
pub async fn check_updates_silently(app: &AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                log::info!("Update available: v{}", version);
                notifications::notify(
                    app,
                    "Update Available",
                    &format!(
                        "Pull Read v{} is available. Use Check for Updates to install.",
                        version
                    ),
                );
            }
            Ok(None) => {
                log::info!("No updates available");
            }
            Err(e) => {
                log::warn!("Silent update check failed: {}", e);
            }
        },
        Err(e) => {
            log::warn!("Updater not configured: {}", e);
        }
    }
}

/// Update the "Last sync:" tray menu item and tooltip with current time.
pub fn update_last_sync(app: &AppHandle) {
    let state = app.state::<sidecar::SidecarState>();
    let fmt = state.get_time_format();
    let now = if fmt == "24h" {
        chrono::Local::now().format("%H:%M").to_string()
    } else {
        chrono::Local::now().format("%-I:%M %p").to_string()
    };
    log::info!("Last sync updated: {}", now);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&format!("Pull Read — Last sync: {}", now)));
    }
    let items = app.state::<TrayItems>();
    let lock = items.last_sync.lock();
    if let Ok(item) = lock {
        let _ = item.set_text(format!("Last sync: {}", now));
    }
}

/// Update the "Next sync:" tray menu item.
pub fn update_next_sync(app: &AppHandle, text: &str) {
    let items = app.state::<TrayItems>();
    let lock = items.next_sync.lock();
    if let Ok(item) = lock {
        let _ = item.set_text(format!("Next sync: {}", text));
    }
}
