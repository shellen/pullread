# Save to PullRead — Raycast Script Command

A Raycast script command that saves a URL to PullRead using the built-in `pullread://` URL scheme.

## What it does

Takes a URL as input and opens `pullread://save?url=<encoded_url>`, which tells PullRead to save the article for your next sync.

## Installation

1. Make the script executable:
   ```sh
   chmod +x save-to-pullread.sh
   ```
2. Open Raycast, go to **Extensions > Script Commands > Add Script Directory**.
3. Select the `extras/raycast` folder (or copy `save-to-pullread.sh` into your existing Script Commands directory).
4. The command "Save to PullRead" will appear in Raycast.

## Usage

1. Open Raycast (default: `Cmd+Space` or your configured hotkey).
2. Type "Save to PullRead".
3. Paste or type a URL and press Enter.
4. PullRead will save the article.

## Requirements

- PullRead must be installed and running (the `pullread://` URL scheme must be registered).
- Python 3 (pre-installed on macOS) is used for URL encoding.
