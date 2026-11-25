import { For, Show, createMemo, createSignal } from 'solid-js'
import { uiFont, fontFor, textWidth, faceDy, themeSpacing } from '../../text.js'
import { theme, rgba } from '../../theme.js'
import { focusActivePage } from '../../../state/pages.js'
import * as settings from '../../../state/settings.js'
import { getStore } from '../../../state/store.js'
import { router } from '../../../app/router.js'
import { audio } from '../../../state/audioPlayer.js'
import { previewPalette } from '../previews/palette.js'
import { navVisibility, navEntries, openEntry, badgeText } from './navEntries.js'
import { navClock, friendsTicker, fontsReady, userOpacity } from './navKit.js'
import { navBack } from './navBack.js'
import { focusScroll } from './focusScroll.js'
import { atlasPanelKind, atlasLinks, loadAtlasPanel, atlasTiles } from './atlasModel.js'
import NavAvatar from './NavAvatar.jsx'
import AtlasTab from './AtlasTab.jsx'
import AtlasPanel from './AtlasPanel.jsx'
import MiniPlayer from '../music/MiniPlayer.jsx'

// The Atlas bar: the avatar, icon tabs, the clock and a Settings button. Live TV, Seerr, the
// libraries and each library carry a chevron and drop a panel of links, cards and posters.
// Settings' live preview draws it without the music and passes the settings it's trying as
// `preview`, which the buttons, clock, avatar and the bar's fill and line follow.
const GONE = {
  key: '',
  i: -1,
  x: 0,
  w: 0,
  label: '',
  font: 'roboto',
  boldFont: 'roboto',
  icon: '',
  chevron: false,
  current: false,
  badge: '',
}

export default function Atlas(props) {
  const store = getStore()
  const nav = { $store: store, $router: router }
  const friendsTick = friendsTicker()
  const measured = fontsReady()
  const [cur, setCur] = createSignal(1)
  const [open, setOpen] = createSignal(false)
  const [openKey, setOpenKey] = createSignal('')
  const [zone, setZone] = createSignal('bar')
  const [linkCur, setLinkCur] = createSignal(0)
  const [tileCur, setTileCur] = createSignal(0)
  const [panelData, setPanelData] = createSignal(null)
  const [scroll, setScroll] = createSignal(0)
  let mini
  const nodes = {}

  const tried = () => (props.preview && typeof props.preview === 'object' ? props.preview : null)
  const t = createMemo(() => theme())
  const vis = createMemo(() => {
    const v = navVisibility(store, friendsTick(), tried())
    // The preview shows Messages whenever its switch is on, even on a server without any.
    if (props.preview) v.showMessages = (tried() || settings.all()).showServerMessagesButton === true
    return v
  })
  const entries = createMemo(() => navEntries(vis()).filter((e) => e.key !== 'settings'))
  // The focus order along the bar: avatar 0, tabs 1..n, Settings n+1.
  const tabs = createMemo(() => {
    measured()
    const view = props.preview ? 'home' : store.navSection
    let x = 0
    return entries().map((e, i) => {
      const label = e.label || ''
      const chevron = !!atlasPanelKind(e)
      const opened = e.key === openKey()
      const w = Math.round(27 + 30 + 12 + textWidth(label, 22, opened ? 'bold' : 'medium') + (chevron ? 33 : 0) + 27)
      const tab = {
        key: e.key,
        i: i + 1,
        x,
        w,
        label,
        font: fontFor(label, 'medium'),
        boldFont: fontFor(label, 'bold'),
        icon: e.icon,
        chevron,
        current: (!!e.view && e.view === view) || !!e.active,
        badge: e.badge > 0 ? badgeText(e.badge) : '',
      }
      x += w
      return tab
    })
  })
  const tabKeys = createMemo(() => tabs().map((tb) => tb.key))
  const tabsTotal = () => {
    const list = tabs()
    const last = list[list.length - 1]
    return last ? last.x + last.w : 0
  }
  const tabByKey = createMemo(() => {
    const out = {}
    tabs().forEach((tb) => (out[tb.key] = tb))
    return out
  })
  const tab = (k) => tabByKey()[k] || GONE
  const settingsIndex = () => tabs().length + 1
  const openEntryObj = createMemo(() => entries().find((e) => e.key === openKey()) || null)
  const openKind = () => atlasPanelKind(openEntryObj())
  const panelLinks = createMemo(() => {
    const e = openEntryObj()
    return e ? atlasLinks(openKind(), e, store.libraries) : []
  })
  const panelTiles = createMemo(() => {
    const e = openEntryObj()
    return e ? atlasTiles(openKind(), e, panelData(), store.serverUrl) : { tiles: [], titles: [] }
  })
  const clock = navClock(() => vis().showClock, tried)
  const clockX = () => (clock() && measured() ? 1782 - Math.round(textWidth(clock(), 24, 'medium')) : 1806)
  const tabsW = () => (clock() ? clockX() - 30 : 1806 - 24) - 190
  const barFill = () => (tried() ? previewPalette(tried()).navbarSurface : t().navFill)
  const barLine = () => {
    const border = tried() ? previewPalette(tried()).navBorder : t().navBorder
    return border ? border.color : rgba('#ffffff', 0.06)
  }
  const barFocus = () => open() && zone() === 'bar'
  const settingsOn = () => barFocus() && cur() === settingsIndex()

  const keepInView = () => {
    const tb = tabs()[cur() - 1]
    const total = tabsTotal()
    if (total <= tabsW()) return setScroll(0)
    // The avatar and Settings sit outside the tabs, so the tabs keep their scroll.
    if (!tb) return
    setScroll(focusScroll(tb.x, tb.w, scroll(), tabsW(), total - tabsW()))
  }
  const openPanel = (entry, focusFirst) => {
    if (openKey() !== entry.key) {
      setPanelData(null)
      const kind = atlasPanelKind(entry)
      const key = entry.key
      if (kind !== 'libraries') {
        loadAtlasPanel(kind, entry, store.serverUrl).then((data) => {
          if (openKey() === key) setPanelData(data)
        })
      }
    }
    setOpenKey(entry.key)
    if (focusFirst) {
      setZone('links')
      setLinkCur(0)
    }
  }
  const closePanel = () => {
    setOpenKey('')
    setPanelData(null)
    setZone('bar')
  }
  // With the remote an open panel follows focus along the bar, and closes on a tab without one.
  const followFocus = () => {
    keepInView()
    if (!openKey()) return
    const e = entries()[cur() - 1]
    if (e && atlasPanelKind(e)) openPanel(e, false)
    else closePanel()
  }
  const choose = (target) => {
    const at = cur()
    closePanel()
    setCur(at)
    if (target) openEntry(nav, target)
  }
  const panelInput = (key) => {
    const links = panelLinks().length
    const tiles = panelTiles().tiles
    if (zone() === 'links') {
      if (key === 'up') {
        if (linkCur() > 0) setLinkCur(linkCur() - 1)
        else closePanel()
      } else if (key === 'down') {
        if (linkCur() < links - 1) setLinkCur(linkCur() + 1)
      } else if (key === 'right') {
        if (tiles.length) {
          setZone('tiles')
          setTileCur(0)
        }
      } else if (key === 'enter') {
        const link = panelLinks()[linkCur()]
        choose(link && link.target)
      }
      return true
    }
    if (key === 'up') closePanel()
    else if (key === 'left') {
      if (tileCur() > 0) setTileCur(tileCur() - 1)
      else setZone('links')
    } else if (key === 'right') {
      if (tileCur() < tiles.length - 1) setTileCur(tileCur() + 1)
    } else if (key === 'enter') {
      const tile = tiles[tileCur()]
      if (!tile) return true
      if (tile.library) {
        choose({ library: tile.library })
        return true
      }
      const item = tile.item
      const kind = openKind()
      const at = cur()
      closePanel()
      setCur(at)
      if (tile.seerr) {
        const libraryId = item.mediaInfo && (item.mediaInfo.jellyfinMediaId || item.mediaInfo.mediaId)
        router.to(libraryId ? `/details/${libraryId}` : `/seerr/item/${item.mediaType || item.media_type || 'movie'}/${item.id}`)
      } else if (kind === 'livetv' || item.Type === 'Recording') {
        router.to(`/player/${item.Id}`)
      } else {
        router.to(`/details/${item.Id}`)
      }
    }
    return true
  }
  const onFocusChanged = (has) => {
    if (has) {
      // The bar always enters on Home.
      setCur(1)
      setZone('bar')
      setOpen(true)
      keepInView()
    } else {
      setOpen(false)
      closePanel()
    }
  }
  const left = () => {
    if (zone() !== 'bar') return panelInput('left')
    if (cur() > 0) {
      setCur(cur() - 1)
      followFocus()
    }
    return true
  }
  const right = () => {
    if (zone() !== 'bar') return panelInput('right')
    if (cur() < settingsIndex()) {
      setCur(cur() + 1)
      followFocus()
    }
    return true
  }
  const up = () => (zone() !== 'bar' ? panelInput('up') : true)
  const down = () => {
    if (zone() !== 'bar') return panelInput('down')
    const e = entries()[cur() - 1]
    if (e && atlasPanelKind(e)) {
      openPanel(e, true)
      return true
    }
    closePanel()
    // Music playing behind the screens puts its pill between the bar and the page. The pill sits
    // inside the bar, so the bar doesn't hear its own focus leave and closes itself.
    if (audio.active && mini) {
      setOpen(false)
      mini.focusPill()
      return true
    }
    focusActivePage()
    return true
  }
  const enter = () => {
    if (zone() !== 'bar') return panelInput('enter')
    if (cur() === 0) {
      openEntry(nav, { action: 'account' })
      return true
    }
    if (cur() === settingsIndex()) {
      openEntry(
        nav,
        navEntries(vis()).find((e) => e.key === 'settings'),
      )
      return true
    }
    const e = entries()[cur() - 1]
    if (!e) return true
    // The grouped libraries have no page of their own, so the tab opens its list.
    if (e.key === 'libraries') {
      openPanel(e, true)
      return true
    }
    closePanel()
    openEntry(nav, e)
    return true
  }
  const back = () => {
    if (openKey()) closePanel()
    else navBack(nav)
    return true
  }
  // What the seasonal follower lands under: the focused tab, the avatar or Settings.
  const focusTarget = () => (cur() === 0 ? nodes.user : cur() === settingsIndex() ? nodes.settings : nodes[(tabs()[cur() - 1] || {}).key])

  return (
    <view
      ref={props.ref}
      width={1920}
      height={96}
      alpha={props.hidden && !openKey() ? 0 : 1}
      transition={{ alpha: { duration: 250 } }}
      seasonalZone="nav"
      focusTarget={focusTarget}
      onFocusChanged={onFocusChanged}
      onLeft={left}
      onRight={right}
      onUp={up}
      onDown={down}
      onEnter={enter}
      onBack={back}
    >
      <view>
        <Show when={openEntryObj()}>
          <AtlasPanel
            title={openEntryObj() ? openEntryObj().label : ''}
            links={panelLinks()}
            tiles={panelTiles().tiles}
            titles={panelTiles().titles}
            zone={zone()}
            cur={tileCur()}
            linkCur={linkCur()}
          />
        </Show>
      </view>
      <view width={1920} height={96} color={barFill()} />
      <view y={95} width={1920} height={1} color={barLine()} />
      <NavAvatar ref={(n) => (nodes.user = n)} x={74} y={12} focused={barFocus() && cur() === 0} opacity={userOpacity(tried())} />
      <view x={190} width={tabsW()} height={96} clipping>
        <view x={-scroll()} width={tabsTotal()} height={96}>
          <For each={tabKeys()}>
            {(k) => (
              <AtlasTab
                ref={(n) => (nodes[k] = n)}
                x={tab(k).x}
                tab={tab(k)}
                w={tab(k).w}
                focused={barFocus() && cur() === tab(k).i}
                opened={k === openKey()}
              />
            )}
          </For>
        </view>
      </view>
      <text
        letterSpacing={themeSpacing()}
        fontFamily={uiFont('medium')}
        fontSize={24}
        x={clockX()}
        y={33 + faceDy(24)}
        lineHeight={33}
        color="#ffffffd9"
      >
        {clock()}
      </text>
      <view ref={(n) => (nodes.settings = n)} x={1806} y={21} width={54} height={54}>
        <view width={54} height={54} borderRadius={27} color="#ffffffff" alpha={settingsOn() ? 1 : 0} />
        <view x={9} y={9} width={36} height={36} src="icons/nav_settings.webp" color={settingsOn() ? '#101010ff' : '#ffffffcc'} />
      </view>
      <view alpha={openKey() ? 0 : 1}>
        <Show when={!props.preview}>
          <MiniPlayer ref={(m) => (mini = m)} barBottom={96} surface={t().navFill} ink="#ffffffff" />
        </Show>
      </view>
    </view>
  )
}
