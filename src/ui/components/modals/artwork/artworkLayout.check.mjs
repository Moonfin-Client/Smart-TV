// node src/ui/components/modals/artwork/artworkLayout.check.mjs
import assert from 'node:assert/strict'

const { artworkLayout, overlayLayout } = await import('./artworkLayout.js')

const measure = (t, size) => String(t || '').length * size * 0.5
const item = { Id: 'x', Type: 'Movie', Name: 'The Bourne Legacy', ImageTags: { Primary: 'p' }, BackdropImageTags: ['b'] }
const imgs = (n) => Array.from({ length: n }, (_, i) => ({ Url: `u${i}`, ProviderName: 'TheMovieDb', Width: 2000, Height: 3000 }))
const base = {
  item, view: 'main', categories: ['Primary', 'Backdrop', 'Banner'], remote: { Primary: imgs(5), Backdrop: imgs(34), Banner: [] }, loading: {},
  onlyLang: true, resolution: 'All', hasSources: true, canDelete: true, canBack: false, canForward: false, urlOf: () => 'img',
}

// The body starts at 250, Poster's row at 293 (cards at 297), Backdrops' at 608 and the
// first card focusable is the current poster.
const L = artworkLayout(base, measure)
assert.equal(L.bodyTop, 250)
assert.equal(L.body.rows[0].y, 47)
assert.equal(L.body.rows[1].y, 362)
const first = L.focusables.find((f) => f.kind === 'card')
assert.equal(first.id, 'card:Primary:c0')
// A current card's delete button follows it in the row, and View All sits right.
assert.equal(L.focusables[L.focusables.indexOf(first) + 1].id, 'del:card:Primary:c0')
const all = L.focusables.find((f) => f.id === 'all:Backdrop')
assert.equal(all.x + all.w, 1662)
// The row only previews eight, and Banner, empty, shows one empty card.
assert.equal(L.body.rows[1].cards.length, 1 + 8)
assert.equal(L.body.rows[2].cards[0].kind, 'empty')
// The disabled history buttons aren't focusable.
assert.deepEqual(L.focusables.filter((f) => f.zone === 'fixed').map((f) => f.id), ['close', 'sources', 'lang', 'clear'])

// The grid: eight 192.75 wide columns from 4 in, every image, and Back first.
const G = artworkLayout({ ...base, view: 'grid', gridCategory: 'Backdrop' }, measure)
assert.equal(G.bodyTop, 250)
const cards = G.body.cards
assert.equal(cards.length, 35)
assert.equal(Math.round((cards[1].x - cards[0].x) * 100) / 100, 208.75)
assert.equal(cards[8].y, cards[0].y + 158 + 16)
assert.equal(G.focusables[1].id, 'gridBack')

// The confirm panel is 550 by 191, the sources one grows with its list.
const c = overlayLayout({ kind: 'confirm', title: 'Confirm Delete', message: 'Are you sure?', confirmLabel: 'Delete' }, measure, (t) => [t])
assert.deepEqual([c.w, c.h], [550, 191])
const s = overlayLayout({ kind: 'sources', sources: ['A', 'B'], off: [] }, measure, (t) => [t])
assert.equal(s.h, 270)
console.log('artworkLayout ok')
