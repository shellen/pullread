// ABOUTME: Registers all PullRead App Intents with Shortcuts.app
// ABOUTME: Provides Siri phrases and shortcut suggestions

import AppIntents

@available(macOS 13.0, *)
struct PullReadShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SaveArticleIntent(),
            phrases: [
                "Save article to \(.applicationName)",
                "Add to \(.applicationName)",
                "Save URL to \(.applicationName)"
            ],
            shortTitle: "Save Article",
            systemImageName: "plus.circle"
        )

        AppShortcut(
            intent: OpenViewerIntent(),
            phrases: [
                "Open \(.applicationName)",
                "Show my articles in \(.applicationName)"
            ],
            shortTitle: "Open Viewer",
            systemImageName: "book.fill"
        )

        AppShortcut(
            intent: SyncIntent(),
            phrases: [
                "Sync \(.applicationName)",
                "Fetch new articles in \(.applicationName)"
            ],
            shortTitle: "Sync Feeds",
            systemImageName: "arrow.triangle.2.circlepath"
        )

        AppShortcut(
            intent: UnreadCountIntent(),
            phrases: [
                "How many articles in \(.applicationName)",
                "Article count in \(.applicationName)"
            ],
            shortTitle: "Article Count",
            systemImageName: "number"
        )
    }
}
