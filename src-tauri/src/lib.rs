// ABOUTME: Tauri application library for PullRead
// ABOUTME: Sets up system tray, sidecar management, timers, and all plugins

mod auth;
mod commands;
mod notifications;
mod platform;
mod sidecar;
mod timers;
mod tray;

use sidecar::SidecarState;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(SidecarState::new())
        .setup(|app| {
            // Menu-bar-only: hide dock icon on macOS
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Build system tray
            tray::create_tray(app)?;

            // Check for first run or start initial sync
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<SidecarState>();
                if state.is_first_run() {
                    // Open viewer for onboarding
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    let _ = commands::open_viewer_inner(&handle).await;
                } else if state.is_config_valid() {
                    // Wait 2 seconds then run initial sync
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    if sidecar::run_sync(&handle, false).await.is_ok() {
                        tray::update_last_sync(&handle);
                    }

                    // Start scheduled timers
                    timers::start_timers(&handle);
                }
            });

            // Check for updates in the background after startup settles
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                tray::check_updates_silently(&handle).await;
            });

            // Handle URL scheme (pullread://)
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let handle = handle.clone();
                let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                for url in urls {
                    let h = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        commands::handle_deep_link(&h, &url).await;
                    });
                }
            });

            log::info!("PullRead Tauri app initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_viewer,
            commands::trigger_sync,
            commands::trigger_review,
            commands::get_log_content,
            commands::print_webview,
            auth::open_site_login,
            auth::list_site_logins,
            auth::remove_site_login,
            auth::save_site_cookies,
        ])
        .build(tauri::generate_context!())
        .expect("error building PullRead")
        .run(|app_handle, event| match &event {
            tauri::RunEvent::ExitRequested { code, api, .. } => {
                if code.is_none() {
                    // Window close — keep running in background
                    api.prevent_exit();
                }
                // Programmatic exit(0) from Quit — let it proceed
            }
            tauri::RunEvent::Exit => {
                let state = app_handle.state::<SidecarState>();
                state.stop_all();
            }
            _ => {}
        });
}
