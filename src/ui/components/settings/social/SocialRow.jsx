import { For } from 'solid-js'
import { hex } from '../../../color.js'
import { theme } from '../../../theme.js'
import { keyed } from '../../library/pageKit.js'
import TileFocus from '../TileFocus.jsx'
import SettingsSwitch from '../SettingsSwitch.jsx'

// One achievement or friends card from build.cardRow: the card with SettingsRow's focus look, then
// the badge shell, avatar, rank number or settings tile on the left, the lines of its body, and its
// rarity, price, score, tick, count, chevron or switch on the end. Its fonts and art come from
// dress.js.
const of = (list, kind) => list.filter((l) => l.kind === kind)

export default function SocialRow(props) {
  const m = () => props.m
  const p = () => props.p
  const on = () => !!props.focused
  const r = () => (theme().isPixel ? 0 : 26.71)
  const lead = (kind) => keyed(() => of(m().lead, kind), (l) => l.k)
  const line = (kind) => keyed(() => of(m().lines, kind), (l) => l.k)
  const trail = (kind) => keyed(() => of(m().trail, kind), (l) => l.k)
  const tiles = lead('tile')
  const glyphs = lead('glyph')
  const avatars = lead('avatar')
  const gutters = lead('gutter')
  const headings = line('heading')
  const captions = line('caption')
  const notes = line('note')
  const bars = line('bar')
  const stacks = trail('stack')
  const texts = trail('text')
  const checks = trail('check')
  const chevrons = trail('chevron')
  const unreads = trail('unread')
  const toggles = trail('toggle')
  // Each part kind is drawn in a container of its own, so the kinds keep their draw order.
  const each = (list, draw) => (
    <view width={m().w} height={m().h}>
      <For each={list.keys()}>{(k) => draw(list.item(k))}</For>
    </view>
  )
  const textColor = (t) => {
    if (t.tone === 'strong') return on() ? p().strong : p().onSurface
    if (t.tone === 'accent') return on() ? p().strong : p().accent
    return t.color
  }
  return (
    <view x={m().x} y={m().y} width={m().w} height={m().h} alpha={m().dim ? 0.45 : 1}>
      <view width={m().w} height={m().h} borderRadius={r()} color={p().tileFill} border={{ width: 1, color: hex(p().tileBorder) }} />
      <TileFocus w={m().w} h={m().h} radius={r()} on={on()} fade={props.fade} p={p()} />

      {each(tiles, (t) => (
        <view x={t().x} y={t().y} width={48} height={48} alpha={t().dimmed ? 0.4 : 1}>
          <view width={48} height={48} borderRadius={14} color={t().fill} border={{ width: 1, color: hex(t().edge) }} />
          <view x={12} y={12} width={24} height={24} src={t().src} color={t().ink} />
        </view>
      ))}
      {each(glyphs, (t) => (
        <view x={t().x} y={t().y} width={73.46} height={73.46}>
          <view
            width={73.46}
            height={73.46}
            borderRadius={23.37}
            color={on() ? p().iconFocusFill : p().iconFill}
            border={{ width: 1, color: hex(on() ? p().iconFocusBorder : p().iconBorder) }}
          />
          <view x={18.37} y={18.37} width={36.73} height={36.73} src={t().src} color={on() ? p().soft : p().glyph} />
        </view>
      ))}
      {each(avatars, (t) => (
        <view x={t().x} y={t().y} width={56} height={56}>
          <view width={56} height={56} borderRadius={28} color="#00a4dc40" />
          <text fontFamily={t().font} fontSize={24} lineHeight={33} x={28} mountX={0.5} y={13.54} color="#ffffffff">
            {t().letter || ' '}
          </text>
          <view
            x={38}
            y={38}
            width={18}
            height={18}
            borderRadius={9}
            color={t().online ? '#4caf50ff' : '#ffffff59'}
            border={{ width: 1, color: hex('#141414ff') }}
            alpha={t().online === true || t().online === false ? 1 : 0}
          />
        </view>
      ))}
      {each(gutters, (t) => (
        <text fontFamily={t().font} fontSize={28} lineHeight={33} x={t().x + 28} mountX={0.5} y={t().y + 2.38} color={on() ? p().strong : p().onSurface}>
          {t().text || ' '}
        </text>
      ))}

      {each(headings, (t) => (
        <text fontFamily={t().font} fontSize={23.37} lineHeight={27.39} x={t().x} y={t().y + 1.99} maxWidth={t().w} color={on() ? p().strong : p().onSurface}>
          {t().text || ' '}
        </text>
      ))}
      {each(captions, (t) => (
        <text fontFamily={t().font} fontSize={20.03} lineHeight={23.47} x={t().x} y={t().y + 1.7} maxWidth={t().w} color={on() ? p().soft : p().caption}>
          {t().text || ' '}
        </text>
      ))}
      {each(notes, (t) => (
        <text fontFamily={t().font} fontSize={20} lineHeight={33} x={t().x} y={t().y + 1.7} maxWidth={t().w} color={t().color || (on() ? p().soft : p().caption)}>
          {t().text || ' '}
        </text>
      ))}
      {each(bars, (t) => (
        <view x={t().x} y={t().y} width={t().w} height={t().h} borderRadius={t().h / 2} color="#ffffff26">
          <view width={Math.max(0.01, t().w * t().value)} height={t().h} borderRadius={t().h / 2} color={t().fill} alpha={t().value > 0 ? 1 : 0} />
        </view>
      ))}

      {each(stacks, (t) => (
        <view>
          <text fontFamily={t().topFont} fontSize={20} lineHeight={33} x={t().right} mountX={1} y={t().mid - 35 + 1.7} color={t().topColor}>
            {t().top || ' '}
          </text>
          <text fontFamily={t().bottomFont} fontSize={20} lineHeight={33} x={t().right} mountX={1} y={t().mid + 2 + 1.7} color={on() ? p().soft : p().caption}>
            {t().bottom || ' '}
          </text>
        </view>
      ))}
      {each(texts, (t) => (
        <text fontFamily={t().font} fontSize={t().size} lineHeight={33} x={t().right} mountX={1} y={t().mid - 16.5 + t().size * 0.085} color={textColor(t())}>
          {t().text || ' '}
        </text>
      ))}
      {each(checks, (t) => (
        <view x={t().right - 30} y={t().mid - 15} width={30} height={30} src="icons/ach/check_circle.webp" color="#00a4dcff" />
      ))}
      {each(chevrons, (t) => (
        <view
          x={t().right - 33.39}
          y={t().mid - 16.7}
          width={33.39}
          height={33.39}
          src="icons/settings/chevron_right.webp"
          color={on() ? p().soft : p().caption}
        />
      ))}
      {each(unreads, (t) => (
        <view x={t().right - t().w} y={t().mid - 18} width={t().w} height={36} borderRadius={18} color="#00a4dcff">
          <text fontFamily={t().font} fontSize={20} lineHeight={33} x={t().w / 2} mountX={0.5} y={3.2} color="#ffffffff">
            {String(t().count)}
          </text>
        </view>
      ))}
      {each(toggles, (t) => (
        <SettingsSwitch x={t().right - 6.68 - 86.8} y={t().mid - 26.7} on={t().on} p={p()} slide={props.slide} />
      ))}
    </view>
  )
}
