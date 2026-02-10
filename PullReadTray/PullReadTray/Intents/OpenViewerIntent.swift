// ABOUTME: Shortcuts intent to open the PullRead article viewer
// ABOUTME: Opens the viewer via pullread:// URL scheme

import AppIntents
import AppKit

@available(macOS 13.0, *)
struct OpenViewerIntent: AppIntent {
    static var title: LocalizedStringResource = "Open PullRead"
    static var description = IntentDescription("Opens the PullRead article viewer.")

    func perform() async throws -> some IntentResult {
        if let url = URL(string: "pullread://open") {
            await MainActor.run {
                NSWorkspace.shared.open(url)
            }
        }
        return .result()
    }
}
