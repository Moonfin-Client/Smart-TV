// The text of every cue on screen at a time, joined in list order, the same as a scan from the
// start that stops at the first cue still to come. That first cue only moves forward as time does,
// so it's followed from where it was, and the look back from it stops once every earlier cue has
// ended. Going back in time or a new list starts the follow over.
export const createCueText = () => {
  let events = null
  let latestEnd = []
  let next = 0
  let last = -Infinity
  return (list, ticks) => {
    if (list !== events) {
      events = list
      next = 0
      // The latest end among each cue and all the ones before it.
      latestEnd = new Array(list.length)
      let m = -Infinity
      for (let i = 0; i < list.length; i++) {
        const end = list[i].EndPositionTicks
        if (end > m) m = end
        latestEnd[i] = m
      }
    }
    if (!(ticks >= last)) next = 0
    last = ticks
    while (next < list.length && !(list[next].StartPositionTicks > ticks)) next++
    const hits = []
    for (let i = next - 1; i >= 0 && !(latestEnd[i] < ticks); i--) {
      const ev = list[i]
      if (ev.StartPositionTicks <= ticks && ticks <= ev.EndPositionTicks) hits.push(ev.Text)
    }
    let text = ''
    for (let i = hits.length - 1; i >= 0; i--) text = text ? `${text}\n${hits[i]}` : hits[i]
    return text
  }
}
