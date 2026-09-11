import $L from '@enact/i18n/$L';

import {PLAYBACK_TIME_DISPLAYS, PLAYBACK_TIME_SLOTS} from '../../utils/playbackTimeLabels';

// Every list is a function so $L runs when the settings screen opens rather than when
// this module is imported, which is before i18n has loaded its bundle.

export const getBitrateOptions = () => [
	{ value: 0, label: $L('Auto (Recommended)') },
	{ value: 120000000, label: $L('120 Mbps') },
	{ value: 80000000, label: $L('80 Mbps') },
	{ value: 60000000, label: $L('60 Mbps') },
	{ value: 40000000, label: $L('40 Mbps') },
	{ value: 20000000, label: $L('20 Mbps') },
	{ value: 10000000, label: $L('10 Mbps') },
	{ value: 5000000, label: $L('5 Mbps') }
];

export const getContentTypeOptions = () => [
	{ value: 'both', label: $L('Movies & TV Shows') },
	{ value: 'movies', label: $L('Movies Only') },
	{ value: 'tv', label: $L('TV Shows Only') }
];

export const getFeaturedBarStyleOptions = () => [
	{ value: 'moonfin', label: $L('Moonfin') },
	{ value: 'makd', label: $L('MakD') },
	{ value: 'bookshelf', label: $L('Bookshelf') },
	{ value: 'gallery', label: $L('Gallery') },
	{ value: 'banner', label: $L('Banner') },
	{ value: 'aya', label: $L('Aya') },
	{ value: 'off', label: $L('Off') }
];

export const getFeaturedItemCountOptions = () => [
	{ value: 5, label: $L('5 items') },
	{ value: 10, label: $L('10 items') },
	{ value: 15, label: $L('15 items') },
	{ value: 20, label: $L('20 items') },
	{ value: 25, label: $L('25 items') },
	{ value: 30, label: $L('30 items') }
];

export const getBlurOptions = () => [
	{ value: 0, label: $L('Off') },
	{ value: 10, label: $L('Light') },
	{ value: 20, label: $L('Medium') },
	{ value: 30, label: $L('Strong') },
	{ value: 40, label: $L('Heavy') }
];

export const getDetailsOpacityOptions = () => [
	{ value: 0, label: '0%' },
	{ value: 5, label: '20%' },
	{ value: 10, label: '40%' },
	{ value: 15, label: '60%' },
	{ value: 20, label: '80%' },
	{ value: 25, label: '100%' }
];

export const getPerformanceModeOptions = () => [
	{ value: 'auto', label: $L('Auto') },
	{ value: 'high', label: $L('High Quality') },
	{ value: 'mid', label: $L('Balanced') },
	{ value: 'low', label: $L('Performance') }
];

export const getSubtitleSizeOptions = () => [
	{ value: 'small', label: $L('Small'), fontSize: 36 },
	{ value: 'medium', label: $L('Medium'), fontSize: 44 },
	{ value: 'large', label: $L('Large'), fontSize: 52 },
	{ value: 'xlarge', label: $L('Extra Large'), fontSize: 60 }
];

export const getSubtitlePositionOptions = () => [
	{ value: 'bottom', label: $L('Bottom'), offset: 10 },
	{ value: 'lower', label: $L('Lower'), offset: 20 },
	{ value: 'middle', label: $L('Middle'), offset: 30 },
	{ value: 'higher', label: $L('Higher'), offset: 40 },
	{ value: 'absolute', label: $L('Absolute'), offset: 0 }
];

export const getSubtitleColorOptions = () => [
	{ value: '#ffffff', label: $L('White') },
	{ value: '#ffff00', label: $L('Yellow') },
	{ value: '#00ffff', label: $L('Cyan') },
	{ value: '#ff00ff', label: $L('Magenta') },
	{ value: '#00ff00', label: $L('Green') },
	{ value: '#ff0000', label: $L('Red') },
	{ value: '#808080', label: $L('Grey') },
	{ value: '#404040', label: $L('Dark Grey') }
];

export const getSubtitleShadowColorOptions = () => [
	{ value: '#000000', label: $L('Black') },
	{ value: '#ffffff', label: $L('White') },
	{ value: '#808080', label: $L('Grey') },
	{ value: '#404040', label: $L('Dark Grey') },
	{ value: '#ff0000', label: $L('Red') },
	{ value: '#00ff00', label: $L('Green') },
	{ value: '#0000ff', label: $L('Blue') }
];

export const getSubtitleBackgroundColorOptions = () => [
	{ value: '#000000', label: $L('Black') },
	{ value: '#ffffff', label: $L('White') },
	{ value: '#808080', label: $L('Grey') },
	{ value: '#404040', label: $L('Dark Grey') },
	{ value: '#000080', label: $L('Navy') }
];

export const getSeekStepOptions = () => [
	{ value: 5, label: $L('5 seconds') },
	{ value: 10, label: $L('10 seconds') },
	{ value: 20, label: $L('20 seconds') },
	{ value: 30, label: $L('30 seconds') }
];

export const getUiScaleOptions = () => [
	{ value: 0.85, label: $L('Compact') },
	{ value: 0.9, label: $L('Small') },
	{ value: 0.95, label: $L('Slightly Small') },
	{ value: 1.0, label: $L('Default') },
	{ value: 1.05, label: $L('Slightly Large') },
	{ value: 1.1, label: $L('Large') },
	{ value: 1.15, label: $L('Extra Large') },
	{ value: 1.2, label: $L('Huge') },
	{ value: 1.3, label: $L('Maximum') }
];

export const getScreensaverModeOptions = () => [
	{ value: 'library', label: $L('Library Art') },
	{ value: 'logo', label: $L('Logo') }
];

export const getScreensaverTimeoutOptions = () => [
	{ value: 30, label: $L('30 seconds') },
	{ value: 60, label: $L('1 minute') },
	{ value: 90, label: $L('90 seconds') },
	{ value: 120, label: $L('2 minutes') },
	{ value: 180, label: $L('3 minutes') },
	{ value: 300, label: $L('5 minutes') }
];

export const getScreensaverDimmingOptions = () => [
	{ value: 0, label: $L('Off') },
	{ value: 25, label: $L('25%') },
	{ value: 50, label: $L('50%') },
	{ value: 75, label: $L('75%') },
	{ value: 100, label: $L('100%') }
];

export const getClockDisplayOptions = () => [
	{ value: '12-hour', label: $L('12-Hour') },
	{ value: '24-hour', label: $L('24-Hour') }
];

export const getNavPositionOptions = () => [
	{ value: 'top', label: $L('Top Bar') },
	{ value: 'left', label: $L('Left Sidebar') }
];

export const getWatchedIndicatorOptions = () => [
	{ value: 'always', label: $L('Always') },
	{ value: 'hideCount', label: $L('Hide Unwatched Count') },
	{ value: 'episodesOnly', label: $L('Episodes Only') },
	{ value: 'never', label: $L('Never') }
];

export const getPosterSizeOptions = () => [
	{ value: 'small', label: $L('Small') },
	{ value: 'default', label: $L('Default') },
	{ value: 'large', label: $L('Large') },
	{ value: 'xlarge', label: $L('Extra Large') }
];

export const getImageTypeOptions = () => [
	{ value: 'poster', label: $L('Poster') },
	{ value: 'backdrop', label: $L('Backdrop') },
	{ value: 'logo', label: $L('Logo') },
	{ value: 'thumb', label: $L('Thumb') },
	{ value: 'banner', label: $L('Banner') }
];

export const getHomeRowsStyleOptions = () => [
	{ value: 'v2', label: $L('Modern') },
	{ value: 'v1', label: $L('Classic') }
];

export const getDetailScreenStyleOptions = () => [
	{ value: 'v2', label: $L('Modern') },
	{ value: 'v1', label: $L('Classic') }
];

export const getPersonalRatingStyleOptions = () => [
	{ value: 'thumbs', label: $L('Like / dislike') },
	{ value: 'stars', label: $L('5 stars') },
	{ value: 'numeric', label: $L('Numeric score out of 10') }
];

export const getHomeRowSortOptions = () => [
	{ value: 'SortName', label: $L('Name') },
	{ value: 'DateCreated', label: $L('Date Added') },
	{ value: 'PremiereDate', label: $L('Premiere Date') },
	{ value: 'OfficialRating', label: $L('Rating') },
	{ value: 'Runtime', label: $L('Runtime') },
	{ value: 'Random', label: $L('Random') },
	{ value: 'CriticRating', label: $L('Critic rating') },
	{ value: 'CommunityRating', label: $L('Community Rating') }
];

// Playlist and collection rows can also follow the curated arrangement
export const getPlaylistCollectionSortOptions = () => [
	{ value: 'PlaylistOrder', label: $L('Playlist Order') },
	...getHomeRowSortOptions()
];

export const getGenresRowItemFilterOptions = () => [
	{ value: 'all', label: $L('Movies & TV Shows') },
	{ value: 'Movie', label: $L('Movies') },
	{ value: 'Series', label: $L('TV Shows') }
];

export const getRecommendationSystemSourceOptions = () => [
	{ value: 'local', label: $L('Moonfin Recommends') },
	{ value: 'server', label: $L('Jellyfin Recommends') },
	{ value: 'online', label: $L('TMDb Similarity') },
	{ value: 'hybrid', label: $L('Hybrid') }
];

// The details row and the home rows offer the same three engines.
export const getSinceYouWatchedSourceOptions = getRecommendationSystemSourceOptions;

export const getSinceYouWatchedSourceItemOptions = () => [
	{ value: 'recentlyWatched', label: $L('Recently Watched') },
	{ value: 'favorites', label: $L('Favorites') },
	{ value: 'random', label: $L('Random') }
];

export const getSinceYouWatchedSourceTypeOptions = () => [
	{ value: 'movies', label: $L('Movies') },
	{ value: 'shows', label: $L('TV Shows') },
	{ value: 'both', label: $L('Movies & TV Shows') }
];

export const getRewatchSortOptions = () => [
	{ value: 'recentlyWatched', label: $L('Recently Watched') },
	{ value: 'random', label: $L('Random') }
];

export const getServerSortOptions = () => [
	{ value: 'name', label: $L('Server name') },
	{ value: 'recent', label: $L('Recently Used') },
	{ value: 'added', label: $L('Date Added') }
];

export const getFolderViewModeOptions = () => [
	{ value: 'local', label: $L('Per Library') },
	{ value: 'on', label: $L('Always on.') },
	{ value: 'off', label: $L('Always Off') }
];

export const getNextUpMaxDaysOptions = () => [
	{ value: 0, label: $L('No limit') },
	{ value: 30, label: $L('30 days') },
	{ value: 90, label: $L('90 days') },
	{ value: 180, label: $L('180 days') },
	{ value: 365, label: $L('365 days') },
	{ value: 730, label: $L('730 days') }
];

export const getAudioLanguageOptions = () => [
	{ value: '', label: $L('Auto') },
	{ value: 'eng', label: $L('English') },
	{ value: 'spa', label: $L('Spanish') },
	{ value: 'fra', label: $L('French') },
	{ value: 'deu', label: $L('German') },
	{ value: 'ita', label: $L('Italian') },
	{ value: 'por', label: $L('Portuguese') },
	{ value: 'jpn', label: $L('Japanese') },
	{ value: 'kor', label: $L('Korean') },
	{ value: 'zho', label: $L('Chinese') },
	{ value: 'afr', label: $L('Afrikaans') },
	{ value: 'ara', label: $L('Arabic') },
	{ value: 'bel', label: $L('Belarusian') },
	{ value: 'ben', label: $L('Bengali') },
	{ value: 'bul', label: $L('Bulgarian') },
	{ value: 'cat', label: $L('Catalan') },
	{ value: 'ces', label: $L('Czech') },
	{ value: 'cym', label: $L('Welsh') },
	{ value: 'dan', label: $L('Danish') },
	{ value: 'ell', label: $L('Greek') },
	{ value: 'est', label: $L('Estonian') },
	{ value: 'fas', label: $L('Persian') },
	{ value: 'fin', label: $L('Finnish') },
	{ value: 'glg', label: $L('Galician') },
	{ value: 'heb', label: $L('Hebrew') },
	{ value: 'hin', label: $L('Hindi') },
	{ value: 'hrv', label: $L('Croatian') },
	{ value: 'hun', label: $L('Hungarian') },
	{ value: 'ind', label: $L('Indonesian') },
	{ value: 'kan', label: $L('Kannada') },
	{ value: 'kaz', label: $L('Kazakh') },
	{ value: 'lav', label: $L('Latvian') },
	{ value: 'lit', label: $L('Lithuanian') },
	{ value: 'mal', label: $L('Malayalam') },
	{ value: 'mkd', label: $L('Macedonian') },
	{ value: 'mon', label: $L('Mongolian') },
	{ value: 'nld', label: $L('Dutch') },
	{ value: 'nob', label: $L('Norwegian') },
	{ value: 'pan', label: $L('Punjabi') },
	{ value: 'pol', label: $L('Polish') },
	{ value: 'ron', label: $L('Romanian') },
	{ value: 'rus', label: $L('Russian') },
	{ value: 'sin', label: $L('Sinhala') },
	{ value: 'slk', label: $L('Slovak') },
	{ value: 'slv', label: $L('Slovenian') },
	{ value: 'sqi', label: $L('Albanian') },
	{ value: 'srp', label: $L('Serbian') },
	{ value: 'swa', label: $L('Swahili') },
	{ value: 'swe', label: $L('Swedish') },
	{ value: 'tam', label: $L('Tamil') },
	{ value: 'tel', label: $L('Telugu') },
	{ value: 'tgl', label: $L('Tagalog') },
	{ value: 'tha', label: $L('Thai') },
	{ value: 'tur', label: $L('Turkish') },
	{ value: 'uig', label: $L('Uyghur') },
	{ value: 'ukr', label: $L('Ukrainian') },
	{ value: 'vie', label: $L('Vietnamese') }
];

export const getSubtitleLanguageOptions = () => [
	{ value: '', label: $L('None') },
	...getAudioLanguageOptions().slice(1)
];

// The stored values predate this row and are what the player already acts on, so the
// labels borrow the other clients' wording while the values stay untouched. The
// default value asks the server which track its own subtitle preferences flag.
export const getSubtitleModeOptions = () => [
	{ value: 'default', label: $L('Flagged') },
	{ value: 'always', label: $L('Always') },
	{ value: 'foreign', label: $L('Foreign') },
	{ value: 'forced', label: $L('Forced') },
	{ value: 'none', label: $L('None') }
];

export const getSortOrderOptions = () => [
	{ value: 'auto', label: $L('Auto') },
	{ value: 'Ascending', label: $L('Ascending') },
	{ value: 'Descending', label: $L('Descending') }
];

export const getScreensaverClockOptions = () => [
	{ value: 'off', label: $L('Off') },
	{ value: 'staticCorner', label: $L('Static') },
	{ value: 'bouncing', label: $L('Bouncing') }
];

export const getOledModeOptions = () => [
	{ value: 'off', label: $L('Off') },
	{ value: 'subtle', label: $L('Subtle') },
	{ value: 'vivid', label: $L('Vivid') }
];

export const getAutoLoginOptions = () => [
	{ value: 'disabled', label: $L('Disabled') },
	{ value: 'lastUser', label: $L('Last User') },
	{ value: 'currentUser', label: $L('Current User') }
];

export const getResumeRewindOptions = () => [
	{ value: '0', label: $L('Disabled') },
	{ value: '5', label: $L('5 seconds') },
	{ value: '10', label: $L('10 seconds') },
	{ value: '15', label: $L('15 seconds') },
	{ value: '30', label: $L('30 seconds') }
];

export const getSkipLengthOptions = () => [
	{ value: 1000, label: $L('1 second') },
	{ value: 3000, label: $L('3 seconds') },
	{ value: 5000, label: $L('5 seconds') },
	{ value: 10000, label: $L('10 seconds') },
	{ value: 15000, label: $L('15 seconds') },
	{ value: 30000, label: $L('30 seconds') },
	{ value: 45000, label: $L('45 seconds') },
	{ value: 60000, label: $L('60 seconds') }
];

export const getMaxResolutionOptions = () => [
	{ value: 'auto', label: $L('Auto') },
	{ value: 'res480p', label: $L('480p') },
	{ value: 'res720p', label: $L('720p') },
	{ value: 'res1080p', label: $L('1080p') },
	{ value: 'res2160p', label: $L('2160p (4K)') }
];

export const getZoomModeOptions = () => [
	{ value: 'fit', label: $L('Fit') },
	{ value: 'autoCrop', label: $L('Auto Crop') },
	{ value: 'stretch', label: $L('Stretch') }
];

export const getMediaSegmentAutoHideOptions = () => [
	{ value: 's5', label: $L('5 seconds') },
	{ value: 's10', label: $L('10 seconds') },
	{ value: 'off', label: $L('Off') }
];

export const getPassthroughModeOptions = () => [
	{ value: 'auto', label: $L('Auto (match detected device support)') },
	{ value: 'manual', label: $L('Manual (choose formats below)') },
	{ value: 'disabled', label: $L('Disabled (always decode on this device)') }
];

export const getMaxAudioChannelsOptions = () => [
	{ value: 0, label: $L('Auto Detect (Hardware Default)') },
	{ value: 1, label: $L('Mono') },
	{ value: 2, label: $L('Stereo') },
	{ value: 3, label: $L('3.0') },
	{ value: 4, label: $L('4.0') },
	{ value: 5, label: $L('5.0') },
	{ value: 6, label: $L('5.1') },
	{ value: 7, label: $L('6.1') },
	{ value: 8, label: $L('7.1') }
];

export const getRatingSourceOptions = () => [
	{ value: 'personal', label: $L('My Rating') },
	{ value: 'stars', label: $L('Community Rating') },
	{ value: 'imdb', label: $L('IMDb') },
	{ value: 'tmdb', label: $L('TMDB') },
	{ value: 'tomatoes', label: $L('Rotten Tomatoes (Critics)') },
	{ value: 'tomatoes_audience', label: $L('Rotten Tomatoes (Audience)') },
	{ value: 'metacritic', label: $L('Metacritic') },
	{ value: 'metacriticuser', label: $L('Metacritic (User)') },
	{ value: 'trakt', label: $L('Trakt') },
	{ value: 'letterboxd', label: $L('Letterboxd') },
	{ value: 'rogerebert', label: $L('Roger Ebert') },
	{ value: 'myanimelist', label: $L('MyAnimeList') }
];

export const getNextUpBehaviorOptions = () => [
	{ value: 'extended', label: $L('Extended') },
	{ value: 'minimal', label: $L('Minimal') },
	{ value: 'disabled', label: $L('Disabled') }
];

// Every language Moonfin ships, named in itself and ordered the way Moonfin Core
// orders them, so the list reads the same on every platform. These labels are
// deliberately not run through $L: a language picker that renames the entries
// into the current language is useless to anyone looking for their own.
export const getUiLanguageOptions = () => [
	{ value: 'af', label: 'Afrikaans' },
	{ value: 'id', label: 'Bahasa Indonesia' },
	{ value: 'ca', label: 'Català' },
	{ value: 'cy', label: 'Cymraeg' },
	{ value: 'da', label: 'Dansk' },
	{ value: 'de', label: 'Deutsch' },
	{ value: 'et', label: 'Eesti' },
	{ value: 'en-GB', label: 'English (UK)' },
	{ value: 'en-US', label: 'English (US)' },
	{ value: 'es', label: 'Español' },
	{ value: 'es-419', label: 'Español (América Latina)' },
	{ value: 'es-AR', label: 'Español (Argentina)' },
	{ value: 'es-MX', label: 'Español (México)' },
	{ value: 'es-DO', label: 'Español (República Dominicana)' },
	{ value: 'eo', label: 'Esperanto' },
	{ value: 'fr', label: 'Français' },
	{ value: 'gl', label: 'Galego' },
	{ value: 'hr', label: 'Hrvatski' },
	{ value: 'it', label: 'Italiano' },
	{ value: 'sw', label: 'Kiswahili' },
	{ value: 'lv', label: 'Latviešu' },
	{ value: 'lt', label: 'Lietuvių' },
	{ value: 'hu', label: 'Magyar' },
	{ value: 'nl', label: 'Nederlands' },
	{ value: 'nb', label: 'Norsk Bokmål' },
	{ value: 'pl', label: 'Polski' },
	{ value: 'pt', label: 'Português' },
	{ value: 'pt-BR', label: 'Português (Brasil)' },
	{ value: 'pt-PT', label: 'Português (Portugal)' },
	{ value: 'ro', label: 'Română' },
	{ value: 'sq', label: 'Shqip' },
	{ value: 'sk', label: 'Slovenčina' },
	{ value: 'sl', label: 'Slovenščina' },
	{ value: 'fi', label: 'Suomi' },
	{ value: 'sv', label: 'Svenska' },
	{ value: 'tl', label: 'Tagalog' },
	{ value: 'vi', label: 'Tiếng Việt' },
	{ value: 'tr', label: 'Türkçe' },
	{ value: 'cs', label: 'Čeština' },
	{ value: 'el', label: 'Ελληνικά' },
	{ value: 'be', label: 'Беларуская' },
	{ value: 'bg', label: 'Български' },
	{ value: 'mk', label: 'Македонски' },
	{ value: 'mn', label: 'Монгол' },
	{ value: 'ru', label: 'Русский' },
	{ value: 'sr', label: 'Српски' },
	{ value: 'uk', label: 'Українська' },
	{ value: 'kk', label: 'Қазақша' },
	{ value: 'he', label: 'עברית' },
	{ value: 'ug', label: 'ئۇيغۇرچە' },
	{ value: 'ar', label: 'العربية' },
	{ value: 'fa', label: 'فارسی' },
	{ value: 'hi', label: 'हिन्दी' },
	{ value: 'bn', label: 'বাংলা' },
	{ value: 'pa', label: 'ਪੰਜਾਬੀ' },
	{ value: 'ta', label: 'தமிழ்' },
	{ value: 'te', label: 'తెలుగు' },
	{ value: 'kn', label: 'ಕನ್ನಡ' },
	{ value: 'ml', label: 'മലയാളം' },
	{ value: 'si', label: 'සිංහල' },
	{ value: 'th', label: 'ไทย' },
	{ value: 'zh', label: '中文' },
	{ value: 'zh-Hant', label: '中文 (繁體)' },
	{ value: 'ja', label: '日本語' },
	{ value: 'yue-CN', label: '粤语 (简体)' },
	{ value: 'yue', label: '粵語' },
	{ value: 'yue-HK', label: '粵語 (繁體)' },
	{ value: 'ko', label: '한국어' }
];

export const getNextUpCountdownStyleOptions = () => [
	{ value: 'progressBar', label: $L('Progress Bar') },
	{ value: 'timer', label: $L('Timer') },
	{ value: 'both', label: $L('Both') },
	{ value: 'none', label: $L('None') }
];

export const getStillWatchingBehaviorOptions = () => [
	{ value: 'disabled', label: $L('Off') },
	{ value: 'short_', label: $L('2 episodes') },
	{ value: 'medium', label: $L('3 episodes') },
	{ value: 'long_', label: $L('5 episodes') },
	{ value: 'veryLong', label: $L('8 episodes') }
];

// Built from the lists the formatter switches on, so nothing can be offered here that
// renders as nothing. A value with no label of its own is left out rather than shown
// under someone else's.
const PLAYBACK_TIME_LABELS = {
	none: () => $L('Hidden'),
	elapsed: () => $L('Time elapsed'),
	totalDuration: () => $L('Total duration'),
	timeRemaining: () => $L('Time remaining'),
	endsAt: () => $L('Ends at')
};

const playbackTimeOptions = (values) => values
	.filter((value) => PLAYBACK_TIME_LABELS[value])
	.map((value) => ({ value, label: PLAYBACK_TIME_LABELS[value]() }));

export const getPlaybackTimeSlotOptions = () => playbackTimeOptions(PLAYBACK_TIME_SLOTS);

export const getPlaybackTimeDisplayOptions = () => playbackTimeOptions(PLAYBACK_TIME_DISPLAYS);

export const getMediaSegmentActionOptions = () => [
	{ value: 'ask', label: $L('Ask to Skip') },
	{ value: 'auto', label: $L('Auto Skip') },
	{ value: 'none', label: $L("Don't Skip") }
];

export const getSeasonalThemeOptions = () => [
	{ value: 'none', label: $L('None') },
	{ value: 'winter', label: $L('Winter') },
	{ value: 'spring', label: $L('Spring') },
	{ value: 'summer', label: $L('Summer') },
	{ value: 'fall', label: $L('Fall') },
	{ value: 'halloween', label: $L('Halloween') }
];

export const getAccentColorOptions = () => [
	{ value: '', label: $L('Theme Default') },
	{ value: '#ffffff', label: $L('White') },
	{ value: '#000000', label: $L('Black') },
	{ value: '#808080', label: $L('Gray') },
	{ value: '#003366', label: $L('Dark Blue') },
	{ value: '#6a0dad', label: $L('Purple') },
	{ value: '#008080', label: $L('Teal') },
	{ value: '#000080', label: $L('Navy') },
	{ value: '#36454f', label: $L('Charcoal') },
	{ value: '#8b4513', label: $L('Brown') },
	{ value: '#8b0000', label: $L('Dark Red') },
	{ value: '#006400', label: $L('Dark Green') },
	{ value: '#708090', label: $L('Slate') },
	{ value: '#4b0082', label: $L('Indigo') },
	{ value: '#00a4dc', label: $L('Moonfin Cyan') },
	{ value: '#ff2e92', label: $L('Neon Magenta') }
];

// The color the navigation and media bar surfaces tint themselves with.
export const getOverlayColorOptions = () => [
	{ value: 'gray', label: $L('Gray') },
	{ value: 'black', label: $L('Black') },
	{ value: 'dark_blue', label: $L('Dark Blue') },
	{ value: 'purple', label: $L('Purple') },
	{ value: 'teal', label: $L('Teal') },
	{ value: 'navy', label: $L('Navy') },
	{ value: 'charcoal', label: $L('Charcoal') },
	{ value: 'brown', label: $L('Brown') },
	{ value: 'dark_red', label: $L('Dark Red') },
	{ value: 'dark_green', label: $L('Dark Green') },
	{ value: 'slate', label: $L('Slate') },
	{ value: 'indigo', label: $L('Indigo') },
	{ value: 'moonfinCyan', label: $L('Moonfin Cyan') },
	{ value: 'neonPulseMagenta', label: $L('Neon Magenta') }
];

export const getAgeRatingOptions = () => [
	{ value: 0, label: $L('G') },
	{ value: 7, label: $L('PG') },
	{ value: 13, label: $L('PG-13') },
	{ value: 17, label: $L('R') },
	{ value: 18, label: $L('NC-17') }
];

export const getLabel = (options, value, fallback) => {
	const option = options.find((o) => o.value === value);
	return option?.label || fallback;
};

export const getEnabledRatingSourcesSummary = (sources) => {
	const enabled = Array.isArray(sources) ? sources : [];
	if (enabled.length === 0) return $L('None');
	return getRatingSourceOptions()
		.filter((option) => enabled.includes(option.value))
		.map((option) => option.label)
		.join(', ');
};

export const getRecentlyReleasedSeriesTypeOptions = () => [
	{ value: 'series', label: $L('Series') },
	{ value: 'season', label: $L('Season') },
	{ value: 'episode', label: $L('Episode') }
];
