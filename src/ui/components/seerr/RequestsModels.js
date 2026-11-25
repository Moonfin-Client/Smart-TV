// What the requests screen draws for each request tile and issue row, worked out once so the
// templates only bind fields. Sizes are at 1920x1080, where 1rem is 24px. Colors are fixed, apart
// from the download fill, which follows the theme.
import $L from '../../../services/i18n.js'
import { theme, rgba } from '../../theme.js'
import { cssShift, fontFor, uiFont } from '../../text.js'
import { textWidth, spacedWidth } from './look.js'
import { getImageUrl } from '../../../services/seerrApi.js'
import { localeDate } from '../../../utils/dateFormat.js'
import {
  ISSUE_STATUS, DOWNLOAD_STATE, getRequestStatusInfo, getIssueStatusInfo, getIssueTypeLabel, downloadLabelParts,
} from '../../../utils/seerrStatus.js'
import { requestDownloadFor, requestNotFoundYet, requestQueueView } from '../../../utils/seerrArrQueue.js'
import { tileActions, issueActions } from '../../../pages/Seerr/requestActions.js'

// The grid: a 232 wide minimum tile and 24 between, spread over the 1692 wide list.
export const GRID = (() => {
  const width = 1692
  const gap = 24
  const cols = Math.floor((width + gap) / (232 + gap))
  const w = (width - gap * (cols - 1)) / cols
  const scale = w / 232
  return { cols, gap, w, poster: w - 16, posterH: (w - 16) * 1.5, scale }
})()
// The tile's own height follows the grid's, which keeps the minimum height's 2:3 against its width.
export const tileHeight = (split) => Math.round(((232 - 16) * 1.5 + 142 + (split ? 22 : 0) + 16) * GRID.scale)

// A status's hue from the theme: its status colors, and the accent for approved.
const hueOf = (color) => {
  const t = theme()
  return color === 'approved' || !t.status[color] ? t.accent : t.status[color]
}
// The hue mixed toward white, for light text on a fill of it.
const tint = (c, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * (1 - k) + 255 * k).toString(16).padStart(2, '0')).join('')

// A status chip: fill at 80%, a border of the hue and light text of it, uppercase.
export const statusChip = (label, color) => {
  const hue = hueOf(color)
  const border = rgba(hue)
  const fill = rgba(hue, 0.8)
  const ink = tint(hue, 0.8)
  const text = String(label || '').toUpperCase()
  return { text, border, fill, ink, w: Math.round(spacedWidth(text, 18, 'bold', 0.4) + 26), font: uiFont('bold') }
}


// The tile's round icon buttons, laid out across the poster's foot.
const ICONS = {
  approve: ['req_approve', (t) => t.status.available, () => $L('Approve')],
  decline: ['req_decline', (t) => t.status.error, () => $L('Decline')],
  retry: ['req_retry', (t) => t.status.pending, () => $L('Retry')],
  cancel: ['close', (t) => t.onSurface, () => $L('Cancel')],
}

// A download bar. compact is the tile's, at 17px over a 6px track. The label's left side
// ellipsizes so the percentage always shows.
export const downloadBar = (summary, { compact = true, prefix = null, width = 234 } = {}) => {
  if (!summary) return null
  const t = theme()
  const size = compact ? 17 : 22
  const { leading, percent } = downloadLabelParts(summary, compact)
  const lead = leading && prefix ? `${prefix} · ${leading}` : leading || ''
  const pct = percent || ''
  const pctW = pct ? textWidth(pct, size) : 0
  const sepW = lead && pct ? textWidth('·', size) : 0
  const stuck = summary.state === DOWNLOAD_STATE.STALLED || summary.state === DOWNLOAD_STATE.IMPORT_BLOCKED
  return {
    size,
    font: uiFont(),
    lead,
    leadW: Math.max(1, width - pctW - sepW),
    sep: sepW ? '·' : '',
    sepX: width - pctW - sepW,
    pct,
    pctX: width - pctW,
    trackY: 39,
    trackH: compact ? 6 : 8,
    fillW: Math.round(summary.fraction * width),
    fill: summary.state === DOWNLOAD_STATE.FAILED ? t.status.error : stuck ? t.status.pending : t.rangeProgress,
    fillAlpha: summary.state === DOWNLOAD_STATE.PAUSED || summary.state === DOWNLOAD_STATE.QUEUED ? 0.4 : 1,
    h: 33 + 6 + (compact ? 6 : 8),
  }
}

// Timestamps arrive as ISO strings, so the set's own locale formats them.
const requestDate = (iso) => {
  if (!iso) return ''
  const parsed = new Date(iso)
  return isNaN(parsed.getTime()) ? '' : localeDate(parsed, { year: 'numeric', month: 'short', day: 'numeric' })
}

const requestedByLine = (name) => $L('Requested by {name}').replace('{name}', name)
const requesterName = (request) => (request.requestedBy && request.requestedBy.displayName) || $L('Unknown')

// Decided once for the whole grid, so every caption matches the one height the grid keeps: any
// requester too long for one line puts every name under its own label.
export const splitRequester = (requests) =>
  requests.some((r) => textWidth(requestedByLine(requesterName(r)), 16) > GRID.poster - 12)

// One request tile. queueResponse is the arr's answer for its title, when Moonbase gave one.
export const requestTile = (request, index, { queueResponse, viewer, split }) => {
  const media = request.media || {}
  const info = getRequestStatusInfo(request)
  const view = requestQueueView(request, queueResponse)
  const summary = requestDownloadFor(request, view)
  const notFound = !summary && requestNotFoundYet(request, view)
  const isMovie = request.type === 'movie' || media.mediaType === 'movie'
  const badge = `${(isMovie ? $L('Movie') : $L('Series')).toUpperCase()}${request.is4k ? ' · 4K' : ''}`
  const title = media.title || media.name || $L('Unknown')
  const names = tileActions(request, viewer)
  const actions = names.map((id, i) => {
    const [icon, color, label] = ICONS[id]
    // One button sits at the left, two spread to either side.
    return { key: id, id, icon, color: color(theme()), label: label(), x: i === 0 ? 20 : 8 + GRID.poster - 12 - 56 }
  })
  const requester = requesterName(request)
  const reason = summary && summary.reason
  const lines = []
  let y = 469
  if (reason) {
    lines.push({ k: 'reason', text: reason, color: '#ffffff99', y, maxlines: split ? 2 : 1 })
    y += split ? 44 : 22
  } else if (split) {
    lines.push({ k: 'by', text: $L('Requested by'), color: '#ffffff99', y, maxlines: 1 })
    lines.push({ k: 'name', text: requester, color: '#ffffff99', y: y + 22, maxlines: 1 })
    y += 44
  } else {
    lines.push({ k: 'by', text: requestedByLine(requester), color: '#ffffff99', y, maxlines: 1 })
    y += 22
  }
  const date = requestDate(request.createdAt)
  if (date) lines.push({ k: 'date', text: date, color: '#ffffff66', y: y + 2, maxlines: 1 })
  lines.forEach((l) => {
    l.font = fontFor(l.text)
  })
  return {
    key: `req-${request.id}`,
    idx: index,
    id: request.id,
    request,
    image: media.posterPath ? getImageUrl(media.posterPath, 'w342') : '',
    badge,
    badgeW: Math.round(spacedWidth(badge, 15, 'bold', 0.8) + 18),
    badgeColor: rgba(isMovie ? theme().status.movie : theme().status.show, 0.85),
    badgeFont: uiFont('bold'),
    stripe: rgba(hueOf(info.color)),
    actions,
    title,
    titleFont: fontFor(title, 'bold'),
    status: summary ? 'bar' : notFound ? 'notfound' : 'chip',
    bar: summary ? downloadBar(summary, { compact: true, width: GRID.poster - 12 }) : null,
    chip: statusChip(info.label, info.color),
    notFoundLabel: $L('Not found yet'),
    notFoundFont: uiFont(),
    lines,
    h: tileHeight(split),
  }
}

// One row of the issues list, 7rem tall with a third of a rem between.
export const ISSUE_ROW = { h: 168, step: Math.round(7.35 * 24) + 8, inset: 8.4 }

export const issueScope = (issue) => {
  if (!(issue.problemSeason > 0)) return ''
  if (issue.problemEpisode > 0) return `S${issue.problemSeason} E${issue.problemEpisode}`
  return `${$L('Season')} ${issue.problemSeason}`
}

export const issueRow = (issue, index, viewer) => {
  const media = issue.media || {}
  const scope = issueScope(issue)
  const replies = Math.max(((issue.comments && issue.comments.length) || 1) - 1, 0)
  const meta = `${getIssueTypeLabel(issue.issueType)}${scope ? ` · ${scope}` : ''}${replies > 0 ? ` · ${replies} ${$L('comments')}` : ''}`
  const info = getIssueStatusInfo(issue)
  const acts = issueActions(issue, viewer)
  const by = issue.createdBy && issue.createdBy.displayName
    ? $L('Reported by {name}').replace('{name}', issue.createdBy.displayName)
    : requestDate(issue.createdAt)
  const toggleLabel = acts.toggle === 'resolve' ? $L('Resolve') : $L('Reopen')
  const toggleHue = acts.toggle === 'resolve' ? theme().status.available : theme().status.pending
  const toggleW = Math.round(textWidth(toggleLabel, 22.8, 'bold') + 50)
  return {
    key: `issue-${issue.id}`,
    idx: index,
    id: issue.id,
    issue,
    image: media.posterPath ? getImageUrl(media.posterPath, 'w185') : '',
    meta,
    metaFont: uiFont(),
    metaW: textWidth(meta, 21.6),
    chip: statusChip(info.label, info.color),
    by,
    // The name comes from the server, so it picks its own font.
    byFont: fontFor(by),
    byY: 109.5 + cssShift(30, fontFor(by)),
    btnFont: uiFont('bold'),
    toggle: acts.canAct
      ? [{
        k: 't',
        label: toggleLabel,
        w: toggleW,
        x: 1644 - 24 - toggleW,
        ink: rgba(toggleHue),
        fill: rgba(toggleHue, 0.16),
      }]
      : [],
    open: issue.status === ISSUE_STATUS.OPEN,
  }
}

// How many lines a paragraph wraps to at a width, breaking between words the way CSS does.
const lineCount = (str, size, maxW) => {
  const words = String(str || '').split(/\s+/).filter(Boolean)
  let lines = words.length ? 1 : 0
  let line = ''
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, size) > maxW) {
      lines++
      line = word
    } else line = next
  })
  return lines
}

// The thread overlay's comment blocks: the first is the report itself, under an accent edge.
export const threadComments = (issue) => {
  const comments = issue.comments || []
  let y = 0
  return comments.map((c, i) => {
    const first = i === 0
    const author = (c.user && c.user.displayName) || (issue.createdBy && issue.createdBy.displayName) || $L('Unknown')
    const date = c.createdAt ? localeDate(new Date(c.createdAt)) : ''
    const textX = first ? 25 : 20
    const bodyW = 1014 - textX - 20
    const lines = Math.max(1, lineCount(c.message || '', 21, bodyW))
    const h = Math.round(16 + 34 + 6 + lines * 29.4 + 16)
    const block = {
      key: `c-${c.id != null ? c.id : i}`,
      first,
      y,
      h,
      textX,
      bodyW,
      author,
      authorFont: fontFor(author, 'bold'),
      dateX: textX + textWidth(author, 20, 'bold') + 14,
      date,
      body: c.message || '',
      bodyFont: fontFor(c.message || ''),
    }
    y += h + 14
    return block
  })
}
