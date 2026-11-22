import {clearCapabilitiesCache, getDeviceCapabilities, getJellyfinDeviceProfile} from '../../../platform-webos/src/deviceProfile';

let mockSoundOutput;
const mockSoundReads = jest.fn();

jest.mock('@enact/webos/deviceinfo', () => ({
	__esModule: true,
	default: (callback) => callback({sdkVersion: '6.0.0'})
}));

jest.mock('@enact/webos/LS2Request', () => ({
	__esModule: true,
	default: class {
		send ({method, onSuccess}) {
			if (method === 'getSystemSettings') {
				mockSoundReads();
				onSuccess({settings: {soundOutput: mockSoundOutput, digitalSoundOutput: 'passthrough'}});
			} else {
				onSuccess({});
			}
		}
	}
}));

describe('the webOS sound path', () => {
	beforeEach(() => {
		mockSoundOutput = 'tv_speaker';
		clearCapabilitiesCache();
	});

	test('one playback start asks the TV once', async () => {
		const start = {};
		await getDeviceCapabilities(start);
		await getJellyfinDeviceProfile(start);
		expect(mockSoundReads).toHaveBeenCalledTimes(1);
	});

	test('the next start sees a receiver switched on right after the last one', async () => {
		expect((await getDeviceCapabilities({})).externalAudioPathActive).toBe(false);
		mockSoundOutput = 'external_arc';
		expect((await getDeviceCapabilities({})).externalAudioPathActive).toBe(true);
		expect(mockSoundReads).toHaveBeenCalledTimes(2);
	});

	test('a read outside a playback start always asks', async () => {
		await getDeviceCapabilities();
		await getDeviceCapabilities();
		expect(mockSoundReads).toHaveBeenCalledTimes(2);
	});
});
