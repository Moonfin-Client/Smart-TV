// The browser's name and major version, as in "Chrome 141", read from the user
// agent. Edge and Opera carry Chrome's token as well, and Chrome carries Safari's,
// so they are checked in this order.
const BROWSERS = [
	['Edge', /Edg\/(\d+)/],
	['Opera', /OPR\/(\d+)/],
	['Firefox', /Firefox\/(\d+)/],
	['Chrome', /Chrome\/(\d+)/],
	['Safari', /Version\/(\d+).*Safari\//]
];

export const browserFromUserAgent = (userAgent = '') => {
	for (const [name, pattern] of BROWSERS) {
		const match = pattern.exec(userAgent);
		if (match) return `${name} ${match[1]}`;
	}
	return 'Browser';
};

let cached = null;

export const getDeviceInfo = async () => {
	if (cached) return cached;
	cached = {
		platform: 'Web',
		appVersion: process.env.REACT_APP_VERSION || '0.0.0',
		userAgent: navigator.userAgent || 'Unknown',
		screenSize: `${window.screen.width}x${window.screen.height}`,
		tvVersion: browserFromUserAgent(navigator.userAgent),
		modelName: 'Browser'
	};
	return cached;
};
