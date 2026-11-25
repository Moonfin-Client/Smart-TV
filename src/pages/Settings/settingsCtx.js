// The context the settings schema resolves its rows with: the settings, what the device and
// server offer, and the actions a row's press calls. loadCtx reads what has to come from the
// server once Settings opens.
import $L from '../../services/i18n.js'
import * as settings from '../../state/settings.js'
import * as sync from '../../state/settingsSync.js'
import * as auth from '../../state/auth.js'
import { checkSeerr, seerrState } from '../../state/seerr.js'
import { saveToStorage } from '../../services/storage.js'
import { loadStrings } from '../../services/i18n.js'
import * as seerrApi from '../../services/seerrApi.js'
import { api, getApiKey, getAuthHeader, getServerType, getServerUrl, getUserId } from '../../services/jellyfinApi.js'
import { findPlexMoonbase, plexMoonbaseBase } from '../../services/plexMoonbase.js'
import { watchParty } from '../../services/siloWatchParty.js'
import { fetchWithTimeout } from '../../utils/fetchTimeout.js'
import { getDeviceCapabilities, getDeviceProfile, clearCapabilitiesCache } from '../../services/deviceProfile.js'
import { NOTIFICATION_PREF_DEFAULTS, loadNotificationPrefs, setNotificationPref, subscribeNotificationPrefs } from '../../services/notificationPrefs.js'
import { isTizen, isVega, isWebOS, isXbox } from '../../platform.js'
import { isSignInPinEnabled, signInPinFor } from '../../utils/signInPin.js'
import { beginRerun } from '../../utils/setupWizardGate.js'
import { bareId } from '../../utils/libraryScopeRules.js'
import { IMDB_PRESETS, TMDB_PRESETS } from '../../utils/externalHomeRows.js'
import { NEW_RELEASE_KINDS, newReleaseKindsOf } from '../../utils/mediaBarNewRelease.js'
import { canTranscodeAudioCodecAway } from '../../utils/deviceProfileTuning.js'
import { RATING_SETTING_KEYS, ratingKey } from '../../utils/ratingSources.js'
import { defaultSettings } from '../../context/defaultSettings.js'
import { getAvailableThemes } from '../../theme/themeRegistry.js'
import { activeThemeId } from '../../ui/theme.js'
import { SCHEMA_BY_KEY, resolve } from './settingsSchema.js'
import { LOADERS } from './screens/index.js'
import { getNewReleaseKindOptions, getSubtitleLanguageOptions, getTranscodeAudioCodecOptions } from './settingsOptions.js'
import { MAX_SUBTITLE_DOWNLOAD_LANGUAGES } from '../../ui/components/modals/remoteSubtitleUtils.js'

const pickedIds = (ids) => (Array.isArray(ids) ? ids.map(bareId).filter((id, i, all) => all.indexOf(id) === i) : [])
const asOptions = (items) => items.map((item) => ({ value: item.Id, label: item.Name }))
const listOf = (value) => (Array.isArray(value) ? value : [])
// A mixed library names no collection type, so the bar takes it for either kind. Folders and
// recordings name none either, so they go out by name.
const MEDIA_BAR_TYPES = ['movies', 'tvshows', '', 'mixed', 'unknown']
const isMediaBarLibrary = (lib) => {
  const name = String((lib && lib.Name) || '').trim().toLowerCase()
  if (name === 'folders' || name === 'recordings') return false
  return MEDIA_BAR_TYPES.indexOf(String((lib && lib.CollectionType) || '').trim().toLowerCase()) >= 0
}
const CALENDAR_LIBRARY_TYPES = ['movies', 'tvshows', 'mixed']

const loadGenreNames = async () => {
  const result = await api.getGenres()
  const names = []
  ;((result && result.Items) || []).forEach((item) => {
    const name = ((item && item.Name) || '').trim()
    if (name && names.indexOf(name) === -1) names.push(name)
  })
  return names
}

// A list that fails to load opens nothing.
const openWhenLoaded = async (page, load, checklistOf) => {
  let loaded
  try {
    loaded = await load()
  } catch (err) {
    return
  }
  page.openChecklist(checklistOf(loaded))
}

// Whether this viewer gets any poster labels here, so the switch shows only when it would do something.
const readPosterLabels = async () => {
  const type = getServerType()
  if (!getServerUrl() || (type !== 'jellyfin' && type !== 'emby' && type !== 'plex')) return false
  if (type === 'plex' && !(await findPlexMoonbase(getServerUrl(), getApiKey()))) return false
  const base = type === 'plex' ? plexMoonbaseBase(getServerUrl()) : getServerUrl()
  const response = await fetchWithTimeout(`${base}/Moonfin/PosterBadges/Items?profile=tv`, { headers: { Authorization: getAuthHeader() } }, 30000)
  if (!response.ok) return false
  const body = await response.json()
  return !!(body && body.enabled === true)
}

// What the context reads from the server, kept per page.
const blank = () => ({
  caps: null,
  serverVersion: null,
  seerr: seerrState(),
  accounts: [],
  activeKey: '',
  hasLiveTv: true,
  hasLibrary: false,
  libraries: [],
  calendarLibraries: [],
  notificationPrefs: NOTIFICATION_PREF_DEFAULTS,
  achievements: { available: false, socialAvailable: false },
  romm: null,
  watchParties: { moonbase: false, needsMoonbase: false, turnedOff: false },
  ratingsResetArmed: false,
})

const seerrCtx = (state) => ({
  isEnabled: !!state.enabled,
  isAuthenticated: !!state.authenticated,
  isMoonfin: true,
  variant: 'seerr',
  displayName: state.displayName,
  pluginInfo: state.pluginInfo,
  user: state.user,
  api: seerrApi,
})

export const loadCtx = (page) => {
  const data = page._ctxData || (page._ctxData = blank())
  const done = () => page.loaded++
  auth.loadServers().then(({ all, unique, active }) => {
    data.accounts = all
    data.active = active
    data.hasMultipleServers = unique.filter((entry) => entry.userCount > 0).length > 1
    done()
  })
  getDeviceCapabilities()
    .then((caps) => {
      data.caps = caps
      done()
    })
    .catch(() => {})
  api
    .getPublicInfo()
    .then((info) => {
      if (info && info.Version) {
        data.serverVersion = info.Version
        done()
      }
    })
    .catch(() => {})
  sync.syncOnLogin().catch(() => {})
  checkSeerr(false)
    .then((state) => {
      data.seerr = state
      page.$store.seerrAvailable = !!state.available
      page.$store.seerrName = state.displayName || 'Seerr'
      done()
    })
    .catch(() => {})
  api
    .getLiveTvChannels(0, 1)
    .then((res) => {
      data.hasLiveTv = !!(res && res.Items && res.Items.length)
      done()
    })
    .catch(() => {})
  Promise.resolve(api.getAllLibraries())
    .then((result) => {
      const items = (result && result.Items) || []
      data.libraries = items
      data.hasLibrary = items.some((lib) => ['movies', 'tvshows', 'music', 'books', 'audiobooks'].indexOf(String(lib.CollectionType || '').toLowerCase()) >= 0)
      data.calendarLibraries = items.filter((lib) => !lib.CollectionType || CALENDAR_LIBRARY_TYPES.indexOf(lib.CollectionType) >= 0)
      done()
    })
    .catch(() => {})
  const loadPrefs = () =>
    loadNotificationPrefs(getServerUrl(), getUserId())
      .then((prefs) => {
        data.notificationPrefs = prefs
        done()
      })
      .catch(() => {})
  loadPrefs()
  if (!page._prefsSub) page._prefsSub = subscribeNotificationPrefs(loadPrefs)
  readPosterLabels()
    .then((on) => {
      data.posterLabels = on
      done()
    })
    .catch(() => {})
  // What hosts parties here, which picks the Watch Parties rows.
  // Emby and Plex have no SyncPlay to fall back on, so they say what's missing or that it's off.
  const partyBackend = watchParty.backend()
  if (partyBackend) {
    Promise.all([watchParty.available(), watchParty.config()])
      .then(([available, config]) => {
        const onMoonbase = partyBackend === 'moonbase'
        data.watchParties = {
          moonbase: onMoonbase && !!available,
          needsMoonbase: onMoonbase && !config && getServerType() !== 'jellyfin',
          turnedOff: onMoonbase && !!config && config.enabled === false,
        }
        done()
      })
      .catch(() => {})
  }
  LOADERS.forEach((load) => {
    try {
      load(page, data, done)
    } catch (e) {
      console.warn('[Settings] loader failed', e)
    }
  })
}

let cacheKey = null
let cached = null

export const buildCtx = (page, s, version) => {
  const data = page._ctxData || (page._ctxData = blank())
  if (cached && cacheKey && cacheKey.s === s && cacheKey.v === version && cacheKey.page === page) return cached
  cacheKey = { s, v: version, page }
  const seerr = seerrCtx(data.seerr)
  const seerrLabel = seerr.isEnabled ? seerr.displayName || $L('Seerr') : $L('Seerr')
  const actions = makeActions(page, data)
  cached = {
    settings: s,
    capabilities: data.caps,
    seerr,
    achievements: data.achievements,
    romm: data.romm,
    seerrLabel,
    isSeerr: seerr.isEnabled,
    hasLiveTv: data.hasLiveTv,
    hasLibrary: data.hasLibrary,
    posterLabelsAvailable: !!(s.useMoonfinPlugin && data.posterLabels),
    serverType: getServerType(),
    isWebOS: isWebOS(),
    isTizen: isTizen(),
    isVega: isVega(),
    isXbox: isXbox(),
    consoleDolbyVision: !!(data.caps && data.caps.consoleDolbyVision),
    serverUrl: getServerUrl(),
    serverVersion: data.serverVersion,
    availableThemes: Object.values(getAvailableThemes()),
    activeThemeId: activeThemeId(s),
    ratingsResetArmed: data.ratingsResetArmed,
    signInPin: signInPinFor(s, getUserId()),
    calendarLibraries: data.calendarLibraries,
    watchParties: data.watchParties,
    notificationPrefs: data.notificationPrefs,
    accounts: data.accounts,
    activeServer: data.active,
    hasMultipleServers: !!data.hasMultipleServers,
    data,
    actions,
  }
  return cached
}

const makeActions = (page, data) => {
  const s = () => settings.all()
  const push = (view) => page.push(view)
  const checklist = (list) => page.openChecklist(list)
  return {
    setSetting: (key, value) => settings.set(key, value),
    setSettings: (patch) => settings.update(patch),
    // A row on one screen can open a screen that lives elsewhere in the schema.
    openScreen: (categoryId, subcategoryId, returnFocusTo) => {
      const sub = SCHEMA_BY_KEY[`${categoryId}.${subcategoryId}`]
      if (!sub) return
      push({ view: 'subcategory', categoryId, subcategoryId, label: resolve(sub.label, page.ctx), returnFocusTo })
    },
    openQrLink: (label, url, returnFocusTo) => push({ view: 'qrLink', label, url, returnFocusTo }),
    openThemes: () => push({ view: 'themes', returnFocusTo: 'setting-themeSelection', focusSid: 'theme-card-' + activeThemeId(s()) }),
    openThemeStore: () => push({ view: 'themeStore', returnFocusTo: 'setting-themeStore' }),
    openHomeRows: () => push({ view: 'homeRows', label: $L('Rows'), returnFocusTo: 'setting-homeRows' }),
    openDetailButtons: () => push({ view: 'buttonLayout', kind: 'detail', returnFocusTo: 'setting-detailButtons' }),
    openOsdButtons: () => push({ view: 'buttonLayout', kind: 'osd', returnFocusTo: 'setting-osdButtons' }),
    openDetailMetadata: () => push({ view: 'buttonLayout', kind: 'metadata', returnFocusTo: 'setting-detailMetadata' }),
    openDetailSections: () => push({ view: 'detailSections', returnFocusTo: 'setting-detailSections' }),
    openDiagnostics: () => push({ view: 'diagnostics', returnFocusTo: 'setting-diagnostics' }),
    // Turning the PIN off, changing it and removing it all take the current one first.
    toggleSignInPin: () =>
      push({ view: 'pinCode', purpose: isSignInPinEnabled(signInPinFor(s(), getUserId())) ? 'disable' : 'enable', returnFocusTo: 'setting-pinCodeProtection' }),
    changeSignInPin: () => push({ view: 'pinCode', purpose: 'change', returnFocusTo: 'setting-pinCode' }),
    removeSignInPin: () => push({ view: 'pinCode', purpose: 'remove', returnFocusTo: 'setting-removePin' }),
    openKidsMode: () => push({ view: 'kidsModeSet', returnFocusTo: 'setting-kidsMode' }),
    openLibraries: () => push({ view: 'libraries', returnFocusTo: 'setting-hideLibraries' }),
    openLibraryOrder: () => push({ view: 'libraryOrder', returnFocusTo: 'setting-libraryOrder' }),
    openParentalControls: () => push({ view: 'blockedRatings', returnFocusTo: 'setting-parentalControls' }),
    openRowImageTypes: () => push({ view: 'rowImageTypes', returnFocusTo: 'setting-rowImageTypes' }),
    openImdbLists: () => push({ view: 'imdbLists', returnFocusTo: 'setting-imdbLists' }),
    openSeasonalRow: () => push({ view: 'seasonalRow', returnFocusTo: 'setting-seasonalRow' }),
    openExternalTmdbLists: () => push({ view: 'externalTmdbLists', returnFocusTo: 'setting-externalTmdbLists' }),
    openExternalCalendars: () => push({ view: 'externalCalendars', returnFocusTo: 'setting-externalCalendars' }),
    openExternalCustomRows: () => push({ view: 'externalCustomRows', returnFocusTo: 'setting-externalCustomRows' }),
    openSeerrHomeRows: () => push({ view: 'seerrHomeRows', returnFocusTo: 'setting-seerrHomeRows' }),
    openRatingSources: (surface = '') =>
      push({ view: 'ratingSources', surface, returnFocusTo: `setting-${ratingKey(surface, 'ratingSources')}` }),
    // Covers every ratings setting, so one action puts the whole integration back the way it
    // shipped. It asks for a second press, and an armed reset left behind doesn't fire later.
    resetRatingsSettings: (surface = '') => {
      if (!data.ratingsResetArmed) {
        data.ratingsResetArmed = true
        page.refresh()
        return
      }
      data.ratingsResetArmed = false
      const reset = {}
      RATING_SETTING_KEYS.forEach((name) => {
        const key = ratingKey(surface, name)
        if (key in defaultSettings) reset[key] = Array.isArray(defaultSettings[key]) ? [...defaultSettings[key]] : defaultSettings[key]
      })
      settings.update(reset)
    },
    openSubtitleDownloadLanguages: () =>
      checklist({
        title: $L('Subtitle Download Languages'),
        options: getSubtitleLanguageOptions().filter((option) => option.value),
        picked: s().subtitleDownloadLanguages || [],
        max: MAX_SUBTITLE_DOWNLOAD_LANGUAGES,
        onSave: (picked) => settings.set('subtitleDownloadLanguages', picked),
        returnFocusTo: 'setting-subtitleDownloadLanguages',
      }),
    // Stored as a comma list in a set order, so the same picks always read the same.
    openNewReleaseKinds: () =>
      checklist({
        title: $L('Labels'),
        options: getNewReleaseKindOptions(),
        picked: newReleaseKindsOf(s().mediaBarNewReleaseKinds),
        onSave: (picked) => settings.set('mediaBarNewReleaseKinds', NEW_RELEASE_KINDS.filter((kind) => picked.indexOf(kind) >= 0).join(',')),
        returnFocusTo: 'setting-mediaBarNewReleaseKinds',
      }),
    // Only the codecs this device's transcode can turn into something else are offered.
    openTranscodeAudioCodecs: async () => {
      const profile = await getDeviceProfile(getServerType(), {}, api).catch(() => null)
      checklist({
        title: $L('Transcode Audio Codecs'),
        options: getTranscodeAudioCodecOptions().filter(({ value }) => !profile || canTranscodeAudioCodecAway(profile, value)),
        picked: s().transcodeAudioCodecs || [],
        onSave: (picked) => settings.set('transcodeAudioCodecs', picked),
        returnFocusTo: 'setting-transcodeAudioCodecs',
      })
    },
    openMediaBarLibraries: () =>
      openWhenLoaded(page, async () => (((await api.getAllLibraries()) || {}).Items || []).filter(isMediaBarLibrary), (libraries) => ({
        title: $L('Source Libraries'),
        options: asOptions(libraries),
        picked: pickedIds(s().mediaBarLibraryIds),
        sortByLabel: true,
        onSave: (picked) => settings.update({ mediaBarLibraryIds: picked }),
        returnFocusTo: 'setting-sourceLibraries',
      })),
    openMediaBarCollections: () =>
      openWhenLoaded(page, async () => ((await api.getCollections(500, 'SortName', 'Ascending')) || {}).Items || [], (collections) => ({
        title: $L('Source Collections'),
        options: asOptions(collections),
        picked: pickedIds(s().mediaBarCollectionIds),
        sortByLabel: true,
        onSave: (picked) => settings.update({ mediaBarCollectionIds: picked }),
        returnFocusTo: 'setting-sourceCollections',
      })),
    // The picks only say where the bar draws from, so saving them leaves the source type alone.
    openMediaBarExternalLists: () => {
      const tmdb = !!(data.seerr.pluginInfo && data.seerr.pluginInfo.tmdbAvailable === true)
      const lists = [
        ...IMDB_PRESETS.map((preset) => ({ Id: preset.type, Name: preset.title })),
        ...(tmdb ? TMDB_PRESETS.map((preset) => ({ Id: preset.id, Name: preset.title })) : []),
        ...listOf(s().customHomeRows).map((row) => ({ Id: row.id, Name: row.name })),
      ]
      checklist({
        title: $L('External Lists'),
        options: asOptions(lists),
        picked: listOf(s().mediaBarExternalLists),
        sortByLabel: true,
        onSave: (picked) => settings.update({ mediaBarExternalLists: picked }),
        returnFocusTo: 'setting-sourceExternalLists',
      })
    },
    // Earlier builds stored the names lowercased, so a stored name ticks the genre it matches.
    openExcludedGenres: () =>
      openWhenLoaded(page, loadGenreNames, (names) => ({
        title: $L('Excluded Genres'),
        options: names.map((name) => ({ value: name, label: name })),
        picked: listOf(s().excludedGenres).map((genre) => names.find((name) => name.toLowerCase() === String(genre).toLowerCase()) || genre),
        sortByLabel: true,
        onSave: (picked) => settings.update({ excludedGenres: picked }),
        returnFocusTo: 'setting-excludedGenres',
      })),
    openScreensaverLibraries: () =>
      openWhenLoaded(
        page,
        async () =>
          (((await api.getAllLibraries()) || {}).Items || []).filter((lib) => {
            const type = lib && lib.CollectionType
            return type === 'movies' || type === 'tvshows' || !type
          }),
        (libraries) => ({
          title: $L('Source Libraries'),
          options: asOptions(libraries),
          picked: listOf(s().screensaverLibraryIds),
          sortByLabel: true,
          onSave: (picked) => settings.update({ screensaverLibraryIds: picked }),
          returnFocusTo: 'setting-screensaverLibraries',
        })
      ),
    openScreensaverCollections: () =>
      openWhenLoaded(page, async () => ((await api.getCollections(500, 'SortName', 'Ascending')) || {}).Items || [], (collections) => ({
        title: $L('Source Collections'),
        options: asOptions(collections),
        picked: listOf(s().screensaverCollectionIds),
        sortByLabel: true,
        onSave: (picked) => settings.update({ screensaverCollectionIds: picked }),
        returnFocusTo: 'setting-screensaverCollections',
      })),
    openScreensaverGenres: () =>
      openWhenLoaded(page, loadGenreNames, (names) => ({
        title: $L('Excluded Genres'),
        options: names.map((name) => ({ value: name, label: name })),
        picked: listOf(s().screensaverExcludedGenres),
        sortByLabel: true,
        onSave: (picked) => settings.update({ screensaverExcludedGenres: picked }),
        returnFocusTo: 'setting-screensaverGenres',
      })),
    openCalendarLibraries: () =>
      checklist({
        title: $L('Libraries'),
        options: asOptions(data.calendarLibraries),
        picked: listOf(s().calendarLibraryIds),
        onSave: (picked) => settings.update({ calendarLibraryIds: picked }),
        returnFocusTo: 'setting-calendarLibraries',
      }),
    // The Tizen and Xbox profiles keep what they detected, so the next playback only follows a
    // new choice once that's thrown away.
    toggleExperimentalTruehd: () => {
      settings.set('experimentalTruehd', !s().experimentalTruehd)
      clearCapabilitiesCache()
    },
    toggleXboxDolbyVision: () => {
      settings.set('xboxDolbyVision', s().xboxDolbyVision === false)
      clearCapabilitiesCache()
    },
    // A Seerr notification choice shows at once and goes up to the server behind it.
    toggleNotificationPref: (key) => {
      const value = !data.notificationPrefs[key]
      data.notificationPrefs = { ...data.notificationPrefs, [key]: value }
      page.refresh()
      setNotificationPref(getServerUrl(), getApiKey(), getUserId(), key, value)
    },
    refreshPlugin: () => {
      checkSeerr(true)
        .then((state) => {
          data.seerr = state
          page.refresh()
        })
        .catch(() => {})
    },
    runSetupAgain: () => {
      beginRerun()
      page.$router.to('/setup')
    },
    // Seven presses of the Version row open After Hours.
    pressVersion: () => import('../AfterHours/trigger.js').then((m) => m.pressVersion()),
    // The Device Probe is a page the Xbox build puts beside the app (xbox/probe.mjs). It's only
    // offered to a signed in user, since its report goes to the server.
    openDeviceProbe: isXbox() && getServerUrl() && getApiKey() ? () => import('../../utils/deviceProbe.js').then((m) => m.openDeviceProbe()) : null,
    openWatchParties: () => page.$router.to('/party'),
    // The language reaches the server on a debounce, so the reload waits for it.
    changeLanguage: async (locale) => {
      await saveToStorage('settings', settings.all())
      await sync.flushSettingsPush()
      await loadStrings(locale || navigator.language || 'en-US')
      window.location.reload()
    },
  }
}
