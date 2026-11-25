// The page side of the link to the React Native shell that hosts the Vega WebView. The shell
// writes boot data into window.__MOONFIN_VEGA__ before page code runs and sends later messages
// as moonfin:vega events. Both directions carry a version so either side can refuse what it
// doesn't understand.

const BRIDGE_VERSION = 1;
const PAGE_EVENT = 'moonfin:vega';

export const bootData = () => {
	const data = typeof window !== 'undefined' ? window.__MOONFIN_VEGA__ : null;
	return data && data.v === BRIDGE_VERSION ? data : null;
};

export const postToShell = (type, payload) => {
	const shell = typeof window !== 'undefined' ? window.ReactNativeWebView : null;
	if (!shell) return false;
	shell.postMessage(JSON.stringify({v: BRIDGE_VERSION, type, payload}));
	return true;
};

export const onShellMessage = (type, handler) => {
	if (typeof window === 'undefined') return () => {};
	const listener = (event) => {
		const message = event.detail;
		if (message && message.v === BRIDGE_VERSION && message.type === type) handler(message.payload);
	};
	window.addEventListener(PAGE_EVENT, listener);
	return () => window.removeEventListener(PAGE_EVENT, listener);
};

export const exitApp = () => postToShell('EXIT_APP');

// The WebView refuses a certificate it can't verify, and only the shell can tell
// it to go ahead for a host.
export const allowInsecureHost = (host) => postToShell('ALLOW_INSECURE_HOST', {host});

const waitingRequests = new Map();
let nextRequestId = 0;
let hearingAnswers = false;

// The shell makes the request because the WebView hides an answer from the page when the
// server doesn't allow cross-origin reads. A status of 0 means nothing answered.
export const requestThroughShell = (url, {method = 'GET', headers = {}, body = null} = {}, timeoutMs = 15000) => new Promise((resolve) => {
	if (!hearingAnswers) {
		hearingAnswers = true;
		onShellMessage('HTTP_RESPONSE', (answer) => waitingRequests.get(answer.id)?.(answer));
	}
	const id = ++nextRequestId;
	let timer = null;
	const finish = (answer) => {
		clearTimeout(timer);
		waitingRequests.delete(id);
		resolve(answer);
	};
	timer = setTimeout(() => finish({status: 0, body: ''}), timeoutMs);
	waitingRequests.set(id, finish);
	if (!postToShell('HTTP_REQUEST', {id, url, method, headers, body, timeoutMs})) finish({status: 0, body: ''});
});
