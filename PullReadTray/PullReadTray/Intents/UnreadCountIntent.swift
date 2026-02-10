// ABOUTME: Shortcuts intent to get the count of articles in PullRead
// ABOUTME: Counts .md files in the output directory

import AppIntents
import Foundation

@available(macOS 13.0, *)
struct UnreadCountIntent: AppIntent {
    static var title: LocalizedStringResource = "Get PullRead Article Count"
    static var description = IntentDescription("Returns the number of articles in your PullRead library.")

    func perform() async throws -> some IntentResult & ReturnsValue<Int> {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let configPath = "\(home)/.config/pullread/feeds.json"

        guard let data = FileManager.default.contents(atPath: configPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              var outputPath = json["outputPath"] as? String else {
            return .result(value: 0)
        }

        // Expand ~ to home directory
        if outputPath.hasPrefix("~") {
            outputPath = outputPath.replacingOccurrences(of: "~", with: home)
        }

        guard let files = try? FileManager.default.contentsOfDirectory(atPath: outputPath) else {
            return .result(value: 0)
        }

        let count = files.filter { $0.hasSuffix(".md") }.count
        return .result(value: count)
    }
}
