// Home's Watch Parties: the parties this user can join, asked every minute while Home shows and
// again when the app comes back to the front, and an alert for a Moonbase party that started while
// Home was up.
import $L from '../../../services/i18n.js'
import { watchParty, mergePartyRooms, newPartyRooms, syncPlayGroupFrom } from '../../../services/siloWatchParty.js'
import { listGroups } from '../../../services/syncPlay.js'
import { getImageUrl } from '../../../utils/helpers.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import { isKidsMode } from '../../../utils/kidsMode.js'
import * as settings from '../../../state/settings.js'
import { getStore } from '../../../state/store.js'
import { partyTitle } from '../../../pages/WatchParty/partyText.js'

const POLL_MS = 60000
export const ALERT_MS = 8000

// Rooms already seen per login, so an alert is only ever for a party that started while Home was up.
const seenByLogin = new Map()

// The row shows everywhere but in kids mode, on Silo, or with SyncPlay switched off.
export const partiesEnabled = () => {
  const s = settings.all()
  const store = getStore()
  return !isKidsMode(s) && (!store || store.serverType !== 'silo') && s.syncplayEnabled !== false
}

const sessionKey = () => {
  const store = getStore()
  return `${getServerUrl()}|${store ? store.userId : ''}`
}

// onRooms(rooms) hears each new answer, onAlert(room) a party worth an alert.
export const createPartyRooms = ({ onRooms, onAlert }) => {
  let active = false
  let timer = null
  let last = null
  let gen = 0

  const run = async () => {
    if (!active || document.hidden) return
    const store = getStore()
    const withSyncPlay = !!store && store.serverType === 'jellyfin'
    const [parties, groups] = await Promise.all([
      watchParty.available().then((ok) => (ok ? watchParty.listRooms() : [])).catch(() => null),
      withSyncPlay ? listGroups() : [],
    ])
    // A failed read keeps what was there rather than emptying the row.
    if (!active || parties === null) return
    const next = mergePartyRooms(parties, groups.map(syncPlayGroupFrom))
    // The same answer keeps the same list, so Home doesn't lay its rows out again for nothing.
    if (last && JSON.stringify(last) === JSON.stringify(next)) return
    last = next
    onRooms(next)
    const key = sessionKey()
    const seen = seenByLogin.get(key)
    const fresh = seen ? newPartyRooms(seen, next) : []
    const known = seen || new Set()
    next.forEach((r) => known.add(r.roomId))
    seenByLogin.set(key, known)
    if (settings.get('watchPartyAlerts') !== true || !fresh.length) return
    const id = ++gen
    watchParty.config().then((config) => {
      if (id === gen && active && !(config && config.alerts === false)) onAlert(fresh[0])
    })
  }

  const onVisible = () => {
    if (!document.hidden) run()
  }

  return {
    // Asked while Home shows and the row is on, and never in the background.
    setActive(on) {
      on = on && partiesEnabled()
      if (on === active) return
      active = on
      gen++
      if (timer) clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', onVisible)
      if (!on) return
      run()
      timer = setInterval(run, POLL_MS)
      document.addEventListener('visibilitychange', onVisible)
    },
    destroy() {
      this.setActive(false)
    },
  }
}

// The alert's words and poster as plain fields, for WatchPartyAlert.
export const alertOf = (room) => ({
  k: room.roomId,
  head: $L('{name} started a watch party').replace('{name}', room.hostName),
  line: [partyTitle(room), $L('{count} in the lobby').replace('{count}', String(room.memberCount))].filter(Boolean).join(' · '),
  host: room.hostName || '',
  poster: room.selectedContentId ? getImageUrl(getServerUrl(), room.selectedContentId, 'Primary', { maxHeight: 200, quality: 80 }) || '' : '',
})

// The row Home puts first while any party exists, laid out as a classic row whatever the
// row style: a 28px title on its 33px line, 16px under it, 20px above and below the cards (the
// start card's border makes it 222 tall), and the rows' spacing or 30px under the row.
export const partyRowOf = (rooms, look, labels) => ({
  key: 'watch-parties',
  id: 'watch-parties',
  title: $L('Watch Parties'),
  type: 'landscape',
  isWatchPartyRow: true,
  labels,
  rooms,
  cards: [],
  box: { titleY: 0, subtitleY: 0, scrollerY: 49, cardsY: 69, laneH: 262, panelY: 0, h: 49 + 262 + (typeof look.spacing === 'number' ? look.spacing : 30), top: 0 },
})
