import {createSiloTrackChoices} from './siloTrackChoices';

// An episode file: video 0, audio 1 (eng) and 2 (jpn), subtitle 3 (eng).
const source = {
	Id: '62',
	MediaStreams: [
		{Index: 0, Type: 'Video'},
		{Index: 1, Type: 'Audio', Language: 'eng', Codec: 'ac3', Channels: 6, Title: 'Main', DisplayTitle: 'English - AC3 5.1', IsDefault: true},
		{Index: 2, Type: 'Audio', Language: 'jpn', Codec: 'aac', Channels: 2, DisplayTitle: 'Japanese - AAC'},
		{Index: 3, Type: 'Subtitle', Language: 'eng', Codec: 'subrip', DisplayTitle: 'English', IsForced: false}
	],
	_siloTracks: [
		{Index: 0, Kind: 'video', Ordinal: 0},
		{Index: 1, Kind: 'audio', Ordinal: 0},
		{Index: 2, Kind: 'audio', Ordinal: 1},
		{Index: 3, Kind: 'subtitle', Ordinal: 0}
	]
};

const setUp = (answers = {}) => {
	const call = jest.fn((path, options = {}) => {
		const found = answers[`${options.method || 'GET'} ${path}`];
		if (found === undefined) return Promise.resolve(null);
		return found instanceof Error ? Promise.reject(found) : Promise.resolve(found);
	});
	return {call, choices: createSiloTrackChoices({call, getPlayingSource: (itemId) => (itemId === 'ep1' ? source : null)})};
};
const notFound = Object.assign(new Error('Not found'), {status: 404});

describe('reading a series\' choice', () => {
	test('audio by its language and own title; subtitles by the series settings over the row', async () => {
		const {choices} = setUp({
			'GET /api/v2/audio-prefs/show': {audio_track_index: 1, audio_language: 'jpn', track_signature: {title: 'Japanese - AAC'}},
			'GET /api/v2/subtitle-prefs/show': {subtitle_track_index: 0, subtitle_language: 'eng', track_signature: {language: 'eng', label: 'English SDH'}},
			'GET /api/v2/settings/values/effective': {items: [
				{key: 'playback.subtitle_language', value: 'spa', scope: 'profile_series'},
				{key: 'playback.subtitle_mode', value: 'always', scope: 'profile'}
			]}
		});
		await expect(choices.getSeriesTrackChoices('show')).resolves.toEqual({
			audio: {language: 'jpn', title: 'Japanese - AAC', relativeIndex: 0},
			// The label belongs to the English row, not the newer Spanish choice.
			subtitle: {language: 'spa', title: '', relativeIndex: 0}
		});
	});

	test('subtitles off, and nothing kept', async () => {
		const off = setUp({'GET /api/v2/subtitle-prefs/show': {subtitle_track_index: -1}, 'GET /api/v2/audio-prefs/show': notFound});
		await expect(off.choices.getSeriesTrackChoices('show')).resolves.toEqual({audio: null, subtitle: {language: 'none', title: '', relativeIndex: 0}});
		const none = setUp({'GET /api/v2/audio-prefs/show': notFound, 'GET /api/v2/subtitle-prefs/show': notFound});
		await expect(none.choices.getSeriesTrackChoices('show')).resolves.toEqual({audio: null, subtitle: null});
	});
});

describe('writing a series\' choice', () => {
	test('audio by Silo\'s ordinal with the track\'s signature', async () => {
		const {call, choices} = setUp();
		await choices.setSeriesAudioChoice('show', 'ep1', 2);
		expect(call).toHaveBeenCalledWith('/api/v2/audio-prefs/show', {method: 'PUT', body: {
			audio_language: 'jpn',
			audio_track_index: 1,
			track_signature: {language: 'jpn', codec: 'aac', channels: 2, title: 'Japanese - AAC', default: false}
		}});
	});

	test('a subtitle as Silo\'s combined index, with the series settings alongside', async () => {
		const {call, choices} = setUp();
		await choices.setSeriesSubtitleChoice('show', 'ep1', 3);
		const sent = call.mock.calls.map(([path, options]) => `${options.method} ${path} ${JSON.stringify(options.query || null)} ${JSON.stringify(options.body)}`);
		expect(sent).toEqual([
			'PUT /api/v2/subtitle-prefs/show null {"subtitle_track_index":0,"subtitle_language":"eng","subtitle_mode":"always","track_signature":{"source":"embedded","language":"eng","codec":"subrip","label":"English","forced":false,"hearing_impaired":false}}',
			'PUT /api/v2/settings/values/playback.subtitle_language {"scope":"profile_series","series_id":"show"} {"value":"eng"}',
			'PUT /api/v2/settings/values/playback.subtitle_mode {"scope":"profile_series","series_id":"show"} {"value":"always"}'
		]);
	});

	test('off needs no file; a track of a file that isn\'t playing isn\'t written', async () => {
		const {call, choices} = setUp();
		await choices.setSeriesSubtitleChoice('show', 'other', -1);
		expect(call).toHaveBeenCalledWith('/api/v2/subtitle-prefs/show', {method: 'PUT', body: {subtitle_track_index: -1, subtitle_language: '', subtitle_mode: 'off'}});
		call.mockClear();
		await choices.setSeriesAudioChoice('show', 'other', 2);
		await choices.setSeriesSubtitleChoice('show', 'other', 3);
		expect(call).not.toHaveBeenCalled();
	});
});
