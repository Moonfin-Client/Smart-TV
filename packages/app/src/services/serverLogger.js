import {getPlatform} from '../platform';
import {setNetworkLogSink} from '../utils/networkLogSink';
import {setSyncLogSink} from '../utils/syncLog';

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
	NAVIGATION: 'Navigation',
	SYNCPLAY: 'SyncPlay'
};

import packageJson from '../../package.json';
const APP_VERSION = packageJson.version;

// Tracing every request fills this fast, but these sets have little memory to spare.
const MAX_LOG_BUFFER = 500;

let isEnabled = false;
let isRecording = false;
let logBuffer = [];
let deviceInfoCache = null;
let authGetter = null;
let deviceInfoLoader = null;

const listeners = new Set();

const notify = () => {
	listeners.forEach((fn) => {
		try { fn(); } catch { /* a broken listener must not stop the rest */ }
	});
};

const getTimestamp = () => {
	try {
		return new Date().toISOString();
	} catch {
		return new Date().toString();
	}
};

const loadDeviceInfo = async () => {
	if (deviceInfoCache) return deviceInfoCache;

	if (!deviceInfoLoader) {
		if (getPlatform() === 'tizen') {
			deviceInfoLoader = import('@moonfin/platform-tizen/deviceInfo');
		} else {
			deviceInfoLoader = import('@moonfin/platform-webos/deviceInfo');
		}
	}

	try {
		const mod = await deviceInfoLoader;
		deviceInfoCache = await mod.getDeviceInfo();
	} catch {
		deviceInfoCache = {
			platform: getPlatform(),
			appVersion: APP_VERSION,
			userAgent: navigator.userAgent || 'Unknown',
			screenSize: `${window.screen.width}x${window.screen.height}`,
			tvVersion: 'Unknown',
			modelName: 'Unknown'
		};
	}

	return deviceInfoCache;
};

const platformName = getPlatform() === 'tizen' ? 'Tizen' : 'webOS';
const logEndpointName = `moonfin-${getPlatform()}-log`;

const formatLogAsText = (entry) => {
	const lines = [
`=== Moonfin for ${platformName} Log ===`,
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
		lines.push(`TV Version: ${entry.device.tvVersion}`);
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

const postDocument = (auth, body) => fetch(
`${auth.serverUrl}/ClientLog/Document?documentType=Log&name=${logEndpointName}`,
{
	method: 'POST',
	headers: {
		'Content-Type': 'text/plain',
		'Authorization': `MediaBrowser Token="${auth.accessToken}"`,
		'X-MediaBrowser-Token': auth.accessToken
	},
	body
}
);

const sendLogToServer = async (entry) => {
	if (!authGetter) return;

	const auth = authGetter();
	if (!auth?.serverUrl || !auth?.accessToken) return;

	try {
		await postDocument(auth, formatLogAsText(entry));
	} catch (err) {
		console.warn('[ServerLogger] Network error:', err.message);
	}
};

const log = async (level, category, message, context = {}, immediate = false) => {
// Tracing every request puts this on the hottest path in the app, so nothing happens,
// not even a console write, until the user asks for it.
	if (!isRecording && !isEnabled) return;

	const entry = {
		timestamp: getTimestamp(),
		level,
		category,
		message,
		context,
		device: await loadDeviceInfo()
	};

	logBuffer.push(entry);
	if (logBuffer.length > MAX_LOG_BUFFER) {
		logBuffer.shift();
	}
	notify();

	const consoleMethod = level === LOG_LEVELS.ERROR || level === LOG_LEVELS.FATAL ? 'error' : 'log';
	console[consoleMethod]('[ServerLogger]', level, '-', category, ':', message, context);

	if (!isEnabled) return;

	if (immediate) {
		sendLogToServer(entry);
	}
};

// One document holding the whole buffer. The per entry formatter above repeats the device
// block on every line, which suits a single error report and not a trace of hundreds.
const exportText = () => {
	const device = deviceInfoCache;
	const lines = [
`=== Moonfin for ${platformName} diagnostic report ===`,
`Generated: ${getTimestamp()}`,
`App Version: ${device?.appVersion || APP_VERSION}`,
`TV Version: ${device?.tvVersion || 'Unknown'}`,
`Model: ${device?.modelName || 'Unknown'}`,
`User Agent: ${device?.userAgent || 'Unknown'}`,
`Entries: ${logBuffer.length}`,
'='.repeat(60)
	];

	for (const entry of logBuffer) {
		lines.push(`${entry.timestamp} ${entry.level} [${entry.category}] ${entry.message}`);
		const context = entry.context && Object.keys(entry.context).length > 0
			? JSON.stringify(entry.context)
			: null;
		if (context) lines.push(`    ${context}`);
	}

	return lines.join('\n');
};

// Sends the buffer as a single document and keeps it, so a report can be sent twice
// without the second one describing the first.
const uploadReport = async () => {
	if (!authGetter) throw new Error('Logging is not initialised');

	const auth = authGetter();
	if (!auth?.serverUrl || !auth?.accessToken) throw new Error('No server to send the report to');

	await loadDeviceInfo();
	const response = await postDocument(auth, exportText());

	// Jellyfin answers 403 when client logging is switched off server side, which is
	// worth surfacing rather than reporting a success that never happened.
	if (!response.ok) {
		const error = new Error(`Upload failed: ${response.status}`);
		error.status = response.status;
		throw error;
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
		loadDeviceInfo();
	},

	setEnabled: (enabled) => {
		isEnabled = enabled;
	},

	isEnabled: () => isEnabled,

	// Recording is the switch for keeping a local trace. Attaching the sink is what makes
	// the fetch wrappers start reporting, and detaching it is what makes them free again.
	setRecording: (recording) => {
		if (recording === isRecording) return;
		isRecording = recording;
		setNetworkLogSink(recording
			? (message, level) => log(level === 'error' ? LOG_LEVELS.ERROR : LOG_LEVELS.DEBUG, LOG_CATEGORIES.NETWORK, message)
			: null);
		setSyncLogSink(recording
			? (message) => log(LOG_LEVELS.DEBUG, LOG_CATEGORIES.SYNCPLAY, message)
			: null);
	},

	isRecording: () => isRecording,

	subscribe: (fn) => {
		listeners.add(fn);
		return () => listeners.delete(fn);
	},

	clear: () => {
		logBuffer = [];
		notify();
	},

	uploadReport,

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
