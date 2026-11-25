import { For, createEffect, createSelector, createSignal, on, onCleanup, untrack } from 'solid-js'
import ActionButtons from '../../../ui/components/details/ActionButtons.jsx'
import Overview from '../../../ui/components/details/Overview.jsx'
import SeerrStatusDownloads, { downloadsLayout } from '../../../ui/components/seerr/SeerrStatusDownloads.jsx'
import { byKey } from '../../../ui/components/details/keyed.js'
import Draw from '../stage/Draw.jsx'
import { emptyList } from '../stage/Draw.js'
import { roundedZoom } from '../../../ui/components/home/zoomShader.js'
import SectionModal from './SectionModal.jsx'
import { cssShift, fontFor } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { shadowColor, sideNavRoom } from '../../../ui/theme.js'
import { wrapLines } from '../../../ui/components/details/measure.js'
import { getServerType } from '../../../services/jellyfinApi.js'
import { getBackdropId, getImageUrl } from '../../../utils/helpers.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { checkSeerr } from '../../../state/seerr.js'
import { buildMediaFacts } from '../../../utils/seerrMediaFacts.js'
import { sortLabel } from '../nouveau/nouveauCollectionSort.js'
import { loadMoreCollectionItems } from '../load.js'
import { actionRow } from '../modern/actions.js'
import { overviewHeight } from '../modern/hero.js'
import { detailTokens } from '../modern/tokens.js'
import { layoutSpotlightHero, seerrPillsOf } from './hero.js'
import { heroWidth, spotlightCardFor, spotlightCardsFor, spotlightMetaPieces, summaryCardHeight, summaryCardWidth } from './cards.js'
import { spotlightCardFallbackUrl } from './spotlightImages.js'
import { loadSeerrPersonCredits, seerrPersonCards } from '../seerrPersonCredits.js'
import { alphaHex } from '../../../ui/themeColor.js'

// The Spotlight style: the backdrop under a baked scrim, the hero column at the top left, and a band
// of summary cards along the bottom, each opening a panel with the sections it sums up. The page
// scrolls only when the hero runs into the band, and the band slides sideways to keep the focused
// card on screen.
const SCRIM = [
  { to: 'right', rgb: '11, 13, 16', stops: [[0, 1], [0.35, 0.9], [0.6, 0.45], [0.85, 0]] },
  { to: 'top', rgb: '11, 13, 16', stops: [[0, 1], [0.45, 0.8], [0.8, 0]] },
  { at: [0.5, 0.5], rgb: '11, 13, 16', stops: [[0.7, 0], [1, 0.32]] },
]
const CARD_SCRIM = [{ to: 'bottom', rgb: '0, 0, 0', stops: [[0.35, 0.05], [0.65, 0.45], [1, 0.85]] }]
const PAD = 40
const SCROLL_PADDING = 24
const BAND_GAP = 16
const CARD_H = summaryCardHeight(1080)
const CARD_W = summaryCardWidth(CARD_H)
const STEP = CARD_W + 2 + BAND_GAP
const HERO_W = heroWidth(1920)
const NO_CREDITS = { cast: [], crew: [] }
const NO_OV = { show: false, x: 0, y: 0, text: '', font: 'roboto', box: null }
const GONE_CARD = { k: '', i: -1, x: 0, img: '', icon: '', title: '', titleFont: 'roboto', subtitle: '', subFont: 'roboto', titleY: 0, subY: 0 }
const EASE = { duration: 150, easing: 'ease-out' }
const FADE = { duration: 150 }
const EDGE = hex('#ffffff1f')
// The focused card's glow, drawn by a clear node the size of the card.
const GLOW = { color: shadowColor('#ffffff59'), x: 0, y: 0, blur: 12, spread: 0 }
// Card art keeps its top when it's cropped.
const TOP_COVER = { resizeMode: { type: 'cover', clipY: 0 } }

const seerrChipCount = (d) => ((d && d.genres && d.genres.length) || 0) + ((d && d.networks && d.networks.length) || 0) + ((d && d.keywords && d.keywords.length) || 0)

export default function Spotlight(props) {
  const page = props.page
  const [painted, setPainted] = createSignal(false)
  const [backdrop, setBackdrop] = createSignal('')
  const [shade, setShade] = createSignal('#00000000')
  const [scrim, setScrim] = createSignal('')
  const [hero, setHero] = createSignal(emptyList())
  const [ov, setOv] = createSignal(NO_OV)
  const [overviewExpanded, setOverviewExpanded] = createSignal(false)
  const [act, setAct] = createSignal({ buttons: [], x: 0, y: 0, w: HERO_W, held: true, glass: null })
  const [dl, setDl] = createSignal({ x: 0, y: 0, bars: downloadsLayout(null) })
  const [cardList, setCardList] = createSignal([])
  const [band, setBand] = createSignal({ x: 0, y: 0, viewW: 0 })
  const [fcur, setFcur] = createSignal(-1)
  const [bscroll, setBscroll] = createSignal(0)
  const [pscroll, setPscroll] = createSignal(0)
  const [contentH, setContentH] = createSignal(1080)
  const [tokens, setTokens] = createSignal(detailTokens())
  const [logoProbe, setLogoProbe] = createSignal('')
  const cards = byKey(cardList, GONE_CARD)
  const isFocus = createSelector(fcur)
  const cardScrim = scrimSrc(CARD_SCRIM)

  // Plain state that nothing needs to react to.
  const m = { bag: null, itemId: null, credits: NO_CREDITS, openId: null, logo: null, cardState: null, cards: [], zone: 'actions' }
  let root
  let actions
  let overview
  let modal

  // The loading skeleton: the hero's bars and buttons, and three cards along the bottom.
  const skeletonBoxes = () => {
    const t = detailTokens()
    const box = t.isGlass ? '#ffffff29' : t.os(0.14)
    const room = sideNavRoom()
    const x0 = room ? 120 : PAD
    let y = room ? PAD : 135
    const out = [
      { k: 'bgL', x: 0, y: 0, w: 1056, h: 1080, r: 0, left: '#ffffff00', right: '#ffffff08' },
      { k: 'bgR', x: 1056, y: 0, w: 864, h: 1080, r: 0, left: '#ffffff08', right: '#ffffff19' },
    ]
    const add = (k, x, w, h, r, dy = 0) => out.push({ k, x, y: y + dy, w, h, r, color: box })
    add('tag', x0, 360, 18, 3)
    y += 18 + 10
    add('logo', x0, 420, 72, 8)
    y += 72 + 10
    ;[60, 36, 81, 210].reduce((x, w, i) => (add(`m${i}`, x, w, 21, 4), x + w + 16), x0)
    y += 21 + 10
    ;[72, 66, 66, 87, 66].reduce((x, w, i) => (add(`r${i}`, x, w, 64, 6), x + w + 9), x0)
    y += 64 + 10
    add('play', x0, 78, 78, 39)
    ;[0, 1, 2, 3].forEach((i) => add(`c${i}`, x0 + 78 + 12 + i * 86, 74, 74, 37, 2))
    const cardW = (HERO_W - 32) / 3
    const top = 1080 - PAD - CARD_H
    ;[0, 1, 2].forEach((i) => {
      const cx = x0 + i * (cardW + 16)
      out.push({ k: `card${i}`, x: cx, y: top, w: cardW, h: CARD_H, r: 14, color: '#ffffff0c' })
      out.push({ k: `cardB${i}`, x: cx + 16, y: top + 16, w: 36, h: 36, r: 18, color: box })
      out.push({ k: `cardT${i}`, x: cx + 16, y: top + CARD_H - 16 - 42, w: 170, h: 20, r: 4, color: box })
      out.push({ k: `cardS${i}`, x: cx + 16, y: top + CARD_H - 16 - 16, w: 100, h: 16, r: 3, color: box })
      out.push({ k: `cardA${i}`, x: cx + cardW - 16 - 22, y: top + CARD_H - 16 - 22, w: 22, h: 22, r: 4, color: box })
    })
    return out
  }

  // What the closed circles show through themselves where the browser can blur: the backdrop
  // blurred by the server, under this style's shade and scrim.
  const glassFor = (it, server, back, shadeColor, scrimUrl) => {
    const type = getServerType()
    const backId = getBackdropId(it)
    if (!back || it._externalBackdropUrl || !backId || (type !== 'jellyfin' && type !== 'emby')) return null
    return { src: `${getImageUrl(server, backId, 'Backdrop', { maxWidth: 640, quality: 90 })}&blur=3`, shade: shadeColor, scrim: scrimUrl }
  }

  const paint = (bag) => {
    m.bag = bag
    const it = bag.item
    const s = bag.settings
    const L = bag.lists
    // The page's tokens keep their identity until the theme changes, so a paint restyles nothing.
    const t = bag.tokens || detailTokens()
    setTokens(t)
    const server = bag.server
    const isPerson = it.Type === 'Person'
    if (m.itemId !== it.Id) {
      m.itemId = it.Id
      m.credits = NO_CREDITS
      m.openId = null
      m.zone = 'actions'
      setOverviewExpanded(false)
      setFcur(-1)
      setBscroll(0)
      setPscroll(0)
      if (modal) modal.close()
      if (isPerson) loadCredits(it)
    }

    // The backdrop and its scrim. The blur setting only sets how dark the shade under the scrim is.
    const blur = Number(s.backdropBlurDetail != null ? s.backdropBlurDetail : 20)
    const opacity = Math.min(1, blur / 25)
    const backId = getBackdropId(it)
    const backdropUrl = it._externalBackdropUrl || (backId ? getImageUrl(server, backId, 'Backdrop', { maxWidth: 1920, quality: 90 }) : null)
    const back = s.detailsBackdropEnabled !== false && backdropUrl ? backdropUrl : ''
    const shadeColor = `#000000${alphaHex(opacity * (isPerson ? 0.4 : 0.8))}`
    const scrimUrl = scrimSrc(SCRIM, 0.3 + 0.7 * opacity)
    setBackdrop(back)
    setShade(shadeColor)
    setScrim(scrimUrl)

    const left = s.navbarPosition === 'left'
    const x0 = left ? 120 : PAD
    const y0 = left ? PAD : 135

    // The action row: five round buttons at most, the rest behind More Actions.
    const row = actionRow(bag.actionInput, { maxVisibleButtons: 5, overflowAsMenu: true })
    page.setBehind(row.behind)

    // The logo's size comes from a probe of its own, since Modern's sits in a layer this style hides
    // and a hidden node never loads its image.
    let logo = null
    const logoUrl = bag.logoUrl && !isPerson ? bag.logoUrl : ''
    if (!m.logo || m.logo.url !== logoUrl) {
      m.logo = { url: logoUrl, w: 0, h: 0, failed: false }
      setLogoProbe(logoUrl)
    }
    if (logoUrl && !m.logo.failed) {
      const max = it.Type === 'Episode' ? { w: 360, h: 72 } : { w: 480, h: 120 }
      const nw = m.logo.w
      const nh = m.logo.h
      const k = nw ? Math.min(1, max.w / nw, max.h / nh) : 0
      logo = { url: logoUrl, w: nw * k, h: nh * k }
    }
    const ms = bag.mediaSource
    const multipleVersions = bag.supportsSelection && (it.MediaSources || []).length > 1
    const version = multipleVersions && ms && bag.showsSection('versionBadge') ? `[ ${ms.Name || 'Default'} ]` : ''
    const meta = spotlightMetaPieces({
      item: it, year: it.ProductionYear || '', officialRating: it.OfficialRating || '', seasonCount: it.ChildCount || L.seasons.length || 0,
      episodeCount: L.episodes.length || it.ChildCount || 0, genres: it.Genres || [], upcomingEpisodeText: bag.upcoming,
      hasSeerrPills: Boolean(bag.seerr.statusPills && bag.seerr.statusPills.length), settings: s,
    })
    const hideDescription = bag.hideDescription || (isPerson && !bag.showsSection('biography'))
    const overviewText = hideDescription ? '' : bag.overviewText
    const bars = downloadsLayout(bag.seerr && bag.seerr.downloads)
    const laid = layoutSpotlightHero({
      x0, y0, W: HERO_W, person: isPerson, avatar: bag.posterUrl, born: bag.born, ringColor: t.focus,
      title: (bag.bookSeriesItem ? bag.bookSeriesItem.Name : it.Name) || '', tagline: bag.tagline, episode: it.Type === 'Episode', seriesLabel: it.SeriesName || '', logo, version,
      meta, seerrPills: seerrPillsOf(bag.seerr), techSize: bag.techSize, techChips: bag.techChips, ratings: bag.ratings,
      ratingStyle: { labels: s.showRatingLabels !== false, badges: s.showRatingBadges !== false },
      overview: overviewText, overviewExpanded: untrack(overviewExpanded), hasActions: row.buttons.length > 0, incomplete: bag.incomplete, downloadsH: bars.h,
    }, t)
    setHero({ rects: laid.rects, imgs: laid.imgs, texts: laid.texts })
    setOv(laid.overview ? { show: true, x: laid.overview.x, y: laid.overview.y, text: overviewText, font: fontFor(overviewText), box: laid.overview.box } : NO_OV)
    setAct({ buttons: row.buttons, x: x0, y: laid.actionsY, w: HERO_W, held: !bag.settled, glass: glassFor(it, server, back, shadeColor, scrimUrl) })
    setDl({ x: x0, y: laid.downloadsY, bars })

    // The band of summary cards, pinned to the bottom unless the hero pushes it further down.
    const state = cardState(bag, backdropUrl)
    m.cardState = state
    const built = spotlightCardsFor(state)
    m.cards = built
    const bandY = Math.max(1080 - PAD - (CARD_H + 2), laid.bottom)
    setContentH(Math.max(1080, bandY + CARD_H + 2 + PAD))
    setBand({ x: x0, y: bandY, viewW: 1920 - (x0 - PAD) })
    setCardList(
      built.map((c, i) => {
        const titleLines = Math.min(2, wrapLines(c.title, 20, 'bold', 302).length)
        const blockH = titleLines * 24 + (c.subtitle ? 2 + 33 : 0)
        const top = 1 + CARD_H - 10 - blockH
        return {
          k: c.id, i, x: i * STEP, img: c.imageUrl || '', icon: c.icon, title: c.title, titleFont: fontFor(c.title, 'bold'),
          subtitle: c.subtitle || '', subFont: fontFor(c.subtitle || ''), titleY: top + cssShift(20), subY: top + titleLines * 24 + 2 + cssShift(16),
        }
      }),
    )
    if (untrack(fcur) >= built.length) setFcur(built.length - 1)
    if (m.zone === 'band' && !built.length) focusZone('actions')
    // An open card follows the data as it fills in.
    if (m.openId) {
      const card = spotlightCardFor(m.openId, state)
      if (card && modal) modal.update(card, state)
    }
    setPainted(true)
  }

  const cardState = (bag, backdropUrl) => {
    const it = bag.item
    const s = bag.settings
    const L = bag.lists
    const sr = bag.seerr
    const film = bag.filmography
    const credits = m.credits || NO_CREDITS
    return {
      item: it, serverUrl: bag.server, settings: s, showsSection: bag.showsSection, seerrOnly: Boolean(bag.actionInput && bag.actionInput.seerrOnly), mediaSource: bag.mediaSource,
      tracks: bag.tracks, seasons: L.seasons, episodes: L.episodes, seriesEpisodes: L.seriesEpisodes, similar: bag.similar,
      similarSource: L.similarSource, reviews: L.reviews, extras: bag.extras, cast: bag.cast, crew: bag.crew, nextUp: bag.nextUp,
      collectionItems: bag.collectionItems, missingCollectionItems: [], parentCollections: bag.parentCollections,
      albumTracks: L.albumTracks, artistAlbums: L.artistAlbums,
      playlistItems: it.Type === 'BoxSet' && !bag.showsSection('playlistOrder') ? [] : L.playlistItems,
      playlistSort: it.Type === 'BoxSet' ? { label: sortLabel(L.collectionSort), loading: Boolean(L.collectionPlaylistLoading) } : null,
      personMovies: film ? film.movies : [], personSeries: film ? film.series : [], filmography: film ? film.guestAppearances : [],
      seerrAppearances: seerrPersonCards(credits.cast, false, s), seerrCrewCredits: seerrPersonCards(credits.crew, true, s),
      bookSeriesItem: bag.bookSeriesItem || null, studioCards: bag.studioCards, canManagePlaylist: false,
      seerr: {
        details: sr.details, recommendations: sr.recommendationCards || [], similar: sr.similarCards || [],
        chipCount: sr.pieces && sr.pieces.chips ? seerrChipCount(sr.details) : 0,
        factCount: sr.pieces && sr.pieces.facts ? buildMediaFacts(sr.details, sr.mediaType).length : 0,
        streamingCount: sr.pieces && sr.pieces.streaming ? (sr.streamingProviders || []).length : 0,
        collection: sr.pieces && sr.pieces.collection && sr.details ? sr.details.collection : null,
        seasonMarkers: s.showSeerrAvailabilityBadges !== false ? sr.seasonMarkers : null,
        overlay: sr,
      },
      fallbackImageUrl: spotlightCardFallbackUrl(bag.server, it, backdropUrl),
    }
  }
  const repaint = () => m.bag && paint(m.bag)
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
  const loadCredits = async (it) => {
    const tmdbId = it.ProviderIds && it.ProviderIds.Tmdb
    const seerr = await Promise.resolve(checkSeerr()).catch(() => null)
    if (!tmdbId || !seerr || !seerr.available) return
    const credits = await loadSeerrPersonCredits(tmdbId).catch(() => null)
    if (!credits || m.itemId !== it.Id || !m.bag) return
    m.credits = credits
    repaint()
  }

  // The page keeps the focused piece 24px clear of the screen's edges, and the band keeps the
  // focused card on screen.
  const focusZone = (zone) => {
    m.zone = zone
    if (zone !== 'band') setFcur(-1)
    const ref = { actions, overview, modal }[zone]
    if (ref) ref.setFocus()
    else if (root) root.setFocus()
    keepInView()
  }
  const keepInView = () => {
    let top
    let bottom
    const zone = m.zone
    if (zone === 'actions') {
      top = untrack(act).y
      bottom = top + 75
    } else if (zone === 'overview') {
      top = untrack(ov).y
      bottom = top + overviewHeight(untrack(ov).box, untrack(overviewExpanded))
    } else if (zone === 'band') {
      const b = untrack(band)
      const i = untrack(fcur)
      top = b.y
      bottom = top + CARD_H + 2
      const viewL = b.x - PAD
      const cardL = b.x + i * STEP - untrack(bscroll)
      const cardR = cardL + CARD_W + 2
      const total = PAD + m.cards.length * STEP - BAND_GAP + PAD
      let sx = untrack(bscroll)
      if (cardL < viewL) sx -= viewL - cardL + SCROLL_PADDING
      else if (cardR > 1920) sx += cardR - 1920 + SCROLL_PADDING
      setBscroll(Math.max(0, Math.min(Math.max(0, total - b.viewW), sx)))
    } else return
    let sy = untrack(pscroll)
    if (top < sy) sy = top - SCROLL_PADDING
    else if (bottom > sy + 1080) sy = bottom - 1080 + SCROLL_PADDING
    setPscroll(Math.max(0, Math.min(untrack(contentH) - 1080, sy)))
  }
  const focusCard = (i) => {
    setFcur(i)
    focusZone('band')
  }
  // Up from the band lands on the primary button.
  const focusPrimary = () => {
    const buttons = untrack(act).buttons
    const primary = buttons.find((b) => b.id === 'resume') || buttons.find((b) => b.id === 'play')
    if (actions && primary) actions.select(primary.id)
    focusZone('actions')
  }

  const onOverviewToggle = () => {
    setOverviewExpanded(!untrack(overviewExpanded))
    repaint()
    keepInView()
  }

  const openCard = (i) => {
    const card = m.cards[i]
    if (!card || !modal) return
    m.openId = card.id
    modal.open(spotlightCardFor(card.id, m.cardState) || card, m.cardState)
    focusZone('modal')
  }
  const onModalClose = () => {
    const i = m.cards.findIndex((c) => c.id === m.openId)
    m.openId = null
    focusCard(Math.max(0, i))
  }
  const onModalAction = (kind, data) => {
    if (kind === 'item') return page.open(data)
    if (kind === 'seerrItem') return page.onSeerrCardSelect(data)
    // A Seerr-only title's people are TMDB people, whom the page opens on Seerr's person page.
    if (kind === 'person') return page.onCellSelect({ kind: 'person', item: data })
    if (kind === 'studio') return page.onCellSelect({ kind: 'studio', studioName: data })
    if (kind === 'review') return page.onCellSelect({ kind: 'review', review: data })
    if (kind === 'chapter') return page.onCellSelect({ kind: 'chapter', item: null, ticks: data })
    if (kind === 'extra') return page.playItem(data, false)
    if (kind === 'sort') return page.onCellSelect({ kind: 'sort' })
    if (kind === 'seerrPiece') return page.onSeerrPiece(data.kind, data.data)
    if (kind === 'hold') return page.onCellLong(data)
    if (kind === 'track') {
      if (data.opens) return page.open(data.item)
      const t = m.bag.item.Type
      return page.playFromList(t === 'BoxSet' ? data.list : m.bag.lists.albumTracks, data.item)
    }
    if (kind === 'more') {
      if (m.openId === 'playlist_order') return loadMoreCollectionItems(page.collection(), page.ctx())
      if (m.openId === 'boxset_items') return page.loadMoreTitles()
    }
    return undefined
  }

  props.ref({ paint, setFocus: () => focusZone(m.zone), skeletonBoxes })

  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      onUp={() => {
        if (m.zone === 'band') focusPrimary()
        else if (m.zone === 'actions' && ov().show && ov().box && ov().box.canToggle) focusZone('overview')
        else return page.upFromTop()
        return true
      }}
      onDown={() => {
        if (m.zone === 'overview') focusZone('actions')
        else if (m.zone === 'actions' && m.cards.length) focusCard(0)
        return true
      }}
      onLeft={() => {
        if (m.zone === 'band' && fcur() > 0) focusCard(fcur() - 1)
        else page.onActionsEdge('left')
        return true
      }}
      onRight={() => {
        if (m.zone === 'band' && fcur() < m.cards.length - 1) focusCard(fcur() + 1)
        return true
      }}
      onEnter={() => {
        if (m.zone === 'band') openCard(fcur())
        return true
      }}
      onBack={() => {
        if (!overviewExpanded()) return false
        setOverviewExpanded(false)
        repaint()
        return true
      }}
    >
      <view alpha={painted() ? 1 : 0} width={1920} height={1080} color="#0b0d10ff" />
      <view alpha={backdrop() ? 1 : 0} width={1920} height={1080} src={backdrop() || undefined} textureOptions={{ resizeMode: { type: 'cover' } }} />
      <view width={1920} height={1080} color={shade()} />
      <view alpha={scrim() ? 1 : 0} width={1920} height={1080} src={scrim() || undefined} />

      <view y={-pscroll()} width={1920} height={contentH()} alpha={painted() ? 1 : 0}>
        <Draw list={hero()} />
        <Overview
          ref={(n) => (overview = n)}
          x={ov().x}
          y={ov().y}
          alpha={ov().show ? 1 : 0}
          text={ov().text}
          font={ov().font}
          box={ov().box}
          expanded={overviewExpanded()}
          tokens={tokens()}
          onOverviewToggle={onOverviewToggle}
        />
        <ActionButtons
          ref={(n) => (actions = n)}
          x={act().x}
          y={act().y}
          w={act().w}
          buttons={act().buttons}
          held={act().held}
          tokens={tokens()}
          glass={act().glass}
          ox={act().x}
          oy={act().y - pscroll()}
          onAction={(id) => page.runAction(id)}
          onActionLong={(id) => page.onActionLong(id)}
          onActionsEdge={(dir) => page.onActionsEdge(dir)}
          onActionFocus={() => m.zone === 'actions' && keepInView()}
        />
        <SeerrStatusDownloads x={dl().x} y={dl().y} bars={dl().bars} />

        <view x={band().x - 40} y={band().y - 16} width={band().viewW} height={234} clipping>
          <view x={40 - bscroll()} y={16} width={Math.max(1, cardList().length * STEP)} height={CARD_H + 2}>
            <For each={cards.keys()}>
              {(k) => {
                const c = () => cards.at(k)
                const on = () => isFocus(c().i)
                return (
                  <view x={c().x} width={CARD_W + 2} height={CARD_H + 2} pivot={0.5} transition={{ scale: EASE }} scale={on() ? 1.03 : 1}>
                    <view width={CARD_W + 2} height={CARD_H + 2} borderRadius={14} color="#00000000" shadow={GLOW} transition={{ alpha: FADE }} alpha={on() ? 1 : 0} />
                    <CardArt src={c().img} on={on()} />
                    <view x={1} y={1} width={CARD_W} height={CARD_H} borderRadius={13} src={cardScrim || undefined} />
                    <view width={CARD_W + 2} height={CARD_H + 2} borderRadius={14} color="#00000001" border={{ width: 1, color: EDGE }} />
                    <view
                      width={CARD_W + 2}
                      height={CARD_H + 2}
                      borderRadius={14}
                      color="#00000001"
                      border={{ width: 1, color: hex(tokens().focus) }}
                      transition={{ alpha: FADE }}
                      alpha={on() ? 1 : 0}
                    />
                    <view x={11} y={11} width={36} height={36} borderRadius={18} color="#00000073">
                      <view x={8} y={8} width={20} height={20} src={c().icon || undefined} color="#ffffffff" />
                    </view>
                    <view
                      transition={{ x: EASE, alpha: FADE }}
                      x={on() ? 326 : 323}
                      y={167}
                      width={22}
                      height={22}
                      src="icons/d/chevronRight.webp"
                      color="#ffffffff"
                      alpha={on() ? 1 : 0.55}
                    />
                    <text x={15} y={c().titleY} fontFamily={c().titleFont} fontSize={20} lineHeight={24} maxWidth={302} maxLines={2} color="#ffffffff">
                      {c().title}
                    </text>
                    <text x={15} y={c().subY} fontFamily={c().subFont} fontSize={16} lineHeight={33} maxWidth={302} maxLines={1} color="#ffffffbf">
                      {c().subtitle}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
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
      <SectionModal ref={(n) => (modal = n)} tokens={tokens()} onModalAction={onModalAction} onModalClose={onModalClose} />
    </view>
  )
}

// A card's art, which zooms to 106% inside the rounded frame while the card has focus. It zooms
// about the middle of the picture, not the top that the crop keeps.
// shortcut: a picture far from 16:9 zooms about its own middle rather than the shown part's, use the
// crop's center if a card shows posters.
function CardArt(props) {
  let node
  let anim = null
  const shader = [roundedZoom(), { radius: 13, zoom: 1 }]
  createEffect(
    on(
      () => props.on,
      (focused) => {
        if (anim) anim.stop()
        anim = node.animate({ shaderProps: { zoom: focused ? 1.06 : 1 } }, { duration: 400, easing: 'ease-out' })
        anim.start()
      },
      { defer: true },
    ),
  )
  onCleanup(() => anim && anim.stop())
  return (
    <view
      ref={node}
      x={1}
      y={1}
      width={CARD_W}
      height={CARD_H}
      color={props.src ? '#ffffffff' : '#ffffff12'}
      src={props.src || undefined}
      textureOptions={TOP_COVER}
      shader={shader}
    />
  )
}
