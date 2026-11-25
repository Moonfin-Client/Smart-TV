import { For, createMemo, createSelector, createSignal } from 'solid-js'
import { fontFor, uiFont } from '../../text.js'
import { tier } from '../../tier.js'
import { hex } from '../../color.js'
import { isGameLibrary } from '../../../utils/gameLibrary.js'
import { menuHold } from '../modals/menuHold.js'

// Home's Library Buttons row: each library as a frosted square with its type's icon and its name,
// filled with the accent and grown a little on focus. The row owns Left, Right and Enter like the
// other rows, and calls the same page methods with `{ raw: library }` as the card. Holding OK opens
// the library's menu where it has one (an admin's Change Artwork), and a short press opens it as OK
// lets go. Props as MediaRow's.

const ICON_BY_COLLECTION_TYPE = {
  movies: 'movie',
  tvshows: 'tv',
  music: 'music_note',
  musicvideos: 'music_note',
  books: 'bookmark',
  audiobooks: 'volume_up',
  homevideos: 'image',
  photos: 'image',
  boxsets: 'folder',
  livetv: 'live_tv',
  playlists: 'list',
  folders: 'folder_open',
}

const iconFor = (lib) => {
  if (isGameLibrary(lib.Id, lib.CollectionType, lib.Name)) return 'icons/home_extension.webp'
  return `icons/home_${ICON_BY_COLLECTION_TYPE[String(lib.CollectionType || '').toLowerCase()] || 'folder'}.webp`
}

const SIZE = 180
const GAP = 24
// The oldest engines, which lack backdrop-filter, get the opaque fallback tint.
const FILL = tier.legacy ? '#1e1e28d1' : '#1e1e288c'
const EDGE_ON = { width: 3, color: hex('#ffffffff') }
const EDGE_OFF = { width: 3, color: hex('#ffffff29') }
const titleFont = () => uiFont('bold')

export default function LibraryButtonRow(props) {
  const [cur, setCur] = createSignal(Math.max(0, props.startIndex || 0))
  const [focused, setFocused] = createSignal(false)
  const isCur = createSelector(cur)
  const L = () => props.look
  const buttons = createMemo(() =>
    (props.row.items || []).map((lib, i) => ({ k: `${lib.Id}-${i}`, idx: i, x: i * (SIZE + GAP), icon: iconFor(lib), name: lib.Name || '', font: fontFor(lib.Name || '', 'bold'), raw: lib })),
  )
  const scroll = () => {
    const max = Math.max(0, L().pad * 2 + buttons().length * (SIZE + GAP) - GAP - L().viewW)
    return Math.min(cur() * (SIZE + GAP), max)
  }
  const notify = () => {
    const b = buttons()[cur()]
    if (b && props.onRowFocus) props.onRowFocus({ raw: b.raw }, props.row.key, cur())
  }
  const select = () => {
    const b = buttons()[cur()]
    if (b && props.onRowSelect) props.onRowSelect({ raw: b.raw }, props.row.key, cur())
  }
  const hold = menuHold(() => (buttons()[cur()] || {}).raw || null, select)
  const move = (to) => {
    if (to === cur() || to < 0 || to >= buttons().length) return
    setCur(to)
    if (props.onRowCur) props.onRowCur(props.row.key, to)
    notify()
  }
  return (
    <view
      ref={(n) => {
        n.focusIndex = (i) => setCur(Math.max(0, Math.min(i, buttons().length - 1)))
        n.cur = cur
        if (props.ref) props.ref(n)
      }}
      y={props.y || 0}
      width={1920}
      height={props.box.h}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) notify()
      }}
      onLeft={() => {
        if (cur() > 0) move(cur() - 1)
        else if (props.leftNav) return false
        else move(buttons().length - 1)
        return true
      }}
      onRight={() => {
        move(cur() < buttons().length - 1 ? cur() + 1 : 0)
        return true
      }}
      onCaptureEnter={hold.down}
      onCaptureEnterRelease={hold.up}
      onMenu={hold.menu}
      onEnter={() => {
        select()
        return true
      }}
    >
      <text x={L().inset} y={props.box.titleY + 2.5} fontFamily={titleFont()} fontSize={28} lineHeight={33} color={L().onSurface}>
        {props.row.title || ''}
      </text>
      <view x={L().clipX} y={props.box.scrollerY} width={L().viewW} height={220} clipping>
        <view y={20} x={L().pad - scroll()} width={L().pad * 2 + buttons().length * (SIZE + GAP) + 1920} height={200} transition={{ x: { duration: 220, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' } }}>
          <For each={buttons()}>
            {(b) => {
              const on = () => isCur(b.idx) && focused()
              return (
                <view x={b.x} width={SIZE} height={SIZE} pivot={0.5} scale={on() ? 1.05 : 1} transition={{ scale: { duration: 150, easing: 'ease' } }}>
                  <view width={SIZE} height={SIZE} borderRadius={12} color={on() ? '#00a4dcff' : FILL} border={on() ? EDGE_ON : EDGE_OFF} />
                  <view x={3} y={3} width={174} height={61} borderRadius={[9, 9, 0, 0]} colorTop="#ffffff14" colorBottom="#ffffff00" />
                  <view x={58} y={33.5} width={64} height={64} src={b.icon} color={on() ? '#ffffffff' : '#ffffffb3'} />
                  <text
                    x={19}
                    y={115.5}
                    fontFamily={b.font}
                    fontSize={20}
                    lineHeight={33}
                    maxWidth={142}
                    maxLines={1}
                    contain="width"
                    textAlign="center"
                    color="#ffffffff"
                  >
                    {b.name}
                  </text>
                </view>
              )
            }}
          </For>
        </view>
      </view>
    </view>
  )
}
