#!/bin/bash
# ABOUTME: Downloads the Kokoro TTS ONNX model for bundling into the app
# ABOUTME: Run during build to pre-download so users never need to fetch it

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODEL_DIR="$ROOT_DIR/dist/kokoro-model"
REPO="onnx-community/Kokoro-82M-v1.0-ONNX"
HF_BASE="https://huggingface.co/$REPO/resolve/main"

# q8 model by default (86MB, best quality). Pass "q4" as $1 for smaller build.
DTYPE="${1:-q8}"

echo "==> Downloading Kokoro TTS model ($DTYPE) for bundling..."

mkdir -p "$MODEL_DIR"

# Download model files from HuggingFace
# The kokoro-js library expects these files in the cache structure
FILES=(
  "config.json"
  "tokenizer.json"
)

if [ "$DTYPE" = "q4" ]; then
  FILES+=("onnx/model_q4.onnx")
  echo "  Using q4 quantization (~47MB)"
else
  FILES+=("onnx/model_q8.onnx")
  echo "  Using q8 quantization (~86MB)"
fi

# Also need the voices/phoneme data
FILES+=(
  "voices.bin"
)

for f in "${FILES[@]}"; do
  DEST="$MODEL_DIR/$f"
  mkdir -p "$(dirname "$DEST")"
  if [ -f "$DEST" ]; then
    echo "  Already cached: $f"
  else
    echo "  Downloading: $f"
    curl -fSL --retry 3 "$HF_BASE/$f" -o "$DEST"
  fi
done

# Write a marker file so tts.ts knows this is a valid bundled model dir
echo "$DTYPE" > "$MODEL_DIR/.bundled"

SIZE=$(du -sh "$MODEL_DIR" | cut -f1)
echo "==> Kokoro model ready ($SIZE): $MODEL_DIR"
