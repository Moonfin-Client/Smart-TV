// Which item's image a result card shows, and of what type. An episode, program or recording with
// no still of its own shows its thumbnail, then its backdrop, then its series' thumbnail, backdrop
// or poster. A season with no poster shows its series', and a track its album's.
export const searchArtworkSource = (item) => {
  const primary = (item.ImageTags && item.ImageTags.Primary) || item.PrimaryImageTag
  if (primary) return { id: item.Id, type: 'Primary', tag: primary }
  const seriesPoster = item.SeriesId && item.SeriesPrimaryImageTag
    ? { id: item.SeriesId, type: 'Primary', tag: item.SeriesPrimaryImageTag }
    : null
  if (item.Type === 'Episode' || item.Type === 'Program' || item.Type === 'Recording') {
    if (item.ImageTags && item.ImageTags.Thumb) return { id: item.Id, type: 'Thumb', tag: item.ImageTags.Thumb }
    if (item.BackdropImageTags && item.BackdropImageTags.length) return { id: item.Id, type: 'Backdrop', tag: item.BackdropImageTags[0] }
    if (item.ParentThumbItemId && item.ParentThumbImageTag) {
      return { id: item.ParentThumbItemId, type: 'Thumb', tag: item.ParentThumbImageTag }
    }
    if (item.ParentBackdropItemId && item.ParentBackdropImageTags && item.ParentBackdropImageTags.length) {
      return { id: item.ParentBackdropItemId, type: 'Backdrop', tag: item.ParentBackdropImageTags[0] }
    }
    if (seriesPoster) return seriesPoster
  }
  if (item.Type === 'Season' && seriesPoster) return seriesPoster
  if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
    return { id: item.AlbumId, type: 'Primary', tag: item.AlbumPrimaryImageTag }
  }
  return null
}

export const searchArtworkOptions = (aspect, tag) => {
  const options = aspect === 'poster' ? { maxHeight: 300 } : { maxWidth: 400 }
  options.quality = 80
  if (tag) options.tag = tag
  return options
}

// The page's scroll after focusing a box from `top` to `bottom` (page coordinates) in a 1080 tall
// view: no move when the box shows whole, the nearest edge when part of it shows, and centered
// when none of it does.
export const focusScroll = (scroll, top, bottom, contentH, viewH = 1080) => {
  const max = Math.max(0, contentH - viewH)
  let next = scroll
  if (bottom <= scroll || top >= scroll + viewH) next = (top + bottom) / 2 - viewH / 2
  else if (top < scroll) next = top
  else if (bottom > scroll + viewH) next = bottom - viewH
  return Math.max(0, Math.min(max, next))
}
