/* eslint-disable no-console */
// Installs, starts and drives the app on an Xbox in Developer Mode through its
// Device Portal. Run it with no arguments for the commands.
const fs = require('fs');
const path = require('path');

// The portal's certificate is the console's own and nothing on a PC vouches for it.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const [address = '', command, ...rest] = process.argv.slice(2);
const IDENTITY = process.env.MOONFIN_FLAVOR === 'test' ? 'Moonfin.Xbox.SolidTV' : 'Moonfin.Xbox';
const named = address.replace(/^https?:\/\//, '').replace(/[/#?].*$/, '');
const HOST = /:\d+$/.test(named) ? named : `${named}:11443`;
const PORTAL = `https://${HOST}`;

// Windows virtual key codes
const BUTTONS = {
	a: 0xC3, b: 0xC4, x: 0xC5, y: 0xC6, rb: 0xC7, lb: 0xC8, lt: 0xC9, rt: 0xCA,
	up: 0xCB, down: 0xCC, left: 0xCD, right: 0xCE, menu: 0xCF, view: 0xD0, ls: 0xD1, rs: 0xD2,
	lsup: 0xD3, lsdown: 0xD4, lsright: 0xD5, lsleft: 0xD6,
	rsup: 0xD7, rsdown: 0xD8, rsright: 0xD9, rsleft: 0xDA,
	guide: 0x5B
};
const PRESS_MS = 60;
const BETWEEN_PRESSES_MS = 350;
const INSTALL_START_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const base64 = (text) => Buffer.from(text).toString('base64');

// Anything but a GET has to carry the token the portal hands out with its first page.
let session = null;
const openSession = async () => {
	const response = await fetch(`${PORTAL}/`);
	const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]);
	const token = cookies.map((cookie) => cookie.split('=')).find(([name]) => name === 'CSRF-Token');
	return {Cookie: cookies.join('; '), ...(token ? {'X-CSRF-Token': token[1]} : {})};
};
const portal = async (method, route, body) => {
	if (method !== 'GET' && !session) session = await openSession();
	return fetch(`${PORTAL}${route}`, {method, headers: method === 'GET' ? {} : session, body});
};

const installed = async () => {
	const {InstalledPackages} = await (await portal('GET', '/api/app/packagemanager/packages')).json();
	// The one being replaced stays listed for a while after an install, so the newest is taken
	const versionOf = ({Version: v}) => [v.Major, v.Minor, v.Build, v.Revision];
	const newer = (a, b) => versionOf(b).map((part, i) => part - versionOf(a)[i]).find((difference) => difference !== 0) || 0;
	return InstalledPackages.filter((entry) => entry.PackageFullName.startsWith(`${IDENTITY}_`)).sort(newer)[0] || null;
};

const close = async () => {
	const app = await installed();
	if (app) await portal('DELETE', `/api/taskmanager/app?package=${base64(app.PackageFullName)}`);
	return app;
};

const launch = async () => {
	const app = await installed();
	if (!app) throw new Error(`The console has no ${IDENTITY} to start`);
	const response = await portal('POST', `/api/taskmanager/app?appid=${base64(app.PackageRelativeId)}`);
	if (!response.ok) throw new Error(`The console refused to start the app (${response.status} ${await response.text()})`);
	console.log(` Started ${app.PackageFullName}`);
};

const install = async (packagePath, dependencies) => {
	if (!packagePath || !fs.existsSync(packagePath)) throw new Error(`No package at ${packagePath}`);
	const before = await close();
	const files = [packagePath];
	if (!before && dependencies && fs.existsSync(dependencies)) {
		files.push(...fs.readdirSync(dependencies).filter((name) => /\.(appx|msix)$/.test(name)).map((name) => path.join(dependencies, name)));
	}

	const form = new FormData();
	for (const file of files) form.append(path.basename(file), await fs.openAsBlob(file), path.basename(file));
	console.log(` Sending ${files.map((file) => path.basename(file)).join(', ')} to ${HOST}...`);
	const upload = await portal('POST', `/api/app/packagemanager/package?package=${encodeURIComponent(path.basename(packagePath))}`, form);
	if (!upload.ok) throw new Error(`The console refused the package (${upload.status} ${await upload.text()})`);

	// The portal answers 204 during an install and otherwise with how the last one ended,
	// which is the one before this until this one gets going.
	const giveUp = Date.now() + INSTALL_START_MS;
	let going = false;
	let result = {};
	let after = before;
	for (;;) {
		const state = await portal('GET', '/api/app/packagemanager/state');
		if (state.status === 204) {
			going = true;
		} else {
			result = await state.json().catch(() => ({}));
			after = await installed();
			if (going || after?.PackageFullName !== before?.PackageFullName || Date.now() > giveUp) break;
		}
		await sleep(2000);
	}
	if (!result.Success) throw new Error(`The install failed: ${(result.CodeText || result.Reason || 'no reason given').trim()}`);
	if (after?.PackageFullName === before?.PackageFullName) {
		throw new Error(`The console still has ${before ? before.PackageFullName : 'no copy of the app'}. It only takes a package over the one it has when the version went up`);
	}

	console.log(` Installed ${after.PackageFullName}${before ? ` over ${before.PackageFullName}` : ''}`);
	await launch();
};

const buttonCode = (name) => {
	if (!(name in BUTTONS)) throw new Error(`No button called ${name}`);
	return BUTTONS[name];
};

const readStep = (step) => {
	const [first, second, third] = step.split(':');
	if (first === 'wait') return {wait: Number(second)};
	if (first === 'hold') return {code: buttonCode(second), ms: Number(third), times: 1};
	const [name, times] = step.split('*');
	return {code: buttonCode(name), ms: PRESS_MS, times: Number(times) || 1};
};

const press = async (steps) => {
	if (typeof WebSocket === 'undefined') throw new Error('press needs Node 22 or later');
	const presses = steps.map(readStep);
	const socket = new WebSocket(`wss://${HOST}/ext/remoteinput`);
	await new Promise((resolve, reject) => {
		socket.onopen = resolve;
		socket.onerror = () => reject(new Error(`Could not reach the controller input of ${HOST}`));
	});
	const key = (code, down) => socket.send(new Uint8Array([0x01, code, down ? 1 : 0]));
	for (const {wait, code, ms, times = 0} of presses) {
		if (wait) await sleep(wait);
		for (let i = 0; i < times; i++) {
			key(code, true);
			await sleep(ms);
			key(code, false);
			await sleep(BETWEEN_PRESSES_MS);
		}
	}
	// Releases anything still held. The portal never answers a close, so this is given
	// a moment to leave instead.
	socket.send(new Uint8Array([0x04]));
	await sleep(100);
	socket.close();
};

const screenshot = async (file) => {
	if (!file) throw new Error('screenshot needs a file to write to');
	const response = await portal('GET', '/ext/screenshot?download=true&hdr=false');
	if (!response.ok) throw new Error(`The console gave no screenshot (${response.status})`);
	fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
	console.log(` Saved ${file}`);
};

const COMMANDS = {
	install: () => install(rest[0], rest[1]),
	launch,
	close,
	press: () => press(rest),
	screenshot: () => screenshot(rest[0])
};

if (!named || !COMMANDS[command]) {
	console.error([
		' Usage: node xbox/console.cjs <address> <command>',
		'   install <package.msix> [dependencies folder]',
		'   launch',
		'   close',
		'   screenshot <file.png>',
		'   press <button>...',
		`     buttons: ${Object.keys(BUTTONS).join(' ')}`,
		'     down*3 presses three times, hold:a:1000 holds for a second, wait:500 pauses'
	].join('\n'));
	process.exit(1);
}
COMMANDS[command]().then(() => process.exit(0), (err) => {
	console.error(`\n ${err.cause ? `Could not reach the console at ${HOST}: ${err.cause.message}` : err.message}`);
	process.exit(1);
});
