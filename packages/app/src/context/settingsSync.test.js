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
import {__resetHomeLayoutPassthrough, homeRowsFromProfile} from '../utils/homeLayout';

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

	test('takes the TV metadata fields under their own names or PascalCase', () => {
		const local = profileToLocal({
			detailMetadataOrderTv: ['upcomingEpisodeDate', 'year'],
			HiddenDetailMetadataTv: ['status']
		});

		expect(local.detailMetadataOrderTv).toEqual(['upcomingEpisodeDate', 'year']);
		expect(local.hiddenDetailMetadataTv).toEqual(['status']);
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

	test('takes the screensaver customization stored in the profile', () => {
		const local = profileToLocal({
			screensaverBackdrop: 'neonPulse',
			screensaverComponent: 'runner',
			screensaverMovement: 'ultra',
			screensaverPosition: 'bottomRight',
			screensaverSize: 'large',
			screensaverContentType: 'tvshows',
			screensaverLibraryIds: ['0123456789abcdef0123456789abcdef'],
			screensaverCollectionIds: ['fedcba9876543210fedcba9876543210'],
			screensaverExcludedGenres: ['Horror']
		});

		expect(local.screensaverBackdrop).toBe('neonPulse');
		expect(local.screensaverComponent).toBe('runner');
		expect(local.screensaverMovement).toBe('ultra');
		expect(local.screensaverPosition).toBe('bottomRight');
		expect(local.screensaverSize).toBe('large');
		expect(local.screensaverContentType).toBe('tv');
		expect(local.screensaverLibraryIds).toEqual(['01234567-89ab-cdef-0123-456789abcdef']);
		expect(local.screensaverCollectionIds).toEqual(['fedcba98-7654-3210-fedc-ba9876543210']);
		expect(local.screensaverExcludedGenres).toEqual(['Horror']);
	});
});

describe('localToProfile', () => {
	test('says nothing about settings this app has no screen for', () => {
		const profile = localToProfile(defaultSettings);

		for (const key of ['showCastButton', 'detailShowTechnicalDetails', 'recommendationSystemSource',
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

	test('pushes the row padding sliders with their defaults', () => {
		const profile = localToProfile(defaultSettings);

		expect(profile.classicHomeRowsPadding).toBe(30);
		expect(profile.modernHomeRowsPadding).toBe(460);
	});

	test('keeps the local only home row list out of the profile', () => {
		const profile = localToProfile({...defaultSettings, customHomeRows: [{id: 'row'}]});

		expect(profile).not.toHaveProperty('customHomeRows');
	});

	test('sends the screensaver content type under the name the profile uses', () => {
		const profile = localToProfile({...defaultSettings, screensaverContentType: 'tv'}, ['screensaverContentType']);

		expect(profile).toEqual({screensaverContentType: 'tvshows'});
	});

	// Some synced keys have no default at all, which is how a screen asks for its built in
	// order rather than a stored one.
	test('invents nothing when there is no local value to send', () => {
		expect(localToProfile({})).toEqual({});
	});
});

describe('localToProfile with the keys the viewer changed', () => {
	test('sends those keys and nothing else', () => {
		const profile = localToProfile({...defaultSettings, themeMusicEnabled: true}, ['themeMusicEnabled']);

		expect(profile).toEqual({themeMusicEnabled: true});
	});

	test('a default the viewer never touched stays out of the profile', () => {
		// Once sent it is stored as the viewer's own choice and outranks what the admin
		// sets afterwards, so an untouched default must never go out on its own.
		const profile = localToProfile(defaultSettings, ['uiLanguage']);

		expect(profile).not.toHaveProperty('displayCollectionsRows');
		expect(profile).not.toHaveProperty('classicHomeRowsPadding');
	});

	test('the layout only goes when the rows were among the changes', () => {
		__resetHomeLayoutPassthrough();
		const rows = homeRowsFromProfile({homeSections: [{type: 'resume', enabled: true, order: 0}]});
		const local = {...defaultSettings, homeRows: rows};

		const without = localToProfile(local, ['themeMusicEnabled']);
		expect(without).not.toHaveProperty('homeSections');
		expect(without).not.toHaveProperty('homeRowOrder');

		const withRows = localToProfile(local, ['homeRows']);
		expect(withRows.homeRowOrder).toEqual(['resume']);
		expect(withRows.homeSections.length).toBeGreaterThan(0);
	});
});

describe('SYNCABLE_KEYS', () => {
	test('no key is listed twice', () => {
		const repeated = SYNCABLE_KEYS.filter((key, i) => SYNCABLE_KEYS.indexOf(key) !== i);

		expect(repeated).toEqual([]);
	});

	test('includes seerrShowMissingCollectionItems', () => {
		expect(SYNCABLE_KEYS).toContain('seerrShowMissingCollectionItems');
	});
});
