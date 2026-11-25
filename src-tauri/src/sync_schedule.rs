// ABOUTME: Pure scheduling helpers for background sync (std only, unit-tested)
// ABOUTME: Wall-clock due checks, wake detection, single-run guard, and the sync run log

use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime};

/// How often the sync supervisor wakes up to check whether a sync is due.
/// Short on purpose: tokio timers run on a monotonic clock that stops while
/// the Mac sleeps, so a long `interval` can drift by hours or days. A short
/// tick plus a wall-clock comparison catches up within a minute of waking.
pub const SUPERVISOR_TICK: Duration = Duration::from_secs(60);

/// A gap between ticks this much longer than SUPERVISOR_TICK means the
/// machine was asleep (or the process was suspended).
pub const WAKE_GAP_SLACK: Duration = Duration::from_secs(5 * 60);

/// Library age after which the app tells the user that syncing looks stalled.
pub const STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

/// Keep the sync run log under this size; older half is dropped on overflow.
pub const MAX_SYNC_LOG_BYTES: u64 = 256 * 1024;

/// Parse interval strings like "30m", "1h", "4h", "90m" into a Duration.
/// Returns None for "manual" or unparseable values.
pub fn parse_interval(s: &str) -> Option<Duration> {
    let s = s.trim();
    if s == "manual" || s.is_empty() {
        return None;
    }
    if let Some(mins) = s.strip_suffix('m') {
        mins.parse::<u64>().ok().filter(|&n| n > 0).map(|n| Duration::from_secs(n * 60))
    } else if let Some(hrs) = s.strip_suffix('h') {
        hrs.parse::<u64>().ok().filter(|&n| n > 0).map(|n| Duration::from_secs(n * 3600))
    } else {
        None
    }
}

/// Is a sync due, judged by the wall clock (which keeps counting through sleep)?
/// With no previous attempt it is due at once. If the clock moved backwards
/// past the last attempt, run now rather than wait for it to catch up.
pub fn is_due(now: SystemTime, last_attempt: Option<SystemTime>, interval: Duration) -> bool {
    match last_attempt {
        None => true,
        Some(last) => match now.duration_since(last) {
            Ok(elapsed) => elapsed >= interval,
            Err(_) => true,
        },
    }
}

/// If the wall clock advanced much more than one tick since the previous
/// tick, the machine was asleep. Returns the length of the gap.
pub fn detect_wake(prev_tick: SystemTime, now: SystemTime, tick: Duration) -> Option<Duration> {
    let gap = now.duration_since(prev_tick).ok()?;
    if gap > tick + WAKE_GAP_SLACK {
        Some(gap)
    } else {
        None
    }
}

/// Whole days in `age`, or None when it is under a day.
pub fn whole_days(age: Duration) -> Option<u64> {
    let days = age.as_secs() / 86_400;
    if days >= 1 {
        Some(days)
    } else {
        None
    }
}

/// "1 day ago" / "N days ago" for ages of a day or more.
pub fn days_ago_label(age: Duration) -> Option<String> {
    whole_days(age).map(|d| if d == 1 { "1 day ago".to_string() } else { format!("{} days ago", d) })
}

/// Allows one sync at a time without a lock file. The guard releases on drop,
/// including when the task holding it panics or is cancelled, so it can never
/// be left "held" the way a stale lock file can.
pub struct RunGuard<'a> {
    flag: &'a AtomicBool,
}

impl<'a> RunGuard<'a> {
    pub fn try_acquire(flag: &'a AtomicBool) -> Option<RunGuard<'a>> {
        flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| RunGuard { flag })
    }
}

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::Release);
    }
}

/// Append one line to the sync run log. When the log grows past `max_bytes`
/// the older half is dropped so it can't grow without bound but still keeps
/// weeks of history (unlike /tmp, it lives in ~/.config and survives reboots).
pub fn append_sync_log(path: &Path, line: &str, max_bytes: u64) {
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > max_bytes {
            if let Ok(content) = std::fs::read_to_string(path) {
                let keep_from = content.len() / 2;
                let cut = content[keep_from..].find('\n').map(|i| keep_from + i + 1).unwrap_or(keep_from);
                let _ = std::fs::write(path, &content[cut..]);
            }
        }
    }
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{}", line.replace('\n', " | "));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(secs: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000 + secs)
    }

    #[test]
    fn parses_intervals() {
        assert_eq!(parse_interval("30m"), Some(Duration::from_secs(1800)));
        assert_eq!(parse_interval(" 4h "), Some(Duration::from_secs(4 * 3600)));
        assert_eq!(parse_interval("manual"), None);
        assert_eq!(parse_interval(""), None);
        assert_eq!(parse_interval("0h"), None);
        assert_eq!(parse_interval("1d"), None);
    }

    #[test]
    fn due_with_no_previous_attempt() {
        assert!(is_due(t(0), None, Duration::from_secs(3600)));
    }

    #[test]
    fn not_due_before_interval_elapses() {
        assert!(!is_due(t(3599), Some(t(0)), Duration::from_secs(3600)));
        assert!(is_due(t(3600), Some(t(0)), Duration::from_secs(3600)));
    }

    #[test]
    fn due_after_long_sleep_by_wall_clock() {
        // A month asleep: the wall clock says overdue even though a monotonic
        // timer would have counted almost none of it.
        assert!(is_due(t(30 * 86_400), Some(t(0)), Duration::from_secs(3600)));
    }

    #[test]
    fn due_when_clock_moves_backwards() {
        assert!(is_due(t(0), Some(t(500)), Duration::from_secs(3600)));
    }

    #[test]
    fn detects_wake_from_gap() {
        assert_eq!(detect_wake(t(0), t(60), SUPERVISOR_TICK), None);
        assert_eq!(detect_wake(t(0), t(200), SUPERVISOR_TICK), None);
        assert_eq!(detect_wake(t(0), t(8 * 3600), SUPERVISOR_TICK), Some(Duration::from_secs(8 * 3600)));
        assert_eq!(detect_wake(t(100), t(0), SUPERVISOR_TICK), None);
    }

    #[test]
    fn day_labels() {
        assert_eq!(days_ago_label(Duration::from_secs(23 * 3600)), None);
        assert_eq!(days_ago_label(Duration::from_secs(25 * 3600)).as_deref(), Some("1 day ago"));
        assert_eq!(days_ago_label(Duration::from_secs(34 * 86_400)).as_deref(), Some("34 days ago"));
    }

    #[test]
    fn guard_allows_one_holder_and_releases_on_drop() {
        let flag = AtomicBool::new(false);
        let g = RunGuard::try_acquire(&flag).expect("first acquire");
        assert!(RunGuard::try_acquire(&flag).is_none());
        drop(g);
        assert!(RunGuard::try_acquire(&flag).is_some());
    }

    #[test]
    fn guard_releases_when_holder_panics() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let r = std::panic::catch_unwind(|| {
            let _g = RunGuard::try_acquire(&FLAG).unwrap();
            panic!("sync blew up");
        });
        assert!(r.is_err());
        assert!(RunGuard::try_acquire(&FLAG).is_some());
    }

    #[test]
    fn sync_log_appends_and_trims() {
        let dir = std::env::temp_dir().join(format!("pullread-synclog-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("sync.log");
        append_sync_log(&path, "first", 1024);
        append_sync_log(&path, "multi\nline", 1024);
        let content = std::fs::read_to_string(&path).unwrap();
        assert_eq!(content, "first\nmulti | line\n");

        for i in 0..200 {
            append_sync_log(&path, &format!("line {:03} padding padding padding", i), 1024);
        }
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.len() < 2048, "log should be trimmed, was {}", content.len());
        assert!(content.ends_with("line 199 padding padding padding\n"));
        assert!(content.lines().all(|l| l.starts_with("line ")), "trim should cut at a line boundary");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
