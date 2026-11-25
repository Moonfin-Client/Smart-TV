import $L from '../../services/i18n.js'
import { formatClockTime, formatDayLabel } from '../../utils/clock.js'
import {
  DEFAULT_SERIES_CHOICE, SERIES_EPISODE_CHOICES, episodeLine, programEnd, programStart, seriesChoiceFlags, seriesChoiceOf,
} from '../../utils/liveTvGuide.js'
import { recordAiring, recordAiringMessage } from '../../utils/recordAiring.js'

const MINUTE = 60000

const sameId = (a, b) => a != null && b != null && String(a).replace(/-/g, '') === String(b).replace(/-/g, '')

// The timer recording this showing, a running one ahead of one still waiting. Canceled and finished timers don't count.
export const timerFor = (program, timers) => {
  const matching = timers.filter((t) => sameId(t.Id, program.TimerId) || sameId(t.ProgramId, program.Id))
  return matching.find((t) => t.Status === 'InProgress') || matching.find((t) => t.Status === 'New') || null
}

// The recording state for the program the controls hold, given the last fetch of it and of the timer list.
export const recordingFor = (program, fetched, now, hasApi) => {
  if (!hasApi || !program || !program.Id || !(programStart(program) <= now && now < programEnd(program))) {
    return { available: false, mark: null }
  }
  const same = !!fetched && fetched.program.Id === program.Id
  const current = same ? fetched.program : program
  const timers = same ? fetched.timers : []
  const timer = timerFor(current, timers)
  const seriesTimerId = (timer && timer.SeriesTimerId) || current.SeriesTimerId || null
  const nextSeriesRecording = seriesTimerId
    ? timers
        .filter((t) => t.Status === 'New' && sameId(t.SeriesTimerId, seriesTimerId) && new Date(t.StartDate).getTime() > now)
        .sort((a, b) => new Date(a.StartDate) - new Date(b.StartDate))[0] || null
    : null
  // The dot only turns red while the recording runs, and a series rule's mark is gray on a showing it passes over.
  const mark = seriesTimerId ? (timer ? 'series' : 'skipped') : timer ? (timer.Status === 'InProgress' ? 'record' : 'scheduled') : null
  return { available: true, program: current, timer, seriesTimerId, mark, nextSeriesRecording }
}

// LiveRecordingDialog's first view as TrackModal content: the program's times and episode, the notes about its series
// rule, and the actions. Close holds focus when it opens, so a stray OK changes nothing.
export const recordDialog = (rec, clockDisplay) => {
  const { program, timer, seriesTimerId, nextSeriesRecording } = rec
  const clock = (date) => formatClockTime(date, clockDisplay)
  const details = [{ text: `${clock(new Date(programStart(program)))} – ${clock(new Date(programEnd(program)))}` }]
  const ep = episodeLine(program)
  if (ep) details.push({ text: ep })
  if (seriesTimerId && !timer) details.push({ text: $L('The series recording will skip this showing'), note: true })
  if (seriesTimerId) {
    const next = nextSeriesRecording ? new Date(nextSeriesRecording.StartDate) : null
    details.push({
      text: next
        ? $L('Next series recording: {dateTime}').replace('{dateTime}', `${formatDayLabel(next)} · ${clock(next)}`)
        : $L('Series recording is scheduled, but the guide has no upcoming episodes'),
      note: true,
    })
  }
  const rows = [{ id: 'record', label: timer ? $L('Cancel This Recording') : program.IsSeries ? $L('Record This Episode') : $L('Record This Program') }]
  if (seriesTimerId) rows.push({ id: 'settings', label: $L('Series Settings') })
  if (seriesTimerId || program.IsSeries) rows.push({ id: 'series', label: seriesTimerId ? $L('Cancel Series Recording') : $L('Record Series') })
  rows.push({ divider: true }, { id: 'close', label: $L('Close'), start: true })
  return { title: program.Name || '', details, rows }
}

// The episode choice a new or changed series rule asks for (SeriesEpisodeChoices), entered on the current choice.
export const seriesDialog = (rule) => {
  const selected = rule ? seriesChoiceOf(rule) : DEFAULT_SERIES_CHOICE
  return {
    title: $L('Which episodes should be recorded?'),
    rows: SERIES_EPISODE_CHOICES.map((c) => ({ id: c.key, label: $L(c.label), detail: $L(c.detail), selected: c.key === selected })),
  }
}

// api() and program() read the player's live api and the airing program, onChange(state) hears each new answer,
// toast(message) shows the player's toast and onChanged() hears a recording that changed. sync(controlsVisible)
// fetches the program again with the timer list as the controls come up and once a minute while they stay up,
// since the one the controls hold can be a minute old.
export const createLiveRecording = ({
  api, program, onChange, toast, onChanged,
  now = () => Date.now(), every = setInterval, stopEvery = clearInterval, after = setTimeout, cancelAfter = clearTimeout,
}) => {
  let fetched = null
  let busy = false
  let visible = false
  let ticker = null
  let tickingFor = null
  let ending = null
  let state = { available: false, mark: null }

  const update = () => {
    state = recordingFor(program(), fetched, now(), !!api())
    // The button goes when the program ends rather than at the next guide check.
    if (ending) cancelAfter(ending)
    ending = state.available ? after(() => sync(visible), programEnd(state.program) - now()) : null
    onChange(state)
  }

  const refresh = async () => {
    const target = program()
    const a = api()
    if (!a || !target || !target.Id) return
    const [fresh, list] = await Promise.all([a.getLiveTvProgram(target.Id), a.getLiveTvTimers()])
    const p = program()
    if (!p || p.Id !== target.Id) return
    fetched = { program: fresh || target, timers: (list && list.Items) || [] }
    update()
  }
  const quietly = () => refresh().catch(() => {})

  function sync(controlsVisible) {
    visible = controlsVisible
    update()
    const id = visible && state.available ? state.program.Id : null
    if (id === tickingFor) return
    if (ticker) stopEvery(ticker)
    ticker = null
    tickingFor = id
    if (!id) return
    quietly()
    ticker = every(quietly, MINUTE)
  }

  // An action can answer with its own message in place of the usual one.
  const run = async (action, success, failure) => {
    if (busy) return
    busy = true
    try {
      const message = await action()
      toast(typeof message === 'string' ? message : success)
      onChanged()
    } catch (e) {
      toast(failure)
    }
    busy = false
    quietly()
  }

  return {
    state: () => state,
    sync,
    // Asked again just before the dialog opens, so it shows what the server has now.
    prepare: () => refresh().then(() => true, () => {
      toast($L('Failed to load recordings'))
      return false
    }),
    // The Record workflow with the prompt host the dialog passes in. Back on the prompt records nothing and says nothing.
    async record({ prompt, setLoading, channel }) {
      if (busy || !state.available) return
      busy = true
      const a = api()
      const current = state.program
      let message = null
      try {
        const outcome = await recordAiring({
          program: current,
          start: new Date(programStart(current)),
          createTimer: () => a.createLiveTvTimer(current.Id),
          prompt,
          setLoading,
          stillValid: () => {
            const p = program()
            return !!p && p.Id === current.Id
          },
          channel,
        })
        message = recordAiringMessage(outcome)
        if (message) onChanged()
      } catch (e) {
        message = $L('Unable to create recording')
      }
      busy = false
      if (message) toast(message)
      quietly()
    },
    cancel() {
      const a = api()
      const { timer } = state
      return run(() => a.cancelLiveTvTimer(timer.Id), $L('Recording cancelled'), $L('Failed to cancel recording'))
    },
    recordSeries(key) {
      const a = api()
      const current = state.program
      return run(() => a.createLiveTvSeriesTimer(current.Id, seriesChoiceFlags(key)), $L('Series set to record'), $L('Unable to create series recording'))
    },
    cancelSeries() {
      const a = api()
      const { seriesTimerId } = state
      return run(() => a.cancelLiveTvSeriesTimer(seriesTimerId), $L('Series recording cancelled'), $L('Failed to cancel series recording'))
    },
    loadSeriesRule() {
      return api().getLiveTvSeriesTimer(state.seriesTimerId).catch(() => {
        toast($L('Unable to update series recording'))
        return null
      })
    },
    updateSeries(rule, key) {
      if (seriesChoiceOf(rule) === key) return
      const a = api()
      run(() => a.updateLiveTvSeriesTimer(rule.Id, { ...rule, ...seriesChoiceFlags(key) }), $L('Series recording updated'), $L('Unable to update series recording'))
    },
    dispose() {
      if (ticker) stopEvery(ticker)
      if (ending) cancelAfter(ending)
      ticker = null
      ending = null
      tickingFor = null
    },
  }
}
