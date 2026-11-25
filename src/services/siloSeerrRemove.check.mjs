// Silo's removeFailedRequest: a failed request that delivered nothing can be removed, where Silo says it offers it.
//   node --conditions=browser src/services/siloSeerrRemove.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { createSiloSeerr } = await import('./siloSeerr.js')

const refused = (status) => Object.assign(new Error('no'), { status })
const setup = (routes) => {
  const calls = []
  const call = async (path, options = {}) => {
    calls.push({ path, ...options })
    const answer = routes[`${options.method || 'GET'} ${path}`]
    if (answer instanceof Error) throw answer
    return typeof answer === 'function' ? answer(options) : answer
  }
  return { seerr: createSiloSeerr({ call, baseUrl: 'http://silo/', random: () => 0 }), calls }
}

const failed = (id, targets) => ({ id, media_type: 'movie', tmdb_id: 5, title: 'Film', state: 'failed', outcome: 'failed', targets: targets.map((status) => ({ status })) })
const items = [failed('1', ['failed']), failed('2', ['completed', 'failed']), { ...failed('3', ['queued']), state: 'processing', outcome: 'active' }]
const { seerr, calls } = setup({
  'GET /api/v2/requests/status': { requests_enabled: true, remove_failed_supported: true },
  'GET /api/v2/admin/requests/capabilities': refused(403),
  'GET /api/v2/requests/mine': { items },
  'DELETE /api/v2/requests/1': null,
  'DELETE /api/v2/requests/3': refused(404),
  'DELETE /api/v2/requests/2': refused(409),
})
const list = await seerr.request('/request?filter=all&take=20&skip=0')
assert.deepEqual(list.results.map((r) => r.canRemove), [true, false, false], 'only failed with nothing delivered')
await seerr.request('/request/1/remove', { method: 'POST' })
const last = calls.pop()
assert.equal(last.path, '/api/v2/requests/1')
assert.equal(last.method, 'DELETE')
// Already gone is what was asked for; a request that changed is refused.
assert.deepEqual(await seerr.request('/request/3/remove', { method: 'POST' }), {})
await assert.rejects(seerr.request('/request/2/remove', { method: 'POST' }), (e) => e.status === 409)

// An older Silo doesn't say it has the route, so nothing offers it.
const old = setup({
  'GET /api/v2/requests/status': { requests_enabled: true },
  'GET /api/v2/admin/requests/capabilities': refused(403),
  'GET /api/v2/requests/mine': { items },
})
assert.equal((await old.seerr.request('/request?filter=all&take=20&skip=0')).results.some((r) => r.canRemove), false)
console.log('siloSeerrRemove ok')
