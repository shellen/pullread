#!/bin/bash
# ABOUTME: Copies the Bun-compiled pullread binary to the Tauri sidecar location
# ABOUTME: Handles target triple naming required by Tauri's externalBin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SIDECAR_DIR="$ROOT_DIR/src-tauri/binaries"

# Detect current platform target triple
TARGET="${1:-$(rustc -vV 2>/dev/null | grep 'host:' | cut -d' ' -f2)}"
if [ -z "$TARGET" ]; then
    echo "Error: Could not detect target triple. Pass it as argument: $0 <target>"
    exit 1
fi

# Find the compiled Bun binary
BUN_BIN=""
if [ -f "$ROOT_DIR/dist/pullread" ]; then
    BUN_BIN="$ROOT_DIR/dist/pullread"
elif [ -f "$ROOT_DIR/dist/pullread-arm64" ] && [[ "$TARGET" == *"aarch64"* ]]; then
    BUN_BIN="$ROOT_DIR/dist/pullread-arm64"
elif [ -f "$ROOT_DIR/dist/pullread-x64" ] && [[ "$TARGET" == *"x86_64"* ]]; then
    BUN_BIN="$ROOT_DIR/dist/pullread-x64"
else
    echo "Error: No compiled binary found in dist/"
    echo "Run: bun build src/index.ts --compile --outfile dist/pullread"
    exit 1
fi

mkdir -p "$SIDECAR_DIR"

DEST="$SIDECAR_DIR/pullread-cli-$TARGET"
echo "Copying $BUN_BIN -> $DEST"
cp "$BUN_BIN" "$DEST"
chmod +x "$DEST"

echo "Sidecar ready: $DEST ($(du -h "$DEST" | cut -f1))"
