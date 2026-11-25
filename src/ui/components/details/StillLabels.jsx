import { For, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import { labelSets, watchMarks } from '../home/cardMarks.js'
import { labelsIdOf } from '../home/cards.js'
import * as settings from '../../../state/settings.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import { textReady } from '../../text.js'
import LabelSet from '../home/LabelSet.jsx'

// The admin's poster labels over a details page's episode still: the labels for `item` in a box `w`
// by `h`, each corner's stack starting at `top`, `topRight`, `bottom` and `bottomLeft`, at `scale`
// with `inset` from the sides. It watches its own item and redraws only when its labels do.
export default function StillLabels(props) {
  const [marks, setMarks] = createSignal(0)
  const bump = () => setMarks(marks() + 1)
  let watch = null
  let watchedId = null
  const follow = () => {
    const it = props.item
    // An item with no server of its own is the signed-in server's.
    const id = it ? labelsIdOf(it, settings.all(), it._serverUrl || props.server || getServerUrl()) : ''
    if (watch && watchedId === id) return
    if (watch) watch.stop()
    watchedId = id
    watch = id ? watchMarks({ raw: it, labelsId: id }, bump) : null
    bump()
  }
  createEffect(on(() => props.item, follow))
  // The labels size their pills by measuring, so they lay out again once the faces are in.
  textReady().then(bump)
  onCleanup(() => watch && watch.stop())

  const sets = createMemo(() => {
    marks()
    const seen = watch ? watch.read() : null
    if (!seen || !seen.badges.length) return []
    const at = (v, d) => (v == null || v === '' ? d : Number(v))
    const card = {
      labelsTop: at(props.top, 8),
      labelsTopRight: at(props.topRight, 8),
      labelsBottom: at(props.bottom, 8),
      labelsBottomLeft: at(props.bottomLeft, at(props.bottom, 8)),
    }
    return labelSets(seen.badges, card, Number(props.w), Number(props.h), false, bump, { scale: at(props.scale, 0.8), inset: at(props.inset, 8) })
  })
  return (
    <view x={props.x || 0} y={props.y || 0}>
      <For each={sets()}>{(ls) => <LabelSet w={props.w} h={props.h} nodes={ls.nodes} />}</For>
    </view>
  )
}
