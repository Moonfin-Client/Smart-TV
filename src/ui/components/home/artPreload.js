// The art the cards beside focus show once focused, loaded ahead so a move along a row draws it at
// once. The card in the direction of travel goes first, so on fast moves it starts before the one
// behind. A card counts only where its focused art differs from its poster, plus `panelOf(item)` (a
// Carousel row's panel backdrop) when given. The focused card loads its own art itself.
export const preloadUrls = (cards, cur, dir, panelOf) => {
  const step = dir < 0 ? -1 : 1
  const at = cards[cur]
  const own = at ? [at.wide, panelOf ? panelOf(at.raw) : ''] : []
  const urls = []
  for (const i of [cur + step, cur - step]) {
    const c = cards[i]
    if (!c) continue
    for (const url of [c.wide !== c.rest ? c.wide : '', panelOf ? panelOf(c.raw) : '']) {
      if (url && own.indexOf(url) < 0 && urls.indexOf(url) < 0) urls.push(url)
    }
  }
  return urls
}
