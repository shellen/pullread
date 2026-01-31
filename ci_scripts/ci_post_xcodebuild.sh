#!/bin/bash
# ABOUTME: Xcode Cloud post-build script
# ABOUTME: Runs after xcodebuild completes

set -e

echo "=== PullRead Xcode Cloud Post-Build Script ==="

# Log build artifacts location
if [ -n "$CI_ARCHIVE_PATH" ]; then
    echo "Archive path: $CI_ARCHIVE_PATH"
fi

if [ -n "$CI_PRODUCT_PATH" ]; then
    echo "Product path: $CI_PRODUCT_PATH"
    ls -la "$CI_PRODUCT_PATH" || true
fi

echo "=== Post-build script completed ==="
