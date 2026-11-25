// Classic's action row: Resume and Play lead, the rest follow in the viewer's Action Buttons order
// with what they hid left out, and Action Buttons on Screen folds the overflow behind More. Ids are
// the ones Details' runAction takes.
import $L from '../../../services/i18n.js'
import { applyButtonLimit, arrange, countSplit, seerrOnlyRow, splitSlots, DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY } from '../../../utils/buttonLayout.js'
import { isKidsMode, kidsModeButtons } from '../../../utils/kidsMode.js'
import { getServerType } from '../../../services/jellyfinApi.js'
import { searchesForTrailer } from '../../../services/youtubeTrailer.js'
import { ratingIcon, ratingLabel } from '../modern/actions.js'

const trackName = (stream, i) => stream.DisplayTitle || stream.Language || `${$L('Track')} ${i + 1}`

// `p` is Details' actionInput, `tracks` the version, audio and subtitle on show.
export const classicActions = (p, tracks) => {
  const it = p.item
  const t = it.Type
  const ud = it.UserData || {}
  const sr = p.seerr
  const isSeries = t === 'Series'
  const isEpisode = t === 'Episode'
  const isSeason = t === 'Season'
  const isBook = t === 'Book'
  const ms = (it.MediaSources || [])[tracks.version] || (it.MediaSources || [])[0]
  const streams = (ms && ms.MediaStreams) || []
  const audios = streams.filter((x) => x.Type === 'Audio')
  const subs = streams.filter((x) => x.Type === 'Subtitle')
  const audio = audios[tracks.audio]
  const sub = tracks.subtitle >= 0 ? subs[tracks.subtitle] : null
  const searchesTrailer = (t === 'Movie' || isSeries) && searchesForTrailer(it, getServerType())
  const goToSeries = ((isEpisode || isSeason) && Boolean(it.SeriesId)) || (isBook && Boolean(String(it.SeriesName || '').trim()))
  const offered = [
    { id: 'seerrRequest', when: sr.showsRequest, parts: [
      { id: 'seerrRequest', when: sr.offersRequest, icon: 'request', label: sr.requestLabel },
      { id: 'seerrCancel', when: sr.canCancelHd, icon: 'cancelRequest', label: $L('Cancel Request') },
    ] },
    { id: 'seerrRequest4k', when: sr.showsRequest4k, parts: [
      { id: 'seerrRequest4k', when: sr.offersRequest4k, icon: 'request', label: sr.requestLabel4k },
      { id: 'seerrCancel4k', when: sr.canCancel4k, icon: 'cancelRequest', label: $L('Cancel 4K Request') },
    ] },
    { id: 'shuffle', when: isSeries || isSeason || t === 'BoxSet', icon: 'shuffle', label: $L('Shuffle') },
    { id: 'version', when: p.hasMultipleVersions, icon: 'version', label: $L('Version'), detail: (ms && ms.Name) || `${$L('Version')} ${tracks.version + 1}` },
    { id: 'audio', when: p.hasMultipleAudio, icon: 'audio', label: $L('Audio'), detail: audio ? trackName(audio, tracks.audio) : '' },
    { id: 'subtitles', when: p.supportsMediaSourceSelection, icon: 'subtitle', label: $L('Subtitle'), detail: sub ? trackName(sub, tracks.subtitle) : $L('Off') },
    { id: 'trailer', when: it.LocalTrailerCount > 0 || (it.RemoteTrailers && it.RemoteTrailers.length > 0) || searchesTrailer, icon: 'trailer', label: $L('Trailer') },
    { id: 'watchWithGroup', when: p.inSyncPlayGroup && !isBook, icon: 'group', label: $L('Watch with group') },
    { id: 'watched', when: true, icon: 'watched', label: ud.Played ? $L('Watched') : $L('Mark as Watched'), state: ud.Played ? 'watched' : '' },
    { id: 'favorite', when: true, icon: 'favorite', label: ud.IsFavorite ? $L('Favorited') : $L('Favorite'), state: ud.IsFavorite ? 'favorited' : '' },
    { id: 'personalRating', when: p.showsPersonalRating, icon: ratingIcon(p.ratingStyle, ud), label: ratingLabel(p.ratingStyle, ud) },
    { id: 'goToSeries', when: goToSeries, icon: 'series', label: $L('Go to Series') },
    { id: 'playlist', when: true, icon: 'playlist', label: $L('Add to Playlist') },
    { id: 'collection', when: p.canAddToCollection, icon: 'collection', label: $L('Add to Collection') },
    { id: 'deleteFiles', when: Boolean(it.CanDelete), icon: 'delete', label: $L('Delete') },
    { id: 'seerrWatchlist', when: sr.showsWatchlist, icon: sr.onWatchlist ? 'watchlistOn' : 'watchlist', label: sr.onWatchlist ? $L('On Watchlist') : $L('Add to Watchlist') },
    { id: 'seerrReportIssue', when: sr.showsReportIssue, icon: 'reportIssue', label: $L('Report Issue') },
    { id: 'seerrManage', when: sr.showsManageSlot, parts: [
      { id: 'seerrManage', when: sr.showsManage, icon: 'manageRequests', label: $L('Manage Requests') },
      { id: 'seerrSwapRelease', when: sr.showsSwapRelease, icon: 'swapRelease', label: $L('Get a different release') },
    ] },
    { id: 'keepAsComplete', when: Boolean(p.canKeepAsComplete), icon: 'keepAsComplete', label: $L('Keep as Complete') },
    { id: 'admin', when: p.canIdentify, icon: 'admin', label: $L('Admin Controls') },
  ]
  const s = p.settings
  const row = p.seerrOnly ? seerrOnlyRow(offered) : offered
  const shown = row.filter((b) => b.when)
  const arranged = isKidsMode(s) ? kidsModeButtons(shown, true) : arrange(shown, { order: s[DETAIL_ORDER_KEY], hidden: s[DETAIL_HIDDEN_KEY] })
  const rest = splitSlots(arranged)

  const hasPosition = Boolean(ud.PlaybackPositionTicks > 0)
  const showsResume = !p.seerrOnly && !isBook && hasPosition
  const showsPlay = !p.seerrOnly && (isBook ? p.isReadableBook : true)
  const lead = []
  const long = Boolean(p.offersStreamOptions)
  if (showsResume) lead.push({ id: 'resume', glyph: true, label: $L('Resume'), detail: p.resumeTimeText, long })
  if (showsPlay) {
    lead.push(isBook
      ? { id: 'play', icon: 'book', label: $L('Read') }
      : hasPosition ? { id: 'play', icon: 'restart', label: $L('Restart'), long } : { id: 'play', glyph: true, label: $L('Play'), long })
  }

  const prefLimit = s.detailButtonsMaxVisible == null ? 0 : s.detailButtonsMaxVisible
  const split = countSplit({ totalButtons: lead.length + rest.length, ...applyButtonLimit(prefLimit, { maxVisible: 0, overflowAsMenu: undefined, countCapped: false }) })
  if (!split.needsOverflow) return { buttons: lead.concat(rest), behind: [], scroll: prefLimit === -1 }
  const keep = Math.max(0, split.visibleCount - lead.length)
  return { buttons: lead.concat(rest.slice(0, keep), [{ id: 'more', icon: 'admin', label: $L('More') }]), behind: rest.slice(keep), scroll: prefLimit === -1 }
}
