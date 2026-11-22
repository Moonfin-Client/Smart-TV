import {clearCapabilitiesCache, getJellyfinDeviceProfile} from '../../../platform-webos/src/deviceProfile';

let mockSoundOutput;
let mockEngineDts;

jest.mock('@enact/webos/deviceinfo', () => ({
	__esModule: true,
	default: (callback) => callback({sdkVersion: '10.0.0'})
}));

// No config comes back, the way LG's 2025 sets keep tv.model.edidType from apps.
jest.mock('@enact/webos/LS2Request', () => ({
	__esModule: true,
	default: class {
		send ({method, onSuccess}) {
			if (method === 'getSystemSettings') onSuccess({settings: {soundOutput: mockSoundOutput, digitalSoundOutput: 'passthrough'}});
			else onSuccess({});
		}
	}
}));

const mkvAudio = async () =>
	(await getJellyfinDeviceProfile({})).DirectPlayProfiles.find((profile) => profile.Container === 'mkv').AudioCodec.split(',');

describe('DTS on a webOS 25 set without its EDID type', () => {
	beforeEach(() => {
		mockSoundOutput = 'tv_speaker';
		clearCapabilitiesCache();
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType')
			.mockImplementation((type) => (/dts/.test(type) && mockEngineDts ? 'probably' : ''));
	});

	test('is left out when the engine has no DTS, through a receiver too', async () => {
		mockEngineDts = false;
		expect(await mkvAudio()).not.toContain('dts');
		mockSoundOutput = 'external_arc';
		expect(await mkvAudio()).not.toContain('dts');
	});

	test('is offered in MKV when the engine plays it', async () => {
		mockEngineDts = true;
		expect(await mkvAudio()).toContain('dts');
	});
});
