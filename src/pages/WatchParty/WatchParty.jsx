import $L from '../../services/i18n.js'
import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import Keyboard from '../../ui/components/Keyboard.jsx'
import PartyPaint from '../../ui/components/party/PartyPaint.jsx'
import { formatRoomCode, mergePartyRooms, syncPlayGroupFrom, isRoomPlaying, partySource } from '../../services/siloWatchParty.js'
import { listGroups, setShuffleMode, setRepeatMode } from '../../services/syncPlay.js'
import { getImageUrl } from '../../utils/helpers.js'
import * as party from '../../state/watchParty.js'
import * as settings from '../../state/settings.js'
import { getStore } from '../../state/store.js'
import { shellApp } from '../../state/shell/shellState.js'
import { router } from '../../app/router.js'
import { openNativeInput, usesNativeKeyboard } from '../../ui/components/account/nativeInput.js'
import { qrDataUrl } from '../../ui/components/account/qr.js'
import { hex } from '../../ui/color.js'
import { shadowColor } from '../../ui/theme.js'
import { perfTier } from '../../ui/tier.js'
import { statusLabel, endedText, partyErrorText, subtitleChoices, choiceMatches, resumeHint, resumeLabel } from './partyText.js'
import { loadParticipantUsers, participantAvatar } from './participantAvatars.js'
import { layoutDialog } from './views.js'
import { takeSyncPlayNext } from './syncPlayNext.js'
import { scrollFor } from '../../ui/components/party/sheetMath.js'
import { spotlightMove } from '../../ui/components/party/spotlight.js'
import { fontsReady } from '../../ui/components/party/measure.js'
import { fontsReady as textFontsReady } from '../../ui/components/library/measure.js'

const { watchParty } = party

// Watch Parties and SyncPlay in one dialog. App draws it over the page, which stays live and dimmed
// behind it.
// shortcut: the backdrop blur on the high tier is left out (the 97% fill of the low and mid tiers
// stands in), since what it would blur is the live page. Add it if the renderer gets a blur of what
// lies under a node.
const POLL_MS = 5000
const ROOMS_POLL_MS = 10000
const HEADER_H = 85
const INPUT_MAX = { code: 512, pin: 8, search: 512, name: 64, roomPin: 8 }
const DIGITS = { pin: true, roomPin: true }
const REPEAT_CYCLE = ['RepeatNone', 'RepeatOne', 'RepeatAll']
const EMPTY = { boxes: [], rings: [], pics: [], boxes2: [], rings2: [], texts: [] }
const EDGE = { width: 1, color: hex('#ffffff1f') }
const SHADOW = { color: shadowColor('#00000066'), x: 0, y: 8, blur: 32, spread: 0 }

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const pick = (out) => ({ boxes: out.boxes, rings: out.rings, pics: out.pics, boxes2: out.boxes2, rings2: out.rings2, texts: out.texts })

const roomArt = (serverUrl, room) => {
  if (!room.selectedContentId) return []
  const types = room.contentType === 'Episode' ? ['Primary'] : ['Backdrop', 'Primary']
  return types.map((t) => getImageUrl(serverUrl, room.selectedContentId, t, { maxWidth: 480, quality: 80 })).filter(Boolean)
}

export default function WatchParty(props) {
  const store = getStore()
  const [shown, setShown] = createSignal(false)
  const [box, setBox] = createSignal({ x: 0, y: 0, w: 0, h: 0, viewH: 0 }, { equals: same })
  const [scrollY, setScrollY] = createSignal(0)
  const [head, setHead] = createSignal(EMPTY, { equals: same })
  const [body, setBody] = createSignal(EMPTY, { equals: same })
  const [bodyH, setBodyH] = createSignal(0)
  const [editing, setEditing] = createSignal(false)
  // 85% opaque on the high tier, which would sit over a blur, and 97% on the low and mid tiers, which drop it.
  const frame = perfTier() === 'high' ? '#1e1e28d9' : '#1e1e28f7'
  const my = {
    gone: false,
    available: null,
    turnedOff: false,
    forceSyncPlay: takeSyncPlayNext(),
    rooms: [],
    results: [],
    values: { code: '', pin: '', search: '', name: '', roomPin: '' },
    picked: null,
    roomPin: null,
    pinBad: false,
    everyoneAllowed: true,
    focus: null,
    kind: '',
    focusables: [],
    users: null,
    model: null,
    editingId: null,
    roomsAt: 0,
    roomItemFor: undefined,
    roomItem: null,
    qrFor: null,
    qr: '',
    resumeKey: null,
    resumeAnswer: null,
    subtitleNext: null,
    creating: false,
    leaving: false,
    busy: false,
  }
  let root
  let kb

  const leave = () => {
    const app = shellApp()
    if (app) app.closeOverlay()
  }
  const mode = (st) => {
    const type = store.serverType
    if (st.party.room || type === 'silo') return 'party'
    if (type === 'jellyfin' && (st.inGroup || my.forceSyncPlay || my.available === false)) return 'syncplay'
    return 'party'
  }
  const poll = async (first) => {
    if (my.gone || (typeof document !== 'undefined' && document.hidden)) return
    const st = party.state()
    const m = mode(st)
    if (m === 'syncplay' && !st.inGroup) {
      party.refreshGroups()
      return
    }
    if (m !== 'party' || st.party.room || watchParty.backend() !== 'moonbase') return
    if (!first && Date.now() - my.roomsAt < ROOMS_POLL_MS) return
    my.roomsAt = Date.now()
    const jellyfin = store.serverType === 'jellyfin'
    const [rooms, groups] = await Promise.all([
      watchParty
        .available()
        .then((ok) => (ok ? watchParty.listRooms() : []))
        .catch(() => null),
      jellyfin ? listGroups() : [],
    ])
    if (my.gone || rooms === null) return
    my.rooms = mergePartyRooms(rooms, groups.map(syncPlayGroupFrom))
    render()
  }
  const checkBackend = async () => {
    const available = await watchParty.available()
    if (my.gone) return
    my.available = available
    if (!available && watchParty.backend() === 'moonbase') my.turnedOff = Boolean(await watchParty.config())
    if (my.gone) return
    render()
    poll(true)
  }
  const loadRoomItem = (room) => {
    const id = room && room.selectedContentId
    if (id === my.roomItemFor) return
    my.roomItemFor = id
    my.roomItem = null
    if (!id) return
    watchParty.selectedItem().then((raw) => {
      if (my.gone || my.roomItemFor !== id) return
      my.roomItem = raw
      render()
    })
  }
  const primary = (room, st, busy) => {
    const playing = isRoomPlaying(room)
    if (playing && room.isHost) return { id: 'primary', act: 'lobby', label: $L('Back to the lobby'), disabled: busy }
    if (playing && !party.sameItemId(room.selectedContentId, st.attachedItemId)) {
      return { id: 'primary', act: 'playNow', label: $L('Play now'), disabled: busy }
    }
    if (!playing && room.isHost && room.selectedContentId) {
      return { id: 'primary', act: 'startAll', label: $L('Start for everyone'), disabled: busy }
    }
    return null
  }
  // A Silo room adds Resume where the room got to, and Subtitles for everyone.
  const siloRoomParts = (room, st, p) => {
    // Asked again when the staged title or who's connected changes.
    const who = room.members
      .filter((mem) => mem.connected)
      .map((mem) => mem.profileId)
      .join(',')
    const key = !isRoomPlaying(room) && room.isHost && room.selectedContentId ? `${room.selectedContentId}|${who}` : null
    if (key !== my.resumeKey) {
      my.resumeKey = key
      if (key) {
        watchParty.resumePoint().then((point) => {
          if (my.gone || my.resumeKey !== key) return
          my.resumeAnswer = { key, point }
          render()
        })
      }
    }
    const answered = !!key && !!my.resumeAnswer && my.resumeAnswer.key === key
    const resume = answered ? my.resumeAnswer.point : null
    let main = primary(room, st, p.busy)
    let secondary = null
    if (main && main.act === 'startAll') {
      if (resume) {
        main = { id: 'primary', act: 'resume', seconds: resume.seconds, label: resumeLabel(resume.seconds), disabled: p.busy }
        secondary = { id: 'secondary', kind: 'plain', label: $L('Start from the beginning'), disabled: p.busy }
      } else {
        // Shown but not pressable while the lookup is out, so focus still lands on it.
        main = { ...main, disabled: p.busy || (!!key && !answered) }
      }
    }
    let subtitleLabel = null
    if (p.groupSubtitlesSupported && room.selectedContentId) {
      const choices = subtitleChoices(my.roomItem ? partySource(my.roomItem, room.selectedFileId) : null)
      const at = Math.max(
        0,
        choices.findIndex((c) => choiceMatches(c, p.groupSubtitle)),
      )
      my.subtitleNext = choices[(at + 1) % choices.length]
      subtitleLabel = choices[at].label
    }
    return { primary: main, secondary, resumeNote: secondary && resume ? resumeHint(resume, room) : '', subtitleLabel }
  }
  const model = () => {
    const st = party.state()
    const p = st.party
    const v = my.values
    const serverUrl = store.serverUrl
    const jellyfin = store.serverType === 'jellyfin'
    if (mode(st) === 'syncplay') {
      const avatarFor = (name) => participantAvatar(my.users, serverUrl, name)
      if (!st.inGroup) {
        return { kind: 'syncLobby', title: $L('SyncPlay'), groups: st.groups, name: v.name, creating: my.creating, avatarFor }
      }
      const listed = st.groups.find((x) => x.GroupId === st.group.GroupId)
      const queue = (st.playQueue && st.playQueue.Playlist) || []
      return {
        kind: 'syncGroup',
        title: $L('SyncPlay'),
        avatarFor,
        leaving: my.leaving,
        group: { ...st.group, Participants: (listed || st.group).Participants || [] },
        self: String((store.user && store.user.Name) || '')
          .trim()
          .toLowerCase(),
        queueItem: st.queueItem,
        queueLength: queue.length,
        queueIndex: st.playQueue && st.playQueue.PlayingItemIndex != null ? st.playQueue.PlayingItemIndex : -1,
        showWatch: !!st.queueItem && !party.sameItemId(st.queueItem.Id, st.attachedItemId),
        shuffle: (st.playQueue && st.playQueue.ShuffleMode) === 'Shuffle',
        repeat: !!st.playQueue && !!st.playQueue.RepeatMode && st.playQueue.RepeatMode !== 'RepeatNone',
        repeatLabel: { RepeatOne: $L('One'), RepeatAll: $L('All') }[st.playQueue && st.playQueue.RepeatMode] || $L('Off'),
      }
    }
    const room = p.room
    const moonbase = room ? p.backend === 'moonbase' : watchParty.backend() === 'moonbase'
    // The PIN prompt shows its own error, and a PIN being asked for isn't one.
    const error = moonbase ? !p.pinRequest && p.errorCode !== 'pin_required' && partyErrorText(p.errorCode, p.error) : p.error
    const base = { error: error || '', busy: p.busy }
    if (!room || !room.isVoting) my.results = []
    if (!room) {
      my.picked = null
      my.roomPin = null
    }
    if (room) {
      loadRoomItem(room)
      const lobby = {
        ...base,
        room,
        item: my.roomItem,
        primary: primary(room, st, p.busy),
        suggestions: p.suggestions,
        results: my.results,
        search: v.search,
        avatarFor: (id) => watchParty.avatarUrlFor(id) || '',
        picked: my.picked,
        roomPin: my.roomPin == null ? null : v.roomPin,
        pinBad: my.pinBad,
        everyoneAllowed: my.everyoneAllowed,
      }
      if (moonbase) {
        const link = watchParty.inviteUrl()
        if (link !== my.qrFor) {
          my.qrFor = link
          my.qr = qrDataUrl(link)
        }
        return { ...lobby, kind: 'lobby', title: $L('Your watch party'), note: statusLabel(room, p.connected), code: formatRoomCode(room.code), qr: my.qr }
      }
      return { ...lobby, ...siloRoomParts(room, st, p), kind: 'siloRoom', title: $L('Watch Party'), status: statusLabel(room, p.connected) }
    }
    const ended = p.endedReason ? endedText(p.endedReason) : ''
    if (moonbase && p.pinRequest) {
      const wrong = p.errorCode === 'wrong_pin' || p.errorCode === 'too_many_attempts'
      return {
        ...base,
        kind: 'pin',
        title: $L('Watch Parties'),
        pin: v.pin,
        wrong: wrong ? partyErrorText(p.errorCode) : '',
        heading: p.pinRequest.hostName ? $L("Enter the PIN for {name}'s party").replace('{name}', p.pinRequest.hostName) : $L('Enter the room PIN'),
      }
    }
    if (moonbase) {
      return {
        ...base,
        kind: 'rooms',
        title: $L('Watch Parties'),
        supported: my.available,
        turnedOff: my.turnedOff,
        turnedOffText: partyErrorText('disabled'),
        jellyfin,
        ended,
        code: v.code,
        rooms: my.rooms.map((r) => ({ ...r, art: roomArt(serverUrl, r) })),
      }
    }
    return { ...base, kind: 'siloNone', title: $L('Watch Party'), supported: my.available, ended, code: v.code }
  }
  const defaultFocus = (kind, focusables) => {
    const order =
      {
        lobby: ['primary', 'self'],
        siloRoom: ['primary', 'self'],
        pin: ['pin'],
        rooms: ['start'],
        siloNone: ['start'],
        syncLobby: ['name'],
        syncGroup: ['watch', 'leave'],
      }[kind] || []
    const ids = focusables.map((f) => f.id)
    return order.find((id) => ids.indexOf(id) >= 0) || 'close'
  }
  const focusablesOf = (laid) => laid.head.focusables.concat(laid.body.focusables.map((f) => ({ ...f, y: f.y + HEADER_H, body: true })))
  const paint = (laid) => {
    const dh = Math.min(laid.maxH, HEADER_H + laid.bodyH)
    const viewH = dh - HEADER_H
    setBox({ x: Math.round((1920 - laid.w) / 2), y: Math.round((1080 - dh) / 2), w: laid.w, h: dh, viewH })
    setHead(pick(laid.head))
    setBody(pick(laid.body))
    setBodyH(laid.bodyH)
    const f = my.focusables.find((x) => x.id === my.focus)
    if (f && f.body) setScrollY(scrollFor(scrollY(), { y: f.y - HEADER_H, h: f.h }, viewH, laid.bodyH))
  }
  const render = () => {
    if (my.gone) return
    const m = model()
    my.model = m
    let laid = layoutDialog(m, my.focus)
    let focusables = focusablesOf(laid)
    if (m.kind !== my.kind || !focusables.some((f) => f.id === my.focus)) {
      my.kind = m.kind
      my.focus = defaultFocus(m.kind, focusables)
      setScrollY(0)
      laid = layoutDialog(m, my.focus)
      focusables = focusablesOf(laid)
    }
    my.focusables = focusables
    paint(laid)
  }
  // Focus moves by what's on screen, so the scrolled body and the fixed header are measured where they sit now.
  const move = (dir) => {
    const onScreen = my.focusables.map((f) => (f.body ? { ...f, y: f.y - scrollY() } : f))
    const next = spotlightMove(onScreen, my.focus, dir)
    if (!next) return
    my.focus = next
    render()
  }

  // The Magic Remote's cursor (app/pointer.js): the dialog's controls in its own coordinates, a
  // scrolling body's cut to its window. One in full view takes focus on hover; one the body would
  // scroll to takes it on a click.
  const pointSpots = () => {
    const top = HEADER_H
    const bottom = HEADER_H + box().viewH
    return my.focusables.map((f) => {
      if (!f.body) return { f, it: { x: f.x, y: f.y, w: f.w, h: f.h }, whole: true }
      const y0 = f.y - scrollY()
      const y = Math.max(top, y0)
      const h = Math.min(bottom, y0 + f.h) - y
      return h > 0 ? { f, it: { x: f.x, y, w: f.w, h }, whole: h >= f.h - 1 } : null
    })
  }
  const pointAt = (i, click) => {
    const s = pointSpots()[i]
    if (editing() || !s || (!click && (!s.whole || my.focus === s.f.id))) return false
    if (my.focus !== s.f.id) {
      my.focus = s.f.id
      render()
    }
    return click
  }

  const onKeyboardChange = (text) => {
    const id = my.editingId
    if (!id) return
    let next = String(text || '')
    if (DIGITS[id]) next = next.replace(/\D/g, '')
    next = next.slice(0, INPUT_MAX[id])
    if (id === 'roomPin') my.pinBad = false
    my.values[id] = next
    render()
  }
  const closeKeyboard = () => {
    setEditing(false)
    my.editingId = null
    if (root) root.setFocus()
    render()
  }
  const setRoomPin = async () => {
    const pin = my.values.roomPin
    if (!/^\d{4,8}$/.test(pin)) {
      my.pinBad = true
      render()
      return
    }
    if (await watchParty.setPin(pin)) {
      my.roomPin = null
      my.values.roomPin = ''
      my.focus = 'pinRow'
    }
    render()
  }
  const search = async () => {
    try {
      my.results = await watchParty.searchMovies(my.values.search)
    } catch (e) {
      my.results = []
    }
    render()
  }
  // Done acts like pressing Enter in the field.
  const onKeyboardClose = (submitted) => {
    const id = my.editingId
    closeKeyboard()
    if (!submitted) return
    if (id === 'code') activate('join')
    else if (id === 'pin') activate('pinJoin')
    else if (id === 'search') search()
    else if (id === 'name') activate('create')
    else if (id === 'roomPin') setRoomPin()
  }
  // The TV's keyboard types into a real input laid over the field.
  const openNative = () => {
    const id = my.editingId
    const f = (my.focusables || []).find((x) => x.id === id)
    const b = box()
    const rect = f ? { x: b.x + f.x, y: b.y + (f.body ? f.y - scrollY() : f.y), w: f.w, h: f.h } : { x: b.x, y: b.y + HEADER_H, w: b.w, h: 66 }
    const opened = openNativeInput({ value: my.values[id], maxLength: INPUT_MAX[id], rect, onChange: onKeyboardChange, onClose: onKeyboardClose })
    if (!opened) onKeyboardClose(false)
  }
  const openKeyboard = (id) => {
    my.editingId = id
    setEditing(true)
    if (usesNativeKeyboard()) return openNative()
    kb.open({ value: my.values[id], purpose: DIGITS[id] ? 'numeric' : 'text', maxLength: INPUT_MAX[id] })
    kb.setFocus()
  }

  // Moonbase's Start makes a SyncPlay group instead on Jellyfin when Moonbase can't host one or the setting says so.
  const start = (p) => {
    if (my.kind === 'siloNone') {
      if (!p.busy && my.available === true) watchParty.create()
      return
    }
    if (p.busy || my.available === null) return
    const jellyfin = store.serverType === 'jellyfin'
    if (jellyfin && (my.available === false || settings.get('watchPartyService') === 'syncplay')) {
      my.forceSyncPlay = true
      render()
      return
    }
    watchParty.create()
  }
  const leaveParty = async (p) => {
    if (p.room) {
      watchParty.leave()
      return
    }
    if (my.leaving) return
    my.leaving = true
    render()
    await party.leaveGroup()
    my.leaving = false
    render()
  }
  const createGroup = async () => {
    const name = my.values.name.trim()
    if (!name || my.creating) return
    my.creating = true
    render()
    my.forceSyncPlay = true
    // Opened over the player, the group starts on what's playing.
    const playing = party.state().attachedItemId
    if (await party.createGroup(name, playing ? [playing] : undefined)) my.values.name = ''
    my.creating = false
    render()
  }
  const activateItem = async (id, p) => {
    const sep = id.indexOf(':')
    const kind = id.slice(0, sep)
    const rest = id.slice(sep + 1)
    const found = p.suggestions.find((x) => x.id === rest)
    if (kind === 'm') {
      // A host picks another member to show Make host and Remove under them, and picks them again to hide those.
      if (p.room && p.room.isHost) my.picked = my.picked === rest ? null : rest
      render()
    } else if (kind === 'a') {
      const movie = my.results.find((r) => r.Id === rest)
      if (movie && !p.busy) watchParty.suggestMovie(movie)
    } else if (kind === 'v' && found) {
      watchParty.vote(found, !found.votedByMe)
    } else if (kind === 'p' && found && !p.busy) {
      watchParty.pickSuggestion(found)
    } else if (kind === 'x' && found && !p.busy) {
      watchParty.removeSuggestion(found)
    } else if (kind === 'g') {
      if (my.busy) return
      my.busy = true
      await party.joinGroup(rest)
      my.busy = false
    } else if (kind === 'r') {
      const picked = my.rooms.find((r) => `${r.kind}:${r.roomId}` === rest)
      if (!picked || p.busy) return
      if (picked.kind !== 'syncplay') {
        watchParty.joinRoom(picked)
        return
      }
      if (await party.joinGroup(picked.roomId)) my.forceSyncPlay = true
      render()
    }
  }
  const activate = async (id) => {
    const st = party.state()
    const p = st.party
    const v = my.values
    if (id === 'close') return leave()
    if (INPUT_MAX[id] !== undefined) return openKeyboard(id)
    if (id === 'start') return start(p)
    if (id === 'join') {
      if (!v.code.trim() || p.busy) return
      if (await watchParty.join(v.code)) v.code = ''
      return render()
    }
    if (id === 'pinJoin') {
      if (v.pin.length < 4 || p.busy) return
      if (!(await watchParty.joinWithPin(v.pin))) v.pin = ''
      return render()
    }
    if (id === 'pinCancel') {
      v.pin = ''
      return watchParty.cancelPin()
    }
    if (id === 'primary' || id === 'secondary') {
      const b = p.room && my.model && my.model[id]
      if (!b || b.disabled) return
      if (b.act === 'lobby') watchParty.stopPlayback()
      else if (b.act === 'playNow') watchParty.openPlayer()
      else watchParty.startPlayback(b.act === 'resume' ? b.seconds : 0)
      return
    }
    if (id === 'guests') {
      if (p.room && !p.busy) watchParty.setGuestsCanPause(!p.room.guestsCanPause)
      return
    }
    if (id === 'subtitles') {
      const next = my.subtitleNext
      if (p.room && !p.busy && next) watchParty.setGroupSubtitle(next.track, next.off)
      return
    }
    if (id === 'voting') {
      if (p.room && !p.busy) watchParty.setVoting(!p.room.isVoting)
      return
    }
    if (id === 'leave') return leaveParty(p)
    if (id === 'end') {
      if (!p.busy) watchParty.end()
      return
    }
    if (id === 'create') return createGroup()
    if (id === 'watch') return party.playItem(st.queueItem)
    if (id === 'shuffle') {
      const m = (st.playQueue && st.playQueue.ShuffleMode) || 'Sorted'
      return setShuffleMode(m === 'Sorted' ? 'Shuffle' : 'Sorted')
    }
    if (id === 'repeat') {
      const m = (st.playQueue && st.playQueue.RepeatMode) || 'RepeatNone'
      return setRepeatMode(REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(m) + 1) % REPEAT_CYCLE.length])
    }
    if (id === 'everyone') {
      if (p.room && !p.busy) watchParty.setEveryoneControls(!p.room.everyoneControls)
      return
    }
    if (id === 'pinRow') {
      if (!p.room || p.busy) return
      if (p.room.hasPin) return watchParty.setPin(null)
      my.roomPin = ''
      my.values.roomPin = ''
      my.pinBad = false
      my.focus = 'roomPin'
      return render()
    }
    if (id === 'promote' || id === 'remove') {
      const picked = my.picked
      my.picked = null
      my.focus = 'self'
      if (picked && !p.busy) {
        if (id === 'promote') watchParty.promote(picked)
        else watchParty.removeMember(picked)
      }
      return render()
    }
    return activateItem(id, p)
  }

  onMount(() => {
    party.useRouter(router)
    const unsub = party.subscribe(() => render())
    const poller = setInterval(() => poll(false), POLL_MS)
    const fade = setTimeout(() => setShown(true), 30)
    onCleanup(() => {
      my.gone = true
      unsub()
      clearInterval(poller)
      clearTimeout(fade)
    })
    checkBackend()
    render()
    poll(true)
    // The sheet measures with both helpers, so it lays out again once both sets of faces are in.
    Promise.all([fontsReady(), textFontsReady()]).then(() => render())
    watchParty.config().then((config) => {
      my.everyoneAllowed = !config || config.everyone_control_allowed !== false
      render()
    })
    loadParticipantUsers(store.serverUrl).then((users) => {
      my.users = users
      render()
    })
    if (root) root.setFocus()
  })
  // A theme change, or a theme face that finished loading, lays the dialog out again.
  createEffect(on(() => store.settingsVersion, render, { defer: true }))

  const key = (dir) => () => {
    if (!editing()) move(dir)
    return true
  }
  const b = box
  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onUp={key('up')}
      onDown={key('down')}
      onLeft={key('left')}
      onRight={key('right')}
      onEnter={() => {
        if (!editing() && my.focus) activate(my.focus)
        return true
      }}
      onBack={() => {
        if (editing()) closeKeyboard()
        else leave()
        return true
      }}
    >
      <view width={1920} height={1080} color="#00000099" transition={{ alpha: { duration: 200 } }} alpha={shown() ? 1 : 0} />
      <view
        transition={{ alpha: { duration: 200 }, scale: { duration: 200 } }}
        x={b().x}
        y={b().y}
        width={b().w}
        height={b().h}
        pivot={0.5}
        alpha={shown() ? 1 : 0}
        scale={shown() ? 1 : 0.95}
      >
        <view x={-1} y={-1} width={b().w + 2} height={b().h + 2} borderRadius={24} color="#00000000" shadow={SHADOW} />
        <view x={-1} y={-1} width={b().w + 2} height={b().h + 2} borderRadius={24} color={frame} border={EDGE} />
        <view x={23} width={Math.max(0, b().w - 46)} height={1} color="#ffffff14" />
        <PartyPaint paint={head()} />
        <view y={HEADER_H} width={b().w} height={b().viewH} clipping>
          <view y={-scrollY()} width={b().w} height={Math.max(b().viewH, bodyH())}>
            <PartyPaint paint={body()} />
          </view>
        </view>
        <view
          width={b().w}
          height={b().h}
          pointerItems={() => (shown() ? pointSpots().map((s) => s && s.it) : [])}
          onPointerItem={(_, i) => pointAt(i, false)}
          onPointerItemClick={(_, i) => pointAt(i, true)}
        />
      </view>
      <Keyboard overlay ref={(n) => (kb = n)} onKeyboardChange={onKeyboardChange} onKeyboardClose={onKeyboardClose} onKeyboardNative={openNative} />
    </view>
  )
}
