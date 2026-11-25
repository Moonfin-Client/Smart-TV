import { For, createMemo, createSelector, createSignal, onCleanup } from 'solid-js'
import { uiFont, fontFor, textWidth, faceDy, themeSpacing } from '../../text.js'
import { theme, rgba, glowShadow } from '../../theme.js'
import { hex } from '../../color.js'
import { highMs } from '../../tier.js'
import { focusActivePage } from '../../../state/pages.js'
import { getStore } from '../../../state/store.js'
import { router } from '../../../app/router.js'
import { audio } from '../../../state/audioPlayer.js'
import { navVisibility, navEntries, openEntry, badgeText } from './navEntries.js'
import { navClock, friendsTicker, fontsReady, sameFields, userOpacity } from './navKit.js'
import { navBack } from './navBack.js'
import { focusScroll } from './focusScroll.js'
import NavAvatar from './NavAvatar.jsx'
import TopBarPill from './TopBarPill.jsx'
import MiniPlayer from '../music/MiniPlayer.jsx'

// The classic top bar: the avatar at the left, a centered pill of icon buttons that grow their label
// when focused (or always, with Always Expand Navbar), and the clock at the right.
const PILL_MAX = 1400
const LIST_MAX = 800
const GONE = {
  key: '',
  kind: 'pill',
  label: '',
  font: 'roboto',
  icon: '',
  rest: '#00000000',
  active: false,
  toggle: false,
  badge: '',
  x: 0,
  y: 1,
  w: 72,
  i: -1,
}

export default function TopBar(props) {
  const store = getStore()
  const nav = { $store: store, $router: router }
  const friendsTick = friendsTicker()
  const measured = fontsReady()
  const [cur, setCur] = createSignal(1)
  const [open, setOpen] = createSignal(false)
  const [libsOpen, setLibsOpen] = createSignal(false)
  const [scroll, setScroll] = createSignal(0)
  const fx = highMs(150)
  const listMs = highMs(250)
  const timers = []
  const later = (fn, ms) => timers.push(setTimeout(fn, ms))
  onCleanup(() => timers.forEach(clearTimeout))
  let mini
  const nodes = {}

  const t = createMemo(() => theme())
  const vis = createMemo(() => navVisibility(store, friendsTick()))
  const entries = createMemo(() => navEntries(vis()))
  // The focus order: the avatar, then each pill, with the open libraries after their pill.
  const items = createMemo(() => {
    const th = t()
    measured()
    const out = [{ key: 'user', kind: 'user' }]
    entries().forEach((e) => {
      const label = e.label || ''
      out.push({
        key: e.key,
        kind: 'pill',
        label,
        font: fontFor(label, 'bold'),
        icon: e.icon,
        rest: th.navSlot(e.slot),
        active: !!e.active,
        toggle: !!e.libraries,
        badge: e.badge > 0 ? badgeText(e.badge) : '',
        wOpen: Math.round(94 + textWidth(label, 22, 'bold')),
      })
      if (e.libraries && libsOpen()) {
        e.libraries.forEach((lib, i) => {
          out.push({
            key: 'lib:' + lib.key,
            kind: 'lib',
            label: lib.label,
            font: fontFor(lib.label, 'medium'),
            icon: '',
            rest: th.navSlot((i % 16) + 1),
            active: lib.view === store.navSection,
            toggle: false,
            badge: '',
            wOpen: Math.round(40 + textWidth(lib.label, 20, 'medium')),
          })
        })
      }
    })
    return out
  })
  const itemEntries = createMemo(() => {
    const out = [{ action: 'account' }]
    entries().forEach((e) => {
      out.push(e)
      if (e.libraries && libsOpen()) e.libraries.forEach((lib) => out.push(lib))
    })
    return out
  })
  // Each pill's x inside the pill and its width, for the focus and expansion as they stand.
  const placed = createMemo(() => {
    const always = vis().alwaysExpanded
    const on = open() ? cur() : -1
    const list = items()
    let x = 1
    let listStart = -1
    const out = []
    list.forEach((it, i) => {
      if (it.kind === 'user') return
      const expanded = it.kind === 'lib' || always || on === i
      const w = expanded ? it.wOpen : 72
      if (it.kind === 'lib') {
        if (listStart < 0) listStart = x
        x += 4
      } else if (out.length) {
        x += 2
      }
      // The open list is capped at 800 wide and clips what's past that.
      const clipped = it.kind === 'lib' && x + w - listStart > LIST_MAX
      out.push({ ...it, i, x, w, expanded, y: it.kind === 'lib' ? 7 : 1, hiddenLib: clipped })
      x += w
      const next = list[i + 1]
      if (it.kind === 'lib' && (!next || next.kind !== 'lib')) x = Math.min(x, listStart + LIST_MAX)
    })
    return { list: out, width: x + 1 }
  })
  const pillKeys = createMemo(() => items().filter((it) => it.kind !== 'user').map((it) => it.key))
  const pillByKey = createMemo(() => {
    const out = {}
    placed().list.forEach((p) => (out[p.key] = p))
    return out
  })
  const pill = (k) => pillByKey()[k] || GONE
  const isOn = createSelector(() => (open() ? cur() : null))
  const pillW = () => Math.min(PILL_MAX, placed().width)
  const pillX = () => Math.round(960 - pillW() / 2)
  // Pixel themes square off the nav's pills and buttons.
  const pillR = () => (t().isPixel ? 0 : 36)
  const glass = () => t().id === 'glass'
  // Glass frosts the pill instead of tinting it. The renderer can't blur what's behind, so it keeps
  // only the frosted fill and border.
  const pillFill = () => (glass() ? rgba('#ffffff', 0.08) : t().navFill)
  const pillBorder = createMemo(() => {
    if (glass()) return { width: 1, color: hex(rgba('#ffffff', 0.12)) }
    const b = t().navBorder
    return b ? { width: b.w, color: hex(b.color) } : { width: 0, color: 0 }
  })
  const neonGlow = createMemo(() =>
    t().id === 'neon_pulse' ? [glowShadow({ color: t().accentA(0.35), x: 0, y: 0, blur: 6, spread: 0 })] : [],
  )
  const clock = navClock(() => vis().showClock)
  const clockShadow = () =>
    t().id === 'neon_pulse' ? { color: '#ff2e9259', x: 0, y: 0, blur: 8 } : { color: '#00000080', x: 0, y: 2, blur: 4 }
  const clockColor = () => (t().id === 'neon_pulse' ? t().onSurface : rgba('#ffffff', 0.9))
  const slide = { duration: fx }

  const keepInView = () => {
    const p = placed().list.find((x) => x.i === cur())
    if (placed().width <= PILL_MAX) return setScroll(0)
    if (p) setScroll(focusScroll(p.x, p.w, scroll(), pillW(), placed().width - pillW()))
  }
  const inLibs = (i) => {
    const it = items()[i]
    return !!it && (it.kind === 'lib' || it.toggle)
  }
  const closeLibs = () => {
    if (!libsOpen()) return
    const onItem = items()[cur()]
    const key = onItem && onItem.key
    setLibsOpen(false)
    const i = items().findIndex((x) => x.key === key)
    setCur(i >= 0 ? i : items().findIndex((x) => x.toggle))
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
      setCur(1)
      setOpen(true)
      keepInView()
    } else {
      setOpen(false)
      closeLibs()
    }
  }
  const left = () => {
    const it = items()[cur()]
    if (cur() > 0) setCur(cur() - 1)
    // Left from the libraries pill goes to what sits before it, never into its own list.
    if (it && it.toggle && items()[cur()] && items()[cur()].kind === 'lib') setCur(cur() - 1)
    afterMove()
    return true
  }
  const right = () => {
    if (cur() < items().length - 1) {
      setCur(cur() + 1)
      afterMove()
    }
    return true
  }
  const up = () => {
    // The pill sits alongside the list rather than above it, so Up from a library goes back to it.
    const it = items()[cur()]
    if (it && it.kind === 'lib') {
      setCur(items().findIndex((x) => x.toggle))
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
    const it = items()[cur()]
    if (!it) return true
    const entry = itemEntries()[cur()]
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
  // What the seasonal follower lands under: the focused button.
  const focusTarget = () => nodes[(items()[cur()] || {}).key]

  return (
    <view
      ref={props.ref}
      y={30}
      width={1920}
      height={92}
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
      <NavAvatar ref={(n) => (nodes.user = n)} x={62} y={10} focused={isOn(0)} opacity={userOpacity()} />
      <view>
        <For each={neonGlow()}>
          {(n) => (
            <view
              x={pillX()}
              y={10}
              width={pillW()}
              height={72}
              borderRadius={pillR()}
              color="#00000000"
              shadow={n.shadow}
              transition={{ x: slide, width: slide }}
            />
          )}
        </For>
      </view>
      <view
        x={pillX()}
        y={10}
        width={pillW()}
        height={72}
        borderRadius={pillR()}
        color={pillFill()}
        border={pillBorder()}
        transition={{ x: slide, width: slide }}
      />
      <view x={pillX()} y={10} width={pillW()} height={72} clipping transition={{ x: slide, width: slide }}>
        <view x={-scroll()} width={placed().width} height={72} transition={{ x: slide }}>
          <For each={pillKeys()}>
            {(k) => {
              // A pill only updates when its own place or look changes.
              const at = createMemo(() => pill(k), undefined, { equals: sameFields })
              return (
                <TopBarPill
                  ref={(n) => (nodes[k] = n)}
                  x={at().x}
                  y={at().y}
                  item={at()}
                  w={at().w}
                  focused={isOn(at().i)}
                  expanded={at().expanded}
                  hiddenLib={at().hiddenLib}
                  fx={fx}
                  listMs={listMs}
                />
              )
            }}
          </For>
        </view>
      </view>
      <text
        letterSpacing={themeSpacing()}
        fontFamily={uiFont('medium')}
        fontSize={28}
        x={1872}
        y={31.5 + faceDy(28)}
        mountX={1}
        lineHeight={33}
        color={clockColor()}
        textShadow={clockShadow()}
      >
        {clock()}
      </text>
      <MiniPlayer ref={(m) => (mini = m)} barBottom={92} surface={t().navFill} />
    </view>
  )
}
