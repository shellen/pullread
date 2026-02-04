// ABOUTME: Window controller for PullRead settings
// ABOUTME: Manages displaying settings window as a proper macOS panel

import Cocoa
import SwiftUI

class SettingsWindowController {
    private var window: NSWindow?
    private var windowDelegate: WindowDelegate?
    private var isPresented: Bool = true

    func showSettings(configPath: String, isFirstRun: Bool = false, onSave: (() -> Void)? = nil) {
        // If window exists and is visible, just bring it to front
        if let existingWindow = window, existingWindow.isVisible {
            existingWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        isPresented = true

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
            isFirstRun: isFirstRun
        )

        let hostingController = NSHostingController(rootView: settingsView)

        let newWindow = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: isFirstRun ? 620 : 580),
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
