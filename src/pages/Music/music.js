import $L from '../../services/i18n.js'
import { api, getServerUrl } from '../../services/jellyfinApi.js'
import { getImageUrl } from '../../utils/helpers.js'
import { foldAccents } from '../../utils/accentFolding.js'
import { fontFor } from '../../ui/text.js'
import { theme } from '../../ui/theme.js'
import { relativeLuminance } from '../../theme/themeSpec.js'
import * as player from '../../state/audioPlayer.js'
import { withAlpha } from '../../ui/components/books/bookGrid.js'
import { router } from '../../app/router.js'

export const itemsOf = (res) => (Array.isArray(res) ? res : (res && res.Items) || [])

export const subtitleFor = (item) => {
  if (!item) return ''
  switch (item.Type) {
    case 'Audio':
    case 'MusicAlbum': {
      if (item.Artists && item.Artists.length) return item.Artists.join(', ')
      const names = (item.AlbumArtists || []).map((a) => a.Name).filter(Boolean)
      if (names.length) return names.join(', ')
      return item.AlbumArtist || ''
    }
    case 'Playlist':
      return item.ChildCount > 0 ? $L('{count} items').replace('{count}', String(item.ChildCount)) : ''
    case 'MusicArtist':
    case 'AlbumArtist':
      return item.RecursiveItemCount > 0 ? $L('{count} albums').replace('{count}', String(item.RecursiveItemCount)) : ''
    default:
      return ''
  }
}

export const songSubtitle = (song) => {
  const artist = subtitleFor(song)
  if (!song || !song.Album) return artist
  return artist ? `${artist} · ${song.Album}` : song.Album
}

export const cardLine = (item) => {
  if (item.Type === 'MusicAlbum') return item.AlbumArtist || (item.AlbumArtists && item.AlbumArtists[0] && item.AlbumArtists[0].Name) || ''
  if (item.Type === 'Audio') return item.AlbumArtist || (item.Artists && item.Artists[0]) || ''
  return item.Subtitle || ''
}

// A song takes its album's art first, since its own is often missing or a scan of the same cover.
export const musicArtUrl = (item, maxHeight = 300) => {
  if (!item) return ''
  const base = item._serverUrl || getServerUrl()
  if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
    return getImageUrl(base, item.AlbumId, 'Primary', { maxHeight, quality: 90, tag: item.AlbumPrimaryImageTag }) || ''
  }
  if (item.ImageTags && item.ImageTags.Primary) return getImageUrl(base, item.Id, 'Primary', { maxHeight, quality: 90, tag: item.ImageTags.Primary }) || ''
  return ''
}

const cardArtUrl = (item) => {
  const base = item._serverUrl || getServerUrl()
  if (item.ImageTags && item.ImageTags.Primary) return getImageUrl(base, item._imageItemId || item.Id, 'Primary', { maxHeight: 300, quality: 80 }) || ''
  if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) return getImageUrl(base, item.AlbumId, 'Primary', { maxHeight: 300, quality: 80 }) || ''
  return ''
}

export const mediaCard = (item, i, circle = false) => {
  const line = cardLine(item)
  return {
    key: `${item.Id}:${i}`,
    k: `${item.Id}:${i}`,
    idx: i,
    raw: item,
    circle,
    image: cardArtUrl(item),
    title: item.Name || '',
    titleFont: fontFor(item.Name || '', 'medium'),
    placeholder: (item.Name || '').toUpperCase(),
    placeholderFont: fontFor(item.Name || '', 'bold'),
    subtitle: line,
    subtitleFont: fontFor(line),
    fav: !!(item.UserData && item.UserData.IsFavorite),
    // Only a played song shows the watched check in the music screens.
    played: item.Type === 'Audio' && !!(item.UserData && item.UserData.Played),
  }
}

// Last Played has no See All screen of its own.
export const SEE_ALL_TARGET = {
  latestMusic: 'albums',
  favorites: 'favoriteAlbums',
  playlists: 'playlists',
  albumArtists: 'albumArtists',
  artists: 'allArtists',
  albums: 'albums',
}

// Artists lists the album artists, and Favorites holds every favorite in the library whatever its type.
export const musicCategories = () => [
  { id: 'albumArtists', label: $L('Artists'), icon: 'mus_chip_artists' },
  { id: 'albums', label: $L('Albums'), icon: 'mus_chip_albums' },
  { id: 'songs', label: $L('Songs'), icon: 'mus_chip_songs' },
  { id: 'playlists', label: $L('Playlists'), icon: 'mus_chip_playlists' },
  { id: 'genres', label: $L('Genres'), icon: 'mus_chip_genres' },
  { id: 'favoriteItems', label: $L('Favorites'), icon: 'mus_chip_favoriteItems' },
]

export const TILE_COLORS = ['#7A2E22', '#3B2D5C', '#6B2F4A', '#4D3B72', '#B4472F', '#1F3A5F', '#8A5A1E', '#14505C']

export const OVERVIEW_TAB = 'overview'
export const tabList = () => [{ id: OVERVIEW_TAB, label: $L('Overview') }].concat(musicCategories().map((c) => ({ id: c.id, label: c.label })))

const SCREEN_FOR_TARGET = {
  artists: { id: 'artists', mode: 'albumArtists' },
  albumArtists: { id: 'artists', mode: 'albumArtists' },
  allArtists: { id: 'artists', mode: 'artists' },
  albums: { id: 'albums' },
  songs: { id: 'songs' },
  playlists: { id: 'playlists' },
  genres: { id: 'genres' },
  favorites: { id: 'favorites' },
  favoriteItems: { id: 'favorites' },
  favoriteAlbums: { id: 'favorites', tab: 'albums' },
}
export const musicScreenFor = (target) => SCREEN_FOR_TARGET[target] || null

const TAB_FOR_SCREEN = { artists: 'albumArtists', albums: 'albums', songs: 'songs', playlists: 'playlists', genres: 'genres', favorites: 'favoriteItems' }
export const tabForScreen = (screen) => (screen && TAB_FOR_SCREEN[screen.id]) || OVERVIEW_TAB

export const musicNavFor = (style) => (style === 'classic' ? 'chips' : style === 'quickAccess' ? 'rail' : 'strip')

export const stripTarget = (tab, current) => {
  if (tab === current) return null
  if (tab === OVERVIEW_TAB) return 'home'
  return musicScreenFor(tab)
}

export const countLabel = (count, one, many) => (count === 1 ? one : many.replace('{count}', String(count)))

export const letterOf = (item) => {
  const first = foldAccents(((item && (item.SortName || item.Name)) || '').trim()).charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
}

export const trackLength = (ticks) => {
  if (!ticks) return ''
  const total = Math.floor(ticks / 10000000)
  const s = total % 60
  return `${Math.floor(total / 60)}:${s < 10 ? '0' + s : s}`
}

const argbOf = (c) => '#' + (c.slice(7, 9) || 'ff') + c.slice(1, 7)
export const musicLook = () => {
  const t = theme()
  // A focused song row picks black or white ink to stand out on the focused button color.
  const ink = relativeLuminance(argbOf(t.buttonFocused)) > 0.179 ? '#000000' : '#ffffff'
  return {
    t,
    accent: t.accent,
    accentA: t.accentA,
    accent16: t.accentA(0.16),
    accent72: t.accentA(0.72),
    accent45: t.accentA(0.45),
    onAccent: t.onAccent,
    focus: t.focus,
    glow: t.focusGlow,
    os: t.os,
    onSurface: t.onSurface,
    buttonFocused: t.buttonFocused,
    buttonInk: t.onButtonFocused,
    invertedStrong: withAlpha(ink, 0.87),
    invertedSoft: withAlpha(ink, 0.54),
    cardRadius: t.cardRadius,
    cardBorder: t.cardBorder,
    surface: t.surface,
    surfaceVariant: t.surfaceVariant,
    scrim: t.scrim,
    scrimA: withAlpha(t.scrim, 0.45),
    panelBg: withAlpha(t.surface, 0.92),
    favBadge: t.recordingActive,
    onBadge: t.onBadge,
  }
}

export const playQueue = (tracks, index = 0) => {
  if (!tracks || !tracks.length || !tracks[index]) return
  player.play(tracks, index)
  router.to('/nowplaying')
}

// A song plays on its own. Artists, albums and playlists open under their own routes because their
// Details page hides the nav.
export const openMusicItem = (item) => {
  if (item.Type === 'Audio') return playQueue([item], 0)
  if (item.Type === 'MusicArtist') router.to(`/artist/${item.Id}`)
  else if (item.Type === 'MusicAlbum' || item.Type === 'Playlist') router.to(`/album/${item.Id}`)
  else router.to(`/details/${item.Id}`)
}

// Plays a song's album from that song on, using the album's tracks when the screen already has
// them. A song with no album, or an album that won't load, opens on its own.
export const playSongFromAlbum = async (song, albumTracks) => {
  let tracks = albumTracks
  if (!(tracks && tracks.some((t) => t.Id === song.Id)) && song.AlbumId) {
    tracks = itemsOf(await api.getAlbumTracks(song.AlbumId).catch(() => null))
  }
  const i = tracks ? tracks.findIndex((t) => t.Id === song.Id) : -1
  if (i >= 0) playQueue(tracks, i)
  else openMusicItem(song)
}

const PLAYLIST_WORKERS = 4
export const PLAYLIST_FIELDS = 'PrimaryImageAspectRatio,ImageTags,MediaType,ChildCount,RecursiveItemCount'

// Albums and favorites are the only rows that carry a release year, so the rest fall back to name.
export const resolveSort = (option, type) => {
  if (option === 'release_year' && (type === 'MusicAlbum' || type === 'Favorites')) return { SortBy: 'ProductionYear,SortName', SortOrder: 'Descending' }
  if (option === 'date_added') return { SortBy: 'DateCreated', SortOrder: 'Descending' }
  return { SortBy: 'SortName', SortOrder: 'Ascending' }
}

// A playlist only belongs in a music library when everything in it is audio, and the server
// won't answer that, so each one has to be opened to find out. The result keeps the order the
// workers finish in.
export const filterAudioPlaylists = async (playlists) => {
  const found = []
  const pending = playlists.slice()
  const worker = async () => {
    while (pending.length) {
      const pl = pending.shift()
      if (!pl || pl.Type !== 'Playlist' || !pl.Id) continue
      const count = pl.ChildCount != null ? pl.ChildCount : pl.RecursiveItemCount
      if (count != null && count <= 0) continue
      try {
        const entries = itemsOf(await api.getPlaylistItems(pl.Id, 300))
        if (entries.length && entries.every((e) => (e.MediaType ? e.MediaType === 'Audio' : e.Type === 'Audio'))) found.push(pl)
      } catch (e) {
        if (pl.MediaType === 'Audio') found.push(pl)
      }
    }
  }
  const workers = []
  for (let i = 0; i < Math.min(PLAYLIST_WORKERS, pending.length); i++) workers.push(worker())
  await Promise.all(workers)
  return found
}

