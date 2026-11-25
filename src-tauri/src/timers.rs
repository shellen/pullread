// ABOUTME: Scheduled sync, review, and email roundup timers
// ABOUTME: Reads intervals from config and runs periodic operations

use crate::{notifications, sidecar, sync_schedule, tray};
use chrono::Datelike;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager};

/// Set once the timers are running, so repeat calls (e.g. pullread://sync
/// after onboarding) don't start duplicate sync loops or send duplicate email.
static TIMERS_STARTED: AtomicBool = AtomicBool::new(false);

/// Start sync, review, and email roundup timers based on user configuration.
/// Safe to call more than once; only the first call starts anything.
pub fn start_timers(app: &AppHandle) {
    if TIMERS_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    start_sync_supervisor(app);
    start_review_timer(app);
    start_email_timer(app);
}

/// Background sync supervisor.
///
/// The old timer was a single `tokio::time::interval(1h)`. That clock is
/// monotonic and stops while the Mac sleeps, the interval was read once at
/// launch, and if the task ever died (panic) or never started (config not
/// valid at launch) nothing noticed or restarted it. This loop instead wakes
/// every minute, compares wall-clock time with the last attempt, re-reads the
/// interval and config each time, runs each sync in its own task so a panic or
/// hang can't kill the loop, logs every run to ~/.config/pullread/sync.log,
/// and flags a stale library in the tray.
fn start_sync_supervisor(app: &AppHandle) {
    log::info!("Starting sync supervisor");
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut last_attempt: Option<SystemTime> = None;
        let mut prev_tick = SystemTime::now();
        let mut stale_notified_day: Option<u64> = None;
        let mut first = true;

        loop {
            if first {
                // Let startup settle before the first sync
                tokio::time::sleep(Duration::from_secs(2)).await;
                first = false;
            } else {
                tokio::time::sleep(sync_schedule::SUPERVISOR_TICK).await;
            }

            let now = SystemTime::now();
            let state = handle.state::<sidecar::SidecarState>();
            let log_path = state.sync_log_path();

            let woke = sync_schedule::detect_wake(prev_tick, now, sync_schedule::SUPERVISOR_TICK);
            prev_tick = now;
            if let Some(gap) = woke {
                log_line(&log_path, &format!("woke after {} min asleep", gap.as_secs() / 60));
            }

            check_stale(&handle, now, &mut stale_notified_day);

            if !state.is_config_valid() {
                continue; // first run / onboarding not finished yet
            }
            let interval_str = state.get_sync_interval();
            let interval = match sync_schedule::parse_interval(&interval_str) {
                Some(d) => d,
                None => {
                    // Manual sync: still do the one startup sync, as before
                    if last_attempt.is_some() {
                        tray::update_next_sync(&handle, "manual");
                        continue;
                    }
                    Duration::MAX
                }
            };
            if !sync_schedule::is_due(now, last_attempt, interval) {
                continue;
            }

            let trigger = if last_attempt.is_none() {
                "startup"
            } else if woke.is_some() {
                "scheduled-after-wake"
            } else {
                "scheduled"
            };
            last_attempt = Some(now);
            if interval != Duration::MAX {
                tray::update_next_sync(&handle, &format!("every {}", interval_str));
            }

            // Run in a separate task: if anything in it panics, the JoinError
            // lands here and the supervisor keeps going.
            let h = handle.clone();
            let trig = trigger.to_string();
            // The outer timeout is a backstop (run_sync has its own limits): if
            // it ever fires, the supervisor moves on and later runs log
            // "skipped: a sync is already running" until the stuck one ends.
            let job = tauri::async_runtime::spawn(async move { scheduled_sync(&h, &trig).await });
            match tokio::time::timeout(Duration::from_secs(90 * 60), job).await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    log_line(&log_path, &format!("{} sync task crashed: {}", trigger, e));
                    log::error!("Scheduled sync task crashed: {}", e);
                }
                Err(_) => {
                    log_line(&log_path, &format!("{} sync still running after 90 min; moving on", trigger));
                }
            }
        }
    });
}

async fn scheduled_sync(handle: &AppHandle, trigger: &str) {
    log::info!("Sync triggered ({})", trigger);
    match sidecar::run_sync_logged(handle, false, trigger).await {
        Ok(summary) => {
            tray::update_last_sync(handle);
            notifications::notify_sync_complete(handle, &summary);

            let state = handle.state::<sidecar::SidecarState>();
            if state.is_autotag_enabled() {
                let _ = sidecar::run_autotag(handle).await;
            }
        }
        Err(e) => {
            log::error!("Scheduled sync failed: {}", e);
            notifications::notify(handle, "Sync Failed", &e);
        }
    }
}

/// If the last successful sync is over a day old, say so in the tray, and
/// send one notification per day of staleness.
fn check_stale(handle: &AppHandle, now: SystemTime, notified_day: &mut Option<u64>) {
    let state = handle.state::<sidecar::SidecarState>();
    let last = match state.last_sync_success() {
        Some(t) => t,
        None => return, // never synced with this version yet; nothing to compare
    };
    let age = now.duration_since(last).unwrap_or_default();
    if age < sync_schedule::STALE_AFTER {
        *notified_day = None;
        return;
    }
    let label = match sync_schedule::days_ago_label(age) {
        Some(l) => l,
        None => return,
    };
    tray::show_stale_sync(handle, &label);
    let days = sync_schedule::whole_days(age).unwrap_or(1);
    if *notified_day != Some(days) {
        *notified_day = Some(days);
        log_line(&state.sync_log_path(), &format!("stale: last successful sync {}", label));
        notifications::notify(
            handle,
            "Pull Read hasn't synced",
            &format!("Last successful sync was {}. Use Sync Now, or check {}.", label, state.sync_log_path().display()),
        );
    }
}

fn log_line(path: &std::path::Path, msg: &str) {
    let stamp = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%z");
    sync_schedule::append_sync_log(path, &format!("{} {}", stamp, msg), sync_schedule::MAX_SYNC_LOG_BYTES);
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
        // Judge "a day/week has passed" by the wall clock, checked every
        // minute: a single long tokio interval stops counting while the Mac sleeps.
        let mut last_run = SystemTime::now();

        loop {
            tokio::time::sleep(sync_schedule::SUPERVISOR_TICK).await;
            if !sync_schedule::is_due(SystemTime::now(), Some(last_run), duration) {
                continue;
            }
            last_run = SystemTime::now();

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

/// Start the email roundup timer — sends via the Node sidecar HTTP API at a specific time of day.
/// If the app was not running at the scheduled time, sends on next activation.
fn start_email_timer(app: &AppHandle) {
    let state = app.state::<sidecar::SidecarState>();
    let settings_path = state
        .config_path()
        .parent()
        .unwrap_or(std::path::Path::new("/tmp"))
        .join("settings.json");

    let config: serde_json::Value = std::fs::read_to_string(&settings_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default();

    let email_cfg = config.get("emailRoundup").cloned().unwrap_or_default();
    let enabled = email_cfg.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    let to_address = email_cfg.get("toAddress").and_then(|v| v.as_str()).unwrap_or("");
    let provider = email_cfg.get("smtpProvider").and_then(|v| v.as_str()).unwrap_or("custom");
    let smtp_host = email_cfg.get("smtpHost").and_then(|v| v.as_str()).unwrap_or("");

    // Provider presets (gmail, outlook) don't need a custom host
    let has_host = provider != "custom" || !smtp_host.is_empty();
    if !enabled || !has_host || to_address.is_empty() {
        return;
    }

    let frequency = email_cfg
        .get("frequency")
        .and_then(|v| v.as_str())
        .unwrap_or("daily")
        .to_string();
    let send_time = email_cfg
        .get("sendTime")
        .and_then(|v| v.as_str())
        .unwrap_or("08:00")
        .to_string();
    let send_time2 = email_cfg
        .get("sendTime2")
        .and_then(|v| v.as_str())
        .unwrap_or("17:00")
        .to_string();
    let last_sent = email_cfg
        .get("lastSentDate")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Build list of send times based on frequency
    let mut send_times = vec![send_time.clone()];
    if frequency == "twice" {
        send_times.push(send_time2.clone());
    }
    // Weekly uses the same single send time (timer checks day-of-week)
    log::info!("Starting email timer: {} at {:?}", frequency, send_times);

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // Check if we missed a send (computer was off at scheduled time)
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        if last_sent != today && frequency != "weekly" {
            // Check if any scheduled time has passed
            let missed = send_times.iter().any(|t| is_time_past(t));
            if missed {
                log::info!("Email: missed scheduled time, sending now (failover)");
                send_email_roundup(&handle, &settings_path).await;
            }
        }

        loop {
            // Find the next upcoming send time
            let wait = send_times.iter()
                .map(|t| duration_until_time(t))
                .min()
                .unwrap_or(std::time::Duration::from_secs(3600));
            log::info!(
                "Email: next send in {} minutes",
                wait.as_secs() / 60
            );

            // Sleep in short steps and re-check the wall clock: tokio's clock
            // stops while the Mac sleeps, so one long sleep could fire hours
            // or days late. If the Mac slept through the send time, this sends
            // soon after it wakes.
            let target = SystemTime::now() + wait;
            loop {
                let remaining = match target.duration_since(SystemTime::now()) {
                    Ok(r) if !r.is_zero() => r,
                    _ => break,
                };
                tokio::time::sleep(remaining.min(sync_schedule::SUPERVISOR_TICK)).await;
            }

            // Weekly: only send on the configured day (default Monday)
            if frequency == "weekly" {
                let dow = chrono::Local::now().weekday();
                if dow != chrono::Weekday::Mon {
                    tokio::time::sleep(std::time::Duration::from_secs(61)).await;
                    continue;
                }
            }

            log::info!("Scheduled email triggered");
            send_email_roundup(&handle, &settings_path).await;

            // Sleep a bit to avoid firing twice in the same minute
            tokio::time::sleep(std::time::Duration::from_secs(61)).await;
        }
    });
}

/// Send the email roundup via the viewer HTTP API and record the send date
async fn send_email_roundup(handle: &AppHandle, settings_path: &std::path::Path) {
    match sidecar::ensure_viewer_running(handle).await {
        Ok(port) => {
            let url = format!("http://127.0.0.1:{}/api/email/send-roundup", port);
            // Bounded so a hung viewer can't block the email loop forever
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(10 * 60))
                .build()
                .unwrap_or_default();
            match client.post(&url).send().await {
                Ok(resp) => {
                    let body = resp.text().await.unwrap_or_default();
                    log::info!("Email roundup sent: {}", body);
                    notifications::notify(handle, "Rundown Sent", "The Pull Read Rundown has been sent");
                    record_last_sent(settings_path);
                }
                Err(e) => {
                    log::error!("Email roundup HTTP request failed: {}", e);
                }
            }
        }
        Err(e) => {
            log::error!("Email roundup failed — could not start viewer: {}", e);
        }
    }
}

/// Write today's date to emailRoundup.lastSentDate in settings.json
fn record_last_sent(settings_path: &std::path::Path) {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut config: serde_json::Value = std::fs::read_to_string(settings_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    if let Some(obj) = config.as_object_mut() {
        let email = obj
            .entry("emailRoundup")
            .or_insert_with(|| serde_json::json!({}));
        if let Some(email_obj) = email.as_object_mut() {
            email_obj.insert("lastSentDate".to_string(), serde_json::json!(today));
        }
    }

    if let Ok(json) = serde_json::to_string_pretty(&config) {
        let _ = std::fs::write(settings_path, json);
    }
}

/// Check if the given HH:MM time has already passed today
fn is_time_past(time_str: &str) -> bool {
    let parts: Vec<&str> = time_str.split(':').collect();
    let target_hour: u32 = parts.first().and_then(|h| h.parse().ok()).unwrap_or(8);
    let target_min: u32 = parts.get(1).and_then(|m| m.parse().ok()).unwrap_or(0);

    let now = chrono::Local::now();
    let target = now
        .date_naive()
        .and_hms_opt(target_hour, target_min, 0)
        .unwrap_or_else(|| now.naive_local());

    now.naive_local() > target
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
