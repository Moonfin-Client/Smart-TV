import {legacyAuthHeader} from '../utils/serverRoutes';

// Emby has no client log endpoint of its own, so reports go to the Moonfin plugin, which writes
// them into the server's log folder. Plex and Silo have none either, so theirs go to Moonbase, the
// companion beside Plex or the plugin on Silo, which writes them into its own log. That route is
// only there with client log upload turned on, which is what the ping reports.
export const logsGoToMoonbase = (serverType) => serverType === 'plex' || serverType === 'silo';

export const acceptsReports = (serverType, pluginTakesLogs) => (serverType !== 'emby' && !logsGoToMoonbase(serverType)) || pluginTakesLogs === true;

// Where a log document goes and how it's sent, for the server `auth` describes. On Plex and Silo
// that's the Moonbase endpoint `moonbase`, and the client's own header still names the app to it.
export const clientLogRequest = (auth, logName, body, moonbase) => {
	if (moonbase) {
		return {
			url: `${moonbase.base}/Moonfin/ClientLog/Document`,
			init: {
				method: 'POST',
				headers: {'Content-Type': 'text/plain; charset=utf-8', 'Authorization': auth.authHeader, ...moonbase.headers},
				body
			},
			send: moonbase.fetch
		};
	}
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
