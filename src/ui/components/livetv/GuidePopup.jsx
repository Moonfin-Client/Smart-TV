import { For, createEffect, createMemo, createSignal, on } from 'solid-js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { holdGuard } from '../modals/holdGuard.js'

const SHADOW = { color: shadowColor('#00000099'), x: 0, y: 12, blur: 48, spread: 0 }
// The models give borders as { w, color }.
const edge = (b) => (b && b.w ? { width: b.w, color: hex(b.color) } : undefined)

// The popup for the guide, Recordings and the Record prompt: a scrim, a rounded panel with text, and
// a list of options or a row of actions, laid out by guideModels.popupModel as `m`. Focus stays
// inside, and the holder hears onPopup(id) for OK on an option or action and onPopup('back') for Back.
export default function GuidePopup(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const m = () => props.m
  const items = createMemo(() => (m() ? (m().options.length ? m().options : m().buttons) : []))
  const focusId = () => {
    const it = items()[cur()]
    return it ? it.id : ''
  }
  const options = () => (m() ? m().options : [])
  // Each option's parts as flat lists, so the shapes, icons and texts each draw in one container.
  const optParts = createMemo(() => {
    const shapes = []
    const icons = []
    const texts = []
    options().forEach((o) => {
      o.icons.forEach((i) => (i.src ? icons : shapes).push({ ...i, k: `${o.k}-${i.k}`, x: o.x + i.x, y: o.y + i.y }))
      o.texts.forEach((t) => texts.push({ ...t, k: `${o.k}-${t.k}`, x: o.x + t.x, y: o.y + t.y }))
    })
    return { shapes, icons, texts }
  })

  // Scrolls the focused option into view by the least it takes.
  const reveal = () => {
    const model = m()
    const o = model && model.options[cur()]
    if (!o) return
    if (o.y < scroll()) setScroll(o.y)
    else if (o.y + o.h > scroll() + model.listH) setScroll(o.y + o.h - model.listH)
  }
  const move = (to) => {
    if (to < 0 || to >= items().length) return
    setCur(to)
    reveal()
  }
  // Up and Down between wrapped rows of actions land on the nearest button by its center.
  const moveRow = (dir) => {
    const list = items()
    const from = list[cur()]
    if (!from || from.row == null) return
    const center = from.x + from.w / 2
    let best = -1
    let dist = Infinity
    list.forEach((b, i) => {
      if (b.row !== from.row + dir) return
      const d = Math.abs(b.x + b.w / 2 - center)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    if (best >= 0) setCur(best)
  }
  const side = (dir) => {
    if (options().length) return
    const list = items()
    const b = list[cur() + dir]
    if (b && b.row === list[cur()].row) setCur(cur() + dir)
  }
  // Popups open on OK's press, so the repeats and release of that same OK mustn't pick an action.
  let guard = holdGuard(false)
  createEffect(
    on(m, (next) => {
      if (!next) return
      guard = holdGuard(true)
      const list = next.options.length ? next.options : next.buttons
      const at = list.findIndex((it) => it.id === next.focus)
      setCur(at < 0 ? 0 : at)
      setScroll(0)
      reveal()
    }),
  )
  const say = (id) => {
    if (props.onPopup) props.onPopup(id)
    return true
  }
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      width={1920}
      height={1080}
      alpha={props.alpha == null ? 1 : props.alpha}
      onUp={() => {
        if (options().length) move(cur() - 1)
        else moveRow(-1)
        return true
      }}
      onDown={() => {
        if (options().length) move(cur() + 1)
        else moveRow(1)
        return true
      }}
      onLeft={() => {
        side(-1)
        return true
      }}
      onRight={() => {
        side(1)
        return true
      }}
      onEnterRelease={() => {
        guard.up()
        return true
      }}
      onEnter={() => {
        if (guard.down()) return true
        const it = items()[cur()]
        if (it && !it.disabled) say(it.id)
        return true
      }}
      onBack={() => say('back')}
    >
      <view width={1920} height={1080} color="#0000008a" />
      <view x={m() ? m().x : 0} y={m() ? m().y : 0}>
        <view width={m() ? m().w : 0} height={m() ? m().h : 0} borderRadius={42} color="#00000000" shadow={SHADOW} />
        <view width={m() ? m().w : 0} height={m() ? m().h : 0} borderRadius={42} color={m() ? m().bg : '#1a1a1a'} />
        <view>
          <For each={m() ? m().boxes : []}>
            {(bx) => <view x={bx.x} y={bx.y} width={bx.w} height={bx.h} borderRadius={bx.r} color={bx.color} border={edge(bx.border)} />}
          </For>
        </view>
        <view>
          <For each={m() ? m().icons : []}>
            {(ic) => <view x={ic.x} y={ic.y} width={ic.s} height={ic.s} src={ic.src} color={ic.color} />}
          </For>
        </view>
        <view>
          <For each={m() ? m().texts : []}>
            {(tx) => (
              <text
                fontFamily={tx.font}
                fontSize={tx.size}
                x={tx.x}
                y={tx.y}
                lineHeight={tx.lh}
                maxWidth={tx.w}
                maxLines={1}
                letterSpacing={tx.spacing || 0}
                color={tx.color}
                textShadow={tx.shadow}
              >
                {tx.text}
              </text>
            )}
          </For>
        </view>
        <view y={m() ? m().listTop : 0} width={m() ? m().w : 0} height={m() ? m().listH : 0} clipping>
          <view width={m() ? m().w : 0} height={m() ? Math.max(m().listH, m().listFull || 0) : 0} transition={{ y: { duration: 150 } }} y={-scroll()}>
            <view>
              <For each={options()}>
                {(o) => <view x={o.x} y={o.y} width={o.w} height={o.h} borderRadius={o.r} color={o.focusBg} alpha={focusId() === o.id ? 1 : 0} />}
              </For>
            </view>
            <view>
              <For each={optParts().shapes}>
                {(os) => <view x={os.x} y={os.y} width={os.s} height={os.s} color={os.color} border={edge(os.border)} borderRadius={os.r} />}
              </For>
            </view>
            <view>
              <For each={optParts().icons}>{(oi) => <view x={oi.x} y={oi.y} width={oi.s} height={oi.s} src={oi.src} color={oi.color} />}</For>
            </view>
            <view>
              <For each={optParts().texts}>
                {(ot) => (
                  <text fontFamily={ot.font} fontSize={ot.size} x={ot.x} y={ot.y} lineHeight={ot.lh} maxWidth={ot.w} maxLines={1} color={ot.color}>
                    {ot.text}
                  </text>
                )}
              </For>
            </view>
          </view>
        </view>
        <view>
          <For each={m() ? m().buttons : []}>
            {(b) => (
              <view x={b.x} y={b.y} width={b.w} height={b.h}>
                <view width={b.w} height={b.h} borderRadius={b.h / 2} color={b.focusBg} alpha={focusId() === b.id ? 1 : 0} />
                <text fontFamily={b.font} fontSize={21} x={18} y={b.ty} lineHeight={1} color={b.color}>
                  {b.label}
                </text>
              </view>
            )}
          </For>
        </view>
      </view>
    </view>
  )
}
