// ABOUTME: macOS 26 stand-in for `fm respond --schema` in the Rundown demos (on-device model only)
// ABOUTME: Usage: fm-structured <intro|pairs|labels|groups> <instructions-file> <prompt-file>  → JSON on stdout

import Foundation
import FoundationModels

@Generable
struct Mention {
    @Guide(description: "The story number from the list.")
    var story: Int
    @Guide(description: "One specific sentence about this story, using a concrete detail from it. Plain and direct, no hype.")
    var sentence: String
    @Guide(description: "The exact words from your sentence to turn into a link, 2 to 6 words.")
    var phrase: String
}

@Generable
struct IntroResult {
    @Guide(description: "First paragraph: one sentence each for the 1 or 2 most important stories.", .count(1...2))
    var lead: [Mention]
    @Guide(description: "Second paragraph: one sentence each for 2 or 3 other stories worth reading.", .count(2...3))
    var more: [Mention]
}

@Generable
struct SamePairs {
    @Guide(description: "Ids (like P3) of the pairs that report the same news event. Empty if none.", .maximumCount(12))
    var same: [String]
}

@Generable
struct StoryGroups {
    @Guide(description: "One entry per story, formatted ids|label|importance (or id|label|importance when labeling).", .maximumCount(25))
    var stories: [String]
}

// Keep in sync with SECTION_NAMES in src/rundown-ai.ts.
let SECTIONS = ["World", "U.S.", "Politics", "Business", "Courts", "Tech", "Science", "Health",
                "Climate", "Culture", "Music", "Design", "Sports", "Autos", "Local"]

@Generable
struct StoryLabel {
    @Guide(description: "The headline's id number.")
    var id: Int
    @Guide(description: "The newspaper section this headline belongs in.", .anyOf(SECTIONS))
    var section: String
    @Guide(description: "Importance for a general reader today: 5 = major news anywhere, 3 = solid story, 1 = niche.", .range(1...5))
    var importance: Int
}

@Generable
struct StoryLabels {
    @Guide(description: "One entry per headline.", .maximumCount(25))
    var labels: [StoryLabel]
}

func emit(_ object: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted])
    print(String(decoding: data, as: UTF8.self))
}

@main struct Run {
    static func main() async throws {
        let args = CommandLine.arguments
        guard args.count == 4 else {
            FileHandle.standardError.write(Data("usage: fm-structured <intro|pairs|labels|groups> <instructions-file> <prompt-file>\n".utf8))
            exit(2)
        }
        switch SystemLanguageModel.default.availability {
        case .available:
            break
        case .unavailable(let reason):
            FileHandle.standardError.write(Data("Apple Intelligence model unavailable: \(reason)\n".utf8))
            exit(3)
        }

        let instructions = try String(contentsOfFile: args[2], encoding: .utf8)
        let prompt = try String(contentsOfFile: args[3], encoding: .utf8)
        let session = LanguageModelSession(instructions: instructions)
        // Cap the answer so a runaway response fails fast instead of filling the 4K window.
        let options = GenerationOptions(maximumResponseTokens: args[1] == "intro" ? 600 : 500)

        do {
            if args[1] == "intro" {
                let r = try await session.respond(to: prompt, generating: IntroResult.self, options: options)
                let para = { (ms: [Mention]) in ms.map { ["story": $0.story, "sentence": $0.sentence, "phrase": $0.phrase] as [String: Any] } }
                try emit(["mentions": [para(r.content.lead), para(r.content.more)]])
            } else if args[1] == "pairs" {
                let r = try await session.respond(to: prompt, generating: SamePairs.self, options: options)
                try emit(["same": r.content.same])
            } else if args[1] == "labels" {
                let r = try await session.respond(to: prompt, generating: StoryLabels.self, options: options)
                try emit(["stories": r.content.labels.map { "\($0.id)|\($0.section)|\($0.importance)" }])
            } else {
                let r = try await session.respond(to: prompt, generating: StoryGroups.self, options: options)
                try emit(["stories": r.content.stories])
            }
        } catch let error as LanguageModelSession.GenerationError {
            switch error {
            case .exceededContextWindowSize:
                FileHandle.standardError.write(Data("CONTEXT_WINDOW: prompt + answer exceeded the on-device model's context window (\(error))\n".utf8))
            default:
                FileHandle.standardError.write(Data("GENERATION: \(error)\n".utf8))
            }
            exit(4)
        }
    }
}
