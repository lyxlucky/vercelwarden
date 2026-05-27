#!/bin/bash
# Download, extract, and configure Vaultwarden Web Vault
# Run this script before deploying to Vercel

set -e

WEB_VAULT_VERSION="${1:-v2026.4.1}"
WEB_VAULT_URL="https://github.com/dani-garcia/bw_web_builds/releases/download/${WEB_VAULT_VERSION}/bw_web_${WEB_VAULT_VERSION}.tar.gz"
TARGET_DIR="public/web-vault"
DOMAIN="${DOMAIN:-}"

echo "=== Vercelwarden Web Vault Setup ==="
echo "Version: ${WEB_VAULT_VERSION}"
echo ""

# Download
echo "[1/3] Downloading Web Vault..."
curl -sL -o /tmp/bw_web.tar.gz "$WEB_VAULT_URL"

# Extract
echo "[2/3] Extracting to ${TARGET_DIR}..."
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
tar -xzf /tmp/bw_web.tar.gz -C "$TARGET_DIR" --strip-components=1
rm /tmp/bw_web.tar.gz

# Configure API URL
echo "[3/3] Configuring API URL..."
# The web vault loads config from /settings.json or environment
# We override it to point to our API on the same domain
cat > "${TARGET_DIR}/settings.json" << 'EOF'
{
  "apiUri": "/api",
  "identityUri": "/identity",
  "notificationsUri": "/notifications",
  "iconsUri": "/icons",
  "eventsUri": "/events",
  "enterpriseSearchUri": null,
  "billingRegion": null,
  "allowedOutdatedDomains": [],
  "stripeKey": null,
  "braintreeKey": null
}
EOF

echo ""
echo "=== Done ==="
echo "Web Vault installed at: ${TARGET_DIR}"
echo "Access at: https://your-domain.vercel.app/web-vault/"
echo ""
echo "Files:"
ls -la "$TARGET_DIR" | head -10
echo "..."
echo "Total size: $(du -sh "$TARGET_DIR" | cut -f1)"
