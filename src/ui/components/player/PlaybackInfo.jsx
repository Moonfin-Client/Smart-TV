import $L from '../../../services/i18n.js'
import { For, createMemo, createSignal } from 'solid-js'
import { fontFor, uiFont } from '../../text.js'
import { theme, rgba } from '../../theme.js'
import { hex } from '../../color.js'
import { highMs } from '../../tier.js'
import { INFO, infoLayout, infoThumb } from './modalLayouts.js'
import { tx } from '../../fx.js'

// The Playback Information panel: buildPlaybackInfo's sections over a dim scrim. The list holds
// focus, so Up and Down scroll it 200 at a time, OK closes it and Back is the holder's. The holder
// mounts it, calls open(sections), then setSections(sections) once the slower answers come in, and
// hears closePanel(). The renderer sets a line of text a little higher than CSS does (the headings
// excepted), so the text positions carry that back.
const LINE = { header: 27 * 1.17, note: 20 * 1.17, label: 25.7 }
const SHIFT = { header: 0, note: 1.5, label: 1.5 }
const COLOR = { header: '#ffffffff', note: '#ffffff8a', label: '#ffffff8a' }
const BORDER = { width: 1, color: hex('#8ec8f054') }
const EASE = 'cubic-bezier(0.33, 1, 0.68, 1)'

export default function PlaybackInfo(props) {
  const [sections, setSectionsSig] = createSignal([])
  const [scroll, setScroll] = createSignal(0)
  const [scrollMs, setScrollMs] = createSignal(0)
  const [title, setTitle] = createSignal('')
  const [titleFont, setTitleFont] = createSignal(uiFont('bold'))

  // Only the panel fill follows the theme.
  const fill = () => rgba(theme().surface, 0.9)
  const placed = createMemo(() => {
    const { left, right, h } = infoLayout(sections())
    return {
      h,
      left: left.map((tx) => ({
        ...tx,
        lh: LINE[tx.kind],
        y: tx.y + SHIFT[tx.kind],
        color: COLOR[tx.kind],
        font: fontFor(tx.text, tx.kind === 'header' ? 'bold' : 'regular'),
      })),
      right: right.map((v) => ({ ...v, font: fontFor(v.text, v.bold ? 'bold' : 'regular') })),
    }
  })
  const listH = () => Math.min(placed().h, INFO.LIST_MAX)
  const panelH = () => listH() + INFO.CHROME
  // Rounded so the centered panel's border lands on whole pixels.
  const panelY = () => Math.round((1080 - panelH()) / 2)
  const thumb = () => infoThumb(scroll(), listH(), placed().h)

  // Slower tiers jump instead of spending frames redrawing the list.
  const scrollBy = (step) => {
    const max = Math.max(0, placed().h - listH())
    setScrollMs(highMs(120))
    setScroll(Math.max(0, Math.min(max, scroll() + step)))
    return true
  }
  const open = (list) => {
    const heading = $L('Playback Information')
    setTitle(heading)
    setTitleFont(fontFor(heading, 'bold'))
    setScrollMs(0)
    setScroll(0)
    setSectionsSig(list || [])
  }
  const setSections = (list) => {
    setSectionsSig(list || [])
    scrollBy(0)
  }

  return (
    <view
      ref={(n) => {
        n.open = open
        n.setSections = setSections
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onUp={() => scrollBy(-INFO.STEP)}
      onDown={() => scrollBy(INFO.STEP)}
      onLeft={() => true}
      onRight={() => true}
      onEnter={() => {
        if (props.closePanel) props.closePanel()
        return true
      }}
    >
      <view width={1920} height={1080} color="#0000008a" />
      <view x={493} y={panelY()} width={935} height={panelH()}>
        <view width={935} height={panelH()} borderRadius={33} color={fill()} border={BORDER} />
        <text fontFamily={titleFont()} fontSize={33} x={41} y={37} lineHeight={38.61} maxWidth={853} maxLines={1} color="#ffffffff">
          {title()}
        </text>
        <view x={1} y={92.61} width={933} height={1} color="#ffffff14" />
        <view x={1} y={106.61} width={933} height={listH()} clipping>
          <view transition={tx({ y: { duration: scrollMs(), easing: EASE } })} y={-scroll()} width={933} height={Math.max(listH(), placed().h)}>
            <view>
              <For each={placed().left}>
                {(tx) => (
                  <text x={27} y={tx.y} fontFamily={tx.font} fontSize={tx.size} lineHeight={tx.lh} maxWidth={879} color={tx.color}>
                    {tx.text}
                  </text>
                )}
              </For>
            </view>
            <view>
              <For each={placed().right}>
                {(v) => (
                  <text
                    x={v.x}
                    y={v.y + 1.5}
                    fontFamily={v.font}
                    fontSize={22}
                    lineHeight={25.7}
                    maxWidth={v.w}
                    contain="width"
                    textAlign="right"
                    color="#ffffffff"
                  >
                    {v.text}
                  </text>
                )}
              </For>
            </view>
          </view>
        </view>
        <view
          alpha={thumb().h > 0 ? 1 : 0}
          x={921}
          transition={tx({ y: { duration: scrollMs(), easing: EASE } })}
          y={106.61 + thumb().y}
          width={5}
          height={Math.max(1, thumb().h)}
          borderRadius={2.5}
          color="#ffffff4d"
        />
      </view>
    </view>
  )
}
