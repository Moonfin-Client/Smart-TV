// The page side of the link to the UWP host that shows the app in WebView2 on
// Xbox.
//
// The host writes what it knows about the console into window.__MOONFIN_XBOX__
// before any page code runs, and later messages arrive as moonfin:xbox events on
// window. Messages to the host go through the one string argument of
// window.chrome.webview.postMessage. Both directions carry a version so either
// side can refuse what it doesnt understand.

const BRIDGE_VERSION = 1;
const PAGE_EVENT = 'moonfin:xbox';
const ANSWER_WAIT_MS = 5000;

let nextId = 1;

export const bootData = () => {
	const data = typeof window !== 'undefined' ? window.__MOONFIN_XBOX__ : null;
	return data && data.v === BRIDGE_VERSION ? data : null;
};

const host = () => (typeof window !== 'undefined' && window.chrome && window.chrome.webview) || null;

export const postToShell = (type, payload) => {
	const shell = host();
	if (!shell) return false;
	shell.postMessage(JSON.stringify({v: BRIDGE_VERSION, type, payload}));
	return true;
};

// Sends a message that carries an id and resolves with the host's answer to it, or
// rejects with what the host said went wrong, or when no answer comes in time.
export const askShell = (type, payload, timeoutMs = ANSWER_WAIT_MS) => new Promise((resolve, reject) => {
	const shell = host();
	if (!shell) {
		reject(new Error('No host to ask'));
		return;
	}
	const id = nextId++;
	let timer = null;
	const listener = (event) => {
		const message = event.detail;
		if (!message || message.v !== BRIDGE_VERSION || message.type !== 'REPLY' || message.id !== id) return;
		clearTimeout(timer);
		window.removeEventListener(PAGE_EVENT, listener);
		if (message.error) reject(new Error(message.error));
		else resolve(message.payload);
	};
	timer = setTimeout(() => {
		window.removeEventListener(PAGE_EVENT, listener);
		reject(new Error(`${type} went unanswered`));
	}, timeoutMs);
	window.addEventListener(PAGE_EVENT, listener);
	shell.postMessage(JSON.stringify({v: BRIDGE_VERSION, type, id, payload}));
});

// Calls back with the payload of every message of the given type, and returns
// the remover.
export const onShellMessage = (type, handler) => {
	if (typeof window === 'undefined') return () => {};
	const listener = (event) => {
		const message = event.detail;
		if (message && message.v === BRIDGE_VERSION && message.type === type) handler(message.payload);
	};
	window.addEventListener(PAGE_EVENT, listener);
	return () => window.removeEventListener(PAGE_EVENT, listener);
};

// window.close does nothing in the WebView, so the host is asked instead.
export const exitApp = () => postToShell('EXIT_APP');

// The WebView refuses a certificate it cant verify, and only the host can tell
// it to go ahead for a server.
export const allowInsecureHost = (authority) => postToShell('ALLOW_INSECURE_HOST', {host: authority});

const waitingRequests = new Map();
let nextRequestId = 0;
let hearingAnswers = false;

// The host makes the request, since the WebView holds an answer back from the page
// when the server doesnt let other sites read it. Resolves with the status, the body
// and the headers, where a status of 0 means nothing answered. The host side is
// HttpRelay.cs.
export const requestThroughShell = (url, {method = 'GET', headers = {}, body = null} = {}, timeoutMs = 15000) => new Promise((resolve) => {
	if (!hearingAnswers) {
		hearingAnswers = true;
		onShellMessage('HTTP_RESPONSE', (answer) => waitingRequests.get(answer?.id)?.(answer));
	}
	const id = ++nextRequestId;
	let timer = null;
	const finish = (answer) => {
		clearTimeout(timer);
		waitingRequests.delete(id);
		resolve(answer);
	};
	// The host gives up at the same time, so a little longer here lets its answer arrive.
	timer = setTimeout(() => finish({status: 0, body: ''}), timeoutMs + 1000);
	waitingRequests.set(id, finish);
	if (!postToShell('HTTP_REQUEST', {id, url, method, headers, body, timeoutMs})) finish({status: 0, body: ''});
});

// A host that has the console's own player says so at boot.
export const nativePlayerAvailable = () => !!bootData()?.nativePlayer;
