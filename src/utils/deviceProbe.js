import packageJson from '../../package.json';
import {getPlatform} from '../platform';
import serverLogger from '../services/serverLogger';

// The device probe is a page of its own that the build puts beside the app. It
// tests what the device plays without any of the app running, so the app leaves
// for it rather than drawing it. What the probe needs from the app goes across in
// session storage, which the two pages share: the way back, and where on the
// signed in server its report may be sent.
const PROBE_PAGE = 'probe/index.html';
const PROBE_HANDOFF_KEY = 'moonfin_probe_handoff';

export const openDeviceProbe = (navigate = (url) => window.location.assign(url)) => {
	const handoff = {
		app: packageJson.version,
		returnTo: window.location.href,
		upload: serverLogger.documentRequest(`moonfin-${getPlatform()}-probe`)
	};
	window.sessionStorage.setItem(PROBE_HANDOFF_KEY, JSON.stringify(handoff));
	navigate(PROBE_PAGE);
};
