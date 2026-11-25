import { onCleanup, onMount } from 'solid-js'
import Screensaver from '../Screensaver.jsx'
import { getStore } from '../../../../state/store.js'

// The screensaver as App shows it, over a hidden nav. window.__moonfinLabMounted marks when it built.
export default function SaverLab() {
  const store = getStore()
  store.navVisible = false
  onMount(() => (window.__moonfinLabMounted = Date.now()))
  onCleanup(() => (store.navVisible = true))
  return <Screensaver visible={true} />
}
