import { For, Index, createMemo, createSelector, createSignal, onCleanup } from 'solid-js'
import { fontFor, fontProps, uiFont } from '../../text.js'
import { theme, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { white } from './look.js'
import { TRACK, trackLayout, centerIfNeeded } from './layouts.js'
import { keyed } from '../library/pageKit.js'
import { tx } from '../../fx.js'

// One of the player's track pickers (the subtitle slot, the second track, the sleep timer). Rows are
// { id, label, detail, selected, dimmed, left, right } or { divider: true }, footers are lines of
// text under the list. The holder mounts it, calls open({ title, rows, footers, details, still }),
// focuses it, and hears onTrackRow(id). Back is left to the holder. setFooters(footers) changes the
// lines under the list while it stays put. A dimmed row such as Cancel still draws in the theme's
// name color.
// shortcut: a name wider than the dialog is cut off and doesn't scroll while focused. Add a marquee
// if testers miss the long names.
const SHADOW = { color: shadowColor('#000000cc'), x: 0, y: 15, blur: 50, spread: 0 }
const BORDER = { width: 1, color: hex('#ffffff29') }

// A note is set in italics, slanted from Roboto Regular. The canvas cuts a slanted last letter at
// the text's advance width, so a no-break space gives it room. Canvas faces sit a pixel lower than
// the SDF ones.
const italic = (f) => (/^roboto/.test(f) ? 'roboto-web@italic' : f)

export default function TrackModal(props) {
  const [title, setTitle] = createSignal('')
  const [rows, setRows] = createSignal([])
  const [footers, setFootersSig] = createSignal([])
  const [details, setDetails] = createSignal([])
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [on, setOn] = createSignal(false)
  const [active, setActive] = createSignal(false)
  const [titleFont, setTitleFont] = createSignal(uiFont('bold'))
  const footFont = uiFont()
  let timer = null
  onCleanup(() => clearTimeout(timer))

  const placed = createMemo(() => trackLayout(title() || '', rows() || [], footers() || [], details() || []))
  const viewH = () => Math.min(placed().contentH, TRACK.MAX) + 2 * TRACK.PAD
  const boxH = () => viewH() + 2
  const boxY = () => Math.round((1080 - boxH()) / 2)
  // The theme colors the row focus fill, the chosen indicator, the names and the dividers.
  const t = createMemo(() => theme())
  const view = createMemo(() => {
    const th = t()
    return placed().rows.map((r) => ({
      ...r,
      icon: r.selected ? 'icons/track_selected.webp' : 'icons/track_unselected.webp',
      iconColor: r.selected ? th.accent : white(0.55),
      labelFont: fontFor(r.label || '', 'bold'),
      detailFont: fontFor(r.detail || ''),
    }))
  })
  // The sleep timer's footer ticks every second, which lays the rows out again, so rows stay by key.
  const rowList = keyed(view, (r) => r.key)
  const isCur = createSelector(() => (active() ? cur() : -1))

  const reveal = () => {
    const r = placed().rows[cur()]
    if (!r) return
    setScroll(centerIfNeeded(scroll(), TRACK.PAD + r.y, r.h, viewH(), placed().contentH + 2 * TRACK.PAD))
  }
  // Focus starts on the chosen row (or one marked start), else the first, and the modal fades and
  // slides in unless it's `still`, the same dialog changing its content. Details are lines of
  // { text, note } under the title.
  const open = ({ title: heading, rows: list, footers: foot, details: lines, still }) => {
    setTitle(heading)
    setRows(list)
    setFootersSig(foot || [])
    setDetails(
      (lines || []).map((d) => {
        const font = d.note ? italic(fontFor(d.text)) : fontFor(d.text)
        return { ...d, text: d.note ? `${d.text} ` : d.text, font, ty: /-web|@/.test(font) ? 32 : 31, color: white(d.note ? 0.55 : 0.7) }
      }),
    )
    setTitleFont(fontFor(heading, 'bold'))
    const placedRows = placed().rows
    const sel = placedRows.find((r) => (r.start || r.selected) && !r.divider) || placedRows.find((r) => !r.divider)
    setScroll(0)
    setCur(sel ? sel.i : 0)
    reveal()
    if (still) return
    setOn(false)
    clearTimeout(timer)
    timer = setTimeout(() => setOn(true), 16)
  }
  // A row can name the row Left or Right lands on.
  const jump = (side) => {
    const r = placed().rows[cur()]
    const to = r && r[side] != null ? placed().rows.findIndex((x) => x.id === r[side]) : -1
    if (to < 0) return true
    setCur(to)
    reveal()
    return true
  }
  const step = (dir) => {
    const list = placed().rows
    for (let i = cur() + dir; i >= 0 && i < list.length; i += dir) {
      if (!list[i].divider) {
        setCur(i)
        reveal()
        return true
      }
    }
    return true
  }

  const contentH = () => placed().contentH + 2 * TRACK.PAD
  return (
    <view
      ref={(n) => {
        n.open = open
        n.setFooters = (f) => setFootersSig(f)
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      transition={tx({ alpha: { duration: on() ? 200 : 0, easing: 'ease' } })}
      alpha={on() ? 1 : 0}
      onFocusChanged={setActive}
      onUp={() => step(-1)}
      onDown={() => step(1)}
      onLeft={() => jump('left')}
      onRight={() => jump('right')}
      onEnter={() => {
        const r = placed().rows[cur()]
        if (r && !r.divider && props.onTrackRow) props.onTrackRow(r.id)
        return true
      }}
    >
      <view width={1920} height={1080} color="#000000f2" />
      <view
        x={629}
        transition={tx({ y: { duration: on() ? 300 : 0, easing: 'ease' }, alpha: { duration: on() ? 300 : 0, easing: 'ease' } })}
        y={boxY() + (on() ? 0 : 30)}
        alpha={on() ? 1 : 0}
        width={662}
        height={boxH()}
      >
        <view width={662} height={boxH()} borderRadius={20} color="#00000000" shadow={SHADOW} />
        <view width={662} height={boxH()} borderRadius={20} color="#171717f0" border={BORDER} />
        <view x={1} y={1} width={660} height={viewH()} clipping>
          <view y={-scroll()} width={660} height={contentH()}>
            <text fontFamily={titleFont()} fontSize={30} x={36} y={32.92} maxWidth={588} lineHeight={33} color="#ffffffff">
              {title() || ' '}
            </text>
            <view width={660} height={1} y={30 + placed().ruleY} color="#ffffff14" />
            <view>
              <Index each={placed().details}>
                {(dt) => (
                  <text {...fontProps(dt().font)} fontSize={21} x={36} y={dt().ty + dt().y} maxWidth={588} lineHeight={31.5} color={dt().color}>
                    {dt().text}
                  </text>
                )}
              </Index>
            </view>
            <view>
              <For each={rowList.keys()}>
                {(k) => {
                  const row = rowList.item(k)
                  return (
                    <view
                      y={30 + row().y}
                      width={660}
                      height={row().h}
                      transition={{ color: { duration: 150, easing: 'ease-out' } }}
                      color={row().divider ? t().os(0.08) : isCur(row().i) ? t().accentA(0.3) : '#00000000'}
                    >
                      <view alpha={row().divider ? 0 : 1} x={36} y={(row().h - 30) / 2} width={30} height={30} src={row().icon} color={row().iconColor} />
                      <text
                        alpha={row().divider ? 0 : 1}
                        fontFamily={row().labelFont}
                        fontSize={24}
                        x={84}
                        y={row().detail ? 23 : 24}
                        maxWidth={540}
                        maxLines={1}
                        overflowSuffix=""
                        color={t().onSurface}
                      >
                        {row().label || ' '}
                      </text>
                      <text alpha={row().detail ? 1 : 0} fontFamily={row().detailFont} fontSize={20} x={84} y={51.28} maxWidth={540} maxLines={1} color="#ffffffb3">
                        {row().detail || ' '}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
            <view>
              <Index each={placed().footers}>
                {(f) => (
                  <text fontFamily={footFont} fontSize={18} x={330} y={37.95 + f().y} mountX={0.5} color="#ffffff6b">
                    {f().text}
                  </text>
                )}
              </Index>
            </view>
          </view>
        </view>
      </view>
    </view>
  )
}
