// Runs between the legacy polyfills and the entry. When the update loader booted a release from
// storage, SystemJS takes that release's chunks from there too, under their package URLs, so the
// chunks match the entry and assets beside them still resolve. It ships inside every update.
;(function () {
  var ota = window.__moonfinOta
  if (!ota || !ota.read || !window.System) return
  var base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '')
  // While the page still parses, SystemJS ties a module it evaluates to the last script tag and
  // loads it a second time, so nothing evaluates before then.
  var parsed = new Promise(function (resolve) {
    if (document.readyState !== 'loading') resolve()
    else document.addEventListener('DOMContentLoaded', resolve)
  })
  System.shouldFetch = function (url) {
    return url.indexOf(base) === 0 && /\.js$/.test(url)
  }
  System.fetch = function (url) {
    return Promise.all([ota.read(url.slice(base.length)), parsed]).then(function (r) {
      return {
        ok: true,
        headers: {
          get: function () {
            return 'application/javascript'
          },
        },
        text: function () {
          return Promise.resolve(r[0])
        },
      }
    })
  }
})()
