// The Library screen's plain logic: the filter and display choices, what a library asks the server
// for, the line under a card, how big its cards are, and the rows of the Sort & Filter, Display and
// Group By dialogs.
import $L from '../../services/i18n.js'
import { formatDuration } from '../../utils/helpers.js'
import { FOCUS_SCALE, POSTER_HEIGHTS, POSTER_SIZE_OPTIONS, focusOverhang, horizontalCellPad } from '../../utils/gridChrome.js'
import { facetRows } from '../../utils/libraryFilters.js'
import { LIBRARY_GROUP_OPTIONS, groupByLabel } from '../../utils/libraryGroupBy.js'
import { PLAYLIST_CATEGORIES } from '../../utils/playlistGrouping.js'
import { sortLabel } from '../../utils/librarySorts.js'
import { gridLayout } from '../../ui/components/library/tileGridMath.js'

export const FOLDER_DETAIL_TYPES = ['Series', 'BoxSet', 'Playlist', 'MusicAlbum', 'MusicArtist']
// The plain folders a folder view lists ahead of everything else. The server counts a series as a
// folder too, so sorting on IsFolder would put every show ahead of every movie.
export const DIRECTORY_TYPES = 'Folder,CollectionFolder,UserView,PhotoAlbum'

// What a music library's grid shows, picked in its Sort & Filter's Show section.
export const MUSIC_CONTENT_TYPES = [
  { key: 'albums', label: 'Albums', itemType: 'MusicAlbum' },
  { key: 'albumArtists', label: 'Album Artists', itemType: 'AlbumArtist' },
  { key: 'artists', label: 'Artists', itemType: 'MusicArtist' },
  { key: 'songs', label: 'Songs', itemType: 'Audio' },
  { key: 'playlists', label: 'Playlists', itemType: 'Playlist' },
  { key: 'genres', label: 'Genres', itemType: 'MusicGenre' },
]

const PLAYED_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'watched', label: 'Watched' },
  { key: 'unwatched', label: 'Unwatched' },
  { key: 'inProgress', label: 'In Progress' },
]
const FEATURE_FILTERS = [
  { key: 'HasSubtitles', label: 'Subtitles' },
  { key: 'HasTrailer', label: 'Trailers' },
  { key: 'HasSpecialFeature', label: 'Extras' },
  { key: 'HasThemeSong', label: 'Theme Songs' },
  { key: 'HasThemeVideo', label: 'Theme Videos' },
]
const QUALITY_FILTERS = [
  { key: 'sd', label: 'SD' },
  { key: 'hd', label: 'HD' },
  { key: 'uhd', label: '4K', jellyfinOnly: true },
  { key: 'threeD', label: '3D', plexless: true },
]
const VIDEO_SOURCE_FILTERS = [
  { key: 'Dvd', label: 'DVD' },
  { key: 'BluRay', label: 'Blu-ray' },
  { key: 'Iso', label: 'ISO' },
]
const LIKED_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'liked', label: 'Like' },
  { key: 'disliked', label: 'Dislike' },
]
const SERIES_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'continuing', label: 'Continuing' },
  { key: 'ended', label: 'Ended' },
  { key: 'unreleased', label: 'Unreleased', jellyfinOnly: true },
]
export const SERIES_STATUS_BY_KEY = { continuing: 'Continuing', ended: 'Ended', unreleased: 'Unreleased' }

export const FILTER_FIELDS = {
  features: 'featureFilters',
  quality: 'qualityFilters',
  source: 'videoSourceFilters',
  genres: 'genreFilters',
  ratings: 'ratingFilters',
  tags: 'tagFilters',
  years: 'yearFilters',
  audio: 'audioLanguageFilters',
  subtitles: 'subtitleLanguageFilters',
}

const SCROLL_DIRECTIONS = [
  { key: 'vertical', label: () => $L('Vertical') },
  { key: 'horizontal', label: () => $L('Horizontal') },
]
export const IMAGE_TYPE_OPTIONS = [
  { key: 'poster', label: () => $L('Poster') },
  { key: 'thumbnail', label: () => $L('Thumbnail') },
  { key: 'banner', label: () => $L('Banner') },
]
const PLAYLIST_TYPE_LABELS = {
  Video: () => $L('Video'),
  MusicVideo: () => $L('Music Video'),
  Audio: () => $L('Audio (Music)'),
  AudioBook: () => $L('Audiobook'),
  Book: () => $L('Book'),
  Photo: () => $L('Photo'),
  Mixed: () => $L('Mixed'),
}

// A tag list can run to thousands of entries, so a facet opens on this many and grows a page at a time.
export const FACET_PAGE = 50

export const playedLabel = (key, books) => {
  if (books && key === 'watched') return $L('Read')
  if (books && key === 'unwatched') return $L('Unread')
  return $L((PLAYED_FILTERS.find((o) => o.key === key) || PLAYED_FILTERS[0]).label)
}

export const statusFiltersFor = (filters) => {
  const status = []
  if (filters.favoritesOnly) status.push('IsFavorite')
  if (filters.playedFilter === 'watched') status.push('IsPlayed')
  if (filters.playedFilter === 'unwatched') status.push('IsUnplayed')
  if (filters.playedFilter === 'inProgress') status.push('IsResumable')
  if (filters.likedFilter === 'liked') status.push('Likes')
  if (filters.likedFilter === 'disliked') status.push('Dislikes')
  return status
}

// The line under a card's title. Detailed sub headings spell out the year, age rating, runtime,
// resolution and score, while the plain setting keeps the year on its own.
export const cardSubtitle = (item, isFolder, detailed) => {
  if (isFolder) return item.ChildCount != null ? `${item.ChildCount} ${$L('Items')}` : $L('Folder')
  if (item.Type === 'MusicAlbum') {
    if (item.Artists && item.Artists.length) return item.Artists.join(', ')
    if (item.AlbumArtist) return item.AlbumArtist
  }
  if (item.Type === 'Playlist') {
    const count = item.ChildCount != null ? item.ChildCount : item.RecursiveItemCount
    return count != null ? `${count} ${$L('Items')}` : null
  }
  if (!detailed) return item.ProductionYear ? String(item.ProductionYear) : null
  const parts = []
  if (item.ProductionYear) parts.push(String(item.ProductionYear))
  if (item.OfficialRating) parts.push(item.OfficialRating)
  if (item.RunTimeTicks > 0) {
    const dur = formatDuration(item.RunTimeTicks)
    if (dur !== '0m') parts.push(dur)
  }
  const sources = item.MediaSources && item.MediaSources[0]
  const video = sources && sources.MediaStreams ? sources.MediaStreams.find((s) => s.Type === 'Video') : null
  const width = video && video.Width
  if (width >= 3800) parts.push('• 4K')
  else if (width >= 1900) parts.push('• 1080p')
  else if (width >= 1260) parts.push('• 720p')
  if (item.CommunityRating) parts.push(`★ ${item.CommunityRating.toFixed(1)}`)
  return parts.length ? parts.join('  ') : null
}

export const itemTypesFor = (library, groupCollections) => {
  if (!library || !library.Id) return groupCollections ? 'Movie,Series,BoxSet' : 'Movie,Series'
  switch ((library.CollectionType || '').toLowerCase()) {
    case 'movies': return groupCollections ? 'Movie,BoxSet' : 'Movie'
    case 'tvshows': return groupCollections ? 'Series,BoxSet' : 'Series'
    case 'boxsets': return 'BoxSet'
    case 'homevideos': return 'Video,Photo,PhotoAlbum'
    case 'photos': return 'Photo,PhotoAlbum'
    case 'music': return 'MusicAlbum'
    case 'musicvideos': return 'MusicVideo'
    case 'playlists': return 'Playlist'
    case 'books':
    case 'audiobooks': return 'Book'
    case 'trailers': return 'Trailer'
    default: return ''
  }
}

export const excludeTypesFor = (library, genreMode, mixed, groupCollections) => {
  if (genreMode) return groupCollections ? 'Playlist,Episode,Season,Folder' : 'BoxSet,Playlist,Episode,Season,Folder'
  if (!library || !library.Id) return ''
  const ct = (library.CollectionType || '').toLowerCase()
  if ((ct === 'movies' || ct === 'tvshows') && !groupCollections) return 'BoxSet'
  // A flat list leaves out the folders the files sit in.
  if (mixed || ct === 'homevideos') return DIRECTORY_TYPES
  return ''
}

const BANNER_ASPECT = 1000 / 185
const MIN_ROW_GAP = 6
const WIDE_HEIGHTS = { small: 128, medium: 160, large: 191, extraLarge: 223 }
const WIDE_WIDTHS = { small: 227, medium: 284, large: 340, extraLarge: 397 }
const POSTER_WIDTHS = { small: 116, medium: 145, large: 174, extraLarge: 203 }

// How big a library's cards are and how the grid fits them: the card's width and art height, the
// padding round it, and for a vertical grid its columns and row pitch. A horizontal grid's rows
// stretch to fill the height and keep their shape.
export const gridMetrics = ({ imageType, size, gridWidth, viewH, showText, hasSubtitles, horizontal }) => {
  const wide = imageType === 'thumbnail'
  const square = imageType === 'square'
  const banner = imageType === 'banner'
  const bannerWidth = Math.floor(gridWidth / 2 / FOCUS_SCALE)
  const posterH = banner
    ? Math.round(bannerWidth / BANNER_ASPECT)
    : wide ? WIDE_HEIGHTS[size] || 160 : POSTER_HEIGHTS[size]
  const textH = showText ? (hasSubtitles ? 61 : 35) : 0
  const cardW = banner ? bannerWidth : square ? posterH : wide ? WIDE_WIDTHS[size] || 284 : POSTER_WIDTHS[size] || 145
  const cardH = posterH + textH
  const padX = horizontalCellPad(cardW, gridWidth)
  const padY = Math.max(MIN_ROW_GAP, focusOverhang(cardH))
  const minW = cardW + padX * 2
  const minH = cardH + padY * 2
  if (horizontal) {
    const rows = Math.max(1, Math.floor(viewH / minH))
    const tileH = Math.floor(viewH / rows)
    const tileW = Math.floor(minW * (tileH / minH))
    return { cols: rows, tileW, tileH, cardW: tileW - padX * 2, posterH, cardH, padX, padY, bannerWidth, banner, wide, minW, minH }
  }
  const layout = gridLayout(gridWidth, viewH, minW, minH)
  return {
    cols: layout.columns, tileW: layout.tileWidth, tileH: layout.rowHeight, cardW: layout.tileWidth - padX * 2,
    posterH, cardH, padX, padY, bannerWidth, banner, wide, minW, minH,
  }
}

// What a closed section says it is holding. One choice reads by name, several read as a count,
// and a group left alone says nothing.
const chosenLabel = (options, value) => {
  const picked = options.find((o) => o.key === value)
  return picked && value !== 'all' ? $L(picked.label) : null
}
const countLabel = (count) => (count > 0 ? String(count) : null)

// The Sort & Filter dialog's rows. s holds what the screen knows: showAlphabet, canFolderView,
// isFolderView, sortKeys, sortKey, ascending, filters, books, series, music, musicContent, video, onPlex,
// serverTypes, facets, genreMode, openedGenre, genreLibraries, parentId, genreLibraryName, open (the expanded
// section), facetLimit, facetQuery, hasFilters.
export const sortPanelRows = (s) => {
  const rows = []
  const f = s.filters
  const supported = (options) => options.filter((o) => (!o.jellyfinOnly || s.serverTypes.indexOf('emby') < 0) && !(s.onPlex && o.plexless))
  const section = (key, label, summary, body) => {
    const open = s.open === key
    rows.push({ kind: 'section', id: 'section-' + key, key, label, summary, open, rows: open ? body() : null })
  }
  const clearRow = (key, count) => (count > 0 ? [{ kind: 'clear', id: 'clear-' + key, key, label: $L('Clear') }] : [])
  const optionSection = (key, label, options, prefix) => {
    const selected = f[FILTER_FIELDS[key]]
    section(key, label, countLabel(selected.length), () => clearRow(key, selected.length).concat(options.map((o) => ({
      kind: 'check', id: `filter-${prefix}-${o.key}`, key, value: o.key, label: $L(o.label), checked: selected.indexOf(o.key) >= 0,
    }))))
  }
  const facetSection = (key, label, values) => {
    if (!values || !values.length) return
    const selected = f[FILTER_FIELDS[key]]
    const facet = facetRows(values, selected, s.facetQuery, s.facetLimit)
    section(key, label, countLabel(facet.chosen), () => {
      const body = clearRow(key, selected.length)
      if (facet.searchable) body.push({ kind: 'search', id: `filter-${key}-search`, key, label: s.facetQuery || label, filled: !!s.facetQuery })
      facet.visible.forEach((o, i) => body.push({
        kind: 'check', id: `filter-${key}-${i}`, key, value: o.value, label: o.name, checked: selected.indexOf(o.value) >= 0,
      }))
      if (facet.noMatches) body.push({ kind: 'note', id: `filter-${key}-none`, label: $L('No results') })
      if (facet.remaining > 0) body.push({ kind: 'more', id: `filter-${key}-more`, key, label: $L('Show more ({count} left)').replace('{count}', facet.remaining) })
      return body
    })
  }

  rows.push({ kind: 'check', id: 'filter-show-alphabet', label: $L('Show Alphabet'), checked: s.showAlphabet })
  if (s.canFolderView) rows.push({ kind: 'check', id: 'filter-folder-view', label: $L('Folder View'), checked: s.isFolderView })
  section('sort', $L('Sort By'), sortLabel(s.sortKey, !!s.music), () => s.sortKeys.map((key, i) => ({
    kind: 'radio', id: `sort-option-${i}`, value: key, label: sortLabel(key, !!s.music), selected: s.sortKey === key,
    arrow: s.sortKey === key ? (s.ascending ? 'lib_arrow_up' : 'lib_arrow_down') : '',
  })))
  if (s.music) {
    section('music', $L('Show'), chosenLabel(MUSIC_CONTENT_TYPES, s.musicContent), () => MUSIC_CONTENT_TYPES.map((o) => ({
      kind: 'radio', id: `music-content-${o.key}`, value: o.key, label: $L(o.label), selected: s.musicContent === o.key,
    })))
  }
  section('favorites', $L('Filters'), f.favoritesOnly ? $L('Favorites') : null, () => [
    { kind: 'check', id: 'filter-favorites', label: $L('Favorites'), checked: f.favoritesOnly },
  ])
  if (!s.music) {
    section('played', s.books ? $L('Reading Status') : $L('Played Status'), f.playedFilter === 'all' ? null : playedLabel(f.playedFilter, s.books), () =>
      PLAYED_FILTERS.map((o) => ({ kind: 'radio', id: `filter-played-${o.key}`, value: o.key, label: playedLabel(o.key, s.books), selected: f.playedFilter === o.key })))
  }
  if (!s.onPlex) {
    section('liked', $L('My Rating'), chosenLabel(LIKED_FILTERS, f.likedFilter), () =>
      LIKED_FILTERS.map((o) => ({ kind: 'radio', id: `filter-liked-${o.key}`, value: o.key, label: $L(o.label), selected: f.likedFilter === o.key })))
  }
  if (s.series && !s.onPlex) {
    section('series', $L('Series Status'), chosenLabel(SERIES_FILTERS, f.seriesFilter), () =>
      supported(SERIES_FILTERS).map((o) => ({ kind: 'radio', id: `filter-series-${o.key}`, value: o.key, label: $L(o.label), selected: f.seriesFilter === o.key })))
  }
  if (s.video && !s.onPlex) optionSection('features', $L('Features'), supported(FEATURE_FILTERS), 'feature')
  if (s.video) optionSection('quality', $L('Quality'), supported(QUALITY_FILTERS), 'quality')
  if (s.video && !s.onPlex) optionSection('source', $L('Source'), VIDEO_SOURCE_FILTERS, 'source')
  const v = s.facets || {}
  if (!s.genreMode && !s.openedGenre) facetSection('genres', $L('Genres'), v.genres)
  facetSection('ratings', $L('Parental Rating'), v.officialRatings)
  facetSection('tags', $L('Tags'), v.tags)
  facetSection('years', $L('Years'), v.years ? v.years.map(String) : null)
  facetSection('audio', $L('Audio Language'), v.audioLanguages)
  facetSection('subtitles', $L('Subtitle Language'), v.subtitleLanguages)
  if (s.hasFilters) rows.push({ kind: 'wrap', id: 'wrap-clear', rows: [{ kind: 'clear', id: 'filter-clear', key: '', label: $L('Clear Filters') }] })
  if (s.genreMode && s.genreLibraries.length) {
    section('library', $L('Library'), s.genreLibraryName, () => [{ kind: 'radio', id: 'filter-library-all', value: '', label: $L('All Libraries'), selected: !s.parentId }]
      .concat(s.genreLibraries.map((lib) => ({ kind: 'radio', id: 'filter-library-' + lib.Id, value: lib.Id, label: lib.Name, selected: s.parentId === lib.Id }))))
  }
  return rows
}

// The Display dialog: which way the grid scrolls, the art it shows and how big, and for a playlist
// library its grouping and the playlist types it shows.
export const displayPanelRows = ({ direction, imageType, imageSize, playlist, banner, groupingOn, playlistTypes }) => {
  const rows = [{ kind: 'heading', id: 'h-scroll', label: $L('Scroll Direction') }]
  SCROLL_DIRECTIONS.forEach((o) => rows.push({ kind: 'radio', id: `display-scroll-${o.key}`, value: o.key, group: 'direction', label: o.label(), selected: direction === o.key }))
  if (!playlist) {
    rows.push({ kind: 'heading', id: 'h-image', label: $L('Image Type') })
    IMAGE_TYPE_OPTIONS.forEach((o) => rows.push({ kind: 'radio', id: `display-image-${o.key}`, value: o.key, group: 'image', label: o.label(), selected: imageType === o.key }))
  }
  if (!banner) {
    rows.push({ kind: 'heading', id: 'h-size', label: $L('Poster Size') })
    POSTER_SIZE_OPTIONS.forEach((o) => rows.push({ kind: 'radio', id: `display-size-${o.key}`, value: o.key, group: 'size', label: o.label(), selected: imageSize === o.key }))
  }
  if (playlist) {
    rows.push({ kind: 'heading', id: 'h-grouping', label: $L('Grouping') })
    rows.push({ kind: 'check', id: 'display-group-by-type', group: 'grouping', label: $L('Group by Type'), checked: groupingOn })
    rows.push({ kind: 'heading', id: 'h-types', label: $L('Playlist Types') })
    PLAYLIST_CATEGORIES.forEach((t) => rows.push({ kind: 'check', id: `display-playlist-${t}`, value: t, group: 'types', label: PLAYLIST_TYPE_LABELS[t](), checked: playlistTypes.indexOf(t) >= 0 }))
  }
  return rows
}

export const groupPanelRows = (groupBy) => [{ kind: 'rule', id: 'rule' }].concat(LIBRARY_GROUP_OPTIONS.map((o) => ({
  kind: 'radio', id: `group-by-${o}`, value: o, label: groupByLabel(o), selected: groupBy === o,
})))
