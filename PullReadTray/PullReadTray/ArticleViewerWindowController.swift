// ABOUTME: In-app article viewer using WKWebView
// ABOUTME: Displays the PullRead viewer in a native window without opening an external browser

import Cocoa
import WebKit

class ArticleViewerWindowController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var titleObservation: NSKeyValueObservation?

    var isVisible: Bool {
        window?.isVisible ?? false
    }

    func showViewer(url: URL) {
        // If window exists and is visible, bring it to front
        if let existingWindow = window, existingWindow.isVisible {
            existingWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        // Configure WKWebView
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.allowsBackForwardNavigationGestures = true

        // Observe the page title so we can reflect it in the window title
        titleObservation = wv.observe(\.title, options: [.new]) { [weak self] webView, _ in
            if let title = webView.title, !title.isEmpty {
                self?.window?.title = title
            }
        }

        // Create the window
        let newWindow = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 750),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )

        newWindow.title = "PullRead"
        newWindow.minSize = NSSize(width: 600, height: 400)
        newWindow.backgroundColor = .windowBackgroundColor
        newWindow.contentView = wv
        newWindow.center()
        newWindow.isReleasedWhenClosed = false
        newWindow.delegate = self

        // Remember window position and size across launches
        newWindow.setFrameAutosaveName("ArticleViewer")

        self.window = newWindow
        self.webView = wv

        // Load the local viewer
        wv.load(URLRequest(url: url))

        // Show the app in the Dock so users can Cmd-Tab to the viewer
        NSApp.setActivationPolicy(.regular)

        newWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func close() {
        titleObservation?.invalidate()
        titleObservation = nil
        window?.close()
        window = nil
        webView = nil
    }

    // MARK: - NSWindowDelegate

    func windowWillClose(_ notification: Notification) {
        titleObservation?.invalidate()
        titleObservation = nil
        window = nil
        webView = nil

        // Hide the app from the Dock again (menu bar-only mode)
        NSApp.setActivationPolicy(.accessory)
    }
}
