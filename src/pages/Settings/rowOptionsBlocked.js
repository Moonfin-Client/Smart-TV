// What the inspector says to change before a Row Options setting can change Home, with the groups
// of rows those settings sort and the Display switch over each.
import $L from '../../services/i18n.js'
import { FAVORITE_ROW_IDS } from '../../utils/homeRowGates.js'
import { isKidsMode, kidsModeRows } from '../../utils/kidsMode.js'
import { isPickedRow } from '../../utils/pickedRows.js'
import {
  AUDIO_ROW_OPTION_KEYS,
  COLLECTIONS_ROW_OPTION_KEYS,
  FAVORITES_ROW_OPTION_KEYS,
  GENRES_ROW_OPTION_KEYS,
  PLAYLISTS_ROW_OPTION_KEYS,
  STUDIOS_ROW_OPTION_KEYS,
} from './previewRows.js'

export const GROUPS = {
  audio: { display: 'displayAudioRows', rowIds: ['audioartists', 'audioalbums', 'audioplaylists'], keys: AUDIO_ROW_OPTION_KEYS, switchName: () => $L('Display Audio Rows') },
  collections: { display: 'displayCollectionsRows', rowIds: ['collections'], keys: COLLECTIONS_ROW_OPTION_KEYS, switchName: () => $L('Display Collections Rows') },
  favorites: { display: 'displayFavoritesRows', rowIds: FAVORITE_ROW_IDS, keys: FAVORITES_ROW_OPTION_KEYS, switchName: () => $L('Display Favorites Rows') },
  genres: { display: 'displayGenresRows', rowIds: ['genres'], keys: GENRES_ROW_OPTION_KEYS, switchName: () => $L('Display Genres Rows') },
  playlists: { display: 'displayPlaylistsRows', rowIds: ['playlists'], keys: PLAYLISTS_ROW_OPTION_KEYS, switchName: () => $L('Display Playlist Rows') },
  studios: { display: 'displayStudiosRows', rowIds: ['studios'], keys: STUDIOS_ROW_OPTION_KEYS, switchName: () => $L('Display Studio Row') },
}

export const groupOf = (key) => Object.keys(GROUPS).find((id) => GROUPS[id].keys.indexOf(key) >= 0) || null

// Home's rows in Home's order, without the ones Kids Mode keeps off.
export const homeRowsOf = (settings) => kidsModeRows([...(settings.homeRows || [])].sort((a, b) => a.order - b.order), isKidsMode(settings))

// A single collection added as its own row in Rows, which the Collections sort settings sort too.
const isPickedCollection = (row) => row.enabled && isPickedRow(row) && row.source === 'collections'

// Why none of [group]'s rows can be on Home, or null when one can.
export const offReason = (group, settings, hasMultipleServers) => {
  if (settings.unifiedLibraryMode && hasMultipleServers) return 'unified'
  if (isKidsMode(settings)) return 'kids'
  const rows = homeRowsOf(settings)
  if (rows.some((row) => row.enabled && GROUPS[group].rowIds.indexOf(row.id) >= 0)) return null
  if (group === 'collections' && rows.some(isPickedCollection)) return null
  return 'rows'
}

// The Rows screen only lists the rows once their Display switch is on, so with the switch off that comes first.
export const rowOptionsBlockedReason = (key, settings, hasMultipleServers) => {
  const group = groupOf(key)
  if (!group) return null
  switch (offReason(group, settings, hasMultipleServers)) {
    case 'unified':
      return $L('Multi-Server Libraries keeps this off Home')
    case 'kids':
      return $L('Kids Mode keeps this off Home')
    case 'rows':
      return settings[GROUPS[group].display]
        ? $L('Turn on a row in Rows, under {disabled}').replace('{disabled}', $L('Disabled'))
        : $L('Turn on {setting}, then turn on a row in Rows').replace('{setting}', GROUPS[group].switchName())
    default:
      return null
  }
}
