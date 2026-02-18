/* global tizen */
/**
 * Tizen TV Remote Key Utilities
 *
 * Handles key registration and provides key code constants
 * for Samsung Tizen TV remote control buttons.
 */

// Tizen TV Key Codes
export const TIZEN_KEYS = {
	// Navigation
	UP: 38,
	DOWN: 40,
	LEFT: 37,
	RIGHT: 39,
	ENTER: 13,
	BACK: 10009,
	EXIT: 10182,

	// Media Control
	PLAY: 415,
	PAUSE: 19,
	STOP: 413,
	REWIND: 412,
	FAST_FORWARD: 417,
	PLAY_PAUSE: 10252,

	// Color Buttons
	RED: 403,
	GREEN: 404,
	YELLOW: 405,
	BLUE: 406,

	// Number Keys
	NUM_0: 48,
	NUM_1: 49,
	NUM_2: 50,
	NUM_3: 51,
	NUM_4: 52,
	NUM_5: 53,
	NUM_6: 54,
	NUM_7: 55,
	NUM_8: 56,
	NUM_9: 57,

	// Channel
	CHANNEL_UP: 427,
	CHANNEL_DOWN: 428,
	CHANNEL_LIST: 10073,

	// Volume (usually handled by system)
	VOLUME_UP: 447,
	VOLUME_DOWN: 448,
	MUTE: 449,

	// Other
	INFO: 457,
	CAPTION: 10221,
	SEARCH: 10225,
	EXTRA: 10253,
	GUIDE: 458,
	PREVIOUS: 10232,
	NEXT: 10233,
	RECORD: 416,
	MENU: 10133,
	TOOLS: 10135,
	SOURCE: 10072,
	E_MANUAL: 10146,
	MIC: 10224,
	PICTURESIZE: 10140,
	SOCCER: 10228,
	TELETEXT: 10200,
	MINUS: 189,
	PRECH: 10190,
	TTXMIX: 10211
};

// Key names for registration with tizen.tvinputdevice
export const TIZEN_KEY_NAMES = [
	'MediaPlay',
	'MediaPause',
	'MediaStop',
	'MediaRewind',
	'MediaFastForward',
	'MediaPlayPause',
	'MediaTrackPrevious',
	'MediaTrackNext',
	'MediaRecord',
	'ColorF0Red',
	'ColorF1Green',
	'ColorF2Yellow',
	'ColorF3Blue',
	'ChannelUp',
	'ChannelDown',
	'ChannelList',
	'Info',
	'Caption',
	'Search',
	'Extra',
	'Guide',
	'E-Manual',
	'Menu',
	'Tools',
	'Source',
	'PictureSize',
	'Exit',
	'Minus',
	'PreviousChannel',
	'TTXMixSubte'
];

// Keys to register for basic app functionality
export const ESSENTIAL_KEY_NAMES = [
	'MediaPlay',
	'MediaPause',
	'MediaStop',
	'MediaRewind',
	'MediaFastForward',
	'MediaPlayPause',
	'ColorF0Red',
	'ColorF1Green',
	'ColorF2Yellow',
	'ColorF3Blue',
	'Info',
	'Search'
];

/**
 * Register TV input keys with the Tizen system
 * This must be called to receive key events for media keys, color buttons, etc.
 * @param {string[]} keyNames - Array of key names to register
 */
export const registerKeys = (keyNames = ESSENTIAL_KEY_NAMES) => {
	if (typeof tizen === 'undefined' || !tizen.tvinputdevice) {
		console.warn('tizen.tvinputdevice not available - running in browser?');
		return;
	}

	try {
		const supportedKeys = tizen.tvinputdevice.getSupportedKeys();
		const supportedKeyNames = supportedKeys.map(k => k.name);

		keyNames.forEach(keyName => {
			if (supportedKeyNames.includes(keyName)) {
				try {
					tizen.tvinputdevice.registerKey(keyName);
					console.log(`Registered key: ${keyName}`);
				} catch (e) {
					console.warn(`Failed to register key ${keyName}:`, e);
				}
			} else {
				console.warn(`Key not supported: ${keyName}`);
			}
		});
	} catch (error) {
		console.error('Error registering TV keys:', error);
	}
};

/**
 * Register all available media keys
 */
export const registerMediaKeys = () => {
	registerKeys([
		'MediaPlay',
		'MediaPause',
		'MediaStop',
		'MediaRewind',
		'MediaFastForward',
		'MediaPlayPause',
		'MediaTrackPrevious',
		'MediaTrackNext'
	]);
};

/**
 * Register color buttons (Red, Green, Yellow, Blue)
 */
export const registerColorKeys = () => {
	registerKeys([
		'ColorF0Red',
		'ColorF1Green',
		'ColorF2Yellow',
		'ColorF3Blue'
	]);
};

/**
 * Unregister TV input keys
 * @param {string[]} keyNames - Array of key names to unregister
 */
export const unregisterKeys = (keyNames) => {
	if (typeof tizen === 'undefined' || !tizen.tvinputdevice) {
		return;
	}

	keyNames.forEach(keyName => {
		try {
			tizen.tvinputdevice.unregisterKey(keyName);
		} catch (e) {
			console.warn(`Failed to unregister key ${keyName}:`, e);
		}
	});
};

/**
 * Get list of supported keys on the current device
 * @returns {Object[]} Array of supported key objects with name and code properties
 */
export const getSupportedKeys = () => {
	if (typeof tizen === 'undefined' || !tizen.tvinputdevice) {
		return [];
	}

	try {
		return tizen.tvinputdevice.getSupportedKeys();
	} catch (error) {
		console.error('Error getting supported keys:', error);
		return [];
	}
};

/**
 * Check if a key event matches a specific Tizen key
 * @param {KeyboardEvent} event - The keyboard event
 * @param {number} tizenKeyCode - The Tizen key code to check
 * @returns {boolean} True if the event matches the key code
 */
export const isKey = (event, tizenKeyCode) => {
	return event.keyCode === tizenKeyCode;
};

/**
 * Check if the event is a back button press (handles both Tizen and browser)
 * @param {KeyboardEvent} event - The keyboard event
 * @returns {boolean} True if it's a back button press
 */
export const isBackKey = (event) => {
	return event.keyCode === TIZEN_KEYS.BACK ||

		event.keyCode === 27 ||  // Escape (for browser testing)
		event.keyCode === 8;     // Backspace
};

/**
 * Check if the event is an exit button press
 * @param {KeyboardEvent} event - The keyboard event
 * @returns {boolean} True if it's an exit button press
 */
export const isExitKey = (event) => {
	return event.keyCode === TIZEN_KEYS.EXIT;
};

/**
 * Check if the event is a play/pause key
 * @param {KeyboardEvent} event - The keyboard event
 * @returns {boolean} True if it's a play or pause key
 */
export const isPlayPauseKey = (event) => {
	return event.keyCode === TIZEN_KEYS.PLAY ||
		event.keyCode === TIZEN_KEYS.PAUSE ||
		event.keyCode === TIZEN_KEYS.PLAY_PAUSE;
};

/**
 * Check if the event is a media control key
 * @param {KeyboardEvent} event - The keyboard event
 * @returns {boolean} True if it's any media control key
 */
export const isMediaKey = (event) => {
	const mediaKeys = [
		TIZEN_KEYS.PLAY,
		TIZEN_KEYS.PAUSE,
		TIZEN_KEYS.STOP,
		TIZEN_KEYS.REWIND,
		TIZEN_KEYS.FAST_FORWARD,
		TIZEN_KEYS.PLAY_PAUSE
	];
	return mediaKeys.includes(event.keyCode);
};

/**
 * Get the key name from event (for debugging)
 * @param {KeyboardEvent} event - The keyboard event
 * @returns {string} Human-readable key name
 */
export const getKeyName = (event) => {
	const keyCode = event.keyCode;
	for (const [name, code] of Object.entries(TIZEN_KEYS)) {
		if (code === keyCode) {
			return name;
		}
	}
	return `UNKNOWN(${keyCode})`;
};

export default {
	TIZEN_KEYS,
	TIZEN_KEY_NAMES,
	ESSENTIAL_KEY_NAMES,
	registerKeys,
	registerMediaKeys,
	registerColorKeys,
	unregisterKeys,
	getSupportedKeys,
	isKey,
	isBackKey,
	isExitKey,
	isPlayPauseKey,
	isMediaKey,
	getKeyName
};
