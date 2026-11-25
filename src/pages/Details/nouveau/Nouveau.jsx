import $L from '../../../services/i18n.js'
import { For, batch, createEffect, createMemo, createSelector, createSignal, on, onCleanup, untrack } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import ActionButtons from '../../../ui/components/details/ActionButtons.jsx'
import TabBar from '../../../ui/components/details/TabBar.jsx'
import NouveauRail from './NouveauRail.jsx'
import Draw from '../stage/Draw.jsx'
import { emptyList } from '../stage/Draw.js'
import { fontFor, uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { textWidth } from '../../../ui/components/details/measure.js'
import { byKey } from '../../../ui/components/details/keyed.js'
import { navOnLeft, sideNavRoom } from '../../../ui/theme.js'
import { focusNav } from '../../../app/focus.js'
import { nextStop } from '../../../ui/components/settings/focusStops.js'
import { focusScroll } from '../../../ui/components/nav/focusScroll.js'
import { SMOOTH_SCROLL } from '../../../ui/components/details/env.js'
import { api } from '../../../services/jellyfinApi.js'
import { all } from '../../../state/settings.js'
import { checkSeerr } from '../../../state/seerr.js'
import { getBackdropId, getImageUrl } from '../../../utils/helpers.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { splitFilmography } from '../../../utils/personCredits.js'
import { formatPlaybackEndsAt } from '../../../utils/playbackTimeLabels.js'
import { arrange, seerrOnlyRow, splitSlots, DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY } from '../../../utils/buttonLayout.js'
import { isKidsMode, kidsModeButtons } from '../../../utils/kidsMode.js'
import { catalogue } from '../modern/actions.js'
import { detailTokens } from '../modern/tokens.js'
import { hidesMediaDescription } from '../detailsMedia.js'
import { fetchDetailPlaybackInfo } from '../detailPlaybackInfo.js'
import { loadMoreCollectionItems } from '../load.js'
import { loadSeerrPersonCredits, seerrPersonCards } from '../seerrPersonCredits.js'
import { nouveauMetaPieces } from './nouveauMetaPieces.js'
import { splitNouveauActions } from './nouveauActionSplit.js'
import { buildPersonRails } from './nouveauPersonRails.js'
import { effectiveSeason, groupEpisodesBySeason, seasonOptions } from './nouveauSeasons.js'
import { HERO, OVERVIEW, SEASONS, clampNouveauNode, nextNouveauNode } from './nouveauFocusChain.js'
import { HERO_W, layoutHero, overviewBox, skeletonBoxes } from './layout.js'
import { OVERVIEW_LH, OVERVIEW_W, overviewHeight, pageGeometry, pinFor } from './geometry.js'
import { layoutSections } from './rails.js'
import { layoutFooter } from './footer.js'
import { alphaHex } from '../../../ui/themeColor.js'

// The Nouveau details style draws everything on one page over the backdrop: the hero column, a band
// per section and the details footer last. Up and Down walk one chain of stops (nouveauFocusChain),
// each rail owns Left and Right, and the page pins the focused rail's section near the top.
// Details hands every repaint to paint(bag) and focus to setFocus(), and does what the buttons and
// cards ask for through `page`.
const SCRIM = [
  {
    at: [0.65, 0.45],
    rgb: '0, 0, 0',
    stops: [
      [0, 0],
      [0.58, 0],
      [0.82, 0.12],
      [1, 0.3],
    ],
  },
  {
    to: 'bottom',
    rgb: '0, 0, 0',
    stops: [
      [0, 0.28],
      [0.18, 0.08],
      [0.42, 0],
    ],
  },
  {
    to: 'top',
    rgb: '11, 13, 16',
    stops: [
      [0, 1],
      [0.18, 0.96],
      [0.38, 0.78],
      [0.58, 0.48],
      [0.76, 0.18],
      [0.94, 0],
    ],
  },
  {
    to: 'right',
    rgb: '11, 13, 16',
    stops: [
      [0, 0.96],
      [0.18, 0.86],
      [0.38, 0.58],
      [0.6, 0.22],
      [0.82, 0],
    ],
  },
]
const TICKS_PER_SECOND = 10000000
const NO_CREDITS = { cast: [], crew: [] }
const NO_DIMS = { w: 0, h: 0 }
const FOOTER = 'footer:0'
const NO_OV = {
  show: false,
  x: 0,
  y: 0,
  h: 0,
  canToggle: false,
  textW: OVERVIEW_W,
  text: '',
  font: 'roboto',
  maxlines: 3,
  more: '',
  moreY: 0,
  room: 0,
}
const NO_SEASON = { x: 0, y: 0, tabs: [], active: '' }
const NO_PLH = { show: false, x: 0, y: 0, title: '', label: '', labelFont: 'roboto', labelX: 0, labelW: 0 }
const NO_RAIL = { k: '', y: 0, cards: [], title: '', titleFont: 'roboto', trackY: 0, trackH: 40, h: 0, total: 0, startIndex: 0 }
const NO_PIECE = {
  k: '',
  i: -1,
  kind: '',
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  r: 0,
  label: '',
  font: 'roboto',
  size: 15,
  tx: 0,
  ty: 0,
  ink: '#00000000',
  offColor: '#00000000',
  onColor: '#00000000',
  ring: '#00000000',
}
const SCROLL = { y: { duration: 300, easing: 'ease-out' } }
const COVER = { resizeMode: { type: 'cover' } }
const OV_EDGE = hex('#ffffff14')
// Draw's layers have no size of their own and take their parent's when they're made, so the
// footer's sit in a box tall enough for any page, or they'd stop drawing once it scrolls past 1080.
const FAR = 100000

// A season is watched through in a sitting, so its hero says when it would finish.
const seasonEndsAt = (episodes, s) => {
  const ticks = episodes.reduce((sum, ep) => sum + (ep.RunTimeTicks || 0), 0)
  return ticks ? formatPlaybackEndsAt(ticks / TICKS_PER_SECOND, s.clockDisplay, s.timeOffsetHours) : ''
}

// One worded button leads (Resume where there's somewhere to resume from, else Play), then
// circles, with Restart joining them after a resume. Past three circles only two stay out and the
// rest go behind More Actions, unless Action Buttons on Screen says otherwise. A person's Display
// sits beside the heart, outside the arranged set, and the catalog's own Display stays too.
const nouveauButtons = (p) => {
  const s = p.settings
  const it = p.item
  const t = it.Type
  const isPerson = t === 'Person'
  const isBook = t === 'Book'
  const offeredAll = catalogue(p)
  // A title only Seerr knows keeps only Seerr's buttons and the trailer.
  const offered = (p.seerrOnly ? seerrOnlyRow(offeredAll) : offeredAll).filter((b) => b.when)
  const rest = splitSlots(
    isKidsMode(s) ? kidsModeButtons(offered, true) : arrange(offered, { order: s[DETAIL_ORDER_KEY], hidden: s[DETAIL_HIDDEN_KEY] }),
  )
  if (isPerson) {
    const at = rest.findIndex((b) => b.id === 'favorite') + 1
    rest.splice(at, 0, { id: 'personDisplayRow', icon: 'tune', label: $L('Display') })
  }
  const showsResume = !p.seerrOnly && !isPerson && !isBook && Boolean(it.UserData && it.UserData.PlaybackPositionTicks > 0)
  const showsPlay = !p.seerrOnly && !isPerson && (isBook ? p.isReadableBook : true)
  let lead = null
  if (showsResume) lead = { id: 'resume', icon: 'play', label: $L('Resume'), detail: p.resumeTimeText, primary: true }
  else if (showsPlay) lead = { id: 'play', icon: isBook ? 'book' : 'play', label: isBook ? $L('Read') : $L('Play'), primary: true }
  const restart = showsResume && showsPlay ? [{ id: 'restart', icon: 'restart', label: $L('Restart') }] : []
  const split = splitNouveauActions(restart.concat(rest), s.detailButtonsMaxVisible != null ? s.detailButtonsMaxVisible : 0)
  const buttons = (lead ? [lead] : []).concat(split.inline)
  if (split.overflow.length) buttons.push({ id: 'more', icon: 'moreHoriz', label: $L('More Actions') })
  return { buttons, overflow: split.overflow }
}

// What a Nouveau button asks the page to run: Restart plays from the start, and the person's own
// Display opens the same sheet as the catalog's.
const actionOf = (id) => (id === 'restart' ? 'play' : id === 'personDisplayRow' ? 'personDisplay' : id)

// The footer's focusable pieces with their resting and focused looks: a studio pill, Seerr's
// Genres and Tags chip (which grows rather than takes a ring), the facts card and the Retry link.
const footPiece = (f, i, tok) => {
  const base = {
    k: f.k,
    i,
    kind: f.kind,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    label: f.label || '',
    font: f.font || uiFont('regular'),
    size: 15,
    tx: 15,
    ty: 8.5,
    ink: '#ffffffcc',
  }
  if (f.kind === 'studio') return { ...base, r: 23.5, offColor: '#ffffff14', onColor: '#ffffff29', ring: '#ffffffff' }
  if (f.kind === 'chips')
    return {
      ...base,
      r: 26.5,
      size: 14,
      tx: 20,
      ty: 11.5,
      ink: '#ffffffff',
      offColor: '#374151ff',
      onColor: '#4b5563ff',
      ring: '#00000000',
    }
  if (f.kind === 'facts') return { ...base, label: '', r: 10, offColor: '#00000000', onColor: '#00000000', ring: '#ffffffff' }
  return {
    ...base,
    r: 6,
    size: 14,
    font: uiFont('bold'),
    tx: 11,
    ty: 6.5,
    ink: tok.accent,
    offColor: '#00000000',
    onColor: '#ffffff1a',
    ring: '#ffffffff',
  }
}

export default function Nouveau(props) {
  const p = props.page
  const [backdrop, setBackdrop] = createSignal('')
  const [wash, setWash] = createSignal('#00000000')
  const [scrim, setScrim] = createSignal('')
  const [hero, setHero] = createSignal(emptyList())
  const [ov, setOv] = createSignal(NO_OV)
  const [ovScroll, setOvScroll] = createSignal(0)
  const [act, setAct] = createSignal({ buttons: [], x: 0, y: 0, held: true })
  const [season, setSeason] = createSignal(NO_SEASON)
  const [plh, setPlh] = createSignal(NO_PLH)
  const [rails, setRails] = createSignal([])
  const [footBack, setFootBack] = createSignal(emptyList())
  const [footFront, setFootFront] = createSignal(emptyList())
  const [footPieces, setFootPieces] = createSignal([])
  const [footCur, setFootCur] = createSignal(0)
  const [left, setLeft] = createSignal(176)
  const [viewport, setViewport] = createSignal(1688)
  const [contentH, setContentH] = createSignal(1080)
  const [scroll, setScroll] = createSignal(0)
  const [zone, setZone] = createSignal(HERO)
  const [tokens, setTokens] = createSignal(null)
  const [has, setHas] = createSignal(false)
  const [jump, setJump] = createSignal(false)
  const railsK = byKey(rails, NO_RAIL)
  const piecesK = byKey(footPieces, NO_PIECE)
  const semi = () => uiFont('bold')
  const t = () => tokens() || { focus: '#00a4dcff', accent: '#0a84ffff', buttonFocused: '#fffffff2', onButtonFocused: '#0a0a12ff' }

  let root = null
  let actionsRef = null
  let seasonsRef = null
  const railRefs = {}
  // The last bag and the page's own state that lives outside the signals.
  const m = { gen: 0, bag: null, credits: NO_CREDITS, footFocusables: [], chain: [HERO] }
  // Only the page itself holds focus for the overview, the footer and a held row.
  const self = () => activeElement() === root
  const ovFocused = createMemo(() => zone() === OVERVIEW && self())
  const isFoot = createSelector(() => (zone() === FOOTER && self() ? footCur() : -1))
  // The overview's box is 2px shorter while it holds focus.
  createEffect(on(ovFocused, () => layout(), { defer: true }))
  onCleanup(() => m.gen++)

  const paint = (bag) => {
    if (!m.bag || m.bag.item.Id !== bag.item.Id) reset(bag)
    m.bag = bag
    layout()
  }
  const reset = (bag) => {
    m.gen++
    m.picked = null
    m.seasonEntry = null
    m.expanded = false
    m.credits = NO_CREDITS
    m.play = null
    m.playKey = ''
    m.overflow = []
    m.parked = false
    batch(() => {
      setZone(HERO)
      setFootCur(0)
      setScroll(0)
      setOvScroll(0)
    })
    loadCredits(bag)
  }
  // A person's Seerr credits, which add two rails when Seerr knows the person.
  const loadCredits = async (bag) => {
    const it = bag.item
    const gen = m.gen
    const tmdbId = it.ProviderIds && it.ProviderIds.Tmdb
    if (it.Type !== 'Person' || !tmdbId || (!bag.showsSection('seerrPersonAppearances') && !bag.showsSection('seerrPersonCrew'))) return
    const sr = await Promise.resolve(checkSeerr()).catch(() => null)
    if (gen !== m.gen || !sr || !sr.available) return
    const credits = await loadSeerrPersonCredits(tmdbId).catch(() => null)
    if (gen !== m.gen || !credits) return
    m.credits = credits
    layout()
  }
  // Whether the server would play the file as it is, asked again whenever the tracks change.
  const loadPlay = (key, args) => {
    if (key === m.playKey) return
    m.playKey = key
    m.play = { status: 'loading' }
    const gen = m.gen
    const done = (play) => {
      if (gen !== m.gen || key !== m.playKey) return
      m.play = play
      layout()
    }
    fetchDetailPlaybackInfo(api, args).then(
      (result) => done(result ? { status: 'ready', result } : { status: 'empty' }),
      () => done({ status: 'failed' }),
    )
  }

  const layout =() => batch(layoutNow)
  const layoutNow = () => {
    const d = m.bag
    if (!d) return
    const anchor = anchorAt(untrack(scroll))
    const it = d.item
    const s = d.settings
    const ty = it.Type
    const L = d.lists
    const tok = d.tokens
    const isPerson = ty === 'Person'
    const isSeason = ty === 'Season'
    const isSeries = ty === 'Series'
    const geo = pageGeometry(sideNavRoom(s), s.navbarPosition)
    m.geo = geo
    setTokens(tok)
    setLeft(geo.left)
    setViewport(geo.viewport)

    // The backdrop under a flat wash and the baked scrim, both as strong as the blur setting says.
    const blur = Number(s.backdropBlurDetail != null ? s.backdropBlurDetail : 20)
    const factor = Math.min(1, Math.max(0, blur / 25))
    const backId = getBackdropId(it)
    const backdropUrl =
      it._externalBackdropUrl || (backId ? getImageUrl(d.server, backId, 'Backdrop', { maxWidth: 1920, quality: 90 }) : null)
    setBackdrop(s.detailsBackdropEnabled !== false && backdropUrl ? backdropUrl : '')
    setWash(`#000000${alphaHex(factor * (isPerson ? 0.4 : 0.8))}`)
    setScrim(scrimSrc(SCRIM, 0.3 + 0.7 * factor))

    // A series shows its episodes a season at a time.
    const groups = groupEpisodesBySeason(isSeries ? L.seriesEpisodes : L.episodes)
    const numbers = []
    groups.forEach((_, n) => numbers.push(n))
    const nextUp = d.nextUp[0]
    const activeSeason = effectiveSeason(numbers, m.picked, nextUp && nextUp.ParentIndexNumber)
    const seasonTabs = seasonOptions(groups, L.seasons).map((o) => ({ id: o.id, label: o.label }))

    const genreLine = (it.Genres || []).slice(0, 3).join(' · ')
    const status = isSeries && (it.Status === 'Ended' || it.Status === 'Continuing') ? it.Status : null
    const showsOverview = Boolean(it.Overview) && !hidesMediaDescription(it, s) && (!isPerson || d.showsSection('biography'))
    const prose = showsOverview ? d.overviewText : ''
    const box = prose ? overviewBox(prose) : null
    const focusedOv = untrack(ovFocused)
    // Details probes the logo's size. A logo that fails to load leaves its box empty.
    const dims = d.logoSize && d.logoSize.url === d.logoUrl ? d.logoSize : NO_DIMS
    const logo = d.logoUrl ? { url: d.logoUrl, w: dims.w, h: dims.h } : null
    const laid = layoutHero(
      {
        left: geo.left,
        top: geo.heroTop,
        genreLine,
        reserveGenres: !genreLine && (ty === 'Episode' || isSeason),
        logo,
        isSeason,
        isPerson,
        name: (d.bookSeriesItem ? d.bookSeriesItem.Name : it.Name) || '',
        status,
        upcoming: isSeries || isSeason ? d.upcoming : '',
        seerrPills: d.seerr && d.seerr.statusPills,
        meta: nouveauMetaPieces({
          item: it,
          year: it.ProductionYear || '',
          officialRating: it.OfficialRating || '',
          runtime: d.runtime,
          seasonCount: it.ChildCount || L.seasons.length || 0,
          episodeCount: L.episodes.length,
          endsAt: isSeason ? seasonEndsAt(L.episodes, s) : '',
          showsBirthplace: d.showsSection('birthplace'),
        }),
        tech: d.techChips.concat(d.techSize ? [d.techSize] : []),
        incomplete: d.incomplete,
        ratings: isPerson ? [] : d.ratings,
        ratingStyle: { labels: s.showRatingLabels !== false, badges: s.showRatingBadges !== false },
        overview: box ? { box, expanded: m.expanded, focused: focusedOv } : null,
      },
      tok,
    )
    setHero({ rects: laid.rects, imgs: laid.imgs, texts: laid.texts })
    if (laid.overview) {
      const b = laid.overview.box
      const h = overviewHeight(b, m.expanded, focusedOv)
      const shownLines = b.canToggle && !m.expanded ? 3 : b.lines
      setOv({
        show: true,
        x: laid.overview.x,
        y: laid.overview.y,
        h,
        canToggle: b.canToggle,
        textW: b.textW,
        text: prose,
        font: fontFor(prose),
        maxlines: b.canToggle && !m.expanded ? 3 : 0,
        more: m.expanded ? $L('Read Less') : $L('Read More'),
        moreY: shownLines * OVERVIEW_LH + 12,
        room: Math.max(0, (focusedOv ? 34 : 36) + b.lines * OVERVIEW_LH + 45 - h),
      })
    } else setOv(NO_OV)

    const row = nouveauButtons(d.actionInput)
    m.overflow = row.overflow
    setAct({ buttons: row.buttons, x: geo.left, y: laid.actionsY, held: !d.settled })

    const personRails = isPerson
      ? buildPersonRails({
          filmography: splitFilmography(d.similar, d.showsSection, s.personPageSortOption),
          appearances: d.showsSection('seerrPersonAppearances') ? seerrPersonCards(m.credits.cast, false, s) : [],
          crewCredits: d.showsSection('seerrPersonCrew') ? seerrPersonCards(m.credits.crew, true, s) : [],
        })
      : []
    const sec = layoutSections(
      {
        item: it,
        settings: s,
        server: d.server,
        showsSection: d.showsSection,
        extras: d.extras,
        seerr: d.seerr,
        actionInput: d.actionInput,
        similar: d.similar,
        similarLoaded: L.similarLoaded,
        cast: d.cast,
        crew: d.crew,
        reviews: L.reviews || [],
        collectionSections: d.collectionSections,
        collectionItems: d.collectionItems,
        playlistItems: ty === 'BoxSet' && !d.showsSection('playlistOrder') ? [] : L.playlistItems,
        collectionSort: L.collectionSort,
        personRails,
        backdropUrl,
        nextUpId: nextUp && nextUp.Id,
        seasonTabs,
        activeSeason,
        seasonEpisodes: groups.get(activeSeason) || [],
        hasOverview: Boolean(it.Overview) && (!isPerson || d.showsSection('biography')),
        bookSeriesItem: d.bookSeriesItem || null,
      },
      geo,
      laid.bottom,
    )
    m.sec = sec
    setSeason(sec.seasonBar ? { x: geo.left, y: sec.seasonBar.y, tabs: sec.seasonBar.tabs, active: sec.seasonBar.active } : NO_SEASON)
    if (sec.playlistHeader) {
      const ph = sec.playlistHeader
      const labelX = textWidth(ph.title, 30, 'bold') + 12
      setPlh({
        show: true,
        x: geo.left,
        y: ph.y,
        title: ph.title,
        label: ph.label,
        labelFont: ph.labelFont,
        labelX,
        labelW: textWidth(ph.label, 17, 'bold') + 38,
      })
    } else setPlh(NO_PLH)
    setRails(sec.rails)

    const ms =d.mediaSource
    let footH = 0
    m.footFocusables = []
    if (sec.hasFooter) {
      const streams = (ms && ms.MediaStreams) || []
      const audios = streams.filter((x) => x.Type === 'Audio')
      const subs = streams.filter((x) => x.Type === 'Subtitle')
      const activeAudio = audios[d.tracks.audio] ? audios[d.tracks.audio].Index : undefined
      const activeSub = d.tracks.subtitle >= 0 && subs[d.tracks.subtitle] ? subs[d.tracks.subtitle].Index : undefined
      if (ms && d.showsSection('mediaInfo') && ty !== 'Book') {
        loadPlay(`${it.Id}|${ms.Id}|${activeAudio}|${activeSub}`, {
          itemId: it.Id,
          serverType: it._serverType,
          mediaSourceId: ms.Id,
          audioStreamIndex: activeAudio,
          subtitleStreamIndex: activeSub,
          maxBitrate: all().maxBitrate,
        })
      }
      const foot = layoutFooter(
        {
          item: it,
          showsSection: d.showsSection,
          mediaSource: ms,
          audio: d.tracks.audio,
          subtitle: d.tracks.subtitle,
          seerr: d.seerr,
          play: m.play,
          accent: tok.accent,
        },
        geo.left,
        sec.footerY,
        geo.viewport,
      )
      footH = foot.h
      setFootBack({ rects: foot.rects, imgs: [], texts: [] })
      setFootFront({ rects: [], imgs: foot.imgs, texts: foot.texts })
      setFootPieces(foot.focusables.map((f, i) => footPiece(f, i, tok)))
      m.footFocusables = foot.focusables
      if (untrack(footCur) >= foot.focusables.length) setFootCur(0)
    } else {
      setFootBack(emptyList())
      setFootFront(emptyList())
      setFootPieces([])
    }
    m.contentH = (sec.hasFooter ? sec.footerY + footH : sec.bottom) + 80
    setContentH(Math.max(1080, m.contentH))
    m.chain = sec.chain
    const moved = anchor && anchors().find((a) => a.id === anchor.id)
    if (moved && moved.y !== anchor.y) jumpTo(Math.max(0, Math.min(maxScroll(), untrack(scroll) + moved.y - anchor.y)))

    // Focus that waited on the held row takes it, and a footer left with nothing to focus (a Retry
    // that went back to checking) hands focus up the page.
    if (m.parked && focusable(HERO)) {
      m.parked = false
      if (untrack(has)) focusNode(HERO)
    } else if (untrack(zone) === FOOTER && untrack(self) && !focusable(FOOTER) && !move('up')) {
      focusNode(HERO)
    }
  }

  // Like a browser's scroll anchoring, the first section in view stays put when something above it
  // changes size, such as an overview that closes or ratings that land late.
  const anchors = () => [{ id: 'actions', y: untrack(act).y }].concat(m.sec ? m.sec.sections : [])
  const anchorAt = (top) => (top > 0 ? anchors().find((a) => a.y >= top) : null)
  // Sets the scroll without the slide.
  const jumpTo = (top) => {
    setJump(true)
    setScroll(top)
    setTimeout(() => setJump(false), 0)
  }
  const focusable = (node) => {
    if (node === OVERVIEW) return untrack(ov).show && untrack(ov).canToggle
    if (node === HERO) return untrack(act).buttons.length > 0 && !untrack(act).held
    if (node === SEASONS) return untrack(season).tabs.length > 0
    if (node === FOOTER) return m.footFocusables.length > 0
    return railOf(node) != null
  }
  const railOf = (node) => untrack(rails).find((r) => r.node === node)
  // Puts focus on a stop: its component, or this page for the overview, the footer and a held row.
  // A move along the chain pins the page, and a spatial move (`near`) scrolls just enough to show it.
  const focusNode = (node, near) => {
    setZone(node)
    if (node === HERO && !focusable(HERO)) {
      m.parked = true
      if (root) root.setFocus()
    } else if (node === OVERVIEW || node === FOOTER) {
      if (root) root.setFocus()
    } else if (node === HERO) {
      if (actionsRef) actionsRef.setFocus()
    } else if (node === SEASONS) {
      // The selector is always entered on its first tab. The bar puts itself on the open season as
      // it takes focus, so the pick waits for its report.
      const tabs = untrack(season).tabs
      m.seasonEntry = tabs[0] && tabs[0].id
      if (seasonsRef) seasonsRef.setFocus()
    } else {
      const r = railOf(node)
      const c = r && railRefs[r.k]
      if (c) c.setFocus()
    }
    if (near) reveal(focusBox(node))
    else pin()
  }
  const maxScroll = () => Math.max(0, (m.contentH || 1080) - 1080)
  // The page's scroll for a stop the chain moves to: the top for the hero and the overview, a
  // rail's section top under the clearance, and the footer's own top.
  const pin = () => {
    const z = untrack(zone)
    const geo = m.geo
    if (!geo || !m.sec) return
    const max = maxScroll()
    if (z === OVERVIEW || z === HERO) setScroll(0)
    else if (z === SEASONS) {
      const y = untrack(season).y
      setScroll(pinFor({ sectionTop: y, y, h: 63 }, geo.inset, max))
    } else if (z === FOOTER) {
      const sec = m.sec.sections.find((x) => x.id === 'details')
      setScroll(Math.max(0, Math.min(max, sec.y - geo.inset)))
    } else {
      const r = railOf(z)
      if (r) setScroll(pinFor(r, geo.inset, max))
    }
  }
  const reveal = (box) => {
    if (box) setScroll(focusScroll(box.y, box.h, untrack(scroll), 1080, maxScroll()))
  }
  // Each stop as one box for spatial moves: the action row, the overview, the season selector, each
  // rail (entered where focus last left it) and the footer's focused piece.
  const boxOf = (node) => {
    if (node === HERO) return { sid: node, x: untrack(act).x, y: untrack(act).y, w: HERO_W, h: 75 }
    if (node === OVERVIEW) return { sid: node, x: untrack(ov).x, y: untrack(ov).y, w: OVERVIEW_W, h: untrack(ov).h }
    if (node === SEASONS) return { sid: node, x: untrack(season).x, y: untrack(season).y, w: seasonsRef ? seasonsRef.width : 0, h: 63 }
    if (node === FOOTER) {
      const f = m.footFocusables[untrack(footCur)]
      return f && { sid: node, x: f.x, y: f.y, w: f.w, h: f.h }
    }
    const r = railOf(node)
    return r && { sid: node, x: untrack(left), y: r.y, w: untrack(viewport), h: r.h }
  }
  // The box a spatial move scrolls into view: a rail's current card, or the stop itself. It's inset by
  // the focus border, so a box just past the edge by no more than its border doesn't scroll.
  const focusBox = (node) => {
    const r = railOf(node)
    const c = r && railRefs[r.k] && railRefs[r.k].current()
    const inside = (box, b) => box && { y: box.y + b, h: box.h - 2 * b }
    if (!c) return inside(boxOf(node), node === HERO ? 4 : node === OVERVIEW ? 2 : node === FOOTER ? 1 : 0)
    const y = r.y + r.trackY + 20
    if (c.kind === 'landscape' && railRefs[r.k].half() === 'details') return inside({ y: y + c.detailsY, h: c.detailsH }, 1)
    if (c.kind === 'landscape') return inside({ y, h: c.artH + 2 }, 2)
    return inside({ y, h: c.h }, c.kind === 'person' ? 0 : c.kind === 'review' ? 3 : 2)
  }
  // Spatial moves from the overview, the season selector and the footer: the nearest piece of the
  // footer, else the nearest stop that way.
  const spot = (dir) => {
    const z = untrack(zone)
    const from = boxOf(z)
    if (!from) return false
    if (z === FOOTER) {
      const pieces = m.footFocusables.map((f, i) => ({ sid: `f${i}`, i, x: f.x, y: f.y, w: f.w, h: f.h }))
      const hit = nextStop(pieces, { ...from, sid: `f${untrack(footCur)}` }, dir)
      if (hit) {
        setFootCur(hit.i)
        reveal(focusBox(FOOTER))
        return true
      }
    }
    const hit = nextStop(m.chain.filter((n) => n !== z && n !== FOOTER && focusable(n)).map(boxOf), from, dir)
    if (!hit) return false
    focusNode(hit.sid, true)
    return true
  }
  // One step along the chain, past any stop with nothing to focus.
  const move = (direction) => {
    let node = clampNouveauNode(m.chain, untrack(zone))
    for (;;) {
      node = nextNouveauNode(m.chain, node, direction)
      if (!node) return false
      if (focusable(node)) {
        focusNode(node)
        return true
      }
    }
  }

  const onActionsEdge = (dir) => {
    if (dir === 'left' && navOnLeft()) focusNav()
  }
  const onAction = (id) => {
    if (id === 'more') return p.openMore(m.overflow.map((b) => ({ ...b, id: actionOf(b.id) })))
    p.runAction(actionOf(id))
  }

  // The season selector switches only on Enter.
  const onTabFocus = (id) => {
    const want = m.seasonEntry
    m.seasonEntry = null
    if (want && want !== id && seasonsRef) seasonsRef.select(want)
  }
  const onTabEnter = (id) => {
    // Picking the open season again leaves its rail where it is.
    if (id === untrack(season).active) return
    m.picked = Number(id)
    layout()
    const r = railOf('rail:episodes')
    const c = r && railRefs[r.k]
    if (c) c.reset()
  }

  const onRailFocus = (rail, card) => {
    const rest = rail.cards.length - card.idx
    if (rail.nearEnd === 'titles' && rest <= 8) p.loadMoreTitles()
    if (rail.nearEnd === 'items' && rest <= 8) loadMoreCollectionItems(p.collection(), p.ctx())
  }
  // A docked sidebar is reached sideways off a rail's first card. Anywhere else the rail wraps.
  const onRailEdge = (node, dir) => {
    if (dir !== 'left') return
    if (navOnLeft()) focusNav()
    else node.wrap()
  }
  // A chapter plays from where it starts, an extra or an episode's artwork plays it, an episode's
  // block and the rest open their page.
  const onRailSelect = (rail, card, half) => {
    const it = card.item
    if (card.kind === 'review') return p.onCellSelect({ kind: 'review', review: card.review })
    if (card.kind === 'person') return p.onCellSelect({ kind: 'person', item: it })
    if (card.kind === 'still') {
      if (card.book) return p.onCellSelect({ kind: 'card', item: it })
      if (card.ticks != null) return p.onCellSelect({ kind: 'chapter', item: null, ticks: card.ticks })
      return p.playItem(it, false)
    }
    if (card.kind === 'landscape') return half === 'details' ? p.onCellSelect({ kind: 'card', item: it }) : p.playItem(it, false)
    if (it && it._seerr) return p.onSeerrCardSelect(it)
    p.onCellSelect({ kind: 'card', item: it })
  }
  const onRailLong = (rail, card) => {
    if (card.item) p.onCellLong({ kind: 'card', item: card.item })
  }

  const footSelect = () => {
    const f = m.footFocusables[untrack(footCur)]
    if (!f) return
    if (f.kind === 'studio') p.onCellSelect({ kind: 'studio', studioName: f.studioName })
    else if (f.kind === 'chips') p.onSeerrPiece('chips')
    else if (f.kind === 'retry') {
      m.playKey = ''
      layout()
    }
  }
  const toggleOverview = (open) => {
    m.expanded = open
    setOvScroll(0)
    layout()
  }

  props.ref({
    paint,
    // The overview and the footer take their keys on this page, so only a stop with a component of
    // its own hands focus on.
    setFocus: () => {
      const z = untrack(zone)
      if (z === OVERVIEW || z === FOOTER || m.parked) {
        if (root) root.setFocus()
      } else focusNode(z)
    },
    skeletonBoxes: () => {
      const s = all()
      const tok = detailTokens()
      return skeletonBoxes(pageGeometry(sideNavRoom(s), s.navbarPosition).left, tok.isGlass ? '#ffffff29' : tok.os(0.14)).map((b) =>
        typeof b.color === 'object' ? { ...b, top: b.color.top, bottom: b.color.bottom } : b,
      )
    },
  })

  return (
    <view
      ref={(n) => (root = n)}
      // The part the Magic Remote's cursor focuses becomes the focused node (app/pointer.js).
      onPointerFocus={(n) => {
        for (let p = n; p; p = p.parent) {
          let to = p === actionsRef ? HERO : p === seasonsRef ? SEASONS : ''
          if (!to) to = Object.keys(railRefs).find((k) => railRefs[k] === p) || ''
          if (!to) continue
          if (untrack(zone) !== to || activeElement() === root) focusNode(to)
          return true
        }
        return false
      }}
      width={1920}
      height={1080}
      onFocusChanged={setHas}
      onUp={() => {
        const z = zone()
        if (z === OVERVIEW && m.expanded && ovScroll() > 1) {
          setOvScroll(Math.max(0, ovScroll() - 58))
          return true
        }
        // Nothing above the overview, so Up goes on to the page and a top bar.
        if (z === OVERVIEW || z === SEASONS || z === FOOTER) return spot('up') || z !== OVERVIEW
        move('up')
        return true
      }}
      onDown={() => {
        const z = zone()
        if (z === OVERVIEW && m.expanded && ov().room - ovScroll() > 1) {
          setOvScroll(Math.min(ov().room, ovScroll() + 58))
          return true
        }
        if (z === OVERVIEW || z === SEASONS || z === FOOTER) spot('down')
        else move('down')
        return true
      }}
      onLeft={() => {
        const z = zone()
        if ((z === OVERVIEW || z === SEASONS || z === FOOTER) && spot('left')) return true
        if (navOnLeft()) focusNav()
        return true
      }}
      onRight={() => {
        const z = zone()
        if (z === OVERVIEW || z === FOOTER) spot('right')
        return true
      }}
      onEnter={() => {
        if (zone() === OVERVIEW && ov().canToggle) toggleOverview(!m.expanded)
        else if (zone() === FOOTER) footSelect()
        return true
      }}
      // Back closes the open overview, then takes the page back to its top, and only then leaves.
      onBack={() => {
        if (m.expanded) {
          toggleOverview(false)
          return true
        }
        // Jumps to the top rather than sliding there.
        if (scroll() > 0) {
          jumpTo(0)
          focusNode(HERO)
          return true
        }
        return false
      }}
    >
      <view alpha={backdrop() ? 1 : 0} width={1920} height={1080} src={backdrop() || undefined} textureOptions={COVER} />
      <view width={1920} height={1080} color={wash()} />
      <view alpha={scrim() ? 1 : 0} width={1920} height={1080} src={scrim() || undefined} />

      <view transition={jump() || !SMOOTH_SCROLL ? undefined : SCROLL} y={-scroll()} width={1920} height={contentH()}>
        <Draw list={hero()} />

        <view alpha={ov().show ? 1 : 0} x={ov().x} y={ov().y} width={590} height={ov().h}>
          <view
            alpha={ov().canToggle ? 1 : 0}
            width={590}
            height={ov().h}
            borderRadius={t().isPixel ? 0 : 17}
            color={ovFocused() ? '#ffffff0a' : '#ffffff05'}
          />
          <view
            alpha={ov().canToggle && !ovFocused() ? 1 : 0}
            width={590}
            height={ov().h}
            borderRadius={t().isPixel ? 0 : 17}
            color="#00000001"
            border={{ width: 1, color: OV_EDGE }}
          />
          <view
            alpha={ovFocused() ? 1 : 0}
            width={590}
            height={ov().h}
            borderRadius={t().isPixel ? 0 : 17}
            color="#00000001"
            border={{ width: 1, color: hex(t().focus) }}
          />
          <view width={590} height={ov().h} clipping={ov().canToggle}>
            <view x={ov().canToggle ? (ovFocused() ? 17 : 18) : 0} y={(ov().canToggle ? (ovFocused() ? 17 : 18) : 0) - ovScroll()} width={590} height={ov().moreY + 36}>
              <text
                y={1.5}
                fontFamily={ov().font}
                fontSize={18}
                lineHeight={24.48}
                maxWidth={ov().textW}
                maxLines={ov().maxlines}
                color="#e6e6e6de"
              >
                {ov().text}
              </text>
              <text
                alpha={ov().canToggle ? 1 : 0}
                y={ov().moreY + 1.5}
                fontFamily={semi()}
                fontSize={17}
                lineHeight={33}
                color={t().accent}
              >
                {ov().more}
              </text>
            </view>
          </view>
        </view>

        <ActionButtons
          ref={(n) => (actionsRef = n)}
          x={act().x}
          y={act().y}
          w={680}
          buttons={act().buttons}
          held={act().held}
          tokens={tokens()}
          onAction={onAction}
          onActionsEdge={onActionsEdge}
        />
        <TabBar
          ref={(n) => (seasonsRef = n)}
          x={season().x}
          y={season().y}
          tabs={season().tabs}
          active={season().active}
          maxW={viewport()}
          tokens={tokens()}
          onTabFocus={onTabFocus}
          onTabEnter={onTabEnter}
          onTabsEdge={(dir) => dir === 'right' && spot('right')}
        />

        <view alpha={plh().show ? 1 : 0} x={plh().x} y={plh().y}>
          <text y={12} fontFamily={semi()} fontSize={30} lineHeight={33} color="#ffffffff">
            {plh().title}
          </text>
          <view x={plh().labelX} width={plh().labelW} height={51} borderRadius={25.5} color="#ffffff14" />
          <text x={plh().labelX + 19} y={10.5} fontFamily={plh().labelFont} fontSize={17} lineHeight={33} color="#ffffffff">
            {plh().label}
          </text>
        </view>

        <view width={1920} height={contentH()}>
          <For each={railsK.keys()}>
            {(k) => {
              let node = null
              onCleanup(() => railRefs[k] === node && delete railRefs[k])
              return (
                <NouveauRail
                  ref={(n) => {
                    node = n
                    railRefs[k] = n
                  }}
                  x={left()}
                  y={railsK.at(k).y}
                  rail={railsK.at(k)}
                  view={viewport()}
                  tokens={tokens()}
                  onRailFocus={onRailFocus}
                  onRailEdge={onRailEdge}
                  onRailSelect={onRailSelect}
                  onRailLong={onRailLong}
                />
              )
            }}
          </For>
        </view>

        <view width={1920} height={FAR}>
          <Draw list={footBack()} />
        </view>
        <view width={1920} height={contentH()}>
          <For each={piecesK.keys()}>
            {(k) => {
              const f = () => piecesK.at(k)
              return (
                <view x={f().x} y={f().y} width={f().w} height={f().h}>
                  <view
                    width={f().w}
                    height={f().h}
                    borderRadius={f().r}
                    pivot={0.5}
                    scale={f().kind === 'chips' && isFoot(f().i) ? 1.05 : 1}
                    color={isFoot(f().i) ? f().onColor : f().offColor}
                  />
                  <view
                    alpha={isFoot(f().i) && f().kind !== 'chips' ? 1 : 0}
                    width={f().w}
                    height={f().h}
                    borderRadius={f().r}
                    color="#00000001"
                    border={{ width: 1, color: hex(f().ring) }}
                  />
                  <text
                    x={f().tx}
                    y={f().ty}
                    fontFamily={f().font}
                    fontSize={f().size}
                    lineHeight={33}
                    color={isFoot(f().i) ? '#ffffffff' : f().ink}
                  >
                    {f().label}
                  </text>
                </view>
              )
            }}
          </For>
        </view>
        <view width={1920} height={FAR}>
          <Draw list={footFront()} />
        </view>
      </view>
    </view>
  )
}
