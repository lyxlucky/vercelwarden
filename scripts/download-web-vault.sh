#!/bin/bash
# Download and extract Vaultwarden Web Vault
# Run this script before deploying to Vercel

set -e

WEB_VAULT_VERSION="${1:-v2026.4.1}"
WEB_VAULT_URL="https://github.com/dani-garcia/bw_web_builds/releases/download/${WEB_VAULT_VERSION}/bw_web_${WEB_VAULT_VERSION}.tar.gz"
TARGET_DIR="public/web-vault"

echo "Downloading Web Vault ${WEB_VAULT_VERSION}..."
curl -L -o /tmp/bw_web.tar.gz "$WEB_VAULT_URL"

echo "Extracting to ${TARGET_DIR}..."
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
tar -xzf /tmp/bw_web.tar.gz -C "$TARGET_DIR" --strip-components=1

# Clean up
rm /tmp/bw_web.tar.gz

echo "Web Vault ${WEB_VAULT_VERSION} installed to ${TARGET_DIR}"
echo "Files:"
ls -la "$TARGET_DIR" | head -10
