#!/usr/bin/env bash
# Regenerate images/screenshot.png from the HTML mockup using Chrome headless.
# Run from the repository root:  bash mockups/screenshot.sh

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --disable-gpu \
  --screenshot=images/screenshot.png \
  --window-size=900,1850 \
  --default-background-color=ff1e1e1e \
  --force-device-scale-factor=2 \
  "file://$(pwd)/mockups/screenshot.html"

echo "Screenshot saved to images/screenshot.png"
