import { Dynamic } from '@solidtv/solid'
import { Show, createMemo, createEffect, on } from 'solid-js'
import * as settings from '../../state/settings.js'
import { getStore } from '../../state/store.js'
import { setNavHandle } from '../../app/focus.js'
import Sidebar from './nav/Sidebar.jsx'
import Reel from './nav/Reel.jsx'
import Mosaic from './nav/Mosaic.jsx'
import TopBar from './nav/TopBar.jsx'
import Tabline from './nav/Tabline.jsx'
import Atlas from './nav/Atlas.jsx'
import { syncFriends } from './nav/friends.js'

const STYLES = { sidebar: Sidebar, reel: Reel, mosaic: Mosaic, topbar: TopBar, tabline: Tabline, atlas: Atlas }

// `show` is App's chrome rule, and `hidden` fades the nav while a full-screen trailer plays. App
// focuses it through the handle, which hands focus to the style on screen.
export default function NavBar(props) {
  const store = getStore()
  let style
  const kind = createMemo(() => {
    const s = settings.all()
    if (s.navbarPosition === 'left') return s.sidebarStyle === 'reel' || s.sidebarStyle === 'mosaic' ? s.sidebarStyle : 'sidebar'
    return s.topNavbarStyle === 'tabline' || s.topNavbarStyle === 'atlas' ? s.topNavbarStyle : 'topbar'
  })
  // Who's signed in where, which the Friends button's plugin answers are kept for.
  const session = createMemo(() => (store.authenticated ? `${store.serverUrl}|${store.userId}` : ''))
  createEffect(on(session, (key) => syncFriends(key)))
  const handle = {
    available: () => !!props.show && !!style,
    focus: () => style && style.setFocus(),
  }
  setNavHandle(handle)
  if (props.ref) props.ref(handle)
  // A container of its own, so the nav keeps its place under the overlays when it shows after sign-in.
  return (
    <view>
      <Show when={props.show}>
        <Show when={kind()} keyed>
          {(k) => <Dynamic component={STYLES[k]} ref={(n) => (style = n)} hidden={props.hidden} />}
        </Show>
      </Show>
    </view>
  )
}
