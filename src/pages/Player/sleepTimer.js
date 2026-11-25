// The player's wall clock sleep timer. It runs whatever the viewer presses, lasts for this player
// only and is never saved. onExpire should leave the player the way Back does, so the stop is reported.
export const SLEEP_TIMER_MINUTES = [15, 30, 45, 60, 90]

export const createSleepTimer = (onExpire, { now = Date.now, later = setTimeout, cancel = clearTimeout } = {}) => {
  let minutes = null
  let endsAt = 0
  let timer = null

  const clear = () => {
    if (timer) cancel(timer)
    timer = null
    minutes = null
    endsAt = 0
  }

  return {
    // Off with a falsy count, else armed for that many minutes from now.
    start(count) {
      clear()
      if (!count) return
      minutes = count
      endsAt = now() + count * 60000
      timer = later(() => {
        timer = null
        clear()
        onExpire()
      }, count * 60000)
    },
    clear,
    minutes: () => minutes,
    remainingSeconds: () => (minutes == null ? 0 : Math.max(0, Math.round((endsAt - now()) / 1000))),
  }
}
