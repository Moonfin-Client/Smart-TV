import { For, Show, createMemo, createSignal } from 'solid-js'
import { uiFont, fontFor, faceDy, themeSpacing } from '../../text.js'
import { theme, rgba, glowShadow, SIDEBAR_W, SIDEBAR_OPEN_W } from '../../theme.js'
import { highMs } from '../../tier.js'
import { focusActivePage } from '../../../state/pages.js'
import { getStore } from '../../../state/store.js'
import { router } from '../../../app/router.js'
import { navVisibility, navEntries, openEntry, badgeText } from './navEntries.js'
import { navClock, friendsTicker, navUser } from './navKit.js'
import { textShadowCopies } from './textShadow.js'
import { navBack } from './navBack.js'
import { focusScroll } from './focusScroll.js'
import SidebarRow from './SidebarRow.jsx'
import SidebarMusicCard, { sidebarMusicHeight, CARD_KEYS } from '../music/SidebarMusicCard.jsx'
import * as audioPlayer from '../../../state/audioPlayer.js'

// The classic sidebar: a 78px rail of icons down the left edge that opens to 280px with labels
// while it holds focus. Music playing behind the screens adds its card under Settings, one more stop
// after the last row.
const ITEM_H = 68
const ITEM_PITCH = 74
const LIB_H = 50
const USER_H = 116
const FOOTER_H = 69
const NAV_PAD = 10
// The open rail's fill holds its color for all but its last 16px, where it blends out.
const SOLID = 0.942857
const GONE = {
  key: '',
  kind: 'item',
  y: 0,
  h: ITEM_H,
  icon: '',
  label: '',
  font: 'roboto',
  rest: '#00000000',
  active: false,
  toggle: false,
  badge: '',
  i: -1,
}

export default function Sidebar(props) {
  const store = getStore()
  // The store and router in the shape openEntry and navBack take.
  const nav = { $store: store, $router: router }
  const friendsTick = friendsTicker()
  const [cur, setCur] = createSignal(1)
  const [open, setOpen] = createSignal(false)
  const [libsOpen, setLibsOpen] = createSignal(false)
  const [scroll, setScroll] = createSignal(0)
  const [mcur, setMcur] = createSignal(0)
  const musicOn = () => audioPlayer.audio.active
  const rowNodes = {}
  let userNode
  const slideMs = highMs(250)
  const turnMs = highMs(200)

  const t = createMemo(() => theme())
  const vis = createMemo(() => navVisibility(store, friendsTick()))
  const entries = createMemo(() => navEntries(vis(), { side: true }))
  // What each row opens, in row order.
  const rowEntries = createMemo(() => {
    const out = []
    entries().forEach((e) => {
      out.push(e)
      if (e.libraries && libsOpen()) e.libraries.forEach((lib) => out.push(lib))
    })
    return out
  })
  const navTop = (contentH) => {
    const avail = 1080 - USER_H - (vis().showClock ? FOOTER_H : 0) - NAV_PAD * 2
    return USER_H + NAV_PAD + Math.max(0, Math.floor((avail - contentH) / 2))
  }
  // Every row under the user button, top to bottom, with its y on the 1080 stage. The libraries
  // open in place under their toggle.
  const rows = createMemo(() => {
    const th = t()
    const out = []
    let y = 0
    entries().forEach((e) => {
      const label = e.label || ''
      out.push({
        key: e.key,
        kind: 'item',
        y: y + 3,
        h: ITEM_H,
        icon: e.icon,
        label,
        font: fontFor(label, 'medium'),
        rest: th.navSlot(e.slot),
        active: !!e.active,
        toggle: !!e.libraries,
        badge: e.badge > 0 ? badgeText(e.badge) : '',
      })
      y += ITEM_PITCH
      if (e.libraries && libsOpen()) {
        e.libraries.forEach((lib, i) => {
          out.push({
            key: 'lib:' + lib.key,
            kind: 'lib',
            y,
            h: LIB_H,
            icon: '',
            label: lib.label,
            font: fontFor(lib.label, 'medium'),
            rest: th.navSlot((i % 16) + 1),
            active: false,
            toggle: false,
            badge: '',
          })
          y += LIB_H
        })
      }
    })
    const top = navTop(y + (musicOn() ? sidebarMusicHeight(open()) : 0))
    out.forEach((r, i) => {
      r.y += top
      r.i = i + 1
    })
    return out
  })
  // Rows are kept by key, so a row that stays (the libraries opening under it) slides to its new
  // place instead of being built again.
  const rowKeys = createMemo(() => rows().map((r) => r.key))
  const rowByKey = createMemo(() => {
    const out = {}
    rows().forEach((r) => (out[r.key] = r))
    return out
  })
  // A row on its way out can read once more before its component goes.
  const row = (k) => rowByKey()[k] || GONE
  const navClipH = () => 1080 - USER_H - (vis().showClock ? FOOTER_H : 0)
  const contentH = () => {
    const list = rows()
    const last = list[list.length - 1]
    return last ? last.y + last.h + (last.kind === 'item' ? 3 : 0) + (musicOn() ? sidebarMusicHeight(open()) : 0) - (list[0].y - 3) : 0
  }
  const musicY = () => {
    const list = rows()
    const last = list[list.length - 1]
    return last ? last.y + last.h + (last.kind === 'item' ? 3 : 0) : 0
  }
  const onMusic = () => musicOn() && cur() === rows().length + 1
  const musicFocus = () => (open() && onMusic() ? mcur() : -1)
  const maxScroll = () => Math.max(0, contentH() + NAV_PAD * 2 - navClipH())
  const railW = () => (open() ? SIDEBAR_OPEN_W : SIDEBAR_W)
  const itemW = () => railW() - NAV_PAD * 2
  const fx = highMs(150)
  const widthMs = highMs(200)
  const grow = { duration: widthMs }

  const { avatar, name: userName, initial } = navUser(store)
  const clock = navClock(() => vis().showClock)
  const clockColor = () => (t().id === 'neon_pulse' ? t().onSurface : rgba('#ffffff', 0.5))
  const neonEdge = createMemo(() =>
    t().id !== 'neon_pulse' || !open()
      ? []
      : [
          glowShadow({ color: '#ff2e9266', x: 2, y: 0, blur: 12, spread: 0 }, 0),
          glowShadow({ color: '#00e5ff54', x: 1, y: 0, blur: 10, spread: 0 }, 1),
        ],
  )
  const clockGlow = createMemo(() => (t().id === 'neon_pulse' ? textShadowCopies({ blur: 8, color: '#ff2e9259' }) : []))
  const glowList = createMemo(() => t().focusGlow.map(glowShadow))
  const userFocused = () => open() && cur() === 0

  // The rail scrolls between the user button and the clock.
  const keepInView = () => {
    const r = onMusic() ? { y: musicY(), h: sidebarMusicHeight(true) } : rows()[cur() - 1]
    if (!r) return setScroll(0)
    const bottom = 1080 - (vis().showClock ? FOOTER_H : 0)
    setScroll(focusScroll(r.y - USER_H, r.h, scroll(), bottom - USER_H, maxScroll()))
  }
  const move = (d) => {
    const next = cur() + d
    if (next < 0 || next > rows().length + (musicOn() ? 1 : 0)) return true
    setCur(next)
    setMcur(0)
    keepInView()
    return true
  }
  const onFocusChanged = (has) => {
    if (has) {
      // The sidebar always enters on Home.
      setCur(1)
      setLibsOpen(false)
      setOpen(true)
      keepInView()
    } else {
      // The column keeps its scroll, held to the shorter list once the libraries fold away.
      setOpen(false)
      setLibsOpen(false)
      setScroll(Math.min(scroll(), maxScroll()))
    }
  }
  const enter = () => {
    if (onMusic()) {
      const key = CARD_KEYS[mcur()]
      if (key === 'open') router.to('/nowplaying')
      else audioPlayer[key]()
      return true
    }
    if (cur() === 0) {
      openEntry(nav, { action: 'account' })
      return true
    }
    const r = rows()[cur() - 1]
    if (!r) return true
    if (r.toggle) {
      setLibsOpen(!libsOpen())
      keepInView()
      return true
    }
    openEntry(nav, rowEntries()[cur() - 1])
    return true
  }

  return (
    <view
      ref={props.ref}
      width={280}
      height={1080}
      alpha={props.hidden ? 0 : 1}
      transition={{ alpha: { duration: 250 } }}
      seasonalZone="nav"
      navRight={() => railW()}
      focusTarget={() => (cur() === 0 ? userNode : rowNodes[(rows()[cur() - 1] || {}).key])}
      onFocusChanged={onFocusChanged}
      onUp={() => {
        if (!onMusic() || mcur() === 0) return move(-1)
        setMcur(0)
        return true
      }}
      onDown={() => {
        if (!onMusic()) return move(1)
        if (mcur() === 0) setMcur(2)
        return true
      }}
      onLeft={() => {
        if (onMusic() && mcur() > 1) setMcur(mcur() - 1)
        return true
      }}
      onRight={() => {
        // The card walks its own buttons and lets Right through to the page once it runs out.
        if (onMusic() && mcur() >= 1 && mcur() < CARD_KEYS.length - 1) setMcur(mcur() + 1)
        else focusActivePage()
        return true
      }}
      onEnter={enter}
      onBack={() => {
        navBack(nav)
        return true
      }}
    >
      <view width={railW() * SOLID} height={1080} color={t().navOverlay} alpha={open() ? 1 : 0} transition={{ width: grow }} />
      <view
        x={railW() * SOLID}
        width={railW() * (1 - SOLID)}
        height={1080}
        colorLeft={t().navOverlay}
        colorRight={t().navOverlay.slice(0, 7) + '00'}
        alpha={open() ? 1 : 0}
        transition={{ x: grow, width: grow }}
      />
      <view>
        <For each={neonEdge()}>{(e) => <view width={280} height={1080} color="#00000000" shadow={e.shadow} />}</For>
      </view>
      <view>
        <Show when={t().id === 'neon_pulse' && open()}>
          <view x={279} width={1} height={1080} color={t().accent} />
        </Show>
      </view>
      <view width={railW()} height={1080} clipping transition={{ width: grow }}>
        <view ref={userNode} x={10} y={23} width={itemW()} height={80} transition={{ width: grow }}>
          <view>
            <For each={glowList()}>
              {(g) => (
                <view
                  width={itemW()}
                  height={80}
                  borderRadius={t().isPixel ? 0 : 28}
                  color="#00000000"
                  shadow={g.shadow}
                  alpha={userFocused() ? 1 : 0}
                  transition={{ width: grow, alpha: { duration: fx } }}
                />
              )}
            </For>
          </view>
          <view
            width={itemW()}
            height={80}
            borderRadius={t().isPixel ? 0 : 28}
            color={t().navFocusFill}
            alpha={userFocused() ? 1 : 0}
            transition={{ width: grow, alpha: { duration: fx } }}
          />
          {/* A 135 degree gradient runs corner to corner on a square, so the other two corners take the midpoint color. */}
          <view
            x={15}
            y={15}
            width={50}
            height={50}
            borderRadius={25}
            colorTl={0x00a4dcff}
            colorTr={0x008ec9ff}
            colorBl={0x008ec9ff}
            colorBr={0x0077b6ff}
            alpha={avatar() ? 0 : 1}
          >
            <text
              letterSpacing={themeSpacing()}
              fontFamily={fontFor(initial(), 'bold')}
              fontSize={24}
              x={25}
              y={15 + faceDy(24)}
              mountX={0.5}
              lineHeight={24}
              color="#ffffffff"
            >
              {initial()}
            </text>
          </view>
          <view>
            <Show when={avatar()}>
              <view
                x={15}
                y={15}
                width={50}
                height={50}
                borderRadius={25}
                src={avatar()}
                textureOptions={{ resizeMode: { type: 'cover' } }}
              />
            </Show>
          </view>
          <text
            letterSpacing={themeSpacing()}
            fontFamily={fontFor(userName(), 'medium')}
            fontSize={20}
            x={79}
            y={32 + faceDy(20, true)}
            lineHeight={1}
            maxWidth={166}
            maxLines={1}
            color={userFocused() ? t().navFocusInk : t().navItem}
            alpha={open() ? 1 : 0}
            transition={{ color: { duration: fx }, alpha: { duration: 150 } }}
          >
            {userName()}
          </text>
        </view>
        <view y={116} width={280} height={navClipH()} clipping>
          <view y={-scroll() - 116} width={280} height={1080 + maxScroll()} transition={{ y: { duration: fx } }}>
            <For each={rowKeys()}>
              {(k) => (
                <SidebarRow
                  ref={(n) => (rowNodes[k] = n)}
                  x={10}
                  y={row(k).y}
                  slideMs={slideMs}
                  row={row(k)}
                  w={itemW()}
                  focused={open() && cur() === row(k).i}
                  open={open()}
                  fx={fx}
                  widthMs={widthMs}
                  turnMs={turnMs}
                  libsOpen={libsOpen()}
                />
              )}
            </For>
            <view>
              <Show when={musicOn()}>
                <SidebarMusicCard x={10} y={musicY()} open={open()} w={itemW()} focus={musicFocus()} />
              </Show>
            </view>
          </view>
        </view>
        <view x={railW() / 2} alpha={open() ? 1 : 0} transition={{ x: grow, alpha: { duration: 150 } }}>
          <For each={clockGlow()}>
            {(g) => (
              <text
                letterSpacing={themeSpacing()}
                fontFamily={uiFont('medium')}
                fontSize={18}
                x={g.x}
                y={1027.5 + faceDy(18) + g.y}
                mountX={0.5}
                lineHeight={33}
                color={g.color}
              >
                {clock()}
              </text>
            )}
          </For>
        </view>
        <text
          letterSpacing={themeSpacing()}
          fontFamily={uiFont('medium')}
          fontSize={18}
          x={railW() / 2}
          y={1027.5 + faceDy(18)}
          mountX={0.5}
          lineHeight={33}
          color={clockColor()}
          alpha={open() ? 1 : 0}
          transition={{ x: grow, alpha: { duration: 150 } }}
        >
          {clock()}
        </text>
      </view>
    </view>
  )
}
