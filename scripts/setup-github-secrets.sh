#!/usr/bin/env bash
# Sets the repo secrets the workflows need. Values are read silently from the terminal (never echoed, never written to a file).
#   bash scripts/setup-github-secrets.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ask() { # name, help
  local value
  printf '\n%s\n  %s\n  valor (oculto): ' "$1" "$2"
  read -rs value; echo
  [ -n "$value" ] || { echo "  (vacío, salteado)"; return; }
  printf '%s' "$value" | gh secret set "$1"
}

echo "Secrets del repo $(gh repo view --json nameWithOwner -q .nameWithOwner)"
ask CLOUDFLARE_API_TOKEN "Dashboard > My Profile > API Tokens > Create Token > plantilla 'Edit Cloudflare Workers' + permisos extra Account: D1 Edit, Workers R2 Storage Edit"
ask R2_ACCESS_KEY_ID "Dashboard > R2 > Manage API tokens > Create API token (Object Read & Write, bucket stickermap-photos) > Access Key ID"
ask R2_SECRET_ACCESS_KEY "El mismo token de R2 > Secret Access Key"

if command -v rclone >/dev/null 2>&1 && rclone listremotes | grep -q '^gdrive:'; then
  printf '\nRCLONE_CONFIG\n  usando el remote "gdrive" de tu rclone local (base64 de rclone.conf)\n'
  rclone config file | tail -1 | xargs -I{} base64 -i {} | gh secret set RCLONE_CONFIG
else
  echo
  echo "RCLONE_CONFIG: falta el remote 'gdrive'. Corré 'brew install rclone && rclone config' (n > nombre gdrive > tipo drive > scope 1 > autorizar) y volvé a correr este script."
fi
echo; gh secret list
