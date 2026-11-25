// The app's navigation (to, back, state, currentRoute, history) over a stack of history entries.
// The stack is the source of truth. The HashRouter only mirrors the top entry's path into
// location.hash, always replacing so browser history never grows, and reports a hash someone else
// set, which opens like router.to(path).
//
// Each entry is one page instance. A route with keepAlive keeps its page alive and hidden while
// pages open over it, so Back lands on the same row and card. Any other page is rebuilt when Back
// returns to it. A route or a to() with inHistory false is replaced by whatever opens next, so Back
// skips it (the gates, sign-in).
import { createSignal } from 'solid-js'

const routes = []
let seq = 0
const [stack, setStack] = createSignal([])
let mirror = null
const hooks = { beforeEach: null, afterEach: null }

const compile = (route) => {
  const keys = []
  const pattern = route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:([a-zA-Z0-9_]+)/g, (_, k) => {
    keys.push(k)
    return '([^/]+)'
  })
  return { ...route, keys, re: new RegExp(`^${pattern}/?$`, 'i') }
}

// Routes are { path, component, keepAlive, inHistory }. component is a Solid component, or
// lazy(() => import(...)) from solid-js for a page that loads on first use.
export const defineRoutes = (list) => {
  list.forEach((r) => routes.push(compile(r)))
}

export const matchRoute = (path) => {
  const clean = String(path || '/').split('?')[0]
  for (let i = 0; i < routes.length; i++) {
    const m = routes[i].re.exec(clean)
    if (m) {
      const params = {}
      routes[i].keys.forEach((k, j) => {
        params[k] = decodeURIComponent(m[j + 1])
      })
      return { route: routes[i], params }
    }
  }
  return null
}

// beforeEach(to) may return false to stay, a path or { path, data, options } to go elsewhere.
// afterEach(to) runs once the page is on the stack. App sets both.
export const setRouterHooks = (next) => Object.assign(hooks, next)

// The HashRouter's navigate, which PageStack hands over.
export const setMirror = (fn) => {
  mirror = fn
}

export const entries = stack
export const current = () => {
  const s = stack()
  return s[s.length - 1] || null
}

const toInfo = (entry) => ({ path: entry.path, params: entry.params, data: entry.data, options: entry.options })

const commit = (next, quiet) => {
  setStack(next)
  const top = next[next.length - 1]
  if (mirror && top) mirror(top.path, { replace: true, state: { k: top.key } })
  if (!quiet && hooks.afterEach && top) hooks.afterEach(toInfo(top))
}

export const router = {
  async to(path, data = {}, options = {}) {
    const found = matchRoute(path)
    if (!found) {
      console.warn('[router] no route for', path)
      return false
    }
    const options2 = { keepAlive: !!found.route.keepAlive, inHistory: found.route.inHistory !== false, ...options }
    if (hooks.beforeEach) {
      const to = { path, params: found.params, data, options: options2 }
      const out = await hooks.beforeEach(to)
      if (out === false) return false
      if (typeof out === 'string') return router.to(out)
      if (out && out.path && out.path !== path) return router.to(out.path, out.data || data, out.options || options)
    }
    const entry = { key: ++seq, path, params: found.params, data: data || {}, route: found.route, options: options2 }
    const s = stack().slice()
    const top = s[s.length - 1]
    if (top && top.options.inHistory === false) s.pop()
    s.push(entry)
    commit(s)
    return true
  },
  // False when there's nothing to go back to, so the caller can offer to exit instead.
  back() {
    const s = stack()
    if (s.length < 2) return false
    commit(s.slice(0, -1))
    return true
  },
  get state() {
    const top = current()
    return top ? toInfo(top) : { path: '', params: {}, data: {} }
  },
  get currentRoute() {
    const top = current()
    return top ? { path: top.path, pattern: top.route.path, options: top.options } : null
  },
  get history() {
    return stack().slice(0, -1).map(toInfo)
  },
  // Drops every entry under the current one, the pages kept alive with them (a new account's Home).
  clearHistory() {
    const top = current()
    if (top) commit([top], true)
  },
}
