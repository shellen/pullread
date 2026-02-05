// ABOUTME: Window controller for PullRead settings
// ABOUTME: Manages displaying settings window as a proper macOS panel

import Cocoa
import SwiftUI

class SettingsWindowController {
    private var window: NSWindow?
    private var windowDelegate: WindowDelegate?
    private var isPresented: Bool = true

    func showSettings(configPath: String, isFirstRun: Bool = false, onFirstRunComplete: (() -> Void)? = nil, onSave: (() -> Void)? = nil) {
        // If window exists and is visible, just bring it to front
        if let existingWindow = window, existingWindow.isVisible {
            existingWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        isPresented = true

        // Route to OnboardingView for first run when onboarding hasn't been completed
        let useOnboarding = isFirstRun && !UserDefaults.standard.bool(forKey: "onboardingCompleted")

        let hostingController: NSHostingController<AnyView>
        let windowSize: NSRect

        if useOnboarding {
            let onboardingView = OnboardingView(
                isPresented: Binding(
                    get: { self.isPresented },
                    set: { newValue in
                        self.isPresented = newValue
                        if !newValue {
                            self.closeWindow()
                        }
                    }
                ),
                configPath: configPath,
                onComplete: {
                    onFirstRunComplete?()
                    onSave?()
                    self.closeWindow()
                }
            )
            hostingController = NSHostingController(rootView: AnyView(onboardingView))
            windowSize = NSRect(x: 0, y: 0, width: 520, height: 540)
        } else {
            let settingsView = SettingsView(
                isPresented: Binding(
                    get: { self.isPresented },
                    set: { newValue in
                        self.isPresented = newValue
                        if !newValue {
                            self.closeWindow()
                        }
                    }
                ),
                configPath: configPath,
                onSave: {
                    onSave?()
                    self.closeWindow()
                },
                onFirstRunComplete: onFirstRunComplete,
                isFirstRun: isFirstRun
            )
            hostingController = NSHostingController(rootView: AnyView(settingsView))
            windowSize = NSRect(x: 0, y: 0, width: 520, height: isFirstRun ? 620 : 580)
        }

        let newWindow = NSWindow(
            contentRect: windowSize,
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        newWindow.title = isFirstRun ? "Welcome to PullRead" : "PullRead Settings"
        newWindow.titlebarAppearsTransparent = true
        newWindow.backgroundColor = .clear
        newWindow.contentViewController = hostingController
        newWindow.center()
        newWindow.isReleasedWhenClosed = false

        // Set window level to floating so it appears above menu bar app
        newWindow.level = .floating

        // Handle window close button - store delegate to prevent deallocation
        let delegate = WindowDelegate { [weak self] in
            self?.isPresented = false
        }
        self.windowDelegate = delegate
        newWindow.delegate = delegate

        self.window = newWindow

        newWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func showWhatsNew(version: String) {
        // If window exists and is visible, don't show What's New
        if let existingWindow = window, existingWindow.isVisible {
            return
        }

        isPresented = true

        let whatsNewView = WhatsNewView(
            version: version,
            onDismiss: { [weak self] in
                self?.closeWindow()
            }
        )

        let hostingController = NSHostingController(rootView: whatsNewView)

        let newWindow = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 380),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        newWindow.title = "What's New in PullRead"
        newWindow.titlebarAppearsTransparent = true
        newWindow.backgroundColor = .clear
        newWindow.contentViewController = hostingController
        newWindow.center()
        newWindow.isReleasedWhenClosed = false
        newWindow.level = .floating

        let delegate = WindowDelegate { [weak self] in
            self?.isPresented = false
        }
        self.windowDelegate = delegate
        newWindow.delegate = delegate

        self.window = newWindow

        newWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func closeWindow() {
        window?.close()
        window = nil
    }
}

// Helper class to handle window delegate
private class WindowDelegate: NSObject, NSWindowDelegate {
    let onClose: () -> Void

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
    }

    func windowWillClose(_ notification: Notification) {
        onClose()
    }
}
