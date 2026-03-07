// ABOUTME: Email roundup module for sending daily digest emails
// ABOUTME: Uses lettre SMTP to deliver HTML roundups linking back to PullRead

use crate::sidecar::SidecarState;
use lettre::message::{header::ContentType, Mailbox};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Email configuration stored in settings.json under "emailRoundup"
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailConfig {
    pub enabled: bool,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_pass: String,
    pub use_tls: bool,
    pub from_address: String,
    pub to_address: String,
    /// Time of day to send, e.g. "08:00"
    pub send_time: String,
    /// How many days of articles to include (default 1)
    #[serde(default = "default_lookback")]
    pub lookback_days: u32,
}

fn default_lookback() -> u32 {
    1
}

impl Default for EmailConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            smtp_host: String::new(),
            smtp_port: 587,
            smtp_user: String::new(),
            smtp_pass: String::new(),
            use_tls: true,
            from_address: String::new(),
            to_address: String::new(),
            send_time: "08:00".to_string(),
            lookback_days: 1,
        }
    }
}

/// Article summary for the roundup email
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ArticleMeta {
    filename: String,
    title: String,
    url: String,
    domain: String,
    #[serde(default)]
    author: String,
    #[serde(default)]
    feed: String,
    #[serde(default)]
    bookmarked: String,
}

/// Load email config from settings.json
pub fn load_email_config(app: &AppHandle) -> EmailConfig {
    let state = app.state::<SidecarState>();
    let path = state
        .config_path()
        .parent()
        .unwrap_or(std::path::Path::new("/tmp"))
        .join("settings.json");

    std::fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
        .and_then(|v| {
            v.get("emailRoundup")
                .and_then(|e| serde_json::from_value(e.clone()).ok())
        })
        .unwrap_or_default()
}

/// Fetch recent articles from the viewer's /api/files endpoint
async fn fetch_recent_articles(
    port: u16,
    lookback_days: u32,
) -> Result<Vec<ArticleMeta>, String> {
    let url = format!("http://127.0.0.1:{}/api/files", port);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch articles: {}", e))?;
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read articles response: {}", e))?;
    let articles: Vec<ArticleMeta> =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse articles: {}", e))?;

    let cutoff = chrono::Utc::now() - chrono::Duration::days(lookback_days as i64);
    let cutoff_str = cutoff.to_rfc3339();

    let recent: Vec<ArticleMeta> = articles
        .into_iter()
        .filter(|a| {
            if a.bookmarked.is_empty() {
                return false;
            }
            a.bookmarked >= cutoff_str
        })
        .collect();

    Ok(recent)
}

/// Build the HTML email body
fn build_roundup_html(articles: &[ArticleMeta], lookback_days: u32) -> String {
    let today = chrono::Local::now().format("%B %-d, %Y").to_string();
    let period = if lookback_days == 1 {
        "today".to_string()
    } else {
        format!("the last {} days", lookback_days)
    };

    let mut html = format!(
        r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5">
<div style="max-width:600px;margin:0 auto;padding:20px">
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e0e0e0">
<h1 style="margin:0 0 4px;font-size:22px;color:#1a1a1a">Pull Read Roundup</h1>
<p style="margin:0 0 24px;font-size:14px;color:#888">{} &middot; {} article{} from {}</p>
"#,
        today,
        articles.len(),
        if articles.len() == 1 { "" } else { "s" },
        period
    );

    if articles.is_empty() {
        html.push_str(
            r#"<p style="color:#666;font-size:15px">No new articles synced. Check back later!</p>"#,
        );
    } else {
        for article in articles {
            let domain_display = if article.domain.is_empty() {
                &article.feed
            } else {
                &article.domain
            };
            let author_line = if article.author.is_empty() {
                String::new()
            } else {
                format!(
                    r#" <span style="color:#888">&middot; {}</span>"#,
                    html_escape(&article.author)
                )
            };

            // Use pullread.com/link redirect page — email clients block custom URL schemes
            let pr_link = format!(
                "https://pullread.com/link?url={}&title={}",
                urlencoding::encode(&article.url),
                urlencoding::encode(&article.title)
            );

            html.push_str(&format!(
                r#"<div style="padding:12px 0;border-bottom:1px solid #f0f0f0">
<a href="{}" style="font-size:15px;color:#1a1a1a;text-decoration:none;font-weight:500">{}</a>
<div style="font-size:12px;margin-top:4px">
<a href="{}" style="color:#888;text-decoration:none">{}</a>{}
<span style="float:right"><a href="{}" style="color:#0066cc;text-decoration:none;font-size:11px">Read in PullRead &rarr;</a></span>
</div>
</div>
"#,
                html_escape(&article.url),
                html_escape(&article.title),
                html_escape(&article.url),
                html_escape(domain_display),
                author_line,
                html_escape(&pr_link),
            ));
        }
    }

    html.push_str(
        r#"</div>
<p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px">
Sent by <a href="https://pullread.com" style="color:#aaa">Pull Read</a> &middot;
Open Pull Read and go to Settings to manage your email roundup
</p>
</div>
</body>
</html>"#,
    );

    html
}

/// HTML-escape a string for safe embedding
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Send the roundup email via SMTP
pub async fn send_roundup(app: &AppHandle) -> Result<String, String> {
    let config = load_email_config(app);
    if !config.enabled {
        return Err("Email roundup is not enabled".to_string());
    }
    if config.smtp_host.is_empty() || config.to_address.is_empty() {
        return Err("Email not configured: missing SMTP host or recipient".to_string());
    }

    // Ensure viewer is running so we can fetch articles
    let port = crate::sidecar::ensure_viewer_running(app).await?;

    let articles = fetch_recent_articles(port, config.lookback_days).await?;
    let html = build_roundup_html(&articles, config.lookback_days);
    let count = articles.len();

    let from: Mailbox = config
        .from_address
        .parse()
        .map_err(|e| format!("Invalid from address: {}", e))?;
    let to: Mailbox = config
        .to_address
        .parse()
        .map_err(|e| format!("Invalid to address: {}", e))?;

    let today = chrono::Local::now().format("%B %-d").to_string();
    let subject = format!("Pull Read Roundup — {}", today);

    let email = Message::builder()
        .from(from)
        .to(to)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(html)
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let creds = Credentials::new(config.smtp_user.clone(), config.smtp_pass.clone());

    let mailer = if config.use_tls {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
            .map_err(|e| format!("SMTP connection failed: {}", e))?
            .port(config.smtp_port)
            .credentials(creds)
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
            .map_err(|e| format!("SMTP STARTTLS connection failed: {}", e))?
            .port(config.smtp_port)
            .credentials(creds)
            .build()
    };

    mailer
        .send(email)
        .await
        .map_err(|e| format!("Failed to send email: {}", e))?;

    Ok(format!(
        "Roundup sent with {} article{}",
        count,
        if count == 1 { "" } else { "s" }
    ))
}

/// Send a test email to verify SMTP configuration
pub async fn send_test_email(app: &AppHandle) -> Result<String, String> {
    let config = load_email_config(app);
    if config.smtp_host.is_empty() || config.to_address.is_empty() {
        return Err("Email not configured: missing SMTP host or recipient".to_string());
    }

    let from: Mailbox = config
        .from_address
        .parse()
        .map_err(|e| format!("Invalid from address: {}", e))?;
    let to: Mailbox = config
        .to_address
        .parse()
        .map_err(|e| format!("Invalid to address: {}", e))?;

    let email = Message::builder()
        .from(from)
        .to(to)
        .subject("Pull Read — Test Email")
        .header(ContentType::TEXT_HTML)
        .body(
            r#"<html><body style="font-family:sans-serif;padding:20px">
<h2>Pull Read Email Test</h2>
<p>Your email roundup is configured correctly! You'll receive daily roundups at your scheduled time.</p>
</body></html>"#
                .to_string(),
        )
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let creds = Credentials::new(config.smtp_user.clone(), config.smtp_pass.clone());

    let mailer = if config.use_tls {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
            .map_err(|e| format!("SMTP connection failed: {}", e))?
            .port(config.smtp_port)
            .credentials(creds)
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
            .map_err(|e| format!("SMTP STARTTLS connection failed: {}", e))?
            .port(config.smtp_port)
            .credentials(creds)
            .build()
    };

    mailer
        .send(email)
        .await
        .map_err(|e| format!("Failed to send test email: {}", e))?;

    Ok("Test email sent successfully".to_string())
}

/// Tauri command: send a test email
#[tauri::command]
pub async fn cmd_send_test_email(app: AppHandle) -> Result<String, String> {
    send_test_email(&app).await
}

/// Tauri command: trigger a roundup email manually
#[tauri::command]
pub async fn cmd_send_roundup(app: AppHandle) -> Result<String, String> {
    send_roundup(&app).await
}
