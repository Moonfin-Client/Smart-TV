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
(cd dist/node_modules/ilib/locale && find . -mindepth 1 -maxdepth 1 -type d ! -name 'en*' -exec rm -rf {} +)

# Remove ilib data files not needed by a media player
# Keep at root level: localematch, regionnames, scripts, rangeToScript, scriptToRange,
#   likelylocales, localeinfo, charsetaliases, ctype_*, sysres, dateformats, list,
#   plurals, ilibmanifest (all needed for text rendering, locale detection, date display)
echo " Removing unused ilib data files..."

# Root-level files: phone, currency, unit, address, astronomy data
rm -f dist/node_modules/ilib/locale/currency.json \
     dist/node_modules/ilib/locale/numplan.json \
     dist/node_modules/ilib/locale/emergency.json \
     dist/node_modules/ilib/locale/unitfmt.json \
     dist/node_modules/ilib/locale/phoneloc.json \
     dist/node_modules/ilib/locale/phonefmt.json \
     dist/node_modules/ilib/locale/iddarea.json \
     dist/node_modules/ilib/locale/idd.json \
     dist/node_modules/ilib/locale/mnc.json \
     dist/node_modules/ilib/locale/address.json \
     dist/node_modules/ilib/locale/addressres.json \
     dist/node_modules/ilib/locale/astro.json \
     dist/node_modules/ilib/locale/pseudomap.json \
     dist/node_modules/ilib/locale/collation.json \
     dist/node_modules/ilib/locale/countries.json \
     dist/node_modules/ilib/locale/nativecountries.json \
     dist/node_modules/ilib/locale/ctrynames.json \
     dist/node_modules/ilib/locale/ctryreverse.json \
     dist/node_modules/ilib/locale/name.json \
     dist/node_modules/ilib/locale/lang2charset.json \
     dist/node_modules/ilib/locale/ccc.json

# Remove Deseret script locale (historic/obsolete)
rm -rf dist/node_modules/ilib/locale/en/Dsrt

# Strip bulky files from en/ regional subdirs (keep only sysres, dateformats, list, localeinfo, plurals)
echo " Stripping non-essential files from en/ regional locale dirs..."
find dist/node_modules/ilib/locale/en -mindepth 2 -type f \
     \( -name "unitfmt.json" -o -name "ctrynames.json" -o -name "ctryreverse.json" \
        -o -name "addressres.json" -o -name "regionnames.json" -o -name "currency.json" \
        -o -name "numplan.json" -o -name "phonefmt.json" -o -name "phoneloc.json" \
        -o -name "address.json" -o -name "name.json" -o -name "ccc.json" \
        -o -name "emergency.json" -o -name "collation.json" -o -name "astro.json" \) \
     -delete

# Remove unused font weights to reduce size
echo " Removing unused font weights..."
rm -f dist/node_modules/@enact/sandstone/fonts/MuseoSans/MuseoSans-Thin.ttf \
     dist/node_modules/@enact/sandstone/fonts/MuseoSans/MuseoSans-BlackItalic.ttf \
     dist/node_modules/@enact/sandstone/fonts/MuseoSans/MuseoSans-BoldItalic.ttf \
     dist/node_modules/@enact/sandstone/fonts/MuseoSans/MuseoSans-MediumItalic.ttf

# Package into IPK
echo " Creating IPK package..."
ares-package ./dist -o ./build

# Update manifest with version and hash
echo " Updating manifest..."
node update-manifest.js

echo " Build complete!"
