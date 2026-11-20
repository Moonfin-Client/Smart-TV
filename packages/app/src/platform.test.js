import {getPlatform, isLegacyWebOS, isTitanUserAgent} from './platform';

// Titan's published user agents, and ones that must not be taken for Titan
const UA = {
	philips2025: 'Mozilla/5.0 (Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.4147.62 Safari/537.36 OPR/46.0.2207.0 OMI/4.24, TV_NT72690_2025_4K /000.000.000.000 (Philips, 55PUS8909, wired) CE-HTML/1.0 NETTV/4.6.0.8 SignOn/2.0 SmartTvA/5.0.0 TitanOS/3.0 en Ginga',
	jvc2025: 'Mozilla/5.0 (Linux ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.36 OMI/4.24.3.93.MIKE.227 Model/Vestel-MB190 VSTVB MB100 FVC/9.0 (VESTEL; MB190; ) HbbTV/1.7.1 (+DRM; VESTEL; MB190; 0.9.0.0; ; _TV__2025;) TitanOS/3.0 (Vestel MB190 VESTEL) SmartTvA/3.0.0',
	saphi2021: 'Mozilla/5.0 (Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.62 Safari/537.36 OPR/46.0.2207.0 OMI/4.20, TV_NT72671_2021/000.000.000.000 (Philips, 50PUS7906, wired) CE-HTML/1.0 NETTV/4.6.0.2 SignOn/2.0 SmartTvA/5.0.0 en',
	sharp2025: 'Mozilla/5.0 (Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.4147.62 Safari/537.36 OPR/46.0.2207.0 OMI/4.24, TV_NT72690_2025_2K/051.002.075.001 (Sharp, 2T-C40JF2x55E, wireless) CE-HTML/1.0 NETTV/4.6.0.8 SignOn/2.0 SmartTvA/5.0.0 WhaleTV/2.0 TitanOS/3.0 en Ginga',
	hospitality2026: 'Mozilla/5.0 (Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.4147.62 Safari/537.36 OPR/46.0.2207.0 OMI/4.24, TV_NT72690E_2026_4K/801.000.191.000 (Philips, HFL7026) CE-HTML/1.0 NETTV/4.6.0.8 SmartTvA/5.0.0 WhaleTV/2.0 TitanOS/3.0 en Ginga',
	philipsAndroidTv: 'Mozilla/5.0 (Linux; Android 11; Philips 4K TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
	operaTv: 'Opera/9.80 (Linux mips; Opera TV Store/6015; HbbTV/1.2.1 (; Hisense; SmartTV; 2.0;;) ) Presto/2.12.362 Version/12.11',
	webOSBrowser: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.128 Safari/537.36 WebAppManager',
	tizenBrowser: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36',
	desktopChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
};

const setUserAgent = (value) => Object.defineProperty(window.navigator, 'userAgent', {value, configurable: true});

describe('platform detection', () => {
	const env = {...process.env};

	afterEach(() => {
		process.env = {...env};
		delete window.PalmServiceBridge;
		delete window.tizen;
		delete window.__MOONFIN_VEGA__;
		delete window.__MOONFIN_XBOX__;
	});

	test.each([
		['philips2025', true],
		['jvc2025', true],
		['saphi2021', true],
		['sharp2025', true],
		['hospitality2026', true],
		['philipsAndroidTv', false],
		['operaTv', false],
		['webOSBrowser', false],
		['desktopChrome', false]
	])('the %s user agent is Titan: %s', (name, titan) => {
		expect(isTitanUserAgent(UA[name])).toBe(titan);
	});

	describe('in the hosted build', () => {
		beforeEach(() => {
			delete process.env.REACT_APP_PLATFORM;
			process.env.REACT_APP_HOSTED = 'true';
		});

		test.each([
			['philips2025', 'titan'],
			['jvc2025', 'titan'],
			['saphi2021', 'titan'],
			['philipsAndroidTv', 'web'],
			['operaTv', 'web'],
			['desktopChrome', 'web'],
			// A TV's own browser never gets the packaged app's native APIs
			['webOSBrowser', 'web'],
			['tizenBrowser', 'web']
		])('picks %s as %s', (name, platform) => {
			setUserAgent(UA[name]);
			expect(getPlatform()).toBe(platform);
		});

		test('a webOS service bridge on the page still makes it the plain web', () => {
			setUserAgent(UA.webOSBrowser);
			window.PalmServiceBridge = function () {};
			expect(getPlatform()).toBe('web');
		});

		test('a Titan only build is Titan anywhere', () => {
			process.env.REACT_APP_PLATFORM = 'titan';
			setUserAgent(UA.desktopChrome);
			expect(getPlatform()).toBe('titan');
		});
	});

	describe('in a packaged build', () => {
		beforeEach(() => {
			delete process.env.REACT_APP_PLATFORM;
			delete process.env.REACT_APP_HOSTED;
		});

		test('webOS and Tizen are still found the way they were', () => {
			setUserAgent(UA.webOSBrowser);
			expect(getPlatform()).toBe('webos');
			setUserAgent(UA.tizenBrowser);
			expect(getPlatform()).toBe('tizen');
		});

		test('the native shells come before the user agent', () => {
			setUserAgent(UA.desktopChrome);
			window.__MOONFIN_VEGA__ = {};
			expect(getPlatform()).toBe('vega');
			delete window.__MOONFIN_VEGA__;
			window.__MOONFIN_XBOX__ = {};
			expect(getPlatform()).toBe('xbox');
		});

		test('a desktop browser stays unknown, which loads the webOS modules as before', () => {
			setUserAgent(UA.desktopChrome);
			expect(getPlatform()).toBe('unknown');
		});
	});
});

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
