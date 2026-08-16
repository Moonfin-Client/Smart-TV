import $L from '@enact/i18n/$L';

import {
	getAccentColorOptions,
	getAgeRatingOptions,
	getAudioLanguageOptions,
	getAutoLoginOptions,
	getBitrateOptions,
	getBlurOptions,
	getClockDisplayOptions,
	getContentTypeOptions,
	getDetailScreenStyleOptions,
	getDetailsOpacityOptions,
	getEnabledRatingSourcesSummary,
	getFeaturedBarStyleOptions,
	getFeaturedItemCountOptions,
	getFolderViewModeOptions,
	getGenresRowItemFilterOptions,
	getHomeRowSortOptions,
	getHomeRowsStyleOptions,
	getImageTypeOptions,
	getMaxAudioChannelsOptions,
	getMaxResolutionOptions,
	getMediaSegmentActionOptions,
	getMediaSegmentAutoHideOptions,
	getNavPositionOptions,
	getNextUpBehaviorOptions,
	getNextUpCountdownStyleOptions,
	getNextUpMaxDaysOptions,
	getOledModeOptions,
	getOverlayColorOptions,
	getPassthroughModeOptions,
	getPerformanceModeOptions,
	getPersonalRatingStyleOptions,
	getPlaybackTimeDisplayOptions,
	getPlaybackTimeSlotOptions,
	getPosterSizeOptions,
	getResumeRewindOptions,
	getRewatchSortOptions,
	getScreensaverClockOptions,
	getScreensaverDimmingOptions,
	getScreensaverModeOptions,
	getScreensaverTimeoutOptions,
	getSeasonalThemeOptions,
	getSeekStepOptions,
	getServerSortOptions,
	getSkipLengthOptions,
	getSortOrderOptions,
	getSinceYouWatchedSourceItemOptions,
	getSinceYouWatchedSourceOptions,
	getSinceYouWatchedSourceTypeOptions,
	getStillWatchingBehaviorOptions,
	getSubtitleBackgroundColorOptions,
	getSubtitleColorOptions,
	getSubtitleLanguageOptions,
	getSubtitleModeOptions,
	getSubtitlePositionOptions,
	getSubtitleShadowColorOptions,
	getSubtitleSizeOptions,
	getUiLanguageOptions,
	getUiScaleOptions,
	getWatchedIndicatorOptions,
	getZoomModeOptions
} from './settingsOptions';

// This module describes every settings screen as data. Settings.js renders it and the
// search index reads it, so a row only ever has to be written once. It deliberately
// imports no JSX and no styles, which keeps it importable from a plain jest test.
//
// The hierarchy, groupings, and wording follow the other clients' TV settings so the same
// setting lives in the same place on every client. A subcategory's `section` labels the
// group it renders under in its category menu, and `menu: false` keeps a screen out of
// that menu when it is only reached from a row elsewhere.
//
// Every piece of text is a function rather than a string, because $L reads the active
// locale when it is called and the bundle is not loaded when this module is imported.

export const KIND = {
	TOGGLE: 'toggle',
	OPTION: 'option',
	SLIDER: 'slider',
	NAV: 'nav',
	INFO: 'info',
	SECTION: 'section',
	DIVIDER: 'divider',
	TEXT: 'text',
	CUSTOM: 'custom'
};

export const resolve = (value, ctx) => (typeof value === 'function' ? value(ctx) : value);

// The spotlight id the row will carry once rendered, which is what a search result
// focuses after it opens the screen.
export const spotlightIdOf = (row) => {
	if (row.kind === KIND.INFO) return `info-${row.id}`;
	if (row.kind === KIND.NAV) return `setting-${row.id}`;
	return `setting-${row.key}`;
};

const seconds = (v) => `${v}s`;
const percent = (v) => `${v}%`;
const hourOffset = (v) => (v > 0 ? `+${v}h` : `${v}h`);
const pixels = (v) => `${v}px`;
const milliseconds = (v) => `${v} ms`;

const hasHomeRow = (test) => (ctx) =>
	(ctx.settings.homeRows || []).some((row) => row.enabled && test(row));

const whenSinceYouWatched = hasHomeRow((row) => row.id.startsWith('sinceyouwatched'));
const whenRewatch = hasHomeRow((row) => row.id === 'rewatch');
const whenRewatchEnabled = (ctx) => whenRewatch(ctx) && ctx.settings.displayRewatchRow !== false;
const whenPlugin = (ctx) => ctx.settings.useMoonfinPlugin;
const whenHdrSubtitles = (ctx) => ctx.settings.subtitleHdrSeparate;
const whenSeerr = (ctx) => ctx.seerr.isEnabled;
const whenScreensaver = (ctx) => ctx.settings.screensaverEnabled;
const whenScreensaverLibrary = (ctx) => ctx.settings.screensaverEnabled && ctx.settings.screensaverMode === 'library';
const whenPassthrough = (ctx) => ctx.settings.audioPassthroughMode === 'manual';
const whenSyncCorrection = (ctx) => ctx.settings.syncPlayAdvancedCorrectionEnabled !== false;
const whenSpeedToSync = (ctx) => whenSyncCorrection(ctx) && ctx.settings.syncPlayUseSpeedToSync !== false;

const countLabel = (count) => $L('{count} selected').replace('{count}', String(count));

// Neither flag is known until the ping answers, and having no answer says nothing
// about what the admin chose, so report that rather than a definite no.
const pluginFlag = (flag, yes, no) => {
	if (flag === true) return yes;
	if (flag === false) return no;
	return $L('Unknown');
};

export const SETTINGS_SCHEMA = [
	{
		id: 'accountSecurity',
		label: () => $L('Account & Security'),
		description: () => $L('Authentication, PIN code, and parental controls'),
		icon: 'lock',
		subcategories: [
			{
				id: 'account',
				icon: 'lock',
				label: () => $L('Account & Security'),
				description: () => $L('Authentication, PIN code, and parental controls'),
				rows: [
					{kind: KIND.SECTION, id: 'authentication', label: () => $L('Authentication')},
					{kind: KIND.OPTION, key: 'autoLoginBehavior', label: () => $L('Auto Login'), desc: () => $L('Which account signs in on app launch'), options: getAutoLoginOptions, fallback: () => $L('Last User'), icon: 'user'},
					{kind: KIND.TOGGLE, key: 'alwaysAuthenticate', label: () => $L('Always Authenticate'), desc: () => $L('Require password even with stored token'), icon: 'lock'},
					{kind: KIND.TOGGLE, key: 'pinCodeProtection', label: () => $L('PIN Code Protection'), desc: () => $L('Require a PIN to access your account'), icon: 'pin'},
					{
						kind: KIND.NAV,
						id: 'pinCode',
						label: () => $L('PIN Code'),
						desc: (ctx) => (typeof ctx.settings.pinCode === 'string' && /^\d{4}$/.test(ctx.settings.pinCode)
							? $L('Configured 4-digit PIN')
							: $L('Default PIN: 0000')),
						icon: 'pin',
						action: (ctx) => ctx.actions.openPinCode()
					},
					{kind: KIND.SECTION, id: 'accountPreferences', label: () => $L('Account Preferences')},
					{kind: KIND.OPTION, key: 'uiLanguage', label: () => $L('Interface Language'), options: getUiLanguageOptions, fallback: () => $L('English'), icon: 'language'},
					{kind: KIND.OPTION, key: 'serverSortBy', label: () => $L('Sort Servers By'), options: getServerSortOptions, fallback: () => $L('Server Name'), icon: 'swap_horiz'},
					{kind: KIND.SECTION, id: 'privacySafety', label: () => $L('Privacy & Safety')},
					{
						kind: KIND.NAV,
						id: 'parentalControls',
						label: () => $L('Parental Controls'),
						desc: (ctx) => {
							const count = Array.isArray(ctx.settings.blockedRatings) ? ctx.settings.blockedRatings.length : 0;
							return count > 0
								? $L('{count} ratings blocked').replace('{count}', String(count))
								: $L('Block content by age rating');
						},
						icon: 'shield',
						action: (ctx) => ctx.actions.openParentalControls()
					},
					{kind: KIND.TOGGLE, key: 'exitConfirmation', label: () => $L('Confirm Exit'), desc: () => $L('Show confirmation before exiting'), icon: 'exit'},
					{kind: KIND.SECTION, id: 'connection', label: () => $L('Connection'), when: (ctx) => ctx.isWebOS},
					{
						kind: KIND.TOGGLE,
						key: 'allowInsecureCerts',
						label: () => $L('Allow Untrusted Certificates'),
						desc: () => $L('If your TV rejects a server\'s security certificate, fetch through the proxy without verifying it. Use only for servers you trust.'),
						icon: 'gpp_maybe',
						when: (ctx) => ctx.isWebOS
					}
				]
			}
		]
	},
	{
		id: 'personalization',
		label: () => $L('Personalization'),
		description: () => $L('Theme, navigation, home rows, and library visibility'),
		icon: 'palette',
		subcategories: [
			{
				id: 'generalStyle',
				icon: 'style',
				section: () => $L('Appearance'),
				label: () => $L('General Style'),
				description: () => $L('Theme accents, backdrops, and watched indicators'),
				rows: [
					{kind: KIND.SECTION, id: 'theme', label: () => $L('Theme')},
					{
						kind: KIND.NAV,
						id: 'themeSelection',
						icon: 'palette',
						label: () => $L('App Theme'),
						desc: (ctx) => ctx.availableThemes.find((t) => t.id === ctx.activeThemeId)?.displayName || $L('Default'),
						action: (ctx) => ctx.actions.openThemes()
					},
					{
						kind: KIND.NAV,
						id: 'themeStore',
						icon: 'storefront',
						label: () => $L('Theme Store'),
						desc: () => $L('Browse and save community themes'),
						action: (ctx) => ctx.actions.openThemeStore()
					},
					{kind: KIND.OPTION, key: 'focusBorderColor', label: () => $L('Focus Border Color'), options: getAccentColorOptions, fallback: () => $L('Theme Default'), icon: 'border_color'},
					{kind: KIND.SECTION, id: 'keyboard', label: () => $L('Keyboard')},
					{kind: KIND.TOGGLE, key: 'preferSystemImeKeyboard', label: () => $L('Prefer system keyboard'), desc: () => $L('Use your device input method by default for text entry'), icon: 'keyboard'},
					{kind: KIND.SECTION, id: 'clock', label: () => $L('Clock')},
					{kind: KIND.OPTION, key: 'clockDisplay', label: () => $L('Clock Display'), options: getClockDisplayOptions, fallback: () => $L('24-Hour'), icon: 'clock'},
					{kind: KIND.SLIDER, key: 'timeOffsetHours', label: () => $L('Clock Offset'), desc: () => $L('Correct the clock when the TV reports the wrong time'), min: -12, max: 12, step: 1, format: hourOffset, icon: 'clock'},
					{kind: KIND.SECTION, id: 'display', label: () => $L('Display')},
					{kind: KIND.TOGGLE, key: 'cardFocusZoom', label: () => $L('Focus Expansion Animation'), desc: () => $L('Scale focused or hovered cards and tiles'), icon: 'zoom_in'},
					{kind: KIND.OPTION, key: 'uiScale', label: () => $L('UI Scaling'), options: getUiScaleOptions, fallback: () => $L('Default'), icon: 'zoom_out_map'},
					{kind: KIND.TOGGLE, key: 'showHomeBackdrop', label: () => $L('Background Backdrops'), desc: () => $L('Show backdrop images behind content'), icon: 'photo'},
					{kind: KIND.OPTION, key: 'backdropBlurHome', label: () => $L('Browsing Background Blur'), options: getBlurOptions, fallback: () => $L('Medium'), icon: 'blur_circular'},
					{kind: KIND.OPTION, key: 'watchedIndicatorBehavior', label: () => $L('Watched Indicators'), options: getWatchedIndicatorOptions, fallback: () => $L('Always'), icon: 'check_circle'},
					{kind: KIND.OPTION, key: 'oledMode', label: () => $L('OLED Mode'), desc: () => $L('Darken surfaces toward true black and boost artwork colors'), options: getOledModeOptions, fallback: () => $L('Off'), icon: 'oled'},
					{kind: KIND.OPTION, key: 'performanceMode', label: () => $L('Performance Mode'), options: getPerformanceModeOptions, fallback: () => $L('Auto'), icon: 'gear'}
				]
			},
			{
				id: 'detailsScreen',
				icon: 'article',
				section: () => $L('Appearance'),
				label: () => $L('Details Screen'),
				description: () => $L('Style, background blur, and tab behavior'),
				rows: [
					{kind: KIND.SECTION, id: 'detailsDisplay', label: () => $L('Display')},
					{kind: KIND.OPTION, key: 'detailScreenStyle', label: () => $L('Detail Screen Style'), desc: () => $L('Classic is the original centered moonfin layout. Modern is a responsive cinematic layout.'), options: getDetailScreenStyleOptions, fallback: () => $L('Modern'), icon: 'movie'},
					{
						kind: KIND.OPTION,
						key: 'backdropBlurDetail',
						icon: 'blur_on',
						label: (ctx) => (ctx.settings.detailScreenStyle === 'v1'
							? $L('Details Background Blur')
							: $L('Details Background Opacity')),
						options: (ctx) => (ctx.settings.detailScreenStyle === 'v1'
							? getBlurOptions()
							: getDetailsOpacityOptions()),
						fallback: (ctx) => (ctx.settings.detailScreenStyle === 'v1' ? $L('Medium') : '80%')
					},
					{kind: KIND.TOGGLE, key: 'detailExpandedTabs', label: () => $L('Expanded Tabs'), desc: () => $L('Automatically show tab content while browsing tabs. Turn off to open and close each tab manually.'), icon: 'tab', when: (ctx) => ctx.settings.detailScreenStyle !== 'v1'},
					{kind: KIND.OPTION, key: 'personalRatingStyle', label: () => $L('Personal Rating Style'), desc: () => $L('How your own rating is shown and entered on a movie'), options: getPersonalRatingStyleOptions, fallback: () => $L('Like / dislike'), icon: 'rate_review'},
					{kind: KIND.NAV, id: 'detailButtons', label: () => $L('Action Buttons'), desc: () => $L('Choose which buttons the details screen shows'), icon: 'buttons_alt', action: (ctx) => ctx.actions.openDetailButtons()},
					{kind: KIND.SECTION, id: 'mediaDetailsAndSpoilers', label: () => $L('Media Details and Spoilers')},
					{kind: KIND.TOGGLE, key: 'detailShowTechnicalDetails', label: () => $L('Show Technical Details'), desc: () => $L('Show codec, resolution, and stream information in banner summary'), icon: 'info'},
					{kind: KIND.TOGGLE, key: 'hideDetailsMediaDescription', label: () => $L('Hide Media Description on Details Page'), desc: () => $L('Hide the movie or episode descriptive text.'), icon: 'hide'},
					{kind: KIND.TOGGLE, key: 'detailUseSeriesThumbnails', label: () => $L('Use Series Thumbnails on Details Page'), desc: () => $L('Replace all thumbnails on Classic details page with series thumbnail'), icon: 'aspectratio', when: (ctx) => ctx.settings.detailScreenStyle === 'v1'}
				]
			},
			{
				id: 'navigation',
				icon: 'view_sidebar',
				section: () => $L('Appearance'),
				label: () => $L('Navigation'),
				description: () => $L('Navbar style, toolbar buttons, appearance'),
				rows: [
					{kind: KIND.SECTION, id: 'navAppearance', label: () => $L('Appearance')},
					{kind: KIND.OPTION, key: 'navbarPosition', label: () => $L('Navigation Style'), options: getNavPositionOptions, fallback: () => $L('Top Bar'), icon: 'browser'},
					{kind: KIND.OPTION, key: 'navbarColor', label: () => $L('Navbar Color'), options: getOverlayColorOptions, fallback: () => $L('Gray'), icon: 'colorpicker'},
					{kind: KIND.SLIDER, key: 'navbarOpacity', label: () => $L('Navbar Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity'},
					{kind: KIND.TOGGLE, key: 'navbarAlwaysExpanded', label: () => $L('Always Expand Navbar Labels'), desc: () => $L('Show every button label instead of only the focused one'), icon: 'expandlabels', when: (ctx) => ctx.settings.navbarPosition !== 'left'},
					{kind: KIND.SECTION, id: 'navButtons', label: () => $L('Buttons')},
					{kind: KIND.TOGGLE, key: 'showShuffleButton', label: () => $L('Show Shuffle Button'), desc: () => $L('Show the shuffle button in the navigation bar'), icon: 'shuffle'},
					{kind: KIND.OPTION, key: 'shuffleContentType', label: () => $L('Shuffle Content Type Filter'), options: getContentTypeOptions, fallback: () => $L('Movies & TV Shows'), icon: 'shuffle', when: (ctx) => ctx.settings.showShuffleButton},
					{kind: KIND.TOGGLE, key: 'showGenresButton', label: () => $L('Show Genres Button'), desc: () => $L('Show the genres button in the navigation bar'), icon: 'category'},
					{kind: KIND.TOGGLE, key: 'showFavoritesButton', label: () => $L('Show Favorites Button'), desc: () => $L('Show the favorites button in the navigation bar'), icon: 'heart'},
					{kind: KIND.TOGGLE, key: 'showLibrariesInToolbar', label: () => $L('Show Libraries in Toolbar'), desc: () => $L('Show the libraries button in the navigation bar'), icon: 'video_library'},
					{kind: KIND.OPTION, key: 'folderViewMode', label: () => $L('Enable Folder View'), options: getFolderViewModeOptions, fallback: () => $L('Per Library'), icon: 'folder'},
					{kind: KIND.TOGGLE, key: 'showSeerrButton', label: (ctx) => $L('Show {seerrLabel} Button').replace('{seerrLabel}', ctx.seerrLabel), desc: () => $L('Show the Seerr button in the navigation bar'), when: whenSeerr, icon: 'seerr'}
				]
			},
			{
				id: 'screensaver',
				icon: 'wallpaper',
				section: () => $L('Appearance'),
				label: () => $L('Screensaver'),
				description: () => $L('Enable the built-in screensaver'),
				rows: [
					{kind: KIND.SECTION, id: 'screensaver', label: () => $L('Screensaver')},
					{kind: KIND.TOGGLE, key: 'screensaverEnabled', label: () => $L('In-App Screensaver'), desc: () => $L('Enable the built-in screensaver'), icon: 'wallpaper'},
					{kind: KIND.OPTION, key: 'screensaverMode', label: () => $L('Mode'), options: getScreensaverModeOptions, fallback: () => $L('Library Art'), icon: 'star_shine', when: whenScreensaver},
					{kind: KIND.OPTION, key: 'screensaverTimeout', label: () => $L('Timeout'), options: getScreensaverTimeoutOptions, fallback: () => $L('90 seconds'), icon: 'timer', when: whenScreensaver},
					{kind: KIND.OPTION, key: 'screensaverDimmingLevel', label: () => $L('Dimming Level'), options: getScreensaverDimmingOptions, fallback: '50%', icon: 'brightness_6', when: whenScreensaver},
					{kind: KIND.OPTION, key: 'screensaverClockMode', label: () => $L('Show Clock'), desc: () => $L('How the clock appears during the screensaver'), options: getScreensaverClockOptions, fallback: () => $L('Static'), icon: 'clock', when: whenScreensaver},
					{kind: KIND.OPTION, key: 'screensaverMaxRating', label: () => $L('Max Age Rating'), options: getAgeRatingOptions, fallback: 'PG-13', icon: 'lockcircle', when: whenScreensaverLibrary},
					{kind: KIND.TOGGLE, key: 'screensaverAgeFilter', label: () => $L('Require Age Rating'), desc: () => $L('Only show rated content'), icon: 'verified_user', when: whenScreensaverLibrary}
				]
			},
			{
				id: 'homePage',
				icon: 'home',
				section: () => $L('Layout'),
				label: () => $L('Home Screen'),
				description: () => $L('Sections, image types, overlays, and media previews'),
				rows: [
					{kind: KIND.SECTION, id: 'homeRowDisplay', label: () => $L('Home Row Display')},
					{kind: KIND.OPTION, key: 'homeRowsStyle', label: () => $L('Row Type'), desc: () => $L('Classic keeps per-row image type and info overlay. Modern uses portrait-to-backdrop rows.'), options: getHomeRowsStyleOptions, fallback: () => $L('Modern'), icon: 'appscontents'},
					{kind: KIND.TOGGLE, key: 'fullScreenRows', label: () => $L('Expanded Home Rows'), desc: () => $L('Limit home rows to 1 row per screen'), icon: 'aspectratio'},
					{kind: KIND.TOGGLE, key: 'homeRowOverlay', label: () => $L('Home Row Info Overlay'), desc: () => $L('Show title and metadata for the focused item above classic rows'), icon: 'info', when: (ctx) => ctx.settings.homeRowsStyle === 'v1'},
					{kind: KIND.OPTION, key: 'homeRowsPosterSize', label: () => $L('Home Row Card Display Size'), options: getPosterSizeOptions, fallback: () => $L('Default'), icon: 'photo_size_select_large'},
					{kind: KIND.SLIDER, key: 'classicHomeRowsPadding', label: () => $L('Home Row Padding'), desc: () => $L('Vertical space between rows'), min: 10, max: 130, step: 20, format: pixels, icon: 'unfold_more', when: (ctx) => ctx.settings.homeRowsStyle === 'v1' && !ctx.settings.fullScreenRows && !ctx.settings.homeRowOverlay},
					{kind: KIND.SLIDER, key: 'modernHomeRowsPadding', label: () => $L('Home Row Padding'), desc: () => $L('Vertical space between rows'), min: 360, max: 560, step: 20, format: pixels, icon: 'unfold_more', when: (ctx) => ctx.settings.homeRowsStyle !== 'v1' && !ctx.settings.fullScreenRows},
					{kind: KIND.SECTION, id: 'continueWatchingAndNextUp', label: () => $L('Continue Watching and Next Up')},
					{kind: KIND.TOGGLE, key: 'mergeContinueWatchingNextUp', label: () => $L('Merge Continue Watching and Next Up'), desc: () => $L('Combine both rows into a single home section'), icon: 'merge_type'},
					{kind: KIND.OPTION, key: 'nextUpMaxDays', label: () => $L('Max Days in Next Up'), options: getNextUpMaxDaysOptions, fallback: () => $L('365 days'), desc: () => $L('How long a show stays in Next Up after you last watched it'), icon: 'calendarbusy'},
					{kind: KIND.TOGGLE, key: 'useSeriesThumbnails', label: () => $L('Display Series Thumbnails'), desc: () => $L('For TV series, use the main series artwork instead of the episode thumbnail'), icon: 'aspectratio'},
					{kind: KIND.SECTION, id: 'homeMediaDetailsAndSpoilers', label: () => $L('Media Details and Spoilers')},
					{kind: KIND.TOGGLE, key: 'hideHomeMediaDescription', label: () => $L('Hide Media Description on Home Screen'), desc: () => $L('Hide the movie or episode descriptive text.'), icon: 'hide'},
					{kind: KIND.SECTION, id: 'homeRowSections', label: () => $L('Home Row Sections')},
					{kind: KIND.NAV, id: 'homeRows', label: () => $L('Home Sections'), desc: () => $L('Reorder and toggle both library and external-based home rows'), icon: 'list', action: (ctx) => ctx.actions.openHomeRows()},
					{kind: KIND.NAV, id: 'homeRowToggles', label: () => $L('Home Row Toggles'), desc: () => $L('Enable or disable library-based home row categories'), icon: 'tune', action: (ctx) => ctx.actions.openScreen('personalization', 'homeRowToggles', 'setting-homeRowToggles')},
					{kind: KIND.OPTION, key: 'homeRowsImageType', label: () => $L('Home Rows Image Type'), desc: () => $L('The artwork rows use unless a row overrides it'), options: getImageTypeOptions, fallback: () => $L('Poster'), icon: 'picture'},
					{kind: KIND.NAV, id: 'rowImageTypes', label: () => $L('Row Image Types'), desc: () => $L('Choose the artwork per home row. Classic rows only, the modern layout picks its own.'), icon: 'picture', when: (ctx) => ctx.settings.homeRowsStyle === 'v1', action: (ctx) => ctx.actions.openRowImageTypes()},
					{kind: KIND.NAV, id: 'externalHomeRows', label: () => $L('External Home Rows'), desc: () => $L('Set-up external sources for Home Rows (e.g., Seerr, IMDb, and more!)'), icon: 'link', action: (ctx) => ctx.actions.openScreen('integrations', 'externalRows', 'setting-externalHomeRows'), when: whenPlugin}
				]
			},
			{
				id: 'homeRowToggles',
				icon: 'tune',
				menu: false,
				label: () => $L('Home Row Toggles'),
				description: () => $L('Enable or disable library-based home row categories'),
				rows: [
					{kind: KIND.SECTION, id: 'audio', label: () => $L('Audio')},
					{kind: KIND.TOGGLE, key: 'displayAudioRows', label: () => $L('Display Audio Rows'), desc: () => $L('Show artist, album, and music playlist rows in Home Sections.'), icon: 'music'},
					{kind: KIND.OPTION, key: 'audioRowsSortBy', label: () => $L('Audio Rows Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort', when: (ctx) => ctx.settings.displayAudioRows},
					{kind: KIND.OPTION, key: 'audioRowsSortOrder', label: () => $L('Audio Rows Sort Order'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayAudioRows},
					{kind: KIND.SECTION, id: 'collections', label: () => $L('Collections')},
					{kind: KIND.TOGGLE, key: 'displayCollectionsRows', label: () => $L('Display Collections Rows'), desc: () => $L('Show Collections rows in Home Sections.'), icon: 'photo_library'},
					{kind: KIND.OPTION, key: 'collectionsRowSortBy', label: () => $L('Collections Row Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort', when: (ctx) => ctx.settings.displayCollectionsRows},
					{kind: KIND.OPTION, key: 'collectionsRowSortOrder', label: () => $L('Collections Row Sort Order'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayCollectionsRows},
					{kind: KIND.TOGGLE, key: 'collectionsRowShowEpisodes', label: () => $L('Show Individual Episodes'), desc: () => $L('Expand series inside collection rows into their episodes'), icon: 'video_library'},
					{kind: KIND.SECTION, id: 'favorites', label: () => $L('Favorites')},
					{kind: KIND.TOGGLE, key: 'displayFavoritesRows', label: () => $L('Display Favorites Rows'), desc: () => $L('Show Favorite Movies, Series, and other favorite rows in Home Sections.'), icon: 'heart'},
					{kind: KIND.OPTION, key: 'favoritesRowSortBy', label: () => $L('Favorites Row Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort', when: (ctx) => ctx.settings.displayFavoritesRows},
					{kind: KIND.OPTION, key: 'favoritesRowSortOrder', label: () => $L('Favorites Row Sort Order'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayFavoritesRows},
					{kind: KIND.SECTION, id: 'genres', label: () => $L('Genres')},
					{kind: KIND.TOGGLE, key: 'displayGenresRows', label: () => $L('Display Genres Rows'), desc: () => $L('Show Genres rows in Home Sections.'), icon: 'theater_comedy'},
					{kind: KIND.OPTION, key: 'genresRowSortBy', label: () => $L('Genres Row Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort', when: (ctx) => ctx.settings.displayGenresRows},
					{kind: KIND.OPTION, key: 'genresRowSortOrder', label: () => $L('Genres Row Sort Order'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayGenresRows},
					{kind: KIND.OPTION, key: 'genresRowItemFilter', label: () => $L('Genres Row Items'), options: getGenresRowItemFilterOptions, fallback: () => $L('Movies & TV Shows'), icon: 'filter', when: (ctx) => ctx.settings.displayGenresRows},
					{kind: KIND.SECTION, id: 'playlists', label: () => $L('Playlists')},
					{kind: KIND.TOGGLE, key: 'displayPlaylistsRows', label: () => $L('Display Playlist Rows'), desc: () => $L('Show Playlist rows in Home Sections.'), icon: 'playlist_play'},
					{kind: KIND.OPTION, key: 'playlistsRowSortBy', label: () => $L('Playlist Row Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort', when: (ctx) => ctx.settings.displayPlaylistsRows},
					{kind: KIND.OPTION, key: 'playlistsRowSortOrder', label: () => $L('Playlist Row Sort Order'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayPlaylistsRows},
					{kind: KIND.TOGGLE, key: 'playlistsRowShowEpisodes', label: () => $L('Show Individual Episodes'), desc: () => $L('Expand series inside playlist rows into their episodes'), icon: 'video_library', when: (ctx) => ctx.settings.displayPlaylistsRows},
					{kind: KIND.SECTION, id: 'studios', label: () => $L('Studios')},
					{kind: KIND.TOGGLE, key: 'displayStudiosRows', label: () => $L('Display Studios Rows'), desc: () => $L('Show a Studios row in Home Sections.'), icon: 'domain'},
					{kind: KIND.OPTION, key: 'studiosRowSortBy', label: () => $L('Studios Row Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort', when: (ctx) => ctx.settings.displayStudiosRows},
					{kind: KIND.OPTION, key: 'studiosRowSortOrder', label: () => $L('Studios Row Sort Order'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayStudiosRows},
					{kind: KIND.SECTION, id: 'rewatch', label: () => $L('Rewatch'), when: whenRewatch},
					{kind: KIND.TOGGLE, key: 'displayRewatchRow', label: () => $L('Display Rewatch Row'), desc: () => $L('Show Rewatch row in Home Sections'), icon: 'replay', when: whenRewatch},
					{kind: KIND.OPTION, key: 'rewatchSortBy', label: () => $L('Sort By'), desc: () => $L('Choose sorting method for completed items'), options: getRewatchSortOptions, fallback: () => $L('Recently Watched'), icon: 'sort', when: whenRewatchEnabled},
					{kind: KIND.TOGGLE, key: 'rewatchIncludeMovies', label: () => $L('Include Movies'), desc: () => $L('Show watched movies in the rewatch row'), icon: 'movies', when: whenRewatchEnabled},
					{kind: KIND.TOGGLE, key: 'rewatchIncludeShows', label: () => $L('Include Shows'), desc: () => $L('Show watched TV shows in the rewatch row'), icon: 'tv', when: whenRewatchEnabled},
					{kind: KIND.TOGGLE, key: 'rewatchIncludeCollections', label: () => $L('Include Collections'), desc: () => $L('Show watched collections in the rewatch row'), icon: 'photo_library', when: whenRewatchEnabled},
					{kind: KIND.SECTION, id: 'sinceYouWatched', label: () => $L('Since You Watched'), when: whenSinceYouWatched},
					{kind: KIND.OPTION, key: 'sinceYouWatchedSource', label: () => $L('Source'), options: getSinceYouWatchedSourceOptions, fallback: () => $L('Local'), icon: 'folder_code', when: whenSinceYouWatched},
					{kind: KIND.OPTION, key: 'sinceYouWatchedSourceType', label: () => $L('Source Type'), options: getSinceYouWatchedSourceTypeOptions, fallback: () => $L('Movies'), icon: 'merge_type', when: whenSinceYouWatched},
					{kind: KIND.OPTION, key: 'sinceYouWatchedSourceItem', label: () => $L('Source Item'), options: getSinceYouWatchedSourceItemOptions, fallback: () => $L('Recently Watched'), icon: 'playcircle', when: whenSinceYouWatched},
					{kind: KIND.TOGGLE, key: 'sinceYouWatchedIncludeWatched', label: () => $L('Include Previously Watched'), desc: () => $L('Include watched items in recommendations'), icon: 'history', when: (ctx) => whenSinceYouWatched(ctx) && ctx.settings.sinceYouWatchedSource !== 'online'}
				]
			},
			{
				id: 'libraries',
				icon: 'video_library',
				section: () => $L('Layout'),
				label: () => $L('Libraries'),
				description: () => $L('Library visibility, folder view, and multi-server behavior'),
				rows: [
					{kind: KIND.SECTION, id: 'librariesGeneral', label: () => $L('General')},
					{kind: KIND.NAV, id: 'hideLibraries', label: () => $L('Library Visibility'), desc: () => $L('Toggle home page visibility per library'), icon: 'show', action: (ctx) => ctx.actions.openLibraries()},
					{kind: KIND.TOGGLE, key: 'unifiedLibraryMode', label: () => $L('Multi-Server Libraries'), desc: () => $L('Show libraries from all connected servers'), icon: 'dns'},
					{kind: KIND.SECTION, id: 'libraryView', label: () => $L('Library View')},
					{kind: KIND.TOGGLE, key: 'showMediaDetailsOnLibraryPage', label: () => $L('Show Media Details'), desc: () => $L('Show details of the selected item at the top of Library pages'), icon: 'info'},
					{kind: KIND.TOGGLE, key: 'hideBackdropsInLibraries', label: () => $L('Hide Backdrops while Browsing?'), desc: () => $L('Hide backdrops when browsing libraries'), icon: 'hide_image'}
				]
			},
			{
				id: 'mediaBarLocalPreviews',
				icon: 'featured_play_list',
				section: () => $L('Extras'),
				label: () => $L('Media Bar'),
				description: () => $L('Featured content, appearance'),
				rows: [
					{kind: KIND.SECTION, id: 'mediaBarGeneral', label: () => $L('General')},
					{kind: KIND.OPTION, key: 'featuredBarStyle', label: () => $L('Media Bar Style'), desc: () => $L('Choose between various media bar styles, or turn the media bar off'), options: getFeaturedBarStyleOptions, fallback: () => $L('Moonfin'), icon: 'featured_play_list'},
					{kind: KIND.OPTION, key: 'featuredContentType', label: () => $L('Content Type'), options: getContentTypeOptions, fallback: () => $L('Movies & TV Shows'), icon: 'category'},
					{kind: KIND.OPTION, key: 'featuredItemCount', label: () => $L('Item Count'), options: getFeaturedItemCountOptions, fallback: () => $L('10 items'), icon: 'format_list_numbered'},
					{kind: KIND.OPTION, key: 'mediaBarOverlayColor', label: () => $L('Overlay Color'), options: getOverlayColorOptions, fallback: () => $L('Gray'), icon: 'colorpicker'},
					{kind: KIND.SLIDER, key: 'mediaBarOverlayOpacity', label: () => $L('Overlay Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity'},
					{kind: KIND.SECTION, id: 'mediaSources', label: () => $L('Media Sources')},
					{
						kind: KIND.NAV,
						id: 'sourceLibraries',
						label: () => $L('Source Libraries'),
						desc: (ctx) => (Array.isArray(ctx.settings.mediaBarLibraryIds) && ctx.settings.mediaBarLibraryIds.length > 0
							? countLabel(ctx.settings.mediaBarLibraryIds.length)
							: $L('All libraries')),
						icon: 'folder',
						action: (ctx) => ctx.actions.openMediaBarLibraries()
					},
					{
						kind: KIND.NAV,
						id: 'sourceCollections',
						label: () => $L('Source Collections'),
						desc: (ctx) => (Array.isArray(ctx.settings.mediaBarCollectionIds) && ctx.settings.mediaBarCollectionIds.length > 0
							? countLabel(ctx.settings.mediaBarCollectionIds.length)
							: $L('All collections')),
						icon: 'photo_library',
						action: (ctx) => ctx.actions.openMediaBarCollections()
					},
					{
						kind: KIND.NAV,
						id: 'excludedGenres',
						label: () => $L('Excluded Genres'),
						desc: (ctx) => (Array.isArray(ctx.settings.excludedGenres) && ctx.settings.excludedGenres.length > 0
							? ctx.settings.excludedGenres.join(', ')
							: $L('None')),
						icon: 'hide',
						action: (ctx) => ctx.actions.openExcludedGenres()
					},
					{kind: KIND.SECTION, id: 'mediaBarBehavior', label: () => $L('Behavior')},
					{kind: KIND.TOGGLE, key: 'autoAdvance', label: () => $L('Auto Advance'), desc: () => $L('Automatically advance to next slide'), icon: 'skip'},
					{kind: KIND.SLIDER, key: 'autoAdvanceInterval', label: () => $L('Auto Advance Interval'), min: 2, max: 20, step: 1, format: seconds, icon: 'timer', when: (ctx) => ctx.settings.autoAdvance}
				]
			},
			{
				id: 'localPreviews',
				icon: 'preview',
				section: () => $L('Extras'),
				label: () => $L('Local Previews'),
				description: () => $L('Configure trailer previews'),
				rows: [
					{kind: KIND.TOGGLE, key: 'featuredTrailerPreview', label: () => $L('Trailer Preview'), desc: () => $L('Auto-play trailers in the media bar after 3 seconds'), icon: 'movies'},
					{kind: KIND.TOGGLE, key: 'featuredTrailerMuted', label: () => $L('Mute Trailer Audio'), desc: () => $L('Mute trailer previews in the featured media bar and details screen trailer overlay'), icon: 'sound', when: (ctx) => ctx.settings.featuredTrailerPreview}
				]
			},
			{
				id: 'seasonalEffects',
				icon: 'star_shine',
				section: () => $L('Extras'),
				label: () => $L('Seasonal Effects'),
				description: () => $L('Visual effects and seasonal decorations'),
				rows: [
					{kind: KIND.SECTION, id: 'seasonalEffects', label: () => $L('Seasonal Effects')},
					{kind: KIND.OPTION, key: 'seasonalTheme', label: () => $L('Seasonal Surprise'), options: getSeasonalThemeOptions, fallback: () => $L('None'), icon: 'star_shine'}
				]
			},
			{
				id: 'themeMusic',
				icon: 'music_note',
				section: () => $L('Extras'),
				label: () => $L('Theme Music'),
				description: () => $L('Detail pages, home rows, and volume'),
				rows: [
					{kind: KIND.SECTION, id: 'themeMusic', label: () => $L('Theme Music')},
					{kind: KIND.TOGGLE, key: 'themeMusicEnabled', label: () => $L('Theme Music'), desc: () => $L('Play theme music on detail pages'), icon: 'music'},
					{kind: KIND.SLIDER, key: 'themeMusicVolume', label: () => $L('Theme Music Volume'), min: 0, max: 100, step: 5, format: percent, icon: 'volume_down'},
					{kind: KIND.TOGGLE, key: 'themeMusicOnHomeRows', label: () => $L('Theme Music on Home Rows'), desc: () => $L('Play when browsing home screen'), icon: 'queue_music'},
					{kind: KIND.TOGGLE, key: 'themeMusicLoop', label: () => $L('Loop Theme Music'), desc: () => $L('Repeat the track instead of playing it once'), icon: 'repeat'}
				]
			}
		]
	},
	{
		id: 'playbackSyncPlay',
		label: () => $L('Playback & SyncPlay'),
		description: () => $L('Audio/video settings, subtitles, and SyncPlay controls'),
		icon: 'play_circle',
		subcategories: [
			{
				id: 'video',
				icon: 'play_circle',
				section: () => $L('Playback'),
				label: () => $L('Video Playback Preferences'),
				description: () => $L('Core video engine and streaming quality settings'),
				rows: [
					{kind: KIND.SECTION, id: 'mediaPlayerBehavior', label: () => $L('Media Player Behavior')},
					{kind: KIND.TOGGLE, key: 'showDescriptionOnPause', label: () => $L('Show Description on Pause'), desc: () => $L('Dim video and show overview text while paused'), icon: 'pausecircle'},
					{kind: KIND.NAV, id: 'progressBarTime', label: () => $L('Progress Bar Time'), desc: () => $L('Choose which time labels appear around the playback progress bar'), icon: 'timer', action: (ctx) => ctx.actions.openScreen('playbackSyncPlay', 'playbackTime', 'setting-progressBarTime')},
					{kind: KIND.OPTION, key: 'playerZoomMode', label: () => $L('Player Zoom Mode'), desc: () => $L('How video that does not match the screen shape is displayed'), options: getZoomModeOptions, fallback: () => $L('Fit'), icon: 'crop'},
					{kind: KIND.TOGGLE, key: 'trickPlayEnabled', label: () => $L('Trick Play'), desc: () => $L('Show preview thumbnails while seeking'), icon: 'imagesearch'},
					{kind: KIND.OPTION, key: 'resumeSubtractDuration', label: () => $L('Resume Rewind'), desc: () => $L('Rewind a little when resuming partially watched media'), options: getResumeRewindOptions, fallback: () => $L('Disabled'), icon: 'replay'},
					{kind: KIND.SLIDER, key: 'unpauseRewind', label: () => $L('Unpause Rewind'), desc: () => $L('When resuming playback after pressing the pause button, how many seconds should be rewound?'), min: 0, max: 30, step: 5, format: (v) => (v === 0 ? $L('Off') : `${v}s`), icon: 'autoplay'},
					{kind: KIND.OPTION, key: 'seekStep', label: () => $L('Seek Step'), desc: () => $L('How far each press moves while scrubbing the progress bar'), options: getSeekStepOptions, fallback: () => $L('10 seconds'), icon: 'skip'},
					{kind: KIND.OPTION, key: 'skipBackLength', label: () => $L('Skip Back Length'), desc: () => $L('How far the rewind button jumps'), options: getSkipLengthOptions, fallback: () => $L('10 seconds'), icon: 'rewind'},
					{kind: KIND.OPTION, key: 'skipForwardLength', label: () => $L('Skip Forward Length'), desc: () => $L('How far the fast forward button jumps'), options: getSkipLengthOptions, fallback: () => $L('30 seconds'), icon: 'fifteenforward'},
					{kind: KIND.NAV, id: 'osdButtons', label: () => $L('Player Buttons'), desc: () => $L('Choose which buttons the player shows'), icon: 'tune', action: (ctx) => ctx.actions.openOsdButtons()},
					{kind: KIND.SECTION, id: 'decodingRendering', label: () => $L('Decoding & Rendering')},
					{kind: KIND.TOGGLE, key: 'preferTranscode', label: () => $L('Prefer Transcoding'), desc: () => $L('Request transcoded streams when available'), icon: 'gear'},
					{kind: KIND.TOGGLE, key: 'forceDirectPlay', label: () => $L('Force Direct Play'), desc: () => $L('Skip codec checks and always attempt DirectPlay (debug)'), icon: 'play'},
					{kind: KIND.SECTION, id: 'transcodingLimits', label: () => $L('Transcoding Limits')},
					{kind: KIND.OPTION, key: 'maxBitrate', label: () => $L('Max Streaming Bitrate'), desc: () => $L('Cap the streaming bitrate. Content above this threshold will be transcoded to fit.'), options: getBitrateOptions, fallback: () => $L('Auto (Recommended)'), icon: 'network_check'},
					{kind: KIND.OPTION, key: 'maxVideoResolution', label: () => $L('Max Resolution'), desc: () => $L('Cap the video resolution. Content above this threshold will be transcoded to fit.'), options: getMaxResolutionOptions, fallback: () => $L('Auto'), icon: 'quality'}
				]
			},
			{
				id: 'playbackTime',
				icon: 'timer',
				menu: false,
				label: () => $L('Progress Bar Time'),
				description: () => $L('Choose which time labels appear around the playback progress bar'),
				keywords: () => [$L('Ends At'), $L('Time Remaining'), $L('Time Elapsed'), $L('Total Duration'), $L('Clock')],
				rows: [
					{kind: KIND.SECTION, id: 'playbackTimeVideo', label: () => $L('Video Player')},
					{kind: KIND.CUSTOM, id: 'playbackTimePreview', render: 'playbackTimePreview'},
					{kind: KIND.OPTION, key: 'playbackTimeAboveLeft', label: () => $L('Above Bar, Left'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Hidden'), icon: 'alignleft'},
					{kind: KIND.OPTION, key: 'playbackTimeAboveCenter', label: () => $L('Above Bar, Center'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Hidden'), icon: 'aligncenter'},
					{kind: KIND.OPTION, key: 'playbackTimeAboveRight', label: () => $L('Above Bar, Right'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Ends At'), icon: 'alignright'},
					{kind: KIND.OPTION, key: 'playbackTimeBelowLeft', label: () => $L('Below Bar, Left'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Time Elapsed'), icon: 'alignleft'},
					{kind: KIND.OPTION, key: 'playbackTimeBelowCenter', label: () => $L('Below Bar, Center'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Hidden'), icon: 'aligncenter'},
					{kind: KIND.OPTION, key: 'playbackTimeBelowRight', label: () => $L('Below Bar, Right'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Total Duration'), icon: 'alignright'},
					{kind: KIND.SECTION, id: 'playbackTimeMusic', label: () => $L('Music Player')},
					{kind: KIND.OPTION, key: 'musicPlaybackTimeDisplay', label: () => $L('Music Progress Bar Time'), options: getPlaybackTimeDisplayOptions, fallback: () => $L('Total Duration'), desc: () => $L('Shown on the right of the music progress bar'), icon: 'music'}
				]
			},
			{
				id: 'audio',
				icon: 'volume_up',
				section: () => $L('Playback'),
				label: () => $L('Audio Preferences'),
				description: () => $L('Audio tracks, processing, and passthrough options'),
				rows: [
					{kind: KIND.SECTION, id: 'audioStream', label: () => $L('Audio Stream')},
					{kind: KIND.OPTION, key: 'audioLanguage', label: () => $L('Default Audio Language'), options: getAudioLanguageOptions, fallback: () => $L('Auto'), icon: 'language'},
					{kind: KIND.OPTION, key: 'fallbackAudioLanguage', label: () => $L('Fallback Audio Language'), desc: () => $L('Used when no track matches the default audio language'), options: getSubtitleLanguageOptions, fallback: () => $L('None'), icon: 'language'},
					{kind: KIND.TOGGLE, key: 'preferDefaultAudioTrack', label: () => $L('Prefer Default Audio Track'), desc: () => $L('Pick the track the file marks as default before matching languages'), icon: 'audiotrack'},
					{kind: KIND.TOGGLE, key: 'preferAudioDescription', label: () => $L('Prefer Audio Description Tracks'), desc: () => $L('Pick narrated tracks for the visually impaired when available'), icon: 'hearing'},
					{kind: KIND.SECTION, id: 'audioOutput', label: () => $L('Audio Output')},
					{kind: KIND.OPTION, key: 'audioPassthroughMode', label: () => $L('Audio Passthrough'), desc: () => $L('Whether compressed audio is sent to your receiver untouched'), options: getPassthroughModeOptions, fallback: () => $L('Auto (match detected device support)'), icon: 'settings_input_hdmi'},
					{kind: KIND.OPTION, key: 'maxAudioChannels', label: () => $L('Max Audio Channels'), desc: () => $L('Cap decoded audio at this channel count'), options: getMaxAudioChannelsOptions, fallback: () => $L('Auto Detect (Hardware Default)'), icon: 'speakergroup'},
					{kind: KIND.TOGGLE, key: 'downmixToStereo', label: () => $L('Downmix to Stereo'), desc: () => $L('Reduce multichannel audio to two channels'), icon: 'speaker'},
					{kind: KIND.TOGGLE, key: 'stereoUpmixEnabled', label: () => $L('Stereo to Surround Upmix'), desc: () => $L('Upmix stereo audio to 5.1 surround via server transcoding'), icon: 'equalizer', when: (ctx) => !ctx.settings.downmixToStereo},
					{kind: KIND.SECTION, id: 'passthroughSettings', label: () => $L('Passthrough Settings'), when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'ac3Passthrough', label: () => $L('AC3 Passthrough'), desc: () => $L('Allow Dolby Digital passthrough when available'), icon: 'speaker', when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'eac3Passthrough', label: () => $L('E-AC3 Passthrough'), desc: () => $L('Allow Dolby Digital Plus passthrough when available'), icon: 'surround', when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'dtsPassthrough', label: () => $L('DTS Passthrough'), desc: () => $L('Allow DTS passthrough when available'), icon: 'audiotrack', when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'dtshdPassthrough', label: () => $L('DTS-HD Passthrough'), desc: () => $L('Allow DTS-HD and DTS:X passthrough when available'), icon: 'quality', when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'truehdPassthrough', label: () => $L('TrueHD Passthrough (Experimental)'), desc: () => $L('Allow Dolby TrueHD passthrough when available'), icon: 'graphic_eq', when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'forceTruehdPassthrough', label: () => $L('Force TrueHD / Atmos Passthrough'), desc: () => $L('Send Dolby TrueHD and Atmos straight to your receiver. Make sure your receiver supports it.'), icon: 'graphic_eq', when: (ctx) => ctx.settings.audioPassthroughMode !== 'disabled' && !ctx.settings.downmixToStereo && ctx.isWebOS}
				]
			},
			{
				id: 'subtitles',
				icon: 'subtitles',
				section: () => $L('Playback'),
				label: () => $L('Subtitle Preferences'),
				description: () => $L('Change subtitle modes, default languages, appearance, and rendering options.'),
				rows: [
					{kind: KIND.SECTION, id: 'subtitlesGeneral', label: () => $L('General')},
					{kind: KIND.OPTION, key: 'subtitleMode', label: () => $L('Subtitle Mode'), desc: () => $L('When subtitles should load automatically'), options: getSubtitleModeOptions, fallback: () => $L('Flagged'), icon: 'subtitles'},
					{kind: KIND.SECTION, id: 'subtitleStream', label: () => $L('Subtitle Stream')},
					{kind: KIND.OPTION, key: 'subtitleLanguage', label: () => $L('Default Subtitle Language'), options: getSubtitleLanguageOptions, fallback: () => $L('None'), icon: 'language'},
					{kind: KIND.OPTION, key: 'fallbackSubtitleLanguage', label: () => $L('Fallback Subtitle Language'), desc: () => $L('Used when no track matches the default subtitle language'), options: getSubtitleLanguageOptions, fallback: () => $L('None'), icon: 'language'},
					{kind: KIND.TOGGLE, key: 'preferSdhSubtitles', label: () => $L('Prefer SDH Subtitles'), desc: () => $L('Pick subtitles for the deaf and hard of hearing when available'), icon: 'hearing'},
					{kind: KIND.SECTION, id: 'subtitleCustomization', label: () => $L('Subtitle Customization')},
					{kind: KIND.OPTION, key: 'subtitleSize', label: () => $L('Subtitle Size'), options: getSubtitleSizeOptions, fallback: () => $L('Medium'), icon: 'textinput'},
					{kind: KIND.OPTION, key: 'subtitlePosition', label: () => $L('Subtitle Position'), options: getSubtitlePositionOptions, fallback: () => $L('Bottom'), icon: 'arrowlargedown'},
					{kind: KIND.SLIDER, key: 'subtitlePositionAbsolute', label: () => $L('Absolute Position'), min: 0, max: 100, step: 5, format: percent, icon: 'vertical_align_bottom', when: (ctx) => ctx.settings.subtitlePosition === 'absolute'},
					{kind: KIND.SLIDER, key: 'subtitleOpacity', label: () => $L('Text Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity'},
					{kind: KIND.OPTION, key: 'subtitleColor', label: () => $L('Text Color'), options: getSubtitleColorOptions, fallback: () => $L('White'), icon: 'format_color_text'},
					{kind: KIND.DIVIDER, id: 'shadow'},
					{kind: KIND.OPTION, key: 'subtitleShadowColor', label: () => $L('Shadow Color'), options: getSubtitleShadowColorOptions, fallback: () => $L('Black'), icon: 'edit'},
					{kind: KIND.SLIDER, key: 'subtitleShadowOpacity', label: () => $L('Shadow Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity'},
					{kind: KIND.SLIDER, key: 'subtitleShadowBlur', label: () => $L('Shadow Size (Blur)'), min: 0, max: 1, step: 0.1, format: (v) => (v || 0.1).toFixed(1), icon: 'blur_on'},
					{kind: KIND.DIVIDER, id: 'background'},
					{kind: KIND.OPTION, key: 'subtitleBackgroundColor', label: () => $L('Background Color'), options: getSubtitleBackgroundColorOptions, fallback: () => $L('Black'), icon: 'format_color_fill'},
					{kind: KIND.SLIDER, key: 'subtitleBackground', label: () => $L('Background Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity'},
					{kind: KIND.SECTION, id: 'subtitleRendering', label: () => $L('Subtitle Rendering')},
					{kind: KIND.TOGGLE, key: 'enablePgsRendering', label: () => $L('Direct Play PGS Subtitles'), desc: () => $L('Use client-side rendering for bitmap subtitles (PGS, DVB, DVD)'), icon: 'picture'},
					{kind: KIND.TOGGLE, key: 'assDirectPlay', label: () => $L('Direct Play ASS/SSA Subtitles'), desc: () => $L('Render styled subtitles on this device instead of having the server burn them in'), icon: 'text_snippet'}
				]
			},
			{
				id: 'subtitlesHdr',
				icon: 'hdr_strong',
				section: () => $L('Playback'),
				label: () => $L('HDR Subtitles'),
				description: () => $L('A separate style used while HDR is playing'),
				rows: [
					{
						kind: KIND.TOGGLE,
						key: 'subtitleHdrSeparate',
						label: () => $L('Separate HDR Style'),
						desc: () => $L('Use the style below whenever HDR content is playing. White is much brighter in HDR than in SDR, so a dimmer color here avoids the glare.'),
						icon: 'hdr_strong'
					},
					{kind: KIND.OPTION, key: 'subtitleSizeHdr', label: () => $L('Subtitle Size'), options: getSubtitleSizeOptions, fallback: () => $L('Medium'), icon: 'textinput', when: whenHdrSubtitles},
					{kind: KIND.OPTION, key: 'subtitlePositionHdr', label: () => $L('Subtitle Position'), options: getSubtitlePositionOptions, fallback: () => $L('Bottom'), icon: 'arrowlargedown', when: whenHdrSubtitles},
					{kind: KIND.SLIDER, key: 'subtitlePositionAbsoluteHdr', label: () => $L('Absolute Position'), min: 0, max: 100, step: 5, format: percent, icon: 'vertical_align_bottom', when: (ctx) => whenHdrSubtitles(ctx) && ctx.settings.subtitlePositionHdr === 'absolute'},
					{kind: KIND.SLIDER, key: 'subtitleOpacityHdr', label: () => $L('Text Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity', when: whenHdrSubtitles},
					{kind: KIND.OPTION, key: 'subtitleColorHdr', label: () => $L('Text Color'), options: getSubtitleColorOptions, fallback: () => $L('Grey'), icon: 'format_color_text', when: whenHdrSubtitles},
					{kind: KIND.DIVIDER, id: 'hdrShadow', when: whenHdrSubtitles},
					{kind: KIND.OPTION, key: 'subtitleShadowColorHdr', label: () => $L('Shadow Color'), options: getSubtitleShadowColorOptions, fallback: () => $L('Black'), icon: 'edit', when: whenHdrSubtitles},
					{kind: KIND.SLIDER, key: 'subtitleShadowOpacityHdr', label: () => $L('Shadow Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity', when: whenHdrSubtitles},
					{kind: KIND.SLIDER, key: 'subtitleShadowBlurHdr', label: () => $L('Shadow Size (Blur)'), min: 0, max: 1, step: 0.1, format: (v) => (v || 0.1).toFixed(1), icon: 'blur_on', when: whenHdrSubtitles},
					{kind: KIND.DIVIDER, id: 'hdrBackground', when: whenHdrSubtitles},
					{kind: KIND.OPTION, key: 'subtitleBackgroundColorHdr', label: () => $L('Background Color'), options: getSubtitleBackgroundColorOptions, fallback: () => $L('Black'), icon: 'format_color_fill', when: whenHdrSubtitles},
					{kind: KIND.SLIDER, key: 'subtitleBackgroundHdr', label: () => $L('Background Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity', when: whenHdrSubtitles}
				]
			},
			{
				id: 'automationQueue',
				icon: 'queue_play_next',
				section: () => $L('General'),
				label: () => $L('Automation & Queue'),
				description: () => $L('Automated playback and sequencing'),
				rows: [
					{kind: KIND.SECTION, id: 'playbackEnhancements', label: () => $L('Playback Enhancements')},
					{kind: KIND.TOGGLE, key: 'cinemaModeEnabled', label: () => $L('Cinema Mode'), desc: () => $L('Play trailers/prerolls before a main feature'), icon: 'theaters'},
					{kind: KIND.TOGGLE, key: 'cinemaModeEpisodesEnabled', label: () => $L('Cinema Mode for Episodes'), desc: () => $L('Also play prerolls before episodes'), icon: 'mediaplayer', when: (ctx) => ctx.settings.cinemaModeEnabled},
					{kind: KIND.OPTION, key: 'introAction', label: () => $L('Intro Action'), options: getMediaSegmentActionOptions, fallback: () => $L('Ask to Skip'), icon: 'content_cut'},
					{kind: KIND.OPTION, key: 'outroAction', label: () => $L('Outro Action'), options: getMediaSegmentActionOptions, fallback: () => $L('Ask to Skip'), icon: 'content_cut'},
					{kind: KIND.OPTION, key: 'mediaSegmentAutoHide', label: () => $L('Auto Hide Skip Button'), desc: () => $L('Take the skip button off screen after this long'), options: getMediaSegmentAutoHideOptions, fallback: () => $L('5 seconds'), icon: 'hide', when: (ctx) => ctx.settings.introAction === 'ask' || ctx.settings.outroAction === 'ask'},
					{kind: KIND.SECTION, id: 'automaticQueuing', label: () => $L('Automatic Queuing')},
					{kind: KIND.TOGGLE, key: 'autoPlay', label: () => $L('Autoplay Next Episode'), desc: () => $L('Automatically play the next episode when available.'), icon: 'playcircle'},
					{kind: KIND.OPTION, key: 'nextUpBehavior', label: () => $L('Next Up Display'), desc: () => $L('Extended shows a full card with episode artwork and description. Minimal shows a compact countdown overlay. Disabled hides the prompt entirely.'), options: getNextUpBehaviorOptions, fallback: () => $L('Extended'), icon: 'skip'},
					{kind: KIND.OPTION, key: 'nextUpCountdownStyle', label: () => $L('Next Up Countdown'), options: getNextUpCountdownStyleOptions, fallback: () => $L('Both'), icon: 'timer', when: (ctx) => ctx.settings.nextUpBehavior !== 'disabled'},
					{kind: KIND.SLIDER, key: 'nextUpTimeout', label: () => $L('Next Up Timeout'), min: 0, max: 30, step: 1, format: (v) => (v === 0 ? $L('Instant') : `${v}s`), icon: 'timer', when: (ctx) => ctx.settings.nextUpBehavior !== 'disabled'},
					{kind: KIND.TOGGLE, key: 'replaceSkipOutroWithNextUp', label: () => $L('Replace Skip Outro with Next Up Display'), desc: () => $L('Show the Next Up overlay instead of the Skip Outro button.'), icon: 'skip', when: (ctx) => ctx.settings.outroAction !== 'none'},
					{kind: KIND.OPTION, key: 'stillWatchingBehavior', label: () => $L('Still Watching Prompt'), options: getStillWatchingBehaviorOptions, fallback: () => $L('3 episodes'), desc: () => $L('Prompt to Continue Watching after X consecutive episodes.'), icon: 'show'}
				]
			},
			{
				id: 'syncPlay',
				icon: 'groups',
				section: () => $L('General'),
				label: () => $L('SyncPlay'),
				description: () => $L('Synchronization logic for group sessions'),
				rows: [
					{kind: KIND.SECTION, id: 'syncPlayOptions', label: () => $L('SyncPlay Options')},
					{kind: KIND.TOGGLE, key: 'syncplayEnabled', label: () => $L('SyncPlay Enabled'), desc: () => $L('Enable group watching features'), icon: 'groups'},
					{kind: KIND.TOGGLE, key: 'showSyncPlayButton', label: () => $L('SyncPlay Button'), desc: () => $L('Show the SyncPlay button on the navigation bar'), icon: 'toggle_on'},
					{kind: KIND.TOGGLE, key: 'syncplayAutoOpen', label: () => $L('Open SyncPlay'), desc: () => $L('Automatically open SyncPlay dialog when starting playback'), icon: 'group_work'},
					{kind: KIND.SECTION, id: 'syncPlayCorrection', label: () => $L('Sync Correction')},
					{kind: KIND.TOGGLE, key: 'syncPlayAdvancedCorrectionEnabled', label: () => $L('Advanced Correction'), desc: () => $L('Continuously measure playback against the group and correct drift'), icon: 'spanner'},
					{kind: KIND.TOGGLE, key: 'syncPlayEnableSyncCorrection', label: () => $L('Sync Correction'), desc: () => $L('Correct drift while playing'), icon: 'sync', when: whenSyncCorrection},
					{kind: KIND.TOGGLE, key: 'syncPlayUseSpeedToSync', label: () => $L('Speed to Sync'), desc: () => $L('Use small speed changes to close a drift. Not every TV supports this, seeking covers the rest.'), icon: 'playspeed', when: whenSyncCorrection},
					{kind: KIND.TOGGLE, key: 'syncPlayUseSkipToSync', label: () => $L('Skip to Sync'), desc: () => $L('Use seeking to sync'), icon: 'skip', when: whenSyncCorrection},
					{kind: KIND.SLIDER, key: 'syncPlayMinDelaySpeedToSync', label: () => $L('Minimum Speed Delay'), min: 0, max: 5000, step: 100, format: milliseconds, icon: 'timer', when: whenSpeedToSync},
					{kind: KIND.SLIDER, key: 'syncPlayMaxDelaySpeedToSync', label: () => $L('Maximum Speed Delay'), min: 0, max: 15000, step: 250, format: milliseconds, icon: 'timer', when: whenSpeedToSync},
					{kind: KIND.SLIDER, key: 'syncPlaySpeedToSyncDuration', label: () => $L('Speed Duration'), min: 100, max: 5000, step: 100, format: milliseconds, icon: 'scheduler', when: whenSpeedToSync},
					{kind: KIND.SLIDER, key: 'syncPlayMinDelaySkipToSync', label: () => $L('Minimum Skip Delay'), min: 0, max: 15000, step: 250, format: milliseconds, icon: 'timer', when: (ctx) => whenSyncCorrection(ctx) && ctx.settings.syncPlayUseSkipToSync},
					{kind: KIND.SLIDER, key: 'syncPlayExtraTimeOffset', label: () => $L('SyncPlay Extra Offset'), desc: () => $L('A fixed offset added to the group position, for displays that lag'), min: -2000, max: 2000, step: 100, format: milliseconds, icon: 'scheduler'}
				]
			},
			{
				id: 'advanced',
				icon: 'gear',
				section: () => $L('General'),
				label: () => $L('Advanced Options'),
				description: () => $L('Specialized player features. Use with caution, as some options may cause playback issues'),
				rows: [
					{kind: KIND.SECTION, id: 'advancedPlayback', label: () => $L('Playback')},
					{kind: KIND.SLIDER, key: 'videoStartDelay', label: () => $L('Video Start Delay'), min: 0, max: 5, step: 0.5, format: (v) => (v === 0 ? $L('Off') : `${Number(v).toFixed(1)}s`), icon: 'scheduler'},
					{kind: KIND.TOGGLE, key: 'liveTvSkipGuide', label: () => $L('Skip TV Guide'), desc: () => $L('Open the first available live channel directly from library selection'), icon: 'liveplay'},
					{kind: KIND.SECTION, id: 'advancedCache', label: () => $L('Cache')},
					{kind: KIND.CUSTOM, id: 'imageCacheActions', render: 'imageCacheActions'}
				]
			}
		]
	},
	{
		id: 'integrations',
		label: () => $L('Integrations'),
		description: () => $L('Plugin sync, Seerr, ratings, and more'),
		icon: 'hub',
		subcategories: [
			{
				id: 'plugin',
				icon: 'plug',
				section: () => $L('General'),
				label: () => $L('Moonbase Plugin'),
				description: () => $L('Server sync and plugin status'),
				rows: [
					{
						kind: KIND.TOGGLE,
						key: 'useMoonfinPlugin',
						icon: 'plug',
						label: () => $L('Enable Plugin'),
						desc: (ctx) => $L('Connect for ratings, sync, and {seerrLabel} proxy').replace('{seerrLabel}', ctx.seerrLabel),
						onToggle: (ctx) => ctx.actions.handleMoonfinToggle()
					},
					{kind: KIND.CUSTOM, render: 'moonfinStatus'},
					{kind: KIND.INFO, id: 'pluginVersion', label: () => $L('Plugin Version'), value: (ctx) => ctx.seerr.pluginInfo?.version || $L('Unknown'), icon: 'info'},
					{kind: KIND.INFO, id: 'settingsSync', label: () => $L('Settings Sync'), value: (ctx) => pluginFlag(ctx.seerr.pluginInfo?.settingsSyncEnabled, $L('Available'), $L('Not Available')), icon: 'sync'},
					{kind: KIND.SECTION, id: 'customizationProfile', label: () => $L('Customization Profile'), when: (ctx) => whenPlugin(ctx) && ctx.seerr.pluginInfo?.settingsSyncEnabled === true},
					{kind: KIND.CUSTOM, id: 'profileSync', render: 'profileSync', when: (ctx) => whenPlugin(ctx) && ctx.seerr.pluginInfo?.settingsSyncEnabled === true},
					{kind: KIND.INFO, id: 'seerrStatus', label: (ctx) => ctx.seerrLabel, value: (ctx) => pluginFlag(ctx.seerr.pluginInfo?.seerrEnabled, $L('Enabled by Admin'), $L('Disabled by Admin')), icon: 'seerr'},
					{kind: KIND.INFO, id: 'seerrVariant', label: () => $L('Detected Variant'), value: (ctx) => $L('{seerrLabel} (Seerr v3+)').replace('{seerrLabel}', ctx.seerrLabel), when: (ctx) => ctx.isSeerr, icon: 'info'}
				]
			},
			{
				id: 'metadataRatings',
				icon: 'star',
				section: () => $L('General'),
				label: () => $L('Metadata & Ratings'),
				description: () => $L('MDBList, TMDB, and rating sources'),
				rows: [
					{kind: KIND.SECTION, id: 'ratings', label: () => $L('Ratings')},
					{kind: KIND.TOGGLE, key: 'mdblistEnabled', label: () => $L('Additional Ratings'), desc: () => $L('Show MDBList and TMDB ratings'), icon: 'star'},
					{
						kind: KIND.NAV,
						id: 'ratingSources',
						label: () => $L('Rating Sources'),
						desc: (ctx) => getEnabledRatingSourcesSummary(ctx.settings.mdblistRatingSources),
						icon: 'reorder',
						action: (ctx) => ctx.actions.openRatingSources()
					},
					{kind: KIND.TOGGLE, key: 'tmdbEpisodeRatingsEnabled', label: () => $L('Episode Ratings'), desc: () => $L('Show ratings on individual episodes'), icon: 'stars'},
					{kind: KIND.TOGGLE, key: 'showRatingLabels', label: () => $L('Rating Labels'), desc: () => $L('Show labels next to rating icons'), icon: 'label'},
					{kind: KIND.TOGGLE, key: 'showRatingBadges', label: () => $L('Rating Badges'), desc: () => $L('Show decorative badges behind ratings'), icon: 'style'}
				]
			},
			{
				id: 'seerr',
				icon: 'seerr',
				section: () => $L('General'),
				label: (ctx) => ctx.seerrLabel,
				description: () => $L('Media request integration'),
				// The sign-in panel holds no persisted settings, so the screen itself is the
				// only thing worth surfacing. These make it findable by what it does.
				keywords: () => [$L('sign in'), $L('login'), $L('password'), $L('requests')],
				rows: [
					{kind: KIND.CUSTOM, render: 'seerrPanel'}
				]
			},
			{
				id: 'externalRows',
				icon: 'list_alt',
				section: () => $L('General'),
				label: () => $L('External Lists'),
				description: () => $L('Configure external lists for display on the Home Screen.'),
				rows: [
					{
						kind: KIND.TEXT,
						id: 'needsPlugin',
						text: () => $L('Enable the Moonfin plugin under Integrations to use external home rows.'),
						when: (ctx) => !ctx.settings.useMoonfinPlugin
					},
					{kind: KIND.SECTION, id: 'maintenance', label: () => $L('Home Row Maintenance'), when: whenPlugin},
					{kind: KIND.NAV, id: 'homeRows', label: () => $L('Home Sections'), desc: () => $L('Reorder and toggle both library and external-based home rows'), icon: 'list', action: (ctx) => ctx.actions.openHomeRows(), when: whenPlugin},
					{kind: KIND.SECTION, id: 'configurations', label: () => $L('External Home Row Configurations'), when: whenPlugin},
					{kind: KIND.NAV, id: 'imdbLists', label: () => $L('IMDb Lists'), desc: () => $L('Configure IMDb Top 250, Popular, and other charts'), icon: 'movie', action: (ctx) => ctx.actions.openImdbLists(), when: whenPlugin},
					{kind: KIND.NAV, id: 'externalTmdbLists', label: () => $L('TMDB Lists'), desc: () => $L('Configure Popular, Top Rated, and Trending TMDB lists'), icon: 'trending_up', action: (ctx) => ctx.actions.openExternalTmdbLists(), when: whenPlugin},
					{kind: KIND.NAV, id: 'externalCalendars', label: () => $L('Upcoming Calendars'), desc: () => $L('Toggle upcoming calendars from Radarr and Sonarr'), icon: 'calendar_month', action: (ctx) => ctx.actions.openExternalCalendars(), when: (ctx) => whenPlugin(ctx) && whenSeerr(ctx)},
					{kind: KIND.NAV, id: 'seerrHomeRows', label: (ctx) => `${ctx.seerrLabel} ${$L('Lists')}`, desc: () => $L('Configure Seerr discovery rows'), icon: 'list', action: (ctx) => ctx.actions.openSeerrHomeRows(), when: (ctx) => whenPlugin(ctx) && whenSeerr(ctx)},
					{
						kind: KIND.NAV,
						id: 'externalCustomRows',
						label: () => $L('Custom Home Rows Wizard'),
						desc: (ctx) => $L('{count} configured').replace('{count}', String((ctx.settings.customHomeRows || []).length)),
						icon: 'tune',
						action: (ctx) => ctx.actions.openExternalCustomRows(),
						when: whenPlugin
					}
				]
			}
		]
	},
	{
		id: 'about',
		label: () => $L('About'),
		description: () => $L('App version, device info, and diagnostics'),
		icon: 'info',
		subcategories: [
			{
				id: 'about',
				icon: 'info',
				label: () => $L('About'),
				description: () => $L('App version, device info, and diagnostics'),
				rows: [
					{kind: KIND.SECTION, id: 'appInfo', label: () => $L('App Info')},
					{kind: KIND.INFO, id: 'appVersion', label: () => $L('App Version'), value: () => process.env.REACT_APP_VERSION || '0.0.0', icon: 'info'},
					{
						kind: KIND.INFO,
						id: 'platform',
						icon: 'tv',
						label: () => $L('Platform'),
						value: (ctx) => (ctx.capabilities?.tizenVersionDisplay ? 'Tizen' : ctx.capabilities?.webosVersionDisplay ? 'webOS' : $L('Unknown'))
					},
					{kind: KIND.TOGGLE, key: 'updateNotificationsEnabled', label: () => $L('Update Notifications'), desc: () => $L('Show app update notifications when a new release is available'), icon: 'system_update_alt'},
					{kind: KIND.CUSTOM, id: 'checkForUpdates', render: 'checkForUpdates'},
					{kind: KIND.SECTION, id: 'links', label: () => $L('Links')},
					{kind: KIND.NAV, id: 'sourceCode', label: () => $L('Source Code'), desc: () => 'github.com/Moonfin-Client/Smart-TV', icon: 'code', action: (ctx) => ctx.actions.openQrLink($L('Source Code'), 'https://github.com/Moonfin-Client/Smart-TV', 'setting-sourceCode')},
					{kind: KIND.NAV, id: 'reportIssue', label: () => $L('Report an Issue'), desc: () => $L('File a bug or feature request on GitHub'), icon: 'bug_report', action: (ctx) => ctx.actions.openQrLink($L('Report an Issue'), 'https://github.com/Moonfin-Client/Smart-TV/issues', 'setting-reportIssue')},
					{kind: KIND.NAV, id: 'joinDiscord', label: () => $L('Join Discord'), desc: () => $L('Get help and follow development'), icon: 'forum', action: (ctx) => ctx.actions.openQrLink($L('Join Discord'), 'https://discord.gg/moonfin', 'setting-joinDiscord')},
					{kind: KIND.NAV, id: 'supportMoonfin', label: () => $L('Support Moonfin'), desc: () => $L('Help keep development going'), icon: 'heart', action: (ctx) => ctx.actions.openQrLink($L('Support Moonfin'), 'https://buymeacoffee.com/moonfin', 'setting-supportMoonfin')},
					{kind: KIND.SECTION, id: 'legal', label: () => $L('Legal')},
					{kind: KIND.NAV, id: 'licenses', label: () => $L('Licenses'), desc: () => $L('The license this app ships under'), icon: 'description', action: (ctx) => ctx.actions.openQrLink($L('Licenses'), 'https://github.com/Moonfin-Client/Smart-TV/blob/main/LICENSE', 'setting-licenses')},
					{kind: KIND.NAV, id: 'privacyPolicy', label: () => $L('Privacy Policy'), desc: () => 'moonfin.io/privacy', icon: 'privacy_tip', action: (ctx) => ctx.actions.openQrLink($L('Privacy Policy'), 'https://moonfin.io/privacy', 'setting-privacyPolicy')},
					{kind: KIND.SECTION, id: 'server', label: () => $L('Server')},
					{kind: KIND.INFO, id: 'serverUrl', label: () => $L('Server URL'), value: (ctx) => ctx.serverUrl || $L('Not connected'), icon: 'info'},
					{kind: KIND.INFO, id: 'serverVersion', label: () => $L('Server Version'), value: (ctx) => ctx.serverVersion || $L('Loading...'), icon: 'info'},
					{kind: KIND.SECTION, id: 'diagnostics', label: () => $L('Diagnostics & Logging')},
					{kind: KIND.TOGGLE, key: 'serverLogging', label: () => $L('Server Logging'), desc: () => $L('Send logs to Jellyfin server for troubleshooting'), icon: 'info'},
					{kind: KIND.TOGGLE, key: 'diagnosticLoggingEnabled', label: () => $L('Diagnostic Logging'), desc: () => $L('Record server requests, playback and subtitle activity so problems can be traced'), icon: 'bug_report'},
					{kind: KIND.NAV, id: 'viewLogs', label: () => $L('View Logs'), desc: () => $L('Read the recorded log and send a report'), icon: 'description', action: (ctx) => ctx.actions.openDiagnostics()},
					{kind: KIND.SECTION, id: 'device', label: () => $L('Device'), when: (ctx) => !!ctx.capabilities},
					{kind: KIND.INFO, id: 'model', label: () => $L('Model'), value: (ctx) => ctx.capabilities?.modelName || $L('Unknown'), icon: 'info', when: (ctx) => !!ctx.capabilities},
					{
						kind: KIND.INFO,
						id: 'osVersion',
						label: (ctx) => (ctx.capabilities?.tizenVersionDisplay ? $L('Tizen Version') : $L('webOS Version')),
						value: (ctx) => ctx.capabilities?.tizenVersionDisplay || ctx.capabilities?.webosVersionDisplay,
						icon: 'gear',
						when: (ctx) => !!(ctx.capabilities?.tizenVersionDisplay || ctx.capabilities?.webosVersionDisplay)
					},
					{kind: KIND.INFO, id: 'firmware', label: () => $L('Firmware'), value: (ctx) => ctx.capabilities?.firmwareVersion, icon: 'gear', when: (ctx) => !!ctx.capabilities?.firmwareVersion},
					{
						kind: KIND.INFO,
						id: 'resolution',
						label: () => $L('Resolution'),
						value: (ctx) => `${ctx.capabilities?.uhd8K ? '7680x4320 (8K)' : ctx.capabilities?.uhd ? '3840x2160 (4K)' : '1920x1080 (HD)'}${ctx.capabilities?.oled ? ' OLED' : ''}`,
						icon: 'fullscreen',
						when: (ctx) => !!ctx.capabilities
					},
					{kind: KIND.SECTION, id: 'capabilities', label: () => $L('Capabilities'), when: (ctx) => !!ctx.capabilities},
					{
						kind: KIND.INFO,
						id: 'hdr',
						label: () => 'HDR',
						value: (ctx) => [
							ctx.capabilities?.hdr10 && 'HDR10',
							ctx.capabilities?.hdr10Plus && 'HDR10+',
							ctx.capabilities?.hlg && 'HLG',
							ctx.capabilities?.dolbyVision && 'Dolby Vision'
						].filter(Boolean).join(', ') || $L('Not supported'),
						icon: 'picture',
						when: (ctx) => !!ctx.capabilities
					},
					{
						kind: KIND.INFO,
						id: 'videoCodecs',
						label: () => $L('Video Codecs'),
						value: (ctx) => ['H.264', ctx.capabilities?.hevc && 'HEVC', ctx.capabilities?.vp9 && 'VP9', ctx.capabilities?.av1 && 'AV1']
							.filter(Boolean).join(', '),
						icon: 'liveplay',
						when: (ctx) => !!ctx.capabilities
					},
					{
						kind: KIND.INFO,
						id: 'audioCodecs',
						label: () => $L('Audio Codecs'),
						value: (ctx) => [
							'AAC',
							ctx.capabilities?.ac3 && 'AC3',
							ctx.capabilities?.eac3 && 'E-AC3',
							ctx.capabilities?.truehd && 'TrueHD',
							ctx.capabilities?.dts && 'DTS',
							ctx.capabilities?.dtshd && 'DTS-HD',
							ctx.capabilities?.dolbyAtmos && 'Atmos',
							ctx.capabilities?.opus && 'OPUS'
						].filter(Boolean).join(', '),
						icon: 'music',
						when: (ctx) => !!ctx.capabilities
					},
					{
						kind: KIND.INFO,
						id: 'containers',
						label: () => $L('Containers'),
						value: (ctx) => ['MP4', ctx.capabilities?.mkv && 'MKV', 'TS', ctx.capabilities?.webm && 'WebM', ctx.capabilities?.asf && 'ASF', ctx.capabilities?.nativeHls && 'HLS', ctx.capabilities?.nativeHlsFmp4 && 'HLS-fMP4']
							.filter(Boolean).join(', '),
						icon: 'folder',
						when: (ctx) => !!ctx.capabilities
					},
					{kind: KIND.SECTION, id: 'data', label: () => $L('Data')},
					{
						kind: KIND.TEXT,
						id: 'clearDataDescription',
						text: () => $L('Remove all saved servers, login sessions, and settings. The app will restart as if freshly installed.')
					},
					{kind: KIND.CUSTOM, render: 'aboutDataActions'}
				]
			}
		]
	}
];

export const SCHEMA_BY_KEY = SETTINGS_SCHEMA.reduce((acc, category) => {
	category.subcategories.forEach((sub) => {
		acc[`${category.id}.${sub.id}`] = sub;
	});
	return acc;
}, {});
