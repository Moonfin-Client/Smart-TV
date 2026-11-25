import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { cssShift, fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { glowShadow } from '../../theme.js'
import { perfTier } from '../../tier.js'
import { dp } from './look.js'
import { textWidth } from '../details/measure.js'
import PreviewStage from './PreviewStage.jsx'
import * as settings from '../../../state/settings.js'
import { getStore } from '../../../state/store.js'
import { onHomeRowsShown } from '../../../state/homeRows.js'
import { settingsPick, triedOverrides } from '../previews/scenePick.js'
import { rowOptionsHome } from '../previews/rowOptionsHome.js'
import { lineCount } from '../previews/kit.js'
import { chipRowLayout } from '../previews/chipRow.js'
import { keyed } from '../library/pageKit.js'
import { focusScroll } from '../nav/focusScroll.js'

// The live preview beside the settings list: the scene chips, the stage drawing the
// screen the focused setting changes, and the inspector that spells that setting out with every
// choice a picker offers. When it has focus the chips take Left and Right, focusing one shows its
// scene (onPickScene), and Left off the first or Back hands focus back (onLeaveChips). Up calls
// onChipsUp with the focused chip's { id, x, w }. [bg] is the page's color under the frame, which
// covers the stage's corners, since this renderer has no rounded clip.
const SCENE_LABELS = {
  home: () => $L('Home'),
  details: () => $L('Details Page'),
  player: () => $L('Player'),
  search: () => $L('Search'),
  calendar: () => $L('Calendar'),
  library: () => $L('Library'),
}

const COL_W = 1038.5
const HEADER_H = dp(28)
const FRAME_TOP = HEADER_H + dp(10)
const FRAME_MAX = dp(540)
const INSPECT_GAP = dp(16)
const INSPECT_PAD_Y = dp(14)
const INSPECT_PAD_X = dp(18)
const INSPECT_MIN = dp(96)
const CHIP_FS = dp(12.5)
const CHIP_PAD = dp(12)
const CHIP_GAP = dp(6)
const OPTION_PAD = dp(11)
const BLOCKED = '#ffc107ff'
const NOTE_FS = dp(12.5)
const CHIP_H = 48.36
const CHIP_CLIP = dp(8)
const RADIUS = 23.37
const NONE = '#00000000'
const CHIP_BORDER = { width: 1, color: hex('#ffffff38') }
const CHIP_FOCUS_BORDER = { width: 1, color: hex('#00a4dcb8') }
const OPTION_BORDER = { width: 1, color: hex('#ffffff24') }
const RING = { width: 1.67, color: hex('#ffffff24') }
// The focused chip's glow, and the plain ring the low tier draws instead.
const CHIP_GLOW = glowShadow({ color: '#00a4dc99', x: 0, y: 0, blur: 10.02, spread: 3.34 }).shadow
const CHIP_RING = glowShadow({ color: '#00a4dce6', x: 0, y: 0, blur: 0, spread: 3.34 }).shadow
const FRAME_SHADOW = glowShadow({ color: '#00000080', x: 0, y: 26.71, blur: 66.78, spread: 0 }).shadow

// The first library of one of [types] in the order the server lists them, which is the user's own.
const firstLibrary = (libraries, types) => (libraries || []).find((lib) => types.indexOf(String(lib.CollectionType || '').toLowerCase()) >= 0) || null

export default function LivePreview(props) {
  const store = getStore()
  const [roTick, setRoTick] = createSignal(0)
  const [cur, setCur] = createSignal(0)
  const [active, setActive] = createSignal(false)
  const labelFont = () => uiFont('bold')
  const chipFont = () => uiFont('bold')
  const colH = () => props.colH || 883
  // The chips keep the right of the column and the heading gets what they leave. Chips
  // that still don't fit start at the left and clip on the right, scrolling to show a focused one.
  const chipRow = createMemo(() => {
    const list = (props.scenes || []).map((id) => {
      const label = SCENE_LABELS[id] ? SCENE_LABELS[id]() : id
      return { id, label, w: textWidth(label, CHIP_FS, 'bold') + 2 * CHIP_PAD + 2 }
    })
    return chipRowLayout(list, COL_W, CHIP_GAP)
  })
  const [chipScroll, setChipScroll] = createSignal(0)
  const chips = createMemo(() => chipRow().items.map((c) => ({ ...c, x: chipRow().boxX + c.off - chipScroll() })))
  const chipList = keyed(chips, (c) => c.id)
  // Scrolls the focused chip into view, inside the 8dp of padding the box clips at.
  const showChip = (i) => {
    const row = chipRow()
    const c = row.items[i]
    if (c) setChipScroll(focusScroll(CHIP_CLIP + c.off, c.w, chipScroll(), row.boxW + 2 * CHIP_CLIP, row.max))
  }
  const inspector = createMemo(() => {
    const row = props.row
    if (!row) return null
    const innerW = COL_W - 2 * INSPECT_PAD_X
    let y = INSPECT_PAD_Y
    const out = { status: null, title: row.title || '', titleY: 0, desc: '', descY: 0, options: [], h: 0 }
    if (row.key) {
      const blocked = row.blocked
      out.status = {
        y,
        dot: blocked ? BLOCKED : row.scene ? props.accent : '#ffffff66',
        color: blocked ? BLOCKED : row.scene ? '#ffffffff' : '#ffffff8c',
        text: blocked || (row.scene ? $L('Shows on the {screen} preview').replace('{screen}', SCENE_LABELS[row.scene]()) : $L('Not shown in the preview')),
      }
      y += 33 + dp(8)
    }
    out.titleY = y
    y += 33
    const desc = row.description || row.path || ''
    if (desc) {
      y += dp(4)
      out.desc = desc
      out.descY = y
      y += Math.min(2, lineCount(desc, dp(13.5), 'regular', innerW)) * dp(13.5) * 1.4
    }
    if (row.options && row.options.length > 0 && row.options.length <= 8) {
      y += dp(8)
      let x = 0
      let lineTop = y
      row.options.forEach((option, index) => {
        const isLive = index === props.live
        const isSaved = props.tryingHere && index === row.saved && !isLive
        const label = String(option.label)
        const labelW = textWidth(label, CHIP_FS, 'bold')
        const tagW = isSaved ? dp(6) + textWidth($L('Saved').toUpperCase(), dp(10), 'bold') : 0
        const w = labelW + 2 * OPTION_PAD + 2 + tagW
        if (x > 0 && x + w > innerW) {
          x = 0
          lineTop += dp(4) + CHIP_H
        }
        out.options.push({ k: 'o' + index, label, x, y: lineTop + dp(4), w, live: isLive, saved: isSaved, tagX: OPTION_PAD + 1 + labelW + dp(6) })
        x += w + dp(6)
      })
      y = lineTop + dp(4) + CHIP_H
    }
    out.h = Math.max(INSPECT_MIN, y - INSPECT_PAD_Y) + 2 * INSPECT_PAD_Y
    return out
  })
  const inspectorH = () => (inspector() ? inspector().h : 0)
  const frameW = createMemo(() => {
    const below = inspector() ? inspectorH() + INSPECT_GAP : 0
    const room = colH() - FRAME_TOP - below
    return Math.max(0, Math.floor(Math.min(COL_W, FRAME_MAX, (room * 16) / 9)))
  })
  const frameH = () => (frameW() * 9) / 16
  const frameX = () => (COL_W - frameW()) / 2
  const ins = () => inspector() || { title: '', titleY: 0, desc: '', descY: 0, options: [], status: null }
  const status = () => ins().status || { y: 0, dot: NONE, color: NONE, text: '' }
  // The picker's focused value, as the scene tries it.
  const overrides = createMemo(() => {
    const tried = props.tried
    const key = tried && Object.keys(tried)[0]
    return key ? triedOverrides(props.scene, { key, value: tried[key] }) : null
  })
  const withTried = () => {
    const all = settings.all()
    return overrides() ? { ...all, ...overrides() } : all
  }
  const stagePick = createMemo(() => settingsPick(props.scene, props.row, withTried()))
  // The Row Options and the settings for Home's rows and cards draw Home's own rows, loaded and
  // laid out with the value being tried, with a notice or caption over the frame.
  const rowOptions = createMemo(() => {
    roTick()
    if (props.scene !== 'home') return null
    const row = props.row
    return rowOptionsHome({
      key: row ? row.key : null,
      s: withTried(),
      focusRowId: row ? row.rowId || null : null,
      hasMultipleServers: !!props.multiServer,
      libraries: store.libraries || [],
      onChange: () => setRoTick(roTick() + 1),
    })
  })
  const stageRows = () => (rowOptions() ? rowOptions().rows : null)
  // The notice: text 380dp wide at most, centered in the frame over 70% black.
  const notice = createMemo(() => {
    const text = rowOptions() && rowOptions().notice
    if (!text) return null
    const maxW = Math.min(dp(380), frameW() - 2 * dp(24))
    const lh = NOTE_FS * 1.45
    const h = lineCount(text, NOTE_FS, 'bold', maxW) * lh
    return { text, x: (frameW() - maxW) / 2, y: (frameH() - h) / 2 + cssShift(NOTE_FS), maxW, lh }
  })
  // The caption: a note along the bottom of the frame over 72% black.
  const caption = createMemo(() => {
    const text = rowOptions() && !rowOptions().notice && rowOptions().caption
    if (!text) return null
    const maxW = frameW() - 2 * dp(14)
    const lh = NOTE_FS * 1.4
    const h = 2 * dp(8) + lineCount(text, NOTE_FS, 'regular', maxW) * lh
    return { text, y: frameH() - h, h, ty: dp(8) + cssShift(NOTE_FS), maxW, lh }
  })
  // The music and book styles draw the first music or book library, and everything else the first
  // video library, or else the music one, or else the book one.
  const library = createMemo(() => {
    const libs = store.libraries
    const key = props.row ? props.row.key : null
    const video = firstLibrary(libs, ['movies', 'tvshows'])
    const music = firstLibrary(libs, ['music'])
    const books = firstLibrary(libs, ['books', 'audiobooks'])
    return (key === 'musicLibraryStyle' && music) || (key === 'bookLibraryStyle' && books) || video || music || books
  })
  const options = keyed(() => ins().options, (o) => o.k)
  const focusedChip = () => (active() ? cur() : -1)
  const chipGlow = () => (perfTier() === 'low' ? CHIP_RING : CHIP_GLOW)
  // Home writes its rows as each section loads, and the preview draws every write.
  onCleanup(onHomeRowsShown(() => setRoTick(roTick() + 1)))

  const pick = (i) => {
    setCur(i)
    showChip(i)
    const chip = chips()[i]
    if (chip && props.onPickScene) props.onPickScene(chip.id)
  }
  const leave = () => {
    if (props.onLeaveChips) props.onLeaveChips()
    return true
  }
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      x={props.x || 0}
      y={props.y || 0}
      width={COL_W}
      height={colH()}
      onFocusChanged={(has) => {
        setActive(has)
        if (!has) return
        const at = chips().findIndex((c) => c.id === props.scene)
        setCur(at < 0 ? 0 : at)
        showChip(cur())
      }}
      onLeft={() => {
        if (cur() > 0) pick(cur() - 1)
        else leave()
        return true
      }}
      onRight={() => {
        if (cur() < chips().length - 1) pick(cur() + 1)
        return true
      }}
      onDown={() => true}
      onUp={() => {
        const c = chips()[cur()]
        if (props.onChipsUp) props.onChipsUp(c ? { id: c.id, x: c.x, w: c.w } : null)
        return true
      }}
      onEnter={() => {
        pick(cur())
        return true
      }}
      onBack={leave}
    >
      <view width={chipRow().boxX || 1} height={48} clipping alpha={chipRow().boxX > 0 ? 1 : 0}>
        <view y={16.7} width={13.36} height={13.36} borderRadius={6.68} color={props.accent} />
        <text
          fontFamily={labelFont()}
          fontSize={20.03}
          letterSpacing={2}
          x={26.71}
          y={8.58}
          lineHeight={33}
          color="#ffffff99"
          maxWidth={Math.max(1, chipRow().boxX - 26.71)}
          maxLines={1}
        >
          {$L('Live preview').toUpperCase()}
        </text>
      </view>
      <view x={chipRow().boxX - CHIP_CLIP} y={-0.84 - CHIP_CLIP} width={chipRow().boxW + 2 * CHIP_CLIP} height={CHIP_H + 2 * CHIP_CLIP} clipping>
        <For each={chipList.keys()}>
          {(k) => {
            const c = chipList.item(k)
            return (
              <view x={c().x - chipRow().boxX + CHIP_CLIP} y={CHIP_CLIP} width={c().w} height={CHIP_H}>
                <view width={c().w} height={CHIP_H} borderRadius={24.18} color={NONE} border={CHIP_BORDER} alpha={c().id === props.scene ? 0 : 1} />
                <view width={c().w} height={CHIP_H} borderRadius={24.18} color="#ffffffff" alpha={c().id === props.scene ? 1 : 0} />
                <view width={c().w} height={CHIP_H} borderRadius={24.18} color={NONE} border={CHIP_FOCUS_BORDER} shadow={chipGlow()} alpha={c().i === focusedChip() ? 1 : 0} />
                <text
                  fontFamily={chipFont()}
                  fontSize={20.87}
                  x={c().w / 2}
                  mountX={0.5}
                  y={9.45}
                  lineHeight={33}
                  color={c().id === props.scene ? '#000000ff' : '#ffffffb3'}
                >
                  {c().label}
                </text>
              </view>
            )
          }}
        </For>
      </view>

      <view x={frameX()} y={63.45} width={frameW()} height={frameH()}>
        <PreviewStage
          w={frameW()}
          h={frameH()}
          pick={stagePick()}
          tried={overrides()}
          library={library()}
          homeRows={stageRows()}
          hasLiveTv={props.hasLiveTv}
          radius={RADIUS}
          behind={props.bg || '#101010ff'}
        />
        <view width={frameW()} height={frameH()} borderRadius={RADIUS} color={NONE} shadow={FRAME_SHADOW} />
        <view>
          <Show when={notice()}>
            {(nt) => (
              <view width={frameW()} height={frameH()} borderRadius={RADIUS} color="#000000b3">
                <text
                  fontFamily={fontFor(nt().text, 'bold')}
                  fontSize={20.87}
                  lineHeight={nt().lh}
                  x={nt().x}
                  y={nt().y}
                  maxWidth={nt().maxW}
                  contain="width"
                  textAlign="center"
                  color="#ffffffff"
                >
                  {nt().text}
                </text>
              </view>
            )}
          </Show>
        </view>
        <view>
          <Show when={caption()}>
            {(cp) => (
              <view y={cp().y} width={frameW()} height={cp().h} borderRadius={[0, 0, RADIUS, RADIUS]} color="#000000b8">
                <text fontFamily={fontFor(cp().text)} fontSize={20.87} lineHeight={cp().lh} x={RADIUS} y={cp().ty} maxWidth={cp().maxW} color="#ffffffd9">
                  {cp().text}
                </text>
              </view>
            )}
          </Show>
        </view>
        <view x={-1.67} y={-1.67} width={frameW() + 3.34} height={frameH() + 3.34} borderRadius={25.04} color={NONE} border={RING} />
      </view>

      <view y={FRAME_TOP + frameH() + INSPECT_GAP} width={COL_W} height={inspectorH() || 1} alpha={inspector() ? 1 : 0}>
        <view width={COL_W} height={inspectorH() || 1} borderRadius={30.05} color="#ffffff0f" />
        <view x={30.05} y={status().y} width={978.4} height={33} alpha={ins().status ? 1 : 0}>
          <view y={10.65} width={11.69} height={11.69} borderRadius={5.85} color={status().dot} />
          <text fontFamily={labelFont()} fontSize={20.87} x={25.05} y={1.77} lineHeight={33} color={status().color} maxWidth={950} maxLines={1}>
            {status().text}
          </text>
        </view>
        <text fontFamily={fontFor(ins().title, 'bold')} fontSize={31.72} x={30.05} y={ins().titleY + 2.7} lineHeight={33} color="#ffffffff" maxWidth={978.4} maxLines={1}>
          {ins().title}
        </text>
        <text fontFamily={fontFor(ins().desc)} fontSize={22.54} x={30.05} y={ins().descY + 1.92} lineHeight={31.55} color="#ffffff99" maxWidth={978.4} maxLines={2}>
          {ins().desc}
        </text>
        <view>
          <For each={options.keys()}>
            {(k) => {
              const o = options.item(k)
              return (
                <view x={30.05 + o().x} y={o().y} width={o().w} height={CHIP_H}>
                  <view width={o().w} height={CHIP_H} borderRadius={24.18} color="#ffffff0f" border={OPTION_BORDER} alpha={o().live || o().saved ? 0 : 1} />
                  <view width={o().w} height={CHIP_H} borderRadius={24.18} color="#ffffff0f" border={{ width: 1, color: hex(props.accent) }} alpha={o().saved ? 1 : 0} />
                  <view width={o().w} height={CHIP_H} borderRadius={24.18} color="#ffffffff" alpha={o().live ? 1 : 0} />
                  <text fontFamily={fontFor(o().label, 'bold')} fontSize={20.87} x={19.37} y={9.45} lineHeight={33} color={o().live ? '#000000ff' : '#ffffffff'}>
                    {o().label}
                  </text>
                  <text fontFamily={chipFont()} fontSize={16.7} x={o().tagX} y={9.1} lineHeight={33} color="#ffffffb3" alpha={o().saved ? 1 : 0}>
                    {$L('Saved').toUpperCase()}
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
