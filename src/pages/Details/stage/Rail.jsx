import { For, createMemo, createSelector, createSignal, untrack } from 'solid-js'
import { wrapLines } from '../../../ui/components/details/measure.js'
import { byKey } from '../../../ui/components/details/keyed.js'
import { cssShift, fontFor, themeSpacing } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { navOnLeft } from '../../../ui/theme.js'
import { highMs } from '../../../ui/tier.js'
import { focusNav } from '../../../app/focus.js'
import { holdPress } from '../../../utils/longPress.js'
import { tx } from '../../../ui/fx.js'
import { pointerFocus } from '../../../app/pointer.js'

// A titled row of Stage's cards. Kinds:
//   poster  250x375 art, 1.12 from its foot when focused under a 5px ring, title and subtitle under it
//   extra   the same at 284x160
//   person  a 150px round photo in a ring, name and role under it, the whole card 1.05 when focused
// The track runs `bleed` past the left edge and `bleedRight` past `w`, clipped there, and keeps the
// focused card 50px clear of either end. Only the cards near the visible track are built.
//
// Props: `tokens`, `zoom` (false keeps focused cards their size), `x`, `y`, `ref`. Its node has
// draw({id, title, kind, entries, w, gap, clearance, bleed, bleedRight, titleGap, start,
// sectionTitle}), which lays it out and returns its height, contentHeight(), current() (the focused
// entry's `raw`), and cards(), cur() and trackY() for the page's scrolling. `entries` are {k, title,
// subtitle, img, fav, played, progress, dot, missing, placeholder} plus `raw`, the item handed back.
// Calls onRailEdge(id, dir) for Up, Down, and Left off the first or Right off the last card (the
// page says whether it took the press by returning true), onRailSelect(id, raw, i), onRailLong(id,
// raw, i) for a held Enter or the menu key, onRailFocus(id, box, i) with the focused card's {y, h}
// in rail pixels, and onRailNearEnd(id) within eight cards of the end.
const CLEARANCE = 50
// Cards this far past either end of the visible track are built too, so a slide shows no gap.
const WINDOW = 600
const CARD_SHADOW = { color: '#00000080', x: 0, y: 1, blur: 4 }
const SIZES = {
  poster: { w: 250, h: 375 },
  extra: { w: 284, h: 160 },
  person: { w: 167, h: 307 },
}
const COVER = { resizeMode: { type: 'cover' } }
const SLIDE = { x: { duration: 220, easing: 'ease-out' } }

// The marks on a poster: a favorite on the left, and on the right whichever of watched, Seerr's
// missing-title badge or its status dot the card carries. Absent ones are drawn see-through, and keep
// an icon so the tint holds when one comes back.
const OFF = { show: 0, x: 0, y: 0, w: 0, r: 0, fill: '#00000000', bw: 0, ring: '#00000000', ix: 0, iy: 0, iw: 0, src: 'icons/d/favorite.webp', ink: '#00000000' }
const leftBadge = (e, t) => (e.fav
  ? { show: 1, x: 10, y: 10, w: 37, r: 18.5, fill: '#f44336ff', bw: 1.5, ring: '#ffffffff', ix: 8, iy: 8.5, iw: 21, src: 'icons/d/favorite.webp', ink: t.onBadge || '#ffffffff' }
  : OFF)
const rightBadge = (e, w, t) => {
  if (e.dot) {
    const d = e.dot
    return { show: 1, x: w - 10 - d.size, y: 10, w: d.size, r: d.size / 2, fill: d.fill, bw: 2, ring: d.ring, ix: d.iconAt, iy: d.iconAt, iw: d.iconSize, src: `icons/${d.icon}.webp`, ink: d.iconColor }
  }
  if (e.missing) return { show: 1, x: w - 39, y: 7, w: 32, r: 16, fill: '#6366f1ff', bw: 0, ring: '#00000000', ix: 3, iy: 3, iw: 26, src: 'icons/nav_seerr.webp', ink: '#ffffffff' }
  if (e.played) {
    return { show: 1, x: w - 47, y: 10, w: 37, r: 18.5, fill: t.badgeWatched || '#00a4dce6', bw: 1.5, ring: t.onBadge || '#ffffffff', ix: 7.5, iy: 7.5, iw: 22, src: 'icons/d/watched.webp', ink: t.onBadge || '#ffffffff' }
  }
  return OFF
}
const GONE = {
  k: '', idx: -1, raw: null, x: 0, y: 0, cw: 0, ch: 0, person: false, img: '', ax: 0, ay: 0, aw: 0, ah: 0, ar: 0, bg: '#00000000', rx: 0, rr: 0, rw: 0,
  placeholder: '', lb: OFF, rb: OFF, progress: 0, title: '', titleFont: 'roboto', titleSize: 20, titleLh: 27, titleLines: 1, titleY: 0,
  subtitle: '', subtitleFont: 'roboto', subSize: 20, subLh: 26, subLines: 1, subY: 0, align: 'left',
}
const NO_LAY = { title: '', titleFont: 'roboto', titleY: 0, titleH: 0, ts: { size: 36.7, lh: 46.6, ls: 0, color: '#ffffffff' }, trackY: 0, trackH: 0, viewX: 0, viewW: 0, contentW: 0, cw: 250 }

export default function StageRail(props) {
  const [lay, setLay] = createSignal(NO_LAY)
  const [cards, setCards] = createSignal([])
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const t = () => props.tokens || { focus: '#00a4dcff' }
  const ring = () => hex(t().focus)
  const zoom = () => props.zoom !== false
  const isOn = createSelector(() => (focused() ? cur() : -1))
  const scaleMs = () => ({ scale: { duration: highMs(150), easing: 'ease-out' } })
  // What draw() worked out that only the key handlers read.
  const m = { id: null, cfg: null, bleed: 0, lead: 0, gap: 0, n: 0, scrolled: false }

  const shown = createMemo(() => {
    const from = scroll() - WINDOW
    const to = scroll() + lay().viewW + WINDOW
    return cards().filter((c) => c.x + c.cw >= from && c.x <= to)
  })
  const list = byKey(shown, GONE)

  const contentHeight = () => (cards().length ? lay().titleH + lay().trackH : 0)

  const draw = (cfg) =>
    untrack(() => {
      const kind = cfg.kind || 'poster'
      const size = SIZES[kind]
      const person = kind === 'person'
      const gap = cfg.gap
      const clearance = cfg.clearance
      const bleed = cfg.bleed || 0
      const bleedRight = cfg.bleedRight || 0
      const tk = t()
      m.cfg = cfg
      if (m.id !== cfg.id) {
        m.id = cfg.id
        setCur(Math.max(0, Math.min(cfg.start || 0, cfg.entries.length - 1)))
        setScroll(0)
        m.scrolled = false
      }
      if (cur() >= cfg.entries.length) setCur(Math.max(0, cfg.entries.length - 1))
      const lead = person ? 6.7 : 0
      // Inside one of Premiere's frames, the row's title takes the frame title's look.
      const ts = cfg.sectionTitle ? { size: 23.4, lh: 33.46, ls: 3.3, color: '#ffffffbf' } : { size: 36.7, lh: 46.6, ls: 0, color: '#ffffffff' }
      const titleH = cfg.title ? ts.lh + Math.max(0, cfg.titleGap - clearance) : 0
      const hasSub = cfg.entries.some((e) => e.subtitle)
      const cardH = person ? size.h : size.h + 10 + 28.2 + (hasSub ? 26 : 0)
      const title = cfg.sectionTitle ? String(cfg.title || '').toUpperCase() : cfg.title || ''
      const n = cfg.entries.length
      m.bleed = bleed
      m.lead = lead
      m.gap = gap
      m.n = n
      setLay({
        title, titleFont: fontFor(title, cfg.sectionTitle ? 'bold' : 'regular'), titleY: cssShift(ts.size), titleH, ts,
        trackY: titleH, trackH: clearance + cardH + clearance, viewX: -bleed, viewW: cfg.w + bleed + bleedRight,
        contentW: Math.max(cfg.w + bleed + bleedRight, bleed + lead + n * (size.w + gap) + bleedRight), cw: size.w,
      })
      setCards(
        cfg.entries.map((e, i) => {
          const base = { k: e.k, idx: i, raw: e.raw, x: bleed + lead + i * (size.w + gap), y: clearance, cw: size.w, ch: cardH, person, img: e.img || '' }
          if (person) {
            const nameLines = Math.max(1, Math.min(2, wrapLines(e.title || '', 20, 'bold', size.w).length))
            const roleLines = e.subtitle ? Math.min(3, wrapLines(e.subtitle, 18.4, 'regular', size.w).length) : 1
            return {
              ...base, ax: 8, ay: 5, aw: 150, ah: 150, ar: 75, bg: '#ffffff14', rx: -5, rr: 80.5, rw: 2, placeholder: '', lb: OFF, rb: OFF, progress: 0,
              title: e.title || '', titleFont: fontFor(e.title || '', 'bold'), titleSize: 20, titleLh: 27, titleLines: 2, titleY: 178 + cssShift(20),
              subtitle: e.subtitle || '', subtitleFont: fontFor(e.subtitle || '', 'regular'), subSize: 18.4, subLh: 24.84, subLines: roleLines,
              subY: 178 + nameLines * 27 + cssShift(18.4), align: 'center',
            }
          }
          return {
            ...base, ax: 0, ay: 0, aw: size.w, ah: size.h, ar: 13, bg: '#ffffff0f', rx: -8, rr: 21, rw: 5,
            placeholder: (e.placeholder != null ? e.placeholder : e.title || '').toUpperCase(), lb: leftBadge(e, tk), rb: rightBadge(e, size.w, tk), progress: e.progress || 0,
            title: e.title || '', titleFont: fontFor(e.title || '', 'bold'), titleSize: 21.7, titleLh: 28.2, titleLines: 1, titleY: size.h + 10 + cssShift(21.7),
            subtitle: e.subtitle || '', subtitleFont: fontFor(e.subtitle || '', 'regular'), subSize: 20, subLh: 26, subLines: 1,
            subY: size.h + 10 + 28.2 + cssShift(20), align: 'left',
          }
        }),
      )
      if (!m.scrolled && cur() > 0) reveal()
      return contentHeight()
    })

  const reveal = () => {
    const L = lay()
    const cw = L.cw
    const view = L.viewW
    const left = m.bleed + m.lead + cur() * (cw + m.gap) - scroll()
    let s = scroll()
    if (left < CLEARANCE) s -= CLEARANCE - left
    else if (left + cw > view - CLEARANCE) s += left + cw - (view - CLEARANCE)
    const content = m.bleed + m.lead + m.n * (cw + m.gap) - m.gap + ((m.cfg && m.cfg.bleedRight) || 0)
    setScroll(Math.max(0, Math.min(s, content - view)))
    m.scrolled = true
  }
  const report = () => {
    const c = cards()[cur()]
    if (!c) return
    if (props.onRailFocus) props.onRailFocus(m.id, { y: lay().trackY + c.y, h: c.person ? 161 : c.ah }, cur())
    if (m.n - cur() <= 8 && props.onRailNearEnd) props.onRailNearEnd(m.id)
  }
  let self
  const move = (i) => {
    setCur(i)
    reveal()
    report()
    return true
  }
  const edge = (dir) => Boolean(props.onRailEdge && props.onRailEdge(m.id, dir))

  // A rail with a menu opens it when Enter is held, so its cards act on release.
  const hold = holdPress()

  return (
    <view
      ref={(n) => {
        self = n
        n.draw = draw
        n.contentHeight = contentHeight
        n.current = () => {
          const c = cards()[cur()]
          return c ? c.raw : null
        }
        n.cards = cards
        n.cur = cur
        n.trackY = () => lay().trackY
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={lay().viewW}
      height={contentHeight()}
      alpha={cards().length ? 1 : 0}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) {
          reveal()
          report()
        } else {
          hold.cancel()
        }
      }}
      onUp={() => {
        edge('up')
        return true
      }}
      onDown={() => {
        edge('down')
        return true
      }}
      onLeft={() => {
        if (cur() > 0) return move(cur() - 1)
        if (edge('left')) return true
        if (navOnLeft()) {
          focusNav()
          return true
        }
        if (m.n > 1) move(m.n - 1)
        return true
      }}
      onRight={() => {
        if (cur() < m.n - 1) return move(cur() + 1)
        if (edge('right')) return true
        if (m.n > 1) move(0)
        return true
      }}
      onEnter={() => {
        const c = cards()[cur()]
        if (!c) return true
        if (!props.onRailLong) {
          if (props.onRailSelect) props.onRailSelect(m.id, c.raw, cur())
          return true
        }
        hold.start(c, () => {
          props.onRailLong(m.id, c.raw, c.idx)
        })
        return true
      }}
      // A remote's menu key opens the focused card's menu at once, on a rail that has menus. Seerr's
      // titles and the cast have none.
      onMenu={() => {
        const c = cards()[cur()]
        if (!c || !m.cfg || !m.cfg.menu || !c.raw || c.raw._seerr || !props.onRailLong) return false
        props.onRailLong(m.id, c.raw, c.idx)
        return true
      }}
      onEnterRelease={() => {
        return hold.end((c) => {
          if (props.onRailSelect) props.onRailSelect(m.id, c.raw, c.idx)
        })
      }}
    >
      <text
        y={lay().titleY}
        fontFamily={lay().titleFont}
        fontSize={lay().ts.size}
        lineHeight={lay().ts.lh}
        letterSpacing={lay().ts.ls || themeSpacing()}
        color={lay().ts.color}
      >
        {lay().title}
      </text>
      <view x={lay().viewX} y={lay().trackY} width={lay().viewW} height={lay().trackH} clipping>
        <view transition={SLIDE} x={-scroll()} width={lay().contentW} height={lay().trackH}>
          <view
            width={lay().contentW}
            height={lay().trackH}
            // The rail slides to its focused card, so the Magic Remote's cursor rings a card and a click
            // focuses it and opens it (app/pointer.js).
            pointerChildRing
            onPointerChildClick={(i, child) => {
              const c = list.at(list.keys()[i])
              if (!c) return false
              pointerFocus(self)
              if (c.idx !== cur()) move(c.idx)
              return true
            }}
          >
            <For each={list.keys()}>
              {(k) => {
                const c = () => list.at(k)
                const on = () => isOn(c().idx)
                return (
                  <view
                    transition={tx(scaleMs())}
                    x={c().x}
                    y={c().y}
                    width={c().cw}
                    height={c().ch}
                    pivotX={0.5}
                    pivotY={0.5}
                    scale={c().person && zoom() && on() ? 1.05 : 1}
                  >
                    <view
                      transition={tx(scaleMs())}
                      x={c().ax}
                      y={c().ay}
                      width={c().aw}
                      height={c().ah}
                      pivotX={0.5}
                      pivotY={1}
                      scale={!c().person && zoom() && on() ? 1.12 : 1}
                    >
                      <view width={c().aw} height={c().ah} borderRadius={c().ar} color={c().bg} />
                      <view
                        alpha={c().img ? 1 : 0}
                        width={c().aw}
                        height={c().ah}
                        borderRadius={c().ar}
                        src={c().img || undefined}
                        textureOptions={COVER}
                      />
                      <text
                        alpha={c().img ? 0 : 1}
                        x={10}
                        y={c().ah / 2 - 18}
                        fontFamily={c().titleFont}
                        fontSize={25}
                        letterSpacing={6}
                        color="#ffffff8c"
                        maxWidth={c().aw - 20}
                        maxLines={1}
                        textAlign="center"
                        contain="width"
                      >
                        {c().placeholder}
                      </text>
                      <view
                        alpha={c().lb.show}
                        x={c().lb.x}
                        y={c().lb.y}
                        width={c().lb.w}
                        height={c().lb.w}
                        borderRadius={c().lb.r}
                        color={c().lb.fill}
                        border={c().lb.bw ? { width: c().lb.bw, color: hex(c().lb.ring) } : undefined}
                      >
                        <view x={c().lb.ix} y={c().lb.iy} width={c().lb.iw} height={c().lb.iw} src={c().lb.src} color={c().lb.ink} />
                      </view>
                      <view
                        alpha={c().rb.show}
                        x={c().rb.x}
                        y={c().rb.y}
                        width={c().rb.w}
                        height={c().rb.w}
                        borderRadius={c().rb.r}
                        color={c().rb.fill}
                        border={c().rb.bw ? { width: c().rb.bw, color: hex(c().rb.ring) } : undefined}
                      >
                        <view x={c().rb.ix} y={c().rb.iy} width={c().rb.iw} height={c().rb.iw} src={c().rb.src} color={c().rb.ink} />
                      </view>
                      <view alpha={c().progress > 0 ? 1 : 0} x={10} y={c().ah - 20} width={c().aw - 20} height={10} borderRadius={5} color="#0000008a">
                        <view width={(c().aw - 20) * c().progress} height={10} borderRadius={5} color={t().accent || '#00a4dcff'} />
                      </view>
                      <view
                        alpha={on() ? 1 : 0}
                        x={c().rx}
                        y={c().rx}
                        width={c().aw - 2 * c().rx}
                        height={c().ah - 2 * c().rx}
                        borderRadius={c().rr}
                        color="#00000000"
                        border={{ width: c().rw, color: ring() }}
                      />
                    </view>
                    <text
                      y={c().titleY}
                      fontFamily={c().titleFont}
                      fontSize={c().titleSize}
                      lineHeight={c().titleLh}
                      letterSpacing={themeSpacing()}
                      color="#ffffffff"
                      maxWidth={c().cw}
                      maxLines={c().titleLines}
                      textAlign={c().align}
                      contain="width"
                      textShadow={c().person ? undefined : CARD_SHADOW}
                    >
                      {c().title}
                    </text>
                    <text
                      alpha={c().subtitle ? 1 : 0}
                      y={c().subY}
                      fontFamily={c().subtitleFont}
                      fontSize={c().subSize}
                      lineHeight={c().subLh}
                      letterSpacing={themeSpacing()}
                      color="#ffffff99"
                      maxWidth={c().cw}
                      maxLines={c().subLines}
                      textAlign={c().align}
                      contain="width"
                      textShadow={c().person ? undefined : CARD_SHADOW}
                    >
                      {c().subtitle}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
        </view>
      </view>
    </view>
  )
}
