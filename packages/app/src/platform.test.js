import {isLegacyWebOS} from './platform';

const setUserAgent = (ua) => {
	Object.defineProperty(window.navigator, 'userAgent', {value: ua, configurable: true});
};

describe('isLegacyWebOS', () => {
	const original = window.navigator.userAgent;
	afterEach(() => setUserAgent(original));

	test('webOS 3 and 4 are legacy', () => {
		setUserAgent('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.36 WebAppManager');
		expect(isLegacyWebOS()).toBe(true);
		setUserAgent('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager');
		expect(isLegacyWebOS()).toBe(true);
	});

	test('webOS 5 and newer are not', () => {
		setUserAgent('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager');
		expect(isLegacyWebOS()).toBe(false);
		setUserAgent('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.211 Safari/537.36 WebAppManager');
		expect(isLegacyWebOS()).toBe(false);
	});

	test('other platforms are not', () => {
		setUserAgent('Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.5 TV Safari/537.36');
		expect(isLegacyWebOS()).toBe(false);
	});
});
