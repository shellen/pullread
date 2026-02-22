// ABOUTME: Scheduled sync and review timers
// ABOUTME: Reads intervals from config and runs periodic operations

use crate::{notifications, sidecar, tray};
use tauri::{AppHandle, Manager};

/// Start sync and review timers based on user configuration
pub fn start_timers(app: &AppHandle) {
    start_sync_timer(app);
    start_review_timer(app);
}

/// Start the periodic sync timer
fn start_sync_timer(app: &AppHandle) {
    let state = app.state::<sidecar::SidecarState>();
    let interval_str = state.get_sync_interval();

    let duration = match parse_interval(&interval_str) {
        Some(d) => d,
        None => return, // "manual" or unparseable — no automatic sync
    };

    log::info!("Starting sync timer: every {}", interval_str);
    tray::update_next_sync(app, &interval_str);

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(duration);
        interval.tick().await; // Skip first immediate tick

        loop {
            interval.tick().await;

            log::info!("Scheduled sync triggered");
            match sidecar::run_sync(&handle, false).await {
                Ok(summary) => {
                    tray::update_last_sync(&handle);
                    notifications::notify_sync_complete(&handle, &summary);

                    // Run autotag if enabled
                    let state = handle.state::<sidecar::SidecarState>();
                    if state.is_autotag_enabled() {
                        let _ = sidecar::run_autotag(&handle).await;
                    }
                }
                Err(e) => {
                    log::error!("Scheduled sync failed: {}", e);
                    notifications::notify(&handle, "Sync Failed", &e);
                }
            }
        }
    });
}

/// Start the periodic review timer
fn start_review_timer(app: &AppHandle) {
    let state = app.state::<sidecar::SidecarState>();
    let schedule = state.get_review_schedule();

    let duration = match schedule.as_str() {
        "daily" => std::time::Duration::from_secs(24 * 60 * 60),
        "weekly" => std::time::Duration::from_secs(7 * 24 * 60 * 60),
        "off" | _ => return, // No automatic review
    };

    log::info!("Starting review timer: {}", schedule);

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(duration);
        interval.tick().await; // Skip first immediate tick

        loop {
            interval.tick().await;

            log::info!("Scheduled review triggered");
            match sidecar::run_review(&handle, 7).await {
                Ok(output) => {
                    notifications::notify(&handle, "Review Ready", &output);
                }
                Err(e) => {
                    log::error!("Scheduled review failed: {}", e);
                    notifications::notify(&handle, "Review Failed", &e);
                }
            }
        }
    });
}

/// Parse interval strings like "30m", "1h", "4h", "90m" into a Duration.
/// Returns None for "manual" or unparseable values.
fn parse_interval(s: &str) -> Option<std::time::Duration> {
    let s = s.trim();
    if s == "manual" || s.is_empty() {
        return None;
    }
    if let Some(mins) = s.strip_suffix('m') {
        mins.parse::<u64>().ok().filter(|&n| n > 0).map(|n| std::time::Duration::from_secs(n * 60))
    } else if let Some(hrs) = s.strip_suffix('h') {
        hrs.parse::<u64>().ok().filter(|&n| n > 0).map(|n| std::time::Duration::from_secs(n * 3600))
    } else {
        None
    }
}
