// ABOUTME: Share Extension for PullRead
// ABOUTME: Receives URLs from Safari/other apps via the Share sheet and saves to PullRead inbox

import Cocoa
import UniformTypeIdentifiers

class ShareViewController: NSViewController {

    override var nibName: NSNib.Name? {
        return nil
    }

    override func loadView() {
        // Minimal view — we process and dismiss immediately
        self.view = NSView(frame: NSRect(x: 0, y: 0, width: 1, height: 1))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        extractURLAndSave()
    }

    private func extractURLAndSave() {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments else {
            done()
            return
        }

        for attachment in attachments {
            // Try URL type first
            if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                attachment.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] item, _ in
                    if let url = item as? URL {
                        self?.saveURL(url.absoluteString)
                    } else if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) {
                        self?.saveURL(url.absoluteString)
                    } else {
                        self?.done()
                    }
                }
                return
            }

            // Fall back to plain text (might contain a URL)
            if attachment.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                attachment.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] item, _ in
                    if let text = item as? String {
                        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
                            self?.saveURL(trimmed)
                            return
                        }
                    }
                    self?.done()
                }
                return
            }
        }

        done()
    }

    private func saveURL(_ urlString: String) {
        // Primary approach: use pullread:// URL scheme to delegate to main app
        if let encoded = urlString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
           let schemeURL = URL(string: "pullread://save?url=\(encoded)") {
            // Share Extensions can't open URLs directly on macOS,
            // so we write to the shared inbox file instead
            writeToInbox(url: urlString)
        }
        done()
    }

    private func writeToInbox(url: String) {
        // Write directly to ~/.config/pullread/inbox.json
        // This works because macOS Share Extensions are NOT sandboxed by default
        // (unlike iOS). They inherit the user's file system access.
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let inboxPath = "\(home)/.config/pullread/inbox.json"

        var inbox: [[String: String]] = []
        if let data = FileManager.default.contents(atPath: inboxPath),
           let existing = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] {
            inbox = existing
        }

        let entry: [String: String] = [
            "url": url,
            "addedAt": ISO8601DateFormatter().string(from: Date()),
            "source": "share-extension"
        ]
        inbox.append(entry)

        if let data = try? JSONSerialization.data(withJSONObject: inbox, options: .prettyPrinted) {
            // Ensure config directory exists
            let configDir = "\(home)/.config/pullread"
            try? FileManager.default.createDirectory(atPath: configDir, withIntermediateDirectories: true)
            FileManager.default.createFile(atPath: inboxPath, contents: data)
        }
    }

    private func done() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
