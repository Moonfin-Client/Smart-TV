// Client for the Achievement Badges plugin, which is a separate Jellyfin plugin rather than part
// of Moonbase, so it lives under /Plugins/AchievementBadges and is probed on its own.
//
// Nothing here throws. A server without the plugin answers 404 on every route, and a panel that
// asked for everything at once and got nothing back wants an empty screen rather than a pile of
// errors, so a failed call reads as no answer. The login ping, the quest reroll, spending a
// power-up, buying one, changing what the profile wears, the notification switches and the
// friends and chat routes are the only things written, because they are the only parts the
// plugin expects a client to drive.

import {getServerUrl, getAuthHeader, getApiKey, getUserId, getServerType, getDeviceId} from './jellyfinApi';
import {legacyAuthHeader} from '../utils/serverRoutes';
import {sharePending} from '../utils/sharePending';
import {platformFetch} from './secureFetch';
import {
	isObject, parseBadge, parseBadgeChase, parseSummary, parseRank, parseBadges, parseQuests, parseRerolledQuests,
	parseLeaderboardEntry, parseRecap, parseLibraryCompletion,
	parsePowerUpState, parsePowerUpSlots, parseShopCatalog, parseActivityFeed,
	parseCounters, parseWatchClock, parseServerStats,
	parseCosmeticCatalog, buildCosmeticLoadout, parseUnlockToastSettings,
	parseFriendsList, parsePublicProfile, parseSocialUsers, parseSocialPrivacy, applySocialPrivacy,
	parseThread, parseConversation, parseMessage,
	COSMETIC_CHANGED, COSMETIC_REFUSED, COSMETIC_FAILED,
	REROLLED, REROLL_ALREADY_USED, REROLL_FAILED,
	POWER_UP_USED, POWER_UP_REFUSED, POWER_UP_FAILED,
	PURCHASE_BOUGHT, PURCHASE_REFUSED, PURCHASE_FAILED
} from '../utils/achievementsModel';

const ROOT = 'Plugins/AchievementBadges';
const TIMEOUT_MS = 15000;

// What the panel opens on, so the screen that can change it knows what it was handed.
export const DEFAULT_RECAP_PERIOD = 'month';

// What the admin left switched on, as the last probe found it. They stay on until the server
// says otherwise, since a plugin too old to report them still serves them.
let leaderboardEnabled = true;
let questsEnabled = true;
let activityEnabled = true;
// Off until the plugin says otherwise, so a build without the route is never polled for unlocks
// it cant serve.
let unlockToastsEnabled = false;
// Friends and chat, as the admin left them. Simple mode makes everyone a friend, so there are
// no requests to send.
let friendsEnabled = true;
let friendsSimpleMode = false;

// Set when the admin hides the whole server's figures from everyone.
let privacyMode = false;

// The catalogue lives in the plugin's own code, so it only changes when the server takes a new
// release, which ends this session with it.
let catalog = null;

// The user's own unlock notification settings, trusted for as long as jellyfin-web trusts them
// so a change made there lands here, and the server's clock from the last unlock read, handed
// back as the next cutoff so a device clock that is off cant skip or repeat unlocks. The cursor
// is null until the first read, which only records it.
const UNLOCK_SETTINGS_MAX_AGE_MS = 5 * 60 * 1000;
let unlockSettings = null;
let unlockSettingsReadAt = 0;
let unlockCursor = null;
// Unlocks already passed on, by badge id and unlock time.
const SHOWN_UNLOCKS_CAP = 400;
const shownUnlocks = new Set();

const base = () => (getServerUrl() || '').replace(/\/+$/, '');

const authHeaders = () => {
	const header = getAuthHeader();
	return {Authorization: header, ...legacyAuthHeader(getServerType(), header)};
};

// It's a Jellyfin plugin, so no other server carries it or gets asked.
const isJellyfin = () => getServerType() === 'jellyfin';

const call = (path, method, body) => {
	const init = {method, headers: {...authHeaders(), Accept: 'application/json'}};
	if (body) {
		init.headers['Content-Type'] = 'application/json';
		init.body = JSON.stringify(body);
	}
	return platformFetch(`${base()}/${ROOT}/${path}`, init, TIMEOUT_MS);
};

const request = async (path, method = 'GET') => {
	if (!getApiKey()) return null;
	try {
		const res = await call(path, method);
		if (!res.ok) return null;
		const text = await res.text();
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
};

// Writes to a path and tells a refusal apart from a fault. refusedWith is the status the plugin
// answers when it means no, so that one comes back with whatever the plugin said, and anything
// else reads as a plain failure.
const post = async (path, {refusedWith, body: sent, method = 'POST'}) => {
	if (!getApiKey()) return {};
	try {
		const res = await call(path, method, sent);
		const text = await res.text();
		let body = null;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			body = null;
		}
		if (res.ok) return {body: isObject(body) ? body : null};
		if (res.status !== refusedWith) return {};
		return {refused: true, message: isObject(body) ? body.Message : null};
	} catch {
		return {};
	}
};

const getMap = async (path) => {
	const data = await request(path);
	return isObject(data) ? data : null;
};

const getList = async (path) => {
	const data = await request(path);
	return Array.isArray(data) ? data.filter(isObject) : [];
};

export const getFlags = () => ({leaderboardEnabled, questsEnabled, activityEnabled, unlockToastsEnabled, friendsEnabled, friendsSimpleMode});

// Clears what the last server said, so a set switched to one without the plugin cannot keep
// showing the entry.
export const reset = () => {
	leaderboardEnabled = true;
	questsEnabled = true;
	activityEnabled = true;
	unlockToastsEnabled = false;
	friendsEnabled = true;
	friendsSimpleMode = false;
	privacyMode = false;
	catalog = null;
	unlockSettings = null;
	unlockSettingsReadAt = 0;
	unlockCursor = null;
	shownUnlocks.clear();
};

// Whether the plugin answered here. public-config needs no administrator, so an ordinary user
// gets the same answer, and a server without the plugin has no such route.
export const probe = async () => {
	if (!isJellyfin()) return false;
	const config = await getMap('public-config');
	if (!config) return false;
	leaderboardEnabled = config.LeaderboardEnabled !== false;
	questsEnabled = config.QuestsEnabled !== false;
	activityEnabled = config.ActivityFeedEnabled !== false;
	privacyMode = config.ForcePrivacyMode === true;
	friendsEnabled = config.FriendsEnabled !== false;
	friendsSimpleMode = config.FriendsSimpleMode === true;
	const features = await getMap('admin/ui-features');
	unlockToastsEnabled = Boolean(features) && features.EnableUnlockToasts !== false;
	return true;
};

// ---------- Unlock notifications ----------

const rememberUnlockSettings = (json) => {
	unlockSettings = parseUnlockToastSettings(json);
	unlockSettingsReadAt = Date.now();
	return unlockSettings;
};

// The unlock toast and privacy settings share one preferences object and are read together at
// start-up, so a read still on its way serves both. Saves still read a fresh copy.
const readPreferences = sharePending((userId) => userId, (userId) => getMap(`users/${userId}/preferences`));

export const fetchUnlockToastSettings = async () => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await readPreferences(userId);
	return json ? rememberUnlockSettings(json) : null;
};

// Turns the plugin's unlock notifications on or off for this user, which jellyfin-web follows
// too. The plugin replaces its whole preferences object on save, so this writes over a fresh
// copy of it.
export const saveUnlockToasts = async (enabled) => {
	const userId = getUserId();
	if (!userId) return false;
	const current = await getMap(`users/${userId}/preferences`);
	if (!current) return false;
	const next = {...current, EnableUnlockToasts: enabled};
	const written = await post(`users/${userId}/preferences`, {refusedWith: 400, body: next});
	if (!written.body) return false;
	rememberUnlockSettings(next);
	return true;
};

// Reads the badges unlocked since the last read and hands back the ones the user's plugin
// settings want shown, with how to show them, or null when there is nothing to say. The first
// read only records the server's clock, so badges earned before the app started dont all pop up
// at once.
export const refreshUnlocks = async () => {
	if (!unlockToastsEnabled) return null;
	const userId = getUserId();
	if (!userId) return null;

	let settings = unlockSettings;
	if (!unlockSettingsReadAt || Date.now() - unlockSettingsReadAt >= UNLOCK_SETTINGS_MAX_AGE_MS) {
		// A failed read keeps the last settings rather than dropping the cursor and every unlock
		// earned before the next good read.
		settings = (await fetchUnlockToastSettings()) || settings;
	}
	if (!settings) return null;
	if (!settings.enabled) {
		// Turning them back on starts from then, not from before they were off.
		unlockCursor = null;
		return null;
	}

	const cursor = unlockCursor;
	const since = encodeURIComponent(cursor || new Date().toISOString());
	// The device id lets the plugin hold back unlocks earned on another device when the user
	// only wants them where they happened.
	const json = await getMap(`users/${userId}/unlocks-since?since=${since}&deviceId=${encodeURIComponent(getDeviceId() || '')}`);
	if (!json) return null;
	if (typeof json.Now === 'string' && json.Now) unlockCursor = json.Now;
	if (!cursor) return null;

	const rows = Array.isArray(json.Badges) ? json.Badges.filter(isObject) : [];
	const badges = [];
	rows.forEach((row) => {
		const key = `${row.Id}|${row.UnlockedAt}`;
		if (shownUnlocks.has(key)) return;
		shownUnlocks.add(key);
		const badge = parseBadge(row);
		if (settings.allows(badge.rarity)) badges.push(badge);
	});
	while (shownUnlocks.size > SHOWN_UNLOCKS_CAP) shownUnlocks.delete(shownUnlocks.values().next().value);
	if (!badges.length) return null;
	return {badges, grouped: settings.grouped, muteDuringPlayback: settings.muteDuringPlayback};
};

// The one thing the plugin needs a client to drive, since it is what keeps a daily login streak
// alive. Nothing waits on it and nothing reads the answer.
export const sendLoginPing = () => {
	const userId = getUserId();
	if (!userId) return Promise.resolve(null);
	return request(`users/${userId}/login-ping`, 'POST');
};

// What the plugin suggests watching to move a badge along. The server picks unplayed items that
// match the badge's metric, so one measured on something it cannot query comes back with nothing.
export const fetchBadgeChase = async (badgeId, {limit = 10} = {}) => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await getMap(`users/${userId}/chase/${encodeURIComponent(badgeId)}?limit=${limit}`);
	return json ? parseBadgeChase(json) : null;
};

// Swaps one quest set for a fresh one. The plugin answers 429 once that allowance is spent.
export const rerollQuests = async ({weekly = false} = {}) => {
	const userId = getUserId();
	if (!userId) return {outcome: REROLL_FAILED};

	const questSet = weekly ? 'weekly' : 'daily';
	const written = await post(`users/${userId}/quests/${questSet}/reroll`, {refusedWith: 429});
	if (written.refused) return {outcome: REROLL_ALREADY_USED};
	if (!written.body) return {outcome: REROLL_FAILED};
	return {outcome: REROLLED, ...parseRerolledQuests(written.body)};
};

export const fetchPowerUps = async () => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await getMap(`users/${userId}/powerups`);
	return json ? parsePowerUpState(json) : null;
};

// Spends one power-up. The plugin refuses with 400 when the slot is empty or the boost is already
// running, and its own wording explains which better than a guess here would.
export const usePowerUp = async (type) => {
	const userId = getUserId();
	if (!userId) return {outcome: POWER_UP_FAILED};

	const written = await post(`users/${userId}/powerups/use/${encodeURIComponent(type)}`, {refusedWith: 400});
	if (written.refused) return {outcome: POWER_UP_REFUSED, message: written.message};
	if (!written.body) return {outcome: POWER_UP_FAILED};
	return {outcome: POWER_UP_USED, slots: parsePowerUpSlots(written.body.Inventory)};
};

// The counters behind the stats screen, read in one pass.
export const fetchStats = async () => {
	const userId = getUserId();
	if (!userId) return {records: {}, watchClock: {}, server: null};

	const [records, clock, server] = await Promise.all([
		getMap(`users/${userId}/records`),
		getMap(`users/${userId}/watch-clock`),
		privacyMode ? Promise.resolve(null) : getMap('server/stats')
	]);

	return {
		records: parseCounters(records),
		watchClock: parseWatchClock(clock),
		server: server ? parseServerStats(server) : null
	};
};

// What the server has unlocked lately, newest first. It can come back empty because the admin
// switched the feed off, or because everyone on the server has opted out of appearing in it.
export const fetchActivity = async ({limit = 30} = {}) => {
	if (!activityEnabled) return [];
	const json = await getMap(`activity-feed?page=1&pageSize=${limit}`);
	return json ? parseActivityFeed(json) : [];
};

const fetchCatalog = async () => {
	if (!catalog) catalog = await getMap('shop/catalog');
	return catalog;
};

// What the shop sells, narrowed to the power-ups. The catalogue is the same for everyone, so this
// route carries no user.
export const fetchShopPowerUps = async () => {
	const json = await fetchCatalog();
	return json ? parseShopCatalog(json) : [];
};

// Without the catalogue an equipped id names nothing, so a server that answered without one
// leaves the profile with nothing to wear.
const readLoadout = (shop, worn) => {
	if (!shop) return null;
	const items = parseCosmeticCatalog(shop);
	if (items.length === 0) return null;
	return buildCosmeticLoadout(items, worn);
};

// What the profile owns and wears.
export const fetchCosmetics = async () => {
	const userId = getUserId();
	if (!userId) return null;

	const [shop, worn] = await Promise.all([
		fetchCatalog(),
		getMap(`users/${userId}/cosmetics`)
	]);
	return readLoadout(shop, worn);
};

const wear = async (path, body) => {
	const userId = getUserId();
	if (!userId) return {outcome: COSMETIC_FAILED};

	const written = await post(`users/${userId}/${path}`, {refusedWith: 400, body});
	if (written.refused) return {outcome: COSMETIC_REFUSED, message: written.message};
	// Both routes answer with an object, so nothing back is a fault rather than a change that took.
	if (!written.body) return {outcome: COSMETIC_FAILED};
	return {outcome: COSMETIC_CHANGED};
};

// Wears one, which the plugin refuses with 400 when the profile does not own it.
export const equipCosmetic = (id) => wear('cosmetics/equip', {CosmeticId: id});

// Empties whatever the given kind fills. This one takes its kind on the query rather than in a
// body, and sending one makes the plugin answer 415.
export const unequipCosmetic = (kind) =>
	wear(`cosmetics/unequip?kind=${encodeURIComponent(kind)}`);

// Buys one thing from the shop. The plugin refuses with 400 when the bank is short or the slot is
// already full, and its wording says which.
export const buyShopItem = async (itemId) => {
	const userId = getUserId();
	if (!userId) return {outcome: PURCHASE_FAILED};

	const written = await post(`users/${userId}/shop/purchase`, {refusedWith: 400, body: {ItemId: itemId}});
	if (written.refused) return {outcome: PURCHASE_REFUSED, message: written.message};
	if (!written.body) return {outcome: PURCHASE_FAILED};

	// The answer says what the bank holds now, so nothing has to be read again.
	const after = written.body.ScoreBalanceAfter;
	return {outcome: PURCHASE_BOUGHT, bankAfter: typeof after === 'number' ? after : null};
};

export const fetchLeaderboard = async ({category = '', limit = 10} = {}) => {
	if (!leaderboardEnabled) return [];
	const path = category ? `leaderboard/${category}` : 'leaderboard';
	const rows = await getList(`${path}?limit=${limit}`);
	return rows.map(parseLeaderboardEntry);
};

export const fetchRecap = async (period) => {
	const userId = getUserId();
	if (!userId) return null;
	return parseRecap(await getMap(`users/${userId}/recap?period=${encodeURIComponent(period)}`));
};

// Everything the panel opens with, asked for at once. A section the admin switched off is not
// requested at all rather than fetched and thrown away.
export const loadOverview = async () => {
	const userId = getUserId();
	if (!userId || !isJellyfin()) return null;

	const [summary, rank, badgeRows, equippedRows, questRows, leaderboard, recap, completion,
		shop, worn] = await Promise.all([
			getMap(`users/${userId}/summary`),
			getMap(`users/${userId}/rank`),
			getList(`users/${userId}`),
			getList(`users/${userId}/equipped`),
			questsEnabled ? getMap(`users/${userId}/quests`) : Promise.resolve(null),
			leaderboardEnabled ? fetchLeaderboard() : Promise.resolve([]),
			getMap(`users/${userId}/recap?period=${DEFAULT_RECAP_PERIOD}`),
			getMap(`users/${userId}/library-completion`),
			fetchCatalog(),
			getMap(`users/${userId}/cosmetics`)
		]);

	const badges = parseBadges(badgeRows);

	// A server that answered none of it has lost the plugin, rather than holding an empty profile.
	if (!summary && badges.length === 0 && !rank) return null;

	return {
		summary: parseSummary(summary),
		rank: parseRank(rank),
		badges,
		equipped: parseBadges(equippedRows),
		quests: parseQuests(questRows),
		leaderboard,
		recap: parseRecap(recap),
		libraryCompletion: parseLibraryCompletion(completion),
		cosmetics: readLoadout(shop, worn),
		leaderboardEnabled,
		questsEnabled,
		activityEnabled
	};
};

// ---------- Friends and chat ----------

// One write on the signed-in user's friends or chat routes. A 429 is the plugin's rate limit,
// which is a refusal with its own wording rather than a fault. What comes back says whether it
// went through, what the plugin said, and whatever `read` pulls out of the answer.
const social = async (method, path, {body, read} = {}) => {
	const userId = getUserId();
	if (!userId) return {ok: false, message: null, value: null};
	const written = await post(`users/${userId}/${path}`, {refusedWith: 429, body, method});
	const data = written.body;
	if (!data) return {ok: false, message: written.message || null, value: null};
	const ok = data.Success !== false;
	return {ok, message: typeof data.Message === 'string' && data.Message ? data.Message : null, value: ok && read ? read(data) : null};
};

export const fetchFriends = async () => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await getMap(`users/${userId}/friends`);
	return json ? parseFriendsList(json) : null;
};

// Accepts at once when that user already asked first.
export const sendFriendRequest = (userId) => social('POST', `friends/${userId}`);
export const acceptFriendRequest = (userId) => social('POST', `friends/${userId}/accept`);
// Also declines a request from that user, or takes one back.
export const removeFriend = (userId) => social('DELETE', `friends/${userId}`);

// Answers 404 for someone who hides from the leaderboard, which comes back null like any miss.
export const fetchPublicProfile = async (userId) => {
	const json = await getMap(`profiles/${userId}/summary`);
	return json ? parsePublicProfile(json) : null;
};

// The users this user can see. The plugin's directory leaves out accounts an admin hid from the
// login screen, which Jellyfin's /Users lists to anyone signed in. Plugin builds before 2.4.1
// have no directory and fall back to /Users.
export const fetchServerUsers = async () => {
	const userId = getUserId();
	if (!userId) return [];
	const directory = await request(`users/${userId}/directory`);
	if (Array.isArray(directory)) return parseSocialUsers(directory);
	try {
		const res = await platformFetch(`${base()}/Users`, {headers: {...authHeaders(), Accept: 'application/json'}}, TIMEOUT_MS);
		if (!res.ok) return [];
		return parseSocialUsers(await res.json());
	} catch {
		return [];
	}
};

export const fetchThreads = async () => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await getMap(`users/${userId}/messages/threads`);
	if (!json) return null;
	return Array.isArray(json.Threads) ? json.Threads.filter(isObject).map(parseThread) : [];
};

// The direct chat with that user. The plugin makes it on first use.
export const openDirectChat = async (otherUserId) => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await getMap(`users/${userId}/messages/${otherUserId}?limit=1`);
	return typeof json?.ConversationId === 'string' && json.ConversationId ? json.ConversationId : null;
};

export const fetchConversation = async (conversationId) => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await getMap(`users/${userId}/conversations/${conversationId}`);
	return json?.Success === true && isObject(json.Conversation) ? parseConversation(json.Conversation) : null;
};

// The latest messages, oldest first. Reading them marks them as read.
export const fetchMessages = async (conversationId, {limit = 200} = {}) => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await getMap(`users/${userId}/conversations/${conversationId}/messages?limit=${limit}`);
	if (!json) return null;
	return Array.isArray(json.Messages) ? json.Messages.filter(isObject).map(parseMessage) : [];
};

const readMessage = (value) => (isObject(value) ? parseMessage(value) : null);

// The plugin caps a message at 1000 characters and 20 a minute, and says so in the refusal.
export const sendMessage = (conversationId, text) =>
	social('POST', `conversations/${conversationId}/messages`, {body: {Text: text}, read: (data) => readMessage(data.Sent)});

export const editMessage = (messageId, text) =>
	social('PATCH', `messages/${messageId}`, {body: {Text: text}, read: (data) => readMessage(data.Updated)});

export const deleteMessage = (messageId) => social('DELETE', `messages/by-id/${messageId}`);

// Empties the chat for everyone in it.
export const clearConversation = (conversationId) => social('DELETE', `conversations/${conversationId}/clear`);

// A group needs at least two friends besides the signed in user.
export const createGroup = (title, memberIds) =>
	social('POST', 'conversations', {
		body: {Title: title || null, ParticipantIds: memberIds},
		read: (data) => (isObject(data.Conversation) ? parseConversation(data.Conversation) : null)
	});

export const renameGroup = (conversationId, title) =>
	social('POST', `conversations/${conversationId}/rename`, {body: {Title: title}});

export const addGroupMember = (conversationId, userId) =>
	social('POST', `conversations/${conversationId}/members/${userId}`);

// Leaves the group when the member is the signed in user.
export const removeGroupMember = (conversationId, userId) =>
	social('DELETE', `conversations/${conversationId}/members/${userId}`);

export const setGroupAdmin = (conversationId, userId, admin) =>
	social(admin ? 'POST' : 'DELETE', `conversations/${conversationId}/admins/${userId}`);

// Blocking works both ways in a direct chat, neither side can message the other. The plugin
// leaves a group they share alone.
export const setBlocked = (userId, blocked) => social(blocked ? 'POST' : 'DELETE', `block/${userId}`);

export const fetchBlocked = async () => {
	const userId = getUserId();
	if (!userId) return [];
	const json = await getMap(`users/${userId}/blocked`);
	return Array.isArray(json?.Blocked) ? json.Blocked.filter((id) => typeof id === 'string') : [];
};

// The image behind an attachment. It needs the token, so it cant be a plain image url and is
// handed back as an object url the caller releases.
export const fetchAttachment = async (attachmentId) => {
	if (!getApiKey()) return null;
	try {
		const res = await platformFetch(`${base()}/${ROOT}/attachments/${attachmentId}`, {headers: authHeaders()}, TIMEOUT_MS);
		if (!res.ok) return null;
		return URL.createObjectURL(await res.blob());
	} catch {
		return null;
	}
};

export const fetchSocialPrivacy = async () => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await readPreferences(userId);
	return json ? parseSocialPrivacy(json) : null;
};

// The plugin replaces its whole preferences object on save, so this reads a fresh copy first
// and only changes the friend settings in it.
export const saveSocialPrivacy = async (privacy) => {
	const userId = getUserId();
	if (!userId) return false;
	const current = await getMap(`users/${userId}/preferences`);
	if (!current) return false;
	const written = await post(`users/${userId}/preferences`, {refusedWith: 400, body: applySocialPrivacy(current, privacy)});
	return Boolean(written.body);
};
