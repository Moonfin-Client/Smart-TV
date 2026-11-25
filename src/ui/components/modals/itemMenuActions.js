// What a card's long press menu offers, with the glyphs as icon names from public/icons/d.
import $L from '../../../services/i18n.js'

export const MEDIA_TYPES = ['Movie', 'Episode', 'Series', 'Season', 'Audio', 'MusicAlbum', 'BoxSet']
const IDENTIFIABLE_TYPES = ['Movie', 'Series', 'Season', 'Episode', 'BoxSet', 'Person', 'MusicAlbum', 'MusicArtist', 'Book', 'Trailer', 'MusicVideo']
const SILO_ADMIN_TYPES = ['Movie', 'Series', 'Season', 'Episode']
const ARTWORK_FOLDER_TYPES = ['Folder', 'CollectionFolder', 'UserView', 'Genre', 'MusicGenre', 'Studio', 'Network']

const hasProgress = (item) => {
  const ud = item.UserData || {}
  if (item.Type === 'Series') {
    const total = item.RecursiveItemCount || 0
    const unplayed = ud.UnplayedItemCount != null ? ud.UnplayedItemCount : total
    return !ud.Played && unplayed > 0 && unplayed < total
  }
  return (ud.PlayedPercentage || 0) > 0 || (ud.PlaybackPositionTicks || 0) > 0
}

// `playlist` is set when the menu opened on a playlist's row: `canManage` adds the entries that
// change the playlist, `canRemove` is false where a row can move but not leave, `canMove` is false
// while the rows show another order, and `first` and `last` say which way the row can still move.
export const itemMenuActions = (item, {
  isAdmin = false, isJellyfin = true, isSilo = false, canManageCollections = false, inCollection = false, playlist = null,
  playlistMemberships = [], collectionMemberships = [], isContinueWatchingOrNextUp = false, playImmediately = false,
} = {}) => {
  if (!item) return []
  const type = item.Type
  const ud = item.UserData || {}
  const played = Boolean(ud.Played)
  const hasSeries = Boolean(item.SeriesId)
  const out = []
  if (MEDIA_TYPES.indexOf(type) !== -1) {
    if (isContinueWatchingOrNextUp && playImmediately) {
      if (type !== 'Audio') out.push({ id: 'viewDetails', icon: 'menu_info', label: $L('Go to Details') })
    } else {
      out.push({ id: 'play', icon: 'play', label: hasProgress(item) ? $L('Resume') : $L('Play') })
      if (playlist && type !== 'Audio') out.push({ id: 'viewDetails', icon: 'menu_info', label: $L('View Details') })
    }
    out.push({ id: 'watched', icon: played ? 'menu_visibilityOff' : 'menu_visibility', label: played ? $L('Mark as Unwatched') : $L('Mark as Watched') })
    if ((ud.PlaybackPositionTicks || 0) > 0 && !played) out.push({ id: 'hideContinueWatching', icon: 'menu_visibilityOff', label: $L('Hide from Continue Watching') })
    if (type === 'Episode' && hasSeries) out.push({ id: 'hideNextUp', icon: 'menu_visibilityOff', label: $L('Hide from Next Up') })
    out.push({ id: 'favorite', icon: ud.IsFavorite ? 'favorite' : 'menu_favoriteBorder', label: ud.IsFavorite ? $L('Remove from Favorites') : $L('Add to Favorites') })
    if (canManageCollections) {
      out.push({ id: 'addToCollection', icon: 'collection', label: $L('Add to Collection') })
      if (inCollection || collectionMemberships.length > 0) out.push({ id: 'removeFromCollection', icon: 'menu_playlistRemove', label: $L('Remove from Collection') })
    }
    out.push({ id: 'addToPlaylist', icon: 'playlist', label: $L('Add to Playlist') })
    if (playlist && playlist.canManage) {
      if (playlist.canRemove !== false) out.push({ id: 'removeFromPlaylist', icon: 'menu_playlistRemove', label: $L('Delete from Playlist') })
      const canMove = playlist.canMove !== false
      if (canMove && !playlist.first) out.push({ id: 'moveUp', icon: 'menu_arrowUpward', label: $L('Move Up') })
      if (canMove && !playlist.last) out.push({ id: 'moveDown', icon: 'menu_arrowDownward', label: $L('Move Down') })
    }
    // The playlists the item is in, unless this row already offers to take it out of its own.
    if ((!(playlist && playlist.canManage) || playlist.canRemove === false) && playlistMemberships.length > 0) {
      out.push({ id: 'removeFromPlaylistPicker', icon: 'menu_playlistRemove', label: $L('Remove from Playlist') })
    }
    if ((isJellyfin || (isSilo && SILO_ADMIN_TYPES.indexOf(type) >= 0)) && isAdmin) {
      out.push({ id: 'refreshMetadata', icon: 'menu_refresh', label: $L('Refresh Metadata') })
      if (IDENTIFIABLE_TYPES.indexOf(type) !== -1) out.push({ id: 'identify', icon: 'menu_search', label: $L('Identify') })
    }
  }
  const artworkType = MEDIA_TYPES.indexOf(type) !== -1 || ARTWORK_FOLDER_TYPES.indexOf(type) !== -1
  if (((artworkType && isJellyfin) || (isSilo && SILO_ADMIN_TYPES.indexOf(type) >= 0)) && isAdmin) {
    out.push({ id: 'changeArtwork', icon: 'artwork', label: $L('Change Artwork') })
  }
  if (type === 'Episode' && hasSeries) out.push({ id: 'goToSeries', icon: 'series', label: $L('Go to Series') })
  return out
}
