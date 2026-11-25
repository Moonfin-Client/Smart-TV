import $L from '../../../services/i18n.js'
import { Show } from 'solid-js'
import { uiFont, faceDy, themeSpacing } from '../../text.js'
import { theme } from '../../theme.js'
import { tx } from '../../fx.js'

// One tile of the Mosaic panel. `tile` holds plain values from Mosaic's tiles.
export default function MosaicTile(props) {
  const kind = () => props.tile.kind
  const small = () => kind() === 'small'
  const radius = () => (small() ? 18 : 21)
  const ink = () => (small() ? (props.focused ? '#101010ff' : '#ffffffcc') : '#ffffffff')
  const fill = () => (small() ? (props.focused ? '#ffffffff' : '#ffffff12') : '#1a1a1aff')
  const ringW = () => (props.focused ? 4 : props.tile.current && kind() !== 'home' ? 3 : 0)
  const grad = () => kind() === 'live' || kind() === 'discover'
  return (
    <view
      ref={props.ref}
      x={props.tile.x}
      y={props.tile.y}
      width={props.tile.w}
      height={props.tile.h}
      pivot={0.5}
      scale={props.focused && !small() ? 1.04 : 1}
      transition={tx({ scale: { duration: props.fx } })}
    >
      <view
        x={-ringW()}
        y={-ringW()}
        width={props.tile.w + ringW() * 2}
        height={props.tile.h + ringW() * 2}
        borderRadius={radius() + ringW()}
        color={props.focused ? '#ffffffff' : theme().accent}
        alpha={ringW() ? 1 : 0}
      />
      <view width={props.tile.w} height={props.tile.h} borderRadius={radius()} color={fill()} />
      <view>
        <Show when={grad()}>
          <view
            width={props.tile.w}
            height={props.tile.h}
            borderRadius={radius()}
            colorLeft={kind() === 'discover' ? '#4b4fd1ff' : '#22314fff'}
            colorRight={kind() === 'discover' ? '#23245eff' : '#121a2bff'}
          />
        </Show>
      </view>
      <view>
        <Show when={props.tile.art}>
          <view
            width={props.tile.w}
            height={props.tile.h}
            borderRadius={radius()}
            src={props.tile.art}
            textureOptions={{ resizeMode: { type: 'cover' } }}
          />
        </Show>
      </view>
      <view>
        <Show when={kind() === 'discover'}>
          <view width={369} height={144} clipping>
            <view x={231} y={-27} width={165} height={165} src="icons/nav_seerr.webp" color="#ffffffff" alpha={0.35} />
          </view>
        </Show>
      </view>
      <view>
        <Show when={kind() === 'home'}>
          <view width={530} height={144} borderRadius={[21, 0, 0, 21]} colorLeft="#000000c7" colorRight="#00000033" />
          <view x={530} width={226} height={144} borderRadius={[0, 21, 21, 0]} color="#00000033" />
          <view x={27} y={49.5} width={45} height={45} src="icons/nav_home.webp" color="#ffffffff" />
          <text
            letterSpacing={themeSpacing()}
            fontFamily={props.tile.boldFont}
            fontSize={30}
            x={90}
            y={(props.tile.sub ? 46.5 : 60) + faceDy(30, true)}
            lineHeight={1}
            color="#ffffffff"
          >
            {props.tile.label}
          </text>
          <text
            letterSpacing={themeSpacing()}
            fontFamily={props.tile.subFont}
            fontSize={20}
            x={90}
            y={83 + faceDy(20, true)}
            lineHeight={1}
            maxWidth={600}
            maxLines={1}
            color="#ffffffbf"
          >
            {props.tile.sub || ''}
          </text>
          <view
            x={90 + (props.tile.labelW || 0) + 18}
            y={65}
            width={14}
            height={14}
            borderRadius={7}
            color={theme().accent}
            alpha={props.tile.current ? 1 : 0}
          />
        </Show>
      </view>
      <view>
        <Show when={kind() === 'big' && !props.tile.art}>
          <view x={24} y={52.5} width={39} height={39} src={props.tile.icon} color="#ffffffff" />
          <text
            letterSpacing={themeSpacing()}
            fontFamily={props.tile.boldFont}
            fontSize={27}
            x={78}
            y={60.75 + faceDy(27, true)}
            lineHeight={1}
            maxWidth={243}
            maxLines={1}
            color="#ffffffff"
          >
            {props.tile.label}
          </text>
        </Show>
      </view>
      <view>
        <Show when={kind() === 'live'}>
          <view x={24} y={21}>
            <view y={4.5} width={10} height={10} borderRadius={5} color="#ff5a5aff" />
            <text
              fontFamily={uiFont('bold')}
              fontSize={16}
              x={19}
              y={3 + faceDy(16, true)}
              lineHeight={1}
              letterSpacing={1.28}
              color="#ffb4b4ff"
            >
              {$L('LIVE')}
            </text>
          </view>
        </Show>
      </view>
      <view>
        <Show when={grad()}>
          <view x={24} y={84}>
            <view width={39} height={39} src={props.tile.icon} color="#ffffffff" />
            <text
              letterSpacing={themeSpacing()}
              fontFamily={props.tile.boldFont}
              fontSize={27}
              x={54}
              y={8.25 + faceDy(27, true)}
              lineHeight={1}
              maxWidth={267}
              maxLines={1}
              color="#ffffffff"
            >
              {props.tile.label}
            </text>
          </view>
        </Show>
      </view>
      <view>
        <Show when={small()}>
          <view x={40} y={15.5} width={33} height={33} src={props.tile.icon} color={ink()} />
          <text
            letterSpacing={themeSpacing()}
            fontFamily={props.tile.boldFont}
            fontSize={16}
            x={56.5}
            y={58.5 + faceDy(16, true)}
            mountX={0.5}
            lineHeight={1}
            maxWidth={105}
            maxLines={1}
            color={ink()}
          >
            {props.tile.label}
          </text>
        </Show>
      </view>
    </view>
  )
}
