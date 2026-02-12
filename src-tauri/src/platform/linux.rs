// ABOUTME: Linux platform services — stub implementation
// ABOUTME: Placeholder for keyring, hunspell, xdg-open

use super::{GrammarMatch, PlatformServices};

pub struct LinuxServices;

impl PlatformServices for LinuxServices {
    fn store_secret(&self, _service: &str, _account: &str, _password: &str) -> Result<(), String> {
        // TODO: Use secret-service or keyring crate for GNOME Keyring / KWallet
        Err("Linux credential storage not yet implemented".to_string())
    }

    fn load_secret(&self, _service: &str, _account: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    fn delete_secret(&self, _service: &str, _account: &str) -> Result<(), String> {
        Ok(())
    }

    fn check_grammar(&self, _text: &str) -> Result<Vec<GrammarMatch>, String> {
        // TODO: Use hunspell or LanguageTool API
        Ok(vec![])
    }

    fn reveal_in_file_manager(&self, path: &str) -> Result<(), String> {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
        Ok(())
    }

    fn platform_name(&self) -> &'static str {
        "linux"
    }
}
