import { getImageUrl } from '../../../utils/helpers.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'

export const trackArt = (t, maxHeight = 600) => {
  if (!t) return ''
  const base = t._serverUrl || getServerUrl()
  if (t.ImageTags && t.ImageTags.Primary) return getImageUrl(base, t.Id, 'Primary', { maxHeight, quality: 90 }) || ''
  if (t.AlbumId && t.AlbumPrimaryImageTag)
    return getImageUrl(base, t.AlbumId, 'Primary', { maxHeight, quality: 90, tag: t.AlbumPrimaryImageTag }) || ''
  return ''
}
