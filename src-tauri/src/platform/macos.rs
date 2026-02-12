// ABOUTME: macOS platform services — Keychain, NSSpellChecker, Finder
// ABOUTME: Implements PlatformServices trait for macOS-specific features

use super::{GrammarMatch, PlatformServices};
use std::process::Command;

pub struct MacOSServices;

const KEYCHAIN_SERVICE: &str = "com.pullread.api-keys";

impl PlatformServices for MacOSServices {
    fn store_secret(&self, _service: &str, account: &str, password: &str) -> Result<(), String> {
        // Use macOS `security` CLI to store in Keychain
        // -U flag updates if entry already exists
        let output = Command::new("security")
            .args([
                "add-generic-password",
                "-a",
                account,
                "-s",
                KEYCHAIN_SERVICE,
                "-w",
                password,
                "-U",
            ])
            .output()
            .map_err(|e| format!("Failed to run security command: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Keychain store failed: {}", stderr.trim()))
        }
    }

    fn load_secret(&self, _service: &str, account: &str) -> Result<Option<String>, String> {
        let output = Command::new("security")
            .args([
                "find-generic-password",
                "-a",
                account,
                "-s",
                KEYCHAIN_SERVICE,
                "-w",
            ])
            .output()
            .map_err(|e| format!("Failed to run security command: {}", e))?;

        if output.status.success() {
            let password = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if password.is_empty() {
                Ok(None)
            } else {
                Ok(Some(password))
            }
        } else {
            // Exit code 44 = item not found, which is not an error
            let code = output.status.code().unwrap_or(-1);
            if code == 44 {
                Ok(None)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("Keychain load failed: {}", stderr.trim()))
            }
        }
    }

    fn delete_secret(&self, _service: &str, account: &str) -> Result<(), String> {
        let output = Command::new("security")
            .args([
                "delete-generic-password",
                "-a",
                account,
                "-s",
                KEYCHAIN_SERVICE,
            ])
            .output()
            .map_err(|e| format!("Failed to run security command: {}", e))?;

        if output.status.success() || output.status.code() == Some(44) {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Keychain delete failed: {}", stderr.trim()))
        }
    }

    fn check_grammar(&self, text: &str) -> Result<Vec<GrammarMatch>, String> {
        // Use NSSpellChecker via a Swift script, same approach as the Bun server
        let swift_code = r#"
import Foundation

let text = CommandLine.arguments[1]
let checker = NSSpellChecker.shared
let range = NSRange(location: 0, length: text.utf16.count)
let nsText = text as NSString
var results: [[String: Any]] = []
var offset = 0

while offset < text.utf16.count {
    let checkRange = NSRange(location: offset, length: text.utf16.count - offset)
    var wordCount: Int = 0
    let misspelled = checker.checkSpelling(of: text, startingAt: offset, language: nil, wrap: false, inSpellDocumentWithTag: 0, wordCount: &wordCount)
    if misspelled.location == NSNotFound { break }
    let word = nsText.substring(with: misspelled)
    let guesses = checker.guesses(forWordRange: misspelled, in: text, language: nil, inSpellDocumentWithTag: 0) ?? []
    results.append([
        "offset": misspelled.location,
        "length": misspelled.length,
        "message": "Possible spelling error: \(word)",
        "replacements": guesses.prefix(3).map { $0 },
        "rule": "spelling"
    ])
    offset = misspelled.location + misspelled.length
}

if let json = try? JSONSerialization.data(withJSONObject: results),
   let str = String(data: json, encoding: .utf8) {
    print(str)
} else {
    print("[]")
}
"#;

        // Write text to a temp file to avoid shell escaping issues
        let temp_path = std::env::temp_dir().join("pullread-grammar-input.txt");
        std::fs::write(&temp_path, text)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;

        let text_content =
            std::fs::read_to_string(&temp_path).map_err(|e| format!("Read error: {}", e))?;

        let output = Command::new("swift")
            .args(["-e", swift_code, &text_content])
            .output()
            .map_err(|e| format!("Failed to run Swift: {}", e))?;

        let _ = std::fs::remove_file(&temp_path);

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let matches: Vec<GrammarMatch> =
                serde_json::from_str(stdout.trim()).unwrap_or_default();
            Ok(matches)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Grammar check failed: {}", stderr.trim()))
        }
    }

    fn reveal_in_file_manager(&self, path: &str) -> Result<(), String> {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
        Ok(())
    }

    fn platform_name(&self) -> &'static str {
        "macos"
    }
}
