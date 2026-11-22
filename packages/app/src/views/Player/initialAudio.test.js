import {asServerAudioStream, directPlayAudio, resolveSeriesAudio} from './initialAudio';
import {getItemAudioPref, getSeriesAudioPref} from '../../services/subtitlePrefs';

jest.mock('../../services/subtitlePrefs', () => ({
	getItemAudioPref: jest.fn(),
	getSeriesAudioPref: jest.fn()
}));

const eng = {index: 1, language: 'eng'};
const jpn = {index: 2, language: 'jpn'};
const streams = [eng, jpn];
const episode = {Id: 'ep1', SeriesId: 'show'};

beforeEach(() => {
	getItemAudioPref.mockResolvedValue(undefined);
	getSeriesAudioPref.mockResolvedValue(undefined);
});

describe('resolveSeriesAudio', () => {
	test('the track picked on this title wins over the one kept for its series', async () => {
		getItemAudioPref.mockResolvedValue(1);
		getSeriesAudioPref.mockResolvedValue({language: 'jpn', title: '', relativeIndex: 0});
		expect(await resolveSeriesAudio(episode, streams)).toBe(eng);
	});

	test('a movie gets back the track picked on it', async () => {
		getItemAudioPref.mockResolvedValue(2);
		expect(await resolveSeriesAudio({Id: 'movie'}, streams)).toBe(jpn);
	});

	test('the series pick answers when the title has none, or one it no longer carries', async () => {
		getSeriesAudioPref.mockResolvedValue({language: 'jpn', title: '', relativeIndex: 0});
		expect(await resolveSeriesAudio(episode, streams)).toBe(jpn);
		getItemAudioPref.mockResolvedValue(7);
		expect(await resolveSeriesAudio(episode, streams)).toBe(jpn);
	});

	test('a movie with nothing remembered is left to the language preferences', async () => {
		expect(await resolveSeriesAudio({Id: 'movie'}, streams)).toBeNull();
		expect(getSeriesAudioPref).not.toHaveBeenCalled();
	});
});

describe('directPlayAudio', () => {
	const truehd = {index: 1, codec: 'truehd', profile: 'Dolby TrueHD + Dolby Atmos', channels: 8, isDefault: true};
	const eac3 = {index: 2, codec: 'eac3', channels: 6, isDefault: true};
	const tracks = [truehd, eac3];
	const decodes = (codecs) => jest.fn(async (stream) => codecs.includes(stream.codec));

	test('a default the set cant decode gives way to the track the server settled on', async () => {
		const canPlay = decodes(['eac3']);
		expect(await directPlayAudio(truehd, tracks, 2, canPlay)).toBe(eac3);
		expect(canPlay).toHaveBeenCalledWith(truehd);
	});

	test('a pick the set decodes stays, and the server\'s own pick is never checked', async () => {
		expect(await directPlayAudio(truehd, tracks, 2, decodes(['truehd', 'eac3']))).toBe(truehd);
		const canPlay = decodes([]);
		expect(await directPlayAudio(eac3, tracks, 2, canPlay)).toBe(eac3);
		expect(canPlay).not.toHaveBeenCalled();
	});

	test('with no track from the server, or no pick, nothing changes', async () => {
		expect(await directPlayAudio(truehd, tracks, undefined, decodes([]))).toBe(truehd);
		expect(await directPlayAudio(null, tracks, 2, decodes([]))).toBeNull();
	});

	test('reads a player track the way the playability check expects', () => {
		expect(asServerAudioStream(truehd)).toEqual({Codec: 'truehd', Profile: 'Dolby TrueHD + Dolby Atmos', Title: undefined, DisplayTitle: undefined, ChannelLayout: undefined, Channels: 8});
		expect(asServerAudioStream(null)).toBeNull();
	});
});
