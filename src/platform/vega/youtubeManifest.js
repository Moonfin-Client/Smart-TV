// The shell reads a YouTube manifest for the page, since the WebView holds the
// page to CORS and YouTube's manifest host only answers YouTube's own pages.
import {onShellMessage, postToShell} from './bridge';

const waiting = new Map();
let nextId = 0;
let listening = false;

// The manifest's text, or null when it couldn't be read
export const readTrailerManifest = (url) => new Promise((resolve) => {
	if (!listening) {
		listening = true;
		onShellMessage('MANIFEST', (answer) => {
			const done = waiting.get(answer.id);
			if (!done) return;
			waiting.delete(answer.id);
			done(answer.status >= 200 && answer.status < 300 ? answer.body : null);
		});
	}
	const id = ++nextId;
	waiting.set(id, resolve);
	if (!postToShell('READ_MANIFEST', {id, url})) {
		waiting.delete(id);
		resolve(null);
	}
});
