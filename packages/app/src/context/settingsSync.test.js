// The server profile is typed, so a key this app spells differently isn't refused, it's
// quietly dropped. Nothing on this side can prove a field name is right, but these lock down
// what gets sent and what gets taken.

// Nothing renders here. The provider only needs React to exist while the module loads, and
// the real one can't be pulled in because the CLI ships a second copy that disagrees with it.
jest.mock('react/jsx-dev-runtime', () => ({}));
jest.mock('react', () => ({createContext: () => ({})}));
// Storage picks its platform module through a dynamic import that jest can't transform.
jest.mock('../services/storage', () => ({}));
// Only the profile save is ever reached, and the queue tests need to see where it went.
jest.mock('../services/seerrApi', () => ({saveMoonfinProfile: jest.fn(() => Promise.resolve(true))}));

import {saveMoonfinProfile} from '../services/seerrApi';
import {
	SYNCABLE_KEYS, SYNC_PROFILES, __pushQueue, activeSyncProfile, defaultSettings, flushSettingsPush,
	localToProfile, profileToLocal, resolveFromEnvelope, sameSyncedValue
} from './SettingsContext';
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

	test('takes detailButtonsMaxVisible under its own name', () => {
		const local = profileToLocal({
			detailButtonsMaxVisible: 3
		});

		expect(local.detailButtonsMaxVisible).toBe(3);
	});

	test('takes the TV metadata fields under their own names or PascalCase', () => {
		const local = profileToLocal({
			detailMetadataOrderTv: ['upcomingEpisodeDate', 'year'],
			HiddenDetailMetadataTv: ['status']
		});

		expect(local.detailMetadataOrderTv).toEqual(['upcomingEpisodeDate', 'year']);
		expect(local.hiddenDetailMetadataTv).toEqual(['status']);
	});

	test('takes the TV detail sections list under its own name or PascalCase', () => {
		expect(profileToLocal({hiddenDetailSectionsTv: ['cast']}).hiddenDetailSectionsTv).toEqual(['cast']);
		expect(profileToLocal({HiddenDetailSectionsTv: ['logo']}).hiddenDetailSectionsTv).toEqual(['logo']);
		expect(profileToLocal({hiddenDetailSectionsMobile: ['cast']})).toEqual({});
	});

	test('leaves the desktop and mobile button fields alone', () => {
		const local = profileToLocal({
			osdButtonOrderDesktop: ['desktop-order'],
			hiddenDetailButtonsMobile: ['mobile-hidden']
		});

		expect(local).toEqual({});
	});

	test("reads the other clients' card size names", () => {
		expect(profileToLocal({posterSize: 'medium'}).homeRowsPosterSize).toBe('default');
		expect(profileToLocal({posterSize: 'extraLarge'}).homeRowsPosterSize).toBe('xlarge');
		expect(profileToLocal({posterSize: 'grandparents'}).homeRowsPosterSize).toBe('grandparents');
		expect(profileToLocal({posterSize: 'xlarge'}).homeRowsPosterSize).toBe('xlarge');
		expect(profileToLocal({posterSize: 'huge'}).homeRowsPosterSize).toBeUndefined();
	});

	test('ignores a screensaver mode this app has no way to draw', () => {
		expect(profileToLocal({screensaverMode: 'off'}).screensaverMode).toBeUndefined();
		expect(profileToLocal({screensaverMode: 'logo'}).screensaverMode).toBe('logo');
	});

	test("takes Moonfin-Core's seasonal effect and density", () => {
		const local = profileToLocal({seasonalSurprise: 'fireworks', seasonalDensity: 'heavy'});

		expect(local.seasonalTheme).toBe('fireworks');
		expect(local.seasonalDensity).toBe('heavy');
	});

	test("maps this app's old seasonal effects that are still in the profile", () => {
		expect(profileToLocal({seasonalSurprise: 'winter'}).seasonalTheme).toBe('snow');
		expect(profileToLocal({seasonalSurprise: 'fall'}).seasonalTheme).toBe('leaves');
		expect(profileToLocal({seasonalSurprise: 'spring'}).seasonalTheme).toBe('petals');
		expect(profileToLocal({seasonalSurprise: 'summer'}).seasonalTheme).toBe('fireflies');
	});

	test('takes the newer seasonal effects as they are', () => {
		for (const effect of ['christmas', 'petals', 'fireflies', 'halloween']) {
			expect(profileToLocal({seasonalSurprise: effect}).seasonalTheme).toBe(effect);
		}
	});

	test('ignores a seasonal effect or density this app does not know', () => {
		const local = profileToLocal({seasonalSurprise: 'aurora', seasonalDensity: 'blizzard'});

		expect(local.seasonalTheme).toBeUndefined();
		expect(local.seasonalDensity).toBeUndefined();
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

	test('takes the dashboard camelCase rating sources in this app spelling, once each', () => {
		// A real TV profile. The picker didn't recognise myAnimeList, so ticking it added a
		// second entry, and the ratings row drew MyAnimeList twice.
		const local = profileToLocal({
			mdblistRatingSources: ['myAnimeList', 'imdb', 'tomatoes_audience', 'metacriticUser',
				'tmdb', 'letterboxd', 'trakt', 'myanimelist']
		});

		expect(local.mdblistRatingSources).toEqual(['myanimelist', 'imdb', 'tomatoes_audience',
			'metacriticuser', 'tmdb', 'letterboxd', 'trakt']);
	});

	test('folds the old RT audience ids into tomatoes_audience', () => {
		const local = profileToLocal({mdblistRatingSources: ['popcorn', 'imdb', 'rtAudience']});

		expect(local.mdblistRatingSources).toEqual(['tomatoes_audience', 'imdb']);
	});

	test('takes the loading animation stored in the profile', () => {
		const local = profileToLocal({
			loadingAnimationImage: 'neonfinPhases',
			loadingAnimationSize: 'large',
			loadingAnimationPosition: 'bouncing',
			loadingAnimationSpeed: 'ultra',
			showLoadingAnimationText: false
		});

		expect(local.loadingAnimationImage).toBe('neonfinPhases');
		expect(local.loadingAnimationSize).toBe('large');
		expect(local.loadingAnimationPosition).toBe('bouncing');
		expect(local.loadingAnimationSpeed).toBe('ultra');
		expect(local.showLoadingAnimationText).toBe(false);
	});

	test('keeps the loading animation it has when the profile names one it has no way to draw', () => {
		const local = profileToLocal({
			loadingAnimationImage: 'hourglass',
			loadingAnimationSize: 'huge',
			loadingAnimationPosition: 'staticCorner',
			loadingAnimationSpeed: 'staticCorner'
		});

		expect(local).toEqual({});
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
		expect(profile.modernHomeRowsPadding).toBe(420);
	});

	test('sends the card size under the names the other clients use', () => {
		const sizeFor = (homeRowsPosterSize) =>
			localToProfile({...defaultSettings, homeRowsPosterSize}, ['homeRowsPosterSize']).posterSize;

		expect(sizeFor('default')).toBe('medium');
		expect(sizeFor('xlarge')).toBe('extraLarge');
		expect(sizeFor('grandparents')).toBe('grandparents');
		expect(sizeFor('small')).toBe('small');
	});

	test('keeps the local only home row list out of the profile', () => {
		const profile = localToProfile({...defaultSettings, customHomeRows: [{id: 'row'}]});

		expect(profile).not.toHaveProperty('customHomeRows');
	});

	test('sends the screensaver content type under the name the profile uses', () => {
		const profile = localToProfile({...defaultSettings, screensaverContentType: 'tv'}, ['screensaverContentType']);

		expect(profile).toEqual({screensaverContentType: 'tvshows'});
	});

	test('sends rating sources in the camelCase the dashboard and Core use', () => {
		const profile = localToProfile({
			...defaultSettings,
			mdblistRatingSources: ['stars', 'myanimelist', 'metacriticuser', 'rogerebert', 'tomatoes_audience']
		}, ['mdblistRatingSources']);

		expect(profile).toEqual({
			mdblistRatingSources: ['stars', 'myAnimeList', 'metacriticUser', 'rogerEbert', 'tomatoes_audience']
		});
	});

	test('sends the loading animation under the names the other clients read', () => {
		const keys = ['loadingAnimationImage', 'loadingAnimationSize', 'loadingAnimationPosition', 'loadingAnimationSpeed', 'showLoadingAnimationText'];
		const profile = localToProfile({...defaultSettings, loadingAnimationImage: 'runner', showLoadingAnimationText: false}, keys);

		expect(profile).toEqual({
			loadingAnimationImage: 'runner',
			loadingAnimationSize: 'medium',
			loadingAnimationPosition: 'middle',
			loadingAnimationSpeed: 'fast',
			showLoadingAnimationText: false
		});
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

	test('includes groupItemsIntoCollections', () => {
		expect(SYNCABLE_KEYS).toContain('groupItemsIntoCollections');
	});

	test('includes detailButtonsMaxVisible', () => {
		expect(SYNCABLE_KEYS).toContain('detailButtonsMaxVisible');
	});

	test('includes seasonalDensity', () => {
		expect(SYNCABLE_KEYS).toContain('seasonalDensity');
	});

	test('includes the media preview switches', () => {
		expect(SYNCABLE_KEYS).toContain('episodePreviewEnabled');
		expect(SYNCABLE_KEYS).toContain('previewAudioEnabled');
	});
});

describe('the backdrop toggles', () => {
	test('take and send the home and details backdrops under the server names', () => {
		expect(profileToLocal({homeBackdropEnabled: false, detailsBackdropEnabled: false}))
			.toEqual({showHomeBackdrop: false, detailsBackdropEnabled: false});
		expect(localToProfile({...defaultSettings, showHomeBackdrop: false}, ['showHomeBackdrop']))
			.toEqual({homeBackdropEnabled: false});
	});
});

describe('the library style', () => {
	test('defaults to classic', () => {
		expect(defaultSettings.libraryStyle).toBe('classic');
	});

	test('takes and sends each style under its own name', () => {
		['classic', 'modern', 'docked'].forEach((style) => {
			expect(profileToLocal({libraryStyle: style})).toEqual({libraryStyle: style});
			expect(localToProfile({...defaultSettings, libraryStyle: style}, ['libraryStyle'])).toEqual({libraryStyle: style});
		});
	});

	test('keeps the style it has when the profile names one this app has no way to draw', () => {
		expect(profileToLocal({libraryStyle: 'grid'})).toEqual({});
	});
});

describe('the music library style', () => {
	test('defaults to immersive', () => {
		expect(defaultSettings.musicLibraryStyle).toBe('immersive');
	});

	test('takes and sends each style under its own name', () => {
		['classic', 'quickAccess', 'immersive'].forEach((style) => {
			expect(profileToLocal({musicLibraryStyle: style})).toEqual({musicLibraryStyle: style});
			expect(localToProfile({...defaultSettings, musicLibraryStyle: style}, ['musicLibraryStyle'])).toEqual({musicLibraryStyle: style});
		});
	});

	test('keeps the style it has when the profile names one this app has no way to draw', () => {
		expect(profileToLocal({musicLibraryStyle: 'bookstore'})).toEqual({});
	});
});

describe('the media preview switches', () => {
	test('default to off with sound on', () => {
		expect(defaultSettings.episodePreviewEnabled).toBe(false);
		expect(defaultSettings.previewAudioEnabled).toBe(true);
	});

	test('travel under the server keys as they are', () => {
		const profile = localToProfile({...defaultSettings, episodePreviewEnabled: true, previewAudioEnabled: false}, ['episodePreviewEnabled', 'previewAudioEnabled']);

		expect(profile).toEqual({episodePreviewEnabled: true, previewAudioEnabled: false});

		const local = profileToLocal({episodePreviewEnabled: true, previewAudioEnabled: false});

		expect(local.episodePreviewEnabled).toBe(true);
		expect(local.previewAudioEnabled).toBe(false);
	});
});

describe('localToProfile for the seasonal effect', () => {
	test('sends the effect and density under the names Core reads', () => {
		const profile = localToProfile(
			{...defaultSettings, seasonalTheme: 'confetti', seasonalDensity: 'light'},
			['seasonalTheme', 'seasonalDensity']
		);

		expect(profile).toEqual({seasonalSurprise: 'confetti', seasonalDensity: 'light'});
	});
});

describe('the seasonal row settings', () => {
	test('are syncable', () => {
		for (const key of ['seasonalRowEnabled', 'seasonalRowCountry', 'seasonalRowHiddenHolidays']) {
			expect(SYNCABLE_KEYS).toContain(key);
		}
	});

	test('take a country this app can read and drop one it cant', () => {
		expect(profileToLocal({seasonalRowCountry: 'ca'}).seasonalRowCountry).toBe('CA');
		expect(profileToLocal({seasonalRowCountry: 'other'}).seasonalRowCountry).toBe('other');
		expect(profileToLocal({seasonalRowCountry: 'everywhere'}).seasonalRowCountry).toBeUndefined();
	});

	test('keep only the holidays this app knows in the hidden list', () => {
		expect(profileToLocal({seasonalRowHiddenHolidays: ['pride', 'bogus']}).seasonalRowHiddenHolidays).toEqual(['pride']);
		expect(profileToLocal({seasonalRowHiddenHolidays: 'pride'}).seasonalRowHiddenHolidays).toBeUndefined();
	});

	test('carry the toggle through as it was sent', () => {
		expect(profileToLocal({seasonalRowEnabled: true}).seasonalRowEnabled).toBe(true);
		expect(profileToLocal({seasonalRowEnabled: false}).seasonalRowEnabled).toBe(false);
	});
});

describe('activeSyncProfile', () => {
	test('names each profile the plugin stores', () => {
		for (const profile of SYNC_PROFILES) {
			expect(activeSyncProfile(profile)).toBe(profile);
		}
	});

	test('follows the TV profile when nothing or something unknown is stored', () => {
		for (const stored of ['', undefined, null, 'TV', 'phone', 3]) {
			expect(activeSyncProfile(stored)).toBe('tv');
		}
	});
});

describe('the sync profile setting', () => {
	test('belongs to this device', () => {
		expect(defaultSettings.syncProfile).toBe('');
		expect(SYNCABLE_KEYS).not.toContain('syncProfile');
	});

	test('never goes out in a profile', () => {
		const local = {...defaultSettings, syncProfile: 'desktop'};

		expect(localToProfile(local)).not.toHaveProperty('syncProfile');
		expect(localToProfile(local, ['syncProfile'])).toEqual({});
	});

	test("can't be changed by a value the server holds", () => {
		expect(profileToLocal({syncProfile: 'global'})).toEqual({});
	});
});

describe('resolveFromEnvelope', () => {
	const admin = {themeMusicEnabled: false, themeMusicVolume: 10, navbarPosition: 'top', confirmExit: true, tmdbApiKey: 'admin-key'};
	const envelope = {
		global: {themeMusicVolume: 20, navbarPosition: 'left', tmdbApiKey: 'global-key'},
		desktop: {themeMusicVolume: 50},
		mobile: {themeMusicVolume: 60},
		tv: {themeMusicVolume: 40, themeMusicEnabled: true, tmdbApiKey: 'tv-key'}
	};

	test('lays the TV profile over global over the admin defaults when nothing is picked', () => {
		const resolved = resolveFromEnvelope(envelope, admin);

		expect(resolved.themeMusicVolume).toBe(40);
		expect(resolved.themeMusicEnabled).toBe(true);
		expect(resolved.navbarPosition).toBe('left');
		expect(resolved.exitConfirmation).toBe(true);
		expect(resolved.tmdbApiKey).toBe('tv-key');
		expect(resolveFromEnvelope(envelope, admin, '')).toEqual(resolved);
		expect(resolveFromEnvelope(envelope, admin, 'bogus')).toEqual(resolved);
	});

	test('reads the desktop and mobile profiles when one of them is active', () => {
		const desktop = resolveFromEnvelope(envelope, admin, 'desktop');
		const mobile = resolveFromEnvelope(envelope, admin, 'mobile');

		expect(desktop.themeMusicVolume).toBe(50);
		expect(mobile.themeMusicVolume).toBe(60);
		// What only the TV profile holds stays out, so the admin default shows through.
		expect(desktop.themeMusicEnabled).toBe(false);
		expect(mobile.themeMusicEnabled).toBe(false);
		expect(desktop.navbarPosition).toBe('left');
		expect(desktop.exitConfirmation).toBe(true);
		expect(desktop.tmdbApiKey).toBe('global-key');
	});

	test('has nothing above global when global is active', () => {
		const resolved = resolveFromEnvelope(envelope, admin, 'global');

		expect(resolved.themeMusicVolume).toBe(20);
		expect(resolved.themeMusicEnabled).toBe(false);
		expect(resolved.navbarPosition).toBe('left');
		expect(resolved.exitConfirmation).toBe(true);
		expect(resolved.tmdbApiKey).toBe('global-key');
	});

	test('falls back to the admin defaults alone when there is no envelope', () => {
		const resolved = resolveFromEnvelope(null, admin, 'global');

		expect(resolved.themeMusicVolume).toBe(10);
		expect(resolved.navbarPosition).toBe('top');
		expect(resolved.tmdbApiKey).toBe('admin-key');
	});

	test('takes the whole home layout from the active profile first', () => {
		__resetHomeLayoutPassthrough();
		const layouts = {
			global: {homeRowOrder: ['latestmedia']},
			desktop: {homeRowOrder: ['resume']},
			tv: {homeRowOrder: ['nextup']}
		};
		const enabledRows = (profile) => resolveFromEnvelope(layouts, null, profile).homeRows
			.filter((row) => row.enabled)
			.map((row) => row.id);

		expect(enabledRows('tv')).toEqual(['nextup']);
		expect(enabledRows('desktop')).toEqual(['resume']);
		expect(enabledRows('mobile')).toEqual(['latest-media']);
		expect(enabledRows('global')).toEqual(['latest-media']);
	});
});

describe('the per row image types', () => {
	test('go out under the server row names with Continue Watching on its own key', () => {
		const profile = localToProfile({
			homeRowImageTypes: {'latest-media': 'thumb', genres: 'thumb', resume: 'banner', nextup: 'logo'}
		}, ['homeRowImageTypes']);

		expect(profile.homeRowImageTypes).toBe('latestmedia:thumb,genres:thumb,nextup:logo');
		expect(profile.homeImageTypeContinueWatching).toBe('banner');
	});

	test('still go out when the last row is cleared', () => {
		const profile = localToProfile({homeRowImageTypes: {}}, ['homeRowImageTypes']);

		expect(profile.homeRowImageTypes).toBe('');
		expect(profile.homeImageTypeContinueWatching).toBe('');
	});

	test('stay home when another key changed', () => {
		const profile = localToProfile({homeRowImageTypes: {genres: 'thumb'}, showClock: true}, ['showClock']);

		expect(profile).not.toHaveProperty('homeRowImageTypes');
		expect(profile).not.toHaveProperty('homeImageTypeContinueWatching');
	});

	test("come back under this app's row ids, skipping what it doesn't know", () => {
		const local = profileToLocal({
			homeRowImageTypes: 'LatestMedia:Thumb,genres:thumb,resume:poster,nosuch:square,rewatch,,imdb_top_250_movies:banner',
			homeImageTypeContinueWatching: 'Poster'
		});

		expect(local.homeRowImageTypes).toEqual({
			'latest-media': 'thumb',
			genres: 'thumb',
			'imdb-top250-movies': 'banner',
			resume: 'poster'
		});
	});

	test("take Continue Watching alone when there's no list", () => {
		expect(profileToLocal({homeImageTypeContinueWatching: 'thumb'}).homeRowImageTypes).toEqual({resume: 'thumb'});
		expect(profileToLocal({homeImageTypeContinueWatching: ''})).not.toHaveProperty('homeRowImageTypes');
	});

	test('resolve the list and Continue Watching from their own layers', () => {
		const resolved = resolveFromEnvelope(
			{global: {homeImageTypeContinueWatching: 'banner'}, tv: {homeRowImageTypes: 'genres:thumb'}},
			{homeRowImageTypes: 'nextup:thumb', homeImageTypeContinueWatching: 'Poster'}
		);

		expect(resolved.homeRowImageTypes).toEqual({genres: 'thumb', resume: 'banner'});
		expect(resolveFromEnvelope({}, {homeRowImageTypes: 'genres:thumb'}).homeRowImageTypes).toEqual({genres: 'thumb'});
		expect(resolveFromEnvelope({}, {})).not.toHaveProperty('homeRowImageTypes');
	});

	test('migrates legacy hideDetailsMediaDescription to granular movie, episode, and seerr movie settings', () => {
		const local = profileToLocal({hideDetailsMediaDescription: true});
		expect(local.hideDetailsMediaDescriptionMovie).toBe(true);
		expect(local.hideDetailsMediaDescriptionEpisode).toBe(true);
		expect(local.hideDetailsMediaDescriptionSeerrMovie).toBe(true);
		expect(local.hideDetailsMediaDescription).toBeUndefined();

		const partial = profileToLocal({
			hideDetailsMediaDescription: true,
			hideDetailsMediaDescriptionMovie: false
		});
		expect(partial.hideDetailsMediaDescriptionMovie).toBe(false);
		expect(partial.hideDetailsMediaDescriptionEpisode).toBe(true);
		expect(partial.hideDetailsMediaDescriptionSeerrMovie).toBe(true);
		expect(partial.hideDetailsMediaDescription).toBeUndefined();
	});
});

describe('the profile push queue', () => {
	const creds = {current: {serverUrl: 'http://server', token: 'token'}};
	const settingsFor = (syncProfile, changes) => ({...defaultSettings, syncProfile, ...changes});

	beforeEach(() => {
		jest.useFakeTimers();
		__pushQueue.drop();
		saveMoonfinProfile.mockClear();
		saveMoonfinProfile.mockImplementation(() => Promise.resolve(true));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('sends a change to the profile that is active', () => {
		__pushQueue.queue(settingsFor('desktop', {themeMusicEnabled: true}), creds, ['themeMusicEnabled']);
		jest.runAllTimers();

		expect(saveMoonfinProfile).toHaveBeenCalledTimes(1);
		expect(saveMoonfinProfile).toHaveBeenCalledWith('desktop', {themeMusicEnabled: true}, 'http://server', 'token');
	});

	test('sends to the TV profile when nothing is picked', () => {
		__pushQueue.queue(settingsFor('', {themeMusicEnabled: true}), creds, ['themeMusicEnabled']);
		jest.runAllTimers();

		expect(saveMoonfinProfile.mock.calls[0][0]).toBe('tv');
	});

	test('a change queued before the profile changed goes to the profile it was made under', () => {
		__pushQueue.queue(settingsFor('', {themeMusicEnabled: true}), creds, ['themeMusicEnabled']);
		__pushQueue.handOver();
		__pushQueue.queue(settingsFor('global', {navbarPosition: 'left'}), creds, ['navbarPosition']);
		jest.runAllTimers();

		expect(saveMoonfinProfile.mock.calls).toEqual([
			['tv', {themeMusicEnabled: true}, 'http://server', 'token'],
			['global', {navbarPosition: 'left'}, 'http://server', 'token']
		]);
	});

	test('a queued change never rides along to another profile, even without a hand over', () => {
		__pushQueue.queue(settingsFor('mobile', {themeMusicEnabled: true}), creds, ['themeMusicEnabled']);
		__pushQueue.queue(settingsFor('desktop', {navbarPosition: 'left'}), creds, ['navbarPosition']);
		jest.runAllTimers();

		expect(saveMoonfinProfile.mock.calls).toEqual([
			['mobile', {themeMusicEnabled: true}, 'http://server', 'token'],
			['desktop', {navbarPosition: 'left'}, 'http://server', 'token']
		]);
	});

	test('a change that failed to send stays with the profile it was made under', async () => {
		saveMoonfinProfile.mockImplementationOnce(() => Promise.reject(new Error('offline')));
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		__pushQueue.queue(settingsFor('', {themeMusicEnabled: true}), creds, ['themeMusicEnabled']);
		await flushSettingsPush();
		__pushQueue.handOver();
		__pushQueue.queue(settingsFor('desktop', {navbarPosition: 'left'}), creds, ['navbarPosition']);
		jest.runAllTimers();
		warn.mockRestore();

		expect(saveMoonfinProfile.mock.calls[1]).toEqual(['desktop', {navbarPosition: 'left'}, 'http://server', 'token']);
	});

	test('a change made before there were credentials stays with the profile it was made under', () => {
		__pushQueue.queue(settingsFor('', {themeMusicEnabled: true}), {current: null}, ['themeMusicEnabled']);
		__pushQueue.handOver();
		__pushQueue.queue(settingsFor('global', {navbarPosition: 'left'}), creds, ['navbarPosition']);
		jest.runAllTimers();

		expect(saveMoonfinProfile.mock.calls).toEqual([
			['global', {navbarPosition: 'left'}, 'http://server', 'token']
		]);
	});
});

test('Home rows read back from the webOS database still match the server copy', () => {
	const server = [{id: 'resume', name: 'Continue Watching', enabled: true, order: 0}];
	const kept = [{_id: '1a', enabled: true, id: 'resume', name: 'Continue Watching', order: 0}];
	expect(sameSyncedValue(server, kept)).toBe(true);
	expect(sameSyncedValue(server, [{...kept[0], enabled: false}])).toBe(false);
	expect(sameSyncedValue(server, [...kept, {_id: '1b', id: 'nextup', enabled: true, order: 1}])).toBe(false);
});
