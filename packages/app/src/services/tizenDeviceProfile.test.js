import {clearCapabilitiesCache, getJellyfinDeviceProfile} from '../../../platform-tizen/src/deviceProfile';

// Minimal stand-in for the TV APIs. Anything not stubbed falls back to the
// profile's own defaults, the same way a set that refuses a call does.
const stubTv = ({uhd, modelYear, tizenVersion = '5.5'}) => {
	window.tizen = {
		systeminfo: {
			getCapability: () => tizenVersion
		}
	};
	window.webapis = {
		productinfo: {
			isUdPanelSupported: () => uhd,
			is8KPanelSupported: () => false,
			getModelCode: () => `${modelYear}_TEST`,
			getSmartTVServerVersion: () => `T-TEST${modelYear}`
		}
	};
};

const h264Profiles = (profile) => profile.CodecProfiles.filter((p) => p.Type === 'Video' && p.Codec === 'h264');

const levelOf = (codecProfile) => codecProfile.Conditions.find((c) => c.Property === 'VideoLevel')?.Value;

// Mirrors how the server picks limits: every profile whose ApplyConditions hold
// counts, and the lowest level wins.
const maxLevelFor = (profile, height) => Math.min(
	...h264Profiles(profile)
		.filter((p) => (p.ApplyConditions || []).every((c) => c.Property !== 'Height' || height <= Number(c.Value)))
		.map(levelOf)
		.filter(Boolean)
		.map(Number)
);

describe('Tizen H.264 level limits', () => {
	// Capabilities are cached per app run, and each test here is a different TV
	beforeEach(() => clearCapabilitiesCache());

	afterEach(() => {
		delete window.tizen;
		delete window.webapis;
	});

	test('a UHD set keeps Level 5.1 for 4K sources', async () => {
		stubTv({uhd: true, modelYear: 2020});
		const profile = await getJellyfinDeviceProfile();

		expect(maxLevelFor(profile, 2160)).toBe(51);
	});

	test('a UHD set limits 1080p sources to the FHD level', async () => {
		stubTv({uhd: true, modelYear: 2020});
		const profile = await getJellyfinDeviceProfile();
		const limited = maxLevelFor(profile, 1080);

		// Level 5.0 and up, as in x264 encodes with many reference frames, must not pass
		expect(limited).toBeLessThan(50);
		expect([41, 42]).toContain(limited);
	});

	test('only UHD sets get the extra resolution profile', async () => {
		stubTv({uhd: false, modelYear: 2020});
		const profile = await getJellyfinDeviceProfile();

		expect(h264Profiles(profile).some((p) => p.ApplyConditions)).toBe(false);
	});
});
