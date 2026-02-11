// ABOUTME: Windows platform services — stub implementation
// ABOUTME: Placeholder for Windows Credential Manager, spell check, Explorer

use super::{GrammarMatch, PlatformServices};

pub struct WindowsServices;

impl PlatformServices for WindowsServices {
    fn store_secret(&self, _service: &str, _account: &str, _password: &str) -> Result<(), String> {
        // TODO: Use windows-credentials crate for DPAPI/Credential Manager
        Err("Windows credential storage not yet implemented".to_string())
    }

    fn load_secret(&self, _service: &str, _account: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    fn delete_secret(&self, _service: &str, _account: &str) -> Result<(), String> {
        Ok(())
    }

    fn check_grammar(&self, _text: &str) -> Result<Vec<GrammarMatch>, String> {
        // TODO: Use Windows Spell Checker API or fall back to LanguageTool
        Ok(vec![])
    }

    fn reveal_in_file_manager(&self, path: &str) -> Result<(), String> {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
        Ok(())
    }

    fn platform_name(&self) -> &'static str {
        "windows"
    }
}
