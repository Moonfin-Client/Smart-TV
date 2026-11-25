// Ships inside sideloaded TV packages and stays there, so it can never change for a TV that has it.
// It boots a newer signed release from IndexedDB when one is ready, otherwise this package's own
// bundle. Each package carries a modern and a legacy bundle, the boot page's probe picks one for
// this engine, and an update stores and boots only that one, plus the other package files it changed,
// which the app finds by package path in window.__moonfinOta.files. The app asks the loader to check
// for and download an update, nothing happens on its own. Plain ES5 for Chrome 38.
;(function () {
  var C = window.MOONFIN_OTA
  var DB = 'moonfin_update'
  var READY = 'moonfin_update_ready'
  var PENDING = 'moonfin_update_pending'
  var BAD = 'moonfin_update_bad'
  var INSTALLED = 'moonfin_update_installed'
  // The list of package files the stored update replaces, kept beside its other files.
  var FILES = '@files'
  var TYPES = {
    webp: 'image/webp',
    png: 'image/png',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml',
    json: 'application/json',
    js: 'application/javascript',
    wasm: 'application/wasm',
    css: 'text/css',
    txt: 'text/plain',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
  }
  var engine = window.__moonfinModern === 1 ? 'modern' : 'legacy'
  var running = null
  var dbPromise = null
  window.__moonfinBundle = engine

  function ls(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key)
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch (e) {
      // storage blocked, updates just stay off
    }
    return null
  }

  function newer(a, b) {
    var x = String(a).split('.'),
      y = String(b).split('.')
    for (var i = 0; i < 3; i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0)
      if (d) return d > 0
    }
    return false
  }

  function req(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () {
        resolve(r.result)
      }
      r.onerror = function () {
        reject(r.error)
      }
    })
  }

  function db() {
    if (!dbPromise) {
      var open = indexedDB.open(DB, 1)
      open.onupgradeneeded = function () {
        open.result.createObjectStore('files')
      }
      dbPromise = req(open)
    }
    return dbPromise
  }

  function stored(version, name) {
    return db().then(function (d) {
      return req(d.transaction('files', 'readonly').objectStore('files').get(version + '/' + name))
    })
  }

  function read(version, name) {
    return stored(version, name).then(function (text) {
      if (typeof text !== 'string') throw new Error('Update file missing: ' + name)
      return text
    })
  }

  // Each package file the stored update replaces becomes a blob URL, all made before the app runs.
  function openFiles(version, files) {
    return stored(version, FILES).then(function (list) {
      var names = typeof list === 'string' ? JSON.parse(list) : []
      return Promise.all(
        names.map(function (name) {
          return stored(version, name).then(function (data) {
            if (!data || typeof data.byteLength !== 'number') throw new Error('Update file missing: ' + name)
            var type = TYPES[name.slice(name.lastIndexOf('.') + 1)] || ''
            files[name] = URL.createObjectURL(new Blob([data], { type: type }))
          })
        })
      )
    })
  }

  // Resolves only once the transaction commits. A TV over its storage quota rolls the write back
  // after the request itself already succeeded.
  function write(work) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction('files', 'readwrite')
        work(tx.objectStore('files'))
        tx.oncomplete = function () {
          resolve()
        }
        tx.onabort = tx.onerror = function () {
          reject(tx.error || new Error('IndexedDB write failed'))
        }
      })
    })
  }

  // Drops every stored file outside the version's own key prefix ('/' sorts right before '0').
  function keepOnly(version) {
    return write(function (s) {
      if (!version) return s.clear()
      s['delete'](IDBKeyRange.upperBound(version + '/', true))
      s['delete'](IDBKeyRange.lowerBound(version + '0'))
    })
  }

  // Strings with any character past Latin-1 take two bytes a character in IndexedDB, and most
  // bundle files have one, so the room asked for is twice their bytes.
  function room(bytes) {
    return new Promise(function (resolve) {
      var t = navigator.webkitTemporaryStorage
      if (!t || !bytes) return resolve(true)
      t.queryUsageAndQuota(
        function (used, quota) {
          resolve(quota - used > bytes * 2)
        },
        function () {
          resolve(true)
        }
      )
    })
  }

  // Deleting the database frees its space right away, which clear() doesn't on Chrome 38.
  function wipe() {
    var open = dbPromise
    dbPromise = null
    if (open)
      open.then(
        function (d) {
          d.close()
        },
        function () {
          // never opened
        }
      )
    try {
      indexedDB.deleteDatabase(DB)
    } catch (e) {
      // nothing stored
    }
  }

  // Runs a boot page's script tags in order. With a version every file comes from storage and runs
  // inline, all read before any runs. Without one they load from the package.
  function run(tags, version) {
    var box = document.createElement('div')
    box.innerHTML = tags
    var list = [].slice.call(box.getElementsByTagName('script'))
    return Promise.all(
      list.map(function (tag) {
        var src = tag.getAttribute('src')
        return version && src ? read(version, src.replace(/^\.\//, '')) : tag.text
      })
    ).then(function (texts) {
      return list.reduce(function (prev, tag, i) {
        return prev.then(function () {
          return new Promise(function (resolve, reject) {
            var el = document.createElement('script')
            var src = !version && tag.getAttribute('src')
            for (var j = 0; j < tag.attributes.length; j++) {
              var a = tag.attributes[j]
              if (a.name !== 'src') el.setAttribute(a.name, a.value)
            }
            if (src) {
              el.onload = resolve
              el.onerror = reject
              el.src = src
            } else el.text = texts[i]
            document.body.appendChild(el)
            if (!src) resolve()
          })
        })
      }, Promise.resolve())
    })
  }

  function bootLocal() {
    document.write(C.boot[engine])
    wipe()
  }

  // An open iframe document keeps the page loading until the app has drawn. webOS hides and
  // suspends a page that loads blank, and on a quick relaunch it can hide one whose code runs
  // after load, which the bundled boot never does.
  function holdLoad() {
    var frame = document.createElement('iframe')
    frame.style.display = 'none'
    try {
      document.body.appendChild(frame)
      frame.contentDocument.open()
    } catch (e) {
      // the page just loads without waiting
    }
    return function () {
      try {
        frame.contentDocument.close()
      } catch (e) {
        // already closed
      }
      if (frame.parentNode) frame.parentNode.removeChild(frame)
    }
  }

  function bootStored(version, tries) {
    ls(PENDING, version + ' ' + tries)
    var release = holdLoad()
    var app = document.getElementById('app')
    var poll = setInterval(function () {
      if (!app.firstChild) return
      clearInterval(poll)
      ls(PENDING, null)
      release()
    }, 500)
    setTimeout(release, 20000)
    running = version
    api.read = function (name) {
      return read(version, name)
    }
    api.files = {}
    openFiles(version, api.files)
      .then(function () {
        return read(version, 'boot')
      })
      .then(function (tags) {
        return run(tags, version)
      })
      .then(
        function () {
          keepOnly(version)['catch'](function () {
            // tidied on a later launch
          })
        },
        function (e) {
          window.console.warn('[OTA] stored ' + version + ' failed to load: ' + (e && e.name + ' ' + e.message))
          running = null
          delete api.read
          delete api.files
          wipe()
          ls(READY, null)
          ls(PENDING, null)
          run(C.boot[engine], null).then(release, release)
        }
      )
  }

  function get(url, type, timeout, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest()
      x.open('GET', url, true)
      x.responseType = type
      x.timeout = timeout
      if (onProgress)
        x.onprogress = function (e) {
          onProgress(e.loaded)
        }
      x.onload = function () {
        // A package file read over file:// answers with status 0 on Chrome 38.
        if (x.status === 200 || (x.status === 0 && x.response && !/^https?:/i.test(url))) resolve(x.response)
        else reject(new Error('HTTP ' + x.status + ' ' + url))
      }
      x.onerror = x.ontimeout = function () {
        reject(new Error('Network error ' + url))
      }
      x.send()
    })
  }

  function hex(buf) {
    var bytes = new Uint8Array(buf),
      out = ''
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16)
    return out
  }

  function fromBase64(b64) {
    var raw = atob(b64),
      out = new Uint8Array(raw.length)
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
  }

  function verify(manifest) {
    var subtle = window.crypto && window.crypto.subtle
    if (!subtle) return Promise.reject(new Error('No WebCrypto'))
    var alg = { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } }
    return subtle
      .importKey('spki', fromBase64(C.key), alg, false, ['verify'])
      .then(function (key) {
        return subtle.verify(alg, key, fromBase64(manifest.sig), new TextEncoder().encode(manifest.payload))
      })
      .then(function (ok) {
        if (!ok) throw new Error('Bad manifest signature')
        return JSON.parse(manifest.payload)
      })
  }

  function asset(version, ext) {
    return C.url + '/' + version + '/moonfin-ota-' + C.platform + ext
  }

  function readyVersion() {
    var parts = (ls(READY) || '').split(' ')
    return parts[1] === C.shell ? parts[0] : null
  }

  var api = {
    // The version the next launch boots, once a download has finished.
    ready: readyVersion,

    // Resolves the signed manifest of a release when this TV can take it, or null when it can't,
    // for example a release that needs a new package.
    check: function (version) {
      return get(asset(version, '.json'), 'text', 15000)
        .then(function (text) {
          return verify(JSON.parse(text))
        })
        .then(
          function (m) {
            var current = readyVersion() || running || C.version
            var usable =
              m.platform === C.platform &&
              m.shell === C.shell &&
              m.version === version &&
              !!(m.engines && m.engines[engine]) &&
              newer(m.version, current) &&
              m.version !== ls(BAD)
            return usable ? m : null
          },
          function (e) {
            window.console.warn('[OTA] ' + (e && e.message))
            return null
          }
        )
    },

    // Downloads and verifies the release, then stores this engine's bundle, any other files of it
    // named in keep (the app's language's strings) and the assets that differ from this package's
    // own, for the next launch. onProgress gets the share done, from 0 to 1.
    download: function (m, onProgress, keep) {
      var want = m.engines[engine]
      var names = want.files.concat(keep || [])
      var binary = []
      var bytes = 0
      return get('ota-assets.json', 'text', 15000)
        .then(function (text) {
          return JSON.parse(text)
        })
        ['catch'](function () {
          return {}
        })
        .then(function (own) {
          var assets = m.assets || []
          assets.forEach(function (a) {
            if (own[a[0]] !== a[1]) binary.push(a[0])
          })
          m.files.forEach(function (file) {
            if (names.indexOf(file[0]) >= 0 || binary.indexOf(file[0]) >= 0) bytes += file[1]
          })
          return get(asset(m.version, '.bin'), 'arraybuffer', 600000, function (loaded) {
            if (onProgress) onProgress(Math.min(loaded / m.bytes, 1))
          })
        })
        .then(function (buf) {
          return window.crypto.subtle
            .digest({ name: 'SHA-256' }, buf)
            .then(function (sum) {
              if (hex(sum) !== m.sha256) throw new Error('Update failed its integrity check')
              return room(bytes)
            })
            .then(function (fits) {
              ls(READY, null)
              // The app is behind the update dialog and restarts next, so a TV without room for two
              // copies can drop the running one first.
              if (fits) return keepOnly(running)
              wipe()
            })
            .then(function () {
              var decoder = new TextDecoder('utf-8')
              var offset = 0
              return write(function (s) {
                m.files.forEach(function (file) {
                  if (names.indexOf(file[0]) >= 0) s.put(decoder.decode(new Uint8Array(buf, offset, file[1])), m.version + '/' + file[0])
                  else if (binary.indexOf(file[0]) >= 0) s.put(buf.slice(offset, offset + file[1]), m.version + '/' + file[0])
                  offset += file[1]
                })
                s.put(want.tags, m.version + '/boot')
                s.put(JSON.stringify(binary), m.version + '/' + FILES)
              })
            })
        })
        .then(function () {
          ls(READY, m.version + ' ' + m.shell)
        })
    },
  }
  window.__moonfinOta = api

  // A package installed since the last launch replaces any stored update, so sideloading an older
  // release goes back to it.
  if (ls(INSTALLED) !== C.version) {
    ls(INSTALLED, C.version)
    ls(READY, null)
  }
  var ready = readyVersion()
  var pending = (ls(PENDING) || '').split(' ')
  var tries = ready && pending[0] === ready ? parseInt(pending[1], 10) || 1 : 0
  if (tries >= 2) {
    // The last two launches of this version never drew anything, so stop using it. One alone could
    // be someone quitting before the first screen.
    ls(BAD, ready)
    ready = null
  }
  ls(PENDING, null)
  if (ready && newer(ready, C.version) && window.indexedDB && window.Promise) {
    bootStored(ready, tries + 1)
  } else {
    ls(READY, null)
    bootLocal()
  }
})()
