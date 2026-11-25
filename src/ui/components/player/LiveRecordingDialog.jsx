import { Show, createEffect, createSignal, on, onCleanup } from 'solid-js'
import TrackModal from './TrackModal.jsx'
import GuidePopup from '../livetv/GuidePopup.jsx'
import Spinner from '../Spinner.jsx'
import { Kept } from '../library/pageKit.js'
import { recordPromptPopup } from '../livetv/livetvPopups.js'
import { textWidth, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import * as settings from '../../../state/settings.js'
import { recordPromptChannel } from '../../../utils/recordAiring.js'
import { recordDialog, seriesDialog } from '../../../pages/Player/liveRecording.js'
import { tx } from '../../fx.js'

// What the live player's Record button opens: the airing program's recording, its series rule and
// the episode choice a new or changed series rule asks for, in the track pickers' frame. Record
// This Episode hands over to the Record prompt, which takes the dialog's place until the recording
// is set or backed out of. It stays mounted: the holder sets `up` while the dialog is its panel,
// calls open(recording, channelItem) and focuses it, and hears closePanel() when the dialog is
// done. toast(message) answers each recording action over the player whether the dialog is up or not.
export default function LiveRecordingDialog(props) {
  const [view, setView] = createSignal('main')
  const [prompt, setPrompt] = createSignal(null)
  const [busy, setBusy] = createSignal(false)
  const [toastText, setToastText] = createSignal('')
  const [toastW, setToastW] = createSignal(0)
  const [toastA, setToastA] = createSignal(0)
  const [toastMs, setToastMs] = createSignal(0)
  const toastFont = uiFont('medium')
  let root
  let list = null
  let listModel = null
  let promptNode = null
  let gen = 0
  let rec = null
  let channel = null
  let rule = null
  let resolver = null
  let toastKey = 0
  const timers = []
  onCleanup(() => timers.forEach(clearTimeout))

  const listShown = () => props.up && view() !== 'airing'
  const promptShown = () => props.up && !!prompt()
  const busyShown = () => props.up && busy()

  // The list keeps the model it was last given, so it fills itself whenever it mounts.
  const openList = (model) => {
    listModel = model
    if (list) list.open(model)
  }
  // The list holds focus, or the prompt while it's up. Between the two the dialog keeps it.
  const focusInner = () => {
    const inner = view() !== 'airing' ? list : prompt() ? promptNode : null
    if (!inner) return false
    inner.setFocus()
    return true
  }
  const done = () => {
    if (props.up && props.closePanel) props.closePanel()
  }
  const act = (action) => {
    done()
    action()
  }
  const settle = (choice) => {
    const resolve = resolver
    resolver = null
    if (prompt()) {
      setPrompt(null)
      if (props.up) root.setFocus()
    }
    if (resolve) resolve(choice)
  }
  // The Record prompt resolves with the choice, or null on Back. One asked for after the dialog
  // closed answers as Back straight away.
  const ask = (promptProps, live) =>
    new Promise((resolve) => {
      if (!live()) return resolve(null)
      resolver = resolve
      setPrompt(recordPromptPopup({ ...promptProps, clockDisplay: settings.get('clockDisplay') }))
      root.setFocus()
    })
  const showSeries = (r) => {
    rule = r
    setView('series')
    openList({ ...seriesDialog(r), still: true })
  }
  const onTrackRow = (id) => {
    const s = rec.state()
    if (view() === 'series') {
      const r = rule
      act(() => (r ? rec.updateSeries(r, id) : rec.recordSeries(id)))
    } else if (id === 'close') done()
    else if (id === 'record') {
      if (s.timer) return act(() => rec.cancel())
      const mine = gen
      const live = () => mine === gen
      setView('airing')
      root.setFocus()
      rec
        .record({
          prompt: (p) => ask(p, live),
          setLoading: (on) => {
            if (live()) setBusy(on)
          },
          channel,
        })
        .then(() => live() && done())
    } else if (id === 'settings') {
      const mine = gen
      rec.loadSeriesRule().then((r) => mine === gen && (r ? showSeries(r) : done()))
    } else if (id === 'series') {
      if (s.seriesTimerId) act(() => rec.cancelSeries())
      else showSeries(null)
    }
  }
  // Back on the prompt closes the dialog, which answers the prompt as Back.
  const onPopup = (id) => {
    if (id === 'back') done()
    else settle(id)
  }

  // The dialog going down for any reason backs out of an open prompt.
  createEffect(
    on(
      () => props.up,
      (v) => {
        if (v) return
        gen++
        settle(null)
        setBusy(false)
        setView('main')
      },
      { defer: true },
    ),
  )

  const open = (r, item) => {
    gen++
    rec = r
    channel = recordPromptChannel(item && item.ChannelNumber, item && item.Name)
    setView('main')
    setBusy(false)
    setPrompt(null)
    openList(recordDialog(r.state(), settings.get('clockDisplay')))
  }
  // Fades in, holds and fades out over 3 s, starting over for each message.
  const toast = (message) => {
    const key = ++toastKey
    timers.forEach(clearTimeout)
    timers.length = 0
    setToastText(message)
    setToastW(Math.ceil(textWidth(message, 20, 'medium')) + 58)
    setToastMs(0)
    setToastA(0)
    const at = (ms, fn) => timers.push(setTimeout(() => key === toastKey && fn(), ms))
    at(16, () => {
      setToastMs(300)
      setToastA(1)
    })
    at(2550, () => {
      setToastMs(450)
      setToastA(0)
    })
    at(3000, () => setToastText(''))
  }

  return (
    <view
      ref={(n) => {
        root = n
        n.open = open
        n.toast = toast
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      forwardFocus={focusInner}
    >
      <view>
        <Show when={listShown()}>
          <Kept gone={() => (list = null)}>
            <TrackModal
              ref={(h) => {
                list = h
                if (listModel) h.open(listModel)
              }}
              onTrackRow={onTrackRow}
            />
          </Kept>
        </Show>
      </view>
      <GuidePopup ref={(h) => (promptNode = h)} m={prompt()} alpha={promptShown() ? 1 : 0} onPopup={onPopup} />
      <view alpha={busyShown() ? 1 : 0} width={1920} height={1080} color="#0000008a">
        <Spinner x={931} y={511} size={58} />
      </view>
      <view
        x={960 - toastW() / 2}
        y={72}
        width={toastW()}
        height={63}
        borderRadius={12}
        color="#1e1e28f0"
        border={{ width: 1, color: hex('#ffffff1f') }}
        transition={tx({ alpha: { duration: toastMs(), easing: 'ease' } })}
        alpha={toastA()}
      >
        <text fontFamily={toastFont} fontSize={20} x={29} y={17} lineHeight={33} color="#ffffffff">
          {toastText() || ' '}
        </text>
      </view>
    </view>
  )
}
