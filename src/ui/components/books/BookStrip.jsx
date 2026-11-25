import { createMemo, createSignal } from 'solid-js'
import { fontFor } from '../../text.js'
import { TabBar } from './BookControls.jsx'
import { STRIP_H } from './bookParts.js'
import { ellipsize, textWidth } from './bookText.js'

// The highlight follows focus along the tabs and goes back to the open screen once focus leaves.
// It owns Left, Right and OK, hands Down to host.onStripDown() and calls host.onStripOpen(entry).
export default function BookStrip(props) {
  const [cur, setCur] = createSignal(0)
  const [has, setHas] = createSignal(false)
  const label = createMemo(() => ellipsize(props.name || '', 24, 'bold', 420))
  const tabsX = () => 60 + Math.min(420, textWidth(label(), 24, 'bold')) + 28
  const tabs = createMemo(() => (props.entries || []).map((e) => ({ id: e.key, label: e.label })))
  const active = () => {
    const entry = has() ? (props.entries || [])[cur()] : null
    return entry ? entry.key : props.current
  }
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      width={1920}
      height={STRIP_H}
      onFocusChanged={(on) => {
        setHas(on)
        if (on) setCur(Math.max(0, (props.entries || []).findIndex((e) => e.key === props.current)))
      }}
      onLeft={() => {
        if (cur() > 0) setCur(cur() - 1)
        return true
      }}
      onRight={() => {
        if (cur() < (props.entries || []).length - 1) setCur(cur() + 1)
        return true
      }}
      onUp={() => true}
      onDown={() => {
        props.host.onStripDown()
        return true
      }}
      onEnter={() => {
        const entry = (props.entries || [])[cur()]
        if (entry && entry.key !== props.current) props.host.onStripOpen(entry)
        return true
      }}
    >
      <text fontFamily={fontFor(props.name || '', 'bold')} fontSize={24} x={60} y={37} color={props.look.onSurface}>
        {label()}
      </text>
      <TabBar
        x={tabsX()}
        y={18}
        tabs={tabs()}
        active={active()}
        focus={has() ? cur() : -1}
        look={props.look}
        onPointerTab={(i) => {
          if (!has()) props.host.pointNav()
          setCur(i)
        }}
      />
    </view>
  )
}
