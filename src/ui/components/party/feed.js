// What the Watch Party layer shows at a given moment, worked out from the party's state with no strings and no
// renderer, so feed.check.mjs can run it under node. Times are local ms, as the service keeps them.
export const CHAT_MS = 6000
export const REACTION_MS = 3000
export const TOAST_MS = 4000
// The server starts anyway once the wait passes this.
export const READY_WAIT_MS = 10000
const REACTIONS = ['love', 'haha', 'wow', 'sad', 'fire', 'popcorn']

const OVER_VIDEO = 3
const WITH_BAR = 3

// One line per message id, the newest copy kept, so a line repeated by a reconnect can't show twice.
export const uniqueLines = (chat) => {
  const seen = {}
  const out = []
  for (let i = chat.length - 1; i >= 0; i--) {
    const m = chat[i]
    const k = m.id || `${m.memberId}|${m.sentAt}|${m.text}`
    if (seen[k]) continue
    seen[k] = true
    out.unshift(m)
  }
  return out
}

// Over the video, the last three lines for six seconds after each arrived, unless chat over the video is off. History
// from before joining has no arrival time, so it never pops up. With the chat bar open, the last three stay put.
export const chatLines = (chat, now, open, overlay) => {
  const lines = uniqueLines(chat || [])
  if (open) return lines.slice(-WITH_BAR)
  if (!overlay) return []
  return lines.slice(-OVER_VIDEO).filter((m) => m.receivedAt > 0 && now - m.receivedAt < CHAT_MS)
}

export const liveReactions = (reactions, now) => (reactions || []).filter((r) => now - r.at < REACTION_MS)

// How long until the soonest of these times, so the layer redraws then rather than on a ticker. 0 when none is
// still ahead.
export const untilNext = (times, now) => {
  let soonest = 0
  times.forEach((t) => {
    if (t > now && (!soonest || t < soonest)) soonest = t
  })
  return soonest ? soonest - now : 0
}

export const isReady = (m) => m.status === 'ready' || m.status === 'in_sync'

export const waitingFor = (room) => room.members.filter((m) => m.connected && !isReady(m))

export const secondsLeft = (until, now) => Math.max(0, Math.ceil((until - now) / 1000))

const AVATAR_COLORS = ['#8e44ad', '#2e6fb7', '#16794f', '#c0392b', '#9a5b00', '#00796b']

export const avatarColor = (seed) => {
  const value = String(seed || '')
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const STATUS_COLORS = {
  in_sync: '#3ecf8e', catching_up: '#f5b942', buffering: '#4fb0ff', not_watching: '#6f6f6f', ready: '#3ecf8e', joining: '#555555',
}

export const statusColor = (m) => (!m.connected ? '#6f6f6f' : STATUS_COLORS[m.status] || STATUS_COLORS.joining)

// The chat bar's row: the reactions, a divider, the quick replies and the Type field, 14px apart. The divider keeps
// only its 8px margin on the right. Reactions show only while the room allows them, the rest only while it allows
// chat. `width` measures a reply at 23px medium. The first reply carries the divider's x.
export const barKeys = (room, replies, typeLabel, width) => {
  const keys = []
  let x = 0
  const add = (key, w) => {
    if (keys.length) x += 14
    keys.push({ ...key, x, w })
    x += w
  }
  if (room.reactionsEnabled) REACTIONS.forEach((r) => add({ id: `r:${r}`, kind: 'reaction', reaction: r, label: '' }, 84))
  let divider = 0
  if (room.reactionsEnabled && room.chatEnabled) {
    divider = x + 14
    x = divider + 2 + 8
  }
  if (room.chatEnabled) {
    replies.forEach((text, i) => add({ id: `q:${i}`, kind: 'reply', label: text, divider: i === 0 ? divider : 0 }, Math.ceil(width(text)) + 58))
    add({ id: 'type', kind: 'type', label: typeLabel }, 274)
  }
  return keys
}

// How far the bar's row slides left so the focused key stays inside `room` px.
export const barScroll = (keys, cur, room) => {
  const last = keys[keys.length - 1]
  const key = keys[cur]
  if (!last || !key) return 0
  const total = last.x + last.w
  return Math.max(0, Math.min(key.x + key.w + 40 - room, total - room))
}
