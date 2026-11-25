// The action row's buttons: Play and Resume lead, the rest follow in the viewer's Action Buttons
// order with what they hid left out, and a cap from Action Buttons on Screen folds the overflow
// behind More Actions.
import $L from '../../../services/i18n.js'
import { applyButtonLimit, arrange, countSplit, seerrOnlyRow, splitSlots, DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY } from '../../../utils/buttonLayout.js'
import { isKidsMode, kidsModeButtons } from '../../../utils/kidsMode.js'
import { displayRatingLikes, personalRatingOf, starRatingLabel } from '../../../utils/personalRating.js'
import { offersFavorite } from '../personFavorite.js'

export const ratingIcon = (style, ud) => {
  if (style !== 'thumbs') return style === 'numeric' ? 'rating_numbers' : 'rating_star'
  return displayRatingLikes(ud) === false ? 'rating_thumbDown' : 'rating_thumbUp'
}

export const ratingLabel = (style, ud) => {
  const rating = personalRatingOf(ud)
  if (style === 'thumbs') {
    const likes = displayRatingLikes(ud)
    if (likes === null) return $L('Rate')
    return likes ? $L('Like') : $L('Dislike')
  }
  if (rating === null) return $L('Rate')
  if (style === 'stars') return starRatingLabel(rating) || $L('Rate')
  return $L('Rated')
}

const offersGoToSeries = (p) => {
  const t = p.item.Type
  return Boolean(((t === 'Episode' || t === 'Season') && p.item.SeriesId) || (t === 'Book' && !p.bookSeriesItem && String(p.item.SeriesName || '').trim()))
}

// Every button but Play and Resume, in declaration order, each with whether it applies. A slot can
// hold more than one button (`parts`), and each counts on its own.
export const catalogue = (p) => {
  const it = p.item
  const t = it.Type
  const ud = it.UserData || {}
  const sr = p.seerr
  const isPerson = t === 'Person'
  const isPlaylist = t === 'Playlist'
  const tracks = p.playlistTracks
  return [
    { id: 'seerrRequest', when: sr.showsRequest, parts: [
      { id: 'seerrRequest', when: sr.offersRequest, icon: 'request', label: sr.requestLabel },
      { id: 'seerrCancel', when: sr.canCancelHd, icon: 'cancelRequest', label: $L('Cancel Request') },
    ] },
    { id: 'seerrRequest4k', when: sr.showsRequest4k, parts: [
      { id: 'seerrRequest4k', when: sr.offersRequest4k, icon: 'request', label: sr.requestLabel4k },
      { id: 'seerrCancel4k', when: sr.canCancel4k, icon: 'cancelRequest', label: $L('Cancel 4K Request') },
    ] },
    { id: 'shuffle', icon: 'shuffle', label: $L('Shuffle'),
      when: t === 'Series' || t === 'Season' || t === 'BoxSet' || (isPlaylist && (tracks ? tracks.length > 1 : (it.ChildCount > 1 || it.RecursiveItemCount > 1))) },
    { id: 'version', icon: 'version', label: $L('Version'), when: p.hasMultipleVersions },
    { id: 'audio', icon: 'audio', label: $L('Audio'), when: p.hasMultipleAudio },
    { id: 'subtitles', icon: 'subtitle', label: $L('Subtitle'), when: p.supportsMediaSourceSelection },
    { id: 'trailer', icon: 'trailer', label: $L('Trailer'), when: p.hasTrailer },
    { id: 'watchWithGroup', icon: 'group', label: $L('Watch with group'), when: p.inSyncPlayGroup && t !== 'Book' && !isPerson },
    { id: 'watched', icon: 'watched', label: ud.Played ? $L('Watched') : $L('Mark as Watched'), active: !!ud.Played, when: !isPerson },
    { id: 'favorite', icon: 'favorite', label: ud.IsFavorite ? $L('Favorited') : $L('Favorite'), active: !!ud.IsFavorite, when: offersFavorite(isPerson, p.serverUrl) },
    { id: 'personDisplay', icon: 'tune', label: $L('Display'), when: isPerson },
    { id: 'personalRating', icon: ratingIcon(p.ratingStyle, ud), label: ratingLabel(p.ratingStyle, ud), when: p.showsPersonalRating },
    { id: 'goToSeries', icon: 'series', label: $L('Go to Series'), when: offersGoToSeries(p) },
    { id: 'playlist', icon: 'playlist', label: $L('Add to Playlist'), when: !isPerson },
    { id: 'collection', icon: 'collection', label: $L('Add to Collection'), when: p.canAddToCollection },
    { id: 'deleteFiles', icon: 'delete', label: $L('Delete'), when: !!it.CanDelete },
    { id: 'artwork', icon: 'artwork', label: $L('Change Artwork'), when: p.canChangeArtwork },
    { id: 'seerrWatchlist', icon: sr.onWatchlist ? 'watchlistOn' : 'watchlist', label: sr.onWatchlist ? $L('On Watchlist') : $L('Add to Watchlist'), active: sr.onWatchlist, when: sr.showsWatchlist },
    { id: 'seerrReportIssue', icon: 'reportIssue', label: $L('Report Issue'), when: sr.showsReportIssue },
    { id: 'seerrManage', when: sr.showsManageSlot, parts: [
      { id: 'seerrManage', when: sr.showsManage, icon: 'manageRequests', label: $L('Manage Requests') },
      { id: 'seerrSwapRelease', when: sr.showsSwapRelease, icon: 'swapRelease', label: $L('Get a different release') },
    ] },
    { id: 'keepAsComplete', icon: 'keepAsComplete', label: $L('Keep as Complete'), when: p.canKeepAsComplete },
    { id: 'admin', icon: 'admin', label: $L('Admin Controls'), when: p.canIdentify },
  ]
}

// The row and what folds behind More Actions. Modern passes no options: every button stays inline
// unless Action Buttons on Screen sets a number. The other styles pass `omitTrackButtons` (the
// pickers drawn elsewhere), `buttonCap` (a cap the viewer's count can lower but never lift),
// `maxVisibleButtons` with `overflowAsMenu`, `extras` and `collectionItems` (a label) for the
// buttons that follow Play, and `longLabels` for Stage, Premiere and Frost's "Resume from" label.
const TRACK_BUTTONS = ['version', 'audio', 'subtitles']

export const actionRow = (p, o = {}) => {
  const s = p.settings
  const it = p.item
  const t = it.Type
  const isPerson = t === 'Person'
  const isBook = t === 'Book'
  const shown = catalogue(p).filter((b) => b.when && !(o.omitTrackButtons && TRACK_BUTTONS.indexOf(b.id) >= 0))
  // A Seerr-only title has nothing to play, so only Seerr's buttons and the trailer stay.
  const offered = p.seerrOnly ? seerrOnlyRow(shown) : shown
  const kids = isKidsMode(s)
  const rest = splitSlots(kids ? kidsModeButtons(offered, true) : arrange(offered, { order: s[DETAIL_ORDER_KEY], hidden: s[DETAIL_HIDDEN_KEY] }))
  const hasPosition = (it.UserData && it.UserData.PlaybackPositionTicks > 0) || false
  const showsResume = !p.seerrOnly && !isPerson && hasPosition && !isBook
  const showsPlay = !p.seerrOnly && !isPerson && (isBook ? p.isReadableBook : true) && (t !== 'Playlist' || (p.playlistTracks ? p.playlistTracks.length > 0 : true))
  const lead = []
  const long = Boolean(p.offersStreamOptions)
  if (showsResume) {
    lead.push(o.longLabels
      ? { id: 'resume', icon: 'play', label: $L('Resume from {position}').replace('{position}', p.resumeTimeText), primary: true, long }
      : { id: 'resume', icon: 'play', label: $L('Resume'), detail: p.resumeTimeText, primary: true, long })
  }
  if (showsPlay) {
    lead.push({
      id: 'play', icon: isBook ? 'book' : hasPosition ? 'restart' : 'play', label: isBook ? $L('Read') : hasPosition ? $L('Restart') : $L('Play'), primary: !hasPosition, long,
    })
  }
  if (o.extras) lead.push({ id: 'extras', icon: 'videoLibraryOutlined', label: $L('Extras') })
  if (o.collectionItems) lead.push({ id: 'collectionItems', icon: 'collectionsBookmarkOutlined', label: o.collectionItems })
  const prefLimit = kids ? 0 : s.detailButtonsMaxVisible || 0
  const split = countSplit({
    totalButtons: lead.length + rest.length,
    ...(o.buttonCap
      ? { maxVisible: prefLimit > 0 ? Math.min(prefLimit + 1, o.buttonCap) : o.buttonCap, overflowAsMenu: true, countCapped: true }
      : applyButtonLimit(prefLimit, { maxVisible: o.maxVisibleButtons || 0, overflowAsMenu: o.overflowAsMenu, countCapped: Boolean(o.maxVisibleButtons) })),
  })
  if (!split.needsOverflow) return { buttons: lead.concat(rest), behind: [] }
  const keep = Math.max(0, split.visibleCount - lead.length)
  return { buttons: lead.concat(rest.slice(0, keep), [{ id: 'more', icon: 'moreHoriz', label: $L('More Actions') }]), behind: rest.slice(keep) }
}
