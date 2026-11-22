// node --test scripts/ota/index.test.js
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {applyOta, shellHash} = require('.');

const makeDist = (dir, {version = '1.0.0', code = 'a', asset = 'x'} = {}) => {
	fs.mkdirSync(path.join(dir, 'fonts'), {recursive: true});
	fs.writeFileSync(path.join(dir, 'index.html'),
		'<head><link href="main.css" rel="stylesheet"/></head><body><script defer="defer" src="main.js"></script></body>');
	fs.writeFileSync(path.join(dir, 'main.js'), code);
	fs.writeFileSync(path.join(dir, 'main.css'), 'b{}');
	fs.writeFileSync(path.join(dir, 'chunk.1.js'), code);
	fs.writeFileSync(path.join(dir, 'config.xml'), `<widget version="${version}"/>`);
	fs.writeFileSync(path.join(dir, 'fonts', 'f.ttf'), asset);
};

test('the shell hash ignores code, the version and iLib manifests but not assets', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-'));
	const [a, b, c] = ['a', 'b', 'c'].map(name => path.join(tmp, name));
	makeDist(a);
	makeDist(b, {version: '1.0.1', code: 'changed'});
	makeDist(c, {asset: 'changed'});
	fs.writeFileSync(path.join(b, 'fonts', 'ilibmanifest.json'), '{"files": []}');
	assert.strictEqual(shellHash([[a, '']], '1.0.0'), shellHash([[b, '']], '1.0.1'));
	assert.notStrictEqual(shellHash([[a, '']], '1.0.0'), shellHash([[c, '']], '1.0.0'));
	fs.rmSync(tmp, {recursive: true, force: true});
});

test('applyOta swaps in the loader and writes the signed release files', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-'));
	const dist = path.join(tmp, 'dist');
	makeDist(dist);
	const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
	fs.writeFileSync(path.join(tmp, 'public.pem'), publicKey.export({type: 'spki', format: 'pem'}));
	fs.writeFileSync(path.join(tmp, 'private.pem'), privateKey.export({type: 'pkcs8', format: 'pem'}));
	const env = {
		MOONFIN_OTA_URL: 'http://example.test/ota/',
		MOONFIN_OTA_PUBLIC_KEY: path.join(tmp, 'public.pem'),
		MOONFIN_OTA_SIGNING_KEY: path.join(tmp, 'private.pem')
	};
	Object.assign(process.env, env);
	const root = path.join(__dirname, '..', '..');
	const out = ['.json', '.bin'].map(ext => path.join(root, `moonfin-ota-selftest${ext}`));
	try {
		applyOta({dist, platform: 'selftest', version: '1.0.0', log: () => {}});
		const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
		assert.match(html, /<script src="ota-loader\.js"><\/script>/);
		assert.doesNotMatch(html, /main\.(js|css)/);
		assert.match(html, /"url":"http:\/\/example\.test\/ota"/);

		const {payload, sig} = JSON.parse(fs.readFileSync(out[0], 'utf8'));
		assert.ok(crypto.verify('sha256', Buffer.from(payload), publicKey, Buffer.from(sig, 'base64')));
		const manifest = JSON.parse(payload);
		assert.deepStrictEqual(manifest.files, [['chunk.1.js', 1], ['main.css', 3], ['main.js', 1]]);
		const bin = fs.readFileSync(out[1]);
		assert.strictEqual(bin.toString(), 'ab{}a');
		assert.strictEqual(manifest.bytes, 5);
		assert.strictEqual(manifest.sha256, crypto.createHash('sha256').update(bin).digest('hex'));
	} finally {
		for (const key of Object.keys(env)) delete process.env[key];
		for (const file of out) fs.rmSync(file, {force: true});
		fs.rmSync(tmp, {recursive: true, force: true});
	}
});

test('applyOta leaves the build alone without a public key', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-'));
	makeDist(tmp);
	const before = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
	Object.assign(process.env, {MOONFIN_OTA_URL: 'http://example.test/ota', MOONFIN_OTA_PUBLIC_KEY: path.join(tmp, 'missing.pem')});
	try {
		applyOta({dist: tmp, platform: 'selftest', version: '1.0.0', log: () => {}});
		assert.strictEqual(fs.readFileSync(path.join(tmp, 'index.html'), 'utf8'), before);
	} finally {
		delete process.env.MOONFIN_OTA_URL;
		delete process.env.MOONFIN_OTA_PUBLIC_KEY;
		fs.rmSync(tmp, {recursive: true, force: true});
	}
});
