import {getJellyfinDeviceProfile} from '../../../platform-webos/src/deviceProfile';

jest.mock('@enact/webos/deviceinfo', () => ({__esModule: true, default: (cb) => cb({})}));
jest.mock('@enact/webos/LS2Request', () => ({
	__esModule: true,
	default: class {
		send({onFailure}) { onFailure({}); }
	}
}));

describe('webOS subtitle profile', () => {
	test('is unchanged when embedded text subtitles are off', async () => {
		const [off, unset] = await Promise.all([getJellyfinDeviceProfile({embedTextSubtitles: false}), getJellyfinDeviceProfile({})]);
		expect(off.SubtitleProfiles).toEqual(unset.SubtitleProfiles);
		expect(off.SubtitleProfiles.some((profile) => profile.Method === 'Embed')).toBe(false);
	});

	test('puts Embed ahead of External for SRT only when asked', async () => {
		const {SubtitleProfiles} = await getJellyfinDeviceProfile({embedTextSubtitles: true});
		const methodsOf = (format) => SubtitleProfiles.filter((profile) => profile.Format === format).map((profile) => profile.Method);
		expect(methodsOf('srt')).toEqual(['Embed', 'External']);
		expect(methodsOf('subrip')).toEqual(['Embed']);
		expect(methodsOf('ass')).toEqual(['External']);
		expect(methodsOf('pgssub')).toEqual(['External']);
	});
});
