import { onCleanup } from 'solid-js'
import SeasonalTheme from '../SeasonalTheme.jsx'
import { getStore } from '../../../../state/store.js'
import * as settings from '../../../../state/settings.js'

// The seasonal layers on black. Data: prefs (seasonalTheme, seasonalDensity, seasonalFollower), and
// target: { x, y, w, h }, a stand-in card in Home's rows that takes focus for the follower, and
// followerOnly to leave the particles out. zone 'nav' with navRight stands the card in for a nav
// button.
export default function SeasonalLab(props) {
  const store = getStore()
  store.navVisible = !!props.nav
  onCleanup(() => (store.navVisible = true))
  let card
  return (
    <view width={1920} height={1080} color={props.nav ? '#00000000' : '#000000ff'} forwardFocus={() => (card ? card.setFocus() || true : false)}>
      <SeasonalTheme layer="particles" on={!props.followerOnly} prefs={{ ...settings.all(), ...props.prefs }} />
      <view seasonalZone={props.zone || 'rows'} navRight={props.navRight}>
        <view
          ref={card}
          x={props.target ? props.target.x : 0}
          y={props.target ? props.target.y : 0}
          width={props.target ? props.target.w : 0}
          height={props.target ? props.target.h : 0}
          color={props.target && props.target.color ? props.target.color : '#00000000'}
        />
      </view>
      <SeasonalTheme layer="follower" on={true} prefs={{ ...settings.all(), ...props.prefs }} />
    </view>
  )
}
