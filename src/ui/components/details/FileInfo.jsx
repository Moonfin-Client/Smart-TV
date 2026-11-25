import $L from '../../../services/i18n.js'
import { For, createEffect, createMemo, createSignal, on } from 'solid-js'
import { cssShift, fontFor } from '../../text.js'
import { hex } from '../../color.js'
import { textWidth, wrapLines } from './measure.js'
import { byKey } from './keyed.js'
import { api } from '../../../services/jellyfinApi.js'
import { buildDirectPlayReasonItems } from '../../../utils/directPlayReasons.js'
import { localeDate } from '../../../utils/dateFormat.js'
import { parseServerDate } from '../../../utils/serverDate.js'
import { all } from '../../../state/settings.js'
import { fetchDetailPlaybackInfo } from '../../../pages/Details/detailPlaybackInfo.js'
import { bookFileName, bookFormatLine, fileName, fileSizeLine, videoLines } from '../../../pages/Details/nouveau/nouveauFooterFields.js'

// Modern's Details tab: the file's name, size and date added, its video line, its audio and subtitle
// tracks with the picked one underlined (two of each until Show All), and whether it direct plays
// here, with the reasons when it doesn't. Every row takes focus, so the remote can scroll through it.
//
// Props: `info` ({item, mediaSource, audio, subtitle, w, showTitle}), `tokens`, `x`, `y`, `alpha`.
// Up off the first row calls onCellsEdge('up'), and each move onCellFocus({y, h}). Its node has
// setCur(i) and entry().
const W = 1100
const COLLAPSED = 2
const GONE = { k: '', x: 0, y: 0, w: 0, h: 0, r: 0, text: '', size: 20, font: 'roboto', color: '#00000000', lh: 33, border: { w: 0, color: '#00000000' } }
const NO_LAID = { boxes: [], bars: [], lines: [], rows: [], h: 0, spinner: null }
const SPINNER_EDGE = hex('#ffffff33')

const trackText = (s, forced) => {
  const title = s.DisplayTitle || String(s.Codec || '').toUpperCase()
  const language = s.Language ? String(s.Language).toUpperCase() : $L('Unknown')
  const flags = (s.IsDefault === true ? ` [${$L('Default')}]` : '') + (forced && s.IsForced === true ? ` [${$L('Forced')}]` : '')
  return `${title} (${language})${flags}`
}

export default function FileInfo(props) {
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const [open, setOpen] = createSignal({ audio: false, subtitle: false })
  // The answer sits outside the signal, which only tells the layout to read it again.
  const [playStatus, setPlayStatus] = createSignal('loading')
  let play = null
  let key = ''
  const t = () => props.tokens || { accent: '#0a84ffff', focus: '#00a4dcff' }

  // The rows, laid out top to bottom: boxes to draw, text lines and the focusable rows.
  const laid = createMemo(() => {
    const inf = props.info
    const status = playStatus()
    const opened = open()
    const out = { boxes: [], bars: [], lines: [], rows: [], h: 0, spinner: null }
    if (!inf || !inf.item) return NO_LAID
    const it = inf.item
    const ms = inf.mediaSource
    const streams = (ms && ms.MediaStreams) || []
    const video = streams.find((s) => s.Type === 'Video')
    const audio = streams.filter((s) => s.Type === 'Audio')
    const subs = streams.filter((s) => s.Type === 'Subtitle')
    const activeAudio = audio[inf.audio] && audio[inf.audio].Index
    const activeSub = inf.subtitle >= 0 && subs[inf.subtitle] ? subs[inf.subtitle].Index : undefined
    const book = it.Type === 'Book' && !ms
    const name = book ? bookFileName(it) : fileName(ms)
    const sizeLine = book ? bookFormatLine(it) : fileSizeLine(ms)
    const date = parseServerDate(it.DateCreated)
    const added = date ? localeDate(date, { year: 'numeric', month: 'short', day: 'numeric' }) : null
    const accent = t().accent
    const line = (k, x, y, text, size, weight, color, extra) =>
      out.lines.push({ k, x, y: y + cssShift(size), text, size, font: fontFor(text, weight), color, lh: 33, italic: false, ...extra })
    let y = 0
    // Spotlight's panel already says what this is, so it hands showTitle: false.
    if (inf.showTitle !== false) {
      line('title', 0, 0, $L('File Information'), 23, 'bold', '#ffffffff')
      y = 33 + 17
    }
    const cardTop = y
    let cy = cardTop + 18
    if (name) {
      // A name has no spaces to break at, so it breaks wherever the line runs out.
      let rest = String(name)
      while (rest.length) {
        let n = rest.length
        while (n > 1 && textWidth(rest.slice(0, n), 23, 'bold') > W - 36) n--
        line(`fn${cy}`, 18, cy, rest.slice(0, n), 23, 'bold', '#ffffffff')
        rest = rest.slice(n)
        cy += 33
      }
      cy += 6
    }
    if (sizeLine) {
      line('size', 18, cy, sizeLine, 17, 'regular', '#ffffffb3')
      cy += 33
    }
    if (added) {
      line('added', 18, cy, $L('Date Added: {date}').replace('{date}', added), 17, 'regular', '#ffffffb3')
      cy += 33
    }
    const cardH = cy + 18 - cardTop
    out.boxes.push({ k: 'card', x: 0, y: cardTop, w: W, h: cardH, r: 12, color: '#ffffff0a', border: { w: 1, color: '#ffffff1a' } })
    out.rows.push({ id: 'card', y: cardTop, h: cardH, r: 12 })
    y = cardTop + cardH + 20
    let lastRow = false
    const infoRow = (id, label, values) => {
      if (lastRow) y += 11
      const top = y
      line(`${id}l`, 0, top + 4, label, 20, 'bold', '#ffffff8a', { lh: 26 })
      let vy = top + 4
      values.forEach((v, i) => {
        const wrapped = v.track ? [v.text] : wrapLines(v.text, 20, 'regular', W - 130)
        wrapped.forEach((ln, j) => {
          line(`${id}v${i}-${j}`, 130, vy, ln, 20, v.active ? 'bold' : 'regular', v.active ? '#ffffffff' : v.track ? '#ffffffb3' : '#ffffffe6', { lh: 26 })
          if (v.active) out.bars.push({ k: `${id}u${i}`, x: 130, y: vy + 24, w: textWidth(ln, 20, 'bold'), h: 2, color: accent })
          vy += 26
        })
      })
      const h = Math.max(26, vy - top - 4) + 8
      out.rows.push({ id, y: top, h, r: 8 })
      y = top + h
      lastRow = true
    }
    const vl = videoLines(video)
    if (vl.length) infoRow('video', $L('Video'), [{ text: vl.join('  •  ') }])
    const trackRow = (id, label, list, active, forced, more) => {
      if (!list.length) return
      const shown = opened[id] ? list : list.slice(0, COLLAPSED)
      infoRow(id, label, shown.map((s) => ({ text: trackText(s, forced), track: true, active: s.Index === active })))
      if (list.length > COLLAPSED) {
        const label2 = opened[id] ? $L('Show Less') : more.replace('{count}', list.length)
        const top = y + 2
        const w = 1 + 15 + textWidth(label2, 17, 'bold') + 15 + 1
        line(`${id}m`, 146, top + 6 - 2, label2, 17, 'bold', accent)
        out.rows.push({ id: `${id}More`, y: top, h: 6 + 29 + 6, x: 130, w, r: 9, toggle: id })
        y = top + 41
        lastRow = false
      }
    }
    trackRow('audio', $L('Audio'), audio, activeAudio, false, $L('Show All ({count}) Audio Tracks'))
    trackRow('subtitle', $L('Subtitles'), subs, activeSub, true, $L('Show All ({count}) Subtitle Tracks'))
    if (!book) {
      const p = { status, ...(play || {}) }
      y += 17
      if (p.status === 'loading') {
        out.spinner = { x: 0, y: y + 8.5 }
        line('checking', 28, y, $L('Checking Direct Play capability...'), 17, 'regular', '#ffffff8a')
        y += 33
      } else if (p.status === 'ready') {
        const top = y
        const direct = p.result.supportsDirectPlay
        const label = $L('Direct Play Capability:')
        line('cap', 0, top + 4, label, 20, 'bold', '#ffffff8a')
        line('capv', textWidth(label, 20, 'bold') + 6, top + 4, direct ? $L('Yes') : $L('No'), 20, 'bold', direct ? '#2e7d32ff' : '#d32f2fff')
        let ry = top + 4 + 33
        if (p.reasons.length) {
          ry += 9
          p.reasons.forEach((r, i) => {
            ry += 4
            wrapLines(`• ${r.description}`, 17, 'regular', W - 17).forEach((ln, j) => {
              line(`rs${i}-${j}`, 17, ry, ln, 17, 'regular', '#ffffffb3')
              ry += 33
            })
            if (r.hint) {
              ry += 3
              out.lines.push({ k: `rh${i}`, x: 34, y: ry, text: r.hint, italic: true, size: 16, font: 'roboto-web', color: accent, lh: 33 })
              ry += 33
            }
          })
        }
        const h = ry - top + 4
        out.rows.push({ id: 'direct', y: top, h, r: 8 })
        y = top + h
      } else if (p.status === 'failed') {
        const label = $L('Direct Play Capability:')
        let x = textWidth(label, 20, 'bold') + 6
        line('cap', 0, y, label, 20, 'bold', '#ffffff8a')
        line('capf', x, y, $L('Failed to load'), 20, 'regular', '#ffffffb3')
        x += textWidth($L('Failed to load'), 20) + 12
        const w = 2 + 30 + textWidth($L('Retry'), 17, 'bold')
        line('retry', x + 16, y + 2, $L('Retry'), 17, 'bold', accent)
        out.rows.push({ id: 'retry', y: y - 4, h: 41, x, w, r: 9, retry: true })
        y += 33
      }
    }
    out.h = y
    return out
  })
  const boxes = byKey(() => laid().boxes, GONE)
  const bars = byKey(() => laid().bars, GONE)
  const lines = byKey(() => laid().lines, GONE)
  const focusRow = () => (focused() ? laid().rows[cur()] || null : null)
  const ring = () => {
    const r = focusRow()
    return r && (r.toggle || r.retry) ? r : null
  }
  const fill = () => {
    const r = focusRow()
    return r && !r.toggle && !r.retry ? r : null
  }

  const check = async () => {
    const inf = props.info
    const it = inf.item
    const ms = inf.mediaSource
    if (!ms) return
    const streams = ms.MediaStreams || []
    const audio = streams.filter((s) => s.Type === 'Audio')
    const subs = streams.filter((s) => s.Type === 'Subtitle')
    const activeAudio = audio[inf.audio] && audio[inf.audio].Index
    const activeSub = inf.subtitle >= 0 && subs[inf.subtitle] ? subs[inf.subtitle].Index : undefined
    const mine = key
    play = null
    setPlayStatus('loading')
    const s = all()
    try {
      const result = await fetchDetailPlaybackInfo(api, {
        itemId: it.Id,
        serverType: it._serverType,
        mediaSourceId: ms.Id,
        audioStreamIndex: activeAudio,
        subtitleStreamIndex: activeSub,
        maxBitrate: s.maxBitrate,
      })
      if (mine !== key) return
      if (!result) return setPlayStatus('empty')
      const src = result.source || {}
      const reasons = result.supportsDirectPlay
        ? []
        : buildDirectPlayReasonItems({
            serverReasons: result.transcodeReasons,
            mediaSource: {
              Container: src.Container != null ? src.Container : ms.Container,
              Bitrate: src.Bitrate != null ? src.Bitrate : ms.Bitrate,
              MediaStreams: src.MediaStreams && src.MediaStreams.length ? src.MediaStreams : ms.MediaStreams,
            },
            deviceProfile: result.deviceProfile,
            settings: s,
            audioStreamIndex: activeAudio,
            subtitleStreamIndex: activeSub,
            maxStreamingBitrate: result.maxStreamingBitrate,
          })
      play = { result, reasons }
      setPlayStatus('ready')
    } catch (e) {
      if (mine === key) setPlayStatus('failed')
    }
  }
  createEffect(
    on(
      () => props.info,
      (v, old) => {
        const next = v && v.item ? `${v.item.Id}|${v.mediaSource && v.mediaSource.Id}|${v.audio}|${v.subtitle}` : ''
        if (next && next !== key) {
          key = next
          check()
        }
        if (!old || !v || (old.item && v.item && old.item.Id !== v.item.Id)) setOpen({ audio: false, subtitle: false })
      },
    ),
  )
  const notify = () => {
    const r = laid().rows[cur()]
    if (r && props.onCellFocus) props.onCellFocus({ y: r.y, h: r.h, idx: cur(), kind: 'info' })
  }

  return (
    <view
      ref={(n) => {
        n.entry = () => 0
        n.setCur = (i) => {
          setCur(i)
          notify()
        }
        n.resetCur = () => setCur(0)
        n.contentHeight = () => laid().h
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      alpha={props.alpha == null ? 1 : props.alpha}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) notify()
      }}
      onUp={() => {
        if (cur() > 0) {
          setCur(cur() - 1)
          notify()
        } else if (props.onCellsEdge) props.onCellsEdge('up')
        return true
      }}
      onDown={() => {
        if (cur() < laid().rows.length - 1) {
          setCur(cur() + 1)
          notify()
        }
        return true
      }}
      onEnter={() => {
        const r = laid().rows[cur()]
        if (!r) return true
        if (r.toggle) setOpen({ ...open(), [r.toggle]: !open()[r.toggle] })
        else if (r.retry) check()
        return true
      }}
    >
      <view alpha={fill() ? 1 : 0} y={fill() ? fill().y : 0} width={W} height={fill() ? fill().h : 0} borderRadius={fill() ? fill().r : 8} color="#ffffff1f" />
      <view>
        <For each={boxes.keys()}>
          {(k) => (
            <view
              x={boxes.at(k).x}
              y={boxes.at(k).y}
              width={boxes.at(k).w}
              height={boxes.at(k).h}
              borderRadius={boxes.at(k).r}
              color={boxes.at(k).color}
              border={{ width: boxes.at(k).border.w, color: hex(boxes.at(k).border.color) }}
            />
          )}
        </For>
      </view>
      <view>
        <For each={bars.keys()}>
          {(k) => <view x={bars.at(k).x} y={bars.at(k).y} width={bars.at(k).w} height={2} color={bars.at(k).color} />}
        </For>
      </view>
      <view
        alpha={ring() ? 1 : 0}
        x={ring() ? ring().x : 0}
        y={ring() ? ring().y : 0}
        width={ring() ? ring().w : 0}
        height={ring() ? ring().h : 0}
        borderRadius={9}
        color="#00000001"
        border={{ width: 1, color: hex(t().focus) }}
      />
      <view>
        <For each={lines.keys()}>
          {(k) => (
            <text
              x={lines.at(k).x}
              y={lines.at(k).y}
              fontFamily={lines.at(k).font}
              fontStyle={lines.at(k).italic ? 'italic' : 'normal'}
              fontSize={lines.at(k).size}
              lineHeight={lines.at(k).lh}
              color={lines.at(k).color}
            >
              {lines.at(k).text}
            </text>
          )}
        </For>
      </view>
      <view
        alpha={laid().spinner ? 1 : 0}
        x={laid().spinner ? laid().spinner.x : 0}
        y={laid().spinner ? laid().spinner.y : 0}
        width={16}
        height={16}
        borderRadius={8}
        color="#00000001"
        border={{ width: 3, color: SPINNER_EDGE }}
      />
    </view>
  )
}
