import $L from '../../../services/i18n.js'
import { For, createMemo, createSignal, onCleanup } from 'solid-js'
import SubtitleRow from './SubtitleRow.jsx'
import { appear } from './draw.jsx'
import { theme, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { cssShift, fontFor, normalShift, uiFont } from '../../text.js'
import { textWidth } from '../details/measure.js'
import { api as defaultApi } from '../../../services/jellyfinApi.js'
import { mapRemoteSubtitleOptions, remoteSubtitleDownloadError, remoteSubtitleSearchError, searchRemoteSubtitlesIn } from './remoteSubtitleUtils.js'
import { layoutSubtitleSearch, PANEL, revealScroll } from './subtitleSearchLayout.js'

// The Download Subtitles modal, shared by Details and the player: it searches the server's
// subtitle providers (OpenSubtitles) in the given languages, lists the results, and hands the
// picked one to the holder to download. It searches as it mounts, so mount it to open it.
// Props: `variant` ('details' or 'player'), `itemId`, `languages` (from remoteSubtitleUtils'
// subtitleDownloadLanguages), `api` (the item's server, the active one by default).
// The holder implements
//   onRemoteSubtitlePick(result): downloads `result.id` (pollForSubtitleAppearance waits for the
//     track), applies it and closes. It resolves to an error message to show instead, or throws.
//   onSubtitleSearchClose(): Back or Cancel.
const ROWS_MARGIN = 200
const FADE = { duration: 200, easing: 'ease' }
const SLIDE = { duration: 300, easing: 'ease' }

export default function SubtitleSearch(props) {
  // It fades in and rises 30px as it opens.
  const on = appear()
  const [phase, setPhase] = createSignal('searching')
  const [error, setError] = createSignal('')
  const [results, setResults] = createSignal([])
  // The list drops focus each time it's drawn again (searching, the results, a failure), so
  // nothing shows focused until the first Up or Down.
  const [cur, setCur] = createSignal(-1)
  const [scroll, setScroll] = createSignal(0)
  let alive = true
  onCleanup(() => (alive = false))
  const api = props.api || defaultApi
  const variant = () => props.variant || 'details'

  searchRemoteSubtitlesIn(api, props.itemId, props.languages && props.languages.length ? props.languages : ['eng'])
    .then((found) => {
      if (!alive) return
      setResults(mapRemoteSubtitleOptions(found))
      setPhase('')
      setCur(-1)
    })
    .catch((err) => {
      if (!alive) return
      setError(remoteSubtitleSearchError(err))
      setPhase('')
    })

  const statusRows = () => {
    if (phase() === 'searching') return [{ kind: 'status', name: $L('Searching...') }]
    if (phase() === 'downloading') return [{ kind: 'status', name: $L('Downloading subtitle…') }]
    if (error()) return [{ kind: 'status', name: error() }]
    if (!results().length) return [{ kind: 'status', name: $L('No remote subtitles found') }]
    return results().map((r) => ({ kind: 'result', name: r.name || $L('Subtitle'), info: r.info, flags: r.flags }))
  }
  const laid = createMemo(() => {
    const L = layoutSubtitleSearch(variant(), statusRows(), { cancel: $L('Cancel'), footer: $L('Press BACK to close') }, textWidth)
    L.rows.forEach((r) => {
      r.nameFont = fontFor(r.name, 'bold')
      r.infoFont = fontFor(r.info)
    })
    return L
  })
  // Only the rows near the visible band are built.
  const shown = createMemo(() => {
    const top = scroll() - ROWS_MARGIN
    const bottom = scroll() + laid().h + ROWS_MARGIN
    return laid().rows.filter((r) => r.y + r.h > top && r.y < bottom)
  })
  const look = createMemo(() => {
    const t = theme()
    return { fill: t.accentA(0.3), ring: t.focus || '#00a4dcff', glow: t.focusGlow, mark: t.accent, rule: t.os(0.08) }
  })
  const cancelOn = () => Boolean(laid().cancel) && cur() === laid().cancel.idx
  const cancelY = () => (laid().cancel ? laid().cancel.y : 0)

  const pick = async (i) => {
    const result = results()[i]
    if (!result || phase()) return
    setPhase('downloading')
    setError('')
    setCur(-1)
    setScroll(0)
    let err = null
    try {
      err = await props.onRemoteSubtitlePick(result)
    } catch (e) {
      err = remoteSubtitleDownloadError(e)
    }
    if (!alive) return
    setPhase('')
    if (err) setError(err)
  }
  const move = (d) => {
    const n = laid().focusables.length
    const next = cur() < 0 ? 0 : Math.max(0, Math.min(n - 1, cur() + d))
    setCur(next)
    setScroll(revealScroll(scroll(), laid().focusables[next], laid().h, laid().contentH))
    return true
  }
  // The Magic Remote's cursor (app/pointer.js): a row in full view takes focus on hover, one the list
  // would scroll to only on a click, so the list doesn't move under the cursor.
  const pointAt = (i) => {
    const f = laid().focusables[i]
    if (!f || cur() === i || f.y < scroll() || f.y + f.h > scroll() + laid().h) return
    setCur(i)
  }
  const clickAt = (i) => {
    const f = laid().focusables[i]
    if (!f) return false
    setCur(i)
    setScroll(revealScroll(scroll(), f, laid().h, laid().contentH))
    return true
  }
  const close = () => {
    if (props.onSubtitleSearchClose) props.onSubtitleSearchClose()
    return true
  }
  return (
    <view
      ref={props.ref}
      width={1920}
      height={1080}
      alpha={on() ? 1 : 0}
      transition={{ alpha: FADE }}
      onUp={() => move(-1)}
      onDown={() => move(1)}
      onEnter={() => {
        const f = laid().focusables[cur()]
        if (!f) return true
        if (f.kind === 'cancel') return close()
        if (f.kind === 'result') pick(cur())
        return true
      }}
      onBack={close}
      onKeyPress={() => true}
    >
      <view width={1920} height={1080} color="#000000f2" />
      <view x={PANEL.x} y={laid().y + (on() ? 0 : 30)} width={662} height={laid().h} alpha={on() ? 1 : 0} transition={{ y: SLIDE, alpha: SLIDE }}>
        <view width={662} height={laid().h} borderRadius={20} color="#00000000" shadow={{ color: shadowColor('#000000cc'), x: 0, y: 15, blur: 50, spread: 0 }} />
        <view width={662} height={laid().h} borderRadius={20} color="#171717f0" border={{ width: 1, color: hex('#ffffff29') }} />
        <view width={662} height={laid().h} clipping>
          <view y={-scroll()} width={662} height={laid().contentH}>
            <text fontFamily={uiFont('bold')} fontSize={30} x={37} y={laid().titleY + cssShift(30)} lineHeight={33} color="#ffffffff">
              {$L('Download Subtitles')}
            </text>
            <view x={1} y={laid().ruleY} width={660} height={1} color={look().rule} />
            <view>
              <For each={shown()}>{(r) => <SubtitleRow row={r} focused={r.idx === cur()} variant={variant()} look={look()} />}</For>
            </view>
            <view alpha={laid().cancel ? 1 : 0}>
              <view x={1} y={laid().dividerY || 0} width={660} height={1} color={look().rule} />
              <view x={1} y={cancelY()} width={660} height={72} color={look().fill} alpha={cancelOn() ? 1 : 0} />
              <view x={37} y={cancelY() + 21} width={30} height={30} src="icons/d/radio_off.webp" color="#ffffff8c" />
              <text fontFamily={uiFont('bold')} fontSize={24} x={85} y={cancelY() + 22 + normalShift(24)} lineHeight={1} color="#ffffffff">
                {laid().cancel ? laid().cancel.label : ' '}
              </text>
            </view>
            <text
              alpha={laid().footer ? 1 : 0}
              fontFamily={uiFont()}
              fontSize={18}
              x={1}
              y={(laid().footer ? laid().footer.y : 0) + cssShift(18)}
              lineHeight={21}
              maxWidth={660}
              contain="width"
              textAlign="center"
              color="#ffffff6b"
            >
              {laid().footer ? laid().footer.text : ' '}
            </text>
            <view
              width={662}
              height={laid().contentH}
              pointerItems={() => laid().focusables.map((f) => ({ x: 1, y: f.y, w: 660, h: f.h }))}
              onPointerItem={(_, i) => pointAt(i)}
              onPointerItemClick={(_, i) => clickAt(i)}
            />
          </view>
        </view>
      </view>
    </view>
  )
}
