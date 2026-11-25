// The status poll rules for a details page.
import { getMediaDownloadSummary, isMediaInFlight } from '../../../utils/seerrStatus.js'

const DOWNLOAD_POLL_MS = 15000
const WAITING_POLL_MS = 30000

// How often the open page fetches the title again, or null once nothing is on its way. A download
// moves every few seconds, while a request waiting on approval or on the library scan changes far
// less often. hdDownload is the HD bar as drawn, which the arr's own queue can show when Seerr's
// copy of it is empty.
export const statusPollInterval = (media, hdDownload = getMediaDownloadSummary(media, false)) => {
  if (hdDownload || getMediaDownloadSummary(media, true)) return DOWNLOAD_POLL_MS
  if (isMediaInFlight(media, false) || isMediaInFlight(media, true)) return WAITING_POLL_MS
  return null
}

// What else the overlay reads from the title. A change here needs the whole overlay worked out again.
export const statusKey = (media) => (media ? JSON.stringify([media.status, media.status4k, media.requests, media.seasons]) : '')
