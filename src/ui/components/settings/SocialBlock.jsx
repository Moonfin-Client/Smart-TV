import { For, Show } from 'solid-js'
import { hex } from '../../color.js'
import { keyed } from '../library/pageKit.js'
import { rowFont, rowUiFont } from './rowFont.js'
import SocialRow from './social/SocialRow.jsx'
import SocialTabs from './social/SocialTabs.jsx'
import SocialShowcase from './social/SocialShowcase.jsx'
import { fx } from './fx.js'
import { COLUMN_W } from './layoutRows.js'

// The Achievement Badges and Friends blocks (screens/social.js, built by social/build.js): the
// cards ('social.row'), the rank header, chips, showcase, tabs, progress, blurb, watch clock,
// profile header and stats, messages and retry, action buttons, text fields, chat bubbles and the
// composer.

export default function SocialBlock(props) {
  const m = () => props.m
  const p = () => props.p
  const kind = () => m().block
  const is = (...kinds) => kinds.indexOf(kind()) >= 0
  const lit = (sid) => sid === props.focusSid
  const list = (when, field, key = (x) => x.k) => keyed(() => (is(...when) ? m()[field] || [] : []), key)
  const ranks = list(['social.rank'], 'rank')
  const chips = list(['social.rank', 'social.chips'], 'chips')
  const bars = list(['social.progress'], 'bar')
  const clockBars = list(['social.clock'], 'bars')
  const clockLabels = list(['social.clock'], 'labels')
  const profileLines = list(['social.profile'], 'lines')
  const stats = list(['social.stats'], 'items')
  const buttons = list(['social.actions', 'social.composer'], 'buttons')
  const parts = list(['social.bubble'], 'parts')
  const regular = () => rowUiFont()
  const bold = () => rowUiFont('bold')
  const each = (l, draw) => (
    <view width={COLUMN_W} height={m().h}>
      <For each={l.keys()}>{(k) => draw(l.item(k))}</For>
    </view>
  )
  const field = () => {
    const shown = m().value || m().placeholder || ''
    return { on: lit(m().sid), empty: !m().value, shown }
  }
  return (
    <view width={COLUMN_W} height={m().h}>
      <view>
        <Show when={is('social.row') && m().card}>
          <SocialRow m={m().card} focused={lit(m().card.sid)} p={p()} fade={props.fade} slide={props.slide} />
        </Show>
      </view>

      <view>
        <Show when={is('social.message')}>
          <text
            fontFamily={rowFont(m().text || '')}
            fontSize={24}
            lineHeight={33}
            x={(m().centerX || COLUMN_W / 2) - (m().textW || (COLUMN_W - 48)) / 2}
            y={(m().padTop || 0) + 40 + 2.04}
            maxWidth={m().textW || (COLUMN_W - 48)}
            contain="width"
            textAlign="center"
            color="#ffffffb3"
          >
            {m().text || ' '}
          </text>
        </Show>
      </view>

      <view>
        <Show when={is('social.retry')}>
          <view transition={fx('scale', 150)} x={m().bx} y={8} width={m().w} height={63} pivot={0.5} scale={lit(m().sid) ? 1.05 : 1}>
            <view width={m().w} height={63} borderRadius={28} color="#00a4dcff" />
            <text fontFamily={regular()} fontSize={24} lineHeight={33} x={m().w / 2} mountX={0.5} y={17.04} color="#000000ff">
              {m().label || ' '}
            </text>
          </view>
        </Show>
      </view>

      {each(ranks, (r) => (
        <view x={24} y={8} width={(COLUMN_W - 48)} height={170}>
          <view width={88} height={88} borderRadius={24} color={r().fill} border={{ width: 1, color: hex(r().edge) }} />
          <view x={20} y={20} width={48} height={48} src={r().src} color={r().ink} />
          <text fontFamily={r().nameFont} fontSize={34} lineHeight={33} x={108} y={11.89} color="#ffffffff">
            {r().name || ' '}
          </text>
          <text fontFamily={regular()} fontSize={24} lineHeight={33} x={108} y={48.04} color="#ffffffb3">
            {r().score || ' '}
          </text>
          <view y={106} width={(COLUMN_W - 48)} height={10} borderRadius={5} color="#ffffff26">
            <view width={Math.max(0.01, (COLUMN_W - 48) * r().value)} height={10} borderRadius={5} color={r().ink} alpha={r().value > 0 ? 1 : 0} />
          </view>
          <text fontFamily={rowFont(r().note || '')} fontSize={22} lineHeight={33} y={127.87} color="#ffffffb3">
            {r().note || ' '}
          </text>
        </view>
      ))}

      {each(chips, (c) => (
        <view x={c().x} y={c().y} width={c().w} height={49} borderRadius={22} color="#141414ff">
          <view x={14} y={11.5} width={26} height={26} src={'icons/ach/' + c().icon + '.webp'} color="#00a4dcff" />
          <text fontFamily={rowFont(c().label || '')} fontSize={22} lineHeight={33} x={50} y={9.87} color="#ffffffff">
            {c().label || ' '}
          </text>
        </view>
      ))}

      <view>
        <Show when={is('social.showcase')}>
          <SocialShowcase m={m()} focusSid={props.focusSid} />
        </Show>
      </view>
      <view>
        <Show when={is('social.tabs')}>
          <SocialTabs m={m()} focusSid={props.focusSid} p={p()} />
        </Show>
      </view>

      <view>
        <Show when={is('social.progress')}>
          <text fontFamily={bold()} fontSize={30} lineHeight={33} x={24} y={2.55} color="#ffffffff">
            {m().figure || ' '}
          </text>
        </Show>
      </view>
      {each(bars, (b) => (
        <view x={24} y={45} width={(COLUMN_W - 48)} height={10} borderRadius={5} color="#ffffff26">
          <view width={Math.max(0.01, (COLUMN_W - 48) * b().value)} height={10} borderRadius={5} color={b().fill} alpha={b().value > 0 ? 1 : 0} />
        </view>
      ))}

      <view>
        <Show when={is('social.blurb')}>
          <text fontFamily={rowFont(m().text || '')} fontSize={24} lineHeight={32.4} x={24} y={2.04} maxWidth={(COLUMN_W - 48)} color="#ffffffb3">
            {m().text || ' '}
          </text>
        </Show>
      </view>

      {each(clockBars, (b) => <view x={b().x} y={b().y} width={b().w} height={b().h} borderRadius={2} color="#00a4dcff" />)}
      {each(clockLabels, (cl) => (
        <text fontFamily={regular()} fontSize={18} lineHeight={33} x={cl().x} y={67.53} color="#ffffffb3">
          {cl().text || ' '}
        </text>
      ))}

      <view>
        <Show when={is('social.profile')}>
          <view x={323.3} y={8} width={88} height={88} borderRadius={44} color="#00a4dc40">
            <text fontFamily={rowFont(m().letter || '', 'bold')} fontSize={36} lineHeight={33} x={44} mountX={0.5} y={30.56} color="#ffffffff">
              {m().letter || ' '}
            </text>
          </view>
          <text
            fontFamily={rowFont(m().name || '', 'bold')}
            fontSize={32}
            lineHeight={33}
            x={0}
            y={110.72}
            maxWidth={COLUMN_W}
            contain="width"
            textAlign="center"
            color="#ffffffff"
          >
            {m().name || ' '}
          </text>
          <view
            x={393.3}
            y={78}
            width={18}
            height={18}
            borderRadius={9}
            color={m().online ? '#4caf50ff' : '#ffffff59'}
            border={{ width: 1, color: hex('#141414ff') }}
            alpha={m().online === true || m().online === false ? 1 : 0}
          />
        </Show>
      </view>
      {each(profileLines, (ln) => (
        <text fontFamily={rowFont(ln().text || '')} fontSize={20} lineHeight={33} x={0} y={ln().y + 1.7} maxWidth={COLUMN_W} contain="width" textAlign="center" color="#ffffffb3">
          {ln().text || ' '}
        </text>
      ))}

      {each(stats, (s) => (
        <view x={s().x} y={4} width={s().w} height={49} borderRadius={12} color="#ffffff14">
          <text fontFamily={rowFont(s().text || '')} fontSize={20} lineHeight={33} x={16} y={9.7} color="#ffffffff">
            {s().text || ' '}
          </text>
        </view>
      ))}

      <view>
        <Show when={is('social.input') && m().label}>
          <text fontFamily={regular()} fontSize={20.03} lineHeight={33} x={26.71} y={15.06} color={p().caption}>
            {m().label}
          </text>
        </Show>
      </view>
      <view>
        <Show when={is('social.input', 'social.composer')}>
          <view
            x={m().fieldX}
            y={m().fieldY}
            width={m().fieldW}
            height={m().fieldH}
            borderRadius={20.03}
            color={field().on ? p().tileFocusFill : p().surfaceVariant}
            alpha={m().disabled ? 0.5 : 1}
          >
            <text
              fontFamily={rowFont(field().shown)}
              fontSize={23.37}
              lineHeight={33}
              x={23.37}
              y={22.02}
              maxWidth={m().fieldW - 46.74}
              maxLines={1}
              color={field().empty ? p().os55 : field().on ? p().onButtonFocused : p().onSurface}
            >
              {field().shown || ' '}
            </text>
          </view>
        </Show>
      </view>

      {each(buttons, (b) => {
        const on = () => lit(b().sid)
        return (
          <view transition={fx('scale', 200)} x={b().x} y={b().y} width={b().w} height={b().h} pivot={0.5} scale={on() ? 1.05 : 1}>
            <view
              width={b().w}
              height={b().h}
              borderRadius={10}
              color={on() ? p().tileFocusFill : p().buttonNormal}
              border={{ width: 1, color: hex(on() ? p().t.focus : p().tileBorder) }}
            />
            <text fontFamily={bold()} fontSize={17} lineHeight={33} x={29} y={16.45} color={on() ? p().onButtonFocused : p().onButtonNormal}>
              {b().label || ' '}
            </text>
          </view>
        )
      })}

      <view>
        <Show when={is('social.bubble')}>
          <view
            x={m().bx}
            y={m().by}
            width={m().w}
            height={m().bh}
            borderRadius={20}
            color={m().own ? '#00a4dc4d' : '#ffffff1a'}
            border={{ width: 1, color: hex(lit(m().sid) ? '#ffffffff' : '#00000000') }}
          />
        </Show>
      </view>
      {each(parts, (t) => (
        <text
          fontFamily={rowFont(t().text || '', t().kind === 'sender' ? 'bold' : 'regular')}
          fontSize={t().size}
          lineHeight={t().lh}
          x={m().bx + 21}
          y={m().by + 15 + t().y + t().size * 0.085}
          maxWidth={m().maxW}
          color={t().kind === 'sender' ? '#00a4dcff' : t().kind === 'meta' || t().kind === 'photo' ? '#ffffff99' : '#ffffffff'}
        >
          {t().text || ' '}
        </text>
      ))}
    </view>
  )
}
