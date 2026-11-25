import { createMemo, onCleanup } from 'solid-js'

// A setTimeout whose pending calls are all cleared when the page goes.
export const pageTimers = () => {
  let ids = []
  onCleanup(() => ids.forEach(clearTimeout))
  return (fn, ms) => {
    const id = setTimeout(() => {
      ids = ids.filter((x) => x !== id)
      fn()
    }, ms || 0)
    ids.push(id)
    return id
  }
}

const sameKeys = (a, b) => a.length === b.length && a.every((k, i) => k === b[i])

// Lists here are rebuilt with new objects on every change, which <For> would redraw child by child.
// So <For> runs over keys() and each child reads its latest object through item(key). That's a memo
// of the child's own, so a child whose object stayed the same doesn't run again when others change.
// Call item(key) inside the child, which owns the memo.
export const keyed = (list, keyOf) => {
  const map = createMemo(() => {
    const m = {}
    ;(list() || []).forEach((it) => {
      m[keyOf(it)] = it
    })
    return m
  })
  const keys = createMemo(() => (list() || []).map(keyOf), undefined, { equals: sameKeys })
  const item = (k) => {
    let kept
    // A child about to go keeps its last object, so it never reads a missing one on the way out.
    return createMemo(() => (kept = map()[k] || kept))
  }
  return { keys, item }
}

// Calls `gone` when it unmounts, so a holder can drop a ref to a child that a <Show> took away.
export const Kept = (props) => {
  onCleanup(() => props.gone())
  return props.children
}
