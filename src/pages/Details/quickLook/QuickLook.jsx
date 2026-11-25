import $L from '../../../services/i18n.js'
import { For, batch, createSelector, createSignal, untrack } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import Draw from '../stage/Draw.jsx'
import { emptyList, finishList } from '../stage/Draw.js'
import StyledActions from '../stage/Actions.jsx'
import StageRail from '../stage/Rail.jsx'
import StageChips from '../stage/Chips.jsx'
import SeerrStatusDownloads, { downloadsLayout } from '../../../ui/components/seerr/SeerrStatusDownloads.jsx'
import { byKey } from '../../../ui/components/details/keyed.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { cssShift, fontFor, uiFont } from '../../../ui/text.js'
import { theme } from '../../../ui/theme.js'
import { hex } from '../../../ui/color.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { isInside } from '../../../app/PageStack.jsx'
import { focusScroll } from '../../../ui/components/nav/focusScroll.js'
import { SMOOTH_SCROLL } from '../../../ui/components/details/env.js'
import { actionRow } from '../modern/actions.js'
import { ACTIONS, resumeLine, stageSubtitle, trackProps } from '../stage/stageRules.js'
import { stageMetaLine, stagePieces, stageRatings, stageTechLine } from '../stage/layout.js'
import { collectionStops } from '../stage/stops.js'
import { seerrBlock } from '../stage/seerrBlock.js'
import { QUICK_LOOK_BUTTON_CAP, quickLookFacts, quickLookFade, quickLookNeighbour, quickLookSurface } from './quickLookRules.js'
import { SEASON_H, seasonCards } from './seasons.js'
import { statusDot } from '../../../ui/components/seerr/look.js'
import { rgbTriplet } from '../../../ui/themeColor.js'

// Quick Look: a title in a drawer down the right of the screen it was picked on, over a dimmed view
// of that screen, with the full page a press away.
// shortcut: the drawer doesn't slide in over 260ms, since Details draws its loading skeleton in the
// drawer's place first. Add the slide when the skeleton moves into this component.
const DRAWER_X = 960
const DRAWER_W = 960
// The drawer's left border is 1px wide, and its content starts after it.
const EDGE = 1
const INNER_W = DRAWER_W - EDGE
const PAD = 43.4
const W = INNER_W - 2 * PAD
const HEADER_H = 345.6
const FOOT_TOP = 1080 - 36.7 - 76.8 - 13.4
const SCROLL_H = FOOT_TOP
const SEASONS_ID = 'quick-look-seasons'
const OPEN_ID = 'quick-look-open'
const TRACKS_ID = 'stage-tracks'
const SLOTS = 3
const NONE = { x: 0, y: 0, show: false }
// The scrolling part and its layers take this height when they're made, as views with no size of
// their own do, so it covers the longest drawer.
const TRACK_H = 100000
const SCROLL = { y: { duration: 220, easing: 'ease-out' } }
const GONE = {
  k: '', i: -1, x: 0, w: 0, edge: 1, name: '', count: '', countX: 0, nameW: 0, textY: 0, trackY: 0, trackW: 0, share: 0, total: 0, dot: null, dotX: 0, dotY: 0,
  font: 'roboto', countFont: 'roboto',
}
// A season card with no Seerr dot keeps an icon, hidden, since a node whose src goes away loses its tint.
const NO_DOT = { fill: '#00000000', ring: '#00000000', iconAt: 0, iconSize: 0, src: 'icons/checkRounded.webp', iconColor: '#00000000' }

const hexOf = (rgb) => `#${rgb.split(',').map((n) => Number(n).toString(16).padStart(2, '0')).join('')}ff`
const surfaceRgb = () => {
  const th = theme()
  return quickLookSurface(rgbTriplet(th.background), rgbTriplet(th.onBackground))
}

export default function QuickLook(props) {
  const [open, setOpen] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  const [surface, setSurface] = createSignal('#101010ff')
  const [backdrop, setBackdrop] = createSignal('')
  const [fade, setFade] = createSignal('')
  const [scroll, setScroll] = createSignal(0)
  const [glide, setGlide] = createSignal(false)
  const [zone, setZone] = createSignal('actions')
  const [list, setList] = createSignal(emptyList())
  const [act, setAct] = createSignal({ buttons: [], x: 0, y: 0, held: true })
  const [chipsAt, setChipsAt] = createSignal(NONE)
  const [slots, setSlots] = createSignal([NONE, NONE, NONE])
  const [seasons, setSeasons] = createSignal([])
  const [seasonsPos, setSeasonsPos] = createSignal(NONE)
  const [seasonCur, setSeasonCur] = createSignal(0)
  const [openRing, setOpenRing] = createSignal('#00a4dcff')
  const [accent, setAccent] = createSignal('#00a4dcff')
  const [dl, setDl] = createSignal({ x: 0, y: 0, bars: downloadsLayout(null) })

  // What the drawer holds outside the signals.
  let v = null
  let id = null
  let behind = []
  let buttons = []
  let pos = {}
  let rails = {}
  let stops = []
  let contentH = 0
  let root = null
  let actions = null
  let chips = null
  const railRefs = []

  const semi = () => uiFont('bold')
  const openLabel = $L('Open full page')
  const openFocused = () => focused() && zone() === OPEN_ID
  const seasonOn = createSelector(() => (focused() && zone() === SEASONS_ID ? seasonCur() : -1))
  const cards = byKey(seasons, GONE)
  const openW = () => textWidth(openLabel, 23.4, 'bold')
  const openX = () => (W - openW() - 40) / 2

  // The loading placeholders inside the drawer: the backdrop band, the title, a line, the buttons
  // and three lines of text.
  const skeletonBoxes = () => {
    const tok = props.tokens
    const box = tok && !tok.isGlass && tok.os ? tok.os(0.14) : '#ffffff29'
    const out = [
      { k: 'dim', x: 0, y: 0, w: 1920, h: 1080, r: 0, color: '#0000009e' },
      { k: 'drawer', x: DRAWER_X, y: 0, w: DRAWER_W, h: 1080, r: 0, color: hexOf(surfaceRgb()) },
      { k: 'edge', x: DRAWER_X, y: 0, w: EDGE, h: 1080, r: 0, color: '#ffffff1a' },
    ]
    out.push({ k: 'band', x: DRAWER_X + EDGE, y: 0, w: INNER_W, h: HEADER_H - 56.8, r: 0, color: box })
    let y = HEADER_H - 56.8 + 26.7
    const x = DRAWER_X + EDGE + PAD
    const add = (k, w, h, r = 8, bx = x) => out.push({ k, x: bx, y, w, h, r, color: box })
    add('title', 401, 46.8)
    y += 46.8 + 16.7
    add('meta', 334, 23.4)
    y += 23.4 + 33.4
    ;[217, 76.8, 76.8, 76.8, 76.8].reduce((bx, w, i) => {
      add(`b${i}`, w, 76.8, 38.4, bx)
      return bx + w + 16.7
    }, x)
    y += 76.8 + 16.7
    ;[0, 1, 2].forEach((i) => {
      y += 13.4
      add(`l${i}`, i === 2 ? 334 : W, 20)
      y += 20
    })
    return out
  }

  const paint = (bag) =>
    untrack(() => {
      const it = bag.item
      const s = bag.settings
      batch(() => {
        if (id !== it.Id) {
          id = it.Id
          setZone('actions')
          scrollTo(0, false)
          setSeasonCur(0)
          if (actions) actions.selectFirst()
        }
        setOpen(true)
        v = bag
        const rgb = surfaceRgb()
        setSurface(hexOf(rgb))
        setOpenRing(bag.tokens.focus)
        setAccent(bag.tokens.accent || '#00a4dcff')
        setBackdrop(s.detailsBackdropEnabled !== false && bag.backdropUrl ? bag.backdropUrl : '')
        setFade(scrimSrc(quickLookFade(rgb)))
        const row = actionRow(bag.actionInput, { omitTrackButtons: true, buttonCap: QUICK_LOOK_BUTTON_CAP, overflowAsMenu: true, longLabels: true })
        behind = row.behind
        buttons = row.buttons
        props.page.setBehind(behind)
        layout()
      })
    })

  const layout = () => {
    const it = v.item
    const t = v.tokens
    const out = emptyList()
    const w = W
    const partOfShow = it.Type === 'Season' || it.Type === 'Episode'
    const name = (partOfShow && it.SeriesName) || it.Name || ''

    // The header: the name, the subtitle and the facts over the foot of the backdrop.
    let y = untrack(backdrop) ? HEADER_H - 56.8 : 106.9
    const title = wrapLines(name, 45, 'bold', w).slice(0, 2)
    title.forEach((ln, i) => out.texts.push({ k: `t${i}`, x: PAD, y: y + i * 51.75 + cssShift(45), text: ln, size: 45, font: fontFor(ln, 'bold'), color: '#ffffffff', lh: 51.75 }))
    y += title.length * 51.75
    const subtitle = stageSubtitle(it)
    if (subtitle) {
      y += 6.7
      out.texts.push({ k: 'sub', x: PAD, y: y + cssShift(26.7), text: subtitle, size: 26.7, font: fontFor(subtitle, 'bold'), color: '#ffffffd9', lh: 33, maxw: w, maxlines: 1 })
      y += 33
    }
    y += 10
    y += stageMetaLine(out, stagePieces(v), PAD, y, w, t)
    if (v.techChips.length) {
      y += 10
      y += stageTechLine(out, v.techChips, PAD, y, w)
    }
    if (v.incomplete) {
      y += 8
      out.texts.push({ k: 'incomplete', x: PAD, y: y + cssShift(20), text: v.incomplete, size: 20, font: fontFor(v.incomplete, 'bold'), color: '#e0a33cff', lh: 33, maxw: w, maxlines: 1 })
      y += 33
    }
    const hint = $L('Back to close')
    const hw = 20 + textWidth(hint, 20) + 20
    out.rects.push({ k: 'hintBg', x: INNER_W - 23.4 - hw, y: 23.4, w: hw, h: 53, r: 26.5, color: '#00000080' })
    out.texts.push({ k: 'hint', x: INNER_W - 23.4 - hw + 20, y: 33.4 + cssShift(20), text: hint, size: 20, font: fontFor(hint, 'regular'), color: '#ffffffd9', lh: 33 })

    const ratingsH = stageRatings(emptyList(), v, 0, 0, w, t, { labels: false })
    if (ratingsH) {
      y += 16.7
      stageRatings(out, v, PAD, y, w, t, { labels: false })
      y += ratingsH
    }
    y += 26.7
    setAct({ buttons, x: PAD, y, held: !v.settled })
    // The 90px lead button, its 56.7px foot margin, less the row's -20px one.
    y += 90 + 56.7 - 20
    // Seerr's download bars, 20px under the buttons.
    const bars = downloadsLayout(v.seerr && v.seerr.downloads)
    setDl({ x: PAD, y: y + 20, bars })
    if (bars.h) y += 20 + bars.h
    const progress = resumeLine(it, v.lists.nextUp || [])
    if (progress) {
      y += 20
      out.rects.push({ k: 'pt', x: PAD, y: y + 13.15, w: 250, h: 6.7, r: 3.3, color: '#ffffff26' })
      out.rects.push({ k: 'pf', x: PAD, y: y + 13.15, w: (250 * progress.percent) / 100, h: 6.7, r: 3.3, color: untrack(accent) })
      out.texts.push({ k: 'pl', x: PAD + 250 + 16.7, y: y + cssShift(20), text: progress.label, size: 20, font: fontFor(progress.label, 'regular'), color: '#ffffffbf', lh: 33, maxw: w - 266.7, maxlines: 1 })
      y += 33
    }
    const overview = v.hideDescription ? '' : v.overviewText
    if (overview) {
      y += 20
      const lines = wrapLines(overview, 23.4, 'regular', w)
      const shown = lines.slice(0, 3)
      // The third line keeps its wrap and fits its "…" in by cutting characters.
      const clamped = lines.length > 3
      if (clamped) shown[2] = `${shown[2]}…`
      shown.forEach((ln, i) => out.texts.push({
        k: `o${i}`, x: PAD, y: y + i * 35.1 + cssShift(23.4), text: ln, size: 23.4, font: fontFor(ln, 'regular'), color: '#ffffffd1', lh: 35.1,
        maxw: clamped && i === 2 ? w : 0, maxlines: 1,
      }))
      y += shown.length * 35.1
    }
    const nextPos = {}
    const nextStops = []
    const chipsH = chips ? chips.draw({ props: trackProps(v), w, shareRow: true }) : 0
    if (chipsH) {
      y += 23.4
      setChipsAt({ x: PAD, y, show: true })
      nextPos[TRACKS_ID] = { y, h: chipsH }
      nextStops.push(TRACKS_ID)
      y += chipsH
    } else setChipsAt(NONE)
    const cardsNow = it.Type === 'Series' ? seasonCards(v, w, (status) => statusDot(status, 23.4)) : []
    setSeasons(cardsNow)
    if (cardsNow.length) {
      y += 23.4
      setSeasonsPos({ x: PAD, y, show: true })
      nextPos[SEASONS_ID] = { y, h: SEASON_H }
      nextStops.push(SEASONS_ID)
      y += SEASON_H
    } else setSeasonsPos(NONE)
    const nextRails = {}
    const placed = []
    let slot = 0
    collectionStops(v).forEach((cfg) => {
      if (slot >= SLOTS || !cfg.entries.length) return
      y += 23.4
      const h = railRefs[slot].draw({ ...cfg, w, bleedRight: 0 })
      placed[slot] = { x: PAD, y, show: true }
      nextRails[cfg.id] = { slot, cfg }
      nextPos[cfg.id] = { y, h }
      nextStops.push(cfg.id)
      y += h
      slot++
    })
    for (let i = slot; i < SLOTS; i++) {
      if (railRefs[i]) railRefs[i].draw({ id: `none${i}`, kind: 'poster', entries: [], w, gap: 0, clearance: 0, titleGap: 0 })
      placed[i] = NONE
    }
    setSlots(placed)
    const facts = it.Type === 'Series' ? [] : quickLookFacts(it.Type === 'BoxSet' ? { ...it, People: v.lists.cast } : it, v.showsSection)
    if (facts.length) {
      y += 23.4
      const fw = w / facts.length
      facts.forEach((f, i) => {
        const fx = PAD + i * fw
        out.rects.push({ k: `fb${i}`, x: fx, y, w: 1, h: 71, color: '#ffffff24' })
        const label = String(f.label).toUpperCase()
        out.texts.push({ k: `fl${i}`, x: fx + 1 + 16.7, y: y + cssShift(16.7), text: label, size: 16.7, font: fontFor(label, 'regular'), color: '#ffffff99', lh: 33, ls: 1.67, maxw: fw - 1 - 33.4, maxlines: 1 })
        out.texts.push({ k: `fv${i}`, x: fx + 1 + 16.7, y: y + 38 + cssShift(21.7), text: String(f.value), size: 21.7, font: fontFor(String(f.value), 'bold'), color: '#ffffffff', lh: 33, maxw: fw - 1 - 33.4, maxlines: 1 })
      })
      y += 71
    }
    // Where it streams, as Seerr knows it.
    const pieces = (v.seerr && v.seerr.pieces) || {}
    const streaming = pieces.streaming ? seerrBlock({ ...v.seerr, pieces: { streaming: true } }, { title: false, w }) : null
    if (streaming) {
      y += 23.4
      const shift = (entry) => ({ ...entry, x: entry.x + PAD, y: entry.y + y })
      out.rects.push(...streaming.list.rects.map(shift))
      out.imgs.push(...streaming.list.imgs.map(shift))
      out.texts.push(...streaming.list.texts.map(shift))
      y += streaming.h
    }
    nextStops.push(OPEN_ID)
    rails = nextRails
    pos = nextPos
    stops = nextStops
    contentH = y + 26.7
    setList(finishList(out))
    const z = untrack(zone)
    if (z !== 'actions' && z !== OPEN_ID && !pos[z]) setZone('actions')
  }

  const refFor = (z) => {
    if (z === 'actions') return actions
    if (z === TRACKS_ID) return chips
    const rail = rails[z]
    return rail ? railRefs[rail.slot] : null
  }
  const focusZone = (z) => {
    setZone(z)
    const ref = refFor(z)
    if (ref) ref.setFocus()
    else if (root) root.setFocus()
  }
  // Scrolling to the drawer's top or foot glides where smooth scrolling is on. Scrolling to show a
  // focused row happens at once.
  const scrollTo = (top, smooth) =>
    batch(() => {
      setGlide(smooth && SMOOTH_SCROLL)
      setScroll(top)
    })
  const maxScroll = () => Math.max(0, contentH - SCROLL_H)
  const show = (top, h) => scrollTo(focusScroll(top, h, untrack(scroll), SCROLL_H, maxScroll()), false)
  // The button at the foot brings the rest of the drawer with it. A row of cards shows its focused
  // card as it reports it (onRailFocus).
  const reveal = (target) => {
    if (target === OPEN_ID) return scrollTo(maxScroll(), true)
    const p = pos[target]
    if (p && !rails[target]) show(p.y, p.h)
  }
  const go = (target) => {
    if (target === ACTIONS) {
      focusZone('actions')
      scrollTo(0, true)
      return
    }
    if (!target) return
    focusZone(target)
    reveal(target)
  }
  const move = (from, dir) => go(quickLookNeighbour(stops, from === 'actions' ? ACTIONS : from, dir))
  // A key that reaches the drawer itself: from a row that lost focus, which gets it back, or on the
  // seasons and Open full page, which the drawer draws. A press at the edge of the drawer stays in it.
  const own = (fn) => () => {
    const z = untrack(zone)
    const ref = refFor(z)
    if (ref) {
      if (!isInside(activeElement(), ref)) focusZone(z)
      return true
    }
    fn(z)
    return true
  }

  const onActionsEdge = (dir) => {
    if (dir === 'down') move(ACTIONS, 'down')
  }
  const onAction = (actionId) => {
    if (actionId === 'more') return props.page.openMore(behind)
    props.page.runAction(actionId)
  }
  const onChipsEdge = (dir) => {
    if (dir === 'up' || dir === 'down') move(TRACKS_ID, dir)
  }
  const onRailEdge = (railId, dir) => {
    if (dir === 'up' || dir === 'down') move(railId, dir)
    return true
  }
  const onRailSelect = (railId, raw) => {
    if (raw && raw._seerr) return props.page.onSeerrCardSelect(raw)
    props.page.open(raw)
  }
  const onRailLong = (railId, raw) => {
    if (!raw || raw._seerr) return onRailSelect(railId, raw)
    props.page.onCellLong({ item: raw, kind: 'card' })
  }
  const onRailFocus = (railId) => {
    const rail = rails[railId]
    const ref = rail && railRefs[rail.slot]
    const c = ref && ref.cards()[ref.cur()]
    if (c && untrack(zone) === railId) show(pos[railId].y + ref.trackY() + c.y, c.ch)
  }
  const onRailNearEnd = (railId) => {
    const rail = rails[railId]
    if (rail && rail.cfg.nearEnd) props.page.loadMoreTitles()
  }

  props.ref({
    paint,
    skeletonBoxes,
    setFocus: () => focusZone(untrack(zone)),
  })

  const dot = (s) => s.dot || NO_DOT
  return (
    <view
      ref={(n) => (root = n)}
      // The part the Magic Remote's cursor focuses becomes the zone (app/pointer.js).
      onPointerFocus={(n) => {
        const zones = ['actions', TRACKS_ID].concat(Object.keys(rails))
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
      alpha={open() ? 1 : 0}
      onFocusChanged={setFocused}
      onUp={own((z) => move(z, 'up'))}
      onDown={own((z) => move(z, 'down'))}
      onLeft={own((z) => {
        // Focus doesn't scroll the season row, so a card past its edge stays cut off.
        if (z === SEASONS_ID && untrack(seasonCur) > 0) setSeasonCur(untrack(seasonCur) - 1)
      })}
      onRight={own((z) => {
        if (z === SEASONS_ID && untrack(seasonCur) < untrack(seasons).length - 1) setSeasonCur(untrack(seasonCur) + 1)
      })}
      onEnter={own((z) => {
        if (z === OPEN_ID) return props.page.openFullPage(v.item, true)
        if (z !== SEASONS_ID) return
        const s = untrack(seasons)[untrack(seasonCur)]
        if (s && s.number != null) props.page.onSeerrSeasonSelect(s.number)
        else if (s) props.page.openFullPage(s.raw, false)
      })}
    >
      <view width={1920} height={1080} color="#0000009e" />
      <view x={DRAWER_X} width={DRAWER_W} height={1080} color={surface()}>
        <view width={EDGE} height={1080} color="#ffffff1a" />
        <view x={EDGE} width={INNER_W} height={SCROLL_H} clipping>
          <view transition={glide() ? SCROLL : undefined} y={-scroll()} width={INNER_W} height={TRACK_H}>
            <view
              alpha={backdrop() ? 1 : 0}
              width={INNER_W}
              height={HEADER_H}
              src={backdrop() || undefined}
              textureOptions={{ resizeMode: { type: 'cover', clipX: 0.5, clipY: 0.3 } }}
            />
            <view alpha={backdrop() && fade() ? 1 : 0} width={INNER_W} height={HEADER_H} src={fade() || undefined} />
            <Draw list={list()} w={INNER_W} h={TRACK_H} />
            <SeerrStatusDownloads x={dl().x} y={dl().y} bars={dl().bars} />
            <StyledActions
              ref={(n) => (actions = n)}
              variant="start"
              x={act().x}
              y={act().y}
              buttons={act().buttons}
              held={act().held}
              tokens={props.tokens}
              onAction={onAction}
              onActionLong={(actionId) => props.page.onActionLong(actionId)}
              onActionFocus={() => {}}
              onActionsEdge={onActionsEdge}
            />
            <StageChips
              ref={(n) => (chips = n)}
              x={chipsAt().x}
              y={chipsAt().y}
              alpha={chipsAt().show ? 1 : 0}
              tokens={props.tokens}
              onChip={(chipId) => props.page.runAction(chipId)}
              onChipsEdge={onChipsEdge}
            />
            <view x={seasonsPos().x} y={seasonsPos().y} width={W} height={SEASON_H} alpha={seasonsPos().show ? 1 : 0} clipping>
              <view width={TRACK_H} height={SEASON_H}>
                <For each={cards.keys()}>
                  {(k) => {
                    const s = () => cards.at(k)
                    const on = () => seasonOn(s().i)
                    return (
                      <view x={s().x} width={s().w} height={SEASON_H}>
                        <view
                          width={s().w}
                          height={SEASON_H}
                          borderRadius={16.7}
                          color={on() ? '#f2f2f2ff' : '#ffffff0f'}
                          border={{ width: s().edge, color: hex(on() ? openRing() : '#ffffff33') }}
                        />
                        <text
                          x={s().edge + 20}
                          y={s().textY}
                          fontFamily={s().font}
                          fontSize={20}
                          lineHeight={33}
                          maxWidth={s().nameW}
                          maxLines={1}
                          color={on() ? '#212121ff' : '#ffffffff'}
                        >
                          {s().name}
                        </text>
                        <text
                          alpha={s().count ? 1 : 0}
                          x={s().countX}
                          y={s().textY}
                          fontFamily={s().countFont}
                          fontSize={20}
                          lineHeight={33}
                          color={on() ? '#212121b3' : '#ffffffb3'}
                        >
                          {s().count}
                        </text>
                        <view
                          alpha={s().dot ? 1 : 0}
                          x={s().dotX}
                          y={s().dotY}
                          width={23.4}
                          height={23.4}
                          borderRadius={11.7}
                          color={dot(s()).fill}
                          border={{ width: 2.5, color: hex(dot(s()).ring) }}
                        >
                          <view
                            x={dot(s()).iconAt}
                            y={dot(s()).iconAt}
                            width={dot(s()).iconSize}
                            height={dot(s()).iconSize}
                            src={dot(s()).src}
                            color={dot(s()).iconColor}
                          />
                        </view>
                        <view
                          alpha={s().total ? 1 : 0}
                          x={s().edge + 20}
                          y={s().trackY}
                          width={s().trackW}
                          height={5}
                          borderRadius={3.3}
                          color={on() ? '#21212126' : '#ffffff26'}
                        >
                          <view width={s().trackW * s().share} height={5} borderRadius={3.3} color={accent()} />
                        </view>
                      </view>
                    )
                  }}
                </For>
              </view>
            </view>
            <StageRail
              ref={(n) => (railRefs[0] = n)}
              x={slots()[0].x}
              y={slots()[0].y}
              tokens={props.tokens}
              onRailEdge={onRailEdge}
              onRailFocus={onRailFocus}
              onRailSelect={onRailSelect}
              onRailLong={onRailLong}
              onRailNearEnd={onRailNearEnd}
            />
            <StageRail
              ref={(n) => (railRefs[1] = n)}
              x={slots()[1].x}
              y={slots()[1].y}
              tokens={props.tokens}
              onRailEdge={onRailEdge}
              onRailFocus={onRailFocus}
              onRailSelect={onRailSelect}
              onRailLong={onRailLong}
              onRailNearEnd={onRailNearEnd}
            />
            <StageRail
              ref={(n) => (railRefs[2] = n)}
              x={slots()[2].x}
              y={slots()[2].y}
              tokens={props.tokens}
              onRailEdge={onRailEdge}
              onRailFocus={onRailFocus}
              onRailSelect={onRailSelect}
              onRailLong={onRailLong}
              onRailNearEnd={onRailNearEnd}
            />
          </view>
        </view>
        <view x={EDGE + PAD} y={FOOT_TOP + 13.4} width={W} height={76.8}>
          <view
            width={W}
            height={76.8}
            borderRadius={38.4}
            color={openFocused() ? '#f2f2f2ff' : '#00000000'}
            border={{ width: 1, color: hex(openFocused() ? openRing() : '#ffffff40') }}
          />
          <text x={openX()} y={0} fontFamily={semi()} fontSize={23.4} lineHeight={76.8} color={openFocused() ? '#212121ff' : '#ffffffff'}>
            {openLabel}
          </text>
          <view x={openX() + openW() + 10} y={23.4} width={30} height={30} src="icons/d/core_chevron_right.webp" color={openFocused() ? '#212121ff' : '#ffffffff'} />
        </view>
      </view>
    </view>
  )
}
