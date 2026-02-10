// ABOUTME: Shortcuts intent to trigger a PullRead sync
// ABOUTME: Triggers sync via pullread:// URL scheme

import AppIntents
import AppKit

@available(macOS 13.0, *)
struct SyncIntent: AppIntent {
    static var title: LocalizedStringResource = "Sync PullRead"
    static var description = IntentDescription("Triggers a PullRead feed sync to fetch new articles.")

    func perform() async throws -> some IntentResult {
        if let url = URL(string: "pullread://sync") {
            await MainActor.run {
                NSWorkspace.shared.open(url)
            }
        }
        return .result()
    }
}
