import { onCleanup, onMount } from 'solid-js'
import LoadingAnimation from '../LoadingAnimation.jsx'
import { getStore } from '../../../../state/store.js'
import * as settings from '../../../../state/settings.js'

// The loading animation over a black page, as the player shows it while a stream loads. Data:
// label, dimmed and prefs, as LoadingAnimation takes them.
export default function LoadingLab(props) {
  const store = getStore()
  store.navVisible = false
  onMount(() => (window.__moonfinLabMounted = Date.now()))
  onCleanup(() => (store.navVisible = true))
  return (
    <view width={1920} height={1080} color="#000000ff">
      <LoadingAnimation label={props.label} dimmed={props.dimmed} prefs={{ ...settings.all(), ...props.prefs }} />
    </view>
  )
}
