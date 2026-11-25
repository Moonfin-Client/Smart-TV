import assert from 'node:assert/strict'
import { defineRoutes, matchRoute, router, entries, setRouterHooks, setMirror } from './router.js'

const Page = () => null
defineRoutes([
  { path: '/', component: Page, inHistory: false },
  { path: '/login', component: Page, inHistory: false },
  { path: '/home', component: Page, keepAlive: true },
  { path: '/details/:id', component: Page, keepAlive: true },
  { path: '/player/:id', component: Page },
])

assert.equal(matchRoute('/details/abc').params.id, 'abc')
assert.equal(matchRoute('/Details/ABC').params.id, 'ABC', 'case-insensitive, params kept as given')
assert.equal(matchRoute('/details/abc/').route.path, '/details/:id')
assert.equal(matchRoute('/nope'), null)

const mirrored = []
setMirror((path, opts) => mirrored.push([path, opts.replace]))
const seen = []
setRouterHooks({ afterEach: (to) => seen.push(to.path) })

await router.to('/')
await router.to('/login', {}, { inHistory: false })
await router.to('/home')
assert.deepEqual(entries().map((e) => e.path), ['/home'], 'gates leave no history')
assert.equal(router.back(), false, 'nothing under Home')

await router.to('/details/1', { item: { Id: '1' } })
await router.to('/details/2')
assert.deepEqual(entries().map((e) => e.path), ['/home', '/details/1', '/details/2'])
assert.equal(entries()[1].data.item.Id, '1')
assert.equal(router.currentRoute.path, '/details/2')
assert.equal(router.history.length, 2)
const firstDetails = entries()[1]
assert.equal(router.back(), true)
assert.equal(entries()[1], firstDetails, 'Back returns to the same entry, so its kept page comes back')
assert.equal(router.state.path, '/details/1')

setRouterHooks({ beforeEach: (to) => (to.path === '/player/x' ? '/home' : undefined) })
await router.to('/player/x')
assert.equal(router.state.path, '/home', 'beforeEach can redirect')
router.clearHistory()
assert.deepEqual(entries().map((e) => e.path), ['/home'])
assert.ok(mirrored.every(([, replace]) => replace === true), 'the hash is always replaced')
assert.equal(seen[0], '/')
console.log('router ok')
