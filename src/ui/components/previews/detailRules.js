// The settings-driven pieces of the detail style previews: which facts, chips and buttons the sample
// film shows, in the viewer's order, and how far the artwork is darkened. Pure, so
// detailRules.check.mjs can test them.
import $L from '../../../services/i18n.js'
import { arrange, countSplit, applyButtonLimit, DETAIL_BUTTONS, DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY } from '../../../utils/buttonLayout.js'
import { DETAIL_METADATA, DETAIL_METADATA_ORDER_KEY, DETAIL_METADATA_HIDDEN_KEY } from '../../../utils/detailMetadataLayout.js'
import { formatFileSize } from '../../../utils/formatFileSize.js'
import { normalizeRatingStyle } from '../../../utils/personalRating.js'
import { getMediaBadges } from '../../../pages/Details/detailsMedia.js'
import { splitNouveauActions } from '../../../pages/Details/nouveau/nouveauActionSplit.js'
import { STAGE_BUTTON_CAP } from '../../../pages/Details/stage/stageRules.js'
import { QUICK_LOOK_BUTTON_CAP } from '../../../pages/Details/quickLook/quickLookRules.js'
import { FROST_BUTTON_CAP } from '../../../pages/Details/frost/frostRules.js'
import { ratingIcon, ratingLabel } from '../../../pages/Details/modern/actions.js'
import { SAMPLE_USER_DATA } from './sampleRatings.js'
import { runtimeText } from './kit.js'

// The facts under a details title, in the Metadata Row order with the hidden ones left out. The
// sample is a film, so a series' status, upcoming episodes and Seerr availability add nothing.
export const detailMeta = (item, s) => arrange(DETAIL_METADATA, { order: s[DETAIL_METADATA_ORDER_KEY], hidden: s[DETAIL_METADATA_HIDDEN_KEY] })
  .map(({ id }) => {
    if (id === 'year') return item.year ? { id, text: String(item.year) } : null
    if (id === 'parentalRating') return item.officialRating ? { id, text: item.officialRating } : null
    if (id === 'runtimeAndSeasons') return item.runtimeMinutes ? { id, text: runtimeText(item.runtimeMinutes) } : null
    if (id === 'genres') return item.genres.length > 0 ? { id, text: item.genres.slice(0, 3).join(' · ') } : null
    return null
  })
  .filter(Boolean)

// A 4K HDR film with surround sound, labeled by the same helper the details screen uses.
const SAMPLE_MEDIA = { MediaSources: [{ Container: 'mkv', MediaStreams: [
  { Type: 'Video', Width: 3840, VideoRangeType: 'HDR10', Codec: 'hevc' },
  { Type: 'Audio', Channels: 6, Codec: 'eac3' },
] }] }
const SAMPLE_FILE_BYTES = 26.4 * 1024 * 1024 * 1024

export const detailTech = (s) => (s.detailShowTechnicalDetails ? { badges: getMediaBadges(SAMPLE_MEDIA), size: formatFileSize(SAMPLE_FILE_BYTES) } : null)

// The styles after Classic read Background Blur as how far the artwork is darkened.
export const detailWash = (s) => {
  const factor = Math.min(1, Math.max(0, Number(s.backdropBlurDetail != null ? s.backdropBlurDetail : 20) / 25))
  return { alpha: factor * 0.8, gradientScale: 0.3 + 0.7 * factor }
}

// The buttons a film offers someone who can't manage the library, kept in the row's declaration order.
const SAMPLE_ACTION_LOOKS = {
  subtitles: () => ({ icon: 'icons/d/subtitle.webp', label: $L('Subtitle') }),
  trailer: () => ({ icon: 'icons/d/trailer.webp', label: $L('Trailer') }),
  watched: () => ({ icon: 'icons/d/watched.webp', label: $L('Mark as Watched') }),
  favorite: () => ({ icon: 'icons/d/favorite.webp', label: $L('Favorite') }),
  personalRating: (s) => {
    const style = normalizeRatingStyle(s.personalRatingStyle)
    return { icon: `icons/d/${ratingIcon(style, SAMPLE_USER_DATA)}.webp`, label: ratingLabel(style, SAMPLE_USER_DATA) }
  },
  playlist: () => ({ icon: 'icons/d/playlist.webp', label: $L('Add to Playlist') }),
}
const SAMPLE_ACTIONS = DETAIL_BUTTONS.filter((button) => SAMPLE_ACTION_LOOKS[button.id])

export const MORE_ICON = 'icons/d/moreHoriz.webp'

// The film's buttons after Play in the viewer's order, split the way [variant]'s row splits them.
// Spotlight and Minimalist cap at five, Nouveau keeps its own rule, Classic and Modern only fold
// once the viewer sets a count. Stage, Quick Look and Frost cap (five, six, six), which the count can
// lower but never lift, and draw the subtitle picker as a chip, as Premiere does with a cap of six.
export const detailActions = (variant, s) => {
  const buttonCap = { v6: STAGE_BUTTON_CAP, v8: QUICK_LOOK_BUTTON_CAP, v9: FROST_BUTTON_CAP }[variant]
  const offered = arrange(SAMPLE_ACTIONS, { order: s[DETAIL_ORDER_KEY], hidden: s[DETAIL_HIDDEN_KEY] })
    .filter((button) => ['v6', 'v7', 'v8', 'v9'].indexOf(variant) < 0 || button.id !== 'subtitles')
  const prefLimit = s.detailButtonsMaxVisible != null ? s.detailButtonsMaxVisible : 0
  let inline = offered
  let more = false
  if (variant === 'v4') {
    const split = splitNouveauActions(offered, prefLimit)
    inline = split.inline
    more = split.overflow.length > 0
  } else {
    const cap = { v3: 5, v5: 5, v7: 6 }[variant] || 0
    const layout = buttonCap
      ? { maxVisible: prefLimit > 0 ? Math.min(prefLimit + 1, buttonCap) : buttonCap, overflowAsMenu: true, countCapped: true }
      : applyButtonLimit(prefLimit, { maxVisible: cap, overflowAsMenu: cap > 0, countCapped: cap > 0 })
    const { visibleCount, needsOverflow } = countSplit({ totalButtons: 1 + offered.length, ...layout })
    if (needsOverflow) {
      inline = offered.slice(0, Math.max(0, visibleCount - 1))
      more = true
    }
  }
  return { inline: inline.map((button) => ({ id: button.id, ...SAMPLE_ACTION_LOOKS[button.id](s) })), more }
}
