#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Builds all three Tizen variants (Regular, Oblong, Legacy) sequentially.
 * Lint runs once at the start; individual builds skip it via --skip-lint.
 *
 * Usage:
 *   node scripts/build-all.js [<version>] [--signed] [--install]
 */

const {execSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const APP_DIR = path.resolve(ROOT, '..', 'app');
const SCRIPT = path.join(__dirname, 'build-wgt.js');

const cyan = (t) => `\x1b[36m${t}\x1b[0m`;
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;

// Pass through args (version bump, --signed, --install, etc.) but strip --skip-lint
const passArgs = process.argv.slice(2).filter(a => a !== '--skip-lint');

// ── Lint gate (run once for all variants) ─────────────────────────────────────
console.log(cyan('\nRunning lint checks...'));
const lint = spawnSync('npx', ['enact', 'lint', '.'], {
	cwd: APP_DIR,
	env: process.env,
	encoding: 'utf8'
});
if (lint.stdout) process.stdout.write(lint.stdout);
if (lint.stderr) process.stderr.write(lint.stderr);
if (lint.status !== 0 || /\bwarning\b/i.test(`${lint.stdout || ''}\n${lint.stderr || ''}`)) {
	console.error(red('Lint check failed!'));
	process.exit(1);
}
console.log(green('Lint checks passed\n'));

// ── Clean all Moonfin_Tizen_*.wgt from repo root before starting ──────────────
const existing = fs.readdirSync(REPO_ROOT).filter(f => /^Moonfin_Tizen_.*\.wgt$/.test(f));
for (const f of existing) {
	fs.unlinkSync(path.join(REPO_ROOT, f));
	console.log(`Removed ${f}`);
}

// ── Build each variant ─────────────────────────────────────────────────────────
function build(label, extraFlags) {
	const allArgs = [...passArgs, '--skip-lint', ...extraFlags];
	console.log('\n' + cyan('═'.repeat(50)));
	console.log(cyan(`  Building: ${label}`));
	console.log(cyan('═'.repeat(50)) + '\n');
	execSync(`node "${SCRIPT}" ${allArgs.join(' ')}`, {stdio: 'inherit', cwd: ROOT});
}

build('Regular', []);
build('Oblong', ['--oblong']);
build('Legacy', ['--legacy']);

// ── Summary ────────────────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version || '0.0.0';

console.log('\n' + green('═'.repeat(50)));
console.log(green(`  All Tizen builds complete! (v${version})`));
console.log(green('═'.repeat(50)));
console.log(`\n  ${cyan(`Moonfin_Tizen_Regular_${version}.wgt`)}`);
console.log(`  ${cyan(`Moonfin_Tizen_Oblong_${version}.wgt`)}`);
console.log(`  ${cyan(`Moonfin_Tizen_Legacy_${version}.wgt`)}`);
console.log('');
