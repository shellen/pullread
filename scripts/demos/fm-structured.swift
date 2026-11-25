// ABOUTME: macOS 26 stand-in for `fm respond --schema` in the Rundown demos (on-device model only)
// ABOUTME: Usage: fm-structured <intro|groups> <instructions-file> <prompt-file>  → JSON on stdout

import Foundation
import FoundationModels

@Generable
struct IntroResult {
    @Guide(description: "The opening note, one string per short paragraph (2-3 paragraphs).")
    var paragraphs: [String]
    @Guide(description: "One entry per story mentioned, formatted paragraph|story|phrase, where phrase is the exact words in that paragraph to link.")
    var links: [String]
}

@Generable
struct StoryGroups {
    @Guide(description: "One entry per story, formatted ids|label|importance.")
    var stories: [String]
}

func emit(_ object: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted])
    print(String(decoding: data, as: UTF8.self))
}

@main struct Run {
    static func main() async throws {
        let args = CommandLine.arguments
        guard args.count == 4 else {
            FileHandle.standardError.write(Data("usage: fm-structured <intro|groups> <instructions-file> <prompt-file>\n".utf8))
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

        if args[1] == "intro" {
            let r = try await session.respond(to: prompt, generating: IntroResult.self)
            try emit(["paragraphs": r.content.paragraphs, "links": r.content.links])
        } else {
            let r = try await session.respond(to: prompt, generating: StoryGroups.self)
            try emit(["stories": r.content.stories])
        }
    }
}
