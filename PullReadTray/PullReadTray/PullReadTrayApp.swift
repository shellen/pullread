// ABOUTME: SwiftUI App entry point for PullRead menu bar app
// ABOUTME: Configures app as agent (no dock icon) and sets up menu bar

import SwiftUI

@main
struct PullReadTrayApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // Use Window instead of Settings to avoid showing an empty settings panel
        // The actual settings are shown via SettingsWindowController from the menu bar
        Window("PullRead", id: "main") {
            EmptyView()
        }
        .windowResizability(.contentSize)
        .defaultSize(width: 0, height: 0)
    }
}
