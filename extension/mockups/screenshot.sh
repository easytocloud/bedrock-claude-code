#!/usr/bin/env bash
# Regenerate the README/Marketplace screenshots using Chrome headless.
# Run from anywhere:  bash extension/mockups/screenshot.sh
# Resolves paths relative to this script's parent (the extension package),
# so it works in the monorepo regardless of CWD.
#
#   images/screenshot.png        — hero: the Activity Bar sidebar preset switcher
#   images/screenshot-panel.png  — secondary: the full edit/compose panel

set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# The sidebar mockup reuses the real media/sidebar.js and provider icons;
# extract the real styles from src/sidebar.ts so the mockup can't drift.
node -e "
const fs = require('fs');
const src = fs.readFileSync('src/sidebar.ts', 'utf8');
const m = src.match(/const SIDEBAR_STYLES = \/\* css \*\/ \`([\s\S]*?)\`;/);
if (!m) { throw new Error('SIDEBAR_STYLES not found in src/sidebar.ts'); }
fs.writeFileSync(
  'mockups/sidebar-styles.gen.js',
  'document.getElementById(\"sidebar-styles\").textContent = ' + JSON.stringify(m[1]) + ';\n'
);
"

# Hero: sidebar preset switcher framed with the Activity Bar
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --screenshot=images/screenshot.png \
  --window-size=560,580 \
  --default-background-color=ff1e1e1e \
  --force-device-scale-factor=2 \
  "file://$(pwd)/mockups/screenshot-sidebar.html"

# Secondary: the full edit/compose panel
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --screenshot=images/screenshot-panel.png \
  --window-size=900,1100 \
  --default-background-color=ff1e1e1e \
  --force-device-scale-factor=2 \
  "file://$(pwd)/mockups/screenshot.html"

echo "Wrote images/screenshot.png (sidebar hero) and images/screenshot-panel.png (panel)"
