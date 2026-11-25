import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { lineY } from '../books/bookGrid.js'
import { uiFont, fontFor } from '../../text.js'
import { hex } from '../../color.js'
import * as settings from '../../../state/settings.js'
import { OverNav } from '../../layers.jsx'

const PANEL_W = 445
const PAD_X = 33
const OPTION_H = 63
const STEP = 67
const NONE = '#00000000'

const SORTS = () => [
  { key: 'name', label: $L('Name') },
  { key: 'release_year', label: $L('Release Year') },
  { key: 'date_added', label: $L('Date Added to Library') },
]
const TOGGLES = () => [
  { key: 'displayAudioLatest', label: $L('Latest') },
  { key: 'displayAudioLastPlayed', label: $L('Last Played') },
  { key: 'displayAudioFavorites', label: $L('Favorites') },
  { key: 'displayAudioPlaylists', label: $L('Playlists') },
  { key: 'displayAudioAlbumArtists', label: $L('Album Artists') },
  { key: 'displayAudioArtists', label: $L('Artists') },
  { key: 'displayAudioAlbums', label: $L('Albums') },
]

const layoutRows = (kind, options, picked) => {
  const rows = []
  const headings = []
  let y = 40 + 33 + 32
  if (kind === 'genres') {
    options.forEach((o, i) => {
      rows.push({ k: String(o.id || 'all'), i, y, label: o.label, radio: true, on: (o.id || null) === (picked || null), option: o })
      y += STEP
    })
    return { rows, headings, rules: [], height: y - 4 + 40 }
  }
  headings.push({ k: 'h1', label: $L('Sort By').toUpperCase(), y })
  y += 33 + 16
  const sort = settings.get('audioSortOption')
  SORTS().forEach((o) => {
    rows.push({ k: o.key, i: rows.length, y, label: o.label, radio: true, on: sort === o.key, sort: o.key })
    y += STEP
  })
  y += -4 + 32
  const rules = [{ k: 'r1', y }]
  y += 1 + 24
  headings.push({ k: 'h2', label: $L('Show').toUpperCase(), y })
  y += 33 + 16
  TOGGLES().forEach((o) => {
    rows.push({ k: o.key, i: rows.length, y, label: o.label, radio: false, on: !!settings.get(o.key), toggle: o.key })
    y += STEP
  })
  return { rows, headings, rules, height: y - 4 + 32 + 40 }
}

function Row(props) {
  const look = () => props.look
  const r = () => props.row
  const ink = () => (props.focused || r().on ? look().onSurface : look().os(0.8))
  return (
    <view x={PAD_X} y={r().y} width={414} height={OPTION_H}>
      <view width={414} height={OPTION_H} borderRadius={8} color={look().os(0.1)} />
      <view width={414} height={OPTION_H} borderRadius={8} color={NONE} border={{ width: 1, color: hex(look().focus) }} alpha={props.focused ? 1 : 0} />
      <view
        x={17}
        y={19}
        width={24}
        height={24}
        borderRadius={r().radio ? 12 : 4}
        color={!r().radio && r().on ? look().accent : NONE}
        border={{ width: 1, color: hex(r().on ? look().accent : look().os(0.35)) }}
      />
      <view>
        <Show when={r().radio && r().on}>
          <view x={23} y={25} width={12} height={12} borderRadius={6} color={look().accent} />
        </Show>
      </view>
      <view>
        <Show when={!r().radio && r().on}>
          <view x={21} y={23} width={16} height={16} src="icons/watched_check.webp" color={look().onAccent} />
        </Show>
      </view>
      <text fontFamily={fontFor(r().label, 'medium')} fontSize={18} x={55} y={lineY(15, 33, 18)} color={ink()}>
        {r().label}
      </text>
    </view>
  )
}

// `kind` 'library' shows the sort and the row toggles and writes the settings itself. `kind`
// 'genres' shows `options` ([{id, label}]) as radios with `picked` on, and calls
// onFilterPick(option). It covers the whole screen above the strip and the headers, so it draws in
// the overNav layer.
export default function MusicFilterPanel(props) {
  const look = () => props.look
  const [cur, setCur] = createSignal(0)
  const [inX, setInX] = createSignal(PANEL_W)
  const [scroll, setScroll] = createSignal(0)
  const [has, setHas] = createSignal(false)
  const lay = createMemo(() => layoutRows(props.kind, props.options || [], props.picked))
  const title = () => (props.kind === 'genres' ? $L('Filter by Genre') : $L('Sort & Filter'))
  const keepInView = () => {
    const row = lay().rows[cur()]
    if (!row) return
    const top = row.y - scroll()
    if (top < 24) setScroll(Math.max(0, row.y - 24))
    else if (top + OPTION_H > 1080 - 24) setScroll(Math.min(lay().height - 1080, row.y + OPTION_H - 1080 + 24))
  }
  const move = (d) => {
    const next = cur() + d
    if (next < 0 || next >= lay().rows.length) return true
    setCur(next)
    keepInView()
    return true
  }
  onMount(() => {
    const t = setTimeout(() => setInX(0), 16)
    onCleanup(() => clearTimeout(t))
  })
  return (
    <OverNav>
    <view
      ref={(n) => props.ref && props.ref(n)}
      width={1920}
      height={1080}
      onFocusChanged={(on) => {
        setHas(on)
        if (!on) return
        if (props.kind === 'genres') setCur(Math.max(0, lay().rows.findIndex((r) => r.on)))
        keepInView()
      }}
      onUp={() => move(-1)}
      onDown={() => move(1)}
      onLeft={() => true}
      onRight={() => true}
      onEnter={() => {
        const row = lay().rows[cur()]
        if (!row) return true
        if (row.option) {
          if (props.onFilterPick) props.onFilterPick(row.option.id ? row.option : null)
          return true
        }
        if (row.sort) settings.set('audioSortOption', row.sort)
        else settings.set(row.toggle, !settings.get(row.toggle))
        if (props.onFilterChange) props.onFilterChange()
        return true
      }}
      onBack={() => {
        if (props.onFilterClose) props.onFilterClose()
        return true
      }}
    >
      <view width={1920} height={1080} color={look().scrimA} />
      <view
        transition={{ x: { duration: 250, easing: 'ease-out' } }}
        x={1475 + inX()}
        width={PANEL_W}
        height={1080}
        color={look().panelBg}
        clipping
      >
        <view width={1} height={1080} color={look().os(0.08)} />
        <view y={-scroll()} width={PANEL_W} height={Math.max(1080, lay().height)}>
          <text fontFamily={uiFont('bold')} fontSize={32} x={PAD_X} y={lineY(40, 33, 32)} color={look().onSurface}>
            {title()}
          </text>
          <view width={PANEL_W} height={Math.max(1080, lay().height)}>
            <For each={lay().headings}>
              {(hd) => (
                <text fontFamily={uiFont('bold')} fontSize={15} letterSpacing={1} x={PAD_X} y={hd.y + lineY(0, 33, 15)} color={look().os(0.45)}>
                  {hd.label}
                </text>
              )}
            </For>
          </view>
          <view width={PANEL_W} height={Math.max(1080, lay().height)}>
            <For each={lay().rules}>{(ru) => <view x={PAD_X} y={ru.y} width={380} height={1} color={look().os(0.1)} />}</For>
          </view>
          <view width={PANEL_W} height={Math.max(1080, lay().height)}>
            <For each={lay().rows}>{(rw) => <Row row={rw} look={look()} focused={has() && cur() === rw.i} />}</For>
          </view>
        </view>
      </view>
    </view>
    </OverNav>
  )
}
