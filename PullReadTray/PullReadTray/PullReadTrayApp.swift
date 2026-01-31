// ABOUTME: SwiftUI App entry point for PullRead menu bar app
// ABOUTME: Configures app as agent (no dock icon) and sets up menu bar

import SwiftUI

@main
struct PullReadTrayApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}
