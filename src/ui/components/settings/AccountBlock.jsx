import { For, Show } from 'solid-js'
import { hex } from '../../color.js'
import { theme } from '../../theme.js'
import { keyed } from '../library/pageKit.js'
import { rowFont, rowUiFont } from './rowFont.js'
import { reDy } from './faces.js'
import TileFocus from './TileFocus.jsx'
import SettingsSwitch from './SettingsSwitch.jsx'
import { fx } from './fx.js'
import { COLUMN_W } from './layoutRows.js'

// The account and system blocks from screens/account.js: the Settings Sync cards ('acct.sync'), the
// legacy action buttons ('acct.actions'), the playback time preview ('acct.playbackTime'), the QR
// code ('acct.qr'), the log filters and lines ('acct.logFilters', 'acct.log') and the theme cards
// ('acct.themes'). A pixel theme squares off the cards and chips and sets the Sync card's text at
// 60 percent.
const NONE = '#00000000'
const LOAD = 'sync-profile-load'
const SAVE = 'sync-profile-save'
const RESET = 'sync-profile-reset'
const gradient = (g) => (g ? { angle: g.angle, colors: g.colors, stops: g.stops } : undefined)

export default function AccountBlock(props) {
  const m = () => props.m
  const p = () => props.p
  const kind = () => m().block
  const pixel = () => !!theme().isPixel
  const sq = (r) => (pixel() ? 0 : r)
  const sz = (v) => (pixel() ? v * 0.6 : v)
  const dy = (v, font) => reDy(v, sz(v), font)
  const lit = (sid) => sid === props.focusSid
  const statusOn = () => lit('setting-useMoonfinPlugin')
  const listOf = (k, field) => () => (kind() === k ? m()[field] || [] : [])
  const chips = keyed(listOf('acct.sync', 'chips'), (c) => c.k)
  const profiles = keyed(listOf('acct.sync', 'profiles'), (c) => c.k)
  const sections = keyed(listOf('acct.sync', 'sections'), (c) => c.k)
  const transfer = keyed(listOf('acct.sync', 'transfer'), (c) => c.k)
  const actions = keyed(listOf('acct.actions', 'buttons'), (c) => c.k)
  const filters = keyed(listOf('acct.logFilters', 'filters'), (c) => c.k)
  const logs = keyed(listOf('acct.log', 'rows'), (c) => c.k)
  const themes = keyed(listOf('acct.themes', 'cards'), (c) => c.k)
  const regular = () => rowUiFont()
  const medium = () => rowUiFont('medium')
  const bold = () => rowUiFont('bold')
  return (
    <view width={COLUMN_W} height={m().h}>
      <view>
        <Show when={kind() === 'acct.sync'}>
          <view x={20.03} y={m().statusY} width={(COLUMN_W - 40.06)} height={m().statusH}>
            <view width={(COLUMN_W - 40.06)} height={m().statusH} borderRadius={sq(26.71)} color={p().surface} border={{ width: 1, color: hex(p().tileBorder) }} />
            <TileFocus w={(COLUMN_W - 40.06)} h={m().statusH} radius={sq(26.71)} on={statusOn()} fade={props.fade} p={p()} />
            <view
              x={25.04}
              y={41.7}
              width={73.46}
              height={73.46}
              borderRadius={23.37}
              color={statusOn() ? p().iconFocusFill : p().iconFill}
              border={{ width: 1, color: hex(statusOn() ? p().iconFocusBorder : p().iconBorder) }}
            />
            <view x={43.4} y={60.07} width={36.73} height={36.73} src={'icons/settings/' + m().icon + '.webp'} color={statusOn() ? p().soft : p().onSurface} />
            <text
              fontFamily={bold()}
              fontSize={sz(26.71)}
              lineHeight={40.07}
              letterSpacing={0.25}
              x={118.52}
              y={45.57 + dy(26.71, bold())}
              color={statusOn() ? p().strong : p().onSurface}
            >
              {m().statusTitle || ' '}
            </text>
            <view x={118.52} y={93.4} width={13.36} height={13.36} borderRadius={6.68} color={m().statusDot} />
            <text
              fontFamily={rowFont(m().statusText || '')}
              fontSize={sz(20.03)}
              lineHeight={26.71}
              letterSpacing={0.67}
              x={m().statusDot === NONE ? 118.52 : 141.9}
              y={88.4 + dy(20.03, regular())}
              maxWidth={430}
              maxLines={1}
              color={statusOn() ? p().inkSeventy : p().caption}
            >
              {m().statusText || ' '}
            </text>
            <SettingsSwitch x={COLUMN_W - 158.59} y={38.36} on={m().on} p={p()} slide={props.slide} />
            <text
              fontFamily={bold()}
              fontSize={sz(18.37)}
              lineHeight={26.71}
              letterSpacing={0.83}
              x={COLUMN_W - 115.2}
              mountX={0.5}
              y={106.66 + dy(18.37, bold())}
              color={statusOn() ? p().inkSeventy : p().caption}
            >
              {m().onLabel || ' '}
            </text>
          </view>
        </Show>
      </view>
      <view width={COLUMN_W} height={m().h}>
        <For each={chips.keys()}>
          {(k) => {
            const c = chips.item(k)
            return (
              <view
                x={45.07 + c().x}
                y={m().statusY + 131.8}
                width={c().w}
                height={38.71}
                borderRadius={sq(19.35)}
                color={statusOn() ? p().inkSix : p().t.chipBackground}
                border={{ width: 1, color: hex(statusOn() ? p().inkTwenty : p().t.chipBorder.color) }}
              >
                <text
                  fontFamily={medium()}
                  fontSize={sz(18.37)}
                  lineHeight={26.71}
                  letterSpacing={0.83}
                  x={c().w / 2}
                  mountX={0.5}
                  y={7.56 + dy(18.37, medium())}
                  color={statusOn() ? p().strong : p().onSurface}
                >
                  {c().label || ' '}
                </text>
              </view>
            )
          }}
        </For>
      </view>
      <view width={COLUMN_W} height={m().h}>
        <For each={sections.keys()}>
          {(k) => {
            const sec = sections.item(k)
            return (
              <view x={20.03} y={sec().y} width={(COLUMN_W - 40.06)} height={120}>
                <text fontFamily={bold()} fontSize={sz(20.03)} lineHeight={28.65} letterSpacing={2} x={26.71} y={35.09 + dy(20.03, bold())} color={p().accent}>
                  {sec().text || ' '}
                </text>
                <text
                  fontFamily={regular()}
                  fontSize={sz(20.03)}
                  lineHeight={26.71}
                  letterSpacing={0.67}
                  x={26.71}
                  y={73.74 + dy(20.03, regular())}
                  maxWidth={COLUMN_W - 93.6}
                  color={p().caption}
                >
                  {sec().caption || ' '}
                </text>
              </view>
            )
          }}
        </For>
      </view>
      <view width={COLUMN_W} height={m().h}>
        <For each={profiles.keys()}>
          {(k) => {
            const pr = profiles.item(k)
            const on = () => lit(pr().sid)
            const top = () => (pr().h - 60.1) / 2
            return (
              <view x={pr().x} y={pr().y} width={pr().w} height={pr().h}>
                <view
                  width={pr().w}
                  height={pr().h}
                  borderRadius={26.71}
                  color={pr().active ? p().accentFourteen : p().surface}
                  border={{ width: pr().border, color: hex(pr().active ? p().accent : p().tileBorder) }}
                />
                <TileFocus w={pr().w} h={pr().h} radius={26.71} on={on()} fade={props.fade} p={p()} />
                <view
                  x={pr().border + 20.7}
                  y={(pr().h - 40.07) / 2}
                  width={40.07}
                  height={40.07}
                  src={'icons/settings/' + pr().icon + '.webp'}
                  color={on() ? p().soft : pr().active ? p().accent : p().caption}
                />
                <text
                  fontFamily={bold()}
                  fontSize={23.37}
                  lineHeight={33.39}
                  letterSpacing={0.17}
                  x={pr().border + 77.47}
                  y={top() + 2}
                  color={on() ? p().strong : p().onSurface}
                >
                  {pr().label || ' '}
                </text>
                <view
                  x={pr().border + 77.47}
                  y={top() + 33.39 + 6.68}
                  width={13.36}
                  height={13.36}
                  borderRadius={6.68}
                  color="#22c55eff"
                  alpha={pr().device ? 1 : 0}
                />
                <text
                  fontFamily={regular()}
                  fontSize={20.03}
                  lineHeight={26.71}
                  letterSpacing={0.67}
                  x={pr().border + 77.47 + (pr().device ? 23.38 : 0)}
                  y={top() + 33.39 + 1.7}
                  color={on() ? p().inkSeventy : p().caption}
                >
                  {pr().caption || ' '}
                </text>
              </view>
            )
          }}
        </For>
      </view>
      <view width={COLUMN_W} height={m().h}>
        <For each={transfer.keys()}>
          {(k) => {
            const tr = transfer.item(k)
            const btnY = () => tr().btnY - tr().y
            const button = (sid, bx, icon, label, sub) => (
              <view x={bx() - 20.03} y={btnY()} width={tr().btnW} height={tr().btnH}>
                <view width={tr().btnW} height={tr().btnH} borderRadius={sq(26.71)} color={p().buttonNormal} />
                <view
                  transition={fx('alpha', props.fade || 0)}
                  width={tr().btnW}
                  height={tr().btnH}
                  borderRadius={sq(26.71)}
                  color={p().tileFocusFill}
                  border={{ width: 1, color: hex(p().tileFocusBorder) }}
                  alpha={lit(sid) ? 1 : 0}
                />
                <view x={21.7} y={(tr().btnH - 40.07) / 2} width={40.07} height={40.07} src={'icons/settings/' + icon + '.webp'} color={lit(sid) ? p().soft : p().accent} />
                <text fontFamily={bold()} fontSize={sz(23.37)} lineHeight={33.39} letterSpacing={0.17} x={78.47} y={23.7 + dy(23.37, bold())} color={lit(sid) ? p().strong : p().onSurface}>
                  {label() || ' '}
                </text>
                <text fontFamily={regular()} fontSize={sz(20.03)} lineHeight={26.71} letterSpacing={0.67} x={78.47} y={56.8 + dy(20.03, regular())} color={lit(sid) ? p().inkSeventy : p().caption}>
                  {sub() || ' '}
                </text>
              </view>
            )
            return (
              <view x={20.03} y={tr().y} width={(COLUMN_W - 40.06)} height={tr().h} borderRadius={sq(26.71)} color={p().surface}>
                {button(LOAD, () => tr().loadX, 'cloud_download', () => m().loadLabel, () => m().loadSub)}
                {button(SAVE, () => tr().saveX, 'cloud_upload', () => m().saveLabel, () => m().saveSub)}
                <view x={tr().resetX - 20.03} y={tr().resetY - tr().y} width={tr().resetW} height={tr().resetH}>
                  <view
                    transition={fx('alpha', props.fade || 0)}
                    width={tr().resetW}
                    height={tr().resetH}
                    borderRadius={sq(26.71)}
                    color={p().tileFocusFill}
                    border={{ width: 1, color: hex(p().tileFocusBorder) }}
                    alpha={lit(RESET) ? 1 : 0}
                  />
                  <view x={18.37} y={15.03} width={33.39} height={33.39} src="icons/settings/restart_alt.webp" color={p().error} />
                  <text fontFamily={bold()} fontSize={sz(23.37)} lineHeight={33.39} letterSpacing={0.17} x={65.12} y={17.02 + dy(23.37, bold())} color={p().error}>
                    {tr().resetLabel || ' '}
                  </text>
                </view>
                <text
                  fontFamily={rowFont(tr().message || '')}
                  fontSize={sz(20.03)}
                  lineHeight={26.71}
                  x={tr().resetX - 20.03}
                  y={tr().messageY - tr().y + 1.7 + dy(20.03, regular())}
                  maxWidth={COLUMN_W - 80.6}
                  color={p().caption}
                >
                  {tr().message || ' '}
                </text>
              </view>
            )
          }}
        </For>
      </view>

      <view width={COLUMN_W} height={m().h}>
        <For each={actions.keys()}>
          {(k) => {
            const b = actions.item(k)
            const on = () => lit(b().sid)
            return (
              <view
                transition={fx('scale', props.fade || 0)}
                x={b().x}
                y={b().y}
                width={b().w}
                height={b().h}
                alpha={b().disabled ? 0.5 : 1}
                pivot={0.5}
                scale={on() ? 1.05 : 1}
              >
                <view width={b().w} height={b().h} borderRadius={sq(10)} color={p().buttonNormal} border={{ width: 2, color: hex(p().tileBorder) }} />
                <view
                  width={b().w}
                  height={b().h}
                  borderRadius={sq(10)}
                  color={b().danger ? p().t.recordingActive : p().tileFocusFill}
                  border={{ width: 2, color: hex(b().danger ? p().t.recordingActive : p().t.focus) }}
                  alpha={on() ? 1 : 0}
                />
                <text fontFamily={bold()} fontSize={17} lineHeight={19.92} x={b().w / 2} mountX={0.5} y={17.45} color={on() ? (b().danger ? '#ffffffff' : p().onButtonFocused) : p().onButtonNormal}>
                  {b().label || ' '}
                </text>
              </view>
            )
          }}
        </For>
      </view>

      <view>
        <Show when={kind() === 'acct.playbackTime'}>
          <view x={24} width={(COLUMN_W - 48)} height={m().h - 12} borderRadius={sq(12)} color={p().surface}>
            <text fontFamily={medium()} fontSize={16} lineHeight={33} x={20} y={17.36} color="#ffffffd9">
              {(m().above || [])[0] || ' '}
            </text>
            <text fontFamily={medium()} fontSize={16} lineHeight={33} x={343.3} mountX={0.5} y={17.36} color="#ffffffd9">
              {(m().above || [])[1] || ' '}
            </text>
            <text fontFamily={medium()} fontSize={16} lineHeight={33} x={(COLUMN_W - 68)} mountX={1} y={17.36} color="#ffffffd9">
              {(m().above || [])[2] || ' '}
            </text>
            <view x={20} y={57} width={(COLUMN_W - 88)} height={6} borderRadius={3} color={p().rangeTrack} />
            <view x={20} y={57} width={Math.max(0.01, (COLUMN_W - 88) * (m().fill || 0))} height={6} borderRadius={3} color={p().rangeProgress} />
            <text fontFamily={bold()} fontSize={18} lineHeight={33} x={20} y={72.53} color={p().onSurface}>
              {(m().below || [])[0] || ' '}
            </text>
            <text fontFamily={bold()} fontSize={18} lineHeight={33} x={343.3} mountX={0.5} y={72.53} color={p().onSurface}>
              {(m().below || [])[1] || ' '}
            </text>
            <text fontFamily={bold()} fontSize={18} lineHeight={33} x={(COLUMN_W - 68)} mountX={1} y={72.53} color={p().onSurface}>
              {(m().below || [])[2] || ' '}
            </text>
          </view>
        </Show>
      </view>

      <view>
        <Show when={kind() === 'acct.qr' && m().src}>
          <view x={(COLUMN_W - m().size) / 2} y={20} width={m().size} height={m().size} src={m().src} borderRadius={8} />
        </Show>
      </view>

      <view width={COLUMN_W} height={m().h}>
        <For each={filters.keys()}>
          {(k) => {
            const f = filters.item(k)
            const on = () => lit(f().sid)
            return (
              <view
                x={f().x}
                y={f().y}
                width={f().w}
                height={f().h}
                borderRadius={f().h / 2}
                color={on() ? p().accent : p().t.surfaceVariant}
                border={{ width: 2, color: hex(on() ? p().t.focus : f().on ? p().accent : NONE) }}
              >
                <text fontFamily={regular()} fontSize={16} lineHeight={18.75} x={20} y={10.36} color={on() ? p().onAccent : f().on ? p().onSurface : p().caption}>
                  {f().label || ' '}
                </text>
              </view>
            )
          }}
        </For>
      </view>

      <view width={COLUMN_W} height={m().h}>
        <For each={logs.keys()}>
          {(k) => {
            const e = logs.item(k)
            return (
              <view x={24} y={e().y} width={(COLUMN_W - 48)} height={e().h} borderRadius={4} color={p().surface}>
                <view width={4} height={e().h} color={e().color} />
                <text fontFamily={regular()} fontSize={14} lineHeight={19.6} x={16} y={9.19} color={p().caption}>
                  {e().time || ' '}
                </text>
                <text fontFamily={regular()} fontSize={14} lineHeight={19.6} letterSpacing={0.5} x={124} y={9.19} color={p().caption}>
                  {e().category || ' '}
                </text>
                <text fontFamily={rowFont(e().message || '')} fontSize={16} lineHeight={23.2} x={16} y={31.96} maxWidth={COLUMN_W - 76.6} color={p().onSurface}>
                  {e().message || ' '}
                </text>
              </view>
            )
          }}
        </For>
      </view>

      <view width={COLUMN_W} height={m().h}>
        <For each={themes.keys()}>
          {(k) => {
            const tc = themes.item(k)
            const on = () => lit(tc().sid)
            return (
              <view transition={fx('scale', 150)} y={tc().y} width={COLUMN_W} height={tc().h} pivot={0.5} scale={on() ? 1.02 : 1}>
                <view width={COLUMN_W} height={tc().h} borderRadius={sq(12)} color={p().tileFill} border={{ width: 1, color: hex(tc().selected ? p().accent : p().tileBorder) }} />
                <TileFocus w={COLUMN_W} h={tc().h} radius={sq(12)} on={on()} fade={150} p={p()} />
                <text fontFamily={rowFont(tc().name || '', 'bold')} fontSize={18} lineHeight={33} x={21} y={18.53} color={on() ? p().strong : p().onSurface}>
                  {tc().name || ' '}
                </text>
                <text fontFamily={rowFont('✓', 'bold')} fontSize={18} lineHeight={33} x={COLUMN_W - 21} mountX={1} y={18.53} color={p().accent} alpha={tc().selected || tc().tick ? 1 : 0}>
                  {'✓'}
                </text>
                <text fontFamily={rowFont(tc().desc || '')} fontSize={14} lineHeight={33} x={21} y={63.19} maxWidth={(COLUMN_W - 42)} color={on() ? p().soft : p().caption}>
                  {tc().desc || ' '}
                </text>
                <view x={21} y={tc().footY} width={(COLUMN_W - 42)} height={36} alpha={tc().stripe ? 1 : 0}>
                  <Show when={tc().stripe}>
                    <view width={(COLUMN_W - 42)} height={36} borderRadius={sq(8)} color="#ffffffff" linearGradient={gradient(tc().stripe)} />
                    <view
                      transition={fx('alpha', 150)}
                      width={(COLUMN_W - 42)}
                      height={36}
                      borderRadius={sq(8)}
                      color="#ffffffff"
                      linearGradient={gradient(tc().stripeLit)}
                      alpha={on() ? 1 : 0}
                    />
                  </Show>
                </view>
                <text fontFamily={bold()} fontSize={14} lineHeight={33} x={21} y={tc().footY + 1.19} color={p().accent}>
                  {tc().action || ' '}
                </text>
              </view>
            )
          }}
        </For>
      </view>
    </view>
  )
}
