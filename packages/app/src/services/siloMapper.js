// Silo's catalog in the Jellyfin item shape the rest of the app reads.

import {languageName} from '../utils/languageNames';
import {registerSiloImage, siloGenreId, siloIdOf, siloImageFor, siloSeasonId, siloStudioId, siloTypeOfId} from '../utils/siloUrls';

// The Silo item each mapped one came from, for the fields the Jellyfin shape has no room for.
export const SILO_ORIGINAL = '_silo';
// Which Silo track each stream index stands for, since Silo numbers video, audio and subtitles each on its own.
const SILO_TRACKS = '_siloTracks';

const ITEM_TYPES = {
	movie: {type: 'Movie', mediaType: 'Video', isFolder: false},
	series: {type: 'Series', mediaType: null, isFolder: true},
	season: {type: 'Season', mediaType: null, isFolder: true},
	episode: {type: 'Episode', mediaType: 'Video', isFolder: false}
};

// Movie and series libraries, and mixed ones, which Jellyfin leaves without a type. Books and audiobooks are left out.
const COLLECTION_TYPES = {movies: 'movies', series: 'tvshows', mixed: null};

const TICKS_PER_SECOND = 10000000;
const secondsToTicks = (seconds) => Math.round(seconds * TICKS_PER_SECOND);

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const maps = (value) => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : []);
const strings = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
const int = (value) => (typeof value === 'number' ? Math.trunc(value) : null);
const kbps = (value) => (typeof value === 'number' && value > 0 ? Math.round(value * 1000) : null);
const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined));

const calendarDate = (value) => {
	const raw = text(value);
	if (!raw) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
	return match ? `${match[1]}-${match[2]}-${match[3]}T00:00:00.0000000Z` : null;
};

const timestamp = (value) => {
	const at = typeof value === 'string' ? Date.parse(value) : NaN;
	return Number.isNaN(at) ? null : new Date(at).toISOString();
};

// Cards carry no sort title, so they get the one Silo derives, which files "The Hobbit" under H.
export const siloDefaultSortTitle = (title) => {
	const match = /^(\S+)\s+(.+)$/.exec(String(title || '').trim());
	if (!match) return null;
	const article = {the: 'The', a: 'A', an: 'An'}[match[1].toLowerCase()];
	return article ? `${match[2]}, ${article}` : null;
};

// Networks first, then studios, the way Emby lists a series' networks among its studios.
const studioNames = (item) => {
	const seen = new Set();
	return [...strings(item.networks), ...strings(item.studios)].filter((name) => {
		const key = name.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const seriesStatus = (value) => {
	const status = text(value)?.toLowerCase();
	if (!status) return null;
	if (status === 'ended' || status.startsWith('cancel')) return 'Ended';
	if (['returning', 'continuing', 'production', 'airing'].some((word) => status.includes(word)) || status === 'planned' || status === 'pilot') return 'Continuing';
	return null;
};

const criticRating = (ratings) => {
	const rating = maps(ratings).find((r) => ['rt_critic', 'rottentomatoes'].includes(String(r.source || '').toLowerCase()) && typeof r.score === 'number');
	return rating ? Math.round(rating.score) : null;
};

const runTimeTicks = (item) => {
	const duration = maps(item.versions)[0]?.duration;
	if (typeof duration === 'number' && duration > 0) return secondsToTicks(duration);
	return typeof item.runtime === 'number' && item.runtime > 0 ? secondsToTicks(item.runtime * 60) : null;
};

// Silo dates each file, not the item, so the earliest file is when the item arrived.
const dateAdded = (versions) => {
	const times = maps(versions).map((v) => (typeof v.added_at === 'string' ? Date.parse(v.added_at) : NaN)).filter((t) => !Number.isNaN(t));
	return times.length ? new Date(Math.min(...times)).toISOString() : null;
};

const videoUrl = (site, key) => {
	const id = text(key);
	if (!id) return null;
	const encoded = encodeURIComponent(id);
	switch (String(site || '').toLowerCase()) {
		case 'youtube': return `https://www.youtube.com/watch?v=${encoded}`;
		case 'vimeo': return `https://vimeo.com/${encoded}`;
		default: return null;
	}
};

const isTrailerKind = (kind) => kind === 'trailer' || kind === 'teaser';

const remoteTrailers = (videos) => {
	const trailers = [];
	const others = [];
	maps(videos).forEach((video) => {
		const url = videoUrl(video.site, video.site_key);
		if (!url) return;
		const entry = {Url: url};
		if (text(video.name)) entry.Name = text(video.name);
		(isTrailerKind(video.kind) ? trailers : others).push(entry);
	});
	return [...trailers, ...others];
};

// A series slot only takes artwork borrowed from an episode while the series has none of its own.
const registerIfMissing = (baseUrl, seriesId, type, url) => {
	if (!siloImageFor(baseUrl, seriesId, type)) registerSiloImage(baseUrl, seriesId, type, url);
};

const imageFields = (baseUrl, id, type, item) => {
	const isEpisode = type === 'episode';
	const seriesId = siloIdOf(item.series_id);
	let primary = isEpisode ? text(item.still_url) : text(item.poster_url);
	if (isEpisode) {
		const poster = text(item.poster_url);
		const seriesPoster = text(item.series_poster_url);
		if (seriesId && seriesPoster) registerIfMissing(baseUrl, seriesId, 'Primary', seriesPoster);
		// A poster that isn't the episode's still is the series' or the season's, never the episode's.
		if (!primary && poster) {
			if (item.poster_is_episode_still !== false) primary = poster;
			else if (seriesId) registerIfMissing(baseUrl, seriesId, 'Primary', poster);
		}
	}
	let backdrops = strings(item.backdrop_urls);
	if (!backdrops.length && text(item.backdrop_url)) backdrops = [text(item.backdrop_url)];
	if (isEpisode && item.backdrop_is_episode_still !== true) {
		if (seriesId && backdrops.length) registerIfMissing(baseUrl, seriesId, 'Backdrop', backdrops[0]);
		backdrops = [];
	}
	const tags = {};
	const keep = (slot, url) => {
		const tag = registerSiloImage(baseUrl, id, slot, url);
		if (tag) tags[slot] = tag;
	};
	keep('Primary', primary);
	keep('Logo', item.logo_url);
	if (type === 'movie' || type === 'series') {
		// Without a thumb of its own, the first backdrop stands in for the landscape cards.
		keep('Thumb', text(item.thumb_url) || backdrops[0]);
		keep('Banner', item.banner_url);
	}
	const fields = {
		ImageTags: tags,
		BackdropImageTags: backdrops.map((url, i) => registerSiloImage(baseUrl, id, 'Backdrop', url, i)).filter(Boolean)
	};
	if (tags.Primary) fields.PrimaryImageAspectRatio = isEpisode ? 16 / 9 : 2 / 3;
	return fields;
};

// The series artwork Jellyfin repeats on its seasons and episodes, as far as the series has been seen.
const parentArtwork = (baseUrl, seriesId) => {
	const fields = {};
	const primary = siloImageFor(baseUrl, seriesId, 'Primary');
	const logo = siloImageFor(baseUrl, seriesId, 'Logo');
	const backdrops = [];
	let backdrop = siloImageFor(baseUrl, seriesId, 'Backdrop', 0);
	while (backdrop) {
		backdrops.push(backdrop);
		backdrop = siloImageFor(baseUrl, seriesId, 'Backdrop', backdrops.length);
	}
	// A series' own thumb only comes with its detail, so its backdrop stands in and an episode card doesn't change once the series is opened.
	const thumb = backdrops[0] || siloImageFor(baseUrl, seriesId, 'Thumb');
	if (primary) fields.SeriesPrimaryImageTag = primary;
	if (logo) Object.assign(fields, {ParentLogoItemId: seriesId, ParentLogoImageTag: logo});
	if (thumb) Object.assign(fields, {ParentThumbItemId: seriesId, ParentThumbImageTag: thumb, SeriesThumbImageTag: thumb});
	if (backdrops.length) Object.assign(fields, {ParentBackdropItemId: seriesId, ParentBackdropImageTags: backdrops});
	return fields;
};

const seriesFields = (baseUrl, type, item, series) => {
	if (type === 'series') return typeof item.season_count === 'number' ? {ChildCount: int(item.season_count)} : {};
	if (type !== 'season' && type !== 'episode') return {};
	const seriesId = siloIdOf(item.series_id) || series?.id || null;
	const seriesName = text(item.series_title) || series?.name || null;
	const fields = {};
	if (type === 'season') {
		const number = int(item.season_number);
		if (number != null) fields.IndexNumber = number;
		if (typeof item.episode_count === 'number') fields.ChildCount = int(item.episode_count);
		if (seriesId) Object.assign(fields, {SeriesId: seriesId, ParentId: seriesId});
	} else {
		const season = int(item.season_number);
		const number = int(item.episode_number);
		if (number != null) fields.IndexNumber = number;
		if (season != null) Object.assign(fields, {ParentIndexNumber: season, SeasonName: season === 0 ? 'Specials' : `Season ${season}`});
		const seasonId = seriesId && season != null ? siloSeasonId(seriesId, season) : null;
		if (seasonId) Object.assign(fields, {SeasonId: seasonId, ParentId: seasonId});
		if (seriesId) fields.SeriesId = seriesId;
	}
	if (seriesId) {
		if (seriesName) fields.SeriesName = seriesName;
		Object.assign(fields, parentArtwork(baseUrl, seriesId));
	}
	return fields;
};

const playedPercentage = (position, duration) => (position > 0 && typeof duration === 'number' && duration > 0
	? Math.min(100, position / duration * 100)
	: null);

// Silo spreads what Jellyfin calls user data over user_state, user_data, the card itself and the detail's own rating.
// Stars are out of 5, and Jellyfin's rating out of 10.
const userData = (folder, item) => {
	const state = item.user_state || {};
	const data = item.user_data || {};
	const played = state.played === true || data.played === true;
	const position = data.position_seconds ?? item.position_seconds;
	const seconds = typeof position === 'number' && position > 0 && !played ? position : 0;
	const lastPlayed = timestamp(item.progress_updated_at) || timestamp(item.sort_metrics?.viewed_at);
	const result = {
		PlaybackPositionTicks: secondsToTicks(seconds),
		PlayCount: played ? 1 : 0,
		IsFavorite: state.is_favorite === true,
		Played: played
	};
	const percent = playedPercentage(seconds, data.duration_seconds ?? item.duration_seconds);
	if (percent != null) result.PlayedPercentage = percent;
	if (folder && typeof data.unplayed_count === 'number') result.UnplayedItemCount = int(data.unplayed_count);
	if (lastPlayed) result.LastPlayedDate = lastPlayed;
	if (typeof item.user_rating === 'number' && item.user_rating > 0) result.Rating = item.user_rating * 2;
	return result;
};

const CREW_KINDS = {
	Creator: ['creator'],
	Director: ['director', 'co-director'],
	Writer: ['writer', 'screenplay', 'story', 'teleplay', 'novel', 'author', 'characters'],
	Producer: ['producer', 'executive producer', 'co-producer', 'co-executive producer', 'associate producer'],
	Composer: ['composer', 'original music composer', 'music'],
	Editor: ['editor']
};
const crewKind = (job) => Object.keys(CREW_KINDS).find((kind) => CREW_KINDS[kind].includes(job.toLowerCase())) || null;

// The cast in billing order, then the crew by kind. Crew jobs that fit no kind Jellyfin names are left out.
const people = (baseUrl, item) => {
	const result = [];
	const seen = new Set();
	const add = (credit, kind, role) => {
		const name = text(credit.name);
		if (!name) return;
		const id = siloIdOf(credit.person_id);
		const key = `${id || name}|${kind}`;
		if (seen.has(key)) return;
		seen.add(key);
		const person = {Name: name, Type: kind};
		if (id) person.Id = id;
		if (role) person.Role = role;
		const tag = id ? registerSiloImage(baseUrl, id, 'Primary', credit.photo_url) : null;
		if (tag) person.PrimaryImageTag = tag;
		result.push(person);
	};
	const order = (credit) => (typeof credit.order === 'number' ? credit.order : Infinity);
	maps(item.cast)
		.map((credit, index) => ({credit, index}))
		.sort((a, b) => (order(a.credit) - order(b.credit)) || (a.index - b.index))
		.forEach(({credit}) => add(credit, 'Actor', text(credit.character)));
	const crew = maps(item.crew);
	Object.keys(CREW_KINDS).forEach((kind) => crew.forEach((credit) => {
		const job = text(credit.job);
		if (job && crewKind(job) === kind) add(credit, kind, job.toLowerCase() === kind.toLowerCase() ? null : job);
	}));
	return result;
};

const RANGE_TYPES = {
	sdr: 'SDR', hdr10: 'HDR10', hdr10plus: 'HDR10Plus', hlg: 'HLG', dovi: 'DOVI', dolbyvision: 'DOVI', doviwithhdr10: 'DOVIWithHDR10',
	doviwithhdr10plus: 'DOVIWithHDR10Plus', doviwithhlg: 'DOVIWithHLG', doviwithsdr: 'DOVIWithSDR', doviwithel: 'DOVIWithEL',
	doviwithelhdr10plus: 'DOVIWithELHDR10Plus', doviinvalid: 'DOVIInvalid'
};

// Silo usually names the range. Without it, the range comes from Dolby Vision's compatibility, then HDR10+, then the transfer.
const derivedRangeType = (track) => {
	const dolbyVision = typeof track.dv_profile === 'number' || String(track.dolby_vision || 'none').toLowerCase() !== 'none';
	const hdr10Plus = track.hdr10_plus === true;
	if (dolbyVision) {
		switch (int(track.dv_bl_compat_id)) {
			case 1: case 6: return hdr10Plus ? 'DOVIWithHDR10Plus' : 'DOVIWithHDR10';
			case 2: return 'DOVIWithSDR';
			case 4: return 'DOVIWithHLG';
			default: return 'DOVI';
		}
	}
	if (hdr10Plus) return 'HDR10Plus';
	switch (String(track.color_transfer || '').toLowerCase()) {
		case 'smpte2084': return 'HDR10';
		case 'arib-std-b67': return 'HLG';
		default: return 'SDR';
	}
};

const videoRange = (track) => {
	const said = text(track.video_range_type);
	const type = said ? (RANGE_TYPES[said.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '')] || said) : derivedRangeType(track);
	return {range: text(track.video_range)?.toUpperCase() || (type === 'SDR' ? 'SDR' : 'HDR'), type};
};

const resolutionLabel = (width, height, interlaced) => {
	if (!width || !height) return null;
	const s = interlaced ? 'i' : 'p';
	if (width >= 7600 || height >= 4300) return '8K';
	if (width >= 3800 || height >= 2000) return '4K';
	if (width >= 2500 || height >= 1400) return `1440${s}`;
	if (width >= 1800 || height >= 1000) return `1080${s}`;
	if (width >= 1200 || height >= 700) return `720${s}`;
	if (width >= 600 || height >= 400) return `480${s}`;
	return 'SD';
};

const videoTitle = (stream) => [
	resolutionLabel(stream.Width, stream.Height, stream.IsInterlaced),
	stream.VideoRange === 'HDR' ? stream.VideoRangeType || 'HDR' : null,
	stream.Codec ? stream.Codec.toUpperCase() : null
].filter(Boolean).join(' ');

const frameRate = (value) => {
	if (typeof value === 'number') return value > 0 ? value : null;
	if (typeof value !== 'string') return null;
	const [n, d] = value.split('/').map(Number);
	if (value.includes('/')) return Number.isFinite(n) && d > 0 ? n / d : null;
	return n > 0 ? n : null;
};

const channelLayout = (layout, channels) => {
	if (layout) {
		const bare = layout.replace(/\(.*\)/g, '').trim();
		return bare ? bare[0].toUpperCase() + bare.substring(1) : null;
	}
	return {1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1'}[channels] || null;
};

const IMAGE_SUBTITLES = ['hdmv_pgs_subtitle', 'pgssub', 'pgs', 'dvd_subtitle', 'dvdsub', 'vobsub', 'dvb_subtitle', 'dvbsub', 'xsub'];
const subtitleCodecLabel = (codec) => (codec ? {hdmv_pgs_subtitle: 'PGSSUB', dvd_subtitle: 'DVDSUB', dvb_subtitle: 'DVBSUB'}[codec] || codec.toUpperCase() : null);

const videoStream = (track, index, first, fileBitrate) => {
	const range = videoRange(track);
	const rate = frameRate(track.frame_rate);
	const stream = compact({
		Type: 'Video', Index: index, Codec: text(track.codec), Profile: text(track.profile),
		Level: typeof track.level === 'number' ? track.level : null, Width: int(track.width), Height: int(track.height),
		AspectRatio: text(track.aspect_ratio), IsInterlaced: track.interlaced === true, RealFrameRate: rate, AverageFrameRate: rate,
		BitDepth: int(track.bit_depth), PixelFormat: text(track.pixel_format), ColorTransfer: text(track.color_transfer),
		ColorPrimaries: text(track.color_primaries), ColorSpace: text(track.color_space), VideoRange: range.range, VideoRangeType: range.type,
		DvProfile: int(track.dv_profile), DvLevel: int(track.dv_level), DvBlSignalCompatibilityId: int(track.dv_bl_compat_id),
		BitRate: kbps(track.bitrate) ?? fileBitrate, Title: text(track.embedded_title), IsDefault: first, IsExternal: false
	});
	stream.DisplayTitle = videoTitle(stream);
	return stream;
};

const audioStream = (track, index, isDefault) => {
	const channels = int(track.channels);
	const layout = channelLayout(text(track.layout), channels);
	const language = text(track.language);
	const codec = text(track.codec);
	return compact({
		Type: 'Audio', Index: index, Codec: codec, Profile: text(track.profile), Language: language, Title: text(track.embedded_title),
		DisplayTitle: [languageName(language), codec?.toUpperCase(), layout, isDefault ? '(Default)' : null].filter(Boolean).join(' '),
		ChannelLayout: layout, Channels: channels, BitRate: kbps(track.bitrate), SampleRate: int(track.sample_rate), BitDepth: int(track.bit_depth),
		IsDefault: isDefault, IsExternal: false
	});
};

const subtitleStream = (track, index) => {
	const language = text(track.language);
	const codec = text(track.codec);
	const title = text(track.embedded_title);
	const forced = track.forced === true;
	const hearingImpaired = track.hearing_impaired === true;
	const isDefault = track.default === true;
	const isText = !codec || !IMAGE_SUBTITLES.includes(codec);
	const name = language ? languageName(language) : null;
	const titleSays = title?.toLowerCase() || '';
	const details = [
		// A title that only repeats the language adds nothing.
		title && (!name || !titleSays.includes(name.toLowerCase())) ? title : null,
		forced && !titleSays.includes('forced') ? 'Forced' : null,
		hearingImpaired && !titleSays.includes('sdh') && !titleSays.includes('cc') ? 'SDH' : null,
		isDefault ? 'Default' : null,
		subtitleCodecLabel(codec)
	].filter(Boolean).join(' ');
	return compact({
		Type: 'Subtitle', Index: index, Codec: codec, Language: language, Title: title,
		DisplayTitle: name ? (details ? `${name} (${details})` : name) : details,
		IsForced: forced, IsHearingImpaired: hearingImpaired, IsDefault: isDefault, IsExternal: track.external === true,
		IsTextSubtitleStream: isText, SupportsExternalStream: isText
	});
};

const sourceName = (version, video) => {
	const fileName = text(version.file_name);
	if (fileName) {
		const dot = fileName.lastIndexOf('.');
		return dot > 0 ? fileName.substring(0, dot) : fileName;
	}
	return [
		text(version.edition_raw) || text(version.edition_key),
		text(version.resolution),
		text(version.codec_video)?.toUpperCase(),
		version.hdr === true ? (video ? videoRange(video).type : 'HDR') : null
	].filter(Boolean).join(' ');
};

const defaultAudioOrdinal = (version, audios) => {
	if (!audios.length) return null;
	const effective = version.effective_audio_track_index;
	if (Number.isInteger(effective) && effective >= 0 && effective < audios.length) return effective;
	const flagged = audios.findIndex((a) => a.default === true);
	return flagged >= 0 ? flagged : 0;
};

// One file version as a media source. Subtitles keep the container index Silo gives them, and video then audio take
// the lowest indices left, so every stream shares one index space the way Jellyfin's do.
const siloVersionToMediaSource = (version, itemId) => {
	const fileId = siloIdOf(version.file_id);
	if (!fileId) return null;
	const videos = maps(version.video_tracks);
	const audios = maps(version.audio_tracks);
	const subtitles = maps(version.subtitle_tracks);
	const used = new Set();
	const subtitleIndex = subtitles.map((s) => {
		if (!Number.isInteger(s.index) || s.index < 0 || used.has(s.index)) return null;
		used.add(s.index);
		return s.index;
	});
	let next = 0;
	const nextFree = () => {
		while (used.has(next)) next++;
		used.add(next);
		return next;
	};
	const fileBitrate = kbps(version.bitrate);
	const defaultAudio = defaultAudioOrdinal(version, audios);
	const defaultSubtitle = subtitles.findIndex((s) => s.default === true);
	const streams = [];
	const tracks = [];
	const add = (stream, kind, ordinal, containerIndex) => {
		streams.push(stream);
		tracks.push(compact({Index: stream.Index, Kind: kind, Ordinal: ordinal, ContainerIndex: containerIndex}));
	};
	videos.forEach((track, i) => add(videoStream(track, nextFree(), i === 0, fileBitrate), 'video', i));
	let defaultAudioIndex = null;
	audios.forEach((track, i) => {
		const index = nextFree();
		if (i === defaultAudio) defaultAudioIndex = index;
		add(audioStream(track, index, i === defaultAudio), 'audio', i);
	});
	let defaultSubtitleIndex = null;
	subtitles.forEach((track, i) => {
		const index = subtitleIndex[i] ?? nextFree();
		if (i === defaultSubtitle) defaultSubtitleIndex = index;
		add(subtitleStream(track, index), 'subtitle', i, subtitleIndex[i]);
	});
	streams.sort((a, b) => a.Index - b.Index);
	const duration = version.duration ?? version.duration_seconds;
	return compact({
		Id: fileId, ItemId: itemId, Name: sourceName(version, videos[0]), Protocol: 'File', Type: 'Default',
		Container: text(version.container), Path: text(version.file_path), Size: int(version.file_size), Bitrate: fileBitrate,
		RunTimeTicks: typeof duration === 'number' && duration > 0 ? secondsToTicks(duration) : null,
		IsRemote: false,
		// Silo decides how a file plays when playback starts, so every way is left open here.
		SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: true,
		DefaultAudioStreamIndex: defaultAudioIndex, DefaultSubtitleStreamIndex: defaultSubtitleIndex,
		MediaStreams: streams, [SILO_TRACKS]: tracks, [SILO_ORIGINAL]: version
	});
};

const nominalHeight = (resolution) => {
	const r = typeof resolution === 'string' ? resolution.trim().toLowerCase() : '';
	if (r === '4k' || r === 'uhd') return 2160;
	if (r === '8k') return 4320;
	const match = /^(\d{3,4})[pi]?$/.exec(r);
	return match ? Number(match[1]) : null;
};

// A season list's light file, with enough for an episode card's quality badges. Its track map is empty, so playback
// loads the full version before picking tracks.
const siloFileToMediaSource = (file, itemId) => {
	const fileId = siloIdOf(file.file_id);
	if (!fileId) return null;
	const height = nominalHeight(file.resolution);
	const hdr = file.hdr === true;
	const video = compact({
		Type: 'Video', Index: 0, Codec: text(file.codec_video), Width: height ? Math.round(height * 16 / 9) : null, Height: height,
		VideoRange: hdr ? 'HDR' : 'SDR', VideoRangeType: hdr ? null : 'SDR', IsDefault: true
	});
	video.DisplayTitle = videoTitle(video);
	const streams = [video];
	if (typeof file.audio_channels === 'number') streams.push({Type: 'Audio', Index: 1, Channels: int(file.audio_channels), IsDefault: true});
	return compact({
		Id: fileId, ItemId: itemId, Name: sourceName(file, null), Protocol: 'File', Type: 'Default', Container: text(file.container),
		Size: int(file.file_size), IsRemote: false, SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: true,
		MediaStreams: streams, [SILO_TRACKS]: [], [SILO_ORIGINAL]: file
	});
};

// The item's files, default first, the way Jellyfin lists them and the app plays them.
export const siloMediaSources = (item, itemId) => {
	const versions = maps(item.versions);
	const sources = (versions.length
		? versions.map((v) => siloVersionToMediaSource(v, itemId))
		: maps(item.files).map((f) => siloFileToMediaSource(f, itemId))).filter(Boolean);
	const defaultFileId = siloIdOf(maps(item.playback_variants)[0]?.default_file_id);
	const at = defaultFileId ? sources.findIndex((s) => s.Id === defaultFileId) : -1;
	if (at > 0) sources.unshift(sources.splice(at, 1)[0]);
	sources.forEach((source, i) => { source.Type = i === 0 ? 'Default' : 'Grouping'; });
	return sources;
};

export const siloTrackForStreamIndex = (source, index) => {
	const entry = (source?.[SILO_TRACKS] || []).find((t) => t.Index === index);
	return entry ? {kind: entry.Kind, ordinal: entry.Ordinal, containerIndex: entry.ContainerIndex ?? null} : null;
};

export const siloStreamIndexForTrack = (source, kind, ordinal) => (source?.[SILO_TRACKS] || []).find((t) => t.Kind === kind && t.Ordinal === ordinal)?.Index ?? null;

// A Silo catalog item, as a list entry or a detail. Season and episode list entries carry no type and no series, which
// type and series fill in. Anything that isn't a movie, series, season or episode comes back null and is dropped.
export const siloItemToJellyfin = (item, {baseUrl, type, series} = {}) => {
	if (!item || typeof item !== 'object') return null;
	const id = siloIdOf(item.content_id ?? item.id);
	if (!id) return null;
	const siloType = String(item.type || type || siloTypeOfId(id) || '').toLowerCase();
	const kind = ITEM_TYPES[siloType];
	if (!kind) return null;
	const name = text(item.title) || '';
	const premiere = calendarDate(item.release_date ?? item.first_air_date ?? item.air_date);
	const year = int(item.year) ?? (premiere ? Number(premiere.substring(0, 4)) : null);
	const genres = strings(item.genres);
	const status = seriesStatus(item.show_status);
	const tagline = text(item.tagline);
	const dto = {
		Id: id,
		Name: name,
		SortName: text(item.sort_title) || siloDefaultSortTitle(name) || name,
		Type: kind.type,
		IsFolder: kind.isFolder,
		Taglines: tagline ? [tagline] : [],
		RemoteTrailers: remoteTrailers(item.videos),
		Genres: genres,
		GenreItems: genres.map((g) => ({Name: g, Id: siloGenreId(g)})),
		Studios: studioNames(item).map((s) => ({Name: s, Id: siloStudioId(s)})),
		ProviderIds: compact({Imdb: text(item.imdb_id), Tmdb: siloIdOf(item.tmdb_id), Tvdb: siloIdOf(item.tvdb_id)}),
		...imageFields(baseUrl, id, siloType, item),
		...seriesFields(baseUrl, siloType, item, series),
		UserData: userData(kind.isFolder, item),
		People: people(baseUrl, item),
		[SILO_ORIGINAL]: item,
		...compact({
			MediaType: kind.mediaType,
			OriginalTitle: text(item.original_title),
			Overview: text(item.overview),
			ProductionYear: year,
			PremiereDate: premiere,
			Status: status,
			EndDate: status === 'Ended' ? calendarDate(item.last_air_date) : null,
			OfficialRating: text(item.content_rating),
			CommunityRating: typeof item.rating_tmdb === 'number' && item.rating_tmdb > 0 ? Math.round(item.rating_tmdb * 10) / 10 : null,
			CriticRating: criticRating(item.ratings),
			RunTimeTicks: runTimeTicks(item),
			DateCreated: dateAdded(item.versions)
		})
	};
	if (Array.isArray(item.extras)) {
		const extras = maps(item.extras);
		dto.LocalTrailerCount = extras.filter((e) => isTrailerKind(e.kind)).length;
		dto.SpecialFeatureCount = extras.length - dto.LocalTrailerCount;
	}
	if (!kind.isFolder) {
		const sources = siloMediaSources(item, id);
		if (sources.length) {
			dto.MediaSources = sources;
			dto.MediaStreams = sources[0].MediaStreams;
		}
	}
	return dto;
};

// A library as Jellyfin's view of it. Silo's book and audiobook libraries aren't supported, so they come back null.
const siloLibraryToView = (library, baseUrl) => {
	const id = siloIdOf(library?.id);
	const type = String(library?.type || '').trim().toLowerCase();
	if (!id || !Object.prototype.hasOwnProperty.call(COLLECTION_TYPES, type)) return null;
	const name = text(library.name) || '';
	const view = {
		Id: id,
		Name: name,
		SortName: name,
		Type: 'CollectionFolder',
		IsFolder: true,
		ImageTags: {},
		BackdropImageTags: [],
		UserData: {PlaybackPositionTicks: 0, IsFavorite: false, Played: false},
		[SILO_ORIGINAL]: library
	};
	if (COLLECTION_TYPES[type]) view.CollectionType = COLLECTION_TYPES[type];
	const poster = registerSiloImage(baseUrl, id, 'Primary', library.poster_url);
	if (poster) view.ImageTags.Primary = poster;
	return view;
};

// Libraries in the order the admin set, then the order Silo sent them.
export const siloLibrariesToViews = (libraries, baseUrl) => maps(libraries)
	.map((library, index) => ({index, order: int(library.sort_order), view: siloLibraryToView(library, baseUrl)}))
	.filter((entry) => entry.view)
	.sort((a, b) => {
		if (a.order != null && b.order != null && a.order !== b.order) return a.order - b.order;
		if (a.order == null && b.order != null) return 1;
		if (a.order != null && b.order == null) return -1;
		return a.index - b.index;
	})
	.map((entry) => entry.view);

// Silo names genres and studios but gives them no id or artwork, so their cards fall back to their titles' artwork.
export const siloNamedItem = (name, studio) => ({
	Id: studio ? siloStudioId(name) : siloGenreId(name),
	Name: name,
	SortName: name,
	Type: studio ? 'Studio' : 'Genre',
	IsFolder: true,
	ImageTags: {},
	BackdropImageTags: []
});

export const siloPersonToJellyfin = (person, baseUrl) => {
	const id = siloIdOf(person?.id) || '';
	const name = text(person?.name) || '';
	const photo = id ? registerSiloImage(baseUrl, id, 'Primary', person?.photo_url) : null;
	const birthplace = text(person?.birthplace);
	const homepage = text(person?.homepage);
	return {
		Id: id,
		Name: name,
		SortName: name,
		Type: 'Person',
		IsFolder: false,
		ProductionLocations: birthplace ? [birthplace] : [],
		ProviderIds: compact({Imdb: text(person?.imdb_id), Tmdb: text(person?.tmdb_id), Tvdb: text(person?.tvdb_id)}),
		ImageTags: photo ? {Primary: photo} : {},
		BackdropImageTags: [],
		...compact({
			Overview: text(person?.bio),
			PremiereDate: calendarDate(person?.birth_date),
			EndDate: calendarDate(person?.death_date),
			ExternalUrls: homepage ? [{Name: 'Website', Url: homepage}] : null
		})
	};
};

// A household profile as one of the app's users. Only an admin account's primary profile is an admin here.
export const siloProfileToUser = (profile, account) => {
	const name = text(profile?.name) || text(account?.username) || '';
	const admin = account?.role === 'admin' && profile?.is_primary === true;
	return {
		Id: siloIdOf(profile?.id),
		Name: name,
		HasPassword: profile?.has_pin === true,
		HasConfiguredPassword: true,
		SiloAccountId: siloIdOf(account?.id),
		Policy: {
			IsAdministrator: admin,
			IsHidden: false,
			IsDisabled: false,
			EnableMediaPlayback: true,
			EnableContentDownloading: account?.download_allowed === true,
			EnableCollectionManagement: true,
			EnableSubtitleDownloading: true,
			EnableAllFolders: true,
			EnableLiveTvAccess: false,
			EnableLiveTvManagement: false
		}
	};
};
