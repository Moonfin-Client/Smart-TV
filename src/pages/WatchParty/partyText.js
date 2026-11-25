import $L from '../../services/i18n.js'
import { isRoomPlaying } from '../../services/siloWatchParty.js'
import { formatPlaybackDuration } from '../../utils/playbackTimeLabels.js'

export const stateLabel = (state) =>
  ({ Idle: $L('Idle'), Waiting: $L('Waiting'), Paused: $L('Paused'), Playing: $L('Playing') }[state] || state || $L('Idle'))

export const memberCount = (count) =>
  count === 1 ? $L('1 member') : $L('{count} members').replace('{count}', String(count))

export const statusLabel = (room, connected) => {
  if (!connected) return $L('Reconnecting...')
  if (!isRoomPlaying(room)) return $L('In the lobby')
  if (room.playbackState === 'waiting') return $L('Waiting')
  return room.playbackState === 'paused' ? $L('Paused') : $L('Playing')
}

export const itemTitle = (item) => {
  if (!item) return ''
  if (item.Type !== 'Episode') return item.Name || ''
  const number = item.ParentIndexNumber != null && item.IndexNumber != null ? `S${item.ParentIndexNumber}:E${item.IndexNumber} ` : ''
  return `${item.SeriesName ? `${item.SeriesName} · ` : ''}${number}${item.Name || ''}`
}

export const partyTitle = (room) => {
  if (!room || !room.contentTitle) return ''
  if (room.contentType !== 'Episode') return room.contentTitle
  const number = room.season != null && room.episode != null ? ` · S${room.season}:E${room.episode}` : ''
  return `${room.seriesName || room.contentTitle}${number}`
}

export const endedText = (reason) => {
  if (reason === 'closed') return $L('The Watch Party has ended.')
  if (reason === 'removed') return $L('The host removed you from the party.')
  return reason || ''
}

export const partyErrorText = (code, fallback) =>
  ({
    wrong_pin: $L("That PIN didn't work. Try again."),
    too_many_attempts: $L('Too many tries. Wait a minute.'),
    full: $L('This party is full.'),
    not_found: $L('No room has that code.'),
    no_access: $L("You don't have access to what they're watching."),
    disabled: $L('Watch Parties are turned off on this server.'),
    not_allowed: $L("The server doesn't allow that."),
    rate_limited: $L('Slow down a little, then try again.'),
  }[code] || fallback || '')

const STATUS = {
  in_sync: () => $L('In sync'),
  catching_up: () => $L('Catching up'),
  buffering: () => $L('Buffering'),
  not_watching: () => $L('Not watching'),
  ready: () => $L('Ready'),
  joining: () => $L('Joining'),
}

// Moonbase shows each member's own report. Silo sends none, so only offline shows there.
export const memberStatus = (member, moonbase) => {
  if (!member.connected) return $L('offline')
  if (!moonbase) return ''
  return (STATUS[member.status] || STATUS.joining)()
}

export const voteCount = (count) =>
  (count === 1 ? $L('{count} vote') : $L('{count} votes')).replace('{count}', String(count))

export const memberName = (m) => {
  if (m.isSelf) return m.isHost ? $L('You · Host') : $L('You')
  return m.isHost ? `${m.displayName} · ${$L('Host')}` : m.displayName
}

export const roomMeta = (room) => {
  const parts = []
  if (room.kind === 'syncplay') {
    parts.push({ playing: $L('Playing'), paused: $L('Paused'), waiting: $L('Waiting') }[room.playbackState] || $L('In the lobby'))
  } else if (room.phase !== 'playing') {
    parts.push($L('In the lobby'))
  } else if (room.playbackState === 'paused') {
    parts.push($L('Paused'))
  } else {
    parts.push(room.positionSeconds > 0 ? `${$L('Playing')} ${formatPlaybackDuration(room.positionSeconds)}` : $L('Playing'))
  }
  if (room.hostName) parts.push(room.hostName)
  parts.push($L('{count} watching').replace('{count}', String(room.memberCount)))
  if (room.everyoneControls) parts.push($L('Everyone controls'))
  return parts.join(' · ')
}

export const subtitleChoices = (source) => [
  { label: $L("Each person's choice"), track: null, off: false },
  { label: $L('Off'), track: null, off: true },
  ...((source && source.MediaStreams) || [])
    .filter((st) => st.Type === 'Subtitle' && Number.isInteger(st.Index))
    .map((t) => ({ label: t.DisplayTitle || t.Language || String(t.Index), track: t, off: false })),
]

export const choiceMatches = (choice, current) => {
  if (!current) return !choice.off && !choice.track
  if (current.off) return choice.off
  return Boolean(choice.track) && choice.track.Index === current.index
}

// The note under Start from the beginning: whose spot Resume picks up, and who hasn't started.
export const resumeHint = (resume, room) => {
  const found = room.members.find((m) => m.profileId === resume.profileId)
  const name = found && found.displayName
  const where = name
    ? $L('Where {name} left off, the earliest anyone here has reached.').replace('{name}', name)
    : $L('The earliest point anyone here has reached.')
  if (!resume.notStarted) return where
  return `${where} ${(resume.notStarted === 1 ? $L("1 person hasn't started it yet.") : $L("{count} people haven't started it yet."))
    .replace('{count}', String(resume.notStarted))}`
}

export const resumeLabel = (seconds) => $L('Resume at {time}').replace('{time}', formatPlaybackDuration(seconds))
