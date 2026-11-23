import {allowInsecureHost, askShell, bootData, exitApp, nativePlayerAvailable, onShellMessage, postToShell, requestThroughShell} from '../../../platform-xbox/src/bridge';
import {getCountryCode} from '../../../platform-xbox/src/countryCode';
import {keepScreenOn, registerAppStateObserver, setupXboxLifecycle} from '../../../platform-xbox/src/video';

const hostSays = (type, payload) => window.dispatchEvent(new CustomEvent('moonfin:xbox', {detail: {v: 1, type, payload}}));

describe('the Xbox bridge', () => {
	let postMessage;

	beforeEach(() => {
		postMessage = jest.fn();
		window.chrome = {webview: {postMessage}};
	});

	afterEach(() => {
		delete window.__MOONFIN_XBOX__;
		delete window.chrome;
	});

	const sent = (index = 0) => JSON.parse(postMessage.mock.calls[index][0]);

	test('reads the boot data the host wrote, and only of its own version', () => {
		expect(bootData()).toBeNull();
		window.__MOONFIN_XBOX__ = {v: 1, ip: '192.168.1.30'};
		expect(bootData().ip).toBe('192.168.1.30');
		window.__MOONFIN_XBOX__ = {v: 2, ip: '192.168.1.30'};
		expect(bootData()).toBeNull();
	});

	test('gives the country the host read off the console, or none', async () => {
		expect(await getCountryCode()).toBeNull();
		window.__MOONFIN_XBOX__ = {v: 1, country: 'MX'};
		expect(await getCountryCode()).toBe('MX');
		window.__MOONFIN_XBOX__ = {v: 1, country: null};
		expect(await getCountryCode()).toBeNull();
	});

	test('posts versioned messages to the host and says when there is none', () => {
		delete window.chrome;
		expect(exitApp()).toBe(false);
		window.chrome = {webview: {postMessage}};
		expect(allowInsecureHost('nas:8920')).toBe(true);
		expect(sent()).toEqual({v: 1, type: 'ALLOW_INSECURE_HOST', payload: {host: 'nas:8920'}});
		expect(postToShell('EXIT_APP')).toBe(true);
	});

	test('hands host messages of one type to the handler until removed', () => {
		const handler = jest.fn();
		const remove = onShellMessage('APP_STATE', handler);
		hostSays('APP_STATE', {state: 'background'});
		hostSays('KEY', {key: 'Play'});
		window.dispatchEvent(new CustomEvent('moonfin:xbox', {detail: {v: 2, type: 'APP_STATE', payload: {state: 'active'}}}));
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({state: 'background'});
		remove();
		hostSays('APP_STATE', {state: 'active'});
		expect(handler).toHaveBeenCalledTimes(1);
	});

	test('keeping the screen on is asked of the host', async () => {
		await keepScreenOn(true);
		await keepScreenOn(false);
		expect(sent(0)).toEqual({v: 1, type: 'KEEP_DISPLAY_ACTIVE', payload: {active: true}});
		expect(sent(1)).toEqual({v: 1, type: 'KEEP_DISPLAY_ACTIVE', payload: {active: false}});
	});

	test('a request the host makes resolves with the answer that names it', async () => {
		const asked = requestThroughShell('http://silo:8090/api/v2/account/me', {method: 'GET', headers: {Authorization: 'Bearer t'}, signal: 'not sent'}, 4000);
		const message = sent();
		expect(message).toEqual({v: 1, type: 'HTTP_REQUEST', payload: {id: message.payload.id, url: 'http://silo:8090/api/v2/account/me', method: 'GET', headers: {Authorization: 'Bearer t'}, body: null, timeoutMs: 4000, quiet: false}});
		hostSays('HTTP_RESPONSE', {id: message.payload.id + 1, status: 500, body: ''});
		hostSays('HTTP_RESPONSE', {id: message.payload.id, status: 200, body: '{}', headers: {'content-type': 'application/json'}});
		await expect(asked).resolves.toEqual({id: message.payload.id, status: 200, body: '{}', headers: {'content-type': 'application/json'}});
	});

	test('a quiet request says so, and only then', () => {
		requestThroughShell('http://192.168.1.20:8090/api/v2/system/info', {quiet: true}, 3000);
		requestThroughShell('http://silo:8090/api/v2/account/me');
		expect(sent(0).payload.quiet).toBe(true);
		expect(sent(1).payload.quiet).toBe(false);
	});

	test('a request nothing answers resolves with status 0', async () => {
		jest.useFakeTimers();
		try {
			const unanswered = requestThroughShell('http://silo:8090/a', {}, 2000);
			jest.advanceTimersByTime(3000);
			await expect(unanswered).resolves.toEqual({status: 0, body: '', failure: 'timeout'});
		} finally {
			jest.useRealTimers();
		}
		delete window.chrome;
		await expect(requestThroughShell('http://silo:8090/b')).resolves.toEqual({status: 0, body: ''});
	});

	test('a question carries an id and resolves with the answer that repeats it', async () => {
		const asked = askShell('MEMORY', undefined);
		const {id} = sent();
		expect(typeof id).toBe('number');
		window.dispatchEvent(new CustomEvent('moonfin:xbox', {detail: {v: 1, type: 'REPLY', id: id + 1, payload: {usage: 1}}}));
		window.dispatchEvent(new CustomEvent('moonfin:xbox', {detail: {v: 1, type: 'REPLY', id, payload: {usage: 2}}}));
		await expect(asked).resolves.toEqual({usage: 2});

		const refused = askShell('DISPLAY_SET_FOR_MEDIA', {hdr: 'hlg'});
		window.dispatchEvent(new CustomEvent('moonfin:xbox', {detail: {v: 1, type: 'REPLY', id: sent(1).id, error: 'Only hdr10 can be asked for'}}));
		await expect(refused).rejects.toThrow('Only hdr10 can be asked for');

		await expect(askShell('MEMORY', undefined, 5)).rejects.toThrow('MEMORY went unanswered');
		delete window.chrome;
		await expect(askShell('MEMORY')).rejects.toThrow('No host to ask');
	});

	test('says whether the host has the console player', () => {
		expect(nativePlayerAvailable()).toBe(false);
		window.__MOONFIN_XBOX__ = {v: 1, nativePlayer: {v: 1}};
		expect(nativePlayerAvailable()).toBe(true);
	});
});

describe('the Xbox lifecycle', () => {
	test('turns a change in the host network report into the browser events, after the first word', () => {
		const offline = jest.fn();
		const online = jest.fn();
		window.addEventListener('offline', offline);
		window.addEventListener('online', online);
		const remove = setupXboxLifecycle();
		hostSays('NETWORK', {connected: true, ip: null});
		hostSays('NETWORK', {connected: true, ip: null});
		expect(offline).not.toHaveBeenCalled();
		hostSays('NETWORK', {connected: false, ip: null});
		expect(offline).toHaveBeenCalledTimes(1);
		hostSays('NETWORK', {connected: true, ip: null});
		expect(online).toHaveBeenCalledTimes(1);
		remove();
		hostSays('NETWORK', {connected: false, ip: null});
		expect(offline).toHaveBeenCalledTimes(1);
		window.removeEventListener('offline', offline);
		window.removeEventListener('online', online);
	});

	test('raises the media remote and the system Back on the focused element as keys', () => {
		const button = document.createElement('button');
		document.body.appendChild(button);
		button.focus();
		const seen = [];
		button.addEventListener('keydown', (e) => seen.push(e.keyCode));
		const remove = setupXboxLifecycle();
		hostSays('KEY', {key: 'Play'});
		hostSays('KEY', {key: 'Pause'});
		hostSays('KEY', {key: 'Back'});
		hostSays('KEY', {key: 'Nonsense'});
		expect(seen).toEqual([250, 19, 27]);
		remove();
		hostSays('KEY', {key: 'Play'});
		expect(seen).toHaveLength(3);
		button.remove();
	});

	test('tells the player of a trip to the background once, however many ways it hears of it', () => {
		const foreground = jest.fn();
		const background = jest.fn();
		const remove = registerAppStateObserver(foreground, background);
		const setHidden = (hidden) => {
			Object.defineProperty(document, 'hidden', {value: hidden, configurable: true});
			document.dispatchEvent(new Event('visibilitychange'));
		};
		hostSays('APP_STATE', {state: 'background'});
		setHidden(true);
		expect(background).toHaveBeenCalledTimes(1);
		expect(foreground).not.toHaveBeenCalled();
		setHidden(false);
		hostSays('APP_STATE', {state: 'active'});
		expect(foreground).toHaveBeenCalledTimes(1);
		remove();
		hostSays('APP_STATE', {state: 'background'});
		expect(background).toHaveBeenCalledTimes(1);
		delete document.hidden;
	});
});
