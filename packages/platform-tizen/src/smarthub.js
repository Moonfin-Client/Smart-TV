/**
 * Samsung Smart Hub Preview Integration for Moonfin
 *
 * Provides "Continue Watching" and "Next Up" tiles on the Samsung Smart Hub,
 * allowing users to see and launch content directly from the TV home screen.
 *
 * @see https://developer.samsung.com/smarttv/develop/guides/smart-hub-preview/smart-hub-preview.html
 */
/* global tizen */

import {getServerUrl, getUserId, getAuthHeader} from './jellyfinApi';

const NEXT_UP_LIMIT = 2;
const RESUME_LIMIT = 4;
const UPDATE_INTERVAL_MS = 600000; // 10 minutes

let packageId = null;
let serviceId = null;
let localMessagePort = null;
let messagePortListener = null;

/**
 * Initialize package/service IDs from Tizen APIs
 */
const initIds = () => {
	if (packageId) return;
	try {
		packageId = tizen.application.getCurrentApplication().appInfo.packageId;
		serviceId = packageId + '.service';
	} catch (e) {
		console.warn('[SmartHub] Could not get package ID:', e.message);
	}
};

/**
 * Get the best thumbnail image URL for a Smart Hub tile.
 * Prefers Thumb > Backdrop > Primary images, using 16:9 ratio where possible.
 *
 * @param {Object} item - Jellyfin media item
 * @returns {string|null} Full image URL or null
 */
function getTileImageUrl (item) {
	if (!item) return null;
	item = item.ProgramInfo || item;

	const serverUrl = getServerUrl();
	if (!serverUrl) return null;

	const height = 250;
	let imgTag = null;
	let imgType = null;
	let itemId = null;

	// Priority: Thumb > Backdrop > Primary (prefer 16:9 ratio images for Smart Hub tiles)
	if (item.ImageTags && item.ImageTags.Thumb) {
		imgType = 'Thumb';
		imgTag = item.ImageTags.Thumb;
	} else if (item.SeriesThumbImageTag) {
		imgType = 'Thumb';
		imgTag = item.SeriesThumbImageTag;
		itemId = item.SeriesId;
	} else if (item.ParentThumbItemId && item.ParentThumbImageTag && item.MediaType !== 'Photo') {
		imgType = 'Thumb';
		imgTag = item.ParentThumbImageTag;
		itemId = item.ParentThumbItemId;
	} else if (item.BackdropImageTags && item.BackdropImageTags.length) {
		imgType = 'Backdrop';
		imgTag = item.BackdropImageTags[0];
	} else if (item.ParentBackdropImageTags && item.ParentBackdropImageTags.length) {
		imgType = 'Backdrop';
		imgTag = item.ParentBackdropImageTags[0];
		itemId = item.ParentBackdropItemId;
	} else if (item.ImageTags && item.ImageTags.Primary && (item.Type !== 'Episode' || item.ChildCount !== 0)) {
		imgType = 'Primary';
		imgTag = item.ImageTags.Primary;
	} else if (item.SeriesPrimaryImageTag) {
		imgType = 'Primary';
		imgTag = item.SeriesPrimaryImageTag;
		itemId = item.SeriesId;
	} else if (item.PrimaryImageTag) {
		imgType = 'Primary';
		imgTag = item.PrimaryImageTag;
		itemId = item.PrimaryImageItemId;
	} else if (item.ParentPrimaryImageTag) {
		imgType = 'Primary';
		imgTag = item.ParentPrimaryImageTag;
		itemId = item.ParentPrimaryImageItemId;
	} else if (item.AlbumId && item.AlbumPrimaryImageTag) {
		imgType = 'Primary';
		imgTag = item.AlbumPrimaryImageTag;
		itemId = item.AlbumId;
	}

	if (!itemId) {
		itemId = item.Id;
	}

	if (imgTag && imgType) {
		const params = new URLSearchParams({
			fillHeight: height,
			quality: 96,
			tag: imgTag,
			format: 'jpg'
		});

		const playedPercentage = item.UserData && item.UserData.PlayedPercentage;
		if (playedPercentage !== null && playedPercentage !== undefined) {
			params.set('percentPlayed', playedPercentage);
		}

		return `${serverUrl}/Items/${itemId}/Images/${imgType}?${params.toString()}`;
	}

	return null;
}

/**
 * Creates a JSON object representing one tile for the Smart Hub preview.
 *
 * @param {Object} item - Jellyfin media item
 * @returns {Object|null} Formatted tile JSON or null if invalid
 */
function generateTitleJson (item) {
	if (!item) {
		console.warn('[SmartHub] Missing item data');
		return null;
	}

	const actionData = {
		serverid: item.ServerId,
		id: item.Id
	};

	let tile = null;
	const imgURL = getTileImageUrl(item);

	if (item.Type === 'Episode') {
		actionData.type = 'episode';
		actionData.seasonid = item.SeasonId;
		actionData.seriesid = item.SeriesId;

		let seriesEpisode = '';
		if (item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined) {
			seriesEpisode = 'S' + item.ParentIndexNumber + ':E' + item.IndexNumber + ' - ';
		}

		tile = {
			title: seriesEpisode + item.Name,
			subtitle: item.SeriesName,
			image_ratio: '16by9',
			image_url: imgURL,
			action_data: JSON.stringify(actionData),
			is_playable: true
		};
	} else if (item.Type === 'Movie') {
		actionData.type = 'movie';
		tile = {
			title: item.Name,
			image_ratio: '16by9',
			image_url: imgURL,
			action_data: JSON.stringify(actionData),
			is_playable: true
		};
	}

	return tile;
}

/**
 * Creates the full Smart Hub preview JSON with sections and tiles.
 *
 * @param {Array<Object>} sectionsData - Array of section descriptors
 * @returns {Object} JSON object with `sections` array for Smart Hub
 */
function generateSmartViewJson (sectionsData) {
	if (!Array.isArray(sectionsData) || sectionsData.length === 0) {
		console.warn('[SmartHub] Invalid or empty sections data.');
		return {sections: []};
	}

	const smartViewJson = {sections: []};

	sectionsData.forEach(function (section) {
		if (Array.isArray(section.data) && section.data.length > 0) {
			const tiles = section.data.slice(0, section.limit).map(generateTitleJson).filter(Boolean);
			if (tiles.length > 0) {
				smartViewJson.sections.push({
					title: section.section_title,
					tiles: tiles
				});
			}
		}
	});

	return smartViewJson;
}

/**
 * Callback for receiving messages from the Tizen background service.
 *
 * @param {Array<Object>} uiData - Received data from the service
 */
function onReceived (uiData) {
	console.log('[SmartHub] Received from service: ' + uiData[0].value);
	if (uiData[0].value === 'Service stopping...' || uiData[0].value === 'Service exiting...') {
		window._smartHubUpdated = true;
		if (localMessagePort && messagePortListener) {
			try {
				localMessagePort.removeMessagePortListener(messagePortListener);
			} catch (e) {
				// Ignore
			}
		}
	}
}

/**
 * Launches the background service and sends Smart Hub preview data.
 *
 * @param {Object} smartViewJsonData - The preview JSON to send to the service
 */
function startServiceAndUpdateSmartView (smartViewJsonData) {
	initIds();
	if (!packageId || !serviceId) return;

	console.log('[SmartHub] Starting service');
	localMessagePort = tizen.messageport.requestLocalMessagePort(packageId);
	messagePortListener = localMessagePort.addMessagePortListener(onReceived);

	try {
		tizen.application.launchAppControl(
			new tizen.ApplicationControl(
				'http://tizen.org/appcontrol/operation/pick',
				null,
				'image/jpeg',
				null,
				[
					new tizen.ApplicationControlData('Preview', [JSON.stringify(smartViewJsonData)])
				]
			),
			serviceId,
			function () { console.log('[SmartHub] Message sent to ' + serviceId); },
			function (error) { console.error('[SmartHub] Launch failed:', error.message); }
		);
	} catch (error) {
		console.error('[SmartHub] Error sending message:', error);
	}
}

/**
 * Wait for the Smart Hub update to complete (service acknowledges).
 *
 * @returns {Promise<void>}
 */
function waitForSmartHubUpdate () {
	return new Promise(function (resolve) {
		const interval = setInterval(function () {
			if (window._smartHubUpdated === true) {
				clearInterval(interval);
				resolve();
			}
		}, 100);

		// Timeout after 15 seconds to avoid hanging forever
		setTimeout(function () {
			clearInterval(interval);
			resolve();
		}, 15000);
	});
}

/**
 * Delay execution for a specified time.
 *
 * @param {number} time - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay (time) {
	return new Promise(function (resolve) { setTimeout(resolve, time); });
}

/**
 * Fetch items from the Jellyfin API using stored credentials.
 * This is used instead of the React API hooks since Smart Hub runs
 * outside the React component tree.
 *
 * @param {string} endpoint - API endpoint path
 * @returns {Promise<Object>} API response JSON
 */
async function apiRequest (endpoint) {
	const serverUrl = getServerUrl();
	if (!serverUrl) throw new Error('No server URL configured');

	const response = await fetch(`${serverUrl}${endpoint}`, {
		method: 'GET',
		headers: {
			'X-Emby-Authorization': getAuthHeader(),
			'Content-Type': 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error('API Error: ' + response.status);
	}

	return response.json();
}

/**
 * Perform a single Smart Hub preview update cycle.
 * Fetches resume/next up data and pushes it to the Smart Hub service.
 */
export async function runSmartViewUpdate () {
	window._smartHubUpdated = false;

	const userId = getUserId();
	const serverUrl = getServerUrl();

	if (!userId || !serverUrl) {
		console.log('[SmartHub] No authenticated user, skipping update');
		window._smartHubUpdated = true;
		return;
	}

	try {
		const baseFields = 'PrimaryImageAspectRatio,Overview';
		const imageFields = 'ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb';

		const [resumableItems, nextUpEpisodes] = await Promise.all([
			apiRequest(
				`/Users/${userId}/Items/Resume?Limit=${RESUME_LIMIT}&MediaTypes=Video&Fields=${baseFields}&${imageFields}&EnableTotalRecordCount=false&Recursive=true`
			),
			apiRequest(
				`/Shows/NextUp?UserId=${userId}&Limit=${NEXT_UP_LIMIT}&Fields=${baseFields}&${imageFields}&EnableTotalRecordCount=false`
			)
		]);

		const smartViewJsonData = generateSmartViewJson([
			{section_title: 'Next Up', limit: NEXT_UP_LIMIT, data: nextUpEpisodes.Items},
			{section_title: 'Continue Watching', limit: RESUME_LIMIT, data: resumableItems.Items}
		]);

		console.log('[SmartHub] Generated preview data: ' + JSON.stringify(smartViewJsonData));

		await delay(2000);
		startServiceAndUpdateSmartView(smartViewJsonData);
		await waitForSmartHubUpdate();
	} catch (error) {
		console.error('[SmartHub] Error fetching data:', error);
		window._smartHubUpdated = true;
	}
}

/**
 * Start the Smart Hub preview updater loop.
 * Waits for authentication, then updates every 10 minutes.
 */
export async function startSmartHubUpdater () {
	// Wait for authentication to be ready
	let retries = 0;
	while (!getUserId() || !getServerUrl()) {
		if (retries > 60) {
			console.log('[SmartHub] Timed out waiting for authentication');
			return;
		}
		await new Promise(function (resolve) { setTimeout(resolve, 2000); });
		retries++;
	}

	console.log('[SmartHub] Starting preview updater');

	// Make runSmartViewUpdate available globally for exit handler
	window.runSmartViewUpdate = runSmartViewUpdate;

	// Continuous update loop
	while (true) { // eslint-disable-line no-constant-condition
		const startTime = Date.now();

		await runSmartViewUpdate();

		const elapsedTime = Date.now() - startTime;
		const remainingTime = Math.max(UPDATE_INTERVAL_MS - elapsedTime, 0);
		await new Promise(function (resolve) { setTimeout(resolve, remainingTime); });
	}
}

/**
 * Handle deep linking from Smart Hub tile clicks.
 * Processes the PAYLOAD from Samsung app control and dispatches
 * a custom event that the React app can listen to for navigation.
 *
 * @see https://developer.samsung.com/smarttv/develop/guides/smart-hub-preview/implementing-public-preview.html
 */
export function handleDeepLink () {
	try {
		const requestedAppControl = tizen.application.getCurrentApplication().getRequestedAppControl();
		if (!requestedAppControl) {
			console.log('[SmartHub] No app control request');
			return;
		}

		const appControlData = requestedAppControl.appControl.data;
		console.log('[SmartHub] appControlData: ' + JSON.stringify(appControlData));

		for (let i = 0; i < appControlData.length; i++) {
			if (appControlData[i].key === 'PAYLOAD') {
				const actionData = JSON.parse(appControlData[i].value[0]).values;
				console.log('[SmartHub] Deep link action data: ' + actionData);

				const parsedActionData = JSON.parse(actionData);

				if (parsedActionData.id) {
					// Dispatch custom event for the React app to handle
					window.dispatchEvent(new CustomEvent('moonfin:deepLink', {
						detail: {
							id: parsedActionData.id,
							type: parsedActionData.type,
							serverId: parsedActionData.serverid,
							seasonId: parsedActionData.seasonid,
							seriesId: parsedActionData.seriesid
						}
					}));
				}
			}
		}
	} catch (e) {
		console.log('[SmartHub] Deep link error:', e.message);
	}
}

/**
 * Get the Tizen platform version.
 *
 * @returns {number} Tizen version number (e.g. 4.0, 5.0) or 0 if unknown
 */
function getTizenVersion () {
	try {
		const version = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version');
		return parseFloat(version);
	} catch (error) {
		console.warn('[SmartHub] Unable to determine Tizen version:', error);
		return 0;
	}
}

/**
 * Initialize Smart Hub Preview integration.
 * Only runs on Tizen 4+. Sets up deep link handling and starts the updater.
 */
export function initSmartHub () {
	if (typeof tizen === 'undefined') {
		console.log('[SmartHub] Not on Tizen platform, skipping');
		return;
	}

	const tizenVersion = getTizenVersion();
	if (tizenVersion <= 3) {
		console.log('[SmartHub] Tizen version', tizenVersion, 'not supported (need > 3)');
		return;
	}

	console.log('[SmartHub] Initializing for Tizen version', tizenVersion);

	// Handle deep links
	window.addEventListener('appcontrol', handleDeepLink);
	handleDeepLink();

	// Start the background updater
	startSmartHubUpdater().catch(function (err) {
		console.error('[SmartHub] Updater failed:', err);
	});
}
