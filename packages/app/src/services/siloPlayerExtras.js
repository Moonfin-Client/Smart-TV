// What the player and detail pages show around a Silo title: skip markers, seek previews and theme music, in the
// shapes the app reads from Jellyfin. `call(path, options)` sends one request as the signed-in profile.

import {keptReads} from './siloItems';
import {secondsToTicks, siloIdOf} from './siloMapper';
import {resolveSiloUrl} from '../utils/siloUrls';

const MARKERS_TTL = 5 * 60 * 1000;
const THEMES_CAPABILITIES_TTL = 10 * 60 * 1000;

// Silo's marker kinds as Jellyfin's segment types. Credits are Jellyfin's Outro.
const SEGMENT_TYPES = {intro: 'Intro', credits: 'Outro', recap: 'Recap', preview: 'Preview'};

// What a TV's audio element plays; Silo converts anything else to AAC in MP4.
const THEME_FORMATS = [
	{container: 'mp3', audio_codec: 'mp3'},
	{container: 'mp4', audio_codec: 'aac'},
	{container: 'm4a', audio_codec: 'aac'},
	{container: 'aac', audio_codec: 'aac'},
	{container: 'wav', audio_codec: 'pcm'}
];

const isMap = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const positiveInt = (v) => (typeof v === 'number' && v > 0 ? Math.floor(v) : null);

/**
 * A file's markers (`GET /markers/files/{id}`, `/markers/items/{id}`) as Jellyfin MediaSegmentDtos in start order.
 * `marker_segments` lists every occurrence (a recap, an intro and a second intro after a cold open), so it is used
 * when Silo sends it; older answers carry one segment per kind. A segment without an end runs to `runTimeSeconds`
 * when known and is dropped otherwise. Empty, inverted and repeated segments are dropped.
 */
export const siloMarkersToMediaSegments = (markers, itemId, runTimeSeconds = null) => {
	const found = [];
	const occurrences = Array.isArray(markers?.marker_segments) ? markers.marker_segments.filter(isMap) : [];
	if (occurrences.length) {
		occurrences.forEach((o) => {
			if (typeof o.kind === 'string' && typeof o.start_seconds === 'number') {
				found.push({kind: o.kind, start: o.start_seconds, end: typeof o.end_seconds === 'number' ? o.end_seconds : null});
			}
		});
	} else {
		Object.keys(SEGMENT_TYPES).forEach((kind) => {
			const segment = isMap(markers?.[kind]) ? markers[kind] : null;
			const start = segment?.start_seconds ?? segment?.start;
			const end = segment?.end_seconds ?? segment?.end;
			if (typeof start === 'number') found.push({kind, start, end: typeof end === 'number' ? end : null});
		});
	}
	const duration = runTimeSeconds > 0 ? runTimeSeconds : null;
	const seen = {};
	const segments = [];
	found.forEach((f) => {
		const type = SEGMENT_TYPES[f.kind.trim().toLowerCase()];
		const start = Math.max(f.start, 0);
		const end = f.end ?? duration;
		if (!type || end == null || end <= start) return;
		const segment = {type, start: secondsToTicks(start), end: secondsToTicks(end)};
		const key = `${segment.type}|${segment.start}|${segment.end}`;
		if (seen[key]) return;
		seen[key] = true;
		segments.push(segment);
	});
	segments.sort((a, b) => a.start - b.start);
	const perType = {};
	return segments.map((s) => {
		perType[s.type] = perType[s.type] == null ? 0 : perType[s.type] + 1;
		return {
			// Unique per occurrence: the player tells segments apart by id.
			Id: `silo-${s.type.toLowerCase()}-${itemId}-${perType[s.type]}`,
			ItemId: itemId,
			Type: s.type,
			StartTicks: s.start,
			EndTicks: s.end
		};
	});
};

/**
 * One file's seek previews (`GET /watch/{id}/trickplay`) as a Trickplay manifest entry: {<width>: {Width, Height,
 * TileWidth, TileHeight, ThumbnailCount, Interval}}. Silo lays thumbnails out on its sheets the way Jellyfin does, so
 * the tile arithmetic is the same; the sheets' signed addresses ride along as `SiloSheets` (by sheet index), and the
 * time they stop working as `SiloExpiresAt`. Null without a size, an interval or sheets.
 */
export const siloTrickplayToManifest = (trickplay, baseUrl) => {
	const width = positiveInt(trickplay?.thumbnail_width);
	const height = positiveInt(trickplay?.thumbnail_height);
	const columns = positiveInt(trickplay?.tile_columns);
	const rows = positiveInt(trickplay?.tile_rows);
	const interval = positiveInt(trickplay?.interval_ms);
	const sheets = Array.isArray(trickplay?.sheets) ? trickplay.sheets : [];
	if (!width || !height || !columns || !rows || !interval || !sheets.length) return null;
	const urls = [];
	sheets.forEach((sheet, position) => {
		const url = resolveSiloUrl(sheet?.url, baseUrl);
		if (!url) return;
		urls[typeof sheet.index === 'number' && sheet.index >= 0 ? sheet.index : position] = url;
	});
	if (!urls.length) return null;
	return {
		[width]: {
			Width: width,
			Height: height,
			TileWidth: columns,
			TileHeight: rows,
			ThumbnailCount: positiveInt(trickplay.thumbnail_count) || sheets.length * columns * rows,
			Interval: interval,
			SiloSheets: urls,
			...(typeof trickplay.expires_at === 'string' ? {SiloExpiresAt: trickplay.expires_at} : null)
		}
	};
};

// A title's theme songs, from its detail (`themes`: `owner_id`, `items` of {id, title, container, duration_seconds}).
export const siloThemeSongs = (detail, itemId) => {
	const themes = isMap(detail?.themes) ? detail.themes : null;
	const owner = typeof themes?.owner_id === 'string' && themes.owner_id ? themes.owner_id : itemId;
	return (Array.isArray(themes?.items) ? themes.items : []).filter((s) => isMap(s) && s.id != null).map((song) => ({
		Id: String(song.id),
		Name: typeof song.title === 'string' ? song.title : 'Theme',
		Type: 'Audio',
		MediaType: 'Audio',
		...(typeof song.container === 'string' ? {Container: song.container} : null),
		...(song.duration_seconds > 0 ? {RunTimeTicks: secondsToTicks(song.duration_seconds)} : null),
		ParentId: owner,
		SiloThemeOwnerId: owner
	}));
};

// The file each item plays (or last played), by server and item: its markers are the ones that count (two versions of
// a film can have different markers), and its track map names a track to Silo. Kept for the app, since an item from
// another server gets a new api each time it's asked for.
const playing = {};
const MAX_PLAYING = 50;

export const siloPlayingFile = (baseUrl, itemId) => playing[`${baseUrl}|${itemId}`] || null;

const notePlaying = (baseUrl, itemId, file) => {
	const key = `${baseUrl}|${itemId}`;
	delete playing[key];
	playing[key] = file;
	const keys = Object.keys(playing);
	if (keys.length > MAX_PLAYING) delete playing[keys[0]];
};

/**
 * `getDetail(itemId)` answers a title's raw detail, shared with the page that shows it.
 */
export const createSiloPlayerExtras = ({call, getBaseUrl, getDetail}) => {
	const markers = keptReads(MARKERS_TTL, 64);
	const themesAvailable = keptReads(THEMES_CAPABILITIES_TTL);

	const readMarkers = async (path, itemId, runTimeSeconds) => {
		try {
			return siloMarkersToMediaSegments(await call(path), itemId, runTimeSeconds);
		} catch (err) {
			if (err.status === 404) return [];
			throw err;
		}
	};

	// A yes is kept; a no or a failed read is asked again next time.
	const canPlayThemes = () => themesAvailable.get('capabilities', async () => {
		const caps = await call('/api/v2/catalog/themes/capabilities').catch(() => null);
		const available = caps?.state === 'available' && caps.allowed !== false;
		if (!available) throw new Error('Silo serves no theme music');
		return true;
	}).catch(() => false);

	return {
		// Told by playback when `itemId` starts playing `fileId` (its MediaSource `source`); a credits marker without an
		// end runs to the length.
		notePlayingFile: (itemId, fileId, runTimeSeconds = null, source = null) => {
			if (itemId && fileId) notePlaying(getBaseUrl(), itemId, {fileId: String(fileId), runTimeSeconds, source});
		},

		// Silo's markers of the file that plays, or of the title's first file before one plays.
		getMediaSegments: async (itemId) => {
			const file = siloPlayingFile(getBaseUrl(), itemId);
			const Items = await (file
				? markers.get(`file:${file.fileId}`, () => readMarkers(`/api/v2/markers/files/${encodeURIComponent(file.fileId)}`, itemId, file.runTimeSeconds))
				: markers.get(`item:${itemId}`, () => readMarkers(`/api/v2/markers/items/${encodeURIComponent(itemId)}`, itemId, null)));
			return {Items, TotalRecordCount: Items.length};
		},

		// A file without previews answers 404, which is no manifest.
		getTrickplayManifest: async (itemId, mediaSourceId) => {
			const fileId = siloIdOf(mediaSourceId);
			if (!fileId) return null;
			try {
				const answer = await call(`/api/v2/watch/${encodeURIComponent(itemId)}/trickplay`, {query: {file_id: fileId}});
				return siloTrickplayToManifest(answer, getBaseUrl());
			} catch (err) {
				if (err.status === 404) return null;
				throw err;
			}
		},

		// Silo has no theme videos, and an episode lists its show's songs itself when it inherits them.
		getThemeSongs: async (itemId) => {
			const songs = (await canPlayThemes()) ? siloThemeSongs(await getDetail(itemId), itemId) : [];
			return {Items: songs, TotalRecordCount: songs.length};
		},

		// A song plays through a short-lived grant whose address carries its own credential, so each play asks anew.
		// Null when Silo can't serve it in a format the TV plays.
		getThemeSongUrl: async (ownerId, songId) => {
			try {
				const grant = await call(`/api/v2/catalog/items/${encodeURIComponent(ownerId)}/themes/${encodeURIComponent(songId)}/playback`, {
					method: 'POST',
					body: {accepted_formats: THEME_FORMATS}
				});
				return resolveSiloUrl(grant?.url, getBaseUrl());
			} catch (err) {
				if (err.status === 404 || err.status === 406 || err.status === 503) return null;
				throw err;
			}
		}
	};
};
