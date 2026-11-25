import { createSignal } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import ActionButtons from '../../../ui/components/details/ActionButtons.jsx'
import { cssShift, fontFor, themeSpacing } from '../../../ui/text.js'
import { navOnLeft, sideNavRoom } from '../../../ui/theme.js'
import { focusNav } from '../../../app/focus.js'
import { isKidsMode } from '../../../utils/kidsMode.js'
import { actionRow } from '../modern/actions.js'
import { collectionGroups, collectionLabel } from '../stage/stageRules.js'
import {
  minimalistBranding, minimalistCollectionCard, minimalistExtrasCard, minimalistScrimAlpha, minimalistStillUrl, showsEpisodes,
  showsExtrasButton,
} from './minimalistRules.js'
import { layoutMinimalist, logoBox, minimalistLeft } from './layout.js'
import Episodes from './Episodes.jsx'
import SectionModal from '../spotlight/SectionModal.jsx'
import { alphaHex } from '../../../ui/themeColor.js'

// The Minimalist details style: the artwork under a flat wash, and at the foot of the screen the
// logo or title, an episode's name, one row of buttons and the episodes. No cast, no chapters, no
// rows of other titles. Extras and a collection's own titles each sit behind a button that opens the
// Spotlight style's section panel.
const STILL_WIDTH = 440
// Every optional piece keeps all its fields, so no binding starts out reading one that isn't there.
const NONE = { show: false, x: 0, y: 0, w: 0, h: 0, src: '', text: '', font: 'roboto' }
const KIDS_VISIBLE = 4
const VISIBLE = 5
const SHADOW = { color: '#00000099', x: 0, y: 2, blur: 14 }
const COVER = { resizeMode: { type: 'cover' } }

export default function Minimalist(props) {
  const page = props.page
  const [backdrop, setBackdrop] = createSignal('')
  const [scrim, setScrim] = createSignal('#00000000')
  const [logoProbe, setLogoProbe] = createSignal('')
  const [logo, setLogo] = createSignal(NONE)
  const [title, setTitle] = createSignal(NONE)
  const [episodeName, setEpisodeName] = createSignal(NONE)
  const [incomplete, setIncomplete] = createSignal(NONE)
  const [still, setStill] = createSignal(NONE)
  const [act, setAct] = createSignal({ buttons: [], x: 0, y: 0, held: true })
  const [ep, setEp] = createSignal({ show: false, x: 0, y: 0 })
  const [tokens, setTokens] = createSignal(null)

  const m = { v: null, id: null, zone: 'actions', logos: {}, groups: [], episodesH: 0, sheet: null }
  let root
  let actions
  let episodes
  let sheet

  // The loading skeleton: the logo, the buttons and a rail of stills, all on the bottom edge.
  const skeletonBoxes = () => {
    const x = minimalistLeft(sideNavRoom())
    const tok = page.tokens()
    const box = tok && !tok.isGlass && tok.os ? tok.os(0.14) : '#ffffff29'
    const out = []
    ;[0, 1, 2, 3].forEach((i) => out.push({ k: `r${i}`, x: x + i * 286, y: 886, w: 266, h: 150, r: 14, color: box }))
    out.push({ k: 'play', x, y: 774, w: 178, h: 78, r: 39, color: box })
    ;[0, 1, 2].forEach((i) => out.push({ k: `c${i}`, x: x + 178 + 12 + i * 86, y: 776, w: 74, h: 74, r: 37, color: box }))
    out.push({ k: 'logo', x, y: 652, w: 300, h: 96, r: 8, color: box })
    return out
  }

  const paint = (v) => {
    const it = v.item
    const s = v.settings
    if (m.id !== it.Id) {
      m.id = it.Id
      m.zone = 'actions'
      closeSheet(true)
    }
    m.v = v
    setTokens(v.tokens)
    const kids = isKidsMode(s)
    const left = minimalistLeft(sideNavRoom(s))

    setBackdrop(s.detailsBackdropEnabled !== false && v.backdropUrl ? v.backdropUrl : '')
    setScrim(`#000000${alphaHex(minimalistScrimAlpha(s.backdropBlurDetail))}`)

    const groups = collectionGroups(it, v.collectionItems || [])
    m.groups = groups
    const extras = v.extras || []
    const row = actionRow(v.actionInput, {
      maxVisibleButtons: kids ? KIDS_VISIBLE : VISIBLE, overflowAsMenu: !kids,
      extras: showsExtrasButton(it.Type, extras, kids), collectionItems: groups.length ? collectionLabel(groups) : null,
    })
    page.setBehind(row.behind)

    // The episodes go first, since the rest stands on them.
    const hasEpisodes = showsEpisodes(it.Type)
    const epW = 1920 - 56 - left
    let episodesH = 0
    if (hasEpisodes && episodes) {
      episodesH = episodes.draw({ item: it, settings: s, serverUrl: v.server, seasons: v.lists.seasons, episodes: v.lists.episodes, seriesEpisodes: v.lists.seriesEpisodes, w: epW })
    }
    m.episodesH = episodesH

    // The logo is measured here, since Details' own probe sits in Modern's hidden tree.
    const brand = minimalistBranding(it)
    const lg = v.logoUrl ? m.logos[v.logoUrl] || (m.logos[v.logoUrl] = { w: 0, h: 0, failed: false }) : null
    const logoLive = Boolean(lg && !lg.failed)
    if (logoLive && !lg.w) setLogoProbe(v.logoUrl)
    const logoSize = logoLive ? logoBox(lg.w, lg.h) : null
    // minimalistStillUrl asks for twice the width it's given, which the 1080p canvas never draws.
    const stillUrl = minimalistStillUrl(v.server, it, { settings: s, width: STILL_WIDTH / 2 })
    const laid = layoutMinimalist({
      left, episodesH, logo: logoSize, title: logoLive ? '' : brand.title, episodeName: brand.episodeName, incomplete: Boolean(v.incomplete), still: Boolean(stillUrl),
    })
    setLogo(laid.logo && laid.logo.w ? { ...NONE, ...laid.logo, show: true, src: v.logoUrl } : NONE)
    setTitle(laid.title ? { ...NONE, x: left, y: laid.title.y + cssShift(56), text: brand.title, font: fontFor(brand.title, 'bold'), show: true } : NONE)
    setEpisodeName(
      laid.episodeName ? { ...NONE, x: left, y: laid.episodeName.y + cssShift(34), text: brand.episodeName, font: fontFor(brand.episodeName, 'bold'), show: true } : NONE,
    )
    setIncomplete(laid.incomplete ? { ...NONE, x: left, y: laid.incomplete.y + cssShift(20), text: v.incomplete, font: fontFor(v.incomplete, 'bold'), show: true } : NONE)
    setStill(laid.still ? { ...NONE, ...laid.still, src: stillUrl, show: true } : NONE)
    setAct({ buttons: row.buttons, x: left, y: laid.actionsY, held: !v.settled })
    setEp({ show: episodesH > 0, x: left, y: laid.episodesY })

    // The open sheet takes the next page of a collection's titles as it lands.
    if (m.sheet === 'collection' && sheet) sheet.update(sheetCard('collection'), sheetState())
  }
  const repaint = () => m.v && paint(m.v)
  const onLogo = (dim) => {
    const lg = m.logos[logoProbe()]
    if (!lg || !dim || !dim.w) return
    lg.w = dim.w
    lg.h = dim.h
    repaint()
  }
  const onLogoError = () => {
    const lg = m.logos[logoProbe()]
    if (!lg) return
    lg.failed = true
    repaint()
  }

  const focusZone = (zone) => {
    const z = zone === 'episodes' && !m.episodesH ? 'actions' : zone
    m.zone = z
    const c = { actions, episodes, sheet }[z]
    if (c) c.setFocus()
  }
  // A key that reaches this style's own root means focus landed on it rather than a child, so focus
  // goes back where it was.
  const lost = () => {
    if (activeElement() !== root) return false
    focusZone(m.zone)
    return true
  }
  // What the sheet shows, with its icon as the panel draws one.
  const sheetCard = (kind) => {
    const v = m.v
    const card = kind === 'collection' ? minimalistCollectionCard(v.item, m.groups) : minimalistExtrasCard(v.extras || [])
    return { ...card, icon: `icons/d/${card.icon}.webp` }
  }
  const sheetState = () => ({ serverUrl: m.v.server, seerr: { overlay: {} } })
  const openSheet = (kind) => {
    if (!m.v || !sheet) return
    m.sheet = kind
    sheet.open(sheetCard(kind), sheetState())
    focusZone('sheet')
  }
  const closeSheet = (quiet) => {
    const kind = m.sheet
    m.sheet = null
    if (sheet) sheet.close()
    if (quiet || !kind) return
    if (actions) actions.select(kind === 'collection' ? 'collectionItems' : 'extras')
    focusZone('actions')
  }

  const onAction = (id) => {
    if (id === 'extras') return openSheet('extras')
    if (id === 'collectionItems') return openSheet('collection')
    page.runAction(id)
  }

  // From the sheet. A collection's title opens and an extra plays, a held card opens its menu, and
  // nearing the end of a collection asks for its next page.
  const onModalAction = (kind, data) => {
    if (kind === 'more') {
      if (m.sheet === 'collection') page.loadMoreTitles()
      return
    }
    if (kind === 'hold') return page.onCellLong({ kind: 'sheet', item: data.item })
    if (kind !== 'item') return
    const was = m.sheet
    closeSheet()
    if (was === 'collection') page.open(data)
    else page.playItem(data, false)
  }

  props.ref({ paint, setFocus: () => focusZone(m.zone), skeletonBoxes })

  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      onUp={() => {
        if (lost()) return true
        // Above the buttons there's only a toolbar along the top.
        if (m.zone === 'actions' && !navOnLeft()) focusNav()
        return true
      }}
      onDown={() => {
        if (lost()) return true
        if (m.zone === 'actions' && m.episodesH) focusZone('episodes')
        return true
      }}
      onLeft={() => {
        if (lost()) return true
        if (navOnLeft()) focusNav()
        return true
      }}
      onRight={() => {
        lost()
        return true
      }}
      onEnter={() => {
        lost()
        return true
      }}
    >
      <view width={1920} height={1080} color="#0b0d10ff" />
      <view alpha={backdrop() ? 1 : 0} width={1920} height={1080} src={backdrop() || undefined} textureOptions={COVER} />
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
      <view alpha={logo().show ? 1 : 0} x={logo().x} y={logo().y} width={logo().w} height={logo().h} src={logo().src || undefined} />
      <text
        alpha={title().show ? 1 : 0}
        x={title().x}
        y={title().y}
        fontFamily={title().font}
        fontSize={56}
        lineHeight={58.8}
        letterSpacing={themeSpacing()}
        maxWidth={760}
        maxLines={2}
        color="#ffffffff"
        textShadow={SHADOW}
      >
        {title().text}
      </text>
      <text
        alpha={episodeName().show ? 1 : 0}
        x={episodeName().x}
        y={episodeName().y}
        fontFamily={episodeName().font}
        fontSize={34}
        lineHeight={35.7}
        letterSpacing={themeSpacing()}
        maxWidth={760}
        maxLines={2}
        color="#ffffffff"
        textShadow={SHADOW}
      >
        {episodeName().text}
      </text>
      <text
        alpha={incomplete().show ? 1 : 0}
        x={incomplete().x}
        y={incomplete().y}
        fontFamily={incomplete().font}
        fontSize={20}
        lineHeight={33}
        letterSpacing={themeSpacing()}
        maxWidth={760}
        maxLines={1}
        color="#e0a33cff"
      >
        {incomplete().text}
      </text>
      <view
        alpha={still().show ? 1 : 0}
        x={still().x}
        y={still().y}
        width={still().w}
        height={still().h}
        borderRadius={18}
        src={still().src || undefined}
        textureOptions={COVER}
      />
      <ActionButtons
        ref={(n) => (actions = n)}
        x={act().x}
        y={act().y}
        w={760}
        buttons={act().buttons}
        held={act().held}
        tokens={tokens()}
        onAction={onAction}
        onActionLong={(id) => page.onActionLong(id)}
        onActionFocus={() => (m.zone = 'actions')}
        onActionsEdge={(dir) => dir === 'left' && navOnLeft() && focusNav()}
      />
      <Episodes
        ref={(n) => (episodes = n)}
        x={ep().x}
        y={ep().y}
        alpha={ep().show ? 1 : 0}
        tokens={tokens()}
        onEpisodesEdge={(dir) => dir === 'up' && focusZone('actions')}
        onEpisodesFocus={() => (m.zone = 'episodes')}
        onEpisodesResize={repaint}
        onEpisodeSelect={(e) => page.onCellSelect({ kind: 'episode', item: e })}
        onEpisodeLong={(e) => page.onCellLong({ kind: 'episode', item: e })}
      />
      <SectionModal ref={(n) => (sheet = n)} tokens={tokens()} onModalAction={onModalAction} onModalClose={() => closeSheet()} />
    </view>
  )
}
