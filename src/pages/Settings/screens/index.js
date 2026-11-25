// The settings screens built outside the schema, by view name, and the schema's custom rows by
// render name. A screen is { title(page, view), entries(page, view), enter(page, sid, stop, view),
// side(page, sid, dir, stop, view), leave(page, view), action(page, view), onAction(page, view) }.
import $L from '../../../services/i18n.js'
import { navEntry } from '../schemaEntries.js'
import { clearTmdbReviewsCache } from '../../../utils/tmdbReviews.js'

import * as account from './account.js'
import * as editors from './editors.js'
import * as social from './social.js'

export const SCREENS = {}

// The About header is the logo and the version over a rule.
const aboutHeader = () => ({
  type: 'block',
  block: 'aboutHeader',
  k: 'aboutHeader',
  h: 262.12,
  version: $L('Version {version}').replace('{version}', process.env.REACT_APP_VERSION || '0.0.0'),
})

export const CUSTOM = {
  aboutHeader,
  aboutDataActions: (page) =>
    navEntry('clear-all-data', $L('Clear All Data'), '', 'delete_forever', { press: (pg) => pg.openClearData && pg.openClearData() }),
  imageCacheActions: (page) =>
    navEntry('clear-image-cache', $L('Clear Image Cache'), page._cacheCleared ? $L('Image cache cleared') : '', 'cleaning_services_outlined', {
      press: (pg) => {
        clearTmdbReviewsCache()
        pg._cacheCleared = true
        pg.refresh()
      },
    }),
}

;[account, editors, social].forEach((area) => {
  Object.assign(SCREENS, area.SCREENS)
  Object.assign(CUSTOM, area.CUSTOM)
})

// What each area reads from the server when Settings opens, into the context's data. Each is
// load(page, data, done) and calls done() after it changes data.
export const LOADERS = [account, editors, social].map((area) => area.load).filter(Boolean)
