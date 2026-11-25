import $L from '../../../services/i18n.js'
import { fontFor, textWidth } from '../../text.js'
import { formatClockTime } from '../../../utils/clock.js'
import { getImageUrl } from '../../../utils/helpers.js'
import {
  CAROUSEL_CARD_HEIGHT, TV_CANVAS_SCALE, carouselLayoutFor, categoryTags, channelIndexFor, episodeTitleOf, filterLabel,
  genreFor, programAiringAt, progressAt, recordingMark,
} from '../../../utils/liveTvGuide.js'

// The channel carousel's geometry at 1920x1080, and the models its cards and header draw from.

const PAD = 48
const STRIP_W = 1920 - 2 * PAD
const LAYOUT = carouselLayoutFor(STRIP_W / TV_CANVAS_SCALE)
export const PITCH = LAYOUT.pitch * TV_CANVAS_SCALE
export const CARD_W = LAYOUT.width * TV_CANVAS_SCALE
export const CARD_H = CAROUSEL_CARD_HEIGHT * TV_CANVAS_SCALE
export const VISIBLE = LAYOUT.count
export const LEADING = (STRIP_W - CARD_W) / 2
const RADIUS = Math.ceil(VISIBLE / 2) + 2
export const SLOTS = 2 * RADIUS + 1
const OVERLAY_H = PAD + 141 + 17 + CARD_H + PAD
export const OVERLAY_Y = 1080 - OVERLAY_H
const ACCENT = '#00a4dc'

const META_W = CARD_W - (16 + 11) * TV_CANVAS_SCALE
const META_SEP = ' · '
const SURFACE = [26, 26, 26]
const SURFACE_VARIANT = [37, 37, 37]

const hex2 = (n) => (n < 16 ? '0' : '') + n.toString(16)
const rgbaHex = (rgb, a) => `#${rgb.map(hex2).join('')}${hex2(Math.round(a * 255))}`

// A hint of the program's genre over the dark base.
export const cardBackground = (genre, centered) => {
  const tint = genre ? genre.rgb.split(',').map((v) => parseInt(v, 10)) : SURFACE_VARIANT
  const alpha = centered ? 0.22 : 0.14
  return rgbaHex(tint.map((v, i) => Math.round(v * alpha + SURFACE[i] * (1 - alpha))), centered ? 0.88 : 0.74)
}

export const currentProgram = (store, channelId, now) => (store ? programAiringAt(store.unfilteredProgramsForChannel(channelId), now) : null)

const timeRange = (program, clock) =>
  `${formatClockTime(new Date(program.StartDate), clock)} - ${formatClockTime(new Date(program.EndDate), clock)}`

const categoryLabels = (program) => categoryTags(program).map((key) => $L(filterLabel(key)))

// The items that fit the width, in order.
export const fittingItems = (items, width, size, sep) => {
  const fitted = []
  let used = 0
  for (let n = 0; n < items.length; n++) {
    const piece = fitted.length ? `${sep}${items[n]}` : items[n]
    const w = textWidth(piece, size)
    if (used + w > width) break
    used += w
    fitted.push(items[n])
  }
  return fitted
}

// Text cut to a width with an ellipsis at the last character that fits, as CSS text-overflow does,
// where the renderer cuts at a word.
export const ellipsize = (text, size, weight, width) => {
  const str = String(text || '')
  if (textWidth(str, size, weight) <= width) return str
  const dots = textWidth('\u2026', size, weight)
  let lo = 0
  let hi = str.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (textWidth(str.slice(0, mid), size, weight) + dots <= width) lo = mid
    else hi = mid - 1
  }
  return `${str.slice(0, lo)}\u2026`
}

// How many lines CSS wraps a paragraph to at a width, stopping at cap.
export const lineCount = (text, size, width, cap = Infinity) => {
  const words = String(text).split(/\s+/).filter(Boolean)
  let lines = words.length ? 1 : 0
  let line = ''
  for (let n = 0; n < words.length && lines < cap; n++) {
    const next = line ? `${line} ${words[n]}` : words[n]
    if (line && textWidth(next, size) > width) {
      lines++
      line = words[n]
    } else line = next
  }
  return lines
}

// One channel's card. The content box is 4px narrower on the centered card, whose border is 3px
// where the others' is 1px, so the fields that depend on it come for both.
export const cardModel = (channel, store, now, serverUrl, clock) => {
  const program = currentProgram(store, channel.Id, now)
  const number = channel.ChannelNumber ? String(channel.ChannelNumber) : ''
  const name = channel.Name || ''
  const genre = program ? genreFor(program) : null
  const mark = program ? recordingMark(program) : null
  const fav = !!(channel.UserData && channel.UserData.IsFavorite === true)
  const numW = number ? textWidth(number, 32, 'bold') : 0
  const title = (program && program.Name) || ''
  const meta = program
    ? fittingItems([timeRange(program, clock), program.OfficialRating].concat(categoryLabels(program))
      .filter((s) => s && String(s).trim()).map((s) => String(s).trim()), META_W, 20, META_SEP).join(META_SEP)
    : ''
  const loading = !program && !!store && !store.hasProgramsFor(channel.Id)
  const cwOff = CARD_W - 2 - 39
  return {
    k: channel.Id,
    bgOn: cardBackground(genre, true),
    bgOff: cardBackground(genre, false),
    bar: genre ? `${genre.color}ff` : `${ACCENT}ff`,
    fav,
    number,
    numFont: fontFor(number, 'bold'),
    numX: fav ? 31.5 : 0,
    name,
    nameFont: fontFor(name, 'bold'),
    nameX: (fav ? 31.5 : 0) + (number ? numW + 9 : 0),
    // What the name's flex box gives up to its neighbors, besides the logo.
    nameLess: (fav ? 31.5 : 0) + (number ? numW + 9 : 0) + (mark ? 29.5 : 0),
    mark: mark ? (mark === 'record' ? 'icons/rec_dot.webp' : 'icons/series_record.webp') : '',
    markColor: mark === 'skipped' ? '#9e9e9eff' : '#e0685cff',
    logo: channel.ImageTags && channel.ImageTags.Primary
      ? getImageUrl(serverUrl, channel.Id, 'Primary', { maxHeight: 80, tag: channel.ImageTags.Primary }) || ''
      : '',
    title,
    titleFont: fontFor(title),
    linesOff: lineCount(title, 23, cwOff, 2),
    linesOn: lineCount(title, 23, cwOff - 4, 2),
    loading: !title && loading,
    meta,
    metaFont: fontFor(meta),
    live: !!program,
    progress: program ? Math.min(1, Math.max(0, progressAt(program, now))) : 0,
  }
}

// The program header above the strip.
export const headerModel = (channel, program, clock) => {
  if (!channel) return { title: '', meta: '', overview: '' }
  const season = program && program.ParentIndexNumber
  const episode = program && program.IndexNumber
  const suffix = season != null && episode != null ? ` (S${season}:E${episode})` : ''
  const episodeTitle = program ? episodeTitleOf(program) : ''
  const episodeName = episodeTitle && episodeTitle !== program.Name ? ` - ${episodeTitle}` : ''
  const meta = program
    ? [timeRange(program, clock), (program.OfficialRating || '').trim() || null].concat(categoryLabels(program)).filter(Boolean).join(' · ')
    : ''
  return {
    title: `${(program && program.Name) || channel.Name || ''}${episodeName}${suffix}`,
    meta,
    overview: (program && program.Overview) || '',
  }
}

// Where each slot of the strip sits for a centered raw index. A long lineup keeps SLOTS cards
// either side of the center, each slot holding the raw index that's its own modulo, so a move
// rewrites one slot. A lineup that fits is drawn at its real count, centered on the selection.
export const slotPlan = (rawIndex, count) => {
  if (count <= VISIBLE) {
    const middle = Math.floor(count / 2)
    const centered = channelIndexFor(rawIndex, count)
    const plan = []
    for (let n = 0; n < count; n++) plan.push({ slot: n, channel: channelIndexFor(centered + n - middle, count), x: LEADING + (n - middle) * PITCH, centered: n === middle })
    return plan
  }
  const plan = []
  for (let raw = rawIndex - RADIUS; raw <= rawIndex + RADIUS; raw++) {
    plan.push({ slot: channelIndexFor(raw, SLOTS), channel: channelIndexFor(raw, count), x: LEADING + raw * PITCH, centered: raw === rawIndex })
  }
  return plan
}

// What a slot draws before it has a channel.
export const EMPTY_CARD = {
  k: '', bgOn: '#00000000', bgOff: '#00000000', bar: '#00000000', fav: false, number: '', numFont: 'roboto-bold', numX: 0,
  name: '', nameFont: 'roboto-bold', nameX: 0, nameLess: 0, mark: '', markColor: '#e0685cff', logo: '', title: '',
  titleFont: 'roboto', linesOff: 0, linesOn: 0, loading: false, meta: '', metaFont: 'roboto', live: false, progress: 0,
}
