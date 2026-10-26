// A Plex Media Server behind the same methods the app calls on a Jellyfin server, answering in Jellyfin's shapes.

import $L from '@enact/i18n/$L';
import {corsFreeFetch} from './secureFetch';
import {mediaServerQueue} from '../utils/requestQueue';
import {classifyError} from '../utils/connectionErrors';
import {
	PLEX_FAVORITE_RATING, PLEX_GENRE_PREFIX, PLEX_PERSON_PREFIX, PLEX_SECTION_PREFIX, PLEX_STUDIO_PREFIX, PLEX_TYPE_NUMBERS,
	epoch, list, plexAdditionalParts, plexItems, plexItemsResult, plexItemToJellyfin, plexKeyOf, plexPartItem, plexPartOf,
	plexPersonToJellyfin, plexSectionToView, plexSourceOf, plexVersion
} from './plexMapper';
import {PREFIXED_ID, plexImageUrl, plexQuery, trimSlash, withPlexToken} from '../utils/plexUrls';

export const plexIdentity = ({appName, appVersion, deviceName, deviceId}) => ({
	'X-Plex-Product': appName,
	'X-Plex-Version': appVersion,
	'X-Plex-Client-Identifier': deviceId,
	'X-Plex-Device-Name': deviceName
});

const DEFAULT_TIMEOUT_MS = 15000;
const PLAYBACK_TIMEOUT_MS = 120000;
const TUNE_TIMEOUT_MS = 300000;
const LIBRARY = 'com.plexapp.plugins.library';

const first = (value) => (Array.isArray(value) && value.length && value[0] && typeof value[0] === 'object' ? value[0] : null);
const splitList = (value, separator = ',') => {
	if (value == null || value === '') return [];
	return (Array.isArray(value) ? value : String(value).split(separator)).map((v) => String(v).trim()).filter(Boolean);
};
const flag = (value) => (value === true || value === 'true' ? true : (value === false || value === 'false' ? false : null));
const anyOf = (values) => (values && values.length ? values.join(',') : undefined);
const unsupported = (what) => Promise.reject(Object.assign(new Error(`${what} isn't supported on Plex`), {status: 501}));
const notFound = (what) => Object.assign(new Error(`No ${what}`), {status: 404});

const SORT_FIELDS = {
	SortName: 'titleSort',
	Name: 'titleSort',
	DateCreated: 'addedAt',
	PremiereDate: 'originallyAvailableAt',
	ProductionYear: 'year',
	CommunityRating: 'audienceRating',
	CriticRating: 'rating',
	DatePlayed: 'lastViewedAt',
	PlayCount: 'viewCount',
	Runtime: 'duration',
	OfficialRating: 'contentRating',
	Random: 'random'
};

const FILTERS = {
	IsPlayed: {unwatched: '0'},
	IsUnplayed: {unwatched: '1'},
	IsResumable: {inProgress: '1'}
};

const SEGMENT_TYPES = {intro: 'Intro', credits: 'Outro', commercial: 'Commercial'};

// How many cinema trailers come before a movie, on top of any pre-roll.
const CINEMA_TRAILER_COUNT = 2;

const NEW_COLLECTION_PREFIX = 'new-collection:';

const TRICKPLAY_WIDTH = 320;
const TRICKPLAY_INTERVAL_MS = 10000;

// Plex only takes two letter codes for a subtitle search and fails outright on three.
const TWO_LETTER_LANGUAGES = {
	eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', dut: 'nl', nld: 'nl', swe: 'sv',
	nor: 'no', nob: 'nb', dan: 'da', fin: 'fi', pol: 'pl', rus: 'ru', ukr: 'uk', cze: 'cs', ces: 'cs', slo: 'sk', slk: 'sk',
	hun: 'hu', rum: 'ro', ron: 'ro', bul: 'bg', gre: 'el', ell: 'el', tur: 'tr', ara: 'ar', heb: 'he', per: 'fa', fas: 'fa',
	hin: 'hi', ben: 'bn', tha: 'th', vie: 'vi', ind: 'id', may: 'ms', msa: 'ms', chi: 'zh', zho: 'zh', jpn: 'ja', kor: 'ko',
	hrv: 'hr', srp: 'sr', slv: 'sl', est: 'et', lav: 'lv', lit: 'lt', ice: 'is', isl: 'is', cat: 'ca', baq: 'eu', eus: 'eu',
	glg: 'gl', tam: 'ta', tel: 'te', fil: 'tl', tgl: 'tl'
};

// Live TV from the server's own DVRs, each a tuner with its guide, and from Plex's free channels, which plex.tv serves itself.
const CHANNEL_PREFIX = 'channel-';
const AIRING_PREFIX = 'airing-';
const CLOUD_SOURCE = 'plex';
const CLOUD_EPG = 'https://epg.provider.plex.tv';
// The free channels' guide comes one channel at a time, and plex.tv turns a burst away, so only this many go out at once.
const CLOUD_GUIDE_REQUESTS = 3;
const CLOUD_GRID_LIFE_MS = 10 * 60 * 1000;
const DVR_GRID_LIFE_MS = 5 * 60 * 1000;
const LINEUP_LIFE_MS = 10 * 60 * 1000;

// The artwork kinds Plex keeps more than one of, by the list it keeps them in and the route that picks one.
const ARTWORK = {Primary: {list: 'posters', pick: 'poster'}, Backdrop: {list: 'arts', pick: 'art'}, Logo: {list: 'clearLogos', pick: 'clearLogo'}};
const CLOUD_HEADERS = {'X-Plex-Provider-Version': '7.2'};
// Plex doesn't know a tuner stream's bitrate, so any cap makes it convert the video. Broadcast HD tops out at 19.4 Mbps.
const BROADCAST_BITRATE = 20000000;

const plexChannelOf = (id) => {
	if (typeof id !== 'string' || !id.startsWith(CHANNEL_PREFIX)) return null;
	const rest = id.substring(CHANNEL_PREFIX.length);
	const dash = rest.indexOf('-');
	return dash < 1 ? null : {source: rest.substring(0, dash), channel: rest.substring(dash + 1)};
};

// A program can air several times, so a showing is what has an id of its own.
const plexAiringOf = (id) => {
	if (typeof id !== 'string' || !id.startsWith(AIRING_PREFIX)) return null;
	const parts = id.substring(AIRING_PREFIX.length).split('-');
	const beginsAt = parseInt(parts[1], 10);
	if (parts.length < 3 || !Number.isFinite(beginsAt)) return null;
	return {source: parts[0], beginsAt, channel: parts.slice(2).join('-')};
};

const channelId = (source, channel) => `${CHANNEL_PREFIX}${source}-${channel}`;
const seconds = (date) => Math.floor(new Date(date).getTime() / 1000);

const liveChannel = (source, channel, number) => {
	const entry = {
		Id: channelId(source, channel.id),
		Name: channel.title ?? channel.callSign,
		Type: 'TvChannel',
		ImageTags: typeof channel.thumb === 'string' ? {Primary: channel.thumb} : {},
		UserData: {IsFavorite: false}
	};
	if (number) entry.ChannelNumber = number;
	return entry;
};

const liveProgram = (source, channel, item, media, channelName) => {
	const {beginsAt, endsAt} = media;
	if (typeof beginsAt !== 'number' || typeof endsAt !== 'number' || channel == null) return null;
	const episode = item.type === 'episode';
	const program = {
		Id: `${AIRING_PREFIX}${source}-${beginsAt}-${channel}`,
		Type: 'Program',
		ChannelId: channelId(source, channel),
		Name: episode ? item.grandparentTitle : item.title,
		StartDate: epoch(beginsAt),
		EndDate: epoch(endsAt),
		RunTimeTicks: (endsAt - beginsAt) * 10000000,
		IsMovie: item.type === 'movie',
		IsSeries: episode,
		IsPremiere: media.premiere === '1' || media.premiere === true,
		ImageTags: typeof item.thumb === 'string' ? {Primary: item.thumb} : {}
	};
	if (channelName != null) program.ChannelName = channelName;
	if (episode) program.EpisodeTitle = item.title;
	if (item.summary != null) program.Overview = item.summary;
	if (episode && item.parentIndex != null) program.ParentIndexNumber = item.parentIndex;
	if (episode && item.index != null) program.IndexNumber = item.index;
	return program;
};

const DIRECT_PLAY_NAMES = {
	ts: 'mpegts', m2ts: 'mpegts', m4v: 'mp4', m4a: 'mp4', m4b: 'mp4', ogm: 'ogg', ogv: 'ogg', oga: 'ogg',
	wmv: 'asf', wma: 'asf', vob: 'mpeg', mpg: 'mpeg', dts: 'dca'
};
const ANY_CONTAINER = 'mkv,mp4,mov,avi,mpegts,webm,asf,ogg,mpeg';
const ANY_MUSIC_CONTAINER = 'mp3,flac,mp4,ogg,wav,aac';
const ANY_VIDEO_CODEC = 'h264,hevc,mpeg1video,mpeg2video,mpeg4,vc1,vp8,vp9,av1';
const ANY_AUDIO_CODEC = 'aac,ac3,eac3,mp3,dca,truehd,flac,opus,vorbis,pcm';
const PLEX_BOUNDS = {Width: 'video.width', Height: 'video.height', VideoLevel: 'video.level', VideoBitDepth: 'video.bitDepth'};

// A device profile condition as a Plex limitation, or null for one Plex has no way to say. Plex ignores notMatch, so a NotEquals is left out.
const plexLimitation = (condition) => {
	if (condition.Condition === 'LessThanEqual' && PLEX_BOUNDS[condition.Property]) {
		return `type=upperBound&name=${PLEX_BOUNDS[condition.Property]}&value=${condition.Value}`;
	}
	if ((condition.Condition === 'Equals' || condition.Condition === 'EqualsAny') && condition.Property === 'VideoProfile') {
		return `type=match&name=video.profile&list=${condition.Value}`;
	}
	return null;
};

// The app's Jellyfin device profile in Plex's client profile terms, so Plex makes the direct play and transcode calls
// Jellyfin would. Plex reads a missing codec list as none, where Jellyfin reads it as any.
export const plexClientProfile = (profile) => {
	const names = (value, any) => {
		const mapped = [];
		String(value ?? '').split(',').forEach((name) => {
			const trimmed = name.trim();
			const plexName = trimmed && (DIRECT_PLAY_NAMES[trimmed] || trimmed);
			if (plexName && !mapped.includes(plexName)) mapped.push(plexName);
		});
		return mapped.length ? mapped.join(',') : any;
	};
	const hls = (type) => list(profile?.TranscodingProfiles)
		.find((p) => p && p.Type === type && p.Protocol === 'hls' && p.Container === 'ts');
	const directives = [
		// The player switches audio tracks itself, so a file whose chosen track isn't the first can still direct play.
		'add-settings(DirectPlayStreamSelection=true)'
	];
	list(profile?.DirectPlayProfiles).forEach((p) => {
		if (p?.Type === 'Video') {
			directives.push(`add-direct-play-profile(type=videoProfile&container=${names(p.Container, ANY_CONTAINER)}` +
				`&videoCodec=${names(p.VideoCodec, ANY_VIDEO_CODEC)}&audioCodec=${names(p.AudioCodec, ANY_AUDIO_CODEC)})`);
		} else if (p?.Type === 'Audio') {
			directives.push(`add-direct-play-profile(type=musicProfile&container=${names(p.Container, ANY_MUSIC_CONTAINER)}` +
				`&audioCodec=${names(p.AudioCodec, ANY_AUDIO_CODEC)})`);
		}
	});
	// The decoder's limits, so Plex doesn't direct play what the TV can't decode. A limit that only holds for some streams
	// of a codec is skipped, since a Plex limitation can't be narrowed that way.
	list(profile?.CodecProfiles).forEach((p) => {
		if (p?.Type !== 'Video' || list(p.ApplyConditions).length) return;
		names(p.Codec, '*').split(',').forEach((codec) => {
			list(p.Conditions).forEach((condition) => {
				const limit = condition && plexLimitation(condition);
				if (limit) {
					directives.push(`add-limitation(scope=videoCodec&scopeName=${codec}&${limit}${condition.IsRequired === true ? '&isRequired=true' : ''})`);
				}
			});
		});
	});
	const videoHls = hls('Video');
	directives.push(`add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts` +
		`&videoCodec=${names(videoHls?.VideoCodec, 'h264')}&audioCodec=${names(videoHls?.AudioCodec, 'aac')})`);
	directives.push(`add-transcode-target(type=musicProfile&context=streaming&protocol=hls&container=mpegts` +
		`&audioCodec=${names(hls('Audio')?.AudioCodec, 'aac')})`);
	return directives.join('+');
};

// A movie split over several files keeps one resume point on Plex, so a file's progress goes out as time into the whole
// movie. These hold where each playing file sits and how long it runs, by play session. They're shared by every api,
// since the report for a session can come from a different one than the playback info did.
const spans = {};
const durations = {};
// The tuned session each live play session watches, which its timeline reports have to name to keep the tuner.
const liveSessions = {};
// What each server has told each account, kept apart since one api follows whichever Plex server and account are signed in.
const serverStates = {};

const newSession = () => {
	let id = '';
	for (let i = 0; i < 16; i++) id += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
	return id;
};

export const createPlexApi = ({getBaseUrl, getToken, getUserId, getDeviceInfo, getUserName}) => {
	const identity = () => plexIdentity(getDeviceInfo());
	const here = () => {
		const key = `${trimSlash(getBaseUrl())}|${getToken()}`;
		return serverStates[key] || (serverStates[key] = {cloudGrids: {}, dvrGrids: {}});
	};

	const send = async (path, {method = 'GET', query, timeoutMs = DEFAULT_TIMEOUT_MS, headers} = {}) => {
		const params = plexQuery({...identity(), 'X-Plex-Token': getToken(), ...query});
		const target = /^https?:/.test(path) ? path : `${trimSlash(getBaseUrl())}${path}`;
		let response;
		try {
			response = await mediaServerQueue.run(() => corsFreeFetch(`${target}${target.includes('?') ? '&' : '?'}${params}`, {
				method,
				headers: {Accept: 'application/json', ...headers}
			}, timeoutMs));
		} catch (err) {
			const typed = new Error(err.message);
			typed.connectionType = classifyError(err);
			throw typed;
		}
		if (!response.ok) {
			const error = new Error(`Plex error ${response.status}`);
			error.status = response.status;
			error.connectionType = classifyError(error);
			throw error;
		}
		const text = await response.text();
		if (!text) return {};
		try {
			return JSON.parse(text);
		} catch {
			return {};
		}
	};

	const container = async (path, query, options) => (await send(path, {...options, query}))?.MediaContainer || {};

	const plexItem = async (id) => {
		const item = first((await container(`/library/metadata/${id}`)).Metadata);
		if (!item) throw notFound(`Plex item ${id}`);
		return item;
	};

	// A sidecar subtitle loads without the client's headers, so its address carries the token.
	const tokenStreams = (streams) => (Array.isArray(streams)
		? streams.map((stream) => (stream.DeliveryUrl ? {...stream, DeliveryUrl: withPlexToken(stream.DeliveryUrl, getToken())} : stream))
		: streams);
	const withStreamTokens = (item) => (item.MediaSources ? {
		...item,
		MediaStreams: tokenStreams(item.MediaStreams),
		MediaSources: item.MediaSources.map((source) => ({...source, MediaStreams: tokenStreams(source.MediaStreams)}))
	} : item);

	const ofTypes = (items, types) => (types && types.length ? items.filter((item) => types.includes(item.Type)) : items);

	const paging = (startIndex, limit) => (limit != null
		? {'X-Plex-Container-Start': startIndex || 0, 'X-Plex-Container-Size': limit}
		: {});

	const page = (items, startIndex, limit) => {
		const start = Math.min(Math.max(startIndex || 0, 0), items.length);
		const end = limit == null ? items.length : Math.min(start + limit, items.length);
		return plexItemsResult(items.slice(start, end), items.length, start);
	};

	// Plex takes the items to add as one URI naming them on this server.
	const itemsUri = async (itemIds) => {
		const state = here();
		if (!state.machineId) state.machineId = (await container('/identity')).machineIdentifier;
		return `server://${state.machineId}/${LIBRARY}/library/metadata/${itemIds.join(',')}`;
	};

	// Plex keeps one watched state and rating for a movie split over several files, so a file's id stands for the movie.
	const keyOf = (itemId) => plexPartOf(itemId)?.key ?? itemId;

	const getItems = async (q = {}) => {
		const includeItemTypes = splitList(q.IncludeItemTypes);
		const excludeItemTypes = splitList(q.ExcludeItemTypes);
		const filters = splitList(q.Filters);
		const isFavorite = flag(q.IsFavorite) === true || filters.includes('IsFavorite');
		const playFilters = filters.filter((f) => f !== 'IsFavorite');
		const personIds = splitList(q.PersonIds);
		const genreIds = splitList(q.GenreIds);
		const artistIds = splitList(q.ArtistIds || q.AlbumArtistIds);
		const searchTerm = q.SearchTerm || q.searchTerm;
		const isHd = flag(q.IsHD);
		const is4K = flag(q.Is4K);
		// A filter Plex can't apply answers with nothing, since ignoring it would show items the filter was meant to leave out.
		const cantFilter = [q.SeriesStatus, q.VideoTypes].some((v) => splitList(v).length) ||
			[q.MinPremiereDate, q.MaxOfficialRating, q.HasParentalRating,
				q.AnyProviderIdEquals, q.HasSubtitles, q.HasTrailer, q.HasSpecialFeature, q.HasThemeSong, q.HasThemeVideo, q.Is3D]
				.some((v) => v != null && v !== '') ||
			(is4K === true && isHd === false) ||
			artistIds.length > 1 ||
			personIds.some((id) => plexKeyOf(id, PLEX_PERSON_PREFIX) == null) ||
			genreIds.some((id) => plexKeyOf(id, PLEX_GENRE_PREFIX) == null) ||
			playFilters.some((f) => !FILTERS[f]);
		if (cantFilter) return plexItemsResult([]);

		const startIndex = q.StartIndex != null ? Number(q.StartIndex) : null;
		const limit = q.Limit != null ? Number(q.Limit) : null;
		const done = (items, total, start) => {
			const kept = excludeItemTypes.length ? items.filter((item) => !excludeItemTypes.includes(item.Type)) : items;
			return plexItemsResult(kept, total ?? kept.length, start || 0);
		};

		const ids = splitList(q.Ids);
		if (ids.length) {
			return done(plexItems((await container(`/library/metadata/${ids.map(keyOf).join(',')}`)).Metadata));
		}

		// Everything a person is in, acting or not. This list ignores sorting, so the newest come first here.
		const personKey = personIds.length === 1 ? plexKeyOf(personIds[0], PLEX_PERSON_PREFIX) : null;
		if (!q.ParentId && personKey) {
			const items = ofTypes(plexItems((await container(`/library/people/${personKey}/media`)).Metadata), includeItemTypes)
				.sort((a, b) => (b.ProductionYear || 0) - (a.ProductionYear || 0));
			return done(items);
		}

		// An artist's albums are its children and its tracks are its leaves.
		const parent = artistIds[0] || q.ParentId || null;

		// A search across every library goes through Plex's hub search, which also lists titles it matched through their
		// cast, artist or genre. Those carry a reason and are left out, so only titles that match the query stay.
		if (!parent && searchTerm) {
			// Without the flag, a collection comes back as a tag and not the item.
			const hubs = await container('/hubs/search', {query: searchTerm, includeCollections: 1, limit});
			const matches = [];
			list(hubs.Hub).forEach((hub) => list(hub?.Metadata).forEach((m) => {
				if (m && m.reason == null) matches.push(m);
			}));
			return done(ofTypes(plexItems(matches), includeItemTypes));
		}

		// Plex lists across libraries only by type, so favorites of every kind ask for every type.
		const types = includeItemTypes.length
			? includeItemTypes.map((t) => PLEX_TYPE_NUMBERS[t]).filter(Boolean)
			: (isFavorite ? Object.values(PLEX_TYPE_NUMBERS) : []);
		const sectionKey = plexKeyOf(parent, PLEX_SECTION_PREFIX);
		let path;
		// Playlists sit outside the libraries, filed by where their items live.
		if (includeItemTypes.length === 1 && includeItemTypes[0] === 'Playlist') {
			path = '/playlists';
		} else if (!parent) {
			if (!types.length) return plexItemsResult([]);
			path = '/library/all';
		} else if (sectionKey) {
			path = `/library/sections/${sectionKey}/all`;
		} else {
			const leaves = flag(q.Recursive) === true && (types.includes(PLEX_TYPE_NUMBERS.Episode) || types.includes(PLEX_TYPE_NUMBERS.Audio));
			path = `/library/metadata/${parent}/${leaves ? 'allLeaves' : 'children'}`;
		}

		// Later fields only break ties, so the sort stops at the first one Plex can't do. With nothing left, Plex keeps its
		// own order, which is disc and track order for an album.
		const sort = [];
		for (const field of splitList(q.SortBy)) {
			const plexField = SORT_FIELDS[field];
			if (!plexField) break;
			sort.push(q.SortOrder === 'Descending' && plexField !== 'random' ? `${plexField}:desc` : plexField);
		}
		const query = {};
		if (types.length && path.endsWith('/all')) query.type = types.join(',');
		if (path === '/playlists' && sectionKey) query.sectionID = sectionKey;
		if (sort.length) query.sort = sort.join(',');
		if (searchTerm) query.title = searchTerm;
		// Plex compares titles as strings, so a first letter is the range up to the next one.
		if (q.NameStartsWith) {
			const prefix = String(q.NameStartsWith);
			query['titleSort>'] = prefix;
			query['titleSort<<'] = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
		}
		if (q.NameStartsWithOrGreater) query['titleSort>'] = q.NameStartsWithOrGreater;
		if (q.NameLessThan) query['titleSort<<'] = q.NameLessThan;
		if (splitList(q.Fields).includes('ProviderIds')) query.includeGuids = 1;
		playFilters.forEach((f) => Object.assign(query, FILTERS[f]));
		// Each repeated genre param must match, while commas match any one.
		const genreFilters = [anyOf(splitList(q.Genres, '|')), anyOf(genreIds.map((id) => plexKeyOf(id, PLEX_GENRE_PREFIX)))].filter(Boolean);
		if (genreFilters.length) query.genre = genreFilters;
		query.year = anyOf(splitList(q.Years));
		query.contentRating = anyOf(splitList(q.OfficialRatings, '|'));
		query.label = anyOf(splitList(q.Tags, '|'));
		query.studio = anyOf(splitList(q.Studios, '|'));
		// shortcut: Plex filters people one role at a time, so only acting credits match. Ask each role if directors and writers should.
		query.actor = anyOf(personIds.map((id) => plexKeyOf(id, PLEX_PERSON_PREFIX)));
		query.audioLanguage = anyOf(splitList(q.AudioLanguages));
		query.subtitleLanguage = anyOf(splitList(q.SubtitleLanguages));
		if (is4K === true) query.resolution = '4k';
		else if (isHd != null) query.resolution = isHd ? '720,1080,4k' : 'sd,480,576';
		if (isFavorite) query.userRating = String(PLEX_FAVORITE_RATING);
		Object.assign(query, paging(startIndex, limit));

		const result = await container(path, query);
		// Children and leaves come back unfiltered, so the type check happens here.
		return done(ofTypes(plexItems(result.Metadata), includeItemTypes), result.totalSize, startIndex);
	};

	const librarySections = async () => list((await container('/library/sections')).Directory).filter(Boolean);

	const getItem = async (itemId) => {
		const state = here();
		const sectionKey = plexKeyOf(itemId, PLEX_SECTION_PREFIX);
		if (sectionKey) {
			const section = (await librarySections()).find((s) => String(s.key) === sectionKey);
			if (!section) throw notFound(`Plex library ${sectionKey}`);
			return plexSectionToView(section);
		}
		const personKey = plexKeyOf(itemId, PLEX_PERSON_PREFIX);
		if (personKey) {
			const person = first((await container(`/library/people/${personKey}`)).Directory);
			if (!person) throw notFound(`Plex person ${personKey}`);
			return plexPersonToJellyfin(person);
		}
		const part = plexPartOf(itemId);
		if (part) return withStreamTokens(plexPartItem(await plexItem(part.key), part.mediaIndex, part.partIndex));
		const items = plexItems((await container(`/library/metadata/${itemId}`, {includeGuids: 1, includeChapters: 1})).Metadata);
		if (!items.length) throw notFound(`Plex item ${itemId}`);
		// Only the owner can remove a collection.
		const canDelete = state.mayDeleteMedia || (state.owner && items[0].Type === 'BoxSet');
		return withStreamTokens(canDelete ? {...items[0], CanDelete: true} : items[0]);
	};

	// Plex's Continue Watching mixes started items with the next episode of each show, which are Jellyfin's resume and next up
	// rows. Home asks for those at the same time, so they share one read.
	let watching = null;
	const continueWatching = async (started) => {
		watching = watching || container('/hubs/continueWatching/items').finally(() => {
			watching = null;
		});
		return plexItems(list((await watching).Metadata).filter((m) => m && (m.viewOffset != null) === started));
	};

	// Plex lists genres and studios per library, under the same key in every library, so a server-wide list merges each
	// library's list. Only name and random order apply, since these tags carry nothing else to sort by.
	const libraryTags = async (filter, prefix, type, {parentId, includeItemTypes, sortBy, sortOrder, startIndex, limit} = {}) => {
		const sections = parentId
			? [plexKeyOf(parentId, PLEX_SECTION_PREFIX)].filter(Boolean)
			: (await librarySections()).map((s) => s.key).filter((k) => k != null);
		// A library with none of these types answers with an empty list.
		const types = splitList(includeItemTypes).map((t) => PLEX_TYPE_NUMBERS[t]).filter(Boolean);
		const lists = await Promise.all(sections.map((key) => container(`/library/sections/${key}/${filter}`, {type: anyOf(types)}).catch(() => ({}))));
		const byId = {};
		lists.forEach((result) => list(result.Directory).forEach((tag) => {
			if (tag && typeof tag.title === 'string') byId[`${prefix}${tag.key}`] = {Id: `${prefix}${tag.key}`, Name: tag.title, Type: type};
		}));
		const items = Object.values(byId);
		if (sortBy === 'Random') {
			for (let i = items.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[items[i], items[j]] = [items[j], items[i]];
			}
		} else {
			const direction = sortOrder === 'Descending' ? -1 : 1;
			items.sort((a, b) => direction * a.Name.toLowerCase().localeCompare(b.Name.toLowerCase()));
		}
		return page(items, startIndex, limit);
	};

	const getPersons = async (searchTerm, limit) => {
		const hubs = await container('/hubs/search', {query: searchTerm, limit});
		// Plex lists a person once per library and role, so each name is kept once.
		const names = {};
		const people = [];
		list(hubs.Hub).forEach((hub) => {
			if (!['actor', 'director', 'writer'].includes(hub?.type)) return;
			list(hub.Directory).forEach((person) => {
				if (!person || names[person.tag]) return;
				names[person.tag] = true;
				people.push(plexPersonToJellyfin(person));
			});
		});
		return plexItemsResult(people);
	};

	// What Plex keeps alongside an item. A trailer Plex streams itself, like a show's, only comes as the item's primary extra.
	const extras = async (itemId) => {
		const item = first((await container(`/library/metadata/${itemId}`, {includeExtras: 1})).Metadata);
		const found = plexItems(item?.Extras?.Metadata);
		const primary = item?.primaryExtraKey;
		if (typeof primary === 'string' && !found.some((e) => primary === `/library/metadata/${e.Id}`)) {
			found.unshift(...plexItems((await container(primary)).Metadata));
		}
		return found;
	};

	const createdItem = async (path, query) => plexItems((await send(path, {method: 'POST', query}))?.MediaContainer?.Metadata)[0];

	const createCollectionWith = async (name, itemIds) => {
		const firstItem = await plexItem(itemIds[0]);
		return createdItem('/library/collections', {
			type: PLEX_TYPE_NUMBERS[plexItemToJellyfin(firstItem).Type],
			title: name,
			smart: 0,
			sectionId: firstItem.librarySectionID,
			uri: await itemsUri(itemIds)
		});
	};

	const scrobble = (path, itemId) => send(path, {query: {key: keyOf(itemId), identifier: LIBRARY}});
	const rate = (itemId, rating) => send('/:/rate', {method: 'PUT', query: {key: keyOf(itemId), identifier: LIBRARY, rating}});

	const readUser = async () => {
		const state = here();
		const [root, owner, name] = await Promise.all([
			container('/'),
			send('/myplex/account').then(() => true, (err) => {
				if (err.status !== 403) throw err;
				return false;
			}),
			getUserName ? getUserName().catch(() => null) : null
		]);
		state.owner = owner;
		state.mayDeleteMedia = owner && root.allowMediaDeletion === true;
		return {
			Id: getUserId(),
			Name: name || '',
			ServerId: root.machineIdentifier,
			PrimaryImageTag: 'plex',
			Policy: {
				IsAdministrator: owner,
				EnableContentDownloading: root.allowSync === true,
				EnableContentDeletion: state.mayDeleteMedia,
				EnableSubtitleManagement: true,
				EnableCollectionManagement: owner,
				EnableAllFolders: true,
				EnabledFolders: [],
				BlockedMediaFolders: []
			},
			Configuration: {}
		};
	};

	// Several screens ask for the user at once while the app starts, so they share one read.
	let userRead = null;
	const getUser = () => userRead || (userRead = readUser().finally(() => {
		userRead = null;
	}));

	const decide = async (transcoder, query, itemId) => {
		const decision = await container(`${transcoder}/decision`, query, {timeoutMs: PLAYBACK_TIMEOUT_MS});
		const decided = first(first(first(decision.Metadata)?.Media)?.Part)?.decision;
		if (decided !== 'directplay' && decided !== 'transcode') {
			throw new Error(decision.generalDecisionText || `Plex can't play item ${itemId}`);
		}
		return {directPlay: decided === 'directplay', why: decision.directPlayDecisionText || null};
	};

	const livePlaybackInfo = async (itemId, channel, request) => {
		const source = (url) => ({
			Id: itemId,
			SupportsDirectPlay: false,
			SupportsTranscoding: true,
			TranscodingUrl: url,
			TranscodingSubProtocol: 'hls',
			Container: 'ts',
			MediaStreams: []
		});
		if (channel.source === CLOUD_SOURCE) {
			return {MediaSources: [source(`${CLOUD_EPG}/library/parts/${channel.channel}.m3u8?${plexQuery({includeAllStreams: '1', ...identity(), 'X-Plex-Token': getToken()})}`)]};
		}
		const session = newSession();
		// The tuner can take a while to start.
		const tune = (await send(`/livetv/dvrs/${channel.source}/channels/${encodeURIComponent(channel.channel)}/tune`, {
			method: 'POST',
			query: {'X-Plex-Session-Identifier': session},
			timeoutMs: TUNE_TIMEOUT_MS
		}))?.MediaContainer;
		const metadata = first(first(tune?.MediaSubscription)?.MediaGrabOperation)?.Metadata;
		const path = metadata?.key;
		if (typeof path !== 'string') throw new Error(tune?.message || `Plex couldn't tune ${itemId}`);
		// X-Plex-Incomplete-Segments stays off, since the TV's player stalls on a segment still being written at the live edge.
		const params = {
			...identity(),
			path,
			hasMDE: '1',
			mediaIndex: '0',
			partIndex: '0',
			protocol: 'hls',
			fastSeek: '1',
			directPlay: '0',
			directStream: '1',
			directStreamAudio: '1',
			maxVideoBitrate: request.MaxStreamingBitrate > 0 && request.MaxStreamingBitrate < BROADCAST_BITRATE
				? String(Math.floor(request.MaxStreamingBitrate / 1000))
				: undefined,
			session,
			'X-Plex-Session-Identifier': session,
			'X-Plex-Platform': 'Generic',
			'X-Plex-Client-Profile-Extra': plexClientProfile(request.DeviceProfile)
		};
		// Plex refuses a start whose session has no decision of its own.
		await send('/video/:/transcode/universal/decision', {query: params, timeoutMs: PLAYBACK_TIMEOUT_MS});
		liveSessions[session] = {ratingKey: metadata.ratingKey, key: path};
		return {PlaySessionId: session, MediaSources: [source(`/video/:/transcode/universal/start.m3u8?${plexQuery(params)}`)]};
	};

	// Answers in Jellyfin's PlaybackInfo shape from Plex's own transcode decision, with the file's own address as Path for direct play.
	const getPlaybackInfo = async (itemId, request = {}) => {
		const channel = plexChannelOf(itemId);
		if (channel) return livePlaybackInfo(itemId, channel, request);
		// A part id names its own file. Anything else plays the first file of the version its source id names.
		const target = plexPartOf(itemId);
		const key = target?.key ?? itemId;
		const item = await plexItem(key);
		const medias = list(item.Media).filter(Boolean);
		if (!medias.length) throw new Error(`Plex item ${itemId} has no media`);
		const mediaIndex = Math.min(target?.mediaIndex ?? plexSourceOf(request.MediaSourceId ?? key).mediaIndex, medias.length - 1);
		const media = medias[mediaIndex];
		const parts = list(media.Part).filter(Boolean);
		const partIndex = target?.partIndex ?? 0;
		const part = parts[partIndex];
		if (!part) throw notFound(`Plex file ${itemId}`);
		// Closed captions stay out here too, as they do in the item's streams.
		const streams = list(part.Stream).filter((s) => s && s.embeddedInVideo == null);

		// The app picks tracks by the Index the mapper gave them, while Plex selects them by its own stream ids.
		const byIndex = (index) => (index == null ? null : streams.find((s) => (s.index ?? s.id) === index) || null);
		const selected = (streamType) => streams.find((s) => s.streamType === streamType && s.selected === true) || null;
		const audioStream = byIndex(request.AudioStreamIndex);
		const subtitleIndex = request.SubtitleStreamIndex;
		const subtitleStream = byIndex(subtitleIndex);
		if (audioStream || subtitleIndex != null) {
			const choice = {allParts: 1};
			if (audioStream) choice.audioStreamID = audioStream.id;
			if (subtitleIndex != null) choice.subtitleStreamID = subtitleStream?.id ?? 0;
			await send(`/library/parts/${part.id}`, {method: 'PUT', query: choice});
		}
		const audio = audioStream || selected(2);
		const subtitle = subtitleIndex == null ? selected(3) : subtitleStream;
		const shownSubtitle = subtitle ? (subtitle.index ?? subtitle.id) : -1;

		const session = newSession();
		// Burning an embedded subtitle in rules out a direct play, so only the transcode asks for it. Plex can't decode a
		// track it lists as codec none (WebVTT), and burning one kills its transcoder, so a transcode leaves it out.
		// A sidecar file reaches the player on its own.
		const burnSubtitle = Boolean(subtitle) && subtitle.key == null && subtitle.codec !== 'none';
		const params = {
			...identity(),
			path: `/library/metadata/${key}`,
			mediaIndex: String(mediaIndex),
			partIndex: String(partIndex),
			protocol: 'hls',
			fastSeek: '1',
			directPlay: request.EnableDirectPlay === false ? '0' : '1',
			// The app turns direct stream off to go through the transcoder, which still copies a video the profile takes.
			// Plex would re-encode the video for that, so only the audio follows it.
			directStream: '1',
			directStreamAudio: request.EnableDirectStream === false ? '0' : '1',
			maxVideoBitrate: request.MaxStreamingBitrate > 0 ? String(Math.floor(request.MaxStreamingBitrate / 1000)) : undefined,
			subtitles: 'none',
			'X-Plex-Platform': 'Generic',
			'X-Plex-Client-Profile-Extra': plexClientProfile(request.DeviceProfile)
		};
		// Plex turns down an HLS start for a track on the video transcoder.
		const transcoder = item.type === 'track' ? '/music/:/transcode/universal' : '/video/:/transcode/universal';

		// The first decision goes without a session or a burn, because Plex keeps a session's first answer and a burn would
		// rule out direct play. It's also the one whose reason counts, since the start always turns direct play off.
		const {directPlay, why} = await decide(transcoder, params, itemId);
		const start = {
			...params,
			directPlay: '0',
			subtitles: burnSubtitle ? 'burn' : 'none',
			session,
			'X-Plex-Session-Identifier': session
		};
		// Plex can refuse a start whose session has no decision of its own.
		if (!directPlay) await decide(transcoder, start, itemId);
		if (parts.length > 1) {
			spans[session] = {
				key,
				offset: parts.slice(0, partIndex).reduce((sum, p) => sum + (p.duration || 0), 0),
				total: media.duration || 0
			};
		}
		durations[session] = part.duration ?? media.duration ?? item.duration ?? null;

		const source = target
			? plexPartItem(item, mediaIndex, partIndex).MediaSources[0]
			: plexItemToJellyfin(item).MediaSources[mediaIndex];
		const result = {
			...source,
			MediaStreams: tokenStreams(source.MediaStreams),
			Path: part.key,
			SupportsDirectPlay: directPlay,
			SupportsDirectStream: false,
			SupportsTranscoding: !directPlay,
			DefaultAudioStreamIndex: audio ? (audio.index ?? audio.id) : undefined,
			DefaultSubtitleStreamIndex: shownSubtitle
		};
		if (!directPlay) {
			result.TranscodingUrl = `${transcoder}/start.m3u8?${plexQuery(start)}`;
			result.TranscodingSubProtocol = 'hls';
			result.TranscodingContainer = 'ts';
			result.TranscodeReasons = why ? [why] : [];
			if (burnSubtitle) {
				result.MediaStreams = result.MediaStreams.map((stream) => (stream.Type === 'Subtitle' && stream.Index === shownSubtitle
					? {...stream, DeliveryMethod: 'Encode'}
					: stream));
			}
		}
		return {PlaySessionId: session, MediaSources: [result]};
	};

	// Plex keeps resume points and watched state through its timeline, which ignores a report that has no runtime.
	const timelineQuery = (info, state) => {
		const session = info.PlaySessionId;
		const live = liveSessions[session];
		if (live) {
			return {
				ratingKey: live.ratingKey,
				key: live.key,
				state,
				hasMDE: 1,
				time: Math.floor((info.PositionTicks || 0) / 10000),
				'X-Plex-Session-Identifier': session
			};
		}
		// A free channel has nothing on the server to report to.
		if (plexChannelOf(String(info.ItemId))) return null;
		const span = spans[session];
		const key = span?.key ?? keyOf(info.ItemId);
		const runTime = info.RunTimeTicks != null ? Math.floor(info.RunTimeTicks / 10000) : null;
		const duration = span?.total || durations[session] || runTime;
		const time = (span?.offset || 0) + Math.floor((info.PositionTicks || 0) / 10000);
		// Plex turns down a report past the end, and the last report of a file often runs a frame over.
		return {
			ratingKey: key,
			key: `/library/metadata/${key}`,
			state,
			time: duration ? Math.min(time, duration) : time,
			duration: duration || undefined,
			'X-Plex-Session-Identifier': typeof session === 'string' ? session : undefined
		};
	};

	const timeline = async (info, state) => {
		const query = timelineQuery(info, state);
		if (state === 'stopped') {
			delete liveSessions[info.PlaySessionId];
			delete spans[info.PlaySessionId];
			delete durations[info.PlaySessionId];
		}
		if (query) await send('/:/timeline', {query});
		return null;
	};

	// The tuners and the free lineup are kept a while, and a load that fails is asked for again next time.
	const cached = (name, load) => {
		const state = here();
		const kept = state[name];
		if (kept && Date.now() - kept.at < LINEUP_LIFE_MS) return kept.loading;
		const loading = load().catch((err) => {
			if (state[name]?.loading === loading) state[name] = null;
			throw err;
		});
		state[name] = {at: Date.now(), loading};
		return loading;
	};

	const dvrList = () => cached('dvrs', async () => list((await container('/livetv/dvrs')).Dvr)
		.filter((dvr) => dvr && typeof dvr.epgIdentifier === 'string')
		.map((dvr) => ({key: String(dvr.key), epg: dvr.epgIdentifier})));

	const dvrChannels = async () => {
		const channels = [];
		for (const dvr of await dvrList()) {
			const lineup = await container(`/${dvr.epg}/lineups/dvr/channels`);
			list(lineup.Channel).forEach((channel) => {
				if (channel) channels.push(liveChannel(dvr.key, channel, String(channel.vcn ?? '')));
			});
		}
		return channels;
	};

	const cloudSend = (path, query) => send(`${CLOUD_EPG}${path}`, {headers: CLOUD_HEADERS, query});

	// Every free channel carries the same placeholder number, so they go without one and sort by name after the tuner's numbered channels.
	const freeChannels = () => cached('freeChannels', async () =>
		list((await cloudSend('/lineups/plex/channels'))?.MediaContainer?.Channel)
			.filter((channel) => channel && channel.drm !== true)
			.map((channel) => liveChannel(CLOUD_SOURCE, channel)));

	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	// Null when plex.tv wouldn't answer, after waiting out a few 429s.
	const fetchFreeGrid = async (channel, day) => {
		for (let attempt = 0; ; attempt++) {
			try {
				return (await cloudSend('/grid', {channelGridKey: channel.split('-').pop(), date: day}))?.MediaContainer?.Metadata || [];
			} catch (err) {
				if (err.status !== 429 || attempt === 3) return null;
				await sleep(1000 * (1 << attempt));
			}
		}
	};

	const freeGrid = (channel, day) => {
		const {cloudGrids} = here();
		const now = Date.now();
		Object.keys(cloudGrids).forEach((old) => {
			if (now - cloudGrids[old].at >= CLOUD_GRID_LIFE_MS) delete cloudGrids[old];
		});
		const key = `${channel}/${day}`;
		if (cloudGrids[key]) return cloudGrids[key].items;
		const items = fetchFreeGrid(channel, day).then((result) => {
			if (result == null) delete cloudGrids[key];
			return result;
		});
		cloudGrids[key] = {at: now, items};
		return items;
	};

	// A DVR's grid answers for every channel at once while the guide asks a few channels at a time, so the whole hours
	// a window touches are read once and kept a few minutes.
	const dvrGridHours = async (from, to) => {
		const showings = [];
		for (const dvr of await dvrList()) {
			const grid = await container(`/${dvr.epg}/grid`, {type: '1,4', 'beginsAt<': to, 'endsAt>': from});
			list(grid.Metadata).forEach((item) => {
				if (item) list(item.Media).forEach((media) => media && showings.push({dvr, item, media}));
			});
		}
		return showings;
	};

	const dvrGrid = async (start, end) => {
		const from = Math.floor(seconds(start) / 3600) * 3600;
		const to = Math.max(Math.ceil(seconds(end) / 3600) * 3600, from + 3600);
		const key = `${from}|${to}`;
		const {dvrGrids} = here();
		const now = Date.now();
		Object.keys(dvrGrids).forEach((old) => {
			if (now - dvrGrids[old].at >= DVR_GRID_LIFE_MS) delete dvrGrids[old];
		});
		if (!dvrGrids[key]) {
			const showings = dvrGridHours(from, to);
			dvrGrids[key] = {at: now, showings};
			showings.catch(() => delete dvrGrids[key]);
		}
		const startAt = seconds(start);
		const endAt = seconds(end);
		return (await dvrGrids[key].showings).filter(({media}) => media.endsAt >= startAt && media.beginsAt <= endAt);
	};

	const dvrProgram = (dvr, item, media) => {
		const program = liveProgram(dvr.key, media.channelIdentifier, item, media, media.channelTitle);
		// Plex files every XMLTV program without an episode number as a movie.
		if (program && dvr.epg.startsWith('tv.plex.providers.epg.xmltv')) program.IsMovie = false;
		return program;
	};

	const seriesOf = (op) => (op?.Metadata?.grandparentSubscriptionID != null ? String(op.Metadata.grandparentSubscriptionID) : null);

	// The server's upcoming and running recordings.
	const grabs = async () => {
		const dvrs = await dvrList();
		const ops = list((await container('/media/subscriptions/scheduled')).MediaGrabOperation);
		const found = [];
		ops.forEach((op) => {
			const dvr = dvrs.find((d) => d.epg === op?.provider);
			const item = op?.Metadata;
			const media = list(item?.Media)[op?.mediaIndex || 0];
			const program = dvr && item && media ? dvrProgram(dvr, item, media) : null;
			if (program) found.push({op, program});
		});
		return found;
	};

	const dvrAirings = async (start, end, channelIds) => {
		const scheduledLoad = grabs().catch(() => []);
		const showings = await dvrGrid(start, end);
		const scheduled = {};
		(await scheduledLoad).forEach((grab) => {
			if (grab.op.status !== 'error') scheduled[grab.program.Id] = grab.op;
		});
		const programs = [];
		showings.forEach(({dvr, item, media}) => {
			const program = dvrProgram(dvr, item, media);
			if (!program || (channelIds && !channelIds.includes(program.ChannelId))) return;
			const op = scheduled[program.Id];
			if (op) {
				program.TimerId = op.id;
				const series = seriesOf(op);
				if (series) program.SeriesTimerId = series;
			}
			programs.push(program);
		});
		return programs;
	};

	// The free channels' guide answers one channel and one UTC day at a time.
	const freeAirings = async (start, end, channels) => {
		const days = [];
		const day = new Date(start);
		day.setUTCHours(0, 0, 0, 0);
		const endMs = new Date(end).getTime();
		while (!days.length || day.getTime() < endMs) {
			days.push(day.toISOString().substring(0, 10));
			day.setUTCDate(day.getUTCDate() + 1);
		}
		const requests = [];
		channels.forEach((channel) => days.forEach((d) => requests.push({channel, day: d})));
		const from = seconds(start);
		const to = seconds(end);
		const programs = [];
		// A showing that runs past midnight is listed on both days.
		const seen = new Set();
		for (let i = 0; i < requests.length; i += CLOUD_GUIDE_REQUESTS) {
			const batch = requests.slice(i, i + CLOUD_GUIDE_REQUESTS);
			const grids = await Promise.all(batch.map((r) => freeGrid(r.channel, r.day).then((items) => ({channel: r.channel, items}))));
			grids.forEach((grid) => list(grid.items).forEach((item) => {
				if (!item) return;
				list(item.Media).forEach((media) => {
					const program = media && liveProgram(CLOUD_SOURCE, grid.channel, item, media);
					if (!program || seen.has(program.Id) || media.endsAt <= from || media.beginsAt >= to) return;
					seen.add(program.Id);
					programs.push(program);
				});
			}));
		}
		return programs;
	};

	const airings = async (start, end, channelIds) => {
		const free = (channelIds || []).map(plexChannelOf).filter((c) => c && c.source === CLOUD_SOURCE).map((c) => c.channel);
		const results = await Promise.all([
			!channelIds || channelIds.length > free.length ? dvrAirings(start, end, channelIds).catch(() => []) : [],
			free.length ? freeAirings(start, end, free) : []
		]);
		return [...results[0], ...results[1]].sort((a, b) => (a.StartDate < b.StartDate ? -1 : (a.StartDate > b.StartDate ? 1 : 0)));
	};

	// Skipping repeats is the only choice Plex lets a series rule make about which showings it records.
	const seriesPrefs = (settings) => (typeof settings?.RecordNewOnly === 'boolean'
		? {'prefs[onlyNewAirings]': settings.RecordNewOnly ? 1 : 0}
		: {});

	// Subscribes to the showing from the template the server offers for it. A one-off is held to that channel and time,
	// or Plex would take whichever airing comes first.
	const record = async (programId, {series = false, prefs = {}} = {}) => {
		const airing = plexAiringOf(programId);
		if (!airing || airing.source === CLOUD_SOURCE) throw new Error("Plex's free channels can't be recorded");
		const at = new Date(airing.beginsAt * 1000);
		const showing = (await dvrGrid(at, at)).find((s) => s.dvr.key === airing.source &&
			s.media.beginsAt === airing.beginsAt && String(s.media.channelIdentifier) === airing.channel);
		if (!showing) throw new Error(`No program ${programId}`);
		const template = await container('/media/subscriptions/template', {guid: showing.item.guid});
		let subscription = null;
		list(template.SubscriptionTemplate).forEach((t) => list(t?.MediaSubscription).forEach((s) => {
			if (!subscription && s && (s.type === 2) === series) subscription = s;
		}));
		if (!subscription) throw new Error(`Plex can't record ${programId} that way`);
		const query = {
			targetLibrarySectionID: subscription.targetLibrarySectionID,
			targetSectionLocationID: subscription.targetSectionLocationID,
			includeGrabs: 1,
			type: subscription.type
		};
		list(subscription.Setting).forEach((setting) => {
			if (setting) query[`prefs[${setting.id}]`] = setting.value;
		});
		Object.assign(query, prefs);
		if (!series) {
			query['prefs[lineupChannel]'] = airing.channel;
			query['prefs[startTimeslot]'] = airing.beginsAt;
		}
		await send(`/media/subscriptions?${subscription.parameters}`, {method: 'POST', query});
		return null;
	};

	// Plex has only album artists. A featured artist is just a name on the track, so both lists are the same.
	const artists = (params = {}) => getItems({...params, IncludeItemTypes: 'MusicArtist'});

	const api = {
		getPublicInfo: async () => {
			const id = await container('/identity');
			return {Id: id.machineIdentifier, Version: plexVersion(id.version), ProductName: 'Plex Media Server'};
		},

		// Plex Home members come from plex.tv, which the sign in screen asks itself.
		getPublicUsers: async () => [],

		getLibraries: async () => {
			const sections = (await librarySections()).filter((s) => !s.hidden).map(plexSectionToView);
			// Every Plex account has the free channels, and the guide opens from a livetv view.
			sections.push({Id: 'livetv', Name: $L('Live TV'), Type: 'CollectionFolder', CollectionType: 'livetv', IsFolder: true, ImageTags: {}});
			return plexItemsResult(sections);
		},

		getAllLibraries: async () => plexItemsResult((await librarySections()).map(plexSectionToView)),

		getItems,

		getItem,
		getItemForDetail: getItem,
		getItemWithChapters: getItem,
		getItemMediaInfo: getItem,
		getPerson: getItem,

		getLocalTrailers: async (itemId) => (await extras(itemId)).filter((e) => e.ExtraType === 'Trailer'),

		getMediaSegments: async (itemId) => {
			// A split movie's markers count from the start of the whole movie.
			if (plexPartOf(itemId)) return {Items: []};
			const item = first((await container(`/library/metadata/${itemId}`, {includeMarkers: 1})).Metadata);
			return {
				Items: list(item?.Marker)
					.filter((m) => m && SEGMENT_TYPES[m.type] && typeof m.startTimeOffset === 'number' && typeof m.endTimeOffset === 'number')
					.map((m) => ({
						Id: `${itemId}-${m.type}-${m.startTimeOffset}`,
						ItemId: itemId,
						Type: SEGMENT_TYPES[m.type],
						StartTicks: m.startTimeOffset * 10000,
						EndTicks: m.endTimeOffset * 10000
					}))
			};
		},

		getUserConfiguration: getUser,
		getCurrentUser: getUser,
		// Plex keeps no client settings for the user.
		updateUserConfiguration: async () => null,

		getLatest: async (libraryId, limit = 20) => {
			const sectionKey = plexKeyOf(libraryId, PLEX_SECTION_PREFIX);
			if (!sectionKey) return [];
			return plexItems((await container(`/library/sections/${sectionKey}/recentlyAdded`, paging(0, limit))).Metadata);
		},

		getLatestMedia: async (libraryId = null, limit = 16) => (libraryId
			? api.getLatest(libraryId, limit)
			: plexItems((await container('/library/recentlyAdded', paging(0, limit))).Metadata)),

		getRecentlyReleased: (libraryId, limit = 20, includeItemTypes = 'Movie,Series') =>
			getItems({ParentId: libraryId, IncludeItemTypes: includeItemTypes, SortBy: 'PremiereDate', SortOrder: 'Descending', Limit: limit}),

		getCollections: (limit = 50, sortBy = 'SortName', sortOrder = 'Ascending') =>
			getItems({IncludeItemTypes: 'BoxSet', SortBy: sortBy, SortOrder: sortOrder, Limit: limit}),

		// Studio pages filter by name, so the id just has to be unique and free of commas. Plex's encoded key is both.
		getStudios: (limit = 20, sortBy = 'SortName', sortOrder = 'Ascending') =>
			libraryTags('studio', PLEX_STUDIO_PREFIX, 'Studio', {sortBy, sortOrder, limit}),

		getResumeItems: async (limit = 12) => page((await continueWatching(true)).filter((item) => item.MediaType === 'Video'), 0, limit),

		getResumeAudioItems: async (limit = 20) => page((await continueWatching(true)).filter((item) => item.MediaType === 'Audio'), 0, limit),

		getNextUp: async (limit = 24, seriesId = null) => {
			if (seriesId) {
				const show = first((await container(`/library/metadata/${seriesId}`, {includeOnDeck: 1})).Metadata);
				const episode = show?.OnDeck?.Metadata;
				return plexItemsResult(episode && typeof episode === 'object' ? [plexItemToJellyfin(episode)] : []);
			}
			return page(await continueWatching(false), 0, limit);
		},

		getPlaybackInfo,

		reportPlaybackStart: (info) => timeline(info, 'playing'),
		reportPlaybackProgress: (info) => timeline(info, info.IsPaused ? 'paused' : 'playing'),
		// A stop without a play session stays a resume point on Plex even at the very end, so one past 90% is marked watched instead.
		reportPlaybackStopped: (info) => {
			const runTime = info.RunTimeTicks || 0;
			if (info.PlaySessionId == null && runTime > 0 && (info.PositionTicks || 0) >= runTime * 0.9) {
				return scrobble('/:/scrobble', info.ItemId);
			}
			return timeline(info, 'stopped');
		},

		// A card's preview, a light h264 transcode under its own play session, which Plex wants decided before it starts.
		getPreviewStreamUrl: async ({itemId, mediaSourceId, playSessionId}) => {
			const target = plexPartOf(itemId);
			const params = {
				...identity(),
				path: `/library/metadata/${target?.key ?? itemId}`,
				mediaIndex: String(target?.mediaIndex ?? plexSourceOf(mediaSourceId ?? itemId).mediaIndex),
				partIndex: String(target?.partIndex ?? 0),
				protocol: 'hls',
				fastSeek: '1',
				directPlay: '0',
				directStream: '0',
				directStreamAudio: '0',
				maxVideoBitrate: '4000',
				videoResolution: '1280x720',
				subtitles: 'none',
				session: playSessionId,
				'X-Plex-Session-Identifier': playSessionId,
				'X-Plex-Platform': 'Generic',
				'X-Plex-Client-Profile-Extra': plexClientProfile({
					TranscodingProfiles: [{Type: 'Video', Protocol: 'hls', Container: 'ts', VideoCodec: 'h264', AudioCodec: 'aac'}]
				}) + '+add-limitation(scope=videoAudioCodec&scopeName=aac&type=upperBound&name=audio.channels&value=2)'
			};
			await decide('/video/:/transcode/universal', params, itemId);
			return withPlexToken(`${trimSlash(getBaseUrl())}/video/:/transcode/universal/start.m3u8?${plexQuery(params)}`, getToken());
		},

		// A movie's file, or an episode's when there are no movies, since asking for episodes across every show is slow.
		getBitrateTestUrl: async () => {
			const fileOf = async (type) => first(first(first((await container('/library/all', {type, ...paging(0, 1)})).Metadata)?.Media)?.Part)?.key;
			const key = (await fileOf(PLEX_TYPE_NUMBERS.Movie)) || (await fileOf(PLEX_TYPE_NUMBERS.Episode));
			return key ? withPlexToken(`${trimSlash(getBaseUrl())}${key}`, getToken()) : null;
		},

		// The stop a suspended app can still send, as a single URL.
		stoppedTimelineUrl: (info) => {
			const query = timelineQuery(info, 'stopped');
			return query ? `${trimSlash(getBaseUrl())}/:/timeline?${plexQuery({...query, ...identity(), 'X-Plex-Token': getToken()})}` : null;
		},

		getOwnSessions: async () => [],
		closeLiveStream: async () => null,

		// This ends a track's transcode too.
		stopActiveEncodings: async (playSessionId) => {
			if (!playSessionId) return null;
			await send('/video/:/transcode/universal/stop', {query: {session: playSessionId}}).catch(() => null);
			return null;
		},

		search: (query, limit = 240) => getItems({SearchTerm: query, Limit: limit}),
		searchPeople: (query, limit = 24) => getPersons(query, limit),

		getSeasons: async (seriesId) => plexItemsResult(plexItems((await container(`/library/metadata/${seriesId}/children`)).Metadata)
			.filter((item) => item.Type === 'Season')),

		getEpisodes: async (seriesId, seasonId = null) => plexItemsResult(plexItems((await container(seasonId
			? `/library/metadata/${seasonId}/children`
			: `/library/metadata/${seriesId}/allLeaves`)).Metadata)),

		getSimilar: async (itemId, limit = 15) => plexItemsResult(plexItems((await container(`/library/metadata/${itemId}/similar`, paging(0, limit))).Metadata)),

		getGenres: (libraryId, includeItemTypes = 'Movie,Series', sortBy = 'SortName', sortOrder = 'Ascending') =>
			libraryTags('genre', PLEX_GENRE_PREFIX, 'Genre', {parentId: libraryId, includeItemTypes, sortBy, sortOrder}),

		getMusicGenres: (params = {}) => libraryTags('genre', PLEX_GENRE_PREFIX, 'MusicGenre', {
			parentId: params.ParentId,
			includeItemTypes: params.IncludeItemTypes || 'MusicAlbum',
			sortBy: params.SortBy,
			sortOrder: params.SortOrder,
			startIndex: params.StartIndex != null ? Number(params.StartIndex) : undefined,
			limit: params.Limit != null ? Number(params.Limit) : undefined
		}),

		getItemsByGenre: (genreId, libraryId, limit = 50) =>
			getItems({GenreIds: genreId, ParentId: libraryId, Limit: limit, Recursive: true, IncludeItemTypes: 'Movie,Series'}),

		getItemsByPerson: (personId) => getItems({PersonIds: personId, IncludeItemTypes: 'Movie,Series,MusicVideo,Episode'}),

		getFavorites: (limit = 50) => getItems({IsFavorite: true, Limit: limit}),

		getRandomItems: (contentType = 'both', limit = 10, parentId = null, genreName = null) => {
			let includeTypes = 'Movie,Series';
			if (contentType === 'movies') includeTypes = 'Movie';
			else if (contentType === 'tv') includeTypes = 'Series';
			return getItems({IncludeItemTypes: includeTypes, SortBy: 'Random', Limit: limit, ParentId: parentId, Genres: genreName});
		},

		getPreviewItems: (limit = 10) => getItems({IncludeItemTypes: 'Movie,Series', SortBy: 'DateCreated', SortOrder: 'Descending', Limit: limit}),

		getCollectionItems: (collectionId, limit = 50, sortBy = null, sortOrder = 'Ascending') =>
			getItems({ParentId: collectionId, Limit: limit, SortBy: sortBy, SortOrder: sortOrder}),

		setFavorite: (itemId, isFavorite) => rate(itemId, isFavorite ? PLEX_FAVORITE_RATING : -1),
		setWatched: (itemId, watched) => scrobble(watched ? '/:/scrobble' : '/:/unscrobble', itemId),

		// Plex keeps the resume position, and nothing but playing the item again brings it back.
		hideFromResume: (itemId) => send('/actions/removeFromContinueWatching', {method: 'PUT', query: {ratingKey: keyOf(itemId)}}),

		setPlaybackPosition: (itemId, ticks) => send('/:/progress', {
			method: 'PUT',
			query: {key: itemId, identifier: LIBRARY, time: Math.floor(ticks / 10000), state: 'stopped'}
		}),

		// Plex has no likes, and its rating stands in for favorites.
		setRating: () => unsupported('Rating'),
		setNumericRating: () => unsupported('Rating'),
		clearRating: () => unsupported('Rating'),

		// Plex hands out its cinema trailers and the server's pre-roll only in a play queue that asks for them, where they come ahead of the item.
		getIntros: async (itemId) => {
			const queue = await send('/playQueues', {
				method: 'POST',
				query: {type: 'video', uri: await itemsUri([itemId]), extrasPrefixCount: CINEMA_TRAILER_COUNT}
			});
			const items = plexItems(queue?.MediaContainer?.Metadata);
			const end = items.findIndex((item) => item.Id === String(itemId));
			return plexItemsResult(end < 0 ? items : items.slice(0, end));
		},

		// The values a library's filter picker offers, read from Plex's own lists for that library.
		getQueryFilters: async (parentId, includeItemTypes) => {
			const empty = {genres: [], officialRatings: [], tags: [], years: [], audioLanguages: [], subtitleLanguages: []};
			const section = plexKeyOf(parentId, PLEX_SECTION_PREFIX);
			if (!section) return empty;
			const type = PLEX_TYPE_NUMBERS[splitList(includeItemTypes)[0]];
			// A library without this filter just leaves its section hidden.
			const values = (filter) => container(`/library/sections/${section}/${filter}`, {type}).then((r) => list(r.Directory).filter(Boolean), () => []);
			const [genres, years, ratings, labels, audio, subtitles] = await Promise.all(
				['genre', 'year', 'contentRating', 'label', 'audioLanguage', 'subtitleLanguage'].map(values));
			const titles = (entries) => entries.map((v) => v.title).filter((t) => typeof t === 'string');
			const languages = (entries) => entries.filter((v) => typeof v.key === 'string').map((v) => ({name: String(v.title ?? v.key), value: v.key}));
			return {
				genres: titles(genres),
				years: years.map((y) => parseInt(y.key, 10)).filter(Number.isFinite),
				officialRatings: titles(ratings),
				tags: titles(labels),
				audioLanguages: languages(audio),
				subtitleLanguages: languages(subtitles)
			};
		},

		getAdditionalParts: async (itemId) => {
			const {key, mediaIndex} = plexSourceOf(itemId);
			return plexItemsResult(plexAdditionalParts(await plexItem(key), mediaIndex));
		},

		// Trailers stay in, since the app finds an item's trailer in this list.
		getSpecialFeatures: (itemId) => extras(itemId),

		// A Plex show keeps one theme song, played straight from its own path, which is what the song's id holds.
		getThemeSongs: async (itemId, inheritFromParent = true) => {
			if (PREFIXED_ID.test(String(itemId))) return plexItemsResult([]);
			const item = await plexItem(keyOf(itemId));
			const theme = item.theme ?? (inheritFromParent ? item.grandparentTheme ?? item.parentTheme : null);
			return plexItemsResult(typeof theme === 'string' ? [{Id: theme, Type: 'Audio'}] : []);
		},

		getLiveTvChannels: async (startIndex = 0, limit) => {
			const results = await Promise.all([dvrChannels().catch(() => []), freeChannels().catch(() => [])]);
			return page([...results[0], ...results[1]], startIndex, limit);
		},

		getLiveTvPrograms: async (channelIds, startDate, endDate) => {
			const ids = Array.isArray(channelIds) ? channelIds : [channelIds];
			const start = startDate ? new Date(startDate) : new Date();
			const end = endDate ? new Date(endDate) : new Date(start.getTime() + 3 * 3600000);
			return plexItemsResult(await airings(start, end, ids));
		},

		getLiveTvProgram: async (programId) => {
			const airing = plexAiringOf(programId);
			if (!airing) throw notFound(`program ${programId}`);
			const start = new Date(airing.beginsAt * 1000);
			const programs = await airings(start, new Date(start.getTime() + 1000), [channelId(airing.source, airing.channel)]);
			const program = programs.find((p) => p.Id === programId);
			if (!program) throw notFound(`program ${programId}`);
			return program;
		},

		// What's on the tuner right now. The free channels would take a guide request each, so they're left out.
		getLiveTvAiringPrograms: async (limit) => {
			const now = new Date();
			const programs = await dvrAirings(now, now);
			return plexItemsResult(limit ? programs.slice(0, limit) : programs);
		},

		// Finished recordings land in the DVR's library like anything else.
		getLiveTvRecordings: async () => plexItemsResult([]),

		getLiveTvTimers: async () => plexItemsResult((await grabs()).map(({op, program}) => {
			const timer = {
				Id: op.id,
				Type: 'Timer',
				ProgramId: program.Id,
				ChannelId: program.ChannelId,
				ChannelName: program.ChannelName,
				Name: program.Name,
				StartDate: program.StartDate,
				EndDate: program.EndDate,
				Status: op.status === 'scheduled' ? 'New' : (op.status === 'error' ? 'Error' : 'InProgress'),
				ProgramInfo: program
			};
			const series = seriesOf(op);
			if (series) timer.SeriesTimerId = series;
			return timer;
		})),

		createLiveTvTimer: (programId) => record(programId),

		// A one-off recording is a subscription of its own, so it goes with it. One showing of a series only drops that
		// showing. The schedule screens cancel by the showing's id, so that finds its recording too.
		cancelLiveTvTimer: async (timerId) => {
			const grab = (await grabs()).find((g) => g.op.id === timerId || g.program.Id === timerId);
			const subscription = !grab || seriesOf(grab.op) ? null : grab.op.mediaSubscriptionID;
			await send(subscription == null
				? `/media/grabbers/operations/${grab?.op.id ?? timerId}`
				: `/media/subscriptions/${subscription}`, {method: 'DELETE'});
			return null;
		},

		getLiveTvSeriesTimers: async () => plexItemsResult(list((await container('/media/subscriptions')).MediaSubscription)
			.filter((rule) => rule && rule.type === 2)
			.map((rule) => ({
				Id: String(rule.key),
				Type: 'SeriesTimer',
				Name: rule.Directory?.title,
				RecordAnyChannel: !list(rule.Setting).some((s) => s && s.id === 'lineupChannel' && s.value !== '')
			}))),

		createLiveTvSeriesTimer: (programId, flags) => record(programId, {series: true, prefs: seriesPrefs(flags)}),

		// Plex has no setting for episodes already recorded, so a rule reads back as skipping them, the choice a new one starts on.
		getLiveTvSeriesTimer: async (seriesTimerId) => {
			const rule = first((await container(`/media/subscriptions/${seriesTimerId}`)).MediaSubscription);
			if (!rule) throw notFound(`Plex series rule ${seriesTimerId}`);
			return {
				Id: String(seriesTimerId),
				RecordNewOnly: list(rule.Setting).some((s) => s && s.id === 'onlyNewAirings' && String(s.value) === '1'),
				SkipEpisodesInLibrary: true
			};
		},

		updateLiveTvSeriesTimer: (seriesTimerId, rule) => send(`/media/subscriptions/${seriesTimerId}`, {method: 'PUT', query: seriesPrefs(rule)}),

		cancelLiveTvSeriesTimer: (seriesTimerId) => send(`/media/subscriptions/${seriesTimerId}`, {method: 'DELETE'}),

		searchRemote: async (itemType, searchInfo = {}) => {
			const result = await container(`/library/metadata/${searchInfo.ItemId}/matches`, {
				manual: 1,
				title: searchInfo.SearchInfo?.Name ?? searchInfo.Name,
				year: searchInfo.SearchInfo?.Year ?? searchInfo.Year
			});
			return list(result.SearchResult).filter((m) => m && typeof m.guid === 'string').map((m) => ({
				Name: m.name,
				ProductionYear: m.year,
				Overview: m.summary,
				ImageUrl: m.thumb,
				SearchProviderName: 'Plex',
				PlexGuid: m.guid
			}));
		},

		// Plex always brings the match's artwork along.
		applyRemoteSearchResult: (itemId, result) => send(`/library/metadata/${itemId}/match`, {
			method: 'PUT',
			query: {guid: result.PlexGuid, name: result.Name, year: result.ProductionYear}
		}),

		// A full refresh asks the agents again for everything, not just what's missing.
		refreshItem: (itemId, {replaceAllMetadata} = {}) => send(`/library/metadata/${itemId}/refresh`, {
			method: 'PUT',
			query: {force: replaceAllMetadata ? 1 : undefined}
		}),

		// Removing a playlist or collection only drops the list. Anything else deletes its files, which Plex allows only
		// the owner with the server's own setting on.
		deleteItem: async (itemId) => {
			const type = (await plexItem(itemId)).type;
			if (type === 'playlist') return send(`/playlists/${itemId}`, {method: 'DELETE'});
			if (type === 'collection') return send(`/library/collections/${itemId}`, {method: 'DELETE'});
			return send(`/library/metadata/${itemId}`, {method: 'DELETE'});
		},

		// Plex searches OpenSubtitles itself.
		searchRemoteSubtitles: async (itemId, language = 'eng') => list((await container(`/library/metadata/${keyOf(itemId)}/subtitles`, {
			language: TWO_LETTER_LANGUAGES[language] || language
		})).Stream).filter(Boolean).map((r) => ({
			Id: String(r.id),
			Name: r.title,
			ThreeLetterISOLanguageName: r.languageCode,
			ProviderName: r.providerTitle,
			Format: r.format,
			HearingImpaired: r.hearingImpaired === true
		})),

		// Plex fetches the result and adds it to the item as a sidecar stream.
		downloadRemoteSubtitle: (itemId, subtitleId) => send(`/library/metadata/${keyOf(itemId)}/subtitles`, {
			method: 'PUT',
			query: {key: `/library/streams/${subtitleId}`}
		}),

		getAlbumArtists: artists,
		getArtists: artists,

		getAlbumsByArtist: (artistId, limit = 100) => getItems({ParentId: artistId, IncludeItemTypes: 'MusicAlbum', Limit: limit}),
		getAlbumTracks: (albumId) => getItems({ParentId: albumId, IncludeItemTypes: 'Audio'}),
		getArtistItems: (artistId, limit = 50) => getItems({ParentId: artistId, IncludeItemTypes: 'Audio', Recursive: true, Limit: limit}),

		// Plex lists a track's lyric file as stream type 4 and reads it into lines with millisecond offsets.
		getLyrics: async (itemId) => {
			let lyricStream = null;
			list((await container(`/library/metadata/${itemId}`)).Metadata).forEach((item) => list(item?.Media).forEach((media) =>
				list(media?.Part).forEach((part) => list(part?.Stream).forEach((stream) => {
					if (!lyricStream && stream?.streamType === 4) lyricStream = stream;
				}))));
			if (!lyricStream) return {Lyrics: []};
			const lyric = first((await container(String(lyricStream.key))).Lyrics);
			const timed = lyric?.timed === true;
			return {
				Lyrics: list(lyric?.Line).map((line) => {
					const entry = {Text: list(line?.Span).map((span) => span?.text ?? '').join('')};
					if (timed) entry.Start = (line?.startOffset || 0) * 10000;
					return entry;
				})
			};
		},

		// The tracks that sound most like the seed, when a Plex Pass server has analyzed them. Otherwise random tracks
		// from the seed's library that share its genres.
		getInstantMix: async (itemId, limit = 50) => {
			try {
				const nearest = plexItems((await container(`/library/metadata/${itemId}/nearest`, {limit})).Metadata);
				if (nearest.length) return plexItemsResult(nearest);
			} catch {
				// A server without Plex Pass refuses, so the genre mix stands in.
			}
			const seed = await plexItem(itemId).catch(() => null);
			const section = seed?.librarySectionID;
			if (section == null) return plexItemsResult([]);
			const genresOf = (item) => list(item?.Genre).map((g) => g?.id).filter((id) => id != null);
			// A track often has no genre of its own, while its album does.
			let genres = genresOf(seed);
			if (!genres.length && seed.parentRatingKey != null) genres = genresOf(await plexItem(seed.parentRatingKey).catch(() => null));
			const result = await container(`/library/sections/${section}/all`, {
				type: PLEX_TYPE_NUMBERS.Audio,
				sort: 'random',
				'album.genre': genres.length ? genres.join(',') : undefined,
				...paging(0, limit)
			});
			return plexItemsResult(plexItems(result.Metadata));
		},

		getPlaylistItems: async (playlistId, limit = 300, startIndex = 0) => {
			const result = await container(`/playlists/${playlistId}/items`, paging(startIndex, limit));
			return plexItemsResult(plexItems(result.Metadata), result.totalSize, startIndex);
		},

		// Plex moves an entry to just after another one, or to the top without one.
		movePlaylistItem: async (playlistId, playlistItemId, newIndex) => {
			const others = plexItems((await container(`/playlists/${playlistId}/items`)).Metadata)
				.filter((item) => item.PlaylistItemId !== String(playlistItemId))
				.map((item) => item.PlaylistItemId);
			return send(`/playlists/${playlistId}/items/${playlistItemId}/move`, {
				method: 'PUT',
				query: {after: newIndex > 0 ? others[newIndex - 1] : undefined}
			});
		},

		// The playlists something can be added to, which leaves out smart ones since Plex fills those itself.
		getPlaylists: async () => plexItemsResult(plexItems((await container('/playlists', {smart: 0})).Metadata)),

		// A Plex playlist holds one kind of media, which its first item decides.
		createPlaylist: async (name, itemIds = []) => {
			const firstItem = itemIds.length ? await plexItem(itemIds[0]) : null;
			let type = 'video';
			if (['artist', 'album', 'track'].includes(firstItem?.type)) type = 'audio';
			else if (firstItem?.type === 'photo') type = 'photo';
			return createdItem('/playlists', {type, title: name, smart: 0, uri: itemIds.length ? await itemsUri(itemIds) : undefined});
		},

		addToPlaylist: async (playlistId, itemIds) => send(`/playlists/${playlistId}/items`, {method: 'PUT', query: {uri: await itemsUri(itemIds)}}),

		removeFromPlaylist: async (playlistId, entryIds) => {
			for (const entry of entryIds) await send(`/playlists/${playlistId}/items/${entry}`, {method: 'DELETE'});
			return null;
		},

		// Plex files a collection under the library and type of what's in it, so one made empty is only created once its first items arrive.
		createCollection: async (name, itemIds = []) => (itemIds.length
			? createCollectionWith(name, itemIds)
			: {Id: `${NEW_COLLECTION_PREFIX}${name}`}),

		addToCollection: async (collectionId, itemIds) => {
			const pending = plexKeyOf(collectionId, NEW_COLLECTION_PREFIX);
			if (pending) return createCollectionWith(pending, itemIds);
			return send(`/library/collections/${collectionId}/items`, {method: 'PUT', query: {uri: await itemsUri(itemIds)}});
		},

		removeFromCollection: async (collectionId, itemIds) => {
			for (const id of itemIds) await send(`/library/collections/${collectionId}/items/${id}`, {method: 'DELETE'});
			return null;
		},

		// Every choice Plex has for one kind of artwork, the one in use included. The choice's own key is what picking it sends back.
		getRemoteImages: async (itemId, imageType) => {
			const artwork = ARTWORK[imageType];
			if (!artwork) return {Images: [], TotalRecordCount: 0};
			const images = list((await container(`/library/metadata/${itemId}/${artwork.list}`)).Metadata)
				.filter((image) => image && typeof image.ratingKey === 'string')
				.map((image) => ({
					Url: image.ratingKey,
					ThumbnailUrl: plexImageUrl(getBaseUrl(), itemId, 'Primary', {maxWidth: 300, tag: image.thumb}),
					ProviderName: image.provider,
					Type: imageType
				}));
			return {Images: images, TotalRecordCount: images.length, Providers: []};
		},

		downloadRemoteImage: (itemId, imageType, imageUrl) => {
			const artwork = ARTWORK[imageType];
			if (!artwork) return unsupported(`${imageType} artwork`);
			return send(`/library/metadata/${itemId}/${artwork.pick}`, {method: 'PUT', query: {url: imageUrl}});
		},

		deleteItemImage: () => unsupported('Deleting artwork'),

		// Plex keeps a file's seek previews in a BIF index and hands out the frame nearest any offset, so each preview
		// is a sheet of one, a frame interval apart, read through the file part's id.
		getTrickplayManifest: async (itemId, mediaSourceId) => {
			const target = plexPartOf(itemId);
			const {key, mediaIndex} = target || plexSourceOf(mediaSourceId || itemId);
			const item = await plexItem(key);
			const media = list(item.Media)[mediaIndex];
			const part = list(media?.Part)[target?.partIndex ?? 0];
			const aspectRatio = Number(media?.aspectRatio);
			// Plex only marks a part that has its previews built.
			if (part?.indexes !== 'sd' || !(part.duration > 0) || !(aspectRatio > 0)) return null;
			return {
				[TRICKPLAY_WIDTH]: {
					Width: TRICKPLAY_WIDTH,
					Height: Math.round(TRICKPLAY_WIDTH / aspectRatio),
					TileWidth: 1,
					TileHeight: 1,
					Interval: TRICKPLAY_INTERVAL_MS,
					ThumbnailCount: Math.ceil(part.duration / TRICKPLAY_INTERVAL_MS),
					PlexPartId: part.id
				}
			};
		},

		getServerInfo: () => ({serverUrl: getBaseUrl(), accessToken: getToken(), userId: getUserId()})
	};
	return api;
};

// Every method the app can call, with the ones Plex has no answer for refusing rather than reaching for a Jellyfin route.
export const withEveryMethod = (plexApi, methodNames) => {
	const complete = {...plexApi};
	methodNames.forEach((name) => {
		if (!complete[name]) complete[name] = () => unsupported(name);
	});
	return complete;
};
