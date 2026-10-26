import $L from '@enact/i18n/$L';
import {isSignInPinEnabled} from '../../utils/signInPin';
import {isTrickplayOn} from '../../utils/trickplayLayout';
import {mediaPreviewMode, mediaPreviewSettings} from '../../utils/mediaPreviewMode';
import {homeBackdropStyle, homeBackdropSettings} from '../../utils/homeBackdropStyle';

import {
	getAccentColorOptions,
	getAgeRatingOptions,
	getAudioLanguageOptions,
	getAutoLoginOptions,
	getBitrateOptions,
	getBlurOptions,
	getContentTypeOptions,
	getDetailScreenStyleOptions,
	getDetailButtonsMaxVisibleOptions,
	getDetailsOpacityOptions,
	getEnabledRatingSourcesSummary,
	getFeaturedBarStyleOptions,
	getFeaturedItemCountOptions,
	getFolderViewModeOptions,
	getGenresRowItemFilterOptions,
	getHomeRowSortOptions, getPlaylistCollectionSortOptions,
	getHomeBackdropStyleOptions,
	getExternalRowSortByOptions, getExternalRowSortOrderOptions,
	getHomeRowsStyleOptions,
	getBookLibraryStyleOptions,
	getKeyboardStyleOptions,
	getLibraryStyleOptions,
	getMediaPreviewModeOptions,
	getMusicLibraryStyleOptions,
	getModernCardTransitionSpeedOptions,
	getImageTypeOptions,
	getLoadingAnimationImageOptions,
	getLoadingAnimationPositionOptions,
	getLoadingAnimationSpeedOptions,
	getMaxAudioChannelsOptions,
	getMaxResolutionOptions,
	getMediaSegmentActionOptions,
	getMediaSegmentAutoHideOptions,
	getNavPositionOptions,
	getNextUpBehaviorOptions,
	getNextUpCountdownStyleOptions,
	getContinueWatchingDefaultActionOptions,
	getNextUpMaxDaysOptions,
	getOledModeOptions,
	getOverlayColorOptions,
	getPassthroughModeOptions,
	getPerformanceModeOptions,
	getPersonalRatingStyleOptions,
	getPlaybackTimeDisplayOptions,
	getPlaybackTimeSlotOptions,
	getPosterSizeOptions,
	getRecommendationSystemSourceOptions,
	getResumeRewindOptions,
	getRewatchSortOptions,
	getScreensaverBackdropOptions,
	getScreensaverComponentOptions,
	getScreensaverDimmingOptions,
	getScreensaverMovementOptions,
	getScreensaverPositionOptions,
	getScreensaverSizeOptions,
	getScreensaverTimeoutOptions,
	getSeasonalDensityOptions,
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
	getTranscodeAudioCodecOptions,
	getUiLanguageOptions,
	getUiScaleOptions,
	getWatchedIndicatorOptions,
	getZoomModeOptions,
	getTrickplayModeOptions,
	getRecentlyReleasedSeriesTypeOptions
} from './settingsOptions';
import {resolveOverlayColor} from '../../theme/overlayColors';

// This module describes every settings screen as data. Settings.js renders it and the
// search index reads it, so a row only ever has to be written once. It deliberately
// imports no JSX and no styles, which keeps it importable from a plain jest test.
//
// The hierarchy, groupings, and wording follow the other clients' TV settings so the same
// setting lives in the same place on every client. A subcategory's `section` labels the
// group it renders under in its category menu, and `menu: false` keeps a screen out of
// that menu when it is only reached from a row elsewhere.
//
// `clean` marks the screens that set their headings in NotoSans. On a picker row, `padded` gives a
// text or number picker roomier padding, and `valueAsSubtitle` writes the value under the title
// with a chevron instead of in a bubble. `colorTile` draws a colour row as a bare icon with the
// colour on the end, and `plainIcon` drops the tile behind a row's icon.
// A picker row that stands for more than one setting reads its choice with `value` and writes
// it with `onSelect`.
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
const whenMediaPreview = (ctx) => mediaPreviewMode(ctx.settings) !== 'off';
const whenScreensaverLibrary = (ctx) => ctx.settings.screensaverEnabled && ctx.settings.screensaverBackdrop === 'library';
const whenScreensaverComponent = (ctx) => ctx.settings.screensaverEnabled && ctx.settings.screensaverComponent !== 'none';
const whenScreensaverStatic = (ctx) => whenScreensaverComponent(ctx) && ctx.settings.screensaverMovement === 'staticCorner';
const whenLoadingAnimation = (ctx) => ctx.settings.loadingAnimationImage !== 'none';
const whenTrickplay = (ctx) => isTrickplayOn(ctx.settings);
// A Fire TV plays through a browser video element and an Xbox has a passthrough switch
// of its own, so neither uses these rows
const inBrowserElement = (ctx) => ctx.isVega || ctx.isXbox;
const whenPassthrough = (ctx) => ctx.settings.audioPassthroughMode === 'manual' && !inBrowserElement(ctx);
// Only the Xbox console player can hand the console a file's sound as it is
const whenXboxPassthrough = (ctx) => ctx.isXbox && ctx.settings.xboxNativePlayer !== false;
const xboxPassesThrough = (ctx) => whenXboxPassthrough(ctx) && !!ctx.settings.xboxPassthrough;
// The platforms where the app can be told to accept a certificate the device refuses
const whenCertificateChoice = (ctx) => ctx.isWebOS || ctx.isVega || ctx.isXbox;
// Samsung sets decode AC3 and E-AC3 themselves, so these two toggles only do anything on webOS
const whenWebOSPassthrough = (ctx) => whenPassthrough(ctx) && ctx.isWebOS;
const whenSyncCorrection = (ctx) => ctx.settings.syncPlayAdvancedCorrectionEnabled !== false;
// TrueHD only reaches a receiver while something may bitstream, in auto and manual mode alike
const whenTruehdOptIn = (ctx) => ctx.settings.audioPassthroughMode !== 'disabled' && !ctx.settings.downmixToStereo;
const whenSubtitlesOn = (ctx) => ctx.settings.subtitleMode !== 'none';

const countLabel = (count) => $L('{count} selected').replace('{count}', String(count));

export const SETTINGS_SCHEMA = [
	{
		id: 'account',
		when: (ctx) => !ctx.settings.kidsModeEnabled,
		label: () => $L('Account'),
		description: () => $L('Sign-in, PIN code, Kids Mode, parental controls, and settings sync'),
		icon: 'lock',
		subcategories: [
			{
				id: 'account',
				icon: 'lock',
				label: () => $L('Account'),
				description: () => $L('Sign-in, PIN code, Kids Mode, parental controls, and settings sync'),
				rows: [
					{kind: KIND.SECTION, id: 'signIn', label: () => $L('Sign-in')},
					{kind: KIND.OPTION, key: 'autoLoginBehavior', label: () => $L('Auto Login'), options: getAutoLoginOptions, fallback: () => $L('Last User'), icon: 'person'},
					{kind: KIND.TOGGLE, key: 'alwaysAuthenticate', label: () => $L('Always Authenticate'), desc: () => $L('Require password even with stored token'), icon: 'lock'},
					{kind: KIND.NAV, id: 'pinCodeSettings', label: () => $L('PIN Code'), desc: () => $L('Require a PIN to access your account'), icon: 'pin', action: (ctx) => ctx.actions.openScreen('account', 'pinCode', 'setting-pinCodeSettings')},
					{kind: KIND.SECTION, id: 'family', label: () => $L('Family')},
					{
						kind: KIND.NAV,
						id: 'kidsMode',
						label: () => $L('Kids Mode'),
						desc: () => $L('Simplify the app and lock the way out with a PIN'),
						icon: 'child_care',
						keywords: () => ['kids', 'child', 'children', 'simple', 'lock', 'pin'],
						when: (ctx) => !ctx.settings.kidsModeEnabled,
						action: (ctx) => ctx.actions.openKidsMode()
					},
					{
						kind: KIND.NAV,
						id: 'parentalControls',
						label: () => $L('Parental Controls'),
						desc: () => $L('Content rating restrictions'),
						icon: 'family_restroom',
						action: (ctx) => ctx.actions.openParentalControls()
					},
					{kind: KIND.SECTION, id: 'servers', label: () => $L('Servers')},
					{kind: KIND.OPTION, key: 'serverSortBy', label: () => $L('Sort Servers By'), options: getServerSortOptions, fallback: () => $L('Server name'), icon: 'swap_horiz'},
					{
						kind: KIND.TOGGLE,
						key: 'allowInsecureCerts',
						label: () => $L('Allow Self-Signed Certificates'),
						desc: (ctx) => (ctx.isXbox
							? $L('If your Xbox rejects a server\'s security certificate, accept it anyway. Use only for servers you trust.')
							: ctx.isVega
								? $L('If your Fire TV rejects a server\'s security certificate, accept it anyway. Use only for servers you trust.')
								: $L('If your TV rejects a server\'s security certificate, fetch through the proxy without verifying it. Use only for servers you trust.')),
						icon: 'gpp_maybe',
						when: whenCertificateChoice
					},
					{kind: KIND.SECTION, id: 'sync', label: () => ''},
					{kind: KIND.NAV, id: 'settingsSync', label: () => $L('Settings Sync'), desc: () => $L('Moonbase plugin sync and customization profiles'), icon: 'sync', action: (ctx) => ctx.actions.openScreen('account', 'settingsSync', 'setting-settingsSync')}
				]
			},
			{
				id: 'pinCode',
				clean: true,
				icon: 'pin',
				menu: false,
				label: () => $L('PIN Code'),
				rows: [
					{kind: KIND.SECTION, id: 'pinGeneral', label: () => $L('General')},
					{
						kind: KIND.TOGGLE,
						key: 'pinCodeProtection',
						label: () => $L('Enable PIN Code'),
						desc: (ctx) => (ctx.signInPin.server ? $L('PIN synced') : $L('Require a PIN to access your account')),
						icon: 'lock',
						isOn: (ctx) => isSignInPinEnabled(ctx.signInPin),
						onToggle: (ctx) => ctx.actions.toggleSignInPin()
					},
					{kind: KIND.SECTION, id: 'pinManage', label: () => $L('Manage'), when: (ctx) => isSignInPinEnabled(ctx.signInPin)},
					{
						kind: KIND.NAV,
						id: 'pinCode',
						label: () => $L('Change PIN'),
						desc: () => $L('Set a new PIN code'),
						icon: 'edit',
						when: (ctx) => isSignInPinEnabled(ctx.signInPin),
						action: (ctx) => ctx.actions.changeSignInPin()
					},
					{
						kind: KIND.NAV,
						id: 'removePin',
						label: () => $L('Remove PIN'),
						desc: () => $L('Remove PIN code protection'),
						icon: 'delete',
						when: (ctx) => isSignInPinEnabled(ctx.signInPin),
						action: (ctx) => ctx.actions.removeSignInPin()
					}
				]
			},
			{
				id: 'settingsSync',
				clean: true,
				appBarAction: {icon: 'refresh', label: () => $L('Refresh'), action: (ctx) => ctx.actions.refreshPlugin()},
				icon: 'sync',
				menu: false,
				label: () => $L('Settings Sync'),
				rows: [
					// The status card, the profile picker and the sync actions draw as one block.
					// It keeps the plugin switch's key, so a search for the switch lands on the
					// card that flips it.
					{
						kind: KIND.CUSTOM,
						key: 'useMoonfinPlugin',
						render: 'moonbasePlugin',
						search: true,
						icon: 'extension',
						label: () => $L('Moonbase'),
						desc: (ctx) => $L('Connect for ratings, sync, and {seerrLabel} proxy').replace('{seerrLabel}', ctx.seerrLabel),
						keywords: () => [$L('Profile')]
					}
				]
			}
		]
	},
	{
		id: 'general',
		when: (ctx) => !ctx.settings.kidsModeEnabled,
		label: () => $L('General'),
		description: () => $L('Language, clock, input, and performance'),
		icon: 'tune',
		subcategories: [
			{
				id: 'general',
				icon: 'tune',
				label: () => $L('General'),
				description: () => $L('Language, clock, input, and performance'),
				rows: [
					{kind: KIND.SECTION, id: 'language', label: () => $L('Language')},
					{kind: KIND.OPTION, key: 'uiLanguage', label: () => $L('Interface Language'), options: getUiLanguageOptions, fallback: () => 'English (US)', icon: 'language', padded: true},
					{kind: KIND.SECTION, id: 'clock', label: () => $L('Clock')},
					{kind: KIND.TOGGLE, key: 'showClock', label: () => $L('Clock Display'), icon: 'access_time'},
					// Stored as 12-hour or 24-hour, and shown as a switch
					{
						kind: KIND.TOGGLE,
						key: 'clockDisplay',
						label: () => $L('24-Hour Clock'),
						desc: () => $L('Use 24-hour time formatting wherever the clock is shown'),
						icon: 'schedule',
						isOn: (ctx) => ctx.settings.clockDisplay === '24-hour',
						onToggle: (ctx) => ctx.actions.setSetting('clockDisplay', ctx.settings.clockDisplay === '24-hour' ? '12-hour' : '24-hour')
					},
					{kind: KIND.SLIDER, key: 'timeOffsetHours', label: () => $L('Clock Offset'), desc: () => $L('Correct the clock when the TV reports the wrong time'), min: -12, max: 12, step: 1, format: hourOffset, icon: 'more_time'},
					{kind: KIND.SECTION, id: 'input', label: () => $L('Input')},
					{kind: KIND.OPTION, key: 'keyboardStyle', label: () => $L('Keyboard Style'), desc: () => $L("Native uses your TV's own keyboard. Classic is the original Moonfin keyboard. Glass is a frosted panel with larger keys. Docked fills the bottom of the screen and shows what you type above the keys."), options: getKeyboardStyleOptions, fallback: () => $L('Docked'), icon: 'keyboard_alt_outlined'},
					{kind: KIND.SECTION, id: 'behavior', label: () => $L('Behavior')},
					{kind: KIND.TOGGLE, key: 'exitConfirmation', label: () => $L('Confirm Exit'), desc: () => $L('Show confirmation before exiting'), icon: 'exit_to_app'},
					{kind: KIND.SECTION, id: 'performance', label: () => $L('Performance')},
					{kind: KIND.OPTION, key: 'performanceMode', label: () => $L('Performance'), options: getPerformanceModeOptions, fallback: () => $L('Auto'), icon: 'speed_outlined'}
				]
			}
		]
	},
	{
		id: 'appearance',
		when: (ctx) => !ctx.settings.kidsModeEnabled,
		label: () => $L('Appearance'),
		description: () => $L('Navigation, home screen, libraries, details page, and themes'),
		icon: 'palette',
		subcategories: [
			{
				id: 'appearance',
				icon: 'palette',
				label: () => $L('Appearance'),
				description: () => $L('Navigation, home screen, libraries, details page, and themes'),
				rows: [
					{kind: KIND.SECTION, id: 'navigation', label: () => $L('Navigation')},
					{kind: KIND.NAV, id: 'navigationBar', label: () => $L('Navigation Bar'), desc: () => $L('Navbar style, toolbar buttons, appearance'), icon: 'view_sidebar', action: (ctx) => ctx.actions.openScreen('appearance', 'navigationBar', 'setting-navigationBar')},
					{kind: KIND.SECTION, id: 'layout', label: () => $L('Layout')},
					{kind: KIND.NAV, id: 'homeScreen', label: () => $L('Home Screen'), desc: () => $L('Rows, media bar, looks, and external sources'), icon: 'home', action: (ctx) => ctx.actions.openScreen('appearance', 'homeScreen', 'setting-homeScreen')},
					{kind: KIND.NAV, id: 'libraries', label: () => $L('Libraries'), desc: () => $L('Library visibility, order, and library pages'), icon: 'video_library', action: (ctx) => ctx.actions.openScreen('appearance', 'libraries', 'setting-libraries')},
					{kind: KIND.NAV, id: 'detailsPage', label: () => $L('Details Page'), desc: () => $L('Layout, buttons, sections, ratings, and theme music'), icon: 'article_outlined', action: (ctx) => ctx.actions.openScreen('appearance', 'detailsPage', 'setting-detailsPage')},
					{kind: KIND.SECTION, id: 'theme', label: () => $L('Theme')},
					{
						kind: KIND.NAV,
						id: 'themeSelection',
						icon: 'palette_outlined',
						label: () => $L('App Theme'),
						desc: (ctx) => ctx.availableThemes.find((t) => t.id === ctx.activeThemeId)?.displayName || $L('Default'),
						action: (ctx) => ctx.actions.openThemes()
					},
					{kind: KIND.OPTION, key: 'focusBorderColor', label: () => $L('Focus Border Color'), options: getAccentColorOptions, fallback: () => $L('Theme Default'), icon: 'border_color'},
					{
						kind: KIND.NAV,
						id: 'themeStore',
						icon: 'storefront_outlined',
						label: () => $L('Theme Store'),
						desc: () => $L('Browse and save community themes'),
						action: (ctx) => ctx.actions.openThemeStore()
					},
					{kind: KIND.SECTION, id: 'display', label: () => $L('Display')},
					{kind: KIND.TOGGLE, key: 'cardFocusZoom', label: () => $L('Focus Expansion Animation'), desc: () => $L('Scale focused or hovered cards and tiles'), icon: 'zoom_in'},
					{kind: KIND.OPTION, key: 'uiScale', label: () => $L('UI Scaling'), options: getUiScaleOptions, fallback: () => $L('Default'), icon: 'zoom_out_map'},
					{kind: KIND.OPTION, key: 'oledMode', label: () => $L('OLED Mode'), desc: () => $L('Deepen blacks and enrich artwork. Best on OLED displays.'), options: getOledModeOptions, fallback: () => $L('Off'), icon: 'contrast'},
					{kind: KIND.OPTION, key: 'backdropBlurHome', label: () => $L('Browsing Background Blur'), options: getBlurOptions, fallback: () => $L('Medium'), icon: 'blur_circular'},
					{kind: KIND.OPTION, key: 'watchedIndicatorBehavior', label: () => $L('Watched Indicators'), options: getWatchedIndicatorOptions, fallback: () => $L('Always'), icon: 'check_circle'},
					{kind: KIND.SECTION, id: 'extras', label: () => $L('Extras')},
					{kind: KIND.NAV, id: 'seasonalEffects', label: () => $L('Seasonal Effects'), desc: () => $L('Visual effects and seasonal decorations'), icon: 'auto_awesome', action: (ctx) => ctx.actions.openScreen('appearance', 'seasonalEffects', 'setting-seasonalEffects')},
					{kind: KIND.NAV, id: 'loadingAnimation', label: () => $L('Loading Animation'), desc: () => $L('Customize the loading animations used throughout Moonfin'), icon: 'motion_photos_on_outlined', action: (ctx) => ctx.actions.openScreen('appearance', 'loadingAnimation', 'setting-loadingAnimation')},
					{kind: KIND.NAV, id: 'screensaver', label: () => $L('Screensaver'), desc: () => $L('Enable the built-in screensaver'), icon: 'wallpaper', action: (ctx) => ctx.actions.openScreen('appearance', 'screensaver', 'setting-screensaver')}
				]
			},
			{
				id: 'navigationBar',
				icon: 'view_sidebar',
				menu: false,
				label: () => $L('Navigation Bar'),
				description: () => $L('Navbar style, toolbar buttons, appearance'),
				rows: [
					{kind: KIND.SECTION, id: 'navAppearance', label: () => $L('Appearance')},
					{kind: KIND.OPTION, key: 'navbarPosition', label: () => $L('Navigation Style'), options: getNavPositionOptions, fallback: () => $L('Top Bar'), icon: 'view_sidebar'},
					{kind: KIND.OPTION, key: 'navbarColor', label: () => $L('Navbar Color'), options: getOverlayColorOptions, fallback: () => $L('Gray'), icon: 'palette', swatch: (ctx) => resolveOverlayColor(ctx.settings.navbarColor)},
					{kind: KIND.SLIDER, key: 'navbarOpacity', label: () => $L('Navbar Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity'},
					{kind: KIND.TOGGLE, key: 'navbarAlwaysExpanded', label: () => $L('Always Expand Navbar Labels'), desc: () => $L('Always show text labels in the top navigation bar'), icon: 'unfold_more', when: (ctx) => ctx.settings.navbarPosition !== 'left'},
					{kind: KIND.SECTION, id: 'navButtons', label: () => $L('Buttons')},
					{kind: KIND.TOGGLE, key: 'showShuffleButton', label: () => $L('Show Shuffle Button'), desc: () => $L('Show the shuffle button in the navigation bar'), icon: 'shuffle'},
					{kind: KIND.OPTION, key: 'shuffleContentType', label: () => $L('Shuffle Content Type Filter'), options: getContentTypeOptions, fallback: () => $L('Movies & TV Shows'), icon: 'shuffle', when: (ctx) => ctx.settings.showShuffleButton, valueAsSubtitle: true},
					{kind: KIND.TOGGLE, key: 'showGenresButton', label: () => $L('Show Genres Button'), desc: () => $L('Show the genres button in the navigation bar'), icon: 'theater_comedy'},
					{kind: KIND.TOGGLE, key: 'showFavoritesButton', label: () => $L('Show Favorites Button'), desc: () => $L('Show the favorites button in the navigation bar'), icon: 'favorite'},
					{kind: KIND.TOGGLE, key: 'showLiveTvButton', label: () => $L('Show Live TV Button'), desc: () => $L('Show the Live TV button in the navigation bar when the server has a Live TV library'), icon: 'live_tv'},
					{kind: KIND.TOGGLE, key: 'showLibrariesInToolbar', label: () => $L('Show Libraries in Toolbar'), desc: () => $L('Show the libraries button in the navigation bar'), icon: 'video_library'},
					{kind: KIND.TOGGLE, key: 'showSyncPlayButton', label: () => $L('SyncPlay Button'), desc: () => $L('Show the SyncPlay button on the navigation bar'), icon: 'groups'},
					{kind: KIND.OPTION, key: 'folderViewMode', label: () => $L('Enable Folder View'), desc: () => $L('Show folder browsing option'), options: getFolderViewModeOptions, fallback: () => $L('Per Library'), icon: 'folder'},
					{kind: KIND.TOGGLE, key: 'showSeerrButton', label: (ctx) => $L('Show {seerrLabel} Button').replace('{seerrLabel}', ctx.seerrLabel), desc: () => $L('Show the Seerr button in the navigation bar'), when: whenSeerr, icon: 'seerr'},
					{kind: KIND.TOGGLE, key: 'showServerMessagesButton', label: () => $L('Show Messages Button'), desc: () => $L('Adds a button to the menu for messages sent by your server admin'), icon: 'info_outline_rounded'},
					{kind: KIND.TOGGLE, key: 'showFriendsButton', label: () => $L('Show Friends Button'), desc: () => $L('Friends and chat from the Achievement Badges plugin'), icon: 'people_alt_rounded', when: (ctx) => ctx.achievements.socialAvailable}
				]
			},
			{
				id: 'homeScreen',
				clean: true,
				icon: 'home',
				menu: false,
				label: () => $L('Home Screen'),
				description: () => $L('Rows, media bar, looks, and external sources'),
				rows: [
					{kind: KIND.SECTION, id: 'contents', label: () => $L('Contents')},
					{kind: KIND.NAV, id: 'homeRows', label: () => $L('Rows'), desc: () => $L('Turn rows on or off and change their order'), icon: 'list', action: (ctx) => ctx.actions.openHomeRows()},
					{kind: KIND.NAV, id: 'rowOptions', label: () => $L('Row Options'), desc: () => $L('Sorting and content for each row'), icon: 'tune', action: (ctx) => ctx.actions.openScreen('appearance', 'rowOptions', 'setting-rowOptions')},
					{kind: KIND.NAV, id: 'mediaBar', label: () => $L('Media Bar'), desc: () => $L('Featured content, appearance'), icon: 'featured_play_list', action: (ctx) => ctx.actions.openScreen('appearance', 'mediaBar', 'setting-mediaBar')},
					{kind: KIND.SECTION, id: 'looks', label: () => $L('Looks')},
					{kind: KIND.OPTION, key: 'homeRowsStyle', label: () => $L('Row Type'), desc: () => $L('Classic keeps per-row image type and info overlay. Modern uses portrait-to-backdrop rows.'), options: getHomeRowsStyleOptions, fallback: () => $L('Modern'), icon: 'view_carousel'},
					{kind: KIND.TOGGLE, key: 'modernCardsOnMyMediaRow', label: () => $L('Modern cards on My Media row'), desc: () => $L('Display customizable posters that expand on focus. Disable to always show landscape thumbnail.'), icon: 'photo_library_outlined', when: (ctx) => ctx.settings.homeRowsStyle !== 'v1'},
					{kind: KIND.OPTION, key: 'modernCardTransitionSpeed', label: () => $L('Modern Cards Transition Speed'), desc: () => $L('Adjusts animation speed when expanding focused modern cards'), options: getModernCardTransitionSpeedOptions, fallback: () => $L('Off'), icon: 'auto_awesome_motion_outlined', when: (ctx) => ctx.settings.homeRowsStyle !== 'v1'},
					{kind: KIND.SLIDER, key: 'classicHomeRowsPadding', label: () => $L('Row Padding'), desc: () => $L('Customize padding between home rows'), min: 10, max: 130, step: 20, format: pixels, icon: 'unfold_more', when: (ctx) => ctx.settings.homeRowsStyle === 'v1' && !ctx.settings.fullScreenRows && !ctx.settings.homeRowOverlay},
					{kind: KIND.SLIDER, key: 'modernHomeRowsPadding', label: () => $L('Row Padding'), desc: () => $L('Customize padding between home rows'), min: 360, max: 560, step: 20, format: pixels, icon: 'unfold_more', when: (ctx) => ctx.settings.homeRowsStyle !== 'v1' && !ctx.settings.fullScreenRows},
					{kind: KIND.TOGGLE, key: 'fullScreenRows', label: () => $L('Expanded Rows'), desc: () => $L('Limit home rows to 1 row per screen'), icon: 'image_aspect_ratio'},
					{kind: KIND.OPTION, key: 'homeRowsPosterSize', label: () => $L('Card Size'), options: getPosterSizeOptions, fallback: () => $L('Default'), icon: 'photo_size_select_large'},
					{kind: KIND.OPTION, key: 'homeRowsImageType', label: () => $L('Home Rows Image Type'), desc: () => $L('The artwork rows use unless a row overrides it'), options: getImageTypeOptions, fallback: () => $L('Poster'), icon: 'image'},
					{kind: KIND.NAV, id: 'rowImageTypes', label: () => $L('Image Type per Row'), desc: () => $L('Configure image type for each enabled home row'), icon: 'image_outlined', when: (ctx) => ctx.settings.homeRowsStyle === 'v1', action: (ctx) => ctx.actions.openRowImageTypes()},
					{kind: KIND.TOGGLE, key: 'useSeriesThumbnails', label: () => $L('Display Series Thumbnails'), desc: () => $L('For TV series, use the main series artwork instead of the episode thumbnail.'), icon: 'image_aspect_ratio'},
					{
						kind: KIND.OPTION,
						key: 'mediaPreviewMode',
						label: () => $L('Media Preview'),
						desc: () => $L('Play a short clip or the trailer of the focused card after a moment.'),
						options: getMediaPreviewModeOptions,
						fallback: () => $L('Off'),
						icon: 'play_circle',
						value: (ctx) => mediaPreviewMode(ctx.settings),
						onSelect: (ctx, mode) => ctx.actions.setSettings(mediaPreviewSettings(mode))
					},
					{kind: KIND.TOGGLE, key: 'previewAudioEnabled', label: () => $L('Preview Audio'), desc: () => $L('Play the preview with sound.'), icon: 'volume_up', when: whenMediaPreview},
					{kind: KIND.SLIDER, key: 'previewVolume', label: () => $L('Preview Volume'), desc: () => $L('How loud media previews on cards play'), min: 0, max: 100, step: 5, format: percent, icon: 'volume_down', when: whenMediaPreview},
					{kind: KIND.TOGGLE, key: 'homeRowOverlay', label: () => $L('Home Row Info Overlay'), desc: () => $L('Show title and metadata when browsing home rows'), icon: 'info_outline', when: (ctx) => ctx.settings.homeRowsStyle === 'v1'},
					{
						kind: KIND.OPTION,
						key: 'homeBackdropStyle',
						label: () => $L('Home Screen Backdrop'),
						options: getHomeBackdropStyleOptions,
						fallback: () => $L('Full Screen'),
						icon: 'photo',
						value: (ctx) => homeBackdropStyle(ctx.settings),
						onSelect: (ctx, style) => ctx.actions.setSettings(homeBackdropSettings(style))
					},
					{kind: KIND.TOGGLE, key: 'hideHomeMediaDescription', label: () => $L('Hide Media Description'), desc: () => $L('Hide the movie or episode descriptive text.'), icon: 'description_outlined'},
					{kind: KIND.SECTION, id: 'externalSources', label: () => $L('External Sources'), when: whenPlugin},
					{kind: KIND.NAV, id: 'imdbLists', label: () => $L('IMDb Lists'), desc: () => $L('Configure IMDb Top 250, Popular, and other charts.'), icon: 'movie_outlined', action: (ctx) => ctx.actions.openImdbLists(), when: whenPlugin},
					{kind: KIND.NAV, id: 'externalTmdbLists', label: () => $L('TMDB Lists'), desc: () => $L('Configure Popular, Top Rated, and Trending TMDB lists.'), icon: 'trending_up', action: (ctx) => ctx.actions.openExternalTmdbLists(), when: whenPlugin},
					{kind: KIND.NAV, id: 'seasonalRow', label: () => $L('Seasonal Row'), desc: () => $L('Show a row of holiday movies from your library, with Seerr suggestions when available.'), icon: 'celebration_outlined', keywords: () => ['holiday', 'christmas', 'halloween', 'seasonal'], action: (ctx) => ctx.actions.openSeasonalRow(), when: whenPlugin},
					{kind: KIND.NAV, id: 'externalCalendars', label: () => $L('Upcoming Calendars'), desc: () => $L('Toggle Upcoming Calendars from Radarr/Sonarr.'), icon: 'calendar_month', action: (ctx) => ctx.actions.openExternalCalendars(), when: (ctx) => whenPlugin(ctx) && whenSeerr(ctx)},
					{kind: KIND.NAV, id: 'seerrHomeRows', label: (ctx) => `${ctx.seerrLabel} ${$L('Rows')}`, desc: () => $L('Configure Seerr Discovery Rows.'), icon: 'list', action: (ctx) => ctx.actions.openSeerrHomeRows(), when: (ctx) => whenPlugin(ctx) && whenSeerr(ctx)},
					{
						kind: KIND.NAV,
						id: 'externalCustomRows',
						label: () => $L('Custom Rows'),
						desc: (ctx) => $L('{count} configured').replace('{count}', String((ctx.settings.customHomeRows || []).length)),
						icon: 'tune_outlined',
						action: (ctx) => ctx.actions.openExternalCustomRows(),
						when: whenPlugin
					}
				]
			},
			{
				id: 'rowOptions',
				clean: true,
				icon: 'tune',
				menu: false,
				parent: 'homeScreen',
				label: () => $L('Row Options'),
				description: () => $L('Sorting and content for each row'),
				rows: [
					{kind: KIND.SECTION, id: 'continueWatchingAndNextUp', label: () => $L('CONTINUE WATCHING AND NEXT UP')},
					{kind: KIND.TOGGLE, key: 'mergeContinueWatchingNextUp', label: () => $L('Merge Continue Watching and Next Up'), desc: () => $L('Combine both rows into a single home section'), icon: 'merge_type'},
					{kind: KIND.OPTION, key: 'continueWatchingDefaultAction', label: () => $L('Default Action'), options: getContinueWatchingDefaultActionOptions, fallback: () => $L('Go to Details'), desc: () => $L('What selecting a Continue Watching or Next Up item does'), icon: 'play_circle_outline', padded: true},
					{kind: KIND.OPTION, key: 'nextUpMaxDays', label: () => $L('Max days in Next Up'), options: getNextUpMaxDaysOptions, fallback: () => $L('365 days'), desc: () => $L('How long a show stays in Next Up after you last watched it'), icon: 'event_busy', padded: true},
					{kind: KIND.SECTION, id: 'recentlyAdded', label: () => $L('RECENTLY ADDED')},
					{kind: KIND.TOGGLE, key: 'mergeRecentRowsByType', label: () => $L('Merge Recent Rows by Type'), desc: () => $L('Combine separate libraries of the same type for Recently Added and Recently Released home rows.'), icon: 'library_books'},
					{kind: KIND.OPTION, key: 'recentlyReleasedSeriesType', label: () => $L('Recently Released Series Sort By'), desc: () => $L('Sort Recently Released Series home rows by series, latest season, or latest episode air date'), options: getRecentlyReleasedSeriesTypeOptions, fallback: () => $L('Series'), icon: 'ondemand_video'},
					{kind: KIND.SECTION, id: 'audio', label: () => $L('AUDIO')},
					{kind: KIND.TOGGLE, key: 'displayAudioRows', label: () => $L('Display Audio Rows'), desc: () => $L('Show Audio rows in Home Sections.'), icon: 'music_note'},
					{kind: KIND.OPTION, key: 'audioRowsSortBy', label: () => $L('Audio Rows sorting'), desc: () => $L('Sort Audio rows by date added, release date, alphabetically, and more.'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort', when: (ctx) => ctx.settings.displayAudioRows},
					{kind: KIND.OPTION, key: 'audioRowsSortOrder', label: () => $L('Sort Order'), desc: () => $L('Sort Audio rows in ascending or descending order.'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'swap_vert', when: (ctx) => ctx.settings.displayAudioRows},
					{kind: KIND.SECTION, id: 'collections', label: () => $L('COLLECTIONS')},
					{kind: KIND.TOGGLE, key: 'displayCollectionsRows', label: () => $L('Display Collections Rows'), desc: () => $L('Show Collections rows in Home Sections.'), icon: 'collections'},
					{kind: KIND.OPTION, key: 'collectionsRowSortBy', label: () => $L('Collections Row Sorting'), desc: () => $L('Sort Collections rows by date added, release date, alphabetically, and more.'), options: getPlaylistCollectionSortOptions, fallback: () => $L('Playlist Order'), icon: 'sort', when: (ctx) => ctx.settings.displayCollectionsRows},
					{kind: KIND.OPTION, key: 'collectionsRowSortOrder', label: () => $L('Sort Order'), desc: () => $L('Sort Collections rows in ascending or descending order.'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'swap_vert', when: (ctx) => ctx.settings.displayCollectionsRows},
					{kind: KIND.TOGGLE, key: 'collectionsRowShowEpisodes', label: () => $L('Show Individual Episodes'), desc: () => $L('Expand TV shows to display each episode separately.'), icon: 'video_library_outlined'},
					{kind: KIND.SECTION, id: 'favorites', label: () => $L('FAVORITES')},
					{kind: KIND.TOGGLE, key: 'displayFavoritesRows', label: () => $L('Display Favorites Rows'), desc: () => $L('Show Favorite Movies, Series, and other favorite rows in Home Sections.'), icon: 'favorite'},
					{kind: KIND.OPTION, key: 'favoritesRowSortBy', label: () => $L('Favorites Row Sorting'), desc: () => $L('Sort Favorites rows by date added, release date, alphabetically, and more.'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort', when: (ctx) => ctx.settings.displayFavoritesRows},
					{kind: KIND.OPTION, key: 'favoritesRowSortOrder', label: () => $L('Sort Order'), desc: () => $L('Sort Favorites rows in ascending or descending order.'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'swap_vert', when: (ctx) => ctx.settings.displayFavoritesRows},
					{kind: KIND.SECTION, id: 'genres', label: () => $L('GENRES')},
					{kind: KIND.TOGGLE, key: 'displayGenresRows', label: () => $L('Display Genres Rows'), desc: () => $L('Show Genres rows in Home Sections.'), icon: 'theater_comedy'},
					{kind: KIND.OPTION, key: 'genresRowSortBy', label: () => $L('Genres Row Sorting'), desc: () => $L('Sort Genres rows by date added, release date, alphabetically, and more.'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort', when: (ctx) => ctx.settings.displayGenresRows},
					{kind: KIND.OPTION, key: 'genresRowSortOrder', label: () => $L('Sort Order'), desc: () => $L('Sort Genres rows in ascending or descending order.'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'swap_vert', when: (ctx) => ctx.settings.displayGenresRows},
					{kind: KIND.OPTION, key: 'genresRowItemFilter', label: () => $L('Genres Row Items'), desc: () => $L('Show Movies, Series, or both in Genres rows.'), options: getGenresRowItemFilterOptions, fallback: () => $L('Movies & TV Shows'), icon: 'filter_list', when: (ctx) => ctx.settings.displayGenresRows},
					{kind: KIND.SECTION, id: 'playlists', label: () => $L('PLAYLISTS')},
					{kind: KIND.TOGGLE, key: 'displayPlaylistsRows', label: () => $L('Display Playlist Rows'), desc: () => $L('Show Playlist rows in Home Sections.'), icon: 'playlist_play'},
					{kind: KIND.OPTION, key: 'playlistsRowSortBy', label: () => $L('Playlist Row Sorting'), desc: () => $L('Sort Playlist rows by date added, release date, alphabetically, and more.'), options: getPlaylistCollectionSortOptions, fallback: () => $L('Playlist Order'), icon: 'sort', when: (ctx) => ctx.settings.displayPlaylistsRows},
					{kind: KIND.OPTION, key: 'playlistsRowSortOrder', label: () => $L('Sort Order'), desc: () => $L('Sort Playlist rows in ascending or descending order.'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'swap_vert', when: (ctx) => ctx.settings.displayPlaylistsRows},
					{kind: KIND.TOGGLE, key: 'playlistsRowShowEpisodes', label: () => $L('Show Individual Episodes'), desc: () => $L('Expand TV shows to display each episode separately.'), icon: 'video_library_outlined', when: (ctx) => ctx.settings.displayPlaylistsRows},
					{kind: KIND.SECTION, id: 'rewatch', label: () => $L('REWATCH'), when: whenRewatch},
					{kind: KIND.TOGGLE, key: 'displayRewatchRow', label: () => $L('Display Rewatch Row'), desc: () => $L('Show Rewatch row in Home Sections'), icon: 'replay', when: whenRewatch},
					{kind: KIND.OPTION, key: 'rewatchSortBy', label: () => $L('Sort By'), desc: () => $L('Choose sorting method for completed items'), options: getRewatchSortOptions, fallback: () => $L('Recently Watched'), icon: 'sort', when: whenRewatchEnabled},
					{kind: KIND.TOGGLE, key: 'rewatchIncludeMovies', label: () => $L('Include Movies'), desc: () => $L('Show watched movies in the rewatch row'), icon: 'movie', when: whenRewatchEnabled},
					{kind: KIND.TOGGLE, key: 'rewatchIncludeShows', label: () => $L('Include Shows'), desc: () => $L('Show watched TV shows in the rewatch row'), icon: 'tv', when: whenRewatchEnabled},
					{kind: KIND.TOGGLE, key: 'rewatchIncludeCollections', label: () => $L('Include Collections'), desc: () => $L('Show watched collections in the rewatch row'), icon: 'collections', when: whenRewatchEnabled},
					{kind: KIND.SECTION, id: 'sinceYouWatched', label: () => $L('SINCE YOU WATCHED'), when: whenSinceYouWatched},
					{kind: KIND.OPTION, key: 'sinceYouWatchedSource', label: () => $L('Recommendation Source'), desc: () => $L('Moonfin scores your own library, Jellyfin takes the picks from the server, TMDb uses Seerr, and Hybrid leads with the server then tops up locally'), options: getSinceYouWatchedSourceOptions, fallback: () => $L('Moonfin Recommends'), icon: 'source', when: whenSinceYouWatched},
					{kind: KIND.OPTION, key: 'sinceYouWatchedSourceType', label: () => $L('Source Type'), desc: () => $L('Choose type of items to recommend'), options: getSinceYouWatchedSourceTypeOptions, fallback: () => $L('Movies'), icon: 'merge_type', when: whenSinceYouWatched},
					{kind: KIND.OPTION, key: 'sinceYouWatchedSourceItem', label: () => $L('Source Item'), desc: () => $L('Choose which source item to base recommendations on'), options: getSinceYouWatchedSourceItemOptions, fallback: () => $L('Recently Watched'), icon: 'play_circle_filled', when: whenSinceYouWatched},
					{kind: KIND.TOGGLE, key: 'sinceYouWatchedIncludeWatched', label: () => $L('Include Previously Watched'), desc: () => $L('Include watched items in recommendations'), icon: 'history', when: (ctx) => whenSinceYouWatched(ctx) && ctx.settings.sinceYouWatchedSource !== 'online'},
					{kind: KIND.SECTION, id: 'studios', label: () => $L('STUDIOS')},
					{kind: KIND.TOGGLE, key: 'displayStudiosRows', label: () => $L('Display Studio Row'), desc: () => $L('Show Studio row in Home Sections.'), icon: 'business'},
					{kind: KIND.OPTION, key: 'studiosRowSortBy', label: () => $L('Studio Row Sorting'), desc: () => $L('Studio row by name, recently added, and more.'), options: getHomeRowSortOptions, fallback: () => $L('Name'), icon: 'sort_by_alpha', when: (ctx) => ctx.settings.displayStudiosRows},
					{kind: KIND.OPTION, key: 'studiosRowSortOrder', label: () => $L('Sort Order'), desc: () => $L('Choose Ascending or Descending sort order.'), options: getSortOrderOptions, fallback: () => $L('Auto'), icon: 'swap_vert', when: (ctx) => ctx.settings.displayStudiosRows},
					{kind: KIND.SECTION, id: 'imdbRows', label: () => $L('IMDb Lists'), when: whenPlugin},
					{kind: KIND.OPTION, key: 'imdbRowsSortBy', label: () => $L('IMDb Row Sorting'), desc: () => $L('Sort IMDb rows by name, release date, rating, and more.'), options: getExternalRowSortByOptions, fallback: () => $L('Default'), icon: 'sort', when: whenPlugin},
					{kind: KIND.OPTION, key: 'imdbRowsSortOrder', label: () => $L('Sort Order'), desc: () => $L('Sort IMDb rows in ascending or descending order.'), options: getExternalRowSortOrderOptions, fallback: () => $L('Ascending'), icon: 'swap_vert', when: (ctx) => whenPlugin(ctx) && ctx.settings.imdbRowsSortBy !== 'none' && ctx.settings.imdbRowsSortBy !== 'shuffle'},
					{kind: KIND.SECTION, id: 'tmdbRows', label: () => $L('TMDB Lists'), when: whenPlugin},
					{kind: KIND.OPTION, key: 'tmdbRowsSortBy', label: () => $L('TMDB Row Sorting'), desc: () => $L('Sort TMDB rows by name, release date, rating, and more.'), options: getExternalRowSortByOptions, fallback: () => $L('Default'), icon: 'sort', when: whenPlugin},
					{kind: KIND.OPTION, key: 'tmdbRowsSortOrder', label: () => $L('Sort Order'), desc: () => $L('Sort TMDB rows in ascending or descending order.'), options: getExternalRowSortOrderOptions, fallback: () => $L('Ascending'), icon: 'swap_vert', when: (ctx) => whenPlugin(ctx) && ctx.settings.tmdbRowsSortBy !== 'none' && ctx.settings.tmdbRowsSortBy !== 'shuffle'},
					{kind: KIND.SECTION, id: 'seerrRows', label: (ctx) => `${ctx.seerrLabel} ${$L('Rows')}`, when: (ctx) => whenPlugin(ctx) && whenSeerr(ctx)},
					{kind: KIND.OPTION, key: 'seerrRowsSortBy', label: (ctx) => `${ctx.seerrLabel} ${$L('Row Sorting')}`, desc: () => $L('Sort Seerr rows by name, release date, rating, and more.'), options: getExternalRowSortByOptions, fallback: () => $L('Default'), icon: 'sort', when: (ctx) => whenPlugin(ctx) && whenSeerr(ctx)},
					{kind: KIND.OPTION, key: 'seerrRowsSortOrder', label: () => $L('Sort Order'), desc: () => $L('Sort Seerr rows in ascending or descending order.'), options: getExternalRowSortOrderOptions, fallback: () => $L('Ascending'), icon: 'swap_vert', when: (ctx) => whenPlugin(ctx) && whenSeerr(ctx) && ctx.settings.seerrRowsSortBy !== 'none' && ctx.settings.seerrRowsSortBy !== 'shuffle'}
				]
			},
			{
				id: 'mediaBar',
				clean: true,
				icon: 'featured_play_list',
				menu: false,
				parent: 'homeScreen',
				label: () => $L('Media Bar'),
				description: () => $L('Featured content, appearance'),
				rows: [
					{kind: KIND.SECTION, id: 'mediaBarGeneral', label: () => $L('General')},
					{kind: KIND.OPTION, key: 'featuredBarStyle', label: () => $L('Media Bar Style'), desc: () => $L('Choose between various media bar styles, or turn the media bar off'), options: getFeaturedBarStyleOptions, fallback: () => $L('Moonfin'), icon: 'featured_play_list', padded: true},
					{kind: KIND.TOGGLE, key: 'mediaBarRowPeek', label: () => $L('Peek Home Rows'), desc: () => $L('Show the top half of the first row along the bottom of the media bar'), icon: 'vertical_align_bottom', when: (ctx) => ctx.settings.featuredBarStyle !== 'banner' && ctx.settings.featuredBarStyle !== 'off'},
					{kind: KIND.OPTION, key: 'featuredContentType', label: () => $L('Content Type'), options: getContentTypeOptions, fallback: () => $L('Movies & TV Shows'), icon: 'category', padded: true},
					{kind: KIND.OPTION, key: 'featuredItemCount', label: () => $L('Item Count'), options: getFeaturedItemCountOptions, fallback: () => $L('10 items'), icon: 'format_list_numbered', padded: true},
					{kind: KIND.OPTION, key: 'mediaBarOverlayColor', label: () => $L('Overlay Color'), options: getOverlayColorOptions, fallback: () => $L('Gray'), icon: 'palette'},
					{kind: KIND.SLIDER, key: 'mediaBarOverlayOpacity', label: () => $L('Overlay Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity'},
					{kind: KIND.SECTION, id: 'mediaSources', label: () => $L('Media Sources')},
					{
						kind: KIND.NAV,
						id: 'sourceLibraries',
						label: () => $L('Source Libraries'),
						desc: (ctx) => (Array.isArray(ctx.settings.mediaBarLibraryIds) && ctx.settings.mediaBarLibraryIds.length > 0
							? countLabel(ctx.settings.mediaBarLibraryIds.length)
							: $L('All Libraries')),
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
						icon: 'collections_bookmark',
						action: (ctx) => ctx.actions.openMediaBarCollections()
					},
					{
						kind: KIND.NAV,
						id: 'sourceExternalLists',
						label: () => $L('External Lists'),
						desc: (ctx) => (Array.isArray(ctx.settings.mediaBarExternalLists) && ctx.settings.mediaBarExternalLists.length > 0
							? countLabel(ctx.settings.mediaBarExternalLists.length)
							: $L('None selected')),
						icon: 'public',
						action: (ctx) => ctx.actions.openMediaBarExternalLists(),
						when: whenPlugin
					},
					{
						kind: KIND.NAV,
						id: 'excludedGenres',
						label: () => $L('Excluded Genres'),
						desc: (ctx) => (Array.isArray(ctx.settings.excludedGenres) && ctx.settings.excludedGenres.length > 0
							? ctx.settings.excludedGenres.join(', ')
							: $L('None')),
						icon: 'label_off',
						action: (ctx) => ctx.actions.openExcludedGenres()
					},
					{kind: KIND.SECTION, id: 'mediaBarBehavior', label: () => $L('Behavior')},
					{kind: KIND.TOGGLE, key: 'autoAdvance', label: () => $L('Auto Advance'), desc: () => $L('Automatically advance to next slide'), icon: 'skip_next'},
					{kind: KIND.SLIDER, key: 'autoAdvanceInterval', label: () => $L('Auto Advance Interval'), min: 2, max: 20, step: 1, format: seconds, icon: 'timer', when: (ctx) => ctx.settings.autoAdvance},
					{kind: KIND.SECTION, id: 'trailers', label: () => $L('Trailers')},
					{kind: KIND.TOGGLE, key: 'featuredTrailerPreview', label: () => $L('Trailer Preview'), desc: () => $L('Auto-play trailers in the media bar after 3 seconds'), icon: 'movie_outlined'},
					{kind: KIND.TOGGLE, key: 'featuredTrailerMuted', label: () => $L('Mute Trailer Audio'), desc: () => $L('Mute trailer previews in the featured media bar'), icon: 'volume_up', when: (ctx) => ctx.settings.featuredTrailerPreview},
					{kind: KIND.SLIDER, key: 'trailerVolume', label: () => $L('Trailer Volume'), desc: () => $L('How loud trailers play in the featured media bar and details screen'), min: 0, max: 100, step: 5, format: percent, icon: 'volume_down', when: (ctx) => ctx.settings.featuredTrailerPreview},
					{kind: KIND.TOGGLE, key: 'mediaBarTrailerCaptions', label: () => $L('Trailer Captions'), desc: () => $L('Show captions on YouTube trailers'), icon: 'closed_caption_outlined'}
				]
			},
			{
				id: 'libraries',
				icon: 'video_library',
				menu: false,
				label: () => $L('Libraries'),
				description: () => $L('Library visibility, order, and library pages'),
				rows: [
					{kind: KIND.SECTION, id: 'librariesGeneral', label: () => $L('General')},
					{kind: KIND.NAV, id: 'hideLibraries', label: () => $L('Library Visibility'), desc: () => $L('Toggle home page visibility per library'), icon: 'visibility', action: (ctx) => ctx.actions.openLibraries()},
					{kind: KIND.NAV, id: 'libraryOrder', label: () => $L('Library Order'), desc: () => $L('Choose the order of your libraries'), icon: 'swap_vert', keywords: () => ['reorder libraries', 'sort libraries', 'my media', 'navbar'], action: (ctx) => ctx.actions.openLibraryOrder()},
					{kind: KIND.TOGGLE, key: 'unifiedLibraryMode', label: () => $L('Multi-Server Libraries'), desc: () => $L('Show libraries from all connected servers'), icon: 'dns'},
					{kind: KIND.SECTION, id: 'libraryView', label: () => $L('Library View')},
					{kind: KIND.OPTION, key: 'libraryStyle', label: () => $L('Video Library Style'), desc: () => $L('Classic is the original header with a row of icons. Modern puts search, sort, group and filters in one labeled bar. Docked moves them into a panel down the left side.'), options: getLibraryStyleOptions, fallback: () => $L('Classic'), icon: 'view_sidebar'},
					{kind: KIND.OPTION, key: 'bookLibraryStyle', label: () => $L('Book Library Style'), desc: () => $L("Classic is the original shelves under a featured title. Reading Room leads with what you're reading on large cards. Bookstore browses the whole library in a grid."), options: getBookLibraryStyleOptions, fallback: () => $L('Bookstore'), icon: 'auto_stories_outlined'},
					{kind: KIND.OPTION, key: 'musicLibraryStyle', label: () => $L('Music Library Style'), desc: () => $L("Classic is the original rows under a Jump Back In card. Quick Access starts with a grid of your recent albums and playlists. Immersive leads with the album you're listening to."), options: getMusicLibraryStyleOptions, fallback: () => $L('Immersive'), icon: 'queue_music'},
					{kind: KIND.TOGGLE, key: 'groupItemsIntoCollections', label: () => $L('Group Items into Collections'), desc: () => $L('Hide Collection associated library items when browsing libraries'), icon: 'collections_bookmark'},
					{kind: KIND.TOGGLE, key: 'showMediaDetailsOnLibraryPage', label: () => $L('Show Media Details'), desc: () => $L('Show details of the selected item at the top of Library pages.'), icon: 'info_outline'},
					{kind: KIND.TOGGLE, key: 'hideBackdropsInLibraries', label: () => $L('Library Backdrops'), icon: 'photo', isOn: (ctx) => !ctx.settings.hideBackdropsInLibraries},
					{kind: KIND.TOGGLE, key: 'useDetailedSubHeadings', label: () => $L('Use Detailed Sub-Headings'), desc: () => $L('Show detailed or minimal subrow on Library pages.'), icon: 'subtitles'}
				]
			},
			{
				id: 'detailsPage',
				icon: 'article',
				menu: false,
				label: () => $L('Details Page'),
				description: () => $L('Layout, buttons, sections, ratings, and theme music'),
				rows: [
					{kind: KIND.SECTION, id: 'detailsDisplay', label: () => $L('Display')},
					{kind: KIND.OPTION, key: 'detailScreenStyle', label: () => $L('Details Screen Style'), desc: () => $L('Classic is the original centered moonfin layout. Modern is a responsive cinematic layout. Spotlight is a hero-first layout with pop-up content cards. Nouveau is a full-screen layout with sections stacked down the page. Minimalist is artwork, one play button and the episodes.'), options: getDetailScreenStyleOptions, fallback: () => $L('Modern'), icon: 'movie_outlined'},
					{kind: KIND.OPTION, key: 'personalRatingStyle', label: () => $L('Personal Rating Style'), options: getPersonalRatingStyleOptions, fallback: () => $L('Like / dislike'), icon: 'rate_review'},
					{kind: KIND.TOGGLE, key: 'detailsBackdropEnabled', label: () => $L('Details Screen Backdrop'), icon: 'photo'},
					{
						kind: KIND.OPTION,
						key: 'backdropBlurDetail',
						icon: 'opacity',
						label: (ctx) => (ctx.settings.detailScreenStyle === 'v1'
							? $L('Background Blur')
							: $L('Background Opacity')),
						options: (ctx) => (ctx.settings.detailScreenStyle === 'v1'
							? getBlurOptions()
							: getDetailsOpacityOptions()),
						fallback: (ctx) => (ctx.settings.detailScreenStyle === 'v1' ? $L('Medium') : '80%')
					},
					{kind: KIND.NAV, id: 'detailButtons', label: () => $L('Action Buttons'), desc: () => $L('Choose which buttons the details screen shows'), icon: 'smart_button_outlined', action: (ctx) => ctx.actions.openDetailButtons()},
					{
						kind: KIND.OPTION,
						key: 'detailButtonsMaxVisible',
						padded: true,
						label: () => $L('Action Buttons on Screen'),
						desc: () => $L('Customize how many action buttons appear before folding into the More Actions menu.'),
						options: getDetailButtonsMaxVisibleOptions,
						fallback: () => $L('Auto (Theme Default)'),
						icon: 'more_horiz'
					},
					{kind: KIND.SECTION, id: 'mediaDetailsAndSpoilers', label: () => $L('Media Details and Spoilers')},
					{kind: KIND.NAV, id: 'detailMetadata', label: () => $L('Metadata Row'), desc: () => $L('Choose and reorder what metadata the details screen shows'), icon: 'view_headline_outlined', action: (ctx) => ctx.actions.openDetailMetadata()},
					{kind: KIND.NAV, id: 'detailSections', label: () => $L('Sections'), desc: () => $L('Choose which parts of the Details screen to show'), icon: 'dashboard_customize_outlined', keywords: () => ['sections', 'hide', 'logo', 'tagline', 'cast', 'crew', 'studios', 'chapters', 'extras', 'collections', 'similar', 'more like this', 'episodes', 'media info', 'seerr', 'recommendations', 'biography'], action: (ctx) => ctx.actions.openDetailSections()},
					{kind: KIND.TOGGLE, key: 'detailExpandedTabs', label: () => $L('Expanded Tabs'), desc: () => $L('Automatically show tab content while browsing tabs. Turn off to open and close each tab manually.'), icon: 'tab', when: (ctx) => ctx.settings.detailScreenStyle === 'v2'},
					{kind: KIND.TOGGLE, key: 'detailShowTechnicalDetails', label: () => $L('Show Technical Details'), desc: () => $L('Show codec, resolution, and stream information in banner summary'), icon: 'info_outline'},
					{kind: KIND.TOGGLE, key: 'hideDetailsMediaDescription', label: () => $L('Hide Media Description'), desc: () => $L('Hide the movie or episode descriptive text.'), icon: 'description_outlined'},
					{kind: KIND.TOGGLE, key: 'detailUseSeriesThumbnails', label: () => $L('Use Series Thumbnails'), desc: () => $L('Replace thumbnails on the details page with the series thumbnail'), icon: 'image_outlined', when: (ctx) => ['v1', 'v4', 'v5'].indexOf(ctx.settings.detailScreenStyle) >= 0},
					{kind: KIND.SECTION, id: 'recommendations', label: () => $L('Recommendations')},
					{kind: KIND.OPTION, key: 'recommendationSystemSource', label: () => $L('Recommendation System'), desc: () => $L('Moonfin scores your own library, Jellyfin takes the picks from the server, TMDb uses Seerr, and Hybrid leads with the server then tops up locally'), options: getRecommendationSystemSourceOptions, fallback: () => $L('Moonfin Recommends'), icon: 'auto_awesome'},
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
					{kind: KIND.TOGGLE, key: 'showRatingBadges', label: () => $L('Rating Badges'), desc: () => $L('Show decorative badges behind ratings'), icon: 'style'},
					{
						kind: KIND.NAV,
						id: 'resetRatings',
						label: () => $L('Reset Ratings'),
						desc: (ctx) => (ctx.ratingsResetArmed
							? $L('Press again to put every ratings setting back to its default')
							: $L('Restores the sources, their order, and the ratings toggles')),
						icon: 'restore',
						action: (ctx) => ctx.actions.resetRatingsSettings()
					},
					{kind: KIND.SECTION, id: 'themeMusic', label: () => $L('Theme Music')},
					{kind: KIND.TOGGLE, key: 'themeMusicEnabled', label: () => $L('Theme Music'), desc: () => $L('Play theme music on detail pages'), icon: 'music_note'},
					{kind: KIND.SLIDER, key: 'themeMusicVolume', label: () => $L('Theme Music Volume'), min: 0, max: 100, step: 5, format: percent, icon: 'volume_down'},
					{kind: KIND.TOGGLE, key: 'themeMusicOnHomeRows', label: () => $L('Theme Music on Home Rows'), desc: () => $L('Play when browsing home screen'), icon: 'queue_music'},
					{kind: KIND.TOGGLE, key: 'themeMusicLoop', label: () => $L('Loop Theme Music'), desc: () => $L('Repeat the track instead of playing it once'), icon: 'repeat'}
				]
			},
			{
				id: 'seasonalEffects',
				icon: 'auto_awesome',
				menu: false,
				label: () => $L('Seasonal Effects'),
				description: () => $L('Visual effects and seasonal decorations'),
				rows: [
					{kind: KIND.SECTION, id: 'seasonalEffects', label: () => $L('Seasonal Effects')},
					{kind: KIND.OPTION, key: 'seasonalTheme', label: () => $L('Seasonal Surprise'), options: getSeasonalThemeOptions, fallback: () => $L('None'), icon: 'auto_awesome', padded: true},
					{kind: KIND.OPTION, key: 'seasonalDensity', label: () => $L('Density'), options: getSeasonalDensityOptions, fallback: () => $L('Normal'), icon: 'grain', padded: true}
				]
			},
			{
				id: 'loadingAnimation',
				icon: 'motion_photos_on',
				menu: false,
				label: () => $L('Loading Animation'),
				description: () => $L('Customize the loading animations used throughout Moonfin'),
				keywords: () => ['spinner', 'runner', 'moon', 'logo', 'loading'],
				rows: [
					{kind: KIND.SECTION, id: 'loadingAnimationConfiguration', label: () => $L('Loading Animation Configuration')},
					{kind: KIND.OPTION, key: 'loadingAnimationImage', label: () => $L('Image'), options: getLoadingAnimationImageOptions, fallback: () => $L('Moonfin Logo'), icon: 'movie_filter_outlined'},
					{kind: KIND.CUSTOM, id: 'loadingAnimationPreview', render: 'loadingAnimationPreview', when: whenLoadingAnimation},
					{kind: KIND.OPTION, key: 'loadingAnimationSize', label: () => $L('Animation Size'), options: getScreensaverSizeOptions, fallback: () => $L('Medium'), icon: 'photo_size_select_actual_outlined', when: whenLoadingAnimation},
					{kind: KIND.OPTION, key: 'loadingAnimationPosition', label: () => $L('Animation Position'), options: getLoadingAnimationPositionOptions, fallback: () => $L('Middle'), icon: 'grid_view_rounded', when: whenLoadingAnimation},
					{kind: KIND.OPTION, key: 'loadingAnimationSpeed', label: () => $L('Animation Speed'), options: getLoadingAnimationSpeedOptions, fallback: () => $L('Fast'), icon: 'speed_rounded', when: whenLoadingAnimation},
					{kind: KIND.TOGGLE, key: 'showLoadingAnimationText', label: () => $L('Show Text'), icon: 'text_fields', when: whenLoadingAnimation}
				]
			},
			{
				id: 'screensaver',
				clean: true,
				icon: 'wallpaper',
				menu: false,
				label: () => $L('Screensaver'),
				description: () => $L('Enable the built-in screensaver'),
				rows: [
					{kind: KIND.SECTION, id: 'screensaverGeneral', label: () => $L('General Settings')},
					{kind: KIND.TOGGLE, key: 'screensaverEnabled', label: () => $L('In-App Screensaver'), desc: () => $L('Enable the built-in screensaver'), icon: 'wallpaper'},
					{kind: KIND.OPTION, key: 'screensaverTimeout', label: () => $L('Timeout'), options: getScreensaverTimeoutOptions, fallback: () => $L('90 seconds'), icon: 'timer', when: whenScreensaver},
					{kind: KIND.OPTION, key: 'screensaverDimmingLevel', label: () => $L('Dimming Level'), options: getScreensaverDimmingOptions, fallback: '50%', icon: 'brightness_6', when: whenScreensaver},
					{kind: KIND.SECTION, id: 'screensaverVisual', label: () => $L('Visual Components'), when: whenScreensaver},
					{kind: KIND.CUSTOM, id: 'screensaverPreview', render: 'screensaverPreview', when: whenScreensaver},
					{kind: KIND.OPTION, key: 'screensaverBackdrop', label: () => $L('Backdrop'), options: getScreensaverBackdropOptions, fallback: () => $L('Library Art'), icon: 'auto_awesome', when: whenScreensaver},
					{kind: KIND.OPTION, key: 'screensaverComponent', label: () => $L('Additional Component'), options: getScreensaverComponentOptions, fallback: () => $L('Moonfin Logo'), icon: 'widgets_outlined', when: whenScreensaver},
					{kind: KIND.OPTION, key: 'screensaverMovement', label: () => $L('Component Movement'), options: getScreensaverMovementOptions, fallback: () => $L('Moderate'), icon: 'speed_rounded', when: whenScreensaverComponent},
					{kind: KIND.OPTION, key: 'screensaverSize', label: () => $L('Component Size'), options: getScreensaverSizeOptions, fallback: () => $L('Medium'), icon: 'photo_size_select_actual_outlined', when: whenScreensaverComponent},
					{kind: KIND.OPTION, key: 'screensaverPosition', label: () => $L('Component Position'), options: getScreensaverPositionOptions, fallback: () => $L('Middle'), icon: 'grid_view_rounded', when: whenScreensaverStatic},
					{kind: KIND.SECTION, id: 'screensaverLibraryContent', label: () => $L('Library Content'), when: whenScreensaverLibrary},
					{kind: KIND.OPTION, key: 'screensaverContentType', label: () => $L('Content Type'), options: getContentTypeOptions, fallback: () => $L('Movies & TV Shows'), icon: 'category', when: whenScreensaverLibrary, padded: true},
					{
						kind: KIND.NAV,
						id: 'screensaverLibraries',
						label: () => $L('Source Libraries'),
						desc: (ctx) => (Array.isArray(ctx.settings.screensaverLibraryIds) && ctx.settings.screensaverLibraryIds.length > 0
							? countLabel(ctx.settings.screensaverLibraryIds.length)
							: $L('All (Default)')),
						icon: 'folder',
						when: whenScreensaverLibrary,
						action: (ctx) => ctx.actions.openScreensaverLibraries()
					},
					{
						kind: KIND.NAV,
						id: 'screensaverCollections',
						label: () => $L('Source Collections'),
						desc: (ctx) => (Array.isArray(ctx.settings.screensaverCollectionIds) && ctx.settings.screensaverCollectionIds.length > 0
							? countLabel(ctx.settings.screensaverCollectionIds.length)
							: $L('None selected')),
						icon: 'collections_bookmark',
						when: whenScreensaverLibrary,
						action: (ctx) => ctx.actions.openScreensaverCollections()
					},
					{
						kind: KIND.NAV,
						id: 'screensaverGenres',
						label: () => $L('Excluded Genres'),
						desc: (ctx) => (Array.isArray(ctx.settings.screensaverExcludedGenres) && ctx.settings.screensaverExcludedGenres.length > 0
							? ctx.settings.screensaverExcludedGenres.join(', ')
							: $L('None excluded')),
						icon: 'label_off',
						when: whenScreensaverLibrary,
						action: (ctx) => ctx.actions.openScreensaverGenres()
					},
					{kind: KIND.OPTION, key: 'screensaverMaxRating', label: () => $L('Max Age Rating'), options: getAgeRatingOptions, fallback: 'PG-13', icon: 'shield', when: whenScreensaverLibrary, padded: true},
					{kind: KIND.TOGGLE, key: 'screensaverAgeFilter', label: () => $L('Require Age Rating'), desc: () => $L('Only show rated content'), icon: 'verified_user', when: whenScreensaverLibrary}
				]
			}
		]
	},
	{
		id: 'playback',
		clean: true,
		alwaysMenu: true,
		when: (ctx) => !ctx.settings.kidsModeEnabled,
		label: () => $L('Playback'),
		description: () => $L('Player, quality, audio, subtitles, skipping, and SyncPlay'),
		icon: 'play_circle',
		subcategories: [
			{
				id: 'player',
				icon: 'play_circle',
				section: () => $L('Video'),
				label: () => $L('Player'),
				description: () => $L('Controls, seeking, player buttons, and trick play'),
				rows: [
					{kind: KIND.SECTION, id: 'mediaPlayerBehavior', label: () => $L('Media Player Behavior')},
					{kind: KIND.TOGGLE, key: 'showDescriptionOnPause', label: () => $L('Show Description on Pause'), desc: () => $L('Dim video and show overview text while paused'), icon: 'pause_circle_outline'},
					{kind: KIND.OPTION, key: 'playerZoomMode', label: () => $L('Player Zoom Mode'), desc: () => $L("How video is scaled to the screen. Zoom to Fill enlarges the picture until it fills the screen and cuts off the edges. It doesn't detect black bars."), options: getZoomModeOptions, fallback: () => $L('Fit'), icon: 'zoom_out_map'},
					{kind: KIND.NAV, id: 'progressBarTime', label: () => $L('Progress Bar Time'), desc: () => $L('Choose which time labels appear around the playback progress bar.'), icon: 'timer_outlined', action: (ctx) => ctx.actions.openScreen('playback', 'playbackTime', 'setting-progressBarTime')},
					{kind: KIND.OPTION, key: 'resumeSubtractDuration', label: () => $L('Resume Rewind'), desc: () => $L('When resuming playback (from Continue Watching or a media item page), how many seconds should be rewound?'), options: getResumeRewindOptions, fallback: () => $L('Disabled'), icon: 'replay', padded: true},
					{kind: KIND.SLIDER, key: 'unpauseRewind', label: () => $L('Unpause Rewind'), desc: () => $L('When resuming playback after pressing the pause button, how many seconds should be rewound?'), min: 0, max: 30, step: 5, format: (v) => (v === 0 ? $L('Off') : `${v}s`), icon: 'replay_circle_filled'},
					{kind: KIND.OPTION, key: 'skipBackLength', label: () => $L('Skip Back Length'), desc: () => $L('How many seconds to jump back after pressing the rewind button.'), options: getSkipLengthOptions, fallback: () => $L('10 seconds'), icon: 'fast_rewind', padded: true},
					{kind: KIND.OPTION, key: 'skipForwardLength', label: () => $L('Skip Forward Length'), desc: () => $L('How many seconds to jump forward after pressing the fast forward button.'), options: getSkipLengthOptions, fallback: () => $L('30 seconds'), icon: 'fast_forward', padded: true},
					{kind: KIND.OPTION, key: 'seekStep', label: () => $L('Seek Step'), desc: () => $L('How far each press moves while scrubbing the progress bar'), options: getSeekStepOptions, fallback: () => $L('10 seconds'), icon: 'linear_scale'},
					{kind: KIND.TOGGLE, key: 'showChapterMarkers', label: () => $L('Chapter Marks'), desc: () => $L('Mark where each chapter starts on the seek bar'), icon: 'straighten'},
					{kind: KIND.NAV, id: 'osdButtons', label: () => $L('Player Buttons'), desc: () => $L('Choose which buttons the player shows'), icon: 'tune', action: (ctx) => ctx.actions.openOsdButtons()},
					{kind: KIND.SECTION, id: 'trickPlay', label: () => $L('Trick Play')},
					{kind: KIND.OPTION, key: 'trickPlayMode', label: () => $L('Trick Play'), desc: () => $L('Show preview thumbnails when seeking'), options: getTrickplayModeOptions, fallback: () => $L('Single Thumbnail'), icon: 'image_search'},
					{kind: KIND.CUSTOM, id: 'trickplayPreview', render: 'trickplayPreview', when: whenTrickplay},
					{kind: KIND.SLIDER, key: 'trickPlayPreviewScale', label: () => $L('Preview Size'), min: 10, max: 100, step: 5, format: percent, icon: 'photo_size_select_large_outlined', when: whenTrickplay},
					{kind: KIND.SLIDER, key: 'trickPlayVerticalPosition', label: () => $L('Distance From Seekbar'), min: 0, max: 100, step: 5, format: percent, icon: 'height', when: whenTrickplay},
					{kind: KIND.TOGGLE, key: 'trickPlayFollowScrub', label: () => $L('Follow Scrub Position'), desc: () => $L('Preview slides along the seekbar as you scrub, instead of staying centered'), icon: 'swipe', when: whenTrickplay},
					{kind: KIND.TOGGLE, key: 'trickPlayPauseWhileScrubbing', label: () => $L('Pause While Scrubbing'), desc: () => $L('Playback pauses while you seek and resumes when you press play. Turn this off to keep playing and jump straight to the new spot'), icon: 'pause_circle_outline', when: whenTrickplay},
				]
			},
			{
				id: 'playbackTime',
				icon: 'timer',
				menu: false,
				parent: 'player',
				label: () => $L('Progress Bar Time'),
				description: () => $L('Choose which time labels appear around the playback progress bar.'),
				keywords: () => [$L('Ends at'), $L('Time remaining'), $L('Time elapsed'), $L('Total duration'), $L('Current Time'), $L('Clock')],
				rows: [
					{kind: KIND.SECTION, id: 'playbackTimeVideo', label: () => $L('Video Player')},
					{kind: KIND.CUSTOM, id: 'playbackTimePreview', render: 'playbackTimePreview'},
					{kind: KIND.OPTION, key: 'playbackTimeAboveLeft', label: () => $L('Above bar, left'), desc: () => $L('Choose what is shown here, or hide it.'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Hidden'), icon: 'align_horizontal_left'},
					{kind: KIND.OPTION, key: 'playbackTimeAboveCenter', label: () => $L('Above bar, center'), desc: () => $L('Choose what is shown here, or hide it.'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Hidden'), icon: 'align_horizontal_center'},
					{kind: KIND.OPTION, key: 'playbackTimeAboveRight', label: () => $L('Above bar, right'), desc: () => $L('Choose what is shown here, or hide it.'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Ends at'), icon: 'align_horizontal_right'},
					{kind: KIND.OPTION, key: 'playbackTimeBelowLeft', label: () => $L('Below bar, left'), desc: () => $L('Choose what is shown here, or hide it.'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Time elapsed'), icon: 'align_horizontal_left'},
					{kind: KIND.OPTION, key: 'playbackTimeBelowCenter', label: () => $L('Below bar, center'), desc: () => $L('Choose what is shown here, or hide it.'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Hidden'), icon: 'align_horizontal_center'},
					{kind: KIND.OPTION, key: 'playbackTimeBelowRight', label: () => $L('Below bar, right'), desc: () => $L('Choose what is shown here, or hide it.'), options: getPlaybackTimeSlotOptions, fallback: () => $L('Total duration'), icon: 'align_horizontal_right'},
					{kind: KIND.SECTION, id: 'playbackTimeMusic', label: () => $L('Music Player')},
					{kind: KIND.OPTION, key: 'musicPlaybackTimeDisplay', label: () => $L('Progress Bar Time'), options: getPlaybackTimeDisplayOptions, fallback: () => $L('Total duration'), desc: () => $L('Choose what is shown on the right side of the music progress bar.'), icon: 'music_note'}
				]
			},
			{
				id: 'qualityDecoding',
				icon: 'high_quality_outlined',
				section: () => $L('Video'),
				label: () => $L('Quality & Decoding'),
				description: () => $L('Bitrate, resolution, transcoding, and codec support'),
				rows: [
					{kind: KIND.SECTION, id: 'streaming', label: () => $L('Streaming')},
					{kind: KIND.OPTION, key: 'maxBitrate', label: () => $L('Max Streaming Bitrate'), desc: () => $L('Cap the streaming bitrate. Content above this threshold will be transcoded to fit.'), options: getBitrateOptions, fallback: () => $L('Auto (Recommended)'), icon: 'network_check', padded: true},
					{kind: KIND.OPTION, key: 'maxVideoResolution', label: () => $L('Max Resolution'), desc: () => $L('Limit the maximum resolution the player will request. Higher-resolution content will be transcoded down.'), options: getMaxResolutionOptions, fallback: () => $L('Auto'), icon: 'high_quality'},
					{kind: KIND.TOGGLE, key: 'liveTvSkipGuide', label: () => $L('Skip TV Guide'), desc: () => $L('Open the first available live channel directly from library selection'), icon: 'live_tv'},
					{kind: KIND.SECTION, id: 'decodingRendering', label: () => $L('Decoding & Rendering')},
					{kind: KIND.TOGGLE, key: 'preferTranscode', label: () => $L('Prefer Transcoding'), desc: () => $L('Request transcoded streams when available'), icon: 'transform'},
					{kind: KIND.TOGGLE, key: 'forceDirectPlay', label: () => $L('Force Direct Play'), desc: () => $L('Skip codec checks and always attempt DirectPlay (debug)'), icon: 'play_arrow'},
					{kind: KIND.TOGGLE, key: 'xboxNativePlayer', label: () => $L('Console Video Player'), desc: () => $L("Play video through the console's own player for HEVC, 4K and HDR. Turn off to use the built-in web player. Takes effect on the next playback"), icon: 'play_circle', when: (ctx) => ctx.isXbox},
					{kind: KIND.SLIDER, key: 'videoStartDelay', label: () => $L('Video Start Delay'), min: 0, max: 5, step: 0.5, format: (v) => (v === 0 ? $L('Off') : `${Number(v).toFixed(1)}s`), icon: 'schedule'}
				]
			},
			{
				id: 'audio',
				icon: 'volume_up',
				section: () => $L('Audio & Subtitles'),
				label: () => $L('Audio'),
				description: () => $L('Audio tracks, processing, and passthrough options'),
				rows: [
					{kind: KIND.SECTION, id: 'audioStream', label: () => $L('Audio Stream')},
					{kind: KIND.OPTION, key: 'audioLanguage', label: () => $L('Default Audio Language'), options: getAudioLanguageOptions, fallback: () => $L('Auto'), icon: 'language', padded: true},
					{kind: KIND.OPTION, key: 'fallbackAudioLanguage', label: () => $L('Fallback Audio Language'), options: getSubtitleLanguageOptions, fallback: () => $L('None'), icon: 'language', padded: true},
					{kind: KIND.TOGGLE, key: 'preferDefaultAudioTrack', label: () => $L('Prefer Default Audio Track'), desc: () => $L('Prefer original audio track over localized dub.'), icon: 'audiotrack'},
					{kind: KIND.TOGGLE, key: 'preferAudioDescription', label: () => $L('Prefer Audio Description Tracks'), desc: () => $L('Prefer audio description tracks over normal tracks.'), icon: 'hearing'},
					{kind: KIND.SECTION, id: 'audioOutput', label: () => $L('Audio Output')},
					{kind: KIND.TEXT, id: 'xboxAudioOutput', text: () => $L("Unless Passthrough is on, Moonfin decodes all sound on the console and sends it on as PCM, so TrueHD, DTS-HD and Atmos do not reach a receiver as they are. What the receiver shows follows the console's own audio settings."), when: (ctx) => ctx.isXbox && !xboxPassesThrough(ctx)},
					{kind: KIND.TOGGLE, key: 'xboxPassthrough', label: () => $L('Passthrough (Experimental)'), desc: () => $L("Send TrueHD, DTS and Dolby Digital tracks to your receiver as they are. Needs Allow passthrough on in the console's audio settings. Takes effect on the next playback"), icon: 'surround_sound', when: whenXboxPassthrough},
					{kind: KIND.OPTION, key: 'audioPassthroughMode', label: () => $L('Passthrough'), desc: () => $L('How compressed surround sound reaches your TV or receiver.'), options: getPassthroughModeOptions, fallback: () => $L('Auto'), icon: 'surround_sound', when: (ctx) => !inBrowserElement(ctx)},
					{kind: KIND.TOGGLE, key: 'downmixToStereo', label: () => $L('Downmix to Stereo'), desc: () => $L('Mix all decoded audio down to two channels.'), icon: 'speaker'},
					{kind: KIND.TOGGLE, key: 'stereoUpmixEnabled', label: () => $L('Stereo to Surround Upmix'), desc: () => $L('Upmix stereo audio to 5.1 surround via server transcoding'), icon: 'equalizer', when: (ctx) => !ctx.settings.downmixToStereo},
					{kind: KIND.SECTION, id: 'passthroughSettings', label: () => $L('Passthrough Settings'), when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'ac3Passthrough', label: () => $L('AC3 Passthrough'), desc: () => $L('Bitstream AC3 to external decoder'), icon: 'speaker', when: whenWebOSPassthrough},
					{kind: KIND.TOGGLE, key: 'eac3Passthrough', label: () => $L('EAC3 Passthrough'), desc: () => $L('Bitstream E-AC-3, including Dolby Atmos (JOC).'), icon: 'surround_sound', when: whenWebOSPassthrough},
					{kind: KIND.TOGGLE, key: 'dtsPassthrough', label: () => $L('DTS Core Passthrough'), desc: () => $L('Bitstream DTS audio to AVR only; requires receiver support and DTS source track'), icon: 'audiotrack', when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'dtshdPassthrough', label: () => $L('DTS-HD MA Passthrough'), desc: () => $L('Bitstream DTS-HD, including DTS:X.'), icon: 'high_quality', when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'truehdPassthrough', label: () => $L('TrueHD Passthrough'), desc: () => $L('Bitstream TrueHD, including Dolby Atmos.'), icon: 'graphic_eq', when: whenPassthrough},
					{kind: KIND.TOGGLE, key: 'forceTruehdPassthrough', label: () => $L('Force TrueHD / Atmos Passthrough'), desc: () => $L('Send Dolby TrueHD and Atmos straight to your receiver. Make sure your receiver supports it.'), icon: 'graphic_eq', when: (ctx) => whenTruehdOptIn(ctx) && ctx.isWebOS},
					{kind: KIND.TOGGLE, key: 'experimentalTruehd', label: () => $L('Experimental TrueHD Attempt'), desc: () => $L('May fall back to PCM, DD+, or AC3. Requires eARC + receiver. Not for TV speakers.'), icon: 'speaker', when: (ctx) => whenTruehdOptIn(ctx) && ctx.isTizen, onToggle: (ctx) => ctx.actions.toggleExperimentalTruehd()},
					{kind: KIND.SECTION, id: 'audioAdvanced', label: () => $L('Advanced')},
					{kind: KIND.OPTION, key: 'maxAudioChannels', label: () => $L('Max Audio Channels'), desc: () => $L('Configure the maximum channels of your audio setup. Multichannel streams exceeding this limit will downmix or transcode.'), options: getMaxAudioChannelsOptions, fallback: () => $L('Auto Detect'), icon: 'speaker_group', padded: true},
					{
						kind: KIND.NAV,
						id: 'transcodeAudioCodecs',
						label: () => $L('Transcode Audio Codecs'),
						desc: (ctx) => {
							const picked = ctx.settings.transcodeAudioCodecs || [];
							if (picked.length === 0) return $L('None');
							const options = getTranscodeAudioCodecOptions();
							return picked.map((codec) => options.find((option) => option.value === codec)?.label || codec).join(', ');
						},
						icon: 'transform',
						action: (ctx) => ctx.actions.openTranscodeAudioCodecs()
					}
				]
			},
			{
				id: 'subtitles',
				clean: true,
				icon: 'subtitles',
				section: () => $L('Audio & Subtitles'),
				label: () => $L('Subtitles'),
				description: () => $L('Change subtitle modes, default languages, appearance, and rendering options.'),
				rows: [
					{kind: KIND.SECTION, id: 'subtitlesGeneral', label: () => $L('General')},
					{kind: KIND.OPTION, key: 'subtitleMode', label: () => $L('Subtitle Mode'), options: getSubtitleModeOptions, fallback: () => $L('Flagged'), icon: 'subtitles'},
					{
						kind: KIND.NAV,
						id: 'subtitleDownloadLanguages',
						label: () => $L('Subtitle Download Languages'),
						desc: (ctx) => {
							const picked = ctx.settings.subtitleDownloadLanguages || [];
							if (picked.length === 0) return $L('Auto');
							const options = getSubtitleLanguageOptions();
							return picked.map((code) => options.find((option) => option.value === code)?.label || code).join(', ');
						},
						icon: 'download',
						action: (ctx) => ctx.actions.openSubtitleDownloadLanguages()
					},
					{kind: KIND.SECTION, id: 'subtitleStream', label: () => $L('Subtitle Stream'), when: whenSubtitlesOn},
					{kind: KIND.OPTION, key: 'subtitleLanguage', label: () => $L('Default Subtitle Language'), options: getSubtitleLanguageOptions, fallback: () => $L('None'), icon: 'language', when: whenSubtitlesOn, padded: true},
					{kind: KIND.OPTION, key: 'preferredSecondarySubtitleLanguage', label: () => $L('Preferred Secondary Subtitle Language'), options: getSubtitleLanguageOptions, fallback: () => $L('None'), icon: 'language', when: whenSubtitlesOn, padded: true},
					{kind: KIND.OPTION, key: 'fallbackSubtitleLanguage', label: () => $L('Fallback Subtitle Language'), options: getSubtitleLanguageOptions, fallback: () => $L('None'), icon: 'language', when: whenSubtitlesOn, padded: true},
					{kind: KIND.TOGGLE, key: 'preferSdhSubtitles', label: () => $L('Prefer SDH Subtitles'), desc: () => $L('Prioritize SDH/CC subtitle tracks when auto-selecting.'), icon: 'hearing', when: whenSubtitlesOn},
					{kind: KIND.TOGGLE, key: 'preferTextSubtitles', label: () => $L('Prefer text subtitles'), desc: () => $L('Prioritize text-based subtitles (SRT, VTT) over image-based formats (PGS, VobSub)'), icon: 'subtitles', when: whenSubtitlesOn},
					{kind: KIND.TOGGLE, key: 'preferExternalSubtitles', label: () => $L('Prefer external subtitles'), desc: () => $L('Prioritize external subtitle files over embedded tracks'), icon: 'folder', when: whenSubtitlesOn},
					{kind: KIND.SECTION, id: 'subtitleCustomization', label: () => $L('Subtitle Customization'), when: whenSubtitlesOn},
					{kind: KIND.NAV, id: 'subtitleCustomization', label: () => $L('Subtitle Customization'), desc: () => $L('Customize subtitle appearance'), icon: 'style', when: whenSubtitlesOn, action: (ctx) => ctx.actions.openScreen('playback', 'subtitleCustomization', 'setting-subtitleCustomization')},
					{kind: KIND.SECTION, id: 'subtitleRendering', label: () => $L('Subtitle Rendering'), when: whenSubtitlesOn},
					{kind: KIND.TOGGLE, key: 'enablePgsRendering', label: () => $L('PGS Direct Play'), desc: () => $L('Direct play PGS subtitles'), icon: 'image', when: whenSubtitlesOn},
					{kind: KIND.TOGGLE, key: 'assDirectPlay', label: () => $L('ASS/SSA Direct Play'), desc: () => $L('Direct play ASS/SSA subtitles'), icon: 'text_snippet', when: whenSubtitlesOn},
					{kind: KIND.TOGGLE, key: 'waitForAssSubtitles', label: () => $L('Wait for ASS/SSA subtitles'), desc: () => $L('Hold the video until styled subtitles are ready so the first lines show'), icon: 'timer', when: (ctx) => whenSubtitlesOn(ctx) && ctx.isWebOS && ctx.settings.assDirectPlay !== false}
				]
			},
			{
				id: 'subtitleCustomization',
				clean: true,
				icon: 'format_color_text',
				menu: false,
				parent: 'subtitles',
				label: () => $L('Subtitle Customization'),
				description: () => $L('Customize subtitle appearance'),
				rows: [
					{kind: KIND.CUSTOM, id: 'subtitlePreview', render: 'subtitlePreview'},
					{kind: KIND.OPTION, key: 'subtitleColor', label: () => $L('Text Fill Color'), options: getSubtitleColorOptions, fallback: () => $L('White'), icon: 'format_color_text', colorTile: (ctx) => ctx.settings.subtitleColor},
					{kind: KIND.SLIDER, key: 'subtitleOpacity', label: () => $L('Text Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity', plainIcon: true},
					{kind: KIND.OPTION, key: 'subtitleShadowColor', label: () => $L('Shadow Color'), options: getSubtitleShadowColorOptions, fallback: () => $L('Black'), icon: 'border_color', colorTile: (ctx) => ctx.settings.subtitleShadowColor},
					{kind: KIND.SLIDER, key: 'subtitleShadowOpacity', label: () => $L('Shadow Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity', plainIcon: true},
					{kind: KIND.SLIDER, key: 'subtitleShadowBlur', label: () => $L('Shadow Size (Blur)'), min: 0, max: 1, step: 0.1, format: (v) => (v || 0.1).toFixed(1), icon: 'blur_on', plainIcon: true},
					{kind: KIND.OPTION, key: 'subtitleBackgroundColor', label: () => $L('Background Color'), options: getSubtitleBackgroundColorOptions, fallback: () => $L('Black'), icon: 'format_color_fill', colorTile: (ctx) => ctx.settings.subtitleBackgroundColor},
					{kind: KIND.SLIDER, key: 'subtitleBackground', label: () => $L('Background Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity', plainIcon: true},
					{kind: KIND.OPTION, key: 'subtitleSize', label: () => $L('Subtitle Size'), options: getSubtitleSizeOptions, fallback: () => $L('Medium'), icon: 'format_size', plainIcon: true},
					{kind: KIND.OPTION, key: 'subtitlePosition', label: () => $L('Subtitle Position'), options: getSubtitlePositionOptions, fallback: () => $L('Bottom'), icon: 'vertical_align_bottom', plainIcon: true},
					{kind: KIND.SLIDER, key: 'subtitlePositionAbsolute', label: () => $L('Absolute Position'), min: 0, max: 100, step: 5, format: percent, icon: 'vertical_align_bottom', when: (ctx) => ctx.settings.subtitlePosition === 'absolute', plainIcon: true},
					{kind: KIND.SECTION, id: 'hdr', label: () => $L('HDR')},
					{
						kind: KIND.TOGGLE,
						key: 'subtitleHdrSeparate',
						label: () => $L('Separate HDR Style'),
						desc: () => $L('White is much brighter in HDR than in SDR, so a dimmer style here avoids the glare'),
						icon: 'hdr_on'
					},
					{kind: KIND.OPTION, key: 'subtitleColorHdr', label: () => $L('Text Fill Color'), options: getSubtitleColorOptions, fallback: () => $L('Gray'), icon: 'format_color_text', when: whenHdrSubtitles, colorTile: (ctx) => ctx.settings.subtitleColorHdr},
					{kind: KIND.SLIDER, key: 'subtitleOpacityHdr', label: () => $L('Text Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity', when: whenHdrSubtitles, plainIcon: true},
					{kind: KIND.OPTION, key: 'subtitleShadowColorHdr', label: () => $L('Shadow Color'), options: getSubtitleShadowColorOptions, fallback: () => $L('Black'), icon: 'border_color', when: whenHdrSubtitles, colorTile: (ctx) => ctx.settings.subtitleShadowColorHdr},
					{kind: KIND.SLIDER, key: 'subtitleShadowOpacityHdr', label: () => $L('Shadow Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity', when: whenHdrSubtitles, plainIcon: true},
					{kind: KIND.SLIDER, key: 'subtitleShadowBlurHdr', label: () => $L('Shadow Size (Blur)'), min: 0, max: 1, step: 0.1, format: (v) => (v || 0.1).toFixed(1), icon: 'blur_on', when: whenHdrSubtitles, plainIcon: true},
					{kind: KIND.OPTION, key: 'subtitleBackgroundColorHdr', label: () => $L('Background Color'), options: getSubtitleBackgroundColorOptions, fallback: () => $L('Black'), icon: 'format_color_fill', when: whenHdrSubtitles, colorTile: (ctx) => ctx.settings.subtitleBackgroundColorHdr},
					{kind: KIND.SLIDER, key: 'subtitleBackgroundHdr', label: () => $L('Background Opacity'), min: 0, max: 100, step: 5, format: percent, icon: 'opacity', when: whenHdrSubtitles, plainIcon: true},
					{kind: KIND.OPTION, key: 'subtitleSizeHdr', label: () => $L('Subtitle Size'), options: getSubtitleSizeOptions, fallback: () => $L('Medium'), icon: 'format_size', when: whenHdrSubtitles, plainIcon: true},
					{kind: KIND.OPTION, key: 'subtitlePositionHdr', label: () => $L('Subtitle Position'), options: getSubtitlePositionOptions, fallback: () => $L('Bottom'), icon: 'vertical_align_bottom', when: whenHdrSubtitles, plainIcon: true},
					{kind: KIND.SLIDER, key: 'subtitlePositionAbsoluteHdr', label: () => $L('Absolute Position'), min: 0, max: 100, step: 5, format: percent, icon: 'vertical_align_bottom', when: (ctx) => whenHdrSubtitles(ctx) && ctx.settings.subtitlePositionHdr === 'absolute', plainIcon: true}
				]
			},
			{
				id: 'skippingAutoplay',
				icon: 'queue_play_next',
				section: () => $L('Skipping & Queue'),
				label: () => $L('Skipping & Autoplay'),
				description: () => $L('Automated playback and sequencing'),
				rows: [
					{kind: KIND.SECTION, id: 'playbackEnhancements', label: () => $L('Playback Enhancements')},
					{kind: KIND.TOGGLE, key: 'cinemaModeEnabled', label: () => $L('Cinema Mode'), desc: () => $L('Play trailers/prerolls before a main feature'), icon: 'movie_filter'},
					{kind: KIND.TOGGLE, key: 'cinemaModeEpisodesEnabled', label: () => $L('Cinema Mode for episodes'), desc: () => $L('Also play prerolls before TV episodes'), icon: 'live_tv', when: (ctx) => ctx.settings.cinemaModeEnabled},
					{kind: KIND.TOGGLE, key: 'cinemaModeSkipEnabled', label: () => $L('Cinema Mode Skip Button'), desc: () => $L('Show a Skip button during Cinema Mode trailers, commercials, and other pre-rolls.'), icon: 'skip_next', when: (ctx) => ctx.settings.cinemaModeEnabled},
					{kind: KIND.OPTION, key: 'introAction', label: () => $L('Intro Segments'), options: getMediaSegmentActionOptions, fallback: () => $L('Ask to Skip'), icon: 'content_cut', padded: true},
					{kind: KIND.OPTION, key: 'outroAction', label: () => $L('Outro Segments'), options: getMediaSegmentActionOptions, fallback: () => $L('Ask to Skip'), icon: 'content_cut', padded: true},
					{kind: KIND.OPTION, key: 'mediaSegmentAutoHide', label: () => $L('Auto Hide Skip Button'), desc: () => $L('Automatically dismiss the skip intro and outro button after a few seconds.'), options: getMediaSegmentAutoHideOptions, fallback: () => $L('Off'), icon: 'visibility_off_outlined', when: (ctx) => ctx.settings.introAction === 'ask' || ctx.settings.outroAction === 'ask'},
					{kind: KIND.SECTION, id: 'automaticQueuing', label: () => $L('Automatic Queuing')},
					{kind: KIND.TOGGLE, key: 'autoPlay', label: () => $L('Autoplay Next Episode'), desc: () => $L('Automatically play the next episode when available.'), icon: 'play_circle'},
					{kind: KIND.OPTION, key: 'nextUpBehavior', label: () => $L('Next Up Display'), desc: () => $L('Extended shows a full card with episode artwork and description. Minimal shows a compact countdown overlay. Disabled hides the prompt entirely.'), options: getNextUpBehaviorOptions, fallback: () => $L('Extended'), icon: 'skip_next'},
					{kind: KIND.OPTION, key: 'nextUpCountdownStyle', label: () => $L('Media Segment Countdown'), options: getNextUpCountdownStyleOptions, fallback: () => $L('Both'), icon: 'timer_outlined', when: (ctx) => ctx.settings.nextUpBehavior !== 'disabled'},
					{kind: KIND.SLIDER, key: 'nextUpTimeout', label: () => $L('Next Up Timeout'), min: 0, max: 30, step: 1, format: (v) => (v === 0 ? $L('Instant') : `${v}s`), icon: 'timer', when: (ctx) => ctx.settings.nextUpBehavior !== 'disabled'},
					{kind: KIND.TOGGLE, key: 'replaceSkipOutroWithNextUp', label: () => $L('Replace Skip Outro with Next Up Display'), desc: () => $L('Show the Next Up overlay instead of the Skip Outro button.'), icon: 'skip_next', when: (ctx) => ctx.settings.outroAction !== 'none'},
					{kind: KIND.OPTION, key: 'stillWatchingBehavior', label: () => $L('Still Watching Prompt'), options: getStillWatchingBehaviorOptions, fallback: () => $L('3 episodes'), desc: () => $L('Prompt to Continue Watching after X consecutive episodes.'), icon: 'visibility'}
				]
			},
			{
				id: 'syncPlay',
				icon: 'groups',
				section: () => $L('Watch Together'),
				label: () => $L('SyncPlay'),
				description: () => $L('Synchronization logic for group sessions'),
				rows: [
					{kind: KIND.SECTION, id: 'syncPlayOptions', label: () => $L('SyncPlay Options')},
					{kind: KIND.TOGGLE, key: 'syncplayEnabled', label: () => $L('SyncPlay Enabled'), desc: () => $L('Enable group watching features'), icon: 'groups'},
					{kind: KIND.TOGGLE, key: 'syncplayAutoOpen', label: () => $L('Open SyncPlay'), desc: () => $L('Automatically open SyncPlay dialog when starting playback'), icon: 'group_work'},
					{kind: KIND.TOGGLE, key: 'syncPlayAdvancedCorrectionEnabled', label: () => $L('Advanced Correction'), desc: () => $L('Enable fine-grained sync logic'), icon: 'tune'},
					{kind: KIND.TOGGLE, key: 'syncPlayEnableSyncCorrection', label: () => $L('Sync Correction'), desc: () => $L('Automatically adjust playback to stay in sync'), icon: 'sync', when: whenSyncCorrection},
					{kind: KIND.TOGGLE, key: 'syncPlayUseSkipToSync', label: () => $L('Skip to Sync'), desc: () => $L('Use seeking to sync'), icon: 'skip_next', when: whenSyncCorrection},
					{kind: KIND.SLIDER, key: 'syncPlayMinDelaySkipToSync', label: () => $L('Minimum Skip Delay'), min: 0, max: 15000, step: 250, format: milliseconds, icon: 'timer', when: (ctx) => whenSyncCorrection(ctx) && ctx.settings.syncPlayUseSkipToSync},
					{kind: KIND.SLIDER, key: 'syncPlayExtraTimeOffset', label: () => $L('SyncPlay Extra Offset'), min: -2000, max: 2000, step: 100, format: milliseconds, icon: 'schedule'}
				]
			}
		]
	},
	{
		id: 'storage',
		when: (ctx) => !ctx.settings.kidsModeEnabled,
		label: () => $L('Storage'),
		description: () => $L('Image cache and app data'),
		icon: 'sd_storage',
		subcategories: [
			{
				id: 'storage',
				icon: 'storage',
				label: () => $L('Storage'),
				description: () => $L('Image cache and app data'),
				rows: [
					{kind: KIND.SECTION, id: 'storage', label: () => $L('Storage')},
					{kind: KIND.CUSTOM, id: 'imageCacheActions', render: 'imageCacheActions'},
					{kind: KIND.SECTION, id: 'dangerZone', label: () => $L('Danger Zone')},
					{
						kind: KIND.TEXT,
						id: 'clearDataDescription',
						text: () => $L('Remove all saved servers, login sessions, and settings. The app will restart as if freshly installed.')
					},
					{kind: KIND.CUSTOM, render: 'aboutDataActions'}
				]
			}
		]
	},
	{
		id: 'integrations',
		clean: true,
		// A list of what's on offer even when only one thing is
		alwaysMenu: true,
		when: (ctx) => !ctx.settings.kidsModeEnabled,
		label: () => $L('Integrations'),
		description: () => $L('Seerr and Achievement Badges'),
		icon: 'hub',
		subcategories: [
			{
				id: 'seerr',
				clean: true,
				icon: 'seerr',
				label: (ctx) => ctx.seerrLabel,
				description: () => $L('Media request integration'),
				// The sign-in panel holds no persisted settings, so the screen itself is the
				// only thing worth surfacing. These make it findable by what it does.
				keywords: () => [$L('Sign In'), $L('login'), $L('Password'), $L('Requests')],
				rows: [
					{kind: KIND.CUSTOM, render: 'seerrPanel'},
					{
						kind: KIND.TOGGLE,
						key: 'seerrShowMissingCollectionItems',
						label: () => $L('Show Missing Collection Items'),
						desc: () => $L('Include missing items on Collection pages'),
						icon: 'video_collection_outlined',
						when: whenSeerr
					},
					{
						kind: KIND.TOGGLE,
						key: 'showSeerrAvailabilityBadges',
						label: () => $L('Show Seerr Availability Badges'),
						desc: () => $L('Show season availability badges on media details pages'),
						icon: 'check_circle_outline',
						when: whenSeerr
					},
					{kind: KIND.INFO, id: 'seerrVariant', label: () => $L('Detected Variant'), value: (ctx) => $L('{seerrLabel} (Seerr v3+)').replace('{seerrLabel}', ctx.seerrLabel), when: (ctx) => ctx.isSeerr, icon: 'info_outline'}
				]
			},
			{
				id: 'achievements',
				icon: 'military_tech',
				label: () => $L('Achievement Badges'),
				description: () => $L('Badges, ranks and quests earned from what you watch'),
				// A screen of its own rather than a page of settings rows.
				opensView: 'achievements',
				when: (ctx) => ctx.achievements.available,
				rows: []
			},
			{
				id: 'romm',
				clean: true,
				icon: 'sports_esports',
				label: () => 'RomM',
				description: () => $L('Play and save games with your RomM account'),
				when: (ctx) => !!ctx.romm?.available,
				rows: [{kind: KIND.CUSTOM, render: 'rommPanel'}]
			}
		]
	},
	{
		id: 'about',
		when: (ctx) => !ctx.settings.kidsModeEnabled,
		label: () => $L('About'),
		description: () => $L('App version, legal information, and credits'),
		icon: 'info_outline',
		subcategories: [
			{
				id: 'about',
				icon: 'info',
				label: () => $L('About'),
				description: () => $L('App version, legal information, and credits'),
				rows: [
					{kind: KIND.CUSTOM, id: 'aboutHeader', render: 'aboutHeader'},
					{kind: KIND.SECTION, id: 'appInfo', label: () => $L('APP INFO')},
					{kind: KIND.INFO, id: 'appVersion', label: () => $L('Version'), value: () => process.env.REACT_APP_VERSION || '0.0.0', icon: 'info_outline'},
					{
						kind: KIND.INFO,
						id: 'platform',
						icon: 'tv',
						label: () => $L('Platform'),
						value: (ctx) => (ctx.capabilities?.tizenVersionDisplay ? 'Tizen' : ctx.capabilities?.webosVersionDisplay ? 'webOS' : ctx.capabilities?.vegaVersionDisplay ? 'Fire TV' : ctx.capabilities?.xboxVersionDisplay ? 'Xbox' : $L('Unknown'))
					},
					{kind: KIND.TOGGLE, key: 'updateNotificationsEnabled', label: () => $L('Update Notifications'), desc: () => $L('Show app update notifications when a new release is available'), icon: 'system_update_alt'},
					{kind: KIND.CUSTOM, id: 'checkForUpdates', render: 'checkForUpdates'},
					{kind: KIND.NAV, id: 'sourceCode', label: () => $L('Source Code'), desc: () => 'github.com/Moonfin-Client/Smart-TV', icon: 'code', action: (ctx) => ctx.actions.openQrLink($L('Source Code'), 'https://github.com/Moonfin-Client/Smart-TV', 'setting-sourceCode')},
					{kind: KIND.NAV, id: 'reportIssue', label: () => $L('Report an Issue'), desc: () => $L('Open the issue tracker on GitHub'), icon: 'bug_report', action: (ctx) => ctx.actions.openQrLink($L('Report an Issue'), 'https://github.com/Moonfin-Client/Smart-TV/issues', 'setting-reportIssue')},
					{kind: KIND.NAV, id: 'diagnosticsLogging', label: () => $L('Diagnostics & Logging'), desc: () => $L('Capture media, login and network logs and send them to the server as a report'), icon: 'troubleshoot', action: (ctx) => ctx.actions.openScreen('about', 'diagnostics', 'setting-diagnosticsLogging')},
					{kind: KIND.NAV, id: 'runSetupAgain', label: () => $L('Run setup again'), icon: 'auto_awesome', when: (ctx) => !!ctx.actions.runSetupAgain, action: (ctx) => ctx.actions.runSetupAgain()},
					{kind: KIND.NAV, id: 'joinDiscord', label: () => $L('Join Discord'), desc: () => $L('Chat with the community'), icon: 'forum', action: (ctx) => ctx.actions.openQrLink($L('Join Discord'), 'https://discord.gg/moonfin', 'setting-joinDiscord')},
					{kind: KIND.NAV, id: 'supportMoonfin', label: () => $L('Support Moonfin'), desc: () => $L('Donate a coffee to the developer'), icon: 'favorite', action: (ctx) => ctx.actions.openQrLink($L('Support Moonfin'), 'https://buymeacoffee.com/moonfin', 'setting-supportMoonfin')},
					{kind: KIND.SECTION, id: 'legal', label: () => $L('LEGAL')},
					{kind: KIND.NAV, id: 'licenses', label: () => $L('Licenses'), desc: () => $L('Open-source license notices'), icon: 'description', action: (ctx) => ctx.actions.openQrLink($L('Licenses'), 'https://github.com/Moonfin-Client/Smart-TV/blob/main/LICENSE', 'setting-licenses')},
					{kind: KIND.NAV, id: 'privacyPolicy', label: () => $L('Privacy Policy'), desc: () => $L('How Moonfin handles your data'), icon: 'privacy_tip', action: (ctx) => ctx.actions.openQrLink($L('Privacy Policy'), 'https://moonfin.io/privacy', 'setting-privacyPolicy')},
					{kind: KIND.SECTION, id: 'server', label: () => $L('Server')},
					{kind: KIND.INFO, id: 'serverUrl', label: () => $L('Server URL'), value: (ctx) => ctx.serverUrl || $L('Not connected'), icon: 'dns'},
					{kind: KIND.INFO, id: 'serverVersion', label: () => $L('Server Version'), value: (ctx) => ctx.serverVersion || $L('Loading...'), icon: 'dns'},
					{kind: KIND.SECTION, id: 'device', label: () => $L('Device'), when: (ctx) => !!ctx.capabilities},
					{kind: KIND.INFO, id: 'model', label: () => $L('Model'), value: (ctx) => ctx.capabilities?.modelName || $L('Unknown'), icon: 'tv', when: (ctx) => !!ctx.capabilities},
					{
						kind: KIND.INFO,
						id: 'osVersion',
						label: (ctx) => (ctx.capabilities?.tizenVersionDisplay ? $L('Tizen Version') : ctx.capabilities?.vegaVersionDisplay ? $L('Vega OS Version') : ctx.capabilities?.xboxVersionDisplay ? $L('Xbox OS Version') : $L('webOS Version')),
						value: (ctx) => ctx.capabilities?.tizenVersionDisplay || ctx.capabilities?.webosVersionDisplay || ctx.capabilities?.vegaVersionDisplay || ctx.capabilities?.xboxVersionDisplay,
						icon: 'settings',
						when: (ctx) => !!(ctx.capabilities?.tizenVersionDisplay || ctx.capabilities?.webosVersionDisplay || ctx.capabilities?.vegaVersionDisplay || ctx.capabilities?.xboxVersionDisplay)
					},
					{kind: KIND.INFO, id: 'firmware', label: () => $L('Firmware'), value: (ctx) => ctx.capabilities?.firmwareVersion, icon: 'memory', when: (ctx) => !!ctx.capabilities?.firmwareVersion},
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
						icon: 'hdr_on',
						when: (ctx) => !!ctx.capabilities
					},
					{
						kind: KIND.INFO,
						id: 'videoCodecs',
						label: () => $L('Video Codecs'),
						value: (ctx) => ['H.264', ctx.capabilities?.hevc && 'HEVC', ctx.capabilities?.vp9 && 'VP9', ctx.capabilities?.av1 && 'AV1']
							.filter(Boolean).join(', '),
						icon: 'movie',
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
						icon: 'music_note',
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
					}
				]
			},
			{
				id: 'diagnostics',
				clean: true,
				icon: 'bug_report',
				menu: false,
				label: () => $L('Diagnostics & Logging'),
				description: () => $L('Capture media, login and network logs and send them to the server as a report'),
				rows: [
					{kind: KIND.SECTION, id: 'logging', label: () => $L('Logging')},
					{kind: KIND.TOGGLE, key: 'diagnosticLoggingEnabled', label: () => $L('Diagnostic Logging'), desc: () => $L('Capture media, Seerr login, network and other diagnostics so they can be sent to the server as a report.'), icon: 'bug_report'},
					{kind: KIND.TOGGLE, key: 'serverLogging', label: () => $L('Server Logging'), desc: () => $L('Send logs to Jellyfin server for troubleshooting'), icon: 'cloud_upload'},
					{kind: KIND.SECTION, id: 'reports', label: () => $L('Reports')},
					{kind: KIND.NAV, id: 'viewLogs', label: () => $L('View Logs'), desc: () => $L('Read the recorded log and send a report'), icon: 'troubleshoot', action: (ctx) => ctx.actions.openDiagnostics()},
					{kind: KIND.NAV, id: 'deviceProbe', label: () => $L('Device Probe'), desc: () => $L('Test what this device can play and send the report to your server'), icon: 'tv', when: (ctx) => !!ctx.actions.openDeviceProbe, action: (ctx) => ctx.actions.openDeviceProbe()}
				]
			}
		]
	},
	// The one category Kids Mode leaves standing. Hiding settings outright would leave no way back,
	// and a hidden gesture is worse than an obvious tile.
	{
		id: 'kidsMode',
		label: () => $L('Exit Kids Mode'),
		description: () => $L('Enter your PIN to restore the full app'),
		icon: 'lock_open',
		when: (ctx) => ctx.settings.kidsModeEnabled,
		subcategories: [
			{
				id: 'kidsModeExit',
				icon: 'lock_open',
				label: () => $L('Exit Kids Mode'),
				description: () => $L('Enter your PIN to restore the full app'),
				opensView: 'kidsModeExit',
				rows: []
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
