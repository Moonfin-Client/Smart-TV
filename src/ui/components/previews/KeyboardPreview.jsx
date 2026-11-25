import { For, createMemo } from 'solid-js'
import { cssShift, fontFor, textWidth, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { COVER } from './kit.js'

// The Search scene: search with its keyboard open, drawn the way the chosen Keyboard Style sits on
// screen, on the design screen.
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const TYPED = 'Spri'
const GRID_ROWS = ['abcdef', 'ghijkl', 'mnopqr', 'stuvwx', 'yz1234', '567890']
const LINE = 33

// How each keyboard style sits and draws its keys, at the size the TV lays it out.
const LOOKS = {
  native: { box: { left: 0, right: 0, bottom: 0, pad: [18, 80, 22, 80], fill: '#e8eaedff' }, key: { w: 56, h: 42, fill: '#ffffffff', ink: '#202124ff', r: 6 }, focus: { fill: '#1a73e8ff', ink: '#ffffffff' } },
  classic: { box: { left: 48, top: 92, pad: [10, 10, 10, 10], r: 12, fill: '#141414d9' }, key: { w: 38, h: 38, fill: '#2a2a2aff', ink: '#ffffffff', r: 6 }, focus: { fill: '#ffffffff', ink: '#000000ff' }, grid: true },
  glass: { box: { left: 120, right: 120, bottom: 24, pad: [14, 14, 14, 14], r: 20, fill: '#ffffff1f', border: '#ffffff47' }, key: { w: 52, h: 46, fill: '#ffffff29', ink: '#ffffffff', r: 12 }, focus: { fill: '#ffffffff', ink: '#000000ff' } },
  docked: { box: { left: 0, right: 0, bottom: 0, pad: [14, 60, 18, 60], fill: '#121212f7', top1: '#ffffff1f' }, key: { w: 62, h: 44, fill: '#2a2a2aff', ink: '#ffffffff', r: 8 }, focus: { fill: '#ffffffff', ink: '#000000ff' }, typed: true },
}

export default function KeyboardPreview(props) {
  const regular = uiFont()
  const medium = uiFont('medium')
  const look = () => LOOKS[props.s.keyboardStyle] || LOOKS.docked
  const field = createMemo(() => {
    const l = look()
    if (l.typed) return { on: 0, x: 0, w: 0, caretX: 0 }
    return { on: 1, x: l.grid ? 48 : 270, w: l.grid ? 280 : 420, caretX: 16 + 22 + 10 + textWidth(TYPED, 17) }
  })
  const posters = createMemo(() => {
    const l = look()
    const top = l.typed ? 28 : 92
    const left = l.grid ? 360 : 48
    return (props.items || []).slice(0, 4).map((entry, i) => ({ k: 'p' + i, x: left + i * (92 + 14), y: top, src: entry.posterUrl || '', title: entry.title }))
  })
  // The keyboard's box and every key in it, laid out the way its flex rows center them.
  const board = createMemo(() => {
    const l = look()
    const b = l.box
    const k = l.key
    const rows = l.grid ? GRID_ROWS : KEY_ROWS
    const [pt, pr, pb, pl] = b.pad
    const typedH = l.typed ? LINE + 12 : 0
    const h = pt + typedH + rows.length * (k.h + 6) + pb
    const widest = Math.max(...rows.map((r) => r.length * (k.w + 6)))
    const w = b.right !== undefined ? 960 - b.left - b.right : widest + pl + pr
    const y = b.top !== undefined ? b.top : 540 - b.bottom - h
    const keys = []
    rows.forEach((row, ri) => {
      let x = pl + (w - pl - pr - row.length * (k.w + 6)) / 2 + 3
      const ky = pt + typedH + ri * (k.h + 6)
      row.split('').forEach((ch) => {
        const focused = ch === 'n'
        keys.push({ k: ri + ch, x, y: ky, label: ch.toUpperCase(), fill: focused ? l.focus.fill : k.fill, ink: focused ? l.focus.ink : k.ink })
        x += k.w + 6
      })
    })
    return {
      x: b.left, y, w, h, r: b.r || 0, fill: b.fill, border: b.border || '', top1: b.top1 || '', keys, kw: k.w, kh: k.h, kr: k.r,
      typedX: pl + 4, typedY: pt + cssShift(24), caretX: pl + 4 + textWidth(TYPED, 24, 'medium'), typed: l.typed ? 1 : 0,
    }
  })
  return (
    <view width={960} height={540} color={props.t.background}>
      <view alpha={field().on} x={field().x} y={28} width={field().w || 1} height={44} borderRadius={22} color={props.t.onSurfaceA(0.1)}>
        <view x={16} y={11} width={22} height={22} src="icons/preview/search.webp" color={props.t.onSurfaceA(0.7)} />
        <text fontFamily={regular} fontSize={17} lineHeight={33} x={48} y={7} color={props.t.onSurface}>
          {TYPED}
        </text>
        <view x={field().caretX} y={12} width={2} height={20} color={props.t.accent} />
      </view>
      <view>
        <For each={posters()}>
          {(p) => (
            <view x={p.x} y={p.y} width={92} height={177}>
              <view width={92} height={138} src={p.src} textureOptions={COVER} borderRadius={props.t.cardRadius} color={p.src ? '#ffffffff' : props.t.onSurfaceA(0.1)} />
              <text fontFamily={fontFor(p.title, 'bold')} fontSize={12} lineHeight={33} y={145} maxWidth={92} maxLines={1} color={props.t.onSurface}>
                {p.title}
              </text>
            </view>
          )}
        </For>
      </view>
      <view x={board().x} y={board().y} width={board().w} height={board().h} borderRadius={board().r} color={board().fill}>
        <view alpha={board().border ? 1 : 0} width={board().w} height={board().h} borderRadius={board().r} color="#00000000" border={{ width: 1, color: hex(board().border || '#00000000') }} />
        <view alpha={board().top1 ? 1 : 0} width={board().w} height={1} color={board().top1 || '#00000000'} />
        <view alpha={board().typed}>
          <text fontFamily={medium} fontSize={24} lineHeight={33} x={board().typedX} y={board().typedY} color="#ffffffff">
            {TYPED}
          </text>
          <text fontFamily={medium} fontSize={24} lineHeight={33} x={board().caretX} y={board().typedY} color={props.t.accent}>
            |
          </text>
        </view>
        <view>
          <For each={board().keys}>
            {(ky) => (
              <view x={ky.x} y={ky.y} width={board().kw} height={board().kh} borderRadius={board().kr} color={ky.fill}>
                <text fontFamily={regular} fontSize={17} lineHeight={33} x={board().kw / 2} mountX={0.5} y={(board().kh - 33) / 2 + 1.5} color={ky.ink}>
                  {ky.label}
                </text>
              </view>
            )}
          </For>
        </view>
      </view>
    </view>
  )
}
