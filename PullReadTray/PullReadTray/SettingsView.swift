// ABOUTME: SwiftUI Settings view for configuring PullRead
// ABOUTME: Allows users to set output folder, manage feeds, and configure browser cookies

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
    @State private var useBrowserCookies: Bool = false
    @State private var showingCookieInfo: Bool = false
    @State private var llmProvider: String = "anthropic"
    @State private var llmApiKey: String = ""
    @State private var llmModel: String = ""

    let configPath: String
    var onSave: (() -> Void)?
    var onFirstRunComplete: (() -> Void)?
    var isFirstRun: Bool

    init(isPresented: Binding<Bool>, configPath: String, onSave: (() -> Void)? = nil, onFirstRunComplete: (() -> Void)? = nil, isFirstRun: Bool = false) {
        self._isPresented = isPresented
        self.configPath = configPath
        self.onSave = onSave
        self.onFirstRunComplete = onFirstRunComplete
        self.isFirstRun = isFirstRun
    }

    var body: some View {
        ZStack {
            // Glass background
            VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if isFirstRun {
                        welcomeHeader
                    }

                    outputFolderSection

                    feedsSection

                    browserCookiesSection

                    llmSection

                    buttonRow
                }
                .padding(24)
            }
        }
        .frame(width: 520, height: isFirstRun ? 620 : 580)
        .onAppear {
            loadConfig()
        }
        .alert("Error", isPresented: $showingError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage)
        }
        .sheet(isPresented: $showingCookieInfo) {
            cookieInfoSheet
        }
    }

    // MARK: - Welcome Header

    private var welcomeHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "doc.text.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(.linearGradient(
                        colors: [.blue, .purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                VStack(alignment: .leading) {
                    Text("Welcome to PullRead")
                        .font(.title2)
                        .fontWeight(.semibold)
                    Text("Sync RSS feeds to markdown files")
                        .foregroundColor(.secondary)
                }
            }
            .padding(.bottom, 4)

            Text("PullRead syncs your RSS and Atom feeds into clean markdown files, saved to a folder you choose. Add your feeds below and you're ready to go.")
                .font(.callout)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Output Folder Section

    private var outputFolderSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    if isFirstRun {
                        Text("1.")
                            .font(.headline)
                            .foregroundColor(.secondary)
                    }
                    Label("Choose Output Folder", systemImage: "folder.fill")
                        .font(.headline)
                        .foregroundColor(.primary)
                }

                Text("Synced articles will be saved as markdown files here.")
                    .font(.caption)
                    .foregroundColor(.secondary)

                HStack {
                    TextField("~/Articles", text: $outputPath)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color(NSColor.textBackgroundColor).opacity(0.5))
                        .cornerRadius(6)

                    Button(action: selectOutputFolder) {
                        Label("Browse", systemImage: "folder.badge.plus")
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    // MARK: - Feeds Section

    private var feedsSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    if isFirstRun {
                        Text("2.")
                            .font(.headline)
                            .foregroundColor(.secondary)
                    }
                    Label("Add Your Feeds", systemImage: "antenna.radiowaves.left.and.right")
                        .font(.headline)
                        .foregroundColor(.primary)
                }

                Text("Add RSS or Atom feed URLs to sync.")
                    .font(.caption)
                    .foregroundColor(.secondary)

                // Feed list
                List(selection: $selectedFeed) {
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
                        }
                        .tag(feed.id)
                        .padding(.vertical, 2)
                    }
                    .onDelete(perform: deleteFeed)
                }
                .listStyle(.inset)
                .frame(height: 140)
                .background(Color(NSColor.textBackgroundColor).opacity(0.3))
                .cornerRadius(8)

                // Add new feed
                HStack(spacing: 8) {
                    TextField("Name", text: $newFeedName)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .frame(width: 100)
                        .background(Color(NSColor.textBackgroundColor).opacity(0.5))
                        .cornerRadius(6)

                    TextField("Feed URL", text: $newFeedURL)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color(NSColor.textBackgroundColor).opacity(0.5))
                        .cornerRadius(6)

                    Button(action: addFeed) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                    }
                    .buttonStyle(.borderless)
                    .disabled(newFeedName.isEmpty || newFeedURL.isEmpty)
                }

                // Remove selected button
                if selectedFeed != nil {
                    Button(action: {
                        if let id = selectedFeed {
                            feeds.removeAll { $0.id == id }
                            selectedFeed = nil
                        }
                    }) {
                        Label("Remove Selected", systemImage: "trash")
                    }
                    .foregroundColor(.red)
                    .buttonStyle(.borderless)
                }
            }
        }
    }

    // MARK: - Browser Cookies Section

    private var browserCookiesSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    if isFirstRun {
                        Text("3.")
                            .font(.headline)
                            .foregroundColor(.secondary)
                    }
                    Label("Options", systemImage: "key.fill")
                        .font(.headline)
                        .foregroundColor(.primary)

                    Spacer()

                    Button(action: { showingCookieInfo = true }) {
                        Image(systemName: "questionmark.circle")
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(.borderless)
                    .help("Learn more about browser cookies")
                }

                Text("Use your Chrome login sessions to access subscription content.")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Toggle(isOn: $useBrowserCookies) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Use Chrome Cookies")
                            .fontWeight(.medium)
                        Text("Access paywalled sites like NYTimes, WSJ, etc.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .toggleStyle(.switch)
                .padding(.vertical, 4)

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

    // MARK: - LLM Section

    private var llmSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    if isFirstRun {
                        Text("4.")
                            .font(.headline)
                            .foregroundColor(.secondary)
                    }
                    Label("AI Summaries (Optional)", systemImage: "sparkles")
                        .font(.headline)
                        .foregroundColor(.primary)
                }

                Text("Add your own API key to generate article summaries on demand. Your key is stored locally and never shared.")
                    .font(.caption)
                    .foregroundColor(.secondary)

                HStack(spacing: 8) {
                    Text("Provider")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(width: 60, alignment: .trailing)
                    Picker("", selection: $llmProvider) {
                        Text("Anthropic").tag("anthropic")
                        Text("OpenAI").tag("openai")
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 200)
                }

                HStack(spacing: 8) {
                    Text("API Key")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(width: 60, alignment: .trailing)
                    SecureField(llmProvider == "anthropic" ? "sk-ant-..." : "sk-...", text: $llmApiKey)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color(NSColor.textBackgroundColor).opacity(0.5))
                        .cornerRadius(6)
                }

                HStack(spacing: 8) {
                    Text("Model")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(width: 60, alignment: .trailing)
                    TextField(llmProvider == "anthropic" ? "claude-sonnet-4-5-20250929" : "gpt-4o-mini", text: $llmModel)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color(NSColor.textBackgroundColor).opacity(0.5))
                        .cornerRadius(6)
                    Text("optional")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                if !llmApiKey.isEmpty {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.shield.fill")
                            .foregroundColor(.green)
                        Text("Key stored locally at ~/.config/pullread/settings.json")
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

    // MARK: - Cookie Info Sheet

    private var cookieInfoSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "key.fill")
                    .font(.largeTitle)
                    .foregroundStyle(.linearGradient(
                        colors: [.orange, .yellow],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                Text("About Browser Cookies")
                    .font(.title2)
                    .fontWeight(.semibold)
            }
            .padding(.bottom, 8)

            VStack(alignment: .leading, spacing: 12) {
                InfoRow(
                    icon: "questionmark.circle.fill",
                    iconColor: .blue,
                    title: "Why do we need cookies?",
                    description: "Some websites like NYTimes and X.com require you to be logged in to view content. By using your Chrome cookies, PullRead can access articles you're subscribed to."
                )

                InfoRow(
                    icon: "lock.shield.fill",
                    iconColor: .green,
                    title: "How is this secure?",
                    description: "Your cookies are read directly from Chrome on your Mac and are only used locally to fetch articles. They are never uploaded or shared."
                )

                InfoRow(
                    icon: "key.fill",
                    iconColor: .orange,
                    title: "Keychain Access",
                    description: "The first time you sync, macOS will ask for permission to access \"Chrome Safe Storage\" in your Keychain. This is required to decrypt the cookies."
                )

                InfoRow(
                    icon: "hand.raised.fill",
                    iconColor: .purple,
                    title: "You're in control",
                    description: "You can disable this anytime. Without cookies, PullRead will still work for non-paywalled sites."
                )
            }

            Spacer()

            HStack {
                Spacer()
                Button("Got it") {
                    showingCookieInfo = false
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(width: 420, height: 440)
    }

    // MARK: - Button Row

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
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)
            .disabled(outputPath.isEmpty || feeds.isEmpty)
        }
        .padding(.top, 8)
    }

    // MARK: - Actions

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
        guard !newFeedName.isEmpty, !newFeedURL.isEmpty else { return }

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
            // Pre-fill defaults for first run
            if isFirstRun {
                outputPath = "~/Documents/PullRead"
                feeds = [
                    FeedItem(name: "Hacker News (100+)", url: "https://hnrss.org/newest?points=100")
                ]
            }
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

        // Load LLM settings from settings.json
        let settingsPath = (configPath as NSString).deletingLastPathComponent + "/settings.json"
        if let settingsData = FileManager.default.contents(atPath: settingsPath),
           let settings = try? JSONSerialization.jsonObject(with: settingsData) as? [String: Any],
           let llm = settings["llm"] as? [String: Any] {
            llmProvider = (llm["provider"] as? String) ?? "anthropic"
            llmApiKey = (llm["apiKey"] as? String) ?? ""
            llmModel = (llm["model"] as? String) ?? ""
        }
    }

    private func saveConfig() {
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

            // Save LLM settings to settings.json (separate from feeds config)
            if !llmApiKey.isEmpty {
                let settingsPath = (configPath as NSString).deletingLastPathComponent + "/settings.json"
                var existingSettings: [String: Any] = [:]
                if let settingsData = FileManager.default.contents(atPath: settingsPath),
                   let parsed = try? JSONSerialization.jsonObject(with: settingsData) as? [String: Any] {
                    existingSettings = parsed
                }
                var llm: [String: Any] = [
                    "provider": llmProvider,
                    "apiKey": llmApiKey
                ]
                if !llmModel.isEmpty {
                    llm["model"] = llmModel
                }
                existingSettings["llm"] = llm
                let settingsData = try JSONSerialization.data(withJSONObject: existingSettings, options: [.prettyPrinted, .sortedKeys])
                try settingsData.write(to: URL(fileURLWithPath: settingsPath))
            }

            isPresented = false
            if isFirstRun {
                onFirstRunComplete?()
            }
            onSave?()
        } catch {
            errorMessage = "Failed to save configuration: \(error.localizedDescription)"
            showingError = true
        }
    }
}

// MARK: - Supporting Views

struct GlassCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .background(.ultraThinMaterial)
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
    }
}

struct InfoRow: View {
    let icon: String
    let iconColor: Color
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(iconColor)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .fontWeight(.medium)
                Text(description)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct VisualEffectView: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    let blendingMode: NSVisualEffectView.BlendingMode

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .active
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
    }
}

#Preview {
    SettingsView(
        isPresented: .constant(true),
        configPath: "/tmp/feeds.json",
        isFirstRun: true
    )
}
