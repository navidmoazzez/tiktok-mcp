#!/usr/bin/env bash
# Add tiktok-mcp to Claude Code, prompting for what it needs.
#
# Everything here is one `claude mcp add` call. The script exists so nobody has
# to get the quoting right on a four-flag command, not because the install is
# complicated.
set -euo pipefail

command -v claude >/dev/null || { echo "Claude Code is not installed: https://claude.com/claude-code"; exit 1; }
command -v node >/dev/null || { echo "Node 20 or newer is required: https://nodejs.org"; exit 1; }

read -rp "TikTok client key: " KEY
read -rsp "TikTok client secret: " SECRET; echo
read -rsp "TikTok refresh token (run 'npx -y @thenavidm/tiktok-mcp-cli auth' if you have none): " TOKEN; echo

claude mcp add tiktok \
  --scope user \
  -e "TIKTOK_CLIENT_KEY=${KEY}" \
  -e "TIKTOK_CLIENT_SECRET=${SECRET}" \
  -e "TIKTOK_REFRESH_TOKEN=${TOKEN}" \
  -- npx -y @thenavidm/tiktok-mcp-cli@latest

echo
echo "Added. Checking it:"
TIKTOK_CLIENT_KEY="$KEY" TIKTOK_CLIENT_SECRET="$SECRET" TIKTOK_REFRESH_TOKEN="$TOKEN" \
  npx -y @thenavidm/tiktok-mcp-cli@latest doctor || true
