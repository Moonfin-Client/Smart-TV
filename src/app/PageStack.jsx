// Draws the router's stack (app/router.js): the page on top, and under it, hidden, the pages kept
// alive. A page keeps the element that last had focus inside it, and gets it back when it's on top
// again. A new page gets focus on its root, so a page root picks its first focus with forwardFocus
// (an index, or a function that focuses a ref). Pages get their route params and navigation data as
// props, plus `page` ({ active, entry, focus }), and can read it anywhere below with usePage().
import { For, createContext, createEffect, createMemo, createSignal, on, onMount, useContext } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import { activeElement, createComponent } from '@solidtv/solid'
import { current, entries, router, setMirror } from './router.js'
import { setActivePage } from '../state/pages.js'
import { shellApp } from '../state/shell/shellState.js'

const PageContext = createContext(null)
// An App overlay that's open keeps focus, and the page gets it back when the overlay closes.
const overlayOpen = () => {
  const app = shellApp()
  return !!(app && app.overlay)
}
export const usePage = () => useContext(PageContext)

// The kept page right under the top one, drawn too while the top one shows it through, like
// Settings' fades and its Friends drawer. Only a page kept alive is there to draw, so this says
// whether one is. Any navigation turns it off.
const [under, setUnder] = createSignal(null)
export const showPageUnder = (on) => {
  const s = entries()
  const below = on ? s[s.length - 2] : null
  setUnder(below && below.options.keepAlive ? below : null)
  return !!under()
}

export const isInside = (node, root) => {
  let n = node
  while (n) {
    if (n === root) return true
    n = n.parent
  }
  return false
}

const PageView = (props) => {
  const entry = props.entry
  let root
  const active = createMemo(() => current() === entry)
  const focus = () => {
    const last = entry.lastFocus
    if (last && !last.destroyed && isInside(last, root)) last.setFocus()
    else if (root) root.setFocus()
  }
  const page = { entry, active, focus }
  createEffect(
    on(active, (on, was) => {
      if (!on) return
      setActivePage(page)
      // A page opened fresh focuses itself once it has drawn (onMount below).
      if (was === false && !overlayOpen()) focus()
    }),
  )
  onMount(() => {
    if (active() && !overlayOpen()) root.setFocus()
  })
  return (
    <view
      ref={(n) => {
        root = n
        entry.root = n
      }}
      width={1920}
      height={1080}
      alpha={active() || under() === entry ? 1 : 0}
      forwardFocus={0}
    >
      <PageContext.Provider value={page}>
        {createComponent(entry.route.component, { ...entry.params, ...entry.data, params: entry.params, page })}
      </PageContext.Provider>
    </view>
  )
}

export const PageStack = () => {
  const navigate = useNavigate()
  const location = useLocation()
  setMirror((path, opts) => navigate(path, opts))
  // A hash set from outside (a test script, a deep link) opens like router.to().
  createEffect(
    on(
      () => location.pathname,
      (path) => {
        const top = current()
        if (path && (!top || top.path !== path)) router.to(path)
      },
      { defer: true },
    ),
  )
  // Where focus is now, kept on the page that holds it.
  createEffect(() => {
    const el = activeElement()
    const top = current()
    if (el && top && top.root && isInside(el, top.root)) top.lastFocus = el
  })
  createEffect(on(current, () => setUnder(null), { defer: true }))
  const live = createMemo(() => {
    const s = entries()
    return s.filter((e, i) => i === s.length - 1 || e.options.keepAlive)
  })
  return (
    <view width={1920} height={1080}>
      <For each={live()}>{(entry) => <PageView entry={entry} />}</For>
    </view>
  )
}
