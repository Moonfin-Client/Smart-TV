// Seeking speeds up while a key is held. A key up, a turn the other way or a pause longer than a
// remote's repeat starts the count over, so separate presses always move the set step.
const HOLD_GAP_MS = 1000

export const holdSeekSeconds = (base, count) => Math.max(base, count <= 3 ? 0 : count <= 8 ? 30 : count <= 16 ? 60 : 180)

export const holdStep = (hold, dir, base, now) => {
  const count = hold && hold.count > 0 && hold.dir === dir && now - hold.at < HOLD_GAP_MS ? hold.count + 1 : 1
  return { hold: { count, dir, at: now }, delta: dir * holdSeekSeconds(base, count) }
}
