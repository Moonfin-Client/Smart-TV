// The state behind the Seerr dialogs: where a request goes and the advanced rows, the request
// sheet's chips and quota line, the report form's pickers and the requester line.
import $L from '../../../services/i18n.js'

const defaultServer = (servers, is4k) =>
  servers.find((s) => s.server.is4k === is4k && s.server.isDefault) || servers.find((s) => s.server.is4k === is4k) || servers[0]

// Where a request goes, from the viewer's picks with each server's own defaults filling the rest.
// An anime series takes the server's anime profile and folder when it has them.
export const resolveAdvanced = (servers, picks, { is4k = false, isAnime = false } = {}) => {
  if (!servers || !servers.length) return { server: null, serverId: picks.serverId, profileId: picks.profileId, rootFolder: null, folder: null }
  const server = (picks.serverId != null && servers.find((s) => s.server.id === picks.serverId)) || defaultServer(servers, is4k)
  const { activeAnimeProfileId, activeAnimeDirectory, activeProfileId, activeDirectory } = server.server
  const folders = server.rootFolders || []
  let profileId = picks.profileId
  if (profileId == null) profileId = isAnime && activeAnimeProfileId != null ? activeAnimeProfileId : activeProfileId
  const dir = isAnime && activeAnimeDirectory ? activeAnimeDirectory : activeDirectory
  const folder = picks.rootFolderId != null ? folders.find((f) => f.id === picks.rootFolderId) : (dir && folders.find((f) => f.path === dir)) || folders[0]
  return {
    server,
    serverId: picks.serverId != null ? picks.serverId : server.server.id,
    profileId: profileId == null ? null : profileId,
    rootFolder: folder ? folder.path : null,
    folder: folder || null,
  }
}

const serverLabel = (s) => `${s.server.name}${s.server.is4k ? ' (4K)' : ''}`

// The three selector rows, each with what its picker lists.
export const advancedRows = (servers, resolved) => {
  if (!servers || !servers.length || !resolved.server) return []
  const row = (key, label, items, labelOf, selectedId) => {
    const ids = items.map((item) => item.id)
    const resolvedId = selectedId == null ? ids[0] : selectedId
    const index = ids.indexOf(resolvedId)
    const current = index >= 0 ? items[index] : items[0]
    return { key, label, labels: items.map(labelOf), ids, value: current ? labelOf(current) : '', index: Math.max(index, 0) }
  }
  return [
    row('server', $L('Server'), servers.map((s) => ({ ...s, id: s.server.id })), serverLabel, resolved.serverId),
    row('profile', $L('Quality Profile'), resolved.server.profiles || [], (p) => p.name, resolved.profileId),
    row('folder', $L('Root Folder'), resolved.server.rootFolders || [], (f) => f.path, resolved.folder ? resolved.folder.id : null),
  ]
}

// Sonarr can't add a series without a TVDB id, and when TMDB has none Seerr drops the request once
// it sends it on. A series already on Seerr from an earlier request may have one of its own.
export const needsSeriesMatch = (details) => {
  const ext = details && details.externalIds
  const media = details && details.mediaInfo
  return (ext ? ext.tvdbId : null) == null && (media ? media.tvdbId : null) == null
}

const requestTitle = (g, isTv) => (g.startIs4k && !g.toggle ? $L('Request 4K {type}') : $L('Request {type}')).replace('{type}', isTv ? $L('Series') : $L('Movie'))

// The match step as SeerrDialogLayout's matchDialog draws it: loading until Sonarr answers, failed
// (with a Retry), none found (Close alone) or the list.
export const matchState = (g) => {
  let state = 'list'
  if (g.lookupFailed) state = 'failed'
  else if (!g.matches) state = 'loading'
  else if (!g.matches.length) state = 'none'
  return { title: requestTitle(g, true), state, matches: g.matches || [], tvdbId: g.tvdbId }
}

// The request sheet as SeerrDialogLayout's requestDialog draws it. g is the dialog's state, and
// match is the Sonarr series picked in the step before, if any.
export const requestSheet = ({ g, isTv, numbers, taken, available, resolved, quota, limited, continuing, match = null }) => {
  // TV quota counts seasons and movie quota counts one per request.
  let needed = g.seasons.length
  if (g.allSeasons) needed = Math.min(Math.max(numbers.length - taken.size, 1), numbers.length)
  const blocked = limited && !!(quota.restricted || (quota.remaining != null && (isTv ? needed : 1) > quota.remaining))
  let quotaLabel = null
  if (blocked) quotaLabel = $L('Request limit reached')
  else if (limited) {
    quotaLabel = (isTv ? $L('{remaining} of {limit} season requests remaining') : $L('{remaining} of {limit} movie requests remaining'))
      .replace('{remaining}', quota.remaining == null ? 0 : quota.remaining)
      .replace('{limit}', quota.limit == null ? 0 : quota.limit)
  }
  const rows = g.advanced && !g.advanced.loading ? advancedRows(g.advanced.servers, resolved) : []
  const pickers = {}
  rows.forEach((r) => (pickers[r.key] = r))
  return {
    title: requestTitle(g, isTv),
    match,
    toggle: g.toggle,
    is4k: g.is4k,
    isTv,
    continuing,
    allSeasons: g.allSeasons,
    chips: numbers.map((n) => ({
      id: `season:${n}`,
      label: $L('S{number}').replace('{number}', n),
      selected: g.seasons.indexOf(n) >= 0,
      available: available.indexOf(n) >= 0,
      disabled: taken.has(n),
    })),
    advanced: g.advanced ? { expanded: g.expanded, loading: g.advanced.loading, rows } : null,
    quota: quotaLabel ? { label: quotaLabel, blocked } : null,
    canSubmit: !blocked,
    resolved,
    pickers,
  }
}

const seasonLabel = (n) => (n > 0 ? $L('Season {number}').replace('{number}', n) : $L('All Seasons'))
const episodeLabel = (n) => (n > 0 ? $L('Episode {number}').replace('{number}', n) : $L('All Episodes'))

// The report form as SeerrDialogLayout's reportDialog draws it.
export const reportSheet = ({ g, isTv, types, episodeCount }) => ({
  types,
  seasonRow: isTv && g.numbers.length ? { label: $L('Season'), value: seasonLabel(g.season) } : null,
  episodeRow: isTv && g.numbers.length && g.season > 0 ? { label: $L('Episode'), value: episodeLabel(g.episode) } : null,
  episodeLabels: Array.from({ length: episodeCount + 1 }, (_, i) => episodeLabel(i)),
  message: g.message,
  placeholder: $L("What's wrong?"),
  fieldOn: g.editing,
  canSend: g.message.trim().length > 0 && !g.submitting,
  submitting: g.submitting,
})

export const requestedByLabel = (request) => {
  const user = (request && request.requestedBy) || {}
  const name = user.displayName != null ? user.displayName : user.username != null ? user.username : user.email != null ? user.email : $L('Unknown')
  const label = $L('Requested by {name}').replace('{name}', name)
  return request && request.is4k ? `${label} · ${$L('4K')}` : label
}
