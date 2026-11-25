// Classic's own screens for a season, a person, a playlist and a track. Each returns what the page
// draws and the focus zones it moves through, top to bottom.
import $L from '../../../services/i18n.js'
import { fontFor, uiFont } from '../../../ui/text.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { formatDuration, getImageUrl } from '../../../utils/helpers.js'
import { personDateLines } from '../../../utils/personCredits.js'
import { offersFavorite } from '../personFavorite.js'
import { hidesMediaDescription } from '../detailsMedia.js'
import { ratingsRow } from '../modern/hero.js'
import { PAD_BOTTOM, PAD_TOP, badgeDot, collapse, img, layoutButtons, list, poster, rect, text } from './layout.js'
import { classicActions } from './actions.js'
import { compactAnimePills, mediaRowFor, scrollRowFor, thumbEntries } from './sections.js'

const VIEW_H = 1080
const BULLET = '•'
// The person's ring, tabs and buttons keep this blue on every theme.
export const STYLESHEET_ACCENT = '#00a4dcff'

// The facts as one bullet-led line, for the season header.
const bulletLine = (out, k, items, x0, y, t) => {
  const bulletW = 7 + textWidth(BULLET, 17, 'bold') + 7
  const tall = items.some((q) => q.badge)
  let x = x0
  items.forEach((p, i) => {
    if (i) {
      text(out, `${k}b${i}`, x + 7, y + (tall ? 3 : 0), BULLET, 17, 'bold', t.os(0.5))
      x += bulletW
    }
    if (p.badge) {
      const w = 18 + textWidth(p.text, 16, 'medium')
      rect(out, { k: `${k}r${i}`, x, y, w, h: 39, r: t.isPixel ? 0 : 6, color: t.os(0.15) })
      text(out, `${k}${i}`, x + 9, y + 3, p.text, 16, 'medium', t.os(0.9))
      x += w
    } else {
      text(out, `${k}${i}`, x, y + (tall ? 3 : 0), p.text, 17, 'bold', t.os(0.9))
      x += textWidth(p.text, 17, 'bold')
    }
  })
  return tall ? 39 : 33
}

// The poster beside a season or playlist header: 220 wide and as tall as its art, with 6px under it.
const sidePoster = (out, d, x, y, h, t) => {
  rect(out, { k: 'posterShadow', x, y, w: 220, h, r: 10, color: '#00000001', shadow: { color: '#00000066', x: 0, y: 8, blur: 24, spread: 0 } })
  img(out, { k: 'poster', x, y, w: 220, h, r: 10, src: d.posterUrl })
  const ud = d.item.UserData || {}
  if (ud.IsFavorite) badgeDot(out, 'posterFav', x + 8, y + 8, 30, t.recordingActive, 'icons/cls_heart.webp', 16, t.onBadge)
  if (ud.Played) badgeDot(out, 'posterWatched', x + 220 - 8 - 30, y + 8, 30, t.badgeWatched, 'icons/cls_check_compact.webp', 16, t.onBadge)
}
const posterH = (it) => (it.PrimaryImageAspectRatio ? 220 / it.PrimaryImageAspectRatio : it.Type === 'Playlist' ? 220 : 330)

// The poster and the text column, bottom aligned, 32px apart.
const sideHeader = (out, d, t, column) => {
  const shows = d.showsSection('poster') && d.posterUrl
  const ph = posterH(d.item)
  const x0 = d.left + (shows ? 220 + 32 : 0)
  const w = d.contentW - (shows ? 220 + 32 : 0)
  const h = column(list(), x0, 0, w)
  const headerH = Math.max(h, shows ? ph + 6 : 0)
  column(out, x0, PAD_TOP + headerH - h, w)
  if (shows) sidePoster(out, d, d.left, PAD_TOP + headerH - ph - 6, ph, t)
  return PAD_TOP + headerH
}

// The season screen: the season's poster and facts, its action tiles, then every episode as a wide row.
export const paintSeason = (comp, d) => {
  const t = comp.tokens
  const it = d.item
  const L = d.lists
  const out = list()
  const episodes = L.episodes
  const bottom = sideHeader(out, d, t, (o, x0, top, w) => {
    let y = top
    if (it.SeriesName) {
      text(o, 'series', x0, y, it.SeriesName, 22, 'medium', '#ffffff99')
      y += 33
    }
    const lines = wrapLines(it.Name || '', 48, 'bold', w)
    lines.forEach((ln, i) => text(o, `title${i}`, x0, y + i * 55.2, ln, 48, 'bold', t.onSurface, { lh: 55.2 }))
    y += lines.length * 55.2
    const facts = []
    if (it.ProductionYear) facts.push({ text: String(it.ProductionYear) })
    if (it.OfficialRating) facts.push({ text: it.OfficialRating, badge: true })
    facts.push({ text: `${episodes.length} ${episodes.length !== 1 ? $L('Episodes') : $L('Episode')}` })
    if (it.Genres && it.Genres.length) facts.push({ text: it.Genres.slice(0, 3).join(' • ') })
    y += 4 + bulletLine(o, 'facts', facts, x0, y + 4, t)
    if (d.ratings.length) y += 4 + ratingsRow(o, d.ratings, x0, y + 4, w, d.ratingStyle, t)
    return y + 8 - top
  })
  let y = bottom + 48
  let buttons = []
  if (episodes.length) {
    const row = classicActions(d.actionInput, d.tracks)
    comp.$parent._behind = row.behind
    const btn = layoutButtons(row.buttons, d.left, d.contentW, y, row.scroll)
    buttons = btn.placed
    y += btn.h + 36
  }
  const rows = []
  episodes.forEach((ep, i) => {
    const thumb = ep.ImageTags && ep.ImageTags.Primary ? getImageUrl(d.server, ep.Id, 'Primary', { maxWidth: 400, quality: 80 }) : ''
    const h = (thumb ? 197 : 190) + 2
    const runtime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : ''
    const rating = L.episodeRatings && L.episodeRatings[ep.IndexNumber] != null ? Number(L.episodeRatings[ep.IndexNumber]).toFixed(1) : ''
    const overview = ep.Overview && !hidesMediaDescription(ep, d.settings) ? ep.Overview : ''
    const ud = ep.UserData || {}
    const rateW = rating ? 17 + textWidth(rating, 14) : 0
    const runW = runtime ? textWidth(runtime, 16) : 0
    // The meta runs right-aligned and 10px apart: runtime, rating, then the compact anime markers.
    const anime = compactAnimePills(d.anime && d.anime.series, ep)
    // The text column takes only the width its widest line asks, so a short overview pulls the
    // meta in from the card's edge.
    const num = `${$L('Episode')} ${ep.IndexNumber || '?'}`.toUpperCase()
    const textW = d.contentW - 2 - 340 - 20
    const metaW = [runW, rateW, anime.w].filter(Boolean).reduce((sum, w, j) => sum + (j ? 10 : 0) + w, 0)
    const bodyW = Math.min(textW, Math.max(textWidth(num, 16, 'bold') + 0.5 * num.length + metaW, textWidth(ep.Name || '', 24, 'bold'), overview ? textWidth(overview, 20) : 0))
    const right = 1 + 340 + 20 + bodyW
    const metaRight = right - (anime.w ? anime.w + 10 : 0)
    rows.push({
      k: `sep${i}-${ep.Id}`, kind: 'seasonEp', title: '', x: d.left, y, h, cardsY: 0, clipX: 0, clipW: d.contentW, mode: 'none', entry: 0, container: false,
      cells: [{
        k: `se${i}`, kind: 'seasonEp', idx: 0, x: 0, w: d.contentW, h, cardH: h, item: ep, thumb, thumbH: h - 2,
        num, name: ep.Name || '', nameFont: fontFor(ep.Name || '', 'bold'),
        overview, overviewFont: fontFor(overview), textW,
        runtime, runX: metaRight - (rating ? rateW + 10 : 0) - runW, rating, rateX: metaRight - rateW,
        progress: Math.min(100, ud.PlayedPercentage || 0) / 100, played: !!ud.Played, fav: !!ud.IsFavorite,
        pills: anime.pills, pillsX: right - anime.w, pillsY: 19 - 23.5 / 2,
      }],
    })
    y += h + 12
  })
  if (episodes.length) y -= 12
  if (d.extras.length) {
    const r = scrollRowFor('extras', 'chapter', $L('Extras'), thumbEntries('ex', 'extra', d.extras, d.server), 16)
    r.x = d.left
    r.y = y
    r.clipW = d.contentW + 40
    rows.push(r)
    y += r.h
  }
  const zones = (buttons.length ? [{ kind: 'actions' }] : []).concat(rows.map((r, i) => ({ kind: 'row', i })))
  return { out, buttons, rows, zones, contentH: Math.max(VIEW_H, y + PAD_BOTTOM) }
}

// The person screen: the round photo, the name and dates, the biography that opens on Enter, Favorite
// and Display, then the filmography as tabs over one row. It's laid out in two parts, so switching
// tabs lays out only the tabs and the row under them.
export const paintPerson = (comp, d) => {
  const head = personHead(comp, d)
  return { ...personTabs(comp, head), out: head.out, pillsA: head.pills, head }
}

// Everything above the tabs: the photo, the name and facts, the ratings, the biography and the pills.
const personHead = (comp, d) => {
  const t = comp.tokens
  const it = d.item
  const out = list()
  const st = comp._person
  const left = d.left
  // The photo: 220 round inside a 3px accent ring, with 6px under it. Neon Pulse rings it in pink
  // and trades the shadow for a pink glow.
  const shadow = t.neon ? { color: '#ff2e9233', x: 0, y: 0, blur: 14, spread: 0 } : { color: '#00000080', x: 0, y: 8, blur: 32, spread: 0 }
  rect(out, { k: 'photoShadow', x: left, y: PAD_TOP, w: 226, h: 226, r: 113, color: '#00000001', shadow })
  if (it.ImageTags && it.ImageTags.Primary) img(out, { k: 'photo', x: left + 3, y: PAD_TOP + 3, w: 220, h: 220, r: 110, src: getImageUrl(d.server, it.Id, 'Primary', { maxHeight: 450, quality: 90 }) })
  else {
    rect(out, { k: 'photoPh', x: left + 3, y: PAD_TOP + 3, w: 220, h: 220, r: 110, color: '#ffffff14' })
    img(out, { k: 'photoIcon', x: left + 81, y: PAD_TOP + 81, w: 64, h: 64, src: 'icons/cls_person.webp', color: '#ffffff40' })
  }
  rect(out, { k: 'photoRing', x: left, y: PAD_TOP, w: 226, h: 226, r: 113, color: '#00000001', bw: 3, bc: t.neon ? '#ff2e9273' : STYLESHEET_ACCENT })

  const x0 = left + 220 + 40
  const w = d.contentW - 260
  let y = PAD_TOP + 16
  const lines = wrapLines(it.Name || '', 46, 'bold', w)
  lines.forEach((ln, i) => text(out, `title${i}`, x0, y + i * 57.5, ln, 46, 'bold', t.onSurface, { lh: 57.5 }))
  y += lines.length * 57.5 + 12
  const facts = personDateLines(it.PremiereDate, it.EndDate).concat(d.birthPlace ? [d.birthPlace] : [])
  let fx = x0
  facts.forEach((f, i) => {
    text(out, `fact${i}`, fx, y, f, 17, 'bold', t.os(0.9))
    fx += textWidth(f, 17, 'bold') + 12
  })
  y += 33
  let mb = 12
  if (d.ratings.length) {
    y += mb
    y += ratingsRow(out, d.ratings, x0, y, w, d.ratingStyle, t)
    mb = 0
  }

  // The biography in a box that takes focus: three lines, or all of it once opened.
  let ovZone = null
  // The biography wraps as one paragraph, with its line breaks folded into spaces.
  const bio = d.showsSection('biography') && it.Overview ? it.Overview.replace(/\s+/g, ' ').trim() : ''
  if (bio) {
    y += collapse(mb, 8)
    const all = wrapLines(bio, 20, 'regular', w - 24)
    const shown = st.expanded ? all.length : Math.min(3, all.length)
    const h = 8 + shown * 29 + 4 + 33 + 8
    comp.personOv = { show: true, x: x0, y, w, h, text: bio, font: fontFor(bio), lines: st.expanded ? 0 : 3, hint: st.expanded ? $L('Less') : $L('More'), hintY: 8 + shown * 29 + 4 }
    ovZone = { kind: 'personOv' }
    y += h
    mb = 0
  } else comp.personOv = { show: false, x: 0, y: 0, w: 0, h: 0, text: '', font: 'roboto', lines: 3, hint: '', hintY: 0 }

  y += collapse(mb, 16)
  const pillFont = uiFont('bold')
  const pills = []
  let px = x0
  const actionPill = (id, icon, label) => {
    const pw = 22 + 24 + 10 + textWidth(label, 20, 'bold') + 22 + 2
    pills.push({
      id, x: px, y, w: pw, h: 55, r: 27.5, label, font: pillFont, size: 20, tx: 57, ty: 13, icon, ix: 23, iy: 15.5, is: 24,
      bg: '#ffffff14', bgOn: '#00a4dc4d', bd: '#00000000', bdOn: STYLESHEET_ACCENT, ink: '#ffffffff', inkOn: '#ffffffff', scaleOn: 1.05,
    })
    px += pw + 16
  }
  const fav = Boolean(it.UserData && it.UserData.IsFavorite)
  if (offersFavorite(true, d.server)) actionPill('favorite', 'icons/d/favorite.webp', fav ? $L('Favorited') : $L('Favorite'))
  actionPill('personDisplay', 'icons/d/tune.webp', $L('Display'))
  y += 55
  const headerBottom = Math.max(PAD_TOP + 232, y)

  // A backdrop from somewhere in the filmography, picked once.
  const film = d.filmography || { movies: [], series: [], guestAppearances: [], musicVideos: [] }
  if (st.bg === null) {
    const pool = film.movies.concat(film.series).filter((f) => f.ImageTags && f.ImageTags.Backdrop)
    st.bg = pool.length ? getImageUrl(d.server, pool[Math.floor(Math.random() * pool.length)].Id, 'Backdrop', { maxWidth: 1920 }) : ''
  }
  comp.randomBg = st.bg
  return { d, out, pills, ovZone, headerBottom, film }
}

// The tabs, one per kind of credit, over the one row they pick.
export const personTabs = (comp, head) => {
  const { d, ovZone, headerBottom, film } = head
  const s = d.settings
  const st = comp._person
  const left = d.left
  const credits = st.credits || { appearances: [], crew: [] }
  const tabs = []
  if (film.movies.length) tabs.push({ key: 'movies', label: $L('Movies'), items: film.movies, type: 'portrait' })
  if (film.series.length) tabs.push({ key: 'series', label: $L('Series'), items: film.series, type: 'portrait' })
  if ((film.guestAppearances || []).length) tabs.push({ key: 'guest', label: $L('Guest Appearances'), items: film.guestAppearances, type: 'landscape' })
  if ((film.musicVideos || []).length) tabs.push({ key: 'music', label: $L('Music Videos'), items: film.musicVideos, type: 'portrait' })
  if (d.showsSection('seerrPersonCrew') && credits.crew.length) tabs.push({ key: 'crew', label: $L('Crew Contributions (Seerr)'), items: credits.crew, type: 'portrait' })
  if (d.showsSection('seerrPersonAppearances') && credits.appearances.length) tabs.push({ key: 'seerr', label: $L('Appearances (Seerr)'), items: credits.appearances, type: 'portrait' })
  if (st.tab >= tabs.length) st.tab = 0
  const y = headerBottom + 48
  const tabPills = []
  let tx = left
  const tabFont = uiFont('regular')
  tabs.forEach((tab, i) => {
    const tw = 40 + textWidth(tab.label, 33)
    const active = i === st.tab
    tabPills.push({
      id: tab.key, idx: i, x: tx, y, w: tw, h: 49, r: 8, label: tab.label, font: tabFont, size: 33, tx: 20, ty: 11,
      bg: active ? STYLESHEET_ACCENT : '#ffffff0f', bgOn: '#ffffff1f', bd: '#00000000', bdOn: '#00000000',
      ink: active ? '#ffffffff' : '#ffffffb3', inkOn: active ? '#ffffffff' : '#ffffffb3',
    })
    tx += tw + 8
  })
  const rows = []
  let contentBottom = headerBottom
  if (tabs.length) {
    const tab = tabs[st.tab]
    const r = mediaRowFor(`person-${tab.key}`, `${tab.label} (${tab.items.length})`, tab.items, s, d.contentW, tab.type)
    r.x = left
    r.y = y + 49 + 24 + 8 + 40
    rows.push(r)
    contentBottom = r.y + r.h
  }

  const zones = [ovZone, { kind: 'pills', ref: 'pillsA' }, tabPills.length ? { kind: 'pills', ref: 'pillsB' } : null]
    .concat(rows.map((r, i) => ({ kind: 'row', i }))).filter(Boolean)
  return { rows, pillsB: tabPills, tabs, zones, start: ovZone ? 1 : 0, contentH: Math.max(VIEW_H, contentBottom + PAD_BOTTOM) }
}

// The playlist screen: the playlist's art and counts, Play, Shuffle and Favorite, the sort and filter
// pills, then its entries as rows.
export const paintPlaylist = (comp, d) => {
  const t = comp.tokens
  const it = d.item
  const out = list()
  const tracks = d.playlistTracks
  const all = d.lists.playlistItems
  const bar = d.playlistBar || { sortText: '', sortActive: false, filterCount: 0, modified: false, empty: '' }
  const total = tracks.reduce((sum, x) => sum + (x.RunTimeTicks || 0), 0)
  const bottom = sideHeader(out, d, t, (o, x0, top, w) => {
    let y = top
    const lines = wrapLines(it.Name || '', 48, 'bold', w)
    lines.forEach((ln, i) => text(o, `title${i}`, x0, y + i * 55.2, ln, 48, 'bold', t.onSurface, { lh: 55.2 }))
    y += lines.length * 55.2
    const count = `${tracks.length} ${tracks.length !== 1 ? $L('Items') : $L('Item')}${total > 0 ? ` · ${formatDuration(total)}` : ''}`
    text(o, 'count', x0, y + 4, count, 18, 'regular', t.os(0.5))
    y += 4 + 33
    if (d.genres.length) {
      text(o, 'genres', x0, y + 4, d.genres.join(', '), 18, 'regular', t.os(0.5))
      y += 4 + 33
    }
    if (it.Overview) {
      const ov = wrapLines(it.Overview, 20, 'regular', w).slice(0, 4)
      ov.forEach((ln, i) => text(o, `ov${i}`, x0, y + 4 + i * 28, ln, 20, 'regular', t.os(0.8), { lh: 28 }))
      y += 4 + ov.length * 28
    }
    return y + 8 - top
  })

  // Play and Shuffle only with something to play, and Favorite always, centered like the main row.
  const tiles = []
  if (tracks.length) tiles.push({ id: 'play', glyph: true, label: $L('Play') })
  if (tracks.length > 1) tiles.push({ id: 'shuffle', icon: 'shuffle', label: $L('Shuffle') })
  const fav = Boolean(it.UserData && it.UserData.IsFavorite)
  tiles.push({ id: 'favorite', icon: 'favorite', label: fav ? $L('Favorited') : $L('Favorite'), state: fav ? 'favorited' : '' })
  let y = bottom + 48
  const btn = layoutButtons(tiles, d.left, d.contentW, y, false)
  y += btn.h + 36

  // The sort and filter pills, 12px apart, with Reset once anything changed.
  const pillFont = uiFont('medium')
  const pills = []
  let px = d.left
  const pill = (id, label, extra = {}) => {
    const shown = extra.arrow ? `${label} ${extra.arrow}` : label
    const badgeW = extra.badge ? 16 + textWidth(extra.badge, 13, 'bold') : 0
    const pw = 36 + textWidth(shown, 16, 'medium') + (badgeW ? 8 + badgeW : 0) + 2
    const active = Boolean(extra.active)
    pills.push({
      id, x: px, y, w: pw, h: 37, r: 20, label: shown, font: pillFont, size: 16, tx: 19, ty: 3,
      bg: active ? t.accentA(0.22) : '#ffffff14', bgOn: t.accent, bd: active ? t.accent : '#ffffff1f', bdOn: t.accent,
      ink: active ? '#ffffffff' : '#ffffffd9', inkOn: '#ffffffff', scaleOn: 1.04, badge: extra.badge || '', bw: badgeW, bx: pw - 19 - badgeW,
      badgeFill: t.accent, badgeFillOn: '#ffffffff', badgeInkOn: t.accent,
    })
    px += pw + 12
  }
  const sortParts = String(bar.sortText).split(' ')
  const arrow = /[▲▼]$/.test(bar.sortText) ? sortParts.pop() : ''
  pill('sort', sortParts.join(' '), { arrow, active: bar.sortActive })
  pill('filter', $L('Filter'), { active: bar.filterCount > 0, badge: bar.filterCount > 0 ? String(bar.filterCount) : '' })
  if (bar.modified) pill('reset', $L('Reset'))
  y += 37 + 20

  const rows = []
  const ordered = !bar.modified
  if (ordered && tracks.length) {
    text(out, 'hint', d.left + 16, y, $L('◀ ▶ to re-order · DEL to remove'), 18, 'regular', t.os(0.4))
    y += 33 + 24
  } else if (tracks.length) y += 4
  // An empty playlist, or one whose filters hid every entry: an icon over the message, 16px apart
  // in 56px of padding, and Clear Filters under them when it's the filters.
  const clear = []
  if (!all.length || !tracks.length) {
    const filtered = all.length > 0
    const msg = filtered ? $L('No tracks match the active filters') : $L('This playlist is empty')
    const icon = filtered ? '\u2298' : '\ud83c\udfb5'
    const mid = d.left + d.contentW / 2
    // The glyph comes from a fallback face, so it gets a taller line to keep its top.
    text(out, 'emptyIcon', mid - textWidth(icon, 48) / 2, y + 44, icon, 48, 'regular', '#ffffff59', { lh: 72 })
    text(out, 'empty', mid - textWidth(msg, 20) / 2, y + 120, msg, 20, 'regular', '#ffffffa6')
    if (filtered) {
      const label = $L('Clear Filters')
      const w = 2 + 48 + textWidth(label, 16, 'bold')
      clear.push({
        id: 'reset', x: mid - w / 2, y: y + 169, w, h: 41, r: 20.5, label, font: uiFont('bold'), size: 16, tx: 25, ty: 5,
        bg: '#ffffff1a', bgOn: t.focus, bd: '#ffffff33', bdOn: t.focus, ink: '#ffffffff', inkOn: '#ffffffff', scaleOn: 1.05,
      })
    }
    y += filtered ? 266 : 209
  }
  tracks.forEach((tr, i) => {
    const artist = tr.AlbumArtist || (tr.Artists && tr.Artists[0]) || ''
    const sub = [artist, tr.MediaType !== 'Audio' && tr.Type ? tr.Type : ''].filter(Boolean)
    const h = 24 + Math.max(56, 33 + sub.length * 35)
    const thumb = tr.ImageTags && tr.ImageTags.Primary ? getImageUrl(d.server, tr.Id, 'Primary', { maxHeight: 80, quality: 80 }) : ''
    const dur = tr.RunTimeTicks ? formatDuration(tr.RunTimeTicks) : ''
    rows.push({
      k: `tr${i}-${tr.PlaylistItemId || tr.Id}`, kind: 'track', title: '', x: d.left, y, h, cardsY: 0, clipX: 0, clipW: d.contentW, mode: 'none', entry: 0, container: false,
      cells: [{
        k: `t${i}`, kind: 'track', idx: 0, x: 0, w: d.contentW, h, cardH: h, item: tr, num: String(i + 1), thumb, name: tr.Name || '', nameFont: fontFor(tr.Name || '', 'medium'),
        sub: sub.join('\n'), subFont: fontFor(sub.join(' ')), infoX: thumb ? 140 : 68, infoW: d.contentW - (thumb ? 140 : 68) - 16 - (ordered ? 28 : 0) - 66,
        dur, durX: d.contentW - 16 - (ordered ? 28 : 0), ordered, upInk: i === 0 ? '#ffffff26' : '#ffffff80', downInk: i === tracks.length - 1 ? '#ffffff26' : '#ffffff80',
      }],
    })
    y += h
  })
  const zones = [{ kind: 'actions' }, { kind: 'pills', ref: 'pillsA', passed: true }, { kind: 'pills', ref: 'pillsB' }].concat(rows.map((r, i) => ({ kind: 'row', i })))
  return { out, buttons: btn.placed, rows, pillsA: pills, pillsB: clear, zones, contentH: Math.max(VIEW_H, y + 32 + PAD_BOTTOM) }
}

// The track screen: the track's artist, name, album, year and runtime beside its poster, the plain
// four line overview under them, and Play and Favorite.
export const paintAudio = (comp, d) => {
  const t = comp.tokens
  const it = d.item
  const out = list()
  const showsPoster = d.showsSection('poster')
  const infoW = showsPoster ? d.contentW - 46 - 239 : d.contentW
  const column = (o, x0, top) => {
    let y = top
    const artist = it.AlbumArtist || (it.Artists && it.Artists[0]) || ''
    if (artist) {
      text(o, 'artist', x0, y + 3, artist, 23, 'medium', t.os(0.7))
      y += 36
    }
    const lines = wrapLines(it.Name || '', 46, 'bold', infoW)
    lines.forEach((ln, i) => text(o, `title${i}`, x0, y + i * 57.5, ln, 46, 'bold', t.onSurface, { lh: 57.5 }))
    y += Math.ceil(lines.length * 57.5) + 12
    const items = [it.Album, d.year, d.runtime].filter(Boolean).map((x) => ({ text: String(x) }))
    const ratingsW = d.ratings.length ? infoW - (items.length ? 12 : 0) : 0
    if (items.length || d.ratings.length) {
      const h = items.length ? bulletLine(o, 'info', items, x0, y, t) : 0
      const used = items.reduce((sum, p, i) => sum + (i ? 14 + textWidth(BULLET, 17, 'bold') : 0) + textWidth(p.text, 17, 'bold'), 0)
      const rh = d.ratings.length ? ratingsRow(o, d.ratings, x0 + used + (items.length ? 12 : 0), y, ratingsW - used, d.ratingStyle, t) : 0
      y += Math.max(h, rh) + 12
    }
    if (it.Overview) {
      const ov = wrapLines(it.Overview, 20, 'regular', infoW).slice(0, 4)
      ov.forEach((ln, i) => text(o, `ov${i}`, x0, y + i * 28, ln, 20, 'regular', t.os(0.8), { lh: 28 }))
      y += ov.length * 28
    }
    return y - top
  }
  const h = column(list(), d.left, 0)
  const headerH = Math.max(h, showsPoster ? 360 : 0)
  column(out, d.left, PAD_TOP + headerH - h)
  if (showsPoster) poster(out, { ...d, posterIcon: 'icons/d/audio.webp' }, d.left + infoW + 46, PAD_TOP + headerH - 360, 239, 360, t)

  const fav = Boolean(it.UserData && it.UserData.IsFavorite)
  const tiles = [
    { id: 'play', glyph: true, label: $L('Play') },
    { id: 'favorite', icon: 'favorite', label: fav ? $L('Favorited') : $L('Favorite'), state: fav ? 'favorited' : '' },
  ]
  const top = PAD_TOP + headerH + 23
  const btn = layoutButtons(tiles, d.left, d.contentW, top, false)
  return { out, buttons: btn.placed, rows: [], zones: [{ kind: 'actions' }], contentH: Math.max(VIEW_H, top + btn.h + PAD_BOTTOM) }
}
