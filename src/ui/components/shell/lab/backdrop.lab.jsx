import { createSignal, onCleanup, onMount } from 'solid-js'
import BackdropLayer from '../BackdropLayer.jsx'
import { getStore } from '../../../../state/store.js'

// The backdrop layer alone. Data: the BackdropLayer props, and urls, a list it steps through every
// `every` ms to show the cross fade.
export default function BackdropLab(props) {
  const store = getStore()
  store.navVisible = false
  onCleanup(() => (store.navVisible = true))
  const [url, setUrl] = createSignal(props.url || (props.urls && props.urls[0]) || '')
  onMount(() => {
    if (!props.urls) return
    let i = 0
    const t = setInterval(() => setUrl(props.urls[(i = (i + 1) % props.urls.length)]), props.every || 3000)
    onCleanup(() => clearInterval(t))
  })
  return <BackdropLayer url={url()} blur={props.blur} placement={props.placement} overlayOpacity={props.overlayOpacity} flat={props.flat} />
}
