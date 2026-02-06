#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Read package.json to get current version
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const version = packageJson.version;

// Generate IPK filename
const ipkFilename = `org.moonfin.webos_${version}_all.ipk`;
const ipkPath = path.join('./build', ipkFilename);

// Check if IPK exists
if (!fs.existsSync(ipkPath)) {
	console.error(`Error: IPK file not found at ${ipkPath}`);
	console.error('Please run "npm run package" first to build the IPK.');
	process.exit(1);
}

// Calculate SHA256 hash
const fileBuffer = fs.readFileSync(ipkPath);
const hashSum = crypto.createHash('sha256');
hashSum.update(fileBuffer);
const sha256 = hashSum.digest('hex');

console.log(`Calculated SHA256: ${sha256}`);

// Read manifest file
const manifestPath = './org.moonfin.webos.manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Update manifest
manifest.version = version;
manifest.ipkUrl = ipkFilename;
manifest.ipkHash.sha256 = sha256;

// Write updated manifest
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`✓ Updated ${manifestPath}`);
console.log(`  Version: ${version}`);
console.log(`  IPK: ${ipkFilename}`);
console.log(`  SHA256: ${sha256}`);
