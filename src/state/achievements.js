// Whether this server runs the Achievement Badges plugin and which of its parts are on, the daily
// login ping, and the 30s reads of newly unlocked badges, the friends list and the chats while the
// app is visible.
import * as achievementsApi from '../services/achievementsApi.js'
import { sameUserId, threadHasNewFromOthers } from '../utils/achievementsModel.js'
import { afterHomeReady } from '../utils/homeReady.js'

// False until a probe says otherwise, so nothing shows on a server without the plugin, and
// cleared on the way out so it can't survive into the next one.
const CLEARED = {
  available: false,
  leaderboardEnabled: true,
  questsEnabled: true,
  unlockToastsAvailable: false,
  socialAvailable: false,
}

// The plugin gives each user 60 requests a minute across its routes, and a read is a few of them.
const POLL_MS = 30000

let session = ''
let flags = CLEARED
// Badges the last read turned up that the user wants to hear about, until App has shown them.
let unlocks = null
let friends = null
let threads = []
// Chats that got a message from someone else since the last read, until App has shown each.
let incoming = []
// The threads as the last read found them, null until the first read, which only records what's
// waiting so it doesn't all pop up at once.
let seen = null
// The chat on screen, so a message landing in it doesn't pop a banner.
let openConversation = null
let messageNotifications = true
let timer = null
let probed = Promise.resolve(false)
const listeners = []

const changed = () => listeners.slice().forEach((fn) => fn())

export const onAchievementsChange = (fn) => {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  }
}

// Friend requests waiting plus unread messages, which the Friends button wears.
const badgeCount = () => (friends ? friends.incoming.length : 0) + threads.reduce((sum, t) => sum + t.unreadCount, 0)

export const achievements = () => ({
  ...flags,
  unlocks,
  friends,
  threads,
  incomingMessages: incoming,
  badgeCount: badgeCount(),
})

// Resolves with whether the plugin answered for the current session, once its probe is done.
export const achievementsReady = () => probed

// Reads the friends list and the chats again, and notes which chats got a message from someone
// else since the last read. Says whether the friends list came back.
export const refreshSocial = async () => {
  const key = session
  const [friendsList, threadList] = await Promise.all([achievementsApi.fetchFriends(), achievementsApi.fetchThreads()])
  if (key !== session) return false
  if (friendsList) friends = friendsList
  if (threadList) {
    if (seen && messageNotifications) {
      const fresh = threadList.filter((thread) => threadHasNewFromOthers(thread, seen[thread.conversationId], openConversation))
      if (fresh.length) incoming = incoming.concat(fresh)
    }
    threads = threadList
    seen = {}
    threadList.forEach((thread) => (seen[thread.conversationId] = thread))
  }
  changed()
  return !!friendsList
}

const poll = (key) => {
  if (key !== session) return
  if (flags.unlockToastsAvailable) {
    achievementsApi.refreshUnlocks().then((found) => {
      if (!found || key !== session) return
      unlocks = { ...found, key: Date.now() }
      changed()
    })
  }
  if (flags.socialAvailable) refreshSocial()
}

// The reads stop while the app is hidden and pick up again, with one straight away, when it comes
// back.
const start = () => {
  if (timer || !session || (!flags.unlockToastsAvailable && !flags.socialAvailable)) return
  const key = session
  poll(key)
  timer = setInterval(() => poll(key), POLL_MS)
}
const stop = () => {
  clearInterval(timer)
  timer = null
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
}

// Called with the signed in server and user ('' when signed out). Each new one starts over.
export const syncAchievements = (key) => {
  if (key === session) return
  session = key
  stop()
  achievementsApi.reset()
  flags = CLEARED
  unlocks = null
  friends = null
  threads = []
  incoming = []
  seen = null
  openConversation = null
  messageNotifications = true
  changed()
  if (!key) {
    probed = Promise.resolve(false)
    return
  }
  probed = afterHomeReady()
    .then(() => (key === session ? achievementsApi.probe() : false))
    .catch(() => false)
  probed.then((available) => {
    if (key !== session) return
    const f = achievementsApi.getFlags()
    flags = {
      available,
      ...f,
      unlockToastsAvailable: available && f.unlockToastsEnabled,
      socialAvailable: available && f.friendsEnabled,
    }
    changed()
    // The plugin counts a daily login from this and nothing else, so it's the one call the client
    // has to make rather than read.
    if (available) achievementsApi.sendLoginPing()
    if (flags.socialAvailable) {
      achievementsApi.fetchSocialPrivacy().then((privacy) => {
        if (privacy && key === session) messageNotifications = privacy.messageNotifications
      })
    }
    if (typeof document === 'undefined' || !document.hidden) start()
  })
}

export const clearUnlocks = () => {
  unlocks = null
}

export const shownIncomingMessage = () => {
  incoming = incoming.slice(1)
  changed()
}

export const setOpenConversation = (conversationId) => {
  openConversation = conversationId
}

export const setMessageNotifications = (on) => {
  messageNotifications = on
}

// A name for a user id from whatever was read last, for group members the chats only name by id.
export const displayNameFor = (userId) => {
  const people = (friends ? friends.friends.concat(friends.incoming, friends.outgoing) : []).concat(
    threads.reduce((all, thread) => all.concat(thread.participants), [])
  )
  const found = people.find((person) => sameUserId(person.userId, userId) && person.userName)
  return found ? found.userName : null
}
