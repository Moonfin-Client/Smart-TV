#!/bin/bash
set -e

echo " Building Moonfin for webOS..."

# Clean previous build
echo "Cleaning previous build..."
npm run clean

# Production build with Enact
echo " Building with Enact..."
npm run pack -- -p

# Copy banner
echo " Copying banner..."
cp resources/banner-dark.png dist/resources/

# Remove non-English locales to reduce package size
echo " Removing non-English locales due to size constraints..."
cd dist/node_modules/ilib/locale
find . -mindepth 1 -maxdepth 1 -type d ! -name 'en*' -exec rm -rf {} +
cd ../../../..

# Package into IPK
echo " Creating IPK package..."
ares-package ./dist ./services -o ./build

# Update manifest with version and hash
echo " Updating manifest..."
node update-manifest.js

echo " Build complete!"
