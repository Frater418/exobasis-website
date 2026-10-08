#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. START_HIER.html direkt im Browser oeffnen."
  exit 1
fi
exec node scripts/serve.mjs
