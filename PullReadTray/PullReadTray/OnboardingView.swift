// ABOUTME: Multi-step onboarding wizard for first-run experience
// ABOUTME: Guides new users through setup with Back/Next navigation

import SwiftUI
import AppKit

struct OnboardingView: View {
    @Binding var isPresented: Bool
    @State private var currentStep = 0
    @State private var outputPath: String = "~/Documents/PullRead"
    @State private var feeds: [FeedItem] = [
        FeedItem(name: "Hacker News (100+)", url: "https://hnrss.org/newest?points=100")
    ]
    @State private var newFeedName: String = ""
    @State private var newFeedURL: String = ""
    @State private var useBrowserCookies: Bool = false
    @State private var isSyncing: Bool = false
    @State private var syncComplete: Bool = false
    @State private var showingError: Bool = false
    @State private var errorMessage: String = ""

    let configPath: String
    var onComplete: (() -> Void)?

    private let totalSteps = 5

    var body: some View {
        ZStack {
            VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)
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
                        case 4: readyStep
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
        .frame(width: 520, height: 540)
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

            Image(systemName: "doc.text.fill")
                .font(.system(size: 56))
                .foregroundStyle(.linearGradient(
                    colors: [.blue, .purple],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))

            Text("Welcome to PullRead")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("PullRead turns your RSS feeds into a local library of clean, readable markdown files.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)

            Spacer()
        }
    }

    // MARK: - Step 2: Output Folder

    private var outputFolderStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeader(
                icon: "folder.fill",
                iconColor: .blue,
                title: "Choose Output Folder",
                subtitle: "This is where your synced articles will be saved as markdown files. Pick any folder — a cloud-synced folder like Dropbox or iCloud works great."
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

    // MARK: - Step 3: Add Feeds

    private var feedsStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeader(
                icon: "antenna.radiowaves.left.and.right",
                iconColor: .orange,
                title: "Add Your Feeds",
                subtitle: "Add RSS or Atom feed URLs to sync. We've included a sample feed to get you started."
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

                    Divider()

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
                }
            }

            // Feed suggestions
            VStack(alignment: .leading, spacing: 8) {
                Text("Popular feeds:")
                    .font(.caption)
                    .foregroundColor(.secondary)

                HStack(spacing: 8) {
                    suggestionChip(name: "TechCrunch", url: "https://techcrunch.com/feed/")
                    suggestionChip(name: "Daring Fireball", url: "https://daringfireball.net/feeds/main")
                    suggestionChip(name: "The Verge", url: "https://www.theverge.com/rss/index.xml")
                }
            }
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

    // MARK: - Step 5: Ready

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
                Text("Your first sync is complete. Look for the PullRead icon in your menu bar to sync, view articles, and manage settings.")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 380)
            } else {
                Text("Your feeds are configured. Run your first sync to start reading.")
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
                    if currentStep == 2 && feeds.isEmpty {
                        errorMessage = "Please add at least one feed."
                        showingError = true
                        return
                    }
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

    private func suggestionChip(name: String, url: String) -> some View {
        Button(action: {
            let alreadyAdded = feeds.contains { $0.url == url }
            if !alreadyAdded {
                feeds.append(FeedItem(name: name, url: url))
            }
        }) {
            Text("+ \(name)")
                .font(.caption)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.accentColor.opacity(0.1))
                .cornerRadius(12)
        }
        .buttonStyle(.borderless)
        .disabled(feeds.contains { $0.url == url })
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
        guard !newFeedName.isEmpty, !newFeedURL.isEmpty else { return }

        var urlString = newFeedURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if !urlString.hasPrefix("http://") && !urlString.hasPrefix("https://") {
            urlString = "https://" + urlString
        }

        feeds.append(FeedItem(name: newFeedName.trimmingCharacters(in: .whitespaces), url: urlString))
        newFeedName = ""
        newFeedURL = ""
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
