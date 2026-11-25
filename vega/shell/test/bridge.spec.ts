import {BRIDGE_VERSION, PAGE_EVENT, bootScript, parsePageMessage, toPageScript} from '../src/bridge';

describe('parsePageMessage', () => {
	it('reads a message of the current version', () => {
		expect(parsePageMessage(JSON.stringify({v: BRIDGE_VERSION, type: 'ALLOW_INSECURE_HOST', payload: {host: 'nas:8920'}})))
			.toEqual({type: 'ALLOW_INSECURE_HOST', payload: {host: 'nas:8920'}});
	});

	it('refuses other versions, junk and missing types', () => {
		expect(parsePageMessage(JSON.stringify({v: 2, type: 'EXIT_APP'}))).toBeNull();
		expect(parsePageMessage(JSON.stringify({v: BRIDGE_VERSION}))).toBeNull();
		expect(parsePageMessage('not json')).toBeNull();
		expect(parsePageMessage('null')).toBeNull();
	});
});

describe('scripts for the page', () => {
	it('dispatches a versioned event the page can listen for', () => {
		const script = toPageScript({type: 'APP_STATE', payload: {state: 'background'}});
		expect(script).toContain(`new CustomEvent("${PAGE_EVENT}"`);
		expect(script).toContain(JSON.stringify({v: BRIDGE_VERSION, type: 'APP_STATE', payload: {state: 'background'}}));
	});

	it('defines the boot data before page code runs', () => {
		expect(bootScript({ip: '192.168.1.20'})).toBe(`window.__MOONFIN_VEGA__ = {"v":${BRIDGE_VERSION},"ip":"192.168.1.20"}; true;`);
	});
});
