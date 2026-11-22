import {matchAudioTrack} from './webosTrackUtils';

const track = (language) => ({language});
const stream = (index, codec, language) => ({index, codec, language});
const playable = (s) => s.codec !== 'truehd';

describe('matchAudioTrack', () => {
	it('pairs by language when the TV lists every track', () => {
		const streams = [stream(1, 'aac', 'jpn'), stream(2, 'ac3', 'eng')];
		expect(matchAudioTrack([track('en'), track('jpn')], streams, 2, playable)).toBe(0);
	});

	it('skips the tracks the TV leaves out of its list', () => {
		const streams = [stream(2, 'truehd', 'eng'), stream(3, 'ac3', 'eng'), stream(4, 'eac3', 'eng')];
		expect(matchAudioTrack([track('eng'), track('eng')], streams, 4, playable)).toBe(1);
	});

	it('leaves a track the TV cant play to the server', () => {
		const streams = [stream(2, 'truehd', 'eng'), stream(3, 'ac3', 'eng')];
		expect(matchAudioTrack([track('eng'), track('eng')], streams, 2, playable)).toBe(-1);
	});

	it('leaves it to the server when the lists still dont line up', () => {
		const streams = [stream(2, 'ac3', 'eng'), stream(3, 'ac3', 'por'), stream(4, 'aac', 'eng')];
		expect(matchAudioTrack([track('eng'), track('por')], streams, 3, playable)).toBe(-1);
	});
});
