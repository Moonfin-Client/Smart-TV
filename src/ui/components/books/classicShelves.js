import $L from '../../../services/i18n.js'
import { api, getServerUrl } from '../../../services/jellyfinApi.js'
import {
  SCOPE_ALL,
  SCOPE_AUDIOBOOKS,
  SCOPE_BOOKS,
  SCOPE_COMICS,
  combinedTypes,
  isAudiobookItem,
  isAudiobookLibrary,
  isComicItem,
  isEbookItem,
  matchesScope,
  scopedTypes,
} from '../../../utils/bookLibrary.js'
import { getImageUrl } from '../../../utils/helpers.js'
import { fontFor } from '../../text.js'
import { ellipsize } from './bookText.js'
import { BOOK_FIELDS, loadBookRow } from './bookLibraryData.js'
import { TITLES, screenFor } from './bookScreens.js'

export const CARD_W = 198
const GENRE_CHIPS = 15

const compareLower = (a, b) => {
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  if (left < right) return -1
  return left > right ? 1 : 0
}
export const bySortName = (a, b) => compareLower(a.SortName || a.Name || '', b.SortName || b.Name || '')
export const byName = (a, b) => compareLower(a.Name || '', b.Name || '')

// The rows only Classic shows, read once per library. Comics are typed Book, so they're split out
// of the book rows here.
export const loadClassicRows = async (library) => {
  const audioLibrary = isAudiobookLibrary(library)
  const audioTypes = scopedTypes(library, SCOPE_AUDIOBOOKS)
  const row = (params) => loadBookRow(api, Object.assign({ ParentId: library.Id, Fields: BOOK_FIELDS + ',SortName' }, params))
  const none = Promise.resolve([])
  const [latestBookRow, latestAudioRow, lastPlayed, allBookRow, allAudioRow, allRow] = await Promise.all([
    audioLibrary ? none : row({ IncludeItemTypes: 'Book', SortBy: 'DateCreated', SortOrder: 'Descending' }),
    row({ IncludeItemTypes: audioTypes, SortBy: 'DateCreated', SortOrder: 'Descending' }),
    audioLibrary ? row({ IncludeItemTypes: audioTypes, Filters: 'IsPlayed', SortBy: 'DatePlayed', SortOrder: 'Descending' }) : none,
    audioLibrary ? none : row({ IncludeItemTypes: 'Book', SortBy: 'SortName', SortOrder: 'Ascending' }),
    row({ IncludeItemTypes: audioTypes, SortBy: 'SortName', SortOrder: 'Ascending' }),
    row({ IncludeItemTypes: combinedTypes(library), SortBy: 'SortName', SortOrder: 'Ascending' }),
  ])
  const latestBooks = latestBookRow.filter(isEbookItem)
  const latestComics = latestBookRow.filter(isComicItem)
  const latestAudiobooks = latestAudioRow.filter(isAudiobookItem)
  const ebooks = allBookRow.filter(isEbookItem)
  const allBooks = ebooks.length || !latestBooks.length ? ebooks : latestBooks
  const audiobooks = allAudioRow.filter(isAudiobookItem)
  const allAudiobooks = audiobooks.length || !latestAudiobooks.length ? audiobooks : latestAudiobooks
  const comicsFromAll = allRow.filter(isComicItem)
  const combined = allBooks.concat(allAudiobooks, comicsFromAll).sort(bySortName)
  const comics = {}
  const comicList = []
  latestComics.concat(comicsFromAll).forEach((c) => {
    if (comics[c.Id]) return
    comics[c.Id] = true
    comicList.push(c)
  })
  const hasComics = !audioLibrary && comicList.length > 0
  return {
    latestBooks,
    latestAudiobooks,
    latestComics: hasComics ? (latestComics.length ? latestComics : comicList) : [],
    lastPlayed,
    allBooks,
    allAudiobooks,
    allComics: hasComics ? comicList.slice().sort(bySortName) : [],
    all: combined.length ? combined : allRow,
  }
}

const authorNames = (titles) => {
  const names = {}
  const ids = {}
  titles.forEach((title) => {
    ;(title.People || []).forEach((person) => {
      if (person.Type !== 'Author' && person.Role !== 'Author') return
      if (person.Name) names[person.Name.toLowerCase()] = true
      if (person.Id) ids[person.Id] = true
    })
    if (title.AlbumArtist) names[title.AlbumArtist.toLowerCase()] = true
    ;(title.Artists || []).forEach((artist) => (names[String(artist).toLowerCase()] = true))
  })
  return { names, ids }
}

// The authors a format's titles credit. An audiobook scope also keeps anyone no book credits.
export const scopedAuthors = (authors, titles, scope) => {
  if (scope === SCOPE_ALL) return authors
  if (scope === SCOPE_COMICS) return []
  const books = authorNames(titles.filter(isEbookItem))
  const credits = (author, set) => !!(set.names[String(author.Name || '').toLowerCase()] || set.ids[author.Id])
  if (scope === SCOPE_BOOKS) return authors.filter((author) => credits(author, books))
  const audio = authorNames(titles.filter(isAudiobookItem))
  return authors.filter((author) => credits(author, audio) || !credits(author, books))
}

// The shelves for a format, each with where its See All goes. Empty ones drop out.
export const classicShelves = ({ library, scope, mixed, data, extra, series, authors }) => {
  const all = scope === SCOPE_ALL
  const audioLibrary = isAudiobookLibrary(library)
  const showBooks = all || scope === SCOPE_BOOKS
  const showAudiobooks = all || scope === SCOPE_AUDIOBOOKS
  const showComics = all || scope === SCOPE_COMICS
  const scoped = (items) => (all ? items : items.filter((item) => matchesScope(item, scope)))
  const mixFormats = mixed && all
  const titlesIn = (shelfScope, sort) => screenFor(TITLES, mixed ? shelfScope : SCOPE_ALL, sort)

  let last
  if (scope === SCOPE_BOOKS) last = { id: 'allBooks', title: $L('Books'), items: extra.allBooks, seeAll: titlesIn(SCOPE_BOOKS, 'name') }
  else if (scope === SCOPE_AUDIOBOOKS) last = { id: 'allAudiobooks', title: $L('Audiobooks'), items: extra.allAudiobooks, seeAll: titlesIn(SCOPE_AUDIOBOOKS, 'name') }
  else if (scope === SCOPE_COMICS) last = { id: 'allComics', title: $L('Comics'), items: extra.allComics, seeAll: titlesIn(SCOPE_COMICS, 'name') }
  else {
    const title = mixed ? $L('All Titles') : audioLibrary ? $L('Audiobooks') : $L('Books')
    last = { id: 'allTitles', title, items: extra.all, seeAll: titlesIn(SCOPE_ALL, 'name'), mixFormats }
  }

  return [
    { id: 'resume', title: audioLibrary ? $L('Continue Listening') : $L('Continue Reading'), items: scoped(data.resume), seeAll: titlesIn(scope, 'datePlayed'), mixFormats },
    showBooks && !audioLibrary && { id: 'latestBooks', title: $L('Latest Books'), items: extra.latestBooks, seeAll: titlesIn(SCOPE_BOOKS) },
    showAudiobooks && { id: 'latestAudiobooks', title: $L('Latest Audiobooks'), items: extra.latestAudiobooks, seeAll: titlesIn(SCOPE_AUDIOBOOKS) },
    showComics && !audioLibrary && { id: 'latestComics', title: $L('Latest Comics'), items: extra.latestComics, seeAll: titlesIn(SCOPE_COMICS) },
    all && { id: 'lastPlayed', title: $L('Last Played'), items: extra.lastPlayed, seeAll: titlesIn(SCOPE_AUDIOBOOKS, 'datePlayed') },
    all && { id: 'series', title: $L('Series'), items: series, seeAll: { id: 'series' } },
    { id: 'authors', title: $L('Authors'), items: authors, kind: 'avatar' },
    all && { id: 'genres', title: $L('Genres'), items: data.genres.slice(0, GENRE_CHIPS), kind: 'chip', seeAll: { id: 'genres' } },
    all && { id: 'collections', title: $L('Collections'), items: data.collections, seeAll: { id: 'collections' } },
    all && { id: 'favorites', title: $L('Favorites'), items: data.favorites, seeAll: { id: 'favorites' }, mixFormats },
    last,
  ].filter((shelf) => shelf && shelf.items.length > 0)
}

// A genre chip drawn as a card the shelf can lay out.
export const chipCard = (item, i) =>
  ({
    kind: 'chip',
    key: item.Id + ':' + i,
    raw: item,
    w: 250,
    h: 73 - 78,
    label: ellipsize(item.Name || '', 22, 'bold', 204),
    labelFont: fontFor(item.Name || '', 'bold'),
  })
// The portrait when the item lists one, otherwise a lettered placeholder with the name in capitals.
export const avatarCard = (item, i) => {
  const name = (item.Name || '').toUpperCase()
  return {
    image: item.ImageTags && item.ImageTags.Primary ? getImageUrl(item._serverUrl || getServerUrl(), item.Id, 'Primary', { maxHeight: 300, quality: 80 }) : '',
    kind: 'avatar',
    key: (item.Id || item.Name) + ':' + i,
    raw: item,
    w: CARD_W,
    h: CARD_W,
    title: ellipsize(item.Name || '', 20, 'medium', CARD_W),
    titleFont: fontFor(item.Name || '', 'medium'),
    name,
    nameFont: fontFor(name, 'bold'),
  }
}
