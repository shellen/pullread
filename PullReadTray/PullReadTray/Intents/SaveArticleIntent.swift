// ABOUTME: Shortcuts intent to save an article URL to PullRead inbox
// ABOUTME: Allows "Save to PullRead" from Shortcuts.app and Siri

import AppIntents
import Foundation

@available(macOS 13.0, *)
struct SaveArticleIntent: AppIntent {
    static var title: LocalizedStringResource = "Save Article to PullRead"
    static var description = IntentDescription("Saves a URL to your PullRead reading list for the next sync.")

    @Parameter(title: "URL")
    var url: String

    @Parameter(title: "Title", default: nil)
    var title: String?

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let inboxPath = "\(home)/.config/pullread/inbox.json"
        let configDir = "\(home)/.config/pullread"

        var inbox: [[String: String]] = []
        if let data = FileManager.default.contents(atPath: inboxPath),
           let existing = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] {
            inbox = existing
        }

        var entry: [String: String] = [
            "url": url,
            "addedAt": ISO8601DateFormatter().string(from: Date()),
            "source": "shortcuts"
        ]
        if let title = title {
            entry["title"] = title
        }
        inbox.append(entry)

        // Ensure config directory exists
        try? FileManager.default.createDirectory(atPath: configDir, withIntermediateDirectories: true)

        if let data = try? JSONSerialization.data(withJSONObject: inbox, options: .prettyPrinted) {
            FileManager.default.createFile(atPath: inboxPath, contents: data)
        }

        return .result(value: "Saved \(title ?? url) to PullRead")
    }
}
