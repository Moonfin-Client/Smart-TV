// A series' remembered audio and subtitle choice on Silo, per profile and series.
//
// - Audio: `GET/PUT /audio-prefs/{series}`: the chosen track's audio ordinal, language and signature. Silo writes this
//   row itself too whenever a session starts or replans with an audio track.
// - Subtitles: `GET/PUT /subtitle-prefs/{series}`: the chosen track (Silo's combined subtitle index, or -1 for off),
//   language, mode and signature, plus the settings `playback.subtitle_language` and `playback.subtitle_mode` at
//   `profile_series` scope, which Silo's web player writes alongside and which outrank the row. Both are written here,
//   as the web player does.
//
// Choices are answered in the app's series track preference shape ({language, title, relativeIndex}). Track numbers
// are Silo's, so a write needs the playing file's track map, which playback notes (`getPlayingSource`); a track Silo
// doesn't number isn't written.

import {siloSubtitleCombinedIndex} from './siloPlayback';
import {siloTrackForStreamIndex} from './siloMediaSources';

const SUBTITLE_LANGUAGE_KEY = 'playback.subtitle_language';
const SUBTITLE_MODE_KEY = 'playback.subtitle_mode';
const OFF = {language: 'none', title: '', relativeIndex: 0};

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const isMap = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const choice = (language, title) => (language || title ? {language: language || '', title: title || '', relativeIndex: 0} : null);

export const createSiloTrackChoices = ({call, getPlayingSource}) => {
	const audioPath = (seriesId) => `/api/v2/audio-prefs/${encodeURIComponent(seriesId)}`;
	const subtitlePath = (seriesId) => `/api/v2/subtitle-prefs/${encodeURIComponent(seriesId)}`;

	const readOrNull = async (path, query) => {
		try {
			return await call(path, query ? {query} : {});
		} catch (err) {
			if (err.status === 404) return null;
			throw err;
		}
	};

	// The subtitle settings stored for the series itself; a value from another scope isn't a choice for it.
	const seriesSettings = async (seriesId) => {
		const json = await readOrNull('/api/v2/settings/values/effective', {keys: [SUBTITLE_LANGUAGE_KEY, SUBTITLE_MODE_KEY], series_ids: [seriesId]});
		const out = {};
		(Array.isArray(json?.items) ? json.items : []).forEach((item) => {
			if (isMap(item) && (item.scope ?? item.source) === 'profile_series' && typeof item.key === 'string') out[item.key] = item.value;
		});
		return out;
	};

	const audioChoice = async (seriesId) => {
		const row = await readOrNull(audioPath(seriesId));
		if (!row || !(Number.isInteger(row.audio_track_index) && row.audio_track_index >= 0)) return null;
		const signature = isMap(row.track_signature) ? row.track_signature : {};
		// As the app names a track: its own title, else the shown one.
		return choice(text(row.audio_language) || text(signature.language), text(signature.embedded_title) || text(signature.title));
	};

	const subtitleChoice = async (seriesId) => {
		const [row, settings] = await Promise.all([readOrNull(subtitlePath(seriesId)), seriesSettings(seriesId)]);
		const signature = isMap(row?.track_signature) ? row.track_signature : {};
		const has = (key) => Object.prototype.hasOwnProperty.call(settings, key);
		const mode = has(SUBTITLE_MODE_KEY) ? settings[SUBTITLE_MODE_KEY] : text(row?.subtitle_mode);
		if (mode === 'off' || (row && row.subtitle_track_index === -1)) return {...OFF};
		const language = has(SUBTITLE_LANGUAGE_KEY)
			? text(settings[SUBTITLE_LANGUAGE_KEY])
			: text(row?.subtitle_language) || text(signature.language);
		// The label belongs to the row's track, and a newer language from the settings may name another one.
		const labelLanguage = text(signature.language);
		const title = labelLanguage == null || labelLanguage === language ? text(signature.label) : null;
		return choice(language, title);
	};

	const streamOf = (source, index) => (source?.MediaStreams || []).find((s) => s.Index === index) || null;

	const putSetting = (seriesId, key, value) => call(`/api/v2/settings/values/${encodeURIComponent(key)}`, {
		method: 'PUT', query: {scope: 'profile_series', series_id: seriesId}, body: {value}
	});

	return {
		// {audio, subtitle}, each a series track preference or null when Silo keeps none.
		getSeriesTrackChoices: async (seriesId) => {
			const [audio, subtitle] = await Promise.all([audioChoice(seriesId), subtitleChoice(seriesId)]);
			return {audio, subtitle};
		},

		setSeriesAudioChoice: async (seriesId, itemId, streamIndex) => {
			const source = getPlayingSource(itemId);
			const track = source ? siloTrackForStreamIndex(source, streamIndex) : null;
			const stream = streamOf(source, streamIndex);
			if (!track || track.kind !== 'audio' || !stream) return;
			const language = text(stream.Language) || '';
			await call(audioPath(seriesId), {method: 'PUT', body: {
				audio_language: language,
				audio_track_index: track.ordinal,
				track_signature: {
					...(language ? {language} : null),
					...(text(stream.Codec) ? {codec: text(stream.Codec)} : null),
					...(Number.isInteger(stream.Channels) ? {channels: stream.Channels} : null),
					...(text(stream.ChannelLayout) ? {layout: text(stream.ChannelLayout)} : null),
					...(text(stream.DisplayTitle) ? {title: text(stream.DisplayTitle)} : null),
					...(text(stream.Title) ? {embedded_title: text(stream.Title)} : null),
					default: stream.IsDefault === true
				}
			}});
		},

		// -1 turns subtitles off for the series.
		setSeriesSubtitleChoice: async (seriesId, itemId, streamIndex) => {
			if (streamIndex < 0) {
				await Promise.all([
					call(subtitlePath(seriesId), {method: 'PUT', body: {subtitle_track_index: -1, subtitle_language: '', subtitle_mode: 'off'}}),
					putSetting(seriesId, SUBTITLE_LANGUAGE_KEY, null),
					putSetting(seriesId, SUBTITLE_MODE_KEY, 'off')
				]);
				return;
			}
			const source = getPlayingSource(itemId);
			const combined = source ? siloSubtitleCombinedIndex(source, streamIndex) : null;
			const stream = streamOf(source, streamIndex);
			if (combined == null || !stream) return;
			const language = text(stream.Language) || '';
			const label = text(stream.DisplayTitle) || text(stream.Title);
			await Promise.all([
				call(subtitlePath(seriesId), {method: 'PUT', body: {
					subtitle_track_index: combined,
					subtitle_language: language,
					subtitle_mode: 'always',
					track_signature: {
						source: stream.IsExternal === true ? 'external' : 'embedded',
						...(language ? {language} : null),
						...(text(stream.Codec) ? {codec: text(stream.Codec)} : null),
						...(label ? {label} : null),
						forced: stream.IsForced === true,
						hearing_impaired: stream.IsHearingImpaired === true
					}
				}}),
				putSetting(seriesId, SUBTITLE_LANGUAGE_KEY, language || null),
				putSetting(seriesId, SUBTITLE_MODE_KEY, 'always')
			]);
		}
	};
};
