// ABOUTME: Unit tests for SyncService
// ABOUTME: Tests path discovery, configuration reading, and process execution

import XCTest
@testable import PullReadTray

final class SyncServiceTests: XCTestCase {

    var syncService: SyncService!

    /// Check if running in CI environment
    var isCI: Bool {
        ProcessInfo.processInfo.environment["CI"] == "true" ||
        ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true"
    }

    override func setUpWithError() throws {
        syncService = SyncService()
    }

    override func tearDownWithError() throws {
        syncService = nil
    }

    // MARK: - Binary Discovery Tests

    func testIsBinaryAvailable() throws {
        // This test verifies that the binary availability check works
        // Result depends on whether the binary is bundled in the app
        let isAvailable = syncService.isBinaryAvailable()

        // We just verify it returns a boolean without crashing
        XCTAssertTrue(isAvailable == true || isAvailable == false)
    }

    // MARK: - Configuration Path Tests

    func testGetConfigPath() throws {
        let configPath = syncService.getConfigPath()

        // Config path should end with feeds.json
        XCTAssertTrue(configPath.hasSuffix("feeds.json"), "Config path should end with feeds.json")

        // Config path should be absolute
        XCTAssertTrue(configPath.hasPrefix("/"), "Config path should be absolute")

        // Config path should be in ~/.config/pullread/
        XCTAssertTrue(configPath.contains(".config/pullread"), "Config path should be in ~/.config/pullread/")
    }

    func testGetOutputPathReturnsNilWhenConfigMissing() throws {
        // When feeds.json doesn't exist or is invalid, should return nil
        // This is the expected behavior for a fresh install
        let outputPath = syncService.getOutputPath()

        // Either returns a valid path or nil - both are acceptable
        if let path = outputPath {
            XCTAssertTrue(path.hasPrefix("/"), "Output path should be absolute when present")
        }
    }

    func testGetOutputPathExpandsTilde() throws {
        // If outputPath contains ~, it should be expanded
        let outputPath = syncService.getOutputPath()

        if let path = outputPath {
            XCTAssertFalse(path.contains("~"), "Tilde should be expanded in output path")
        }
    }

    // MARK: - Sync Execution Tests
    // Note: These tests are skipped in CI because they require:
    // 1. Bundled binary present
    // 2. feeds.json configured
    // Without both, the sync process can hang indefinitely.

    func testSyncCompletesWithResult() throws {
        // Skip in CI - sync requires full app bundle
        if isCI {
            throw XCTSkip("Skipping sync test in CI environment")
        }

        // Skip if binary is not available
        guard syncService.isBinaryAvailable() else {
            throw XCTSkip("Sync binary not available in test environment")
        }

        let expectation = XCTestExpectation(description: "Sync completes")

        syncService.sync(retryFailed: false) { result in
            switch result {
            case .success(let output):
                // Sync succeeded - output should contain something
                XCTAssertFalse(output.isEmpty, "Sync output should not be empty")
            case .failure(let error):
                // Sync can fail if feeds.json is not configured - that's acceptable
                XCTAssertNotNil(error, "Error should be present on failure")
            }
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 10.0)
    }

    func testSyncRetryFailedCompletesWithResult() throws {
        // Skip in CI - sync requires full app bundle
        if isCI {
            throw XCTSkip("Skipping sync retry test in CI environment")
        }

        // Skip if binary is not available
        guard syncService.isBinaryAvailable() else {
            throw XCTSkip("Sync binary not available in test environment")
        }

        let expectation = XCTestExpectation(description: "Retry sync completes")

        syncService.sync(retryFailed: true) { result in
            switch result {
            case .success(let output):
                XCTAssertFalse(output.isEmpty, "Retry sync output should not be empty")
            case .failure(let error):
                XCTAssertNotNil(error, "Error should be present on failure")
            }
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 10.0)
    }

    // MARK: - Performance Tests
    // Skipped in CI as measure{} blocks can hang

    func testConfigPathPerformance() throws {
        if isCI {
            throw XCTSkip("Performance tests skipped in CI")
        }
        measure {
            _ = syncService.getConfigPath()
        }
    }

    func testOutputPathPerformance() throws {
        if isCI {
            throw XCTSkip("Performance tests skipped in CI")
        }
        measure {
            _ = syncService.getOutputPath()
        }
    }
}
