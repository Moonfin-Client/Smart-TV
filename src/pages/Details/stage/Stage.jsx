import { createEffect, createSignal, on, onCleanup, untrack } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import Draw from './Draw.jsx'
import { emptyList, finishList } from './Draw.js'
import StyledActions from './Actions.jsx'
import StageRail from './Rail.jsx'
import StageChips from './Chips.jsx'
import StageFacts from './Facts.jsx'
import Overview from '../../../ui/components/details/Overview.jsx'
import Episodes from '../minimalist/Episodes.jsx'
import SeerrStatusDownloads, { downloadsLayout } from '../../../ui/components/seerr/SeerrStatusDownloads.jsx'
import { wrapLines } from '../../../ui/components/details/measure.js'
import { cssShift, fontFor, themeSpacing } from '../../../ui/text.js'
import { navOnLeft, sideNavRoom } from '../../../ui/theme.js'
import { highMs } from '../../../ui/tier.js'
import { focusNav } from '../../../app/focus.js'
import { focusScroll } from '../../../ui/components/nav/focusScroll.js'
import { hex } from '../../../ui/color.js'
import { usePage } from '../../../app/PageStack.jsx'
import { getStore } from '../../../state/store.js'
import { serverBlurredUrl } from '../../../utils/serverBlur.js'
import { getLogoUrl } from '../../../utils/helpers.js'
import { actionRow } from '../modern/actions.js'
import { ACTIONS, NAVBAR, STAGE_BUTTON_CAP, alignDelta, revealDelta, stageNeighbour, stagePoster, stageScrimAlpha, stageSubtitle, trackProps } from './stageRules.js'
import { stageMetaLine, stagePieces, stageRatings, stageTechLine, txt } from './layout.js'
import { collectionStops, rowStops, seerrSeasonsStop } from './stops.js'
import { seerrBlock } from './seerrBlock.js'
import { softBackdrop } from '../../../services/softBackdrop.js'
import { alphaHex } from '../../../ui/themeColor.js'

// The Stage details style: the poster stands on the left with Play and the other buttons under it,
// and the title, its facts, ratings, tagline, overview, track pickers, the people and studios panel
// or the episodes sit beside it. Extras and the rows of other titles run full width underneath.
// Details hands it everything through paint(bag) and focuses it with setFocus().
const PAD_TOP = 172
const PAD_END = 80
const POSTER_W = 388
const BESIDE_GAP = 67
const REVEAL_CLEARANCE = 48
const VIEW_H = 1080
const SLOTS = 12
const SLOT_IDS = Array.from({ length: SLOTS }, (_, i) => i)
// Past this the toolbar along the top fades out, so it never sits over the rows scrolled up to it.
const TOOLBAR_HIDES_AT = 24
// The scrolling page and its display lists take this height, so no part of a long page is culled.
const PAGE_H = 100000
const SHOW_TYPES = ['Series', 'Season', 'Episode']
const OVERVIEW_ID = 'stage-overview'
const TRACKS_ID = 'stage-tracks'
const FACTS_ID = 'stage-facts'
const EPISODES_ID = 'minimalist-episodes'
const SEERR_ID = 'stage-seerr'
const SCROLL = { y: { duration: 300, easing: 'ease-out' } }

const stageLeft = (room) => (room === 'rail' ? 200 : room === 'control' ? 120 : 80)

const NONE = { x: 0, y: 0, show: false }
// Neon Pulse spaces all its text 0.6px, bar what sets a spacing of its own.
const spaced = (list) => {
  const ls = themeSpacing()
  return ls ? { ...list, texts: list.texts.map((tx) => (tx.ls ? tx : { ...tx, ls })) } : list
}
const NO_OV = { ...NONE, text: '', font: 'roboto', box: null }
const NO_CHIP = { x: 0, y: 0, w: 0, show: false, text: '', font: 'roboto' }
const NO_BOX = { x: 0, y: 0, w: 0, h: 0, show: false }
const CHIP_GROW = { scale: { duration: 200, easing: 'ease' } }

export default function Stage(props) {
  const store = getStore()
  const page = usePage()
  const p = props.page
  const [backdrop, setBackdrop] = createSignal('')
  const [scrim, setScrim] = createSignal('#00000000')
  const [scroll, setScrollTo] = createSignal(0)
  const [zone, setZone] = createSignal('actions')
  const [logoProbe, setLogoProbe] = createSignal('')
  const [art, setArt] = createSignal(emptyList())
  const [hero, setHero] = createSignal(emptyList())
  const [seerrList, setSeerrList] = createSignal(emptyList())
  const [seerrPos, setSeerrPos] = createSignal(NONE)
  const [seerrChip, setSeerrChip] = createSignal(NO_CHIP)
  const [seerrFacts, setSeerrFacts] = createSignal(NO_BOX)
  // Which part of Seerr's block holds focus, the chip or the facts box, kept so focus comes back to
  // the last one.
  const [seerrPart, setSeerrPart] = createSignal('chip')
  const [act, setAct] = createSignal({ buttons: [], x: 0, y: 0, held: true })
  const [ov, setOv] = createSignal(NO_OV)
  const [overviewExpanded, setOverviewExpanded] = createSignal(false)
  const [chips, setChips] = createSignal(NONE)
  const [facts, setFacts] = createSignal(NONE)
  const [ep, setEp] = createSignal({ ...NONE, left: true })
  const [slots, setSlots] = createSignal(SLOT_IDS.map(() => NONE))
  const [dl, setDl] = createSignal({ x: 0, y: 0, bars: downloadsLayout(null) })
  const [zoom, setZoom] = createSignal(true)
  const [painted, setPainted] = createSignal(false)
  const tokens = () => props.tokens

  // What paint() worked out that only the key handlers read.
  const m = { id: null, v: null, logos: {}, pos: {}, rails: {}, stops: { beside: [], below: [] }, buttons: [], behind: [], contentH: VIEW_H }
  const refs = { rails: [] }
  let root = null

  // The loading skeleton: the poster, Play and four circles, and beside them the title, the facts
  // line, a ratings chip and three lines of overview.
  const skeletonBoxes = () => {
    // Details asks for these as a load starts, and the skeleton shows in place of the page.
    setPainted(false)
    const L = stageLeft(sideNavRoom())
    const tok = props.tokens
    const box = tok && !tok.isGlass && tok.os ? tok.os(0.14) : '#ffffff29'
    const out = []
    const add = (k, x, y, w, h, r = 8) => out.push({ k, x, y, w, h, r, color: box })
    add('poster', L, PAD_TOP, 388, 582, 13)
    add('play', L, PAD_TOP + 582 + 28, 388, 86, 43)
    ;[0, 1, 2, 3].forEach((i) => add(`c${i}`, L + i * 100.66, PAD_TOP + 582 + 28 + 86 + 24, 86, 86, 43))
    const bx = L + POSTER_W + BESIDE_GAP
    const bw = 1920 - PAD_END - bx
    let y = PAD_TOP
    add('title', bx, y, 480, 110)
    y += 110 + 16
    ;[63, 36, 84, 72, 63].reduce((x, w, i) => {
      add(`m${i}`, x, y, w, 20, 4)
      return x + w + 13
    }, bx)
    y += 20 + 14
    add('rating', bx, y, 104, 48, 6)
    y += 48 + 18
    add('o0', bx, y, bw * 0.7, 20, 4)
    y += 30
    add('o1', bx, y, bw * 0.7, 20, 4)
    y += 30
    add('o2', bx, y, bw * 0.4, 20, 4)
    return out
  }

  const paint = (v) =>
    untrack(() => {
      const it = v.item
      const s = v.settings
      if (m.id !== it.Id) {
        m.id = it.Id
        setZone('actions')
        setScrollTo(0)
        setOverviewExpanded(false)
        setSeerrPart('chip')
        if (refs.actions) refs.actions.selectFirst()
      }
      m.v = v
      setPainted(true)
      const blur = Number(s.backdropBlurDetail != null ? s.backdropBlurDetail : 20)
      const shown = s.detailsBackdropEnabled !== false && v.backdropUrl
      const blurred = shown ? serverBlurredUrl(v.backdropUrl, blur) : null
      if (shown && !blurred && blur > 0) {
        // Art from outside the server is blurred here, and shows once it's ready.
        const key = `${blur}|${v.backdropUrl}`
        if (m.soft !== key) {
          m.soft = key
          setBackdrop('')
          softBackdrop(v.backdropUrl, blur, (src) => m.soft === key && setBackdrop(src))
        }
      } else {
        m.soft = ''
        setBackdrop(blurred || (shown ? v.backdropUrl : ''))
      }
      setScrim(`#000000${alphaHex(stageScrimAlpha(blur))}`)
      setZoom(s.cardFocusZoom !== false)
      const row = actionRow(v.actionInput, { omitTrackButtons: true, buttonCap: STAGE_BUTTON_CAP, overflowAsMenu: true, longLabels: true })
      m.behind = row.behind
      m.buttons = row.buttons
      p.setBehind(row.behind)
      layout()
    })

  const logoFor = (v) => {
    if (!v.logoUrl) return null
    const url = getLogoUrl(v.server, v.item, { maxWidth: 700, quality: 90 })
    if (!url) return null
    // Only the logo on show is kept, so an earlier one's size doesn't linger.
    if (!m.logos[url]) m.logos = { [url]: { url, w: 0, h: 0, failed: false } }
    const logo = m.logos[url]
    if (logo.failed) return null
    if (!logo.w) setLogoProbe(url)
    return logo
  }
  const onLogo = (dim) => {
    const logo = m.logos[untrack(logoProbe)]
    if (!logo || !dim || !dim.w) return
    logo.w = dim.w
    logo.h = dim.h
    if (m.v) layout()
  }
  const onLogoError = () => {
    const logo = m.logos[untrack(logoProbe)]
    if (!logo) return
    logo.failed = true
    if (m.v) layout()
  }

  const layout = () =>
    untrack(() => {
      const v = m.v
      const it = v.item
      const s = v.settings
      const t = v.tokens
      const L = stageLeft(sideNavRoom(s))
      const bx = L + POSTER_W + BESIDE_GAP
      const bw = 1920 - PAD_END - bx
      const out = emptyList()
      const isShow = SHOW_TYPES.indexOf(it.Type) >= 0
      const partOfShow = it.Type === 'Season' || it.Type === 'Episode'

      const poster = stagePoster(v.server, it, s)
      const posterH = poster.wide ? 218 : 582
      // The poster draws in a list of its own under the rest, since a list draws its pictures over
      // its boxes and the poster's marks are boxes.
      const art = emptyList()
      art.rects.push({ k: 'posterBg', x: L, y: PAD_TOP, w: POSTER_W, h: posterH, r: 13, color: '#ffffff0f' })
      if (poster.url) art.imgs.push({ k: 'poster', x: L, y: PAD_TOP, w: POSTER_W, h: posterH, src: poster.url, r: 13 })
      else art.imgs.push({ k: 'posterIcon', x: L + 162, y: PAD_TOP + posterH / 2 - 32, w: 64, h: 64, src: 'icons/d/series.webp', color: '#ffffff4d', fit: 'contain' })
      setArt(finishList(art))
      const ud = it.UserData || {}
      const onBadge = t.onBadge || '#ffffffff'
      if (ud.IsFavorite) {
        out.rects.push({ k: 'fav', x: L + 10, y: PAD_TOP + 10, w: 43, h: 43, r: 21.5, color: '#f44336ff', bw: 1.5, bc: '#ffffffff' })
        out.imgs.push({ k: 'favI', x: L + 19, y: PAD_TOP + 19, w: 25, h: 25, src: 'icons/d/favorite.webp', color: onBadge })
      }
      if (ud.Played) {
        out.rects.push({ k: 'seen', x: L + POSTER_W - 53, y: PAD_TOP + 10, w: 43, h: 43, r: 21.5, color: t.badgeWatched || '#00a4dce6', bw: 1.5, bc: onBadge })
        out.imgs.push({ k: 'seenI', x: L + POSTER_W - 53 + 8.5, y: PAD_TOP + 18.5, w: 26, h: 26, src: 'icons/d/watched.webp', color: onBadge })
      }
      const progress = ud.PlayedPercentage || 0
      if (progress > 0 && progress < 100) {
        out.rects.push({ k: 'track', x: L + 10, y: PAD_TOP + posterH - 20, w: POSTER_W - 20, h: 10, r: 5, color: '#0000008a' })
        out.rects.push({ k: 'fill', x: L + 10, y: PAD_TOP + posterH - 20, w: ((POSTER_W - 20) * progress) / 100, h: 10, r: 5, color: t.accent || '#00a4dcff' })
      }
      const actY = PAD_TOP + posterH + 28
      const actH = 86 + (m.buttons.length > 1 ? 24 + 86 : 0) + 34
      setAct({ buttons: m.buttons, x: L, y: actY, held: !v.settled })

      let y = PAD_TOP
      const logo = logoFor(v)
      const name = (partOfShow && it.SeriesName) || it.Name || ''
      if (logo && logo.w) {
        const k = Math.min(1, 600 / logo.w, 173 / logo.h)
        out.imgs.push({ k: 'logo', x: bx, y, w: logo.w * k, h: logo.h * k, src: logo.url, fit: 'contain' })
        y += logo.h * k
      } else if (!logo) {
        const lines = wrapLines(name, 63, 'bold', bw).slice(0, 2)
        lines.forEach((ln, i) => txt(out, `title${i}`, bx, y + i * 69.3, ln, 63, 'bold', '#ffffffff', { lh: 69.3 }))
        y += lines.length * 69.3
      }
      const subtitle = stageSubtitle(it)
      if (subtitle) {
        y += 13
        const lines = wrapLines(subtitle, 43, 'bold', bw).slice(0, 2)
        lines.forEach((ln, i) => txt(out, `sub${i}`, bx, y + i * 47.3, ln, 43, 'bold', '#ffffffff', { lh: 47.3 }))
        y += lines.length * 47.3
      }
      y += 17
      y += stageMetaLine(out, stagePieces(v), bx, y, bw, t)
      if (v.techChips.length) {
        y += 10
        y += stageTechLine(out, v.techChips, bx, y, bw)
      }
      if (v.incomplete) {
        y += 8
        txt(out, 'incomplete', bx, y, v.incomplete, 20, 'bold', '#e0a33cff', { lh: 33, maxw: bw, maxlines: 1 })
        y += 33
      }
      // An empty ratings row's 17px margin collapses into the next one's, which is never less.
      const ratingsH = stageRatings(out, v, bx, y + 17, bw, t)
      if (ratingsH) y += 17 + ratingsH
      if (v.tagline) {
        y += 20
        const lines = wrapLines(v.tagline, 27, 'regular', bw)
        // Italic needs a canvas face. A theme's own face only has its atlas, so it draws upright there.
        lines.forEach((ln, i) => {
          const face = fontFor(ln, 'regular')
          const font = /^roboto/.test(face) ? 'roboto-web' : face
          out.texts.push({ k: `tag${i}`, x: bx, y: y + i * 40.5 + cssShift(27), text: `[i]${ln.replace(/\[/g, '(')}[/i]`, rich: true, size: 27, font, color: '#ffffffd1', lh: 40.5 })
        })
        y += lines.length * 40.5
      }
      const overviewText = !v.hideDescription ? v.overviewText : ''
      if (overviewText) {
        y += 20
        const plain = wrapLines(overviewText, 23.4, 'regular', bw).length
        const canToggle = plain > 4
        const textW = canToggle ? bw - 36 : bw
        const box = { canToggle, textW, lines: canToggle ? wrapLines(overviewText, 23.4, 'regular', textW).length : plain, width: bw }
        setOv({ show: true, x: bx, y, text: overviewText, font: fontFor(overviewText), box })
        const lh = 35.1
        y += !canToggle ? box.lines * lh : overviewExpanded() ? Math.min(319, 36 + box.lines * lh + 12 + 33) : 36 + 4 * lh + 12 + 33
      } else {
        setOv(NO_OV)
      }
      const bars = downloadsLayout(v.seerr && v.seerr.downloads)
      setDl({ x: bx, y: y + 16, bars })
      if (bars.h) y += 16 + bars.h

      const beside = []
      const below = []
      const pos = {}
      const chipsH = refs.chips ? refs.chips.draw({ props: trackProps(v), w: bw, shareRow: false }) : 0
      if (chipsH) {
        y += 30
        setChips({ x: bx, y, show: true })
        pos[TRACKS_ID] = { y, h: chipsH }
        beside.push(TRACKS_ID)
        y += chipsH
      } else setChips(NONE)
      const factsH = !isShow && refs.facts ? refs.facts.draw({ item: it.Type === 'BoxSet' ? { ...it, People: v.lists.cast } : it, showsSection: v.showsSection, w: bw, weighByText: false }) : 0
      if (factsH) {
        y += 30
        setFacts({ x: bx, y, show: true })
        pos[FACTS_ID] = { y, h: factsH }
        beside.push(FACTS_ID)
        y += factsH
      } else setFacts(NONE)
      const episodes = refs.episodes
      const epData = { item: it, settings: s, serverUrl: v.server, seasons: v.lists.seasons, episodes: v.lists.episodes, seriesEpisodes: v.lists.seriesEpisodes }
      let epAt = { ...NONE, left: true }
      if ((it.Type === 'Series' || it.Type === 'Season') && episodes) {
        const h = episodes.draw({ ...epData, w: bw })
        if (h) {
          // The episodes' own 34px top margin collapses with the stop's 30px.
          y += 34
          epAt = { x: bx, y, show: true, left: true }
          pos[EPISODES_ID] = { y, h }
          beside.push(EPISODES_ID)
          y += h
        }
      }
      // A show only in Seerr has its seasons beside the poster in place of the episodes.
      const seasons = seerrSeasonsStop(v)
      let seasonsAt = null
      if (seasons) {
        y += 30
        seasonsAt = { x: bx, y, h: refs.rails[0].draw({ ...seasons, w: bw, bleedRight: PAD_END }) }
        pos[seasons.id] = { y, h: seasonsAt.h }
        beside.push(seasons.id)
        y += seasonsAt.h
      }
      let bottom = Math.max(actY + actH, y)

      const fullW = 1920 - PAD_END - L
      if (it.Type === 'Episode' && v.showsSection('moreEpisodes') && episodes) {
        const h = episodes.draw({ ...epData, w: fullW })
        if (h) {
          bottom += 47
          epAt = { x: L, y: bottom, show: true, left: false }
          pos[EPISODES_ID] = { y: bottom, h }
          below.push(EPISODES_ID)
          bottom += h
        }
      }
      setEp(epAt)
      const rails = collectionStops(v).concat(rowStops(v))
      const railRefs = {}
      let slot = 0
      const placed = []
      let block = null
      if (seasonsAt) {
        placed[0] = { x: seasonsAt.x, y: seasonsAt.y, show: true }
        railRefs[seasons.id] = { slot: 0, cfg: seasons }
        slot = 1
      }
      rails.forEach((cfg) => {
        if (cfg.block) {
          block = seerrBlock(v.seerr)
          if (!block) return
          bottom += 47
          setSeerrPos({ x: L, y: bottom, show: true })
          const factsBox = block.list.rects.find((r) => r.k === 'facts')
          pos[SEERR_ID] = { y: bottom, h: block.h, chip: block.chip, facts: factsBox ? { y: factsBox.y, h: factsBox.h } : null }
          below.push(SEERR_ID)
          bottom += block.h
          return
        }
        if (slot >= SLOTS || !cfg.entries.length) return
        const h = refs.rails[slot].draw({ ...cfg, w: fullW, bleedRight: PAD_END })
        bottom += 47
        placed[slot] = { x: L, y: bottom, show: true }
        railRefs[cfg.id] = { slot, cfg }
        pos[cfg.id] = { y: bottom, h }
        below.push(cfg.id)
        bottom += h
        slot++
      })
      // Seerr's chip grows with focus, so it draws on its own rather than in the block's list.
      const chipText = block && block.list.texts.find((tx) => tx.k === 'chipText')
      setSeerrList(block ? spaced(finishList({ ...block.list, rects: block.list.rects.filter((r) => r.k !== 'chip'), texts: block.list.texts.filter((tx) => tx.k !== 'chipText') })) : emptyList())
      setSeerrChip(block && block.chip && chipText ? { ...block.chip, show: true, text: chipText.text, font: chipText.font } : NO_CHIP)
      const factsAt = block && pos[SEERR_ID].facts && block.list.rects.find((r) => r.k === 'facts')
      setSeerrFacts(factsAt ? { x: factsAt.x, y: factsAt.y, w: factsAt.w, h: factsAt.h, show: true } : NO_BOX)
      if (!block) setSeerrPos(NONE)
      for (let i = slot; i < SLOTS; i++) {
        refs.rails[i].draw({ id: `none${i}`, kind: 'poster', entries: [], w: fullW, gap: 0, clearance: 0, titleGap: 0 })
        placed[i] = NONE
      }
      setSlots(placed)
      m.rails = railRefs
      m.pos = pos
      m.contentH = bottom + PAD_END
      // The overview leads the column. It only takes focus once its text runs long enough to open up.
      m.stops = { beside: (overviewText ? [OVERVIEW_ID] : []).concat(beside), below }
      setHero(spaced(finishList(out)))
      const z = zone()
      if (z !== 'actions' && z !== OVERVIEW_ID && !pos[z]) setZone('actions')
    })

  const refFor = (z) => {
    if (z === 'actions') return refs.actions
    if (z === OVERVIEW_ID) return refs.overview
    if (z === TRACKS_ID) return refs.chips
    if (z === FACTS_ID) return refs.facts
    if (z === EPISODES_ID) return refs.episodes
    const rail = m.rails[z]
    return rail ? refs.rails[rail.slot] : null
  }
  const focusZone = (z) => {
    setZone(z)
    const c = refFor(z)
    // Seerr's chip is drawn here, so the root holds focus for it.
    if (c) c.setFocus()
    else if (root) root.setFocus()
  }
  const canFocus = (id) => {
    if (id === OVERVIEW_ID) return Boolean(ov().show && ov().box && ov().box.canToggle)
    if (id === SEERR_ID) return Boolean(m.pos[SEERR_ID] && (m.pos[SEERR_ID].chip || m.pos[SEERR_ID].facts))
    return Boolean(m.pos[id])
  }
  // The toolbar along the top fades once the page scrolls under it.
  const setChrome = (hidden) => {
    if (navOnLeft() || store.navVisible === !hidden) return
    store.navVisible = !hidden
  }
  const setScroll = (next) => {
    const max = Math.max(0, (m.contentH || VIEW_H) - VIEW_H)
    const s = Math.max(0, Math.min(max, next))
    setScrollTo(s)
    setChrome(s > TOOLBAR_HIDES_AT)
  }
  // The focused element of a stop, in page pixels.
  const activeBox = (id) => {
    const at = m.pos[id] || { y: 0, h: 0 }
    if (id === OVERVIEW_ID) return { y: ov().y, h: 4 * 35.1 + 81 }
    if (id === SEERR_ID) return seerrPart() === 'chip' ? { y: at.y + at.chip.y, h: 53 } : { y: at.y + at.facts.y, h: at.facts.h }
    if (id === TRACKS_ID) return { y: at.y, h: 68 }
    if (id === FACTS_ID) return { y: at.y, h: at.h }
    const rail = m.rails[id] && refs.rails[m.rails[id].slot]
    const c = rail && rail.cards()[rail.cur()]
    if (!c) return at
    // The whole focused card counts, title and all. A person grows 5% at once where the tier drops
    // its transition, and its box with it.
    const grow = c.person && !highMs(150) ? 0.05 : 0
    return { y: at.y + rail.trackY() + c.y - (c.ch * grow) / 2, h: c.ch * (1 + grow) }
  }
  // Focus lands first, then the episodes scroll only as far as it takes to show the whole section,
  // and any other stop lines its focused card up 30% of the way down the room around it.
  const focusStop = (id) => {
    if (!canFocus(id)) return false
    if (id === SEERR_ID && !m.pos[id][seerrPart()]) setSeerrPart(m.pos[id].chip ? 'chip' : 'facts')
    focusZone(id)
    const s = scroll()
    let delta
    if (id === EPISODES_ID) {
      const at = m.pos[id]
      delta = revealDelta({ top: at.y - s, bottom: at.y + at.h - s }, { viewTop: REVEAL_CLEARANCE, viewBottom: VIEW_H - REVEAL_CLEARANCE })
    } else {
      const box = activeBox(id)
      delta = alignDelta({ top: box.y - s, bottom: box.y + box.h - s }, { viewTop: 0, viewBottom: VIEW_H })
    }
    if (delta) setScroll(s + delta)
    return true
  }
  const go = (target, direction) => {
    let next = target
    const navbarTop = !navOnLeft()
    while (next) {
      if (next === NAVBAR) {
        setScroll(0)
        focusNav()
        return
      }
      if (next === ACTIONS) {
        if (refs.actions) refs.actions.selectFirst()
        focusZone('actions')
        setScroll(0)
        return
      }
      if (focusStop(next)) return
      next = stageNeighbour(m.stops, next, direction, navbarTop)
    }
  }
  const move = (from, direction) => go(stageNeighbour(m.stops, from === 'actions' ? ACTIONS : from, direction, !navOnLeft()), direction)
  const toActions = () => go(ACTIONS, 'left')
  const isBeside = (id) => m.stops.beside.indexOf(id) >= 0
  // Details can focus the root while a part should hold focus, which then hands it on.
  const lost = () => {
    if (zone() === SEERR_ID || activeElement() !== root) return false
    focusZone(zone())
    return true
  }

  const onActionsEdge = (dir) => {
    if (dir === 'up') {
      if (!navOnLeft()) go(NAVBAR, 'up')
    } else if (dir === 'down') move(ACTIONS, 'down')
    else if (dir === 'right') {
      if (m.stops.beside.length) move(ACTIONS, 'right')
      else if (refs.actions && refs.actions.cur() === 0 && m.buttons.length > 1) refs.actions.go(1)
    } else if (dir === 'left' && navOnLeft()) focusNav()
  }
  const onAction = (id) => {
    if (id === 'more') return p.openMore(m.behind)
    p.runAction(id)
  }
  const onOverviewToggle = () => {
    setOverviewExpanded(!overviewExpanded())
    layout()
  }
  const onChipsEdge = (dir) => {
    if (dir === 'left') return toActions()
    if (dir === 'up' || dir === 'down') move(TRACKS_ID, dir)
  }
  const onFactsEdge = (dir) => {
    if (dir === 'left') return toActions()
    if (dir === 'up' || dir === 'down') move(FACTS_ID, dir)
  }
  const onEpisodesEdge = (dir) => {
    if (dir === 'left') return toActions()
    move(EPISODES_ID, dir)
  }
  const onRailEdge = (id, dir) => {
    if (dir === 'up' || dir === 'down') {
      move(id, dir)
      return true
    }
    // Beside the poster, Left off the first card goes back to the buttons and Right off the last
    // stays put. Below it the rail wraps, or Left goes to a sidebar.
    if (isBeside(id)) {
      if (dir === 'left') toActions()
      return true
    }
    return false
  }
  const onRailSelect = (id, raw) => {
    if (id === 'stage-seasons') return p.onSeerrSeasonSelect(raw.seasonNumber)
    // Details sends a Seerr-only title's cast to Seerr's person page.
    if (id === 'stage-cast') return p.onCellSelect({ kind: 'person', item: raw })
    if (id === 'stage-extras') return p.playItem(raw, false)
    if (raw && raw._seerr) return p.onSeerrCardSelect(raw)
    p.open(raw)
  }
  const onRailLong = (id, raw) => {
    const rail = m.rails[id]
    if (!rail || !rail.cfg.menu || !raw || raw._seerr) return onRailSelect(id, raw)
    p.onCellLong({ item: raw, kind: 'card' })
  }
  const onRailNearEnd = (id) => {
    const rail = m.rails[id]
    if (rail && rail.cfg.nearEnd) p.loadMoreTitles()
  }

  // A page opened over this one gets the toolbar back, and so does leaving.
  if (page) createEffect(on(page.active, (a) => !a && setChrome(false), { defer: true }))
  onCleanup(() => setChrome(false))

  const seerrOn = (part) => zone() === SEERR_ID && seerrPart() === part && activeElement() === root
  // Up and Down move between the chip and the facts box, scrolling just enough to show the one that
  // takes focus.
  const seerrStep = (part) => {
    const at = m.pos[SEERR_ID]
    const box = at && at[part === 'chip' ? 'chip' : 'facts']
    if (zone() !== SEERR_ID || seerrPart() === part || !box) return false
    setSeerrPart(part)
    const top = at.y + box.y
    setScroll(focusScroll(top, part === 'chip' ? 53 : box.h, scroll(), VIEW_H, Math.max(0, m.contentH - VIEW_H)))
    return true
  }

  const view = (
    <view
      ref={(n) => (root = n)}
      // The part the Magic Remote's cursor focuses becomes the zone (app/pointer.js).
      onPointerFocus={(n) => {
        const zones = ['actions', OVERVIEW_ID, TRACKS_ID, FACTS_ID, EPISODES_ID].concat(Object.keys(m.rails))
        for (let p = n; p; p = p.parent) {
          const z = zones.find((k) => refFor(k) === p)
          if (z === undefined) continue
          if (untrack(zone) !== z) focusZone(z)
          return true
        }
        return false
      }}
      width={1920}
      height={1080}
      alpha={painted() ? 1 : 0}
      onFocusChanged={(has) => has && setChrome(scroll() > TOOLBAR_HIDES_AT)}
      onUp={() => {
        if (!lost() && !seerrStep('chip')) move(zone(), 'up')
        return true
      }}
      onDown={() => {
        if (!lost() && !seerrStep('facts')) move(zone(), 'down')
        return true
      }}
      onLeft={() => {
        if (lost()) return true
        if (zone() === OVERVIEW_ID) toActions()
        else if (zone() === SEERR_ID && navOnLeft()) focusNav()
        return true
      }}
      onRight={() => {
        lost()
        return true
      }}
      onEnter={() => {
        if (!lost() && seerrOn('chip')) p.onSeerrPiece('chips')
        return true
      }}
      onBack={() => {
        if (overviewExpanded()) {
          setOverviewExpanded(false)
          layout()
          return true
        }
        setChrome(false)
        return false
      }}
    >
      <view width={1920} height={1080} color="#0b0d10ff" />
      <view alpha={backdrop() ? 1 : 0} width={1920} height={1080} src={backdrop() || undefined} textureOptions={{ resizeMode: { type: 'cover' } }} />
      <view width={1920} height={1080} color={scrim()} />
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
      <view transition={SCROLL} y={-scroll()} width={1920} height={PAGE_H}>
        <Draw list={art()} w={1920} h={PAGE_H} />
        <Draw list={hero()} w={1920} h={PAGE_H} />
        <StyledActions
          ref={(n) => (refs.actions = n)}
          variant="stacked"
          x={act().x}
          y={act().y}
          buttons={act().buttons}
          held={act().held}
          tokens={tokens()}
          onAction={onAction}
          onActionLong={(id) => p.onActionLong(id)}
          onActionFocus={() => {}}
          onActionsEdge={onActionsEdge}
        />
        <Overview
          ref={(n) => (refs.overview = n)}
          variant="stage"
          x={ov().x}
          y={ov().y}
          alpha={ov().show ? 1 : 0}
          text={ov().text}
          font={ov().font}
          box={ov().box}
          expanded={overviewExpanded()}
          spacing={themeSpacing()}
          tokens={tokens()}
          onOverviewToggle={onOverviewToggle}
        />
        <SeerrStatusDownloads x={dl().x} y={dl().y} bars={dl().bars} />
        <StageChips
          ref={(n) => (refs.chips = n)}
          x={chips().x}
          y={chips().y}
          alpha={chips().show ? 1 : 0}
          tokens={tokens()}
          onChip={(id) => p.runAction(id)}
          onChipsEdge={onChipsEdge}
        />
        <StageFacts
          ref={(n) => (refs.facts = n)}
          x={facts().x}
          y={facts().y}
          alpha={facts().show ? 1 : 0}
          tokens={tokens()}
          onFactsEdge={onFactsEdge}
          onFactsPerson={(person) => p.onCellSelect({ kind: 'person', item: person })}
          onFactsStudio={(name) => p.onCellSelect({ kind: 'studio', studioName: name })}
        />
        <Episodes
          ref={(n) => (refs.episodes = n)}
          large
          bleedRight={PAD_END}
          leftEdge={ep().left}
          x={ep().x}
          y={ep().y}
          alpha={ep().show ? 1 : 0}
          tokens={tokens()}
          onEpisodesEdge={onEpisodesEdge}
          // An episode's own card plays it, and any other opens.
          onEpisodeSelect={(e) => p.onCellSelect({ kind: 'episode', item: e })}
          onEpisodeLong={(e) => p.onCellLong({ item: e, kind: 'card' })}
          onEpisodesFocus={() => {}}
          onEpisodesResize={() => layout()}
        />
        <view x={seerrPos().x} y={seerrPos().y} alpha={seerrPos().show ? 1 : 0} width={1920} height={PAGE_H}>
          <Draw list={seerrList()} w={1920} h={PAGE_H} />
          <view
            transition={CHIP_GROW}
            alpha={seerrChip().show ? 1 : 0}
            x={seerrChip().x}
            y={seerrChip().y}
            width={seerrChip().w}
            height={53}
            pivotX={0.5}
            pivotY={0.5}
            scale={seerrOn('chip') ? 1.05 : 1}
            borderRadius={26.5}
            color={seerrOn('chip') ? '#4b5563ff' : '#374151ff'}
          >
            <text x={20} y={10 + cssShift(14)} fontFamily={seerrChip().font} fontSize={14} lineHeight={33} letterSpacing={themeSpacing()} color="#ffffffff">
              {seerrChip().text}
            </text>
          </view>
          <view
            alpha={seerrFacts().show && seerrOn('facts') ? 1 : 0}
            x={seerrFacts().x}
            y={seerrFacts().y}
            width={seerrFacts().w}
            height={seerrFacts().h}
            borderRadius={10}
            color="#00000000"
            border={{ width: 1, color: hex('#ffffffff') }}
          />
        </view>
        {SLOT_IDS.map((i) => (
          <StageRail
            ref={(n) => (refs.rails[i] = n)}
            x={slots()[i].x}
            y={slots()[i].y}
            tokens={tokens()}
            zoom={zoom()}
            onRailEdge={onRailEdge}
            onRailSelect={onRailSelect}
            onRailLong={onRailLong}
            onRailFocus={() => {}}
            onRailNearEnd={onRailNearEnd}
          />
        ))}
      </view>
    </view>
  )

  props.ref({
    paint,
    skeletonBoxes,
    setFocus: () => {
      setChrome(scroll() > TOOLBAR_HIDES_AT)
      if (zone() === SEERR_ID) {
        if (root) root.setFocus()
      } else focusZone(zone())
    },
  })
  return view
}
