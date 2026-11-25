import { createComputed, createMemo, createSignal, on, untrack } from 'solid-js'
import { fontFor, cssShift, normalLine, normalShift } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { Icons, Rects, Texts, appear } from './draw.jsx'
import { holdGuard } from './holdGuard.js'
import { tx } from '../../fx.js'

// A centered list modal: a title, then rows with a round mark (ticked on the picked one), a name
// and an optional detail line, grouped by dividers or small uppercase headings. Three looks:
// - 'track': the track pickers, a 660px panel over a near black screen.
// - 'sort': the sort and display options, hung from 12% down and 280px left of center.
// - 'panel': the playlist sort and filter dialogs, a 520px panel over a 70% scrim.
//
// Props: `sheet` ({variant, title, items: [{id, label, detail, selected, dimmed} | {divider} |
// {header}]}), `tokens`. Enter calls onSheetPick(id), Back onSheetClose(). The node handed to ref
// has cur() and setCur(i), so a holder that rebuilds the sheet can keep the row. `held` says a held
// OK opened it (Advanced Playback) and is still down.
const LOOK = {
  track: {
    scrim: '#000000f2', w: 662, bg: '#181818f0', border: '#ffffff29', r: 20, padTop: 30, padBottom: 30,
    titleSize: 30, titleX: 36, titleRule: true, listTop: 24, listBottom: 32, rowX: 0, rowW: 660, gap: 0,
  },
  sort: {
    scrim: '#00000099', w: 610, bg: '#121418f7', border: '#ffffff1f', r: 20, padTop: 24, padBottom: 24,
    titleSize: 28, titleX: 32, titleRule: false, listTop: 20, listBottom: 0, rowX: 24, rowW: 560, gap: 0, x: 680, y: 130,
  },
  panel: {
    scrim: '#000000b3', w: 570, bg: '#12141afa', border: '#ffffff26', r: 20, padTop: 28, padBottom: 28,
    titleSize: 26, titleX: 32, titleRule: false, listTop: 16, listBottom: 0, rowX: 24, rowW: 520, gap: 4, maxH: 922,
  },
}
// 80% of the screen for the list, plus the panel's padding and border.
const MAX_H = 926
const FADE = { duration: 200, easing: 'ease' }
const SLIDE = { duration: 300, easing: 'ease' }
const DEFAULT_TOKENS = { accent: '#0a84ffff', accentA: () => '#0a84ff4d', os: () => '#ffffff14', onBackground: '#ffffffff' }

const layoutSheet = (sh) => {
  const L = LOOK[sh.variant || 'track'] || LOOK.track
  const out = { look: L, rows: [], rules: [], heads: [], h: 0, titleFont: fontFor(sh.title || '', 'bold') }
  let y = 1 + L.padTop
  out.titleY = y + cssShift(L.titleSize)
  y += 33
  if (L.titleRule) {
    y += 18
    out.rules.push({ k: 'title', x: 1, y, w: L.w - 2 })
    y += 1
  }
  y += L.listTop
  let focusIdx = 0
  let prevRow = false
  let afterRule = false
  ;(sh.items || []).forEach((it, i) => {
    if (it.divider) {
      y += 8
      out.rules.push({ k: `d${i}`, x: L.rowX + 1, y, w: L.rowW })
      y += 1 + 8
      prevRow = false
      afterRule = true
      return
    }
    // A heading is a 33px line, 16px under a divider and 8px over its rows.
    if (it.header) {
      if (afterRule) y += 8
      out.heads.push({ k: `h${i}`, x: L.rowX + 9, y: y + cssShift(14), text: it.header.toUpperCase() })
      y += 33 + 8
      prevRow = false
      afterRule = false
      return
    }
    afterRule = false
    if (prevRow) y += L.gap
    // The name and detail stack in their face's normal line heights, 21px from the row's edges, in a
    // row at least 72 tall: 94 in Roboto, 86 in 8-bit Hero's pixel face.
    const labelFont = fontFor(it.label, 'bold')
    const detailFont = fontFor(it.detail || '')
    const labelH = normalLine(24, labelFont)
    const textH = labelH + (it.detail ? normalLine(20, detailFont) : 0)
    const h = Math.max(72, 42 + textH)
    out.rows.push({
      k: `r${i}-${it.id}`, id: it.id, idx: focusIdx++, x: L.rowX + 1, y, w: L.rowW, h,
      mark: it.selected ? 'radio_on' : 'radio_off', markY: y + (h - 30) / 2, selected: !!it.selected,
      label: it.label, labelFont, labelY: y + (h - textH) / 2 + normalShift(24, labelFont),
      detail: it.detail || '', detailFont, detailY: y + (h - textH) / 2 + labelH + normalShift(20, detailFont),
      textW: L.rowW - 36 - 30 - 18 - 36,
    })
    y += h
    prevRow = true
  })
  y += L.listBottom + L.padBottom + 1
  out.h = Math.min(L.maxH || (L.y != null ? 821 : MAX_H), y)
  out.full = y
  // `top` starts the overlay lower down the screen, as the playlist page's own layer does.
  out.top = sh.top || 0
  out.y = L.y != null ? L.y : out.top + Math.round((1080 - out.top - out.h) / 2)
  out.x = L.x != null ? L.x : Math.round((1920 - L.w) / 2)
  return out
}

export default function OptionSheet(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const t = () => props.tokens || DEFAULT_TOKENS
  const laid = createMemo(() => layoutSheet(props.sheet || { items: [] }))
  const look = () => laid().look
  const focusRow = () => laid().rows[cur()] || null
  const guard = holdGuard(props.held)
  // The track pickers fade the screen in over 200ms and slide the panel up 30px over 300ms.
  const shown = appear()
  const track = () => (props.sheet && props.sheet.variant ? props.sheet.variant : 'track') === 'track'
  const opened = () => shown() || !track()

  const reveal = () => {
    const L = untrack(laid)
    const r = L.rows[untrack(cur)]
    if (!r || L.full <= L.h) return setScroll(0)
    const s = untrack(scroll)
    if (r.y - s < 0) setScroll(r.y)
    else if (r.y + r.h - s > L.h) setScroll(r.y + r.h - L.h)
  }
  // A new sheet starts on its picked row.
  createComputed(
    on(
      () => props.sheet,
      () => {
        const picked = untrack(laid).rows.find((r) => r.selected)
        setCur(picked ? picked.idx : 0)
        setScroll(0)
        reveal()
      },
    ),
  )

  const marks = createMemo(() =>
    laid().rows.map((r) => ({ k: r.k, x: r.x + 36, y: r.markY, w: 30, h: 30, src: `icons/d/${r.mark}.webp`, color: r.selected ? t().accent : '#ffffff8c' })),
  )
  const labels = createMemo(() =>
    laid().rows.map((r) => ({ k: r.k, x: r.x + 84, y: r.labelY, t: r.label, font: r.labelFont, size: 24, lh: 1, maxw: r.textW, lines: 1, color: t().onBackground })),
  )
  const details = createMemo(() =>
    laid().rows.map((r) => ({ k: r.k, x: r.x + 84, y: r.detailY, t: r.detail, font: r.detailFont, size: 20, lh: 1, maxw: r.textW, lines: 1, color: '#ffffffb3' })),
  )
  const rules = createMemo(() => laid().rules.map((ru) => ({ k: ru.k, x: ru.x, y: ru.y, w: ru.w, h: 1, color: t().os(0.08) })))
  const heads = createMemo(() =>
    laid().heads.map((hd) => ({ k: hd.k, x: hd.x, y: hd.y, t: hd.text, font: 'roboto-bold', size: 14, lh: 33, ls: 0.8, color: '#ffffff8c' })),
  )

  return (
    <view
      ref={(n) => {
        n.cur = cur
        n.setCur = (i) => {
          if (laid().rows[i]) setCur(i)
          reveal()
        }
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onUp={() => {
        if (cur() > 0) setCur(cur() - 1)
        reveal()
        return true
      }}
      onDown={() => {
        if (cur() < laid().rows.length - 1) setCur(cur() + 1)
        reveal()
        return true
      }}
      onEnter={() => {
        if (guard.down()) return true
        const r = laid().rows[cur()]
        if (r && props.onSheetPick) props.onSheetPick(r.id)
        return true
      }}
      onEnterRelease={() => guard.up()}
      onBack={() => {
        if (props.onSheetClose) props.onSheetClose()
        return true
      }}
      onKeyPress={() => true}
      alpha={opened() ? 1 : 0}
      transition={tx(track() ? { alpha: FADE } : undefined)}
    >
      <view y={laid().top} width={1920} height={1080 - laid().top} color={look().scrim} />
      <view x={laid().x} y={laid().y + (opened() ? 0 : 30)} alpha={opened() ? 1 : 0} width={look().w} height={laid().h} transition={tx(track() ? { y: SLIDE, alpha: SLIDE } : undefined)}>
        <view
          width={look().w}
          height={laid().h}
          borderRadius={look().r}
          color="#00000000"
          shadow={{ color: shadowColor('#000000cc'), x: 0, y: 15, blur: 50, spread: 0 }}
        />
        <view width={look().w} height={laid().h} borderRadius={look().r} color={look().bg} border={{ width: 1, color: hex(look().border) }} />
        <view width={look().w} height={laid().h} clipping>
          <view y={-scroll()} width={look().w} height={laid().full}>
            <text fontFamily={laid().titleFont} fontSize={look().titleSize} x={look().titleX + 1} y={laid().titleY} lineHeight={33} color={t().onBackground}>
              {(props.sheet && props.sheet.title) || ' '}
            </text>
            <view
              alpha={focusRow() ? 1 : 0}
              x={focusRow() ? focusRow().x : 0}
              y={focusRow() ? focusRow().y : 0}
              width={focusRow() ? focusRow().w : 0}
              height={focusRow() ? focusRow().h : 0}
              color={t().accentA(0.3)}
            />
            <Rects list={rules()} />
            <Texts list={heads()} />
            <Icons list={marks()} />
            <Texts list={labels()} />
            <Texts list={details()} />
          </view>
        </view>
      </view>
    </view>
  )
}
