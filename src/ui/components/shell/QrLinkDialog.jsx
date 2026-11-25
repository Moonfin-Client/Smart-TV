import $L from '../../../services/i18n.js'
import { createMemo, createSignal, onMount } from 'solid-js'
import CoreDialog from './CoreDialog.jsx'
import { coreFrame, dp } from './coreFrame.js'
import { textReady } from '../../text.js'
import { qrDataUrl } from '../account/qr.js'
import { roboto, wrapText } from './MessageMarkdown.js'

// A TV has nowhere to open a link, so a message's action goes to the viewer's phone as a QR code,
// in a CoreDialog titled with the action's label. Its Cancel row is the only stop, so the holder
// keeps the remote and closes it on Enter or Back.
const BOX = dp(180) + 2 * dp(12)

export default function QrLinkDialog(props) {
  const [fontsIn, setFontsIn] = createSignal(false)
  onMount(() => textReady().then(() => setFontsIn(true)))
  const code = createMemo(() => qrDataUrl(props.url))
  const urlLines = createMemo(() => {
    fontsIn()
    return wrapText(props.url || '', dp(11), 'regular', dp(440) - 2)
  })
  // The code's box sits on a line of the panel's 24px text, whose descent shows under it.
  const bodyH = () => dp(8) + BOX + 5.84 + dp(16) + dp(13) * 1.17 + dp(4) + urlLines().length * dp(11) * 1.17 + dp(16)
  const L = createMemo(() => coreFrame({ title: props.title, bodyH: bodyH(), cancel: true }))
  const centered = { maxWidth: 732.61, contain: 'width', textAlign: 'center' }
  return (
    <view width={1920} height={1080}>
      <CoreDialog title={props.title} bodyH={bodyH()} cancel cancelFocused />
      <view x={L().bodyX} y={L().bodyY}>
        <view x={(L().bodyW - 340.59) / 2} y={13.36} width={340.59} height={340.59} borderRadius={20.03} color="#ffffffff">
          <view x={20.03} y={20.03} width={300.52} height={300.52} src={code() || undefined} />
        </view>
        <text {...centered} fontFamily={roboto()} fontSize={21.704} y={388.5} lineHeight={25.394} maxWidth={L().bodyW} color="#ffffffb3">
          {$L('Scan with your phone')}
        </text>
        <text
          {...centered}
          fontFamily={roboto('regular', props.url || '')}
          fontSize={18.365}
          y={420.07}
          lineHeight={21.487}
          maxWidth={L().bodyW}
          color="#ffffff8a"
        >
          {urlLines().join('\n') || ' '}
        </text>
      </view>
    </view>
  )
}
