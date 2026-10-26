// Plex metadata in the Jellyfin item shape the rest of the app reads.

// Library keys, tag ids and item ratingKeys share one number space, so the first two carry a prefix.
export const PLEX_SECTION_PREFIX = 'section-';
export const PLEX_PERSON_PREFIX = 'person-';
export const PLEX_GENRE_PREFIX = 'genre-';
export const PLEX_STUDIO_PREFIX = 'studio-';
// A movie split over several files plays one file at a time, and each file after the first is an item of its own.
const PLEX_PART_PREFIX = 'part-';

// Plex has no favorites, so a 10 rating stands in for one.
export const PLEX_FAVORITE_RATING = 10;

const ITEM_TYPES = {
	movie: 'Movie',
	show: 'Series',
	season: 'Season',
	episode: 'Episode',
	artist: 'MusicArtist',
	album: 'MusicAlbum',
	track: 'Audio',
	collection: 'BoxSet',
	playlist: 'Playlist',
	photo: 'Photo'
};

const FOLDER_TYPES = ['show', 'season', 'artist', 'album', 'collection', 'playlist'];

const COLLECTION_TYPES = {movie: 'movies', show: 'tvshows', artist: 'music', photo: 'photos'};

export const PLEX_TYPE_NUMBERS = {
	Movie: 1,
	Series: 2,
	Season: 3,
	Episode: 4,
	MusicArtist: 8,
	MusicAlbum: 9,
	Audio: 10,
	BoxSet: 18
};

const PLAYLIST_MEDIA_TYPES = {video: 'Video', audio: 'Audio', photo: 'Photo'};

const EXTRA_TYPES = {
	trailer: 'Trailer',
	deletedScene: 'DeletedScene',
	interview: 'Interview',
	behindTheScenes: 'BehindTheScenes',
	sceneOrSample: 'Scene',
	featurette: 'Featurette',
	short: 'Short'
};

const STREAM_TYPES = {1: 'Video', 2: 'Audio', 3: 'Subtitle'};

export const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => value != null && typeof value === 'object';

// Plex ends its version with the build's hash, which means nothing to a reader.
export const plexVersion = (version) => (typeof version === 'string' ? version.split('-')[0] : null);

// The item, version and file a part id points at.
export const plexPartOf = (id) => {
	const match = new RegExp(`^${PLEX_PART_PREFIX}(\\d+)-(\\d+)-(\\d+)$`).exec(String(id));
	return match ? {key: match[1], mediaIndex: Number(match[2]), partIndex: Number(match[3])} : null;
};

// A media source id is the ratingKey and the version's place among the item's Media. A bare ratingKey is the first.
export const plexSourceOf = (id) => {
	const text = String(id);
	const dash = text.lastIndexOf('-');
	if (dash < 0) return {key: text, mediaIndex: 0};
	return {key: text.substring(0, dash), mediaIndex: parseInt(text.substring(dash + 1), 10) || 0};
};

export const plexKeyOf = (id, prefix) => (typeof id === 'string' && id.startsWith(prefix) ? id.substring(prefix.length) : null);

export const plexItemsResult = (items, total, startIndex = 0) => ({
	Items: items,
	TotalRecordCount: total ?? items.length,
	StartIndex: startIndex
});

export const plexPersonToJellyfin = (person) => ({
	Id: `${PLEX_PERSON_PREFIX}${person.id}`,
	Name: person.tag,
	Type: 'Person',
	ImageTags: typeof person.thumb === 'string' ? {Primary: person.thumb} : {}
});

export const plexSectionToView = (section) => ({
	Id: `${PLEX_SECTION_PREFIX}${section.key}`,
	Name: section.title,
	Type: 'CollectionFolder',
	CollectionType: COLLECTION_TYPES[section.type] || 'mixed',
	IsFolder: true,
	ImageTags: {}
});

const tags = (value) => list(value).filter((tag) => isObject(tag) && typeof tag.tag === 'string').map((tag) => tag.tag);

// Plex people come with full image URLs, which the image URL builder passes through.
const people = (value, type) => list(value)
	.filter((person) => isObject(person) && typeof person.tag === 'string' && person.id != null)
	.map((person) => {
		const entry = {Id: `${PLEX_PERSON_PREFIX}${person.id}`, Name: person.tag, Type: type};
		if (person.role != null) entry.Role = person.role;
		if (typeof person.thumb === 'string') entry.PrimaryImageTag = person.thumb;
		return entry;
	});

const PROVIDER_NAMES = {imdb: 'Imdb', tmdb: 'Tmdb', tvdb: 'Tvdb'};

const providerIds = (guids) => {
	const ids = {};
	list(guids).forEach((guid) => {
		const pieces = isObject(guid) ? String(guid.id).split('://') : [];
		const name = pieces.length === 2 ? PROVIDER_NAMES[pieces[0]] : null;
		if (name) ids[name] = pieces[1];
	});
	return ids;
};

const parts = (media) => list(media?.Part).filter(isObject);

const date = (value) => {
	const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
	return match ? `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z` : null;
};

export const epoch = (seconds) => new Date(seconds * 1000).toISOString();

const PQ = 'smpte2084';
const HLG = 'arib-std-b67';

// The dynamic range in the names Jellyfin uses, worked out by Jellyfin's rules, since the HDR and Dolby Vision handling reads those names.
const videoRange = (stream) => {
	const lower = (key) => String(stream[key] ?? '').toLowerCase();
	const transfer = lower('colorTrc');
	const base = transfer === PQ || transfer === HLG ? 'HDR' : 'SDR';
	const hdr10Plus = stream.HDR10PlusPresent === true;
	const profile = stream.DOVIProfile;
	const compat = stream.DOVIBLCompatID;

	let range;
	if ([5, 7, 8, 10].includes(profile) && [0, 1, 2, 4, 6].includes(compat) &&
			stream.DOVIRPUPresent === true && stream.DOVIBLPresent === true) {
		let dolby;
		if (profile === 5 || (profile === 10 && compat === 0)) dolby = ['HDR', 'DOVI'];
		else if (profile === 7) dolby = ['HDR', 'DOVIWithEL'];
		else if (compat === 1) dolby = ['HDR', 'DOVIWithHDR10'];
		else if (compat === 4) dolby = ['HDR', 'DOVIWithHLG'];
		else if (compat === 2) dolby = ['SDR', 'DOVIWithSDR'];
		else dolby = [base, 'DOVIInvalid'];
		// A base layer whose colors don't match what it claims is out of spec.
		const expected = dolby[1] === 'DOVIWithHDR10' || dolby[1] === 'DOVIWithEL' ? PQ : (dolby[1] === 'DOVIWithHLG' ? HLG : null);
		if (expected && (lower('colorSpace') !== 'bt2020nc' || transfer !== expected || lower('colorPrimaries') !== 'bt2020')) {
			range = [base, 'DOVIInvalid'];
		} else if (dolby[1] === 'DOVIWithHDR10' && hdr10Plus) {
			range = ['HDR', 'DOVIWithHDR10Plus'];
		} else if (dolby[1] === 'DOVIWithEL' && hdr10Plus) {
			range = ['HDR', 'DOVIWithELHDR10Plus'];
		} else {
			range = dolby;
		}
	} else if (transfer === PQ) {
		range = ['HDR', hdr10Plus ? 'HDR10Plus' : 'HDR10'];
	} else if (transfer === HLG) {
		range = ['HDR', 'HLG'];
	} else {
		range = ['SDR', 'SDR'];
	}
	return {VideoRange: range[0], VideoRangeType: range[1]};
};

const assignDefined = (target, source) => {
	Object.keys(source).forEach((key) => {
		if (source[key] != null) target[key] = source[key];
	});
	return target;
};

// Closed captions ride inside the video stream and share its index, so they're left out.
const streams = (part) => list(part?.Stream)
	.filter((stream) => isObject(stream) && STREAM_TYPES[stream.streamType] && stream.embeddedInVideo == null)
	.map((stream) => {
		const entry = assignDefined({
			Index: stream.index ?? stream.id,
			Type: STREAM_TYPES[stream.streamType]
		}, {
			Codec: stream.codec,
			Language: stream.languageCode,
			DisplayTitle: stream.displayTitle,
			Title: stream.title
		});
		entry.IsDefault = stream.default === true;
		entry.IsForced = stream.forced === true;
		entry.IsHearingImpaired = stream.hearingImpaired === true;
		entry.IsExternal = stream.key != null;
		if (typeof stream.key === 'string') {
			entry.DeliveryUrl = stream.key;
			entry.DeliveryMethod = 'External';
			entry.SupportsExternalStream = true;
		}
		assignDefined(entry, {
			Width: stream.width,
			Height: stream.height,
			Channels: stream.channels,
			BitRate: typeof stream.bitrate === 'number' ? stream.bitrate * 1000 : null,
			Profile: stream.profile,
			RealFrameRate: typeof stream.frameRate === 'number' ? stream.frameRate : null,
			AverageFrameRate: typeof stream.frameRate === 'number' ? stream.frameRate : null,
			BitDepth: stream.bitDepth,
			Level: stream.level,
			SampleRate: stream.samplingRate,
			ChannelLayout: stream.audioChannelLayout,
			DvProfile: stream.DOVIProfile,
			DvBlSignalCompatibilityId: stream.DOVIBLCompatID
		});
		if (stream.streamType === 1) {
			entry.IsInterlaced = stream.scanType === 'interlaced';
			Object.assign(entry, videoRange(stream));
		}
		return entry;
	});

const mediaSource = (id, itemId, media, part) => {
	// A split movie's source plays one file, so it runs that file's length.
	const duration = part?.duration ?? media.duration;
	return assignDefined({Id: id, ItemId: itemId}, {
		Container: media.container,
		Bitrate: typeof media.bitrate === 'number' ? media.bitrate * 1000 : null,
		RunTimeTicks: typeof duration === 'number' ? duration * 10000 : null,
		Size: part?.size,
		Path: part?.file,
		// The part's own address, which serves the original file.
		DirectStreamUrl: part?.key,
		MediaStreams: streams(part)
	});
};

// Image tags hold the Plex image path itself, because a season or episode borrows its backdrop and logo from the show and only the path says which.
export const plexItemToJellyfin = (m) => {
	const type = m.type;
	const id = String(m.ratingKey);
	const duration = typeof m.duration === 'number' ? m.duration : null;
	const viewOffset = typeof m.viewOffset === 'number' ? m.viewOffset : null;
	const leafCount = typeof m.leafCount === 'number' ? m.leafCount : null;
	const viewedLeafCount = m.viewedLeafCount ?? 0;
	const viewCount = m.viewCount ?? 0;
	const isChild = type === 'episode' || type === 'season';
	const seriesId = String(m.grandparentRatingKey ?? m.parentRatingKey);
	// Seasons and episodes borrow the show's art. Anything else owns its own, even a collection whose art lives outside /library/metadata.
	const owns = (path) => !isChild || path.startsWith(`/library/metadata/${id}/`);

	const art = typeof m.art === 'string' ? m.art : null;
	const logo = list(m.Image).find((image) => isObject(image) && image.type === 'clearLogo' && typeof image.url === 'string')?.url || null;
	const medias = list(m.Media).filter(isObject);
	const sources = medias.map((media, index) => mediaSource(`${id}-${index}`, id, media, parts(media)[0]));
	// The most files any version has, so a split version that isn't the first still gets its other files queued.
	const partCount = medias.reduce((most, media) => Math.max(most, parts(media).length), 0);
	const ratingImage = m.ratingImage || '';
	const rating = typeof m.rating === 'number' ? m.rating : null;
	const fromTomatoes = ratingImage.startsWith('rottentomatoes');
	const isTrack = type === 'track';
	let albumArtist = null;
	let albumArtistId = null;
	if (type === 'album') {
		albumArtist = m.parentTitle;
		albumArtistId = m.parentRatingKey;
	} else if (isTrack) {
		albumArtist = m.grandparentTitle;
		albumArtistId = m.grandparentRatingKey;
	}

	const item = {
		Id: id,
		Name: m.title,
		Type: ITEM_TYPES[type] || 'Video',
		IsFolder: FOLDER_TYPES.includes(type)
	};
	if (m.titleSort != null) item.SortName = m.titleSort;
	if (type === 'movie' || type === 'episode' || type === 'clip') item.MediaType = 'Video';
	if (type === 'clip' && EXTRA_TYPES[m.subtype]) item.ExtraType = EXTRA_TYPES[m.subtype];
	if (isTrack) item.MediaType = 'Audio';
	if (type === 'playlist' && PLAYLIST_MEDIA_TYPES[m.playlistType]) item.MediaType = PLAYLIST_MEDIA_TYPES[m.playlistType];
	if (m.playlistItemID != null) item.PlaylistItemId = String(m.playlistItemID);
	// Removing a playlist only drops the list, never the media in it.
	if (type === 'playlist') item.CanDelete = true;
	if (m.summary != null) item.Overview = m.summary;
	if (m.year != null) item.ProductionYear = m.year;
	const premiere = date(m.originallyAvailableAt);
	if (premiere) item.PremiereDate = premiere;
	if (typeof m.addedAt === 'number') item.DateCreated = epoch(m.addedAt);
	if (duration != null) item.RunTimeTicks = duration * 10000;
	if (typeof m.audienceRating === 'number') item.CommunityRating = m.audienceRating;
	else if (rating != null && !fromTomatoes) item.CommunityRating = rating;
	if (rating != null && fromTomatoes) item.CriticRating = Math.round(rating * 10);
	if (m.contentRating != null) item.OfficialRating = m.contentRating;
	item.Genres = tags(m.Genre);
	if (m.studio != null) item.Studios = [{Name: m.studio}];
	if (m.tagline != null) item.Taglines = [m.tagline];
	item.People = [...people(m.Role, 'Actor'), ...people(m.Director, 'Director'), ...people(m.Writer, 'Writer')];
	item.ProviderIds = providerIds(m.Guid);
	if (Array.isArray(m.Chapter)) {
		item.Chapters = m.Chapter.filter(isObject).map((chapter) => {
			// Some files put their first chapter a moment before the start.
			const entry = {StartPositionTicks: Math.max(0, chapter.startTimeOffset || 0) * 10000};
			if (typeof chapter.tag === 'string') entry.Name = chapter.tag;
			if (typeof chapter.thumb === 'string') entry.ImageTag = chapter.thumb;
			return entry;
		});
	}
	// An extra's index is only its place among the extras.
	if (m.index != null && type !== 'clip') item.IndexNumber = m.index;
	if (m.parentIndex != null) item.ParentIndexNumber = m.parentIndex;
	if (m.parentRatingKey != null) item.ParentId = String(m.parentRatingKey);
	if (isChild) {
		item.SeriesId = seriesId;
		item.SeriesName = m.grandparentTitle ?? m.parentTitle;
		const seriesThumb = m.grandparentThumb ?? m.parentThumb;
		if (typeof seriesThumb === 'string') item.SeriesPrimaryImageTag = seriesThumb;
	}
	if (type === 'episode') {
		item.SeasonId = String(m.parentRatingKey);
		item.SeasonName = m.parentTitle;
	}
	if (typeof albumArtist === 'string') {
		item.AlbumArtist = albumArtist;
		item.AlbumArtists = [{Name: albumArtist, Id: String(albumArtistId)}];
		// A track only names its own artist, in originalTitle, when it differs from the album's.
		item.Artists = [isTrack ? m.originalTitle ?? albumArtist : albumArtist];
	}
	if (isTrack) {
		item.Album = m.parentTitle;
		item.AlbumId = String(m.parentRatingKey);
		if (m.parentThumb != null) item.AlbumPrimaryImageTag = m.parentThumb;
	}
	if ((type === 'show' || type === 'collection') && m.childCount != null) item.ChildCount = m.childCount;
	if ((type === 'season' || type === 'playlist') && leafCount != null) item.ChildCount = leafCount;
	if (leafCount != null) item.RecursiveItemCount = leafCount;
	item.ImageTags = {};
	// A playlist has no poster, only Plex's tiles of what's in it.
	const thumb = m.thumb ?? m.composite;
	if (typeof thumb === 'string') item.ImageTags.Primary = thumb;
	if (logo && owns(logo)) item.ImageTags.Logo = logo;
	item.BackdropImageTags = art && owns(art) ? [art] : [];
	if (art && !owns(art)) {
		item.ParentBackdropItemId = seriesId;
		item.ParentBackdropImageTags = [art];
	}
	if (logo && !owns(logo)) {
		item.ParentLogoItemId = seriesId;
		item.ParentLogoImageTag = logo;
	}
	const userData = {
		PlaybackPositionTicks: (viewOffset ?? 0) * 10000,
		PlayCount: viewCount,
		IsFavorite: m.userRating === PLEX_FAVORITE_RATING,
		Played: leafCount != null ? leafCount > 0 && viewedLeafCount >= leafCount : viewCount > 0
	};
	// Plex doesn't count what's been watched in a playlist.
	if (leafCount != null && type !== 'playlist') userData.UnplayedItemCount = leafCount - viewedLeafCount;
	if (viewOffset != null && duration > 0) userData.PlayedPercentage = viewOffset * 100 / duration;
	if (typeof m.lastViewedAt === 'number') userData.LastPlayedDate = epoch(m.lastViewedAt);
	item.UserData = userData;
	// An empty list reads as unplayable, so the key stays out without media.
	if (sources.length) {
		item.MediaSources = sources;
		item.MediaStreams = sources[0].MediaStreams;
	}
	if (partCount > 1) item.PartCount = partCount;
	return item;
};

// One file of a movie split over several, as an item that plays just that file. It has no parts of its own, so it never queues the others again.
export const plexPartItem = (m, mediaIndex, partIndex) => {
	const media = list(m.Media).filter(isObject)[mediaIndex];
	const part = parts(media)[partIndex];
	if (!part) throw Object.assign(new Error(`No Plex file ${partIndex} in version ${mediaIndex} of ${m.ratingKey}`), {status: 404});
	const item = plexItemToJellyfin(m);
	delete item.PartCount;
	const id = `${PLEX_PART_PREFIX}${item.Id}-${mediaIndex}-${partIndex}`;
	const source = mediaSource(id, id, media, part);
	// A server on Windows names its files with backslashes.
	const file = String(part.file || item.Name).split(/[\\/]/).pop();
	const result = {
		...item,
		Id: id,
		Name: file.includes('.') ? file.substring(0, file.lastIndexOf('.')) : file,
		MediaSources: [source],
		MediaStreams: source.MediaStreams,
		UserData: {}
	};
	if (source.RunTimeTicks != null) result.RunTimeTicks = source.RunTimeTicks;
	return result;
};

export const plexAdditionalParts = (m, mediaIndex) => {
	const count = parts(list(m.Media).filter(isObject)[mediaIndex]).length;
	const result = [];
	for (let p = 1; p < count; p++) result.push(plexPartItem(m, mediaIndex, p));
	return result;
};

export const plexItems = (metadata) => list(metadata).filter(isObject).map(plexItemToJellyfin);
