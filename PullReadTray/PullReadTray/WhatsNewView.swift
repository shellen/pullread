// ABOUTME: SwiftUI view showing post-update highlights
// ABOUTME: Displayed after app updates to communicate what changed

import SwiftUI

struct WhatsNewView: View {
    let version: String
    var onDismiss: (() -> Void)?

    var body: some View {
        ZStack {
            // Opaque background — avoids liquid glass transparency issues
            VisualEffectView(material: .sidebar, blendingMode: .behindWindow)
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    Image(systemName: "sparkles")
                        .font(.system(size: 28))
                        .foregroundStyle(.linearGradient(
                            colors: [.blue, .purple],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                    VStack(alignment: .leading) {
                        Text("What's New")
                            .font(.title2)
                            .fontWeight(.semibold)
                        Text("Version \(version)")
                            .foregroundColor(.secondary)
                    }
                }

                // Release highlights
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(highlights(for: version), id: \.title) { item in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: item.icon)
                                .font(.title3)
                                .foregroundColor(item.color)
                                .frame(width: 24)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .fontWeight(.medium)
                                Text(item.description)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }

                Spacer()

                // Dismiss button
                HStack {
                    Spacer()
                    Button("Got it") {
                        onDismiss?()
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                }
            }
            .padding(24)
        }
        .frame(width: 420, height: 380)
    }

    // MARK: - Release Notes Data

    private struct Highlight: Identifiable {
        var id: String { title }
        let icon: String
        let color: Color
        let title: String
        let description: String
    }

    private func highlights(for version: String) -> [Highlight] {
        // Add entries here for each release.
        // When the release cadence increases, move this to a bundled JSON file.
        return releaseNotes[version] ?? defaultHighlights
    }

    private var releaseNotes: [String: [Highlight]] {
        [
            "1.3.2": [
                Highlight(
                    icon: "key.fill",
                    color: .green,
                    title: "Keychain Security",
                    description: "API keys are now stored in the macOS Keychain instead of plaintext. Existing keys are migrated automatically."
                ),
                Highlight(
                    icon: "square.and.arrow.up",
                    color: .blue,
                    title: "Share Extension",
                    description: "Save articles from Safari or any app using the Share sheet. Works alongside your existing Instapaper, Pocket, or Raindrop workflow."
                ),
                Highlight(
                    icon: "magnifyingglass",
                    color: .purple,
                    title: "Spotlight Search",
                    description: "Your articles are indexed in Spotlight. Search for any article title, author, or tag right from the macOS search bar."
                ),
                Highlight(
                    icon: "command",
                    color: .orange,
                    title: "Shortcuts & Siri",
                    description: "Save articles, sync feeds, and check your library using Shortcuts or Siri voice commands."
                ),
                Highlight(
                    icon: "link",
                    color: .teal,
                    title: "URL Scheme & Services Menu",
                    description: "Deep link with pullread:// URLs. Right-click any URL and use Services \u{2192} Save to PullRead."
                )
            ],
            "1.3.0": [
                Highlight(
                    icon: "square.and.arrow.up",
                    color: .blue,
                    title: "Share Articles",
                    description: "Share any article to Bluesky, Threads, LinkedIn, email, or Messages directly from the reader. Copy links with one click."
                ),
                Highlight(
                    icon: "link",
                    color: .green,
                    title: "External Links Open in Browser",
                    description: "Links in articles now open in your default browser instead of navigating away from the reader."
                ),
                Highlight(
                    icon: "wand.and.stars",
                    color: .purple,
                    title: "Batch Machine Tagging",
                    description: "Tag All button in the sidebar generates AI-powered machine tags across your entire library. Use --force to re-tag everything."
                ),
                Highlight(
                    icon: "newspaper",
                    color: .orange,
                    title: "Apple News & Social Posts",
                    description: "Apple News links are resolved to original articles. Better extraction for Bluesky, Mastodon, and Reddit posts."
                ),
                Highlight(
                    icon: "arrow.triangle.2.circlepath",
                    color: .teal,
                    title: "Refresh & Update Fixes",
                    description: "New refresh button in the toolbar. Fixed Check for Updates reliability with improved Sparkle integration."
                )
            ],
            "1.2.0": [
                Highlight(
                    icon: "macwindow",
                    color: .blue,
                    title: "Built-in Article Viewer",
                    description: "View Articles now opens in a native in-app window instead of launching Safari. No URL bar — just your articles in a clean reader."
                ),
                Highlight(
                    icon: "tag.fill",
                    color: .purple,
                    title: "Machine Tags & Relational Mapping",
                    description: "Auto-generate topic, entity, and theme tags for articles using your AI provider. Tags power connections between articles."
                ),
                Highlight(
                    icon: "gearshape.fill",
                    color: .orange,
                    title: "New Preferences",
                    description: "Choose between in-app viewer or default browser. Toggle auto-tagging after sync. The app now appears in the Dock when the viewer is open."
                ),
                Highlight(
                    icon: "arrow.triangle.2.circlepath",
                    color: .green,
                    title: "Sparkle Update Fix",
                    description: "Auto-updates now initialize properly, fixing an issue where Check for Updates could fail silently."
                )
            ],
            "1.1.0": [
                Highlight(
                    icon: "book.fill",
                    color: .purple,
                    title: "Premium Reading Experience",
                    description: "Focus mode, reading progress, estimated read time, syntax highlighting, auto-generated table of contents, and print-optimized layouts."
                ),
                Highlight(
                    icon: "tag.fill",
                    color: .blue,
                    title: "Explore & Organize",
                    description: "Tag cloud, source groupings, and library stats help you discover patterns across your reading. Search now includes tags."
                ),
                Highlight(
                    icon: "globe",
                    color: .green,
                    title: "Multi-Browser Cookie Support",
                    description: "Now supports Chrome, Arc, Brave, and Edge for paywalled content. Your browser is auto-detected."
                ),
                Highlight(
                    icon: "paintbrush.fill",
                    color: .orange,
                    title: "Redesigned Settings & Viewer",
                    description: "Tabbed settings, favicons in the sidebar, hide-read toggle, daily and weekly AI reviews, and a Safari web app mode."
                )
            ],
            "1.0": [
                Highlight(
                    icon: "doc.text.fill",
                    color: .blue,
                    title: "Welcome to PullRead",
                    description: "Sync RSS and Atom feeds to clean, readable markdown files stored locally."
                ),
                Highlight(
                    icon: "eye.fill",
                    color: .purple,
                    title: "Built-in Article Reader",
                    description: "Browse synced articles in a distraction-free reader with themes, fonts, and keyboard navigation."
                ),
                Highlight(
                    icon: "key.fill",
                    color: .orange,
                    title: "Browser Cookie Support",
                    description: "Access paywalled content using your Chrome login sessions."
                ),
                Highlight(
                    icon: "arrow.triangle.2.circlepath",
                    color: .green,
                    title: "Smart Retry",
                    description: "Failed articles are tracked and can be retried without re-fetching everything."
                )
            ]
        ]
    }

    private var defaultHighlights: [Highlight] {
        [
            Highlight(
                icon: "star.fill",
                color: .yellow,
                title: "Improvements & Fixes",
                description: "This update includes various improvements and bug fixes."
            )
        ]
    }
}

#Preview {
    WhatsNewView(version: "1.3.0")
}
