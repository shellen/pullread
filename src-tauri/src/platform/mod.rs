// ABOUTME: Platform abstraction layer for OS-specific features
// ABOUTME: Provides a trait with macOS, Windows, and Linux implementations
#![allow(dead_code)]

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

use serde::{Deserialize, Serialize};

/// A grammar/spell check match
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarMatch {
    pub offset: usize,
    pub length: usize,
    pub message: String,
    pub replacements: Vec<String>,
    pub rule: String,
}

/// Platform-specific services that vary by operating system
pub trait PlatformServices: Send + Sync {
    /// Store a secret (e.g. API key) in the OS credential store
    fn store_secret(&self, service: &str, account: &str, password: &str) -> Result<(), String>;

    /// Retrieve a secret from the OS credential store
    fn load_secret(&self, service: &str, account: &str) -> Result<Option<String>, String>;

    /// Delete a secret from the OS credential store
    fn delete_secret(&self, service: &str, account: &str) -> Result<(), String>;

    /// Check grammar/spelling using the OS spell checker
    fn check_grammar(&self, text: &str) -> Result<Vec<GrammarMatch>, String>;

    /// Reveal a path in the system file manager
    fn reveal_in_file_manager(&self, path: &str) -> Result<(), String>;

    /// Get the platform name
    fn platform_name(&self) -> &'static str;
}

/// Create the appropriate platform services for the current OS
pub fn create_platform_services() -> Box<dyn PlatformServices> {
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacOSServices)
    }
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsServices)
    }
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxServices)
    }
}
