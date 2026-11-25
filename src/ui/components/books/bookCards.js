// What a book card shows, worked out once per item.
import $L from '../../../services/i18n.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import {
  bookImageUrl,
  bookSubtitle,
  formatBookDuration,
  isAudiobookItem,
  isComicItem,
  playedPercent,
  remainingTicks,
} from '../../../utils/bookLibrary.js'
import { fontFor, uiFont } from '../../text.js'
import { ellipsize, textWidth } from './bookText.js'

const formatIconName = (item) => {
  if (isAudiobookItem(item)) return 'book_headphones_rounded'
  return isComicItem(item) ? 'book_auto_stories_rounded' : 'book_menu_book_rounded'
}

export const bookCard = (item, idx, w, opts = {}) => {
  const audiobook = isAudiobookItem(item)
  const square = audiobook || item.Type === 'Person'
  const h = square ? w : w * 1.5
  const percent = playedPercent(item)
  const remaining = audiobook ? remainingTicks(item) : null
  const time = remaining != null ? formatBookDuration(remaining) : ''
  const subtitle = opts.subtitle != null ? opts.subtitle : bookSubtitle(item)
  const number = opts.number != null ? String(opts.number) : ''
  const upNext = opts.upNext ? $L('Up Next').toUpperCase() : ''
  const title = item.Name || ''
  return {
    key: item.Id + ':' + idx,
    id: item.Id,
    idx,
    raw: item,
    w,
    h,
    image: bookImageUrl(item._serverUrl || getServerUrl(), item) || '',
    placeholder: formatIconName(item),
    format: opts.showFormat ? formatIconName(item) : '',
    time,
    timeW: time ? Math.round(textWidth(time, 17, 'bold')) + 16 : 0,
    progress: !audiobook && percent > 0 ? Math.min(percent, 100) / 100 : 0,
    number,
    numberW: number ? Math.max(34, Math.round(textWidth(number, 18, 'bold')) + 18) : 0,
    upNext,
    upNextW: upNext ? Math.round(textWidth(upNext, 15, 'bold', 1)) + 20 : 0,
    finished: !!opts.finished,
    title: ellipsize(title, 20, 'bold', w),
    titleFont: fontFor(title, 'bold'),
    subtitle: ellipsize(subtitle || '', 16, 'regular', w),
    subtitleFont: fontFor(subtitle || ''),
    badgeFont: uiFont('bold'),
  }
}
