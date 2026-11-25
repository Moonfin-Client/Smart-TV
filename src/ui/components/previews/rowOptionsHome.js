// The Home preview drawn from Home's own rows. A Row Options setting draws Home the way it looks with the D-pad on
// the first row it changes: that row on top with its first card focused, loaded in the sort being
// looked at, and Home's own rows below it in Home's order. The settings that change which rows show
// or how their cards look draw Home's rows from the first one they change, and the media bar ones
// take Home's first row for the rows peeking under the bar.
// shortcut: Home's rows are the ones it built with the saved settings, so a tried merge of Continue
// Watching and Next Up, of the recent rows, or Hide Watched in them shows once it's saved. Build the
// rows from Home's raw sections if those should preview too.
import $L from '../../../services/i18n.js'
import { GROUPS, groupOf, homeRowsOf, offReason } from '../../../pages/Settings/rowOptionsBlocked.js'
import { HOME_LOOK_KEYS, MEDIA_BAR_KEYS } from '../../../pages/Settings/previewRows.js'
import { homeRowsShown, loadHomeSection, planHomeRows } from '../../../state/homeRows.js'
import { getServerUrl, getUserId } from '../../../services/jellyfinApi.js'
import { isRowEnabledBySetting } from '../../../utils/homeRowGates.js'
import { showsWatchedCheck } from '../../../utils/playedState.js'
import { episodeArtwork, modernCardImageUrl, requestedArtwork } from '../home/cardArtwork.js'
import { isCarouselRow, isStaticLibraryCard } from '../home/modernCardLayout.js'
import { classicShape, imageTypeRowId, rowImageType } from '../home/rowPeek.js'
import { adaptItem } from './previewData.js'

// When a row's group is off in Rows, the notice names the row or rows to turn on.
const singleRowOff = (name) => (on) => (on
  ? $L('The {row} row is turned off. To show it, go to Rows, open {group} under {disabled}, and turn it on.')
  : $L('To see the {row} row on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn it on.')
).replace('{row}', name())

// Each group's place on the Rows screen and what the notice says while its rows can't be on Home.
const NOTICES = {
  audio: {
    rowsGroup: () => $L('General'),
    offText: (on) => (on
      ? $L('Music Artists, Music Albums and Music Playlists are all turned off. To show one, go to Rows, open {group} under {disabled}, and turn it on.')
      : $L('To see Music Artists, Music Albums or Music Playlists on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn one on.')),
    empty: () => $L("There's no music to show, so Home leaves these rows out."),
  },
  collections: {
    rowsGroup: () => $L('Collections'),
    offText: (on) => (on
      ? $L('The Collections row is turned off. To show it, go to Rows, open {group} under {disabled}, and turn it on.')
      : $L('To see the Collections row on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn it on.')),
    empty: () => $L('There are no collections to show, so Home leaves this row out.'),
  },
  favorites: {
    rowsGroup: () => $L('Favorites'),
    offText: (on) => (on
      ? $L('The Favorites rows are all turned off. To show one, go to Rows, open {group} under {disabled}, and turn it on.')
      : $L('To see the Favorites rows on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn one on.')),
    empty: () => $L('There are no favorites to show, so Home leaves these rows out.'),
  },
  genres: { rowsGroup: () => $L('Genres and Studios'), offText: singleRowOff(() => $L('Genres')), empty: () => $L('There are no genres to show, so Home leaves this row out.') },
  playlists: { rowsGroup: () => $L('Playlists'), offText: singleRowOff(() => $L('Playlists')), empty: () => $L('There are no playlists to show, so Home leaves this row out.') },
  studios: { rowsGroup: () => $L('Genres and Studios'), offText: singleRowOff(() => $L('Studios')), empty: () => $L('There are no studios to show, so Home leaves this row out.') },
}

// The notice over the preview while the rows can't be on Home, naming the steps in the order the
// Rows screen needs them and the group of disabled rows to open there.
const offNotice = (group, reason, s) => {
  if (reason === 'unified') return $L("Home leaves these rows out while Multi-Server Libraries is on, so these settings don't change it.")
  if (reason === 'kids') return $L("Kids Mode keeps these rows off Home, so these settings don't change it.")
  return NOTICES[group].offText(Boolean(s[GROUPS[group].display]))
    .replace('{setting}', GROUPS[group].switchName())
    .replace('{group}', NOTICES[group].rowsGroup())
    .replace('{disabled}', $L('Disabled'))
}

// What came back for each group and sort, kept for a few minutes so scrubbing back to a sort
// draws it at once. A load that failed or timed out isn't kept, so the next look asks again.
const SAMPLE_TTL = 5 * 60 * 1000
const SAMPLE_TIMEOUT = 8000
// Wait this long after a sort changes before asking for it, so scrubbing through the choices
// only loads the one that's stopped on.
const SETTLE_MS = 150
// The focused row and up to this many below it, which is all the preview has room for.
const ROWS_SHOWN = 4
const samples = {}

const cachedSample = (key) => {
  const entry = samples[key]
  return entry && entry.rows && Date.now() - entry.at <= SAMPLE_TTL ? entry.rows : undefined
}

const fetchSample = (key, load) => {
  const entry = samples[key]
  if (entry && entry.pending) return entry.pending
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), SAMPLE_TIMEOUT)
  })
  const pending = Promise.race([load().catch(() => null), timeout]).then((rows) => {
    clearTimeout(timer)
    if (rows) samples[key] = { rows, at: Date.now() }
    else delete samples[key]
    return rows
  })
  samples[key] = { pending, at: Date.now() }
  return pending
}

// The group's rows through Home's own loaders, with the settings being tried.
const loadGroup = (s, libraries, ids) => {
  const { ctx } = planHomeRows(libraries, s)
  return Promise.all(ids.map((id) => loadHomeSection({ id }, ctx))).then((lists) => [].concat(...lists))
}

const byId = (rows) => {
  const out = {}
  ;(rows || []).forEach((row) => (out[row.id] = row))
  return out
}

// Whether an item wears a watched indicator: watch progress, the watched mark or a count of episodes left.
const hasIndicator = (item) => {
  const data = item.UserData || {}
  return data.PlayedPercentage > 0 || showsWatchedCheck(item) || data.UnplayedItemCount > 0
}

// The first of Home's rows that shows what [key] changes: the row being given an image type,
// a row with watched indicators, one with episodes, or My Media. Null for a setting any row shows.
const rowShowing = (key, focusRowId) => {
  if (focusRowId) {
    return (row) => {
      const id = imageTypeRowId(row)
      return id === focusRowId || (id === 'continue-nextup' && (focusRowId === 'resume' || focusRowId === 'nextup'))
    }
  }
  if (key === 'watchedIndicatorBehavior') return (row) => row.items.some(hasIndicator)
  if (key === 'hideHomeWatchProgress') return (row) => row.items.some((item) => (item.UserData || {}).PlayedPercentage > 0)
  if (key === 'hideHomeUnwatchedCount') return (row) => row.items.some((item) => (item.UserData || {}).UnplayedItemCount > 0)
  if (key === 'useSeriesThumbnails') return (row) => row.items.some((item) => item.Type === 'Episode')
  if (key === 'modernCardsOnMyMediaRow') return (row) => row.id === 'library-tiles'
  return null
}

// An item with the artwork its card on Home picks: the modern card's at rest and focused, or the
// classic card's for the row's image type. A wide classic card without that art falls back to
// a thumb or backdrop, and a genre card draws on one of its own items.
const previewItem = (item, look) => {
  const adapted = adaptItem(item)
  const itemServerUrl = item._serverUrl || look.serverUrl
  if (look.modern) {
    const card = { itemServerUrl, isStaticMyMedia: look.isStaticMyMedia, useSeriesThumbnails: look.useSeriesThumbnails }
    return { ...adapted, cardUrl: modernCardImageUrl(item, false, card), focusUrl: modernCardImageUrl(item, true, card) }
  }
  const art = (item.Type === 'Genre' && item._representative) || item
  const episode = item.Type === 'Episode' && look.shape !== 'banner' ? episodeArtwork(item, itemServerUrl, look.imageType, look.useSeriesThumbnails) : null
  const wide = look.shape === 'landscape' ? requestedArtwork(art, 'thumb', itemServerUrl) || adapted.backdropUrl : null
  return {
    ...adapted,
    cardUrl: item._studioLogoUrl || (episode && episode.url) || requestedArtwork(art, look.imageType, itemServerUrl) || wide ||
      (art === item ? adapted : adaptItem(art)).posterUrl,
  }
}

const previewRow = (row, s, serverUrl) => {
  const imageType = rowImageType(row, s)
  const shape = classicShape(row.type, imageType)
  const modern = s.homeRowsStyle !== 'v1'
  const staticCards = modern && isStaticLibraryCard(row.id === 'library-tiles', s)
  const look = { modern, imageType, shape, serverUrl, useSeriesThumbnails: s.useSeriesThumbnails, isStaticMyMedia: staticCards }
  return { id: row.id, title: row.title, items: row.items.slice(0, 8).map((item) => previewItem(item, look)), shape, staticCards, carousel: isCarouselRow(row, s) }
}

// Home's rows in Home's order with the group's rows as loaded for the sort being tried. A group
// row Home doesn't show yet goes where Rows orders it, and a row a tried switch turns off leaves.
export const homeOrder = (shown, config, wanted, s) => {
  const at = (id) => {
    const want = id === 'continue-nextup' ? 'resume' : id
    for (let i = 0; i < config.length; i++) if (config[i].id === want) return i
    return -1
  }
  const order = shown.order.filter((id) => isRowEnabledBySetting(id, s))
  wanted.forEach((id) => {
    if (order.indexOf(id) >= 0) return
    const mine = at(id)
    let pos = 0
    order.forEach((other, i) => {
      const theirs = at(other)
      if (theirs >= 0 && theirs < mine) pos = i + 1
    })
    order.splice(pos, 0, id)
  })
  return order
}

let held = null
let settle = null
let waiting = null
let last = null

// What the Home preview draws for the setting [key] with [s], the saved settings with the value
// being tried laid over them, and [focusRowId] the row an image type is being set for. Null for a
// setting it doesn't draw. Otherwise [rows] are Home's rows to draw, the focused one first, or null
// to draw the sample rows, [notice] says why a Row Options setting's rows can't be on Home, and
// [caption] is a note under the preview. [onChange] is called when a sample it waits on comes in.
export const rowOptionsHome = ({ key, s, focusRowId = null, hasMultipleServers = false, libraries = [], onChange = null }) => {
  const group = groupOf(key)
  if (!group && HOME_LOOK_KEYS.indexOf(key) < 0 && MEDIA_BAR_KEYS.indexOf(key) < 0) return null
  const owner = getServerUrl() + '|' + getUserId()
  const reason = group ? offReason(group, s, hasMultipleServers) : null
  const displayOn = !!(group && s[GROUPS[group].display])
  const config = homeRowsOf(s)
  const wanted = group ? config.filter((row) => row.enabled && GROUPS[group].rowIds.indexOf(row.id) >= 0).map((row) => row.id) : []
  const active = !!(group && !reason && displayOn && wanted.length > 0)
  const sampleKey = active ? [owner, group, wanted.join(',')].concat(GROUPS[group].keys.map((name) => s[name])).join('|') : null
  const cached = sampleKey ? cachedSample(sampleKey) : undefined
  const ready = cached !== undefined
  if (ready && (!held || held.key !== sampleKey)) held = { key: sampleKey, group, rows: byId(cached) }
  else if (active && waiting !== sampleKey) {
    clearTimeout(settle)
    waiting = sampleKey
    settle = setTimeout(() => {
      fetchSample(sampleKey, () => loadGroup(s, libraries, wanted)).then((rows) => {
        // A failed sort isn't asked for again until another one has been looked at.
        if (waiting !== sampleKey) return
        held = { key: sampleKey, group, rows: byId(rows) }
        if (onChange) onChange()
      })
    }, SETTLE_MS)
  }

  const shown = homeRowsShown()
  const memo = [key, s, focusRowId, hasMultipleServers, shown.version, held, ready]
  if (last && last.memo.every((value, i) => value === memo[i])) return last.out

  const own = shown.owner === owner ? shown : { order: [], rows: {} }
  const groupIds = active ? GROUPS[group].rowIds : []
  // A row loaded for an older sort stays up until the new one is in, and until the group's rows
  // first load, Home's own rows stand in for them. A row that failed to load keeps Home's.
  const results = ready ? byId(cached) : held && held.group === group ? held.rows : {}
  const fetched = {}
  wanted.forEach((id) => {
    fetched[id] = results[id] || (own.rows[id] && own.rows[id][0]) || null
  })
  const rows = []
  homeOrder(own, config, active ? wanted : [], s).forEach((id) => {
    const list = groupIds.indexOf(id) >= 0 ? (fetched[id] ? [fetched[id]] : []) : own.rows[id] || []
    // The preview builds Home from its loaders' rows alone, leaving out the Seerr and outside list rows.
    list.forEach((row) => {
      if (row && row.items && row.items.length > 0 && !row.isSeerrRow && !row.isExternalRow) rows.push(row)
    })
  })
  const groupAt = rows.findIndex((row) => groupIds.indexOf(row.id) >= 0)
  const showing = rowShowing(key, focusRowId)
  const focusedAt = groupAt >= 0 ? groupAt : Math.max(0, showing ? rows.findIndex(showing) : 0)
  const serverUrl = getServerUrl()
  const drawn = rows.length > 0 ? rows.slice(focusedAt, focusedAt + ROWS_SHOWN).map((row) => previewRow(row, s, serverUrl)) : null
  const empty = active && ready && wanted.every((id) => !fetched[id] || fetched[id].items.length === 0)

  let out
  const caption = key === 'collectionsRowShowEpisodes'
    ? $L('This only changes rows for a single collection added in Rows. The Collections row looks the same.')
    : null
  if (!group) out = { rows: drawn, notice: null, caption: null }
  else if (reason) out = { rows: drawn, notice: offNotice(group, reason, s), caption: null }
  // With the switch off Home simply goes without these rows, which is what it already shows.
  else if (!displayOn) out = { rows: drawn, notice: null, caption }
  // Only single collections added in Rows are on Home, and the preview doesn't draw those.
  else if (wanted.length === 0) out = { rows: drawn, notice: null, caption: $L('The Collections row is off, so this only changes the single collections added in Rows.') }
  // Home leaves an empty row out.
  else out = { rows: drawn, notice: groupAt < 0 && empty ? NOTICES[group].empty() : null, caption }
  last = { memo, out }
  return out
}
