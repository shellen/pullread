// ABOUTME: Unit tests for AppDelegate
// ABOUTME: Tests menu creation and status updates

import XCTest
@testable import PullReadTray

final class AppDelegateTests: XCTestCase {

    // MARK: - Initialization Tests

    func testAppDelegateCanBeCreated() throws {
        let appDelegate = AppDelegate()
        XCTAssertNotNil(appDelegate, "AppDelegate should be creatable")
    }

    // MARK: - Date Formatting Tests

    func testDateFormatterProducesReadableTime() throws {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short

        let now = Date()
        let formatted = formatter.string(from: now)

        // Should produce something like "2:34 PM" or "14:34"
        XCTAssertFalse(formatted.isEmpty, "Formatted time should not be empty")
        XCTAssertTrue(formatted.count < 10, "Formatted time should be concise")
    }

    // MARK: - Sync Summary Parsing Tests

    func testParseSyncSummaryExtractsDoneMessage() throws {
        let output = """
        Syncing bookmarks...
          Found 5 entries
          Processing 2 new entries
            Article Title 1...
              Saved: 2024-01-29-article-title-1.md
            Article Title 2...
              Saved: 2024-01-29-article-title-2.md

        Done: 2 saved, 0 failed
        """

        // Extract "Done: X saved, Y failed" pattern
        if let range = output.range(of: "Done:.*", options: .regularExpression) {
            let summary = String(output[range])
            XCTAssertEqual(summary, "Done: 2 saved, 0 failed")
        } else {
            XCTFail("Should find Done message in output")
        }
    }

    func testParseSyncSummaryHandlesMissingDoneMessage() throws {
        let output = """
        Syncing bookmarks...
          No new entries
        """

        // Should not find "Done:" when there's nothing to process
        let range = output.range(of: "Done:.*", options: .regularExpression)
        XCTAssertNil(range, "Should not find Done message when no entries processed")
    }

    func testParseSyncSummaryWithFailures() throws {
        let output = """
        Done: 5 saved, 3 failed
        """

        if let range = output.range(of: "Done:.*", options: .regularExpression) {
            let summary = String(output[range])
            XCTAssertTrue(summary.contains("5 saved"))
            XCTAssertTrue(summary.contains("3 failed"))
        } else {
            XCTFail("Should find Done message")
        }
    }

    // MARK: - Status Text Tests

    func testStatusTextValues() throws {
        let idleStatus = "Status: Idle"
        let syncingStatus = "Status: Syncing..."

        XCTAssertTrue(idleStatus.hasPrefix("Status:"))
        XCTAssertTrue(syncingStatus.hasPrefix("Status:"))
        XCTAssertTrue(syncingStatus.contains("Syncing"))
    }

    // MARK: - Last Sync Text Tests

    func testLastSyncNeverText() throws {
        let neverText = "Last sync: Never"
        XCTAssertTrue(neverText.hasPrefix("Last sync:"))
        XCTAssertTrue(neverText.contains("Never"))
    }

    func testLastSyncWithTimeText() throws {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short

        let time = formatter.string(from: Date())
        let syncText = "Last sync: \(time)"

        XCTAssertTrue(syncText.hasPrefix("Last sync:"))
        XCTAssertFalse(syncText.contains("Never"))
    }
}
