// Whether this server offers Seerr through the Moonfin plugin. The answer is kept per server and
// token, so a user switch asks again.
// shortcut: no Plex sign-in to Seerr, no settings stream and no useMoonfinPlugin gate (that
// setting never turns itself on here yet), add them with the Moonbase settings sync.
import * as seerrApi from '../services/seerrApi.js'
import { serverLogger } from '../services/serverLogger.js'
import { getServerUrl, getApiKey, getServerType } from '../services/jellyfinApi.js'

const NONE = {
  enabled: false,
  authenticated: false,
  available: false,
  displayName: 'Seerr',
  user: null,
  pluginInfo: null,
}

let current = NONE
let checkedFor = ''
let pending = null

export const seerrState = () => current

const probe = async (server, token) => {
  const [status, ping, config] = await Promise.all([
    seerrApi.getMoonfinStatus().catch(() => null),
    seerrApi.moonfinPing(server, token).catch(() => null),
    seerrApi.getMoonfinConfig(server, token).catch(() => null),
  ])
  // Most Plex servers have no Moonbase for Plex, and Seerr only comes through one that answered.
  const enabled = !!(status && status.enabled) && (getServerType() !== 'plex' || !!ping)
  const authenticated = enabled && !!status.authenticated
  return {
    enabled,
    authenticated,
    available: authenticated,
    displayName: (config && config.displayName) || 'Seerr',
    user: authenticated
      ? {
          displayName: status.displayName,
          seerrUserId: status.seerrUserId,
          permissions: status.permissions != null ? status.permissions : 0xffffffff,
        }
      : null,
    pluginInfo: ping || null,
  }
}

export const checkSeerr = (force = false) => {
  const server = getServerUrl()
  const token = getApiKey()
  if (!server || !token) return Promise.resolve(NONE)
  const key = `${server}|${token}`
  if (!force && key === checkedFor && pending) return pending
  checkedFor = key
  seerrApi.setMoonfinConfig(server, token)
  pending = probe(server, token).then(
    (result) => {
      if (checkedFor === key) {
        current = result
        serverLogger.setClientLogSupported(!!(result.pluginInfo && result.pluginInfo.clientLogSupported === true))
      }
      return result
    },
    (e) => {
      console.warn('[seerr] availability check failed', e)
      return NONE
    }
  )
  return pending
}
