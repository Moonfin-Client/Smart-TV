import {bootData} from './bridge';

// The Fire TV model is only in the user agent, as in "AFTCR001 user/55".
export const modelFromUserAgent = (userAgent = '') => {
	const match = /;\s*(AFT[A-Z0-9]+)\s+user\b/i.exec(userAgent);
	return match ? match[1] : '';
};

let cached = null;

export const getDeviceInfo = async () => {
	if (cached) return cached;
	const boot = bootData();
	cached = {
		platform: 'Fire TV',
		appVersion: process.env.REACT_APP_VERSION || '0.0.0',
		userAgent: navigator.userAgent || 'Unknown',
		screenSize: `${window.screen.width}x${window.screen.height}`,
		tvVersion: boot?.os?.version ? `Vega OS ${boot.os.version}` : 'Unknown',
		modelName: modelFromUserAgent(navigator.userAgent) || 'Unknown',
		ipAddress: boot?.ip || null
	};
	return cached;
};
