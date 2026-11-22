import {clearCapabilitiesCache, getDeviceCapabilities, getJellyfinDeviceProfile, testAv1Support} from '../../../platform-tizen/src/deviceProfile';

const offersAv1 = (profiles) => profiles.some((p) => (p.VideoCodec || '').split(',').includes('av1'));

describe('AV1 on Tizen', () => {
	afterEach(() => {
		delete global.tizen;
		delete global.webapis;
		clearCapabilitiesCache();
	});

	test('a 2018 FHD set updated to Tizen 5.5 is neither sent AV1 nor asked to copy it', async () => {
		global.tizen = {systeminfo: {getCapability: () => '5.5'}};
		global.webapis = {productinfo: {getRealModel: () => 'UN40N5200AFXZA', isUdPanelSupported: () => false, is8KPanelSupported: () => false}};

		expect(await getDeviceCapabilities()).toMatchObject({tizenVersion: 5.5, modelYear: 2018, uhd: false, av1: false});
		const profile = await getJellyfinDeviceProfile();
		expect(offersAv1(profile.DirectPlayProfiles)).toBe(false);
		expect(offersAv1(profile.TranscodingProfiles)).toBe(false);
	});

	test('on Tizen 5.5 only a 2020 UHD set decodes it, from Tizen 6 every set does', () => {
		expect(testAv1Support(5.5, 2020, true)).toBe(true);
		expect(testAv1Support(5.5, 2020, false)).toBe(false);
		expect(testAv1Support(5.5, 2019, true)).toBe(false);
		expect(testAv1Support(5, 2019, true)).toBe(false);
		expect(testAv1Support(6, 2021, false)).toBe(true);
	});
});
