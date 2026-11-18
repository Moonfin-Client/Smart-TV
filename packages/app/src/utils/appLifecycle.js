/* global tizen */
import {isTizen, isVega, isWebOS, isXbox} from '../platform';
import {loadShellBridge} from '../services/shellBridge';

// webOS holds a relaunched app in the background until this is called. Sets on 4.x and
// below carry the object as PalmSystem alone, and 5.0 and above carry it under both names.
export const activateApp = () => {
	if (!isWebOS()) return;
	const host = window.webOSSystem || window.PalmSystem;
	if (!host) return;
	try {
		host.activate();
	} catch (e) {
		// nothing else would bring the app forward
	}
};

// The page can't start itself again, so the platform's background service opens
// the app once this instance has closed. Without that service a reload stands in.
export const relaunchApp = () => {
	const reload = () => window.location.reload();
	if (isWebOS() && window.PalmServiceBridge) {
		const bridge = new window.PalmServiceBridge();
		bridge.onservicecallback = (msg) => {
			let ok = false;
			try {
				ok = JSON.parse(msg).returnValue;
			} catch (e) {
				// treated as a failed call
			}
			// The service closes the app itself, so only a failure needs anything from here.
			if (!ok) reload();
		};
		bridge.call('luna://org.moonfin.webos.service/relaunch', '{}');
		return;
	}
	if (isTizen() && typeof tizen !== 'undefined') {
		try {
			const app = tizen.application.getCurrentApplication();
			tizen.application.launchAppControl(
				new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/pick', null, 'image/jpeg', null,
					[new tizen.ApplicationControlData('Relaunch', ['1'])]),
				app.appInfo.packageId + '.service',
				() => app.exit(),
				reload
			);
			return;
		} catch (e) {
			// Tizen 2.4 builds have no service
		}
	}
	reload();
};

export const renewDevMode = () => {
	if (!isWebOS() || !window.PalmServiceBridge) return;
	const bridge = new window.PalmServiceBridge();
	bridge.onservicecallback = (msg) => {
		let result = 'no reply';
		try {
			const res = JSON.parse(msg);
			result = !res.returnValue ? res.errorText : res.status !== 200 ? 'HTTP ' + res.status : JSON.parse(res.body).result;
		} catch (e) {
			result = 'unreadable reply';
		}
		if (result === 'success') console.log('[DevMode] Session renewed');
		else console.warn('[DevMode] Session not renewed: ' + result);
	};
	bridge.call('luna://org.moonfin.webos.service/extendDevMode', '{}');
};

export const exitApp = () => {
	if (isTizen() && typeof tizen !== 'undefined') {
		tizen.application.getCurrentApplication().exit();
		return;
	}
	// The WebView has no window of its own to close, so the shell is asked instead.
	if (isVega() || isXbox()) {
		loadShellBridge().then((bridge) => bridge.exitApp());
		return;
	}
	window.close();
};
