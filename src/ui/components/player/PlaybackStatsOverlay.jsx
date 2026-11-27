import $L from '../../../services/i18n.js'
import { For, createMemo, createSignal, onCleanup } from 'solid-js'
import { fontFor } from '../../text.js'
import { theme, rgba } from '../../theme.js'
import { formatBitrate } from '../../../utils/mediaStreamFacts.js'
import { textWidth } from './look.js'

// Live network and buffer stats in the corner of the video, read once a second. It takes no focus,
// so the remote still drives the player underneath. `read()` is the engine's playbackStats, whose
// null values are what the device's player doesn't report, `bitrate()` the Playback Information
// panel's own figure, and `y` where the holder puts it.
const HISTORY = 60
const BAR_W = 3
const GRAPH_W = HISTORY * BAR_W
const GRAPH_H = 24
const ROW_H = 34
const PAD = 16
const GAP = 20
const VALUE_W = 190
const SLOTS = Array.from({ length: HISTORY }, (_, i) => i)

// The newest reading is the rightmost bar. `line` draws each reading as a mark at its height
// instead of a bar up to it. No shadow, blur or animation, so a weak set pays for little.
const Graph = (props) => (
  <view x={props.x} y={(ROW_H - GRAPH_H) / 2} width={GRAPH_W} height={GRAPH_H} color="#ffffff21">
    <For each={SLOTS}>
      {(i) => {
        const part = () => {
          const v = props.values[i - (HISTORY - props.values.length)]
          return v == null || !(props.top > 0) ? null : Math.min(1, v / props.top)
        }
        const h = () => (props.line ? 2 : Math.max(1, Math.round((part() || 0) * GRAPH_H)))
        return (
          <view
            x={i * BAR_W}
            y={props.line ? Math.round((1 - (part() || 0)) * (GRAPH_H - 2)) : GRAPH_H - h()}
            width={BAR_W}
            height={h()}
            alpha={part() == null || (!props.line && part() === 0) ? 0 : 1}
            color={props.color}
          />
        )
      }}
    </For>
  </view>
)

export default function PlaybackStatsOverlay(props) {
  const [stat, setStat] = createSignal(null)
  const [rate, setRate] = createSignal(null)
  const [rates, setRates] = createSignal([])
  const [buffers, setBuffers] = createSignal([])
  const [bitrate, setBitrate] = createSignal('')
  let last = null

  const sample = () => {
    const next = props.read()
    const now = Date.now()
    setStat(next)
    if (!next) return
    // Measured on this clock, so a late tick doesn't inflate the bar. The first reading only sets
    // the baseline, or it would count everything loaded before the overlay opened.
    const bps = next.bytes == null ? null : last && last.bytes != null ? Math.round((Math.max(0, next.bytes - last.bytes) * 8000) / Math.max(1, now - last.at)) : 0
    last = { bytes: next.bytes, at: now }
    setRate(bps)
    if (bps != null) setRates(rates().concat(bps).slice(-HISTORY))
    setBuffers(buffers().concat(next.bufferAhead).slice(-HISTORY))
    setBitrate(props.bitrate() || '')
  }
  sample()
  const timer = setInterval(sample, 1000)
  onCleanup(() => clearInterval(timer))

  const ROWS = [
    {
      label: $L('Network Activity'),
      value: () => (rate() == null ? '' : rate() > 0 ? formatBitrate(rate()) : '0 bps'),
      // The device's own player reports what it has buffered, not how fast it downloads.
      note: () => (rate() == null ? $L("Not reported by this device's player") : ''),
      graph: () => rate() != null,
      values: rates,
      top: () => Math.max.apply(null, rates().concat(0)),
      color: '#ffb74dff',
    },
    {
      label: $L('Buffer Health'),
      value: () => {
        const ahead = stat().bufferAhead.toFixed(1)
        return stat().bufferCeiling ? `${ahead} / ${stat().bufferCeiling} s` : `${ahead} s`
      },
      values: buffers,
      top: () => stat().bufferCeiling || Math.max.apply(null, buffers().concat(0)),
      line: true,
      color: '#81c784ff',
    },
    { label: $L('Bitrate'), has: () => !!bitrate(), value: bitrate },
    { label: $L('Rebuffers'), value: () => String(stat().rebuffers) },
  ]
  const rows = createMemo(() => (stat() ? ROWS.filter((row) => !row.has || row.has()) : []))
  const labelW = Math.ceil(Math.max.apply(null, ROWS.map((row) => textWidth(row.label, 20))))
  const valueX = PAD + labelW + GAP
  const graphX = valueX + VALUE_W + GAP
  const panelW = graphX + GRAPH_W + PAD

  return (
    <view x={48} y={props.y} width={panelW} height={rows().length * ROW_H + PAD} alpha={stat() ? 1 : 0}>
      <view width={panelW} height={rows().length * ROW_H + PAD} borderRadius={12} color={rgba(theme().surface, 0.8)} />
      <view width={panelW} height={rows().length * ROW_H + PAD}>
        <For each={rows()}>
          {(row, i) => (
            <view y={PAD / 2 + i() * ROW_H} width={panelW} height={ROW_H}>
              <text x={PAD} y={5} fontFamily={fontFor(row.label)} fontSize={20} lineHeight={24} color="#ffffffb3">
                {row.label}
              </text>
              <text x={valueX} y={5} fontFamily={fontFor(row.value())} fontSize={20} lineHeight={24} maxWidth={row.note ? VALUE_W : VALUE_W + GAP + GRAPH_W} maxLines={1} color="#ffffffff">
                {row.value()}
              </text>
              <text
                alpha={row.note && row.note() ? 1 : 0}
                x={valueX}
                y={5}
                fontFamily={fontFor(row.note ? row.note() : '')}
                fontSize={20}
                lineHeight={24}
                maxWidth={VALUE_W + GAP + GRAPH_W}
                maxLines={1}
                color="#ffffff8a"
              >
                {row.note ? row.note() : ''}
              </text>
              <view alpha={row.graph && !row.graph() ? 0 : 1}>{row.values ? <Graph x={graphX} values={row.values()} top={row.top()} line={row.line} color={row.color} /> : null}</view>
            </view>
          )}
        </For>
      </view>
    </view>
  )
}
