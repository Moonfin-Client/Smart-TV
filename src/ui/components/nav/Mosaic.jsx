import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSignal } from 'solid-js'
import { uiFont, fontFor, textWidth, faceDy, themeSpacing } from '../../text.js'
import { theme, glowShadow } from '../../theme.js'
import { highMs } from '../../tier.js'
import { focusActivePage } from '../../../state/pages.js'
import { getStore } from '../../../state/store.js'
import { router } from '../../../app/router.js'
import { audio } from '../../../state/audioPlayer.js'
import { getFeaturedBackdropUrl } from '../../../utils/helpers.js'
import { modernCardImageUrl } from '../home/cardArtwork.js'
import { navVisibility, navEntries, openEntry, currentEntryIndex, navFeatured } from './navEntries.js'
import { navClock, friendsTicker, fontsReady, navUser } from './navKit.js'
import { AVATAR_RECT, mosaicPlaces, mosaicMove, mosaicScroll } from './mosaicLayout.js'
import MosaicTile from './MosaicTile.jsx'

// The Mosaic sidebar. At rest a round menu button sits at the top left. Focus opens an 840px panel
// over a dim with the profile, the clock and the tiles from mosaicLayout.js. Focus moves between
// tiles by where they sit, and Right off the right column goes back to the page.
const PANEL_SHADOW = glowShadow({ color: '#0000008c', x: 45, y: 0, blur: 90, spread: 0 }).shadow
const GONE = { key: '', kind: 'small', x: 0, y: 0, w: 0, h: 0, label: '', boldFont: 'roboto', icon: '', art: '', current: false }

export default function Mosaic(props) {
  const store = getStore()
  const nav = { $store: store, $router: router }
  const friendsTick = friendsTicker()
  const measured = fontsReady()
  const [open, setOpen] = createSignal(false)
  const [cur, setCur] = createSignal('home')
  const [scroll, setScroll] = createSignal(0)
  const fx = highMs(150)
  const nodes = {}

  const vis = createMemo(() => navVisibility(store, friendsTick()))
  const entries = createMemo(() => navEntries(vis(), { side: true, splitLibraries: true, nowPlaying: !!audio.active }))
  const current = () => {
    const e = entries()[currentEntryIndex(entries(), props.preview ? 'home' : store.navSection)]
    return e ? e.key : 'home'
  }
  // Every tile with its place in the panel, built while the panel is open.
  const tiles = createMemo(() => {
    if (!open()) return []
    measured()
    const serverUrl = store.serverUrl
    const now = current()
    return mosaicPlaces(entries()).map((p) => {
      const e = p.e
      const tile = {
        key: p.key,
        kind: p.kind,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        label: e.label,
        boldFont: fontFor(e.label, 'bold'),
        icon: e.icon,
        art: '',
        current: now === e.key,
      }
      if (p.kind === 'home') {
        const feat = navFeatured()
        const sub = feat ? $L('Featured: {title}').replace('{title}', feat.Name) : ''
        tile.sub = sub
        tile.subFont = fontFor(sub)
        tile.labelW = Math.round(Math.max(textWidth(e.label, 30, 'bold'), sub ? textWidth(sub, 20, 'regular') : 0))
        tile.art = feat ? getFeaturedBackdropUrl(feat._serverUrl || serverUrl, feat, { maxWidth: 800, quality: 80 }) || '' : ''
      } else if (p.kind === 'big') {
        tile.art = modernCardImageUrl(e.library, false, { itemServerUrl: e.library._serverUrl || serverUrl, isStaticMyMedia: true }) || ''
      }
      return tile
    })
  })
  const tileKeys = createMemo(() => tiles().map((tl) => tl.key))
  const tileByKey = createMemo(() => {
    const out = {}
    tiles().forEach((tl) => (out[tl.key] = tl))
    return out
  })
  const tile = (k) => tileByKey()[k] || GONE
  const rects = () => [AVATAR_RECT].concat(tiles())
  const contentH = () => {
    const list = tiles()
    const last = list[list.length - 1]
    return last ? last.y + last.h + 33 : 0
  }
  const { avatar, name: userName, initial } = navUser(store)
  const clock = navClock(() => vis().showClock && open())

  const keepInView = () => {
    const r = rects().find((x) => x.key === cur())
    if (r) setScroll(mosaicScroll(r, scroll(), contentH()))
  }
  const move = (dir) => {
    const next = mosaicMove(rects(), cur(), dir)
    if (!next) return false
    setCur(next)
    keepInView()
    return true
  }
  // Remote focus on the menu button opens the panel, with focus on the current page's tile.
  const onFocusChanged = (has) => {
    if (has) {
      setOpen(true)
      setCur(current())
      setScroll(0)
      keepInView()
    } else {
      setOpen(false)
    }
  }
  const closeToContent = () => focusActivePage()

  return (
    <view
      ref={props.ref}
      width={1920}
      height={1080}
      alpha={props.hidden && !open() ? 0 : 1}
      transition={{ alpha: { duration: 250 } }}
      seasonalZone="nav"
      focusTarget={() => nodes[cur()]}
      onFocusChanged={onFocusChanged}
      onUp={() => {
        move('up')
        return true
      }}
      onDown={() => {
        move('down')
        return true
      }}
      onLeft={() => {
        move('left')
        return true
      }}
      onRight={() => {
        if (!move('right')) closeToContent()
        return true
      }}
      onEnter={() => {
        if (cur() === 'avatar') {
          closeToContent()
          openEntry(nav, { action: 'account' })
          return true
        }
        const e = entries().find((x) => x.key === cur())
        closeToContent()
        openEntry(nav, e)
        return true
      }}
      onBack={() => {
        closeToContent()
        return true
      }}
    >
      <view x={30} y={33} width={66} height={66} alpha={open() ? 0 : 1}>
        <view width={66} height={66} borderRadius={33} color="#14161ab8" border={{ width: 1, color: 0xffffff24 }} />
        <view x={16.5} y={16.5} width={33} height={33} src="icons/nav_apps.webp" color="#ffffffff" />
      </view>
      <view width={1920} height={1080} alpha={open() ? 1 : 0}>
        <view width={1920} height={1080} color="#0000008c" />
        <view x={840} width={1080} height={1080} clipping>
          <view x={-840} width={840} height={1080} color="#00000000" shadow={PANEL_SHADOW} />
        </view>
        <view width={840} height={1080} color={theme().background} />
        <view width={840} height={1080} clipping>
          <view y={-scroll()} width={840} height={Math.max(1080, contentH())} transition={{ y: { duration: fx } }}>
            <view
              ref={(n) => (nodes.avatar = n)}
              x={38}
              y={30.5}
              width={65}
              height={65}
              borderRadius={32.5}
              color="#ffffffff"
              alpha={cur() === 'avatar' ? 1 : 0}
            />
            <view x={42} y={34.5} width={57} height={57} borderRadius={28.5} color="#2b3440ff">
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
                  y={34.5}
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
              y={54 + faceDy(22, true)}
              lineHeight={1}
              maxWidth={540}
              maxLines={1}
              color="#ffffffff"
            >
              {userName()}
            </text>
            <text
              letterSpacing={themeSpacing()}
              fontFamily={uiFont('regular')}
              fontSize={21}
              x={798}
              y={54.5 + faceDy(21, true)}
              mountX={1}
              lineHeight={1}
              color="#ffffff8c"
            >
              {clock()}
            </text>
          </view>
          <view y={-scroll()} width={840} height={Math.max(1080, contentH())} transition={{ y: { duration: fx } }}>
            <For each={tileKeys()}>{(k) => <MosaicTile ref={(n) => (nodes[k] = n)} tile={tile(k)} focused={cur() === k} fx={fx} />}</For>
          </view>
        </view>
      </view>
    </view>
  )
}
