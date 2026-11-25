import { createRoot, createSignal, onCleanup } from 'solid-js'
import { insert, rootNode } from '@solidtv/solid'
import { usePage } from '../app/PageStack.jsx'

// A page's own nodes draw under the nav, so a popup that belongs above it renders through <OverNav>
// into App's overNav layer, over the nav and under App's overlays and the toast. It shows only while
// its page is on top, since a page kept alive under another keeps its popups too. Outside a page it
// renders in place. Keys from inside it bubble to App, not to the page, so a popup in it handles
// every key itself. Unlike Portal it mounts right away, so the holder's onMount can focus it.
export function OverNav(props) {
  const page = usePage()
  if (!page) return <view>{props.children}</view>
  const layer = <view alpha={page.active() ? 1 : 0}>{props.children}</view>
  const host = rootNode.searchChildrenById('overNav') || rootNode
  const [gone, setGone] = createSignal(false)
  createRoot((dispose) => insert(host, () => (gone() ? dispose() : layer), null))
  onCleanup(() => setGone(true))
  return null
}
