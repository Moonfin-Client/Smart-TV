/* Static file server for Moonfin on Hisense VIDAA.
 *
 * VIDAA's browser gives file:// pages no network access, so the app has to be
 * served over http. The TV ships Node 20 as /APPS/pkgs/tv.vidaa.app.phoenix/CHA/bin/phoenix;
 * this script runs on it and binds 127.0.0.1 only.
 *
 *   phoenix serve.js [rootDir] [port]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, 'www'));
const PORT = Number(process.argv[3] || 8099);

const TYPES = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
	'.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
	'.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

// Each install is served under its own path, /b/<build>/, so the browser can
// never mix files from two versions: Moonfin's file names stay the same from
// build to build. "/" redirects to the current build and is never cached;
// everything under /b/<build>/ is. Absolute paths the bundle asks for (fonts
// under /node_modules) are served from the root as they are.
const BUILD = String(Math.floor(fs.statSync(path.join(ROOT, 'index.html')).mtimeMs));
const BUILD_PREFIX = /^\/b\/[^/]+(\/.*)?$/;

http.createServer((req, res) => {
	let rel;
	try {
		rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	} catch (e) {
		res.writeHead(400); return res.end();
	}
	if (rel === '/' || rel === '/index.html') {
		res.writeHead(302, {Location: `/b/${BUILD}/`, 'Cache-Control': 'no-store'});
		return res.end();
	}
	const versioned = BUILD_PREFIX.exec(rel);
	if (versioned) rel = versioned[1] || '/';
	let file = path.join(ROOT, path.normalize(rel));
	if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
	fs.stat(file, (err, st) => {
		if (!err && st.isDirectory()) file = path.join(file, 'index.html');
		fs.readFile(file, (err2, data) => {
			if (err2) { res.writeHead(404); return res.end('not found'); }
			res.writeHead(200, {
				'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
				'Cache-Control': 'public, max-age=31536000, immutable'
			});
			res.end(data);
		});
	});
}).listen(PORT, '127.0.0.1', () => console.log(`moonfin: serving ${ROOT} on http://127.0.0.1:${PORT}/`));
