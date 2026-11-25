import $L from '../../../services/i18n.js'
import { For, createMemo, createSelector, createSignal, onCleanup } from 'solid-js'
import LoopMarquee from '../home/LoopMarquee.jsx'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import { getImageUrl } from '../../../utils/helpers.js'
import { formatPlaybackDuration } from '../../../utils/playbackTimeLabels.js'
import { fontFor, uiFont } from '../../text.js'
import { theme, glowShadow, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { BOX, CHAPTER, chapterCards, rowScroll, rowWidth } from './modalLayouts.js'
import { tx } from '../../fx.js'

const ROW_H = CHAPTER.TOP + CHAPTER.H + CHAPTER.BOTTOM
const BOX_H = 1 + BOX.LIST_Y + ROW_H + BOX.FOOT_GAP + BOX.FOOT_H + BOX.PAD + 1
const GLOW = glowShadow({ color: '#00a4dc80', x: 0, y: 6, blur: 20, spread: 0 }).shadow
const SHADOW = { color: shadowColor('#000000cc'), x: 0, y: 15, blur: 50, spread: 0 }
const PANEL_EDGE = { width: 1, color: hex('#ffffff29') }
const COVER = { resizeMode: { type: 'cover' } }
const FADE = { duration: 200, easing: 'ease' }
// Cards further than this past either edge of the row aren't built.
const MARGIN = 600

// The Chapters modal: a wide track dialog with the chapters as a row of cards, each with its still,
// its name scrolling while focused and its start time. It opens on the chapter playing, and Left
// and Right move along the row. The holder mounts it, calls open({ chapters, at, item }) with
// playback.fetchItemChapters' list and the time playing in seconds, focuses it and hears
// onChapter(ticks). Back is the holder's.
// shortcut: the current chapter is the one playing at open and doesn't follow playback while the
// list is up. Track the time if that ever matters.
export default function ChapterModal(props) {
  const [cards, setCards] = createSignal([])
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [on, setOn] = createSignal(false)
  const [title, setTitle] = createSignal('')
  const [footer, setFooter] = createSignal('')
  const [titleFont, setTitleFont] = createSignal(uiFont('bold'))
  const [footFont, setFootFont] = createSignal(uiFont())
  const timeFont = uiFont('bold')
  let timer = null
  onCleanup(() => clearTimeout(timer))

  // Only the focus ring follows the theme. The current chapter stays the default blue.
  const focusColor = () => hex(theme().focus)
  const boxY = Math.round((1080 - BOX_H) / 2)
  const isCur = createSelector(cur)
  const contentW = () => rowWidth(cards().length, CHAPTER.PAD_X, CHAPTER.W, CHAPTER.GAP)
  const shown = createMemo(() => {
    const left = scroll() - MARGIN
    const right = scroll() + CHAPTER.BOX_W + MARGIN
    return cards().filter((c) => c.x + CHAPTER.W > left && c.x < right)
  })

  const move = (to) => {
    const card = cards()[to]
    if (!card) return true
    setCur(to)
    setScroll(rowScroll(scroll(), card.x, CHAPTER.W, CHAPTER.BOX_W, contentW()))
    return true
  }
  // Focus starts on the playing chapter, else the first, and the dialog fades and slides in.
  const open = ({ chapters, at, item }) => {
    const heading = $L('Chapters')
    const foot = $L('Press BACK to close')
    setTitle(heading)
    setFooter(foot)
    setTitleFont(fontFor(heading, 'bold'))
    setFootFont(fontFor(foot))
    const server = (item && item._serverUrl) || getServerUrl()
    const image = (c) => (c.imageTag && getImageUrl(server, item && item.Id, `Chapter/${c.index}`, { maxWidth: 400, tag: c.imageTag })) || ''
    const list = chapterCards(chapters || [], at || 0, image).map((c) => ({
      ...c,
      time: formatPlaybackDuration(c.start),
      nameFont: fontFor(c.name, 'bold'),
      bg: c.current ? '#00a4dc40' : '#ffffff14',
      border: { width: 1, color: hex(c.current ? '#00a4dc99' : '#ffffff26') },
    }))
    setCards(list)
    const current = list.find((c) => c.current)
    setScroll(0)
    move(current ? current.i : 0)
    setOn(false)
    clearTimeout(timer)
    timer = setTimeout(() => setOn(true), 16)
  }

  return (
    <view
      ref={(n) => {
        n.open = open
        if (props.ref) props.ref(n)
      }}
      width={1920}
      pointerModal
      height={1080}
      transition={tx({ alpha: { duration: on() ? 200 : 0, easing: 'ease' } })}
      alpha={on() ? 1 : 0}
      onLeft={() => move(cur() - 1)}
      onRight={() => move(cur() + 1)}
      onUp={() => true}
      onDown={() => true}
      onEnter={() => {
        const card = cards()[cur()]
        if (card && props.onChapter) props.onChapter(card.ticks)
        return true
      }}
    >
      <view width={1920} height={1080} color="#000000f2" />
      <view
        x={209}
        transition={tx({ y: { duration: on() ? 300 : 0, easing: 'ease' }, alpha: { duration: on() ? 300 : 0, easing: 'ease' } })}
        y={boxY + (on() ? 0 : 30)}
        alpha={on() ? 1 : 0}
        width={1502}
        height={459}
      >
        <view width={1502} height={459} borderRadius={20} color="#00000000" shadow={SHADOW} />
        <view width={1502} height={459} borderRadius={20} color="#171717f0" border={PANEL_EDGE} />
        <text fontFamily={titleFont()} fontSize={30} x={37} y={33.92} maxWidth={1428} lineHeight={33} color="#ffffffff">
          {title() || ' '}
        </text>
        <view x={1} y={82} width={1500} height={1} color="#ffffff14" />
        <view x={1} y={101} width={1500} height={256} clipping>
          <view x={-scroll()} width={Math.max(1500, contentW())} height={256}>
            <For each={shown()}>
              {(c) => {
                const focused = () => isCur(c.i)
                return (
                  <view
                    x={c.x}
                    y={12}
                    width={280}
                    height={228}
                    transition={{ scale: FADE }}
                    scale={focused() ? 1.05 : 1}
                    // The strip scrolls to its focused chapter, so the Magic Remote's cursor rings a
                    // chapter and a click picks it (app/pointer.js).
                    pointerRing={10}
                    onPointerClick={() => {
                      setCur(c.i)
                      return true
                    }}
                  >
                    <view width={280} height={228} borderRadius={10} color="#00000000" shadow={GLOW} alpha={focused() ? 1 : 0} />
                    <view width={280} height={228} borderRadius={10} color="#161616ff" alpha={focused() ? 1 : 0} />
                    <view width={280} height={228} borderRadius={10} color={c.bg} border={c.border} />
                    <view x={1} y={1} width={278} height={158} borderRadius={[9, 9, 0, 0]} color="#ffffff0f" />
                    <view
                      alpha={c.image ? 1 : 0}
                      x={1}
                      y={1}
                      width={278}
                      height={158}
                      borderRadius={[9, 9, 0, 0]}
                      src={c.image}
                      textureOptions={COVER}
                    />
                    <view alpha={c.image ? 0 : 1} x={120} y={60} width={40} height={40} src="icons/video_library.webp" color="#ffffff40" />
                    <LoopMarquee x={13} y={171} text={c.name} font={c.nameFont} weight="bold" size={20} lh={24} ink="#ffffffff" width={254} active={focused()} />
                    <text fontFamily={timeFont} fontSize={17} x={13} y={196} color="#00a4dcff">
                      {c.time}
                    </text>
                    <view
                      width={280}
                      height={228}
                      borderRadius={10}
                      color="#00000000"
                      border={{ width: 1, color: focusColor() }}
                      transition={{ alpha: FADE }}
                      alpha={focused() ? 1 : 0}
                    />
                  </view>
                )
              }}
            </For>
          </view>
        </view>
        <text fontFamily={footFont()} fontSize={18} x={751} y={383.45} mountX={0.5} color="#ffffff6b">
          {footer() || ' '}
        </text>
      </view>
    </view>
  )
}
