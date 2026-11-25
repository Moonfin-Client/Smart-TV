import {isVega, isXbox} from '../platform';

// On Fire TV and on Xbox the app is a page inside a native shell, and the two
// shells are spoken to the same way. Resolves with the platform's bridge, or
// with null where there's no shell.
export const loadShellBridge = () => {
	if (isVega()) return import('@moonfin/platform-vega/bridge');
	if (isXbox()) return import('@moonfin/platform-xbox/bridge');
	return Promise.resolve(null);
};
