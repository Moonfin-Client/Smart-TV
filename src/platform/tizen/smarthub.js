// Next Up and Continue Watching tiles on the Samsung Smart Hub, and the deep link a tile opens.
// https://developer.samsung.com/smarttv/develop/guides/smart-hub-preview/smart-hub-preview.html
/* global tizen */

import {getServerUrl, getUserId, getAuthHeader, getServerType, userRoutes} from '@moonfin/app/src/services/jellyfinApi';

const NEXT_UP_LIMIT = 2;
const RESUME_LIMIT = 4;
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

let packageId = null;
let serviceId = null;
let localMessagePort = null;
let messagePortListener = null;

const initIds = () => {
	if (packageId) return;
	try {
		packageId = tizen.application.getCurrentApplication().appInfo.packageId;
		serviceId = packageId + '.service';
	} catch (e) {
		console.warn('[SmartHub] Couldn\'t get package ID:', e.message);
	}
};

function getTileImageUrl (item) {
	if (!item) return null;
	item = item.ProgramInfo || item;

	const serverUrl = getServerUrl();
	if (!serverUrl) return null;

	const height = 250;
	let imgTag = null;
	let imgType = null;
	let itemId = null;

	// Thumb, then Backdrop, then Primary, since the tiles are 16:9
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

// The background service stopping means it has handed the tiles to the Smart Hub.
function onReceived (uiData) {
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

function startServiceAndUpdateSmartView (smartViewJsonData) {
	initIds();
	if (!packageId || !serviceId) return;

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
			function () {},
			function (error) { console.error('[SmartHub] Launch failed:', error.message); }
		);
	} catch (error) {
		console.error('[SmartHub] Error sending message:', error);
	}
}

function waitForSmartHubUpdate () {
	return new Promise(function (resolve) {
		const interval = setInterval(function () {
			if (window._smartHubUpdated === true) {
				clearInterval(interval);
				resolve();
			}
		}, 100);

		// Gives up after 15 seconds in case the service never answers
		setTimeout(function () {
			clearInterval(interval);
			resolve();
		}, 15000);
	});
}

function delay (time) {
	return new Promise(function (resolve) { setTimeout(resolve, time); });
}

async function apiRequest (endpoint) {
	const serverUrl = getServerUrl();
	if (!serverUrl) throw new Error('No server URL configured');

	const response = await fetch(`${serverUrl}${endpoint}`, {
		method: 'GET',
		headers: {
			'Authorization': getAuthHeader(),
			'Content-Type': 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error('API Error: ' + response.status);
	}

	return response.json();
}

async function runSmartViewUpdate () {
	window._smartHubUpdated = false;

	const userId = getUserId();
	const serverUrl = getServerUrl();

	if (!userId || !serverUrl) {
		window._smartHubUpdated = true;
		return;
	}

	try {
		const baseFields = 'PrimaryImageAspectRatio,Overview';
		const imageFields = 'ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb';
		// Emby 4.10 only fills a Next Up that isn't scoped to one series when asked for its legacy list.
		const legacyNextUp = getServerType() === 'emby' ? '&LegacyNextUp=true' : '';

		const [resumableItems, nextUpEpisodes] = await Promise.all([
			apiRequest(
				`${userRoutes.resume()}Limit=${RESUME_LIMIT}&MediaTypes=Video&Fields=${baseFields}&${imageFields}&EnableTotalRecordCount=false&Recursive=true`
			),
			apiRequest(
				`/Shows/NextUp?UserId=${userId}&Limit=${NEXT_UP_LIMIT}&Fields=${baseFields}&${imageFields}&EnableTotalRecordCount=false${legacyNextUp}`
			)
		]);

		const smartViewJsonData = generateSmartViewJson([
			{section_title: 'Next Up', limit: NEXT_UP_LIMIT, data: nextUpEpisodes.Items},
			{section_title: 'Continue Watching', limit: RESUME_LIMIT, data: resumableItems.Items}
		]);

		await delay(2000);
		startServiceAndUpdateSmartView(smartViewJsonData);
		await waitForSmartHubUpdate();
	} catch (error) {
		console.error('[SmartHub] Error fetching data:', error);
		window._smartHubUpdated = true;
	}
}

async function startSmartHubUpdater () {
	let retries = 0;
	while (!getUserId() || !getServerUrl()) {
		if (retries > 60) {
			return;
		}
		await new Promise(function (resolve) { setTimeout(resolve, 2000); });
		retries++;
	}

	while (true) { // eslint-disable-line no-constant-condition
		const startTime = Date.now();

		await runSmartViewUpdate();

		const elapsedTime = Date.now() - startTime;
		const remainingTime = Math.max(UPDATE_INTERVAL_MS - elapsedTime, 0);
		await new Promise(function (resolve) { setTimeout(resolve, remainingTime); });
	}
}

// A tile's PAYLOAD comes in as app control data, and the app opens it from a moonfin:deepLink event.
// https://developer.samsung.com/smarttv/develop/guides/smart-hub-preview/implementing-public-preview.html
function handleDeepLink () {
	try {
		const requestedAppControl = tizen.application.getCurrentApplication().getRequestedAppControl();
		if (!requestedAppControl) {
			return;
		}

		const appControlData = requestedAppControl.appControl.data;

		for (let i = 0; i < appControlData.length; i++) {
			if (appControlData[i].key === 'PAYLOAD') {
				const actionData = JSON.parse(appControlData[i].value[0]).values;
				const parsedActionData = JSON.parse(actionData);

				if (parsedActionData.id) {
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

function getTizenVersion () {
	try {
		const version = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version');
		return parseFloat(version);
	} catch (error) {
		console.warn('[SmartHub] Unable to determine Tizen version:', error);
		return 0;
	}
}

export function initSmartHub () {
	if (typeof tizen === 'undefined') {
		return;
	}

	// Smart Hub previews need Tizen 4 or later
	if (getTizenVersion() <= 3) {
		return;
	}

	window.addEventListener('appcontrol', handleDeepLink);
	handleDeepLink();

	startSmartHubUpdater().catch(function (err) {
		console.error('[SmartHub] Updater failed:', err);
	});
}
