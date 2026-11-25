import { For } from 'solid-js'
import $L from '../../../services/i18n.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { checkSeerr } from '../../../state/seerr.js'
import { getMediaDownloadSummary } from '../../../utils/seerrStatus.js'
import { arrQueueTarget, hdDownloadFor, hdNotFoundYet, readArrQueue, wantsArrQueue } from '../../../utils/seerrArrQueue.js'
import { cssShift, uiFont } from '../../text.js'
import { textWidth, wrapLines } from '../details/measure.js'
import { downloadBar } from './RequestsModels.js'
import { statusKey, statusPollInterval } from './seerrPoll.js'

// The download bars on a details page: a bar per quality track while something is downloading, or
// "Not found yet" where the HD bar would be when the arr is searching and finding nothing. The page
// keeps them moving with pollSeerr.
const W = 420

// One tick of the poll: the title fetched again with its downloads read again, 'reload' when its
// status or requests moved, or null when the fetch failed (a blip never clears the page).
export const pollSeerr = async (o) => {
  const d = await (o.mediaType === 'movie' ? seerrApi.getMovie(o.mediaId) : seerrApi.getTv(o.mediaId)).catch(() => null)
  if (!d) return null
  if (statusKey(d.mediaInfo) !== statusKey(o.details && o.details.mediaInfo)) return 'reload'
  return withDownloads({ ...o, details: d })
}

// The overlay with what the arr's queue (through Moonbase) and Seerr say about downloads, the
// release an admin may swap out and how soon to poll. Only the title's own page offers the swap,
// since a season or episode page shows the series-wide bar and a download from another season.
export const withDownloads = async (o) => {
  if (!o || !o.isActive || !o.details) return o
  const d = o.details
  const media = d.mediaInfo || null
  const seerr = await Promise.resolve(checkSeerr()).catch(() => null)
  const queues = !!(seerr && seerr.pluginInfo && seerr.pluginInfo.arrQueueAvailable === true)
  const tvdbId = media && media.tvdbId != null ? media.tvdbId : d.externalIds && d.externalIds.tvdbId
  const target = queues && wantsArrQueue(media) ? arrQueueTarget(o.mediaType, { ...media, tvdbId }) : null
  const view = readArrQueue(target ? await seerrApi.getArrQueue(target.service, target.id).catch(() => null) : null)
  const hd = hdDownloadFor(media, view)
  const notFoundYet = !hd && hdNotFoundYet(media, view)
  const fourK = getMediaDownloadSummary(media, true)
  const swapRelease = hd && view && !o.seriesPart ? view.removable || null : null
  return {
    ...o,
    downloads: hd || fourK || notFoundYet ? { hd, fourK, notFoundYet } : null,
    swapRelease,
    showsSwapRelease: !!swapRelease,
    showsManageSlot: !!o.showsManage || !!swapRelease,
    pollMs: statusPollInterval(media, hd),
  }
}

// The block's draw lists from its top left, and its height (0 with nothing to show). `center` is for
// a page whose text is centered (Premiere), where each bar's left words and the reason center in
// their own room.
export const downloadsLayout = (downloads, { center = false } = {}) => {
  const out = { rects: [], icons: [], texts: [], h: 0 }
  if (!downloads) return out
  const { hd, fourK, notFoundYet } = downloads
  let y = 0
  let n = 0
  const text = (x, top, t, size, color, lh, maxw) => out.texts.push({ k: `t${n++}`, x, y: top + cssShift(size), t, size, font: uiFont(), color, lh, maxw: maxw || 0 })
  const gap = () => {
    if (y > 0) y += 8
  }
  if (notFoundYet) {
    gap()
    const label = fourK ? `HD · ${$L('Not found yet')}` : $L('Not found yet')
    out.icons.push({ k: `i${n++}`, x: 0, y: y + (33 - 24.2) / 2, w: 24.2, h: 24.2, src: 'icons/search_off.webp', color: '#ffffff99' })
    text(32, y, label, 22, '#ffffff99', 33, W - 32)
    y += 33
  }
  const bar = (summary, prefix) => {
    const b = downloadBar(summary, { compact: false, prefix, width: W })
    gap()
    if (b.lead) text(center ? Math.max(0, (b.leadW - textWidth(b.lead, b.size)) / 2) : 0, y, b.lead, b.size, '#ffffffb3', 33, b.leadW)
    if (b.sep) text(b.sepX, y, b.sep, b.size, '#ffffffb3', 33)
    if (b.pct) text(b.pctX, y, b.pct, b.size, '#ffffffb3', 33)
    out.rects.push({ k: `r${n++}`, x: 0, y: y + b.trackY, w: W, h: b.trackH, r: b.trackH / 2, color: '#505050d9', alpha: 1 })
    if (b.fillW > 0) out.rects.push({ k: `r${n++}`, x: 0, y: y + b.trackY, w: Math.max(b.trackH, b.fillW), h: b.trackH, r: b.trackH / 2, color: b.fill, alpha: b.fillAlpha })
    y += b.h
    // The arr's own words for why it's stuck, up to three lines under the bar.
    if (summary.reason) {
      const lines = wrapLines(summary.reason, 20, 'regular', W).slice(0, 3)
      y += 6
      lines.forEach((line) => {
        text(center ? (W - textWidth(line, 20)) / 2 : 0, y, line, 20, '#ffffff99', 25)
        y += 25
      })
    }
  }
  if (hd) bar(hd, fourK ? 'HD' : null)
  if (fourK) bar(fourK, '4K')
  out.h = y
  return out
}

const EMPTY = { rects: [], icons: [], texts: [], h: 0 }

// Draws downloadsLayout()'s lists at `x`, `y`: `bars` is its answer.
export default function SeerrStatusDownloads(props) {
  const bars = () => props.bars || EMPTY
  return (
    <view x={props.x || 0} y={props.y || 0}>
      <view>
        <For each={bars().rects}>
          {(r) => <view x={r.x} y={r.y} width={r.w} height={r.h} borderRadius={r.r} color={r.color} alpha={r.alpha} />}
        </For>
      </view>
      <view>
        <For each={bars().icons}>{(ic) => <view x={ic.x} y={ic.y} width={ic.w} height={ic.h} src={ic.src} color={ic.color} />}</For>
      </view>
      <view>
        <For each={bars().texts}>
          {(tx) => (
            <text x={tx.x} y={tx.y} fontFamily={tx.font} fontSize={tx.size} color={tx.color} lineHeight={tx.lh} maxWidth={tx.maxw || 4000} maxLines={1}>
              {tx.t}
            </text>
          )}
        </For>
      </view>
    </view>
  )
}
