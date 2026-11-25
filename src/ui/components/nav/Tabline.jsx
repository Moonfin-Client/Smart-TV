import { For, Show, createMemo, createSelector, createSignal, onCleanup } from 'solid-js'
import { uiFont, fontFor, textWidth, faceDy, themeSpacing } from '../../text.js'
import { theme } from '../../theme.js'
import { highMs } from '../../tier.js'
import { focusActivePage } from '../../../state/pages.js'
import * as settings from '../../../state/settings.js'
import { getStore } from '../../../state/store.js'
import { router } from '../../../app/router.js'
import { audio } from '../../../state/audioPlayer.js'
import { previewPalette } from '../previews/palette.js'
import { navVisibility, navEntries, openEntry, badgeText } from './navEntries.js'
import { navClock, friendsTicker, fontsReady, sameFields, userOpacity } from './navKit.js'
import { navBack } from './navBack.js'
import { focusScroll } from './focusScroll.js'
import NavAvatar from './NavAvatar.jsx'
import TablineTab from './TablineTab.jsx'
import MiniPlayer from '../music/MiniPlayer.jsx'

// The Tabline bar: text tabs along the top over a dark scrim, the current page underlined in the
// accent, then Search, the clock and the avatar at the right. Settings' live preview draws it
// without the music and passes the settings it's trying as `preview`, which the buttons, clock,
// avatar and the current tab's line follow.
const LIST_MAX = 800
const GONE = {
  key: '',
  kind: 'tab',
  label: '',
  font: 'roboto',
  boldFont: 'roboto',
  current: false,
  toggle: false,
  badge: '',
  x: 0,
  w: 0,
  i: -1,
}

export default function Tabline(props) {
  const store = getStore()
  const nav = { $store: store, $router: router }
  const friendsTick = friendsTicker()
  const measured = fontsReady()
  const [cur, setCur] = createSignal(0)
  const [open, setOpen] = createSignal(false)
  const [libsOpen, setLibsOpen] = createSignal(false)
  const [scroll, setScroll] = createSignal(0)
  const fx = highMs(150)
  const timers = []
  const later = (fn, ms) => timers.push(setTimeout(fn, ms))
  onCleanup(() => timers.forEach(clearTimeout))
  let mini
  const nodes = {}

  const tried = () => (props.preview && typeof props.preview === 'object' ? props.preview : null)
  const lineAccent = () => (tried() ? previewPalette(tried()).accent : '')
  const vis = createMemo(() => {
    const v = navVisibility(store, friendsTick(), tried())
    // The preview shows Messages whenever its switch is on, even on a server without any.
    if (props.preview) v.showMessages = (tried() || settings.all()).showServerMessagesButton === true
    return v
  })
  const entries = createMemo(() => navEntries(vis()).filter((e) => e.key !== 'search'))
  // The tabs in focus order, the open libraries after their tab, each measured in both weights it's
  // drawn in.
  const tabs = createMemo(() => {
    measured()
    const view = props.preview ? 'home' : store.navSection
    const out = []
    entries().forEach((e) => {
      const label = e.label || ''
      out.push({
        key: e.key,
        kind: 'tab',
        label,
        font: fontFor(label, 'medium'),
        boldFont: fontFor(label, 'bold'),
        current: (!!e.view && e.view === view) || !!e.active,
        toggle: !!e.libraries,
        badge: e.badge > 0 ? badgeText(e.badge) : '',
        wMedium: Math.round(textWidth(label, 24, 'medium')),
        wBold: Math.round(textWidth(label, 24, 'bold')),
      })
      if (e.libraries && libsOpen()) {
        e.libraries.forEach((lib) => {
          out.push({
            key: 'lib:' + lib.key,
            kind: 'lib',
            label: lib.label,
            font: fontFor(lib.label, 'medium'),
            boldFont: fontFor(lib.label, 'bold'),
            current: lib.view === view,
            toggle: false,
            badge: '',
            wMedium: Math.round(textWidth(lib.label, 24, 'medium')),
            wBold: Math.round(textWidth(lib.label, 24, 'bold')),
          })
        })
      }
    })
    return out
  })
  const tabEntries = createMemo(() => {
    const out = []
    entries().forEach((e) => {
      out.push(e)
      if (e.libraries && libsOpen()) e.libraries.forEach((lib) => out.push(lib))
    })
    return out
  })
  // A tab is as wide as its label in the weight it's drawn in: bold when current or focused, medium
  // otherwise.
  const placed = createMemo(() => {
    const on = open() ? cur() : -1
    let x = 12
    let listStart = -1
    return tabs().map((tab, i) => {
      const w = on === i || tab.current ? tab.wBold : tab.wMedium
      if (i > 0) x += 45
      if (tab.kind === 'lib' && listStart < 0) listStart = x
      const at = { ...tab, i, x, w, hiddenLib: tab.kind === 'lib' && x + w - listStart > LIST_MAX }
      x += w
      return at
    })
  })
  const tabKeys = createMemo(() => tabs().map((p) => p.key))
  const tabByKey = createMemo(() => {
    const out = {}
    placed().forEach((p) => (out[p.key] = p))
    return out
  })
  const tab = (k) => tabByKey()[k] || GONE
  const tabsEnd = () => {
    const list = placed()
    const last = list[list.length - 1]
    return last ? last.x + last.w + 12 : 0
  }
  const searchIndex = () => tabs().length
  const userIndex = () => tabs().length + 1
  const clock = navClock(() => vis().showClock, tried)
  const clockW = () => (clock() && measured() ? Math.round(textWidth(clock(), 24, 'medium')) : 0)
  // The right group lays out from the row's right edge: avatar, clock, search, 33px apart.
  const searchX = () => 1824 - 100 - 33 - (clock() ? clockW() + 33 : 0) - 54
  const tabsW = () => searchX() - 60 - 96
  const isOn = createSelector(() => (open() ? cur() : null))
  const searchOn = () => isOn(searchIndex())

  const keepInView = () => {
    const p = placed()[cur()]
    const w = tabsW()
    if (tabsEnd() <= w) return setScroll(0)
    // Search and the avatar sit outside the tabs, so the tabs keep their scroll.
    if (!p) return
    setScroll(focusScroll(p.x, p.w, scroll(), w, tabsEnd() - w))
  }
  const inLibs = (i) => {
    const it = tabs()[i]
    return !!it && (it.kind === 'lib' || it.toggle)
  }
  const closeLibs = () => {
    if (!libsOpen()) return
    const total = tabs().length
    const past = cur() >= total ? cur() - total : -1
    const onTab = tabs()[cur()]
    const key = onTab && onTab.key
    setLibsOpen(false)
    if (past >= 0) setCur(tabs().length + past)
    else {
      const i = tabs().findIndex((x) => x.key === key)
      setCur(i >= 0 ? i : tabs().findIndex((x) => x.toggle))
    }
    keepInView()
  }
  // The open list closes a beat after focus leaves the libraries.
  const afterMove = () => {
    keepInView()
    if (!libsOpen() || inLibs(cur())) return
    later(() => {
      if (libsOpen() && !inLibs(cur())) closeLibs()
    }, 100)
  }
  const onFocusChanged = (has) => {
    if (has) {
      // The bar always enters on Home.
      setCur(0)
      setOpen(true)
      keepInView()
    } else {
      setOpen(false)
      closeLibs()
    }
  }
  const left = () => {
    const it = tabs()[cur()]
    if (cur() > 0) setCur(cur() - 1)
    // Left from the libraries tab goes to what sits before it, never into its own list.
    if (it && it.toggle && tabs()[cur()] && tabs()[cur()].kind === 'lib') setCur(cur() - 1)
    afterMove()
    return true
  }
  const right = () => {
    if (cur() < userIndex()) {
      setCur(cur() + 1)
      afterMove()
    }
    return true
  }
  const up = () => {
    const it = tabs()[cur()]
    if (it && it.kind === 'lib') {
      setCur(tabs().findIndex((x) => x.toggle))
      keepInView()
    }
    return true
  }
  const down = () => {
    // Music playing behind the screens puts its pill between the bar and the page. The pill sits
    // inside the bar, so the bar doesn't hear its own focus leave and closes itself.
    if (audio.active && mini) {
      setOpen(false)
      closeLibs()
      mini.focusPill()
      return true
    }
    focusActivePage()
    return true
  }
  const enter = () => {
    if (cur() === searchIndex()) {
      openEntry(
        nav,
        navEntries(vis()).find((e) => e.key === 'search'),
      )
      return true
    }
    if (cur() === userIndex()) {
      openEntry(nav, { action: 'account' })
      return true
    }
    const it = tabs()[cur()]
    if (!it) return true
    const entry = tabEntries()[cur()]
    if (it.toggle) {
      if (!entry.libraries || !entry.libraries.length) return true
      setLibsOpen(!libsOpen())
      if (libsOpen()) {
        const at = cur()
        // Focus moves to the first library a beat after the list opens.
        later(() => {
          if (libsOpen() && cur() === at) {
            setCur(at + 1)
            keepInView()
          }
        }, 50)
      }
      return true
    }
    if (it.kind === 'lib') closeLibs()
    openEntry(nav, entry)
    return true
  }
  // Back does what it does on the page, even with the libraries open. The list folds away as focus
  // leaves for the exit dialog.
  const back = () => {
    navBack(nav)
    return true
  }
  // What the seasonal follower lands under: the focused tab, Search or the avatar.
  const focusTarget = () => (cur() === searchIndex() ? nodes.search : cur() === userIndex() ? nodes.user : nodes[(tabs()[cur()] || {}).key])

  return (
    <view
      ref={props.ref}
      width={1920}
      height={225}
      alpha={props.hidden ? 0 : 1}
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
      <view width={1920} height={124} colorTop="#000000bf" colorBottom="#00000059" />
      <view y={124} width={1920} height={101} colorTop="#00000059" colorBottom="#00000000" />
      <view x={96} y={33} width={tabsW()} height={72} clipping>
        <view x={-scroll()} width={tabsEnd()} height={72} transition={{ x: { duration: fx } }}>
          <For each={tabKeys()}>
            {(k) => {
              // A tab only updates when its own place or look changes.
              const at = createMemo(() => tab(k), undefined, { equals: sameFields })
              return (
                <TablineTab
                  ref={(n) => (nodes[k] = n)}
                  x={at().x}
                  tab={at()}
                  w={at().w}
                  focused={isOn(at().i)}
                  hiddenLib={at().hiddenLib}
                  fx={fx}
                  accent={lineAccent()}
                />
              )
            }}
          </For>
        </view>
      </view>
      <view ref={(n) => (nodes.search = n)} x={searchX()} y={42} width={54} height={54}>
        <view width={54} height={54} borderRadius={27} color="#ffffffff" alpha={searchOn() ? 1 : 0} />
        <view x={9} y={9} width={36} height={36} src="icons/nav_search.webp" color={searchOn() ? '#101010ff' : '#ffffffd9'} />
      </view>
      <text
        letterSpacing={themeSpacing()}
        fontFamily={uiFont('medium')}
        fontSize={24}
        x={1691}
        y={55 + faceDy(24)}
        mountX={1}
        lineHeight={33}
        color="#ffffffd9"
      >
        {clock()}
      </text>
      <NavAvatar ref={(n) => (nodes.user = n)} x={1738} y={33} focused={isOn(userIndex())} opacity={userOpacity(tried())} />
      <view>
        <Show when={!props.preview}>
          <MiniPlayer ref={(m) => (mini = m)} barBottom={105} surface={theme().navFill} ink={theme().onSurface} />
        </Show>
      </view>
    </view>
  )
}
