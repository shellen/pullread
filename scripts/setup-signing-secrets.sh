#!/bin/bash
# ABOUTME: Helper to set up GitHub Actions secrets for code signing with a .p12 certificate
# ABOUTME: Generates base64-encoded certificate and configures repository secrets via gh CLI

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo_step() { echo -e "${GREEN}==>${NC} $1"; }
echo_warning() { echo -e "${YELLOW}Warning:${NC} $1"; }
echo_error() { echo -e "${RED}Error:${NC} $1"; }

usage() {
    cat << 'EOF'
Usage: setup-signing-secrets.sh [OPTIONS]

Set up GitHub Actions repository secrets for code signing and notarization.

This script takes your .p12 certificate file and configures the GitHub
repository secrets needed for CI code signing via `gh secret set`.

OPTIONS:
    --p12 <path>              Path to .p12 certificate file (required)
    --password <password>     Password for .p12 file (will prompt if not provided)
    --apple-id <email>        Apple ID for notarization (optional)
    --team-id <id>            Apple Team ID for notarization (optional)
    --app-password <password> App-specific password for notarization (optional)
    --repo <owner/repo>       GitHub repository (default: auto-detect from git remote)
    --dry-run                 Show what would be set without actually setting secrets
    --help                    Show this help message

PREREQUISITES:
    1. A "Developer ID Application" certificate exported as .p12
       - Open Keychain Access on macOS
       - Find your "Developer ID Application" certificate
       - Right-click > Export Items > Save as .p12

    2. GitHub CLI (gh) installed and authenticated
       - Install: brew install gh
       - Auth: gh auth login

    3. (Optional) Apple ID credentials for notarization
       - Create app-specific password at: https://appleid.apple.com
       - Find Team ID at: https://developer.apple.com/account

SECRETS CONFIGURED:
    APPLE_CERTIFICATE_BASE64    Base64-encoded .p12 certificate
    APPLE_CERTIFICATE_PASSWORD  Password for the .p12 file
    APPLE_ID                    Apple ID email (for notarization)
    APPLE_ID_PASSWORD           App-specific password (for notarization)
    APPLE_TEAM_ID               Apple Developer Team ID (for notarization)

EXAMPLES:
    # Signing only (no notarization)
    ./scripts/setup-signing-secrets.sh --p12 ~/certs/developer.p12

    # Full setup with notarization
    ./scripts/setup-signing-secrets.sh \
      --p12 ~/certs/developer.p12 \
      --apple-id your@email.com \
      --team-id ABC123DEF \
      --app-password xxxx-xxxx-xxxx-xxxx

    # Dry run to see what would be set
    ./scripts/setup-signing-secrets.sh --p12 ~/certs/developer.p12 --dry-run

EOF
    exit 0
}

# Parse arguments
P12_PATH=""
P12_PASSWORD=""
APPLE_ID=""
TEAM_ID=""
APP_PASSWORD=""
REPO=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --p12)          P12_PATH="$2"; shift 2 ;;
        --password)     P12_PASSWORD="$2"; shift 2 ;;
        --apple-id)     APPLE_ID="$2"; shift 2 ;;
        --team-id)      TEAM_ID="$2"; shift 2 ;;
        --app-password) APP_PASSWORD="$2"; shift 2 ;;
        --repo)         REPO="$2"; shift 2 ;;
        --dry-run)      DRY_RUN=true; shift ;;
        --help)         usage ;;
        *)              echo_error "Unknown option: $1"; usage ;;
    esac
done

# Validate
if [ -z "$P12_PATH" ]; then
    echo_error "No .p12 file specified. Use --p12 <path>"
    echo ""
    usage
fi

if [ ! -f "$P12_PATH" ]; then
    echo_error "Certificate file not found: $P12_PATH"
    exit 1
fi

if ! $DRY_RUN && ! command -v gh &> /dev/null; then
    echo_error "GitHub CLI (gh) not found. Install with: brew install gh"
    exit 1
fi

# Prompt for password if not provided
if [ -z "$P12_PASSWORD" ]; then
    echo -n "Enter .p12 password: "
    read -s P12_PASSWORD
    echo ""
fi

# Auto-detect repo
if [ -z "$REPO" ]; then
    REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || true)
    if [ -z "$REPO" ]; then
        echo_error "Could not detect repository. Use --repo owner/name"
        exit 1
    fi
fi

echo ""
echo "Pull Read - Code Signing Setup"
echo "==============================="
echo ""
echo "Repository: $REPO"
echo "Certificate: $P12_PATH"
echo ""

# Base64 encode the certificate
echo_step "Encoding certificate..."
CERT_BASE64=$(base64 -i "$P12_PATH" 2>/dev/null || base64 "$P12_PATH")
CERT_SIZE=$(echo "$CERT_BASE64" | wc -c | tr -d ' ')
echo "  Encoded size: ${CERT_SIZE} bytes"

# Set secrets
set_secret() {
    local name="$1"
    local value="$2"
    local description="$3"

    if $DRY_RUN; then
        echo "  [dry-run] Would set: $name ($description)"
    else
        echo "$value" | gh secret set "$name" --repo "$REPO"
        echo "  Set: $name ($description)"
    fi
}

echo ""
echo_step "Setting code signing secrets..."
set_secret "APPLE_CERTIFICATE_BASE64" "$CERT_BASE64" "Base64-encoded .p12 certificate"
set_secret "APPLE_CERTIFICATE_PASSWORD" "$P12_PASSWORD" ".p12 password"

if [ -n "$APPLE_ID" ] || [ -n "$TEAM_ID" ] || [ -n "$APP_PASSWORD" ]; then
    echo ""
    echo_step "Setting notarization secrets..."

    if [ -n "$APPLE_ID" ]; then
        set_secret "APPLE_ID" "$APPLE_ID" "Apple ID email"
    fi
    if [ -n "$APP_PASSWORD" ]; then
        set_secret "APPLE_ID_PASSWORD" "$APP_PASSWORD" "App-specific password"
    fi
    if [ -n "$TEAM_ID" ]; then
        set_secret "APPLE_TEAM_ID" "$TEAM_ID" "Apple Team ID"
    fi
fi

echo ""
echo -e "${GREEN}Done!${NC}"
echo ""

if $DRY_RUN; then
    echo "Run without --dry-run to actually set the secrets."
else
    echo "Secrets configured. Your next CI build will automatically:"
    echo "  1. Import the .p12 certificate into a temporary keychain"
    echo "  2. Sign the app bundle with 'Developer ID Application'"
    echo "  3. Sign the DMG"
    if [ -n "$APPLE_ID" ]; then
        echo "  4. Notarize the app and DMG with Apple"
    fi
    echo ""
    echo "Trigger a build with: gh workflow run build-macos-app.yml"
fi
