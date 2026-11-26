// What the scene's BrightScript found this Roku can decode (MoonfinScene.brs). It arrives as an
// input on the app's anchor node shortly after launch.
let caps = null
const waiting = []

export const setDeviceCaps = (json) => {
  try {
    caps = JSON.parse(json)
  } catch (e) {
    console.warn(`[caps] unreadable device caps ${e}`)
    return
  }
  waiting.splice(0).forEach((resolve) => resolve(caps))
}

// Answers with empty caps if the scene's never arrive, so nothing waiting on them hangs.
const EMPTY = { video: {}, audio: {}, audioAlone: [], hdr: {} }
export const rokuCaps = () =>
  caps
    ? Promise.resolve(caps)
    : new Promise((resolve) => {
        waiting.push(resolve)
        setTimeout(() => resolve(caps || EMPTY), 3000)
      })

const all = (map) => Object.keys(map || {}).reduce((out, k) => out.concat(map[k]), [])
export const canVideo = (c, codec) => all(c.video).indexOf(codec) >= 0
export const canAudio = (c, codec) => all(c.audio).indexOf(codec) >= 0 || (c.audioAlone || []).indexOf(codec) >= 0
