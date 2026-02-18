/* global webapis */
/**
 * Server Logger Service for Tizen
 * Sends diagnostic logs to Jellyfin server for debugging
 */

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

const MAX_LOG_BUFFER = 50;
const APP_VERSION = '2.0.0';

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

const getDeviceInfo = () => {
	if (deviceInfo) return deviceInfo;

	deviceInfo = {
		platform: 'Tizen',
		appVersion: APP_VERSION,
		userAgent: navigator.userAgent || 'Unknown',
		screenSize: `${window.screen.width}x${window.screen.height}`,
		tizenVersion: 'Unknown',
		modelName: 'Unknown'
	};

	try {
		if (typeof webapis !== 'undefined' && webapis.productinfo) {
			if (typeof webapis.productinfo.getModel === 'function') {
				deviceInfo.modelName = webapis.productinfo.getModel() || 'Unknown';
			}
			if (typeof webapis.productinfo.getFirmware === 'function') {
				const firmware = webapis.productinfo.getFirmware();
				const match = firmware?.match(/(\d{4})/);
				if (match) {
					const year = parseInt(match[1], 10);
					// Map years to approximate Tizen versions
					if (year >= 2024) deviceInfo.tizenVersion = '8.0';
					else if (year >= 2023) deviceInfo.tizenVersion = '7.0';
					else if (year >= 2022) deviceInfo.tizenVersion = '6.5';
					else if (year >= 2021) deviceInfo.tizenVersion = '6.0';
					else if (year >= 2020) deviceInfo.tizenVersion = '5.5';
					else if (year >= 2019) deviceInfo.tizenVersion = '5.0';
					else if (year >= 2018) deviceInfo.tizenVersion = '4.0';
					else deviceInfo.tizenVersion = '3.0';
				}
			}
		}
	} catch {
		// Tizen API not available
	}

	return deviceInfo;
};

const formatLogAsText = (entry) => {
	const lines = [
		'=== Moonfin for Tizen Log ===',
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
		lines.push(`Tizen Version: ${entry.device.tizenVersion}`);
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
	const url = `${auth.serverUrl}/ClientLog/Document?documentType=Log&name=moonfin-tizen-log`;

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
		} else {
			console.log(`[ServerLogger] Server returned ${response.status}`);
		}
	} catch (err) {
		console.log('[ServerLogger] Failed to send log:', err.message);
	}
};

const log = async (level, category, message, context = {}) => {
	const entry = {
		timestamp: getTimestamp(),
		level,
		category,
		message,
		context,
		device: getDeviceInfo()
	};

	// Always log to console
	const consoleMethod = level === LOG_LEVELS.ERROR || level === LOG_LEVELS.FATAL ? 'error' :
		level === LOG_LEVELS.WARNING ? 'warn' : 'log';
	console[consoleMethod](`[${category}] ${message}`, context);

	// Buffer log entry
	logBuffer.push(entry);
	if (logBuffer.length > MAX_LOG_BUFFER) {
		logBuffer.shift();
	}

	// Send to server if enabled
	if (isEnabled) {
		await sendLogToServer(entry);
	}
};

export const enableServerLogging = (enabled = true) => {
	isEnabled = enabled;
};

export const setAuthGetter = (getter) => {
	authGetter = getter;
};

export const getLogBuffer = () => [...logBuffer];

export const clearLogBuffer = () => {
	logBuffer = [];
};

export const debug = (category, message, context) => log(LOG_LEVELS.DEBUG, category, message, context);
export const info = (category, message, context) => log(LOG_LEVELS.INFO, category, message, context);
export const warning = (category, message, context) => log(LOG_LEVELS.WARNING, category, message, context);
export const error = (category, message, context) => log(LOG_LEVELS.ERROR, category, message, context);
export const fatal = (category, message, context) => log(LOG_LEVELS.FATAL, category, message, context);

export {LOG_LEVELS, LOG_CATEGORIES};

export default {
	enableServerLogging,
	setAuthGetter,
	getLogBuffer,
	clearLogBuffer,
	debug,
	info,
	warning,
	error,
	fatal,
	LOG_LEVELS,
	LOG_CATEGORIES
};
