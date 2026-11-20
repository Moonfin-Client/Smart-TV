/**
 * Shared lint gate for the platform builds.
 */
const {spawnSync} = require('child_process');
const path = require('path');

const PACKAGES_DIR = path.resolve(__dirname, '..', 'packages');

// The platform packages are aliased straight into the bundle, so they have to
// clear the same gate the app does.
const LINT_DIRS = [
	path.join(PACKAGES_DIR, 'app'),
	path.join(PACKAGES_DIR, 'platform-tizen'),
	path.join(PACKAGES_DIR, 'platform-webos'),
	path.join(PACKAGES_DIR, 'platform-vega'),
	path.join(PACKAGES_DIR, 'platform-xbox'),
	path.join(PACKAGES_DIR, 'platform-titan'),
	path.join(PACKAGES_DIR, 'platform-web')
];

// enact lint reports style problems as warnings and still exits zero, so the
// gate has to read the output instead of trusting the status.
const runLintGate = (cwd, log = console.log) => {
	log(`npx enact lint . (${path.basename(cwd)})`);
	// Windows needs shell
	const result = spawnSync('npx', ['enact', 'lint', '.'], {
		cwd,
		env: process.env,
		encoding: 'utf8',
		shell: true
	});
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	if (result.error) {
		console.error(`Could not run the lint gate: ${result.error.message}`);
		return false;
	}
	const output = `${result.stdout || ''}\n${result.stderr || ''}`;
	const hasWarnings = /\bwarning\b/i.test(output);
	return result.status === 0 && !hasWarnings;
};

module.exports = {LINT_DIRS, runLintGate};
