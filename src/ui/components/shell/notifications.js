// The banners App shows for an unlock and for a chat message, as { key, title, body, icon } with
// icon an image path.
import $L from '../../../services/i18n.js'
import { threadIsPhoto } from '../../../utils/achievementsModel.js'
import { ACH_ICON_NAMES } from '../settings/social/achNames.js'

const ART = {}
ACH_ICON_NAMES.forEach((name) => (ART[name] = true))

// An achievement's art by its lowercased name, or the plugin's trophy for one nothing knows.
const achievementIcon = (name) => {
  const key = String(name || '').trim().toLowerCase()
  return 'icons/ach/' + (ART[key] ? key : 'emoji_events') + '.webp'
}

// The banners for one read's unlocks: one for the lot when the plugin groups them, else one each.
// None when the viewer is watching something and asked for quiet during playback.
export const badgeNotes = (unlocks, playing) => {
  if (!unlocks || (unlocks.muteDuringPlayback && playing)) return []
  const badges = unlocks.badges
  if (unlocks.grouped && badges.length > 1) {
    const top = badges.reduce((best, badge) => (badge.score > best.score ? badge : best))
    const names = badges.slice(0, 3).map((badge) => badge.title).join(', ')
    const more = badges.length - 3
    return [{
      key: String(unlocks.key),
      title: $L('{count} achievements unlocked').replace('{count}', String(badges.length)),
      body: more > 0 ? `${names} ${$L('+{count} more').replace('{count}', String(more))}` : names,
      icon: achievementIcon(top.icon),
    }]
  }
  return badges.map((badge, index) => ({
    key: `${unlocks.key}-${index}`,
    title: $L('Achievement unlocked'),
    body: badge.title,
    icon: achievementIcon(badge.icon),
  }))
}

// The banner for a chat that got a message from someone else.
export const chatNote = (thread) => ({
  key: `${thread.conversationId}-${thread.lastAt ? thread.lastAt.getTime() : thread.unreadCount}`,
  title: $L('New message from {name}').replace('{name}', thread.name),
  body: threadIsPhoto(thread) ? $L('Photo') : thread.lastMessage,
  icon: 'icons/forum.webp',
})

// Chat banners hold back during playback unless the viewer turned that off.
export const muteChat = (setting, playing) => setting !== false && playing
