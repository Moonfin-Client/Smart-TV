import { For, batch, createMemo, createSignal, onCleanup, untrack } from 'solid-js'
import Overview from '../../../ui/components/details/Overview.jsx'
import SeerrStatusDownloads, { downloadsLayout } from '../../../ui/components/seerr/SeerrStatusDownloads.jsx'
import { byKey } from '../../../ui/components/details/keyed.js'
import { cssStops } from '../../../ui/components/account/gradient.js'
import { displayFont, fontFor, themeSpacing, uiFont } from '../../../ui/text.js'
import { glowShadow, theme, sideNavRoom, navOnLeft } from '../../../ui/theme.js'
import { focusNav } from '../../../app/focus.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { serverBlurredUrl } from '../../../utils/serverBlur.js'
import { softBackdrop } from '../../../services/softBackdrop.js'
import { getImageUrl } from '../../../utils/helpers.js'
import { checkSeerr } from '../../../state/seerr.js'
import Draw from '../stage/Draw.jsx'
import { detailTokens } from '../modern/tokens.js'
import { seriesThumbUrl } from '../detailsMedia.js'
import { loadSeerrPersonCredits, seerrPersonCards } from '../seerrPersonCredits.js'
import ClassicButtons from './Buttons.jsx'
import ClassicPills from './Pills.jsx'
import ClassicRow from './Row.jsx'
import { classicActions } from './actions.js'
import { PAD_BOTTOM, classicLeft, layoutButtons, layoutHeader, layoutMetadata, list, metadataCells, overviewH } from './layout.js'
import { layoutSections } from './sections.js'
import { pageScroll } from './scroll.js'
import { STYLESHEET_ACCENT, paintAudio, paintPerson, paintPlaylist, paintSeason, personTabs } from './screens.js'

// The Classic details style: one scrolling page with the header, the action tiles, the metadata
// strip and the sections. Seasons, people, playlists and tracks get their own screens from
// screens.js. Focus moves through the zones top to bottom.
//
// It plugs into Details as parts.js says: it takes `page` (the page's handle) and hands back
// { paint(bag), setFocus(), skeletonBoxes() } through `ref`.
const SCRIM = [{ to: 'bottom', rgb: '0, 0, 0', stops: [[0, 0.3], [0.3, 0.5], [0.6, 0.85], [0.8, 0.95], [1, 1]] }]
const NEON_SCRIM = [{ to: 'bottom', rgb: '11, 4, 32', stops: [[0, 0.2], [0.4, 0.55, '30, 10, 63'], [0.7, 0.85], [1, 0.95]] }]
// The person backdrop's 135deg wash uses these colors in every theme.
const PERSON_WASH = { angle: ((135 + 180) * Math.PI) / 180, ...cssStops([0x1a1a2eff, 0x16213eff, 0x0f3460ff], [0, 0.5, 1]) }
const VIEW_H = 1080
const SCROLL = { y: { duration: 260, easing: 'ease-out' } }
const NO_DL = { x: 0, y: 0, bars: { rects: [], icons: [], texts: [], h: 0 } }
const NO_OV = { show: false, x: 0, y: 0, w: 0, h: 0, text: '', font: 'roboto', lines: 3, hint: '', hintY: 0 }
const NO_MAIN_OV = { show: false, x: 0, y: 0, text: '', font: 'roboto', box: null }
const GONE_ROW = { k: '', kind: 'none', cells: [], title: '', mode: 'none', cardsY: 0, clipX: 0, clipW: 0, h: 0, x: 0, y: 0 }
const GONE_SHADOW = { k: '', x: 0, y: 0, w: 0, h: 0, r: 0, shadow: null }

// Neon Pulse restyles what the layout placed: titles in its display face 0.4px apart with a pink
// glow, a season's series name in cyan, and body copy 0.6px apart. Italic taglines draw as rich text
// in Roboto's canvas face, since a theme's own face only draws upright. A trailing no-break space
// keeps the slanted last glyph inside the canvas the line is drawn into.
// shortcut: titles wrap by the body face's widths, which only differs for a title long enough to wrap.
const NEON_TEXT_GLOW = { color: '#ff2e9259', x: 0, y: 0, blur: 8 }
const themedText = (tx, t, seasonHeader) => {
  const out = tx.italic ? { ...tx, rich: true, text: `${tx.text}\u00a0`, font: /^roboto/.test(tx.font) ? 'roboto-web' : tx.font } : tx
  if (!t.neon) return out
  if (/^title\d/.test(tx.k)) return { ...out, font: tx.font.indexOf('-web') < 0 ? displayFont('bold') : tx.font, ls: 0.4, shadow: NEON_TEXT_GLOW }
  if (seasonHeader && tx.k === 'series') return { ...out, color: '#00e5ffff', ls: t.spacing }
  return tx.ls ? out : { ...out, ls: t.spacing }
}

const zoneKey = (z) => (z ? (z.kind === 'row' ? `row:${z.i}` : z.kind === 'pills' ? `pills:${z.ref}` : z.kind) : '')

const classicTokens = () => {
  const t = theme()
  return {
    ...detailTokens(),
    background: t.background,
    surface: t.surface,
    surfaceVariant: t.surfaceVariant,
    buttonNormal: t.buttonNormal,
    onButtonNormal: t.onButtonNormal,
    recordingActive: t.recordingActive,
    badgeUnplayed: t.badgeUnplayed,
    id: t.id,
    neon: t.id === 'neon_pulse',
    spacing: themeSpacing(),
  }
}

export default function Classic(props) {
  const page = props.page
  const [painted, setPainted] = createSignal(false)
  const [backdrop, setBackdrop] = createSignal('')
  const [person, setPerson] = createSignal(false)
  const [randomBg, setRandomBg] = createSignal('')
  const [scrim, setScrim] = createSignal('')
  const [drawn, setDrawn] = createSignal(list())
  const [shadowList, setShadowList] = createSignal([])
  const [ov, setOv] = createSignal(NO_MAIN_OV)
  const [overviewExpanded, setOverviewExpanded] = createSignal(false)
  const [personOv, setPersonOv] = createSignal(NO_OV)
  const [personOvFocus, setPersonOvFocus] = createSignal(false)
  const [btns, setBtns] = createSignal({ placed: [], held: true, lane: null })
  const [pillsA, setPillsA] = createSignal([])
  const [pillsB, setPillsB] = createSignal([])
  const [rows, setRows] = createSignal([])
  const [dl, setDl] = createSignal(NO_DL)
  const [scroll, setScroll] = createSignal(0)
  const [contentH, setContentH] = createSignal(VIEW_H)
  const [logoProbe, setLogoProbe] = createSignal('')
  const tokens = createMemo(() => classicTokens())
  const shadows = byKey(shadowList, GONE_SHADOW)
  const rowsK = byKey(rows, GONE_ROW)
  const hintFont = () => uiFont('regular')

  // What the style holds about its item outside the signals. `comp` is the state screens.js reads
  // and writes: the tokens, the person's state, the biography box, the random backdrop and the action
  // row's overflow, which the page's More opens.
  const m = { bag: null, itemId: null, logo: null, zones: null, z: 0, zoneKey: '', pending: false, refocus: false, personHead: null }
  const comp = { tokens: null, _person: null, personOv: NO_OV, randomBg: '', $parent: { _behind: [] } }
  const refs = {}
  const rowRefs = {}
  let root = null
  let focusTimer = null
  onCleanup(() => clearTimeout(focusTimer))
  const later = (fn) => {
    clearTimeout(focusTimer)
    focusTimer = setTimeout(fn, 0)
  }

  // The loading skeleton: the header bars beside the poster, five tiles and the cast.
  const skeletonBoxes = () => {
    const t = detailTokens()
    const box = t.isGlass ? '#ffffff29' : t.os(0.14)
    const left = classicLeft(sideNavRoom())
    const w = 1920 - 70 - left
    const infoW = w - 46 - 239
    const out = [{ k: 'bg', x: 0, y: 0, w: 1920, h: 486, r: 0, top: '#ffffff14', bottom: '#ffffff00' }]
    const infoH = 46 + 14 + 17 + 18 + 20 + 8 + 20 + 8 + 20
    let y = 116 + 360 - infoH
    const add = (k, x, yy, ww, h, r) => out.push({ k, x, y: yy, w: ww, h, r, color: box })
    add('title', left, y, 1920 * 0.32, 46, 8)
    y += 46 + 14
    ;[78, 104, 65].reduce((x, ww, i) => (add(`m${i}`, x, y, ww, 17, 4), x + ww + 14), left)
    y += 17 + 18
    add('o1', left, y, infoW, 20, 4)
    add('o2', left, y + 28, infoW, 20, 4)
    add('o3', left, y + 56, 1920 * 0.2, 20, 4)
    add('poster', left + infoW + 46, 116, 239, 360, 12)
    const tilesY = 116 + 360 + 23 + 9
    const x0 = left + (w - 5 * 169) / 2 + 6
    for (let i = 0; i < 5; i++) {
      add(`tile${i}`, x0 + i * 169 + 34.5, tilesY, 88, 88, 22)
      add(`tileL${i}`, x0 + i * 169 + 31.5, tilesY + 100, 94, 16, 4)
    }
    const castTop = tilesY + 116 + 9 + 36
    add('castT', left, castTop, 160, 32, 6)
    for (let i = 0; i < 6; i++) {
      add(`cast${i}`, left + i * 168 + 5, castTop + 68, 135, 135, 68)
      add(`castN${i}`, left + i * 168 + 27.5, castTop + 68 + 152, 90, 17, 4)
    }
    return out
  }

  const paint = (bag) => batch(() => paintNow(bag))
  const paintNow = (bag) => {
    m.bag = bag
    const it = bag.item
    const s = bag.settings
    const t = untrack(tokens)
    comp.tokens = t
    if (m.itemId !== it.Id) {
      m.itemId = it.Id
      m.zoneKey = ''
      setScroll(0)
      setOverviewExpanded(false)
      comp._person = { expanded: false, tab: 0, credits: null, bg: null }
      comp.randomBg = ''
      if (refs.buttons) refs.buttons.selectFirst()
      ;['pillsA', 'pillsB'].forEach((r) => refs[r] && refs[r].select(0))
      if (it.Type === 'Person') loadCredits(it)
    }
    const left = classicLeft(sideNavRoom(s))
    const contentW = 1920 - 70 - left

    const blur = Number(s.backdropBlurDetail != null ? s.backdropBlurDetail : 20)
    const isPerson = it.Type === 'Person'
    const url = isPerson ? '' : bag.backdropUrl
    const blurred = url ? serverBlurredUrl(url, blur) : null
    if (url && !blurred && blur > 0) {
      // Art from outside the server is blurred here, and shows once it is.
      const key = `${blur}|${url}`
      if (m.soft !== key) {
        m.soft = key
        setBackdrop('')
        softBackdrop(url, blur, (src) => m.soft === key && setBackdrop(src))
      }
    } else {
      m.soft = ''
      setBackdrop(blurred || url || '')
    }
    setPerson(isPerson)
    setScrim(scrimSrc(t.id === 'neon_pulse' ? NEON_SCRIM : SCRIM))
    if (!isPerson) comp.personOv = NO_OV

    // The logo's own size decides its box, so it waits on a probe of its own.
    const logoUrl = bag.logoUrl
    if (logoUrl && (!m.logo || m.logo.url !== logoUrl)) {
      m.logo = { url: logoUrl, w: 0, h: 0, failed: false }
      setLogoProbe(logoUrl)
    }

    const d = model(bag, left, contentW)
    let laid
    m.personHead = null
    if (isPerson) {
      laid = paintPerson(comp, d)
      m.personHead = laid.head
    } else if (it.Type === 'Season') laid = paintSeason(comp, d)
    else if (it.Type === 'Playlist') laid = paintPlaylist(comp, d)
    else if (it.Type === 'Audio') laid = paintAudio(comp, d)
    else laid = paintMain(d)
    page.setBehind(comp.$parent._behind)
    setPersonOv(comp.personOv)
    setRandomBg(comp.randomBg)
    // Hairlines go after the boxes they rule, and the shadows under everything.
    const hair = (r) => !r.r && !r.bw && (r.w <= 2 || r.h <= 2)
    const rects = laid.out.rects
    setDrawn({
      rects: rects.filter((r) => !hair(r)).concat(rects.filter(hair)),
      imgs: laid.out.imgs,
      texts: laid.out.texts.map((tx) => themedText(tx, t, it.Type === 'Season')),
    })
    setShadowList(rects.filter((r) => r.shadow).map((r) => ({ k: r.k, x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, shadow: glowShadow(r.shadow).shadow })))
    setOv(laid.ov || NO_MAIN_OV)
    setBtns({ placed: laid.buttons || [], held: !bag.settled, lane: laid.lane || null })
    setPillsA(laid.pillsA || [])
    setPillsB(laid.pillsB || [])
    setRows(laid.rows || [])
    setDl(laid.dl || NO_DL)
    placeZones(laid)
  }
  // The page's height and focus zones from a layout, with focus kept on the zone it was on.
  const placeZones = (laid) => {
    setContentH(laid.contentH)
    m.zones = laid.zones
    const kept = m.zoneKey ? m.zones.findIndex((z) => zoneKey(z) === m.zoneKey) : -1
    m.z = kept >= 0 ? kept : laid.start != null ? laid.start : Math.max(0, m.zones.findIndex((z) => z.kind === 'actions'))
    m.zoneKey = zoneKey(m.zones[m.z])
    setPainted(true)
    if (m.pending && m.zones[m.z]) {
      m.pending = false
      later(() => focusAt(m.z, true))
    }
    // A moved playlist entry comes back as a new row, so focus follows it there.
    if (m.refocus) {
      m.refocus = false
      later(() => focusAt(m.z, true))
    }
  }
  const repaint = () => m.bag && paint(m.bag)
  // A person's tab changes only the tabs and the row under them, so the rest stays as it was painted.
  const repaintTab = () => {
    if (!m.personHead) return repaint()
    batch(() => {
      const laid = personTabs(comp, m.personHead)
      setPillsB(laid.pillsB)
      setRows(laid.rows)
      placeZones(laid)
    })
  }

  // What every screen reads, in the shape the layout functions take.
  const model = (bag, left, contentW) => {
    const it = bag.item
    const logoLive = Boolean(bag.logoUrl && m.logo && !m.logo.failed && m.logo.w)
    let logo = null
    if (logoLive) {
      const k = Math.min(1, 507 / m.logo.w, 116 / m.logo.h)
      logo = { url: m.logo.url, w: m.logo.w * k, h: m.logo.h * k }
    }
    return {
      ...bag,
      left,
      contentW,
      isEpisode: it.Type === 'Episode',
      logo,
      // A collection shows its titles' people as its own.
      item: it.Type === 'BoxSet' ? { ...it, People: bag.lists.cast } : it,
      posterUrl: posterOf(bag),
      name: (bag.bookSeriesItem ? bag.bookSeriesItem.Name : it.Name) || '',
      year: it.ProductionYear || '',
      officialRating: it.OfficialRating || '',
      seasonCount: it.ChildCount || bag.lists.seasons.length || 0,
      genres: it.Genres || [],
      overview: bag.overviewText,
      overviewExpanded: untrack(overviewExpanded),
      // Neon Pulse trades the poster's drop shadow for a pink glow.
      posterShadow: untrack(tokens).neon ? { color: '#ff2e9233', x: 0, y: 0, blur: 14, spread: 0 } : null,
      ratingStyle: { labels: bag.settings.showRatingLabels !== false, badges: bag.settings.showRatingBadges !== false },
    }
  }

  const posterOf = (bag) => {
    const it = bag.item
    const server = bag.server
    if (it._externalPosterUrl) return it._externalPosterUrl
    const tags = it.ImageTags || {}
    if (it.Type === 'Episode') {
      const wide = { maxWidth: 500, quality: 90 }
      const series = bag.settings.detailUseSeriesThumbnails ? seriesThumbUrl(server, it, wide) : null
      return series || (tags.Thumb ? getImageUrl(server, it.Id, 'Thumb', wide) : tags.Primary ? getImageUrl(server, it.Id, 'Primary', wide) : '')
    }
    return tags.Primary ? getImageUrl(server, it.Id, 'Primary', { maxHeight: 600, quality: 90 }) : ''
  }

  // The main screen, for movies, series, episodes and box sets.
  const paintMain = (d) => {
    const t = comp.tokens
    const out = list()
    const head = layoutHeader(out, d, d.left, d.contentW, t)
    let ovl = null
    if (head.overview) {
      ovl = { show: true, x: head.overview.x, y: head.overview.y, text: d.overview, font: fontFor(d.overview), box: head.overview.box }
    }
    const row = classicActions(d.actionInput, d.tracks)
    comp.$parent._behind = row.behind
    const buttonsTop = head.bottom + 23
    const btn = layoutButtons(row.buttons, d.left, d.contentW, buttonsTop, row.scroll)
    const bars = downloadsLayout(d.seerr && d.seerr.downloads)
    const dlAt = { x: d.left, y: buttonsTop + btn.h + 16, bars }
    let y = buttonsTop + btn.h + (bars.h ? 16 + bars.h : 0) + 36
    const cells = metadataCells(d.item, d.showsSection('crew'), d.showsSection('studios'))
    if (cells.length) y += layoutMetadata(out, cells, d.left, d.contentW, y) + 40
    const sec = layoutSections(d, d.contentW, y)
    sec.rows.forEach((r) => (r.x = d.left))
    const zones = (ovl && ovl.box.canToggle ? [{ kind: 'overview' }] : []).concat({ kind: 'actions' }, sec.rows.map((r, i) => ({ kind: 'row', i })))
    return {
      out,
      ov: ovl,
      buttons: btn.placed,
      lane: row.scroll ? { x: d.left, w: d.contentW } : null,
      rows: sec.rows,
      zones,
      dl: dlAt,
      contentH: Math.max(VIEW_H, (sec.rows.length ? sec.bottom : y - 40) + PAD_BOTTOM),
    }
  }

  // A person's Seerr credits, for the two Seerr tabs.
  const loadCredits = async (it) => {
    const tmdbId = it.ProviderIds && it.ProviderIds.Tmdb
    const seerr = await Promise.resolve(checkSeerr()).catch(() => null)
    if (!tmdbId || !seerr || !seerr.available) return
    const credits = await loadSeerrPersonCredits(tmdbId).catch(() => null)
    if (!credits || m.itemId !== it.Id || !m.bag) return
    const s = m.bag.settings
    comp._person.credits = { appearances: seerrPersonCards(credits.cast, false, s), crew: seerrPersonCards(credits.crew, true, s) }
    repaint()
  }

  const onLogo = (dim) => {
    if (!m.logo || !dim || !dim.w) return
    m.logo.w = dim.w
    m.logo.h = dim.h
    repaint()
  }
  const onLogoError = () => {
    if (!m.logo) return
    m.logo.failed = true
    repaint()
  }

  // `entry` sends a row's focus to its entry card, else the row keeps its own card.
  const focusAt = (i, entry) => {
    const z = (m.zones || [])[i]
    if (!z) return
    m.z = i
    m.zoneKey = zoneKey(z)
    setPersonOvFocus(z.kind === 'personOv')
    if (z.kind === 'overview') {
      if (refs.overview) refs.overview.setFocus()
      scrollTo({ y: untrack(ov).y, h: overviewH(untrack(ov).box, untrack(overviewExpanded)) })
    } else if (z.kind === 'personOv') {
      if (root) root.setFocus()
      scrollTo({ y: untrack(personOv).y, h: untrack(personOv).h })
    } else if (z.kind === 'actions') {
      if (refs.buttons) refs.buttons.setFocus()
      // The action row sends the page back to the top when it takes focus.
      setScroll(0)
    } else if (z.kind === 'pills') {
      const p = refs[z.ref]
      if (!p) return
      p.setFocus()
      const pill = p.current()
      if (pill) scrollTo({ y: pill.y, h: pill.h })
    } else {
      const r = untrack(rows)[z.i]
      const c = r && rowRefs[r.k]
      if (!c) return
      if (entry) c.focusEntry()
      c.setFocus()
      scrollToCell(r, c.current())
    }
  }
  const canFocus = (z) => {
    if (z.kind === 'pills') return untrack(z.ref === 'pillsA' ? pillsA : pillsB).length > 0
    if (z.kind !== 'row') return true
    const r = untrack(rows)[z.i]
    return Boolean(r && (r.cells || []).length)
  }
  // The middle of a zone's focused box across, which picks the nearest box in the zone focus moves to.
  const middleOf = (z) => {
    if (!z) return 0
    if (z.kind === 'overview') return untrack(ov).x + (untrack(ov).box ? untrack(ov).box.width / 2 : 0)
    if (z.kind === 'personOv') return untrack(personOv).x + untrack(personOv).w / 2
    const p = z.kind === 'pills' && refs[z.ref] && refs[z.ref].current()
    return p ? p.x + p.w / 2 : 0
  }
  // Up with nothing above goes on to the page, which scrolls to the top and then to a top bar.
  const move = (dir) => {
    const zones = m.zones || []
    const step = dir === 'up' ? -1 : 1
    const from = zones[m.z]
    for (let i = m.z + step; i >= 0 && i < zones.length; i += step) {
      if (!canFocus(zones[i])) continue
      // The playlist's centered buttons don't sit over the pills at the left edge, so Down from them
      // skips the pills for the list, and Up from the pills finds nothing above.
      if (dir === 'down' && from && from.kind === 'actions' && zones[i].passed && zones.slice(i + 1).some(canFocus)) continue
      if (dir === 'up' && from && from.passed && zones[i].kind === 'actions') return true
      // Up from the first section lands on the action row's first tile. From a box above, focus takes
      // the tile nearest the box's middle, and the same goes between the person's biography, their
      // Favorite and Display, and the tabs, which enter at the open one.
      const mid = middleOf(from)
      if (zones[i].kind === 'actions' && refs.buttons) {
        if (from && from.kind === 'overview') refs.buttons.selectNear(mid)
        else refs.buttons.selectFirst()
      }
      const onPerson = m.bag && m.bag.item.Type === 'Person'
      if (onPerson && zones[i].ref === 'pillsA' && from && (from.kind === 'personOv' || from.ref === 'pillsB') && refs.pillsA) {
        refs.pillsA.selectNear(mid)
      }
      focusAt(i, true)
      return true
    }
    return dir !== 'up'
  }
  const scrollTo = (item, container) => setScroll(pageScroll(untrack(scroll), untrack(contentH) || VIEW_H, item, container))
  const scrollToCell = (r, c) => {
    if (!r) return
    // The whole card takes focus here, its captions too.
    const item = c ? { y: r.y + r.cardsY + (c.y || 0), h: c.h } : { y: r.y, h: r.h }
    scrollTo(item, r.container === false ? null : { y: r.y, h: r.h })
  }

  const onEdge = (dir) => {
    const z = (m.zones || [])[m.z]
    const r = z && z.kind === 'row' ? untrack(rows)[z.i] : null
    // A playlist in its own order moves the focused entry with Left and Right.
    if (r && r.kind === 'track' && r.cells[0].ordered) {
      const it = r.cells[0].item
      const to = z.i + (dir === 'left' ? -1 : 1)
      const next = untrack(rows)[to]
      if (to < 0 || !next || next.kind !== 'track') return
      m.zoneKey = `row:${to}`
      m.refocus = true
      page.moveCard(it, dir === 'left' ? -1 : 1)
      return
    }
    if (dir === 'left' && navOnLeft()) focusNav()
  }
  // The entry under the one removed takes focus, or the one above when it was the last.
  const onRemove = (row, c) => {
    const z = (m.zones || [])[m.z]
    if (!z || z.kind !== 'row') return
    const all = untrack(rows)
    const last = !all[z.i + 1] || all[z.i + 1].kind !== 'track'
    m.zoneKey = `row:${last ? z.i - 1 : z.i}`
    m.refocus = true
    page.removePlaylistEntry(c.item)
  }
  const onCellFocus = (row, cell) => scrollToCell(row, cell)
  const onSelect = (row, c) => {
    const it = c.item
    if (c.kind === 'cast') return page.onCellSelect({ kind: 'person', item: it })
    if (c.kind === 'chapter') return page.onCellSelect({ kind: 'chapter', item: c.chapterKind === 'extra' ? it : null, ticks: c.ticks })
    if (c.kind === 'review') return page.onCellSelect({ kind: 'review', review: c.review })
    if (c.kind === 'chip') return page.onSeerrPiece('chips')
    if (c.kind === 'banner') return page.onSeerrPiece('collection', c.data)
    if (c.kind === 'facts') return undefined
    // The page plays a playlist's entry on through the entries on show.
    if (c.kind === 'track') return page.onCellSelect({ kind: 'track', item: it })
    if (it && it._seerr && it._seerrRaw) return page.onSeerrCardSelect(it)
    if (it) return page.onCellSelect({ kind: c.kind === 'episode' || c.kind === 'nextup' || c.kind === 'seasonEp' ? 'episode' : 'card', item: it })
    return undefined
  }
  const onLong = (row, c) => {
    if (c.item) page.onCellLong({ kind: c.kind === 'track' ? 'track' : 'card', item: c.item })
  }
  const onPill = (zone, pill) => {
    if (pill.id === 'favorite' || pill.id === 'personDisplay') return page.runAction(pill.id)
    // Clear Filters goes with what it cleared, so focus moves up to the sort and filter pills.
    if (zone === 'pillsB' && pill.id === 'reset') {
      m.zoneKey = 'pills:pillsA'
      m.refocus = true
    }
    if (pill.id === 'sort' || pill.id === 'filter' || pill.id === 'reset') return page.onPill(pill.id)
    return undefined
  }
  // A person's tab opens as focus lands on it.
  const onPillFocus = (zone, pill) => {
    if (zone === 'pillsB' && comp._person && pill.idx !== comp._person.tab) {
      comp._person.tab = pill.idx
      repaintTab()
    }
    scrollTo({ y: pill.y, h: pill.h })
  }
  const onOverviewToggle = () => {
    setOverviewExpanded(!untrack(overviewExpanded))
    repaint()
  }

  const setFocus = () => {
    if (!m.zones) {
      if (root) root.setFocus()
      return
    }
    // The biography box is this style's own focus, so landing here is all it needs.
    const z = m.zones[m.z]
    if (z && z.kind === 'personOv') {
      setPersonOvFocus(true)
      if (root) root.setFocus()
      return
    }
    // A screen can open with nothing to focus yet, a season before its episodes land.
    if (!z) {
      m.pending = true
      if (root) root.setFocus()
    }
    focusAt(m.z, false)
  }
  if (props.ref) props.ref({ paint, setFocus, skeletonBoxes })

  const t = () => tokens()
  return (
    <view
      ref={(n) => (root = n)}
      width={1920}
      height={1080}
      onFocusChanged={(has) => !has && setPersonOvFocus(false)}
      onUp={() => move('up')}
      onDown={() => move('down')}
      onLeft={() => {
        if (navOnLeft()) focusNav()
        return true
      }}
      onRight={() => true}
      onEnter={() => {
        const z = (m.zones || [])[m.z]
        if (z && z.kind === 'personOv') {
          comp._person.expanded = !comp._person.expanded
          repaint()
        }
        return true
      }}
      onBack={() => {
        if (!untrack(overviewExpanded)) return false
        setOverviewExpanded(false)
        repaint()
        return true
      }}
    >
      <view alpha={painted() ? 1 : 0} width={1920} height={1080} color="#0a0a0aff" />
      <view
        alpha={backdrop() ? 1 : 0}
        width={1920}
        height={810}
        src={backdrop() || undefined}
        textureOptions={{ resizeMode: { type: 'cover', clipX: 0.5, clipY: 0 } }}
      />
      <view alpha={person() ? 1 : 0} width={1920} height={1080} color="#ffffffff" linearGradient={PERSON_WASH} />
      <view alpha={scrim() ? 1 : 0} width={1920} height={1080} src={scrim() || undefined} />
      <view alpha={randomBg() ? 0.4 : 0} width={1920} height={1080} src={randomBg() || undefined} textureOptions={{ resizeMode: { type: 'cover' } }} />

      <view transition={SCROLL} y={-scroll()} alpha={painted() ? 1 : 0} width={1920} height={contentH()}>
        <view width={1920} height={contentH()}>
          <For each={shadows.keys()}>
            {(k) => (
              <view
                x={shadows.at(k).x}
                y={shadows.at(k).y}
                width={shadows.at(k).w}
                height={shadows.at(k).h}
                borderRadius={shadows.at(k).r}
                color="#00000000"
                shadow={shadows.at(k).shadow || undefined}
              />
            )}
          </For>
        </view>
        <Draw list={drawn()} w={1920} h={contentH()} />

        <view alpha={personOv().show ? 1 : 0} x={personOv().x} y={personOv().y} width={personOv().w} height={personOv().h}>
          <view width={personOv().w} height={personOv().h} borderRadius={8} color={personOvFocus() ? '#ffffff14' : '#ffffff00'} />
          <text
            x={12}
            y={10}
            fontFamily={personOv().font}
            fontSize={20}
            lineHeight={29}
            letterSpacing={t().spacing || 0}
            maxWidth={Math.max(1, personOv().w - 24)}
            maxLines={personOv().lines}
            color="#ffffffcc"
          >
            {personOv().text}
          </text>
          <text x={12} y={personOv().hintY + 2.5} fontFamily={hintFont()} fontSize={25.5} lineHeight={33} letterSpacing={t().spacing || 0} color={STYLESHEET_ACCENT}>
            {personOv().hint}
          </text>
        </view>

        <Overview
          ref={(n) => (refs.overview = n)}
          x={ov().x}
          y={ov().y}
          alpha={ov().show ? 1 : 0}
          text={ov().text}
          font={ov().font}
          box={ov().box}
          expanded={overviewExpanded()}
          tokens={t()}
          variant="classic"
          spacing={t().spacing}
          onOverviewToggle={onOverviewToggle}
        />
        <SeerrStatusDownloads x={dl().x} y={dl().y} bars={dl().bars} />
        <ClassicButtons
          ref={(n) => (refs.buttons = n)}
          placed={btns().placed}
          held={btns().held}
          lane={btns().lane}
          tokens={t()}
          onAction={(id) => page.runAction(id)}
          onActionLong={(id) => page.onActionLong(id)}
          onEdge={onEdge}
        />
        <ClassicPills ref={(n) => (refs.pillsA = n)} zone="pillsA" pills={pillsA()} h={contentH()} spacing={t().spacing} onPill={onPill} onPillFocus={onPillFocus} onEdge={onEdge} />
        <ClassicPills ref={(n) => (refs.pillsB = n)} zone="pillsB" pills={pillsB()} h={contentH()} spacing={t().spacing} onPill={onPill} onPillFocus={onPillFocus} onEdge={onEdge} />
        <view width={1920} height={contentH()}>
          <For each={rowsK.keys()}>
            {(k) => (
              <ClassicRow
                ref={(n) => (n ? (rowRefs[k] = n) : delete rowRefs[k])}
                x={rowsK.at(k).x}
                y={rowsK.at(k).y}
                row={rowsK.at(k)}
                tokens={t()}
                onEdge={onEdge}
                onCellFocus={onCellFocus}
                onSelect={onSelect}
                onLong={onLong}
                onRemove={onRemove}
              />
            )}
          </For>
        </view>
      </view>

      <view
        width={1}
        height={1}
        alpha={0.001}
        src={logoProbe() || undefined}
        onEvent={{
          loaded: (_, e) => onLogo(e && e.dimensions),
          failed: () => onLogoError(),
        }}
      />
    </view>
  )
}
