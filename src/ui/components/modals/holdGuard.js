// A modal a held OK opens (the card menu, Advanced Playback) is up while the key is still down, so
// the hold's repeats and its release mustn't pick from it. Chrome 38 doesn't flag repeats, so a
// press counts as new once the key has come up, or after a pause longer than any repeat leaves
// (webOS can lose the key-up). `down()` and `up()` say whether to drop that Enter.
const REPEAT_GAP_MS = 300

export const holdGuard = (held, now = () => Date.now()) => {
  let waiting = Boolean(held)
  let last = now()
  return {
    down() {
      if (!waiting) return false
      const t = now()
      const fresh = t - last > REPEAT_GAP_MS
      last = t
      if (fresh) waiting = false
      return !fresh
    },
    up() {
      if (!waiting) return false
      waiting = false
      return true
    },
  }
}
