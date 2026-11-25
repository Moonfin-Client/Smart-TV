import { For, Index, Show, createMemo, createSignal, onMount } from 'solid-js'
import { clampIndex, initialOf, initialsColor, reachFor, slotOf } from '../../../utils/profileCarousel.js'
import { fontFor, textReady } from '../../text.js'
import { rowFont } from '../settings/rowFont.js'
import { robotoWidth } from '../shell/MessageMarkdown.js'
import { hex } from '../../color.js'
import { DP, motion, textWidth, themeDy } from './look.js'
import { rgba } from '../../theme.js'

// The profile faces in a strip, the selected one big in the middle with its name and lines under
// it, and dots when there's more than one. The whole strip is one focus stop. Left and Right move
// along it, Enter calls onCarouselActivate(item, index) on the holder, Up and Down go to the
// holder. Items are {key, id, name, imageUrl, badge: 'active' | 'pin', lines: [{text, accent,
// lock}]}. `colors` is {accent, base, badgeInk}, `lineH` the line height the screen gives its
// lines (Login 33, Switch User 31.25) and `initialIndex` the first pick. `reach` overrides how
// many faces show either side, and onCarouselIndex(i) hears each move. Its node has setIndex(i).
// Every face is drawn at the middle one's size and scaled down.
const HERO = 168 * DP
const STAGE = 184 * DP
const NAME_TOP = STAGE + 20 * DP
const NAME_H = 36 * DP * 1.2
const LINE_GAP = 6 * DP
const DOTS_GAP = 26 * DP
const DOT = 7 * DP
const DOT_ON = 24 * DP
const DOT_GAP = 7 * DP
const NAME_SIZE = 36 * DP
const LINE_SIZE = 16 * DP
const INITIAL_SIZE = 72 * DP
// The stage is the page's width less the screen's side padding, 58dp each side.
const REACH = reachFor((1920 - 2 * 58 * DP) / DP)
const NONE = '#00000000'

export const carouselHeight = (item, count, lineH) => {
  const lines = item && item.lines ? item.lines.length : 0
  return NAME_TOP + NAME_H + lines * (LINE_GAP + lineH) + (count > 1 ? DOTS_GAP + DOT : 0)
}

export default function ProfileCarousel(props) {
  const [cur, setCur] = createSignal(props.initialIndex || 0)
  const [focused, setFocused] = createSignal(false)
  const [measured, setMeasured] = createSignal(0)
  onMount(() => textReady().then(() => setMeasured(measured() + 1)))
  const items = () => props.items || []
  const sel = () => clampIndex(cur(), items().length)
  const hero = () => items()[sel()] || null
  const c = () => props.colors || { accent: '#00a4dc', base: '#ffffff', badgeInk: '#04131a' }
  // `roboto` keeps the text in Roboto under a theme with a font of its own.
  const face = (str, weight) => (props.roboto ? rowFont(str, weight) : fontFor(str, weight))
  const lh = () => props.lineH || 33
  const dur = motion ? 220 : 0
  const ease = { duration: dur, easing: 'ease-out' }
  const lines = createMemo(() => {
    measured()
    const item = hero()
    return (item && item.lines ? item.lines : []).map((line, i) => ({
      text: line.text,
      font: line.accent ? face(line.text, 'bold') : face(line.text),
      y: NAME_TOP + NAME_H + LINE_GAP + i * (LINE_GAP + lh()),
      // A lock sits before the text, the pair centered together.
      tx: line.lock ? ((16 + 6) * DP) / 2 : 0,
      lock: line.lock ? 1 : 0,
      lockX: 960 - ((props.roboto ? robotoWidth : textWidth)(line.text, 16 * DP) + (16 + 6) * DP) / 2,
      color: line.accent ? c().accent : rgba(c().base, 0.65),
    }))
  })
  const dotsY = () => NAME_TOP + NAME_H + lines().length * (LINE_GAP + lh()) + DOTS_GAP
  const dots = createMemo(() => {
    const list = items()
    if (list.length < 2) return []
    const total = (list.length - 1) * (DOT + DOT_GAP) + DOT_ON
    let x = 960 - total / 2
    return list.map((item, i) => {
      const on = i === sel()
      const out = { x, w: on ? DOT_ON : DOT, color: on ? c().accent : rgba(c().base, 0.3) }
      x += out.w + DOT_GAP
      return out
    })
  })
  const Face = (fp) => {
    const item = fp.item
    const slot = createMemo(() => slotOf(fp.index(), sel(), props.reach || REACH))
    const initial = item.imageUrl ? '' : initialOf(item.name)
    const ring = () => (slot().distance === 0 ? 1 : 0)
    return (
      <view
        zIndex={slot().distance === 0 ? 2 : slot().distance === 1 ? 1 : 0}
        x={960 - HERO / 2 + slot().x * DP}
        y={13.357}
        width={280.488}
        height={280.488}
        pivot={0.5}
        scale={slot().scale}
        alpha={slot().opacity}
        transition={{ x: ease, scale: ease, alpha: ease }}
      >
        <view
          x={-13.357}
          y={-13.357}
          width={307.201}
          height={307.201}
          borderRadius={153.6}
          color={NONE}
          border={{ width: 13.357, color: hex(c().accent) }}
          alpha={ring() * (focused() ? 1 : 0)}
        />
        <view
          x={-13.357}
          y={-13.357}
          width={307.201}
          height={307.201}
          borderRadius={153.6}
          color={NONE}
          border={{ width: 13.357, color: hex(c().base + '40') }}
          alpha={ring() * (focused() ? 0 : 1)}
        />
        <view
          x={-6.678}
          y={-6.678}
          width={293.844}
          height={293.844}
          borderRadius={146.922}
          color={NONE}
          border={{ width: 6.678, color: hex('#00000073') }}
          alpha={ring()}
        />
        <view width={280.488} height={280.488} borderRadius={140.244} color={c().base + '1a'} />
        <Show when={initial}>
          <view width={280.488} height={280.488} borderRadius={140.244} color={initialsColor(item.id)} />
          <text
            fontFamily={face(initial, 'bold')}
            fontSize={INITIAL_SIZE}
            lineHeight={120.209}
            x={140.244}
            y={80.139 + INITIAL_SIZE * 0.0918}
            mountX={0.5}
            color="#ffffffff"
          >
            {initial}
          </text>
        </Show>
        <Show when={!item.imageUrl && !initial}>
          <view x={73.461} y={73.461} width={133.566} height={133.566} src="icons/acc_person.webp" color={c().base + '99'} />
        </Show>
        <Show when={item.imageUrl}>
          <view
            width={280.488}
            height={280.488}
            borderRadius={140.244}
            src={item.imageUrl}
            textureOptions={{ resizeMode: { type: 'cover' } }}
          />
        </Show>
        <Show when={item.badge}>
          <view x={202.018} y={202.018} width={78.47} height={78.47}>
            <view
              x={5.009}
              y={5.009}
              width={68.452}
              height={68.452}
              borderRadius={34.226}
              color={item.badge === 'active' ? c().accent : '#1c2238ff'}
            />
            <view width={78.47} height={78.47} borderRadius={39.235} color={NONE} border={{ width: 5.009, color: hex('#00000073') }} />
            <view
              x={19.2}
              y={19.2}
              width={40.07}
              height={40.07}
              src={item.badge === 'active' ? 'icons/acc_checkRounded.webp' : 'icons/acc_lockOutline.webp'}
              color={item.badge === 'active' ? c().badgeInk : '#ffffffff'}
            />
          </view>
        </Show>
      </view>
    )
  }
  return (
    <view
      ref={(n) => {
        n.setIndex = (i) => setCur(clampIndex(i, items().length))
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={1920}
      height={dotsY() + 12}
      onFocusChanged={setFocused}
      onLeft={() => {
        setCur(clampIndex(sel() - 1, items().length))
        if (props.onCarouselIndex) props.onCarouselIndex(sel())
        return true
      }}
      onRight={() => {
        setCur(clampIndex(sel() + 1, items().length))
        if (props.onCarouselIndex) props.onCarouselIndex(sel())
        return true
      }}
      onEnter={() => {
        const item = hero()
        if (item && props.onCarouselActivate) props.onCarouselActivate(item, sel())
        return true
      }}
    >
      <view>
        <For each={items()}>{(item, i) => <Face item={item} index={i} />}</For>
      </view>
      <text
        fontFamily={face(hero() ? hero().name || '' : '', 'bold')}
        fontSize={NAME_SIZE}
        lineHeight={72.125}
        x={96.836}
        y={340.592 + NAME_SIZE * 0.0918 + themeDy(NAME_SIZE, face(hero() ? hero().name || '' : '', 'bold'))}
        maxWidth={1726.33}
        maxLines={1}
        contain="width"
        textAlign="center"
        color={c().base}
      >
        {(hero() && hero().name) || ' '}
      </text>
      <view>
        <Index each={lines()}>
          {(ln) => (
            <view y={ln().y}>
              <view
                x={ln().lockX}
                y={(lh() - 26.713) / 2}
                width={26.713}
                height={26.713}
                src="icons/acc_lockOutline.webp"
                color={ln().color}
                alpha={ln().lock}
              />
              <text
                y={LINE_SIZE * 0.0918 + themeDy(LINE_SIZE, ln().font)}
                fontFamily={ln().font}
                fontSize={LINE_SIZE}
                lineHeight={lh()}
                x={96.836 + ln().tx}
                maxWidth={1726.33}
                maxLines={1}
                contain="width"
                textAlign="center"
                color={ln().color}
              >
                {ln().text}
              </text>
            </view>
          )}
        </Index>
      </view>
      <view>
        <Index each={dots()}>
          {(d) => <view x={d().x} y={dotsY()} width={d().w} height={11.687} borderRadius={5.843} color={d().color} />}
        </Index>
      </view>
    </view>
  )
}
