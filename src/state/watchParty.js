// Watch Parties and SyncPlay groups, driving whatever player attaches. Silo and Moonbase rooms
// (services/siloWatchParty.js) feed themselves in as SyncPlay messages, so one path runs all three. Drift is
// corrected by a skip or a wait only, never by playback rate: an LG set freezes after every playbackRate write and
// a Samsung set loses its audio on one.
import * as syncPlay from '../services/syncPlay.js'
import * as serverSocket from '../services/serverSocket.js'
import { watchParty, isRoomPlaying } from '../services/siloWatchParty.js'
import { shellApp } from './shell/shellState.js'
import { api } from '../services/jellyfinApi.js'
import { getCurrentSession } from '../services/playback.js'
import * as videoEngine from './videoEngine.js'
import * as settings from './settings.js'
import { getStore } from './store.js'
import {
  correctionOptions, driftMs, needsSeek, partyHoldBackMs, seekLanded, DRIFT_CHECK_MS, GROUP_SEEK_SETTLE_TIMEOUT_MS,
  PARTY_SEEK_TOLERANCE_MS, PARTY_LANDING_READ_MS,
} from '../utils/syncDrift.js'
import { createSkipGovernor, chooseCorrection, afterResume, STALL_DEBOUNCE_MS } from '../utils/syncCorrection.js'
import { createReadyGate } from '../utils/syncReady.js'
import { createLoadBudget, CONVERGED_MS } from '../utils/syncLoadBudget.js'
import { loadStartLeadMs, nextStartLeadMs, saveStartLeadMs, startDelayMs as groupStartDelayMs, startGapMs, START_STALL_MS } from '../utils/syncStartLead.js'
import { createStarveWatch, CUSHION_SECONDS, CUSHION_MAX_MS } from '../utils/syncStarve.js'

export { watchParty }

const TICKS = 10000000

// Queue entries carry the GUID with dashes, item DTOs without them.
export const sameItemId = (a, b) =>
  !!a && !!b && String(a).replace(/-/g, '').toLowerCase() === String(b).replace(/-/g, '').toLowerCase()

let player = null
let itemId = null
let opened = false
// Held for the group: the server says when and where playback starts. A player opened inside a group waits paused
// for the Unpause, since the server only corrects a joiner's position when its Ready says it's paused.
let hold = false
let processed = null
let commandTimer = null
let commandRunning = false
let suppressBufferingUntil = 0
let resumedAt = 0
let seekPending = null
let seekSettleTimer = null
// A pause the set is sitting out to let the group catch up.
let waitTimer = null
let stallTimer = null
let driftTimer = null
let buffering = false
let offs = []
const governor = createSkipGovernor()
const budget = createLoadBudget()

// How long this set takes from play() to moving on the <video> path (syncStartLead.js). It's the set's own, so it
// carries over from one title to the next and across launches, and the first start of a title, the one everyone
// watches together, begins early too.
let learnedStartLeadMs = loadStartLeadMs()
// How long a seek inside the Silo copy this set already has takes to play: a room's catch-up there aims that far
// ahead, or every one lands short by it and the room corrects again ten seconds later.
let learnedLocalSeekMs = 0
// With no lead yet, the start it's learned on runs late by it, so a set that may pause the room pauses and resumes
// it once, this long after, and the room starts over with the lead. A lead under 250 ms isn't worth that.
const START_RESYNC_RESUME_MS = 1500
const START_RESYNC_MIN_LEAD_MS = 250
// A group seek that hasn't played by then isn't going to.
const SEEK_FLIGHT_TIMEOUT_MS = 15000
let startTiming = null
let flight = null
let resyncTimer = null
// A Silo stream that keeps stalling waits paused for 6 s of it to build up (syncStarve.js).
const starve = createStarveWatch()
let cushion = null
const web = () => !videoEngine.usesAvplay()

let group = null
let groups = []
let playQueue = null
let queueItem = null
let queueSeq = 0
let lastCommand = null
let router = null
let userKey = null
let inited = false
let partyAvailable = false
const listeners = []

export const state = () => ({
  group,
  groups,
  playQueue,
  queueItem,
  inGroup: !!group,
  attachedItemId: player ? itemId : null,
  party: watchParty.state(),
})

// Where Details offers "Watch with group": in a SyncPlay group it plays for the group, and a room's host, or anyone
// on a server that can start a room, picks the title for the room.
const canPickForRoom = () => {
  const s = getStore()
  const room = watchParty.state().room
  const type = s && s.serverType
  const starts = watchParty.backend() === 'moonbase' && partyAvailable && !group && settings.get('syncplayEnabled') !== false &&
    (type !== 'jellyfin' || settings.get('watchPartyService') !== 'syncplay')
  return (type === 'silo' || !!room || starts) && (!room || !!room.isHost)
}

const emit = () => {
  const s = getStore()
  const on = !!group || canPickForRoom()
  if (s && s.watchPartyActive !== on) s.watchPartyActive = on
  listeners.slice().forEach((fn) => fn(state()))
}

export const subscribe = (fn) => {
  init()
  listeners.push(fn)
  return () => {
    const at = listeners.indexOf(fn)
    if (at >= 0) listeners.splice(at, 1)
  }
}

// The party screen hands its router over, so a group that starts something can open the player from anywhere.
export const useRouter = (next) => {
  router = next
}

const forgetGroup = () => {
  queueSeq++
  group = null
  groups = []
  playQueue = null
  queueItem = null
  emit()
}

// SyncPlay runs while signed in to Jellyfin with it switched on. A group belongs to the account that joined it, so
// another sign-in forgets it, and a room that belongs to another login is left.
const syncService = () => {
  const s = getStore()
  const type = s && s.serverType
  const on = !!(s && s.authenticated) && type !== 'emby' && type !== 'plex' && type !== 'silo' && settings.get('syncplayEnabled') !== false
  if (on) syncPlay.start()
  else syncPlay.stop()
  const key = s && s.authenticated ? `${s.serverUrl}|${s.userId}` : ''
  if (key !== userKey) {
    if (userKey !== null) forgetGroup()
    userKey = key
    watchParty.onSessionChanged()
    partyAvailable = false
    if (key) {
      watchParty.available().then((ok) => {
        if (userKey !== key) return
        partyAvailable = !!ok
        emit()
      })
    }
  }
  if (settings.get('syncplayEnabled') === false && group) forgetGroup()
}

export const refreshGroups = async () => {
  groups = await syncPlay.listGroups()
  emit()
  return groups
}

// A group created from over the player starts on what's playing (itemIds), or it sits idle and nobody who joins
// gets the title.
export const createGroup = async (name, itemIds) => {
  const ok = await syncPlay.createGroup(name)
  if (!ok) return ok
  refreshGroups()
  // At the position it's playing from, so the creator isn't sent back to the start.
  if (itemIds && itemIds.length) await syncPlay.setNewQueue(itemIds, 0, player && sameItemId(itemId, itemIds[0]) ? pos() : 0)
  return ok
}

export const joinGroup = async (groupId) => {
  const ok = await syncPlay.joinGroup(groupId)
  if (ok) refreshGroups()
  return ok
}

export const leaveGroup = async () => {
  const ok = await syncPlay.leaveGroup()
  if (ok) {
    group = null
    playQueue = null
    queueItem = null
    emit()
  }
  return ok
}

const queueItemId = () => {
  const list = playQueue && playQueue.Playlist
  if (!list || !list.length) return null
  const entry = list[playQueue.PlayingItemIndex || 0]
  return entry ? entry.ItemId || entry : null
}

// Opens the group's item where the group has got to. A set started at the beginning is only seeked there by the
// server afterwards, which on a transcode means starting the stream twice while everyone waits.
// A room's PlaybackOptions (the pinned file, the audio and the host's subtitles) go along.
export const playItem = (item) => {
  if (!item) return
  if (player && sameItemId(itemId, item.Id)) return
  const ticks = syncPlay.getGroupPositionTicks() || 0
  const o = (playQueue && playQueue.PlaybackOptions) || {}
  const picks = {}
  if (o.mediaSourceId) Object.assign(picks, { mediaSourceId: o.mediaSourceId, pinVersion: true })
  if (o.audioStreamIndex != null) picks.audioStreamIndex = o.audioStreamIndex
  if (o.subtitleStreamIndex != null) picks.subtitleStreamIndex = o.subtitleStreamIndex
  if (player && player.open) {
    player.open(item.Id, ticks, picks)
    return
  }
  if (router) router.to(`/player/${item.Id}`, { startPositionTicks: ticks, resume: true, ...picks })
}

const onPlayQueue = (data) => {
  playQueue = data
  const id = queueItemId()
  if (!id) {
    queueItem = null
    emit()
    return
  }
  const reason = (data && data.Reason) || null
  const startsPlayback = !reason || syncPlay.QUEUE_START_REASONS.indexOf(reason) >= 0
  const publish = (item) => {
    queueItem = item
    emit()
    // Reorders and repeat or shuffle changes arrive the same way and only count when they change what's playing.
    if (!startsPlayback && player && sameItemId(itemId, item.Id)) return
    playItem(item)
  }
  const seq = ++queueSeq
  if (queueItem && sameItemId(queueItem.Id, id)) {
    publish(queueItem)
    return
  }
  api.getItem(id).then((item) => {
    if (item && seq === queueSeq) publish(item)
  }).catch(() => {})
}

const onSyncPlay = (event, data) => {
  if (event === 'groupJoined') {
    group = data
    // Joined with a player up: it waits for the group unless the group is already playing (worked out again
    // whenever the group changes). The next play it makes pauses it.
    if (player) hold = syncPlay.isReadyOwed() || syncPlay.getGroupState() !== 'Playing'
  } else if (event === 'groupLeft') {
    group = null
    playQueue = null
    queueItem = null
    onGroupLeft()
  } else if (event === 'stateUpdate') {
    if (group) group = { ...group, State: data && data.State }
    onStateUpdate()
  } else if (event === 'groupUpdated') {
    refreshGroups()
    return
  } else if (event === 'playbackCommand') {
    lastCommand = data
    onCommand(data)
    return
  } else if (event === 'playQueue') {
    onPlayQueue(data)
    return
  } else {
    return
  }
  emit()
}

// A Watch Party that stops playing (the host went back to the lobby, the item finished, the party ended) brings its
// members back to the room rather than leaving them on a closed player.
let roomWasPlaying = false
const roomStopped = () => {
  const playing = isRoomPlaying(watchParty.state().room)
  if (roomWasPlaying && !playing) {
    const app = shellApp()
    if (app && app.openParty) app.openParty(false)
  }
  roomWasPlaying = playing
}

// Whether the viewer is in a group or a room, which the player's end takes them back to.
export const inPartyOrGroup = () => !!group || !!watchParty.state().room

const init = () => {
  if (inited) return
  inited = true
  syncPlay.addListener(onSyncPlay)
  watchParty.subscribe(() => {
    roomStopped()
    emit()
  })
  serverSocket.onConnectionChange(syncService)
  settings.onChange((keys) => {
    if (keys.indexOf('syncplayEnabled') >= 0) syncService()
    else if (keys.indexOf('watchPartyService') >= 0) emit()
  })
  syncService()
}

// The app starts the engine at boot, so group and room events reach it before the party screen opens.
export const start = init

const pos = () => (player ? Math.floor(player.currentTime() * TICKS) : 0)
const sample = () => ({ isPlaying: !!player && !player.isPaused() && !hold, positionTicks: pos() })

const readyGate = createReadyGate({
  sample,
  isBuffering: () => buffering || !!seekPending,
  report: () => syncPlay.sendReadyRequest(sample),
})

const cancelWait = () => {
  clearTimeout(waitTimer)
  waitTimer = null
}

const clearSeekPending = () => {
  clearTimeout(seekSettleTimer)
  seekSettleTimer = null
  seekPending = null
}

// A set ahead of the room waits the gap out paused, where a seek back would land on a keyframe again.
const holdBack = (ms) => {
  cancelWait()
  if (!player.isPaused()) player.pause()
  waitTimer = setTimeout(() => {
    waitTimer = null
    if (!player) return
    player.play()
    governor.onStart({ nowMs: Date.now(), fromMs: pos() / 10000 })
  }, ms)
}

// A seek on the group's behalf. The server holds the group until this set reports Ready, so the report waits for
// the seek to land, or for the backstop when the firmware never answers it.
// A room's seek can be Silo reloading the stream, which takes longer to land.
const ROOM_SEEK_SETTLE_TIMEOUT_MS = 12000
// A room's reload that lands this close to the target is taken as there, since a paused re-seek reloads it again.
const ROOM_READY_TOLERANCE_MS = 900

// playToSeek runs the seek playing and pauses once it lands: webOS moves its clock for a paused seek but loads
// nothing until it plays, so the picture would only arrive after the group's Unpause.
const landSeek = (target, pauseOnLand, catchUp = false, playToSeek = false) => {
  const reportPaused = () => {
    if (pauseOnLand) readyGate.request()
  }
  // In a watch party a pause ahead of the group stays where it is: the resume holds back by the gap instead.
  const party = syncPlay.isSelfCorrectingRoom()
  if (!needsSeek(pos(), target, party ? PARTY_SEEK_TOLERANCE_MS : undefined) ||
    (party && pauseOnLand && partyHoldBackMs(pos(), target) > 0)) {
    if (pauseOnLand && !player.isPaused()) player.pause()
    reportPaused()
    return
  }
  clearSeekPending()
  const pending = { target }
  seekPending = pending
  const timed = syncPlay.isRoomDriven()
  // A seek inside a Silo copy's playlist loads nothing new, so it neither waits on the budget nor times the next load.
  const inCopy = videoEngine.copyHolds(target / TICKS)
  if (timed && !(web() && inCopy)) budget.onStart(Date.now(), catchUp)
  // On webOS the load is timed from the seek to the picture moving on past it (onTime), with how far from the room
  // a catch-up landed. Tizen's seek resolves once the stream plays there.
  if (timed && web()) flight = { origin: pos(), target, issuedAt: Date.now(), from: null, last: null, catchUp, local: !videoEngine.seeksThroughServer() || inCopy }
  const settle = () => {
    if (seekPending !== pending) return
    clearSeekPending()
    if (timed && !web()) budget.onPlaying(Date.now())
    if (pauseOnLand && playToSeek && player) {
      player.pause()
      // It played on for a moment after landing, and the server sends the seek again for anything over half a
      // second off. A paused seek puts it on the target, unless a room's reload already landed close enough.
      const offMs = Math.abs(pos() - target) / 10000
      if (!(timed && offMs <= ROOM_READY_TOLERANCE_MS) && needsSeek(pos(), target)) player.seek(target / TICKS)
    }
    reportPaused()
    // A seek while the room plays lands on the keyframe after the target, so the lead is read a little later.
    if (party && !pauseOnLand) {
      cancelWait()
      waitTimer = setTimeout(() => {
        waitTimer = null
        const ms = player ? partyHoldBackMs(pos(), syncPlay.getExpectedPositionTicks()) : 0
        if (ms > 0) holdBack(ms)
      }, PARTY_LANDING_READ_MS)
    }
  }
  if (playToSeek && player.isPaused()) player.play()
  const seek = player.seek(target / TICKS)
  if (pauseOnLand && !playToSeek && !player.isPaused()) player.pause()
  Promise.resolve(seek).then(settle, settle)
  seekSettleTimer = setTimeout(settle, timed && !videoEngine.usesAvplay() ? ROOM_SEEK_SETTLE_TIMEOUT_MS : GROUP_SEEK_SETTLE_TIMEOUT_MS)
}

const execute = (command, delay) => {
  const { Command, PositionTicks, When } = command
  governor.cancel()
  cancelWait()
  // The room has moved on from the wait: its command says what to do now.
  endCushion(false)
  commandRunning = true
  suppressBufferingUntil = Date.now() + syncPlay.BUFFERING_SUPPRESS_MS
  if (Command === 'Unpause') {
    hold = false
    resumedAt = Date.now()
    // The sync point is the position at the command's own time, which for a late arrival or an echo isn't now.
    syncPlay.setSyncReference(PositionTicks != null ? PositionTicks : pos(), syncPlay.whenToServerMs(When))
    // On time, the commanded position. Late and not playing, where the group has got to by now. Already playing,
    // the server answers any Ready with the last sync point unchanged, and seeking on that echo restarts the stream.
    let target = null
    // On time in a Watch Party, a gap the start lead already took up needs no seek (startGapMs).
    const timedIn = web() && syncPlay.isRoomDriven() && player.isPaused() && startGapMs(pos(), PositionTicks) != null
    if (delay > 0) target = timedIn ? null : PositionTicks
    else if (player.isPaused()) target = syncPlay.getAdjustedPosition(PositionTicks, When)
    // In a Watch Party a load lands late by its load time, so aim ahead by what the last one took, and don't start
    // another until the budget allows.
    let catchUp = false
    if (target != null && syncPlay.isRoomDriven() && needsSeek(pos(), target)) {
      if (web() && !player.isPaused() && starve.isStarving(Date.now())) {
        // Ahead is where the stream hasn't arrived yet, and a seek there only stalls it again.
        target = null
      } else if (web() && videoEngine.copyHolds((target + learnedLocalSeekMs * 10000) / TICKS)) {
        // Already in the copy's playlist: no load to wait on, only the seek's own time to aim past.
        target += learnedLocalSeekMs * 10000
      } else if (seekPending || !budget.allows(Date.now())) {
        target = null
      } else {
        catchUp = true
        target += budget.leadMs() * 10000
      }
    }
    // A seek near the end would end the item.
    const runSeconds = player.duration ? player.duration() : 0
    if (target != null && runSeconds > 0) target = Math.min(target, Math.floor(runSeconds * TICKS))
    // webOS holds back only a set that's still paused, since pausing a playing one stalls it again.
    const holdMs = target != null && syncPlay.isSelfCorrectingRoom() && (videoEngine.usesAvplay() || player.isPaused()) ? partyHoldBackMs(pos(), target) : 0
    if (holdMs > 0) {
      holdBack(holdMs)
    } else {
      if (target != null) landSeek(target, false, catchUp)
      // A plain start from paused in a Watch Party, with no seek to wait on, is timed for the next start's lead.
      startTiming = web() && syncPlay.isRoomDriven() && player.isPaused() && !seekPending ? { calledAtMs: Date.now(), fromMs: pos() / 10000 } : null
      player.play()
      // The set takes a moment to actually move, and a drift read before it does isn't one a skip could close.
      governor.onStart({ nowMs: Date.now(), fromMs: pos() / 10000, targetMs: (target != null ? target : pos()) / 10000 })
    }
  } else if (Command === 'Pause') {
    hold = false
    player.pause()
    syncPlay.clearSyncReference()
    const web = !videoEngine.usesAvplay()
    // On webOS a seek made paused only runs at the next play, and on a remux that play can stall for good, so in a
    // room that corrects itself the pause stays put. A Silo room's reload runs playing.
    if (PositionTicks != null && !(web && syncPlay.isSelfCorrectingRoom())) landSeek(PositionTicks, true, false, web && syncPlay.isRoomDriven())
  } else if (Command === 'Seek') {
    // The server holds everyone until they report Ready at the new position, then unpauses them together.
    if (PositionTicks != null) {
      syncPlay.setSyncReference(PositionTicks)
      landSeek(PositionTicks, true, false, !videoEngine.usesAvplay())
    }
  }
  commandRunning = false
}

// In a Watch Party, a start from paused runs early by the time this set takes to get moving, plus how far it sits
// behind the start's position (or later when it's ahead), so it plays in step with the group.
const startLeadMs = (command) => {
  if (!web() || !syncPlay.isRoomDriven() || command.Command !== 'Unpause' || !player.isPaused() || seekPending) return 0
  return learnedStartLeadMs + (startGapMs(pos(), command.PositionTicks) || 0)
}

// Each command runs once, at the time the server set for it. A Stop closes the player at any point. Anything else
// that arrives before the stream is open is dropped: the Ready this set sends once open has the server line it up
// again.
const onCommand = (command) => {
  if (!player || !command || command === processed) return
  if (command.Command === 'Stop') {
    processed = command
    clearTimeout(commandTimer)
    commandTimer = null
    if (player.stop) player.stop()
    return
  }
  if (!opened) return
  processed = command
  clearTimeout(commandTimer)
  commandTimer = null
  const delay = syncPlay.getDelayToWhen(command.When)
  const run = () => {
    commandTimer = null
    if (player) execute(command, delay)
  }
  // The delay stays the one to the command's time, while the run goes early by the start lead.
  const early = delay - startLeadMs(command)
  if (early > 50) commandTimer = setTimeout(run, early)
  else run()
}

// The server marks every member as buffering after a group seek or a change of item and waits for each one to
// report Ready, so a set that never stalled still has to answer.
const onStateUpdate = () => {
  if (player && opened) readyGate.request()
}

// Leaving the group while still held would leave the set sitting paused, so it goes on by itself.
const onGroupLeft = () => {
  if (player && hold) player.play()
  hold = false
  clearSeekPending()
}

// Commands alone can't hold the set in step, because the decoder loses a little wall clock time on every rebuffer.
const checkDrift = () => {
  if (!player || !group || player.isPaused() || commandRunning || seekPending) return
  const correction = correctionOptions(settings.all())
  if (!correction.enabled) return
  const expected = syncPlay.getExpectedPositionTicks(correction.extraOffsetMs)
  const drift = driftMs(pos(), expected)
  if (syncPlay.isRoomDriven()) {
    // A Silo room corrects the set itself, through the load budget.
    if (drift != null && Math.abs(drift) <= CONVERGED_MS) budget.onConverged()
    return
  }
  const nowMs = Date.now()
  const positionMs = pos() / 10000
  const verdict = governor.evaluate({ nowMs, positionMs, driftMs: drift, isPlaying: true, isBuffering: buffering })
  if (verdict === 'defer') return
  const options = syncPlay.isSelfCorrectingRoom() ? afterResume(correction, nowMs - resumedAt) : correction
  const action = chooseCorrection(drift, verdict, options, governor.seekAllowanceMs())
  if (action.type === 'skip') {
    const targetTicks = expected + action.aheadMs * 10000
    governor.onSkip({ nowMs, fromMs: positionMs, targetMs: targetTicks / 10000, driftMs: drift })
    commandRunning = true
    suppressBufferingUntil = Date.now() + syncPlay.BUFFERING_SUPPRESS_MS
    const done = () => {
      commandRunning = false
    }
    Promise.resolve(player.seek(targetTicks / TICKS)).then(done, done)
  } else if (action.type === 'wait') {
    cancelWait()
    player.pause()
    waitTimer = setTimeout(() => {
      waitTimer = null
      if (player) player.play()
    }, action.ms)
  }
}

// A start held for the group is loaded and waiting (videoEngine 'held'): the set is ready.
const onHeld = () => {
  opened = true
  buffering = false
  if (group) readyGate.request()
}

const onPlaying = () => {
  opened = true
  buffering = false
  if (!group) return
  if (hold && !seekPending) player.pause()
  else governor.onStart({ nowMs: Date.now(), fromMs: pos() / 10000 })
  clearTimeout(stallTimer)
  readyGate.request()
}

// A stall is reported once it has lasted and the position really stopped, since the group stops for every report.
// One inside the window after a command's seek is that seek, and is checked again once the window runs out.
// A Silo stream that stalls twice in 30 s isn't keeping up: the set waits paused for 6 s of it (10 s at most),
// reports Buffering once so the room pauses for it, and plays on. Its own seeks' stalls don't count.
const startCushion = () => {
  player.pause()
  const since = Date.now()
  cushion = setInterval(() => {
    if (videoEngine.bufferedAhead() >= CUSHION_SECONDS || Date.now() - since >= CUSHION_MAX_MS) endCushion(true)
  }, 250)
  syncPlay.sendBufferingRequest(sample)
}
const endCushion = (playOn) => {
  if (!cushion) return
  clearInterval(cushion)
  cushion = null
  if (playOn && player) player.play()
}

const onBuffering = (isBuffering) => {
  buffering = isBuffering
  if (!group || !player) return
  clearTimeout(stallTimer)
  if (!isBuffering) {
    if (opened) readyGate.request()
    return
  }
  if (web() && !player.isPaused() && !cushion && syncPlay.isRoomDriven() && videoEngine.seeksThroughServer() &&
    Date.now() >= suppressBufferingUntil && starve.onStall(Date.now())) {
    startCushion()
    return
  }
  const remaining = suppressBufferingUntil - Date.now()
  const before = pos()
  stallTimer = setTimeout(() => {
    if (!player || !buffering || player.isPaused() || pos() !== before) return
    syncPlay.sendBufferingRequest(sample)
  }, remaining > 0 ? remaining + 100 : STALL_DEBOUNCE_MS)
}

const onTime = () => {
  opened = true
  if (web() && group) learnFromTime()
  governor.observe({ nowMs: Date.now(), positionMs: pos() / 10000, isPlaying: !player.isPaused(), isBuffering: buffering })
}

// The start lead from a timed start, and a group seek's load time from its flight.
const learnFromTime = () => {
  const ticks = pos()
  const nowMs = Date.now()
  const timing = startTiming
  if (timing) {
    const took = groupStartDelayMs({ ...timing, positionMs: ticks / 10000, atMs: nowMs })
    if (took != null) {
      startTiming = null
      const first = learnedStartLeadMs === 0
      learnedStartLeadMs = nextStartLeadMs(learnedStartLeadMs, took)
      saveStartLeadMs(learnedStartLeadMs)
      // A guest the room doesn't let pause sends nothing, and is in step from the next start on.
      if (first && learnedStartLeadMs >= START_RESYNC_MIN_LEAD_MS && syncPlay.isRoomDriven()) {
        syncPlay.sendPauseRequest()
        clearTimeout(resyncTimer)
        resyncTimer = setTimeout(() => syncPlay.sendPlayRequest(), START_RESYNC_RESUME_MS)
      }
    } else if (nowMs - timing.calledAtMs > START_STALL_MS) startTiming = null
  }
  const f = flight
  if (!f) return
  // Moving forward counts from the last time it stood still or jumped back, and only once it reached the target.
  if (!seekLanded(f.origin, f.target, ticks) || player.isPaused() || buffering || f.last == null || ticks <= f.last) f.from = ticks
  f.last = ticks
  const movedMs = (ticks - f.from) / 10000
  if (movedMs > 250) {
    flight = null
    const expected = syncPlay.getExpectedPositionTicks()
    budget.onPlaying(nowMs - movedMs, f.catchUp && expected != null ? Math.round((ticks - expected) / 10000) : null)
    if (f.local && videoEngine.seeksThroughServer()) learnedLocalSeekMs = nextStartLeadMs(learnedLocalSeekMs, nowMs - movedMs - f.issuedAt)
  } else if (nowMs - f.issuedAt > SEEK_FLIGHT_TIMEOUT_MS) flight = null
}

/**
 * The Player hands over its controls for one item: { itemId, play(), pause(), seek(seconds) (may return a promise),
 * currentTime() (seconds), isPaused(), stop() (leave the player), open(itemId, startTicks) (play another item in
 * place) }. Call it again for each item, before the stream opens, and detach() when the player closes.
 */
export const attach = (controls) => {
  init()
  detach()
  player = controls
  itemId = controls.itemId || null
  opened = false
  buffering = false
  governor.reset()
  budget.reset()
  starve.reset()
  startTiming = null
  flight = null
  // A command already pending when the player opened has had its effect. Joining an idle group gets a Stop, and
  // replaying that here would close the player the moment the group starts something.
  processed = lastCommand
  hold = false
  if (group) {
    const groupState = syncPlay.getGroupState()
    hold = syncPlay.isReadyOwed() || groupState !== 'Playing'
    // Playing something else inside a Jellyfin group puts it up for the whole group. Only a fresh play does: the
    // player moving on to its next item doesn't.
    if (controls.fresh && !syncPlay.isRoomDriven() && !syncPlay.isSelfCorrectingRoom() && itemId && !sameItemId(queueItemId(), itemId)) {
      syncPlay.setNewQueue([itemId])
    }
  }
  const detachRoom = syncPlay.attachPlayer({
    // A pause taken to let the room catch up still reports as playing.
    sample: () => (waitTimer ? { ...sample(), isPlaying: true } : sample()),
    sessionId: () => {
      const session = getCurrentSession()
      return (session && session.playSessionId) || null
    },
    // Waiting for the stream to build up is a stall too.
    isBuffering: () => buffering || !opened || !!cushion,
    seekPending: () => !!seekPending,
  })
  // The room hears of the session once the player is there to answer its tick.
  if (group) syncPlay.playerSessionOpened()
  offs = [
    detachRoom,
    videoEngine.on('held', onHeld),
    videoEngine.on('playing', onPlaying),
    videoEngine.on('buffering', onBuffering),
    videoEngine.on('time', onTime),
  ]
  driftTimer = setInterval(checkDrift, DRIFT_CHECK_MS)
  emit()
}

export const detach = () => {
  if (!player) return
  offs.forEach((off) => off())
  offs = []
  clearInterval(driftTimer)
  clearTimeout(commandTimer)
  clearTimeout(stallTimer)
  driftTimer = commandTimer = stallTimer = null
  cancelWait()
  clearSeekPending()
  readyGate.cancel()
  endCushion(false)
  clearTimeout(resyncTimer)
  startTiming = null
  flight = null
  player = null
  itemId = null
  hold = false
  emit()
}

/**
 * A play, pause or seek the viewer asked for. Inside a group it goes to the group, which then moves everyone, and
 * this returns true: the Player mustn't act on it locally. Outside a group it returns false.
 */
export const notifyLocal = (action, positionSeconds) => {
  if (!group || commandRunning) return false
  if (action === 'play') syncPlay.sendPlayRequest()
  else if (action === 'pause') syncPlay.sendPauseRequest()
  else if (action === 'seek') syncPlay.sendSeekRequest(Math.max(0, Math.floor((positionSeconds || 0) * TICKS)))
  else return false
  return true
}

export const isInGroup = () => !!group

// Whether the item being attached waits for the group before it plays, so the player opens it held.
export const holdsStart = () => !!(player && group && hold)
