// ABOUTME: AppDelegate for PullRead menu bar app
// ABOUTME: Creates status bar item with sync controls and status display

import Cocoa
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var syncService: SyncService!
    private var lastSyncMenuItem: NSMenuItem!
    private var syncMenuItem: NSMenuItem!
    private var statusMenuItem: NSMenuItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        syncService = SyncService()
        setupStatusBar()

        // Check for Node.js on launch
        if !syncService.isNodeAvailable() {
            showNodeNotFoundAlert()
        }
    }

    private func setupStatusBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem.button {
            // Use SF Symbol for the icon (available on macOS 11+)
            if let image = NSImage(systemSymbolName: "doc.text.fill", accessibilityDescription: "PullRead") {
                image.isTemplate = true
                button.image = image
            } else {
                button.title = "PR"
            }
            button.toolTip = "PullRead - RSS to Markdown Sync"
        }

        let menu = NSMenu()

        // Status indicator
        statusMenuItem = NSMenuItem(title: "Status: Idle", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)

        // Last sync time
        lastSyncMenuItem = NSMenuItem(title: "Last sync: Never", action: nil, keyEquivalent: "")
        lastSyncMenuItem.isEnabled = false
        menu.addItem(lastSyncMenuItem)

        menu.addItem(NSMenuItem.separator())

        // Sync Now
        syncMenuItem = NSMenuItem(title: "Sync Now", action: #selector(syncNow), keyEquivalent: "s")
        syncMenuItem.target = self
        menu.addItem(syncMenuItem)

        // Retry Failed
        let retryMenuItem = NSMenuItem(title: "Retry Failed", action: #selector(retryFailed), keyEquivalent: "r")
        retryMenuItem.target = self
        menu.addItem(retryMenuItem)

        menu.addItem(NSMenuItem.separator())

        // Open Output Folder
        let openFolderMenuItem = NSMenuItem(title: "Open Output Folder...", action: #selector(openOutputFolder), keyEquivalent: "o")
        openFolderMenuItem.target = self
        menu.addItem(openFolderMenuItem)

        // Open feeds.json
        let openConfigMenuItem = NSMenuItem(title: "Edit Configuration...", action: #selector(openConfig), keyEquivalent: ",")
        openConfigMenuItem.target = self
        menu.addItem(openConfigMenuItem)

        // View Logs
        let logsMenuItem = NSMenuItem(title: "View Logs...", action: #selector(viewLogs), keyEquivalent: "l")
        logsMenuItem.target = self
        menu.addItem(logsMenuItem)

        menu.addItem(NSMenuItem.separator())

        // About
        let aboutMenuItem = NSMenuItem(title: "About PullRead", action: #selector(showAbout), keyEquivalent: "")
        aboutMenuItem.target = self
        menu.addItem(aboutMenuItem)

        // Quit
        let quitMenuItem = NSMenuItem(title: "Quit PullRead", action: #selector(quit), keyEquivalent: "q")
        quitMenuItem.target = self
        menu.addItem(quitMenuItem)

        statusItem.menu = menu
    }

    @objc private func syncNow() {
        runSync(retryFailed: false)
    }

    @objc private func retryFailed() {
        runSync(retryFailed: true)
    }

    private func runSync(retryFailed: Bool) {
        // Update UI to show syncing
        updateStatus(syncing: true)

        syncService.sync(retryFailed: retryFailed) { [weak self] result in
            DispatchQueue.main.async {
                self?.updateStatus(syncing: false)
                self?.updateLastSyncTime()

                switch result {
                case .success(let output):
                    self?.showNotification(title: "Sync Complete", body: self?.parseSyncSummary(output) ?? "Sync finished")
                case .failure(let error):
                    self?.showNotification(title: "Sync Failed", body: error.localizedDescription)
                }
            }
        }
    }

    private func updateStatus(syncing: Bool) {
        if syncing {
            statusMenuItem.title = "Status: Syncing..."
            syncMenuItem.isEnabled = false

            // Animate the icon
            if let button = statusItem.button {
                if let image = NSImage(systemSymbolName: "arrow.triangle.2.circlepath", accessibilityDescription: "Syncing") {
                    image.isTemplate = true
                    button.image = image
                }
            }
        } else {
            statusMenuItem.title = "Status: Idle"
            syncMenuItem.isEnabled = true

            // Restore icon
            if let button = statusItem.button {
                if let image = NSImage(systemSymbolName: "doc.text.fill", accessibilityDescription: "PullRead") {
                    image.isTemplate = true
                    button.image = image
                }
            }
        }
    }

    private func updateLastSyncTime() {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        lastSyncMenuItem.title = "Last sync: \(formatter.string(from: Date()))"
    }

    private func parseSyncSummary(_ output: String) -> String {
        // Parse "Done: X saved, Y failed" from output
        if let range = output.range(of: "Done:.*", options: .regularExpression) {
            return String(output[range])
        }
        return "Sync completed"
    }

    private func showNotification(title: String, body: String) {
        let notification = NSUserNotification()
        notification.title = title
        notification.informativeText = body
        notification.soundName = NSUserNotificationDefaultSoundName
        NSUserNotificationCenter.default.deliver(notification)
    }

    @objc private func openOutputFolder() {
        if let outputPath = syncService.getOutputPath() {
            let url = URL(fileURLWithPath: outputPath)
            NSWorkspace.shared.open(url)
        } else {
            showAlert(title: "Output Folder Not Found", message: "Could not determine output folder. Check feeds.json configuration.")
        }
    }

    @objc private func openConfig() {
        let configPath = syncService.getConfigPath()
        let url = URL(fileURLWithPath: configPath)
        NSWorkspace.shared.open(url)
    }

    @objc private func viewLogs() {
        let logPath = "/tmp/pullread.log"
        let url = URL(fileURLWithPath: logPath)

        if FileManager.default.fileExists(atPath: logPath) {
            NSWorkspace.shared.open(url)
        } else {
            showAlert(title: "No Logs Found", message: "Log file not found at \(logPath)")
        }
    }

    @objc private func showAbout() {
        let alert = NSAlert()
        alert.messageText = "PullRead"
        alert.informativeText = "RSS to Markdown Sync\n\nVersion 1.0.0\n\nSyncs RSS and Atom feeds to markdown files for offline reading."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func quit() {
        NSApplication.shared.terminate(nil)
    }

    private func showNodeNotFoundAlert() {
        showAlert(
            title: "Node.js Not Found",
            message: "PullRead requires Node.js to run. Please install Node.js from https://nodejs.org"
        )
    }

    private func showAlert(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}
