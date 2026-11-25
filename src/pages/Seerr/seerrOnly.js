// A title the library doesn't hold opens on the Details page as Seerr's details dressed up as an
// item, with the action row cut to Seerr's buttons and the trailer, one Request control for both
// quality tracks, and cast that opens Seerr's person page. A title Seerr says the library holds
// opens as itself.
import * as seerrApi from '../../services/seerrApi.js'
import { checkSeerr } from '../../state/seerr.js'
import { buildSeerrDetailItem } from '../../utils/seerrDetailItem.js'
import { libraryIdOf } from '../../utils/seerrTarget.js'
import { loadRecord } from '../Details/load.js'

// The record Details shows for /seerr/item/:mediatype/:id. A title Seerr has nothing to say about,
// such as when it isn't set up, shows as blocked, with no retry.
export const loadSeerrOnlyRecord = async (mediaType, mediaId) => {
  const type = mediaType === 'tv' ? 'tv' : 'movie'
  const seerr = await Promise.resolve(checkSeerr()).catch(() => null)
  if (!seerr || !seerr.available) return { blocked: true }
  const details = await (type === 'tv' ? seerrApi.getTv(mediaId) : seerrApi.getMovie(mediaId)).catch(() => null)
  if (!details) return { blocked: true }
  const owned = libraryIdOf(details.mediaInfo)
  if (owned) return loadRecord(owned, null)
  return { item: { ...buildSeerrDetailItem(details, type), _seerrMediaId: Number(mediaId), _seerrMediaType: type } }
}

// The Seerr-only rules over the overlay pages/Details/seerr.js loads: with nothing owned one
// control covers both tracks (its sheet gets a quality switch when both are open), and it reads as
// the 4K request when only 4K is open.
export const seerrOnlyOverlay = (o) => {
  if (!o || !o.isActive) return o
  const hd = !!o.offersRequest
  const fourK = !!o.offersRequest4k
  return {
    ...o,
    seerrOnly: true,
    canRequestHd: hd,
    canRequest4k: fourK,
    offersRequest: hd || fourK,
    offersRequest4k: false,
    requestLabel: hd ? o.requestLabel : o.requestLabel4k,
    showsRequest: hd || fourK || !!o.canCancelHd,
    showsRequest4k: !!o.canCancel4k,
  }
}
