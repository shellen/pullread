#!/bin/bash
# ABOUTME: Build, sign, and notarize Pull Read for distribution
# ABOUTME: Creates a signed and notarized DMG ready for GitHub Releases

set -e  # Exit on error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$ROOT_DIR/PullReadTray"
PROJECT_FILE="PullReadTray.xcodeproj"
SCHEME="PullReadTray"
APP_NAME="Pull Read"
DMG_NAME="PullRead.dmg"
KEYCHAIN_PROFILE="pullread-notarize"  # Created via: xcrun notarytool store-credentials

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_step() {
    echo -e "${GREEN}==>${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

echo_error() {
    echo -e "${RED}Error:${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    echo_step "Checking prerequisites..."

    if ! command -v xcodebuild &> /dev/null; then
        echo_error "xcodebuild not found. Install Xcode."
        exit 1
    fi

    if ! command -v bun &> /dev/null; then
        echo_error "bun not found. Install from https://bun.sh"
        exit 1
    fi

    if ! xcrun notarytool history --keychain-profile "$KEYCHAIN_PROFILE" &> /dev/null; then
        echo_error "Notarization credentials not found."
        echo ""
        echo "Run this command to store your credentials:"
        echo ""
        echo "  xcrun notarytool store-credentials \"$KEYCHAIN_PROFILE\" \\"
        echo "    --apple-id \"YOUR_APPLE_ID\" \\"
        echo "    --team-id \"YOUR_TEAM_ID\" \\"
        echo "    --password \"APP_SPECIFIC_PASSWORD\""
        echo ""
        echo "Create an app-specific password at: https://appleid.apple.com"
        exit 1
    fi

    if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
        echo_error "No 'Developer ID Application' certificate found in keychain."
        echo "Create one at: https://developer.apple.com/account/resources/certificates"
        exit 1
    fi

    echo "  All prerequisites met."
}

# Clean previous build
clean_build() {
    echo_step "Cleaning previous build..."
    rm -rf "$PROJECT_DIR/build"
    rm -rf "$ROOT_DIR/dist"
    rm -f "$PROJECT_DIR/$DMG_NAME"
}

# Build CLI binary
build_cli() {
    echo_step "Building PullRead CLI binary..."
    cd "$ROOT_DIR"

    # Install dependencies
    bun install

    # Embed viewer.html into the TypeScript source so the compiled
    # binary serves the viewer from memory (no external file needed)
    bun scripts/embed-viewer.ts

    # Build for current architecture
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
        bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile dist/pullread
    else
        bun build src/index.ts --compile --target=bun-darwin-x64 --outfile dist/pullread
    fi

    echo "  Built: dist/pullread"
}

# Build the app
build_app() {
    echo_step "Building $APP_NAME..."
    cd "$PROJECT_DIR"

    xcodebuild -project "$PROJECT_FILE" \
        -scheme "$SCHEME" \
        -configuration Release \
        -derivedDataPath build \
        clean build \
        | grep -E "(Build |Signing|error:|warning:)" || true

    APP_PATH="$PROJECT_DIR/build/Build/Products/Release/$APP_NAME.app"

    if [ ! -d "$APP_PATH" ]; then
        echo_error "Build failed - app not found at $APP_PATH"
        exit 1
    fi

    echo "  Built: $APP_PATH"
}

# Bundle CLI into app
bundle_cli() {
    echo_step "Bundling CLI binary into app..."
    APP_PATH="$PROJECT_DIR/build/Build/Products/Release/$APP_NAME.app"
    RESOURCES_PATH="$APP_PATH/Contents/Resources"

    # Copy binary (viewer.html is embedded in the binary at compile time)
    cp "$ROOT_DIR/dist/pullread" "$RESOURCES_PATH/"

    IDENTITY="Developer ID Application"

    # Sign the bundled CLI binary (hardened runtime + timestamp required for notarization)
    # Entitlements allow Kokoro's ONNX Runtime to load native libraries
    codesign --force --options runtime --timestamp \
        --entitlements "$ROOT_DIR/PullReadTray/cli-entitlements.plist" \
        --sign "$IDENTITY" "$RESOURCES_PATH/pullread"

    # Sign the main app binary
    codesign --force --options runtime --timestamp \
        --sign "$IDENTITY" "$APP_PATH/Contents/MacOS/$APP_NAME"

    # Sign the overall app bundle
    codesign --force --options runtime --timestamp \
        --sign "$IDENTITY" "$APP_PATH"

    echo "  CLI bundled and signed."
}

# Notarize the app
notarize_app() {
    echo_step "Notarizing $APP_NAME.app..."
    cd "$PROJECT_DIR/build/Build/Products/Release"

    # Create zip for notarization
    ditto -c -k --keepParent "$APP_NAME.app" "$APP_NAME.zip"

    # Submit for notarization
    echo "  Submitting to Apple (this may take a few minutes)..."
    xcrun notarytool submit "$APP_NAME.zip" \
        --keychain-profile "$KEYCHAIN_PROFILE" \
        --wait

    # Staple the ticket
    echo "  Stapling notarization ticket..."
    xcrun stapler staple "$APP_NAME.app"

    # Clean up zip
    rm "$APP_NAME.zip"

    echo "  App notarized successfully."
}

# Create DMG
create_dmg() {
    echo_step "Creating DMG..."
    cd "$PROJECT_DIR/build/Build/Products/Release"

    # Create DMG
    hdiutil create -volname "$APP_NAME" \
        -srcfolder "$APP_NAME.app" \
        -ov -format UDZO \
        "$DMG_NAME"

    echo "  Created: $DMG_NAME"
}

# Sign DMG
sign_dmg() {
    echo_step "Signing DMG..."
    cd "$PROJECT_DIR/build/Build/Products/Release"

    codesign --sign "Developer ID Application" \
        --timestamp \
        "$DMG_NAME"

    echo "  DMG signed."
}

# Notarize DMG
notarize_dmg() {
    echo_step "Notarizing DMG..."
    cd "$PROJECT_DIR/build/Build/Products/Release"

    echo "  Submitting to Apple..."
    xcrun notarytool submit "$DMG_NAME" \
        --keychain-profile "$KEYCHAIN_PROFILE" \
        --wait

    echo "  Stapling notarization ticket..."
    xcrun stapler staple "$DMG_NAME"

    echo "  DMG notarized successfully."
}

# Verify signatures
verify_signatures() {
    echo_step "Verifying signatures..."
    cd "$PROJECT_DIR/build/Build/Products/Release"

    echo "  Checking app..."
    spctl -a -v "$APP_NAME.app" 2>&1 | head -1

    echo "  Checking DMG..."
    spctl -a -v --type open --context context:primary-signature "$DMG_NAME" 2>&1 | head -1

    echo ""
    echo "  Verification complete."
}

# Copy to output location
finish() {
    cd "$PROJECT_DIR/build/Build/Products/Release"
    FINAL_PATH="$(pwd)/$DMG_NAME"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Build complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Signed and notarized DMG:"
    echo "  $FINAL_PATH"
    echo ""
    echo "To upload to GitHub Releases:"
    echo "  gh release create vX.X.X \"$FINAL_PATH\" --title \"Pull Read vX.X.X\""
    echo ""
}

# Main
main() {
    echo ""
    echo "Pull Read Release Builder"
    echo "========================="
    echo ""

    check_prerequisites
    clean_build
    build_cli
    build_app
    bundle_cli
    notarize_app
    create_dmg
    sign_dmg
    notarize_dmg
    verify_signatures
    finish
}

main "$@"
