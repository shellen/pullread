// ABOUTME: Multi-step onboarding wizard for first-run experience
// ABOUTME: Guides new users through setup with Back/Next navigation

import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct OnboardingView: View {
    @Binding var isPresented: Bool
    @State private var currentStep = 0
    @State private var outputPath: String = "~/Documents/PullRead"
    @State private var feeds: [FeedItem] = []
    @State private var newFeedURL: String = ""
    @State private var isFetchingTitle: Bool = false
    @State private var useBrowserCookies: Bool = false
    @State private var isSyncing: Bool = false
    @State private var syncComplete: Bool = false
    @State private var showingError: Bool = false
    @State private var errorMessage: String = ""

    let configPath: String
    var onComplete: (() -> Void)?

    private let totalSteps = 6

    var body: some View {
        ZStack {
            // Opaque background — avoids liquid glass transparency issues
            VisualEffectView(material: .sidebar, blendingMode: .behindWindow)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Progress indicator
                progressBar
                    .padding(.top, 16)
                    .padding(.horizontal, 24)

                // Step content
                ScrollView {
                    Group {
                        switch currentStep {
                        case 0: welcomeStep
                        case 1: outputFolderStep
                        case 2: feedsStep
                        case 3: optionsStep
                        case 4: savingArticlesStep
                        case 5: readyStep
                        default: EmptyView()
                        }
                    }
                    .padding(24)
                }

                // Navigation buttons
                navigationBar
                    .padding(24)
            }
        }
        .frame(width: 520, height: 580)
        .onAppear {
            loadExistingConfig()
        }
        .alert("Error", isPresented: $showingError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage)
        }
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        HStack(spacing: 4) {
            ForEach(0..<totalSteps, id: \.self) { step in
                RoundedRectangle(cornerRadius: 2)
                    .fill(step <= currentStep ? Color.accentColor : Color.secondary.opacity(0.2))
                    .frame(height: 4)
            }
        }
    }

    // MARK: - Step 1: Welcome

    private var welcomeStep: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 20)

            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 80, height: 80)
                .cornerRadius(16)

            Text("Welcome to PullRead")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Save articles from your bookmark services as clean, local markdown files. Connect Instapaper, Pinboard, Raindrop, or any service with an RSS feed.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)

            HStack(spacing: 12) {
                featurePill(icon: "bookmark.fill", text: "Bookmark sync")
                featurePill(icon: "square.and.arrow.up", text: "Share Extension")
                featurePill(icon: "doc.text", text: "Markdown files")
                featurePill(icon: "sparkles", text: "AI summaries")
            }

            Spacer()
        }
    }

    private func featurePill(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
            Text(text)
                .font(.caption)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(12)
    }

    // MARK: - Step 2: Output Folder

    private var outputFolderStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeader(
                icon: "folder.fill",
                iconColor: .blue,
                title: "Choose Output Folder",
                subtitle: "Synced articles will be saved as markdown files here. Pick any folder — a cloud-synced folder like Dropbox or iCloud works great."
            )

            GlassCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        TextField("~/Documents/PullRead", text: $outputPath)
                            .textFieldStyle(.plain)
                            .padding(8)
                            .background(Color(NSColor.textBackgroundColor).opacity(0.5))
                            .cornerRadius(6)

                        Button(action: selectOutputFolder) {
                            Label("Browse", systemImage: "folder.badge.plus")
                        }
                        .buttonStyle(.bordered)
                    }

                    Text("Default: ~/Documents/PullRead")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    // MARK: - Step 3: Connect Bookmarks

    private var feedsStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeader(
                icon: "bookmark.fill",
                iconColor: .orange,
                title: "Connect Your Bookmarks",
                subtitle: "Paste the RSS feed URL from your bookmark service. PullRead will fetch and save your bookmarked articles."
            )

            GlassCard {
                VStack(alignment: .leading, spacing: 12) {
                    // Existing feeds
                    ForEach(feeds) { feed in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(feed.name)
                                    .fontWeight(.medium)
                                Text(feed.url)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Button(action: {
                                feeds.removeAll { $0.id == feed.id }
                            }) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                            }
                            .buttonStyle(.borderless)
                        }
                        .padding(.vertical, 4)

                        if feed.id != feeds.last?.id {
                            Divider()
                        }
                    }

                    if !feeds.isEmpty {
                        Divider()
                    }

                    // Add new feed — URL only with auto-discovery
                    HStack(spacing: 8) {
                        TextField("Paste bookmark feed URL or blog URL...", text: $newFeedURL)
                            .textFieldStyle(.plain)
                            .padding(8)
                            .background(Color(NSColor.textBackgroundColor).opacity(0.5))
                            .cornerRadius(6)
                            .onSubmit { addFeed() }

                        if isFetchingTitle {
                            ProgressView()
                                .scaleEffect(0.7)
                                .frame(width: 24)
                        } else {
                            Button(action: addFeed) {
                                Image(systemName: "plus.circle.fill")
                                    .font(.title2)
                            }
                            .buttonStyle(.borderless)
                            .disabled(newFeedURL.isEmpty)
                        }
                    }

                    // Import bookmarks.html option
                    HStack(spacing: 6) {
                        Button(action: importBookmarks) {
                            Label("Import bookmarks.html", systemImage: "square.and.arrow.down")
                                .font(.caption)
                        }
                        .buttonStyle(.borderless)

                        Text("from Chrome, Safari, Firefox, or Pocket export")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            }

            // Bookmark service examples
            VStack(alignment: .leading, spacing: 8) {
                Text("Where to find your feed URL:")
                    .font(.caption)
                    .foregroundColor(.secondary)

                VStack(alignment: .leading, spacing: 4) {
                    serviceHint(name: "Instapaper", hint: "Settings \u{2192} Export \u{2192} RSS Feed URL")
                    serviceHint(name: "Pinboard", hint: "pinboard.in/feeds/u:USERNAME/")
                    serviceHint(name: "Raindrop", hint: "Collection \u{2192} Share \u{2192} RSS Feed")
                    serviceHint(name: "Omnivore", hint: "Settings \u{2192} Feeds \u{2192} RSS URL")
                }
            }
        }
    }

    private func serviceHint(name: String, hint: String) -> some View {
        HStack(spacing: 6) {
            Text(name)
                .font(.caption)
                .fontWeight(.medium)
                .frame(width: 80, alignment: .leading)
            Text(hint)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Step 4: Options

    private var optionsStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeader(
                icon: "gearshape.fill",
                iconColor: .gray,
                title: "Options",
                subtitle: "Configure optional features. You can change these anytime in Settings."
            )

            GlassCard {
                VStack(alignment: .leading, spacing: 16) {
                    Toggle(isOn: $useBrowserCookies) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Use Chrome Cookies")
                                .fontWeight(.medium)
                            Text("Enable this to access paywalled sites using your Chrome login cookies.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .toggleStyle(.switch)

                    if useBrowserCookies {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.shield.fill")
                                .foregroundColor(.green)
                            Text("Cookies are read locally and never sent to our servers.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(10)
                        .background(Color.green.opacity(0.1))
                        .cornerRadius(8)
                    }
                }
            }
        }
    }

    // MARK: - Step 5: Saving Articles

    private var savingArticlesStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeader(
                icon: "square.and.arrow.down.fill",
                iconColor: .blue,
                title: "Saving Articles",
                subtitle: "There are several ways to get articles into PullRead. Use any combination that fits your workflow."
            )

            // Primary: RSS feeds from hosted services
            GlassCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.title3)
                            .foregroundColor(.orange)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("RSS Feeds")
                                .fontWeight(.medium)
                            Text("Your primary source. Instapaper, Pinboard, Raindrop, Pocket, and any RSS feed sync automatically on a schedule.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    Divider()

                    HStack(spacing: 10) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.title3)
                            .foregroundColor(.blue)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Share Extension")
                                .fontWeight(.medium)
                            Text("In Safari or any app, tap Share \u{2192} Save to PullRead. The article is queued and fetched on next sync.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    Divider()

                    HStack(spacing: 10) {
                        Image(systemName: "contextualmenu.and.cursorarrow")
                            .font(.title3)
                            .foregroundColor(.green)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Services Menu")
                                .fontWeight(.medium)
                            Text("Select any URL, then right-click \u{2192} Services \u{2192} Save to PullRead.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    Divider()

                    HStack(spacing: 10) {
                        Image(systemName: "command")
                            .font(.title3)
                            .foregroundColor(.purple)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Shortcuts & Siri")
                                .fontWeight(.medium)
                            Text("Use the Shortcuts app or say \"Save article to PullRead\" to automate your workflow.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }

            HStack(spacing: 8) {
                Image(systemName: "info.circle")
                    .foregroundColor(.secondary)
                Text("All save methods queue articles locally. They're fetched and converted to markdown on the next sync.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Step 6: Ready

    private var readyStep: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 10)

            Image(systemName: syncComplete ? "checkmark.circle.fill" : "rocket.fill")
                .font(.system(size: 48))
                .foregroundStyle(syncComplete
                    ? .linearGradient(colors: [.green, .mint], startPoint: .topLeading, endPoint: .bottomTrailing)
                    : .linearGradient(colors: [.orange, .red], startPoint: .topLeading, endPoint: .bottomTrailing)
                )

            Text(syncComplete ? "You're All Set!" : "Ready to Go")
                .font(.title)
                .fontWeight(.bold)

            if syncComplete {
                Text("Your first sync is complete. Your bookmarked articles are now markdown files in your output folder. Use the menu bar icon to sync, read, and manage your library.")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 380)
            } else {
                Text("PullRead will now fetch your bookmarked articles and save them as markdown. You can sync anytime from the menu bar.")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 380)

                Button(action: runFirstSync) {
                    HStack {
                        if isSyncing {
                            ProgressView()
                                .scaleEffect(0.7)
                        }
                        Text(isSyncing ? "Syncing..." : "Sync Now")
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isSyncing)
            }

            Spacer()
        }
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack {
            if currentStep > 0 {
                Button("Back") {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        currentStep -= 1
                    }
                }
            }

            Spacer()

            if currentStep < totalSteps - 1 {
                Button("Next") {
                    // Feeds step: allow skipping — user may have imported bookmarks.html instead
                    if currentStep == 1 && outputPath.isEmpty {
                        errorMessage = "Please choose an output folder."
                        showingError = true
                        return
                    }
                    // Save config when leaving the options step
                    if currentStep == 3 {
                        saveConfig()
                    }
                    withAnimation(.easeInOut(duration: 0.2)) {
                        currentStep += 1
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
            } else {
                Button("Done") {
                    UserDefaults.standard.set(true, forKey: "onboardingCompleted")
                    isPresented = false
                    onComplete?()
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
            }
        }
    }

    // MARK: - Helpers

    private func stepHeader(icon: String, iconColor: Color, title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(iconColor)
                Text(title)
                    .font(.title2)
                    .fontWeight(.semibold)
            }
            Text(subtitle)
                .font(.callout)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
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
        guard !newFeedURL.isEmpty else { return }

        var urlString = newFeedURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if !urlString.hasPrefix("http://") && !urlString.hasPrefix("https://") {
            urlString = "https://" + urlString
        }

        let finalUrl = urlString
        isFetchingTitle = true

        discoverFeed(from: finalUrl) { result in
            let feedUrl = result?.feedUrl ?? finalUrl
            let name = result?.title ?? domainFromUrl(feedUrl)
            feeds.append(FeedItem(name: name, url: feedUrl))
            newFeedURL = ""
            isFetchingTitle = false
        }
    }

    private func domainFromUrl(_ urlString: String) -> String {
        guard let url = URL(string: urlString), let host = url.host else { return urlString }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    private struct FeedDiscoveryResult {
        let feedUrl: String
        let title: String?
    }

    private func discoverFeed(from urlString: String, completion: @escaping (FeedDiscoveryResult?) -> Void) {
        guard let url = URL(string: urlString) else {
            completion(nil)
            return
        }

        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data = data, let text = String(data: data, encoding: .utf8) else {
                DispatchQueue.main.async { completion(nil) }
                return
            }

            let isFeed = text.contains("<rss") || text.contains("<feed") || text.contains("<rdf:RDF") || text.contains("<?xml")

            if isFeed {
                let title = self.extractXmlTitle(from: text)
                DispatchQueue.main.async { completion(FeedDiscoveryResult(feedUrl: urlString, title: title)) }
                return
            }

            // Try HTML RSS auto-discovery
            let pattern = #"<link[^>]*rel\s*=\s*["']alternate["'][^>]*type\s*=\s*["']application/(rss|atom)\+xml["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>"#
            let altPattern = #"<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*type\s*=\s*["']application/(rss|atom)\+xml["'][^>]*>"#

            var feedHref: String?
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
               let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) {
                if let range = Range(match.range(at: 2), in: text) {
                    feedHref = String(text[range])
                }
            } else if let regex = try? NSRegularExpression(pattern: altPattern, options: .caseInsensitive),
                      let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) {
                if let range = Range(match.range(at: 1), in: text) {
                    feedHref = String(text[range])
                }
            }

            guard let href = feedHref else {
                let title = self.extractXmlTitle(from: text)
                DispatchQueue.main.async { completion(FeedDiscoveryResult(feedUrl: urlString, title: title)) }
                return
            }

            let resolvedUrl: String
            if href.hasPrefix("http://") || href.hasPrefix("https://") {
                resolvedUrl = href
            } else if let base = URL(string: urlString), let resolved = URL(string: href, relativeTo: base) {
                resolvedUrl = resolved.absoluteString
            } else {
                resolvedUrl = href
            }

            guard let feedUrl = URL(string: resolvedUrl) else {
                DispatchQueue.main.async { completion(FeedDiscoveryResult(feedUrl: resolvedUrl, title: nil)) }
                return
            }

            URLSession.shared.dataTask(with: feedUrl) { feedData, _, _ in
                var feedTitle: String?
                if let feedData = feedData, let feedText = String(data: feedData, encoding: .utf8) {
                    feedTitle = self.extractXmlTitle(from: feedText)
                }
                DispatchQueue.main.async { completion(FeedDiscoveryResult(feedUrl: resolvedUrl, title: feedTitle)) }
            }.resume()
        }.resume()
    }

    private func extractXmlTitle(from text: String) -> String? {
        guard let startRange = text.range(of: "<title>"),
              let endRange = text.range(of: "</title>", range: startRange.upperBound..<text.endIndex) else {
            return nil
        }
        let raw = String(text[startRange.upperBound..<endRange.lowerBound])
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "<![CDATA[", with: "")
            .replacingOccurrences(of: "]]>", with: "")
        return raw.isEmpty ? nil : raw
    }

    private func importBookmarks() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.html]
        panel.prompt = "Import"
        panel.message = "Select a bookmarks.html file to import"

        guard panel.runModal() == .OK, let url = panel.url else { return }

        guard let resourcePath = Bundle.main.resourcePath else {
            errorMessage = "Could not find PullRead binary in app bundle."
            showingError = true
            return
        }

        let binaryPath = "\(resourcePath)/pullread"
        guard FileManager.default.fileExists(atPath: binaryPath) else {
            errorMessage = "PullRead binary not found. Please reinstall the app."
            showingError = true
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: binaryPath)
        process.arguments = ["import", url.path, "--config-path", configPath, "--data-path", (configPath as NSString).deletingLastPathComponent + "/pullread.db"]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try process.run()
                process.waitUntilExit()
                let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                DispatchQueue.main.async {
                    if process.terminationStatus == 0 {
                        let summary = output.components(separatedBy: "\n").last(where: { $0.contains("Done:") }) ?? "Import completed"
                        errorMessage = summary
                        showingError = true
                    } else {
                        errorMessage = "Import failed: \(output)"
                        showingError = true
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    errorMessage = "Failed to run import: \(error.localizedDescription)"
                    showingError = true
                }
            }
        }
    }

    /// Load existing config so the Welcome Guide reflects current settings
    private func loadExistingConfig() {
        guard FileManager.default.fileExists(atPath: configPath),
              let data = FileManager.default.contents(atPath: configPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        if let path = json["outputPath"] as? String {
            outputPath = path
        }

        if let feedsDict = json["feeds"] as? [String: String] {
            feeds = feedsDict.map { FeedItem(name: $0.key, url: $0.value) }
                .sorted { $0.name.lowercased() < $1.name.lowercased() }
        }

        if let cookies = json["useBrowserCookies"] as? Bool {
            useBrowserCookies = cookies
        }
    }

    private func saveConfig() {
        var feedsDict: [String: String] = [:]
        for feed in feeds {
            feedsDict[feed.name] = feed.url
        }

        var config: [String: Any] = [
            "outputPath": outputPath,
            "feeds": feedsDict
        ]

        if useBrowserCookies {
            config["useBrowserCookies"] = true
        }

        do {
            let data = try JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted, .sortedKeys])

            let configURL = URL(fileURLWithPath: configPath)
            let parentDir = configURL.deletingLastPathComponent().path
            if !FileManager.default.fileExists(atPath: parentDir) {
                try FileManager.default.createDirectory(atPath: parentDir, withIntermediateDirectories: true)
            }

            try data.write(to: configURL)

            let expandedPath = outputPath.hasPrefix("~")
                ? outputPath.replacingOccurrences(of: "~", with: FileManager.default.homeDirectoryForCurrentUser.path)
                : outputPath

            if !FileManager.default.fileExists(atPath: expandedPath) {
                try FileManager.default.createDirectory(atPath: expandedPath, withIntermediateDirectories: true)
            }
        } catch {
            errorMessage = "Failed to save configuration: \(error.localizedDescription)"
            showingError = true
        }
    }

    private func runFirstSync() {
        isSyncing = true
        // Save config first
        saveConfig()

        // Run sync via the bundled binary
        DispatchQueue.global(qos: .userInitiated).async {
            let syncService = SyncService()
            syncService.sync(retryFailed: false) { result in
                DispatchQueue.main.async {
                    isSyncing = false
                    syncComplete = true
                }
            }
        }
    }
}

#Preview {
    OnboardingView(
        isPresented: .constant(true),
        configPath: "/tmp/feeds.json"
    )
}
