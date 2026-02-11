#!/bin/bash
# ABOUTME: Full build pipeline for PullRead Tauri app
# ABOUTME: Builds Bun sidecar, prepares it for Tauri, then builds the Tauri app

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== PullRead Tauri Build ==="
echo ""

# Step 1: Install Node dependencies
echo "Step 1: Installing dependencies..."
cd "$ROOT_DIR"
bun install

# Step 2: Embed viewer HTML
echo ""
echo "Step 2: Embedding viewer..."
bun scripts/embed-viewer.ts

# Step 3: Build Bun binary
echo ""
echo "Step 3: Building Bun CLI binary..."
TARGET_TRIPLE="${TARGET:-$(rustc -vV 2>/dev/null | grep 'host:' | cut -d' ' -f2)}"

if [[ "$TARGET_TRIPLE" == *"aarch64-apple"* ]]; then
    bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile dist/pullread
elif [[ "$TARGET_TRIPLE" == *"x86_64-apple"* ]]; then
    bun build src/index.ts --compile --target=bun-darwin-x64 --outfile dist/pullread
elif [[ "$TARGET_TRIPLE" == *"linux"* ]]; then
    bun build src/index.ts --compile --target=bun-linux-x64 --outfile dist/pullread
else
    bun build src/index.ts --compile --outfile dist/pullread
fi

echo "  Binary: dist/pullread ($(du -h dist/pullread | cut -f1))"

# Step 4: Prepare sidecar
echo ""
echo "Step 4: Preparing sidecar..."
bash "$SCRIPT_DIR/prepare-sidecar.sh" "$TARGET_TRIPLE"

# Step 5: Sign sidecar (macOS only, if signing identity available)
if [[ "$OSTYPE" == "darwin"* ]] && [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
    echo ""
    echo "Step 5: Code-signing sidecar..."
    SIDECAR="$ROOT_DIR/src-tauri/binaries/pullread-cli-$TARGET_TRIPLE"
    codesign --force --options runtime --sign "$APPLE_SIGNING_IDENTITY" "$SIDECAR"
    echo "  Signed: $SIDECAR"
else
    echo ""
    echo "Step 5: Skipping code signing (no APPLE_SIGNING_IDENTITY set)"
fi

# Step 6: Build Tauri app
echo ""
echo "Step 6: Building Tauri app..."
cd "$ROOT_DIR"

if [ "${RELEASE:-}" = "1" ]; then
    cargo tauri build
else
    cargo tauri build --debug
fi

echo ""
echo "=== Build complete ==="

# Show output artifacts
if [ -d "$ROOT_DIR/src-tauri/target/release/bundle" ]; then
    echo "Artifacts:"
    find "$ROOT_DIR/src-tauri/target/release/bundle" -name "*.dmg" -o -name "*.app" -o -name "*.msi" -o -name "*.AppImage" 2>/dev/null | while read f; do
        echo "  $f ($(du -h "$f" | cut -f1))"
    done
fi
