// A WebSocket the host opens for the page.
//
// The page is served from http://moonfin.internal, and the WebView sends that as the
// handshake's Origin. Silo refuses a web origin that isn't its own on its sockets, while
// the host's native socket sends no Origin, as Moonfin's native apps do. The host side is
// SocketRelay.cs. This has the part of the browser WebSocket the app uses.
import {onShellMessage, postToShell} from './bridge';

let nextId = 1;
const open = new Map();
let listening = false;

const listen = () => {
	if (listening) return;
	listening = true;
	onShellMessage('SOCKET_OPENED', (payload) => open.get(payload?.id)?.opened(payload));
	onShellMessage('SOCKET_MESSAGE', (payload) => open.get(payload?.id)?.message(payload));
	onShellMessage('SOCKET_CLOSED', (payload) => open.get(payload?.id)?.closed(payload));
};

export class ShellSocket {
	constructor (url, protocols = []) {
		listen();
		this.url = String(url);
		this.id = nextId++;
		this.readyState = 0;
		this.protocol = '';
		this.onopen = null;
		this.onmessage = null;
		this.onclose = null;
		this.onerror = null;
		open.set(this.id, this);
		if (!postToShell('SOCKET_OPEN', {id: this.id, url: this.url, protocols: [].concat(protocols || [])})) {
			setTimeout(() => this.closed({code: 1006, reason: 'No host to open the socket'}), 0);
		}
	}

	send (data) {
		if (this.readyState !== 1) throw new Error('The socket is not open');
		postToShell('SOCKET_SEND', {id: this.id, data: String(data)});
	}

	close (code = 1000, reason = '') {
		if (this.readyState >= 2) return;
		this.readyState = 2;
		postToShell('SOCKET_CLOSE', {id: this.id, code, reason});
	}

	opened (payload) {
		if (this.readyState !== 0) return;
		this.readyState = 1;
		this.protocol = payload.protocol || '';
		if (this.onopen) this.onopen({type: 'open'});
	}

	message (payload) {
		if (this.readyState === 1 && this.onmessage) this.onmessage({type: 'message', data: payload.data});
	}

	// The host passes the server's close code on, and 1006 for a connection that failed or dropped.
	closed (payload) {
		if (this.readyState === 3) return;
		open.delete(this.id);
		this.readyState = 3;
		const code = typeof payload?.code === 'number' ? payload.code : 1006;
		if (code === 1006 && this.onerror) this.onerror({type: 'error'});
		if (this.onclose) this.onclose({type: 'close', code, reason: payload?.reason || '', wasClean: code !== 1006});
	}
}
