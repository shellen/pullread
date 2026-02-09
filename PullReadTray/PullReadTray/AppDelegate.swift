// ABOUTME: AppDelegate for PullRead menu bar app
// ABOUTME: Creates status bar item with sync controls and status display

import Cocoa
import SwiftUI
import UserNotifications
import Sparkle

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var syncService: SyncService!
    private var lastSyncMenuItem: NSMenuItem!
    private var nextSyncMenuItem: NSMenuItem!
    private var syncMenuItem: NSMenuItem!
    private var statusMenuItem: NSMenuItem!
    private var checkForUpdatesMenuItem: NSMenuItem!
    private var settingsWindowController: SettingsWindowController!
    private var whatsNewWindowController: SettingsWindowController?
    private var articleViewerController: ArticleViewerWindowController?
    private var reviewTimer: Timer?
    private var syncTimer: Timer?
    private var hasUnreadReview: Bool = false

    private var updaterController: SPUStandardUpdaterController?

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

        // Initialize Sparkle after the app has fully launched
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )

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

        // Set up scheduled review timer and auto-sync timer
        scheduleReviewTimerIfNeeded()
        scheduleSyncTimerIfNeeded()

        // Sync on launch if config is valid and auto-sync is enabled (or first reopen)
        if !syncService.isFirstRun() && syncService.isConfigValid() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                self?.runSync(retryFailed: false)
            }
        }
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
            button.toolTip = "PullRead - Bookmark Reader & Markdown Library"
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

        // Next sync time
        nextSyncMenuItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        nextSyncMenuItem.isEnabled = false
        nextSyncMenuItem.isHidden = true
        menu.addItem(nextSyncMenuItem)

        menu.addItem(NSMenuItem.separator())

        // Sync Now
        syncMenuItem = NSMenuItem(title: "Sync Now", action: #selector(syncNow), keyEquivalent: "s")
        syncMenuItem.target = self
        menu.addItem(syncMenuItem)

        // Retry Failed
        let retryMenuItem = NSMenuItem(title: "Retry Failed", action: #selector(retryFailed), keyEquivalent: "r")
        retryMenuItem.target = self
        menu.addItem(retryMenuItem)

        // Generate Review Now
        let reviewMenuItem = NSMenuItem(title: "Generate Review Now", action: #selector(generateReviewNow), keyEquivalent: "")
        reviewMenuItem.target = self
        menu.addItem(reviewMenuItem)

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

        // Welcome Guide
        let welcomeMenuItem = NSMenuItem(title: "Welcome Guide...", action: #selector(showWelcomeGuide), keyEquivalent: "")
        welcomeMenuItem.target = self
        menu.addItem(welcomeMenuItem)

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

    @objc private func generateReviewNow() {
        statusMenuItem.title = "Status: Generating review..."
        syncService.runReview(days: 7) { [weak self] result in
            DispatchQueue.main.async {
                self?.statusMenuItem.title = "Status: Idle"
                switch result {
                case .success:
                    self?.hasUnreadReview = true
                    self?.updateBadge()
                    self?.showNotification(title: "Review Ready", body: "Your weekly review has been generated.")
                case .failure(let error):
                    self?.showNotification(title: "Review Failed", body: error.localizedDescription)
                }
            }
        }
    }

    // MARK: - Scheduled Reviews

    /// Review schedule options stored in UserDefaults
    /// "off" = disabled, "daily" = once per day, "weekly" = once per week
    func scheduleReviewTimerIfNeeded() {
        reviewTimer?.invalidate()
        reviewTimer = nil

        let schedule = UserDefaults.standard.string(forKey: "reviewSchedule") ?? "off"
        guard schedule != "off" else { return }

        let interval: TimeInterval
        switch schedule {
        case "daily":
            interval = 24 * 60 * 60 // 24 hours
        case "weekly":
            interval = 7 * 24 * 60 * 60 // 7 days
        default:
            return
        }

        // Check if enough time has passed since last review
        let lastReview = UserDefaults.standard.double(forKey: "lastReviewTimestamp")
        let elapsed = Date().timeIntervalSince1970 - lastReview
        let firstFire: TimeInterval
        if lastReview == 0 || elapsed >= interval {
            // Run soon (5 seconds after launch to let everything initialize)
            firstFire = 5
        } else {
            firstFire = interval - elapsed
        }

        reviewTimer = Timer.scheduledTimer(withTimeInterval: firstFire, repeats: false) { [weak self] _ in
            self?.runScheduledReview()
            // After the first fire, schedule recurring timer
            self?.reviewTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
                self?.runScheduledReview()
            }
        }
    }

    // MARK: - Auto-Sync

    func scheduleSyncTimerIfNeeded() {
        syncTimer?.invalidate()
        syncTimer = nil

        let interval = UserDefaults.standard.string(forKey: "syncInterval") ?? "1h"
        guard interval != "manual" else {
            nextSyncMenuItem?.isHidden = true
            return
        }

        let seconds: TimeInterval
        switch interval {
        case "30m": seconds = 30 * 60
        case "1h":  seconds = 60 * 60
        case "4h":  seconds = 4 * 60 * 60
        case "12h": seconds = 12 * 60 * 60
        default: return
        }

        syncTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: true) { [weak self] _ in
            self?.runSync(retryFailed: false)
            self?.updateNextSyncTime(interval: seconds)
        }

        updateNextSyncTime(interval: seconds)
    }

    private func updateNextSyncTime(interval: TimeInterval) {
        let nextFire = Date().addingTimeInterval(interval)
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        nextSyncMenuItem?.title = "Next sync: \(formatter.string(from: nextFire))"
        nextSyncMenuItem?.isHidden = false
    }

    private func runScheduledReview() {
        let days = UserDefaults.standard.string(forKey: "reviewSchedule") == "daily" ? 1 : 7
        syncService.runReview(days: days) { [weak self] result in
            DispatchQueue.main.async {
                if case .success = result {
                    UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "lastReviewTimestamp")
                    self?.hasUnreadReview = true
                    self?.updateBadge()
                    self?.showNotification(title: "Review Ready", body: "Your \(days == 1 ? "daily" : "weekly") review has been generated.")
                }
            }
        }
    }

    private func updateBadge() {
        guard let button = statusItem?.button else { return }
        if hasUnreadReview {
            // Show badge indicator — use a different SF Symbol
            if let image = NSImage(systemSymbolName: "doc.text.fill.viewfinder", accessibilityDescription: "PullRead — New Review") {
                image.isTemplate = true
                button.image = image
            } else {
                // Fallback: add a text badge
                button.title = "PR*"
            }
        } else {
            if let image = NSImage(systemSymbolName: "doc.text.fill", accessibilityDescription: "PullRead") {
                image.isTemplate = true
                button.image = image
            }
            button.title = ""
        }
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
                    // Run auto-tagging in the background if enabled
                    self?.runAutotagIfEnabled()
                case .failure(let error):
                    self?.showNotification(title: "Sync Failed", body: error.localizedDescription)
                }
            }
        }
    }

    private func runAutotagIfEnabled() {
        guard UserDefaults.standard.bool(forKey: "autotagAfterSync") else { return }

        syncService.runAutotag { [weak self] result in
            DispatchQueue.main.async {
                if case .failure(let error) = result {
                    // Log but don't notify — auto-tagging is a background task
                    print("Auto-tag failed: \(error.localizedDescription)")
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
        // Clear the badge when user opens the viewer
        hasUnreadReview = false
        updateBadge()

        syncService.ensureViewerRunning { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let url):
                    let mode = UserDefaults.standard.string(forKey: "viewerMode") ?? "window"
                    if mode == "browser" {
                        NSWorkspace.shared.open(url)
                    } else {
                        if self?.articleViewerController == nil {
                            self?.articleViewerController = ArticleViewerWindowController()
                        }
                        self?.articleViewerController?.showViewer(url: url)
                    }
                case .failure(let error):
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
            // Callback after save — update timers and notify
            self?.scheduleReviewTimerIfNeeded()
            self?.scheduleSyncTimerIfNeeded()
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
        updaterController?.checkForUpdates(nil)
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

    @objc private func showWelcomeGuide() {
        // Allow re-showing onboarding by temporarily clearing the flag
        let wasCompleted = UserDefaults.standard.bool(forKey: "onboardingCompleted")
        UserDefaults.standard.set(false, forKey: "onboardingCompleted")
        showSettings(isFirstRun: true)
        // Restore the flag after showing (onboarding Done button will re-set it)
        if wasCompleted {
            UserDefaults.standard.set(true, forKey: "onboardingCompleted")
        }
    }

    @objc private func showAbout() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        let alert = NSAlert()
        alert.messageText = "PullRead"
        alert.informativeText = "Bookmark Reader & Markdown Library\n\nVersion \(version) (\(build))\n\nSyncs your bookmarks and feeds into clean markdown files you can read, search, and keep.\n\nBy A Little Drive\nhttps://alittledrive.com"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func quit() {
        reviewTimer?.invalidate()
        syncTimer?.invalidate()
        articleViewerController?.close()
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
