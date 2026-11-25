import { For, Match, Switch } from 'solid-js'
import { keyed } from '../library/pageKit.js'
import { hex } from '../../color.js'
import { theme } from '../../theme.js'
import Spinner from '../Spinner.jsx'
import { rowFont, rowUiFont } from './rowFont.js'
import { reDy } from './faces.js'
import AccountBlock from './AccountBlock.jsx'
import EditorBlock from './EditorBlock.jsx'
import SocialBlock from './SocialBlock.jsx'
import { fx } from './fx.js'
import { COLUMN_W } from './layoutRows.js'
import { themeSpacing, uiFont } from '../../text.js'

// The parts of a settings screen that aren't rows (see blocks.js): the About header, an editor's
// buttons, a text field and a spinner, plus the blocks each area draws in its own component,
// named 'acct.*', 'edit.*' and 'social.*'. [m] is the block's model, [focusSid] the stop that has
// focus, [p] the settings palette.

export default function SettingsBlock(props) {
  const m = () => props.m
  const p = () => props.p
  const kind = () => m().block || ''
  const px = () => (theme().isPixel ? 0.6 : 1)
  const sq = (r) => (theme().isPixel ? 0 : r)
  const inputOn = () => props.focusSid === m().sid
  const buttons = keyed(() => (kind() === 'buttons' ? m().buttons || [] : []), (b) => b.k)
  const area = () => {
    const k = kind()
    return k.indexOf('acct.') === 0 ? 'acct' : k.indexOf('edit.') === 0 ? 'edit' : k.indexOf('social.') === 0 ? 'social' : k
  }
  return (
    <view x={m().x || 0} y={m().y} width={COLUMN_W} height={m().h}>
      <Switch>
        <Match when={area() === 'aboutHeader'}>
          <view x={(COLUMN_W - 532.8) / 2} y={40.07} width={532.8} height={120.2} src="images/settings/logo-and-text.webp" />
          <text
            fontFamily={rowUiFont()}
            fontSize={23.37 * px()}
            lineHeight={33.39}
            letterSpacing={0.42}
            x={0}
            y={175.62 + reDy(23.37, 23.37 * px(), rowUiFont())}
            maxWidth={COLUMN_W}
            contain="width"
            textAlign="center"
            color={p().onSurface}
          >
            {m().version || ' '}
          </text>
          <view y={247.09} width={COLUMN_W} height={1.67} color={p().onSurface} />
        </Match>
        <Match when={area() === 'buttons'}>
          <For each={buttons.keys()}>
            {(k) => {
              const b = buttons.item(k)
              return (
                <view x={b().x} y={b().y} width={b().w} height={b().h} alpha={b().disabled ? 0.38 : 1}>
                  <view width={b().w} height={b().h} borderRadius={sq(b().primary ? 13.36 : 33.39)} color={b().primary ? p().buttonNormal : '#00000000'} />
                  <view
                    transition={fx('alpha', props.fade || 0)}
                    width={b().w}
                    height={b().h}
                    borderRadius={sq(b().primary ? 13.36 : 33.39)}
                    color={p().tileFocusFill}
                    border={{ width: 1, color: hex(p().tileFocusBorder) }}
                    alpha={b().sid === props.focusSid ? 1 : 0}
                  />
                  <text
                    fontFamily={rowUiFont('medium')}
                    fontSize={23.37 * px()}
                    letterSpacing={0.17}
                    lineHeight={27.39}
                    x={b().w / 2}
                    mountX={0.5}
                    y={21.69 + reDy(23.37, 23.37 * px(), rowUiFont('medium'))}
                    color={b().sid === props.focusSid ? p().strong : b().primary ? p().onButtonNormal : p().accent}
                  >
                    {b().label || ' '}
                  </text>
                </view>
              )
            }}
          </For>
        </Match>
        <Match when={area() === 'input'}>
          <text fontFamily={rowUiFont()} fontSize={20.03} lineHeight={33} x={26.71} y={15.06} color={p().caption}>
            {m().label || ' '}
          </text>
          <view x={26.71} y={m().fieldY} width={COLUMN_W - 53.42} height={m().fieldH} borderRadius={sq(20.03)} color={inputOn() ? p().tileFocusFill : p().surfaceVariant} />
          <text
            fontFamily={rowFont(m().shown || '')}
            fontSize={23.37 * px()}
            lineHeight={27.39}
            x={50.08}
            y={m().fieldY + 24.82 + reDy(23.37, 23.37 * px(), rowFont(m().shown || ''))}
            maxWidth={COLUMN_W - 100.2}
            maxLines={1}
            color={m().empty ? p().os55 : inputOn() ? p().onButtonFocused : p().onSurface}
          >
            {m().shown || ' '}
          </text>
        </Match>
        <Match when={area() === 'search'}>
          {/* The search field takes the theme's face, unlike the rows. */}
          <view x={26.71} y={13.36} width={COLUMN_W - 53.42} height={80.14} borderRadius={sq(40.07)} color={inputOn() ? p().tileFocusFill : p().surfaceVariant} />
          <view x={50.08} y={33.4} width={40.07} height={40.07} src="icons/settings/search.webp" color={inputOn() ? p().onButtonFocused : p().caption} />
          <text
            fontFamily={uiFont()}
            fontSize={23.37 * px()}
            lineHeight={33}
            letterSpacing={themeSpacing() || 0.42}
            x={103.5}
            y={38.92 + reDy(23.37, 23.37 * px(), uiFont())}
            maxWidth={Math.max(1, COLUMN_W - 153.6)}
            maxLines={1}
            color={m().value ? (inputOn() ? p().onButtonFocused : p().onSurface) : p().os55}
          >
            {m().shown}
          </text>
        </Match>
        <Match when={area() === 'spinner'}>
          <view x={331.3} y={24} width={72} height={72}>
            <Spinner size={72} />
          </view>
        </Match>
        <Match when={area() === 'acct'}>
          <AccountBlock m={m()} focusSid={props.focusSid} p={p()} fade={props.fade} slide={props.slide} />
        </Match>
        <Match when={area() === 'edit'}>
          <EditorBlock m={m()} focusSid={props.focusSid} p={p()} fade={props.fade} slide={props.slide} />
        </Match>
        <Match when={area() === 'social'}>
          <SocialBlock m={m()} focusSid={props.focusSid} p={p()} fade={props.fade} slide={props.slide} />
        </Match>
      </Switch>
    </view>
  )
}
