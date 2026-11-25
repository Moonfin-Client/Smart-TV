// The lines Stage, Premiere and Quick Look share: the facts line, the codec chips and the ratings,
// laid out as display lists. `center` lines each wrapped line up in the middle, for Premiere.
import { cssShift, fontFor, themeSpacing } from '../../../ui/text.js'
import { textWidth } from '../../../ui/components/details/measure.js'
import { metaPieces, ratingValues } from '../modern/meta.js'
import { ratingEntries, ratingsRow } from '../modern/hero.js'

// A Seerr title's TMDB art has no server blur, so a small size of it stands in for one.
// shortcut: w300 stretched is softer than sharp but not a 20px blur, draw a real blur if it reads too crisp.
export const softExternal = (url, blur) => (blur > 0 && /image\.tmdb\.org|\/t\/p\/w\d+\//.test(url) ? url.replace(/\/w\d+\//, '/w300/') : url)

// A width with the element's own letter spacing `ls`, which replaces the Neon Pulse body's 0.6px
// that textWidth counts in that face. No `ls` keeps the inherited spacing.
const spacedW = (str, size, weight, ls) => {
  const s = String(str)
  const inherit = /^neon-/.test(fontFor(s, weight)) ? themeSpacing() : 0
  return textWidth(s, size, weight) + (ls ? (ls - inherit) * s.length : 0)
}

export const txt = (out, k, x, y, str, size, weight, color, extra) => {
  out.texts.push({ k, x: Math.round(x * 100) / 100, y: y + cssShift(size), text: str, size, font: fontFor(str, weight), color, lh: 0, ...extra })
}

// Wraps items into lines, then hands each one its place. `items` carry w and h.
const flow = (items, maxW, gapX, center) => {
  const lines = []
  let line = []
  let x = 0
  items.forEach((it) => {
    const need = (line.length ? gapX : 0) + it.lead + it.w
    if (line.length && x + need > maxW) {
      lines.push({ items: line, w: x })
      line = []
      x = 0
    }
    line.push({ ...it, x: x + (line.length ? gapX : 0) })
    x += line.length > 1 ? need : it.lead + it.w
  })
  if (line.length) lines.push({ items: line, w: x })
  return lines.map((ln) => ({ ...ln, shift: center ? (maxW - ln.w) / 2 : 0, h: Math.max(...ln.items.map((it) => it.h)) }))
}

const BULLET = '•'

// Stage's facts: no episode number, genres split by bullets, the file size trailing, a bullet
// before every piece but the first, the parental rating on a tinted badge.
export const stagePieces = (v) => {
  const it = v.item
  const L = v.lists
  const pieces = metaPieces({
    item: it.Type === 'Episode' ? { ...it, ParentIndexNumber: null } : it, settings: v.settings, year: it.ProductionYear || '',
    officialRating: it.OfficialRating || '', runtime: v.runtime, endsAt: v.endsAt, seasonCount: it.ChildCount || L.seasons.length || 0,
    genres: it.Genres || [], episodes: L.episodes, episodeRatings: L.episodeRatings, playlistTracks: v.playlistTracks || [],
    upcomingText: v.upcoming, seerr: v.seerr,
  })
  const genres = (it.Genres || []).slice(0, 3)
  const out = pieces.map((p) => {
    if (p.kind === 'text' && genres.length && p.text === genres.join(' · ')) return { ...p, text: genres.join(' • ') }
    if (p.kind === 'text' && it.OfficialRating && p.text === it.OfficialRating) return { ...p, rating: true }
    return p
  })
  if (v.techSize) out.push({ kind: 'text', text: v.techSize })
  return out
}

// The facts line's text shadow, which the status and upcoming badges turn off.
const META_SHADOW = { color: '#00000080', x: 0, y: 1, blur: 4 }

// The facts line at 20px bold on a 32px line. Returns its height.
export const stageMetaLine = (out, pieces, x0, y0, maxW, t, { center = false, k = 'm', ls = 0 } = {}) => {
  const tw = (str, size, weight) => spacedW(str, size, weight, ls)
  const bulletW = 10 + tw(BULLET, 20) + 10
  const items = pieces.map((p, i) => {
    let w
    let h = 32
    if (p.kind === 'seerr') {
      w = 10 + p.pills.reduce((sum, pill, j) => sum + (j ? 12 : 0) + 32 + tw(pill.text, 19, 'bold'), 0)
      h = 44
    } else if (p.rating || p.kind === 'status') w = 20 + tw(p.text, 18, p.rating ? 'medium' : 'bold')
    else if (p.kind === 'upcoming') w = 20 + 24 + tw(p.text, 18, 'bold')
    else w = tw(p.text, 20, 'bold')
    return { p, lead: i ? bulletW : 0, w, h }
  })
  let y = y0
  flow(items, maxW, 0, center).forEach((ln, li) => {
    ln.items.forEach((it, ii) => {
      const key = `${k}${li}-${ii}`
      let x = x0 + ln.shift + it.x
      const iy = y + (ln.h - it.h) / 2
      if (it.lead) {
        txt(out, `${key}d`, x + 10, y + (ln.h - 32) / 2, BULLET, 20, 'regular', '#ffffff99', { lh: 32, ls, shadow: META_SHADOW })
        x += it.lead
      }
      const p = it.p
      if (p.kind === 'seerr') {
        let px = x + 10
        p.pills.forEach((pill, j) => {
          const pw = 32 + tw(pill.text, 19, 'bold')
          out.rects.push({ k: `${key}p${j}`, x: px, y: iy, w: pw, h: 44, r: 9, color: pill.fill, bw: 1, bc: pill.border })
          txt(out, `${key}t${j}`, px + 16, iy + 5.5, pill.text, 19, 'bold', pill.ink, { lh: 33, ls, shadow: META_SHADOW })
          px += pw + 12
        })
      } else if (p.rating || p.kind === 'status' || p.kind === 'upcoming') {
        const by = y + (ln.h - 31.2) / 2
        const fill = p.rating ? t.accentA(0.15) : p.kind === 'upcoming' ? t.accent || '#00a4dcff' : p.ended ? '#b71c1cff' : '#2e7d32ff'
        out.rects.push({ k: `${key}b`, x, y: by, w: it.w, h: 31.2, r: 7, color: fill })
        let tx = x + 10
        if (p.kind === 'upcoming') {
          out.imgs.push({ k: `${key}i`, x: tx, y: by + 6.6, w: 18, h: 18, src: 'icons/d/calendar.webp', color: '#ffffffff' })
          tx += 24
        }
        txt(out, key, tx, by + 3, p.text, 18, p.rating ? 'medium' : 'bold', '#ffffffff', { lh: 25.2, ls, shadow: p.rating ? META_SHADOW : null })
      } else {
        txt(out, key, x, y + (ln.h - 32) / 2, p.text, 20, 'bold', '#ffffffff', { lh: 32, ls, shadow: META_SHADOW })
      }
    })
    y += ln.h
  })
  return y - y0
}

// The codec chips: 18px on a 1px outline, 10px apart and 7px between lines. Returns its height.
export const stageTechLine = (out, chips, x0, y0, maxW, { center = false, k = 'c', ls = 0 } = {}) => {
  if (!chips.length) return 0
  const items = chips.map((label) => ({ label, lead: 0, w: 26 + spacedW(label, 18, 'bold', ls), h: 35.2 }))
  let y = y0
  flow(items, maxW, 10, center).forEach((ln, li) => {
    ln.items.forEach((it, ii) => {
      const x = x0 + ln.shift + it.x
      out.rects.push({ k: `${k}${li}-${ii}r`, x, y, w: it.w, h: 35.2, r: 7, color: '#00000001', bw: 1, bc: '#ffffff4d' })
      txt(out, `${k}${li}-${ii}`, x + 13, y + 5, it.label, 18, 'bold', '#ffffffff', { lh: 25.2, ls })
    })
    y += 35.2 + 7
  })
  return y - 7 - y0
}

// The ratings row as Modern draws it, from the view the page hands over. `labels` false leaves the
// source names off, as Quick Look does.
export const stageRatings = (out, v, x0, y0, maxW, t, { center = false, labels } = {}) => {
  const s = v.settings
  const entries = ratingEntries(ratingValues(v.item, s, v.mdbRatings || []))
  if (!entries.length) return 0
  const style = { labels: labels === false ? false : s.showRatingLabels !== false, badges: s.showRatingBadges !== false }
  return ratingsRow(out, entries, x0, y0, maxW, style, t, center)
}
