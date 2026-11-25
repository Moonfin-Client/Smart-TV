import $L from '../../../services/i18n.js'
import { For, batch, createSignal, onCleanup, untrack } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import Draw from '../stage/Draw.jsx'
import { emptyList, finishList } from '../stage/Draw.js'
import StyledActions from '../stage/Actions.jsx'
import StageRail from '../stage/Rail.jsx'
import StageChips from '../stage/Chips.jsx'
import StageFacts from '../stage/Facts.jsx'
import Episodes from '../minimalist/Episodes.jsx'
import SeerrStatusDownloads, { downloadsLayout } from '../../../ui/components/seerr/SeerrStatusDownloads.jsx'
import { byKey } from '../../../ui/components/details/keyed.js'
import { SMOOTH_SCROLL } from '../../../ui/components/details/env.js'
import { cssShift, fontFor } from '../../../ui/text.js'
import { navOnLeft, sideNavRoom, theme } from '../../../ui/theme.js'
import { hex } from '../../../ui/color.js'
import { focusNav } from '../../../app/focus.js'
import { router } from '../../../app/router.js'
import { getStore } from '../../../state/store.js'
import { getLogoUrl } from '../../../utils/helpers.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { isSeerrOnlyItem } from '../../../utils/seerrTarget.js'
import { actionRow } from '../modern/actions.js'
import { ACTIONS, NAVBAR, trackProps } from '../stage/stageRules.js'
import { collectionStops, rowStops, seerrSeasonsStop } from '../stage/stops.js'
import { seerrBlock } from '../stage/seerrBlock.js'
import { premiereDim, premiereNeighbour, premiereScrim } from './premiereRules.js'
import { HERO_PAD_X, VIEW_H, layoutHero, premiereLeft, premiereSkeleton } from './layout.js'
import { rgbTriplet } from '../../../ui/themeColor.js'

// The title centered over its backdrop on the first screen, the buttons and ratings under it, and an
// arrow at the foot pointing to the framed sections further down, each its own focus stop.
// shortcut: the logo has no drop shadow, add one when the renderer can shadow an image.
const SECTION_TOP = 40
// The design's 3.3px frame border, which draws and lays out 3px wide.
const FRAME = 3
const FRAME_PAD = { top: 26.7, x: 30, bottom: 30 }
const EPISODE_CARD = { sidebar: 418, top: 431 }
const AUTO_BUTTONS = 6
const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const TRACKS_ID = 'stage-tracks'
const FACTS_ID = 'stage-facts'
const EPISODES_ID = 'minimalist-episodes'
const SEERR_ID = 'stage-seerr'
// Scrolled past this, the toolbar along the top fades out.
const TOOLBAR_HIDES_AT = 24

const NONE = { x: 0, y: 0, show: false }
const NO_RING = { x: 0, y: 0, w: 0, h: 0, show: false }
const GONE_FRAME = { id: '', x: 0, y: 0, w: 0, h: 0, whole: false }
const BACKDROP_FIT = { resizeMode: { type: 'cover', clipX: 0.5, clipY: 0 } }
const SCROLL = { y: { duration: 300, easing: 'ease-out' } }
const RING = hex('#ffffff2e')
const CHIP_LABEL = () => $L('Genres and Tags')
// More Actions sits in this page's own scroller, from the top of the screen, under its centered text.
const MORE_FRAME = { x: 0, y: 0, k: 1, w: 1920, h: 1080, top: 0, center: true }
const WHOLE_RING = hex('#ffffffff')


export default function Premiere(props) {
  const page = props.page
  const store = getStore()
  // Clear until the first paint, so the page's skeleton under it shows while the item loads.
  const [bg, setBg] = createSignal('#00000000')
  const [backdrop, setBackdrop] = createSignal('')
  const [scrim, setScrim] = createSignal('')
  const [scroll, setScrollTo] = createSignal(0)
  const [trackH, setTrackH] = createSignal(VIEW_H)
  const [tokens, setTokens] = createSignal(null)
  const [zone, setZone] = createSignal('actions')
  const [has, setHas] = createSignal(false)
  const [logoProbe, setLogoProbe] = createSignal('')
  const [hero, setHero] = createSignal(emptyList())
  const [seerrList, setSeerrList] = createSignal(emptyList())
  const [seerrPos, setSeerrPos] = createSignal({ ...NONE, w: 0, h: 0 })
  const [chipRing, setChipRing] = createSignal(NO_RING)
  const [factsRing, setFactsRing] = createSignal(NO_RING)
  // Which of Seerr's two stops has focus, its Genres and Tags chip or its facts, kept for coming back.
  const [seerrPart, setSeerrPart] = createSignal('chip')
  const [frameList, setFrames] = createSignal([])
  const [act, setAct] = createSignal({ buttons: [], x: 0, y: 0, w: 1566, held: true })
  const [chips, setChips] = createSignal(NONE)
  const [facts, setFacts] = createSignal(NONE)
  const [ep, setEp] = createSignal(NONE)
  const [cardW, setCardW] = createSignal(EPISODE_CARD.top)
  const [slots, setSlots] = createSignal(SLOTS.map(() => NONE))
  const [dl, setDl] = createSignal({ x: 0, y: 0, bars: downloadsLayout(null) })
  const frames = byKey(() => frameList().map((f) => ({ ...f, k: f.id })), GONE_FRAME)

  // Plain state that nothing needs to react to.
  const m = { v: null, id: null, logos: {}, pos: {}, rails: {}, stops: [], contentH: VIEW_H, behind: [], buttons: [], laying: false }
  let root
  let actions
  let chipsRef
  let factsRef
  let episodes
  const rails = []

  const seerrOn = () => zone() === SEERR_ID && activeElement() === root

  const skeletonBoxes = () => {
    const tok = page.tokens()
    return premiereSkeleton(premiereLeft(sideNavRoom()), tok && !tok.isGlass && tok.os ? tok.os(0.14) : '#ffffff29')
  }

  const paint = (v) =>
    untrack(() =>
      batch(() => {
        const it = v.item
        const s = v.settings
        if (m.id !== it.Id) {
          m.id = it.Id
          setZone('actions')
          setSeerrPart('chip')
          setScrollTo(0)
          if (actions) actions.selectFirst()
        }
        m.v = v
        setTokens(v.tokens)
        const b = theme().background || '#101010ff'
        const color = b.length === 7 ? `${b}ff` : b
        setBg(color)
        setBackdrop(s.detailsBackdropEnabled !== false && v.backdropUrl ? v.backdropUrl : '')
        setScrim(scrimSrc(premiereScrim(rgbTriplet(color), premiereDim(s.backdropBlurDetail))))
        const row = actionRow(v.actionInput, { omitTrackButtons: true, maxVisibleButtons: AUTO_BUTTONS, overflowAsMenu: true, longLabels: true })
        m.behind = row.behind
        m.buttons = row.buttons
        page.setBehind(row.behind)
        layoutNow()
      }),
    )
  // Episodes reports a new height from inside its own draw, which this layout is already running.
  const layout = () => {
    if (m.v && !m.laying) untrack(() => batch(layoutNow))
  }

  const logoFor = (v) => {
    if (!v.logoUrl) return null
    const url = getLogoUrl(v.server, v.item, { maxWidth: 800, quality: 90 })
    if (!url) return null
    const logo = m.logos[url] || (m.logos[url] = { url, w: 0, h: 0, failed: false })
    if (logo.failed) return null
    if (!logo.w) setLogoProbe(url)
    return logo.w ? logo : 'pending'
  }
  const onLogo = (dim) => {
    const logo = m.logos[logoProbe()]
    if (!logo || !dim || !dim.w) return
    logo.w = dim.w
    logo.h = dim.h
    layout()
  }
  const onLogoError = () => {
    const logo = m.logos[logoProbe()]
    if (!logo) return
    logo.failed = true
    layout()
  }

  // The sections in reading order, each with the title its frame carries. A row of cards carries
  // its own.
  const sectionList = (v) => {
    const it = v.item
    const out = []
    // A show only in Seerr has its seasons, each opening the request sheet, in place of episodes.
    const seasons = seerrSeasonsStop(v)
    if (seasons) out.push({ id: seasons.id, rail: seasons })
    else if (!isSeerrOnlyItem(it) && (it.Type === 'Series' || it.Type === 'Season' || (it.Type === 'Episode' && v.showsSection('moreEpisodes')))) {
      out.push({ id: EPISODES_ID, title: $L('Episodes') })
    }
    collectionStops(v).forEach((cfg) => out.push({ id: cfg.id, rail: cfg }))
    out.push({ id: TRACKS_ID, title: $L('Audio & Subtitles') })
    out.push({ id: FACTS_ID, title: $L('Details') })
    rowStops(v).forEach((cfg) => out.push(cfg.block ? { id: SEERR_ID, block: true } : { id: cfg.id, rail: cfg }))
    return out
  }

  const layoutNow = () => {
    m.laying = true
    try {
      laySections()
    } finally {
      m.laying = false
    }
  }
  const laySections = () => {
    const v = m.v
    const it = v.item
    const s = v.settings
    const room = sideNavRoom(s)
    const L = premiereLeft(room)
    const heroW = 1920 - L - HERO_PAD_X
    const out = emptyList()

    // The sections first, since the hero's arrow only shows when there's one to go to.
    const ix = L + FRAME + FRAME_PAD.x
    const iw = heroW - 2 * (FRAME + FRAME_PAD.x)
    const pos = {}
    const stops = []
    const framed = []
    const railRefs = {}
    const slotPos = []
    let slot = 0
    let y = VIEW_H
    let block = null
    let chipsAt = NONE
    let factsAt = NONE
    let seerrAt = null
    let epAt = NONE
    // Episodes reads its card width as it draws, so the width goes in first.
    setCardW(room === 'rail' ? EPISODE_CARD.sidebar : EPISODE_CARD.top)
    sectionList(v).forEach((sec) => {
      const top = y + SECTION_TOP
      let inner = top + FRAME + FRAME_PAD.top
      const titled = Boolean(sec.title)
      // The title's 20px margin, or the episodes' own 34px top margin, which it collapses into.
      if (titled) inner += 33.46 + (sec.id === EPISODES_ID ? 34 : 20)
      let h = 0
      let whole = false
      if (sec.id === EPISODES_ID) {
        h = episodes
          ? episodes.draw({ item: it, settings: s, serverUrl: v.server, seasons: v.lists.seasons, episodes: v.lists.episodes, seriesEpisodes: v.lists.seriesEpisodes, w: iw })
          : 0
        if (h) epAt = { x: ix, y: inner, show: true }
      } else if (sec.id === TRACKS_ID) {
        h = chipsRef ? chipsRef.draw({ props: trackProps(v), w: iw, shareRow: false }) : 0
        if (h) chipsAt = { x: ix, y: inner, show: true }
      } else if (sec.id === FACTS_ID) {
        h = factsRef ? factsRef.draw({ item: it.Type === 'BoxSet' ? { ...it, People: v.lists.cast } : it, showsSection: v.showsSection, w: iw, weighByText: true }) : 0
        if (h) factsAt = { x: ix, y: inner, show: true }
      } else if (sec.block) {
        block = seerrBlock(v.seerr, { sectionTitle: true })
        if (block) {
          h = block.h
          whole = !block.chip
          seerrAt = { x: ix, y: inner, show: true, w: iw, h: block.h }
        }
      } else if (sec.rail && slot < SLOTS.length && sec.rail.entries.length && rails[slot]) {
        h = rails[slot].draw({ ...sec.rail, w: iw, bleed: FRAME_PAD.x, bleedRight: FRAME_PAD.x, sectionTitle: true })
        slotPos[slot] = { x: ix, y: inner }
        railRefs[sec.id] = { slot, cfg: sec.rail }
        slot++
      }
      if (!h) return
      if (titled) {
        const label = sec.title.toUpperCase()
        out.texts.push({ k: `st-${sec.id}`, x: ix, y: top + FRAME + FRAME_PAD.top + cssShift(23.4), text: label, size: 23.4, font: fontFor(label, 'bold'), color: '#ffffffbf', lh: 33.46, ls: 3.3 })
      }
      const fh = inner + h + FRAME_PAD.bottom + FRAME - top
      framed.push({ id: sec.id, x: L, y: top, w: heroW, h: fh, whole })
      pos[sec.id] = { y: top, h: fh, whole }
      stops.push(sec.id)
      y = top + fh
    })
    setEp(epAt)
    setChips(chipsAt)
    setFacts(factsAt)
    setSeerrList(block ? finishList(block.list) : emptyList())
    setChipRing(block && block.chip ? { ...block.chip, show: true } : NO_RING)
    const factsBox = block && block.chip && block.list.rects.find((r) => r.k === 'facts')
    setFactsRing(factsBox ? { ...factsBox, show: true } : NO_RING)
    if (!factsBox) setSeerrPart('chip')
    setSeerrPos(seerrAt || { ...NONE, w: 0, h: 0 })
    for (let i = slot; i < SLOTS.length; i++) {
      if (rails[i]) rails[i].draw({ id: `none${i}`, kind: 'poster', entries: [], w: iw, gap: 0, clearance: 0, titleGap: 0 })
      slotPos[i] = NONE
    }
    setSlots(slotPos)
    setFrames(framed)
    m.rails = railRefs
    m.pos = pos
    m.stops = stops
    m.contentH = stops.length ? y + 107 : VIEW_H
    setTrackH(m.contentH)

    const laid = layoutHero(out, v, { L, logo: logoFor(v), arrow: stops.length > 0, bars: downloadsLayout(v.seerr && v.seerr.downloads, { center: true }) })
    setAct({ buttons: m.buttons, x: L, y: laid.actY, w: heroW, held: !v.settled })
    setDl(laid.dl)
    setHero(finishList(out))
    if (zone() !== 'actions' && !pos[zone()]) setZone('actions')
  }

  const refFor = (z) => {
    if (z === 'actions') return actions
    if (z === TRACKS_ID) return chipsRef
    if (z === FACTS_ID) return factsRef
    if (z === EPISODES_ID) return episodes
    const rail = m.rails[z]
    return rail ? rails[rail.slot] : null
  }
  const focusZone = (z) => {
    setZone(z)
    const c = refFor(z)
    if (c) c.setFocus()
    // Seerr's chip is drawn here, so this style's root holds focus for it.
    else if (root) root.setFocus()
  }
  // A key that reaches the root while a part should hold focus means focus landed here instead, so
  // it goes back where it was.
  const lost = () => {
    const z = zone()
    if (z === SEERR_ID || activeElement() !== root || !refFor(z)) return false
    focusZone(z)
    return true
  }
  const showToolbar = () => {
    if (!navOnLeft()) store.navVisible = scroll() <= TOOLBAR_HIDES_AT
  }
  const setScroll = (next) => {
    const max = Math.max(0, m.contentH - VIEW_H)
    setScrollTo(Math.max(0, Math.min(max, next)))
    showToolbar()
  }
  // Focus lands, then the section is brought up near the top of the screen, so the page reads down
  // one section at a time.
  const focusStop = (id) => {
    const p = m.pos[id]
    if (!p) return false
    focusZone(id)
    setScroll(p.y - SECTION_TOP)
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
        focusZone('actions')
        setScroll(0)
        return
      }
      if (focusStop(next)) return
      next = premiereNeighbour(m.stops, next, direction, navbarTop)
    }
  }
  const move = (from, direction) => {
    go(premiereNeighbour(m.stops, from, direction, !navOnLeft()), direction)
    return true
  }
  // Left off the start of a section beside a sidebar goes to it. Right off the end stays put.
  const sideways = (dir) => {
    if (dir === 'left' && navOnLeft()) focusNav()
    return true
  }
  const vertical = (dir) => dir === 'up' || dir === 'down'

  const onAction = (id) => {
    if (id === 'more') return page.openMore(m.behind, MORE_FRAME)
    page.runAction(id)
  }
  const onRailSelect = (id, raw) => {
    if (id === 'stage-seasons') return page.onSeerrSeasonSelect(raw.seasonNumber)
    if (id === 'stage-cast') return router.to(`/person/${raw.Id}`)
    if (id === 'stage-extras') return page.playItem(raw, false)
    if (raw && raw._seerr) return page.onSeerrCardSelect(raw)
    page.open(raw)
  }
  const onRailLong = (id, raw) => {
    const rail = m.rails[id]
    if (!rail || !rail.cfg.menu || !raw || raw._seerr) return onRailSelect(id, raw)
    page.onCellLong({ item: raw, kind: 'card' })
  }
  const onRailNearEnd = (id) => {
    const rail = m.rails[id]
    if (rail && rail.cfg.nearEnd) page.loadMoreTitles()
  }

  // The page focuses this style whenever it comes back to it, a closed dialog included.
  const setFocus = () => {
    showToolbar()
    if (zone() !== SEERR_ID) focusZone(zone())
    else if (root) root.setFocus()
  }
  props.ref({ paint, setFocus, skeletonBoxes })
  onCleanup(() => {
    if (!navOnLeft()) store.navVisible = true
  })

  const here = () => activeElement() === root
  const seerrChip = () => zone() === SEERR_ID && m.pos[SEERR_ID] && !m.pos[SEERR_ID].whole
  // Seerr's block holds its chip over its facts, each a stop of its own before the next section.
  const seerrStep = (dir) => {
    const to = dir === 'down' ? 'facts' : 'chip'
    if (!seerrChip() || seerrPart() === to || (to === 'facts' && !factsRing().show)) return false
    setSeerrPart(to)
    return true
  }
  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color={bg()}
      onFocusChanged={setHas}
      onUp={() => {
        if (!lost() && here() && !seerrStep('up')) move(zone(), 'up')
        return true
      }}
      onDown={() => {
        if (!lost() && here() && !seerrStep('down')) move(zone(), 'down')
        return true
      }}
      onLeft={() => {
        if (!lost() && here() && seerrChip()) sideways('left')
        return true
      }}
      onRight={() => {
        lost()
        return true
      }}
      onEnter={() => {
        if (!lost() && here() && seerrChip() && seerrPart() === 'chip') page.onSeerrPiece('chips')
        return true
      }}
      onBack={() => {
        if (!navOnLeft()) store.navVisible = true
        return false
      }}
    >
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
      <view transition={SMOOTH_SCROLL ? SCROLL : undefined} y={-scroll()} width={1920} height={trackH()}>
        <view alpha={backdrop() ? 1 : 0} width={1920} height={1080} src={backdrop() || undefined} textureOptions={BACKDROP_FIT} />
        <view alpha={scrim() ? 1 : 0} width={1920} height={1080} src={scrim() || undefined} />
        <view width={1920} height={trackH()}>
          <For each={frames.keys()}>
            {(k) => (
              <view
                x={frames.at(k).x}
                y={frames.at(k).y}
                width={frames.at(k).w}
                height={frames.at(k).h}
                borderRadius={23.4}
                color={frames.at(k).whole ? '#ffffff12' : '#00000000'}
                border={{ width: FRAME, color: frames.at(k).whole ? WHOLE_RING : RING }}
                alpha={has() && zone() === k ? 1 : 0}
              />
            )}
          </For>
        </view>
        <Draw list={hero()} w={1920} h={1080} />
        <SeerrStatusDownloads x={dl().x} y={dl().y} bars={dl().bars} />
        <StyledActions
          ref={(n) => (actions = n)}
          variant="centered"
          x={act().x}
          y={act().y}
          w={act().w}
          buttons={act().buttons}
          held={act().held}
          tokens={tokens()}
          onAction={onAction}
          onActionLong={(id) => page.onActionLong(id)}
          onActionFocus={() => {}}
          onActionsEdge={(dir) => (vertical(dir) ? move(ACTIONS, dir) : sideways(dir))}
        />
        <StageChips
          ref={(n) => (chipsRef = n)}
          x={chips().x}
          y={chips().y}
          alpha={chips().show ? 1 : 0}
          tokens={tokens()}
          onChip={(id) => page.runAction(id)}
          onChipsEdge={(dir) => (vertical(dir) ? move(TRACKS_ID, dir) : sideways(dir))}
        />
        <StageFacts
          ref={(n) => (factsRef = n)}
          x={facts().x}
          y={facts().y}
          alpha={facts().show ? 1 : 0}
          tokens={tokens()}
          onFactsEdge={(dir) => (vertical(dir) ? move(FACTS_ID, dir) : sideways(dir))}
          onFactsPerson={(person) => router.to(`/person/${person.Id}`)}
          onFactsStudio={(name) => router.to('/library/all', { studioName: name })}
        />
        <Episodes
          ref={(n) => (episodes = n)}
          large
          cardW={cardW()}
          bleedRight={30}
          x={ep().x}
          y={ep().y}
          alpha={ep().show ? 1 : 0}
          tokens={tokens()}
          onEpisodesEdge={(dir) => vertical(dir) && move(EPISODES_ID, dir)}
          onEpisodeSelect={(e) => page.onCellSelect({ kind: 'episode', item: e })}
          onEpisodeLong={(e) => page.onCellLong({ item: e, kind: 'card' })}
          onEpisodesFocus={() => {}}
          onEpisodesResize={layout}
        />
        <view x={seerrPos().x} y={seerrPos().y} width={seerrPos().w} height={seerrPos().h} alpha={seerrPos().show ? 1 : 0}>
          <Draw list={seerrList()} w={seerrPos().w} h={seerrPos().h} />
          <view
            alpha={seerrOn() && seerrPart() === 'chip' && chipRing().show ? 1 : 0}
            x={chipRing().x}
            y={chipRing().y}
            width={chipRing().w}
            height={53}
            pivot={0.5}
            scale={1.05}
            borderRadius={26.5}
            color="#4b5563ff"
          >
            <text x={20} y={10 + cssShift(14)} fontFamily={fontFor(CHIP_LABEL(), 'regular')} fontSize={14} lineHeight={33} color="#ffffffff">
              {CHIP_LABEL()}
            </text>
          </view>
          <view
            alpha={seerrOn() && seerrPart() === 'facts' ? 1 : 0}
            x={factsRing().x}
            y={factsRing().y}
            width={factsRing().w}
            height={factsRing().h}
            borderRadius={10}
            color="#00000000"
            border={{ width: 1, color: WHOLE_RING }}
          />
        </view>
        {SLOTS.map((i) => (
          <StageRail
            ref={(n) => (rails[i] = n)}
            x={slots()[i].x}
            y={slots()[i].y}
            tokens={tokens()}
            onRailEdge={(id, dir) => vertical(dir) && move(id, dir)}
            onRailSelect={onRailSelect}
            onRailLong={onRailLong}
            onRailFocus={() => {}}
            onRailNearEnd={onRailNearEnd}
          />
        ))}
      </view>
    </view>
  )
}
