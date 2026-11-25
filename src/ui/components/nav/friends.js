// What the nav's Friends button needs from state/achievements.js: whether the Achievement Badges
// plugin has friends switched on here, and the badge the button wears (friend requests waiting plus
// unread messages). Listeners hear only when either changes, so the 30s reads don't rebuild the nav.
import { achievements, onAchievementsChange, syncAchievements } from '../../../state/achievements.js'

let last = { social: false, badge: 0 }
const listeners = []

onAchievementsChange(() => {
  const a = achievements()
  const next = { social: a.socialAvailable, badge: a.badgeCount }
  if (next.social === last.social && next.badge === last.badge) return
  last = next
  listeners.slice().forEach((fn) => fn())
})

export const friendsState = () => last

export const onFriendsChange = (fn) => {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  }
}

// App starts the session with the same server|user key, so the nav's call changes nothing.
export const syncFriends = (key) => syncAchievements(key)
