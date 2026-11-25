import { For, Show, createMemo, createSelector, createSignal } from 'solid-js'
import { fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { focusScrollFor } from '../../../pages/Seerr/browseGrid.js'
import { keyed } from '../library/pageKit.js'

// The Seerr browse screen's sort and settings panel, a scrolling list whose title scrolls away with
// it. It owns every key and tells its holder onBrowseDialog(row) and onBrowseDialogClose(). Its
// node has open(), which the holder calls as it shows the panel, so focus starts on the first row
// at the top.
// rows: [{ id, kind, label, on, count, expanded, arrow }] where kind is title, subtitle, divider,
// section, radio, check, expander or clear, and arrow is 'asc' or 'desc' on the picked sort.
// Sizes are points on an 1150 wide canvas, drawn at 1920.
const DP = 1920 / 1150
const PAD = 20 * DP
const W = 380 * DP
const HEIGHTS = {
  title: 16 * DP + 20 * DP * 1.43,
  subtitle: 8 * DP + 15 * DP * 1.43,
  divider: 16 * DP,
  section: 16 * DP + 13 * DP * 1.43,
  radio: 24 * DP + 15 * DP * 1.43,
  check: 24 * DP + 15 * DP * 1.43,
  clear: 24 * DP + 15 * DP * 1.43,
  expander: 24 * DP + 13 * DP * 1.43,
}
const FOCUSABLE = { radio: true, check: true, expander: true, clear: true }
const WEIGHT = { title: 'bold', section: 'medium', expander: 'medium' }
const SIZE = { title: 20 * DP, section: 13 * DP, expander: 13 * DP }
const LINE = { title: 20 * DP * 1.43, section: 13 * DP * 1.43, expander: 13 * DP * 1.43 }
const TEXT_Y = { title: 8 * DP, subtitle: 4 * DP, section: 12 * DP }
const PANEL_EDGE = { width: 1, color: hex('#8ec8f054') }

const labelColor = (r) => {
  if (r.kind === 'clear') return '#6366f1ff'
  if (r.kind === 'title') return '#ffffffff'
  if (r.kind === 'subtitle') return '#ffffffb3'
  if (r.kind === 'section' || r.kind === 'expander') return '#ffffffb8'
  if (r.on) return '#ffffffff'
  return r.kind === 'check' ? '#ffffffb8' : '#ffffffb3'
}

export default function BrowseDialog(props) {
  const [curId, setCurId] = createSignal(null)
  const [scroll, setScroll] = createSignal(0)
  const countFont = uiFont('bold')
  const placed = createMemo(() => {
    let y = PAD
    return (props.rows || []).map((r, i) => {
      const h = HEIGHTS[r.kind] || HEIGHTS.radio
      const at = y
      y += h
      const line = LINE[r.kind] || 15 * DP * 1.43
      const mark = r.kind === 'radio' || r.kind === 'check'
      const textX = mark || r.kind === 'clear' ? 54 * DP : 24 * DP
      return {
        key: `${r.kind}-${r.id || i}`,
        id: r.id,
        i,
        y: at,
        h,
        kind: r.kind,
        label: r.label || '',
        font: fontFor(r.label || '', WEIGHT[r.kind] || 'regular'),
        size: SIZE[r.kind] || 15 * DP,
        line,
        textX,
        textY: TEXT_Y[r.kind] != null ? TEXT_Y[r.kind] : (h - line) / 2,
        // The label runs to the right padding, less a trailing sort arrow or count and chevron.
        textW: W - 2 - textX - 24 * DP - (r.arrow ? 28 * DP : r.kind === 'expander' ? 40 * DP : 0),
        color: labelColor(r),
        focusable: !!FOCUSABLE[r.kind],
        mark,
        round: r.kind === 'radio' ? 9 * DP : 4 * DP,
        on: !!r.on,
        dot: r.kind === 'radio' && r.on,
        check: r.kind === 'check' && r.on,
        arrow: r.arrow ? (r.arrow === 'asc' ? 'arrowUpward' : 'arrowDownward') : '',
        countText: r.kind === 'expander' && r.count > 0 ? String(r.count) : '',
        chevron: r.kind === 'expander' ? (r.expanded ? 'expandLess' : 'expandMore') : '',
      }
    })
  })
  const contentH = () => {
    const p = placed()
    const last = p[p.length - 1]
    return last ? last.y + last.h + PAD : 2 * PAD
  }
  const panelH = () => Math.min(contentH() + 2, 1000)
  const top = () => Math.max(40, (1080 - panelH()) / 2)
  const view = () => panelH() - 2
  const curIndex = createMemo(() => placed().findIndex((r) => r.id === curId() && r.focusable))
  const isCur = createSelector(curIndex)
  // Only the rows near the window are built, since an open language list runs to hundreds.
  const shown = createMemo(() => {
    const from = scroll() - 120
    const to = scroll() + view() + 120
    return placed().filter((r) => r.y + r.h > from && r.y < to)
  })
  const kept = keyed(shown, (r) => r.key)

  const move = (delta) => {
    const list = placed()
    let i = curIndex()
    for (let j = i + delta; j >= 0 && j < list.length; j += delta) {
      if (list[j].focusable) {
        i = j
        break
      }
    }
    const row = list[i]
    if (!row) return
    setCurId(row.id)
    setScroll(focusScrollFor(row.y, row.h, scroll(), view(), Math.max(0, contentH() - view())))
  }

  return (
    <view
      ref={(n) => {
        n.open = () => {
          const first = placed().find((r) => r.focusable)
          setCurId(first ? first.id : null)
          setScroll(0)
        }
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onUp={() => (move(-1), true)}
      onDown={() => (move(1), true)}
      onLeft={() => true}
      onRight={() => true}
      onEnter={() => {
        const row = placed()[curIndex()]
        if (row && props.onBrowseDialog) props.onBrowseDialog((props.rows || [])[row.i])
        return true
      }}
      onBack={() => {
        if (props.onBrowseDialogClose) props.onBrowseDialogClose()
        return true
      }}
    >
      <view width={1920} height={1080} color="#0000008a" />
      <view x={642.78} y={top()} width={634.44} height={panelH()} borderRadius={33.39} color="#1a1a1ae6" border={PANEL_EDGE}>
        <view x={1} y={1} width={632.44} height={view()} clipping>
          <view y={-scroll()} width={632.44} height={contentH()}>
            <For each={kept.keys()}>
              {(k) => {
                const r = kept.item(k)
                return (
                  <view y={r().y} width={632.44} height={r().h}>
                    <view width={632.44} height={r().h} color="#ffffff1f" alpha={isCur(r().i) ? 1 : 0} />
                    <Show when={r().kind === 'divider'}>
                      <view y={12.52} width={632.44} height={1.67} color="#ffffff14" />
                    </Show>
                    <Show when={r().mark}>
                      <view
                        x={40.07}
                        y={(r().h - 30.05) / 2}
                        width={30.05}
                        height={30.05}
                        borderRadius={r().round}
                        color={r().on ? '#6366f1ff' : '#00000000'}
                        border={{ width: 3, color: hex(r().on ? '#6366f1ff' : '#ffffff80') }}
                      />
                      <view x={48.42} y={(r().h - 13.36) / 2} width={13.36} height={13.36} borderRadius={6.68} color="#ffffffff" alpha={r().dot ? 1 : 0} />
                      <view x={43.41} y={(r().h - 23.37) / 2} width={23.37} height={23.37} src="icons/check.webp" color="#ffffffff" alpha={r().check ? 1 : 0} />
                    </Show>
                    <Show when={r().kind === 'clear'}>
                      <view x={40.07} y={(r().h - 30.05) / 2} width={30.05} height={30.05} src="icons/filterAltOff.webp" color="#6366f1ff" />
                    </Show>
                    <text
                      x={r().textX}
                      y={r().textY + 2}
                      fontFamily={r().font}
                      fontSize={r().size}
                      lineHeight={r().line}
                      letterSpacing={0.417}
                      maxWidth={r().textW}
                      maxLines={1}
                      color={r().color}
                    >
                      {r().label}
                    </text>
                    <Show when={r().arrow}>
                      <view x={565.66} y={(r().h - 26.71) / 2} width={26.71} height={26.71} src={'icons/' + r().arrow + '.webp'} color="#6366f1ff" />
                    </Show>
                    <Show when={r().countText}>
                      <text x={548.96} mountX={1} y={r().textY + 2} fontFamily={countFont} fontSize={21.7} lineHeight={31.04} letterSpacing={0.417} color="#6366f1ff">
                        {r().countText}
                      </text>
                    </Show>
                    <Show when={r().chevron}>
                      <view x={562.32} y={(r().h - 30.05) / 2} width={30.05} height={30.05} src={'icons/' + r().chevron + '.webp'} color="#ffffffb8" />
                    </Show>
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
