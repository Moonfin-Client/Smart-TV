import $L from '../../../services/i18n.js'
import { For, Show, batch, createSelector, createSignal, untrack } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import Draw from '../stage/Draw.jsx'
import { emptyList, finishList } from '../stage/Draw.js'
import Toolbar, { Rim } from './Toolbar.jsx'
import { toolbarLayout } from './toolbar.js'
import StillLabels from '../../../ui/components/details/StillLabels.jsx'
import { byKey } from '../../../ui/components/details/keyed.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { cssShift, fontFor, themeSpacing, uiFont } from '../../../ui/text.js'
import { navOnLeft, theme } from '../../../ui/theme.js'
import { highMs } from '../../../ui/tier.js'
import { hex } from '../../../ui/color.js'
import { seerrBadgeStyle, spacedWidth, statusBanner, statusDot } from '../../../ui/components/seerr/look.js'
import { isUnownedSeerrTitle } from '../../../utils/tmdbThumb.js'
import { OverNav } from '../../../ui/layers.jsx'
import { focusNav } from '../../../app/focus.js'
import { focusScroll } from '../../../ui/components/nav/focusScroll.js'
import { serverBlurredUrl } from '../../../utils/serverBlur.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { formatDuration } from '../../../utils/helpers.js'
import { actionRow } from '../modern/actions.js'
import { groupEpisodesBySeason, seasonLabel } from '../nouveau/nouveauSeasons.js'
import { ACTIONS, NAVBAR, collectionGroups, collectionLabel, resumeLine, stageTrackChoices } from '../stage/stageRules.js'
import {
  FROST_BUTTON_CAP, FROST_COLUMNS, frostCredits, frostDownloadStatus, frostInfo, frostNeighbour, frostScrims, frostSeason, frostSeerrGroups,
  frostSeerrStatus, frostSegments, frostStageFit, frostTabs,
} from './frostRules.js'
import { castTab, episodesTab, extrasTab, frostColors, groupsTab, overviewTab, postersTab, seasonsTab, wa } from './layout.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { isSeerrOnlyItem } from '../../../utils/seerrTarget.js'
import { softExternal } from '../stage/layout.js'
import { softBlur, tmdbSoft } from './softArt.js'
import { tx } from '../../../ui/fx.js'
import { rgbTriplet } from '../../../ui/themeColor.js'

// The Frost details style: the title floats in a glass window over a blurred, dimmed copy of its own
// art. The buttons sit in a toolbar over the window's foot, with the title's parts in a bar of tabs
// under it. Focus moves by frostNeighbour between keys like 'tab:cast' or 'cast:3', and each tab
// remembers where it was left. Details hands it everything through paint(bag) and focuses it with
// setFocus().
const ENVIRONMENT_BLUR = 60
const TAB_BAR_MARGIN = 36
const VIEW = { w: 1920, h: 1080 }
const TABS = {
  overview: { label: () => $L('Overview'), icon: 'core_smart_display_outlined' },
  items: { icon: 'core_collections_bookmark_outlined' },
  episodes: { label: () => $L('Episodes'), icon: 'core_format_list_bulleted' },
  seasons: { label: () => $L('Seasons'), icon: 'core_layers_outlined' },
  cast: { label: () => $L('Cast & Crew'), icon: 'core_people_outline' },
  extras: { label: () => $L('Extras'), icon: 'core_video_library_outlined' },
  related: { label: () => $L('More Like This'), icon: 'core_grid_view' },
  details: { label: () => $L('Details'), icon: 'core_info_outline' },
}
const SEGMENT_LABELS = { recommendations: () => $L('Recommendations'), similar: () => $L('Similar'), about: () => $L('About') }
const TRACK_LOOKS = {
  audio: { label: () => $L('Audio'), icon: 'audio' },
  subtitles: { label: () => $L('Subtitles'), icon: 'subtitle' },
  version: { label: () => $L('Version'), icon: 'version' },
}
const NONE = []
const READ_MORE_MAX = 900
const GONE = { k: '', fk: '', x: 0, y: 0, w: 0, h: 0, r: 0, text: '', label: '', font: 'roboto', src: '', icon: '', name: '', value: '', item: null }
const NO_HL = { x: 0, y: 0, w: 0, h: 0, r: 0, show: 0 }
const NO_AREA = { x: 0, y: 0, w: 0, h: 0, show: 0 }
const NO_RM = { open: false, title: '', titleFont: 'roboto', titleShift: 0, meta: '', metaShift: 0, lines: [], scroll: 0, y: 90, h: 0, textY: 0, textH: 0, clipH: 0 }


// The stage the page lays out on, scaled into the room the nav leaves.
const stageFor = (navbarTop) => {
  const fit = frostStageFit({ width: VIEW.w, height: VIEW.h, scale: 1, top: navbarTop ? 135 : 0, left: navbarTop ? 0 : 78 })
  return { x: fit.left, y: fit.top, k: fit.fit, w: fit.width, h: fit.height }
}

export default function Frost(props) {
  const [focused, setFocused] = createSignal(false)
  const [fk, setFk] = createSignal('actions')
  const [tab, setTabName] = createSignal('overview')
  const [env, setEnv] = createSignal('')
  const [envSoft, setEnvSoft] = createSignal('')
  const [dim, setDim] = createSignal('#00000000')
  const [vignette, setVignette] = createSignal('')
  const [stg, setStg] = createSignal(stageFor(false))
  const [win, setWin] = createSignal({ w: 1848, h: 889 })
  const [art, setArt] = createSignal('')
  const [artFade, setArtFade] = createSignal('')
  const [artOn, setArtOn] = createSignal(true)
  const [head, setHead] = createSignal(emptyList())
  const [pills, setPills] = createSignal(NONE)
  const [pillPane, setPillPane] = createSignal({ x: 0, w: 0, show: 0 })
  const [ovList, setOvList] = createSignal(emptyList())
  const [ovText, setOvText] = createSignal({ show: false, x: 66, y: 0, w: 996, h: 0 })
  const [ovLines, setOvLines] = createSignal(NONE)
  const [tracks, setTracks] = createSignal(NONE)
  const [area, setArea] = createSignal(NO_AREA)
  const [bodyH, setBodyH] = createSignal(0)
  const [body, setBody] = createSignal(emptyList())
  const [zoom, setZoom] = createSignal(NONE)
  const [stills, setStills] = createSignal(NONE)
  const [cscroll, setCscroll] = createSignal(0)
  const [wscroll, setWscroll] = createSignal(0)
  const [hl, setHl] = createSignal(NO_HL)
  const [groups, setGroups] = createSignal(emptyList())
  const [cards, setCards] = createSignal(NONE)
  const [tb, setTb] = createSignal({ x: 0, y: 0, buttons: NONE, held: true })
  const [tabs, setTabs] = createSignal(NONE)
  const [tabPane, setTabPane] = createSignal({ x: 0, y: 0, w: 0, k: 1 })
  const [colors, setColors] = createSignal(null)
  const [look, setLook] = createSignal({ glass: '#1c1c208c', pane: '#303036e6', rimInk: (a) => wa('#ffffff', a), tb: null })
  const [rm, setRm] = createSignal(NO_RM)
  const [semi, setSemi] = createSignal(uiFont('bold'))
  // Hidden until the record paints, so the page's skeleton under it shows while it loads.
  const [painted, setPainted] = createSignal(false)

  let v = null
  let c = null
  let m = null
  let id = null
  let season = null
  let segment = null
  let behind = []
  let keys = {}
  let boxes = {}
  let memory = {}
  let ctx = null
  let groupsBottom = 0
  let root = null
  let toolbar = null
  let readMore = null

  // Each focus key's look reads this, so a move changes only the two stops involved.
  const isOn = createSelector(() => (focused() ? fk() : ''))
  // The toolbar's focus is inside this one, so the content's highlight also checks it's not there.
  const hlOn = () => (focused() && fk() !== 'actions' && hl().show ? 1 : 0)
  const textOn = () => isOn('overview:text')
  const cardsOn = () => focused() && (fk() === 'details:0' || fk().indexOf(':about') > 0)
  const ink = (key, fallback) => (colors() ? colors()[key] : fallback)
  const fx = () => highMs(200)
  // Neon Pulse spaces the body text it sets, which every text here without spacing of its own inherits.
  const sp = () => themeSpacing()

  const pillRows = byKey(pills, GONE)
  const trackRows = byKey(tracks, GONE)
  const tabRows = byKey(tabs, GONE)
  const zoomRows = byKey(zoom, GONE)
  const stillRows = byKey(stills, GONE)
  const cardRows = byKey(cards, GONE)
  const lineRows = byKey(ovLines, GONE)
  const rmRows = byKey(() => rm().lines, GONE)

  // The loading skeleton: the window, the toolbar and the tab bar on the stage.
  const skeletonBoxes = () => {
    setPainted(false)
    const st = stageFor(!navOnLeft())
    const tok = props.tokens
    const box = tok && !tok.isGlass && tok.os ? tok.os(0.14) : '#ffffff29'
    const k = st.k
    const out = []
    const add = (key, x, y, w, h, r) => out.push({ k: key, x: st.x + x * k, y: st.y + y * k, w: w * k, h: h * k, r: r * k, color: box })
    add('window', 36, 18, st.w - 72, st.h - 237, 66)
    add('toolbar', (st.w - 750) / 2, st.h - 159 - 114, 750, 114, 57)
    add('tabs', (st.w - 900) / 2, st.h - 54 - 90, 900, 90, 45)
    return out
  }

  const paint = (bag) => {
    const it = bag.item
    const s = bag.settings
    if (id !== it.Id) {
      id = it.Id
      memory = {}
      season = null
      segment = null
      setTabName('overview')
      setFk('actions')
      setCscroll(0)
      setWscroll(0)
      setRm(NO_RM)
      if (toolbar) toolbar.selectFirst()
    }
    v = bag
    setPainted(true)
    const th = untrack(theme)
    c = frostColors(th)
    setSemi(untrack(() => uiFont('bold')))
    setColors({ text: c.ink(1), pills: c.ink(0.08), platter: c.focusFill(0.14), body: c.ink(0.9), readMore: c.surface(0.97), meta: c.ink(0.65), readText: c.ink(0.92) })
    setLook({
      glass: c.surface(0.55),
      pane: c.surface(0.9),
      rimInk: c.ink,
      tb: {
        play: th.accentA(0.86), playInk: th.onAccent, playFocus: th.buttonFocused, playFocusInk: th.onButtonFocused, ring: c.focusFill(0.3),
        platter: c.focusFill(0.32), ink: th.onButtonNormal, active: th.accent, tag: c.surface(0.97), tagInk: th.onSurface, pane: c.surface(0.9), rimInk: c.ink,
      },
    })
    const st = stageFor(!untrack(navOnLeft))
    setStg(st)
    setWin({ w: st.w - 72, h: st.h - 237 })
    const shown = s.detailsBackdropEnabled !== false && bag.backdropUrl
    const served = shown ? serverBlurredUrl(bag.backdropUrl, ENVIRONMENT_BLUR) : null
    const soft = shown && !served ? tmdbSoft(bag.backdropUrl) : ''
    setEnv(served || (shown && !soft ? softExternal(bag.backdropUrl, ENVIRONMENT_BLUR) : ''))
    setEnvSoft(soft)
    const scrims = frostScrims(rgbTriplet(th.background))
    setDim(c.ground(0.55))
    setVignette(scrimSrc(scrims.vignette))
    setArt(shown ? bag.backdropUrl : '')
    setArtFade(scrimSrc(scrims.artFade))
    const row = actionRow(bag.actionInput, { omitTrackButtons: true, buttonCap: FROST_BUTTON_CAP, overflowAsMenu: true, longLabels: true })
    behind = row.behind
    const laid = toolbarLayout(row.buttons)
    setTb({ x: (st.w - laid.w) / 2, y: st.h - 159 - laid.h, buttons: row.buttons, held: !bag.settled })
    drawTab()
  }

  // What the tabs hold, worked out from the bag on each draw.
  const model = () => {
    const it = v.item
    const L = v.lists
    const all = it.Type === 'Season' ? L.episodes : L.seriesEpisodes
    const seasonGroups = groupEpisodesBySeason(all || NONE)
    const numbers = []
    seasonGroups.forEach((_, k) => numbers.push(k))
    const nextUp = L.nextUp || NONE
    const shownSeason = frostSeason(numbers, season, it.Type === 'Episode' ? it.ParentIndexNumber : null, nextUp[0] && nextUp[0].ParentIndexNumber)
    const seasonEpisodes = seasonGroups.get(shownSeason) || NONE
    const wanted = it.Type === 'Episode' ? it.Id : nextUp[0] && nextUp[0].Id
    const startEpisode = Math.max(0, seasonEpisodes.findIndex((ep) => ep.Id === wanted))
    const titleGroups = collectionGroups(it, v.collectionItems || NONE)
    const collectionPosters = titleGroups.reduce((acc, g) => acc.concat(g.items), [])
    const pieces = (v.seerr && v.seerr.pieces) || {}
    // A title only in Seerr splits its related titles into Seerr's two lists, and has its seasons
    // in place of episodes.
    const seerrOnly = isSeerrOnlyItem(it)
    const seerrSeasons = seerrOnly ? ((v.seerr && v.seerr.details && v.seerr.details.seasons) || NONE).filter((ss) => ss.seasonNumber > 0) : NONE
    const segments = frostSegments(pieces, { about: !seerrOnly })
    const cast = v.cast || NONE
    const extras = v.extras || NONE
    const similar = v.similar || NONE
    const tabList = frostTabs(it, {
      seerrOnly, showsSection: v.showsSection, items: collectionPosters.length, seasons: seerrSeasons.length, cast: cast.length,
      extras: extras.length, related: seerrOnly ? segments.length : similar.length, seerr: segments.length,
    })
    const cur = untrack(tab)
    const shownTab = tabList.indexOf(cur) >= 0 ? cur : 'overview'
    const segs = shownTab === 'seerr' || (seerrOnly && shownTab === 'related') ? segments : NONE
    const shownSegment = segs.indexOf(segment) >= 0 ? segment : segs[0]
    let posters = NONE
    if (shownTab === 'items') posters = collectionPosters
    else if (shownTab === 'related' && !seerrOnly) posters = similar
    else if (shownSegment === 'recommendations') posters = v.seerr.recommendationCards || NONE
    else if (shownSegment === 'similar') posters = v.seerr.similarCards || NONE
    let pillList = NONE
    let shownPill = 0
    if (shownTab === 'episodes' && numbers.length > 1) {
      pillList = numbers.map((n) => ({ label: seasonLabel(n), season: n }))
      shownPill = numbers.indexOf(shownSeason)
    } else if (segs.length) {
      pillList = segs.map((sg) => ({ label: SEGMENT_LABELS[sg](), segment: sg }))
      shownPill = segs.indexOf(shownSegment)
    }
    let start = `${shownTab}:0`
    if (shownTab === 'episodes') start = `episodes:${startEpisode}`
    else if (shownSegment === 'about') start = `${shownTab}:about`
    const trackChoices = stageTrackChoices({
      settings: v.settings, seerrOnly, mediaSource: v.mediaSource, selectedAudioIndex: v.tracks.audio, selectedSubtitleIndex: v.tracks.subtitle,
      hasMultipleAudio: v.actionInput.hasMultipleAudio, hasMultipleVersions: v.actionInput.hasMultipleVersions, supportsMediaSourceSelection: v.supportsSelection,
    })
    const credits = frostCredits(it.Type === 'BoxSet' ? { ...it, People: L.cast } : it, { cast, showsSection: v.showsSection })
    const overview = v.hideDescription ? '' : v.overviewText
    return {
      tabs: tabList, tab: shownTab, titleGroups, segments: segs, segment: shownSegment, posters, pills: pillList, shownPill, start, seasonEpisodes,
      tracks: trackChoices, credits, overview, cast, extras, seerrOnly, seerrSeasons,
    }
  }

  const drawTab = () => batch(drawTabNow)
  const drawTabNow = () => {
    const it = v.item
    m = model()
    setTabName(m.tab)
    const ww = untrack(win).w
    const wh = untrack(win).h
    const next = {}
    let laidKeys = {}
    setArtOn(m.tab === 'overview')

    // The heading over every tab but Overview.
    const hd = emptyList()
    if (m.tab !== 'overview') {
      const caps = String(it.Name || '').toUpperCase()
      hd.texts.push({ k: 'hc', x: 84, y: 48 + cssShift(21), text: caps, size: 21, font: fontFor(caps, 'bold'), color: c.ink(0.62), lh: 27, ls: 0.9 })
      const title = tabLabel(m.tab)
      hd.texts.push({ k: 'ht', x: 84, y: 78 + cssShift(54), text: title, size: 54, font: fontFor(title, 'bold'), color: c.ink(1), lh: 63, ls: -1 })
    }
    setHead(finishList(hd))

    if (m.pills.length) {
      let x = 6
      const list = m.pills.map((p, i) => {
        const w = 30 + textWidth(p.label, 24, 'bold') + 30
        const out = {
          k: `${m.tab}:pill:${i}`, i, x, w, label: p.label, selected: i === m.shownPill, ty: 15 + cssShift(24), ink: c.ink(0.68),
          selBg: c.ink(0.18), focusBg: c.focusFill(0.38), season: p.season, segment: p.segment,
        }
        // The pills sit flush, with no gap between them.
        x += w
        return out
      })
      const pw = Math.min(1000, x + 6)
      setPills(list)
      setPillPane({ x: ww - 72 - pw, w: pw, show: 1 })
      list.forEach((p) => (next[p.k] = true))
    } else {
      setPills(NONE)
      setPillPane({ x: 0, w: 0, show: 0 })
    }

    groupsBottom = 0
    let area = NO_AREA
    let bh = 0
    let list = emptyList()
    let zoomList = NONE
    let stillList = NONE
    let groupList = emptyList()
    let cardList = NONE
    let trackList = NONE
    let lines = NONE
    if (m.tab === 'overview') {
      const ov = overviewTab(v, ww, wh, c, {
        tracks: m.tracks, credits: m.credits, resume: m.seerrOnly ? null : resumeLine(it, v.lists.nextUp || NONE),
        status: m.seerrOnly ? seerrStatus(v.seerr) : null, watch: m.seerrOnly ? watchCard(v.seerr) : null,
      })
      setOvList(finishList(ov.list))
      setOvText(ov.text.show ? { show: true, x: ov.text.x, y: ov.text.y, w: ov.text.w, h: ov.text.h } : { show: false, x: 66, y: 0, w: 996, h: 0 })
      lines = ov.text.lines || NONE
      trackList = ov.tracks.map((t) => {
        const name = TRACK_LOOKS[t.id].label()
        const room = 534 - 21 - 18 - 12 - (63 + textWidth(name, 24, 'bold') + 15)
        const valueW = Math.min(room, textWidth(t.current, 24))
        return {
          k: t.k, x: t.x, y: t.y, icon: `icons/d/${TRACK_LOOKS[t.id].icon}.webp`, name, value: t.current, valueFont: fontFor(t.current, 'regular'),
          vx: 534 - 21 - 18 - 12 - valueW, vw: valueW + 4, ty: 13.5 + cssShift(24), id: t.id, bg: c.ink(0.1), focusBg: c.focusFill(0.32), ink: c.ink(0.72), chevron: c.ink(0.62),
        }
      })
      if (ov.text.show) next['overview:text'] = true
      trackList.forEach((t) => (next[t.k] = true))
    } else if (m.tab === 'details' || m.segment === 'about') {
      const list2 = m.tab === 'details' ? frostInfo(it, { showsSection: v.showsSection, mediaSource: v.mediaSource, seerr: m.seerrOnly ? v.seerr : null }) : frostSeerrGroups(v.seerr)
      const g = groupsTab(list2, ww, c)
      groupsBottom = g.cards.reduce((b, cd) => Math.max(b, cd.y + cd.h), 0)
      groupList = finishList(g.list)
      cardList = g.cards.map((cd) => ({ ...cd, on: c.focusFill(0.12), off: c.ink(0.06) }))
      next[m.tab === 'details' ? 'details:0' : `${m.tab}:about`] = true
    } else {
      area = { x: 60, y: 168, w: ww - 120, h: wh - 168 - 75 }
      let laid
      if (m.tab === 'episodes') {
        area = { x: 60, y: 162, w: ww - 120, h: wh - 162 - 75 }
        laid = episodesTab(m.seasonEpisodes, area.w, v.server, c)
      } else if (m.tab === 'cast') {
        area = { x: 72, y: 162, w: ww - 144, h: wh - 162 - 75 }
        laid = castTab(m.cast, area.w, v.server, c)
      } else if (m.tab === 'extras') laid = extrasTab(m.extras, area.w, v.server, c)
      else if (m.tab === 'seasons') {
        area = { x: 60, y: 162, w: ww - 120, h: wh - 162 - 75 }
        const sc = statusColors()
        const markers = v.seerr && v.seerr.seasonMarkers
        laid = seasonsTab(m.seerrSeasons, area.w, c, (ss) => frostSeerrStatus(markers && markers.get(ss.seasonNumber), sc),
          (ss) => (ss.posterPath ? seerrApi.getImageUrl(ss.posterPath, 'w342') : ''))
      } else {
        const sc = statusColors()
        laid = postersTab(m.tab, m.posters, area.w, v.server, c, (entry) => (entry._seerr ? frostSeerrStatus(entry.mediaInfo && entry.mediaInfo.status, sc) : null), marksOf)
      }
      area = { ...area, show: 1 }
      list = finishList(laid.list)
      zoomList = laid.zoom
      // Held further in, clear of the still's large rounded corners. Only built while labels can show.
      const st = v.settings
      if (m.tab === 'episodes' && st.showPosterLabels !== false && st.useMoonfinPlugin) {
        stillList = m.seasonEpisodes.map((ep, i) => ({ k: ep.Id, fk: `episodes:${i}`, x: 9, y: laid.keys[`episodes:${i}`].y + 9, item: ep }))
      }
      laidKeys = laid.keys
      Object.keys(laidKeys).forEach((k) => (next[k] = true))
      bh = laid.h
    }
    setTracks(trackList)
    setOvLines(lines)
    setArea(area)
    setBodyH(bh)
    setBody(list)
    setZoom(zoomList)
    setStills(stillList)
    setGroups(groupList)
    setCards(cardList)

    // The bar of tabs, shrunk to fit across the stage when it runs too wide.
    let x = 9
    const tabList = m.tabs.map((name) => {
      const label = tabLabel(name)
      const w = 27 + 33 + 15 + textWidth(label, 24, 'bold') + 27
      const out = {
        k: name, x, w, label, selected: name === m.tab, ty: 19.5 + cssShift(24), selBg: c.ink(0.16), focusBg: c.focusFill(0.38),
        icon: name === 'seerr' ? 'icons/nav_seerr.webp' : `icons/d/${TABS[name].icon}.webp`,
      }
      x += w
      next[`tab:${name}`] = true
      return out
    })
    const paneW = x + 9
    const st = untrack(stg)
    const room = st.w - TAB_BAR_MARGIN * 2
    setTabs(tabList)
    setTabPane({ x: (st.w - paneW) / 2, y: st.h - 54 - 90, w: paneW, k: paneW > room ? room / paneW : 1 })
    keys = next
    boxes = laidKeys
    const posters = m.posters.length
    ctx = {
      tab: m.tab, tabs: m.tabs, navbarTop: !untrack(navOnLeft), hasText: Boolean(next['overview:text']), tracks: trackList.length, pills: m.pills.length,
      shownPill: m.shownPill, start: m.start,
      counts: { items: posters, episodes: m.seasonEpisodes.length, seasons: m.seerrSeasons.length, cast: m.cast.length, extras: m.extras.length, related: posters, seerr: posters },
    }
    // The window's scroll holds until its content is too short for it, as an element's scrollTop does.
    setWscroll(Math.min(untrack(wscroll), windowMax()))
    const now = untrack(fk)
    if (now !== 'actions' && !keys[now]) setFk(`tab:${m.tab}`)
    placeHighlight(untrack(fk))
  }

  // The dot, or the large status banner, on a Seerr title's poster, as the Seerr badge settings ask.
  const marksOf = (entry, w) => {
    if (!entry._seerr) return null
    const style = seerrBadgeStyle(v.settings)
    if (style === 'badge') {
      const dot = statusDot(entry.mediaInfo && entry.mediaInfo.status, 39)
      return dot ? { dot } : null
    }
    if (style !== 'banner') return null
    const banner = statusBanner(isUnownedSeerrTitle(entry) && !entry._external && entry.mediaInfo ? entry.mediaInfo.status : null, w)
    if (!banner) return null
    const bw = spacedWidth(banner.label, 15, 'bold', 1.5) + 18
    return { banner: { ...banner, w: bw, scale: bw > w ? w / bw : 1 } }
  }
  // The Seerr status colors from the theme's own tokens.
  const statusColors = () => {
    const st = untrack(theme).status
    return { available: st.available, requested: st.requested, pending: st.pending, error: st.error, none: c.ink(0.55) }
  }
  // The status line for a title only in Seerr: the download while one runs, else where it stands,
  // and "Not found yet" while the arr looks and finds nothing.
  const seerrStatus = (seerr) => {
    if (!seerr || !seerr.isActive) return null
    const sc = statusColors()
    const dl = seerr.downloads || {}
    const download = dl.hd || null
    let { label, color } = download ? frostDownloadStatus(download, sc) : frostSeerrStatus(seerr.details && seerr.details.mediaInfo && seerr.details.mediaInfo.status, sc)
    if (!download && dl.notFoundYet) {
      label = $L('Not found yet')
      color = sc.none
    }
    return { label, color, fraction: download ? download.fraction : null, reason: (download && download.reason) || '' }
  }
  // Where a title only in Seerr streams, where the track pickers would be.
  const watchCard = (seerr) => {
    const providers = (seerr && seerr.streamingProviders) || NONE
    if (!seerr || !seerr.pieces || !seerr.pieces.streaming || !providers.length) return null
    const first = providers[0]
    return {
      logo: first.logoPath ? seerrApi.getImageUrl(first.logoPath, 'w92') : '', name: first.name || '',
      others: providers.slice(1).map((p) => p.name).join(', '),
    }
  }
  const tabLabel = (name) => {
    if (name === 'seerr') return v.seerr.displayName || 'Seerr'
    if (name === 'items') return collectionLabel(m.titleGroups)
    return TABS[name].label()
  }

  // How far the window can scroll. With art on show it keeps 6px of scroll past its foot once the
  // facts have scrolled it.
  const windowMax = () => Math.max(0, groupsBottom - untrack(win).h, untrack(art) ? 6 : 0)

  const placeHighlight = (key) => {
    const box = boxes[key]
    setHl(box ? { x: box.x, y: box.y, w: box.w, h: box.h, r: box.r, show: 1 } : { ...untrack(hl), show: 0 })
    return box
  }
  const takeFocus = () => {
    if (root && activeElement() !== root) root.setFocus()
  }
  // Focus lands, then its list brings it two tenths of the way down.
  const focusKey = (key) => {
    if (!keys[key]) return false
    setFk(key)
    takeFocus()
    const box = placeHighlight(key)
    if (box) {
      const a = untrack(area)
      const room = a.h - box.h
      setCscroll(Math.max(0, Math.min(box.y - room * 0.2, untrack(bodyH) - a.h)))
    }
    // Only the facts run past the window's foot, so they're the one place the window itself scrolls.
    if (key === 'details:0' || key.indexOf(':about') > 0) {
      const wh = untrack(win).h
      setWscroll(focusScroll(168, groupsBottom - 168, untrack(wscroll), wh, windowMax()))
    }
    const [name, index] = key.split(':')
    if (name === 'tab') setTab(index)
    else if (key.indexOf(':pill:') < 0) memory[name] = key
    // A collection loads a page at a time, so nearing the end of its grid asks for the next one.
    if (name === 'items' && Number(index) >= ctx.counts.items - FROST_COLUMNS.items * 2) props.page.loadMoreTitles()
    return true
  }
  const setTab = (name) => {
    if (untrack(tab) === name) return
    setTabName(name)
    setCscroll(0)
    drawTab()
  }
  const toActions = () => {
    setFk('actions')
    if (toolbar) toolbar.setFocus()
  }
  const toTabBar = () => focusKey(`tab:${ctx.tab}`)
  // OK on a tab, or Up off the toolbar: where focus was in that tab, or where it starts.
  const enterContent = () => {
    const remembered = memory[ctx.tab]
    if (remembered && focusKey(remembered)) return
    let first = ctx.start
    if (ctx.tab === 'overview') first = ctx.hasText ? 'overview:text' : 'overview:track:0'
    if (!focusKey(first)) focusKey(`tab:${ctx.tab}`)
  }
  const step = (side) => {
    const key = untrack(fk)
    const target = frostNeighbour(key, side, { ...ctx, count: ctx.counts[key.split(':')[0]] || 0 })
    if (target === ACTIONS) toActions()
    else if (target === NAVBAR) focusNav()
    else if (target) focusKey(target)
    return true
  }
  // The whole overview under the title and its facts, in a dialog that OK or Back closes.
  const openReadMore = () => {
    const it = v.item
    const meta = [it.Genres && it.Genres[0], it.ProductionYear, it.RunTimeTicks > 0 ? formatDuration(it.RunTimeTicks) : null].filter(Boolean).join(' · ')
    const lines = wrapLines(m.overview, 30, 'regular', 1164)
    const textY = 66 + 63 + (meta ? 9 + 28 : 0) + 33
    const textH = lines.length * 48
    const clipH = Math.min(textH, READ_MORE_MAX - textY - 66)
    const h = textY + clipH + 66
    setRm({
      open: true, title: it.Name || '', titleFont: fontFor(it.Name || '', 'bold'), titleShift: cssShift(54), meta, metaShift: cssShift(24),
      lines: lines.map((ln, i) => ({ k: `r${i}`, text: ln, font: fontFor(ln, 'regular'), y: i * 48 + cssShift(30) })),
      scroll: 0, textY, textH, clipH, h, y: (1080 - h) / 2,
    })
    if (readMore) readMore.setFocus()
  }
  const closeReadMore = () => {
    setRm({ ...untrack(rm), open: false })
    if (root) root.setFocus()
    return true
  }
  // Up and Down page through 80% of the box at a time.
  const pageText = (d) => {
    const r = untrack(rm)
    const max = Math.max(0, r.textH - r.clipH)
    setRm({ ...r, scroll: Math.max(0, Math.min(max, r.scroll + d * r.clipH * 0.8)) })
    return true
  }

  const select = () => {
    const key = untrack(fk)
    const [name, index] = key.split(':')
    if (name === 'tab') return enterContent()
    if (key.indexOf(':pill:') > 0) {
      const pill = untrack(pills)[Number(key.split(':')[2])]
      if (!pill) return
      if (pill.season != null) season = pill.season
      else segment = pill.segment
      delete memory[m.tab]
      drawTab()
      return
    }
    if (key === 'overview:text') return openReadMore()
    if (name === 'overview') {
      const t = untrack(tracks)[Number(key.split(':')[2])]
      if (t) props.page.runAction(t.id)
      return
    }
    const i = Number(index)
    if (name === 'episodes') return m.seasonEpisodes[i] && props.page.onCellSelect({ kind: 'episode', item: m.seasonEpisodes[i] })
    if (name === 'seasons') return m.seerrSeasons[i] && props.page.onSeerrSeasonSelect(m.seerrSeasons[i].seasonNumber)
    // The page routes a person from a title only in Seerr to Seerr's person page.
    if (name === 'cast') return m.cast[i] && props.page.onCellSelect({ kind: 'person', item: m.cast[i] })
    if (name === 'extras') return m.extras[i] && props.page.open(m.extras[i])
    const entry = m.posters[i]
    if (!entry) return
    if (entry._seerr) props.page.onSeerrCardSelect(entry)
    else props.page.open(entry)
  }

  const onActionsEdge = (dir) => {
    if (dir === 'up') enterContent()
    else if (dir === 'down') toTabBar()
    else if (dir === 'left' && navOnLeft()) focusNav()
  }
  const onAction = (actionId) => {
    // The menu's fixed layer sits in the scaled stage, so it centers and scales with it.
    if (actionId === 'more') return props.page.openMore(behind, untrack(stg))
    props.page.runAction(actionId)
  }

  // Back from anywhere but Play on Overview goes there first, and from there it leaves the page.
  const back = () => {
    if (untrack(tab) === 'overview' && untrack(fk) === 'actions' && toolbar && toolbar.cur() === 0) return false
    setTab('overview')
    if (toolbar) toolbar.selectFirst()
    toActions()
    return true
  }

  props.ref({
    paint,
    skeletonBoxes,
    setFocus: () => {
      if (untrack(rm).open && readMore) readMore.setFocus()
      else if (untrack(fk) === 'actions' && toolbar) toolbar.setFocus()
      else if (root) root.setFocus()
    },
  })

  const tl = () => look().tb
  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      alpha={painted() ? 1 : 0}
      color="#0b0d10ff"
      onFocusChanged={setFocused}
      onUp={() => step('up')}
      onDown={() => step('down')}
      onLeft={() => step('left')}
      onRight={() => step('right')}
      onEnter={() => {
        select()
        return true
      }}
      onBack={back}
    >
      <view alpha={env() ? 1 : 0} width={1920} height={1080} src={env() || undefined} textureOptions={{ resizeMode: { type: 'cover' } }} />
      <view alpha={envSoft() ? 1 : 0} width={1920} height={1080} src={envSoft() || undefined} textureOptions={{ resizeMode: { type: 'cover' } }} shader={softBlur()} />
      <view width={1920} height={1080} color={dim()} />
      <view alpha={vignette() ? 1 : 0} width={1920} height={1080} src={vignette() || undefined} />
      <view x={stg().x} y={stg().y} width={stg().w} height={stg().h} scale={stg().k} pivot={0}>
        <view x={36} y={18} width={win().w} height={win().h} borderRadius={66} color={look().glass} />
        {/* The window's content, art and rim scroll together inside its clip when a focused stop
            needs bringing into view. */}
        <view x={36} y={18} width={win().w} height={win().h} clipping>
          <view y={-wscroll()} width={win().w} height={win().h + wscroll()}>
            <view transition={tx({ alpha: { duration: highMs(500) } })} width={win().w} height={win().h} alpha={artOn() ? 1 : 0}>
              <view
                alpha={art() ? 1 : 0}
                width={win().w}
                height={win().h}
                borderRadius={66}
                src={art() || undefined}
                textureOptions={{ resizeMode: { type: 'cover' } }}
              />
              <view alpha={artFade() ? 1 : 0} width={win().w} height={win().h} borderRadius={66} src={artFade() || undefined} />
            </view>
            <view width={win().w} height={win().h}>
              <Draw list={head()} />
              <view alpha={pillPane().show} x={pillPane().x} y={66} width={pillPane().w} height={75} borderRadius={37.5} color={ink('pills', '#ffffff14')}>
                <For each={pillRows.keys()}>
                  {(k) => {
                    const p = () => pillRows.at(k)
                    return (
                      <view transition={tx({ scale: { duration: fx() } })} x={p().x} y={6} width={p().w} height={63} pivot={0.5} scale={isOn(k) ? 1.06 : 1}>
                        <view width={p().w} height={63} borderRadius={31.5} color={isOn(k) ? p().focusBg : p().selected ? p().selBg : '#00000000'} />
                        <text x={30} y={p().ty} fontFamily={semi()} fontSize={24} lineHeight={33} letterSpacing={sp()} color={isOn(k) || p().selected ? ink('text', '#ffffffff') : p().ink}>
                          {p().label}
                        </text>
                      </view>
                    )
                  }}
                </For>
              </view>
              <view alpha={tab() === 'overview' ? 1 : 0} width={win().w} height={win().h}>
                <Draw list={ovList()} />
                <view
                  transition={tx({ scale: { duration: fx() } })}
                  alpha={ovText().show ? 1 : 0}
                  x={ovText().x}
                  y={ovText().y}
                  width={ovText().w}
                  height={ovText().h}
                  pivot={0.5}
                  scale={textOn() ? 1.02 : 1}
                >
                  <view alpha={textOn() ? 1 : 0} width={ovText().w} height={ovText().h} borderRadius={30} color={ink('platter', '#ffffff24')} />
                  <view>
                    <For each={lineRows.keys()}>
                      {(k) => (
                        <text
                          x={lineRows.at(k).x}
                          y={lineRows.at(k).y}
                          fontFamily={lineRows.at(k).font}
                          letterSpacing={sp()}
                          fontSize={27}
                          lineHeight={39}
                          maxWidth={lineRows.at(k).maxw || undefined}
                          maxLines={lineRows.at(k).maxw ? 1 : undefined}
                          color={ink('body', '#ffffffe6')}
                        >
                          {lineRows.at(k).text}
                        </text>
                      )}
                    </For>
                  </view>
                </view>
                <view>
                  <For each={trackRows.keys()}>
                    {(k) => {
                      const t = () => trackRows.at(k)
                      return (
                        <view transition={tx({ scale: { duration: fx() } })} x={t().x} y={t().y} width={534} height={60} pivot={0.5} scale={isOn(k) ? 1.04 : 1}>
                          <view width={534} height={60} borderRadius={30} color={isOn(k) ? t().focusBg : t().bg} />
                          <view x={21} y={16.5} width={27} height={27} src={t().icon} color={ink('text', '#ffffffff')} />
                          <text x={63} y={t().ty} fontFamily={semi()} fontSize={24} lineHeight={33} letterSpacing={sp()} color={ink('text', '#ffffffff')}>
                            {t().name}
                          </text>
                          <text x={t().vx} y={t().ty} fontFamily={t().valueFont} fontSize={24} lineHeight={33} letterSpacing={sp()} maxWidth={t().vw} maxLines={1} color={t().ink}>
                            {t().value}
                          </text>
                          <view x={495} y={21} width={18} height={18} src="icons/d/core_unfold_more.webp" color={t().chevron} />
                        </view>
                      )
                    }}
                  </For>
                </view>
              </view>
              <view alpha={area().show} x={area().x} y={area().y} width={area().w} height={area().h} clipping>
                <view transition={tx({ y: { duration: highMs(220), easing: 'ease-out' } })} y={-cscroll()} width={area().w} height={bodyH()}>
                  <view alpha={hlOn()} x={hl().x} y={hl().y} width={hl().w} height={hl().h} borderRadius={hl().r} color={ink('platter', '#ffffff24')} />
                  <Draw list={body()} w={area().w} h={bodyH()} />
                  <view width={area().w} height={bodyH()}>
                    <For each={zoomRows.keys()}>
                      {(k) => {
                        const z = () => zoomRows.at(k)
                        return (
                          <view
                            transition={tx({ scale: { duration: fx() } })}
                            x={z().x}
                            y={z().y}
                            width={z().w}
                            height={z().h}
                            pivot={0.5}
                            scale={isOn(z().fk) ? z().zoom : 1}
                          >
                            <view
                              alpha={z().src ? 1 : 0}
                              width={z().w}
                              height={z().h}
                              borderRadius={z().r}
                              src={z().src || undefined}
                              textureOptions={{ resizeMode: { type: 'cover', clipX: 0.5, clipY: z().clipY == null ? 0.5 : z().clipY } }}
                            />
                            <Show when={z().dot}>
                              {(d) => (
                                <view x={z().w - 12 - 39} y={12} width={39} height={39} borderRadius={19.5} color={d().fill} border={{ width: 2, color: hex(d().ring) }}>
                                  <view x={d().iconAt} y={d().iconAt} width={d().iconSize} height={d().iconSize} src={`icons/${d().icon}.webp`} color={d().iconColor} />
                                </view>
                              )}
                            </Show>
                            <Show when={z().banner}>
                              {(b) => (
                                <view width={z().w} height={30} borderRadius={[z().r, z().r, 0, 0]} color={b().fill}>
                                  <text
                                    x={(z().w - b().w) / 2 + 9}
                                    y={cssShift(15)}
                                    scale={b().scale}
                                    fontFamily={semi()}
                                    fontSize={15}
                                    lineHeight={30}
                                    letterSpacing={1}
                                    color={b().ink}
                                  >
                                    {b().label}
                                  </text>
                                </view>
                              )}
                            </Show>
                          </view>
                        )
                      }}
                    </For>
                  </view>
                  <view width={area().w} height={bodyH()}>
                    <For each={stillRows.keys()}>
                      {(k) => {
                        const sl = () => stillRows.at(k)
                        return (
                          <view transition={tx({ scale: { duration: fx() } })} x={sl().x} y={sl().y} width={288} height={162} pivot={0.5} scale={isOn(sl().fk) ? 1.05 : 1}>
                            <StillLabels x={0} y={0} w={288} h={162} item={sl().item} server={v && v.server} inset={14} top={14} topRight={14} bottom={14} />
                          </view>
                        )
                      }}
                    </For>
                  </view>
                </view>
              </view>
              <view>
                <For each={cardRows.keys()}>
                  {(k) => (
                    <view
                      x={cardRows.at(k).x}
                      y={cardRows.at(k).y}
                      width={cardRows.at(k).w}
                      height={cardRows.at(k).h}
                      borderRadius={33}
                      color={cardsOn() ? cardRows.at(k).on : cardRows.at(k).off}
                    />
                  )}
                </For>
              </view>
              <Draw list={groups()} />
            </view>
            <view>
              <Rim w={win().w} h={win().h} r={66} ink={look().rimInk} />
            </view>
          </view>
        </view>
        <Toolbar
          ref={(n) => (toolbar = n)}
          x={tb().x}
          y={tb().y}
          buttons={tb().buttons}
          held={tb().held}
          look={tl()}
          pixel={Boolean(props.tokens && props.tokens.isPixel)}
          onAction={onAction}
          onActionLong={(actionId) => props.page.onActionLong(actionId)}
          onActionsEdge={onActionsEdge}
        />
        <view x={tabPane().x} y={tabPane().y} width={tabPane().w} height={90} scale={tabPane().k} pivotX={0.5} pivotY={0}>
          <view width={tabPane().w} height={90} borderRadius={45} color={look().pane} />
          <Rim w={tabPane().w} h={90} r={45} ink={look().rimInk} />
          <view>
            <For each={tabRows.keys()}>
              {(k) => {
                const t = () => tabRows.at(k)
                const on = () => isOn(`tab:${k}`)
                return (
                  <view transition={tx({ scale: { duration: fx() } })} x={t().x} y={9} width={t().w} height={72} pivot={0.5} scale={on() ? 1.04 : 1}>
                    <view width={t().w} height={72} borderRadius={36} color={on() ? t().focusBg : t().selected ? t().selBg : '#00000000'} />
                    <view x={27} y={19.5} width={33} height={33} src={t().icon} color={ink('text', '#ffffffff')} />
                    <text x={75} y={t().ty} fontFamily={semi()} fontSize={24} lineHeight={33} letterSpacing={sp()} color={ink('text', '#ffffffff')}>
                      {t().label}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
        </view>
      </view>
      <OverNav>
        <view
          ref={readMore}
          alpha={rm().open ? 1 : 0}
          width={1920}
          height={1080}
          onUp={() => pageText(-1)}
          onDown={() => pageText(1)}
          onLeft={() => true}
          onRight={() => true}
          onEnter={closeReadMore}
          onBack={closeReadMore}
        >
          <view width={1920} height={1080} color="#00000080" />
          <view x={300} y={rm().y} width={1320} height={rm().h} borderRadius={60} color={ink('readMore', '#242428f7')}>
            <text x={78} y={66 + rm().titleShift} fontFamily={rm().titleFont} fontSize={54} lineHeight={63} letterSpacing={-1} color={ink('text', '#ffffffff')}>
              {rm().title}
            </text>
            <text x={78} y={138 + rm().metaShift} fontFamily={semi()} fontSize={24} lineHeight={28} letterSpacing={sp()} color={ink('meta', '#ebebf5a6')}>
              {rm().meta}
            </text>
            <view x={78} y={rm().textY} width={1164} height={rm().clipH} clipping>
              <view transition={{ y: { duration: 180 } }} y={-rm().scroll} width={1164} height={rm().textH}>
                <For each={rmRows.keys()}>
                  {(k) => (
                    <text y={rmRows.at(k).y} fontFamily={rmRows.at(k).font} fontSize={30} lineHeight={48} letterSpacing={sp()} color={ink('readText', '#ffffffeb')}>
                      {rmRows.at(k).text}
                    </text>
                  )}
                </For>
              </view>
            </view>
          </view>
        </view>
      </OverNav>
    </view>
  )
}
