/* global navigator */
const LOG_LEVELS = {
	DEBUG: 'Debug',
	INFO: 'Information',
	WARNING: 'Warning',
	ERROR: 'Error',
	FATAL: 'Fatal'
};

const LOG_CATEGORIES = {
	PLAYBACK: 'Playback',
	NETWORK: 'Network',
	APP: 'Application',
	AUTHENTICATION: 'Authentication',
	NAVIGATION: 'Navigation'
};

import packageJson from '../../package.json';
const APP_VERSION = packageJson.version;

const MAX_LOG_BUFFER = 50;

let isEnabled = false;
let logBuffer = [];
let deviceInfo = null;
let authGetter = null;

const getTimestamp = () => {
	try {
		return new Date().toISOString();
	} catch {
		return new Date().toString();
	}
};

const getDeviceInfo = async () => {
	if (deviceInfo) return deviceInfo;

	deviceInfo = {
		platform: 'webOS',
		appVersion: APP_VERSION,
		userAgent: navigator.userAgent || 'Unknown',
		screenSize: `${window.screen.width}x${window.screen.height}`,
		webOSVersion: 'Unknown',
		modelName: 'Unknown'
	};

	// Try Enact API first
	try {
		const deviceInfoModule = await import('@enact/webos/deviceinfo');
		const device = await new Promise(resolve => deviceInfoModule.default(resolve));
		if (device) {
			deviceInfo.modelName = device.modelName || 'Unknown';
			deviceInfo.webOSVersion = device.version || device.sdkVersion || 'Unknown';
		}
		return deviceInfo;
	} catch (e) {
		// Fall back to window.webOS API
		try {
			if (typeof window.webOS !== 'undefined' && window.webOS.deviceInfo) {
				window.webOS.deviceInfo((device) => {
					if (device) {
						deviceInfo.modelName = device.modelName || 'Unknown';
						deviceInfo.webOSVersion = device.version || 'Unknown';
					}
				});
			}
		} catch {
			// webOS API not available
		}
	}

	return deviceInfo;
};

const formatLogAsText = (entry) => {
	const lines = [
		'=== Moonfin for webOS Log ===',
		`Timestamp: ${entry.timestamp}`,
		`Level: ${entry.level}`,
		`Category: ${entry.category}`,
		`Message: ${entry.message}`,
		'',
		'=== Device Info ==='
	];

	if (entry.device) {
		lines.push(`Platform: ${entry.device.platform}`);
		lines.push(`App Version: ${entry.device.appVersion}`);
		lines.push(`webOS Version: ${entry.device.webOSVersion}`);
		lines.push(`Model: ${entry.device.modelName}`);
		lines.push(`Screen: ${entry.device.screenSize}`);
		lines.push(`User Agent: ${entry.device.userAgent}`);
	}

	if (entry.context && Object.keys(entry.context).length > 0) {
		lines.push('');
		lines.push('=== Context ===');
		for (const [key, value] of Object.entries(entry.context)) {
			const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
			lines.push(`${key}: ${valueStr}`);
		}
	}

	return lines.join('\n');
};

const sendLogToServer = async (entry) => {
	if (!authGetter) {
		console.log('[ServerLogger] No auth getter configured');
		return;
	}

	const auth = authGetter();
	if (!auth?.serverUrl || !auth?.accessToken) {
		console.log('[ServerLogger] No auth available, skipping server log');
		return;
	}

	const logContent = formatLogAsText(entry);
	const url = `${auth.serverUrl}/ClientLog/Document?documentType=Log&name=moonfin-webos-log`;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'text/plain',
				'X-Emby-Authorization': `MediaBrowser Token="${auth.accessToken}"`,
				'Authorization': `MediaBrowser Token="${auth.accessToken}"`,
				'X-MediaBrowser-Token': auth.accessToken
			},
			body: logContent
		});

		if (response.ok) {
			console.log('[ServerLogger] Log sent to server successfully');
		} else if (response.status === 401 || response.status === 403) {
			console.warn('[ServerLogger] Authentication failed sending log to server');
		} else {
			console.warn('[ServerLogger] Failed to send log to server:', response.status);
		}
	} catch (err) {
		console.warn('[ServerLogger] Network error sending log to server:', err.message);
	}
};

const log = async (level, category, message, context = {}, immediate = false) => {
	const entry = {
		timestamp: getTimestamp(),
		level,
		category,
		message,
		context,
		device: await getDeviceInfo()
	};

	logBuffer.push(entry);
	if (logBuffer.length > MAX_LOG_BUFFER) {
		logBuffer.shift();
	}

	const consoleMethod = level === LOG_LEVELS.ERROR || level === LOG_LEVELS.FATAL ? 'error' : 'log';
	console[consoleMethod]('[ServerLogger]', level, '-', category, ':', message, context);

	if (!isEnabled) return;

	if (immediate) {
		sendLogToServer(entry);
	}
};

const flushLogs = async () => {
	if (!isEnabled || logBuffer.length === 0) return;

	const logsToSend = [...logBuffer];
	logBuffer = [];

	for (const entry of logsToSend) {
		await sendLogToServer(entry);
	}
};

export const serverLogger = {
	LOG_LEVELS,
	LOG_CATEGORIES,

	init: (options = {}) => {
		isEnabled = options.enabled ?? false;
		authGetter = options.getAuth ?? null;
		deviceInfo = getDeviceInfo();
		console.log('[ServerLogger] Initialized - enabled:', isEnabled);
	},

	setEnabled: (enabled) => {
		isEnabled = enabled;
		console.log('[ServerLogger] Enabled:', isEnabled);
	},

	isEnabled: () => isEnabled,

	debug: (category, message, context) => log(LOG_LEVELS.DEBUG, category, message, context),
	info: (category, message, context) => log(LOG_LEVELS.INFO, category, message, context),
	warn: (category, message, context) => log(LOG_LEVELS.WARNING, category, message, context),
	error: (category, message, context, immediate = true) => log(LOG_LEVELS.ERROR, category, message, context, immediate),
	fatal: (category, message, context) => log(LOG_LEVELS.FATAL, category, message, context, true),

	playback: (message, context) => log(LOG_LEVELS.INFO, LOG_CATEGORIES.PLAYBACK, message, context),
	playbackError: (message, context) => log(LOG_LEVELS.ERROR, LOG_CATEGORIES.PLAYBACK, message, context, true),

	flush: flushLogs,

	getBuffer: () => [...logBuffer]
};

export default serverLogger;
