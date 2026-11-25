// The skip prompt and the Next Up card, decided from the position on each time update. The player
// only draws what check() returns. Positions are in ticks.
const TICKS = 10000000
// Without autoplay, the next episode is offered once this little of the current one is left.
const NEAR_END_TICKS = 300000000
// A segment shorter than this isn't offered, and one shorter than the second isn't skipped by itself.
const MIN_PROMPT_TICKS = 30000000
const MIN_AUTO_SKIP_TICKS = 10000000
// A seek the viewer makes holds prompts back this long, so the segment it lands in isn't offered.
const SEEK_PROMPT_HOLD_MS = 1200

const promptFor = (seg, ticks) => {
  const total = Math.max(1, (seg.end - seg.start) / TICKS)
  const remaining = Math.max(0, Math.round((seg.end - ticks) / TICKS))
  return { type: seg.type, start: seg.start, end: seg.end, remainingSeconds: remaining, progress: remaining / total }
}

export const createPopups = (now = Date.now) => {
  // The segment playback is in, offered or not, so a prompt only comes up on the way into one.
  let active = null
  let autoSkipped = []
  let holdUntil = 0
  // The segment on offer, and whether its auto hide ran out (it then only shows with the controls).
  let prompt = null
  let lapsed = false
  // The card raised by the credits and by the end of the episode.
  let credits = false
  let nearEndCard = false
  let countdown = null
  let cardUp = false
  // Hide, Play Next or the automatic move on, until playback goes back before the card's window.
  let triggered = false

  const clearPrompt = () => {
    prompt = null
    lapsed = false
  }

  return {
    reset() {
      clearPrompt()
      active = null
      autoSkipped = []
      holdUntil = 0
      credits = false
      nearEndCard = false
      countdown = null
      cardUp = false
      triggered = false
    },
    // A seek the viewer makes takes the prompt down, and the segment it lands in isn't offered.
    seeked() {
      holdUntil = Math.max(holdUntil, now() + SEEK_PROMPT_HOLD_MS)
      clearPrompt()
    },
    // Back, or a skip. The prompt stays gone until playback leaves the segment and comes back into it.
    dismissPrompt: clearPrompt,
    // The auto hide ran out.
    lapse() {
      if (prompt) lapsed = true
    },
    // Hide, Back, Play Next or the automatic move on.
    dismissNextUp() {
      triggered = true
      countdown = null
      nearEndCard = false
      credits = false
    },
    // segments is playback.getMediaSegments' result and s the settings. Returns where an automatic
    // skip goes (skipTo), the prompt on offer with its countdown (prompt, lapsed, and promptIsNew when it
    // just came up), whether the Next Up card is up with its countdown in seconds, and playNext when the
    // credits stand in for the card and move on by themselves.
    check(ticks, { segments, runTicks, hasNext, preroll, s }) {
      const out = { skipTo: null, prompt: null, promptIsNew: false, lapsed: false, nextUp: false, countdown: null, playNext: false }
      const introAction = s.introAction || 'ask'
      const outroAction = s.outroAction || 'ask'
      const creditsStart = segments && segments.creditsStart != null ? segments.creditsStart : null
      // With autoplay the ended handler moves on at the end of the file, so the card only shows for the timeout.
      const nearEndTicks = s.autoPlay ? (s.nextUpTimeout != null ? s.nextUpTimeout : 7) * TICKS : NEAR_END_TICKS
      const from = Math.min(creditsStart != null ? creditsStart : Infinity, runTicks > 0 ? runTicks - nearEndTicks : Infinity)
      if (ticks < from) triggered = false
      // Set while a skip button is on screen, so the next episode card can hold back.
      let promptVisible = false

      if (segments) {
        const nextUpWouldShow = hasNext && !preroll && s.nextUpBehavior !== 'disabled'
        const outroIsNextUp = s.replaceSkipOutroWithNextUp === true && nextUpWouldShow
        // Back at or before a segment's start is a rewind into it on purpose, so it can skip itself again.
        autoSkipped = autoSkipped.filter((start) => ticks > start)

        const seg = (segments.list || []).find((x) => x.end != null && ticks >= x.start && ticks < x.end) || null
        let action = 'none'
        if (seg) action = seg.type === 'intro' ? introAction : seg.type === 'outro' ? (outroIsNextUp ? 'none' : outroAction) : 'ask'
        const entered = !!seg && active !== seg.start
        active = seg ? seg.start : null
        const longEnough = !!seg && seg.end - seg.start >= (action === 'auto' ? MIN_AUTO_SKIP_TICKS : MIN_PROMPT_TICKS)

        if (entered && action === 'auto' && longEnough && autoSkipped.indexOf(seg.start) < 0) {
          autoSkipped.push(seg.start)
          clearPrompt()
          out.skipTo = seg.end
        } else if (now() < holdUntil) {
          clearPrompt()
        } else if (entered && action === 'ask' && longEnough) {
          promptVisible = true
          clearPrompt()
          prompt = promptFor(seg, ticks)
          out.promptIsNew = true
        } else if (seg && !entered && action === 'ask') {
          promptVisible = !!prompt && prompt.start === seg.start && !lapsed
          if (prompt && prompt.start === seg.start) prompt = promptFor(seg, ticks)
        } else {
          clearPrompt()
        }

        if (creditsStart != null && outroIsNextUp && !triggered && outroAction !== 'none' && ticks >= creditsStart && !credits) {
          if (outroAction === 'auto') out.playNext = true
          else credits = true
        }
      }

      // The card takes the remote the moment it appears, so it waits while a skip button is up. An outro
      // that runs to the very end still moves on, because the ended handler plays the next one.
      if (hasNext && !preroll && !promptVisible && runTicks > 0 && s.nextUpBehavior !== 'disabled') {
        const remaining = runTicks - ticks
        const nearEnd = remaining < nearEndTicks
        if (nearEnd && !triggered) nearEndCard = true
        // Counts down what's left, and a seek back out of the window takes the card down.
        if (s.autoPlay && !triggered) {
          countdown = nearEnd ? Math.ceil(remaining / TICKS) : null
          if (!nearEnd) nearEndCard = false
        }
      }

      out.nextUp = (credits || nearEndCard) && !!hasNext
      // The card coming up clears the prompt away.
      if (out.nextUp && !cardUp) clearPrompt()
      cardUp = out.nextUp
      out.prompt = prompt
      out.lapsed = lapsed
      out.countdown = countdown
      return out
    },
  }
}
