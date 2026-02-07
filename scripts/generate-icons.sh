#!/bin/bash
# ABOUTME: Generate all macOS app icon sizes from a source image
# ABOUTME: Outputs PNG files into the Xcode AppIcon.appiconset directory

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ICON_DIR="$ROOT_DIR/PullReadTray/PullReadTray/Assets.xcassets/AppIcon.appiconset"

SOURCE_IMAGE="${1:-}"

if [ -z "$SOURCE_IMAGE" ]; then
    echo "Usage: $0 <source-image.png>"
    echo ""
    echo "Generates all required macOS app icon sizes from a high-resolution source image."
    echo "The source image should be at least 1024x1024 pixels."
    echo ""
    echo "Output directory: $ICON_DIR"
    exit 1
fi

if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "Error: Source image not found: $SOURCE_IMAGE"
    exit 1
fi

# Check for sips (macOS) or Python Pillow
if command -v sips &> /dev/null; then
    RESIZE_TOOL="sips"
elif python3 -c "from PIL import Image" 2>/dev/null; then
    RESIZE_TOOL="pillow"
else
    echo "Error: Need either sips (macOS) or Python Pillow to resize images."
    echo "Install Pillow with: pip3 install Pillow"
    exit 1
fi

resize_image() {
    local src="$1"
    local dst="$2"
    local size="$3"

    if [ "$RESIZE_TOOL" = "sips" ]; then
        cp "$src" "$dst"
        sips -z "$size" "$size" "$dst" > /dev/null 2>&1
    else
        python3 -c "
from PIL import Image
img = Image.open('$src')
img = img.resize(($size, $size), Image.LANCZOS)
img.save('$dst')
"
    fi
}

echo "Generating macOS app icons from: $SOURCE_IMAGE"
echo "Output: $ICON_DIR"
echo ""

# macOS icon sizes: size x scale = pixel dimensions
# size  scale  pixels  filename
declare -a ICONS=(
    "16   1  16    icon_16x16.png"
    "16   2  32    icon_16x16@2x.png"
    "32   1  32    icon_32x32.png"
    "32   2  64    icon_32x32@2x.png"
    "128  1  128   icon_128x128.png"
    "128  2  256   icon_128x128@2x.png"
    "256  1  256   icon_256x256.png"
    "256  2  512   icon_256x256@2x.png"
    "512  1  512   icon_512x512.png"
    "512  2  1024  icon_512x512@2x.png"
)

mkdir -p "$ICON_DIR"

for entry in "${ICONS[@]}"; do
    read -r size scale pixels filename <<< "$entry"
    echo "  ${pixels}x${pixels}px -> $filename"
    resize_image "$SOURCE_IMAGE" "$ICON_DIR/$filename" "$pixels"
done

# Update Contents.json
cat > "$ICON_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "icon_16x16.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "16x16"
    },
    {
      "filename" : "icon_16x16@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "16x16"
    },
    {
      "filename" : "icon_32x32.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "32x32"
    },
    {
      "filename" : "icon_32x32@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "32x32"
    },
    {
      "filename" : "icon_128x128.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "128x128"
    },
    {
      "filename" : "icon_128x128@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "128x128"
    },
    {
      "filename" : "icon_256x256.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "256x256"
    },
    {
      "filename" : "icon_256x256@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "256x256"
    },
    {
      "filename" : "icon_512x512.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "512x512"
    },
    {
      "filename" : "icon_512x512@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "512x512"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF

echo ""
echo "Done! Generated $(ls "$ICON_DIR"/*.png 2>/dev/null | wc -l) icon files."
echo "Contents.json updated."
