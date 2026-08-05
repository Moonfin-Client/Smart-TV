// The server profile is typed, so a key this app spells differently isn't refused, it's
// quietly dropped. Nothing on this side can prove a field name is right, but these lock down
// what gets sent and what gets taken.

// Nothing renders here. The provider only needs React to exist while the module loads, and
// the real one can't be pulled in because the CLI ships a second copy that disagrees with it.
jest.mock('react/jsx-dev-runtime', () => ({}));
jest.mock('react', () => ({createContext: () => ({})}));
// Storage picks its platform module through a dynamic import that jest can't transform.
jest.mock('../services/storage', () => ({}));

import {SYNCABLE_KEYS, defaultSettings, profileToLocal, localToProfile} from './SettingsContext';

describe('profileToLocal', () => {
	test('takes the TV button fields under their own names', () => {
		const local = profileToLocal({
			detailButtonOrderTv: ['play', 'trailer'],
			hiddenDetailButtonsTv: ['shuffle'],
			osdButtonOrderTv: ['subtitles'],
			hiddenOsdButtonsTv: ['audio']
		});

		expect(local.detailButtonOrderTv).toEqual(['play', 'trailer']);
		expect(local.hiddenDetailButtonsTv).toEqual(['shuffle']);
		expect(local.osdButtonOrderTv).toEqual(['subtitles']);
		expect(local.hiddenOsdButtonsTv).toEqual(['audio']);
	});

	test('leaves the desktop and mobile button fields alone', () => {
		const local = profileToLocal({
			osdButtonOrderDesktop: ['desktop-order'],
			hiddenDetailButtonsMobile: ['mobile-hidden']
		});

		expect(local).toEqual({});
	});

	test('ignores a screensaver mode this app has no way to draw', () => {
		expect(profileToLocal({screensaverMode: 'off'}).screensaverMode).toBeUndefined();
		expect(profileToLocal({screensaverMode: 'logo'}).screensaverMode).toBe('logo');
	});
});

describe('localToProfile', () => {
	test('says nothing about settings this app has no screen for', () => {
		const profile = localToProfile(defaultSettings);

		for (const key of ['showCastButton', 'themeMusicLoop', 'classicHomeRowsPadding',
			'modernHomeRowsPadding', 'detailShowTechnicalDetails', 'recommendationSystemSource',
			'recommendationsApplyParentalRatingCap']) {
			expect(profile).not.toHaveProperty(key);
		}
	});

	test('writes those settings back once the server has supplied one', () => {
		const profile = localToProfile({...defaultSettings, ...profileToLocal({
			showCastButton: false,
			classicHomeRowsPadding: 12
		})});

		expect(profile.showCastButton).toBe(false);
		expect(profile.classicHomeRowsPadding).toBe(12);
	});

	test('keeps the local only home row list out of the profile', () => {
		const profile = localToProfile({...defaultSettings, customHomeRows: [{id: 'row'}]});

		expect(profile).not.toHaveProperty('customHomeRows');
	});

	// Some synced keys have no default at all, which is how a screen asks for its built in
	// order rather than a stored one.
	test('invents nothing when there is no local value to send', () => {
		expect(localToProfile({})).toEqual({});
	});
});

describe('SYNCABLE_KEYS', () => {
	test('no key is listed twice', () => {
		const repeated = SYNCABLE_KEYS.filter((key, i) => SYNCABLE_KEYS.indexOf(key) !== i);

		expect(repeated).toEqual([]);
	});
});
