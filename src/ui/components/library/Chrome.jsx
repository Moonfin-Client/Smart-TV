import { For, createEffect, createMemo, createSelector, createSignal, on, untrack } from 'solid-js'
import ChromeControl from './ChromeControl.jsx'
import { nextControl } from './chromeNav.js'

// The focusable controls of a library screen's header, toolbar, bar or docked panel, as one
// focus owner. The arrows move between controls by where they sit, unless a control names where a
// direction goes in `next`. 'out' hands the press to the page and '@group' goes back to the control
// last used in that group. A press with nowhere to go is handed to the page through
// onChromeEdge(dir, control), and Enter calls onChromeSelect(id, control). onChromeFocus(id, control)
// hears each move. A control marked `held` draws focused while focus is elsewhere, as a text field
// does while its keyboard is up.
// Its node has select(id), selectGroup(group), hasGroup(group), current(), find(id) and move(dir).
export default function Chrome(props) {
  const [cur, setCur] = createSignal('')
  const [focused, setFocused] = createSignal(false)
  const isCur = createSelector(cur)
  const last = {}
  let group = null
  const list = () => props.controls || []
  // Controls are kept by id, so a rebuilt list updates each control in place.
  const byId = createMemo(() => {
    const map = {}
    list().forEach((c) => {
      map[c.id] = c
    })
    return map
  })
  const ids = createMemo(
    () => list().map((c) => c.id),
    undefined,
    { equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]) },
  )
  const find = (id) => (id ? untrack(byId)[id] || null : null)
  const first = () => {
    const c = untrack(list)[0]
    return c ? c.id : ''
  }
  const note = () => {
    const c = find(untrack(cur))
    if (!c) return
    group = c.group
    last[c.group] = c.id
    if (props.onChromeFocus) props.onChromeFocus(c.id, c)
  }
  const select = (id) => {
    if (!find(id)) return false
    setCur(id)
    note()
    return true
  }
  // The control last used in a group, else its first one.
  const selectGroup = (g) => {
    const c = find(last[g]) || untrack(list).find((x) => x.group === g)
    return c ? select(c.id) : false
  }
  // Picks a control when the current one leaves the list, or when the header took focus before it
  // had any controls.
  createEffect(
    on(list, () => {
      if (find(untrack(cur))) return
      const c = find(last[group]) || untrack(list).find((x) => x.group === group)
      setCur(c ? c.id : first())
    }),
  )
  const edge = (dir, c) => !!(props.onChromeEdge && props.onChromeEdge(dir, c) !== false)
  const move = (dir) => {
    const c = find(cur())
    if (!c) return false
    const rule = c.next && c.next[dir]
    if (rule === 'out') return edge(dir, c)
    if (rule === 'stay') return true
    if (rule && (rule.charAt(0) === '@' ? selectGroup(rule.slice(1)) : select(rule))) return true
    const to = nextControl(list(), c, dir)
    if (to) return select(to.id)
    return edge(dir, c)
  }
  return (
    <view
      ref={(n) => {
        n.select = select
        n.selectGroup = selectGroup
        n.hasGroup = (g) => untrack(list).some((x) => x.group === g)
        n.current = () => find(untrack(cur))
        n.find = find
        n.move = move
        if (props.ref) props.ref(n)
      }}
      onFocusChanged={(has) => {
        setFocused(has)
        if (!has) return
        if (!find(cur())) setCur(first())
        note()
      }}
      onLeft={() => move('left')}
      onRight={() => move('right')}
      onUp={() => move('up')}
      onDown={() => move('down')}
      onEnter={() => {
        const c = find(cur())
        if (c && props.onChromeSelect) props.onChromeSelect(c.id, c)
        return true
      }}
    >
      <For each={ids()}>
        {(id) => {
          let kept = byId()[id]
          const ctl = () => (kept = byId()[id] || kept)
          return <ChromeControl c={ctl()} focused={(focused() && isCur(id)) || !!ctl().held} />
        }}
      </For>
    </view>
  )
}
