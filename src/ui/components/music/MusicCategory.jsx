import $L from '../../../services/i18n.js'
import { Index, Show, createMemo, onCleanup } from 'solid-js'
import MusicTabBar from './MusicTabBar.jsx'
import { tabBarWidth } from '../books/bookText.js'
import AlbumsScreen from './screens/AlbumsScreen.jsx'
import ArtistsScreen from './screens/ArtistsScreen.jsx'
import SongsScreen from './screens/SongsScreen.jsx'
import PlaylistsScreen from './screens/PlaylistsScreen.jsx'
import GenresScreen from './screens/GenresScreen.jsx'
import FavoritesScreen from './screens/FavoritesScreen.jsx'
import { lineY } from '../books/bookGrid.js'
import { fitText } from '../library/measure.js'
import { uiFont, textWidth } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { reactive } from '../../../state/reactive.js'
import { setContentWidth } from './musicGrid.js'
import { tabList, tabForScreen, stripTarget, musicCategories, musicNavFor } from '../../../pages/Music/music.js'
import * as settings from '../../../state/settings.js'

const NONE = '#00000000'
const FRAMES = {
  strip: { x: 0, y: 81, w: 1920, h: 999 },
  chips: { x: 0, y: 87, w: 1920, h: 993 },
  rail: { x: 248, y: 0, w: 1672, h: 1080 },
}
// Genres takes a glyph of its own here, since its note on the overview is the one Songs uses.
const iconOf = (id) => {
  if (id === 'overview') return 'core_space_dashboard_outlined'
  if (id === 'genres') return 'core_category'
  const c = musicCategories().find((x) => x.id === id)
  return c ? c.icon : ''
}
const SCREENS = { artists: ArtistsScreen, albums: AlbumsScreen, songs: SongsScreen, playlists: PlaylistsScreen, genres: GenresScreen, favorites: FavoritesScreen }

export default function MusicCategory(props) {
  const look = () => props.look
  const TABS = tabList()
  const nav = musicNavFor(settings.get('musicLibraryStyle'))
  const frame = FRAMES[nav]
  setContentWidth(frame.w)
  onCleanup(() => setContentWidth(1920))
  const st = reactive({ onStrip: false, scur: 0, current: null })
  let root
  let child = null

  // The theme's background, which may be see-through, laid over the app's #0a0a0a as one opaque color.
  const pageBg = createMemo(() => {
    const bg = look().t.background || '#0a0a0aff'
    const a = parseInt(bg.slice(7, 9) || 'ff', 16) / 255
    const ch = (i) => {
      const v = Math.round(parseInt(bg.slice(i, i + 2), 16) * a + 10 * (1 - a))
      return (v < 16 ? '0' : '') + v.toString(16)
    }
    return '#' + ch(1) + ch(3) + ch(5) + 'ff'
  })
  const shown = () => st.current || props.screen
  const shownKey = () => {
    const s = shown()
    return s ? `${s.id}:${s.mode || ''}:${s.tab || ''}` : ''
  }
  const currentTab = () => tabForScreen(shown())
  const navCur = () => {
    const at = TABS.findIndex((t) => t.id === currentTab())
    return nav === 'rail' ? at + 1 : at
  }
  const highlight = () => (st.onStrip ? TABS[st.scur].id : currentTab())
  const libName = () => fitText((props.library && props.library.Name) || $L('Music'), 24, 'bold', 420)
  const tabsX = () => 60 + Math.ceil(textWidth(libName(), 24, 'bold')) + 28

  const chips = createMemo(() => {
    if (nav !== 'chips') return []
    let x = 60
    return TABS.map((t, i) => {
      const w = Math.ceil(1 + 18 + 24 + 10 + textWidth(t.label, 15, 'bold') + 18 + 1)
      const out = { i, id: t.id, label: t.label, icon: 'icons/' + iconOf(t.id) + '.webp', x, w }
      x += w + 10
      return out
    })
  })
  const chipOn = (i) => st.onStrip && st.scur === i
  const chipGlow = () => (st.onStrip && nav === 'chips' ? chips()[st.scur] : null)
  const glowShadow = () => ({ color: shadowColor(look().accentA(0.45)), x: 0, y: 0, blur: 14, spread: 1 })
  const railRows = createMemo(() => {
    if (nav !== 'rail') return []
    const rows = [{ i: 0, id: 'search', label: $L('Search Music'), icon: 'icons/nav_search.webp' }]
    TABS.forEach((t, n) => rows.push({ i: n + 1, id: t.id, label: t.label, icon: 'icons/' + iconOf(t.id) + '.webp' }))
    return rows.map((r) => ({ ...r, y: 61 + r.i * 44 }))
  })
  const railName = () => fitText((props.library && props.library.Name) || $L('Music'), 24, 'bold', 200)

  // Lands in the screen, which takes its first item or its controls once it has loaded.
  const enterScreen = () => {
    if (!child) return focusNav()
    st.onStrip = false
    child.setFocus()
  }
  const focusNav = () => {
    st.scur = Math.max(0, TABS.findIndex((t) => t.id === currentTab())) + (nav === 'rail' ? 1 : 0)
    st.onStrip = true
    root.setFocus()
  }
  // Up from a screen's header goes back to the strip or the chips. Beside the rail it holds, and
  // Left off the screen's edge reaches the rail instead.
  const focusStrip = () => {
    if (nav !== 'rail') focusNav()
  }
  const onEdgeLeft = () => {
    if (nav === 'rail') focusNav()
  }
  const pick = (id) => {
    if (id === 'search') return props.onSearch()
    if (id === currentTab() && nav !== 'strip') return enterScreen()
    const target = stripTarget(id, currentTab())
    if (target === 'home') props.onCloseScreen()
    else if (target) st.current = target
  }
  const stops = () => (nav === 'rail' ? railRows() : TABS)
  // The Magic Remote's cursor focuses a tab, chip or rail row, and OK then opens it (app/pointer.js).
  const pointNav = (i) => {
    if (st.onStrip && st.scur === i) return
    const was = st.onStrip
    st.scur = i
    st.onStrip = true
    if (!was) root.setFocus()
  }
  const screenProps = {
    get library() {
      return props.library
    },
    get look() {
      return props.look
    },
    ref: (n) => (child = n),
    onEdgeLeft,
    focusStrip,
    onPointerIn: () => {
      st.onStrip = false
      if (child) child.setFocus()
    },
    onOpenSongsGrid: () => props.onOpenSongsGrid(),
  }

  return (
    <view
      ref={(n) => {
        root = n
        n.focusIn = enterScreen
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      color={pageBg()}
      onLeft={() => {
        if (st.onStrip && nav !== 'rail' && st.scur > 0) st.scur = st.scur - 1
        return true
      }}
      onRight={() => {
        if (!st.onStrip) return true
        if (nav === 'rail') enterScreen()
        else if (st.scur < TABS.length - 1) st.scur = st.scur + 1
        return true
      }}
      onUp={() => {
        if (st.onStrip && nav === 'rail' && st.scur > 0) st.scur = st.scur - 1
        return true
      }}
      onDown={() => {
        if (!st.onStrip) return true
        if (nav === 'rail') {
          if (st.scur < railRows().length - 1) st.scur = st.scur + 1
          return true
        }
        // The screen's controls, or its first item, or nothing when it has neither.
        if (!child) return true
        if (child.enterFromStrip && child.enterFromStrip() === false) return true
        st.onStrip = false
        if (!child.enterFromStrip) child.setFocus()
        return true
      }}
      onEnter={() => {
        if (st.onStrip) pick(stops()[st.scur].id)
        return true
      }}
      onBack={() => {
        st.onStrip = false
        props.onCloseScreen()
        return true
      }}
    >
      <view x={frame.x} y={frame.y} width={frame.w} height={frame.h}>
        <Show when={shownKey()} keyed>
          {() => {
            const Screen = SCREENS[shown().id]
            const s = shown()
            return Screen ? <Screen screen={s} {...screenProps} /> : null
          }}
        </Show>
      </view>
      <view>
        <Show when={nav === 'strip'}>
          <view width={1920} height={81} color={pageBg()} />
          <text fontFamily={uiFont('bold')} fontSize={24} x={60} y={33 + 4.3} color="#ffffffff">
            {libName()}
          </text>
          <view x={tabsX()} y={18} width={tabBarWidth(TABS, highlight())} height={63} clipping>
            <MusicTabBar tabs={TABS} active={highlight()} focus={st.onStrip ? st.scur : -1} look={look()} onPointerTab={pointNav} />
          </view>
        </Show>
      </view>
      <view>
        <Show when={nav === 'chips'}>
          <view width={1920} height={87} color={pageBg()}>
            <view
              x={chipGlow() ? chipGlow().x : 0}
              y={18}
              width={chipGlow() ? chipGlow().w : 0}
              height={55}
              borderRadius={22}
              color={NONE}
              shadow={glowShadow()}
              alpha={chipGlow() ? 1 : 0}
            />
            <Index each={chips()}>
              {(ch) => {
                const ink = () => (chipOn(ch().i) ? look().onAccent : navCur() === ch().i ? look().accent : look().os(0.8))
                return (
                  <view x={ch().x} y={18} width={ch().w} height={55} onPointerOver={() => pointNav(ch().i)}>
                    <view
                      width={ch().w}
                      height={55}
                      borderRadius={22}
                      color={chipOn(ch().i) ? look().accent : navCur() === ch().i ? look().accentA(0.16) : look().os(0.09)}
                      border={{ width: 1, color: hex(chipOn(ch().i) ? look().accent : NONE) }}
                    />
                    <view x={19} y={15.5} width={24} height={24} src={ch().icon} color={ink()} />
                    <text fontFamily={uiFont('bold')} fontSize={15} x={53} y={lineY(11, 33, 15)} color={ink()}>
                      {ch().label}
                    </text>
                  </view>
                )
              }}
            </Index>
          </view>
        </Show>
      </view>
      <view>
        <Show when={nav === 'rail'}>
          <view width={248} height={1080} color={look().os(0.03)}>
            <text fontFamily={uiFont('bold')} fontSize={24} x={24} y={16 + lineY(0, 33, 24)} color="#ffffffff">
              {railName()}
            </text>
            <Index each={railRows()}>
              {(rr) => {
                const ink = () => (navCur() === rr().i ? look().accent : look().os(0.86))
                return (
                  <view x={12} y={rr().y} width={224} height={44}>
                    <view width={224} height={44} borderRadius={10} color={navCur() === rr().i ? look().accentA(0.16) : NONE} />
                    <view
                      x={-3}
                      y={-3}
                      width={230}
                      height={50}
                      borderRadius={13}
                      color={NONE}
                      border={{ width: 3, color: hex(look().focus) }}
                      alpha={st.onStrip && st.scur === rr().i ? 1 : 0}
                    />
                    <view x={12} y={12} width={20} height={20} src={rr().icon} color={ink()} />
                    <text fontFamily={uiFont('bold')} fontSize={15} x={44} y={lineY(5, 33, 15)} maxWidth={168} maxLines={1} color={ink()}>
                      {rr().label}
                    </text>
                    <view width={224} height={44} onPointerOver={() => pointNav(rr().i)} />
                  </view>
                )
              }}
            </Index>
          </view>
        </Show>
      </view>
    </view>
  )
}
