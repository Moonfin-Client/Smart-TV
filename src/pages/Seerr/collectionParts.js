// Which parts of a collection can be requested, and the layout of the Request Collection sheet.
import $L from '../../services/i18n.js'
import { MEDIA_STATUS, isUnlimitedQuota } from '../../utils/seerrStatus.js'

// A part can be requested when Seerr has no record of it, or the record's status for that
// quality is unknown or deleted and it isn't blocklisted.
export const isPartRequestable = (part, is4k) => {
  const info = part.mediaInfo
  if (!info) return true
  if (info.status === MEDIA_STATUS.BLOCKLISTED) return false
  const status = (is4k ? info.status4k : info.status) || MEDIA_STATUS.UNKNOWN
  return status === MEDIA_STATUS.UNKNOWN || status === MEDIA_STATUS.DELETED
}

export const partStatus = (part, is4k) => {
  const info = part.mediaInfo
  if (!info) return null
  const status = (is4k ? info.status4k : info.status) || MEDIA_STATUS.UNKNOWN
  if (status === MEDIA_STATUS.AVAILABLE || status === MEDIA_STATUS.PARTIALLY_AVAILABLE) return 'available'
  if (status === MEDIA_STATUS.PROCESSING) return 'requested'
  if (status === MEDIA_STATUS.PENDING) return 'pending'
  return null
}

export const partYear = (part) => {
  const date = part.releaseDate || part.release_date
  return date && date.length >= 4 ? date.slice(0, 4) : null
}

// How many parts one request can take, since a movie quota can cap it below the number on offer.
export const selectionCap = (quota, count) => {
  if (isUnlimitedQuota(quota) || quota.remaining == null) return count
  return Math.min(Math.max(quota.remaining, 0), count)
}

export const firstSelectable = (parts, is4k, quota) => {
  const requestable = parts.filter((p) => isPartRequestable(p, is4k))
  return requestable.slice(0, selectionCap(quota, requestable.length)).map((p) => p.id)
}

// The sheet's rows top to bottom in the dialog body: Select All, the parts list (467px at most,
// its own scroller), the 4K switch, Advanced Options for a viewer who may pick the server, the
// quota line and the buttons. wraps(label) says how many lines a part's name takes, and advanced
// is the section as SeerrDialogLayout's advancedLayout drew it, or null.
export const sheetLayout = ({ parts, is4k, selected, quota, canUse4k, wraps, advanced = null }) => {
  const requestable = parts.filter((p) => isPartRequestable(p, is4k))
  const cap = selectionCap(quota, requestable.length)
  const limited = !isUnlimitedQuota(quota)
  const rows = []
  let y = 13.36
  rows.push({ id: 'all', kind: 'all', y, h: 79, label: `${$L('Select All')} (${requestable.length})`, on: selected.length >= cap && cap > 0, enabled: true })
  y += 79 + 1.67
  const listTop = y
  let ly = 0
  parts.forEach((part) => {
    const ok = isPartRequestable(part, is4k)
    const status = (is4k ? part.mediaInfo && part.mediaInfo.status4k : part.mediaInfo && part.mediaInfo.status) || MEDIA_STATUS.UNKNOWN
    const available = status === MEDIA_STATUS.AVAILABLE || status === MEDIA_STATUS.PARTIALLY_AVAILABLE
    const requested = status === MEDIA_STATUS.PENDING || status === MEDIA_STATUS.PROCESSING
    const year = partYear(part)
    const name = part.title || part.name || ''
    const label = year ? `${name} (${year})` : name
    const trailing = !ok && (available || requested) ? (available ? $L('Available') : $L('Requested')) : ''
    const h = wraps(label, !!trailing) > 1 ? 107 : 77
    rows.push({ id: `part:${part.id}`, kind: 'part', partId: part.id, listY: ly, h, label, trailing, available, on: ok && selected.indexOf(part.id) >= 0, enabled: ok })
    ly += h
  })
  const listH = Math.min(ly, 467)
  y = listTop + listH
  if (canUse4k) {
    rows.push({ id: '4k', kind: 'toggle', y, h: 99, label: $L('4K'), on: is4k, enabled: true })
    y += 99
  }
  const advTop = y
  if (advanced) {
    advanced.focusables.forEach((f) => rows.push({ id: f.id, kind: 'adv', y: advTop + f.y, h: f.h, enabled: true }))
    y += advanced.h
  }
  if (limited) {
    y += 20.03
    rows.push({
      id: 'quota', kind: 'quota', y, h: 50.08, enabled: false, blocked: selected.length > cap,
      label: $L('{remaining} of {limit} movie requests remaining')
        .replace('{remaining}', quota.remaining != null ? quota.remaining : 0)
        .replace('{limit}', quota.limit != null ? quota.limit : 0),
    })
    y += 50.08
  }
  y += 33.39
  const buttonsY = y
  y += 82.5 + 33.39
  return { rows, listTop, listH, listFull: ly, advTop, buttonsY, bodyH: y, cap, overCap: limited && selected.length > cap }
}
