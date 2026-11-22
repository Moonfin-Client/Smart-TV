export const isWebOS = () => {
	if (process.env.REACT_APP_PLATFORM === 'webos') return true;
	if (typeof window === 'undefined') return false;
	return typeof window.PalmServiceBridge !== 'undefined' ||
		navigator.userAgent.includes('Web0S') ||
		navigator.userAgent.includes('webOS');
};

export const isTizen = () => {
	if (process.env.REACT_APP_PLATFORM === 'tizen') return true;
	if (typeof window === 'undefined') return false;
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

export const getPlatform = () => {
	if (process.env.REACT_APP_PLATFORM) return process.env.REACT_APP_PLATFORM;
	if (isWebOS()) return 'webos';
	if (isTizen()) return 'tizen';
	if (isVega()) return 'vega';
	if (isXbox()) return 'xbox';
	return 'unknown';
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
