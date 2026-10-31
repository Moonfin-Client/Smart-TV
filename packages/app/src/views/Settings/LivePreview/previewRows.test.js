import {defaultSettings} from '../../../context/defaultSettings';
import {
	SCENE_BY_KEY, MEDIA_BAR_KEYS, FOCUSED_CARD_KEYS, NAV_BUTTON_KEYS, LOADING_KEYS, TRICKPLAY_KEYS, SCREENSAVER_KEYS,
	SUBTITLE_LOOK_KEYS, SUBTITLE_HDR_KEYS, describeRow, sceneOfRow
} from './previewRows';

describe('settings live preview rows', () => {
	test('every previewed entry is a row the schema has, and names its scene', () => {
		Object.keys(SCENE_BY_KEY).forEach((key) => {
			const row = describeRow(`setting-${key}`, defaultSettings);
			expect(row && row.scene).toBe(SCENE_BY_KEY[key]);
		});
		[...MEDIA_BAR_KEYS, ...FOCUSED_CARD_KEYS].forEach((key) => {
			expect(SCENE_BY_KEY[key]).toBe('home');
		});
	});

	test('a picker row lists its choices with the saved one marked', () => {
		const row = describeRow('setting-navbarPosition', {...defaultSettings, navbarPosition: 'left'});
		expect(row.key).toBe('navbarPosition');
		expect(row.scene).toBe('home');
		expect(row.options.map((option) => option.value)).toEqual(['top', 'left']);
		expect(row.saved).toBe(1);
	});

	test('a switch names its scene and offers no choices', () => {
		const row = describeRow('setting-showDescriptionOnPause', defaultSettings);
		expect(row.scene).toBe('player');
		expect(row.options).toEqual([]);
	});

	test('the details toggles, pickers and links show the details page', () => {
		['detailsBackdropEnabled', 'backdropBlurDetail', 'detailShowTechnicalDetails', 'detailExpandedTabs', 'detailButtonsMaxVisible', 'personalRatingStyle']
			.forEach((key) => {
				expect(describeRow(`setting-${key}`, defaultSettings).scene).toBe('details');
			});
		expect(describeRow('setting-detailButtons', defaultSettings)).toMatchObject({key: 'detailButtons', scene: 'details'});
		expect(describeRow('setting-detailMetadata', defaultSettings)).toMatchObject({key: 'detailMetadata', scene: 'details'});
	});

	test('each surface keeps its ratings on its own preview', () => {
		['mdblistEnabled', 'ratingSources', 'showRatingLabels', 'showRatingBadges', 'resetRatings'].forEach((name) => {
			expect(SCENE_BY_KEY[name]).toBe('details');
		});
		expect(MEDIA_BAR_KEYS).toEqual(expect.arrayContaining(['mediaBarMdblistEnabled', 'mediaBarRatingSources', 'mediaBarShowRatingLabels', 'mediaBarShowRatingBadges']));
		expect(FOCUSED_CARD_KEYS).toEqual(expect.arrayContaining(['homeRowsMdblistEnabled', 'homeRowsRatingSources', 'homeRowsShowRatingLabels', 'homeRowsShowRatingBadges']));
		// The previews draw a film, so episode ratings have nothing to show.
		expect(SCENE_BY_KEY.tmdbEpisodeRatingsEnabled).toBeUndefined();
		expect(SCENE_BY_KEY.homeRowsTmdbEpisodeRatingsEnabled).toBeUndefined();
	});

	test('a link the preview doesn\'t draw reports no status', () => {
		expect(describeRow('setting-diagnosticsLogging', defaultSettings)).toMatchObject({key: null, scene: null});
	});

	test('the video player\'s time labels show on the player', () => {
		expect(describeRow('setting-progressBarTime', defaultSettings)).toMatchObject({scene: 'player'});
		expect(SCENE_BY_KEY.playbackTimeBelowLeft).toBe('player');
	});

	test('rows the preview doesn\'t draw still describe themselves', () => {
		const row = describeRow('setting-alwaysAuthenticate', defaultSettings);
		expect(row.title).toBeTruthy();
		expect(row.scene).toBeNull();
	});

	test('a setting names its path instead of repeating its description', () => {
		const clock = describeRow('setting-clockDisplay', defaultSettings);
		expect(clock.path).toBe('General › Clock');
		expect(clock.description).toBe('');
		expect(describeRow('setting-showShuffleButton', defaultSettings).path).toBe('Appearance › Navigation Bar › Buttons');
		expect(describeRow('setting-fullScreenRows', defaultSettings).path).toBe('Appearance › Home Screen › Looks');
		// A screen reached from another one names that one too, whichever way it was opened.
		expect(describeRow('setting-mergeContinueWatchingNextUp', defaultSettings).path)
			.toBe('Appearance › Home Screen › Row Options › CONTINUE WATCHING AND NEXT UP');
		// The section shares the setting's name, so the path stops at the screen.
		expect(describeRow('setting-trickPlayMode', defaultSettings).path).toBe('Playback › Player');
		// A link names the section it sits in on the category's own page.
		expect(describeRow('setting-navigationBar', defaultSettings).path).toBe('Appearance › Navigation');
	});

	test('a section that isn\'t drawn stays out of the path', () => {
		expect(describeRow('setting-screensaverBackdrop', defaultSettings).path).toBe('Appearance › Screensaver › Visual Components');
		expect(describeRow('setting-screensaverBackdrop', {...defaultSettings, screensaverEnabled: false}).path).toBe('Appearance › Screensaver');
	});

	test('the pill\'s category keeps its description and has no path', () => {
		const category = describeRow('cat-general', defaultSettings);
		expect(category.description).toBeTruthy();
		expect(category.path).toBe('');
		expect(describeRow('subcat-player', defaultSettings)).toMatchObject({path: 'Playback', description: ''});
	});

	test('expanded rows and every navbar button switch show on home', () => {
		expect(SCENE_BY_KEY.fullScreenRows).toBe('home');
		expect(NAV_BUTTON_KEYS).toEqual(expect.arrayContaining(['showGenresButton', 'showLiveTvButton', 'showLibrariesInToolbar', 'showLibrariesIndividually', 'syncplayEnabled', 'showSyncPlayButton', 'showSeerrButton', 'showServerMessagesButton', 'showFriendsButton']));
		NAV_BUTTON_KEYS.forEach((key) => expect(SCENE_BY_KEY[key]).toBe('home'));
	});

	test('the loading animation and trick play settings keep the player on their look', () => {
		LOADING_KEYS.forEach((key) => {
			const row = describeRow(`setting-${key}`, defaultSettings);
			expect(row).toMatchObject({scene: 'player', stage: 'loading'});
			expect(sceneOfRow(row)).toBe('player');
		});
		TRICKPLAY_KEYS.forEach((key) => {
			expect(describeRow(`setting-${key}`, defaultSettings)).toMatchObject({scene: 'player', stage: 'trickplay'});
		});
		// A tile in the section that doesn't change the look still keeps it, and says it isn't shown.
		expect(describeRow('setting-trickPlayPauseWhileScrubbing', defaultSettings)).toMatchObject({scene: null, stage: 'trickplay'});
		// The rest of the player screen keeps its own moments.
		expect(describeRow('setting-showDescriptionOnPause', defaultSettings).stage).toBeNull();
		expect(describeRow('setting-loadingAnimation', defaultSettings)).toMatchObject({key: 'loadingAnimation', scene: 'player', stage: 'loading'});
	});

	test('the player buttons link and the chapter marks show the player', () => {
		expect(describeRow('setting-osdButtons', defaultSettings)).toMatchObject({key: 'osdButtons', scene: 'player', stage: null});
		expect(describeRow('setting-showChapterMarkers', defaultSettings)).toMatchObject({scene: 'player', stage: null});
		// The player draws its seek buttons without their lengths.
		expect(describeRow('setting-skipBackLength', defaultSettings).scene).toBeNull();
		expect(describeRow('setting-skipForwardLength', defaultSettings).scene).toBeNull();
	});

	test('every subtitle appearance tile keeps the player on the subtitle look', () => {
		expect(SUBTITLE_LOOK_KEYS).toHaveLength(21);
		expect(SUBTITLE_HDR_KEYS).toEqual(expect.arrayContaining(['subtitleHdrSeparate', 'subtitleColorHdr', 'subtitlePositionAbsoluteHdr']));
		SUBTITLE_LOOK_KEYS.forEach((key) => {
			expect(describeRow(`setting-${key}`, defaultSettings)).toMatchObject({scene: 'player', stage: 'subtitles'});
		});
		expect(describeRow('setting-subtitleCustomization', defaultSettings)).toMatchObject({key: 'subtitleCustomization', scene: 'player', stage: 'subtitles'});
		// The track and language settings keep the player with its controls up.
		['subtitleMode', 'subtitleLanguage'].forEach((key) => {
			expect(describeRow(`setting-${key}`, defaultSettings)).toMatchObject({scene: 'player', stage: null});
		});
	});

	test('every screensaver tile draws the screensaver over home', () => {
		SCREENSAVER_KEYS.forEach((key) => {
			expect(describeRow(`setting-${key}`, defaultSettings)).toMatchObject({scene: 'home', stage: 'screensaver'});
		});
		const timeout = describeRow('setting-screensaverTimeout', defaultSettings);
		expect(timeout).toMatchObject({scene: null, stage: 'screensaver'});
		expect(sceneOfRow(timeout)).toBe('home');
		expect(describeRow('setting-screensaverLibraries', defaultSettings)).toMatchObject({key: null, stage: 'screensaver'});
		expect(describeRow('setting-screensaver', defaultSettings)).toMatchObject({key: 'screensaver', scene: 'home', stage: 'screensaver'});
	});

	test('a row on no stage switches to its own scene, or none', () => {
		expect(sceneOfRow(describeRow('setting-detailScreenStyle', defaultSettings))).toBe('details');
		expect(sceneOfRow(describeRow('setting-alwaysAuthenticate', defaultSettings))).toBeNull();
		expect(sceneOfRow(null)).toBeNull();
	});

	test('labels that read more than the settings come from the schema context', () => {
		const seerr = {seerr: {isEnabled: true}};
		expect(describeRow('setting-showSeerrButton', defaultSettings, {...seerr, seerrLabel: 'Jellyseerr'}).title).toBe('Show Jellyseerr Button');
		// Nothing resolved is kept between calls, so a new name shows straight away.
		expect(describeRow('setting-showSeerrButton', defaultSettings, {...seerr, seerrLabel: 'Overseerr'}).title).toBe('Show Overseerr Button');
		expect(describeRow('setting-seerrHomeRows', defaultSettings, {...seerr, seerrLabel: 'Jellyseerr'}).title).toBe('Jellyseerr Rows');
		expect(describeRow('subcat-seerr', defaultSettings, {...seerr, seerrLabel: 'Jellyseerr'})).toMatchObject({title: 'Jellyseerr', path: 'Integrations'});
		expect(describeRow('setting-seerrShowMissingCollectionItems', defaultSettings, {...seerr, seerrLabel: 'Jellyseerr'}).path).toBe('Integrations › Jellyseerr');
	});

	test('the device rows name the platform and keep their section', () => {
		const capabilities = {tizenVersionDisplay: 'Tizen 8', modelName: 'UN32H5000'};
		expect(describeRow('info-osVersion', defaultSettings, {capabilities})).toMatchObject({title: 'Tizen Version', path: 'About › Device'});
		expect(describeRow('info-model', defaultSettings, {capabilities}).path).toBe('About › Device');
		expect(describeRow('info-osVersion', defaultSettings, {capabilities: {webosVersionDisplay: 'webOS 6'}}).title).toBe('webOS Version');
	});

	test('the settings passed on their own win over the ones in the schema context', () => {
		const row = describeRow('setting-navbarPosition', {...defaultSettings, navbarPosition: 'left'}, {settings: {...defaultSettings, navbarPosition: 'top'}});
		expect(row.saved).toBe(1);
	});

	test('category and unknown ids', () => {
		expect(describeRow('cat-account', defaultSettings).title).toBeTruthy();
		expect(describeRow('not-a-row', defaultSettings)).toBeNull();
		expect(describeRow(null, defaultSettings)).toBeNull();
	});
});
