// ABOUTME: AppDelegate for PullRead menu bar app
// ABOUTME: Creates status bar item with sync controls and status display

import Cocoa
import SwiftUI
import UserNotifications
// Sparkle import - uncomment when Sparkle SPM package is added:
// import Sparkle

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var syncService: SyncService!
    private var lastSyncMenuItem: NSMenuItem!
    private var syncMenuItem: NSMenuItem!
    private var statusMenuItem: NSMenuItem!
    private var checkForUpdatesMenuItem: NSMenuItem!
    private var settingsWindowController: SettingsWindowController!
    private var whatsNewWindowController: SettingsWindowController?

    // Sparkle updater - uncomment when Sparkle SPM package is added:
    // private let updaterController = SPUStandardUpdaterController(
    //     startingUpdater: true,
    //     updaterDelegate: nil,
    //     userDriverDelegate: nil
    // )

    /// Returns true if running in a unit test environment
    /// Uses multiple detection methods for reliability across different test runners
    private var isRunningTests: Bool {
        // 1. Explicit CI test flag (most reliable - we control this)
        if ProcessInfo.processInfo.environment["RUNNING_XCTEST"] == "1" {
            return true
        }

        // 2. Check for XCTest launch arguments (xcodebuild passes these to test host)
        let args = ProcessInfo.processInfo.arguments
        if args.contains(where: { $0.contains("XCTest") || $0.contains("xctest") }) {
            return true
        }

        // 3. Check if XCTest framework is loaded
        if NSClassFromString("XCTestCase") != nil {
            return true
        }

        // 4. Check xcodebuild's test configuration env var
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil {
            return true
        }

        // 5. Check for test bundle path env var
        if ProcessInfo.processInfo.environment["XCTestBundlePath"] != nil {
            return true
        }

        return false
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        syncService = SyncService()
        settingsWindowController = SettingsWindowController()

        // Skip ALL UI setup during tests - UI operations block/hang in headless CI
        guard !isRunningTests else { return }

        setupStatusBar()
        requestNotificationPermission()

        // Check for bundled binary on launch
        if !syncService.isBinaryAvailable() {
            showBinaryNotFoundAlert()
        }

        // Check for first run or invalid config
        checkFirstRunOrInvalidConfig()

        // Check if we should show "What's New" after an update
        checkForVersionUpdate()
    }

    private func checkFirstRunOrInvalidConfig() {
        // Small delay to let the app fully initialize
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self else { return }

            if self.syncService.isFirstRun() {
                // First run - show welcome/setup
                self.showSettings(isFirstRun: true)
            } else if !self.syncService.isConfigValid() {
                // Config exists but is invalid
                self.showAlert(
                    title: "Configuration Required",
                    message: "Your feeds.json configuration appears to be incomplete. Please configure your settings."
                )
                self.showSettings(isFirstRun: false)
            }
        }
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error = error {
                print("Notification permission error: \(error.localizedDescription)")
            }
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

        // View Articles
        let viewArticlesMenuItem = NSMenuItem(title: "View Articles...", action: #selector(viewArticles), keyEquivalent: "d")
        viewArticlesMenuItem.target = self
        menu.addItem(viewArticlesMenuItem)

        // Settings
        let openConfigMenuItem = NSMenuItem(title: "Settings...", action: #selector(openConfig), keyEquivalent: ",")
        openConfigMenuItem.target = self
        menu.addItem(openConfigMenuItem)

        // View Logs
        let logsMenuItem = NSMenuItem(title: "View Logs...", action: #selector(viewLogs), keyEquivalent: "l")
        logsMenuItem.target = self
        menu.addItem(logsMenuItem)

        // Check for Updates (Sparkle)
        checkForUpdatesMenuItem = NSMenuItem(title: "Check for Updates...", action: #selector(checkForUpdates), keyEquivalent: "")
        checkForUpdatesMenuItem.target = self
        menu.addItem(checkForUpdatesMenuItem)

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
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil  // Deliver immediately
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Notification error: \(error.localizedDescription)")
            }
        }
    }

    @objc private func openOutputFolder() {
        if let outputPath = syncService.getOutputPath() {
            let url = URL(fileURLWithPath: outputPath)
            NSWorkspace.shared.open(url)
        } else {
            showAlert(title: "Output Folder Not Found", message: "Could not determine output folder. Check feeds.json configuration.")
        }
    }

    @objc private func viewArticles() {
        syncService.openViewer { [weak self] result in
            DispatchQueue.main.async {
                if case .failure(let error) = result {
                    self?.showAlert(title: "Viewer Error", message: error.localizedDescription)
                }
            }
        }
    }

    @objc private func openConfig() {
        showSettings(isFirstRun: false)
    }

    private func showSettings(isFirstRun: Bool) {
        settingsWindowController.showSettings(
            configPath: syncService.getConfigPath(),
            isFirstRun: isFirstRun,
            onFirstRunComplete: isFirstRun ? { [weak self] in
                // Trigger first sync automatically after setup
                self?.showNotification(
                    title: "Welcome to PullRead!",
                    body: "Your first sync is running. Articles will appear in your output folder shortly."
                )
                self?.runSync(retryFailed: false)
            } : nil
        ) { [weak self] in
            // Callback after save - could trigger a sync or update UI
            self?.showNotification(title: "Settings Saved", body: "Your configuration has been updated.")
        }
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

    @objc private func checkForUpdates() {
        // When Sparkle SPM package is added, uncomment:
        // updaterController.checkForUpdates(nil)
        // And remove the placeholder below.

        // Placeholder until Sparkle is fully integrated:
        // 1. Add Sparkle 2.x via SPM: https://github.com/sparkle-project/Sparkle
        // 2. Run generate_keys to create Ed25519 keypair
        // 3. Add SUPublicEDKey to Info.plist
        // 4. Uncomment `import Sparkle` and `updaterController` above
        showAlert(
            title: "Check for Updates",
            message: "Automatic updates via Sparkle are configured but not yet active.\n\nTo complete setup:\n1. Add Sparkle 2.x as an SPM dependency\n2. Generate Ed25519 signing keys\n3. Uncomment the Sparkle code in AppDelegate\n\nVisit the project README for details."
        )
    }

    private func checkForVersionUpdate() {
        let currentVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let lastSeenVersion = UserDefaults.standard.string(forKey: "lastSeenVersion")

        if lastSeenVersion == nil {
            // First install - store version silently, don't show What's New
            UserDefaults.standard.set(currentVersion, forKey: "lastSeenVersion")
        } else if lastSeenVersion != currentVersion {
            // Updated - show What's New
            UserDefaults.standard.set(currentVersion, forKey: "lastSeenVersion")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.showWhatsNew(version: currentVersion)
            }
        }
    }

    private func showWhatsNew(version: String) {
        let controller = SettingsWindowController()
        self.whatsNewWindowController = controller
        controller.showWhatsNew(version: version)
    }

    @objc private func showAbout() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        let alert = NSAlert()
        alert.messageText = "PullRead"
        alert.informativeText = "RSS to Markdown Sync\n\nVersion \(version) (\(build))\n\nSyncs RSS and Atom feeds to markdown files for offline reading.\n\nBy A Little Drive\nhttps://alittledrive.com"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func quit() {
        syncService.stopViewer()
        NSApplication.shared.terminate(nil)
    }

    private func showBinaryNotFoundAlert() {
        showAlert(
            title: "Sync Binary Not Found",
            message: "The PullRead sync binary is missing from the app bundle. Please reinstall the app."
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
