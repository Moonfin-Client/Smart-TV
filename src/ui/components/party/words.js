import $L from '../../../services/i18n.js'
import { formatPlaybackDuration } from '../../../utils/playbackTimeLabels.js'

export const toastText = (toast) => {
  const name = (toast && toast.name) || ''
  switch (toast && toast.kind) {
    case 'pause': return $L('{name} paused').replace('{name}', name)
    case 'play': return $L('{name} resumed').replace('{name}', name)
    case 'seek': return $L('{name} skipped to {time}').replace('{name}', name).replace('{time}', formatPlaybackDuration(toast.seconds))
    case 'joined': return $L('{name} joined').replace('{name}', name)
    case 'left': return $L('{name} left').replace('{name}', name)
    case 'host': return toast.self ? $L("You're the host now") : $L('{name} is the host now').replace('{name}', name)
    case 'policy': return toast.everyone ? $L('Everyone can control playback now') : $L('Only the host controls playback now')
    case 'switched': return $L('{name} switched to {title}').replace('{name}', name).replace('{title}', toast.title || '')
    case 'no_access': return $L("You don't have access to what they're watching.")
    case 'host_only': return $L('Only the host can control playback.')
    case 'reconnecting': return $L('Reconnecting to the party...')
    case 'reconnected': return $L('Back in the party')
    default: return ''
  }
}

// The icon a toast wears when it isn't someone's doing. The rest show who did it.
export const toastIcon = (toast) => ({
  host: 'party/crown', policy: 'party/people', reconnecting: 'party/wifi', reconnected: 'party/check', no_access: 'party/blocked',
  host_only: 'party/blocked',
}[toast && toast.kind] || '')

// Quick replies go out in the sender's own language.
export const quickReplies = () => [$L('Haha'), $L('No way'), $L('Pause please'), $L('Brb'), $L('Again!')]

export const waitLine = (pending) => {
  if (pending.length === 1) {
    return pending[0].isSelf ? $L('Waiting for your player') : $L("Waiting for {name}'s player").replace('{name}', pending[0].displayName)
  }
  if (pending.length > 1) return $L('Waiting for {count} players').replace('{count}', String(pending.length))
  return $L('Starting together')
}

export const startingAnyway = (seconds) => $L('Starting anyway in {seconds} s').replace('{seconds}', String(seconds))
