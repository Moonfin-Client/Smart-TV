// A Silo server behind the same methods the app calls on a Jellyfin server, answering in Jellyfin's shapes. It speaks
// Silo's native /api/v2, not its Jellyfin-compatible listener.

import {
	SILO_API_MAJOR, closeSiloSession, isClientUpgradeRequired, loadSiloSessions, openSiloSession, siloError, siloRequest,
	siloSessionFor, tokensFrom
} from './siloSession';
import {createSiloEvents, noteSiloPlaybackEnded} from './siloEvents';
import {createSiloItems} from './siloItems';
import {createSiloPlayback} from './siloPlayback';
import {createSiloPlayerExtras, siloPlayingFile} from './siloPlayerExtras';
import {createSiloTrackChoices} from './siloTrackChoices';
import {siloItemMediaSources} from './siloMediaSources';
import * as userDataSync from './userDataSync';
import {registerSiloImage, registerSiloServer, siloImageTagFor} from '../utils/siloUrls';
import {
	SILO_SETTING_KEYS, configurationToSiloSettings, isSiloSystemInfo, siloProfileToUser, siloPublicInfo,
	siloSettingsToConfiguration
} from './siloMapper';

const SYSTEM_INFO_PATH = '/api/v2/system/info';

const trimSlash = (url) => String(url || '').replace(/\/+$/, '');
const unsupported = (what) => Promise.reject(Object.assign(new Error(`${what} isn't supported on Silo`), {status: 501}));

// The API is retired (a tombstone), or the server speaks another major than this build.
export const siloApiUnsupported = (apiMajor = null) => Object.assign(
	new Error(`Silo API ${apiMajor == null ? 'retired' : apiMajor} (this build speaks ${SILO_API_MAJOR})`),
	{siloApiUnsupported: true, apiMajor, serverIsNewer: apiMajor == null || apiMajor > SILO_API_MAJOR}
);

const tryRead = (base, path) => siloRequest(base, path).catch(() => null);

/**
 * Whether a native Silo answers at `baseUrl`, as Jellyfin's PublicSystemInfo, or null when it isn't one. Silo also
 * runs a Jellyfin-compatible listener and its web app answers /System/Info/Public with HTML, so this is asked first.
 * Connection failures are thrown, and an API this build can't speak throws `siloApiUnsupported`.
 */
export const probeSilo = async (baseUrl) => {
	const base = trimSlash(baseUrl);
	let systemInfo;
	try {
		systemInfo = await siloRequest(base, SYSTEM_INFO_PATH);
	} catch (err) {
		if (isClientUpgradeRequired(err)) throw siloApiUnsupported();
		if (err.status) return null;
		throw err;
	}
	if (!isSiloSystemInfo(systemInfo)) return null;
	if (systemInfo.api_major !== SILO_API_MAJOR) throw siloApiUnsupported(systemInfo.api_major);
	const [identity, branding, setup] = await Promise.all([
		tryRead(base, '/api/v2/system/identity'),
		tryRead(base, '/api/v2/theme/branding'),
		tryRead(base, '/api/v2/system/setup')
	]);
	return siloPublicInfo({systemInfo, identity, branding, setup});
};

export const createSiloApi = ({getBaseUrl, getToken, getUserId, getDeviceInfo, platform}) => {
	const base = () => trimSlash(getBaseUrl());
	const session = () => siloSessionFor(base(), getToken());

	// Every request names the profile acting, except the account-wide ones (`profile: false`).
	const call = async (path, options = {}) => {
		await loadSiloSessions();
		return siloRequest(base(), path, {
			session: options.public ? null : session(),
			profileId: getUserId(),
			deviceInfo: getDeviceInfo(),
			platform,
			...options
		});
	};

	// Artwork is recorded under this server, where getImageUrl finds it.
	const images = {
		register: (itemId, type, url, index = 0) => {
			registerSiloServer(base());
			return registerSiloImage(base(), itemId, type, url, index);
		},
		tagFor: (itemId, type, index = 0) => siloImageTagFor(base(), itemId, type, index)
	};

	// A profile's avatar is recorded as the profile's picture, where the user image lookups find it.
	const withAvatar = (user, profile) => {
		const tag = images.register(user.Id, 'Primary', profile.avatar_url);
		return {...user, PrimaryImageTag: tag || null};
	};

	// The account and its profiles change rarely, and a screen asks for the user several times as it opens.
	let accountRead = null;
	const accountAndProfiles = () => {
		const key = `${base()}|${getToken()}`;
		if (accountRead && accountRead.key === key && Date.now() - accountRead.at < 5000) return accountRead.promise;
		const promise = Promise.all([
			call('/api/v2/account/me', {profile: false}),
			call('/api/v2/profiles', {profile: false})
		]).then(([account, profiles]) => ({account, profiles: profiles?.items || []}));
		promise.catch(() => {
			if (accountRead?.promise === promise) accountRead = null;
		});
		accountRead = {key, at: Date.now(), promise};
		return promise;
	};

	// The acting profile's settings, as last read or written, so an update writes only what changed.
	let lastSettings = null;
	const readSettings = async () => {
		const answer = await call('/api/v2/settings/values/effective', {query: {keys: Object.values(SILO_SETTING_KEYS)}});
		const values = {};
		(answer?.items || []).forEach((setting) => {
			if (setting && typeof setting.key === 'string') values[setting.key] = setting.value;
		});
		lastSettings = {profileId: getUserId(), values};
		return values;
	};

	const currentUser = async () => {
		const [{account, profiles}, values] = await Promise.all([accountAndProfiles(), readSettings()]);
		const wanted = getUserId();
		const profile = profiles.find((p) => String(p.id) === String(wanted)) ||
			(wanted ? null : profiles.find((p) => p.is_primary));
		if (!profile) throw siloError(404, {title: `Silo profile ${wanted} no longer exists on this account`});
		return withAvatar(siloProfileToUser(profile, account, siloSettingsToConfiguration(values)), profile);
	};

	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

	const items = createSiloItems({
		call,
		images,
		getUserId,
		getConfiguration: async () => (await currentUser()).Configuration,
		publishUserData: (itemId, patch) => userDataSync.publish(itemId, patch),
		mediaSources: siloItemMediaSources
	});

	const extras = createSiloPlayerExtras({call, getBaseUrl: base, getDetail: (itemId) => items.detailJson(itemId)});

	const trackChoices = createSiloTrackChoices({call, getPlayingSource: (itemId) => siloPlayingFile(base(), itemId)?.source || null});

	const playback = createSiloPlayback({
		call,
		getBaseUrl: base,
		getUserId,
		getAccessToken: () => session()?.tokens?.accessToken || getToken(),
		getDeviceInfo,
		platform,
		getItem: (itemId, fileId) => items.readItem(itemId, fileId),
		onPlaying: extras.notePlayingFile
	});

	const events = createSiloEvents({
		call,
		getBaseUrl: base,
		getUserId,
		getItems: items.getItems,
		forget: () => {
			items.forget();
			items.forgetViews();
		}
	});

	return {
		...items,
		siloEvents: events,
		getMediaSegments: extras.getMediaSegments,
		getTrickplayManifest: extras.getTrickplayManifest,
		getThemeSongs: extras.getThemeSongs,
		getThemeSongUrl: extras.getThemeSongUrl,
		...trackChoices,
		getPlaybackInfo: playback.getPlaybackInfo,
		reportPlaybackStart: playback.reportPlaybackStart,
		reportPlaybackProgress: playback.reportPlaybackProgress,
		reportPlaybackStopped: async (info) => {
			await playback.reportPlaybackStopped(info);
			// What was watched moves Continue Watching and Next Up along, and the item's new resume point and watched
			// state are read back for the cards showing it.
			items.forget();
			noteSiloPlaybackEnded(base(), info?.ItemId);
		},
		stopActiveEncodings: playback.stopActiveEncodings,
		closeLiveStream: playback.closeLiveStream,

		getPublicInfo: async () => {
			const info = await probeSilo(base());
			if (!info) throw siloError(404, {title: 'Not a Silo server'});
			return info;
		},

		// Silo lists no accounts before sign-in.
		getPublicUsers: async () => [],

		// Signs the account in and acts as its primary profile. The token pair belongs to the account, and is kept
		// in the Silo session store; the result carries the account's profiles for the household.
		authenticateByName: async (username, password) => {
			const pair = await call('/api/v2/auth/login', {
				method: 'POST',
				public: true,
				refresh: false,
				profile: false,
				body: {username, password}
			});
			const tokens = tokensFrom(pair);
			const account = pair?.user;
			if (!tokens.accessToken || !tokens.refreshToken || account?.id == null) {
				throw siloError(502, {title: 'Silo sign-in answered without a token pair'});
			}
			const opened = openSiloSession(base(), String(account.id), tokens);
			const profiles = (await siloRequest(base(), '/api/v2/profiles', {
				session: opened, deviceInfo: getDeviceInfo(), platform
			}))?.items || [];
			const primary = profiles.find((p) => p.is_primary) || profiles[0];
			if (!primary) throw siloError(502, {title: 'Silo listed no profile for this account'});
			return {
				AccessToken: tokens.accessToken,
				User: withAvatar(siloProfileToUser(primary, account), primary),
				SiloAccountId: String(account.id),
				SiloProfiles: profiles,
				SiloPasswordChangeRequired: account.password_change_required === true
			};
		},

		// Ends the login on Silo too, so its refresh token dies with it. Signed out here whatever Silo answers.
		logout: async () => {
			const current = session();
			if (!current) return;
			try {
				await call('/api/v2/auth/logout', {method: 'POST', profile: false});
			} catch (err) {
				if (err.status !== 401) console.warn('[Silo] Sign-out failed on the server:', err);
			} finally {
				closeSiloSession(current);
			}
		},

		getCurrentUser: currentUser,
		getUserConfiguration: currentUser,

		// Writes back the settings that changed since the last read, one PUT each, so Silo's defaults aren't turned
		// into stored values. Keys with no Silo equivalent aren't saved.
		updateUserConfiguration: async (config) => {
			const last = lastSettings && lastSettings.profileId === getUserId() ? lastSettings : {values: await readSettings()};
			const before = configurationToSiloSettings(siloSettingsToConfiguration(last.values), last.values);
			const after = configurationToSiloSettings(config, last.values);
			const written = {...last.values};
			try {
				for (const key of Object.values(SILO_SETTING_KEYS)) {
					if (same(before[key], after[key])) continue;
					// eslint-disable-next-line no-await-in-loop
					await call(`/api/v2/settings/values/${encodeURIComponent(key)}`, {
						method: 'PUT',
						query: {scope: 'profile'},
						body: {value: after[key]}
					});
					written[key] = after[key];
				}
			} finally {
				lastSettings = {profileId: getUserId(), values: written};
			}
			return null;
		},

		getServerInfo: () => ({serverUrl: base(), accessToken: getToken(), userId: getUserId()}),

		// Silo has no Jellyfin-style client capabilities report.
		reportCapabilities: async () => null,

		siloUnsupported: unsupported
	};
};

export const withEverySiloMethod = (siloApi, methodNames) => {
	const complete = {...siloApi};
	methodNames.forEach((name) => {
		if (!complete[name]) complete[name] = () => unsupported(name);
	});
	return complete;
};
