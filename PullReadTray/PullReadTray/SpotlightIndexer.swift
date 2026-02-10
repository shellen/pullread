// ABOUTME: Indexes PullRead articles in macOS Spotlight via CoreSpotlight
// ABOUTME: Parses YAML frontmatter from .md files and creates searchable items

import CoreSpotlight
import UniformTypeIdentifiers

class SpotlightIndexer {
    private let domainIdentifier = "com.pullread.articles"
    private let index = CSSearchableIndex.default()

    /// Index all articles at the given output path, only re-indexing files that changed
    func indexArticles(at outputPath: String) {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else { return }

            let fileManager = FileManager.default
            guard let files = try? fileManager.contentsOfDirectory(atPath: outputPath) else { return }

            let mdFiles = files.filter { $0.hasSuffix(".md") }
            guard !mdFiles.isEmpty else { return }

            // Load last-indexed timestamps to skip unchanged files
            let timestampPath = outputPath + "/.spotlight-index-timestamps"
            var lastIndexed: [String: TimeInterval] = [:]
            if let data = fileManager.contents(atPath: timestampPath),
               let saved = try? JSONSerialization.jsonObject(with: data) as? [String: TimeInterval] {
                lastIndexed = saved
            }

            var items: [CSSearchableItem] = []
            var updatedTimestamps = lastIndexed

            for filename in mdFiles {
                let filePath = outputPath + "/" + filename
                guard let attrs = try? fileManager.attributesOfItem(atPath: filePath),
                      let modDate = attrs[.modificationDate] as? Date else { continue }

                let modTime = modDate.timeIntervalSince1970

                // Skip if file hasn't changed since last indexing
                if let lastTime = lastIndexed[filename], lastTime >= modTime {
                    continue
                }

                guard let content = try? String(contentsOfFile: filePath, encoding: .utf8) else { continue }
                let frontmatter = parseFrontmatter(content)

                let attributeSet = CSSearchableItemAttributeSet(contentType: UTType.text)
                attributeSet.title = frontmatter["title"] ?? filename.replacingOccurrences(of: ".md", with: "")
                attributeSet.contentDescription = frontmatter["excerpt"] ?? frontmatter["summary"]
                attributeSet.authorNames = frontmatter["author"].map { [$0] }
                attributeSet.keywords = frontmatter["tags"]?.components(separatedBy: ", ")
                attributeSet.domainIdentifier = self.domainIdentifier
                attributeSet.contentURL = URL(fileURLWithPath: filePath)

                // Use domain from frontmatter as additional metadata
                if let domain = frontmatter["domain"] {
                    attributeSet.creator = domain
                }

                let item = CSSearchableItem(
                    uniqueIdentifier: filename,
                    domainIdentifier: self.domainIdentifier,
                    attributeSet: attributeSet
                )
                // Items expire after 90 days by default
                item.expirationDate = Date().addingTimeInterval(90 * 24 * 60 * 60)

                items.append(item)
                updatedTimestamps[filename] = modTime

                // Batch index every 100 items
                if items.count >= 100 {
                    self.indexBatch(items)
                    items.removeAll()
                }
            }

            // Index remaining items
            if !items.isEmpty {
                self.indexBatch(items)
            }

            // Save updated timestamps
            if let data = try? JSONSerialization.data(withJSONObject: updatedTimestamps) {
                fileManager.createFile(atPath: timestampPath, contents: data)
            }

            print("[PullRead] Spotlight indexing complete — \(updatedTimestamps.count) articles indexed")
        }
    }

    /// Remove all PullRead items from Spotlight index
    func removeAllItems() {
        index.deleteSearchableItems(withDomainIdentifiers: [domainIdentifier]) { error in
            if let error = error {
                print("[PullRead] Spotlight removal error: \(error.localizedDescription)")
            }
        }
    }

    private func indexBatch(_ items: [CSSearchableItem]) {
        index.indexSearchableItems(items) { error in
            if let error = error {
                print("[PullRead] Spotlight indexing error: \(error.localizedDescription)")
            }
        }
    }

    /// Parse YAML frontmatter from markdown content
    /// Expects format: ---\nkey: value\n---\n
    private func parseFrontmatter(_ content: String) -> [String: String] {
        var result: [String: String] = [:]

        guard content.hasPrefix("---") else { return result }

        let lines = content.components(separatedBy: "\n")
        var inFrontmatter = false
        for line in lines {
            if line.trimmingCharacters(in: .whitespaces) == "---" {
                if inFrontmatter {
                    break // End of frontmatter
                }
                inFrontmatter = true
                continue
            }

            if inFrontmatter {
                if let colonIndex = line.firstIndex(of: ":") {
                    let key = String(line[line.startIndex..<colonIndex]).trimmingCharacters(in: .whitespaces)
                    let value = String(line[line.index(after: colonIndex)...]).trimmingCharacters(in: .whitespaces)
                    // Strip surrounding quotes if present
                    if value.hasPrefix("\"") && value.hasSuffix("\"") && value.count >= 2 {
                        result[key] = String(value.dropFirst().dropLast())
                    } else {
                        result[key] = value
                    }
                }
            }
        }

        return result
    }
}
