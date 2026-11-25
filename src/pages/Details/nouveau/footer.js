// The details footer as draw lists: the studios as focusable pills, Seerr's chips, facts and
// streaming pieces, then the file, video, audio and subtitle groups, 26px apart. Empty groups are
// left out, and with nothing left it draws nothing.
import $L from '../../../services/i18n.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { buildMediaFacts } from '../../../utils/seerrMediaFacts.js'
import { transcodeReasonLabel } from '../../../utils/directPlayReasons.js'
import { fontFor } from '../../../ui/text.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { fileName, fileSizeLine, trackRows, videoLines } from './nouveauFooterFields'
import { finish, text } from './layout.js'

const GROUP_GAP = 26

// `d`: item, showsSection, mediaSource, audio and subtitle (positions in their lists), seerr,
// play ({status, result}) and the accent. Laid out from (x0, y0) across `width`.
export const layoutFooter = (d, x0, y0, width) => {
  const it = d.item
  const sr = d.seerr || {}
  const pieces = sr.pieces || {}
  const fileSource = d.showsSection('mediaInfo') && it.Type !== 'Book' ? d.mediaSource : null
  const streams = (fileSource && fileSource.MediaStreams) || []
  const video = streams.find((x) => x.Type === 'Video')
  const audio = streams.filter((x) => x.Type === 'Audio')
  const subtitles = streams.filter((x) => x.Type === 'Subtitle')
  const activeAudio = audio[d.audio] ? audio[d.audio].Index : undefined
  const activeSubtitle = d.subtitle >= 0 && subtitles[d.subtitle] ? subtitles[d.subtitle].Index : undefined
  const studios = d.showsSection('studios') ? (it.Studios || []).map((x) => x && x.Name).filter(Boolean) : []
  const showsChips = Boolean(pieces.chips)
  const showsFacts = Boolean(pieces.facts && sr.details)
  const showsStreaming = Boolean(pieces.streaming)
  const o = { rects: [], imgs: [], texts: [] }
  const focusables = []
  if (!studios.length && !showsChips && !showsFacts && !showsStreaming && !fileSource) return { ...finish(o), focusables, h: 0, activeAudio, activeSubtitle }

  let y = y0
  text(o, 'title', x0, y, $L('Details'), 30, 'bold', '#ffffffff', { lh: 33 })
  y += 33 + 24
  let first = true
  const group = (title) => {
    if (!first) y += GROUP_GAP
    first = false
    if (title) {
      text(o, `g-${title}`, x0, y, title, 20, 'bold', '#ffffffd9', { lh: 33 })
      y += 33 + 10
    }
  }

  if (studios.length) {
    group($L('Studios'))
    let px = 0
    let line = 0
    studios.forEach((name, i) => {
      const w = textWidth(name, 15) + 30
      if (px && px + w > width) {
        px = 0
        line++
      }
      const py = y + line * 55
      focusables.push({ k: `studio${i}`, kind: 'studio', row: 0, x: x0 + px, y: py, w, h: 47, studioName: name, label: name, font: fontFor(name) })
      px += w + 8
    })
    y += (line + 1) * 55 - 8
  }

  if (showsChips) {
    group('')
    const label = $L('Genres and Tags')
    focusables.push({ k: 'chips', kind: 'chips', row: 1, x: x0, y, w: textWidth(label, 14) + 40, h: 53, label })
    y += 53
  }

  if (showsFacts) {
    group('')
    const facts = buildMediaFacts(sr.details, sr.mediaType)
    const top = y
    let ly = y + 15
    const box = { k: 'facts', x: x0, y: top, w: 1142, h: 0, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f' }
    o.rects.push(box)
    for (let i = 0, li = 0; i < facts.length; i += 3, li++) {
      if (li) {
        ly += 10
        o.rects.push({ k: `rule${li}`, x: x0 + 21, y: ly, w: 1100, h: 1, color: '#ffffff1a' })
        ly += 11
      }
      facts.slice(i, i + 3).forEach((f, ci) => {
        const fx = x0 + 21 + ci * 378
        if (ci) o.rects.push({ k: `sep${li}-${ci}`, x: fx - 17, y: ly + 18, w: 1, h: 32, color: '#ffffff1a' })
        text(o, `fl${li}-${ci}`, fx, ly, f.label, 14, 'medium', '#ffffff99', { lh: 33 })
        text(o, `fv${li}-${ci}`, fx, ly + 36, f.value, 16, 'bold', '#ffffffff', { lh: 33 })
      })
      ly += 69
    }
    box.h = ly + 15 - top
    focusables.push({ k: 'facts', kind: 'facts', row: 2, x: x0, y: top, w: 1142, h: box.h })
    y = top + box.h
  }

  if (showsStreaming) {
    group('')
    const top = y
    const box = { k: 'streaming', x: x0, y: top, w: 1142, h: 0, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f' }
    o.rects.push(box)
    text(o, 'streamLabel', x0 + 21, y + 15, $L('Streaming on'), 14, 'medium', '#ffffff99', { lh: 33 })
    let px = 21
    let py = y + 15 + 33 + 10
    let rowH = 0
    ;(sr.streamingProviders || []).forEach((p, i) => {
      if (px + 92 > 21 + 1100) {
        px = 21
        py += rowH + 10
        rowH = 0
      }
      o.imgs.push({ k: `sl${i}`, x: x0 + px + 14, y: py, w: 64, h: 64, src: seerrApi.getImageUrl(p.logoPath, 'w92'), r: 12 })
      const names = wrapLines(p.name || '', 14, 'bold', 92)
      names.forEach((n, j) => text(o, `sn${i}-${j}`, x0 + px + (92 - textWidth(n, 14, 'bold')) / 2, py + 70 + j * 16.8, n, 14, 'bold', '#ffffffff', { lh: 16.8 }))
      rowH = Math.max(rowH, 70 + names.length * 16.8)
      px += 92 + 20
    })
    box.h = py + rowH + 10 + 15 - top
    y = top + box.h
  }

  if (fileSource) {
    group($L('File Information'))
    const name = fileName(fileSource)
    const size = fileSizeLine(fileSource)
    if (name) {
      const lines = wrapLines(name, 17, 'medium', width).slice(0, 2)
      lines.forEach((ln, i) => text(o, `file${i}`, x0, y + i * 22.95, ln, 17, 'medium', '#ffffffe6', { lh: 22.95 }))
      y += lines.length * 22.95
    }
    if (size) {
      if (name) y += 7
      text(o, 'fileMeta', x0, y, size, 15, 'regular', '#ffffff80', { lh: 19.5 })
      y += 19.5
    }
    const play = d.play || { status: 'loading' }
    if (play.status === 'loading') {
      y += 12
      text(o, 'pending', x0, y, $L('Checking Direct Play capability...'), 14, 'regular', '#ffffff6b', { lh: 18.2 })
      y += 18.2
    } else if (play.status === 'failed') {
      y += 12
      const failed = $L('Failed to load')
      const fw = textWidth(failed, 14)
      const retry = $L('Retry')
      text(o, 'failed', x0, y + (43 - 18.2) / 2, failed, 14, 'regular', '#ffffff6b', { lh: 18.2 })
      focusables.push({ k: 'retry', kind: 'retry', row: 3, x: x0 + fw + 8, y, w: textWidth(retry, 14, 'bold') + 22, h: 43, label: retry })
      y += 43
    } else if (play.status === 'ready') {
      y += 12
      const direct = play.result.supportsDirectPlay
      o.rects.push({ k: 'dot', x: x0 - 0.5, y: y + 13, w: 7, h: 7, r: 3.5, color: direct ? '#4caf50ff' : '#e5534bff' })
      text(o, 'direct', x0 + 14, y, $L('Direct Play'), 14, 'bold', '#ffffff99', { lh: 33 })
      y += 33
      const reasons = direct ? [] : play.result.transcodeReasons || []
      if (reasons.length) {
        const lines = wrapLines(reasons.map(transcodeReasonLabel).join(' · '), 14, 'regular', width - 14)
        y += 5
        lines.forEach((ln, i) => text(o, `reason${i}`, x0 + 14, y + i * 18.9, ln, 14, 'regular', '#ffffff66', { lh: 18.9 }))
        y += lines.length * 18.9
      }
    }
  }

  const lines = videoLines(video)
  if (lines.length) {
    group($L('Video'))
    lines.forEach((ln, i) => text(o, `video${i}`, x0, y + i * 26.6, ln, 16, 'regular', '#ffffffb8', { lh: 21.6 }))
    y += lines.length * 26.6 - 5
  }

  const tracks = (title, rows) => {
    if (!rows.length) return
    group(title)
    rows.forEach((row, i) => {
      if (i) y += 7
      o.rects.push({ k: `${title}dot${i}`, x: x0 - 0.5, y: y + 6.5, w: 6, h: 6, r: 3, color: row.active ? d.accent : '#ffffff38' })
      text(o, `${title}l${i}`, x0 + 14, y + 4.9, row.label, 16, 'regular', row.active ? '#fffffff0' : '#ffffffa8', { lh: 21.6 })
      y += 33
      if (row.detail) {
        text(o, `${title}d${i}`, x0 + 14, y + 2, row.detail, 14, 'regular', '#ffffff73', { lh: 33 })
        y += 35
      }
    })
  }
  tracks($L('Audio'), audio.length ? trackRows(audio, activeAudio) : [])
  tracks($L('Subtitles'), subtitles.length ? trackRows(subtitles, activeSubtitle, { includeForced: true }) : [])

  return { ...finish(o), focusables, h: y - y0 + 40, activeAudio, activeSubtitle }
}
