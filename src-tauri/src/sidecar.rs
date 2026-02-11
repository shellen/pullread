// ABOUTME: Sidecar lifecycle management for the bundled Bun CLI binary
// ABOUTME: Handles spawning sync, view, review, and autotag commands

use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

pub struct SidecarState {
    viewer_child: Mutex<Option<CommandChild>>,
    viewer_port: Mutex<u16>,
    config_dir: PathBuf,
}

impl SidecarState {
    pub fn new() -> Self {
        let config_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".config")
            .join("pullread");

        Self {
            viewer_child: Mutex::new(None),
            viewer_port: Mutex::new(0),
            config_dir,
        }
    }

    pub fn config_path(&self) -> PathBuf {
        self.config_dir.join("feeds.json")
    }

    pub fn db_path(&self) -> PathBuf {
        self.config_dir.join("pullread.db")
    }

    pub fn is_first_run(&self) -> bool {
        !self.config_path().exists()
    }

    pub fn is_config_valid(&self) -> bool {
        let path = self.config_path();
        if !path.exists() {
            return false;
        }
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                let config: Result<Value, _> = serde_json::from_str(&content);
                match config {
                    Ok(v) => {
                        let has_output = v
                            .get("outputPath")
                            .and_then(|p| p.as_str())
                            .map(|s| !s.is_empty())
                            .unwrap_or(false);
                        let has_feeds = v
                            .get("feeds")
                            .and_then(|f| f.as_object())
                            .map(|o| !o.is_empty())
                            .unwrap_or(false);
                        has_output && has_feeds
                    }
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    }

    pub fn get_output_path(&self) -> Option<String> {
        let content = std::fs::read_to_string(self.config_path()).ok()?;
        let config: Value = serde_json::from_str(&content).ok()?;
        let path = config.get("outputPath")?.as_str()?.to_string();
        let expanded = if path.starts_with('~') {
            let home = dirs::home_dir().unwrap_or_default();
            path.replacen('~', &home.to_string_lossy(), 1)
        } else {
            path
        };
        Some(expanded)
    }

    pub fn is_autotag_enabled(&self) -> bool {
        let path = self.config_dir.join("settings.json");
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str::<Value>(&content) {
                return v
                    .get("autotagAfterSync")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
            }
        }
        false
    }

    /// Get the viewer port, starting the server if needed
    pub fn get_viewer_port(&self) -> u16 {
        *self.viewer_port.lock().unwrap()
    }

    /// Set the viewer child process
    pub fn set_viewer(&self, child: CommandChild, port: u16) {
        *self.viewer_child.lock().unwrap() = Some(child);
        *self.viewer_port.lock().unwrap() = port;
    }

    /// Check if viewer is running
    pub fn is_viewer_running(&self) -> bool {
        self.viewer_child.lock().unwrap().is_some()
    }

    /// Stop all sidecar processes
    pub fn stop_all(&self) {
        if let Some(child) = self.viewer_child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }

    /// Get sync interval from config
    pub fn get_sync_interval(&self) -> String {
        let content = std::fs::read_to_string(self.config_path()).unwrap_or_default();
        let config: Value = serde_json::from_str(&content).unwrap_or_default();
        config
            .get("syncInterval")
            .and_then(|v| v.as_str())
            .unwrap_or("1h")
            .to_string()
    }

    /// Get review schedule from settings
    pub fn get_review_schedule(&self) -> String {
        let path = self.config_dir.join("settings.json");
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let config: Value = serde_json::from_str(&content).unwrap_or_default();
        config
            .get("reviewSchedule")
            .and_then(|v| v.as_str())
            .unwrap_or("off")
            .to_string()
    }

    /// Get environment for sidecar processes
    fn process_env(&self, app: &AppHandle) -> Vec<(String, String)> {
        let mut env = Vec::new();

        // Point to bundled resources for Kokoro TTS model
        if let Ok(resource_dir) = app.path().resource_dir() {
            let kokoro_dir = resource_dir.join("kokoro-model");
            if kokoro_dir.exists() {
                env.push((
                    "PULLREAD_KOKORO_MODEL_DIR".to_string(),
                    kokoro_dir.to_string_lossy().to_string(),
                ));
            }
            let kokoro_js = resource_dir.join("kokoro.web.js");
            if kokoro_js.exists() {
                env.push((
                    "PULLREAD_KOKORO_JS_PATH".to_string(),
                    kokoro_js.to_string_lossy().to_string(),
                ));
            }
            let ort_dir = resource_dir.join("ort-wasm");
            if ort_dir.join("ort.mjs").exists() {
                env.push((
                    "PULLREAD_ORT_WASM_DIR".to_string(),
                    ort_dir.to_string_lossy().to_string(),
                ));
            }

            // DYLD_LIBRARY_PATH for ONNX Runtime native lib
            env.push((
                "DYLD_LIBRARY_PATH".to_string(),
                resource_dir.to_string_lossy().to_string(),
            ));
        }

        env
    }

    // build_command helper removed — each operation builds its own command
    // to handle unique argument patterns and output handling
}

/// Path to the log file
pub fn log_path() -> String {
    "/tmp/pullread.log".to_string()
}

/// Append a line to the log file
fn append_log(message: &str) {
    use std::io::Write;
    let timestamp = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path())
    {
        let _ = writeln!(f, "[{}] {}", timestamp, message);
    }
}

/// Run a sync operation (short-lived process)
pub async fn run_sync(app: &AppHandle, retry_failed: bool) -> Result<String, String> {
    let state = app.state::<SidecarState>();
    let config_path = state.config_path().to_string_lossy().to_string();
    let db_path = state.db_path().to_string_lossy().to_string();

    let mut args = vec![
        "sync",
        "--config-path",
        &config_path,
        "--data-path",
        &db_path,
    ];
    if retry_failed {
        args.push("--retry-failed");
    }

    let cmd = app
        .shell()
        .sidecar("pullread-cli")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?;

    // Add environment
    let env_vars = state.process_env(app);
    let mut cmd = cmd.args(&args);
    for (key, value) in &env_vars {
        cmd = cmd.env(key, value);
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Sync failed to run: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Log everything
    if !stdout.is_empty() {
        append_log(&format!("[sync stdout] {}", stdout.trim()));
    }
    if !stderr.is_empty() {
        append_log(&format!("[sync stderr] {}", stderr.trim()));
    }

    if output.status.success() {
        // Extract the "Done: X saved, Y failed" summary line
        let summary = stdout
            .lines()
            .rev()
            .find(|line| line.starts_with("Done:"))
            .unwrap_or("Sync complete")
            .to_string();
        Ok(summary)
    } else {
        let error = if !stderr.is_empty() {
            stderr.trim().to_string()
        } else {
            format!(
                "Sync failed with exit code {}",
                output.status.code().unwrap_or(-1)
            )
        };
        Err(error)
    }
}

/// Start the viewer HTTP server (long-running process)
pub async fn ensure_viewer_running(app: &AppHandle) -> Result<u16, String> {
    let state = app.state::<SidecarState>();

    // If viewer is already running, return existing port
    if state.is_viewer_running() {
        let port = state.get_viewer_port();
        if port > 0 {
            return Ok(port);
        }
    }

    let port = portpicker::pick_unused_port().unwrap_or(7777);
    let config_path = state.config_path().to_string_lossy().to_string();
    let port_str = port.to_string();

    let args = vec!["view", "--config-path", &config_path, "--port", &port_str];

    let mut cmd = app
        .shell()
        .sidecar("pullread-cli")
        .map_err(|e| format!("Failed to create viewer sidecar: {}", e))?;

    // Add environment
    let env_vars = state.process_env(app);
    cmd = cmd.args(&args);
    for (key, value) in &env_vars {
        cmd = cmd.env(key, value);
    }

    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn viewer: {}", e))?;

    state.set_viewer(child, port);

    // Monitor stdout/stderr in background for logging
    let log_port = port;
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    append_log(&format!("[viewer:{}] {}", log_port, text.trim()));
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    append_log(&format!("[viewer:{}] {}", log_port, text.trim()));
                }
                CommandEvent::Terminated(status) => {
                    append_log(&format!("[viewer:{}] terminated: {:?}", log_port, status));
                    break;
                }
                _ => {}
            }
        }
    });

    // Wait for the server to be ready
    let url = format!("http://127.0.0.1:{}", port);
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(10);

    while start.elapsed() < timeout {
        if let Ok(resp) = reqwest::get(&url).await {
            if resp.status().is_success() {
                log::info!("Viewer server ready on port {}", port);
                return Ok(port);
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    // Even if health check times out, the server might still be starting
    log::warn!(
        "Viewer health check timed out, proceeding with port {}",
        port
    );
    Ok(port)
}

/// Run the review command
pub async fn run_review(app: &AppHandle, days: u32) -> Result<String, String> {
    let state = app.state::<SidecarState>();
    let config_path = state.config_path().to_string_lossy().to_string();
    let db_path = state.db_path().to_string_lossy().to_string();
    let days_str = days.to_string();

    let mut cmd = app
        .shell()
        .sidecar("pullread-cli")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?;

    let args = vec![
        "review",
        "--days",
        &days_str,
        "--config-path",
        &config_path,
        "--data-path",
        &db_path,
    ];

    let env_vars = state.process_env(app);
    cmd = cmd.args(&args);
    for (key, value) in &env_vars {
        cmd = cmd.env(key, value);
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Review failed to run: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stdout.is_empty() {
        append_log(&format!("[review stdout] {}", stdout.trim()));
    }
    if !stderr.is_empty() {
        append_log(&format!("[review stderr] {}", stderr.trim()));
    }

    if output.status.success() {
        let summary = stdout
            .lines()
            .find(|l| l.starts_with("Review saved:"))
            .unwrap_or("Review generated")
            .to_string();
        Ok(summary)
    } else {
        let err_msg = stderr.trim().to_string();
        Err(if err_msg.is_empty() {
            "Review failed".to_string()
        } else {
            err_msg
        })
    }
}

/// Run autotag in background
pub async fn run_autotag(app: &AppHandle) -> Result<String, String> {
    let state = app.state::<SidecarState>();
    let config_path = state.config_path().to_string_lossy().to_string();
    let db_path = state.db_path().to_string_lossy().to_string();

    let mut cmd = app
        .shell()
        .sidecar("pullread-cli")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?;

    let args = vec![
        "autotag",
        "--batch",
        "--config-path",
        &config_path,
        "--data-path",
        &db_path,
    ];

    let env_vars = state.process_env(app);
    cmd = cmd.args(&args);
    for (key, value) in &env_vars {
        cmd = cmd.env(key, value);
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Autotag failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    append_log(&format!("[autotag] {}", stdout.trim()));

    Ok(stdout)
}
