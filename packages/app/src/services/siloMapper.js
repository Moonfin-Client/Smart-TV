// Silo's native answers in the Jellyfin shapes the app reads.

export const SILO_PRODUCT = 'Silo';

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Silo's public endpoints folded into Jellyfin's PublicSystemInfo keys. The version is a git short hash such as
// "4b2e921c+dirty": shown, never parsed. Compatibility is decided by api_major.
export const siloPublicInfo = ({systemInfo, identity, branding, setup}) => {
	const wizardCompleted = setup?.wizard_completed;
	const needsSetup = setup?.needs_setup;
	const loginSubtitle = text(branding?.login_subtitle);
	return {
		Id: text(identity?.server_id),
		ServerName: text(branding?.server_name) || SILO_PRODUCT,
		Version: systemInfo.server_version,
		ProductName: SILO_PRODUCT,
		StartupWizardCompleted: typeof wizardCompleted === 'boolean'
			? wizardCompleted
			: (typeof needsSetup === 'boolean' ? !needsSetup : true),
		...(loginSubtitle ? {LoginDisclaimer: loginSubtitle} : null),
		SiloApiMajor: systemInfo.api_major,
		SiloContractDigest: systemInfo.contract_digest
	};
};

export const isSiloSystemInfo = (data) => Boolean(data) && typeof data.api_major === 'number' && typeof data.server_version === 'string';

const policyFor = (account, profile) => ({
	IsAdministrator: account?.role === 'admin' && (!profile || profile.is_primary === true),
	IsHidden: false,
	IsDisabled: false,
	EnableMediaPlayback: true,
	EnableContentDownloading: account?.download_allowed === true,
	// Personal collections are open to every Silo account.
	EnableCollectionManagement: true,
	EnableSubtitleDownloading: true,
	EnableAllFolders: true,
	EnableLiveTvAccess: false,
	EnableLiveTvManagement: false
});

// A household profile as a user. The profile is the app's user: its own progress, favorites and limits.
export const siloProfileToUser = (profile, account, configuration) => ({
	Id: String(profile.id),
	Name: text(profile.name) || account?.username || '',
	HasPassword: true,
	HasConfiguredPassword: true,
	SiloAccountId: account?.id != null ? String(account.id) : null,
	SiloAccount: account || null,
	SiloProfile: profile,
	Policy: policyFor(account, profile),
	...(configuration ? {Configuration: configuration} : null)
});

// The settings the app reads from a UserConfiguration, all stored at profile scope.
export const SILO_SETTING_KEYS = {
	libraryOrder: 'ui.library_order',
	disabledLibraries: 'ui.disabled_library_ids',
	audioLanguage: 'playback.audio_language',
	subtitleLanguage: 'playback.subtitle_language',
	subtitleMode: 'playback.subtitle_mode',
	showForcedSubtitles: 'playback.show_forced_subtitles',
	autoPlayNext: 'playback.auto_play_next'
};

// Silo library ids are positive integers; the app's are strings.
const libraryIds = (value) => (Array.isArray(value)
	? value.filter((id) => typeof id === 'number' && id >= 1).map((id) => String(Math.floor(id)))
	: []);

const toIntIds = (ids) => {
	const out = [];
	(ids || []).forEach((id) => {
		const n = parseInt(String(id).trim(), 10);
		if (n >= 1 && out.indexOf(n) < 0) out.push(n);
	});
	return out.length ? out : null;
};

// Silo's subtitle mode plus its separate show-forced switch, as Jellyfin's SubtitleMode.
export const siloSubtitleModeToJellyfin = (mode, showForced = true) => {
	if (mode === 'always') return 'Always';
	if (mode === 'off') return showForced ? 'OnlyForced' : 'None';
	return 'Default';
};

// Jellyfin's Default and Smart both mean Silo's auto, which has no show-forced choice of its own, so the current
// switch is kept.
export const jellyfinSubtitleModeToSilo = (mode, currentShowForced = true) => {
	switch (String(mode || '').trim().toLowerCase()) {
		case 'always': return {mode: 'always', showForced: currentShowForced};
		case 'onlyforced': return {mode: 'off', showForced: true};
		case 'none': return {mode: 'off', showForced: false};
		default: return {mode: 'auto', showForced: currentShowForced};
	}
};

export const siloSettingsToConfiguration = (values = {}) => {
	const K = SILO_SETTING_KEYS;
	const showForced = typeof values[K.showForcedSubtitles] === 'boolean' ? values[K.showForcedSubtitles] : true;
	return {
		OrderedViews: libraryIds(values[K.libraryOrder]),
		MyMediaExcludes: libraryIds(values[K.disabledLibraries]),
		LatestItemsExcludes: [],
		GroupedFolders: [],
		EnableNextEpisodeAutoPlay: typeof values[K.autoPlayNext] === 'boolean' ? values[K.autoPlayNext] : true,
		AudioLanguagePreference: text(values[K.audioLanguage]) || '',
		SubtitleLanguagePreference: text(values[K.subtitleLanguage]) || '',
		SubtitleMode: siloSubtitleModeToJellyfin(values[K.subtitleMode], showForced),
		PlayDefaultAudioTrack: true,
		RememberAudioSelections: true,
		RememberSubtitleSelections: true
	};
};

// Silo's values for a Jellyfin configuration, to compare with what was read and write back key by key.
export const configurationToSiloSettings = (config = {}, current = {}) => {
	const K = SILO_SETTING_KEYS;
	const subtitles = jellyfinSubtitleModeToSilo(config.SubtitleMode,
		typeof current[K.showForcedSubtitles] === 'boolean' ? current[K.showForcedSubtitles] : true);
	return {
		[K.libraryOrder]: toIntIds(config.OrderedViews),
		[K.disabledLibraries]: toIntIds(config.MyMediaExcludes),
		[K.audioLanguage]: text(config.AudioLanguagePreference),
		[K.subtitleLanguage]: text(config.SubtitleLanguagePreference),
		[K.subtitleMode]: subtitles.mode,
		[K.showForcedSubtitles]: subtitles.showForced,
		[K.autoPlayNext]: config.EnableNextEpisodeAutoPlay !== false
	};
};

// ---- Ids, types and time

export const TICKS_PER_SECOND = 10000000;
export const secondsToTicks = (seconds) => Math.round(seconds * TICKS_PER_SECOND);

export const siloIdOf = (raw) => {
	if (raw == null) return null;
	const value = String(raw).trim();
	return value || null;
};

// Genres and studios have no ids on Silo, so the app's ids for them carry their names.
export const SILO_GENRE_PREFIX = 'silo-genre:';
export const SILO_STUDIO_PREFIX = 'silo-studio:';
export const siloGenreId = (name) => `${SILO_GENRE_PREFIX}${encodeURIComponent(name)}`;
export const siloStudioId = (name) => `${SILO_STUDIO_PREFIX}${encodeURIComponent(name)}`;
const nameAfter = (prefix, id) => {
	if (typeof id !== 'string' || !id.startsWith(prefix) || id.length === prefix.length) return null;
	try {
		return decodeURIComponent(id.slice(prefix.length));
	} catch {
		return id.slice(prefix.length);
	}
};
export const siloGenreNameOf = (id) => nameAfter(SILO_GENRE_PREFIX, id);
export const siloStudioNameOf = (id) => nameAfter(SILO_STUDIO_PREFIX, id);

// Silo's ids say what they are: movie-…, series-…, season-<series key>-<n>, episode-<series key>-<s>-<e>.
export const siloTypeOfId = (id) => {
	const match = /^(movie|series|season|episode)-/.exec(String(id || ''));
	return match ? match[1] : null;
};

export const siloSeasonId = (seriesId, seasonNumber) => {
	if (typeof seriesId !== 'string' || !seriesId.startsWith('series-') || seriesId.length === 7) return null;
	return `season-${seriesId.slice(7)}-${seasonNumber}`;
};

export const parseSiloSeasonId = (seasonId) => {
	const match = /^season-(.+)-(\d+)$/.exec(String(seasonId || ''));
	return match ? {seriesId: `series-${match[1]}`, seasonNumber: parseInt(match[2], 10)} : null;
};

export const parseSiloEpisodeId = (episodeId) => {
	const match = /^episode-(.+)-(\d+)-(\d+)$/.exec(String(episodeId || ''));
	return match
		? {seriesId: `series-${match[1]}`, seasonNumber: parseInt(match[2], 10), episodeNumber: parseInt(match[3], 10)}
		: null;
};

// A personal collection, or one of a library's collections.
export const SILO_COLLECTION_PREFIX = 'silo-collection:';
export const SILO_LIBRARY_COLLECTION_PREFIX = 'silo-libcollection:';
export const siloCollectionId = (id) => `${SILO_COLLECTION_PREFIX}${id}`;
export const siloLibraryCollectionId = (libraryId, id) => `${SILO_LIBRARY_COLLECTION_PREFIX}${libraryId}:${id}`;
export const parseSiloCollectionId = (id) => {
	const value = String(id || '');
	if (value.startsWith(SILO_COLLECTION_PREFIX)) {
		const rest = value.slice(SILO_COLLECTION_PREFIX.length);
		return rest ? {id: rest, libraryId: null} : null;
	}
	if (value.startsWith(SILO_LIBRARY_COLLECTION_PREFIX)) {
		const rest = value.slice(SILO_LIBRARY_COLLECTION_PREFIX.length);
		const colon = rest.indexOf(':');
		if (colon <= 0 || colon === rest.length - 1) return null;
		return {id: rest.slice(colon + 1), libraryId: rest.slice(0, colon)};
	}
	return null;
};

// A library id is a positive integer.
export const siloLibraryIdOf = (parentId) => {
	const id = String(parentId == null ? '' : parentId).trim();
	return /^\d+$/.test(id) ? id : null;
};

const ITEM_TYPES = {
	movie: {siloType: 'movie', jellyfinType: 'Movie', mediaType: 'Video', isFolder: false},
	series: {siloType: 'series', jellyfinType: 'Series', mediaType: null, isFolder: true},
	season: {siloType: 'season', jellyfinType: 'Season', mediaType: null, isFolder: true},
	episode: {siloType: 'episode', jellyfinType: 'Episode', mediaType: 'Video', isFolder: false},
	audiobook: {siloType: 'audiobook', jellyfinType: 'AudioBook', mediaType: 'Audio', isFolder: false},
	ebook: {siloType: 'ebook', jellyfinType: 'Book', mediaType: 'Book', isFolder: false}
};
export const siloItemTypeOf = (type) => (typeof type === 'string' ? ITEM_TYPES[type.trim().toLowerCase()] || null : null);

export const SILO_SUPPORTED_TYPES = ['movie', 'series', 'season', 'episode'];

const SILO_TYPE_BY_JELLYFIN = {};
const SILO_TYPES_BY_MEDIA = {};
Object.keys(ITEM_TYPES).forEach((key) => {
	const t = ITEM_TYPES[key];
	SILO_TYPE_BY_JELLYFIN[t.jellyfinType.toLowerCase()] = t.siloType;
	if (t.mediaType) (SILO_TYPES_BY_MEDIA[t.mediaType.toLowerCase()] = SILO_TYPES_BY_MEDIA[t.mediaType.toLowerCase()] || []).push(t.siloType);
});

export const splitList = (value) => {
	if (value == null || value === '') return [];
	return (Array.isArray(value) ? value : String(value).split(',')).map((v) => String(v).trim()).filter(Boolean);
};

// The Silo types a query asks for, or null when it names none. Types Silo can't serve (BoxSet, music…) drop out, so an
// empty answer means nothing Silo has was asked for.
export const siloTypesForQuery = (includeItemTypes, mediaTypes) => {
	const named = splitList(includeItemTypes).map((t) => t.toLowerCase());
	const media = splitList(mediaTypes).map((t) => t.toLowerCase());
	if (!named.length && !media.length) return null;
	let result = null;
	if (named.length) result = named.map((t) => SILO_TYPE_BY_JELLYFIN[t]).filter(Boolean);
	if (media.length) {
		const byMedia = [].concat(...media.map((m) => SILO_TYPES_BY_MEDIA[m] || []));
		result = result == null ? byMedia : result.filter((t) => byMedia.includes(t));
	}
	return result.filter((t, i) => SILO_SUPPORTED_TYPES.includes(t) && result.indexOf(t) === i);
};

// Silo's catalog `type` scope for the asked types, or null for the whole catalog.
export const siloCatalogScopeFor = (types) => {
	if (types.length === 1) return types[0] === 'season' ? null : types[0];
	if (types.length === 2 && types.includes('movie') && types.includes('series')) return 'video';
	return null;
};

export const siloSearchScopeFor = (types, withEpisodes) => {
	const wanted = types || SILO_SUPPORTED_TYPES.filter((t) => t !== 'season');
	if (withEpisodes && wanted.length > 1 && wanted.includes('episode') && wanted.every((t) => ['movie', 'series', 'episode'].includes(t))) {
		return 'video_with_episodes';
	}
	return types == null ? null : siloCatalogScopeFor(types);
};

// ---- Sorting and filters

const SORT_FIELDS = {
	sortname: 'title',
	name: 'title',
	seriessortname: 'title',
	productionyear: 'year',
	premieredate: 'release_date',
	datecreated: 'added_at',
	datelastcontentadded: 'latest_episode_added',
	communityrating: 'rating_tmdb',
	criticrating: 'rating_rt_critic',
	officialrating: 'content_rating',
	runtime: 'runtime',
	dateplayed: 'date_viewed',
	playcount: 'plays'
};

const firstTerm = (list) => splitList(list)[0] || null;

export const siloSortFor = (sortBy, sortOrder) => {
	const first = firstTerm(sortBy);
	const field = first ? SORT_FIELDS[first.toLowerCase()] : null;
	if (!field) return null;
	return String(firstTerm(sortOrder) || '').toLowerCase() === 'descending' ? `-${field}` : field;
};

export const siloWantsRandom = (sortBy) => String(firstTerm(sortBy) || '').toLowerCase() === 'random';

const rule = (field, op, value) => ({field, op, value});
const any = (rules) => (rules.length ? {match: 'any', rules} : null);

// The query's filters as Silo rule groups: every group has to match, and any rule within one.
export const siloRuleGroups = ({genres = [], studios = [], years = [], officialRatings = [], filters = [], isFavorite, is4K, isHd,
	audioLanguages = [], subtitleLanguages = []}) => {
	const flags = filters.map((f) => f.toLowerCase());
	const unique = (list) => list.filter((v, i) => list.indexOf(v) === i);
	const groups = [
		any(unique(genres).map((g) => rule('genre', 'is', g))),
		any(years.map((y) => rule('year', 'is', Number(y)))),
		any(officialRatings.map((r) => rule('content_rating', 'is', r))),
		any([].concat(...unique(studios).map((s) => [rule('studio', 'is', s), rule('network', 'is', s)]))),
		flags.includes('isplayed') ? any([rule('watched', 'is', true)]) : null,
		flags.includes('isunplayed') ? any([rule('watched', 'is', false)]) : null,
		flags.includes('isresumable') ? any([rule('in_progress', 'is', true)]) : null,
		isFavorite === true || flags.includes('isfavorite') ? any([rule('favorited', 'is', true)]) : null,
		flags.includes('isinwatchlist') ? any([rule('in_watchlist', 'is', true)]) : null,
		is4K != null ? any([rule('resolution', is4K ? 'is' : 'is_not', '2160p')]) : null,
		isHd === true ? any([rule('resolution', 'is', '1080p'), rule('resolution', 'is', '720p')]) : null,
		...(isHd === false ? ['2160p', '1080p', '720p'].map((r) => any([rule('resolution', 'is_not', r)])) : []),
		any(audioLanguages.map((l) => rule('audio_language', 'is', l))),
		any(subtitleLanguages.map((l) => rule('subtitle_language', 'is', l)))
	];
	return groups.filter(Boolean);
};

export const siloMatchesSeriesStatus = (item, wanted) => {
	if (!wanted.length || item.Type !== 'Series') return true;
	return item.Status != null && wanted.includes(item.Status);
};

// A genre or studio, which Silo names but keeps no record of.
export const siloNamedItem = (name, studio) => ({
	Id: studio ? siloStudioId(name) : siloGenreId(name),
	Name: name,
	SortName: name,
	Type: studio ? 'Studio' : 'Genre',
	IsFolder: true,
	ImageTags: {},
	BackdropImageTags: []
});

// ---- Libraries

const COLLECTION_TYPES = {movies: 'movies', series: 'tvshows', mixed: null, audiobooks: 'audiobooks', ebooks: 'books'};
// Audiobook and ebook libraries are left out: the app reads them through Silo's other APIs, which aren't ported.
export const SILO_SUPPORTED_LIBRARY_TYPES = ['movies', 'series', 'mixed'];

export const siloLibraryToView = (library, register) => {
	const id = siloIdOf(library?.id);
	const type = typeof library?.type === 'string' ? library.type.trim().toLowerCase() : null;
	if (!id || !type || !Object.prototype.hasOwnProperty.call(COLLECTION_TYPES, type)) return null;
	const name = typeof library.name === 'string' ? library.name.trim() : '';
	const posterTag = register(id, 'Primary', library.poster_url);
	return {
		Id: id,
		Name: name,
		SortName: name,
		Type: 'CollectionFolder',
		IsFolder: true,
		...(COLLECTION_TYPES[type] ? {CollectionType: COLLECTION_TYPES[type]} : null),
		ImageTags: posterTag ? {Primary: posterTag} : {},
		BackdropImageTags: [],
		UserData: {PlaybackPositionTicks: 0, IsFavorite: false, Played: false},
		_silo: library
	};
};

// Silo's own order (sort_order), then the order it listed them in.
export const siloLibrariesToViews = (libraries, register) => (Array.isArray(libraries) ? libraries : [])
	.map((library, index) => ({index, order: typeof library?.sort_order === 'number' ? library.sort_order : null, library}))
	.filter(({library}) => SILO_SUPPORTED_LIBRARY_TYPES.includes(String(library?.type || '').trim().toLowerCase()))
	.sort((a, b) => {
		if (a.order != null && b.order != null && a.order !== b.order) return a.order - b.order;
		if (a.order == null && b.order != null) return 1;
		if (a.order != null && b.order == null) return -1;
		return a.index - b.index;
	})
	.map(({library}) => siloLibraryToView(library, register))
	.filter(Boolean);

// The libraries in the profile's own order, any it hasn't placed after, in Silo's order.
export const inViewOrder = (views, order) => {
	if (!order || !order.length) return views;
	const rank = {};
	order.forEach((id, i) => {
		rank[id] = i;
	});
	return views.map((view, index) => ({view, index})).sort((a, b) => {
		const ra = rank[a.view.Id];
		const rb = rank[b.view.Id];
		if (ra != null && rb != null) return ra - rb;
		if (ra != null) return -1;
		if (rb != null) return 1;
		return a.index - b.index;
	}).map(({view}) => view);
};

// ---- Items

const strings = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

// Networks first, then studios, without repeats: the app's studio rows expect a series' networks among its studios.
const studioNames = (item) => {
	const seen = {};
	return strings(item.networks).concat(strings(item.studios)).filter((name) => {
		const key = name.toLowerCase();
		if (seen[key]) return false;
		seen[key] = true;
		return true;
	});
};

const pad = (n, width = 2) => String(n).padStart(width, '0');
const jellyfinDate = (date) => `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T` +
	`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.0000000Z`;

// A calendar date (YYYY-MM-DD, or a full timestamp) as midnight UTC that day.
const calendarDate = (value) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value) || '');
	return match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])) : null;
};

export const siloTimestamp = (value) => {
	if (typeof value !== 'string') return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : jellyfinDate(parsed);
};

// The earliest added_at among the files: Silo dates each file, not the item.
const dateAdded = (versions) => {
	if (!Array.isArray(versions)) return null;
	let earliest = null;
	versions.forEach((v) => {
		const parsed = typeof v?.added_at === 'string' ? new Date(v.added_at) : null;
		if (parsed && !Number.isNaN(parsed.getTime()) && (!earliest || parsed < earliest)) earliest = parsed;
	});
	return earliest ? jellyfinDate(earliest) : null;
};

// Jellyfin's series Status only has Continuing and Ended; anything else is left out.
const seriesStatus = (value) => {
	const status = (text(value) || '').toLowerCase();
	if (!status) return null;
	if (status === 'ended' || status.startsWith('cancel')) return 'Ended';
	if (['returning', 'continuing', 'production', 'airing'].some((w) => status.includes(w)) || status === 'planned' || status === 'pilot') {
		return 'Continuing';
	}
	return null;
};

const communityRating = (item) => (typeof item.rating_tmdb === 'number' && item.rating_tmdb > 0
	? Math.round(item.rating_tmdb * 10) / 10
	: null);

const criticRating = (ratings) => {
	if (!Array.isArray(ratings)) return null;
	const found = ratings.find((r) => r && typeof r.score === 'number' && ['rt_critic', 'rottentomatoes'].includes(String(r.source || '').toLowerCase()));
	return found ? Math.round(found.score) : null;
};

// The first file's exact duration when there is one, else the item's runtime in minutes.
const runTimeTicks = (item) => {
	const duration = Array.isArray(item.versions) && item.versions.length ? item.versions[0]?.duration : null;
	if (typeof duration === 'number' && duration > 0) return secondsToTicks(duration);
	return typeof item.runtime === 'number' && item.runtime > 0 ? secondsToTicks(item.runtime * 60) : null;
};

const providerIds = (item) => {
	const ids = {};
	if (text(item.imdb_id)) ids.Imdb = text(item.imdb_id);
	if (siloIdOf(item.tmdb_id)) ids.Tmdb = siloIdOf(item.tmdb_id);
	if (siloIdOf(item.tvdb_id)) ids.Tvdb = siloIdOf(item.tvdb_id);
	return ids;
};

const int = (value) => (typeof value === 'number' ? Math.trunc(value) : null);

// Silo's default sort title: a leading English article moves to the end, so "The Office" files under O.
export const siloDefaultSortTitle = (title) => {
	const trimmed = String(title || '').trim();
	const space = trimmed.search(/\s/);
	if (space < 0) return null;
	const rest = trimmed.slice(space).trim();
	if (!rest) return null;
	const article = {the: 'The', a: 'A', an: 'An'}[trimmed.slice(0, space).toLowerCase()];
	return article ? `${rest}, ${article}` : null;
};

export const isSiloTrailerKind = (kind) => kind === 'trailer' || kind === 'teaser';

const videoUrl = (site, key) => {
	if (typeof site !== 'string' || typeof key !== 'string' || !key.trim()) return null;
	const k = encodeURIComponent(key.trim());
	if (site.toLowerCase() === 'youtube') return `https://www.youtube.com/watch?v=${k}`;
	if (site.toLowerCase() === 'vimeo') return `https://vimeo.com/${k}`;
	return null;
};

// Silo's `videos` as Jellyfin's RemoteTrailers, trailers and teasers first.
export const siloRemoteTrailers = (videos) => {
	const trailers = [];
	const others = [];
	(Array.isArray(videos) ? videos : []).forEach((v) => {
		const url = v && videoUrl(v.site, v.site_key);
		if (!url) return;
		const entry = {Url: url, ...(text(v.name) ? {Name: text(v.name)} : null)};
		(isSiloTrailerKind(v.kind) ? trailers : others).push(entry);
	});
	return trailers.concat(others);
};

const EXTRA_TYPES = {
	trailer: 'Trailer', teaser: 'Trailer', featurette: 'Featurette', clip: 'Clip', behind_the_scenes: 'BehindTheScenes',
	bloopers: 'Short', deleted_scene: 'DeletedScene', other: 'Unknown'
};

// A local trailer or special feature, which plays as its own item.
export const siloExtraToBaseItem = (extra, ownerId) => {
	const id = siloIdOf(extra?.content_id);
	if (!id) return null;
	const extraType = EXTRA_TYPES[typeof extra.kind === 'string' ? extra.kind : 'other'] || 'Unknown';
	return {
		Id: id,
		Name: text(extra.title) || id,
		Type: extraType === 'Trailer' ? 'Trailer' : 'Video',
		ExtraType: extraType,
		MediaType: 'Video',
		IsFolder: false,
		...(typeof extra.duration_seconds === 'number' && extra.duration_seconds > 0 ? {RunTimeTicks: secondsToTicks(extra.duration_seconds)} : null),
		...(ownerId ? {ParentId: ownerId} : null),
		ImageTags: {},
		BackdropImageTags: [],
		_silo: extra
	};
};

export const siloExtrasOf = (item, trailers, ownerId) => (Array.isArray(item?.extras) ? item.extras : [])
	.filter((e) => e && isSiloTrailerKind(e.kind) === trailers)
	.map((e) => siloExtraToBaseItem(e, ownerId))
	.filter(Boolean);

// The item's own artwork, recorded through `register(itemId, type, url, index)`, as ImageTags and BackdropImageTags.
// An episode's poster or backdrop that is really its series' goes to the series, and only when the series has none
// of its own yet, so artwork borrowed from an episode never replaces the series'.
const imageFields = (id, type, item, images) => {
	const isEpisode = type === 'episode';
	const seriesId = siloIdOf(item.series_id);
	const registerIfMissing = (itemId, imageType, url) => {
		if (!images.tagFor(itemId, imageType)) images.register(itemId, imageType, url);
	};
	let primaryUrl;
	if (isEpisode) {
		primaryUrl = text(item.still_url);
		const poster = text(item.poster_url);
		const seriesPoster = text(item.series_poster_url);
		if (seriesId && seriesPoster) registerIfMissing(seriesId, 'Primary', seriesPoster);
		if (!primaryUrl && poster) {
			if (item.poster_is_episode_still !== false) primaryUrl = poster;
			else if (seriesId) registerIfMissing(seriesId, 'Primary', poster);
		}
	} else {
		primaryUrl = text(item.poster_url);
	}
	let backdrops = strings(item.backdrop_urls);
	if (!backdrops.length && text(item.backdrop_url)) backdrops = [text(item.backdrop_url)];
	if (isEpisode && item.backdrop_is_episode_still !== true) {
		if (seriesId && backdrops.length) registerIfMissing(seriesId, 'Backdrop', backdrops[0]);
		backdrops = [];
	}
	// An episode card names its series' backdrop on its own, which is never the episode still.
	if (isEpisode && seriesId && text(item.series_backdrop_url)) registerIfMissing(seriesId, 'Backdrop', text(item.series_backdrop_url));
	// Episodes have no logo of their own, so an episode's logo_url is its series'. Recorded there too, the player and
	// the episode's detail, which comes without one, find it as the series logo.
	if (isEpisode && seriesId && text(item.logo_url)) registerIfMissing(seriesId, 'Logo', text(item.logo_url));
	const tags = {};
	const primary = images.register(id, 'Primary', primaryUrl);
	if (primary) tags.Primary = primary;
	const logo = images.register(id, 'Logo', item.logo_url);
	if (logo) tags.Logo = logo;
	if (type === 'movie' || type === 'series') {
		// Without a thumb, the first backdrop stands in as the landscape card.
		const thumb = images.register(id, 'Thumb', text(item.thumb_url) || backdrops[0]);
		if (thumb) tags.Thumb = thumb;
		const banner = images.register(id, 'Banner', item.banner_url);
		if (banner) tags.Banner = banner;
	}
	const backdropTags = backdrops.map((url, i) => images.register(id, 'Backdrop', url, i)).filter(Boolean);
	return {
		ImageTags: tags,
		BackdropImageTags: backdropTags,
		// Cards are sized from this before the image loads: posters are 2:3, episode stills 16:9.
		...(tags.Primary ? {PrimaryImageAspectRatio: isEpisode ? 16 / 9 : 2 / 3} : null)
	};
};

// The series artwork Jellyfin repeats on a season or episode, from what has been recorded for the series.
const parentArtwork = (seriesId, images) => {
	const out = {};
	const primary = images.tagFor(seriesId, 'Primary');
	const logo = images.tagFor(seriesId, 'Logo');
	const backdrops = [];
	for (let i = 0; ; i++) {
		const tag = images.tagFor(seriesId, 'Backdrop', i);
		if (!tag) break;
		backdrops.push(tag);
	}
	// The series' thumb only comes with its detail, so the backdrop stands in and an episode card doesn't change
	// once the series has been opened.
	const thumb = backdrops[0] || images.tagFor(seriesId, 'Thumb');
	if (primary) out.SeriesPrimaryImageTag = primary;
	if (logo) Object.assign(out, {ParentLogoItemId: seriesId, ParentLogoImageTag: logo});
	if (thumb) Object.assign(out, {ParentThumbItemId: seriesId, ParentThumbImageTag: thumb, SeriesThumbImageTag: thumb});
	if (backdrops.length) Object.assign(out, {ParentBackdropItemId: seriesId, ParentBackdropImageTags: backdrops});
	return out;
};

const seriesFields = (id, type, item, images, series) => {
	if (type === 'series') return typeof item.season_count === 'number' ? {ChildCount: int(item.season_count)} : {};
	if (type !== 'season' && type !== 'episode') return {};
	const seriesId = siloIdOf(item.series_id) || series?.id || null;
	const seriesName = text(item.series_title) || series?.name || null;
	const out = {};
	if (type === 'season') {
		if (int(item.season_number) != null) out.IndexNumber = int(item.season_number);
		if (typeof item.episode_count === 'number') out.ChildCount = int(item.episode_count);
		if (seriesId) Object.assign(out, {SeriesId: seriesId, ParentId: seriesId});
	} else {
		const season = int(item.season_number);
		if (int(item.episode_number) != null) out.IndexNumber = int(item.episode_number);
		if (season != null) Object.assign(out, {ParentIndexNumber: season, SeasonName: season === 0 ? 'Specials' : `Season ${season}`});
		const seasonId = seriesId && season != null ? siloSeasonId(seriesId, season) : null;
		if (seasonId) Object.assign(out, {SeasonId: seasonId, ParentId: seasonId});
		if (seriesId) out.SeriesId = seriesId;
	}
	if (seriesId) {
		if (seriesName) out.SeriesName = seriesName;
		Object.assign(out, parentArtwork(seriesId, images));
	}
	return out;
};

const playedPercentage = (position, duration) => {
	if (!(position > 0) || typeof duration !== 'number' || duration <= 0) return null;
	return Math.min(100, (position / duration) * 100);
};

// Jellyfin's UserData from the places Silo keeps it: user_state on every item, user_data on series, seasons and
// watch answers, user_rating (1 to 5 stars, so out of 10 here), and the position on a Continue Watching card. Silo only
// knows whether something was watched, not how often.
const userData = (type, item) => {
	const state = item.user_state || {};
	const data = item.user_data || {};
	const played = state.played === true || data.played === true;
	const position = data.position_seconds != null ? data.position_seconds : item.position_seconds;
	const positionSeconds = typeof position === 'number' && position > 0 && !played ? position : 0;
	const duration = data.duration_seconds != null ? data.duration_seconds : item.duration_seconds;
	const lastPlayed = siloTimestamp(item.progress_updated_at) || siloTimestamp(item.sort_metrics?.viewed_at);
	const out = {
		PlaybackPositionTicks: secondsToTicks(positionSeconds),
		PlayCount: played ? 1 : 0,
		IsFavorite: state.is_favorite === true,
		Played: played
	};
	const pct = playedPercentage(positionSeconds, duration);
	if (pct != null) out.PlayedPercentage = pct;
	if (type.isFolder && typeof data.unplayed_count === 'number') out.UnplayedItemCount = int(data.unplayed_count);
	if (lastPlayed) out.LastPlayedDate = lastPlayed;
	if (typeof item.user_rating === 'number' && item.user_rating > 0) out.Rating = item.user_rating * 2;
	return out;
};

// One entry of Silo's progress list, as UserData.
export const siloProgressToUserData = (entry) => {
	const completed = entry?.completed === true;
	const position = entry?.position_seconds;
	const positionSeconds = typeof position === 'number' && position > 0 && !completed ? position : 0;
	const out = {PlaybackPositionTicks: secondsToTicks(positionSeconds), PlayCount: completed ? 1 : 0, Played: completed};
	const pct = playedPercentage(positionSeconds, entry?.duration_seconds);
	if (pct != null) out.PlayedPercentage = pct;
	const lastPlayed = siloTimestamp(entry?.updated_at);
	if (lastPlayed) out.LastPlayedDate = lastPlayed;
	return out;
};

// Crew jobs as the person kinds the app knows, in the order crew is listed after the cast. Jobs that fit none
// (gaffer, casting…) are left out.
const CREW_KINDS = [
	['Creator', ['creator']],
	['Director', ['director', 'co-director']],
	['Writer', ['writer', 'screenplay', 'story', 'teleplay', 'novel', 'author', 'characters']],
	['Producer', ['producer', 'executive producer', 'co-producer', 'co-executive producer', 'associate producer']],
	['Composer', ['composer', 'original music composer', 'music']],
	['Editor', ['editor']]
];

// The cast as Actors in billing order, then the crew by kind. Each photo is recorded under the person's id.
const people = (item, images) => {
	const out = [];
	const seen = {};
	const entry = (credit, kind, role) => {
		const name = text(credit.name);
		if (!name) return;
		const id = siloIdOf(credit.person_id);
		const key = `${id || name}|${kind}`;
		if (seen[key]) return;
		seen[key] = true;
		const tag = id ? images.register(id, 'Primary', credit.photo_url) : null;
		out.push({Name: name, ...(id ? {Id: id} : null), ...(role ? {Role: role} : null), Type: kind, ...(tag ? {PrimaryImageTag: tag} : null)});
	};
	const order = (credit) => (typeof credit.order === 'number' ? credit.order : Infinity);
	(Array.isArray(item.cast) ? item.cast : []).filter(Boolean)
		.map((credit, index) => ({credit, index}))
		.sort((a, b) => (order(a.credit) - order(b.credit)) || (a.index - b.index))
		.forEach(({credit}) => entry(credit, 'Actor', text(credit.character)));
	const crew = (Array.isArray(item.crew) ? item.crew : []).filter(Boolean);
	CREW_KINDS.forEach(([kind, jobs]) => {
		crew.forEach((credit) => {
			const job = text(credit.job);
			if (!job || !jobs.includes(job.toLowerCase())) return;
			entry(credit, kind, job.toLowerCase() === kind.toLowerCase() ? null : job);
		});
	});
	return out;
};

// A version's chapters (`index`, `title`, `start_seconds`, `end_seconds`, `thumbnail_url`) as Jellyfin Chapters in
// start order, each thumbnail recorded as the item's `Chapter/<n>` picture with its tag as the ImageTag. Silo keeps
// intro and credit markers apart, so only real chapters are listed.
export const siloChaptersOf = (version, itemId, images) => (Array.isArray(version?.chapters) ? version.chapters : [])
	.filter((c) => c && typeof c.start_seconds === 'number')
	.map((c, order) => ({c, order}))
	// Stable: chapters starting together keep Silo's order.
	.sort((a, b) => (a.c.start_seconds - b.c.start_seconds) || (a.order - b.order))
	.map(({c}, position) => {
		const tag = images ? images.register(itemId, `Chapter/${position}`, c.thumbnail_url) : null;
		return {
			StartPositionTicks: secondsToTicks(Math.max(c.start_seconds, 0)),
			...(text(c.title) ? {Name: text(c.title)} : null),
			...(tag ? {ImageTag: tag} : null),
			MarkerType: 'Chapter',
			ChapterIndex: position
		};
	});

/**
 * A Silo catalog item (a movie, series, season or episode, from a list or a detail answer) as a Jellyfin BaseItemDto.
 * `images` records artwork: {register(itemId, type, url, index), tagFor(itemId, type, index)}. Season and episode list
 * entries carry no type and no series, so those come from `type` (or the id) and `series` ({id, name}).
 * Answers null for a type the app can't show, or an item without an id.
 */
export const siloItemToBaseItem = (item, {images, type, series, mediaSources} = {}) => {
	const id = siloIdOf(item?.content_id != null ? item.content_id : item?.id);
	if (!id) return null;
	const itemType = siloItemTypeOf(item.type || type || siloTypeOfId(id));
	if (!itemType) return null;
	const name = text(item.title) || '';
	const premiere = calendarDate(item.release_date || item.first_air_date || item.air_date);
	const year = typeof item.year === 'number' ? int(item.year) : (premiere ? premiere.getUTCFullYear() : null);
	const genres = strings(item.genres);
	const status = seriesStatus(item.show_status);
	const tagline = text(item.tagline);
	const extras = Array.isArray(item.extras) ? item.extras.filter(Boolean) : null;
	const dto = {
		Id: id,
		Name: name,
		// Silo orders titles by the sort title, which only the detail carries; cards get the default Silo derives.
		SortName: text(item.sort_title) || siloDefaultSortTitle(name) || name,
		Type: itemType.jellyfinType,
		IsFolder: itemType.isFolder,
		Taglines: tagline ? [tagline] : [],
		RemoteTrailers: siloRemoteTrailers(item.videos),
		Genres: genres,
		GenreItems: genres.map((g) => ({Name: g, Id: siloGenreId(g)})),
		Studios: studioNames(item).map((s) => ({Name: s, Id: siloStudioId(s)})),
		ProviderIds: providerIds(item),
		...imageFields(id, itemType.siloType, item, images),
		...seriesFields(id, itemType.siloType, item, images, series),
		UserData: userData(itemType, item),
		People: people(item, images),
		_silo: item
	};
	if (text(item.original_title)) dto.OriginalTitle = text(item.original_title);
	if (itemType.mediaType) dto.MediaType = itemType.mediaType;
	if (text(item.overview)) dto.Overview = text(item.overview);
	if (extras) {
		dto.LocalTrailerCount = extras.filter((e) => isSiloTrailerKind(e.kind)).length;
		dto.SpecialFeatureCount = extras.filter((e) => !isSiloTrailerKind(e.kind)).length;
	}
	if (year != null) dto.ProductionYear = year;
	if (premiere) dto.PremiereDate = jellyfinDate(premiere);
	if (status) dto.Status = status;
	if (status === 'Ended' && calendarDate(item.last_air_date)) dto.EndDate = jellyfinDate(calendarDate(item.last_air_date));
	if (text(item.content_rating)) dto.OfficialRating = text(item.content_rating);
	if (communityRating(item) != null) dto.CommunityRating = communityRating(item);
	if (criticRating(item.ratings) != null) dto.CriticRating = criticRating(item.ratings);
	if (runTimeTicks(item) != null) dto.RunTimeTicks = runTimeTicks(item);
	if (dateAdded(item.versions)) dto.DateCreated = dateAdded(item.versions);
	if (!itemType.isFolder && mediaSources) {
		const sources = mediaSources(item, id);
		if (sources && sources.length) {
			dto.MediaSources = sources;
			dto.MediaStreams = sources[0].MediaStreams || [];
			// Each version carries its own chapters, so the player shows those of the version that plays. The default's
			// are recorded last, so its thumbnails are the ones a lookup by index finds.
			const versions = Array.isArray(item.versions) ? item.versions : [];
			sources.slice().reverse().forEach((source) => {
				const version = versions.find((v) => siloIdOf(v?.file_id) === source.Id);
				if (version) source.Chapters = siloChaptersOf(version, id, images);
			});
			if (sources[0].Chapters) dto.Chapters = sources[0].Chapters;
		}
	}
	return dto;
};
