// ABOUTME: SwiftUI Settings view for configuring PullRead
// ABOUTME: Allows users to set output folder and manage feed URLs

import SwiftUI
import AppKit

struct FeedItem: Identifiable, Equatable {
    let id = UUID()
    var name: String
    var url: String
}

struct SettingsView: View {
    @Binding var isPresented: Bool
    @State private var outputPath: String = "~/Articles"
    @State private var feeds: [FeedItem] = []
    @State private var newFeedName: String = ""
    @State private var newFeedURL: String = ""
    @State private var showingError: Bool = false
    @State private var errorMessage: String = ""
    @State private var selectedFeed: FeedItem.ID?

    let configPath: String
    var onSave: (() -> Void)?
    var isFirstRun: Bool

    init(isPresented: Binding<Bool>, configPath: String, onSave: (() -> Void)? = nil, isFirstRun: Bool = false) {
        self._isPresented = isPresented
        self.configPath = configPath
        self.onSave = onSave
        self.isFirstRun = isFirstRun
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if isFirstRun {
                welcomeHeader
            }

            outputFolderSection

            Divider()

            feedsSection

            Divider()

            buttonRow
        }
        .padding(20)
        .frame(width: 500, height: isFirstRun ? 520 : 480)
        .onAppear {
            loadConfig()
        }
        .alert("Error", isPresented: $showingError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage)
        }
    }

    private var welcomeHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Welcome to PullRead!")
                .font(.title2)
                .fontWeight(.semibold)
            Text("Let's configure your RSS feed sync settings.")
                .foregroundColor(.secondary)
        }
    }

    private var outputFolderSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Output Folder")
                .font(.headline)
            Text("Where synced articles will be saved as markdown files.")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack {
                TextField("~/Articles", text: $outputPath)
                    .textFieldStyle(.roundedBorder)

                Button("Browse...") {
                    selectOutputFolder()
                }
            }
        }
    }

    private var feedsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Feeds")
                .font(.headline)
            Text("Add RSS or Atom feed URLs to sync.")
                .font(.caption)
                .foregroundColor(.secondary)

            // Feed list
            List(selection: $selectedFeed) {
                ForEach(feeds) { feed in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(feed.name)
                                .fontWeight(.medium)
                            Text(feed.url)
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                    }
                    .tag(feed.id)
                }
                .onDelete(perform: deleteFeed)
            }
            .frame(height: 150)
            .border(Color.gray.opacity(0.3), width: 1)

            // Add new feed
            HStack(spacing: 8) {
                TextField("Name", text: $newFeedName)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 100)

                TextField("Feed URL", text: $newFeedURL)
                    .textFieldStyle(.roundedBorder)

                Button(action: addFeed) {
                    Image(systemName: "plus.circle.fill")
                }
                .disabled(newFeedName.isEmpty || newFeedURL.isEmpty)
                .buttonStyle(.borderless)
            }

            // Remove selected button
            if selectedFeed != nil {
                Button("Remove Selected") {
                    if let id = selectedFeed {
                        feeds.removeAll { $0.id == id }
                        selectedFeed = nil
                    }
                }
                .foregroundColor(.red)
            }
        }
    }

    private var buttonRow: some View {
        HStack {
            if !isFirstRun {
                Button("Cancel") {
                    isPresented = false
                }
                .keyboardShortcut(.cancelAction)
            }

            Spacer()

            Button(isFirstRun ? "Get Started" : "Save") {
                saveConfig()
            }
            .keyboardShortcut(.defaultAction)
            .disabled(outputPath.isEmpty || feeds.isEmpty)
        }
    }

    private func selectOutputFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Select"
        panel.message = "Choose the folder where articles will be saved"

        if panel.runModal() == .OK, let url = panel.url {
            // Convert to path, using ~ for home directory
            let path = url.path
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            if path.hasPrefix(home) {
                outputPath = path.replacingOccurrences(of: home, with: "~")
            } else {
                outputPath = path
            }
        }
    }

    private func addFeed() {
        guard !newFeedName.isEmpty, !newFeedURL.isEmpty else { return }

        // Basic URL validation
        var urlString = newFeedURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if !urlString.hasPrefix("http://") && !urlString.hasPrefix("https://") {
            urlString = "https://" + urlString
        }

        feeds.append(FeedItem(name: newFeedName.trimmingCharacters(in: .whitespaces), url: urlString))
        newFeedName = ""
        newFeedURL = ""
    }

    private func deleteFeed(at offsets: IndexSet) {
        feeds.remove(atOffsets: offsets)
    }

    private func loadConfig() {
        guard FileManager.default.fileExists(atPath: configPath),
              let data = FileManager.default.contents(atPath: configPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            // No config exists, use defaults
            return
        }

        if let path = json["outputPath"] as? String {
            outputPath = path
        }

        if let feedsDict = json["feeds"] as? [String: String] {
            feeds = feedsDict.map { FeedItem(name: $0.key, url: $0.value) }
                .sorted { $0.name.lowercased() < $1.name.lowercased() }
        }
    }

    private func saveConfig() {
        // Validate
        guard !outputPath.isEmpty else {
            errorMessage = "Please select an output folder."
            showingError = true
            return
        }

        guard !feeds.isEmpty else {
            errorMessage = "Please add at least one feed."
            showingError = true
            return
        }

        // Build config dictionary
        var feedsDict: [String: String] = [:]
        for feed in feeds {
            feedsDict[feed.name] = feed.url
        }

        let config: [String: Any] = [
            "outputPath": outputPath,
            "feeds": feedsDict
        ]

        // Write to file
        do {
            let data = try JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted, .sortedKeys])

            // Create parent directory if it doesn't exist
            let configURL = URL(fileURLWithPath: configPath)
            let parentDir = configURL.deletingLastPathComponent().path
            if !FileManager.default.fileExists(atPath: parentDir) {
                try FileManager.default.createDirectory(atPath: parentDir, withIntermediateDirectories: true)
            }

            try data.write(to: configURL)

            // Create output directory if it doesn't exist
            let expandedPath = outputPath.hasPrefix("~")
                ? outputPath.replacingOccurrences(of: "~", with: FileManager.default.homeDirectoryForCurrentUser.path)
                : outputPath

            if !FileManager.default.fileExists(atPath: expandedPath) {
                try FileManager.default.createDirectory(atPath: expandedPath, withIntermediateDirectories: true)
            }

            isPresented = false
            onSave?()
        } catch {
            errorMessage = "Failed to save configuration: \(error.localizedDescription)"
            showingError = true
        }
    }
}

#Preview {
    SettingsView(
        isPresented: .constant(true),
        configPath: "/tmp/feeds.json",
        isFirstRun: true
    )
}
