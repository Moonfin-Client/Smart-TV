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

export const getPlatform = () => {
	if (process.env.REACT_APP_PLATFORM) return process.env.REACT_APP_PLATFORM;
	if (isWebOS()) return 'webos';
	if (isTizen()) return 'tizen';
	return 'unknown';
};

export const isLegacyTizen = () => {
	if (!isTizen() || typeof navigator === 'undefined') return false;
	const match = (navigator.userAgent || '').match(/Tizen\s([0-9]+(?:\.[0-9]+)?)/i);
	if (!match) return true;
	const version = parseFloat(match[1]);
	return !Number.isFinite(version) || version <= 3.0;
};
