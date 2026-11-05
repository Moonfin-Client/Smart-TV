// A Silo server behind the same methods the app calls on a Jellyfin server, answering in Jellyfin's shapes. It speaks
// Silo's native /api/v2, not its Jellyfin-compatible listener.

import {
	SILO_API_MAJOR, closeSiloSession, isClientUpgradeRequired, loadSiloSessions, needsRefresh, openSiloSession, profileProof,
	needsStreamRefresh, refreshSiloSession, setProfileProof, siloError, siloHeaders, siloRequest, siloSessionFor, tokensFrom
} from './siloSession';
import {createSiloAdminItems} from './siloAdminItems';
import {createSiloRemoteSubtitles} from './siloRemoteSubtitles';
import {createSiloEvents, noteSiloPlaybackEnded} from './siloEvents';
import {findSiloMoonbase} from './siloMoonbase';
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

	const moonbaseGet = async (path) => {
		const plugin = await findSiloMoonbase(base(), () => call('/api/v2/settings/plugins'));
		if (!plugin) throw siloError(404, {title: 'Moonbase isn\'t installed on this Silo'});
		return call(`${plugin}${path}`);
	};

	// The household of an open login, signed in as its primary profile.
	const householdOf = async (opened, account) => {
		const profiles = (await siloRequest(base(), '/api/v2/profiles', {
			session: opened, deviceInfo: getDeviceInfo(), platform
		}))?.items || [];
		const primary = profiles.find((p) => p.is_primary) || profiles[0];
		if (!primary) throw siloError(502, {title: 'Silo listed no profile for this account'});
		return {
			AccessToken: opened.tokens.accessToken,
			User: withAvatar(siloProfileToUser(primary, account), primary),
			SiloAccountId: String(account.id),
			SiloProfiles: profiles,
			// The household: every profile as a user of its own, sharing the account's token.
			SiloUsers: profiles.map((p) => ({...withAvatar(siloProfileToUser(p, account), p), SiloHasPin: p.has_pin === true}))
		};
	};

	const endLogin = async (opened) => {
		await siloRequest(base(), '/api/v2/auth/logout', {
			method: 'POST', session: opened, profile: false, refresh: false, deviceInfo: getDeviceInfo(), platform
		}).catch(() => {});
		closeSiloSession(opened);
	};

	// A login whose account holds a temporary password, kept open (and unsaved) until the password is replaced.
	let pendingPasswordChange = null;

	// Opens the login a token pair names. An account with a temporary password may only change it (Silo answers
	// everything else, the profiles included, with 403 password_change_required), so the login waits for a new one;
	// the password just typed is the current one Silo asks for with the change.
	const openLogin = async (pair, password = null) => {
		const tokens = tokensFrom(pair);
		const account = pair?.user;
		if (!tokens.accessToken || !tokens.refreshToken || account?.id == null) {
			throw siloError(502, {title: 'Silo sign-in answered without a token pair'});
		}
		const opened = openSiloSession(base(), String(account.id), tokens);
		if (account.password_change_required !== true) return householdOf(opened, account);
		const capability = password ? await siloRequest(base(), '/api/v2/account/password/capability', {
			session: opened, profile: false, deviceInfo: getDeviceInfo(), platform
		}).catch(() => null) : null;
		// Silo lets it change here only when it says so, and says so with its state as well, as Moonfin Core reads it.
		if (!capability || capability.allowed !== true || (capability.state != null && capability.state !== 'available')) {
			await endLogin(opened);
			throw Object.assign(siloError(403, {title: 'Silo doesn\'t allow changing this password here'}), {code: 'password_change_unavailable'});
		}
		pendingPasswordChange = {opened, account, password};
		throw Object.assign(siloError(403, {title: 'Silo needs a new password for this account'}), {
			code: 'password_change_required',
			minimumLength: capability.minimum_password_length || 0,
			maximumBytes: capability.maximum_password_bytes || 0
		});
	};

	// Checks a profile's PIN, and keeps the proof that unlocks the profile for this login. PIN checks are never
	// replayed after a refresh, since Silo counts them against its rate limit.
	const proveProfilePin = async (profileId, pin) => {
		const answer = await call(`/api/v2/profiles/${encodeURIComponent(profileId)}/verify-pin`, {
			method: 'POST', body: {pin}, profile: false, refresh: false
		});
		if (answer?.valid !== true || !answer.profile_token) return false;
		setProfileProof(session(), String(profileId), {
			token: answer.profile_token, expiresAt: answer.expires_at ? Date.parse(answer.expires_at) : 0
		});
		return true;
	};

	// Token pairs of approved device sign-ins, by device code, between the poll and the sign-in.
	const approvedDevices = {};

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
		// A failed refresh keeps the current token, which the start just used.
		freshenStreamAuth: async () => {
			const current = session();
			if (current && needsStreamRefresh(current.tokens)) await refreshSiloSession(current, getDeviceInfo(), platform).catch(() => false);
		},
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

	const adminItems = createSiloAdminItems({
		call,
		forget: () => {
			items.forget();
			items.forgetViews();
		}
	});

	// The file playing for the title, or the default file of its first version.
	const remoteSubtitles = createSiloRemoteSubtitles({
		call,
		fileOf: async (itemId) => siloPlayingFile(base(), itemId)?.fileId || (await items.getItem(itemId))?.MediaSources?.[0]?.Id || null,
		forget: () => items.forget()
	});

	return {
		...items,
		...adminItems,
		...remoteSubtitles,
		siloEvents: events,
		getMediaSegments: extras.getMediaSegments,
		getTrickplayManifest: extras.getTrickplayManifest,
		getThemeSongs: extras.getThemeSongs,
		getThemeSongUrl: extras.getThemeSongUrl,
		...trackChoices,
		getPlaybackInfo: playback.getPlaybackInfo,
		previewPlaybackInfo: playback.previewPlaybackInfo,
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
		authenticateByName: async (username, password) => openLogin(await call('/api/v2/auth/login', {
			method: 'POST',
			public: true,
			refresh: false,
			profile: false,
			body: {username, password}
		}), password),

		// Replaces the temporary password of the login authenticateByName left waiting, then signs in as it would. Silo
		// signs out the account's other sessions; this one is refreshed, since its token still carries the restriction.
		// A refused new password (422) leaves the login waiting for another.
		changeRequiredPassword: async (newPassword) => {
			const pending = pendingPasswordChange;
			if (!pending) throw siloError(409, {title: 'No Silo sign-in is waiting for a new password'});
			try {
				await siloRequest(base(), '/api/v2/account/password', {
					method: 'POST', session: pending.opened, profile: false, deviceInfo: getDeviceInfo(), platform,
					body: {current_password: pending.password, new_password: newPassword}
				});
			} catch (err) {
				if (err.status === 401) {
					pendingPasswordChange = null;
					closeSiloSession(pending.opened);
				}
				throw err;
			}
			pendingPasswordChange = null;
			if (!(await refreshSiloSession(pending.opened, getDeviceInfo(), platform))) {
				closeSiloSession(pending.opened);
				throw Object.assign(siloError(401, {title: 'The password changed; sign in with it'}), {code: 'password_changed_sign_in'});
			}
			return householdOf(pending.opened, {...pending.account, password_change_required: false});
		},

		// Ends a login left waiting for a new password, when the change is given up.
		cancelRequiredPasswordChange: async () => {
			const pending = pendingPasswordChange;
			pendingPasswordChange = null;
			if (pending) await endLogin(pending.opened);
		},

		// Sign-in on another device (Silo's device sign-in, as the app's Quick Connect): an eight-digit code shown here, or
		// the verification page with it filled in as a QR code, approved by a signed-in Silo login.
		initiateQuickConnect: async () => {
			const capability = await call('/api/v2/auth/device/capability', {public: true, refresh: false, profile: false});
			if (capability?.state !== 'available' || capability.allowed === false) {
				throw siloError(403, {title: `Silo device sign-in is ${capability?.state || 'unavailable'}`});
			}
			const device = getDeviceInfo() || {};
			const start = await call('/api/v2/auth/device/start', {
				method: 'POST', public: true, refresh: false, profile: false,
				body: {
					...(device.deviceName ? {device_name: String(device.deviceName).slice(0, 128)} : null),
					...(platform ? {device_platform: String(platform).slice(0, 64)} : null)
				}
			});
			const code = String(start?.user_code || '').replace(/[\s-]/g, '');
			if (!start?.device_code || !code) throw siloError(502, {title: 'Silo device sign-in answered without codes'});
			return {Code: code, Secret: start.device_code, Authenticated: false, VerificationUriComplete: start.verification_uri_complete || null};
		},

		// An approval carries the token pair once, kept for authenticateQuickConnect.
		getQuickConnectState: async (secret) => {
			let poll;
			try {
				poll = await call('/api/v2/auth/device/poll', {method: 'POST', public: true, refresh: false, profile: false, body: {device_code: secret}});
			} catch (err) {
				if (err.status === 404) return {Authenticated: false, Expired: true};
				throw err;
			}
			if (poll?.status === 'approved' && poll.tokens) {
				approvedDevices[secret] = poll.tokens;
				return {Authenticated: true};
			}
			return {Authenticated: false, Expired: poll?.status !== 'pending'};
		},

		authenticateQuickConnect: async (secret) => {
			const pair = approvedDevices[secret];
			delete approvedDevices[secret];
			if (!pair) throw siloError(409, {title: 'No approved Silo device sign-in for this code'});
			return openLogin(pair);
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

		// TMDB lookups, through Moonbase for Silo.
		getStudioCompanies: (tmdbId, mediaType) =>
			moonbaseGet(`/Moonfin/Tmdb/ProductionCompanies?tmdbId=${encodeURIComponent(tmdbId)}&type=${mediaType === 'tv' ? 'tv' : 'movie'}`),
		getTmdbReviews: (tmdbId, mediaType, language) =>
			moonbaseGet(`/Moonfin/Tmdb/Reviews?tmdbId=${encodeURIComponent(tmdbId)}&type=${mediaType === 'tv' ? 'tv' : 'movie'}&language=${encodeURIComponent(language || 'en-US')}`),

		// Whether a household profile has a PIN, or null when the account doesn't list it.
		profileHasPin: async (profileId) => {
			const {profiles} = await accountAndProfiles();
			const profile = profiles.find((p) => String(p.id) === String(profileId));
			return profile ? profile.has_pin === true : null;
		},

		verifyProfilePin: proveProfilePin,

		// Sets (or with null removes) a profile's PIN, as the acting profile; Silo lets the primary profile or an admin do
		// it. A new PIN retires the proof that unlocked the profile, so it's proved again with the new one.
		setProfilePin: async (profileId, pin) => {
			await call(`/api/v2/profiles/${encodeURIComponent(profileId)}`, {method: 'PATCH', body: {pin: pin || null}});
			accountRead = null;
			if (pin) await proveProfilePin(profileId, pin);
		},

		// A plain request to Silo's /api/v2 as the acting profile, for the request screens (siloSeerr.js).
		siloCall: (path, options) => call(path, options),

		// The plugins installed on the server, where Moonbase is found.
		getInstalledPlugins: () => call('/api/v2/settings/plugins'),

		// The headers a request made outside this api signs with (Moonbase's routes), its token refreshed first when due.
		requestHeaders: async () => {
			await loadSiloSessions();
			const current = session();
			if (!current?.tokens) return null;
			if (needsRefresh(current.tokens)) await refreshSiloSession(current, getDeviceInfo(), platform);
			if (!current.tokens) return null;
			return siloHeaders({
				deviceInfo: getDeviceInfo(),
				platform,
				accessToken: current.tokens.accessToken,
				profileId: getUserId(),
				profileToken: getUserId() ? profileProof(current, getUserId()) : null
			});
		},

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
