// The photo viewer's list and slideshow rules.

export const FADE_MS = 1000
export const INFO_MS = 4000
// The viewer asks for more of the folder once it gets this close to the end of what's loaded.
export const PREFETCH_AHEAD = 25

// What the viewer steps through: the photos and videos of the folder, or just the opened item.
export const viewerItems = (items, item) => {
  if (items && items.length > 0) return items.filter((i) => i.Type === 'Photo' || i.Type === 'Video')
  return item ? [item] : []
}

// A video only plays in a slideshow when videos are on, otherwise it counts as a still.
export const isSlideshowVideo = (entry, videos) => Boolean(entry) && entry.Type === 'Video' && videos !== false

// A slideshow needs somewhere to go, so a folder with a lone photo has none.
export const canStartSlideshow = (list, index, videos) => {
  const current = list[index]
  if (!current || current.Type !== 'Photo') return false
  return list.filter((entry) => entry.Type === 'Photo' || isSlideshowVideo(entry, videos)).length > 1
}

// The index one step on, wrapping. Auto advance passes skipVideos to pass over videos that are switched
// off. It can't loop forever, since the slideshow starts on a photo.
export const stepIndex = (list, index, dir, skipVideos = false) => {
  const count = list.length
  if (count === 0) return -1
  let next = index
  for (let i = 0; i < count; i += 1) {
    next = (next + dir + count) % count
    if (!skipVideos || list[next].Type !== 'Video') return next
  }
  return index
}

// How many more photos and videos the folder holds than the viewer has: the library's exact count when it
// has one, otherwise the items it hasn't fetched yet.
export const moreCount = (paging, photoCount, shown) => {
  if (paging.loaded >= paging.total) return 0
  if (!photoCount) return paging.total - paging.loaded
  return Math.max(1, photoCount - shown)
}

// The bottom bar's rows from the top, stacked like block layout: 33 px lines, the margins collapsing
// into each other, the slideshow button's own margin kept inside its line, and 30 px of padding all around.
export const bottomBar = ({ date, meta, button, hint }) => {
  const rows = [{ key: 'name', h: 33, mt: 0, mb: 6 }]
  if (date) rows.push({ key: 'date', h: 33, mt: 0, mb: 4 })
  if (meta) rows.push({ key: 'meta', h: 33, mt: 0, mb: 10 })
  if (button) rows.push({ key: 'button', h: 69, mt: 0, mb: 0 })
  if (hint) rows.push({ key: 'hint', h: 33, mt: 10, mb: 0 })
  let y = 30
  const at = {}
  rows.forEach((r, i) => {
    if (i > 0) y += Math.max(rows[i - 1].mb, r.mt)
    at[r.key] = y
    y += r.h
  })
  const height = y + rows[rows.length - 1].mb + 30
  const top = 1080 - height
  Object.keys(at).forEach((k) => {
    at[k] += top
  })
  return { top, height, at }
}
