import { For } from 'solid-js'
import { keyed } from '../library/pageKit.js'
import SettingsRow from './SettingsRow.jsx'
import { COLUMN_W } from './layoutRows.js'

// The editor blocks (screens/editors.js). 'edit.cards' is cards laid side by side inside one
// another, the way a Custom Rows entry holds its Edit and Delete cards: each card in m.cards is a
// layoutCard model with its own x and y, drawn focused when its sid has the focus.
export default function EditorBlock(props) {
  const cards = keyed(() => (props.m.block === 'edit.cards' ? props.m.cards || [] : []), (c) => c.k)
  return (
    <view width={COLUMN_W} height={props.m.h}>
      <For each={cards.keys()}>
        {(k) => {
          const c = cards.item(k)
          return <SettingsRow m={c()} focused={c().sid === props.focusSid} p={props.p} fade={props.fade} slide={props.slide} />
        }}
      </For>
    </view>
  )
}
