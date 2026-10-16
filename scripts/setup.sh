#!/usr/bin/env bash
# One-click CF CMS setup. Every flag is forwarded to bin/create-cf-cms.mjs.
# Put the API token in CLOUDFLARE_API_TOKEN. The script never prints it.
# A rerun reuses an existing D1 database, R2 bucket, and Pages project.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -d node_modules ]]; then
  npm install
fi
exec node bin/create-cf-cms.mjs "$@"
