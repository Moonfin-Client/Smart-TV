// Messages between the web app and this shell.
//
// The page talks to the shell with window.ReactNativeWebView.postMessage, which
// takes one string. The shell talks to the page by injecting a script that
// dispatches a moonfin:vega CustomEvent on window. Both directions carry the same
// envelope, and the version lets either side refuse what it doesnt understand.

export const BRIDGE_VERSION = 1;
export const PAGE_EVENT = 'moonfin:vega';

// Page to shell
export type PageMessage =
	| {type: 'EXIT_APP'}
	| {type: 'LOG'; payload: unknown}
	| {type: 'ALLOW_INSECURE_HOST'; payload: {host: string}}
	| {type: 'PLAYBACK_SESSION'; payload: PlaybackSession | null}
	| {type: 'READ_MANIFEST'; payload: ManifestRequest}
	| {type: 'HTTP_REQUEST'; payload: HttpRequest};

// What the shell needs to report a stop on the page's behalf when the page is
// frozen in the background.
export interface PlaybackSession {
	stopUrl: string;
	headers: Record<string, string>;
	body: string;
}

// A YouTube manifest the page cant read itself, and the shell's answer, where a
// status of 0 means it couldnt be read at all.
export interface ManifestRequest {
	id: number;
	url: string;
}

export interface ManifestAnswer {
	id: number;
	status: number;
	body: string;
}

// A request the page's CORS rules would hold the answer back from, and the shell's answer, where a status of 0 means
// nothing answered.
export interface HttpRequest {
	id: number;
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | null;
	timeoutMs: number;
}

export interface HttpAnswer {
	id: number;
	status: number;
	body: string;
}

// Shell to page
export type ShellMessage =
	| {type: 'APP_STATE'; payload: {state: string}}
	| {type: 'KEY'; payload: {key: string; action: 'down' | 'up'}}
	| {type: 'NETWORK'; payload: {connected: boolean; ip: string | null}}
	| {type: 'DISPLAY_CHANGED'; payload: {connected: boolean}}
	| {type: 'MANIFEST'; payload: ManifestAnswer}
	| {type: 'HTTP_RESPONSE'; payload: HttpAnswer};

interface Envelope {
	v: number;
	type: string;
	payload?: unknown;
}

export const parsePageMessage = (raw: string): PageMessage | null => {
	let envelope: Envelope;
	try {
		envelope = JSON.parse(raw);
	} catch (e) {
		return null;
	}
	if (!envelope || envelope.v !== BRIDGE_VERSION || typeof envelope.type !== 'string') return null;
	return {type: envelope.type, payload: envelope.payload} as PageMessage;
};

// A script for WebView.injectJavaScript that hands the page one message.
export const toPageScript = (message: ShellMessage): string => {
	const detail = JSON.stringify({v: BRIDGE_VERSION, ...message});
	return `window.dispatchEvent(new CustomEvent(${JSON.stringify(PAGE_EVENT)}, {detail: ${detail}})); true;`;
};

// Runs before any page code, so the app can read the device and its address
// synchronously at boot instead of waiting on a message round trip.
export const bootScript = (data: object): string =>
	`window.__MOONFIN_VEGA__ = ${JSON.stringify({v: BRIDGE_VERSION, ...data})}; true;`;
