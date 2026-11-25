// Small CDP client for a TV's DevTools port. Chrome 38 (webOS 3) only takes ES5 in evaluate and
// drops a page from /json while another client holds it, so each call opens and closes
// its own socket.
//   CDP=http://<tv ip>:9998 node tools/cdp.mjs eval "document.title"
//   CDP=... node tools/cdp.mjs keys 450 Down Down Right
//   CDP=... node tools/cdp.mjs bench <label> <intervalMs> <reps> KEY...
//   CDP=... node tools/cdp.mjs shot out.png
import { writeFileSync, appendFileSync } from 'node:fs'

const base = process.env.CDP || 'http://127.0.0.1:9222'
const [cmd, ...args] = process.argv.slice(2)

const KEYS = {
  Left: [37, 'ArrowLeft'], Up: [38, 'ArrowUp'], Right: [39, 'ArrowRight'], Down: [40, 'ArrowDown'],
  Enter: [13, 'Enter'], Back: [Number(process.env.BACK_KEY || 27), 'Escape'],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  let pages
  for (let i = 0; i < 10; i++) {
    try {
      pages = await (await fetch(`${base}/json`)).json()
      if (pages.length) break
    } catch (e) {}
    await sleep(500)
  }
  const page = (pages || []).find((p) => p.type === 'page' && p.webSocketDebuggerUrl)
  if (!page) throw new Error(`no page at ${base}`)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  ws.onerror = () => {
    if (ws.closing) return
    console.error('socket error')
    process.exit(2)
  }
  await new Promise((r) => (ws.onopen = r))
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)))
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  return { ws, send }
}

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.exceptionDetails || r.wasThrown) {
    console.error('evaluate threw', JSON.stringify(r.exceptionDetails || r.result))
    process.exit(3)
  }
  return r.result.value
}

async function press(send, name) {
  const [code, key] = KEYS[name]
  // No nativeVirtualKeyCode: webOS reads native codes as its own remote buttons, volume included.
  const base = { windowsVirtualKeyCode: code, key, code: key }
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
}

// The focused node's own id and its renderer node id. The app draws to one canvas, so the page's
// document.activeElement never moves.
const SIG = process.env.BENCH_SIG ||
  "function(){var m=window.__moonfin,a=m&&m.activeElement();return a?(a.id||'')+'#'+(a.lng&&a.lng.id):'none';}"
// Reads the TV's own volume where the page can: webOS through the audio service, Tizen through
// tvaudiocontrol (needs the tv.audio privilege).
const VOLUME_READ = `(function(){
  window.__vol = undefined;
  try {
    if (typeof PalmServiceBridge !== 'undefined') {
      var b = new PalmServiceBridge(); window.__volBridge = b;
      b.onservicecallback = function(m){ try { window.__vol = JSON.parse(m).volume; } catch (e) { window.__vol = null; } };
      b.call('luna://com.webos.audio/getVolume', '{}');
    } else if (window.tizen && tizen.tvaudiocontrol) {
      window.__vol = tizen.tvaudiocontrol.getVolume();
    } else { window.__vol = null; }
  } catch (e) { window.__vol = null; }
  return true;
})()`
async function readVolume(send) {
  await evaluate(send, VOLUME_READ)
  await sleep(400)
  return evaluate(send, 'window.__vol === undefined ? null : window.__vol')
}
async function stepVolumeDown(send, steps) {
  await evaluate(send, `(function(){var n=${steps};function next(){if(n--<=0)return;var b=new PalmServiceBridge();window.__volDown=b;b.onservicecallback=function(){next();};b.call('luna://com.webos.audio/volumeDown','{}');}next();return true;})()`)
  await sleep(300 * steps + 500)
}

const RECORDER = `(function(){
  var B = window.__bench = {frames: [], keys: [], moved: 0, sigs: [], running: true};
  window.__benchSig = ${SIG};
  function tick(){ if (!B.running) return; B.frames.push(performance.now()); requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
  if (!window.__benchKeyHook) {
    window.__benchKeyHook = true;
    window.addEventListener('keydown', function(){
      var b = window.__bench; if (!b || !b.running) return;
      b.keys.push(performance.now());
      var before = window.__benchSig();
      setTimeout(function(){ var after = window.__benchSig(); if (after !== before) b.moved++; b.sigs.push(String(after)); }, 300);
    }, true);
  }
  return true;
})()`

function summarize(frames, keys) {
  const start = keys[0]
  const end = keys[keys.length - 1] + 1000
  const f = frames.filter((t) => t >= start && t <= end)
  const gaps = []
  for (let i = 1; i < f.length; i++) gaps.push(f[i] - f[i - 1])
  const lat = keys.map((k) => {
    const after = frames.filter((t) => t > k)
    return after.length >= 2 ? after[1] - k : NaN
  }).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b)
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))]
  return {
    fps: +((f.length - 1) / ((f[f.length - 1] - f[0]) / 1000)).toFixed(1),
    slowPct: +((100 * gaps.filter((g) => g > 34).length) / gaps.length).toFixed(1),
    jankMs: Math.round(gaps.reduce((s, g) => s + Math.max(0, g - 16.7), 0)),
    worstMs: Math.round(Math.max(...gaps)),
    latMedian: Math.round(q(lat, 0.5)),
    latP90: Math.round(q(lat, 0.9)),
    presses: keys.length,
  }
}

const { ws, send } = await connect()
try {
  if (cmd === 'eval') {
    console.log(JSON.stringify(await evaluate(send, args.join(' '))))
  } else if (cmd === 'keys') {
    const [interval, ...names] = args
    for (const n of names) {
      await press(send, n)
      await sleep(Number(interval))
    }
  } else if (cmd === 'logs') {
    // Reloads the page and prints console messages and exceptions for a few seconds.
    ws.onmessage = ((orig) => (m) => {
      const msg = JSON.parse(m.data)
      if (msg.method === 'Console.messageAdded') {
        const c = msg.params.message
        const extra = (c.parameters || []).slice(1).map((x) => x.description || x.value || x.type).join(' | ')
        console.log(`[${c.level}] ${c.text} ${extra} ${c.url || ''}:${c.line || ''}`)
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        console.log(`[exception] ${d.text} ${d.exception?.description || ''} ${d.url || ''}:${d.lineNumber}:${d.columnNumber}`)
      }
      orig(m)
    })(ws.onmessage)
    await send('Console.enable').catch(() => {})
    await send('Runtime.enable').catch(() => {})
    await send('Page.reload', { ignoreCache: true })
    await sleep(Number(args[0] || 8000))
  } else if (cmd === 'profile') {
    // CPU profile while pressing keys, self time grouped by function and file.
    const [interval, ...names] = args
    await send('Profiler.enable')
    await send('Profiler.setSamplingInterval', { interval: 1000 }).catch(() => {})
    await send('Profiler.start')
    for (const n of names) {
      await press(send, n)
      await sleep(Number(interval))
    }
    const { profile } = await send('Profiler.stop')
    const self = new Map()
    let total = 0
    const add = (node) => {
      const cf = node.callFrame || node
      const key = `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop()}:${cf.lineNumber}:${cf.columnNumber ?? ''}`
      const hits = node.hitCount || 0
      total += hits
      self.set(key, (self.get(key) || 0) + hits)
    }
    if (profile.nodes) profile.nodes.forEach(add)
    else {
      const walk = (n) => { add(n); (n.children || []).forEach(walk) }
      walk(profile.head)
    }
    const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP || 30))
    for (const [k, v] of rows) console.log(`${((100 * v) / total).toFixed(1).padStart(5)}%  ${k}`)
    console.log(`total samples ${total}`)
  } else if (cmd === 'trace') {
    // Chrome tracing while pressing keys: total and per-press time by event name and thread.
    const [interval, ...names] = args
    const events = []
    const orig = ws.onmessage
    let done
    const finished = new Promise((r) => (done = r))
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.method === 'Tracing.dataCollected') events.push(...msg.params.value)
      else if (msg.method === 'Tracing.tracingComplete') done()
      else orig(m)
    }
    await send('Tracing.start', {
      categories: process.env.TRACE_CATS || 'devtools.timeline,disabled-by-default-devtools.timeline,viz,gpu,cc,blink,v8',
      transferMode: 'ReportEvents',
    })
    for (const n of names) {
      await press(send, n)
      await sleep(Number(interval))
    }
    await send('Tracing.end')
    await finished
    const threads = new Map()
    for (const e of events) if (e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args.name)
    const agg = new Map()
    for (const e of events) {
      if (e.ph !== 'X' || !e.dur) continue
      const key = `${(threads.get(`${e.pid}:${e.tid}`) || e.tid).toString().padEnd(28)} ${e.name}`
      agg.set(key, (agg.get(key) || 0) + e.dur / 1000)
    }
    const rows = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP || 30))
    for (const [k, v] of rows) console.log(`${v.toFixed(0).padStart(7)} ms  ${(v / names.length).toFixed(1).padStart(6)}/press  ${k}`)
  } else if (cmd === 'shot') {
    const r = await send('Page.captureScreenshot', {})
    writeFileSync(args[0], Buffer.from(r.data, 'base64'))
  } else if (cmd === 'bench') {
    const [label, interval, reps, ...names] = args
    const results = []
    const startVolume = await readVolume(send)
    console.log(`volume before: ${startVolume}`)
    for (let rep = 0; rep < Number(reps); rep++) {
      if (process.env.BENCH_RESET) {
        await evaluate(send, process.env.BENCH_RESET)
        await sleep(1500)
      }
      await evaluate(send, RECORDER)
      await sleep(600)
      for (const n of names) {
        await press(send, n)
        await sleep(Number(interval))
      }
      await sleep(1200)
      const data = await evaluate(send, '(function(){var B=window.__bench;B.running=false;return {frames:B.frames,keys:B.keys,moved:B.moved,last:B.sigs[B.sigs.length-1]};})()')
      const s = { ...summarize(data.frames, data.keys), moved: data.moved, last: data.last }
      results.push(s)
      console.log(JSON.stringify({ label, rep, ...s }))
      appendFileSync(process.env.BENCH_LOG || 'bench.jsonl', JSON.stringify({ label, rep, at: new Date().toISOString(), ...s }) + '\n')
      const vol = await readVolume(send)
      if (startVolume !== null && vol !== null && vol > startVolume) {
        console.log(`VOLUME ROSE from ${startVolume} to ${vol}, stepping it back and stopping`)
        if (typeof vol === 'number') await stepVolumeDown(send, vol - startVolume)
        console.log(`volume now: ${await readVolume(send)}`)
        process.exit(4)
      }
      // Walk back to the start so every rep begins from the same card.
      const back = names.map((n) => ({ Up: 'Down', Down: 'Up', Left: 'Right', Right: 'Left' })[n]).filter(Boolean).reverse()
      for (const n of back) {
        await press(send, n)
        await sleep(350)
      }
      await sleep(1500)
    }
  } else {
    console.error('unknown command')
    process.exit(1)
  }
} finally {
  ws.closing = true
  ws.close()
  setTimeout(() => process.exit(0), 300)
}
