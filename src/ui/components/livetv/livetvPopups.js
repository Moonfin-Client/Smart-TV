import $L from '../../../services/i18n.js'
import { cssShift, fontFor, textWidth, uiFont } from '../../text.js'
import { formatClockTime, formatDayLabel, formatShowingTime } from '../../../utils/clock.js'
import { CHANNEL_SORTS, SERIES_EPISODE_CHOICES, episodeLine, hasSeriesTimer, hasTimer, programEnd, programStart } from '../../../utils/liveTvGuide.js'
import { RECORD_CHOICE, descriptionsDiffer, laterShowingWhen, recordPromptChannel } from '../../../utils/recordAiring.js'
import { ACCENT, LH, addText, popupModel, wrapLines } from './guideModels.js'

// Models for the Live TV popups, laid out by guideModels.popupModel.

const SORT_LABELS = { number: 'Channel Number', name: 'Name', favoritesFirst: 'Favorites First' }

// The button colors stay fixed under every theme, but the faces follow the theme's font, so these
// are read when a popup opens.
export const BTN = () => ({ color: ACCENT, focusBg: '#00a4dc40', font: uiFont('medium') })
const DANGER = () => ({ color: '#e0685c', focusBg: '#e0685c40', font: uiFont('medium') })
// Recordings' own danger red.
export const REC_DANGER = () => ({ color: '#f44336', focusBg: '#f4433640', font: uiFont('medium') })

const btn = (id, label, look = BTN(), extra = {}) => ({ id, label, ...look, ...extra })

const genreChips = (program) => [
  program.IsMovie && $L('Movie'), program.IsSeries && $L('Series'), program.IsSports && $L('Sports'),
  program.IsNews && $L('News'), program.IsKids && $L('Kids'), program.IsPremiere && $L('Premiere'),
].filter(Boolean)

// Chips wrap, each 47 tall with 12 to its right and below.
const addChips = (ctx, y, labels) => {
  let x = 0
  let row = 0
  labels.forEach((label, i) => {
    const w = Math.round(textWidth(label, 18) + 32)
    if (x && x + w > ctx.w) {
      x = 0
      row++
    }
    const top = y + row * 59
    ctx.boxes.push({ k: `chip${i}`, x: ctx.x + x, y: ctx.top + top, w, h: 47, r: 12, color: '#00000000', border: { w: 1, color: '#ffffff1f' } })
    ctx.texts.push({ k: `chipt${i}`, text: label, font: uiFont(), size: 18, x: ctx.x + x + 16, y: ctx.top + top + 7 + cssShift(18), lh: LH, w: w, color: '#ffffffd9' })
    x += w + 12
  })
  return labels.length ? y + (row + 1) * 59 : y
}

export const programPopup = ({ program, channel, now, clockDisplay }) => {
  const ended = now > programEnd(program)
  const future = now < programStart(program)
  const timer = hasTimer(program)
  const seriesTimer = hasSeriesTimer(program)
  const recordingNow = timer && !ended && !future
  const favorite = !!(channel && channel.UserData && channel.UserData.IsFavorite === true)
  const ep = episodeLine(program)
  const buttons = []
  if (!ended) buttons.push(btn('record', timer ? $L('Cancel Recording') : $L('Record'), timer ? DANGER() : BTN()))
  if (seriesTimer) buttons.push(btn('seriesSettings', $L('Series Settings')))
  if (program.IsSeries || seriesTimer) buttons.push(btn('series', seriesTimer ? $L('Cancel Series Recording') : $L('Record Series'), seriesTimer ? DANGER() : BTN()))
  buttons.push(btn('favorite', favorite ? $L('Unfavorite Channel') : $L('Favorite Channel'), BTN(), { disabled: !channel }))
  buttons.push(btn('watch', ended || future ? $L('Watch channel live') : $L('Watch')))
  buttons.push(btn('close', $L('Close')))
  const m = popupModel({
    width: 960,
    title: program.Name || '',
    buttons,
    body: (ctx) => {
      const time = `${formatClockTime(new Date(programStart(program)), clockDisplay)} – ${formatClockTime(new Date(programEnd(program)), clockDisplay)}`
      let y = addText(ctx, 'time', 0, time, { size: 21, color: '#ffffffb3' })
      if (ep) y = addText(ctx, 'ep', y + 12, ep, { size: 21, color: '#ffffffb3' })
      // shortcut: this note should be italic, but the Roboto atlases don't carry an italic face. Add one to draw it.
      if (seriesTimer && !timer && !ended) y = addText(ctx, 'note', y + 12, $L('The series recording will skip this showing'), { size: 20, color: '#ffffff99' })
      if (program.Overview) y = addText(ctx, 'ov', y + 18, program.Overview, { size: 20, lh: 30, color: '#ffffff99' })
      return addChips(ctx, y + 18, genreChips(program))
    },
  })
  m.focus = recordingNow ? 'record' : 'watch'
  return m
}

const optionRow = (k, y, w) => ({ k, y, x: 0, w, h: 69, r: 12, focusBg: '#00a4dc40', icons: [], texts: [] })

export const sortPopup = (sortBy) => {
  const options = []
  const m = popupModel({
    width: 960,
    title: $L('Sort By'),
    options,
    body: (ctx) => {
      CHANNEL_SORTS.forEach((key, i) => {
        const on = key === sortBy
        const o = optionRow(key, i * 69, ctx.w)
        o.x = ctx.x
        o.id = key
        o.icons.push({ k: 'r', x: 24, y: 21, s: 27, r: 13.5, color: on ? '#1a1a1a' : '#00000000', border: { w: 3, color: on ? ACCENT : '#ffffffb3' }, src: '' })
        if (on) o.icons.push({ k: 'd', x: 32, y: 29, s: 11, r: 5.5, color: ACCENT, border: { w: 0, color: '#00000000' }, src: '' })
        const label = $L(SORT_LABELS[key])
        o.texts.push({ k: 'l', text: label, font: uiFont(), size: 24, x: 75, y: 18 + cssShift(24), lh: LH, w: ctx.w - 99, color: '#ffffff' })
        options.push(o)
      })
      return CHANNEL_SORTS.length * 69
    },
  })
  m.focus = sortBy
  return m
}

const dateOptions = () => {
  const options = []
  const today = new Date()
  // Stepped by calendar day, since a day across a daylight saving change isn't 24 hours.
  for (let i = -7; i <= 14; i++) options.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i))
  return options
}

export const datePopup = (guideDate) => {
  const options = []
  const day = new Date(guideDate).toDateString()
  const dates = dateOptions()
  let focus = ''
  const m = popupModel({
    width: 960,
    title: $L('Select date'),
    options,
    body: (ctx) => {
      dates.forEach((date, i) => {
        const on = date.toDateString() === day
        const o = optionRow(`d${i}`, i * 69, ctx.w)
        o.x = ctx.x
        o.id = `d${i}`
        o.date = date
        const label = i === 7 ? `${formatDayLabel(date)} (${$L('Today')})` : formatDayLabel(date)
        o.texts.push({ k: 'l', text: label, font: fontFor(label), size: 24, x: 24, y: 18 + cssShift(24), lh: LH, w: ctx.w - 93, color: on ? ACCENT : '#ffffff' })
        if (on) {
          o.icons.push({ k: 'c', x: ctx.w - 24 - 27, y: 21, s: 27, r: 0, src: 'icons/check.webp', color: ACCENT, border: { w: 0, color: '#00000000' } })
          focus = o.id
        }
        options.push(o)
      })
      return dates.length * 69
    },
  })
  m.focus = focus
  return m
}

// The series recording choices with the current one focused. titleStyle works as in popupModel.
export const seriesPopup = (selected, titleStyle = null) => {
  const options = []
  const m = popupModel({
    width: 960,
    title: $L('Which episodes should be recorded?'),
    titleStyle,
    options,
    body: (ctx) => {
      SERIES_EPISODE_CHOICES.forEach((choice, i) => {
        const on = choice.key === selected
        const o = { k: choice.key, id: choice.key, x: ctx.x, y: i * 108, w: ctx.w, h: 108, r: 0, focusBg: '#00a4dc4d', icons: [], texts: [] }
        o.icons.push({ k: 'i', x: 36, y: 39, s: 30, r: 0, src: on ? 'icons/track_selected.webp' : 'icons/track_unselected.webp', color: on ? ACCENT : '#ffffff8c', border: { w: 0, color: '#00000000' } })
        const label = $L(choice.label)
        const detail = $L(choice.detail)
        o.texts.push({ k: 'n', text: label, font: uiFont('bold'), size: 24, x: 84, y: 21 + cssShift(24), lh: LH, w: ctx.w - 120, color: '#ffffff' })
        o.texts.push({ k: 'd', text: detail, font: uiFont(), size: 20, x: 84, y: 54 + cssShift(20), lh: LH, w: ctx.w - 120, color: '#ffffffb3' })
        options.push(o)
      })
      return SERIES_EPISODE_CHOICES.length * 108
    },
  })
  m.focus = selected
  return m
}

const plural = (count, one, other) => (count === 1 ? one : other.replace('{minutes}', count))

// The Record prompt for an airing already underway and, when the plugin found one, a later showing.
export const recordPromptPopup = ({ programName, airing, suggestion, searchForCompleteShowing, clockDisplay, now = new Date() }) => {
  const uncertain = !!suggestion && !searchForCompleteShowing
  const differ = !!suggestion && descriptionsDiffer(airing.description, suggestion.description)
  const cautious = uncertain || differ
  const elapsed = Math.floor((now - airing.start) / 60000)
  const length = airing.end ? airing.end - airing.start : null
  const progress = length && length > 0 ? Math.min(1, Math.max(0, (now - airing.start) / length)) : null
  const clock = (date) => formatClockTime(date, clockDisplay)
  const laterWhen = suggestion ? laterShowingWhen(suggestion.start, clockDisplay, now) : null
  const laterChannel = suggestion ? recordPromptChannel(suggestion.channelNumber, suggestion.channelName) : ''
  const nowWhen = [`${formatShowingTime(airing.start, clockDisplay)}${airing.end ? ` – ${clock(airing.end)}` : ''}`, airing.channel].filter(Boolean).join(' · ')
  const laterCardWhen = suggestion && [`${formatDayLabel(suggestion.start)} · ${clock(suggestion.start)}`, laterChannel].filter(Boolean).join(' · ')
  const buttons = [
    btn(RECORD_CHOICE.now, $L('Record Now Only')),
    btn(RECORD_CHOICE.later, suggestion ? $L('Record {when} Only').replace('{when}', laterWhen) : $L('Record Future Showing Only')),
    btn(RECORD_CHOICE.both, suggestion ? $L('Record Now and {when}').replace('{when}', laterWhen) : $L('Record Now and Future Showing')),
  ]
  const muted = '#ffffffb3'
  const amber = '#e0a33c'
  const card = (ctx, k, y, { label, when, prog, progLabel, description, status }) => {
    const top = y
    const inX = 21.5
    const innerW = ctx.w - 43
    let cy = 18.5
    const lw = textWidth(label, 19, 'bold') + label.length * 0.9
    ctx.texts.push({ k: `${k}l`, text: label, font: uiFont('bold'), size: 19, x: ctx.x + inX, y: ctx.top + top + cy + cssShift(19), lh: LH, w: lw + 2, color: muted })
    if (status) {
      const sx = ctx.x + inX + lw + 20
      ctx.icons.push({ k: `${k}si`, x: sx, y: ctx.top + top + cy + 5, s: 23, src: 'icons/prompt_scheduled.webp', color: '#e0685c' })
      ctx.texts.push({ k: `${k}s`, text: status, font: uiFont(), size: 19, x: sx + 32, y: ctx.top + top + cy + cssShift(19), lh: LH, w: innerW, color: muted })
    }
    cy += LH + 9
    ctx.texts.push({ k: `${k}w`, text: when, font: fontFor(when, 'bold'), size: 21, x: ctx.x + inX, y: ctx.top + top + cy + cssShift(21), lh: LH, w: innerW, color: '#ffffff' })
    cy += LH
    if (prog != null) {
      cy += 12
      const plw = progLabel ? textWidth(progLabel, 19) + 15 : 0
      const tw = innerW - plw
      ctx.boxes.push({ k: `${k}pt`, x: ctx.x + inX, y: ctx.top + top + cy + 13.5, w: tw, h: 6, r: 3, color: '#ffffff26', border: { w: 0, color: '#00000000' } })
      if (prog > 0) ctx.boxes.push({ k: `${k}pf`, x: ctx.x + inX, y: ctx.top + top + cy + 13.5, w: tw * prog, h: 6, r: 3, color: muted, border: { w: 0, color: '#00000000' } })
      if (progLabel) ctx.texts.push({ k: `${k}pl`, text: progLabel, font: uiFont(), size: 19, x: ctx.x + inX + tw + 15, y: ctx.top + top + cy + cssShift(19), lh: LH, w: plw, color: muted })
      cy += LH
    }
    if (description) {
      cy += 12
      const lines = wrapLines(description, 21, 'regular', innerW).slice(0, 2)
      lines.forEach((ln, i) => ctx.texts.push({ k: `${k}d${i}`, text: ln, font: fontFor(ln), size: 21, x: ctx.x + inX, y: ctx.top + top + cy + i * 27.3 + cssShift(21), lh: 27.3, w: innerW, color: muted }))
      cy += lines.length * 27.3
    }
    const h = cy + 18.5
    ctx.boxes.unshift({ k: `${k}bg`, x: ctx.x, y: ctx.top + top, w: ctx.w, h, r: 17, color: '#ffffff0f', border: { w: 1.5, color: '#ffffff1f' } })
    return y + h
  }
  const note = (ctx, k, y, icon, text, caution) => {
    const color = caution ? amber : muted
    ctx.icons.push({ k: `${k}i`, x: ctx.x, y: ctx.top + y, s: 26, src: `icons/${icon}.webp`, color })
    return addText(ctx, k, y, text, { size: 21, color, x: 38, w: ctx.w - 38 })
  }
  const m = popupModel({
    width: 1102,
    maxFrac: 0.9,
    title: $L('Record {name}').replace('{name}', programName),
    titleWeight: 'bold',
    buttons,
    body: (ctx) => {
      let y = addText(ctx, 'started', 0, plural(
        Math.max(1, elapsed),
        $L('This showing started 1 minute ago, so the recording will miss the start.'),
        $L('This showing started {minutes} minutes ago, so the recording will miss the start.')
      ), { size: 21, color: muted })
      y = card(ctx, 'now', y + 23, {
        label: $L('Now'), when: nowWhen, prog: progress,
        progLabel: plural(elapsed, $L('1 min already aired'), $L('{minutes} min already aired')), description: airing.description,
      })
      if (suggestion) {
        y = card(ctx, 'later', y + 15, {
          label: $L('Future showing'), when: laterCardWhen, description: (suggestion.description || '').trim(),
          status: suggestion.alreadyScheduled ? $L('Already set to record') : null,
        })
      }
      if (uncertain) y = note(ctx, 'unc', y + 15, 'prompt_warning', $L("Matched by title and description only. Check it's the same program."), true)
      if (differ) y = note(ctx, 'dif', y + 15, 'prompt_compare', $L('The descriptions differ, so this may be a different program.'), true)
      if (suggestion && !cautious && airing.season != null && airing.episode != null) {
        y = note(ctx, 'same', y + 15, 'prompt_check', $L('Same episode (S{season}E{episode})').replace('{season}', airing.season).replace('{episode}', airing.episode), false)
      }
      const question = suggestion
        ? $L('Also record the future showing to get a complete recording?')
        : $L('Also record a future showing automatically once one is found, to get a complete recording?')
      return addText(ctx, 'q', y + 26, question, { size: 23, weight: 'bold', color: '#ffffff' })
    },
  })
  m.focus = cautious ? RECORD_CHOICE.now : RECORD_CHOICE.both
  return m
}
