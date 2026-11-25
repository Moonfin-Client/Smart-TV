import $L from '../../../services/i18n.js'
import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import Keyboard from '../Keyboard.jsx'
import PartyPaint from './PartyPaint.jsx'
import { openNativeInput, usesNativeKeyboard } from '../account/nativeInput.js'
import { watchParty, formatRoomCode } from '../../../services/siloWatchParty.js'
import { createSheet } from '../../../pages/WatchParty/sheet.js'
import { partyPeople } from '../../../pages/WatchParty/views.js'
import { spotlightMove } from './spotlight.js'
import { scrollFor } from './sheetMath.js'
import { fontsReady } from './measure.js'
import { fontsReady as textFontsReady } from '../library/measure.js'
import { getStore } from '../../../state/store.js'

// The player's "Your watch party" panel: the screen dimmed, and down the right a 660px column padded
// 48 by 40 with the title, the room code, and the same people, host settings, Leave and End as the
// lobby's side column. It opens on the first member, as the player's modals focus their first
// button.
const PANEL_X = 1180
const PAD_X = 40
const PAD_Y = 48
const PEOPLE_Y = PAD_Y + 33 + 6 + 33 + 18
const EMPTY = { boxes: [], rings: [], pics: [], boxes2: [], rings2: [], texts: [] }

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function PartyPanel(props) {
  const [paint, setPaint] = createSignal(EMPTY, { equals: same })
  const [scrollY, setScrollY] = createSignal(0)
  const [editing, setEditing] = createSignal(false)
  const [contentH, setContentH] = createSignal(1080)
  const my = { picked: null, pin: null, pinBad: false, everyoneAllowed: true, focus: null, focusables: [], gone: false }
  let root
  let kb

  // In the panel's own coordinates, padding included, since the whole column scrolls.
  const layout = (room, busy) => {
    const s = createSheet(my.focus)
    s.text('title', PAD_X, PAD_Y, $L('Your watch party'), { size: 32, weight: 500, lh: 33 })
    s.text('sub', PAD_X, PAD_Y + 33 + 6, $L('Room code {code}').replace('{code}', formatRoomCode(room.code)), { size: 21, color: '#a8a8a8', lh: 33 })
    const h = partyPeople(s, PAD_X, PEOPLE_Y, 660, {
      room,
      busy,
      picked: my.picked,
      roomPin: my.pin,
      pinBad: my.pinBad,
      everyoneAllowed: my.everyoneAllowed,
      avatarFor: (id) => watchParty.avatarUrlFor(id) || '',
    })
    return { ...s.out, h: PEOPLE_Y + h + PAD_Y }
  }
  const render = () => {
    if (my.gone) return
    const st = watchParty.state()
    const room = st.room
    if (!room) return
    if (!room.isHost) my.picked = null
    let laid = layout(room, st.busy)
    if (!laid.focusables.some((f) => f.id === my.focus)) {
      my.focus = laid.focusables.length ? laid.focusables[0].id : null
      laid = layout(room, st.busy)
    }
    my.focusables = laid.focusables
    setContentH(Math.max(1080, laid.h))
    setPaint({ boxes: laid.boxes, rings: laid.rings, pics: laid.pics, boxes2: laid.boxes2, rings2: laid.rings2, texts: laid.texts })
    const f = laid.focusables.find((x) => x.id === my.focus)
    if (f) setScrollY(scrollFor(scrollY(), f, 1080, laid.h))
  }
  // The Magic Remote's cursor (app/pointer.js): a control in full view takes focus on hover, one the
  // panel would scroll to on a click.
  const pointAt = (i, click) => {
    const f = my.focusables[i]
    if (editing() || !f) return false
    const y = f.y - scrollY()
    if (!click && (y < 0 || y + f.h > 1080 || my.focus === f.id)) return false
    if (my.focus !== f.id) {
      my.focus = f.id
      render()
    }
    return click
  }
  const move = (dir) => {
    const onScreen = my.focusables.map((f) => ({ ...f, y: f.y - scrollY() }))
    const next = spotlightMove(onScreen, my.focus, dir)
    if (!next) return
    my.focus = next
    render()
  }
  const close = () => props.onClose()

  const onKeyboardChange = (text) => {
    my.pin = String(text || '').replace(/\D/g, '').slice(0, 8)
    my.pinBad = false
    render()
  }
  // Done acts like Enter in the field.
  const onKeyboardClose = async (submitted) => {
    setEditing(false)
    if (root) root.setFocus()
    render()
    if (!submitted) return
    if (!/^\d{4,8}$/.test(my.pin || '')) {
      my.pinBad = true
      return render()
    }
    if (await watchParty.setPin(my.pin)) {
      my.pin = null
      my.focus = 'pinRow'
    }
    render()
  }
  const openNative = () => {
    const f = my.focusables.find((x) => x.id === 'roomPin')
    const rect = f ? { x: PANEL_X + f.x, y: f.y - scrollY(), w: f.w, h: f.h } : { x: PANEL_X + PAD_X, y: PEOPLE_Y, w: 660, h: 70 }
    const opened = openNativeInput({ value: my.pin || '', maxLength: 8, rect, onChange: onKeyboardChange, onClose: onKeyboardClose })
    if (!opened) onKeyboardClose(false)
  }
  const openKeyboard = () => {
    setEditing(true)
    if (usesNativeKeyboard()) return openNative()
    kb.open({ value: my.pin || '', purpose: 'numeric', maxLength: 8 })
    kb.setFocus()
  }
  const activate = (id) => {
    const st = watchParty.state()
    const room = st.room
    if (!room) return
    if (id === 'leave') {
      watchParty.leave()
      return close()
    }
    if (id === 'end') {
      if (st.busy) return
      watchParty.end()
      return close()
    }
    if (id === 'everyone') {
      if (!st.busy) watchParty.setEveryoneControls(!room.everyoneControls)
      return
    }
    if (id === 'pinRow') {
      if (st.busy) return
      if (room.hasPin) return watchParty.setPin(null)
      my.pin = ''
      my.pinBad = false
      my.focus = 'roomPin'
      return render()
    }
    if (id === 'roomPin') return openKeyboard()
    // The actions go once used, so focus moves to your own row, where a second OK does nothing.
    if (id === 'promote' || id === 'remove') {
      const picked = my.picked
      my.picked = null
      my.focus = 'self'
      if (picked && !st.busy) {
        if (id === 'promote') watchParty.promote(picked)
        else watchParty.removeMember(picked)
      }
      return render()
    }
    if (id.indexOf('m:') === 0 && room.isHost) {
      const picked = id.slice(2)
      my.picked = my.picked === picked ? null : picked
      render()
    }
  }

  onMount(() => {
    const unsub = watchParty.subscribe(() => render())
    onCleanup(unsub)
    watchParty.config().then((config) => {
      my.everyoneAllowed = !config || config.everyone_control_allowed !== false
      render()
    })
    Promise.all([fontsReady(), textFontsReady()]).then(() => render())
    render()
    if (root) root.setFocus()
  })
  onCleanup(() => (my.gone = true))
  // A theme change, or a theme face that finished loading, lays the column out again.
  createEffect(on(() => getStore().settingsVersion, render, { defer: true }))

  const key = (dir) => () => {
    if (!editing()) move(dir)
    return true
  }
  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      onUp={key('up')}
      onDown={key('down')}
      onLeft={key('left')}
      onRight={key('right')}
      onEnter={() => {
        if (!editing() && my.focus) activate(my.focus)
        return true
      }}
      onBack={() => {
        if (editing()) {
          setEditing(false)
          if (root) root.setFocus()
        } else close()
        return true
      }}
    >
      <view width={1920} height={1080} color="#00000066" />
      <view x={PANEL_X} width={740} height={1080} color="#1a1a1a" clipping>
        <view y={-scrollY()} width={740} height={contentH()}>
          <PartyPaint paint={paint()} />
          <view
            width={740}
            height={contentH()}
            pointerItems={() => my.focusables.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h }))}
            onPointerItem={(_, i) => pointAt(i, false)}
            onPointerItemClick={(_, i) => pointAt(i, true)}
          />
        </view>
      </view>
      <Keyboard overlay ref={(n) => (kb = n)} onKeyboardChange={onKeyboardChange} onKeyboardClose={onKeyboardClose} onKeyboardNative={openNative} />
    </view>
  )
}
