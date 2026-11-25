// A comic or PDF page is saved a moment after the reader settles on it and again on close, and the
// book is marked read at 98 percent. The page it opened on counts as saved, so just opening a book
// writes nothing.
import { getApiForItem } from '../../../services/connectionPool.js'
import { api as activeApi } from '../../../services/jellyfinApi.js'
import { TICKS_PER_PAGE } from '../../../utils/books.js'

const PLAYED_SHARE = 0.98

export const pageProgress = (item) => {
  let saved = null
  let latest = { page: 0, count: 0 }
  let timer = null

  const flush = () => {
    clearTimeout(timer)
    const { page, count } = latest
    if (count <= 0 || saved === null || page === saved) return
    saved = page
    const api = getApiForItem(item) || activeApi
    api
      .setPlaybackPosition(item.Id, page * TICKS_PER_PAGE)
      .then(() => ((page + 1) / count >= PLAYED_SHARE ? api.setWatched(item.Id, true) : null))
      .catch(() => {})
  }

  return {
    update(page, count) {
      latest = { page, count }
      if (count <= 0) return
      if (saved === null) saved = page
      clearTimeout(timer)
      timer = setTimeout(flush, 1500)
    },
    flush,
  }
}
