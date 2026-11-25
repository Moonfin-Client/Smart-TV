// Moonbase settings sync. Synced keys are pulled from the Moonfin plugin's profile envelope and
// pushed back to the active profile on every non-silent change (see the onChange at the end).
import { getFromStorage, saveToStorage } from '../services/storage.js'
import { getMoonfinResolvedProfile, getMoonfinSettings, saveMoonfinProfile, moonfinPing } from '../services/seerrApi.js'
import { getServerUrl, getApiKey, getServerType, getAuthHeader } from '../services/jellyfinApi.js'
import serverLogger from '../services/serverLogger.js'
import { defaultSettings } from '../context/defaultSettings.js'
import { normalizeRatingSources, ratingSourcesToServer } from '../utils/ratingSources.js'
import { SEASONAL_DENSITIES, normalizeSeasonalTheme } from '../utils/seasonalEffects.js'
import { normalizeSeasonalHiddenHolidays, normalizeSeasonalRowCountry } from '../utils/seasonalRow.js'
import { sharePending } from '../utils/sharePending.js'
import { isPlexServer } from '../utils/plexUrls.js'
import { isValidHexColor } from '../theme/themeSpec.js'
import { LEGACY_MEDIA_BAR_SOURCES, MEDIA_BAR_SOURCES, NEW_MOVIE_DAYS, NEW_RELEASE_DAYS } from '../utils/mediaBarNewRelease.js'
import { DATE_FORMATS } from '../utils/dateFormat.js'
import { SUBTITLE_FONTS } from '../services/subtitleFonts.js'
import {
  hasSeenServerLayout,
  homeRowImageTypesFromServer,
  homeRowImageTypesToServer,
  homeRowsFromProfile,
  rowImageTypeFromServer,
  homeRowsToRowOrder,
  homeRowsToSections,
} from '../utils/homeLayout.js'
import * as settings from './settings.js'
import { SETUP_QUESTION_KEYS, noteAnsweredSettings } from '../utils/setupWizardGate.js'
import { POSITION_LAYOUT, SIZE_LAYOUT, SPEED_MULTIPLIER } from '../ui/components/shell/loading/layout.js'

// The loading animation's choices. Sizes, speeds and positions are the keys of its layout tables.
const LOADING_IMAGES = ['none', 'moonfinLogo', 'spinner', 'runner', 'moonPhases', 'moonfinPhases', 'neonfinPhases']
const LOADING_SIZES = Object.keys(SIZE_LAYOUT)
const LOADING_SPEEDS = Object.keys(SPEED_MULTIPLIER)
const LOADING_POSITIONS = Object.keys(POSITION_LAYOUT)

const SERVER_TO_LOCAL = {
  mediaBarMode: 'featuredBarStyle',
  mediaBarItemCount: 'featuredItemCount',
  mediaBarTrailerPreview: 'featuredTrailerPreview',
  mediaBarAutoAdvance: 'autoAdvance',
  mediaBarIntervalMs: 'autoAdvanceInterval',
  mediaBarOpacity: 'mediaBarOverlayOpacity',
  mediaBarContentType: 'featuredContentType',
  mediaBarTrailerAudio: 'featuredTrailerMuted',
  mediaBarExcludedGenres: 'excludedGenres',
  enableMultiServerLibraries: 'unifiedLibraryMode',
  seasonalSurprise: 'seasonalTheme',
  detailsScreenBlur: 'backdropBlurDetail',
  detailsBackdropBlur: 'backdropBlurDetail',
  browsingBlur: 'backdropBlurHome',
  homeBackdropEnabled: 'showHomeBackdrop',
  use24HourClock: 'clockDisplay',
  focusColor: 'focusBorderColor',
  cardFocusExpansion: 'cardFocusZoom',
  watchedIndicator: 'watchedIndicatorBehavior',
  posterSize: 'homeRowsPosterSize',
  homeImageUseSeriesImage: 'useSeriesThumbnails',
  mdblistShowRatingNames: 'showRatingLabels',
  mdblistShowRatingBadges: 'showRatingBadges',
  homeRowsMdblistShowRatingNames: 'homeRowsShowRatingLabels',
  homeRowsMdblistShowRatingBadges: 'homeRowsShowRatingBadges',
  mediaBarMdblistShowRatingNames: 'mediaBarShowRatingLabels',
  mediaBarMdblistShowRatingBadges: 'mediaBarShowRatingBadges',
  languageOverride: 'uiLanguage',
  syncPlayEnabled: 'syncplayEnabled',
  syncPlayAutoOpen: 'syncplayAutoOpen',
  clockBehavior: 'showClock',
  homeRowInfoOverlay: 'homeRowOverlay',
  autoplayNextEpisode: 'autoPlay',
  mediaSegmentCountdown: 'nextUpCountdownStyle',
  defaultAudioLanguage: 'audioLanguage',
  defaultSubtitleLanguage: 'subtitleLanguage',
  subtitlesTextWeight: 'subtitleBold',
  subtitlesHdrTextWeight: 'subtitleBoldHdr',
  subtitlesStrokeWidth: 'subtitleStrokeWidth',
  subtitlesShadow: 'subtitleDropShadow',
  subtitlesShadowIntensity: 'subtitleDropShadowIntensity',
  subtitlesShadowOffset: 'subtitleDropShadowOffset',
  subtitlesShadowBlur: 'subtitleDropShadowBlur',
  subtitlesFont: 'subtitleFont',
  unpauseRewindDuration: 'unpauseRewind',
  confirmExit: 'exitConfirmation',
  DetailMetadataOrderTv: 'detailMetadataOrderTv',
  HiddenDetailMetadataTv: 'hiddenDetailMetadataTv',
  HiddenDetailSectionsTv: 'hiddenDetailSectionsTv',
}
const LOCAL_TO_SERVER = Object.fromEntries(Object.entries(SERVER_TO_LOCAL).map(([s, l]) => [l, s]))

// Synced values are all JSON, so comparing structure is enough. Key order and webOS's _id don't count.
const sameSyncedValue = (left, right) => {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const keys = Object.keys(left).filter((key) => key !== '_id')
  if (keys.length !== Object.keys(right).filter((key) => key !== '_id').length) return false
  return keys.every((key) => sameSyncedValue(left[key], right[key]))
}

const normalizeHomeRowsStyle = (value) => {
  if (value === 'classic') return 'v1'
  if (value === 'modern') return 'v2'
  return value === 'v1' || value === 'v2' || value === 'carousel' ? value : 'v2'
}

const DETAIL_STYLE_NAMES = { v1: 'classic', v2: 'modern', v3: 'spotlight', v4: 'nouveau', v5: 'minimalist', v6: 'stage', v7: 'premiere', v8: 'quickLook', v9: 'frost' }
const detailStyleFromServer = (value) =>
  Object.prototype.hasOwnProperty.call(DETAIL_STYLE_NAMES, value)
    ? value
    : Object.keys(DETAIL_STYLE_NAMES).find((key) => DETAIL_STYLE_NAMES[key] === value)
const normalizeDetailScreenStyle = (value) => detailStyleFromServer(value) || defaultSettings.detailScreenStyle

const normalizeGuid = (id) => {
  if (!id || typeof id !== 'string') return id
  const raw = id.replace(/-/g, '')
  if (raw.length !== 32) return id
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}
const normalizeGuidArray = (arr) => (Array.isArray(arr) ? arr.map(normalizeGuid) : arr)

// This app says tv where the other clients say tvshows.
const CONTENT_TYPE_TO_SERVER = { both: 'both', movies: 'movies', tv: 'tvshows' }
const CONTENT_TYPE_FROM_SERVER = Object.fromEntries(Object.entries(CONTENT_TYPE_TO_SERVER).map(([l, s]) => [s, l]))

// Above this an auto advance interval has to be milliseconds, since its slider stops at 20 seconds.
const MIN_INTERVAL_MS = 100
const secondsToMs = (v) => (typeof v === 'number' ? Math.round(v * 1000) : undefined)
const msToSeconds = (v) => (typeof v === 'number' ? Math.round(v / 1000) : undefined)

// A choice this app doesn't offer is left out, so the one already picked stays.
const oneOf = (values) => ({ fromServer: (v) => (values.includes(v) ? v : undefined) })

const POSTER_SIZES_TO_SERVER = { default: 'medium', xlarge: 'extraLarge' }
const POSTER_SIZES_FROM_SERVER = { medium: 'default', extraLarge: 'xlarge' }
const posterSizeFromServer = oneOf(['small', 'default', 'large', 'xlarge', 'grandparents']).fromServer
const LIBRARY_POSTER_SIZES = ['small', 'medium', 'large', 'extraLarge']

// The other clients sync the focus color by name and this app keeps the hex it stands for.
const FOCUS_COLORS = {
  white: '#ffffff', black: '#000000', gray: '#808080', darkBlue: '#003366', purple: '#6a0dad',
  teal: '#008080', navy: '#000080', charcoal: '#36454f', brown: '#8b4513', darkRed: '#8b0000',
  darkGreen: '#006400', slate: '#708090', indigo: '#4b0082', moonfinCyan: '#00a4dc',
  neonPulseMagenta: '#ff2e92', eightBitGold: '#ffcd75',
}
const FOCUS_COLOR_NAMES = Object.keys(FOCUS_COLORS)

// The plugin's admin defaults store an unset list as empty, which would hide every rating.
const surfaceRatingSources = {
  toServer: ratingSourcesToServer,
  fromServer: (v) => (Array.isArray(v) && v.length === 0 ? undefined : normalizeRatingSources(v)),
}

const subtitleWeight = { toServer: (v) => (v ? 700 : 400), fromServer: (v) => v >= 600 }

const VALUE_CONVERSIONS = {
  watchPartyService: oneOf(['moonbase', 'syncplay']),
  homeRowsPosterSize: {
    toServer: (v) => POSTER_SIZES_TO_SERVER[v] || v,
    fromServer: (v) => posterSizeFromServer(POSTER_SIZES_FROM_SERVER[v] || v),
  },
  clockDisplay: { toServer: (v) => v === '24-hour', fromServer: (v) => (v ? '24-hour' : '12-hour') },
  dateFormat: oneOf(DATE_FORMATS),
  focusBorderColor: {
    toServer: (v) => (v ? FOCUS_COLOR_NAMES.find((name) => FOCUS_COLORS[name] === v.toLowerCase()) : ''),
    fromServer: (v) => {
      if (v === '' || isValidHexColor(v)) return v
      const name = FOCUS_COLOR_NAMES.find((key) => key.toLowerCase() === String(v).toLowerCase())
      return name && FOCUS_COLORS[name]
    },
  },
  featuredTrailerMuted: { toServer: (v) => !v, fromServer: (v) => !v },
  mediaBarLibraryIds: { fromServer: normalizeGuidArray },
  mediaBarCollectionIds: { fromServer: normalizeGuidArray },
  screensaverLibraryIds: { fromServer: normalizeGuidArray },
  screensaverCollectionIds: { fromServer: normalizeGuidArray },
  featuredContentType: { toServer: (v) => CONTENT_TYPE_TO_SERVER[v], fromServer: (v) => CONTENT_TYPE_FROM_SERVER[v] },
  mediaBarSourceType: {
    fromServer: (v) => (MEDIA_BAR_SOURCES.includes(v) ? v : LEGACY_MEDIA_BAR_SOURCES.includes(v) ? 'random' : undefined),
  },
  mediaBarNewReleaseDays: oneOf(NEW_RELEASE_DAYS),
  mediaBarNewMovieDays: oneOf(NEW_MOVIE_DAYS),
  liveTvChannelSortBy: { fromServer: (v) => (['number', 'name', 'favoritesFirst'].includes(v) ? v : undefined) },
  loadingAnimationImage: oneOf(LOADING_IMAGES),
  loadingAnimationSize: oneOf(LOADING_SIZES),
  loadingAnimationPosition: oneOf(LOADING_POSITIONS),
  loadingAnimationSpeed: oneOf(LOADING_SPEEDS),
  seasonalTheme: { fromServer: normalizeSeasonalTheme },
  seasonalDensity: oneOf(SEASONAL_DENSITIES),
  libraryStyle: oneOf(['classic', 'modern', 'docked']),
  libraryPosterSize: oneOf(LIBRARY_POSTER_SIZES),
  playlistPosterSize: oneOf(LIBRARY_POSTER_SIZES),
  bookLibraryStyle: oneOf(['classic', 'readingRoom', 'bookstore']),
  musicLibraryStyle: oneOf(['classic', 'quickAccess', 'immersive']),
  keyboardStyle: oneOf(['native', 'classic', 'glass', 'docked']),
  seerrBadgeStyle: oneOf(['badge', 'banner']),
  seasonalRowCountry: { fromServer: normalizeSeasonalRowCountry },
  seasonalRowHiddenHolidays: { fromServer: normalizeSeasonalHiddenHolidays },
  screensaverContentType: { toServer: (v) => CONTENT_TYPE_TO_SERVER[v], fromServer: (v) => CONTENT_TYPE_FROM_SERVER[v] },
  // A toggle here and a three way choice elsewhere. Anything but "never" shows a clock.
  showClock: { toServer: (v) => (v ? 'always' : 'never'), fromServer: (v) => v !== 'never' },
  screensaverMode: { fromServer: (v) => (v === 'off' ? undefined : v) },
  nextUpTimeout: { toServer: secondsToMs, fromServer: msToSeconds },
  // Both sides label an empty preference Auto, but the other clients store the word.
  audioLanguage: { toServer: (v) => (v === '' ? 'auto' : v), fromServer: (v) => (v === 'auto' ? '' : v) },
  subtitleBold: subtitleWeight,
  subtitleBoldHdr: subtitleWeight,
  subtitleFont: oneOf(['', ...SUBTITLE_FONTS.map((font) => font.family)]),
  // This app predates the foreign mode and calls the flagged one default.
  subtitleMode: { toServer: (v) => (v === 'default' ? 'flagged' : v), fromServer: (v) => (v === 'flagged' ? 'default' : v) },
  unpauseRewind: { toServer: secondsToMs, fromServer: msToSeconds },
  autoAdvanceInterval: {
    toServer: secondsToMs,
    // A small number is the seconds an older build pushed before this was converted.
    fromServer: (v) => (typeof v === 'number' && v < MIN_INTERVAL_MS ? v : msToSeconds(v)),
  },
  mdblistRatingSources: { toServer: ratingSourcesToServer, fromServer: normalizeRatingSources },
  homeRowsMdblistRatingSources: surfaceRatingSources,
  mediaBarMdblistRatingSources: surfaceRatingSources,
  homeRowImageTypes: { toServer: homeRowImageTypesToServer, fromServer: homeRowImageTypesFromServer },
  detailScreenStyle: { toServer: (v) => DETAIL_STYLE_NAMES[v], fromServer: detailStyleFromServer },
  // homeRows is missing on purpose. The layout is two server fields that move together.
}

export const SYNCABLE_KEYS = [
  'showShuffleButton', 'shuffleContentType', 'showGenresButton',
  'showFavoritesButton', 'showLiveTvButton', 'showLibrariesInToolbar', 'showLibrariesIndividually',
  'mergeContinueWatchingNextUp',
  'continueWatchingDefaultAction',
  'nextUpMaxDays',
  'hiddenContinueWatchingItems', 'hiddenNextUpSeries',
  'mdblistEnabled', 'mdblistRatingSources', 'tmdbEpisodeRatingsEnabled',
  'mdblistWatchingNowEnabled',
  'imdbTop250MoviesEnabled', 'imdbTop250TvShowsEnabled', 'imdbMostPopularMoviesEnabled',
  'imdbMostPopularTvShowsEnabled', 'imdbLowestRatedMoviesEnabled', 'imdbTopEnglishMoviesEnabled',
  'imdbRowsSortBy', 'imdbRowsSortOrder', 'tmdbRowsSortBy', 'tmdbRowsSortOrder', 'seerrRowsSortBy', 'seerrRowsSortOrder',
  'sinceYouWatchedSource', 'sinceYouWatchedSourceItem', 'sinceYouWatchedSourceType', 'sinceYouWatchedIncludeWatched',
  'rewatchIncludeMovies', 'rewatchIncludeShows', 'rewatchIncludeCollections', 'rewatchSortBy',
  'navbarPosition', 'topNavbarStyle', 'sidebarStyle', 'featuredBarStyle', 'mediaBarRowPeek', 'featuredContentType', 'featuredItemCount',
  'featuredTrailerPreview', 'featuredTrailerMuted', 'trailerVolume', 'mediaBarTrailerCaptions', 'unifiedLibraryMode', 'mergeLibrariesByType', 'seasonalTheme', 'seasonalDensity', 'seasonalFollower',
  'seasonalRowEnabled', 'seasonalRowCountry', 'seasonalRowHiddenHolidays', 'seasonalRowAllYear',
  'visualTheme', 'customThemeId',
  'showRatingLabels',
  'showRatingBadges',
  'homeRowsMdblistEnabled', 'homeRowsMdblistRatingSources', 'homeRowsTmdbEpisodeRatingsEnabled',
  'homeRowsShowRatingLabels', 'homeRowsShowRatingBadges',
  'mediaBarMdblistEnabled', 'mediaBarMdblistRatingSources', 'mediaBarShowRatingLabels', 'mediaBarShowRatingBadges',
  'themeMusicEnabled', 'themeMusicVolume', 'themeMusicOnHomeRows',
  'homeRowsImageType', 'homeRowImageTypes', 'showClock', 'clockDisplay', 'dateFormat',
  'homeRowOverlay',
  'excludedGenres',
  'autoAdvance', 'autoAdvanceInterval',
  'displayFavoritesRows', 'displayCollectionsRows', 'displayGenresRows', 'displayPlaylistsRows',
  'displayAudioRows', 'displayRewatchRow', 'playlistsRowShowEpisodes',
  'favoritesRowSortBy', 'collectionsRowSortBy', 'genresRowSortBy', 'genresRowItemFilter', 'collectionsRowShowEpisodes',
  'stillWatchingBehavior', 'watchedIndicatorBehavior', 'showPosterLabels',
  'playbackTimeAboveLeft', 'playbackTimeAboveCenter', 'playbackTimeAboveRight',
  'playbackTimeBelowLeft', 'playbackTimeBelowCenter', 'playbackTimeBelowRight',
  'musicPlaybackTimeDisplay', 'liveTvChannelSortBy',
  'autoPlay', 'nextUpBehavior', 'nextUpTimeout', 'nextUpCountdownStyle',
  'replaceSkipOutroWithNextUp',
  'showHomeBackdrop', 'homeBackdropStyle', 'detailsBackdropEnabled', 'backdropBlurHome', 'backdropBlurDetail',
  'mediaBarSourceType', 'mediaBarLibraryIds', 'mediaBarCollectionIds', 'mediaBarExternalLists',
  'mediaBarNewReleaseBanner', 'mediaBarNewReleaseDays', 'mediaBarNewReleaseKinds', 'mediaBarNewMovieDays', 'mediaBarNewMovieDetail',
  'mediaBarOverlayColor', 'mediaBarOverlayOpacity',
  'homeRows', 'homeRowsStyle', 'modernCardsOnMyMediaRow', 'detailScreenStyle', 'detailExpandedTabs', 'fullScreenRows', 'homeRowsPosterSize', 'useSeriesThumbnails',
  'episodePreviewEnabled', 'mediaPreviewMode', 'previewAudioEnabled', 'previewVolume',
  'hideDetailsMediaDescription', 'detailUseSeriesThumbnails', 'hideHomeMediaDescription',
  'hideHomeWatchProgress', 'hideHomeUnwatchedCount',
  'personPageSortOption', 'personPageGroupItems',
  'personalRatingStyle', 'recentlyReleasedSeriesType', 'mergeRecentRowsByType', 'hideWatchedInRecentRows', 'playlistsGroupByType', 'groupItemsIntoCollections',
  'useDetailedSubHeadings', 'showMediaDetailsOnLibraryPage', 'libraryCardTitles', 'hideBackdropsInLibraries', 'hideLibraryWatchProgress', 'hideLibraryUnwatchedCount', 'libraryStyle', 'bookLibraryStyle', 'showBookDiscoverTab', 'bookFoldersAsSeries', 'musicLibraryStyle',
  'libraryPosterSize', 'playlistPosterSize',
  'keyboardStyle',
  'syncplayEnabled', 'syncplayAutoOpen',
  'showSyncPlayButton',
  'watchPartyService', 'watchPartyChatOverlay', 'watchPartyAlerts',
  'syncPlayAdvancedCorrectionEnabled', 'syncPlayEnableSyncCorrection',
  'syncPlayUseSkipToSync', 'syncPlayMinDelaySkipToSync', 'syncPlayExtraTimeOffset',
  'videoStartDelay', 'cinemaModeEnabled', 'cinemaModeEpisodesEnabled', 'cinemaModeSkipEnabled',
  'audioLanguage', 'fallbackAudioLanguage', 'preferDefaultAudioTrack', 'preferAudioDescription',
  'subtitleLanguage', 'fallbackSubtitleLanguage', 'preferSdhSubtitles', 'preferTextSubtitles', 'preferExternalSubtitles', 'subtitleMode',
  'subtitleBold', 'subtitleBoldHdr', 'subtitleStrokeWidth', 'subtitleDropShadow', 'subtitleDropShadowIntensity',
  'subtitleDropShadowOffset', 'subtitleDropShadowBlur', 'subtitleFont',
  'assDirectPlay',
  'resumeSubtractDuration', 'unpauseRewind', 'skipBackLength', 'skipForwardLength', 'showChapterMarkers',
  'controlsHideDelay', 'hdrControlsDimming',
  'maxVideoResolution', 'playerZoomMode', 'mediaSegmentAutoHide',
  'exitConfirmation',
  'diagnosticLoggingEnabled',
  'uiLanguage',
  'mergeRadarrSonarrCalendars',
  'radarrCalendarShowCinema', 'radarrCalendarShowDigital', 'radarrCalendarShowPhysical',
  'radarrCalendarShowDate', 'sonarrCalendarShowDate', 'sonarrCalendarShowEpisodeInfo',
  'radarrCalendarHideDownloaded', 'sonarrCalendarHideDownloaded',
  'showSeerrButton', 'seerrShowMissingCollectionItems', 'showSeerrAvailabilityBadges', 'seerrBadgeStyle',
  'showCalendarButton', 'calendarStyle', 'calendarWeekStart', 'calendarScope', 'calendarShowEpisodes', 'calendarShowMovies',
  'calendarLibraryIds', 'calendarIncludeUnmonitored', 'calendarShowSpecials', 'calendarShowBadges', 'calendarColorBy',
  'calendarImageType', 'calendarSpoilerSafe', 'calendarSelectAction', 'calendarRequestButton', 'calendarRowSeeAll',
  'showNextAirDate',
  'showServerMessagesButton',
  'screensaverMode', 'screensaverClockMode',
  'screensaverBackdrop', 'screensaverComponent', 'screensaverMovement',
  'screensaverPosition', 'screensaverSize', 'screensaverContentType',
  'screensaverLibraryIds', 'screensaverCollectionIds', 'screensaverExcludedGenres',
  'screensaverDuringAudio', 'sleepAfterIdle',
  'loadingAnimationImage', 'loadingAnimationSize', 'loadingAnimationPosition', 'loadingAnimationSpeed',
  'showLoadingAnimationText',
  'navbarAlwaysExpanded', 'oledMode', 'themeMusicLoop',
  // Settings this app has no screen for ride along so another client's value survives.
  'showCastButton',
  'classicHomeRowsPadding', 'modernHomeRowsPadding',
  'detailShowTechnicalDetails',
  'recommendationSystemSource', 'recommendationsApplyParentalRatingCap',
  'calendarReminders',
  'detailButtonsMaxVisible',
  'detailButtonOrderTv', 'hiddenDetailButtonsTv', 'osdButtonOrderTv', 'hiddenOsdButtonsTv',
  'detailMetadataOrderTv', 'hiddenDetailMetadataTv',
  'hiddenDetailSectionsTv',
  'focusBorderColor',
  'cardFocusZoom',
  'navbarOpacity',
  'navbarColor',
]

export const profileToLocal = (serverProfile) => {
  if (!serverProfile) return {}
  const local = {}
  for (const [key, value] of Object.entries(serverProfile)) {
    if (value === null || value === undefined) continue
    const localKey = SERVER_TO_LOCAL[key] || key
    if (SYNCABLE_KEYS.includes(localKey)) {
      const conv = VALUE_CONVERSIONS[localKey]
      const converted = conv && conv.fromServer ? conv.fromServer(value) : value
      // Undefined means the stored value makes no sense here, so keep what we have.
      if (converted === undefined) continue
      local[localKey] = converted
    }
  }
  // Continue Watching syncs on its own server key, while this app keeps it with the other rows.
  const continueWatching = rowImageTypeFromServer(serverProfile.homeImageTypeContinueWatching)
  if (continueWatching) local.homeRowImageTypes = { ...local.homeRowImageTypes, resume: continueWatching }
  // The TMDB and MDBList keys are read only and never pushed back.
  if (serverProfile.tmdbApiKey !== undefined && serverProfile.tmdbApiKey !== null) local.tmdbApiKey = serverProfile.tmdbApiKey
  if (serverProfile.mdblistApiKey !== undefined && serverProfile.mdblistApiKey !== null) local.mdblistApiKey = serverProfile.mdblistApiKey
  return local
}

// With a key list only those keys go out, since every value sent outranks the admin's later
// defaults. Without one the whole profile goes.
const localToProfile = (localSettings, keys) => {
  const wanted = keys ? new Set(keys) : null
  const profile = {}
  for (const key of SYNCABLE_KEYS) {
    if (key === 'homeRows') continue
    if (wanted && !wanted.has(key)) continue
    const value = localSettings[key]
    if (value === undefined || value === null) continue
    const serverKey = LOCAL_TO_SERVER[key] || key
    const conv = VALUE_CONVERSIONS[key]
    const converted = conv && conv.toServer ? conv.toServer(value) : value
    if (converted === undefined) continue
    profile[serverKey] = converted
  }
  // Sent even when unset, so a cleared Continue Watching doesn't come back from the server.
  if (profile.homeRowImageTypes !== undefined) {
    profile.homeImageTypeContinueWatching = localSettings.homeRowImageTypes.resume || ''
  }
  // Both layout fields or neither. homeRowOrder alone makes the server drop the stored
  // homeSections, and before we've read the server's layout we can't preserve its plugin rows.
  const sendsLayout = !wanted || wanted.has('homeRows')
  if (sendsLayout && Array.isArray(localSettings.homeRows) && hasSeenServerLayout()) {
    profile.homeSections = homeRowsToSections(localSettings.homeRows)
    profile.homeRowOrder = homeRowsToRowOrder(localSettings.homeRows)
  }
  return profile
}

const SYNC_PROFILES = ['global', 'desktop', 'mobile', 'tv']
const DEVICE_SYNC_PROFILE = 'tv'
export const activeSyncProfile = (syncProfile) => (SYNC_PROFILES.includes(syncProfile) ? syncProfile : DEVICE_SYNC_PROFILE)

// The active profile wins, then global, then the admin defaults.
const resolveFromEnvelope = (envelope, adminDefaults, profile) => {
  const active = activeSyncProfile(profile)
  const sources =
    active === 'global'
      ? [envelope && envelope.global, adminDefaults]
      : [envelope && envelope[active], envelope && envelope.global, adminDefaults]
  const layers = sources.map((source) => profileToLocal(source))
  const firstWith = (key) => layers.find((layer) => layer[key] !== undefined)

  const resolved = {}
  for (const key of SYNCABLE_KEYS) {
    const layer = firstWith(key)
    if (layer) resolved[key] = layer[key]
  }
  const firstStored = (key) => {
    const source = sources.find((s) => s && s[key] != null)
    return source ? source[key] : undefined
  }
  const rowImageTypes = profileToLocal({
    homeRowImageTypes: firstStored('homeRowImageTypes'),
    homeImageTypeContinueWatching: firstStored('homeImageTypeContinueWatching'),
  }).homeRowImageTypes
  if (rowImageTypes) resolved.homeRowImageTypes = rowImageTypes
  else delete resolved.homeRowImageTypes
  const tmdbLayer = firstWith('tmdbApiKey')
  if (tmdbLayer) resolved.tmdbApiKey = tmdbLayer.tmdbApiKey
  const mdblistLayer = firstWith('mdblistApiKey')
  if (mdblistLayer) resolved.mdblistApiKey = mdblistLayer.mdblistApiKey

  // The first profile with any layout supplies all of it.
  const enabledById = {
    seasonal: resolved.seasonalRowEnabled === true,
    mdblist_watching_now: resolved.mdblistWatchingNowEnabled === true,
  }
  let homeRows
  for (const source of sources) {
    homeRows = homeRowsFromProfile(source, enabledById)
    if (homeRows !== undefined) break
  }
  if (homeRows !== undefined) resolved.homeRows = homeRows
  return resolved
}

// A burst of changes goes out as one request a second later, carrying the newest values.
const PUSH_DEBOUNCE_MS = 1000
let pushTimer = null
let pendingPush = null
let inFlightPush = null
// Keys changed here that the server hasn't taken yet. A pull landing in between keeps them.
const unpushedKeys = new Set()
// Bumped when the marks are thrown away, so a late send leaves newer marks alone.
let markGeneration = 0
// A push sent while the login pull resolves would lay fresh-install defaults over the profile.
let holdPushesForLoginSync = false
let creds = null

const flushProfilePush = () => {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  if (!pendingPush) return inFlightPush || Promise.resolve()
  const { serverUrl, token, profile } = pendingPush
  pendingPush = null
  const sent = Array.from(unpushedKeys)
  if (sent.length === 0) return inFlightPush || Promise.resolve()
  const generation = markGeneration
  inFlightPush = saveMoonfinProfile(profile, localToProfile(settings.all(), sent), serverUrl, token)
    .then(() => {
      if (generation !== markGeneration) return
      sent.forEach((key) => unpushedKeys.delete(key))
    })
    .catch((e) => console.warn(`[settingsSync] pushing the ${profile} profile failed:`, e.message))
  return inFlightPush
}

const forgetUnpushedMarks = () => {
  unpushedKeys.clear()
  markGeneration += 1
}

// Settles even when the server is unreachable, so a reload after it always happens.
export const flushSettingsPush = (timeoutMs = 2000) =>
  Promise.race([
    Promise.resolve().then(flushProfilePush),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]).catch(() => {})

const noteChanged = (keys) => {
  const synced = keys.filter((key) => SYNCABLE_KEYS.includes(key))
  if (!synced.length || !settings.get('useMoonfinPlugin')) return
  const profile = activeSyncProfile(settings.get('syncProfile'))
  if (pendingPush && pendingPush.profile !== profile) {
    flushProfilePush()
    forgetUnpushedMarks()
  }
  synced.forEach((key) => unpushedKeys.add(key))
  if (!creds) return
  pendingPush = { serverUrl: creds.serverUrl, token: creds.token, profile }
  if (holdPushesForLoginSync) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(flushProfilePush, PUSH_DEBOUNCE_MS)
}

// Reads the plugin's profile and applies what changed. Only reads from the server.
const pullFromServer = async (serverUrl, token) => {
  try {
    creds = { serverUrl, token }
    let adminDefaults = null
    let pluginAnswered = false
    try {
      const ping = await moonfinPing(serverUrl, token)
      pluginAnswered = !!ping && ping.installed !== false && ping.settingsSyncEnabled !== false
      if (ping && ping.defaultSettings) adminDefaults = ping.defaultSettings
    } catch (e) {
      // the ping is optional
    }
    const serverData = await getMoonfinSettings(serverUrl, token)
    if (!serverData && !adminDefaults) return pluginAnswered ? 'empty' : 'unavailable'

    const resolved = resolveFromEnvelope(serverData, adminDefaults, settings.get('syncProfile'))
    const hasServerValues =
      resolved.tmdbApiKey !== undefined || resolved.mdblistApiKey !== undefined || SYNCABLE_KEYS.some((key) => resolved[key] !== undefined)
    if (!hasServerValues) return pluginAnswered ? 'empty' : 'unavailable'
    // A value the profile carries was chosen somewhere, so the setup wizard won't ask about it.
    noteAnsweredSettings(SETUP_QUESTION_KEYS.filter((key) => resolved[key] !== undefined))

    const prev = settings.all()
    const patch = {}
    for (const key of SYNCABLE_KEYS) {
      const incoming = key === 'homeRowImageTypes' && resolved[key] ? { ...prev[key], ...resolved[key] } : resolved[key]
      if (incoming === undefined || unpushedKeys.has(key) || sameSyncedValue(incoming, prev[key])) continue
      patch[key] = incoming
    }
    if (resolved.tmdbApiKey !== undefined && resolved.tmdbApiKey !== prev.tmdbApiKey) patch.tmdbApiKey = resolved.tmdbApiKey
    if (resolved.mdblistApiKey !== undefined && resolved.mdblistApiKey !== prev.mdblistApiKey) patch.mdblistApiKey = resolved.mdblistApiKey
    const homeRowsStyle = normalizeHomeRowsStyle('homeRowsStyle' in patch ? patch.homeRowsStyle : prev.homeRowsStyle)
    if (homeRowsStyle !== prev.homeRowsStyle) patch.homeRowsStyle = homeRowsStyle
    else delete patch.homeRowsStyle
    const detailScreenStyle = normalizeDetailScreenStyle('detailScreenStyle' in patch ? patch.detailScreenStyle : prev.detailScreenStyle)
    if (detailScreenStyle !== prev.detailScreenStyle) patch.detailScreenStyle = detailScreenStyle
    else delete patch.detailScreenStyle
    if (Object.keys(patch).length) settings.update(patch, { silent: true })
    return 'applied'
  } catch (e) {
    console.warn('[settingsSync] pull failed:', e.message)
    return 'error'
  }
}

const syncFromServer = sharePending((serverUrl, token) => `${serverUrl}|${token}`, pullFromServer)

// Tracks which servers went through the first plugin detection, so a server without the
// plugin isn't probed on every sign-in.
const PLUGIN_SYNC_INIT_KEY = 'pluginSyncInitialized'
const PLUGIN_SYNC_MARK = 2
const normalizeServerKey = (serverUrl) => (serverUrl || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase()

const isServerSyncInitialized = async (serverUrl) => {
  const key = normalizeServerKey(serverUrl)
  if (!key) return false
  const map = await getFromStorage(PLUGIN_SYNC_INIT_KEY)
  const mark = map && map[key]
  // A Plex server marked before Moonbase for Plex existed is looked at once more.
  return isPlexServer(serverUrl) ? mark === PLUGIN_SYNC_MARK : Boolean(mark)
}

const markServerSyncInitialized = async (serverUrl) => {
  const key = normalizeServerKey(serverUrl)
  if (!key) return
  const map = (await getFromStorage(PLUGIN_SYNC_INIT_KEY)) || {}
  if (map[key] === PLUGIN_SYNC_MARK) return
  map[key] = PLUGIN_SYNC_MARK
  await saveToStorage(PLUGIN_SYNC_INIT_KEY, map)
}

const running = {}

// The first time a server is seen it detects the plugin and, when it answers, turns sync on and
// pulls. After that it pulls only while sync stays on.
export const syncOnLogin = async (serverUrl = getServerUrl(), token = getApiKey()) => {
  if (!serverUrl || !token) return
  if (!creds || creds.serverUrl !== serverUrl) forgetUnpushedMarks()
  creds = { serverUrl, token }
  const key = normalizeServerKey(serverUrl)
  if (!key || running[key]) return
  running[key] = true
  holdPushesForLoginSync = true
  try {
    if (await isServerSyncInitialized(serverUrl)) {
      if (settings.get('useMoonfinPlugin')) await syncFromServer(serverUrl, token)
      return
    }
    const outcome = await syncFromServer(serverUrl, token)
    if (outcome === 'applied' || outcome === 'empty') {
      settings.set('useMoonfinPlugin', true, { silent: true })
      await markServerSyncInitialized(serverUrl)
    } else if (outcome === 'unavailable') {
      await markServerSyncInitialized(serverUrl)
    }
  } finally {
    running[key] = false
    holdPushesForLoginSync = false
    // Anything queued while the pull ran goes out now with the merged settings.
    if (pendingPush && !pushTimer) pushTimer = setTimeout(flushProfilePush, PUSH_DEBOUNCE_MS)
    applyLogging()
  }
}

const currentCreds = () => creds || { serverUrl: getServerUrl(), token: getApiKey() }

// Picking a profile only moves where automatic sync points. A change still waiting goes to the old
// profile first, and nothing is fetched, so the device keeps what it shows until the next sync or
// a Load.
export const selectSyncProfile = (profile) => {
  if (!SYNC_PROFILES.includes(profile)) return
  if (activeSyncProfile(settings.get('syncProfile')) !== profile) {
    flushProfilePush()
    forgetUnpushedMarks()
  }
  settings.set('syncProfile', profile === DEVICE_SYNC_PROFILE ? '' : profile)
}

// Load and Save on the profile sync follows. Load lays the server's profile over this device
// without sending anything back, so a queued push of the values it replaces is dropped. Resolves
// false when the profile holds nothing.
// shortcut: no Reset, which deletes the profile on the server. Add resetProfile if it's wanted.
export const loadSyncProfile = async () => {
  const c = currentCreds()
  const resolved = await getMoonfinResolvedProfile(activeSyncProfile(settings.get('syncProfile')), c.serverUrl, c.token)
  if (!resolved) return false
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
  pendingPush = null
  forgetUnpushedMarks()
  const local = profileToLocal(resolved)
  const homeRows = homeRowsFromProfile(resolved, {
    seasonal: local.seasonalRowEnabled === true,
    mdblist_watching_now: local.mdblistWatchingNowEnabled === true,
  })
  if (homeRows !== undefined) local.homeRows = homeRows
  settings.update(local, { silent: true })
  applyLogging()
  return true
}

export const saveSyncProfile = () => {
  const c = currentCreds()
  return saveMoonfinProfile(activeSyncProfile(settings.get('syncProfile')), localToProfile(settings.all()), c.serverUrl, c.token)
}

// The logging switches reach the logger here rather than from the Settings screen, so one turned
// on survives a restart. Values pulled from the server arrive silently, so the login sync and a
// Load apply them too.
let loggerReady = false
const LOGGING_KEYS = ['serverLogging', 'diagnosticLoggingEnabled']
const applyLogging = () => {
  if (!loggerReady) {
    loggerReady = true
    serverLogger.init({
      getAuth: () => ({ serverUrl: getServerUrl(), accessToken: getApiKey(), serverType: getServerType(), authHeader: getAuthHeader() }),
    })
  }
  serverLogger.setEnabled(settings.get('serverLogging') === true)
  serverLogger.setRecording(settings.get('diagnosticLoggingEnabled') === true)
}

// Changes made anywhere in the app go out to the profile, values pulled from it don't.
settings.onChange((keys) => {
  noteChanged(keys)
  if (keys.some((k) => LOGGING_KEYS.includes(k))) applyLogging()
})
