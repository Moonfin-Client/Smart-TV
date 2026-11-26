// A small stand-in for the parts of Jest that node checks ported from the Enact app's suites use: mock
// functions, expect, fake timers and clock, and describe/test/beforeEach/afterEach with run().
import assert from 'node:assert/strict'

// Fake timers and clock, as Jest's modern ones.
let clock = 1700000000000
let timers = []
let timerId = 0
const realNow = Date.now
const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
const fakeTimers = {
  install() {
    clock = 1700000000000
    timers = []
    globalThis.setTimeout = (fn, ms = 0) => {
      const id = ++timerId
      timers.push({ id, at: clock + Math.max(0, Number(ms) || 0), fn })
      return id
    }
    globalThis.clearTimeout = (id) => {
      timers = timers.filter((t) => t.id !== id)
    }
    Date.now = () => clock
  },
  uninstall() {
    globalThis.setTimeout = real.setTimeout
    globalThis.clearTimeout = real.clearTimeout
    Date.now = realNow
    timers = []
  },
  advance(ms) {
    const end = clock + ms
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      timers = timers.filter((t) => t !== due)
      clock = due.at
      due.fn()
    }
    clock = end
  },
}

let invocation = 0
const fn = (impl = () => undefined) => {
  const once = []
  let base = impl
  const f = (...args) => {
    f.mock.calls.push(args)
    f.mock.invocationCallOrder.push(++invocation)
    return (once.length ? once.shift() : base)(...args)
  }
  f.mock = { calls: [], invocationCallOrder: [] }
  f.mockReturnValue = (v) => ((base = () => v), f)
  f.mockClear = () => ((f.mock.calls = []), (f.mock.invocationCallOrder = []), f)
  f.mockResolvedValue = (v) => ((base = async () => v), f)
  f.mockResolvedValueOnce = (v) => (once.push(async () => v), f)
  f.mockRejectedValueOnce = (e) => (once.push(async () => { throw e }), f)
  f.mockImplementationOnce = (g) => (once.push(g), f)
  f.isMock = true
  return f
}
export const jest = {
  fn,
  useFakeTimers: () => fakeTimers.install(),
  useRealTimers: () => fakeTimers.uninstall(),
  advanceTimersByTime: (ms) => fakeTimers.advance(ms),
}

const matchObject = (actual, want) => {
  if (want === null || typeof want !== 'object') return assert.deepEqual(actual, want)
  assert.ok(actual && typeof actual === 'object', 'expected an object')
  for (const k of Object.keys(want)) matchObject(actual[k], want[k])
}
export const expect = (actual) => {
  const m = (neg) => {
    const check = (ok, msg) => assert.ok(neg ? !ok : ok, (neg ? 'not ' : '') + msg)
    const eq = (want) => {
      try {
        assert.deepEqual(actual, want)
        return true
      } catch {
        return false
      }
    }
    return {
      toBe: (want) => check(Object.is(actual, want), `toBe ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`),
      toEqual: (want) => (neg ? check(eq(want), 'toEqual') : assert.deepEqual(actual, want)),
      toBeNull: () => check(actual === null, `toBeNull, got ${JSON.stringify(actual)}`),
      toBeLessThan: (n) => check(actual < n, `${actual} < ${n}`),
      toHaveLength: (n) => check(actual.length === n, `length ${n}, got ${actual.length}`),
      toMatchObject: (want) => (neg ? check((() => { try { matchObject(actual, want); return true } catch { return false } })(), 'toMatchObject') : matchObject(actual, want)),
      toHaveBeenCalled: () => check(actual.mock.calls.length > 0, 'called'),
      toHaveBeenCalledTimes: (n) => check(actual.mock.calls.length === n, `called ${n} times, got ${actual.mock.calls.length}`),
      toHaveBeenCalledWith: (...args) => check(actual.mock.calls.some((c) => { try { assert.deepEqual(c, args); return true } catch { return false } }), `called with ${JSON.stringify(args)}`),
    }
  }
  return Object.assign(m(false), { not: m(true) })
}

const cases = []
const before = []
const after = []
let prefix = ''
export const describe = (name, body) => {
  const was = prefix
  prefix = was + name + ' > '
  body()
  prefix = was
}
export const test = (name, body) => cases.push([prefix + name, body])
export const beforeEach = (f) => before.push(f)
export const afterEach = (f) => after.push(f)


// Runs the cases in order, each between the beforeEach and afterEach hooks, and exits non-zero on a failure.
export const run = async (label) => {
  let failed = 0
  for (const [name, body] of cases) {
    try {
      for (const f of before) await f()
      await body()
    } catch (e) {
      failed++
      console.error('FAIL ' + name + '\n  ' + String(e && e.message).split('\n').slice(0, 4).join('\n  '))
    } finally {
      for (const f of after) await f()
    }
  }
  if (failed) {
    console.error(`${failed} of ${cases.length} failed`)
    process.exit(1)
  }
  console.log(`${label} ok (${cases.length} cases)`)
}
