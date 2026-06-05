#!/usr/bin/env bash
# Regenerate images/screenshot.png from the HTML mockup using Chrome headless.
# Run from anywhere:  bash extension/mockups/screenshot.sh
# Resolves paths relative to this script's parent (the extension package),
# so it works in the monorepo regardless of CWD.

set -euo pipefail
cd "$(dirname "$0")/.."

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --disable-gpu \
  --screenshot=images/screenshot.png \
  --window-size=900,1850 \
  --default-background-color=ff1e1e1e \
  --force-device-scale-factor=2 \
  "file://$(pwd)/mockups/screenshot.html"

echo "Screenshot saved to images/screenshot.png"
