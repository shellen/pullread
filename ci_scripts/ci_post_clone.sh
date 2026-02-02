#!/bin/bash
# ABOUTME: Xcode Cloud post-clone script
# ABOUTME: Runs after repository is cloned, before build starts

set -e

echo "=== PullRead Xcode Cloud Post-Clone Script ==="
echo "Running on: $(sw_vers -productName) $(sw_vers -productVersion)"
echo "Xcode version: $(xcodebuild -version | head -1)"

# Navigate to the project directory
cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "Repository path: $CI_PRIMARY_REPOSITORY_PATH"
echo "Build directory: $CI_DERIVED_DATA_PATH"

# Install Node.js dependencies if needed for bundled version
if [ -f "package.json" ]; then
    echo "Installing Node.js dependencies..."

    # Check if node is available
    if command -v node &> /dev/null; then
        echo "Node.js version: $(node --version)"
        npm ci --production
    else
        echo "Node.js not found, skipping npm install"
    fi
fi

echo "=== Post-clone script completed ==="
