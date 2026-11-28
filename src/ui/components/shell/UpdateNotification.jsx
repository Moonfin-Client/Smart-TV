import $L from '../../../services/i18n.js'
import { For, Index, createMemo, createSignal, onMount } from 'solid-js'
import CoreDialog from './CoreDialog.jsx'
import { coreFrame, dp } from './coreFrame.js'
import { layoutBlocks, roboto } from './MessageMarkdown.js'
import { theme } from '../../theme.js'
import { textReady } from '../../text.js'
import { parseMarkdown } from '../../../utils/markdown.js'
import { downloadOtaUpdate } from '../../../services/versionChecker.js'
import { relaunchApp } from '../../../utils/appLifecycle.js'
import { releaseNotes, updateInfo } from '../../../state/shell/update.js'
import { shell } from '../../../state/shell/shellState.js'

// A CoreDialog offering the new version's release notes, and on a sideloaded build that updates in
// place, one row that walks through Download Update, Downloading {percent}%, Installing Update and
// Restart to Update. The notes open in a wide CoreDialog whose text pages with Up and Down. Closing
// either counts the version as seen, except mid-download, and the holder's onUpdateClose() does the
// dismissing. It opens on its first row, taking focus as it mounts, and keeps every key.
const OPTION_H = 2 * dp(12) + Math.max(dp(22), dp(15) * 1.17)
const KEYS = ['action', 'notes']

export default function UpdateNotification(props) {
  const info = () => (shell.update ? updateInfo() : null)
  const ota = () => info() && info().ota
  const [stage, setStage] = createSignal(ota() && ota().ready ? 'ready' : 'offer')
  const [progress, setProgress] = createSignal(0)
  const [notes, setNotes] = createSignal(false)
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [fontsIn, setFontsIn] = createSignal(false)
  let root
  onMount(() => {
    textReady().then(() => setFontsIn(true))
    root.setFocus()
  })
  const title = () => (info() ? $L('v{version} Available').replace('{version}', info().latestVersion) : '')
  // One row that changes as the update moves along, so focus never has to jump to a new one.
  const options = createMemo(() => {
    const out = {}
    if (ota()) {
      out.action = {
        offer: { icon: 'downloadRounded', label: $L('Download Update') },
        downloading: {
          icon: 'downloadRounded',
          label: progress() < 1 ? $L('Downloading {percent}%').replace('{percent}', Math.round(progress() * 100)) : $L('Installing Update'),
        },
        ready: { icon: 'restartAltRounded', label: $L('Restart to Update') },
        failed: { icon: 'downloadRounded', label: $L('Download Failed, Try Again') },
      }[stage()]
    }
    out.notes = { icon: 'articleOutlined', label: $L('Read Release Notes') }
    return out
  })
  const keys = () => (notes() ? [] : KEYS.filter((k) => options()[k]))
  const count = () => (ota() ? 2 : 1)
  const cancel = () => !notes() && stage() !== 'downloading'
  const laidNotes = createMemo(() => {
    fontsIn()
    return notes() ? layoutBlocks(parseMarkdown(releaseNotes()), dp(720) - 2 - 2 * dp(24), theme(), null) : { h: 0, texts: [], rects: [] }
  })
  const bodyH = () => (notes() ? dp(8) + laidNotes().h + dp(16) : count() * OPTION_H)
  const L = createMemo(() => coreFrame({ title: title(), wide: notes(), bodyH: bodyH(), cancel: cancel() }))

  const close = () => {
    if (stage() !== 'downloading' && props.onUpdateClose) props.onUpdateClose()
  }
  const download = () => {
    setProgress(0)
    setStage('downloading')
    downloadOtaUpdate(ota().manifest, (p) => setProgress(p)).then(
      () => setStage('ready'),
      () => setStage('failed'),
    )
  }
  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onUp={() => {
        if (notes()) setScroll(Math.max(0, scroll() - L().bodyH * 0.8))
        else if (cur() > 0) setCur(cur() - 1)
        return true
      }}
      onDown={() => {
        if (notes()) setScroll(Math.max(0, Math.min(bodyH() - L().bodyH, scroll() + L().bodyH * 0.8)))
        else if (cur() < count() - (cancel() ? 0 : 1)) setCur(cur() + 1)
        return true
      }}
      onEnter={() => {
        if (notes()) return true
        const k = keys()[cur()]
        if (!k) close()
        else if (k === 'notes') {
          setNotes(true)
          setScroll(0)
        } else if (stage() === 'ready') relaunchApp()
        else if (stage() !== 'downloading') download()
        return true
      }}
      onBack={() => {
        close()
        return true
      }}
      onKeyPress={() => true}
    >
      <CoreDialog title={title()} wide={notes()} bodyH={bodyH()} cancel={cancel()} cancelFocused={cancel() && cur() === count()} />
      <view x={L().bodyX} y={L().bodyY} width={L().bodyW} height={L().bodyH} clipping>
        <view>
          <For each={keys()}>
            {(k, i) => (
              <view y={i() * OPTION_H} width={L().bodyW} height={76.8}>
                <view width={L().bodyW} height={76.8} color={i() === cur() ? theme().os(0.12) : '#00000000'} />
                <view x={40.07} y={20.03} width={36.73} height={36.73} src={`icons/${options()[k].icon}.webp`} color={theme().os(0.7)} />
                <text fontFamily={roboto()} fontSize={25.044} x={103.51} y={26.25} lineHeight={29.301} color={theme().onSurface}>
                  {options()[k].label}
                </text>
              </view>
            )}
          </For>
        </view>
        <view y={13.36 - scroll()} width={L().bodyW} height={bodyH()} transition={{ y: { duration: 180 } }}>
          <view width={L().bodyW} height={bodyH()}>
            <Index each={laidNotes().rects}>
              {(r) => <view x={40.07 + r().x} y={r().y} width={r().w} height={r().h} borderRadius={r().r} color={r().color} />}
            </Index>
          </view>
          <view width={L().bodyW} height={bodyH()}>
            <Index each={laidNotes().texts}>
              {(x) => (
                <text fontFamily={x().font} fontSize={x().size} x={40.07 + x().x} y={x().y} lineHeight={x().lh} color={x().color}>
                  {x().t}
                </text>
              )}
            </Index>
          </view>
        </view>
      </view>
    </view>
  )
}
