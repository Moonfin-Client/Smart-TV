// Where the player overlays put things at 1080p, worked out the way CSS would flow them, so the
// components only read positions.
import $L from '../../../services/i18n.js'
import { fontFor } from '../../text.js'
import { watchedPercent } from '../../../utils/episodeBrowser.js'
import { COMPACT_PILL_H, lineCount, textWidth } from './look.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// The scroll when focus lands on something: nothing while it's fully shown, else centered.
export const centerIfNeeded = (scroll, top, h, viewH, scrollH) => {
  if (top >= scroll && top + h <= scroll + viewH) return scroll
  return clamp(top + h / 2 - viewH / 2, 0, Math.max(0, scrollH - viewH))
}

// The least scroll that shows the row, and 24 more.
export const keepInView = (scroll, top, h, viewH, scrollH) => {
  let s = scroll
  if (top < s) s -= s - top + 24
  else if (top + h > s + viewH) s += top + h - (s + viewH) + 24
  return clamp(s, 0, Math.max(0, scrollH - viewH))
}

export const TRACK = { PAD: 30, MAX: 864, TITLE_W: 588 }
// The dialog's text sits in 33 tall line boxes it inherits, and a row is as tall as its 30 indicator
// or its name and detail lines (28 and 24), with 21 above and below.
const BOX = 33

// Rows are { id, label, detail, selected } or { divider: true }. Positions are from the top of the
// content box, under the 30 of padding. A divider has no gap above it and 8 below.
export const trackLayout = (title, rows, footers, details = []) => {
  const titleH = Math.max(1, lineCount(title, 30, 'bold', TRACK.TITLE_W)) * BOX
  let y = titleH + 18 + 1 + 18
  // LiveRecordingDialog's details between the rule and the rows: 21px lines 31.5 apart and 18 below.
  const lines = details.map((d, i) => {
    const it = { ...d, key: `det${i}`, y, h: Math.max(1, lineCount(d.text, 21, 'regular', TRACK.TITLE_W)) * 31.5 }
    y += it.h
    return it
  })
  if (lines.length) y += 18
  const placed = rows.map((r, i) => {
    if (r.divider) {
      const it = { ...r, i, key: `div${i}`, y, h: 1 }
      y += 9
      return it
    }
    const h = r.detail ? 94 : 72
    const it = { ...r, i, key: `row${r.id}`, y, h }
    y += h
    return it
  })
  // Paragraphs: 20 above each (collapsing with the 18 below the one before), 18 below the last.
  const foot = footers.map((text, i) => {
    y += 20
    const it = { text, key: `foot${i}`, y }
    y += BOX
    return it
  })
  if (foot.length) y += 18
  return { titleH, ruleY: titleH + 18, details: lines, rows: placed, footers: foot, contentH: y }
}

// The episode browser's sizes, in dp at 1080p.
const DP = 1.66957
export const EB = {
  PANEL_W: 760 * DP,
  PANEL_PAD: 20 * DP,
  // The 1dp border draws as a whole pixel.
  BORDER: 1,
  TITLE_PAD_B: 12 * DP,
  TITLE_SIZE: 20 * DP,
  LOGO_H: 36 * DP,
  RULE: 1 * DP,
  CONTENT_TOP: 8 * DP,
  CONTENT_H: 756,
  SIDE: 20 * DP,
  TABS_TOP: 4 * DP,
  TABS_BOTTOM: 12 * DP,
  ROW_GAP: 14,
  THUMB_W: 320,
  THUMB_H: 180,
}
EB.INNER_W = EB.PANEL_W - 2 * EB.BORDER
EB.LIST_W = EB.INNER_W - 2 * EB.SIDE
EB.TABS_H = EB.TABS_TOP + 63 + EB.TABS_BOTTOM
// The row's body column: the list width less the row's 14 padding and 3 border each side, the still and its 26.
EB.BODY_W = EB.LIST_W - 34 - EB.THUMB_W - 26

// "Season 2 · Episode 5", with a placeholder where the server has no number for it.
export const episodeLine = (ep) => {
  const parts = []
  if (ep.ParentIndexNumber != null) parts.push(`${$L('Season')} ${ep.ParentIndexNumber}`)
  parts.push(`${$L('Episode')} ${ep.IndexNumber != null ? ep.IndexNumber : '?'}`)
  return parts.join(' · ')
}

// One row per episode, at the height its title and description wrap to (a 14 gap between rows).
// pillsFor(ep) gives an episode's compact anime pills ({ key, w, ... }), which sit 8 under the title, 8 apart.
export const episodeRows = (episodes, playingId, { thumb, hideOverview, pillsFor }) => {
  let y = 0
  return episodes.map((ep, idx) => {
    const title = ep.Name || ''
    const overview = hideOverview ? '' : ep.Overview || ''
    const titleLines = Math.max(1, lineCount(title, 30, 'bold', EB.BODY_W))
    const overviewLines = Math.min(3, lineCount(overview, 22, 'regular', EB.BODY_W))
    let px = 0
    const pills = (pillsFor ? pillsFor(ep) : []).map((pl) => {
      const it = { ...pl, x: px }
      px += pl.w + 8
      return it
    })
    const pillsH = pills.length ? 8 + COMPACT_PILL_H : 0
    const body = 4 + 22 * 1.17 + 6 + titleLines * 36 + pillsH + (overview ? 10 + overviewLines * 22 * 1.35 : 0)
    const h = Math.max(EB.THUMB_H, body) + 34
    const row = {
      idx,
      key: String(ep.Id),
      y,
      h,
      current: String(ep.Id) === String(playingId),
      line: episodeLine(ep),
      title,
      titleFont: fontFor(title, 'bold'),
      titleH: titleLines * 36 + pillsH,
      pillsY: 51.74 + titleLines * 36 + 8,
      pills,
      overview,
      overviewFont: fontFor(overview),
      thumb: thumb(ep),
      pct: watchedPercent(ep),
      played: !!(ep.UserData && ep.UserData.Played),
    }
    y += h + EB.ROW_GAP
    return row
  })
}

// Seasons as tab pills: 22 padding and a 3 border each side, butted together inside 4 of track.
export const seasonTabs = (seasons, activeIndex) => {
  let x = 4
  return seasons.map((s, i) => {
    const label = s.Name || ''
    const active = i === activeIndex
    const w = textWidth(label, 19, active ? 'bold' : 'medium') + 50
    const tab = { i, key: String(s.Id), label, x, w }
    x += w
    return tab
  })
}

// The tab bar only moves by the least that shows the whole tab.
export const revealTab = (scroll, tab, viewW) => {
  if (!tab) return scroll
  if (tab.x < scroll) return tab.x
  if (tab.x + tab.w > scroll + viewW) return tab.x + tab.w - viewW
  return scroll
}
