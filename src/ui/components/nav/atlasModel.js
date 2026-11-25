// Which Atlas tabs open a panel, and the panel's links, data, cards and posters, kept apart from its
// drawing in AtlasPanel.jsx.
import $L from '../../../services/i18n.js'
import { fontFor } from '../../text.js'
import { api } from '../../../services/jellyfinApi.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { isGameLibrary } from '../../../utils/gameLibrary.js'
import { isLiveTvLibrary } from '../../../utils/liveTvLibrary.js'
import { modernCardImageUrl } from '../home/cardArtwork.js'

export const atlasPanelKind = (entry) => {
  if (!entry) return null
  if (entry.key === 'livetv' || (entry.library && isLiveTvLibrary(entry.library))) return 'livetv'
  if (entry.key === 'discover') return 'discover'
  if (entry.key === 'libraries') return 'libraries'
  if (entry.library) return 'library'
  return null
}

const collectionOf = (library) => String((library && library.CollectionType) || '').toLowerCase()
const itemsOf = (r) => (Array.isArray(r) ? r : (r && r.Items) || [])

// Only links to screens this app has, the section's own page first. Each is { label, target }
// where target is what openEntry takes.
export const atlasLinks = (kind, entry, allLibraries) => {
  const go = (label, target) => ({ label, target })
  if (kind === 'libraries') return entry.libraries.map((lib) => go(lib.label, lib))
  if (kind === 'livetv') return [go($L('Guide'), { route: '/livetv', view: 'livetv' }), go($L('Recordings'), { route: '/recordings' })]
  if (kind === 'discover') {
    return [
      go($L('Trending'), { route: '/seerr', view: 'seerr' }),
      go($L('Popular Movies'), { route: '/seerr/browse/all/movie/0', view: 'seerr' }),
      go($L('Popular Series'), { route: '/seerr/browse/all/tv/0', view: 'seerr' }),
      go($L('Requests'), { route: '/seerr/requests', view: 'seerr' }),
    ]
  }
  const library = entry.library
  const links = [go($L('Browse all'), entry)]
  if (isGameLibrary(library.Id, library.CollectionType, library.Name)) return links
  const type = collectionOf(library)
  const collections = type === 'movies' && (allLibraries || []).find((other) => collectionOf(other) === 'boxsets')
  if (collections) links.push(go($L('Collections'), { library: collections }))
  if (type === 'movies' || type === 'tvshows') links.push(go($L('Genres'), { route: '/genres', view: 'genres' }))
  if (type !== 'music') links.push(go($L('Favorites'), { route: '/favorites', view: 'favorites' }))
  return links
}

// Read once per session for each panel, keeping only loads that came back whole.
const cache = {}

export const loadAtlasPanel = async (kind, entry, serverUrl) => {
  const key = `${serverUrl}|${entry.key}`
  if (cache[key]) return cache[key]
  let failed = false
  const soft = (p) =>
    Promise.resolve(p).catch(() => {
      failed = true
      return null
    })
  let out = {}
  if (kind === 'livetv') {
    const recordings = await soft(api.getLiveTvRecordings({ limit: 2 }))
    out = { cards: itemsOf(recordings).slice(0, 2), cardsTitle: $L('Recent Recordings') }
  } else if (kind === 'discover') {
    const [trending, popular] = await Promise.all([soft(seerrApi.trending(1)), soft(seerrApi.trendingMovies(1))])
    out = {
      seerr: true,
      cards: ((trending && trending.results) || []).slice(0, 2),
      cardsTitle: $L('Trending'),
      posters: ((popular && popular.results) || []).slice(0, 4),
      postersTitle: $L('Popular Movies'),
    }
  } else if (kind === 'library') {
    const library = entry.library
    if (!isGameLibrary(library.Id, library.CollectionType, library.Name)) {
      const music = collectionOf(library) === 'music'
      const [resume, latest] = await Promise.all([
        music ? null : soft(api.getResumeItems(2, library.Id)),
        soft(api.getLatest(library.Id, 4)),
      ])
      out = {
        cards: itemsOf(resume).slice(0, 2),
        cardsTitle: $L('Continue in {section}').replace('{section}', library.Name),
        posters: itemsOf(latest).slice(0, 4),
        postersTitle: $L('Recently Added'),
        square: music,
      }
    }
  }
  if (!failed) cache[key] = out
  return out
}

const yearOf = (item) => String(item.ProductionYear || item.releaseDate || item.firstAirDate || '').slice(0, 4)

// The panel's cards and posters as plain models with their place in the panel, from x 498 (the
// column after the links), and the headings and divider over them.
export const atlasTiles = (kind, entry, data, serverUrl) => {
  const seerr = !!(data && data.seerr)
  const cards = (data && data.cards) || []
  const posters = kind === 'libraries' ? entry.libraries.slice(0, 4).map((l) => l.library) : (data && data.posters) || []
  const tiles = []
  const titles = []
  let x = 498
  if (cards.length) {
    titles.push({ k: 'divider', x, divider: true })
    x += 61
    titles.push({ k: 'cards', x, text: data.cardsTitle, font: fontFor(data.cardsTitle, 'bold') })
    cards.forEach((item, i) => {
      const title = seerr ? item.title || item.name : item.SeriesName || item.Name
      const sub = seerr ? yearOf(item) : item.SeriesName ? item.Name : yearOf(item)
      const url = seerr
        ? item.backdropPath
          ? seerrApi.getImageUrl(item.backdropPath, 'w780')
          : ''
        : modernCardImageUrl(item, true, { itemServerUrl: item._serverUrl || serverUrl }) || ''
      const percent = (item.UserData && item.UserData.PlayedPercentage) || 0
      tiles.push({
        key: 'c' + i,
        kind: 'card',
        x: x + i * 324,
        w: 300,
        h: 168,
        radius: 15,
        url,
        title: title || '',
        sub: sub || '',
        name: '',
        titleFont: fontFor(title || '', 'bold'),
        subFont: fontFor(sub || ''),
        nameFont: 'roboto',
        progress: percent > 0 ? Math.min(100, percent) * 3 : 0,
        item,
        seerr,
      })
    })
    x += cards.length * 300 + (cards.length - 1) * 24 + 60
  }
  if (posters.length) {
    const ptitle = kind === 'libraries' ? $L('Libraries') : data.postersTitle
    titles.push({ k: 'posters', x, text: ptitle, font: fontFor(ptitle, 'bold') })
    const wide = kind === 'libraries'
    const square = !!(data && data.square)
    posters.forEach((item, i) => {
      const w = wide ? 300 : 138
      const h = wide ? 168 : square ? 138 : 207
      let url = ''
      if (seerr) url = item.posterPath ? seerrApi.getImageUrl(item.posterPath, 'w342') : ''
      else if (wide) url = modernCardImageUrl(item, false, { itemServerUrl: item._serverUrl || serverUrl, isStaticMyMedia: true }) || ''
      else url = modernCardImageUrl(item, false, { itemServerUrl: item._serverUrl || serverUrl }) || ''
      const name = item.Name || item.title || item.name || ''
      tiles.push({
        key: 'p' + i,
        kind: 'poster',
        x: x + i * (w + 18),
        w,
        h,
        radius: wide ? 15 : 12,
        url,
        title: '',
        sub: '',
        name,
        titleFont: 'roboto',
        subFont: 'roboto',
        nameFont: fontFor(name, 'bold'),
        progress: 0,
        item,
        seerr,
        library: wide ? item : null,
      })
    })
  }
  return { tiles, titles }
}
