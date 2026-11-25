import $L from '../../../services/i18n.js'
import { Index, createEffect, createMemo, createSignal, on } from 'solid-js'
import CountdownRing from './CountdownRing.jsx'
import { fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import * as settings from '../../../state/settings.js'
import { ACCENT, lineCount, textWidth } from './look.js'
import { formatRemaining, panelFill, panelShadow } from './overlayLook.js'
import { PILL_H } from './animePills.js'

const COVER = { resizeMode: { type: 'cover' } }
const EMPTY_MARK = { a: 0, x: 0, y: 0, w: 1, label: ' ', text: '#ffffff', fill: '#00000000', border: '#00000000' }

// The Next Up card. `card` is { title, pill ('S1:E18'), image, minimal, airs, markers, timeout }
// and `countdown` the seconds left, or null. The ring sits in the Play Next button and the timer
// under the title, as the Media Segment Countdown setting picks. With airs (the air date card) it
// says when the next episode airs and has only its close button. It sits right 35, bottom 174,
// holds the remote while it's up and calls onNextUp('play' | 'hide') on its holder. Back hides it,
// and every other key but Stop stops here. `show` draws it.
export default function NextUpCard(props) {
  const [cur, setCur] = createSignal(0)
  const [active, setActive] = createSignal(false)
  const upNext = $L('Up Next')
  const playLabel = $L('Play Next')
  const bold = uiFont('bold')
  const regular = uiFont()
  const fill = panelFill()
  const shadow = panelShadow()
  const airs = () => !!(props.card && props.card.airs)

  const look = createMemo(() => {
    const c = props.card || {}
    const minimal = !!c.minimal
    const w = minimal ? 435 : 493
    const thumbH = !minimal && c.image ? w * 0.5625 : 0
    // The settings preview hands over the countdown style being tried.
    const style = c.countdownStyle || settings.get('nextUpCountdownStyle') || 'both'
    const counting = !c.airs && props.countdown != null && c.timeout > 0
    const ring = counting && (style === 'progressBar' || style === 'both')
    const timer = counting && (style === 'timer' || style === 'both')
    let y = thumbH + 23
    const eyebrowY = y
    y += 33
    // The episode's pill is 41 tall (its 33 line box, 3 padding and a border), and the marker pills
    // are centered on it, 8 apart.
    const markers = c.markers || []
    const rowH = c.pill ? 41 : markers.length ? PILL_H : 0
    const pillW = c.pill ? textWidth(c.pill, 16, 'bold') + 26 : 0
    let px = 26 + (pillW ? pillW + 8 : 0)
    const pillsY = y + 10
    // A marker gives at most three pills (its kind, Recap and the audio), drawn in three fixed slots.
    // shortcut: the pills stay on one row and don't wrap. Wrap them if a long translation overflows the card.
    const marks = [0, 1, 2].map((i) => {
      const m = markers[i]
      if (!m) return EMPTY_MARK
      const it = { ...m, a: 1, x: px, y: pillsY + (rowH - PILL_H) / 2 }
      px += m.w + 8
      return it
    })
    if (rowH) y = pillsY + rowH
    const titleSize = minimal ? 20 : 23
    const titleLh = minimal ? 26 : 29.9
    const titleY = y + 12
    const lines = c.title ? Math.min(minimal ? 1 : 2, lineCount(c.title, titleSize, 'bold', w - 52)) : 0
    y = titleY + lines * titleLh
    const airsY = y + 6
    if (c.airs) y = airsY + 33
    const timerY = y + 10
    if (timer) y = timerY + 33
    const actionsY = y + 20
    y = actionsY + (c.airs ? 64 : 66)
    const h = y + 26
    const playW = textWidth(playLabel, 22, 'bold') + 93
    return {
      x: 1885 - w,
      y: 906 - h,
      w,
      h,
      thumb: thumbH ? 1 : 0,
      thumbH: thumbH || 1,
      image: thumbH ? c.image : '',
      eyebrowY,
      eyebrowSize: minimal ? 16 : 17,
      pill: c.pill ? 1 : 0,
      pillLabel: c.pill || ' ',
      pillW: pillW || 1,
      pillsY,
      marks,
      title: c.title || ' ',
      titleFont: fontFor(c.title || '', 'bold'),
      titleSize,
      titleLh,
      titleY,
      titleLines: Math.max(1, lines),
      airs: c.airs || '',
      airsSize: minimal ? 17 : 18,
      airsY,
      timer: timer ? $L('Ends in {time}').replace('{time}', formatRemaining(props.countdown)) : '',
      timerY,
      actionsY,
      play: c.airs ? 0 : 1,
      playW,
      ring: ring ? 1 : 0,
      progress: ring ? props.countdown / c.timeout : 0,
      dismissX: c.airs ? w - 90 : 26 + playW + 16,
      dismissY: c.airs ? actionsY : actionsY + 1,
    }
  })
  const playFocused = () => active() && cur() === 0
  const dismissFocused = () => active() && cur() === 1

  // A new card starts on its default button. Its pills arriving later don't make it a new card.
  let shownKey
  createEffect(
    on(
      () => props.card,
      (c) => {
        const key = c ? `${c.title}|${c.airs}` : ''
        if (key !== shownKey) setCur(c && c.airs ? 1 : 0)
        shownKey = key
      },
    ),
  )
  const say = (id) => {
    if (props.onNextUp) props.onNextUp(id)
    return true
  }
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      x={look().x}
      y={look().y}
      width={look().w}
      height={look().h}
      alpha={props.show ? 1 : 0}
      // Focus lands on Play Next, or the close button on the air date card.
      onFocusChanged={(has) => {
        if (has) setCur(airs() ? 1 : 0)
        setActive(has)
      }}
      onLeft={() => {
        if (!airs()) setCur(0)
        return true
      }}
      onRight={() => {
        setCur(1)
        return true
      }}
      onEnter={() => say(cur() === 0 ? 'play' : 'hide')}
      onBack={() => say('hide')}
      // The air date card keeps Stop too, and closing it leaves the player either way.
      onStop={() => (airs() ? say('hide') : false)}
      onKeyPress={(e, mapped) => mapped !== 'Stop'}
    >
      <view width={look().w} height={look().h} borderRadius={26} color="#00000000" shadow={shadow} />
      <view width={look().w} height={look().h} borderRadius={26} color={fill} />
      <view width={look().w} height={look().thumbH} alpha={look().thumb}>
        <view width={look().w} height={look().thumbH} borderRadius={[26, 26, 0, 0]} color="#00000066" />
        <view width={look().w} height={look().thumbH} borderRadius={[26, 26, 0, 0]} src={look().image} textureOptions={COVER} />
        <view y={look().thumbH * 0.45} width={look().w} height={look().thumbH * 0.51} colorTop="#00000000" colorBottom="#000000de" />
        <view y={look().thumbH * 0.96} width={look().w} height={look().thumbH * 0.04} color="#000000de" />
      </view>
      <text fontFamily={bold} fontSize={look().eyebrowSize} letterSpacing={1.7} x={26} y={look().eyebrowY + 1} lineHeight={33} color="#ffffffd9">
        {upNext}
      </text>
      <view x={26} y={look().pillsY} width={look().pillW} height={41} alpha={look().pill}>
        <view width={look().pillW} height={41} borderRadius={9} color="#00a4dc38" border={{ width: 1, color: hex('#00a4dc66') }} />
        <text fontFamily={bold} fontSize={16} x={13} y={5} lineHeight={33} color="#ffffffff">
          {look().pillLabel}
        </text>
      </view>
      <view>
        <Index each={look().marks}>
          {(m) => (
            <view x={m().x} y={m().y} alpha={m().a}>
              <view width={m().w} height={28.5} borderRadius={9} color={m().fill} border={{ width: 1, color: hex(m().border) }} />
              <text fontFamily={bold} fontSize={15} letterSpacing={0.2} x={12} y={4} lineHeight={22.5} color={m().text}>
                {m().label}
              </text>
            </view>
          )}
        </Index>
      </view>
      <text
        fontFamily={look().titleFont}
        fontSize={look().titleSize}
        x={26}
        y={look().titleY + 1}
        lineHeight={look().titleLh}
        maxWidth={look().w - 52}
        maxLines={look().titleLines}
        color="#ffffffff"
      >
        {look().title}
      </text>
      <text alpha={look().airs ? 1 : 0} fontFamily={regular} fontSize={look().airsSize} x={26} y={look().airsY + 1} lineHeight={33} color="#ffffffd9">
        {look().airs || ' '}
      </text>
      <text alpha={look().timer ? 1 : 0} fontFamily={bold} fontSize={17} x={26} y={look().timerY + 1} lineHeight={33} color="#ffffffb3">
        {look().timer || ' '}
      </text>
      <view x={26} y={look().actionsY} width={look().playW} height={66} alpha={look().play}>
        <view width={look().playW} height={66} borderRadius={17} color={ACCENT} />
        <view width={look().playW} height={66} borderRadius={17} color="#00000000" border={{ width: 1, color: hex('#ffffff') }} alpha={playFocused() ? 1 : 0} />
        <view x={24} y={17} width={32} height={32} src="icons/play_arrow.webp" color="#ffffffff" alpha={1 - look().ring} />
        <view x={24} y={17} width={32} height={32} alpha={look().ring}>
          <CountdownRing size={32} stroke={4} progress={look().progress} track="#ffffff3d" value="#ffffffff" />
          <view x={7.5} y={7.5} width={17} height={17} src="icons/play_arrow.webp" color="#ffffffff" />
        </view>
        <text fontFamily={bold} fontSize={22} x={69} y={21} lineHeight={26} color="#ffffffff">
          {playLabel}
        </text>
      </view>
      <view x={look().dismissX} y={look().dismissY} width={64} height={64}>
        <view width={64} height={64} borderRadius={17} color="#ffffff14" border={{ width: 1, color: hex('#ffffff2e') }} alpha={dismissFocused() ? 0 : 1} />
        <view width={64} height={64} borderRadius={17} color="#00a4dc3d" border={{ width: 1, color: hex(ACCENT) }} alpha={dismissFocused() ? 1 : 0} />
        <view x={17.5} y={17.5} width={29} height={29} src="icons/close.webp" color="#ffffffff" />
      </view>
    </view>
  )
}
