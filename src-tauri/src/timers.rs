// ABOUTME: Scheduled sync, review, and email roundup timers
// ABOUTME: Reads intervals from config and runs periodic operations

use crate::{email, notifications, sidecar, tray};
use tauri::{AppHandle, Manager};

/// Start sync, review, and email roundup timers based on user configuration
pub fn start_timers(app: &AppHandle) {
    start_sync_timer(app);
    start_review_timer(app);
    start_email_timer(app);
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

/// Start the email roundup timer — sends at a specific time of day
fn start_email_timer(app: &AppHandle) {
    let config = email::load_email_config(app);
    if !config.enabled || config.smtp_host.is_empty() || config.to_address.is_empty() {
        return;
    }

    let send_time = config.send_time.clone();
    log::info!("Starting email roundup timer: daily at {}", send_time);

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            // Calculate duration until next send time
            let wait = duration_until_time(&send_time);
            log::info!(
                "Email roundup: next send in {} minutes",
                wait.as_secs() / 60
            );

            tokio::time::sleep(wait).await;

            log::info!("Scheduled email roundup triggered");
            match email::send_roundup(&handle).await {
                Ok(summary) => {
                    log::info!("Email roundup sent: {}", summary);
                    notifications::notify(&handle, "Roundup Sent", &summary);
                }
                Err(e) => {
                    log::error!("Email roundup failed: {}", e);
                }
            }

            // Sleep a bit to avoid firing twice in the same minute
            tokio::time::sleep(std::time::Duration::from_secs(61)).await;
        }
    });
}

/// Calculate how long to wait until a given HH:MM time today (or tomorrow if past)
fn duration_until_time(time_str: &str) -> std::time::Duration {
    let parts: Vec<&str> = time_str.split(':').collect();
    let target_hour: u32 = parts.first().and_then(|h| h.parse().ok()).unwrap_or(8);
    let target_min: u32 = parts.get(1).and_then(|m| m.parse().ok()).unwrap_or(0);

    let now = chrono::Local::now();
    let today_target = now
        .date_naive()
        .and_hms_opt(target_hour, target_min, 0)
        .unwrap_or_else(|| now.naive_local());

    let target = if today_target > now.naive_local() {
        today_target
    } else {
        // Already past today's time, schedule for tomorrow
        today_target + chrono::Duration::days(1)
    };

    let diff = target - now.naive_local();
    diff.to_std()
        .unwrap_or(std::time::Duration::from_secs(3600))
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
