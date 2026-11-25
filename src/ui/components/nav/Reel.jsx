import { For, Show, createMemo, createSignal } from 'solid-js'
import { fontFor, textWidth, faceDy, themeSpacing } from '../../text.js'
import { theme } from '../../theme.js'
import { focusActivePage } from '../../../state/pages.js'
import { focusNav } from '../../../app/focus.js'
import { getStore } from '../../../state/store.js'
import { router } from '../../../app/router.js'
import { audio } from '../../../state/audioPlayer.js'
import { navVisibility, navEntries, openEntry, currentEntryIndex } from './navEntries.js'
import { friendsTicker, fontsReady, navUser } from './navKit.js'
import ReelEntry from './ReelEntry.jsx'
import { reelDistance } from './reelMath.js'

// The Reel sidebar. At rest it's a single round button between fading dots, halfway down the left
// edge, showing the current page's icon. Focus opens a wheel over a dark scrim: entries turn through
// a window at the screen's middle with Up and Down, Enter opens the one in the window, Left reaches
// the avatar and Right goes back to the page.
const VISIBLE = 3
// A held key repeats faster than the wheel can be read, so repeats turn it at this pace.
const REPEAT_MS = 130
const DOTS = [
  [458, 0.18],
  [474, 0.32],
  [490, 0.5],
  [584, 0.5],
  [600, 0.32],
  [616, 0.18],
]
const GONE = { key: '', slot: 4, jump: true, entry: { label: '', icon: '', font: 'roboto', current: false, labelW: 0 } }

export default function Reel(props) {
  const store = getStore()
  const nav = { $store: store, $router: router }
  const friendsTick = friendsTicker()
  const measured = fontsReady()
  const [open, setOpen] = createSignal(false)
  const [center, setCenter] = createSignal(0)
  const [onAvatar, setOnAvatar] = createSignal(false)
  let places = {}
  let lastTurn = 0
  let windowNode
  let avatarNode

  const vis = createMemo(() => navVisibility(store, friendsTick()))
  const entries = createMemo(() => navEntries(vis(), { side: true, splitLibraries: true, nowPlaying: !!audio.active }))
  const currentIndex = () => currentEntryIndex(entries(), props.preview ? 'home' : store.navSection)
  const restIcon = () => {
    const e = entries()[currentIndex()]
    return e ? e.icon : 'icons/nav_home.webp'
  }
  const at = () => (entries().length ? center() % entries().length : 0)
  // Each entry's look while the wheel is open, which turning it doesn't change.
  const looks = createMemo(() => {
    if (!open()) return []
    measured()
    const now = currentIndex()
    return entries().map((e, i) => {
      const label = e.label || ''
      return {
        label,
        icon: e.icon,
        font: fontFor(label, 'bold'),
        current: i === now,
        labelW: Math.round(textWidth(label, 48, 'bold') - 0.72 * label.length),
      }
    })
  })
  // The entries near the window, one more each side waiting hidden so a turn fades it in.
  const wheel = createMemo(() => {
    if (!open()) return []
    const list = entries()
    const count = list.length
    const out = []
    const next = {}
    list.forEach((e, i) => {
      const d = reelDistance(i, at(), count)
      if (Math.abs(d) > VISIBLE + 1) return
      next[e.key] = d
      out.push({
        key: e.key,
        slot: d,
        jump: places[e.key] !== undefined && Math.abs(places[e.key] - d) > 1,
        entry: looks()[i],
      })
    })
    places = next
    return out
  })
  const wheelKeys = createMemo(() => wheel().map((w) => w.key))
  const wheelByKey = createMemo(() => {
    const out = {}
    wheel().forEach((w) => (out[w.key] = w))
    return out
  })
  const spoke = (k) => wheelByKey()[k] || GONE
  const { avatar, name: userName, initial } = navUser(store)

  // Focus on the resting button opens the wheel at the current page, with focus on its window.
  const onFocusChanged = (has) => {
    if (has) {
      setCenter(currentIndex())
      setOnAvatar(false)
      places = {}
      setOpen(true)
    } else {
      setOpen(false)
      setOnAvatar(false)
    }
  }
  const turn = (step, e) => {
    const now = Date.now()
    if (e && e.repeat && now - lastTurn < REPEAT_MS) return true
    lastTurn = now
    const count = entries().length
    setCenter((((at() + step) % count) + count) % count)
    return true
  }
  // Focus goes back to the page first, so whatever the entry opens returns there afterwards.
  const closeToContent = () => focusActivePage()
  // The Magic Remote's cursor rings an entry, and a click turns the wheel to it and opens it
  // (app/pointer.js). The wheel turns under focus, so hover doesn't turn it. The rail opens the wheel
  // on a click, since the wheel covers the page.
  const pick = (k) => () => {
    const i = entries().findIndex((e) => e.key === k)
    if (i < 0) return false
    setOnAvatar(false)
    setCenter(i)
    return true
  }

  return (
    <view
      ref={props.ref}
      width={1920}
      height={1080}
      alpha={props.hidden && !open() ? 0 : 1}
      transition={{ alpha: { duration: 250 } }}
      seasonalZone="nav"
      focusTarget={() => (onAvatar() ? avatarNode : windowNode)}
      onFocusChanged={onFocusChanged}
      onUp={(e) => (onAvatar() ? true : turn(-1, e))}
      onDown={(e) => {
        if (!onAvatar()) return turn(1, e)
        setOnAvatar(false)
        return true
      }}
      onLeft={() => {
        setOnAvatar(true)
        return true
      }}
      onRight={() => {
        if (onAvatar()) setOnAvatar(false)
        else closeToContent()
        return true
      }}
      onEnter={() => {
        if (onAvatar()) {
          closeToContent()
          openEntry(nav, { action: 'account' })
          return true
        }
        const e = entries()[at()]
        closeToContent()
        openEntry(nav, e)
        return true
      }}
      onBack={() => {
        closeToContent()
        return true
      }}
    >
      <view x={15} width={72} height={1080} alpha={open() ? 0 : 1} onPointerClick={() => void focusNav()}>
        <For each={DOTS}>{([y, a]) => <view x={33} y={y} width={6} height={6} borderRadius={3} color="#ffffffff" alpha={a} />}</For>
        <view x={3} y={507} width={66} height={66} borderRadius={33} color="#ffffff24" />
        <view x={18} y={522} width={36} height={36} src={restIcon()} color="#ffffffff" />
      </view>
      <view width={1920} height={1080} alpha={open() ? 1 : 0}>
        <view width={1920} height={1080} color="#0000004d" onPointerClick={() => void closeToContent()} />
        <view width={406} height={1080} colorLeft="#08090bf5" colorRight="#08090be0" />
        <view x={406} width={374} height={1080} colorLeft="#08090be0" colorRight="#08090b00" />
        <view ref={avatarNode} x={38} y={35} width={65} height={65} borderRadius={32.5} color="#ffffffff" alpha={onAvatar() ? 1 : 0} />
        <view x={42} y={39} width={57} height={57} borderRadius={28.5} color="#2b3440ff" onPointerOver={() => open() && setOnAvatar(true)}>
          <text
            letterSpacing={themeSpacing()}
            fontFamily={fontFor(initial(), 'bold')}
            fontSize={27}
            x={28.5}
            y={17 + faceDy(27)}
            mountX={0.5}
            lineHeight={27}
            color="#ffffffd9"
            alpha={avatar() ? 0 : 1}
          >
            {initial()}
          </text>
        </view>
        <view>
          <Show when={avatar()}>
            <view
              x={42}
              y={39}
              width={57}
              height={57}
              borderRadius={28.5}
              src={avatar()}
              textureOptions={{ resizeMode: { type: 'cover' } }}
            />
          </Show>
        </view>
        <text
          letterSpacing={themeSpacing()}
          fontFamily={fontFor(userName(), 'bold')}
          fontSize={22}
          x={117}
          y={58.5 + faceDy(22, true)}
          lineHeight={1}
          color="#ffffffd9"
        >
          {userName()}
        </text>
        <view x={36} y={483} width={600} height={1} color="#ffffff29" />
        <view x={36} y={597} width={600} height={1} color="#ffffff29" />
        <view x={9} y={526} width={15} height={28} src="icons/nav_reel_marker.webp" color={theme().accent} />
        <view x={67.5} y={163.5} width={45} height={45} src="icons/nav_chevron_up.webp" color="#ffffff66" />
        <view x={67.5} y={871.5} width={45} height={45} src="icons/nav_chevron_down.webp" color="#ffffff66" />
        <view ref={windowNode} y={483} width={640} height={114} />
      </view>
      <view>
        <For each={wheelKeys()}>
          {(k) => {
            const entry = createMemo(() => spoke(k).entry)
            return <ReelEntry entry={entry()} slot={spoke(k).slot} jump={spoke(k).jump} onPointerClick={pick(k)} />
          }}
        </For>
      </view>
    </view>
  )
}
