import {legacyAuthHeader} from '../utils/serverRoutes';

// Emby has no client log endpoint of its own, so reports go to the Moonfin plugin, which writes
// them into the server's log folder. That route is only there when the plugin is, with client log
// upload turned on, which is what its ping reports. Plex has neither the endpoint nor the plugin.
export const acceptsReports = (serverType, pluginTakesLogs) => serverType !== 'plex' && (serverType !== 'emby' || pluginTakesLogs === true);

// Where a log document goes and how it's sent, for the server `auth` describes.
export const clientLogRequest = (auth, logName, body) => {
	if (auth.serverType === 'emby') {
		return {
			url: `${auth.serverUrl}/Moonfin/ClientLog/Document`,
			init: {
				method: 'POST',
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Authorization': auth.authHeader,
					...legacyAuthHeader(auth.serverType, auth.authHeader)
				},
				body
			}
		};
	}
	return {
		url: `${auth.serverUrl}/ClientLog/Document?documentType=Log&name=${logName}`,
		init: {
			method: 'POST',
			headers: {
				'Content-Type': 'text/plain',
				'Authorization': `MediaBrowser Token="${auth.accessToken}"`
			},
			body
		}
	};
};
