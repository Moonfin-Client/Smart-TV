import { For, Match, Show, Switch, createMemo, createSignal } from 'solid-js'
import { cssShift, fontFor, textWidth, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import { formatClockTime } from '../../../utils/clock.js'
import { homeBackdropStyle } from '../../../utils/homeBackdropStyle.js'
import { isKidsMode } from '../../../utils/kidsMode.js'
import { isLiveTvLibrary, librariesForNav } from '../../../utils/liveTvLibrary.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import { seerrState } from '../../../state/seerr.js'
import { getStore } from '../../../state/store.js'
import { legacy } from '../../tier.js'
import { userImageUrl } from '../../images.js'
import { navEntries } from '../nav/navEntries.js'
import Tabline from '../nav/Tabline.jsx'
import Atlas from '../nav/Atlas.jsx'
import Reel from '../nav/Reel.jsx'
import Mosaic from '../nav/Mosaic.jsx'
import RatingsRow from '../home/RatingsRow.jsx'
import BackdropLayer from '../shell/BackdropLayer.jsx'
import SeasonalTheme from '../shell/SeasonalTheme.jsx'
import { CAROUSEL_PANEL_SCRIM } from '../home/modernCardLayout.js'
import { keyed } from '../library/pageKit.js'
import { previewPalette } from './palette.js'
import { gradientUrl } from './mediaBarKit.js'
import { SAMPLE_RATINGS, ratedSample } from './sampleRatings.js'
import { rowsColumn, peekRow, navbarFallback, homeRowsFallback } from './homeLayout.js'
import { COVER, borderOf, coverAt, lineCount } from './kit.js'

// The Home previews on the 960 by 540 design screen, by [pick].kind:
// - home: the navbar where it's set over the rows, with the backdrop Home would draw. [pick]
//   carries railOpen, focusCard and atUiScale, and [homeRows] Home's own rows.
// - navbar: the wizard's navbar at pick.position.
// - rows: the rows screen with pick.modern, focusFirst and carousel (left out it follows Row Type).
//   pick.ground draws the screen's background, which a media bar laying rows over itself doesn't.
// - peek: Home's first row (pick.row) from pick.top down.
// - navOnly: the navbar alone, for one of the app's own screens drawn under it.
// The classic bar and rail are drawn here, and Tabline, Atlas, Reel and Mosaic are the real nav
// components at the TV's size scaled by half, handed the settings being tried through their
// preview prop.
// shortcut: Home's own rows don't wear their poster labels, the real nav styles keep the TV's width
// under a UI scale being tried, and the seasonal effect draws without its follower on the held card.
// Lay the navs out at a given width and add a preview target to the follower.
const BAND_H = 27 + 95 + 27
const BAND_MID = BAND_H / 2
const RAIL_W = 72
const NONE = '#00000000'
const PANEL_ART = coverAt(0.5, 0.62)
const PANEL_ON_BORDER = { width: 1, color: hex('#ffffff14') }
const PANEL_OFF_BORDER = { width: 1, color: hex('#ffffff1f') }
const PILL_BORDER = { width: 1, color: hex('#ffffff59') }


// The buttons the real navbar or the rail draws for [s], as navEntries. Messages shows whenever its
// switch is on, even on a server without any.
const previewEntries = (s, store, rail, hasLiveTv) => {
  const kids = isKidsMode(s)
  const seerr = seerrState()
  const libraries = store.libraries || null
  const showLiveTv = !kids && s.showLiveTvButton !== false && hasLiveTv
  const navLibraries = libraries ? librariesForNav(libraries, showLiveTv, { hideLiveTv: kids }) : []
  return navEntries(
    {
      showShuffle: s.showShuffleButton !== false,
      showGenres: s.showGenresButton !== false,
      showFavorites: s.showFavoritesButton !== false,
      showLiveTv,
      showSeerr: !kids && !!seerr.enabled && s.showSeerrButton !== false,
      showCalendar: !kids && s.showCalendarButton !== false && !!(seerr.pluginInfo && seerr.pluginInfo.calendarAvailable === true),
      showSyncPlay: !kids && s.syncplayEnabled !== false && s.showSyncPlayButton !== false,
      navLibraries,
      showLibraries: !kids && s.showLibrariesInToolbar !== false && (!libraries || navLibraries.length > 0),
      showMessages: s.showServerMessagesButton === true,
      showFriends: false,
      librariesIndividually: s.showLibrariesIndividually === true && !!libraries,
      seerrLabel: seerr.displayName || store.seerrName || 'Seerr',
    },
    { side: rail },
  )
}

// One rated sample per item and layout key, so a new layout hands each ratings row the object it
// already has, tagged with the key its height comes back under. `next` keeps the ones this layout
// uses, so the samples of layouts gone by aren't held.
const rated = (cache, next, item, key) => {
  const id = key + ':' + (item.id || item.title) + ':' + item.communityRating
  next[id] = cache[id] || { ...ratedSample(item), _key: key }
  return next[id]
}

const EMPTY = { cards: [], rings: [], bars: [], badges: [], texts: [], chips: [], ratings: [], panels: [], pills: [], band: null }
const byK = (x) => x.k

export default function HomePreview(props) {
  const store = getStore()
  const [rhTick, setRhTick] = createSignal(0)
  const heights = {}
  const semi = uiFont('bold')
  const regular = uiFont()
  const t = createMemo(() => previewPalette(props.s))
  const p = () => props.pick || {}
  const kind = () => p().kind || 'home'
  const list = () => props.items || []
  const rows = () => (kind() === 'home' && props.homeRows && props.homeRows.length ? props.homeRows : null)
  const live = () => list().length > 0 || !!rows()
  const hasNav = () => kind() === 'home' || kind() === 'navbar' || kind() === 'navOnly'
  const left = () => (hasNav() ? (kind() === 'navbar' ? p().position === 'left' : props.s.navbarPosition === 'left') : false)
  const zoom = () => (kind() === 'home' && p().atUiScale ? Number(props.s.uiScale) || 1 : 1)
  const screenW = () => 960 / zoom()
  const screenH = () => 540 / zoom()
  const ground = () => live() && (kind() === 'home' || kind() === 'navbar' || (kind() === 'rows' && !!p().ground))
  const modern = () => {
    if (kind() === 'navbar') return true
    if (kind() === 'rows') return p().modern !== false
    return props.s.homeRowsStyle !== 'v1'
  }
  const focusFirst = () => {
    if (kind() === 'home') return modern() || !!rows() || !!p().focusCard
    if (kind() === 'rows') return !!p().focusFirst
    return false
  }
  const liveTv = () => (kind() === 'navbar' ? false : (store.libraries || []).some(isLiveTvLibrary))
  // The bar or sidebar style when one is picked, or '' for the classic bar or rail.
  const styled = () => {
    if (!hasNav()) return ''
    const style = left() ? props.s.sidebarStyle : props.s.topNavbarStyle
    return (left() ? ['reel', 'mosaic'] : ['tabline', 'atlas']).indexOf(style) >= 0 ? style : ''
  }
  const entries = createMemo(() => {
    if (!hasNav() || styled()) return []
    const pal = t()
    return previewEntries(props.s, store, left(), liveTv()).map((e, i) => ({ k: e.key, icon: e.icon, label: e.label, color: pal.navColorForSlot(i) || pal.onSurfaceA(0.6) }))
  })
  const clock = () => (props.s.showClock === false ? '' : formatClockTime(new Date(), props.s.clockDisplay))
  const avatar = () => {
    const u = store.user
    return u && u.PrimaryImageTag ? userImageUrl(getServerUrl(), u.Id, u.PrimaryImageTag) : ''
  }
  const initial = () => {
    const u = store.user
    return u && u.Name ? u.Name.charAt(0).toUpperCase() : '?'
  }
  // The top bar's avatar, pill and clock, all floating over the content.
  const topBar = createMemo(() => {
    const on = live() && hasNav() && !left() && !styled()
    if (!on) return { on: false, pillW: 0, pillX: 0, buttons: [], clock: '' }
    const expanded = !!props.s.navbarAlwaysExpanded
    let x = 0
    const buttons = entries().map((e, i) => {
      const labelW = expanded ? textWidth(e.label, 11, 'bold') : 0
      const w = expanded ? Math.max(35, 24 + 18 + 5 + labelW) : 35
      if (i > 0) x += 1
      const ix = x + (w - (18 + (expanded ? 5 + labelW : 0))) / 2
      const out = { ...e, x: ix, label: expanded ? e.label : '', labelX: ix + 23 }
      x += w
      return out
    })
    const pillW = Math.min(700, x)
    return { on, pillW, pillX: (screenW() - pillW) / 2, buttons, clock: clock() }
  })
  // The rail: the user at the top, the clock's room at the bottom, the buttons centered between,
  // and a list too long for that room running off its foot.
  const rail = createMemo(() => {
    const on = live() && left() && !styled()
    const open = !!p().railOpen && kind() === 'home'
    if (!on) return { on: false, open: false, buttons: [], w: 0, listY: 0, listH: 0, clockX: 0, clockY: 0, clock: '', bg: '' }
    const top = 12 + 26 + 6
    const clockH = clock() ? 8 + 33 + 10 : 0
    const listH = Math.max(0, screenH() - top - clockH)
    const y0 = Math.max(0, (listH - entries().length * 40) / 2)
    const w = open ? 240 : RAIL_W
    const buttons = entries().map((e, i) => ({ ...e, y: y0 + i * 40, label: open ? e.label : '' }))
    const bg = open ? gradientUrl({ w: 240, h: Math.round(screenH()), angle: 90, stops: [[t().navbarRail, 0], [t().navbarRail, 0.94], ['#00000000', 1]] }) : ''
    return { on, open, buttons, w, listY: top, listH, clockX: w / 2, clockY: screenH() - 43 + cssShift(9), clock: clock(), bg }
  })
  // Where the rows column starts, and the band it's clipped to.
  const column = createMemo(() => {
    const k = kind()
    if (k === 'peek') return { x: 0, y: p().top || 0, clipY: p().top || 0, w: screenW() }
    if (k === 'rows') return { x: 0, y: 0, clipY: 0, w: screenW() }
    if (left()) return { x: RAIL_W, y: 24, clipY: 0, w: screenW() - RAIL_W }
    // Carousel rows come up into the band's empty lower part to sit under the pill.
    const carousel = rows() ? !!rows()[0].carousel : props.s.homeRowsStyle === 'carousel'
    const top = BAND_H - (carousel ? 75 : 0)
    return { x: 0, y: top + 12, clipY: top, w: screenW() }
  })
  const lay = createMemo(() => {
    const k = kind()
    if (!live() || k === 'navOnly') return EMPTY
    rhTick()
    const ratingsH = (key) => heights[key] || 0
    const lines = (text, size, weight, maxW) => lineCount(text, size, weight, maxW)
    const base = { s: props.s, t: t(), items: list(), colW: column().w, screenW: screenW(), ratingsH, lines }
    if (k === 'peek') {
      const row = p().row || {}
      return peekRow({ ...base, row: { ...row, items: row.items && row.items.length ? row.items : null }, modern: props.s.homeRowsStyle !== 'v1' })
    }
    return rowsColumn({ ...base, rows: rows(), modern: modern(), focusFirst: focusFirst(), carousel: k === 'rows' ? p().carousel : undefined })
  })
  const cards = keyed(() => lay().cards, byK)
  const rings = keyed(() => lay().rings, byK)
  const bars = keyed(() => lay().bars, byK)
  const badges = keyed(() => lay().badges, byK)
  const texts = keyed(() => lay().texts, byK)
  const chips = keyed(() => lay().chips, byK)
  const pills = keyed(() => lay().pills, byK)
  const panels = keyed(() => lay().panels, byK)
  const bandBox = () => lay().band || { x: 0, y: 0, w: 0, h: 0 }
  const bandTexts = keyed(() => {
    const b = lay().band
    return b ? b.texts.map((x) => ({ ...x, x: x.x - b.x, y: x.y - b.y })) : []
  }, byK)
  const bandChips = keyed(() => {
    const b = lay().band
    return b ? b.chips.map((c) => ({ ...c, x: c.x - b.x, y: c.y - b.y })) : []
  }, byK)
  const plugin = () => isMdblistEnabled(props.s, 'homeRows')
  // The ratings rows, each tagged with its slot so its size comes back to the right place. A new
  // item mounts a new row, since one handed an item with fewer chips kept the old ones up.
  let ratedCache = {}
  const ratings = keyed(() => {
    const all = lay().ratings.concat(lay().band ? lay().band.ratings : [])
    const next = {}
    const out = all.map((r) => ({ ...r, rated: rated(ratedCache, next, r.item, r.k), rk: r.k + '|' + (r.item.id || r.item.title) }))
    ratedCache = next
    return out
  }, (r) => r.rk)
  const onRatingsLayout = (key, box) => {
    const h = box && !box.empty ? box.h : 0
    if (Math.abs((heights[key] || 0) - h) < 0.01) return
    heights[key] = h
    setRhTick(rhTick() + 1)
  }
  const backdrop = createMemo(() => {
    if (kind() !== 'home' || !live()) return { url: '', placement: 'off' }
    const placement = homeBackdropStyle(props.s)
    // Home only gets a backdrop from Classic rows or the Aya bar, and an older TV never draws one.
    const fed = (!modern() || props.s.featuredBarStyle === 'aya') && !legacy
    if (placement === 'off' || !fed) return { url: '', placement }
    const first = rows() && rows()[0].items[0]
    return { url: (first && first.backdropUrl) || (list()[0] && list()[0].backdropUrl) || '', placement }
  })
  // The drawn stand-ins while the sample items load, on the 320 by 200 box.
  const fallback = createMemo(() => {
    if (live()) return []
    const k = kind()
    if (k === 'home' || k === 'navbar') return navbarFallback(left() ? 'left' : 'top', t())
    if (k === 'rows' && p().ground) return homeRowsFallback(modern(), t())
    return []
  })
  const navMounted = (name) => live() && styled() === name
  const text = (tx) => (
    <text
      fontFamily={fontFor(tx().text, tx().weight)}
      fontSize={tx().size}
      lineHeight={tx().lh}
      x={tx().x}
      y={tx().y}
      maxWidth={tx().maxw || 0}
      maxLines={tx().lines}
      color={tx().color}
    >
      {tx().text}
    </text>
  )
  return (
    <view width={960} height={540}>
      <view x={48} scale={2.7} pivot={0} width={320} height={200}>
        <For each={fallback()}>{(b) => <view x={b.x} y={b.y} width={b.w} height={b.h} borderRadius={b.r} color={b.c} />}</For>
      </view>
      <view>
        <Show when={ground()}>
          <view width={960} height={540} color={t().background} />
        </Show>
      </view>
      <view>
        <Show when={backdrop().url}>
          <view scale={0.5} pivot={0} width={1920} height={1080}>
            <BackdropLayer url={backdrop().url} placement={backdrop().placement} blur={props.s.backdropBlurHome} bg={t().background} scrim={t().scrim} instant />
          </view>
        </Show>
      </view>
      <view scale={zoom()} pivot={0} width={screenW()} height={screenH()}>
        <view x={column().x} y={column().clipY} width={column().w} height={screenH() - column().clipY} clipping>
          <view y={column().y - column().clipY} width={column().w} height={screenH()}>
            <view>
              <For each={panels.keys()}>
                {(k) => {
                  const pn = panels.item(k)
                  return (
                    <view x={pn().x} y={pn().y} width={pn().w} height={pn().h} borderRadius={14} color={pn().on ? '#101218ff' : '#ffffff0f'}>
                      <view
                        alpha={pn().on ? 1 : 0}
                        x={pn().w * 0.3}
                        width={pn().w * 0.7}
                        height={pn().h}
                        src={pn().backdrop}
                        color={pn().backdrop ? '#ffffffff' : NONE}
                        textureOptions={PANEL_ART}
                        borderRadius={[0, 14, 14, 0]}
                      />
                      <view alpha={pn().on ? 1 : 0} width={pn().w} height={pn().h} src={scrimSrc(CAROUSEL_PANEL_SCRIM)} color="#ffffffff" borderRadius={14} />
                      <view width={pn().w} height={pn().h} borderRadius={14} color={NONE} border={pn().on ? PANEL_ON_BORDER : PANEL_OFF_BORDER} />
                    </view>
                  )
                }}
              </For>
            </view>
            <view>
              <For each={cards.keys()}>
                {(k) => {
                  const c = cards.item(k)
                  return (
                    <view
                      x={c().x}
                      y={c().y}
                      width={c().w}
                      height={c().h}
                      src={c().src}
                      textureOptions={COVER}
                      borderRadius={t().cardRadius}
                      color={c().src ? '#ffffffff' : t().onSurfaceA(0.1)}
                      scale={c().scale}
                      pivotX={0.5}
                      pivotY={c().pivotY}
                    />
                  )
                }}
              </For>
            </view>
            <view>
              <For each={bars.keys()}>
                {(k) => {
                  const b = bars.item(k)
                  return (
                    <view x={b().x} y={b().y} width={b().w} height={6} borderRadius={3} color={b().rest}>
                      <view width={b().fill} height={6} borderRadius={[3, 0, 0, 3]} color={b().fillColor} />
                    </view>
                  )
                }}
              </For>
            </view>
            <view>
              <For each={badges.keys()}>
                {(k) => {
                  const bd = badges.item(k)
                  return (
                    <view x={bd().x} y={bd().y} width={bd().w} height={bd().h} borderRadius={bd().h / 2} color={t().badgeWatched} border={{ width: 1, color: hex(t().onBadge) }}>
                      <view alpha={bd().check ? 1 : 0} x={1.5} y={1.5} width={9} height={9} src="icons/preview/check.webp" color={t().onBadge} />
                      <text fontFamily={semi} fontSize={9} lineHeight={12} x={5} y={1} color={t().onBadge}>
                        {bd().text}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
            <view>
              <For each={rings.keys()}>
                {(k) => {
                  const r = rings.item(k)
                  return <view x={r().x} y={r().y} width={r().w} height={r().h} borderRadius={t().cardRadiusRing} color={NONE} border={{ width: 3, color: hex(t().focusBorderColor) }} />
                }}
              </For>
            </view>
            <view>
              <For each={chips.keys()}>
                {(k) => {
                  const ch = chips.item(k)
                  return <view x={ch().x} y={ch().y} width={ch().w} height={ch().h} borderRadius={3} color={NONE} border={borderOf(t().chipBorder)} />
                }}
              </For>
            </view>
            <view>
              <For each={texts.keys()}>{(k) => text(texts.item(k))}</For>
            </view>
            <view>
              <For each={pills.keys()}>
                {(k) => {
                  const pl = pills.item(k)
                  return (
                    <view x={pl().x} y={pl().y} width={pl().w} height={pl().h} borderRadius={3} color="#ffffff14" border={PILL_BORDER}>
                      <text fontFamily={semi} fontSize={8} lineHeight={10.4} x={5} y={1.5} letterSpacing={0.32} color={t().onSurface}>
                        {pl().label}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
            <view x={bandBox().x} y={bandBox().y} width={bandBox().w} height={bandBox().h} clipping>
              <view>
                <For each={bandChips.keys()}>
                  {(k) => {
                    const ch = bandChips.item(k)
                    return <view x={ch().x} y={ch().y} width={ch().w} height={ch().h} borderRadius={3} color={NONE} border={borderOf(t().chipBorder)} />
                  }}
                </For>
              </view>
              <view>
                <For each={bandTexts.keys()}>{(k) => text(bandTexts.item(k))}</For>
              </view>
            </view>
            <view>
              <For each={ratings.keys()}>
                {(k) => {
                  const r = ratings.item(k)
                  return (
                    <RatingsRow
                      x={r().x}
                      y={r().y}
                      item={r().rated}
                      surface="homeRows"
                      compact={r().compact}
                      singleLineWidth={r().single ? 1 : 0}
                      inline={r().inline}
                      sampleRatings={SAMPLE_RATINGS}
                      pluginEnabled={plugin()}
                      zoom={r().zoom}
                      maxW={r().maxW}
                      prefs={props.s}
                      onLayout={(box) => onRatingsLayout(r().rated._key, box)}
                    />
                  )
                }}
              </For>
            </view>
          </view>
        </view>

        <view alpha={rail().open ? 1 : 0} width={rail().w || 1} height={screenH()} src={rail().bg} color={rail().bg ? '#ffffffff' : NONE} />
        <view alpha={rail().on ? 1 : 0}>
          <view alpha={avatar() ? 0.85 : 0} x={23} y={12} width={26} height={26} borderRadius={13} src={avatar()} color={avatar() ? '#ffffffff' : NONE} textureOptions={COVER} />
          <view alpha={avatar() ? 0 : 1} x={23} y={12} width={26} height={26} borderRadius={13} color="#ffffff1a">
            <text fontFamily={semi} fontSize={10.4} x={13} mountX={0.5} y={7.8} color="#ffffffff">
              {initial()}
            </text>
          </view>
          <view y={rail().listY} width={240} height={rail().listH || 1} clipping>
            <For each={rail().buttons}>
              {(rb) => (
                <view x={24} y={rb.y} width={200} height={40}>
                  <view y={8} width={24} height={24} src={rb.icon} color={rb.color} />
                  <text fontFamily={fontFor(rb.label, 'bold')} fontSize={14} lineHeight={33} x={38} y={5} maxWidth={178} maxLines={1} color={t().onSurfaceA(0.8)}>
                    {rb.label}
                  </text>
                </view>
              )}
            </For>
          </view>
          <text fontFamily={regular} fontSize={9} lineHeight={33} x={rail().clockX} mountX={0.5} y={rail().clockY} color="#ffffff80" alpha={rail().open ? 1 : 0}>
            {rail().clock}
          </text>
        </view>

        <view alpha={topBar().on ? 1 : 0}>
          <view alpha={avatar() ? 0.85 : 0} x={24} y={BAND_MID - 16} width={32} height={32} borderRadius={16} src={avatar()} color={avatar() ? '#ffffffff' : NONE} textureOptions={COVER} />
          <view alpha={avatar() ? 0 : 1} x={24} y={BAND_MID - 16} width={32} height={32} borderRadius={16} color="#ffffff1a">
            <text fontFamily={semi} fontSize={12.8} x={16} mountX={0.5} y={9.6} color="#ffffffff">
              {initial()}
            </text>
          </view>
          <view x={topBar().pillX} y={BAND_MID - 17.5} width={topBar().pillW || 1} height={35} borderRadius={17.5} color={t().navbarSurface} clipping>
            <view>
              <For each={topBar().buttons}>{(pb) => <view x={pb.x} y={8.5} width={18} height={18} src={pb.icon} color={pb.color} />}</For>
            </view>
            <view>
              <For each={topBar().buttons}>
                {(pl) => (
                  <text fontFamily={fontFor(pl.label, 'bold')} fontSize={11} lineHeight={33} x={pl.labelX} y={2.5} color={t().onSurfaceA(0.8)}>
                    {pl.label}
                  </text>
                )}
              </For>
            </view>
          </view>
          <text fontFamily={semi} fontSize={14} lineHeight={33} x={screenW() - 24} mountX={1} y={BAND_MID - 15} color={t().onSurfaceA(0.8)}>
            {topBar().clock}
          </text>
        </view>

        <view scale={0.5} pivot={0} width={1920} height={1080}>
          <view>
            <Show when={kind() === 'home' && live() && !!p().seasonal}>
              <SeasonalTheme layer="particles" on prefs={props.s} />
            </Show>
          </view>
          <view>
            <Switch>
              <Match when={navMounted('tabline')}>
                <Tabline preview={props.s} />
              </Match>
              <Match when={navMounted('atlas')}>
                <Atlas preview={props.s} />
              </Match>
              <Match when={navMounted('reel')}>
                <Reel preview={props.s} />
              </Match>
              <Match when={navMounted('mosaic')}>
                <Mosaic preview={props.s} />
              </Match>
            </Switch>
          </view>
        </view>
      </view>
    </view>
  )
}
