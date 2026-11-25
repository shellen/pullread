// ABOUTME: Structured output from Apple Intelligence (Foundation Models guided generation, macOS 26)
// ABOUTME: Compiles a small Swift helper once (like the summarizer's) and returns parsed JSON per mode

import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ensureAppleBinary, isAppleAvailable } from './summarizer';

/*
 * Lessons from live runs on macOS 26.6 (Nov 2026), built into the helper below:
 * - The on-device context window is 4,096 tokens for prompt, schema and answer.
 * - Every [T] field needs a .count/.maximumCount guide, and every call caps
 *   maximumResponseTokens. An unbounded array ran until the window was full.
 * - Per-item fields (story number + sentence + phrase) work; free paragraphs
 *   plus a separate links list did not.
 * - Section labels are only consistent when chosen from a fixed list (.anyOf).
 * See docs/plans/2026-11-25-rundown-stories-and-apple-intelligence-plan.md.
 */
export const APPLE_STRUCTURED_SWIFT = `import Foundation
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
struct StorySentence {
    @Guide(description: "One sentence in your own words saying what happened and why it matters, with one concrete detail. Do not copy the headline.")
    var sentence: String
    @Guide(description: "2 to 5 words from your sentence that name the story.")
    var phrase: String
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
            FileHandle.standardError.write(Data("usage: fm-structured <intro|sentence|pairs|labels|groups> <instructions-file> <prompt-file>\\n".utf8))
            exit(2)
        }
        // News is user content to transform, not a request for new content:
        // the permissive guardrails are meant for exactly this. (First run with
        // 246 real stories: default guardrails refused both intro and grouping.)
        let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)
        switch model.availability {
        case .available:
            break
        case .unavailable(let reason):
            FileHandle.standardError.write(Data("Apple Intelligence model unavailable: \\(reason)\\n".utf8))
            exit(3)
        }

        let instructions = try String(contentsOfFile: args[2], encoding: .utf8)
        let prompt = try String(contentsOfFile: args[3], encoding: .utf8)
        let session = LanguageModelSession(model: model, instructions: instructions)
        // Cap the answer so a runaway response fails fast instead of filling the 4K window.
        let options = GenerationOptions(maximumResponseTokens: args[1] == "intro" ? 600 : args[1] == "sentence" ? 200 : 500)

        do {
            if args[1] == "intro" {
                let r = try await session.respond(to: prompt, generating: IntroResult.self, options: options)
                let para = { (ms: [Mention]) in ms.map { ["story": $0.story, "sentence": $0.sentence, "phrase": $0.phrase] as [String: Any] } }
                try emit(["mentions": [para(r.content.lead), para(r.content.more)]])
            } else if args[1] == "sentence" {
                let r = try await session.respond(to: prompt, generating: StorySentence.self, options: options)
                try emit(["sentence": r.content.sentence, "phrase": r.content.phrase])
            } else if args[1] == "pairs" {
                let r = try await session.respond(to: prompt, generating: SamePairs.self, options: options)
                try emit(["same": r.content.same])
            } else if args[1] == "labels" {
                let r = try await session.respond(to: prompt, generating: StoryLabels.self, options: options)
                try emit(["stories": r.content.labels.map { "\\($0.id)|\\($0.section)|\\($0.importance)" }])
            } else {
                let r = try await session.respond(to: prompt, generating: StoryGroups.self, options: options)
                try emit(["stories": r.content.stories])
            }
        } catch let error as LanguageModelSession.GenerationError {
            switch error {
            case .exceededContextWindowSize:
                FileHandle.standardError.write(Data("CONTEXT_WINDOW: prompt + answer exceeded the on-device model's context window (\\(error))\\n".utf8))
            case .refusal:
                FileHandle.standardError.write(Data("REFUSAL: the model declined this request\\n".utf8))
            case .guardrailViolation:
                FileHandle.standardError.write(Data("REFUSAL: guardrail violation\\n".utf8))
            default:
                FileHandle.standardError.write(Data("GENERATION: \\(error)\\n".utf8))
            }
            exit(4)
        }
    }
}
`;

export type AppleStructuredMode = 'intro' | 'sentence' | 'pairs' | 'labels';

export class AppleStructuredError extends Error {
  constructor(message: string, readonly kind: 'unavailable' | 'context' | 'refusal' | 'generation' | 'compile' | 'other') {
    super(message);
  }
}

/**
 * Run one guided-generation request on the on-device model. Throws
 * AppleStructuredError; callers fall back to their non-structured path.
 */
export function runAppleStructured(mode: AppleStructuredMode, instructions: string, prompt: string, timeoutMs = 60_000): any {
  if (!isAppleAvailable()) throw new AppleStructuredError('Apple Intelligence needs macOS 26', 'unavailable');
  const binary = ensureAppleBinary(APPLE_STRUCTURED_SWIFT, '.apple-structured');
  if (!binary) throw new AppleStructuredError('Could not compile the Apple Intelligence helper (xcode-select --install)', 'compile');

  const dir = join(homedir(), '.config', 'pullread');
  mkdirSync(dir, { recursive: true });
  const instFile = join(dir, `.apple-structured-${process.pid}-inst.txt`);
  const promptFile = join(dir, `.apple-structured-${process.pid}-prompt.txt`);
  writeFileSync(instFile, instructions);
  writeFileSync(promptFile, prompt);
  try {
    const out = execFileSync(binary, [mode, instFile, promptFile], { encoding: 'utf-8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  } catch (err: any) {
    const stderr = String(err?.stderr || '');
    if (/CONTEXT_WINDOW|exceededContextWindowSize/.test(stderr)) throw new AppleStructuredError('Apple Intelligence context window exceeded', 'context');
    if (/model unavailable/.test(stderr)) throw new AppleStructuredError(stderr.trim().slice(0, 200), 'unavailable');
    if (/REFUSAL:|refusal\(|guardrailViolation/.test(stderr)) throw new AppleStructuredError('Apple Intelligence declined this request (safety guardrails)', 'refusal');
    if (/GENERATION:/.test(stderr)) throw new AppleStructuredError(stderr.trim().slice(0, 200), 'generation');
    throw new AppleStructuredError(stderr.trim().slice(0, 200) || String(err?.message || err), 'other');
  } finally {
    try { unlinkSync(instFile); } catch {}
    try { unlinkSync(promptFile); } catch {}
  }
}
