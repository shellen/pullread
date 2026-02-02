#!/bin/bash
# ABOUTME: Xcode Cloud pre-build script
# ABOUTME: Runs before xcodebuild starts

set -e

echo "=== PullRead Xcode Cloud Pre-Build Script ==="

# Set build number from CI build number
if [ -n "$CI_BUILD_NUMBER" ]; then
    echo "Setting build number to: $CI_BUILD_NUMBER"

    # Update Info.plist with build number
    PLIST_PATH="$CI_PRIMARY_REPOSITORY_PATH/PullReadTray/PullReadTray/Info.plist"
    if [ -f "$PLIST_PATH" ]; then
        /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $CI_BUILD_NUMBER" "$PLIST_PATH" || true
    fi
fi

echo "=== Pre-build script completed ==="
