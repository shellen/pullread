#!/bin/bash
# ABOUTME: Raycast script command that saves a URL to PullRead via the pullread:// deep link.
# ABOUTME: Takes a URL argument and opens pullread://save?url=<encoded_url>.

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Save to PullRead
# @raycast.mode silent
# @raycast.icon images/pullread-icon.png
# @raycast.packageName PullRead

# Optional parameters:
# @raycast.argument1 { "type": "text", "placeholder": "URL" }

url="$1"

if [ -z "$url" ]; then
  echo "No URL provided"
  exit 1
fi

encoded_url=$(python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=''))" "$url")
open "pullread://save?url=${encoded_url}"

echo "Saved to PullRead"
