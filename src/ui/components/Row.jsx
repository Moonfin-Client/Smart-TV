import { Show, createMemo, createSignal } from 'solid-js'
import MediaRow from './home/MediaRow.jsx'
import { homeLook, rowBox } from './home/look.js'
import { shapeRow } from './home/cards.js'
import * as settings from '../../state/settings.js'

// A titled row of `items` (ui/models.js toCard()s) drawn as Home's MediaRow in the `look` style
// ('classic', 'modern', 'carousel' or 'media') from each card's raw server item, standing
// Row.heightFor(look, items, type) tall. 'media' is the plain row used off Home: centered captions,
// the library's watched switches, its own 60px inset and 30px under each row. It calls
// onRowFocus(card, rowKey, index) and onRowSelect(card, rowKey, index).
const smartLook = (look) => {
  const s = settings.all()
  if (look !== 'media') return homeLook({ ...s, homeRowsStyle: look === 'classic' ? 'v1' : look })
  return {
    ...homeLook({ ...s, homeRowsStyle: 'v1' }),
    plain: true,
    overlay: false,
    spacing: 30,
    clipX: 0,
    pad: 60,
    inset: 60,
    viewW: 1920,
    hideProgress: s.hideLibraryWatchProgress === true,
    hideCount: s.hideLibraryUnwatchedCount === true,
  }
}
const smartRow = (look, key, title, items, type) => {
  const s = settings.all()
  const row = shapeRow({ key, id: key, title: title || '', subtitle: '', type: type || 'poster', items: (items || []).map((c) => c.raw || c) }, look, s)
  row.box = rowBox(row, look, s)
  return row
}

export default function Row(props) {
  const items = () => props.items || []
  const [cur, setCur] = createSignal(Math.min(props.startIndex || 0, Math.max(0, (props.items || []).length - 1)))
  const current = () => items()[cur()]
  const smart = createMemo(() => {
    if (!props.look) return null
    const look = smartLook(props.look)
    return { look, row: smartRow(look, props.rowKey || 'row', props.title, props.items, props.type) }
  })
  const notify = () => {
    const card = current()
    if (card && props.onRowFocus) props.onRowFocus(card, props.rowKey, cur())
  }
  let inner
  let entered = false
  return (
    <view
      ref={(n) => {
        n.focusIndex = (i) => {
          const to = Math.max(0, Math.min(i, items().length - 1))
          setCur(to)
          // The row keeps its own position, which is where focus lands coming back in.
          if (inner) inner.focusIndex(to)
        }
        n.current = current
        n.cur = cur
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={1920}
      height={smart() ? smart().row.box.h : 0}
      forwardFocus={() => {
        if (!inner) return false
        // The first entry lands on the remembered card.
        if (!entered) inner.focusIndex(cur())
        entered = true
        inner.setFocus()
        return true
      }}
    >
      <Show when={smart()}>
        <MediaRow
          ref={(n) => (inner = n)}
          row={smart().row}
          box={smart().row.box}
          look={smart().look}
          leftNav={smart().look.left}
          onRowFocus={(card, key, index) => {
            setCur(index)
            notify()
          }}
          onRowSelect={(card, key, index) => {
            setCur(index)
            if (current() && props.onRowSelect) props.onRowSelect(current(), props.rowKey, index)
          }}
        />
      </Show>
    </view>
  )
}

// How tall a row in one of the Home looks stands, with the space under it.
Row.heightFor = (look, items, type) => smartRow(smartLook(look), 'h', '', items, type).box.h
