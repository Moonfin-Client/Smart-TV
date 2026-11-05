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

	afterEach(() => jest.restoreAllMocks());

	test('one playback start asks the TV once', async () => {
		await getDeviceCapabilities();
		await getJellyfinDeviceProfile();
		expect(mockSoundReads).toHaveBeenCalledTimes(1);
	});

	test('the next start sees a receiver switched on since the last one', async () => {
		expect((await getDeviceCapabilities()).externalAudioPathActive).toBe(false);
		mockSoundOutput = 'external_arc';
		const later = Date.now() + 10000;
		jest.spyOn(Date, 'now').mockReturnValue(later);
		expect((await getDeviceCapabilities()).externalAudioPathActive).toBe(true);
		expect(mockSoundReads).toHaveBeenCalledTimes(2);
	});
});
