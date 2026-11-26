// The <video> element SolidTV's video engine drives, over SceneGraph's Video node. The node sits
// under the app's drawing and plays with its own interface off, so the app's player screen draws
// over it. play, pause and a currentTime write become the node's control and seek fields, and its
// state, position and duration come back as the element's events.
const FORMAT = {
  'application/x-mpegurl': 'hls',
  'application/vnd.apple.mpegurl': 'hls',
  'video/mp4': 'mp4',
  'video/quicktime': 'mp4',
  'video/x-matroska': 'mkv',
  'video/webm': 'mkv',
  'video/mp2t': 'ts',
}
const EXT = { m3u8: 'hls', mp4: 'mp4', m4v: 'mp4', mov: 'mp4', mkv: 'mkv', webm: 'mkv', ts: 'ts' }

export const streamFormat = (url, type) => {
  const byType = FORMAT[String(type || '').toLowerCase()]
  if (byType) return byType
  const path = String(url).split(/[?#]/)[0]
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (EXT[ext]) return EXT[ext]
  // Jellyfin's transcodes end in master.m3u8 or main.m3u8, and its direct streams name a container.
  const container = /[?&]container=([a-z0-9]+)/i.exec(url)
  return (container && EXT[container[1].toLowerCase()]) || 'mp4'
}

// The start in a src's #t= fragment, in seconds, and the address without it.
export const splitStart = (src) => {
  const m = /#t=([\d.]+)/.exec(src)
  return { url: src.replace(/#t=[\d.]*$/, ''), start: m ? parseFloat(m[1]) || 0 : 0 }
}

const ranges = (list) => ({ length: list.length, start: (i) => list[i][0], end: (i) => list[i][1] })
const px = (v) => parseFloat(v) || 0

export const createVideoElement = (sg, layer) => {
  const listeners = {}
  // Listeners, then the on<event> property, as an element calls both.
  const fire = (name) => {
    const e = { type: name, target: el }
    for (const l of (listeners[name] || []).slice()) {
      if (l.once) off(name, l.fn)
      l.fn.call(el, e)
    }
    if (typeof el['on' + name] === 'function') el['on' + name](e)
  }
  const off = (name, fn) => {
    listeners[name] = (listeners[name] || []).filter((l) => l.fn !== fn)
  }

  // What one stream has been through. load() starts a new one.
  const fresh = () => ({
    state: 'none',
    loaded: false,
    paused: true,
    started: false,
    meta: false,
    position: 0,
    duration: NaN,
    seeking: false,
    target: 0,
    ended: false,
    error: null,
    tracks: [],
    track: '',
    ready: 0,
    buf: null,
  })
  let node = null
  let src = ''
  let autoLoad = false
  let pendingStart = 0
  let muted = false
  let st = fresh()
  const box = { x: 0, y: 0, w: 1920, h: 1080 }
  const set = (k, v) => node && sg.set(node, k, v)
  const control = (c) => set('control', c)

  const started = () => {
    if (st.started) return
    st.started = true
    st.ready = 4
    if (!st.meta) {
      st.meta = true
      fire('loadedmetadata')
    }
    fire('loadeddata')
  }
  const seekLanded = () => {
    if (!st.seeking) return
    st.seeking = false
    fire('seeked')
  }

  const observe = (n) => {
    sg.set(n, 'onState', (s) => {
      // A stopped stream's last events (a late error, its finish) come in before the node says
      // stopped, and belong to it, not to the stream loading now.
      if (st.awaitStop) {
        if (s === 'stopped' || Date.now() > st.awaitStop) st.awaitStop = 0
        if (st.awaitStop || s === 'stopped') return
      }
      const was = st.state
      st.state = s
      if (s === 'buffering') {
        fire('waiting')
      } else if (s === 'playing') {
        started()
        // A seek made while paused plays once it lands, and the element stays paused.
        if (st.paused) return control('pause')
        seekLanded()
        fire('canplay')
        fire('playing')
      } else if (s === 'paused') {
        started()
        seekLanded()
        // A wait before it, like a seek's, is over.
        if (was === 'buffering') fire('canplay')
        if (!st.paused) {
          st.paused = true
          fire('pause')
        }
      } else if (s === 'finished') {
        // The node finishes a stream that failed too, which an element doesn't call ended.
        if (st.error) return
        st.paused = true
        st.ended = true
        fire('ended')
      } else if (s === 'error') {
        st.error = { code: st.errorCode || 4, message: st.errorMsg || 'playback failed' }
        console.warn(`[video] error ${st.errorCode} ${st.errorMsg || ''}`)
        fire('error')
      }
    })
    // The SDK reports position and duration in milliseconds.
    sg.set(n, 'onPosition', (ms) => {
      if (typeof ms !== 'number') return
      const p = ms / 1000
      st.position = p
      if (st.seeking && Math.abs(p - st.target) < 2) seekLanded()
      fire('timeupdate')
    })
    sg.set(n, 'onDuration', (ms) => {
      if (!(ms > 0)) return
      st.duration = ms / 1000
      if (!st.meta) {
        st.meta = true
        if (!st.ready) st.ready = 1
        fire('loadedmetadata')
      }
      fire('durationchange')
    })
    sg.set(n, 'onErrorCode', (c) => (st.errorCode = c))
    sg.set(n, 'onErrorMsg', (m) => (st.errorMsg = m))
    sg.set(n, 'onAvailableAudioTracks', (list) => {
      st.tracks = Array.isArray(list) ? list : []
    })
    sg.set(n, 'onCurrentAudioTrack', (t) => (st.track = t))
    // An HLS stream's downloaded segments say how far it has buffered, in milliseconds. A file
    // played directly reports none, so it shows no buffered range.
    sg.set(n, 'onDownloadedSegment', (seg) => {
      if (!seg || !(seg.segDuration > 0)) return
      const from = seg.segStartTime / 1000
      const to = from + seg.segDuration / 1000
      if (st.buf) {
        st.buf[0] = Math.min(st.buf[0], from)
        st.buf[1] = Math.max(st.buf[1], to)
      } else st.buf = [from, to]
    })
  }

  const ensureNode = () => {
    if (node) return node
    node = sg.create('video')
    sg.set(node, 'enableUI', false)
    sg.set(node, 'notificationInterval', 0.25)
    sg.set(node, 'translation', [box.x, box.y])
    sg.set(node, 'width', box.w)
    sg.set(node, 'height', box.h)
    observe(node)
    sg.insert(layer(), node)
    return node
  }

  const audioTracks = () =>
    st.tracks.map((t) => ({
      language: t.Language || '',
      label: t.Name || '',
      get enabled() {
        return st.track === t.Track
      },
      set enabled(on) {
        if (on && st.track !== t.Track) {
          st.track = t.Track
          set('audioTrack', t.Track)
        }
      },
    }))

  // Only the box the engine places the picture in. The node keeps the picture's shape inside it.
  const style = {}
  for (const key of ['left', 'top', 'width', 'height']) {
    Object.defineProperty(style, key, {
      get: () => `${key === 'left' ? box.x : key === 'top' ? box.y : key === 'width' ? box.w : box.h}px`,
      set: (v) => {
        if (key === 'left') box.x = px(v)
        else if (key === 'top') box.y = px(v)
        else if (key === 'width') box.w = px(v)
        else box.h = px(v)
        if (!node) return
        set('translation', [box.x, box.y])
        set('width', box.w)
        set('height', box.h)
      },
    })
  }

  const ACTIVE = { buffering: 1, playing: 1, paused: 1, error: 1, finished: 1 }
  const reset = () => {
    const active = !!node && !!ACTIVE[st.state]
    if (node) control('stop')
    st = fresh()
    if (active) st.awaitStop = Date.now() + 3000
  }

  const el = {
    style,
    parentNode: {},
    firstChild: null,
    removeChild() {},
    autoplay: true,
    defaultMuted: false,
    volume: 1,
    playbackRate: 1,
    type: '',
    addEventListener(name, fn, opts) {
      const list = listeners[name] || (listeners[name] = [])
      list.push({ fn, once: !!(opts && opts.once) })
    },
    removeEventListener: off,
    removeAttribute(name) {
      if (name === 'src') src = ''
    },
    canPlayType: (t) => (FORMAT[String(t || '').toLowerCase()] ? 'maybe' : ''),
    get src() {
      return src
    },
    // As in a browser, a src starts loading by itself, unless load() is called in the same turn.
    set src(v) {
      src = String(v || '')
      if (!src) return
      autoLoad = true
      queueMicrotask(() => {
        if (autoLoad) el.load()
      })
    },
    get muted() {
      return muted
    },
    set muted(on) {
      muted = !!on
      set('mute', muted)
    },
    // Starts the stream in src, or with src cleared, stops the one playing.
    load() {
      autoLoad = false
      const startAt = pendingStart
      pendingStart = 0
      reset()
      if (!src) {
        if (node) set('visible', false)
        return
      }
      ensureNode()
      const split = splitStart(src)
      const url = split.url
      const start = split.start || startAt || 0
      const content = sg.create('contentNode')
      sg.set(content, 'url', url)
      sg.set(content, 'streamFormat', streamFormat(url, el.type))
      if (start > 0) sg.set(content, 'playStart', start)
      if (/^https:/i.test(url)) sg.set(content, 'HttpCertificatesFile', 'common:/certs/ca-bundle.crt')
      st.position = start
      st.loaded = true
      set('visible', true)
      set('content', content)
      set('mute', muted)
      if (el.autoplay) {
        st.paused = false
        control('play')
      } else {
        // A held stream (a watch party's) buffers and waits, and starts with play, not resume.
        st.prebuffered = true
        control('prebuffer')
      }
    },
    // A play while it's already going, as the engine asks for after loadedmetadata, does nothing.
    play() {
      if (!src || !node || !st.paused) return Promise.resolve()
      st.paused = false
      control(st.started && !st.ended && !st.prebuffered ? 'resume' : 'play')
      st.prebuffered = false
      st.ended = false
      return Promise.resolve()
    },
    pause() {
      if (st.paused) return
      st.paused = true
      control('pause')
      fire('pause')
    },
    get paused() {
      return st.paused
    },
    get ended() {
      return st.ended
    },
    get seeking() {
      return st.seeking
    },
    get currentTime() {
      return st.seeking ? st.target : st.position
    },
    set currentTime(t) {
      const to = Math.max(0, Number(t) || 0)
      // Before a stream loads, a time is where it starts.
      if (autoLoad || !st.loaded) {
        pendingStart = to
        st.position = to
        return
      }
      st.target = to
      st.seeking = true
      st.ended = false
      st.buf = null
      fire('seeking')
      // A paused element stays paused once the seek lands.
      set('autoplayAfterSeek', !st.paused)
      set('seek', to)
    },
    get duration() {
      return st.duration
    },
    get readyState() {
      return st.ready
    },
    get error() {
      return st.error
    },
    get buffered() {
      return ranges(st.buf ? [st.buf] : [])
    },
    get seekable() {
      return ranges(st.duration > 0 ? [[0, st.duration]] : [])
    },
    get audioTracks() {
      return audioTracks()
    },
    videoWidth: 0,
    videoHeight: 0,
    // Stops and lets go of the stream, for the platform's cleanup.
    release() {
      src = ''
      reset()
      if (node) {
        set('content', null)
        set('visible', false)
      }
    },
  }
  return el
}
