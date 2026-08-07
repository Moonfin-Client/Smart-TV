import $L from '@enact/i18n/$L';

import {
	getAccentColorOptions,
	getAgeRatingOptions,
	getAudioLanguageOptions,
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
	getHomeRowOverlayOptions,
	getHomeRowSortOptions,
	getHomeRowsStyleOptions,
	getImageTypeOptions,
	getMediaSegmentActionOptions,
	getNavPositionOptions,
	getNextUpBehaviorOptions,
	getNextUpCountdownStyleOptions,
	getNextUpMaxDaysOptions,
	getPerformanceModeOptions,
	getPlaybackTimeDisplayOptions,
	getPlaybackTimeSlotOptions,
	getPosterSizeOptions,
	getRewatchSortOptions,
	getScreensaverDimmingOptions,
	getScreensaverModeOptions,
	getScreensaverTimeoutOptions,
	getSeasonalThemeOptions,
	getSeekStepOptions,
	getServerSortOptions,
	getSinceYouWatchedSourceItemOptions,
	getSinceYouWatchedSourceOptions,
	getSinceYouWatchedSourceTypeOptions,
	getStillWatchingBehaviorOptions,
	getSubtitleBackgroundColorOptions,
	getSubtitleColorOptions,
	getSubtitlePositionOptions,
	getSubtitleShadowColorOptions,
	getSubtitleSizeOptions,
	getUiLanguageOptions,
	getUiScaleOptions,
	getWatchedIndicatorOptions
} from './settingsOptions';

// This module describes every settings screen as data. Settings.js renders it and the
// search index reads it, so a row only ever has to be written once. It deliberately
// imports no JSX and no styles, which keeps it importable from a plain jest test.
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

const hasHomeRow = (test) => (ctx) =>
	(ctx.settings.homeRows || []).some((row) => row.enabled && test(row));

const whenSinceYouWatched = hasHomeRow((row) => row.id.startsWith('sinceyouwatched'));
const whenRewatch = hasHomeRow((row) => row.id === 'rewatch');
const whenPlugin = (ctx) => ctx.settings.useMoonfinPlugin;
const whenHdrSubtitles = (ctx) => ctx.settings.subtitleHdrSeparate;
const whenSeerr = (ctx) => ctx.seerr.isEnabled;

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
		description: () => $L('Authentication, PIN, and safety controls'),
		icon: 'general',
		subcategories: [
			{
				id: 'authentication',
				label: () => $L('Authentication'),
				description: () => $L('Sign-in and account protection'),
				rows: [
					{kind: KIND.TOGGLE, key: 'autoLogin', label: () => $L('Auto Sign In'), desc: () => $L('Automatically sign in on app launch'), icon: 'profile'},
					{kind: KIND.TOGGLE, key: 'alwaysAuthenticate', label: () => $L('Always Authenticate'), desc: () => $L('Require manual authentication after app start'), icon: 'lock'},
					{kind: KIND.TOGGLE, key: 'pinCodeProtection', label: () => $L('PIN Code Protection'), desc: () => $L('Require a PIN before opening the app'), icon: 'lockcircle'},
					{
						kind: KIND.NAV,
						id: 'pinCode',
						label: () => $L('PIN Code'),
						desc: (ctx) => (typeof ctx.settings.pinCode === 'string' && /^\d{4}$/.test(ctx.settings.pinCode)
							? $L('Configured 4-digit PIN')
							: $L('Default PIN: 0000')),
						icon: 'lockcircle',
						action: (ctx) => ctx.actions.openPinCode()
					},
					{kind: KIND.OPTION, key: 'serverSortBy', label: () => $L('Sort Servers By'), options: getServerSortOptions, fallback: () => $L('Server Name'), icon: 'arrowupdown'},
					{
						kind: KIND.TOGGLE,
						key: 'allowInsecureCerts',
						label: () => $L('Allow Untrusted Certificates'),
						desc: () => $L('If your TV rejects a server\'s security certificate, fetch through the proxy without verifying it. Use only for servers you trust.'),
						icon: 'lock',
						when: (ctx) => ctx.isWebOS
					}
				]
			},
			{
				id: 'privacySafety',
				label: () => $L('Privacy & Safety'),
				description: () => $L('Content safety and app-exit protections'),
				rows: [
					{kind: KIND.TOGGLE, key: 'exitConfirmation', label: () => $L('Exit Confirmation'), desc: () => $L('Ask before exiting the app from home/login screens'), icon: 'exit'}
				]
			}
		]
	},
	{
		id: 'personalization',
		label: () => $L('Personalization'),
		description: () => $L('Style, navigation, home, and libraries'),
		icon: 'display',
		subcategories: [
			{
				id: 'generalStyle',
				label: () => $L('General Style'),
				description: () => $L('Theme, blur, and visual style'),
				rows: [
					{kind: KIND.OPTION, key: 'uiLanguage', label: () => $L('App Language'), options: getUiLanguageOptions, fallback: () => $L('English'), icon: 'language'},
					{
						kind: KIND.NAV,
						id: 'themeSelection',
						label: () => $L('App Theme'),
						desc: (ctx) => ctx.availableThemes.find((t) => t.id === ctx.activeThemeId)?.displayName || $L('Default'),
						action: (ctx) => ctx.actions.openThemes()
					},
					{
						kind: KIND.NAV,
						id: 'themeStore',
						label: () => $L('Theme Store'),
						desc: () => $L('Browse and save community themes'),
						action: (ctx) => ctx.actions.openThemeStore()
					},
					{kind: KIND.OPTION, key: 'focusBorderColor', label: () => $L('Focus Border Color'), options: getAccentColorOptions, fallback: () => $L('Theme Default')},
					{kind: KIND.OPTION, key: 'clockDisplay', label: () => $L('Clock Display'), options: getClockDisplayOptions, fallback: () => $L('24-Hour')},
					{kind: KIND.SLIDER, key: 'timeOffsetHours', label: () => $L('Clock Offset'), desc: () => $L('Correct the clock when the TV reports the wrong time'), min: -12, max: 12, step: 1, format: hourOffset},
					{kind: KIND.TOGGLE, key: 'cardFocusZoom', label: () => $L('Focus Expansion Animation'), desc: () => $L('Scale Focused or hovered cards and tiles')},
					{kind: KIND.OPTION, key: 'uiScale', label: () => $L('UI Scaling'), options: getUiScaleOptions, fallback: () => $L('Default')},
					{kind: KIND.OPTION, key: 'performanceMode', label: () => $L('Performance Mode'), options: getPerformanceModeOptions, fallback: () => $L('Auto'), icon: 'gear'},
					{kind: KIND.TOGGLE, key: 'showHomeBackdrop', label: () => $L('Background Backdrops'), desc: () => $L('Show background image behind content')},
					{kind: KIND.OPTION, key: 'backdropBlurHome', label: () => $L('Browsing Background Blur'), options: getBlurOptions, fallback: () => $L('Medium')},
					{kind: KIND.OPTION, key: 'watchedIndicatorBehavior', label: () => $L('Watched Indicators'), options: getWatchedIndicatorOptions, fallback: () => $L('Always')}
				]
			},
			{
				id: 'detailsScreen',
				label: () => $L('Details Screen'),
				description: () => $L('Style, background blur, and tab behavior'),
				rows: [
					{kind: KIND.OPTION, key: 'detailScreenStyle', label: () => $L('Detail Screen Style'), options: getDetailScreenStyleOptions, fallback: () => $L('Modern'), icon: 'appscontents'},
					{
						kind: KIND.OPTION,
						key: 'backdropBlurDetail',
						label: (ctx) => (ctx.settings.detailScreenStyle === 'v1'
							? $L('Details Background Blur')
							: $L('Details Background Opacity')),
						options: (ctx) => (ctx.settings.detailScreenStyle === 'v1'
							? getBlurOptions()
							: getDetailsOpacityOptions()),
						fallback: (ctx) => (ctx.settings.detailScreenStyle === 'v1' ? $L('Medium') : '80%')
					},
					{kind: KIND.TOGGLE, key: 'detailExpandedTabs', label: () => $L('Expanded Tabs'), desc: () => $L('Keep detail tabs expanded and follow focus'), icon: 'appscontents', when: (ctx) => ctx.settings.detailScreenStyle !== 'v1'},
					{kind: KIND.NAV, id: 'detailButtons', label: () => $L('Details Buttons'), desc: () => $L('Enable/disable and reorder the action row buttons'), icon: 'arrowupdown', action: (ctx) => ctx.actions.openDetailButtons()}
				]
			},
			{
				id: 'navigation',
				label: () => $L('Navigation'),
				description: () => $L('Navbar layout and shortcut controls'),
				rows: [
					{kind: KIND.OPTION, key: 'navbarPosition', label: () => $L('Navbar Position'), options: getNavPositionOptions, fallback: () => $L('Top Bar'), icon: 'browser'},
					{kind: KIND.OPTION, key: 'navbarColor', label: () => $L('Navbar Color'), options: getAccentColorOptions, fallback: () => $L('Theme Default'), icon: 'colorpicker'},
					{kind: KIND.SLIDER, key: 'navbarOpacity', label: () => $L('Navbar Opacity'), min: 0, max: 100, step: 5, format: percent},
					{kind: KIND.TOGGLE, key: 'showShuffleButton', label: () => $L('Show Shuffle Button'), desc: () => $L('Show shuffle button in navigation bar')},
					{kind: KIND.OPTION, key: 'shuffleContentType', label: () => $L('Shuffle Content Type Filter'), options: getContentTypeOptions, fallback: () => $L('Movies & TV Shows'), icon: 'shuffle', when: (ctx) => ctx.settings.showShuffleButton},
					{kind: KIND.TOGGLE, key: 'showGenresButton', label: () => $L('Show Genres Button'), desc: () => $L('Show genres button in navigation bar'), icon: 'movies'},
					{kind: KIND.TOGGLE, key: 'showFavoritesButton', label: () => $L('Show Favorites Button'), desc: () => $L('Show favorites button in navigation bar'), icon: 'heart'},
					{kind: KIND.TOGGLE, key: 'showLibrariesInToolbar', label: () => $L('Show Libraries in Toolbar'), desc: () => $L('Show library button in navigation bar'), icon: 'folder'},
					{kind: KIND.TOGGLE, key: 'showSyncPlayButton', label: () => $L('Show SyncPlay Button'), desc: () => $L('Show SyncPlay button in navigation bar'), icon: 'check'},
					{kind: KIND.TOGGLE, key: 'showSeerrButton', label: (ctx) => `${ctx.seerrLabel} ${$L('Button')}`, desc: () => $L('Show Seerr button in navigation bar'), when: whenSeerr}
				]
			},
			{
				id: 'homePage',
				label: () => $L('Home Page'),
				description: () => $L('Rows and home screen behavior'),
				rows: [
					{kind: KIND.OPTION, key: 'homeRowsStyle', label: () => $L('Row Type'), options: getHomeRowsStyleOptions, fallback: () => $L('Modern'), icon: 'appscontents'},
					{kind: KIND.TOGGLE, key: 'mergeContinueWatchingNextUp', label: () => $L('Merge Continue Watching and Next Up'), desc: () => $L('Combine both rows into a single home section'), icon: 'arrowupdown'},
					{kind: KIND.OPTION, key: 'nextUpMaxDays', label: () => $L('Max Days In Next Up'), options: getNextUpMaxDaysOptions, fallback: () => $L('365 days'), desc: () => $L('How long a show stays in Next Up after you last watched it'), icon: 'recording'},
					{kind: KIND.TOGGLE, key: 'useSeriesThumbnails', label: () => $L('Display Series Thumbnails'), desc: () => $L('For TV series, use the main series artwork instead of the episode thumbnail'), icon: 'aspectratio'},
					{kind: KIND.TOGGLE, key: 'fullScreenRows', label: () => $L('Expanded Home Rows'), desc: () => $L('Limit home rows to 1 row per screen'), icon: 'aspectratio'},
					{kind: KIND.OPTION, key: 'homeRowsPosterSize', label: () => $L('Home Row Card Display Size'), options: getPosterSizeOptions, fallback: () => $L('Default'), icon: 'aspectratio'},
					{kind: KIND.OPTION, key: 'homeRowOverlay', label: () => $L('Home Row Info Overlay'), options: getHomeRowOverlayOptions, fallback: () => $L('Off'), icon: 'info'},
					{kind: KIND.NAV, id: 'homeRows', label: () => $L('Home Sections'), desc: () => $L('Reorder and toggle home rows'), icon: 'list', action: (ctx) => ctx.actions.openHomeRows()},
					{kind: KIND.OPTION, key: 'sinceYouWatchedSource', label: () => $L('Since You Watched Source'), options: getSinceYouWatchedSourceOptions, fallback: () => $L('Local'), icon: 'browser', when: whenSinceYouWatched},
					{kind: KIND.OPTION, key: 'sinceYouWatchedSourceItem', label: () => $L('Since You Watched Seed'), options: getSinceYouWatchedSourceItemOptions, fallback: () => $L('Recently Watched'), icon: 'playcircle', when: whenSinceYouWatched},
					{kind: KIND.OPTION, key: 'sinceYouWatchedSourceType', label: () => $L('Since You Watched Content'), options: getSinceYouWatchedSourceTypeOptions, fallback: () => $L('Movies'), icon: 'movies', when: whenSinceYouWatched},
					{kind: KIND.TOGGLE, key: 'sinceYouWatchedIncludeWatched', label: () => $L('Include Watched Titles'), desc: () => $L('Show titles you have already played in Since You Watched rows'), icon: 'check', when: whenSinceYouWatched},
					{kind: KIND.TOGGLE, key: 'rewatchIncludeMovies', label: () => $L('Rewatch Movies'), desc: () => $L('Include finished movies in the Rewatch row'), icon: 'movies', when: whenRewatch},
					{kind: KIND.TOGGLE, key: 'rewatchIncludeShows', label: () => $L('Rewatch TV Shows'), desc: () => $L('Include finished shows in the Rewatch row'), icon: 'liveplay', when: whenRewatch},
					{kind: KIND.TOGGLE, key: 'rewatchIncludeCollections', label: () => $L('Rewatch Collections'), desc: () => $L('Include finished collections in the Rewatch row'), icon: 'bookmark', when: whenRewatch},
					{kind: KIND.OPTION, key: 'rewatchSortBy', label: () => $L('Rewatch Sorting'), options: getRewatchSortOptions, fallback: () => $L('Recently Watched'), icon: 'arrowupdown', when: whenRewatch},
					{kind: KIND.TOGGLE, key: 'displayFavoritesRows', label: () => $L('Display Favorites Rows'), desc: () => $L('Show Favorite Movies, Series, and other favorite rows in Home Sections.'), icon: 'heart'},
					{kind: KIND.OPTION, key: 'favoritesRowSortBy', label: () => $L('Favorites Row Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayFavoritesRows},
					{kind: KIND.TOGGLE, key: 'displayCollectionsRows', label: () => $L('Display Collections Rows'), desc: () => $L('Show Collections rows in Home Sections.'), icon: 'bookmark'},
					{kind: KIND.OPTION, key: 'collectionsRowSortBy', label: () => $L('Collections Row Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayCollectionsRows},
					{kind: KIND.TOGGLE, key: 'displayGenresRows', label: () => $L('Display Genres Rows'), desc: () => $L('Show Genres rows in Home Sections.'), icon: 'movies'},
					{kind: KIND.OPTION, key: 'genresRowSortBy', label: () => $L('Genres Row Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayGenresRows},
					{kind: KIND.OPTION, key: 'genresRowItemFilter', label: () => $L('Genres Row Items'), options: getGenresRowItemFilterOptions, fallback: () => $L('Movies & TV Shows'), icon: 'filter', when: (ctx) => ctx.settings.displayGenresRows},
					{kind: KIND.TOGGLE, key: 'displayPlaylistsRows', label: () => $L('Display Playlists Rows'), desc: () => $L('Show Playlists rows in Home Sections.'), icon: 'bookmark'},
					{kind: KIND.OPTION, key: 'playlistsRowSortBy', label: () => $L('Playlists Row Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'arrowupdown', when: (ctx) => ctx.settings.displayPlaylistsRows},
					{kind: KIND.OPTION, key: 'audioRowsSortBy', label: () => $L('Music Rows Sorting'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'arrowupdown'},
					{kind: KIND.OPTION, key: 'homeRowsImageType', label: () => $L('Per Row Image Type Selection'), options: getImageTypeOptions, fallback: () => $L('Poster'), icon: 'picture'}
				]
			},
			{
				id: 'libraries',
				label: () => $L('Libraries'),
				description: () => $L('Library visibility and server grouping'),
				rows: [
					{kind: KIND.NAV, id: 'hideLibraries', label: () => $L('Library Visibility'), desc: () => $L('Toggle home page visibility per library'), icon: 'show', action: (ctx) => ctx.actions.openLibraries()},
					{kind: KIND.OPTION, key: 'folderViewMode', label: () => $L('Enable Folder View'), options: getFolderViewModeOptions, fallback: () => $L('Per Library'), icon: 'folder'},
					{kind: KIND.TOGGLE, key: 'unifiedLibraryMode', label: () => $L('Multi-Server Libraries'), desc: () => $L('Combine content from all servers into a single view'), icon: 'dns'},
					{kind: KIND.TOGGLE, key: 'showMediaDetailsOnLibraryPage', label: () => $L('Show Media Details'), desc: () => $L('Show details of the selected item at the top of Library pages'), icon: 'info'},
					{kind: KIND.TOGGLE, key: 'hideBackdropsInLibraries', label: () => $L('Hide Backdrops while Browsing?'), desc: () => $L('Hide backdrops when browsing libraries'), icon: 'picture'}
				]
			},
			{
				id: 'mediaBarLocalPreviews',
				label: () => $L('Media Bar'),
				description: () => $L('Featured content, appearance'),
				rows: [
					{kind: KIND.OPTION, key: 'featuredBarStyle', label: () => $L('Media Bar Style'), options: getFeaturedBarStyleOptions, fallback: () => $L('Moonfin'), icon: 'appscontents'},
					{kind: KIND.OPTION, key: 'featuredContentType', label: () => $L('Content Type'), options: getContentTypeOptions, fallback: () => $L('Movies & TV Shows'), icon: 'list'},
					{kind: KIND.OPTION, key: 'featuredItemCount', label: () => $L('Item Count'), options: getFeaturedItemCountOptions, fallback: () => $L('10 items'), icon: 'list'},
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
						icon: 'bookmark',
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
					{kind: KIND.TOGGLE, key: 'autoAdvance', label: () => $L('Auto Advance'), desc: () => $L('Automatically cycle featured media items'), icon: 'skip'},
					{kind: KIND.SLIDER, key: 'autoAdvanceInterval', label: () => $L('Auto Advance Interval'), min: 2, max: 20, step: 1, format: seconds, icon: 'timer', when: (ctx) => ctx.settings.autoAdvance}
				]
			},
			{
				id: 'localPreviews',
				label: () => $L('Local Previews'),
				description: () => $L('Configure trailer previews'),
				rows: [
					{kind: KIND.TOGGLE, key: 'featuredTrailerPreview', label: () => $L('Trailer Preview'), desc: () => $L('Automatically play trailer previews in media bar'), icon: 'movies'},
					{kind: KIND.TOGGLE, key: 'featuredTrailerMuted', label: () => $L('Mute Trailer Audio'), desc: () => $L('Mute trailer previews in the featured media bar and details screen trailer overlay'), icon: 'sound', when: (ctx) => ctx.settings.featuredTrailerPreview}
				]
			},
			{
				id: 'visualOverlays',
				label: () => $L('Visual Overlays'),
				description: () => $L('Seasonal effects and screensaver controls'),
				rows: [
					{kind: KIND.OPTION, key: 'seasonalTheme', label: () => $L('Seasonal Surprise'), options: getSeasonalThemeOptions, fallback: () => $L('None'), icon: 'newfeature'},
					{kind: KIND.TOGGLE, key: 'screensaverEnabled', label: () => $L('In-App Screensaver'), desc: () => $L('Reduce brightness after inactivity'), icon: 'screenpower'},
					{kind: KIND.OPTION, key: 'screensaverMode', label: () => $L('Screensaver Mode'), options: getScreensaverModeOptions, fallback: () => $L('Library Backdrops'), icon: 'liveplay', when: (ctx) => ctx.settings.screensaverEnabled},
					{kind: KIND.OPTION, key: 'screensaverTimeout', label: () => $L('Screensaver Timeout'), options: getScreensaverTimeoutOptions, fallback: () => $L('90 seconds'), icon: 'timer', when: (ctx) => ctx.settings.screensaverEnabled},
					{kind: KIND.OPTION, key: 'screensaverDimmingLevel', label: () => $L('Screensaver Dimming Level'), options: getScreensaverDimmingOptions, fallback: '50%', icon: 'light', when: (ctx) => ctx.settings.screensaverEnabled},
					{kind: KIND.OPTION, key: 'screensaverMaxRating', label: () => $L('Screensaver Max Age Rating'), options: getAgeRatingOptions, fallback: 'PG-13', icon: 'lockcircle', when: (ctx) => ctx.settings.screensaverEnabled},
					{kind: KIND.TOGGLE, key: 'screensaverAgeFilter', label: () => $L('Screensaver Rating Requirement'), desc: () => $L('Only show content with a rating'), icon: 'check', when: (ctx) => ctx.settings.screensaverEnabled},
					{kind: KIND.TOGGLE, key: 'screensaverShowClock', label: () => $L('Screensaver Clock'), desc: () => $L('Display clock during screensaver'), icon: 'timer', when: (ctx) => ctx.settings.screensaverEnabled}
				]
			},
			{
				id: 'themeMusic',
				label: () => $L('Theme Music'),
				description: () => $L('Detail Pages, home rows'),
				rows: [
					{kind: KIND.TOGGLE, key: 'themeMusicEnabled', label: () => $L('Theme Music'), desc: () => $L('Play background music on detail pages'), icon: 'music'},
					{kind: KIND.TOGGLE, key: 'themeMusicOnHomeRows', label: () => $L('Play Theme Music on Home Page'), desc: () => $L('Play theme music while browsing home rows'), icon: 'music'}
				]
			}
		]
	},
	{
		id: 'integrations',
		label: () => $L('Integrations'),
		description: () => $L('Plugin sync, ratings, Seerr, and plugin integrations'),
		icon: 'plugin',
		subcategories: [
			{
				id: 'plugin',
				label: () => $L('Plugin'),
				description: () => $L('Plugin sync and profile integration'),
				rows: [
					{
						kind: KIND.TOGGLE,
						key: 'useMoonfinPlugin',
						label: () => $L('Enable Plugin'),
						desc: (ctx) => $L('Connect for ratings, sync, and {seerrLabel} proxy').replace('{seerrLabel}', ctx.seerrLabel),
						onToggle: (ctx) => ctx.actions.handleMoonfinToggle()
					},
					{kind: KIND.CUSTOM, render: 'moonfinStatus'},
					{kind: KIND.INFO, id: 'pluginVersion', label: () => $L('Plugin Version'), value: (ctx) => ctx.seerr.pluginInfo?.version || $L('Unknown')},
					{kind: KIND.INFO, id: 'settingsSync', label: () => $L('Settings Sync'), value: (ctx) => pluginFlag(ctx.seerr.pluginInfo?.settingsSyncEnabled, $L('Available'), $L('Not Available'))},
					{kind: KIND.INFO, id: 'seerrStatus', label: (ctx) => ctx.seerrLabel, value: (ctx) => pluginFlag(ctx.seerr.pluginInfo?.seerrEnabled, $L('Enabled by Admin'), $L('Disabled by Admin'))},
					{kind: KIND.INFO, id: 'seerrVariant', label: () => $L('Detected Variant'), value: (ctx) => $L('{seerrLabel} (Seerr v3+)').replace('{seerrLabel}', ctx.seerrLabel), when: (ctx) => ctx.isSeerr}
				]
			},
			{
				id: 'metadataRatings',
				label: () => $L('Metadata & Ratings'),
				description: () => $L('Ratings providers and display options'),
				rows: [
					{kind: KIND.TOGGLE, key: 'mdblistEnabled', label: () => $L('Fetch Additional Ratings'), desc: () => $L('Enable MDBList ratings'), icon: 'star'},
					{
						kind: KIND.NAV,
						id: 'ratingSources',
						label: () => $L('Enabled Rating Sources'),
						desc: (ctx) => getEnabledRatingSourcesSummary(ctx.settings.mdblistRatingSources),
						icon: 'list',
						action: (ctx) => ctx.actions.openRatingSources()
					},
					{kind: KIND.TOGGLE, key: 'tmdbEpisodeRatingsEnabled', label: () => $L('Show Episode Ratings'), desc: () => $L('Show episode ratings from TMDB'), icon: 'star'},
					{kind: KIND.TOGGLE, key: 'showRatingLabels', label: () => $L('Show Rating Text Labels'), desc: () => $L('Display source labels under scores'), icon: 'bookmark'},
					{kind: KIND.TOGGLE, key: 'showRatingBadges', label: () => $L('Show Rating Badges'), desc: () => $L('Display ratings row on supported media screens'), icon: 'colorpicker'}
				]
			},
			{
				id: 'seerr',
				label: (ctx) => ctx.seerrLabel,
				description: (ctx) => $L('{seerrLabel} settings and status').replace('{seerrLabel}', ctx.seerrLabel),
				// The sign-in panel holds no persisted settings, so the screen itself is the
				// only thing worth surfacing. These make it findable by what it does.
				keywords: () => [$L('sign in'), $L('login'), $L('password'), $L('requests')],
				rows: [
					{kind: KIND.CUSTOM, render: 'seerrPanel'}
				]
			},
			{
				id: 'externalRows',
				label: () => $L('External Home Row Lists'),
				description: () => $L('TMDB, IMDb, custom, Seerr, and calendar rows for the home screen'),
				rows: [
					{
						kind: KIND.TEXT,
						id: 'needsPlugin',
						text: () => $L('Enable the Moonfin plugin under Integrations to use external home rows.'),
						when: (ctx) => !ctx.settings.useMoonfinPlugin
					},
					{kind: KIND.SECTION, id: 'maintenance', label: () => $L('Home Row Maintenance'), when: whenPlugin},
					{kind: KIND.NAV, id: 'homeRows', label: () => $L('Home Sections'), desc: () => $L('Reorder and toggle home rows'), icon: 'list', action: (ctx) => ctx.actions.openHomeRows(), when: whenPlugin},
					{kind: KIND.SECTION, id: 'configurations', label: () => $L('External Home Row Configurations'), when: whenPlugin},
					{kind: KIND.NAV, id: 'imdbLists', label: () => $L('IMDb Lists'), desc: () => $L('Configure IMDb Top 250, Popular, and other charts'), icon: 'movie', action: (ctx) => ctx.actions.openImdbLists(), when: whenPlugin},
					{kind: KIND.NAV, id: 'externalTmdbLists', label: () => $L('TMDB Lists'), desc: () => $L('Configure Popular, Top Rated, and Trending TMDB lists'), icon: 'list', action: (ctx) => ctx.actions.openExternalTmdbLists(), when: whenPlugin},
					{kind: KIND.NAV, id: 'externalCalendars', label: () => $L('Upcoming Calendars'), desc: () => $L('Toggle upcoming calendars from Radarr and Sonarr'), icon: 'list', action: (ctx) => ctx.actions.openExternalCalendars(), when: (ctx) => whenPlugin(ctx) && whenSeerr(ctx)},
					{kind: KIND.NAV, id: 'seerrHomeRows', label: (ctx) => `${ctx.seerrLabel} ${$L('Lists')}`, desc: () => $L('Configure Seerr discovery rows'), icon: 'list', action: (ctx) => ctx.actions.openSeerrHomeRows(), when: (ctx) => whenPlugin(ctx) && whenSeerr(ctx)},
					{
						kind: KIND.NAV,
						id: 'externalCustomRows',
						label: () => $L('Custom Home Rows Wizard'),
						desc: (ctx) => $L('{count} configured').replace('{count}', String((ctx.settings.customHomeRows || []).length)),
						icon: 'list',
						action: (ctx) => ctx.actions.openExternalCustomRows(),
						when: whenPlugin
					}
				]
			}
		]
	},
	{
		id: 'playbackSyncPlay',
		label: () => $L('Playback & SyncPlay'),
		description: () => $L('Video, audio, subtitles, queue, and sync settings'),
		icon: 'playback',
		subcategories: [
			{
				id: 'video',
				label: () => $L('Video'),
				description: () => $L('Playback quality, seeking, and behavior'),
				rows: [
					{kind: KIND.OPTION, key: 'introAction', label: () => $L('Intro Action'), options: getMediaSegmentActionOptions, fallback: () => $L('Ask to Skip'), icon: 'skip'},
					{kind: KIND.OPTION, key: 'outroAction', label: () => $L('Outro Action'), options: getMediaSegmentActionOptions, fallback: () => $L('Ask to Skip'), icon: 'skip'},
					{kind: KIND.TOGGLE, key: 'replaceSkipOutroWithNextUp', label: () => $L('Next Up Instead of Skip Outro'), desc: () => $L('Offer the next episode at the credits rather than a skip button'), icon: 'skip', when: (ctx) => ctx.settings.outroAction !== 'none'},
					{kind: KIND.TOGGLE, key: 'autoPlay', label: () => $L('Auto Play Next'), desc: () => $L('Automatically play the next episode'), icon: 'playcircle'},
					{kind: KIND.TOGGLE, key: 'cinemaModeEnabled', label: () => $L('Cinema Mode'), desc: () => $L('Play trailers/prerolls before a main feature'), icon: 'movies'},
					{kind: KIND.OPTION, key: 'maxBitrate', label: () => $L('Maximum Bitrate'), options: getBitrateOptions, fallback: () => $L('Auto (Recommended)'), icon: 'download'},
					{kind: KIND.OPTION, key: 'seekStep', label: () => $L('Seek Step'), options: getSeekStepOptions, fallback: () => $L('10 seconds'), icon: 'skip'},
					{kind: KIND.SLIDER, key: 'skipForwardLength', label: () => $L('Skip Forward Length'), min: 5, max: 30, step: 5, format: seconds, icon: 'fifteenforward'},
					{kind: KIND.SLIDER, key: 'unpauseRewind', label: () => $L('Unpause Rewind'), min: 0, max: 10, step: 1, format: (v) => (v === 0 ? $L('Off') : `${v}s`), icon: 'replay'},
					{kind: KIND.TOGGLE, key: 'showDescriptionOnPause', label: () => $L('Show Description on Pause'), desc: () => $L('Display item description when paused'), icon: 'pausecircle'},
					{kind: KIND.TOGGLE, key: 'stereoUpmixEnabled', label: () => $L('Stereo to Surround Upmix'), desc: () => $L('Upmix stereo audio to 5.1 surround via server transcoding'), icon: 'music'},
					{kind: KIND.DIVIDER, id: 'transcode'},
					{kind: KIND.TOGGLE, key: 'preferTranscode', label: () => $L('Prefer Transcoding'), desc: () => $L('Request transcoded streams when available'), icon: 'gear'},
					{kind: KIND.TOGGLE, key: 'forceDirectPlay', label: () => $L('Force Direct Play'), desc: () => $L('Skip codec checks and always attempt DirectPlay (debug)'), icon: 'play'},
					{kind: KIND.DIVIDER, id: 'playerButtons'},
					{kind: KIND.NAV, id: 'osdButtons', label: () => $L('Player Buttons'), desc: () => $L('Enable/disable and reorder the playback control buttons'), icon: 'arrowupdown', action: (ctx) => ctx.actions.openOsdButtons()}
				]
			},
			{
				id: 'playbackTime',
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
				label: () => $L('Audio'),
				description: () => $L('Audio language and passthrough options'),
				rows: [
					{kind: KIND.OPTION, key: 'audioLanguage', label: () => $L('Default Audio Language'), options: getAudioLanguageOptions, fallback: () => $L('Auto'), icon: 'language'},
					{kind: KIND.TOGGLE, key: 'passthroughEnabled', label: () => $L('Audio Passthrough'), desc: () => $L('Enable advanced bitstream passthrough for external audio devices'), icon: 'speaker'},
					{kind: KIND.TOGGLE, key: 'ac3Passthrough', label: () => $L('AC3 Passthrough'), desc: () => $L('Allow Dolby Digital passthrough when available'), icon: 'speaker'},
					{kind: KIND.TOGGLE, key: 'eac3Passthrough', label: () => $L('E-AC3 Passthrough'), desc: () => $L('Allow Dolby Digital Plus passthrough when available'), icon: 'speaker'},
					{kind: KIND.TOGGLE, key: 'truehdPassthrough', label: () => $L('TrueHD Passthrough (Experimental)'), desc: () => $L('Allow Dolby TrueHD passthrough when available'), icon: 'speaker'},
					{kind: KIND.TOGGLE, key: 'forceTruehdPassthrough', label: () => $L('Force TrueHD / Atmos Passthrough'), desc: () => $L('Send Dolby TrueHD and Atmos straight to your receiver. Make sure your receiver supports it.'), icon: 'speaker'}
				]
			},
			{
				id: 'subtitles',
				label: () => $L('Subtitles'),
				description: () => $L('Subtitle defaults and direct-play options'),
				rows: [
					{kind: KIND.OPTION, key: 'subtitleSize', label: () => $L('Subtitle Size'), options: getSubtitleSizeOptions, fallback: () => $L('Medium'), icon: 'textinput'},
					{kind: KIND.OPTION, key: 'subtitlePosition', label: () => $L('Subtitle Position'), options: getSubtitlePositionOptions, fallback: () => $L('Bottom'), icon: 'arrowlargedown'},
					{kind: KIND.SLIDER, key: 'subtitlePositionAbsolute', label: () => $L('Absolute Position'), min: 0, max: 100, step: 5, format: percent, icon: 'arrowupdown', when: (ctx) => ctx.settings.subtitlePosition === 'absolute'},
					{kind: KIND.SLIDER, key: 'subtitleOpacity', label: () => $L('Text Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'contrast'},
					{kind: KIND.OPTION, key: 'subtitleColor', label: () => $L('Text Color'), options: getSubtitleColorOptions, fallback: () => $L('White'), icon: 'textinput'},
					{kind: KIND.DIVIDER, id: 'shadow'},
					{kind: KIND.OPTION, key: 'subtitleShadowColor', label: () => $L('Shadow Color'), options: getSubtitleShadowColorOptions, fallback: () => $L('Black'), icon: 'edit'},
					{kind: KIND.SLIDER, key: 'subtitleShadowOpacity', label: () => $L('Shadow Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'contrast'},
					{kind: KIND.SLIDER, key: 'subtitleShadowBlur', label: () => $L('Shadow Size (Blur)'), min: 0, max: 1, step: 0.1, format: (v) => (v || 0.1).toFixed(1), icon: 'picture'},
					{kind: KIND.DIVIDER, id: 'background'},
					{kind: KIND.OPTION, key: 'subtitleBackgroundColor', label: () => $L('Background Color'), options: getSubtitleBackgroundColorOptions, fallback: () => $L('Black'), icon: 'colorpicker'},
					{kind: KIND.SLIDER, key: 'subtitleBackground', label: () => $L('Background Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'contrast'},
					{kind: KIND.DIVIDER, id: 'rendering'},
					{kind: KIND.TOGGLE, key: 'enablePgsRendering', label: () => $L('Direct Play PGS Subtitles'), desc: () => $L('Use client-side rendering for bitmap subtitles (PGS, DVB, DVD)'), icon: 'picture'}
				]
			},
			{
				id: 'subtitlesHdr',
				label: () => $L('HDR Subtitles'),
				description: () => $L('A separate style used while HDR is playing'),
				rows: [
					{
						kind: KIND.TOGGLE,
						key: 'subtitleHdrSeparate',
						label: () => $L('Separate HDR Style'),
						desc: () => $L('Use the style below whenever HDR content is playing. White is much brighter in HDR than in SDR, so a dimmer color here avoids the glare.'),
						icon: 'picture'
					},
					{kind: KIND.OPTION, key: 'subtitleSizeHdr', label: () => $L('Subtitle Size'), options: getSubtitleSizeOptions, fallback: () => $L('Medium'), icon: 'textinput', when: whenHdrSubtitles},
					{kind: KIND.OPTION, key: 'subtitlePositionHdr', label: () => $L('Subtitle Position'), options: getSubtitlePositionOptions, fallback: () => $L('Bottom'), icon: 'arrowlargedown', when: whenHdrSubtitles},
					{kind: KIND.SLIDER, key: 'subtitlePositionAbsoluteHdr', label: () => $L('Absolute Position'), min: 0, max: 100, step: 5, format: percent, icon: 'arrowupdown', when: (ctx) => whenHdrSubtitles(ctx) && ctx.settings.subtitlePositionHdr === 'absolute'},
					{kind: KIND.SLIDER, key: 'subtitleOpacityHdr', label: () => $L('Text Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'contrast', when: whenHdrSubtitles},
					{kind: KIND.OPTION, key: 'subtitleColorHdr', label: () => $L('Text Color'), options: getSubtitleColorOptions, fallback: () => $L('Grey'), icon: 'textinput', when: whenHdrSubtitles},
					{kind: KIND.DIVIDER, id: 'hdrShadow', when: whenHdrSubtitles},
					{kind: KIND.OPTION, key: 'subtitleShadowColorHdr', label: () => $L('Shadow Color'), options: getSubtitleShadowColorOptions, fallback: () => $L('Black'), icon: 'edit', when: whenHdrSubtitles},
					{kind: KIND.SLIDER, key: 'subtitleShadowOpacityHdr', label: () => $L('Shadow Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'contrast', when: whenHdrSubtitles},
					{kind: KIND.SLIDER, key: 'subtitleShadowBlurHdr', label: () => $L('Shadow Size (Blur)'), min: 0, max: 1, step: 0.1, format: (v) => (v || 0.1).toFixed(1), icon: 'picture', when: whenHdrSubtitles},
					{kind: KIND.DIVIDER, id: 'hdrBackground', when: whenHdrSubtitles},
					{kind: KIND.OPTION, key: 'subtitleBackgroundColorHdr', label: () => $L('Background Color'), options: getSubtitleBackgroundColorOptions, fallback: () => $L('Black'), icon: 'colorpicker', when: whenHdrSubtitles},
					{kind: KIND.SLIDER, key: 'subtitleBackgroundHdr', label: () => $L('Background Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'contrast', when: whenHdrSubtitles}
				]
			},
			{
				id: 'subtitleCustomization',
				label: () => $L('Subtitle Customization'),
				description: () => $L('Text color, size, and position styling'),
				rows: [
					{kind: KIND.OPTION, key: 'subtitleSize', label: () => $L('Subtitle Size'), options: getSubtitleSizeOptions, fallback: () => $L('Medium'), icon: 'textinput'},
					{kind: KIND.OPTION, key: 'subtitleColor', label: () => $L('Text Fill Color'), options: getSubtitleColorOptions, fallback: () => $L('White'), icon: 'textinput'},
					{kind: KIND.OPTION, key: 'subtitleShadowColor', label: () => $L('Text Stroke Color'), options: getSubtitleShadowColorOptions, fallback: () => $L('Black'), icon: 'edit'},
					{kind: KIND.OPTION, key: 'subtitleBackgroundColor', label: () => $L('Background Color'), options: getSubtitleBackgroundColorOptions, fallback: () => $L('Black'), icon: 'colorpicker'},
					{kind: KIND.OPTION, key: 'subtitlePosition', label: () => $L('Vertical Offset'), options: getSubtitlePositionOptions, fallback: () => $L('Bottom'), icon: 'arrowlargedown'}
				]
			},
			{
				id: 'automationQueue',
				label: () => $L('Automation & Queue'),
				description: () => $L('Next up, queueing, and prompt behavior'),
				rows: [
					{kind: KIND.TOGGLE, key: 'autoPlay', label: () => $L('Episode Queuing'), desc: () => $L('Automatically play the next episode'), icon: 'list'},
					{kind: KIND.OPTION, key: 'nextUpBehavior', label: () => $L('Next Up Prompt'), options: getNextUpBehaviorOptions, fallback: () => $L('Extended'), icon: 'skip'},
					{kind: KIND.OPTION, key: 'nextUpCountdownStyle', label: () => $L('Next Up Countdown'), options: getNextUpCountdownStyleOptions, fallback: () => $L('Both'), icon: 'timer', when: (ctx) => ctx.settings.nextUpBehavior !== 'disabled'},
					{kind: KIND.SLIDER, key: 'nextUpTimeout', label: () => $L('Next Up Prompt Timeout'), min: 0, max: 30, step: 1, format: (v) => (v === 0 ? $L('Instant') : `${v}s`), icon: 'timer', when: (ctx) => ctx.settings.nextUpBehavior !== 'disabled'},
					{kind: KIND.OPTION, key: 'stillWatchingBehavior', label: () => $L('Still Watching Prompt'), options: getStillWatchingBehaviorOptions, fallback: () => $L('3 episodes'), desc: () => $L('Prompt to Continue Watching after X consecutive episodes.'), icon: 'show'}
				]
			},
			{
				id: 'offlineDownloads',
				label: () => $L('Offline Downloads'),
				description: () => $L('Download quality, location, and limits'),
				// Nothing here yet, so search must not offer it as a destination.
				search: false,
				rows: []
			},
			{
				id: 'syncPlay',
				label: () => $L('SyncPlay'),
				description: () => $L('Group playback sync controls'),
				rows: [
					{kind: KIND.TOGGLE, key: 'syncplayEnabled', label: () => $L('SyncPlay Enabled'), desc: () => $L('Enable SyncPlay groups and controls'), icon: 'groups'},
					{kind: KIND.TOGGLE, key: 'showSyncPlayButton', label: () => $L('SyncPlay Button'), desc: () => $L('Show SyncPlay button in navigation bar'), icon: 'check'},
					{kind: KIND.TOGGLE, key: 'syncplayAutoOpen', label: () => $L('Open SyncPlay'), desc: () => $L('Automatically open SyncPlay dialog when starting playback'), icon: 'groups'}
				]
			},
			{
				id: 'advanced',
				label: () => $L('Advanced'),
				description: () => $L('Advanced playback options'),
				rows: [
					{kind: KIND.SLIDER, key: 'videoStartDelay', label: () => $L('Video Start Delay'), min: 0, max: 5, step: 0.5, format: (v) => (v === 0 ? $L('Off') : `${Number(v).toFixed(1)}s`), icon: 'scheduler'},
					{kind: KIND.TOGGLE, key: 'liveTvDirect', label: () => $L('Live TV Direct'), desc: () => $L('Open the first available live channel directly from library selection'), icon: 'liveplay'}
				]
			}
		]
	},
	{
		id: 'about',
		label: () => $L('About'),
		description: () => $L('App version, device info, and diagnostics'),
		icon: 'about',
		subcategories: [
			{
				id: 'appInfo',
				label: () => $L('App Info'),
				description: () => $L('Version and update settings'),
				rows: [
					{kind: KIND.INFO, id: 'appVersion', label: () => $L('App Version'), value: () => process.env.REACT_APP_VERSION || '0.0.0'},
					{
						kind: KIND.INFO,
						id: 'platform',
						label: () => $L('Platform'),
						value: (ctx) => (ctx.capabilities?.tizenVersionDisplay ? 'Tizen' : ctx.capabilities?.webosVersionDisplay ? 'webOS' : $L('Unknown'))
					},
					{kind: KIND.TOGGLE, key: 'updateNotificationsEnabled', label: () => $L('Update Notifications'), desc: () => $L('Show app update notifications when a new release is available'), icon: 'download'}
				]
			},
			{
				id: 'serverInfo',
				label: () => $L('Server'),
				description: () => $L('Connection and version'),
				rows: [
					{kind: KIND.INFO, id: 'serverUrl', label: () => $L('Server URL'), value: (ctx) => ctx.serverUrl || $L('Not connected'), icon: 'info'},
					{kind: KIND.INFO, id: 'serverVersion', label: () => $L('Server Version'), value: (ctx) => ctx.serverVersion || $L('Loading...'), icon: 'info'}
				]
			},
			{
				id: 'debugging',
				label: () => $L('Debugging'),
				description: () => $L('Logging options'),
				rows: [
					{kind: KIND.TOGGLE, key: 'serverLogging', label: () => $L('Server Logging'), desc: () => $L('Send logs to Jellyfin server for troubleshooting'), icon: 'info'},
					{kind: KIND.TOGGLE, key: 'diagnosticLoggingEnabled', label: () => $L('Diagnostic Logging'), desc: () => $L('Record server requests, playback and subtitle activity so problems can be traced'), icon: 'dns'},
					{kind: KIND.NAV, id: 'diagnostics', label: () => $L('View Logs'), desc: () => $L('Read the recorded log and send a report'), icon: 'description', action: (ctx) => ctx.actions.openDiagnostics()}
				]
			},
			{
				id: 'device',
				label: () => $L('Device'),
				description: () => $L('Model and hardware info'),
				when: (ctx) => !!ctx.capabilities,
				rows: [
					{kind: KIND.INFO, id: 'model', label: () => $L('Model'), value: (ctx) => ctx.capabilities?.modelName || $L('Unknown'), icon: 'info'},
					{
						kind: KIND.INFO,
						id: 'osVersion',
						label: (ctx) => (ctx.capabilities.tizenVersionDisplay ? $L('Tizen Version') : $L('webOS Version')),
						value: (ctx) => ctx.capabilities.tizenVersionDisplay || ctx.capabilities.webosVersionDisplay,
						icon: 'gear',
						when: (ctx) => !!(ctx.capabilities?.tizenVersionDisplay || ctx.capabilities?.webosVersionDisplay)
					},
					{kind: KIND.INFO, id: 'firmware', label: () => $L('Firmware'), value: (ctx) => ctx.capabilities.firmwareVersion, icon: 'gear', when: (ctx) => !!ctx.capabilities?.firmwareVersion},
					{
						kind: KIND.INFO,
						id: 'resolution',
						label: () => $L('Resolution'),
						value: (ctx) => `${ctx.capabilities?.uhd8K ? '7680x4320 (8K)' : ctx.capabilities?.uhd ? '3840x2160 (4K)' : '1920x1080 (HD)'}${ctx.capabilities?.oled ? ' OLED' : ''}`,
						icon: 'fullscreen'
					}
				]
			},
			{
				id: 'capabilities',
				label: () => $L('Capabilities'),
				description: () => $L('Supported formats and codecs'),
				when: (ctx) => !!ctx.capabilities,
				rows: [
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
						icon: 'picture'
					},
					{
						kind: KIND.INFO,
						id: 'videoCodecs',
						label: () => $L('Video Codecs'),
						value: (ctx) => ['H.264', ctx.capabilities?.hevc && 'HEVC', ctx.capabilities?.vp9 && 'VP9', ctx.capabilities?.av1 && 'AV1']
							.filter(Boolean).join(', '),
						icon: 'liveplay'
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
						icon: 'music'
					},
					{
						kind: KIND.INFO,
						id: 'containers',
						label: () => $L('Containers'),
						value: (ctx) => ['MP4', ctx.capabilities?.mkv && 'MKV', 'TS', ctx.capabilities?.webm && 'WebM', ctx.capabilities?.asf && 'ASF', ctx.capabilities?.nativeHls && 'HLS', ctx.capabilities?.nativeHlsFmp4 && 'HLS-fMP4']
							.filter(Boolean).join(', '),
						icon: 'folder'
					}
				]
			},
			{
				id: 'data',
				label: () => $L('Data'),
				description: () => $L('Storage and reset'),
				rows: [
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
