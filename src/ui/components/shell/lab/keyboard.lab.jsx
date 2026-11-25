import { createSignal, onCleanup, onMount } from 'solid-js'
import Keyboard from '../../Keyboard.jsx'
import TextField from '../../TextField.jsx'
import { getStore } from '../../../../state/store.js'

// /lab/keyboard: a field with the overlay keyboard open on it ({ open: {...open() options} }), or the
// inline grid ({ inline: true }). The field is TextField's lab too ({ field: {...props} }).
export default function KeyboardLab(props) {
  let kb
  let field
  const [value, setValue] = createSignal((props.open && props.open.value) || '')
  const [closed, setClosed] = createSignal('')
  // Bare ({ bare: true }): no field and no nav, so the keyboard draws over the page color alone.
  const store = getStore()
  if (props.bare) {
    store.navVisible = false
    onCleanup(() => (store.navVisible = true))
  }
  onMount(() => {
    const t = setTimeout(() => {
      window.__kbLab = { kb, field, closed }
      if (props.noKeyboard) return field.setFocus()
      if (!props.inline) kb.open({ ...(props.open || {}) })
      kb.setFocus()
    }, 60)
    onCleanup(() => clearTimeout(t))
  })
  return (
    <view width={1920} height={1080}>
      <view alpha={props.bare ? 0 : 1}>
        <TextField
        ref={(n) => (field = n)}
        x={560}
        y={200}
        label="Server Address"
        placeholder="https://"
        value={value()}
        focused
        {...(props.field || {})}
        />
      </view>
      <Keyboard
        ref={(n) => (kb = n)}
        overlay={!props.inline}
        x={420}
        y={420}
        onKeyboardChange={setValue}
        onKeyboardInput={(ch) => setValue(value() + ch)}
        onKeyboardBackspace={() => setValue(value().slice(0, -1))}
        onKeyboardClose={(submitted) => {
          setClosed(submitted ? 'submitted' : 'canceled')
          field.setFocus()
        }}
        onKeyboardNative={() => setClosed('native')}
      />
    </view>
  )
}
