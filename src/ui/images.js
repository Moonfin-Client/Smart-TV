// Jellyfin image URLs for cards and backdrops, sized for the 1920x1080 stage. Images are
// served without auth, so the renderer can load them straight from the server.
import { getImageUrl, getBackdropId } from '../utils/helpers.js'
import { getServerUrl } from '../services/jellyfinApi.js'

const server = () => getServerUrl()

export const posterUrl = (item, maxHeight = 360) => {
  if (!item) return ''
  if (item.ImageTags && item.ImageTags.Primary) {
    return getImageUrl(server(), item.Id, 'Primary', { maxHeight, quality: 80, tag: item.ImageTags.Primary })
  }
  if (item.SeriesId && item.SeriesPrimaryImageTag) {
    return getImageUrl(server(), item.SeriesId, 'Primary', { maxHeight, quality: 80, tag: item.SeriesPrimaryImageTag })
  }
  if (item.AlbumId && item.AlbumPrimaryImageTag) {
    return getImageUrl(server(), item.AlbumId, 'Primary', { maxHeight, quality: 80, tag: item.AlbumPrimaryImageTag })
  }
  return ''
}

export const thumbUrl = (item, maxWidth = 480) => {
  if (!item) return ''
  if (item.ImageTags && item.ImageTags.Thumb) {
    return getImageUrl(server(), item.Id, 'Thumb', { maxWidth, quality: 80, tag: item.ImageTags.Thumb })
  }
  if (item.Type === 'Episode' && item.ImageTags && item.ImageTags.Primary) {
    return getImageUrl(server(), item.Id, 'Primary', { maxWidth, quality: 80, tag: item.ImageTags.Primary })
  }
  if (item.ParentThumbItemId && item.ParentThumbImageTag) {
    return getImageUrl(server(), item.ParentThumbItemId, 'Thumb', { maxWidth, quality: 80, tag: item.ParentThumbImageTag })
  }
  const back = backdropUrl(item, maxWidth)
  return back || posterUrl(item, Math.round(maxWidth * 1.5))
}

// Low tiers decode the backdrop on the main thread, so it stays small. It sits behind a scrim.
export const backdropUrl = (item, maxWidth = 960) => {
  const id = getBackdropId(item)
  if (!id) return ''
  const tag = id === item.Id ? item.BackdropImageTags[0] : item.ParentBackdropImageTags && item.ParentBackdropImageTags[0]
  return getImageUrl(server(), id, 'Backdrop', { maxWidth, quality: 70, tag })
}

export const logoUrl = (item, maxWidth = 600) => {
  if (!item) return ''
  if (item.ImageTags && item.ImageTags.Logo) {
    return getImageUrl(server(), item.Id, 'Logo', { maxWidth, quality: 90, tag: item.ImageTags.Logo })
  }
  if (item.ParentLogoItemId && item.ParentLogoImageTag) {
    return getImageUrl(server(), item.ParentLogoItemId, 'Logo', { maxWidth, quality: 90, tag: item.ParentLogoImageTag })
  }
  return ''
}

export const userImageUrl = (serverUrl, userId, tag) =>
  tag ? `${serverUrl}/Users/${userId}/Images/Primary?maxHeight=200&quality=90&tag=${tag}` : ''
