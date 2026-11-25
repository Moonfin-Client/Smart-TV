// The summary cards along the bottom of the Spotlight style, and the sections each one opens.
import $L from '../../../services/i18n.js'
import { groupExtrasByCategory, getExtraCategoryLabel } from '../extraCategories.js'
import { mergeMissingByReleaseOrder } from '../seerrMissingCollectionItems.js'
import { SHOWS_EVERYTHING } from '../../../utils/detailSectionLayout.js'
import { DETAIL_METADATA, arrange } from '../../../utils/detailMetadataLayout.js'
import { formatFileSize } from '../../../utils/formatFileSize.js'
import { getImageUrl } from '../../../utils/helpers.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { collectionPlaylistItems } from '../collectionPlaylist.js'
import { firstChapterImageUrl, firstLandscapeImageUrl, firstPosterImageUrl, spotlightItemImageUrl, spotlightLandscapeImageUrl } from './spotlightImages.js'

const CARD_ICONS = {
  people: 'icons/spot_groups.webp',
  chaptersExtras: 'icons/spot_video_library.webp',
  similar: 'icons/spot_star_shine.webp',
  reviews: 'icons/spot_rate_review.webp',
  collections: 'icons/d/collection.webp',
  episodes: 'icons/d/series.webp',
  tracks: 'icons/spot_queue_music.webp',
  albums: 'icons/spot_album.webp',
  playlist: 'icons/spot_playlist_play.webp',
  playlistOrder: 'icons/spot_format_list_numbered.webp',
  filmography: 'icons/d/movieOutlined.webp',
  appearances: 'icons/d/starOutline.webp',
  crew: 'icons/d/movieCreationOutlined.webp',
  seerrDetails: 'icons/spot_info.webp',
  fileDetails: 'icons/spot_info.webp',
  books: 'icons/spot_menu_book.webp',
}

// Card and hero sizes for the 1920x1080 screen.
const MAX_HEIGHT = 200
const MIN_HEIGHT = 120
export const summaryCardHeight = (viewportHeight) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, viewportHeight * 0.28))
export const summaryCardWidth = (height) => Math.round((height * 16) / 9)
export const heroWidth = (viewportWidth) => Math.min(1100, Math.max(450, viewportWidth * 0.85))

export const spotlightRuntimeLabel = (ticks) => {
  const totalMinutes = Math.floor((ticks || 0) / 600000000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

// The facts line under the title, each piece with its kind so the status draws as a pill and the
// runtime leads with a clock.
export const spotlightMetaPieces = ({ item = {}, year, officialRating, seasonCount, episodeCount, genres = [], upcomingEpisodeText, hasSeerrPills, settings = {} }) => {
  const ordered = arrange(DETAIL_METADATA, { order: settings.detailMetadataOrderTv, hidden: settings.hiddenDetailMetadataTv })
  const pieceFor = (id) => {
    switch (id) {
      case 'year':
        return year ? [{ kind: 'text', text: String(year) }] : []
      case 'parentalRating':
        return officialRating ? [{ kind: 'text', text: officialRating }] : []
      case 'runtimeAndSeasons': {
        const pieces = []
        if (item.Type === 'Series' && seasonCount) pieces.push({ kind: 'text', text: $L('{count} Seasons').replace('{count}', seasonCount) })
        if (item.Type === 'Season' && episodeCount) pieces.push({ kind: 'text', text: $L('{count} Episodes').replace('{count}', episodeCount) })
        if (item.Type === 'Episode' && item.ParentIndexNumber != null && item.IndexNumber != null) pieces.push({ kind: 'text', text: `S${item.ParentIndexNumber}:E${item.IndexNumber}` })
        if (item.RunTimeTicks && item.Type !== 'Series') pieces.push({ kind: 'runtime', text: spotlightRuntimeLabel(item.RunTimeTicks) })
        return pieces
      }
      case 'status': {
        if (item.Type !== 'Series' || !item.Status) return []
        if (item.Status.toLowerCase() === 'ended') return [{ kind: 'status', text: $L('Ended'), ended: true }]
        return [{ kind: 'status', text: item.Status === 'Continuing' ? $L('Continuing') : item.Status, ended: false }]
      }
      case 'upcomingEpisodeDate':
        return upcomingEpisodeText ? [{ kind: 'upcoming', text: upcomingEpisodeText }] : []
      case 'genres':
        return genres.length ? [{ kind: 'text', text: genres.slice(0, 3).join(' · ') }] : []
      case 'seerrAvailability':
        return hasSeerrPills ? [{ kind: 'seerr' }] : []
      default:
        return []
    }
  }
  return ordered.reduce((acc, def) => acc.concat(pieceFor(def.id)), [])
}

const countLabel = (count, one, many) => (count === 1 ? one : many.replace('{count}', String(count)))

const firstCollectionImageUrl = (serverUrl, collections) => {
  for (const collection of collections) {
    const url = firstLandscapeImageUrl(serverUrl, collection.items || [])
    if (url) return url
  }
  return null
}

const joinSubtitle = (parts) => parts.filter(Boolean).join(' · ')
const mediaSection = (title, items, aspect = 'portrait') => ({ kind: 'media', title, count: items.length, items, aspect })
const memberSection = (title, items) => ({ ...mediaSection(title, items), collectionMembers: true })
const seerrSection = (title, items, showCredit = false) => ({ kind: 'seerr', title, count: items.length, items, showCredit })
const peopleSection = (title, people) => ({ kind: 'people', title, count: people.length, people })
const streamingNotFirst = (sections) => (sections[0] && sections[0].kind === 'seerrStreaming' && sections.length > 1
  ? [sections[1], sections[0]].concat(sections.slice(2))
  : sections)

// A cast list can name someone twice, as an actor and a guest star, so repeats fold into one.
export const dedupePeople = (people = []) => {
  const byKey = new Map()
  people.forEach((person) => {
    const key = (person && (person.Id || person.Name)) || ''
    if (!key) return
    const held = byKey.get(key)
    if (!held) {
      byKey.set(key, { ...person })
      return
    }
    const roles = [held.Role, person.Role].filter(Boolean)
    const unique = []
    roles.join(' · ').split(' · ').filter(Boolean).forEach((r) => unique.indexOf(r) < 0 && unique.push(r))
    if (unique.length) held.Role = unique.join(' · ')
  })
  return Array.from(byKey.values())
}

class CardBuilder {
  constructor(state) {
    this.s = state
  }

  shows(id) {
    return (this.s.showsSection || SHOWS_EVERYTHING)(id)
  }

  factories() {
    const { item, seerrOnly, bookSeriesItem } = this.s
    if (seerrOnly) {
      return { seerr_details: () => this.seerrDetailsCard(), people: () => this.peopleCard(), similar: () => this.similarCard(), reviews: () => this.reviewsCard() }
    }
    if (bookSeriesItem && bookSeriesItem.ChildCount > 0) return { books: () => this.booksCard() }
    switch (item && item.Type) {
      case 'Series': return {
        seasons: () => this.seasonsCard(), people: () => this.peopleCard(), chapters_extras: () => this.chaptersExtrasCard(),
        similar: () => this.similarCard(), reviews: () => this.reviewsCard(), collections: () => this.collectionsCard(),
      }
      case 'Season': return {
        episodes: () => this.seasonEpisodesCard(), people: () => this.peopleCard(), chapters_extras: () => this.chaptersExtrasCard(), similar: () => this.similarCard(),
      }
      case 'Episode': return {
        episodes: () => this.moreEpisodesCard(), people: () => this.peopleCard(), chapters_extras: () => this.chaptersExtrasCard(),
        similar: () => this.similarCard(), file_details: () => this.fileDetailsCard(),
      }
      case 'MusicAlbum':
      case 'AudioBook':
      case 'Book': return { tracks: () => this.tracksCard(), similar: () => this.similarCard() }
      case 'Playlist': return { playlist: () => this.playlistCard() }
      case 'MusicArtist': return { albums: () => this.albumsCard(), similar: () => this.similarCard() }
      case 'Person': return { filmography: () => this.filmographyCard(), appearances: () => this.personAppearancesCard(), crew: () => this.personCrewCard() }
      case 'BoxSet': return { boxset_items: () => this.boxSetItemsCard(), people: () => this.boxSetPeopleCard(), playlist_order: () => this.playlistOrderCard() }
      default: return {
        people: () => this.peopleCard(), chapters_extras: () => this.chaptersExtrasCard(), similar: () => this.similarCard(),
        reviews: () => this.reviewsCard(), collections: () => this.collectionsCard(), file_details: () => this.fileDetailsCard(),
      }
    }
  }

  build() {
    const f = this.factories()
    return Object.keys(f).map((k) => f[k]()).filter(Boolean)
  }

  buildOne(id) {
    const make = this.factories()[id]
    return make ? make() : null
  }

  peopleSubtitle(peopleCount, studioCount) {
    return joinSubtitle([
      peopleCount > 0 ? countLabel(peopleCount, $L('1 person'), $L('{count} people')) : null,
      studioCount > 0 ? countLabel(studioCount, $L('1 studio'), $L('{count} studios')) : null,
    ])
  }

  studiosSection() {
    const { studioCards = [] } = this.s
    return { kind: 'studios', title: $L('Studios'), count: studioCards.length, studios: studioCards }
  }

  peopleCard() {
    const { cast = [], crew = [], studioCards = [] } = this.s
    const people = dedupePeople(cast)
    if (!people.length && !crew.length && !studioCards.length) return null
    const keys = {}
    people.concat(crew).forEach((p) => (keys[p.Id || p.Name] = true))
    return {
      id: 'people', title: $L('Cast, Crew, and Studios'), subtitle: this.peopleSubtitle(Object.keys(keys).length, studioCards.length),
      imageUrl: this.s.fallbackImageUrl, icon: CARD_ICONS.people,
      sections: [
        people.length ? peopleSection($L('Cast'), people) : null,
        crew.length ? peopleSection($L('Crew'), crew) : null,
        studioCards.length ? this.studiosSection() : null,
      ].filter(Boolean),
    }
  }

  chaptersExtrasCard() {
    const { item, serverUrl, extras = [], fallbackImageUrl } = this.s
    const chapters = this.shows('chapters') ? (item && item.Chapters) || [] : []
    if (!chapters.length && !extras.length) return null
    return {
      id: 'chapters_extras', title: $L('Chapters and Extras'),
      subtitle: joinSubtitle([
        chapters.length ? countLabel(chapters.length, $L('1 chapter'), $L('{count} chapters')) : null,
        extras.length ? countLabel(extras.length, $L('1 extra'), $L('{count} extras')) : null,
      ]),
      imageUrl: (chapters.length ? firstChapterImageUrl(serverUrl, item) : null) ||
        (extras.length ? spotlightLandscapeImageUrl(serverUrl, extras[0], { fallbackUrl: fallbackImageUrl }) : null) || fallbackImageUrl,
      icon: CARD_ICONS.chaptersExtras,
      sections: (chapters.length ? [{ kind: 'chapters', title: $L('Chapters'), count: chapters.length, item }] : [])
        .concat(groupExtrasByCategory(extras).map(({ key, items }) => mediaSection(getExtraCategoryLabel(key), items, 'landscape'))),
    }
  }

  seerrDetailsCard() {
    const { seerr, fallbackImageUrl } = this.s
    const chipCount = (seerr && seerr.chipCount) || 0
    const factCount = (seerr && seerr.factCount) || 0
    const streamingCount = (seerr && seerr.streamingCount) || 0
    const collection = seerr && seerr.collection
    if (!chipCount && !factCount && !collection) return null
    return {
      id: 'seerr_details', title: $L('Details'),
      subtitle: [
        factCount > 0 ? countLabel(factCount, $L('1 fact'), $L('{count} facts')) : null,
        chipCount > 0 ? countLabel(chipCount, $L('1 tag'), $L('{count} tags')) : null,
      ].filter(Boolean).join(' · '),
      imageUrl: fallbackImageUrl, icon: CARD_ICONS.seerrDetails,
      sections: streamingNotFirst([]
        .concat(chipCount > 0 ? [{ kind: 'seerrChips', title: $L('Genres and Tags'), count: chipCount }] : [])
        .concat(factCount > 0 ? [{ kind: 'seerrFacts' }] : [])
        .concat(streamingCount > 0 ? [{ kind: 'seerrStreaming' }] : [])
        .concat(collection ? [{ kind: 'seerrCollection' }] : [])),
    }
  }

  similarCard() {
    const { similar = [], similarSource, seerr, seerrOnly, serverUrl, fallbackImageUrl } = this.s
    const recommendations = (seerr && seerr.recommendations) || []
    const seerrSimilar = (seerr && seerr.similar) || []
    if (!similar.length && !recommendations.length && !seerrSimilar.length) return null
    const librarySectionTitle = similarSource === 'moonfin' ? $L('Moonfin Recommends') : similarSource === 'tmdb' ? $L('TMDb') : $L('Similar')
    const total = similar.length + recommendations.length + seerrSimilar.length
    return {
      id: 'similar', title: $L('Recommendations'), subtitle: countLabel(total, $L('1 title'), $L('{count} titles')),
      imageUrl: (similar.length
        ? spotlightLandscapeImageUrl(serverUrl, similar[0], { fallbackUrl: fallbackImageUrl })
        : firstLandscapeImageUrl(serverUrl, recommendations.length ? recommendations : seerrSimilar)) || fallbackImageUrl,
      icon: CARD_ICONS.similar,
      sections: streamingNotFirst([]
        .concat(!seerrOnly && seerr && seerr.chipCount > 0 ? [{ kind: 'seerrChips' }] : [])
        .concat(!seerrOnly && seerr && seerr.factCount > 0 ? [{ kind: 'seerrFacts' }] : [])
        .concat(!seerrOnly && seerr && seerr.streamingCount > 0 ? [{ kind: 'seerrStreaming' }] : [])
        .concat(similar.length ? [mediaSection(librarySectionTitle, similar)] : [])
        .concat(recommendations.length ? [seerrSection($L('Recommendations (Seerr)'), recommendations)] : [])
        .concat(seerrSimilar.length ? [seerrSection(similar.length ? $L('Similar (Seerr)') : $L('Similar'), seerrSimilar)] : [])),
    }
  }

  reviewsCard() {
    const { reviews = [], fallbackImageUrl } = this.s
    if (!reviews.length) return null
    return {
      id: 'reviews', title: $L('Reviews'), subtitle: countLabel(reviews.length, $L('1 review'), $L('{count} reviews')),
      imageUrl: fallbackImageUrl, icon: CARD_ICONS.reviews, sections: [{ kind: 'reviews', reviews }],
    }
  }

  collectionsCard() {
    const { parentCollections = [], settings = {}, serverUrl, fallbackImageUrl } = this.s
    if (!parentCollections.length) return null
    const showMissing = settings.seerrShowMissingCollectionItems !== false
    return {
      id: 'collections', title: $L('Collections'), subtitle: countLabel(parentCollections.length, $L('1 collection'), $L('{count} collections')),
      imageUrl: firstCollectionImageUrl(serverUrl, parentCollections) || fallbackImageUrl, icon: CARD_ICONS.collections,
      sections: parentCollections.map((collection) => mediaSection(collection.name, [collection.boxSetItem]
        .concat(showMissing ? mergeMissingByReleaseOrder(collection.items || [], collection.missingItems || []) : collection.items || [])
        .filter(Boolean))),
    }
  }

  booksCard() {
    const { bookSeriesItem, fallbackImageUrl } = this.s
    const items = (bookSeriesItem && bookSeriesItem.Members) || []
    return {
      id: 'books', title: $L('Books'), subtitle: countLabel((bookSeriesItem && bookSeriesItem.ChildCount) || 0, $L('1 book'), $L('{count} books')),
      imageUrl: fallbackImageUrl, icon: CARD_ICONS.books, sections: [mediaSection($L('Books'), items)],
    }
  }

  fileDetailsCard() {
    if (!this.shows('mediaInfo')) return null
    const { item, mediaSource } = this.s
    const source = mediaSource || (item && item.MediaSources && item.MediaSources[0])
    if (!source || !(source.MediaStreams && source.MediaStreams.length)) return null
    const container = source.Container ? String(source.Container).toUpperCase() : null
    return {
      id: 'file_details', title: $L('File Details'), modalTitle: $L('File Information'), subtitle: joinSubtitle([container, formatFileSize(source.Size)]),
      imageUrl: this.fileDetailsImageUrl(), icon: CARD_ICONS.fileDetails, sections: [{ kind: 'fileInfo', mediaSource: source, item }],
    }
  }

  fileDetailsImageUrl() {
    const { serverUrl, item, fallbackImageUrl, seerr } = this.s
    const tags = (item && item.BackdropImageTags) || []
    if (tags.length >= 3) return getImageUrl(serverUrl, item.Id, 'Backdrop/2', { maxWidth: 960, quality: 90, tag: tags[2] })
    if (seerr && seerr.details && seerr.details.backdrop_path) return seerrApi.getImageUrl(seerr.details.backdrop_path, 'w780')
    return fallbackImageUrl
  }

  seasonsCard() {
    const { seasons = [], item, seriesEpisodes = [], nextUp = [], seerr, serverUrl, fallbackImageUrl } = this.s
    if (!seasons.length) return null
    const episodeCount = seriesEpisodes.length || (item && item.RecursiveItemCount) || 0
    const name = ((item && item.Name) || '').trim()
    return {
      id: 'seasons', title: $L('Seasons'), modalTitle: name || $L('Seasons'),
      subtitle: joinSubtitle([
        countLabel(seasons.length, $L('1 season'), $L('{count} seasons')),
        episodeCount > 0 ? countLabel(episodeCount, $L('1 episode'), $L('{count} episodes')) : null,
      ]),
      imageUrl: firstPosterImageUrl(serverUrl, nextUp.concat(seriesEpisodes)) || fallbackImageUrl, icon: CARD_ICONS.episodes,
      sections: [{ ...mediaSection($L('Seasons'), seasons), seasonStatus: seerr && seerr.seasonMarkers }],
    }
  }

  seasonEpisodesCard() {
    const { episodes = [], item, serverUrl, fallbackImageUrl } = this.s
    if (!episodes.length) return null
    const series = ((item && item.SeriesName) || '').trim()
    return {
      id: 'episodes', title: $L('Episodes'), modalTitle: series ? `${series} - ${item.Name}` : item && item.Name,
      subtitle: countLabel(episodes.length, $L('1 episode'), $L('{count} episodes')),
      imageUrl: firstPosterImageUrl(serverUrl, episodes) || fallbackImageUrl, icon: CARD_ICONS.episodes,
      sections: [mediaSection($L('Episodes'), episodes, 'landscape')],
    }
  }

  // The whole run, a foldable section per season with only the one being watched open.
  moreEpisodesCard() {
    if (!this.shows('moreEpisodes')) return null
    const { episodes = [], seriesEpisodes = [], item, serverUrl, fallbackImageUrl } = this.s
    const all = seriesEpisodes.length ? seriesEpisodes : episodes
    if (!all.length) return null
    const currentSeason = item && item.ParentIndexNumber
    const defaultSeason = seriesEpisodes.length ? 0 : currentSeason != null ? currentSeason : 1
    const seasonOf = (e) => (e.ParentIndexNumber != null ? e.ParentIndexNumber : defaultSeason)
    const nameOf = (e) => (e.Name || '').toLowerCase()
    const byName = (a, b) => (nameOf(a) < nameOf(b) ? -1 : nameOf(a) > nameOf(b) ? 1 : 0)
    const groups = new Map()
    all.slice()
      .sort((a, b) => (seasonOf(a) - seasonOf(b)) || ((a.IndexNumber || 0) - (b.IndexNumber || 0)) || byName(a, b))
      .forEach((e) => {
        const season = seasonOf(e)
        if (!groups.has(season)) groups.set(season, [])
        groups.get(season).push(e)
      })
    const holdsThisEpisode = (list) => list.some((e) => e.Id === (item && item.Id) || (item && item.SeasonId && e.SeasonId === item.SeasonId))
    const isCurrent = (season, list) => groups.size === 1 || (currentSeason != null ? season === currentSeason : holdsThisEpisode(list))
    const sections = []
    groups.forEach((list, season) => {
      sections.push({
        ...mediaSection(season === 0 ? $L('Specials') : $L('Season {number}').replace('{number}', season), list, 'landscape'),
        id: `season-${season}`, collapsible: true, expanded: isCurrent(season, list), currentId: item && item.Id,
      })
    })
    return {
      id: 'episodes', title: $L('More Episodes'),
      subtitle: joinSubtitle([
        groups.size > 1 ? countLabel(groups.size, $L('1 season'), $L('{count} seasons')) : null,
        countLabel(all.length, $L('1 episode'), $L('{count} episodes')),
      ]),
      imageUrl: firstPosterImageUrl(serverUrl, all) || fallbackImageUrl, icon: CARD_ICONS.episodes, sections,
    }
  }

  tracksCard() {
    const { albumTracks = [], item, serverUrl, fallbackImageUrl } = this.s
    if (!albumTracks.length) return null
    const totalTicks = albumTracks.reduce((sum, t) => sum + (t.RunTimeTicks || 0), 0)
    return {
      id: 'tracks', title: $L('Track List'),
      subtitle: joinSubtitle([countLabel(albumTracks.length, $L('1 track'), $L('{count} tracks')), totalTicks > 0 ? spotlightRuntimeLabel(totalTicks) : null]),
      imageUrl: spotlightItemImageUrl(serverUrl, item) || fallbackImageUrl, icon: CARD_ICONS.tracks,
      sections: [{
        kind: 'tracks', title: $L('Track List'), count: albumTracks.length, tracks: albumTracks,
        isAudiobook: item.Type === 'AudioBook' || item.Type === 'Book', groupByDisc: item.Type === 'MusicAlbum',
      }],
    }
  }

  playlistCard() {
    const { playlistItems = [], canManagePlaylist, serverUrl, fallbackImageUrl } = this.s
    if (!playlistItems.length) return null
    return {
      id: 'playlist', title: $L('Playlist'), subtitle: countLabel(playlistItems.length, $L('1 item'), $L('{count} items')),
      imageUrl: spotlightItemImageUrl(serverUrl, playlistItems[0]) || fallbackImageUrl, icon: CARD_ICONS.playlist,
      sections: [{ kind: 'tracks', title: $L('Playlist'), count: playlistItems.length, tracks: playlistItems, isPlaylist: true, showAlbum: true, manage: Boolean(canManagePlaylist) }],
    }
  }

  albumsCard() {
    const { artistAlbums = [], serverUrl, fallbackImageUrl } = this.s
    if (!artistAlbums.length) return null
    return {
      id: 'albums', title: $L('Albums'), subtitle: countLabel(artistAlbums.length, $L('1 album'), $L('{count} albums')),
      imageUrl: spotlightItemImageUrl(serverUrl, artistAlbums[0]) || fallbackImageUrl, icon: CARD_ICONS.albums,
      sections: [mediaSection($L('Albums'), artistAlbums, 'square')],
    }
  }

  shownAppearances() {
    return this.shows('seerrPersonAppearances') ? this.s.seerrAppearances || [] : []
  }

  shownCrewCredits() {
    return this.shows('seerrPersonCrew') ? this.s.seerrCrewCredits || [] : []
  }

  // Each of a person's cards takes a backdrop the others haven't, from its own credits where it can.
  personBackdrops() {
    if (this.personBackdropsCache) return this.personBackdropsCache
    const { personMovies = [], personSeries = [], filmography = [], serverUrl } = this.s
    const landscapes = (items) => items.map((e) => spotlightLandscapeImageUrl(serverUrl, e)).filter(Boolean)
    const cards = [
      ['filmography', personMovies.concat(personSeries, filmography)],
      ['appearances', this.shownAppearances()],
      ['crew', this.shownCrewCredits()],
    ].filter(([, items]) => items.length).map(([id, items]) => [id, landscapes(items)])
    const all = cards.reduce((acc, [, pool]) => acc.concat(pool), [])
    const used = {}
    const pick = (pool) => {
      const free = (c) => !used[c]
      const url = pool.find(free) || all.find(free) || pool[0] || all[0] || null
      if (url) used[url] = true
      return url
    }
    const out = {}
    cards.forEach(([id, pool]) => (out[id] = pick(pool)))
    this.personBackdropsCache = out
    return out
  }

  filmographyCard() {
    const { personMovies = [], personSeries = [], filmography = [], fallbackImageUrl } = this.s
    const hasLibrary = personMovies.length > 0 || personSeries.length > 0
    if (!hasLibrary && !filmography.length) return null
    return {
      id: 'filmography', title: $L('Filmography'),
      subtitle: joinSubtitle([
        personMovies.length ? countLabel(personMovies.length, $L('1 movie'), $L('{count} movies')) : null,
        personSeries.length ? countLabel(personSeries.length, $L('1 show'), $L('{count} shows')) : null,
        !hasLibrary ? countLabel(filmography.length, $L('1 item'), $L('{count} items')) : null,
      ]),
      imageUrl: this.personBackdrops().filmography || fallbackImageUrl, icon: CARD_ICONS.filmography,
      sections: []
        .concat(personMovies.length ? [mediaSection($L('Movies'), personMovies)] : [])
        .concat(personSeries.length ? [mediaSection($L('TV Shows'), personSeries)] : [])
        .concat(!hasLibrary ? [mediaSection($L('Filmography'), filmography)] : []),
    }
  }

  seerrCreditsCard(id, title, credits, icon) {
    const { serverUrl, fallbackImageUrl } = this.s
    return {
      id, title, subtitle: countLabel(credits.length, $L('1 item'), $L('{count} items')),
      imageUrl: this.personBackdrops()[id] || firstPosterImageUrl(serverUrl, credits) || fallbackImageUrl, icon,
      sections: [seerrSection(title, credits, true)],
    }
  }

  personAppearancesCard() {
    const credits = this.shownAppearances()
    return credits.length ? this.seerrCreditsCard('appearances', $L('Appearances (Seerr)'), credits, CARD_ICONS.appearances) : null
  }

  personCrewCard() {
    const credits = this.shownCrewCredits()
    return credits.length ? this.seerrCreditsCard('crew', $L('Crew Contributions (Seerr)'), credits, CARD_ICONS.crew) : null
  }

  boxSetItemsCard() {
    const { collectionItems = [], missingCollectionItems = [], settings = {}, serverUrl, item, fallbackImageUrl } = this.s
    const items = settings.seerrShowMissingCollectionItems !== false ? mergeMissingByReleaseOrder(collectionItems, missingCollectionItems) : collectionItems
    if (!items.length) return null
    const movies = items.filter((i) => i.Type === 'Movie')
    const series = items.filter((i) => i.Type === 'Series')
    const rest = items.filter((i) => i.Type !== 'Movie' && i.Type !== 'Series')
    return {
      id: 'boxset_items', title: $L('Movies & Shows'),
      subtitle: joinSubtitle([
        movies.length ? countLabel(movies.length, $L('1 movie'), $L('{count} movies')) : null,
        series.length ? countLabel(series.length, $L('1 show'), $L('{count} shows')) : null,
        !movies.length && !series.length ? countLabel(items.length, $L('1 item'), $L('{count} items')) : null,
      ]),
      imageUrl: spotlightLandscapeImageUrl(serverUrl, item, { fallbackUrl: fallbackImageUrl }) || firstLandscapeImageUrl(serverUrl, items),
      icon: CARD_ICONS.collections,
      sections: []
        .concat(movies.length ? [memberSection($L('Movies'), movies)] : [])
        .concat(series.length ? [memberSection($L('TV Shows'), series)] : [])
        .concat(rest.length ? [memberSection($L('Movies & Shows'), rest)] : []),
    }
  }

  boxSetPeopleCard() {
    const { collectionItems = [], studioCards = [], fallbackImageUrl } = this.s
    const cast = new Map()
    const crew = new Map()
    const showsCast = this.shows('cast')
    const showsCrew = this.shows('crew')
    collectionItems.forEach((child) => {
      ;(child.People || []).forEach((person) => {
        const key = (person && (person.Id || person.Name)) || ''
        if (!key) return
        const isActor = person.Type === 'Actor'
        if (isActor ? !showsCast : !showsCrew) return
        const bucket = isActor ? cast : crew
        if (!bucket.has(key)) bucket.set(key, person)
      })
    })
    if (!cast.size && !crew.size && !studioCards.length) return null
    const keys = {}
    cast.forEach((v, k) => (keys[k] = true))
    crew.forEach((v, k) => (keys[k] = true))
    return {
      id: 'people', title: $L('Cast, Crew, and Studios'), subtitle: this.peopleSubtitle(Object.keys(keys).length, studioCards.length),
      imageUrl: fallbackImageUrl, icon: CARD_ICONS.people,
      sections: [
        cast.size ? peopleSection($L('Cast'), Array.from(cast.values())) : null,
        crew.size ? peopleSection($L('Crew'), Array.from(crew.values())) : null,
        studioCards.length ? this.studiosSection() : null,
      ].filter(Boolean),
    }
  }

  playlistOrderCard() {
    const { playlistItems = [], collectionItems = [], playlistSort, serverUrl, item, fallbackImageUrl } = this.s
    const tracks = collectionPlaylistItems(playlistItems, collectionItems)
    if (!tracks.length) return null
    const collectionImageUrl = spotlightLandscapeImageUrl(serverUrl, item, { fallbackUrl: fallbackImageUrl })
    const trackImageUrls = tracks.map((t) => spotlightLandscapeImageUrl(serverUrl, t)).filter(Boolean)
    return {
      id: 'playlist_order', title: $L('Playlist Order'), subtitle: countLabel(tracks.length, $L('1 item'), $L('{count} items')),
      imageUrl: trackImageUrls.find((url) => url !== collectionImageUrl) || trackImageUrls[0] || fallbackImageUrl, icon: CARD_ICONS.playlistOrder,
      headerAction: playlistSort ? { label: playlistSort.label, id: 'sort' } : null,
      sections: [{
        kind: 'tracks', title: $L('Playlist Order'), count: tracks.length, tracks, showAlbum: true, isPlaylist: true,
        loading: Boolean(playlistSort && playlistSort.loading && !playlistItems.length), opensItems: !playlistItems.length,
      }],
    }
  }
}

export const spotlightCardsFor = (state) => new CardBuilder(state).build()
export const spotlightCardFor = (id, state) => new CardBuilder(state).buildOne(id)
