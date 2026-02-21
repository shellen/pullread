// ABOUTME: Site login authentication via Tauri webview
// ABOUTME: Opens login windows, captures cookies, stores in macOS Keychain

use std::process::Command;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::sidecar::SidecarState;

const KEYCHAIN_SERVICE: &str = "PullRead";

/// Open a webview window for the user to log into a site.
#[tauri::command]
pub async fn open_site_login(app: AppHandle, domain: String) -> Result<(), String> {
    // Validate domain
    if !domain.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-') {
        return Err(format!("Invalid domain: {}", domain));
    }

    let window_label = format!("login-{}", domain.replace('.', "-"));
    let url = format!("https://{}", domain);

    let state = app.state::<SidecarState>();
    let port = state.get_viewer_port();

    // Close existing login window for this domain if any
    if let Some(existing) = app.get_webview_window(&window_label) {
        let _ = existing.close();
    }

    // Save cookies via direct navigation to the viewer server.
    // CSP connect-src blocks fetch(), form-action blocks form.submit(),
    // but window.location.href navigation is unrestricted by CSP.
    let js = format!(r#"
(function() {{
    function addSaveButton() {{
        if (document.getElementById('pr-login-done')) return;
        var btn = document.createElement('button');
        btn.id = 'pr-login-done';
        btn.textContent = 'Done \u2014 Save Login';
        btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;padding:12px 24px;background:#1d9bf0;color:#fff;border:none;border-radius:24px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif';
        btn.onmouseover = function() {{ btn.style.background = '#1a8cd8'; }};
        btn.onmouseout = function() {{ btn.style.background = '#1d9bf0'; }};
        btn.onclick = function() {{
            btn.textContent = 'Saving\u2026';
            btn.disabled = true;
            var cookies = document.cookie.split(';').map(function(c) {{
                var parts = c.trim().split('=');
                return {{ name: parts[0], value: parts.slice(1).join('='), domain: '.{domain}', path: '/', expires: 0, secure: location.protocol === 'https:', httpOnly: false }};
            }}).filter(function(c) {{ return c.name && c.value; }});
            window.name = JSON.stringify(cookies);
            window.location.href = 'http://localhost:{port}/api/site-login-callback?domain={domain}';
        }};
        document.body.appendChild(btn);
    }}
    if (document.body) {{
        addSaveButton();
    }} else {{
        document.addEventListener('DOMContentLoaded', addSaveButton);
    }}
}})();
"#, domain = domain, port = port);

    let _window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {}", e))?),
    )
    .title(format!("Log in to {}", domain))
    .inner_size(900.0, 700.0)
    .min_inner_size(400.0, 300.0)
    .initialization_script(&js)
    .build()
    .map_err(|e| format!("Failed to create login window: {}", e))?;

    Ok(())
}

/// List all domains with saved site login cookies in Keychain.
#[tauri::command]
pub fn list_site_logins() -> Vec<String> {
    let output = Command::new("security")
        .args(["dump-keychain"])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut domains = Vec::new();
            let mut in_pullread = false;
            for line in stdout.lines() {
                // New entry boundary
                if line.starts_with("keychain:") || line.contains("\"keyc\"") {
                    in_pullread = false;
                }
                if line.contains(&format!("\"svce\"<blob>=\"{}\"", KEYCHAIN_SERVICE)) {
                    in_pullread = true;
                }
                if in_pullread {
                    if let Some(start) = line.find("\"acct\"<blob>=\"") {
                        let rest = &line[start + 14..];
                        if let Some(end) = rest.find('"') {
                            domains.push(rest[..end].to_string());
                        }
                        in_pullread = false;
                    }
                }
            }
            domains.sort();
            domains.dedup();
            domains
        }
        Err(_) => Vec::new(),
    }
}

/// Remove site login cookies for a domain from Keychain.
#[tauri::command]
pub fn remove_site_login(domain: String) -> bool {
    Command::new("security")
        .args([
            "delete-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", &domain,
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Save cookies to Keychain (called from JS after reading webview cookies).
#[tauri::command]
pub fn save_site_cookies(domain: String, cookies_json: String) -> Result<(), String> {
    // Validate domain
    if !domain.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-') {
        return Err(format!("Invalid domain: {}", domain));
    }

    let status = Command::new("security")
        .args([
            "add-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", &domain,
            "-w", &cookies_json,
            "-U",
        ])
        .output()
        .map_err(|e| format!("Keychain write failed: {}", e))?;

    if status.status.success() {
        Ok(())
    } else {
        Err("Keychain write failed".to_string())
    }
}
