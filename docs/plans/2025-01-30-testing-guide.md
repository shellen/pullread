# PullReadTray Testing Guide

## Overview

PullReadTray has three types of tests:
- **Unit Tests** (`PullReadTrayTests`) - Test SyncService and AppDelegate logic
- **UI Tests** (`PullReadTrayUITests`) - Test menu bar interactions
- **Performance Tests** - Measure execution time of critical paths

## Local Testing Setup

### Prerequisites

1. **Xcode 15+** installed
2. **Node.js** installed (for sync tests)
3. **PullRead configured** with `feeds.json` (for sync tests)

### Running Tests Locally

```bash
cd PullReadTray

# Run all tests
xcodebuild test \
  -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -destination 'platform=macOS'

# Run only unit tests
xcodebuild test \
  -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -destination 'platform=macOS' \
  -only-testing:PullReadTrayTests

# Run only UI tests
xcodebuild test \
  -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -destination 'platform=macOS' \
  -only-testing:PullReadTrayUITests

# Run with verbose output (no xcpretty)
xcodebuild test \
  -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -destination 'platform=macOS' \
  -only-testing:PullReadTrayTests \
  2>&1 | tee test-output.log
```

### Running in Xcode

1. Open `PullReadTray.xcodeproj`
2. Press `Cmd+U` to run all tests
3. Or use the Test Navigator (Cmd+6) to run individual tests

## Test Categories

### Unit Tests (Safe for CI)

These tests don't require external dependencies and won't hang:

| Test | Description |
|------|-------------|
| `testIsNodeAvailable` | Checks Node.js detection returns boolean |
| `testGetConfigPath` | Validates config path format |
| `testGetOutputPathReturnsNilWhenConfigMissing` | Handles missing config |
| `testGetOutputPathExpandsTilde` | Validates tilde expansion |

### Sync Tests (Local Only)

These tests **require full setup** and are **skipped in CI**:

| Test | Requirements |
|------|-------------|
| `testSyncCompletesWithResult` | Node.js + npm deps + feeds.json |
| `testSyncRetryFailedCompletesWithResult` | Node.js + npm deps + feeds.json |

**Why skipped in CI:**
- GitHub runners have Node.js but not the npm dependencies
- No `feeds.json` configuration exists
- The npm process can hang waiting for missing dependencies

### Performance Tests (May hang in CI)

| Test | Notes |
|------|-------|
| `testConfigPathPerformance` | Uses `measure {}` block |
| `testOutputPathPerformance` | Uses `measure {}` block |

**Note:** `measure` blocks run the code 10 times and can sometimes hang in constrained environments.

### UI Tests (Unreliable in CI)

| Test | Notes |
|------|-------|
| `testAppLaunches` | May fail due to permissions |
| `testMenuBarItemExists` | Requires accessibility permissions |
| `testLaunchPerformance` | Performance measurement |

## CI Environment Detection

Tests detect CI via environment variables:

```swift
var isCI: Bool {
    ProcessInfo.processInfo.environment["CI"] == "true" ||
    ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true"
}
```

GitHub Actions sets both `CI=true` and `GITHUB_ACTIONS=true`.

## Troubleshooting

### Tests Hang Locally

1. **Check Node.js:** `which node`
2. **Check npm deps:** `cd .. && npm install`
3. **Check feeds.json:** `ls ../feeds.json`
4. **Reduce timeout:** Edit test to use shorter timeout

### Tests Hang in CI

1. Sync tests should auto-skip (check CI detection)
2. Performance tests may hang - consider skipping in CI
3. UI tests have `continue-on-error: true`

### Viewing Test Logs

```bash
# Local: Check Xcode's Report Navigator (Cmd+9)

# CI: Download test-results artifact from GitHub Actions
# Or check the raw xcodebuild output in the workflow logs
```

## Writing New Tests

### Safe Tests (CI-Compatible)

```swift
func testSomethingSimple() throws {
    let result = syncService.someMethod()
    XCTAssertNotNil(result)
}
```

### Tests That Need Skipping

```swift
func testSomethingThatMightHang() throws {
    // Skip in CI
    if isCI {
        throw XCTSkip("Requires local environment")
    }

    // ... test code
}
```

### Async Tests

```swift
func testAsyncOperation() throws {
    if isCI {
        throw XCTSkip("Async test skipped in CI")
    }

    let expectation = XCTestExpectation(description: "Completes")

    someAsyncMethod { result in
        XCTAssertNotNil(result)
        expectation.fulfill()
    }

    wait(for: [expectation], timeout: 5.0)  // Keep timeout short
}
```

## Recommended CI Strategy

For reliable CI, only run tests that:
1. Don't require external processes (Node.js, npm)
2. Don't use `measure {}` blocks
3. Don't require UI/accessibility permissions
4. Complete in < 5 seconds

Everything else should use `XCTSkip` in CI or be excluded via `-skip-testing`.
