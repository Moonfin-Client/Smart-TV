import { createMemo } from 'solid-js'

// Keyed lists for layouts that run again on every paint: `<For>` runs over the keys, and each node
// reads its entry by key, so an entry that stays keeps its node and only the props
// that changed are set again. `list` is an accessor of [{ k, ... }]. An entry on its way out can read
// once more before its node goes, and gets `gone` then.
export const byKey = (list, gone) => {
  const map = createMemo(() => {
    const m = {}
    ;(list() || []).forEach((x) => (m[x.k] = x))
    return m
  })
  const keys = createMemo(() => (list() || []).map((x) => x.k))
  return { keys, at: (k) => map()[k] || gone }
}
