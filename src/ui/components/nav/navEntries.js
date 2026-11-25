// Which destinations the nav shows and in what order. Every bar and sidebar style reads this one
// answer, so a button toggle or a Kids Mode rule reaches all of them alike.
import $L from '../../../services/i18n.js'
import * as settings from '../../../state/settings.js'
import { seerrState } from '../../../state/seerr.js'
import { shell, shellApp } from '../../../state/shell/shellState.js'
import { routeForLibrary } from '../../../state/libraryRoutes.js'
import { focusActivePage } from '../../../state/pages.js'
import { goHome } from '../library/goHome.js'
import { browseRefresh } from '../../../state/browseCache.js'
import { isKidsMode } from '../../../utils/kidsMode.js'
import { isLiveTvLibrary, librariesForNav } from '../../../utils/liveTvLibrary.js'
import { isGameLibrary } from '../../../utils/gameLibrary.js'
import { isInGroup, state as partyState } from '../../../state/watchParty.js'
import { friendsState } from './friends.js'

const ICON_BY_COLLECTION_TYPE = {
  movies: 'movie_rounded',
  tvshows: 'tv_rounded',
  music: 'music_note_rounded',
  books: 'menu_book_rounded',
  audiobooks: 'menu_book_rounded',
  livetv: 'live_tv_rounded',
  homevideos: 'photo_library_rounded',
  photos: 'photo_library_rounded',
  boxsets: 'collections_bookmark_rounded',
  playlists: 'playlist_play_rounded',
}

const libraryIcon = (lib) => {
  if (isGameLibrary(lib.Id, lib.CollectionType, lib.Name)) return 'icons/nav_sports_esports.webp'
  return `icons/nav_${ICON_BY_COLLECTION_TYPE[(lib.CollectionType || '').toLowerCase()] || 'video_library_rounded'}.webp`
}

// `store` is read so a computed that calls this re-runs when the libraries, Seerr or the settings
// change, and `friendsTick` is a count the style bumps on onFriendsChange, so the Friends button
// and its badge follow the plugin's answers. [prefs] are the settings Settings' live preview tries.
export const navVisibility = (store, friendsTick = 0, prefs = null) => {
  const s = store.settingsVersion >= 0 ? prefs || settings.all() : {}
  const seerr = store.seerrAvailable || store.seerrName ? seerrState() : seerrState()
  const libraries = store.libraries || []
  const kids = isKidsMode(s)
  const hasLiveTv = libraries.some(isLiveTvLibrary)
  const showLiveTv = !kids && s.showLiveTvButton !== false && hasLiveTv
  const navLibraries = librariesForNav(libraries, showLiveTv, { hideLiveTv: kids })
  const friends = friendsTick >= 0 ? friendsState() : { social: false, badge: 0 }
  return {
    showShuffle: s.showShuffleButton !== false,
    showGenres: s.showGenresButton !== false,
    showFavorites: s.showFavoritesButton !== false,
    showLiveTv,
    showSeerr: !kids && !!seerr.enabled && s.showSeerrButton !== false,
    showCalendar: !kids && s.showCalendarButton !== false && !!(seerr.pluginInfo && seerr.pluginInfo.calendarAvailable === true),
    showSyncPlay: !kids && s.syncplayEnabled !== false && s.showSyncPlayButton !== false,
    navLibraries,
    showLibraries: !kids && s.showLibrariesInToolbar !== false && navLibraries.length > 0,
    showMessages: s.showServerMessagesButton === true && shell.messages > 0,
    // Only where the Achievement Badges plugin has friends switched on, so it never takes a color
    // slot for a button that can't open.
    showFriends: !kids && friends.social && s.showFriendsButton === true,
    friendsBadge: friends.badge,
    librariesIndividually: s.showLibrariesIndividually === true,
    seerrLabel: seerr.displayName || store.seerrName || 'Seerr',
    // Watch Parties is marked while a room is open or a SyncPlay group is joined. The store's flag
    // means something wider (a title can be picked for a room), so it's only read to recompute.
    watchPartyActive: store.watchPartyActive !== null && (isInGroup() || !!(partyState().party && partyState().party.room)),
    unreadCount: shell.unread,
    alwaysExpanded: s.navbarAlwaysExpanded === true,
    showClock: s.showClock !== false,
  }
}

const libraryEntry = (lib) => ({ key: `library:${lib._serverId || ''}:${lib._serverUserId || ''}:${lib.Id}`, view: lib.Id, label: lib.Name, icon: libraryIcon(lib), library: lib })

// The classic bar's order, or with `side` the sidebar's, which moves Watch Parties after Calendar.
// `splitLibraries` lists each library on its own whatever Show Libraries Individually says, and
// `nowPlaying` adds Now Playing last for Reel and Mosaic while music plays. An entry that opens a
// page has a view (the nav section id) and a route, and one that opens something else an action.
export const navEntries = (vis, { side = false, splitLibraries = false, nowPlaying = false } = {}) => {
  const entries = []
  const add = (shown, entry) => {
    if (shown) entries.push(entry)
  }
  const syncPlay = { key: 'syncplay', label: $L('Watch Parties'), icon: 'icons/nav_syncplay.webp', action: 'party', active: vis.watchPartyActive }
  add(true, { key: 'home', view: 'home', label: $L('Home'), icon: 'icons/nav_home.webp', route: '/home' })
  add(true, { key: 'search', view: 'search', label: $L('Search'), icon: 'icons/nav_search.webp', route: '/search' })
  add(vis.showShuffle, { key: 'shuffle', label: $L('Shuffle'), icon: 'icons/nav_shuffle.webp', action: 'shuffle' })
  add(vis.showGenres, { key: 'genres', view: 'genres', label: $L('Genres'), icon: 'icons/nav_genres.webp', route: '/genres' })
  add(vis.showFavorites, { key: 'favorites', view: 'favorites', label: $L('Favorites'), icon: 'icons/nav_favorites.webp', route: '/favorites' })
  add(vis.showLiveTv, { key: 'livetv', view: 'livetv', label: $L('Live TV'), icon: 'icons/nav_live_tv.webp', route: '/livetv' })
  add(vis.showSyncPlay && !side, syncPlay)
  add(vis.showSeerr, { key: 'discover', view: 'seerr', label: vis.seerrLabel, icon: 'icons/nav_seerr.webp', route: '/seerr' })
  add(vis.showCalendar, { key: 'calendar', view: 'calendar', label: $L('Calendar'), icon: 'icons/nav_calendar_month_rounded.webp', route: '/calendar' })
  add(vis.showSyncPlay && side, syncPlay)
  if (vis.showLibraries && (splitLibraries || vis.librariesIndividually)) {
    vis.navLibraries.forEach((lib) => entries.push(libraryEntry(lib)))
  } else {
    add(vis.showLibraries, { key: 'libraries', label: $L('Libraries'), icon: 'icons/nav_libraries.webp', libraries: vis.navLibraries.map(libraryEntry) })
  }
  add(vis.showMessages, { key: 'messages', label: $L('Messages'), icon: 'icons/nav_messages.webp', action: 'messages', badge: vis.unreadCount })
  add(vis.showFriends, { key: 'friends', label: $L('Friends'), icon: 'icons/nav_friends.webp', action: 'friends', badge: vis.friendsBadge })
  add(true, { key: 'settings', view: 'settings', label: $L('Settings'), icon: 'icons/nav_settings.webp', route: '/settings' })
  add(nowPlaying, { key: 'music', label: $L('Now Playing'), icon: 'icons/nav_music_note_rounded.webp', route: '/nowplaying' })
  entries.forEach((e, i) => {
    e.slot = i + 1
  })
  return entries
}

// The entry for the page on screen, or Home when the page isn't one the nav lists.
export const currentEntryIndex = (entries, view) => {
  const i = entries.findIndex((e) => e.view && e.view === view)
  return i >= 0 ? i : 0
}

// A badge count reads 9+ past nine, so the circle stays small enough for a collapsed icon.
export const badgeText = (n) => (n > 9 ? '9+' : String(n))
export const badgeWidth = (text) => Math.max(22, text.length * 9 + 12)

// What picking an entry does, shared by every style. `nav` holds the store and router.
export const openEntry = (nav, entry) => {
  if (!entry) return
  const app = shellApp()
  if (entry.library) {
    nav.$store.navSection = entry.library.Id
    nav.$router.to(routeForLibrary(entry.library))
    return
  }
  if (entry.action === 'account') {
    if (app) app.openAccount()
    return
  }
  if (entry.action === 'party') {
    if (app) app.openParty()
    return
  }
  if (entry.action === 'messages') {
    if (app) app.openMessages()
    return
  }
  if (entry.action === 'shuffle') {
    if (app) app.openShuffle()
    return
  }
  if (entry.action === 'friends') {
    nav.$store.navSection = 'settings'
    nav.$router.to('/settings', { initial: 'friends' })
    return
  }
  // Home from Home refreshes the media bar and goes nowhere, and the other pages reopen only when
  // they aren't already showing.
  if (entry.route && nav.$router.currentRoute && nav.$router.currentRoute.path === entry.route) {
    if (entry.route === '/home') browseRefresh({ newMediaBar: true })
    focusActivePage()
    return
  }
  // Home drops the screens opened since and comes back from the history, rather than a second Home
  // being built on top of it.
  if (entry.route === '/home') return goHome(nav)
  if (entry.view) nav.$store.navSection = entry.view
  if (entry.route) nav.$router.to(entry.route)
}

// The title Mosaic's Home tile shows: the media bar's first title with a backdrop. Home hands the
// bar's items over with setNavFeatured.
let featured = []
export const setNavFeatured = (items) => {
  featured = Array.isArray(items) ? items : []
}
export const navFeatured = () =>
  featured.find((it) => it && (it._externalBackdropUrl || (it.BackdropImageTags && it.BackdropImageTags.length) || (it.ParentBackdropImageTags && it.ParentBackdropImageTags.length))) || null
