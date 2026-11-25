// The admin's messages for the signed-in server and user, and which ones this viewer has read.
// They're cached, so the list still opens offline.
// shortcut: read once per sign-in, with no live refresh from the Moonbase settings stream (this app
// doesn't run it yet). Load again from that stream's adminMessage event once something subscribes.
import * as seerrApi from '../../services/seerrApi.js'
import { parseServerMessages } from '../../services/serverMessages.js'
import { getFromStorage, saveToStorage } from '../../services/storage.js'
import { getActiveServer } from '../../services/multiServerManager.js'
import { getApiKey, getServerUrl, getUserId } from '../../services/jellyfinApi.js'
import { checkSeerr } from '../seerr.js'
import { shell, shellApp } from './shellState.js'

const CACHE_KEY = 'serverMessages_'
const READ_KEY = 'serverMessagesRead_'

let list = []
let read = []
let scope = null

// One scope per server and user, so the next viewer doesn't inherit this one's read marks.
const scopeKeyFor = (serverId, userId, serverUrl) => {
  const server = serverId || (serverUrl || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_')
  if (!server) return null
  return userId ? `${server}_${userId}` : server
}

const onlyStrings = (ids) => (Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [])

const publish = () => {
  shell.messages = list.length
  shell.unread = list.filter((m) => read.indexOf(m.id) < 0).length
}

const saveRead = (ids) => {
  read = ids
  if (scope) saveToStorage(READ_KEY + scope, ids).catch(() => {})
  publish()
}

export const getMessages = () => list
export const isRead = (id) => read.indexOf(id) >= 0

export const markRead = (id) => {
  if (!isRead(id)) saveRead(read.concat([id]))
}

export const markAllRead = () => {
  const unread = list.map((m) => m.id).filter((id) => !isRead(id))
  if (unread.length) saveRead(read.concat(unread))
}

// Unread messages the admin set to open the window.
export const pendingPopups = () => list.filter((m) => m.delivery === 'popup' && !isRead(m.id))

// Showing them counts as reading them, or the window would open on every sign-in.
export const markPopupsRead = () => {
  const ids = pendingPopups().map((m) => m.id)
  if (ids.length) saveRead(read.concat(ids))
}

export const loadMessages = async () => {
  const server = await getActiveServer().catch(() => null)
  const serverUrl = getServerUrl()
  const token = getApiKey()
  const next = scopeKeyFor(server && server.serverId, getUserId(), serverUrl)
  scope = next
  list = []
  read = []
  publish()
  if (!next) return
  const [cached, readIds] = await Promise.all([
    getFromStorage(CACHE_KEY + next).catch(() => null),
    getFromStorage(READ_KEY + next).catch(() => null),
  ])
  if (scope !== next) return
  list = parseServerMessages(cached)
  read = onlyStrings(readIds)
  publish()

  // Older plugins leave messagesSupported out, which hides the list.
  const seerr = await checkSeerr().catch(() => null)
  if (scope !== next || !seerr || !seerr.pluginInfo || seerr.pluginInfo.messagesSupported !== true) return
  let payload
  try {
    payload = await seerrApi.getMoonfinMessages(serverUrl, token)
  } catch (e) {
    return
  }
  if (scope !== next) return
  list = parseServerMessages(payload)
  saveToStorage(CACHE_KEY + next, list).catch(() => {})
  // Read marks for messages the server no longer sends are dropped, so the list doesn't grow forever.
  const live = {}
  list.forEach((m) => {
    live[m.id] = true
  })
  const kept = read.filter((id) => live[id])
  if (kept.length !== read.length) saveRead(kept)
  else publish()
  if (shellApp()) shellApp().maybePopup()
}
