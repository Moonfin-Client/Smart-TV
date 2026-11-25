// Self-check for the achievements state and the banners App builds from it:
// node src/ui/components/shell/notifications.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The plugin's API and Home's ready signal are stood in for, so the state module runs without a
// server.
const api = {
  available: true,
  flags: { leaderboardEnabled: true, questsEnabled: true, activityEnabled: true, unlockToastsEnabled: true, friendsEnabled: true, friendsSimpleMode: false },
  friends: { friends: [], incoming: [], outgoing: [] },
  threads: [],
  unlocks: null,
  calls: [],
}
globalThis.__achApi = api
const stub = 'data:text/javascript,' + encodeURIComponent(`
  const a = globalThis.__achApi
  export const reset = () => a.calls.push('reset')
  export const probe = async () => (a.calls.push('probe'), a.available)
  export const getFlags = () => a.flags
  export const sendLoginPing = () => (a.calls.push('ping'), Promise.resolve(null))
  export const fetchSocialPrivacy = async () => (a.calls.push('privacy'), { messageNotifications: a.notify !== false })
  export const fetchFriends = async () => a.friends
  export const fetchThreads = async () => a.threads
  export const refreshUnlocks = async () => a.unlocks
`)
const ready = 'data:text/javascript,' + encodeURIComponent('export const afterHomeReady = () => Promise.resolve()')
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.endsWith('services/achievementsApi.js')) return { url: stub, shortCircuit: true }
    else if (spec.endsWith('utils/homeReady.js')) return { url: ready, shortCircuit: true }
    else if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
globalThis.document = { hidden: false, addEventListener() {} }
const intervals = []
globalThis.setInterval = (fn) => (intervals.push(fn), intervals.length)
globalThis.clearInterval = () => {}

const A = await import('../../../state/achievements.js')
const { badgeNotes, chatNote, muteChat } = await import('./notifications.js')
const tick = () => new Promise((r) => setTimeout(r, 0))

const thread = (id, unread, at, extra = {}) => ({ conversationId: id, name: id, unreadCount: unread, lastAt: new Date(at), lastFromMe: false, lastMessage: 'hi', participants: [], ...extra })

// A sign-in probes, pings once and starts the reads. The first read only records the chats.
api.threads = [thread('ava', 2, 1000)]
A.syncAchievements('srv|u1')
await tick(); await tick(); await tick()
assert.deepEqual(api.calls, ['reset', 'probe', 'ping', 'privacy'])
assert.equal(A.achievements().socialAvailable, true)
assert.equal(A.achievements().unlockToastsAvailable, true)
assert.equal(A.achievements().incomingMessages.length, 0, 'the first read only records what is waiting')
assert.equal(A.achievements().badgeCount, 2)

// A later read with a new message from someone else queues one banner, and one for a chat on screen doesn't.
api.threads = [thread('ava', 3, 2000), thread('ben', 1, 2000)]
A.setOpenConversation('ben')
await A.refreshSocial()
assert.deepEqual(A.achievements().incomingMessages.map((t) => t.conversationId), ['ava'])
A.shownIncomingMessage()
assert.equal(A.achievements().incomingMessages.length, 0)

// Message notifications off: nothing queues.
A.setMessageNotifications(false)
api.threads = [thread('ava', 4, 3000)]
await A.refreshSocial()
assert.equal(A.achievements().incomingMessages.length, 0)

// Unlocks from a poll land with a key, and a new session clears everything.
api.unlocks = { badges: [{ title: 'Night Owl', icon: 'bedtime', score: 25 }], grouped: false, muteDuringPlayback: true }
intervals[intervals.length - 1]()
await tick(); await tick()
assert.ok(A.achievements().unlocks && A.achievements().unlocks.key)
A.syncAchievements('')
assert.equal(A.achievements().unlocks, null)
assert.equal(A.achievements().available, false)

// The banners: one each, one for a grouped lot (top score's icon, three names and a count), none
// muted over a film, and the chat banner's photo and title rules.
const one = badgeNotes({ key: 7, badges: [{ title: 'Night Owl', icon: 'bedtime', score: 25 }], grouped: true }, false)
assert.deepEqual(one, [{ key: '7-0', title: 'Achievement unlocked', body: 'Night Owl', icon: 'icons/ach/bedtime.webp' }])
const lot = badgeNotes({
  key: 8, grouped: true,
  badges: [{ title: 'A', icon: 'movie', score: 10 }, { title: 'B', icon: 'crown', score: 100 }, { title: 'C', icon: 'nope', score: 5 }, { title: 'D', icon: 'tv', score: 1 }],
}, false)
assert.equal(lot.length, 1)
assert.equal(lot[0].title, '4 achievements unlocked')
assert.equal(lot[0].body, 'A, B, C +1 more')
assert.equal(lot[0].icon, 'icons/ach/crown.webp')
assert.equal(badgeNotes({ key: 9, badges: [{ title: 'Z', icon: 'zzz', score: 1 }], grouped: false }, false)[0].icon, 'icons/ach/emoji_events.webp')
assert.deepEqual(badgeNotes({ key: 9, badges: [{ title: 'Z' }], muteDuringPlayback: true }, true), [])
assert.equal(badgeNotes({ key: 9, badges: [{ title: 'Z' }], muteDuringPlayback: false }, true).length, 1)
const photo = chatNote(thread('ava', 1, 5000, { hasAttachment: true, lastMessage: '[image]' }))
assert.equal(photo.body, 'Photo')
assert.equal(photo.title, 'New message from ava')
assert.equal(photo.key, 'ava-5000')
assert.equal(muteChat(undefined, true), true)
assert.equal(muteChat(false, true), false)
assert.equal(muteChat(true, false), false)
console.log('notifications check passed')
