#!/bin/bash

# Clean previous builds
rm -rf dist
mkdir -p dist/firefox dist/chrome dist/edge

echo "Building YTM Block..."

# --- BUILD CHROME ---
echo "Packaging for Chrome..."
cp -r icons dist/chrome/
cp background.js content.js storage.js popup.js popup.html dist/chrome/
cp manifest.chrome.json dist/chrome/manifest.json
cd dist/chrome && zip -r ../ytm-block-chrome.zip * -x "*.DS_Store" && cd ../..

# --- BUILD EDGE ---
echo "Packaging for Edge..."
cp -r icons dist/edge/
cp background.js content.js storage.js popup.js popup.html dist/edge/
cp manifest.chrome.json dist/edge/manifest.json
cd dist/edge && zip -r ../ytm-block-edge.zip * -x "*.DS_Store" && cd ../..

# --- BUILD FIREFOX ---
echo "Packaging for Firefox..."
cp -r icons dist/firefox/
cp background.js content.js storage.js popup.js popup.html dist/firefox/
cp manifest.firefox.json dist/firefox/manifest.json
cd dist/firefox && zip -r ../ytm-block-firefox.zip * -x "*.DS_Store" && cd ../..

echo "Build Complete! Check the /dist folder."
