import $L from '../../services/i18n.js'
import { Show, createSignal, onCleanup, onMount } from 'solid-js'
import Dialog from '../../ui/components/Dialog.jsx'
import ComicViewer from '../../ui/components/media/ComicViewer.jsx'
import { Kept } from '../../ui/components/library/pageKit.js'
import { openBookOverlay } from '../../ui/components/media/bookOverlay.js'
import { bookReader, supportsNewerBookFormats } from '../../utils/books.js'
import { api } from '../../services/jellyfinApi.js'
import { router } from '../../app/router.js'


// Opens a book in the reader its file needs: comics on the canvas, EPUB and PDF in a DOM layer
// above it (bookOverlay.js), which takes the keys itself. A format this TV can't read gets a dialog
// saying so, and OK or Back leaves.
export default function Reader(props) {
  const [mode, setMode] = createSignal('loading')
  const [message, setMessage] = createSignal('')
  let comic = null
  let dialog = null
  let overlay = null
  let closed = false
  let left = false
  const leave = () => {
    if (left) return
    left = true
    router.back()
  }
  const focusChild = () => {
    const child = mode() === 'comic' ? comic : mode() === 'unreadable' ? dialog : null
    if (child) child.setFocus()
    return !!child
  }
  onMount(async () => {
    let item = null
    try {
      item = await api.getItem(props.id)
    } catch (e) {
      console.warn('[reader] item failed', e)
    }
    if (closed) return
    const reader = item ? bookReader(item) : null
    if (!reader || (reader.newer && !supportsNewerBookFormats())) {
      setMessage(
        reader
          ? $L('{format} books need a newer TV. Read this one in Moonfin on a phone, tablet or computer.').replace('{format}', reader.ext.toUpperCase())
          : $L("This TV can't read books in this format. Read this one in Moonfin on a phone, tablet or computer."),
      )
      setMode('unreadable')
      focusChild()
    } else if (reader.kind === 'comic') {
      setMode('comic')
      focusChild()
      if (comic) comic.open(item, reader.archive)
    } else {
      setMode('book')
      overlay = openBookOverlay({ item, kind: reader.kind, onClose: leave })
    }
  })
  onCleanup(() => {
    closed = true
    if (overlay) overlay.close()
    overlay = null
  })
  return (
    <view width={1920} height={1080} color="#000000" forwardFocus={() => focusChild()}>
      <Show when={mode() === 'comic'}>
        <Kept gone={() => (comic = null)}>
          <ComicViewer ref={(n) => (comic = n)} onComicClose={leave} />
        </Kept>
      </Show>
      <Show when={mode() === 'unreadable'}>
        <Kept gone={() => (dialog = null)}>
          <Dialog ref={(n) => (dialog = n)} variant="message" title={$L("This book can't be read here")} message={message()} buttons={[{ id: 'ok', label: $L('OK'), primary: true }]} onDialog={leave} />
        </Kept>
      </Show>
    </view>
  )
}
