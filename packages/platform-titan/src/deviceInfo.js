// The SDK only loads on Titan OS and reports to Titan when it does. Its device,
// advertising and network ids are never read.

// The SDK's own lookup on 2020 to 2022 Philips sets waits up to 5 s, so this waits a little longer.
const SDK_TIMEOUT_MS = 6000;

// Null once the SDK has had its time, so a set that never answers falls back to the user agent.
const withTimeout = (promise) => Promise.race([
	promise,
	new Promise((resolve) => setTimeout(() => resolve(null), SDK_TIMEOUT_MS))
]);

let sdkPromise = null;

const loadSDK = () => {
	if (!sdkPromise) {
		sdkPromise = import('@titan-os/sdk').then(({getTitanSDK}) => {
			const sdk = getTitanSDK();
			return sdk.isReady.then(() => sdk);
		});
	}
	return sdkPromise;
};

let infoPromise = null;

export const getTitanDeviceInfo = () => {
	if (!infoPromise) {
		infoPromise = withTimeout(loadSDK().then((sdk) => sdk.deviceInfo.getDeviceInfo()))
			.catch((error) => {
				console.warn('[titan] SDK gave no device info:', error?.message);
				return null;
			});
	}
	return infoPromise;
};

// The remote's Back for the set's brand, 8 on Philips and 461 on JVC, or null when the SDK can't say.
export const getBackKeyCode = () =>
	withTimeout(loadSDK().then((sdk) => sdk.deviceInfo.getKeyCodes?.()?.BACK?.keyCode ?? null))
		.catch((error) => {
			console.warn('[titan] SDK gave no key codes:', error?.message);
			return null;
		});

// The SDK's firmware version can read 1.0.0 on any set, so the OS version comes from
// the user agent, as in "TitanOS/3.0". Saphi sets carry none.
export const osVersionFromUserAgent = (userAgent = '') => {
	const match = /TitanOS\/([\d.]+)/.exec(userAgent);
	return match ? `Titan OS ${match[1]}` : 'Saphi';
};

// The set's chassis, as in "TV_NT72690_2025_4K" on Philips or "Vestel-MB190" on JVC.
export const modelFromUserAgent = (userAgent = '') => {
	const match = /\b(TV_[A-Z0-9_]+)|\bModel\/([\w-]+)|\b(Vestel-MB\d+)/.exec(userAgent);
	return match ? match[1] || match[2] || match[3] : '';
};

let cached = null;

export const getDeviceInfo = async () => {
	if (cached) return cached;
	const info = await getTitanDeviceInfo();
	cached = {
		platform: 'Titan OS',
		appVersion: process.env.REACT_APP_VERSION || '0.0.0',
		userAgent: navigator.userAgent || 'Unknown',
		screenSize: `${window.screen.width}x${window.screen.height}`,
		tvVersion: osVersionFromUserAgent(navigator.userAgent),
		modelName: info?.Product?.model || info?.Product?.platform || modelFromUserAgent(navigator.userAgent) || 'Unknown',
		brand: info?.Channel?.brand || null,
		year: info?.Product?.year || null
	};
	return cached;
};
