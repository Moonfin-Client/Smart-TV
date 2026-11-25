// Shapes for the Achievement Badges plugin.
//
// The plugin writes PascalCase names and leaves a null property out of the payload rather than
// writing it, so anything it can omit has to be read as missing rather than as a value. Admins
// author badges with any category, rarity or icon they like, which is why none of those are a
// fixed set.

export const isObject = (value) =>
	Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asInt = (value) => {
	if (typeof value === 'number') return Math.round(value);
	if (typeof value === 'string') {
		const parsed = parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const asNumber = (value) => {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const asString = (value) => (typeof value === 'string' ? value : '');

// Every array the plugin sends is a list of objects, and a missing one arrives as nothing rather
// than as an empty array.
const mapList = (value, from) => (Array.isArray(value) ? value.filter(isObject).map(from) : []);

const asBool = (value) => value === true;

// An unparseable date reads as nothing rather than throwing, since a badge with a bad timestamp
// should still draw.
const asDate = (value) => {
	if (typeof value !== 'string' || !value) return null;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
};

// Points a badge is worth. The plugin works this out from rarity rather than storing it per
// badge, so the table has to be repeated here.
const scoreForRarity = (rarity) => {
	switch (String(rarity || '').trim().toLowerCase()) {
		case 'uncommon': return 20;
		case 'rare': return 35;
		case 'epic': return 60;
		case 'legendary': return 100;
		case 'mythic': return 150;
		default: return 10;
	}
};

// Rarity arrives as free text, so anything unrecognized reads as common.
const RARITY_COLORS = {
	common: '#9AA5B1',
	uncommon: '#4CAF50',
	rare: '#2196F3',
	epic: '#9C27B0',
	legendary: '#FF9800',
	mythic: '#E91E63'
};

export const rarityColor = (rarity) =>
	RARITY_COLORS[String(rarity || '').trim().toLowerCase()] || RARITY_COLORS.common;

const RARITY_RANKS = {uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5};

const rarityRank = (rarity) => RARITY_RANKS[String(rarity || '').trim().toLowerCase()] || 0;

// The plugin's own unlock notification settings for the user, the ones jellyfin-web follows too.
// `allows` says whether a badge of that rarity clears the minimum, ranked the way the plugin
// ranks them.
export const parseUnlockToastSettings = (json) => {
	const minimumRarity = asString(json.MinimumToastRarity).trim().toLowerCase() || 'all';
	return {
		enabled: json.EnableUnlockToasts !== false,
		minimumRarity,
		// One notification for everything a read turned up, rather than one each.
		grouped: json.UnlockToastGrouping !== 'individual',
		muteDuringPlayback: asBool(json.MuteToastsDuringPlayback),
		allows: (rarity) => minimumRarity === 'all' || rarityRank(rarity) >= rarityRank(minimumRarity)
	};
};

// The rank tier carries its own color as the plugin wrote it. Six hex digits or the caller
// keeps whatever it was going to use instead.
export const parseHexColor = (value) => {
	const hex = String(value || '').trim().replace(/^#/, '');
	return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : null;
};

const ratio = (current, target) => {
	if (target <= 0) return 0;
	return Math.min(1, Math.max(0, current / target));
};

export const parseSummary = (json) => (json ? {
	unlocked: asInt(json.Unlocked),
	total: asInt(json.Total),
	percentage: asNumber(json.Percentage),
	score: asInt(json.Score),
	currentWatchStreak: asInt(json.CurrentWatchStreak),
	bestWatchStreak: asInt(json.BestWatchStreak)
} : null);

const parseTier = (json) => ({
	name: asString(json && json.Name),
	minScore: asInt(json && json.MinScore),
	color: asString(json && json.Color),
	icon: asString(json && json.Icon)
});

export const parseRank = (json) => {
	if (!json) return null;
	const next = json.NextTier;
	return {
		score: asInt(json.Score),
		// A missing tier still has to draw, so it falls back to an empty one rather than nothing.
		tier: parseTier(json.Tier),
		// Left out of the payload once the user reaches the top tier.
		nextTier: next && typeof next === 'object' ? parseTier(next) : null,
		progressToNext: asInt(json.ProgressToNext)
	};
};

export const parseBadge = (json) => {
	const unlocked = asBool(json.Unlocked);
	const title = asString(json.Title);
	const description = asString(json.Description);
	const currentValue = asInt(json.CurrentValue);
	const targetValue = asInt(json.TargetValue);
	const rarity = asString(json.Rarity);

	return {
		id: asString(json.Id),
		title,
		description,
		icon: asString(json.Icon),
		category: asString(json.Category),
		rarity,
		unlocked,
		unlockedAt: asDate(json.UnlockedAt),
		currentValue,
		targetValue,
		// The plugin never sends a secret flag. It masks a locked secret badge's title instead,
		// and that mask is all a client gets to go on.
		isSecret: !unlocked && title.trim() === '???',
		descriptionHidden: !unlocked && description.trim() === '???',
		score: scoreForRarity(rarity),
		progress: unlocked ? 1 : ratio(currentValue, targetValue)
	};
};

const parseQuest = (json) => {
	const completed = asBool(json.Completed);
	const current = asInt(json.Current);
	const target = asInt(json.Target);

	return {
		id: asString(json.Id),
		title: asString(json.Title),
		description: asString(json.Description),
		icon: asString(json.Icon),
		reward: asInt(json.Reward),
		target,
		current,
		completed,
		progress: completed ? 1 : ratio(current, target)
	};
};

// Reads either the quest arrays on the overview or the replacement list a reroll answers with,
// which carry the same shape.
const parseQuestList = (value) => mapList(value, parseQuest);

export const parseQuests = (json) => {
	if (!json) return null;
	const daily = parseQuestList(json.Daily);
	const weekly = parseQuestList(json.Weekly);
	return {
		daily,
		weekly,
		// The plugin grants one reroll per UTC day and one per ISO week, so these are only ever
		// 1 or 0.
		dailyRerollsLeft: asInt(json.DailyRerollsRemaining),
		weeklyRerollsLeft: asInt(json.WeeklyRerollsRemaining),
		isEmpty: daily.length === 0 && weekly.length === 0
	};
};

// How a reroll attempt ended. A spent reroll is a refusal the panel reports plainly, not a fault.
export const REROLLED = 'rerolled';
export const REROLL_ALREADY_USED = 'alreadyUsed';
export const REROLL_FAILED = 'failed';

// One thing to watch that would move a badge along. Year and runtime come back as zero when the
// server holds no such value for the item.
const parseChaseItem = (json) => ({
	id: asString(json.Id),
	name: asString(json.Name),
	type: asString(json.Type),
	year: asInt(json.Year),
	runtimeMinutes: asInt(json.RunTimeMinutes)
});

// What the plugin suggests watching for one badge.
export const parseBadgeChase = (json) => {
	const progress = isObject(json.Progress) ? json.Progress : {};
	return {
		current: asInt(progress.Current),
		target: asInt(progress.Target),
		items: mapList(json.Items, parseChaseItem)
	};
};

// The replacement set comes back with the answer, so a reroll needs no second fetch.
export const parseRerolledQuests = (json) => ({
	quests: parseQuestList(json.Quests),
	rerollsLeft: asInt(json.RerollsRemaining)
});

// One consumable the user holds. The plugin also sends a name and a description, both English
// only, so the panel names the three types itself and takes just the icon.
const parsePowerUpSlot = (json) => ({
	// XpBoost, DoubleCredit or StreakFreeze, which is also what the use route takes.
	type: asString(json.Type),
	icon: asString(json.Icon),
	count: asInt(json.Count),
	// Running, pending or banked, depending on which consumable this is.
	active: asBool(json.Active)
});

// The inventory array, which both the read and the spend answer with.
export const parsePowerUpSlots = (value) => mapList(value, parsePowerUpSlot);

// The score bank and what it has already bought. The bank is score left to spend, which isn't
// the same as the score a rank is measured on.
export const parsePowerUpState = (json) => ({
	bank: asInt(json.ScoreBank),
	slots: parsePowerUpSlots(json.Inventory)
});

// How spending a power-up ended. A refusal is the plugin saying no, not a fault.
export const POWER_UP_USED = 'used';
export const POWER_UP_REFUSED = 'refused';
export const POWER_UP_FAILED = 'failed';

// The plugin sells six kinds of cosmetic. These two are the ones whose entry carries an icon name
// and a title, so they're the two that can be drawn here. The other four name CSS rules only the
// plugin's own page ships, and selling those would equip something nobody could see.
export const COSMETIC_AVATAR = 'Avatar';
export const COSMETIC_RANK_TITLE = 'RankTitle';

// Closer icons than the ones the catalog carries. The plugin picks its icons for its own page
// and gives several cosmetics the same one, so a crown, a unicorn and a tastemaker all arrive as
// plain sparkles. An id absent from here keeps whatever the server sent, which is what anything
// added in a later release will do.
const CLOSER_ICONS = {
	'avatar-clapper': 'movie_creation',
	'avatar-crown': 'crown',
	'avatar-dragon': 'whatshot',
	'avatar-owl': 'owl',
	'avatar-popcorn': 'fastfood',
	'avatar-unicorn': 'auto_fix_high',
	'title-archivist': 'archive',
	'title-tastemaker': 'trending_up'
};

// One avatar or rank title a profile can wear. The name is English the way the catalog writes
// it, since a release can add more and there is nothing fixed here to translate against.
const parseCosmetic = (json, kind) => {
	const id = asString(json.Id);
	// Lifetime score earns it instead of buying it, and is left out of everything only ever bought.
	const milestoneScore = asInt(json.MilestoneScore);
	const priceScore = asInt(json.PriceScore);

	return {
		id,
		kind,
		name: asString(json.DisplayName),
		icon: CLOSER_ICONS[id] || asString(json.PreviewIcon),
		priceScore,
		milestoneScore,
		isEarned: milestoneScore > 0,
		// Free to everyone, so it's the slot's starting look rather than stock.
		isDefault: priceScore === 0 && milestoneScore === 0
	};
};

export const parseCosmeticCatalog = (json) => {
	const entries = json && json.Cosmetics;
	if (!Array.isArray(entries)) return [];
	return entries
		.filter(isObject)
		.filter((entry) => entry.Kind === COSMETIC_AVATAR || entry.Kind === COSMETIC_RANK_TITLE)
		.map((entry) => parseCosmetic(entry, entry.Kind));
};

// The server writes an empty string for a slot with nothing in it, and leaves the key out
// entirely on a profile it has never filled.
const nonEmpty = (value) => asString(value) || null;

// Joins the catalog to a profile's state, which is missing entirely until the plugin has a
// profile to hold it.
export const buildCosmeticLoadout = (catalog, state) => {
	const held = state && state.Owned;
	return {
		avatars: catalog.filter((item) => item.kind === COSMETIC_AVATAR),
		titles: catalog.filter((item) => item.kind === COSMETIC_RANK_TITLE),
		// The plugin fills in the free ones and any milestone the score has passed, so this is the
		// whole answer rather than a list to add the defaults to.
		owned: Array.isArray(held) ? held.filter((id) => typeof id === 'string') : [],
		avatarId: nonEmpty(state && state.EquippedAvatarId),
		titleId: nonEmpty(state && state.EquippedCustomTitleId),
		// What a milestone measures against. It isn't the bank, which is only what's left unspent.
		lifetimeScore: asInt(state && state.LifetimeScore),
		bank: asInt(state && state.ScoreBank)
	};
};

export const cosmeticsOf = (loadout, kind) =>
	(kind === COSMETIC_AVATAR ? loadout.avatars : loadout.titles);

export const equippedCosmetic = (loadout, kind) =>
	(kind === COSMETIC_AVATAR ? loadout.avatarId : loadout.titleId);

export const ownsCosmetic = (loadout, item) =>
	item.isDefault || loadout.owned.indexOf(item.id) >= 0;

const wornItem = (loadout, kind) => {
	const id = equippedCosmetic(loadout, kind);
	return id ? cosmeticsOf(loadout, kind).find((item) => item.id === id) : null;
};

// The icon the rank header draws, or nothing to keep the tier's own.
export const wornAvatarIcon = (loadout) => {
	const item = loadout && wornItem(loadout, COSMETIC_AVATAR);
	return item ? item.icon : null;
};

// The name that stands in for the tier's, or nothing to keep it.
export const wornTitle = (loadout) => {
	const item = loadout && wornItem(loadout, COSMETIC_RANK_TITLE);
	return item ? item.name : null;
};

export const cosmeticsAreEmpty = (loadout) =>
	loadout.avatars.length === 0 && loadout.titles.length === 0;

// The same loadout with one slot filled, or emptied by a null id.
export const wearingCosmetic = (loadout, kind, id) => ({
	...loadout,
	avatarId: kind === COSMETIC_AVATAR ? id : loadout.avatarId,
	titleId: kind === COSMETIC_RANK_TITLE ? id : loadout.titleId
});

// The same loadout holding one more, with what the bank has left after it.
export const boughtCosmetic = (loadout, id, bankAfter) => ({
	...loadout,
	owned: loadout.owned.concat(id),
	bank: bankAfter === null ? loadout.bank : bankAfter
});

// How a change to what the profile wears ended.
export const COSMETIC_CHANGED = 'changed';
export const COSMETIC_REFUSED = 'refused';
export const COSMETIC_FAILED = 'failed';

// Counters keyed the way the plugin names them, such as BestWatchStreak. Keeping the map rather
// than naming all twenty-seven means a counter the plugin adds later needs a label and nothing
// else.
export const parseCounters = (json) => {
	if (!isObject(json)) return {};
	const out = {};
	Object.keys(json).forEach((key) => {
		if (typeof json[key] === 'number') out[key] = Math.round(json[key]);
	});
	return out;
};

// The clock arrives keyed by hour, as strings.
export const parseWatchClock = (json) => {
	if (!isObject(json)) return {};
	const out = {};
	Object.keys(json).forEach((key) => {
		const hour = Number(key);
		if (Number.isInteger(hour) && typeof json[key] === 'number') out[hour] = Math.round(json[key]);
	});
	return out;
};

// How the whole server is doing, which an admin can hide.
export const parseServerStats = (json) => ({
	users: asInt(json.TotalUsers),
	badgesUnlocked: asInt(json.TotalBadgesUnlocked),
	itemsWatched: asInt(json.TotalItemsWatched),
	moviesWatched: asInt(json.TotalMoviesWatched),
	seriesCompleted: asInt(json.TotalSeriesCompleted),
	score: asInt(json.TotalAchievementScore),
	mostCommonBadge: asString(json.MostCommonBadge)
});

export const statsAreEmpty = (stats) =>
	Object.keys(stats.records).length === 0 &&
	Object.keys(stats.watchClock).length === 0 &&
	!stats.server;

// One badge someone on this server unlocked. The feed also pages, and says who and which badge by
// id, none of which this screen needs.
const parseActivityEntry = (json) => ({
	at: asDate(json.At),
	userName: asString(json.UserName),
	badgeTitle: asString(json.Title),
	rarity: asString(json.Rarity),
	icon: asString(json.Icon)
});

export const parseActivityFeed = (json) => mapList(json.Entries, parseActivityEntry);

// One thing the shop sells. The name and description the catalog carries are English only, so
// only the type, the pack size and the price are read.
const parseShopPowerUp = (json) => ({
	id: asString(json.Id),
	// Matches a slot's type, which is how a row finds its own wording.
	type: asString(json.Type),
	bundleSize: asInt(json.BundleSize),
	priceScore: asInt(json.PriceScore)
});

// The catalog also carries cosmetics, which this panel has no way to draw, so only the
// power-ups are read.
export const parseShopCatalog = (json) => mapList(json.PowerUps, parseShopPowerUp);

export const PURCHASE_BOUGHT = 'bought';
export const PURCHASE_REFUSED = 'refused';
export const PURCHASE_FAILED = 'failed';

// The overall board carries a score and a completion count. A category board carries one value
// that means whatever the category is and leaves the rest out, so what's present decides which
// board this row came from.
export const parseLeaderboardEntry = (json) => {
	const customTitle = json.CustomTitle;
	return {
		userId: asString(json.UserId),
		userName: asString(json.UserName),
		score: 'Score' in json ? asInt(json.Score) : null,
		unlocked: 'Unlocked' in json ? asInt(json.Unlocked) : null,
		total: 'Total' in json ? asInt(json.Total) : null,
		value: 'Value' in json ? asInt(json.Value) : null,
		customTitle: typeof customTitle === 'string' && customTitle ? customTitle : null
	};
};

export const leaderboardValue = (entry) => {
	if (entry.value !== null) return entry.value;
	return entry.score !== null ? entry.score : 0;
};

const parseCount = (json) => ({name: asString(json.Name), count: asInt(json.Count)});

const countList = (value) => mapList(value, parseCount);

export const parseRecap = (json) => (json ? {
	period: asString(json.Period),
	moviesWatched: asInt(json.MoviesWatched),
	episodesWatched: asInt(json.EpisodesWatched),
	daysWatched: asInt(json.DaysWatched),
	badgesUnlocked: asInt(json.BadgesUnlocked),
	topGenres: countList(json.TopGenres),
	topDirectors: countList(json.TopDirectors),
	topActors: countList(json.TopActors)
} : null);

export const parseLibraryCompletion = (json) => {
	const percents = json && json.LibraryCompletionPercents;
	if (!isObject(percents)) return {};
	const out = {};
	Object.keys(percents).forEach((key) => {
		if (typeof percents[key] === 'number') out[key] = Math.round(percents[key]);
	});
	return out;
};

export const parseBadges = (list) => mapList(list, parseBadge);

export const BADGE_FILTERS = ['all', 'unlocked', 'locked'];

const filterBadges = (badges, filter) => {
	if (filter === 'unlocked') return badges.filter((badge) => badge.unlocked);
	if (filter === 'locked') return badges.filter((badge) => !badge.unlocked);
	return badges;
};

// Filtering happens before grouping, so a category the filter emptied leaves the list rather
// than sitting there with nothing under it. Badges keep the order the server sent them in.
export const groupBadges = (badges, filter, otherLabel) => {
	const grouped = new Map();
	filterBadges(badges, filter).forEach((badge) => {
		const category = badge.category || otherLabel;
		if (!grouped.has(category)) grouped.set(category, []);
		grouped.get(category).push(badge);
	});
	return [...grouped.keys()].sort().map((category) => ({
		category,
		badges: grouped.get(category),
		unlocked: grouped.get(category).filter((badge) => badge.unlocked).length
	}));
};

// Jellyfin user ids arrive with and without their dashes depending on the route.
export const sameUserId = (a, b) =>
	String(a || '').replace(/-/g, '').toLowerCase() === String(b || '').replace(/-/g, '').toLowerCase();

// The friends payloads use PascalCase, the chat ones camelCase.
const parseSocialUser = (json) => ({
	userId: asString(json.UserId ?? json.userId),
	userName: asString(json.UserName ?? json.userName)
});

const parseFriendMedia = (value) => (isObject(value)
	? {id: asString(value.Id), name: asString(value.Name), seriesName: nonEmpty(value.SeriesName)}
	: null);

const parseFriend = (json) => ({
	userId: asString(json.UserId),
	userName: asString(json.UserName),
	online: asBool(json.Online),
	lastSeen: asDate(json.LastSeen),
	nowPlaying: parseFriendMedia(json.NowPlaying),
	lastWatched: parseFriendMedia(json.LastWatched)
});

export const parseFriendsList = (json) => {
	const friends = mapList(json.Friends, parseFriend);
	const incoming = mapList(json.Incoming, parseSocialUser);
	const outgoing = mapList(json.Outgoing, parseSocialUser);
	return {
		friends,
		incoming,
		outgoing,
		// The admin made everyone a friend, so there are no requests to send.
		simpleMode: asBool(json.SimpleMode),
		isFriend: (userId) => friends.some((friend) => sameUserId(friend.userId, userId)),
		isPending: (userId) => [...incoming, ...outgoing].some((user) => sameUserId(user.userId, userId))
	};
};

export const parsePublicProfile = (json) => ({
	userName: asString(json.UserName),
	unlocked: asInt(json.Unlocked),
	total: asInt(json.Total),
	score: asInt(json.Score),
	bestWatchStreak: asInt(json.BestWatchStreak),
	equipped: parseBadges(json.Equipped),
	customTitle: nonEmpty(json.CustomTitle)
});

export const parseSocialUsers = (rows) => (Array.isArray(rows) ? rows : [])
	.filter(isObject)
	.map((user) => ({userId: asString(user.Id), userName: asString(user.Name)}))
	.filter((user) => user.userId);

// The friend settings among the plugin's preferences. Message notifications are on unless the
// plugin says otherwise.
export const parseSocialPrivacy = (json) => ({
	appearOffline: asBool(json.AppearOffline),
	hideNowPlaying: asBool(json.HideNowPlaying),
	hideLastWatched: asBool(json.HideLastWatched),
	messageNotifications: json.MessageNotifications !== false
});

export const applySocialPrivacy = (prefs, privacy) => ({
	...prefs,
	AppearOffline: privacy.appearOffline,
	HideNowPlaying: privacy.hideNowPlaying,
	HideLastWatched: privacy.hideLastWatched,
	MessageNotifications: privacy.messageNotifications
});

export const parseThread = (json) => ({
	conversationId: asString(json.conversationId),
	isGroup: json.type === 'group',
	name: asString(json.otherUserName),
	participants: mapList(json.participants, parseSocialUser),
	lastMessage: asString(json.lastMessage),
	lastFromMe: asBool(json.lastFromMe),
	lastAt: asDate(json.lastAt),
	unreadCount: asInt(json.unreadCount),
	hasAttachment: asBool(json.hasAttachment)
});

// The plugin previews a photo with no text as "[image]".
export const threadIsPhoto = (thread) => thread.hasAttachment && (!thread.lastMessage || thread.lastMessage === '[image]');

const idList = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id) : []);

export const parseConversation = (json) => {
	const createdByUserId = asString(json.createdByUserId);
	const adminIds = idList(json.adminIds);
	const isOwner = (userId) => sameUserId(createdByUserId, userId);
	return {
		id: asString(json.id),
		isGroup: json.type === 'group',
		title: nonEmpty(json.title),
		participantIds: idList(json.participantIds),
		isOwner,
		isAdmin: (userId) => isOwner(userId) || adminIds.some((id) => sameUserId(id, userId))
	};
};

export const parseMessage = (json) => {
	const fromUserId = asString(json.fromUserId);
	const readBy = idList(json.readBy);
	const readAt = asDate(json.readAt);
	return {
		id: asString(json.id),
		fromUserId,
		fromUserName: asString(json.fromUserName),
		text: asString(json.text),
		sentAt: asDate(json.sentAt),
		editedAt: asDate(json.editedAt),
		attachmentId: nonEmpty(json.attachmentId),
		isRead: Boolean(readAt) || readBy.some((id) => !sameUserId(id, fromUserId))
	};
};

// Whether a thread holds a message from someone else that wasn't there at the last read, the
// open chat aside since that one is being read. A thread never seen before is new as a whole.
export const threadHasNewFromOthers = (thread, before, openConversationId) => {
	if (thread.lastFromMe || thread.unreadCount === 0) return false;
	if (thread.conversationId === openConversationId) return false;
	if (!before) return true;
	return thread.unreadCount > before.unreadCount ||
		(thread.lastAt && before.lastAt && thread.lastAt > before.lastAt);
};
