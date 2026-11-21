// The VIDAA browser's user agent names the OS version as "VIDAA/<version>".
const vidaaVersion = (userAgent = '') => {
	const match = /VIDAA\/([\d.]+)/i.exec(userAgent);
	return match ? match[1] : '';
};

let cached = null;

export const getDeviceInfo = async () => {
	if (cached) return cached;
	const version = vidaaVersion(navigator.userAgent);
	cached = {
		platform: 'Hisense VIDAA',
		appVersion: process.env.REACT_APP_VERSION || '0.0.0',
		userAgent: navigator.userAgent || 'Unknown',
		screenSize: `${window.screen.width}x${window.screen.height}`,
		tvVersion: version ? `VIDAA ${version}` : 'VIDAA',
		modelName: 'Hisense VIDAA',
		ipAddress: null
	};
	return cached;
};
