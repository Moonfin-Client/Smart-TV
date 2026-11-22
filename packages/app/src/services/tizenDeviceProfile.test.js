const MODEL_2020 = 'GU55TU8379UXZG';
const MODEL_2019 = 'UN55RU7100FXZA';

// Stands in for the TV APIs the profile reads. Anything not stubbed falls back
// to the profile's own defaults, the same way a set that refuses a call does.
const stubTv = ({uhd, model, tizenVersion}) => {
	window.tizen = {
		systeminfo: {
			getCapability: () => tizenVersion
		}
	};
	window.webapis = {
		productinfo: {
			isUdPanelSupported: () => uhd,
			is8KPanelSupported: () => false,
			getRealModel: () => model,
			getModel: () => model,
			getFirmware: () => ''
		}
	};
};

const h264Profiles = (profile) => profile.CodecProfiles.filter((p) => p.Type === 'Video' && p.Codec === 'h264');

const levelOf = (codecProfile) => codecProfile.Conditions.find((c) => c.Property === 'VideoLevel')?.Value;

// Mirrors the server: a profile counts when its ApplyConditions hold, an unknown
// value only holds when the condition isn't required, and the lowest level wins.
const heightConditionHolds = (condition, height) => {
	if (height == null) return !condition.IsRequired;
	return height <= Number(condition.Value);
};

const maxLevelFor = (profile, height) => Math.min(
	...h264Profiles(profile)
		.filter((p) => (p.ApplyConditions || []).every((c) => c.Property !== 'Height' || heightConditionHolds(c, height)))
		.map(levelOf)
		.filter(Boolean)
		.map(Number)
);

// The module caches the model and capabilities per app run, and each test here
// is a different TV, so every test loads its own copy.
const profileFor = (tv) => {
	stubTv(tv);
	jest.resetModules();
	return require('../../../platform-tizen/src/deviceProfile').getJellyfinDeviceProfile();
};

describe('Tizen H.264 limits', () => {
	afterEach(() => {
		delete window.tizen;
		delete window.webapis;
	});

	test('a UHD set keeps Level 5.1 for 4K sources', async () => {
		const profile = await profileFor({uhd: true, model: MODEL_2020, tizenVersion: '5.5'});

		expect(maxLevelFor(profile, 2160)).toBe(51);
	});

	test('a 2020 UHD set limits 1080p sources to Level 4.2', async () => {
		const profile = await profileFor({uhd: true, model: MODEL_2020, tizenVersion: '5.5'});

		expect(maxLevelFor(profile, 1080)).toBe(42);
	});

	test('a 2019 UHD set limits 1080p sources to Level 4.1', async () => {
		const profile = await profileFor({uhd: true, model: MODEL_2019, tizenVersion: '5.0'});

		expect(maxLevelFor(profile, 1080)).toBe(41);
	});

	test('an unknown height keeps the UHD level', async () => {
		const profile = await profileFor({uhd: true, model: MODEL_2020, tizenVersion: '5.5'});

		expect(maxLevelFor(profile, null)).toBe(51);
	});

	test('only UHD sets get the extra resolution profile', async () => {
		const profile = await profileFor({uhd: false, model: MODEL_2020, tizenVersion: '5.5'});

		expect(h264Profiles(profile).some((p) => p.ApplyConditions)).toBe(false);
	});

	test('anamorphic H.264 is only converted below Tizen 6', async () => {
		const blocksAnamorphic = (profile) => h264Profiles(profile).some((p) => p.Conditions.some((c) => c.Property === 'IsAnamorphic'));

		expect(blocksAnamorphic(await profileFor({uhd: true, model: MODEL_2020, tizenVersion: '5.5'}))).toBe(true);
		expect(blocksAnamorphic(await profileFor({uhd: true, model: MODEL_2020, tizenVersion: '10.0'}))).toBe(false);
	});
});
