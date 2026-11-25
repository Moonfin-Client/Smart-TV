import $L from '../../../services/i18n.js'
import { For, Index, Show, createEffect, createMemo, createSelector, on } from 'solid-js'
import MusicCard from './MusicCard.jsx'
import MusicFilterPanel from './MusicFilterPanel.jsx'
import MusicSkeleton from './MusicSkeleton.jsx'
import { lineY } from '../books/bookGrid.js'
import { Kept } from '../library/pageKit.js'
import { uiFont, fontFor, textWidth } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { reactive } from '../../../state/reactive.js'
import { trackArt } from './trackArt.js'
import { classicCardSize } from '../home/rowPeek.js'
import * as settings from '../../../state/settings.js'
import { SEE_ALL_TARGET, mediaCard, openMusicItem, subtitleFor } from '../../../pages/Music/music.js'

const SEE_ALL_W = 122
const SEE_ALL_H = 125
const SEE_ALL_STEP = SEE_ALL_W + 24
const CHIP_KEYS = ['albums', 'artists', 'playlists', 'genres', 'favorites']
const NONE = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }
// The header, banner and chips keep the default blue whatever the theme. Only the rows' See All
// follows it.
const SHEET_ACCENT = '#00a4dc'
const sheetGlow = (alpha, blur) => ({ color: shadowColor(SHEET_ACCENT + Math.round(alpha * 255).toString(16)), x: 0, y: 0, blur, spread: 1 })
const CHIP_GLOW = sheetGlow(0.45, 14)
const HERO_GLOW = sheetGlow(0.47, 18)
const PLAY_GLOW = sheetGlow(0.6, 14)
const GLIDE = { x: { duration: 220, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' } }

const chips = () => [
  { id: 'albums', label: $L('Albums'), icon: 'mus_chip_albums' },
  { id: 'artists', label: $L('Artists'), icon: 'mus_chip_artists' },
  { id: 'playlists', label: $L('Playlists'), icon: 'mus_chip_playlists' },
  { id: 'genres', label: $L('Genres'), icon: 'mus_chip_genres' },
  { id: 'favorites', label: $L('Favorites'), icon: 'mus_chip_favorites' },
]

// The rows use MusicCard rather than Home's ClassicCard, since ClassicCard leaves out the theme's
// focus glow.
function Row(props) {
  const look = () => props.look
  const r = () => props.row
  const lead = () => (r().seeAll ? SEE_ALL_STEP : 0)
  const sel = createSelector(() => props.focus - (r().seeAll ? 1 : 0))
  const seeAllOn = () => r().seeAll && props.focus === 0
  const cards = createMemo(() =>
    r().cards.filter((c) => {
      const x = 60 + lead() + c.idx * r().step - props.sx
      return x + r().cardH > -400 && x < 1920 + 400
    })
  )
  const seeAllY = () => (r().cardH + r().info - SEE_ALL_H) / 2
  return (
    <view y={r().y} width={1920} height={r().h}>
      <text fontFamily={uiFont('bold')} fontSize={28} x={60} y={lineY(0, 33, 28)} color={look().onSurface}>
        {r().title}
      </text>
      <view y={49} width={1920} height={r().h - 49} clipping>
        <view transition={GLIDE} x={60 - props.sx} y={20} width={lead() + r().cards.length * r().step + 1920} height={r().h - 69}>
          <view>
            <Show when={r().seeAll}>
              <view y={seeAllY()} width={SEE_ALL_W} height={SEE_ALL_H}>
                <view
                  width={SEE_ALL_W}
                  height={SEE_ALL_H}
                  borderRadius={16}
                  color={NONE}
                  shadow={{ color: shadowColor(look().accentA(0.45)), x: 0, y: 0, blur: 14, spread: 1 }}
                  alpha={seeAllOn() ? 1 : 0}
                />
                <view
                  width={SEE_ALL_W}
                  height={SEE_ALL_H}
                  borderRadius={16}
                  color={seeAllOn() ? look().accentA(0.22) : look().os(0.08)}
                  border={{ width: 1, color: hex(seeAllOn() ? look().accent : NONE) }}
                />
                <text fontFamily={uiFont('bold')} fontSize={34} x={61} y={22} mountX={0.5} color={look().accent}>
                  ›
                </text>
                <text fontFamily={uiFont('bold')} fontSize={15} x={61} y={lineY(67, 33, 15)} mountX={0.5} color={seeAllOn() ? look().onSurface : look().os(0.7)}>
                  {$L('See All')}
                </text>
              </view>
            </Show>
          </view>
          <view width={lead() + r().cards.length * r().step} height={r().h - 69}>
            <For each={cards()}>
              {(cd) => <MusicCard x={lead() + cd.idx * r().step} card={cd} size={r().cardH} look={look()} focused={sel(cd.idx)} />}
            </For>
          </view>
        </view>
      </view>
    </view>
  )
}

export default function ClassicMusic(props) {
  const look = () => props.look
  const st = reactive({ zone: 'chips', hcur: 0, ccur: 0, row: 0, rowCur: [], rowX: [], scrollY: 0, active: false, filterOn: false })
  const my = { landed: false }
  let root
  let filterRef = null

  const hero = () => !props.loading && !!props.featured
  const heroImg = () => trackArt(props.featured, 400)
  const title = () => (props.library && props.library.Name) || $L('Music')
  const side = () => classicCardSize('square', settings.get('homeRowsPosterSize')).width
  const chipModels = createMemo(() => {
    let x = 60
    return chips().map((c, i) => {
      const w = Math.ceil(1 + 18 + 24 + 10 + textWidth(c.label, 15, 'bold') + 18 + 1)
      const out = { ...c, i, x, w }
      x += w + 10
      return out
    })
  })
  const layout = createMemo((prev) => {
    const old = {}
    ;((prev && prev.rows) || []).forEach((r) => (old[r.k] = r))
    let y = 0
    const heroY = y + 8
    if (hero()) y += 8 + 222 + 12
    const chipsY = y + 6
    y += 6 + 55 + 8
    const sd = side()
    const rows = (props.rows || []).map((r, i) => {
      const was = old[r.id]
      const cards = was && was.raw === r && was.cardH === sd ? was.cards : r.items.map((it, n) => mediaCard(it, n, r.cardType === 'circle'))
      const info = cards.some((c) => c.subtitle) ? 86 : 53
      const h = 33 + 16 + 20 + sd + info + 20 + 30
      const seeAll = !!SEE_ALL_TARGET[r.id]
      // A row is entered on its first card rather than the See All ahead of it.
      const out = was && was.raw === r && was.cardH === sd && was.y === y && was.i === i ? was : { k: r.id, i, raw: r, y, h, title: r.title, cards, cardH: sd, step: sd + 24, info, seeAll, entry: seeAll ? 1 : 0 }
      y += h
      return out
    })
    return { heroY, chipsY, rows, end: y + 60 }
  })
  const chain = createMemo(() => ['header'].concat(hero() ? ['hero'] : [], ['chips'], layout().rows.map((r) => 'row:' + r.i)))
  const live = () => st.active && !st.filterOn
  const homeFocus = () => live() && st.zone === 'header' && st.hcur === 0
  const filterFocus = () => live() && st.zone === 'header' && st.hcur === 1
  const heroFocus = () => live() && st.zone === 'hero'
  const chipFocus = () => (live() && st.zone === 'chips' ? st.ccur : -1)
  const curOf = (i) => {
    const c = st.rowCur[i]
    return c >= 0 ? c : layout().rows[i].entry
  }

  const landFirst = () => {
    if (my.landed) return
    my.landed = true
    focusNode(hero() ? 'hero' : 'chips')
  }
  const nodeRect = (node) => {
    const l = layout()
    if (node === 'hero') return [l.heroY, l.heroY + 222]
    if (node === 'chips') return [l.chipsY, l.chipsY + 55]
    const r = l.rows[parseInt(node.slice(4), 10)]
    if (!r) return [0, 0]
    const top = r.y + 49 + 20
    if (r.seeAll && curOf(r.i) === 0) return [top + (r.cardH + r.info - SEE_ALL_H) / 2, top + (r.cardH + r.info + SEE_ALL_H) / 2]
    return [top, top + r.cardH + r.info]
  }
  // The scroll is measured from the top each time, like a browser's focus scroll: it doesn't move
  // when the stop shows whole, goes by the near edge when part of it shows, and centers it when
  // none of it does.
  const focusNode = (node) => {
    if (node === 'header') {
      st.zone = 'header'
      return
    }
    if (node === 'hero') st.zone = 'hero'
    else if (node === 'chips') st.zone = 'chips'
    else {
      st.zone = 'row'
      st.row = parseInt(node.slice(4), 10)
    }
    const [top, bottom] = nodeRect(node)
    const view = 994
    let y = 0
    if (bottom > view) y = top < view ? bottom - view : (top + bottom - view) / 2
    st.scrollY = Math.max(0, Math.min(y, Math.max(0, layout().end - view)))
  }
  const nodeOf = () => (st.zone === 'row' ? 'row:' + st.row : st.zone)
  const step = (d) => {
    const c = chain()
    const next = c[c.indexOf(nodeOf()) + d]
    if (next) focusNode(next)
  }
  // The focused card, or the See All, glides to the row's leading edge, as far as the lane scrolls.
  const setRowCur = (i, cur) => {
    const rc = st.rowCur.slice()
    rc[i] = cur
    st.rowCur = rc
    const row = layout().rows[i]
    const lead = row.seeAll ? SEE_ALL_STEP : 0
    const x = cur === 0 && row.seeAll ? 0 : lead + (cur - (row.seeAll ? 1 : 0)) * row.step
    const laneW = lead + row.cards.length * row.step - 24
    const rx = st.rowX.slice()
    rx[i] = Math.max(0, Math.min(x, 60 + laneW + 60 - 1920))
    st.rowX = rx
  }
  const openFilter = () => {
    st.filterOn = true
    if (filterRef) filterRef.setFocus()
  }
  const closeFilter = () => {
    st.zone = 'header'
    st.hcur = 1
    root.setFocus()
    st.filterOn = false
  }

  createEffect(
    on(
      () => props.loading,
      (v) => {
        if (!v) setTimeout(landFirst, 0)
      }
    )
  )

  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      color="#0a0a0aff"
      onFocusChanged={(has) => (st.active = has)}
      onLeft={() => {
        if (st.zone === 'header') st.hcur = 0
        else if (st.zone === 'chips') st.ccur = Math.max(0, st.ccur - 1)
        else if (st.zone === 'row') {
          const cur = curOf(st.row)
          const row = layout().rows[st.row]
          if (cur > 0) setRowCur(st.row, cur - 1)
          // Left from the first stop wraps to the last card, except with the nav on the left, even
          // though this page doesn't draw the nav.
          else if (settings.get('navbarPosition') !== 'left') setRowCur(st.row, row.cards.length - (row.seeAll ? 0 : 1))
        }
        return true
      }}
      onRight={() => {
        if (st.zone === 'header') st.hcur = 1
        else if (st.zone === 'chips') st.ccur = Math.min(CHIP_KEYS.length - 1, st.ccur + 1)
        else if (st.zone === 'row') {
          const row = layout().rows[st.row]
          const cur = curOf(st.row)
          if (cur < row.cards.length - (row.seeAll ? 0 : 1)) setRowCur(st.row, cur + 1)
          else setRowCur(st.row, row.entry)
        }
        return true
      }}
      onUp={() => {
        step(-1)
        return true
      }}
      onDown={() => {
        step(1)
        return true
      }}
      onEnter={() => {
        if (st.zone === 'header') {
          if (st.hcur === 0) props.onHome()
          else openFilter()
        } else if (st.zone === 'hero') {
          if (props.featured) openMusicItem(props.featured)
        } else if (st.zone === 'chips') props.onOpenGrid(CHIP_KEYS[st.ccur])
        else if (st.zone === 'row') {
          const row = layout().rows[st.row]
          const cur = curOf(st.row)
          if (row.seeAll && cur === 0) props.onOpenGrid(SEE_ALL_TARGET[row.k])
          else {
            const card = row.cards[cur - (row.seeAll ? 1 : 0)]
            if (card) openMusicItem(card.raw)
          }
        }
        return true
      }}
    >
      <view y={86} width={1920} height={994} clipping>
        <view y={-st.scrollY} width={1920} height={Math.max(994, layout().end)}>
          <view x={60} y={layout().heroY} width={1800} height={222} alpha={hero() ? 1 : 0}>
            <view width={1800} height={222} borderRadius={16} color={NONE} shadow={HERO_GLOW} alpha={heroFocus() ? 1 : 0} />
            <view width={1800} height={222} borderRadius={16} color={heroFocus() ? '#ffffff26' : '#ffffff12'} border={{ width: 1, color: hex(heroFocus() ? SHEET_ACCENT : NONE) }} />
            <view x={1} y={1} width={220} height={220} color="#ffffff14" />
            <view>
              <Show when={heroImg()} keyed>
                {(src) => <view x={1} y={1} width={220} height={220} src={src} textureOptions={COVER} />}
              </Show>
            </view>
            <text fontFamily={uiFont('bold')} fontSize={11} letterSpacing={1} x={245} y={lineY(56.5, 33, 11)} color="#00a4dcff">
              {$L('JUMP BACK IN')}
            </text>
            <text fontFamily={fontFor((props.featured && props.featured.Name) || '', 'bold')} fontSize={24} x={245} y={lineY(56.5 + 39, 33, 24)} maxWidth={1454} maxLines={1} color="#ffffffff">
              {(props.featured && props.featured.Name) || ''}
            </text>
            <text fontFamily={uiFont()} fontSize={15} x={245} y={lineY(56.5 + 76, 33, 15) - 1} maxWidth={1454} maxLines={1} color="#ffffffb3">
              {subtitleFor(props.featured)}
            </text>
            <view x={1723} y={85} width={52} height={52} borderRadius={26} color={NONE} shadow={PLAY_GLOW} alpha={heroFocus() ? 1 : 0} />
            <view x={1723} y={85} width={52} height={52} borderRadius={26} color="#00a4dcff">
              <view x={10} y={10} width={32} height={32} src="icons/mus_play.webp" color="#ffffffff" />
            </view>
          </view>
          <view y={layout().chipsY} width={1920} height={55}>
            <view
              x={chipFocus() >= 0 ? chipModels()[chipFocus()].x : 0}
              width={chipFocus() >= 0 ? chipModels()[chipFocus()].w : 0}
              height={55}
              borderRadius={22}
              color={NONE}
              shadow={CHIP_GLOW}
              alpha={chipFocus() >= 0 ? 1 : 0}
            />
            <Index each={chipModels()}>
              {(ch) => {
                const f = () => chipFocus() === ch().i
                return (
                  <view x={ch().x} width={ch().w} height={55}>
                    <view width={ch().w} height={55} borderRadius={22} color={f() ? '#00a4dcff' : '#ffffff17'} border={{ width: 1, color: hex(f() ? SHEET_ACCENT : NONE) }} />
                    <view x={19} y={15.5} width={24} height={24} src={'icons/' + ch().icon + '.webp'} color={f() ? '#ffffffff' : '#ffffffcc'} />
                    <text fontFamily={uiFont('bold')} fontSize={15} x={53} y={lineY(11, 33, 15)} color={f() ? '#ffffffff' : '#ffffffcc'}>
                      {ch().label}
                    </text>
                  </view>
                )
              }}
            </Index>
          </view>
          <view width={1920} height={Math.max(994, layout().end)}>
            <Show when={props.loading}>
              <MusicSkeleton y={layout().chipsY + 63} />
            </Show>
          </view>
          <view width={1920} height={Math.max(994, layout().end)}>
            <Show when={!props.loading && !(props.rows || []).length}>
              <text fontFamily={uiFont()} fontSize={20} x={960} y={layout().chipsY + 69 + 200 - 12} mountX={0.5} color={look().os(0.5)}>
                {$L('No music items found')}
              </text>
            </Show>
          </view>
          <view width={1920} height={Math.max(994, layout().end)}>
            <For each={layout().rows}>
              {(rw) => (
                <Row
                  row={rw}
                  look={look()}
                  sx={st.rowX[rw.i] || 0}
                  focus={live() && st.zone === 'row' && st.row === rw.i ? (st.rowCur[rw.i] >= 0 ? st.rowCur[rw.i] : rw.entry) : -1}
                />
              )}
            </For>
          </view>
        </view>
      </view>
      <view x={60} y={16} width={62} height={62} borderRadius={31} color={NONE} shadow={CHIP_GLOW} alpha={homeFocus() ? 1 : 0} />
      <view x={1798} y={16} width={62} height={62} borderRadius={31} color={NONE} shadow={CHIP_GLOW} alpha={filterFocus() ? 1 : 0} />
      <view x={60} y={16} width={62} height={62}>
        <view width={62} height={62} borderRadius={31} color={homeFocus() ? '#00a4dcff' : '#ffffff17'} border={{ width: 1, color: hex(homeFocus() ? SHEET_ACCENT : NONE) }} />
        <view x={19} y={19} width={24} height={24} src="icons/nav_home.webp" color={homeFocus() ? '#ffffffff' : '#ffffffcc'} />
      </view>
      <text fontFamily={uiFont()} fontSize={34} x={136} y={lineY(31, 42, 34) - 3} maxWidth={1648} contain="width" textAlign="center" maxLines={1} color="#ffffffff">
        {title()}
      </text>
      <view x={1798} y={16} width={62} height={62}>
        <view width={62} height={62} borderRadius={31} color={filterFocus() ? '#00a4dcff' : '#ffffff17'} border={{ width: 1, color: hex(filterFocus() ? SHEET_ACCENT : NONE) }} />
        <view x={19} y={19} width={24} height={24} src="icons/mus_filter.webp" color={filterFocus() ? '#ffffffff' : '#ffffffcc'} />
      </view>
      <view>
        <Show when={st.filterOn}>
          <Kept gone={() => (filterRef = null)}>
            <MusicFilterPanel ref={(n) => (filterRef = n)} kind="library" look={look()} onFilterClose={closeFilter} onFilterChange={() => props.onSettingsChanged()} />
          </Kept>
        </Show>
      </view>
    </view>
  )
}
