import { isGameLibrary, resolveGameLibraryId } from '../utils/gameLibrary.js'
import { gamePath } from '../pages/Games/gameModels.js'

const SERVER_KEYS = ['_serverId', '_serverName', '_serverUrl', '_serverUserId', '_serverAccessToken', '_serverType']

// The server an item from another server came from, or null for the signed-in one's. Details reads
// the item, its images and its children through it.
export const serverOf = (item) => {
  if (!item || !item._serverUrl || !item._serverAccessToken) return null
  const server = {}
  SERVER_KEYS.forEach((k) => {
    if (item[k] !== undefined) server[k] = item[k]
  })
  return server
}

// What comes from `item`'s server keeps that server, so its cards draw and open there too. Lists of
// items, and entries holding `items`, are tagged one level down.
export const withServer = (item, value) => {
  const tags = serverOf(item)
  if (!tags) return value
  const tag = (v) => {
    if (Array.isArray(v)) return v.map(tag)
    if (!v || typeof v !== 'object') return v
    if (v.Id) return { ...v, ...tags }
    return Array.isArray(v.items) ? { ...v, items: tag(v.items) } : v
  }
  return tag(value)
}

// What a page opening `item` on Details passes along.
export const detailsData = (item) => {
  const server = serverOf(item)
  return server ? { server } : {}
}

// Where a library opens, by its collection type. A game library is whichever the Moonfin plugin
// lists, and opens under the plugin's own id for it.
export const routeForLibrary = (lib) => {
  if (lib && isGameLibrary(lib.Id, lib.CollectionType, lib.Name)) return `/games/${encodeURIComponent(resolveGameLibraryId(lib))}`
  switch (lib && lib.CollectionType) {
    case 'music':
      return `/music/${lib.Id}`
    case 'livetv':
      return '/livetv'
    case 'photos':
    case 'homevideos':
      return `/photos/${lib.Id}`
    case 'books':
      return `/books/${lib.Id}`
    default:
      return `/library/${lib.Id}`
  }
}

// Where a card opens, by item type. Returns [path, data].
export const routeForItem = (item) => {
  if (!item) return ['/home', {}]
  // A Moonbase game from a Home row, which carries its library.
  if (item.isGame && item._library) return [gamePath(item._library.Id, item.id), { game: item }]
  switch (item.Type) {
    case 'MusicAlbum':
    case 'Audio':
      return [`/album/${item.Id}`, {}]
    case 'MusicArtist':
      return [`/artist/${item.Id}`, {}]
    case 'Person':
      return [`/person/${item.Id}`, {}]
    case 'TvChannel':
      return [`/player/${item.Id}`, { live: true }]
    case 'CollectionFolder':
    case 'UserView':
      return [routeForLibrary(item), {}]
    case 'Folder':
      return [`/library/${item.Id}`, {}]
    case 'PhotoAlbum':
      return [`/photos/${item.Id}`, {}]
    case 'Book':
      return [`/read/${item.Id}`, {}]
    case 'Playlist':
      return item.MediaType === 'Audio' ? [`/album/${item.Id}`, {}] : [`/details/${item.Id}`, detailsData(item)]
    default:
      return [`/details/${item.Id}`, detailsData(item)]
  }
}

// For Play on a card's menu, Default Action Play and a Smart Hub tile: a title opens its page with
// autoPlay, which starts it there, so Back from the player lands on that page. A song plays straight away, and whatever has no page opens as a pick would.
export const playRoute = (item) => {
  if (item && item.Type === 'Audio') return [`/player/${item.Id}`, detailsData(item)]
  const [path, data] = routeForItem(item)
  return /^\/(details|album)\//.test(path) ? [path, { ...data, autoPlay: true }] : [path, data]
}
