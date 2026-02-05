// ABOUTME: SwiftUI view showing post-update highlights
// ABOUTME: Displayed after app updates to communicate what changed

import SwiftUI

struct WhatsNewView: View {
    let version: String
    var onDismiss: (() -> Void)?

    var body: some View {
        ZStack {
            VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)
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
    WhatsNewView(version: "1.0")
}
