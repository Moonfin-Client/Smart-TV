// The hosted build runs in a browser, where a webOS or Tizen user agent doesn't
// mean the packaged app's native APIs are there, so it only picks Titan OS or the web.
export const isHosted = () => process.env.REACT_APP_HOSTED === 'true';

export const isWebOS = () => {
	if (process.env.REACT_APP_PLATFORM === 'webos') return true;
	if (typeof window === 'undefined' || isHosted()) return false;
	return typeof window.PalmServiceBridge !== 'undefined' ||
		navigator.userAgent.includes('Web0S') ||
		navigator.userAgent.includes('webOS');
};

export const isTizen = () => {
	if (process.env.REACT_APP_PLATFORM === 'tizen') return true;
	if (typeof window === 'undefined' || isHosted()) return false;
	return typeof window.tizen !== 'undefined' ||
		navigator.userAgent.toLowerCase().includes('tizen');
};

// The React Native shell that hosts the app on Fire TV puts this on the window
// before any page code runs.
export const isVega = () => {
	if (process.env.REACT_APP_PLATFORM === 'vega') return true;
	if (typeof window === 'undefined') return false;
	return typeof window.__MOONFIN_VEGA__ !== 'undefined';
};

// The UWP host that shows the app in WebView2 on Xbox does the same.
export const isXbox = () => {
	if (process.env.REACT_APP_PLATFORM === 'xbox') return true;
	if (typeof window === 'undefined') return false;
	return typeof window.__MOONFIN_XBOX__ !== 'undefined';
};

// Titan OS names itself in every user agent it sends. The 2020 to 2022 Philips
// sets in Titan's store run Saphi, which only carries SmartTvA or WhaleTV, and a
// Philips Android TV carries neither.
export const isTitanUserAgent = (userAgent = '') =>
	/TitanOS\//.test(userAgent) || (/Philips/i.test(userAgent) && /(SmartTvA|WhaleTV)\//.test(userAgent));

// A development build can be told which platform to act as, as in ?platform=titan,
// so the Titan path can be walked through in a desktop browser.
const overridden = () => {
	if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null;
	const match = /[?&]platform=([a-z]+)/.exec(window.location.search);
	return match ? match[1] : null;
};

export const isTitan = () => {
	if (process.env.REACT_APP_PLATFORM === 'titan' || overridden() === 'titan') return true;
	if (typeof window === 'undefined') return false;
	return isTitanUserAgent(navigator.userAgent);
};

export const getPlatform = () => {
	if (process.env.REACT_APP_PLATFORM) return process.env.REACT_APP_PLATFORM;
	const forced = overridden();
	if (forced) return forced;
	if (isWebOS()) return 'webos';
	if (isTizen()) return 'tizen';
	if (isVega()) return 'vega';
	if (isXbox()) return 'xbox';
	if (isTitan()) return 'titan';
	return isHosted() ? 'web' : 'unknown';
};

// webOS 5 is the first to run Chrome 68.
export const isLegacyWebOS = () => {
	if (!isWebOS() || typeof navigator === 'undefined') return false;
	const match = (navigator.userAgent || '').match(/Chrome\/(\d+)/);
	return !match || parseInt(match[1], 10) < 68;
};

export const isLegacyTizen = () => {
	if (!isTizen() || typeof navigator === 'undefined') return false;
	const match = (navigator.userAgent || '').match(/Tizen\s([0-9]+(?:\.[0-9]+)?)/i);
	if (!match) return true;
	const version = parseFloat(match[1]);
	return !Number.isFinite(version) || version <= 3.0;
};
