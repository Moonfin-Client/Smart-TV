import $L from '../../../services/i18n.js'
import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import Keyboard from '../Keyboard.jsx'
import { cssShift, fontFor } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { textWidth } from '../details/measure.js'
import { api } from '../../../services/jellyfinApi.js'
import { toast } from '../../../state/store.js'
import { openNativeInput, usesNativeKeyboard } from '../account/nativeInput.js'
import { identifyLayout } from './identifyLayout.js'
import { revealScroll } from './subtitleSearchLayout.js'
import { Rects, Texts } from './draw.jsx'

// The Admin Controls dialog: Identify (search the metadata providers by name and year, then apply a
// match) or Refresh Metadata. Back steps from the search or the results to the menu, and from the
// menu closes it.
// Props: `item`. It calls onIdentifyClose() when it's done and onItemRefreshed(newId) once the item
// changed.
const RESULT_LIMIT = 20
const ACCENT = '#00a4dcff'

export default function IdentifyModal(props) {
  const it = props.item || {}
  const [view, setView] = createSignal('menu')
  const [name, setName] = createSignal(it.Name || '')
  const [year, setYear] = createSignal(it.ProductionYear != null ? String(it.ProductionYear) : '')
  const [results, setResults] = createSignal([])
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [editing, setEditing] = createSignal('')
  // The in-app keyboard is only built while a field types on it.
  const [kbOn, setKbOn] = createSignal(false)
  let alive = true
  let root
  let kb
  onCleanup(() => (alive = false))

  const laid = createMemo(() => {
    const L = identifyLayout({ view: view(), name: name(), year: year(), results: results(), busy: busy(), error: error() }, textWidth)
    L.texts.forEach((tx) => {
      tx.font = fontFor(tx.t, tx.weight)
      tx.y += cssShift(tx.size)
      tx.lines = 1
      tx.a = tx.dim ? 0.7 : 1
    })
    return L
  })
  // The dialog keeps its own blue whatever the theme.
  const boxes = createMemo(() => {
    const f = laid().focusables[cur()]
    return laid().boxes.map((b) => {
      const on = Boolean(f && f.id === b.id)
      if (b.kind === 'row') return { ...b, color: on ? '#00a4dc40' : '#00000000', bw: 2, bc: on ? ACCENT : '#00000000' }
      if (b.kind === 'input') return { ...b, color: on ? '#ffffff1a' : '#ffffff0f', bw: 1, bc: on ? ACCENT : '#ffffff26' }
      return { ...b, color: on || b.primary ? ACCENT : '#ffffff1a', bw: 1, bc: on ? '#ffffffff' : '#00000000', a: b.dim ? 0.7 : 1 }
    })
  })
  const rings = () => boxes().filter((b) => b.kind === 'row')
  const frames = () => boxes().filter((b) => b.kind !== 'row')

  const show = (v) => {
    setView(v)
    setCur(0)
    setScroll(0)
  }
  // The dialog scrolls past 70% of the screen, moving as little as it can to show the focus.
  const reveal = () => setScroll(revealScroll(scroll(), laid().focusables[cur()], laid().h, laid().fullH))
  const search = async () => {
    if (busy() || !name().trim()) return
    setBusy(true)
    setError('')
    try {
      // Silo searches matches for the given ItemId, and Jellyfin ignores it.
      const info = { ItemId: it.Id, Name: name().trim(), ProviderIds: {} }
      if (year().trim()) info.Year = parseInt(year(), 10)
      const found = await api.searchRemote(it.Type, info)
      if (!alive) return
      setResults((found || []).slice(0, RESULT_LIMIT))
      show('results')
    } catch (e) {
      if (alive) setError($L('Could not search for matches.'))
    }
    if (alive) setBusy(false)
  }
  const apply = async (i) => {
    const result = results()[i]
    if (!result || busy()) return
    setBusy(true)
    setError('')
    try {
      // Silo gives a newly matched item a new id, and the page reopens under it.
      const newId = await api.applyRemoteSearchResult(it.Id, result, true)
      if (!alive) return
      toast($L('Metadata updated'))
      props.onIdentifyClose()
      props.onItemRefreshed(typeof newId === 'string' && newId && newId !== it.Id ? newId : null)
    } catch (e) {
      if (!alive) return
      setError($L('Could not apply that match.'))
      setBusy(false)
    }
  }
  const refresh = async () => {
    if (busy()) return
    setBusy(true)
    setError('')
    try {
      await api.refreshItem(it.Id, { replaceAllMetadata: true, replaceAllImages: false })
      if (!alive) return
      toast($L('Refreshing metadata'))
      props.onIdentifyClose()
      props.onItemRefreshed()
    } catch (e) {
      if (!alive) return
      setError($L('Could not refresh metadata.'))
      setBusy(false)
    }
  }
  const setField = (field, text) => (field === 'year' ? setYear(String(text || '')) : setName(String(text || '')))
  // A field opens the TV's keyboard with Keyboard Style Native and the app's own otherwise.
  const edit = (field, viaNative) => {
    setEditing(field)
    const value = field === 'year' ? year() : name()
    const maxLength = field === 'year' ? 4 : 200
    if (viaNative || usesNativeKeyboard()) {
      const f = laid().focusables.find((x) => x.id === field)
      const opened = openNativeInput({
        value,
        maxLength,
        rect: { x: laid().x + f.x, y: laid().y + f.y, w: f.w, h: f.h },
        onChange: (text) => setField(field, text),
        onClose: (submitted) => onKeyboardClose(submitted),
      })
      if (opened !== false) return
    }
    setKbOn(true)
    if (!kb) return
    kb.open({ value, purpose: field === 'year' ? 'numeric' : 'text', maxLength })
    kb.setFocus()
  }
  const onKeyboardClose = (submitted) => {
    setEditing('')
    setKbOn(false)
    if (root) root.setFocus()
    // Done on the keyboard runs the search.
    if (submitted) search()
  }
  const move = (dir) => {
    const all = laid().focusables
    const f = all[cur()]
    if (!f) return true
    if (dir === 'left' || dir === 'right') {
      const d = dir === 'left' ? -1 : 1
      const next = all[cur() + d]
      if (next && next.line === f.line) setCur(cur() + d)
      return true
    }
    const line = f.line + (dir === 'up' ? -1 : 1)
    const target = all.findIndex((x) => x.line === line)
    if (target >= 0) setCur(target)
    reveal()
    return true
  }

  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onUp={() => move('up')}
      onDown={() => move('down')}
      onLeft={() => move('left')}
      onRight={() => move('right')}
      onEnter={() => {
        const f = laid().focusables[cur()]
        if (!f) return true
        if (f.id === 'identify') show('search')
        else if (f.id === 'refresh') refresh()
        else if (f.id === 'name' || f.id === 'year') edit(f.id)
        else if (f.id === 'search') search()
        else if (f.id === 'cancel' || f.id === 'back') show('menu')
        else if (f.id.indexOf('result') === 0) apply(Number(f.id.slice(6)))
        return true
      }}
      onBack={() => {
        if (view() === 'menu') props.onIdentifyClose()
        else show('menu')
        return true
      }}
      onKeyPress={() => true}
    >
      <view width={1920} height={1080} color="#00000099" />
      <view x={laid().x} y={laid().y} width={laid().w} height={laid().h}>
        <view width={laid().w} height={laid().h} borderRadius={24} color="#00000000" shadow={{ color: shadowColor('#00000066'), x: 0, y: 8, blur: 32, spread: 0 }} />
        <view width={laid().w} height={laid().h} borderRadius={24} color="#1e1e28f7" border={{ width: 1, color: hex('#ffffff1f') }} />
        <view x={24} y={1} width={laid().w - 48} height={1} color="#ffffff14" />
        <view width={laid().w} height={laid().h} clipping>
          <view y={-scroll()} width={laid().w} height={laid().fullH}>
            <Rects list={rings()} />
            <Rects list={frames()} />
            <Texts list={laid().texts} />
          </view>
        </view>
      </view>
      <view>
        <Show when={kbOn()}>
          <Keyboard
            overlay
            ref={(n) => (kb = n)}
            onKeyboardChange={(text) => editing() && setField(editing(), text)}
            onKeyboardClose={onKeyboardClose}
            onKeyboardNative={() => {
              const field = editing()
              setKbOn(false)
              if (root) root.setFocus()
              if (field) edit(field, true)
            }}
          />
        </Show>
      </view>
    </view>
  )
}
