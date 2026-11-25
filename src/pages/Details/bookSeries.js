// A book series has no server item of its own, so its page opens on its featured book and carries the
// series beside it. The series travels by key rather than as a router prop, since its books are deep
// server items the legacy reactivity would walk.
import { featuredBook, readingOrder } from '../../ui/components/books/bookScreens.js'

const held = new Map()

export const openBookSeries = (router, series) => {
  const members = readingOrder((series && series.Members) || [])
  const book = featuredBook(members)
  if (!book) return false
  held.set(series.Id, { ...series, Members: members })
  router.to(`/details/${book.Id}`, { bookSeries: series.Id })
  return true
}

export const bookSeriesFor = (key) => (key && held.get(key)) || null
