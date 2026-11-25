// Self-check for zoomWindow.js: node src/pages/Player/zoomWindow.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { panelRect, zoomWindow } = await import('./zoomWindow.js')

// The panel is the bigger of the screen and the page at its pixel ratio.
assert.deepEqual(panelRect({ innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 2, screen: { width: 1920, height: 1080 } }), { width: 3840, height: 2160 })
assert.deepEqual(panelRect({ innerWidth: 1920, innerHeight: 1080 }), { width: 1920, height: 1080 })

const screen = { width: 3840, height: 2160 }
// Stretch fills the panel with the whole frame.
assert.deepEqual(zoomWindow({ screen, zoom: 'stretch', declared: 4 / 3, decoded: 4 / 3, videoWidth: 1440, videoHeight: 1080 }), {
  x: 0, y: 0, width: 1440, height: 1080, destX: 0, destY: 0, destWidth: 3840, destHeight: 2160, mode: 'stretch',
})
// Fit letterboxes a scope film.
const fit = zoomWindow({ screen, zoom: 'fit', declared: 2.4, decoded: 2.4, videoWidth: 1920, videoHeight: 800 })
assert.deepEqual([fit.destX, fit.destY, fit.destWidth, fit.destHeight], [0, 280, 3840, 1600])
// Fill crops the sides of a scope film, in source pixels.
const fill = zoomWindow({ screen, zoom: 'fill', declared: 2.4, decoded: 2.4, videoWidth: 1920, videoHeight: 800 })
assert.deepEqual([fill.x, fill.y, fill.width, fill.height], [249, 0, 1422, 800])
// An anamorphic DVD (720x480 shown 16:9) crops in the corrected picture and maps back.
const dvd = zoomWindow({ screen, zoom: 'fill', declared: 16 / 9, decoded: 1.5, videoWidth: 720, videoHeight: 480 })
assert.deepEqual([dvd.x, dvd.y, dvd.width, dvd.height], [0, 0, 720, 480])
const dvd43 = zoomWindow({ screen, zoom: 'fill', declared: 4 / 3, decoded: 1.5, videoWidth: 720, videoHeight: 480 })
assert.deepEqual([dvd43.x, dvd43.y, dvd43.width, dvd43.height], [0, 60, 720, 360])
console.log('zoomWindow ok')
