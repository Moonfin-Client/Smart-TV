import $L from '../../../../services/i18n.js'
import {
  RESOLUTIONS, getCardSizeClass, getCategoryDisplayName, getCurrentTags, getOptimizedRemoteImageUrl, getRemoteImageWidth,
} from './artworkTypes.js'

// Where everything in Change Artwork sits on the 1920x1080 screen: a 90vw by 85vh panel, the header
// with its crumbs and round buttons, the filter bar, then either a row per image category or one
// category's grid. Body pieces are laid out in the scroller's own coordinates (0,0 at its top
// left), and the holder shifts each row sideways and the whole body up. Every line of text sits in
// a 33px line box. `measure(text, size, weight)` gives widths and `urlOf(itemId, category, tag)`
// the server's image URL.
export const CONTENT = { x: 129, y: 106, w: 1662, bottom: 974 }
const SIZES = {
  sizePoster: [160, 240], sizeWide: [280, 158], sizeBanner: [350, 70], sizeLogo: [200, 80], sizeSquare: [160, 160],
}
const ROW_PREVIEW_COUNT = 8
const LH = 33
const ACCENT = '#00a4dcff'
const ROW_GAP = 12

const cardSize = (category, itemType) => SIZES[getCardSizeClass(category, itemType)]

// One card's pieces, relative to its top left. `kind` is current, remote, empty or loading.
export const cardPieces = (c, measure) => {
  const { w, h } = c
  const out = { rects: [], imgs: [], texts: [], icons: [] }
  if (c.kind === 'empty' || c.kind === 'loading') {
    out.rects.push({ k: 'f', x: 0, y: 0, w, h, r: 12, color: '#ffffff0d', bw: 1, bc: '#ffffff26' })
    if (c.kind === 'empty') {
      const t = $L('No artwork found')
      out.texts.push({ k: 't', x: (w - measure(t, 14)) / 2, y: (h - LH) / 2, t, size: 14, weight: 'regular', color: '#ffffff66' })
    } else out.spinner = { x: w / 2 - 12, y: h / 2 - 12 }
    return out
  }
  out.rects.push({ k: 'f', x: 0, y: 0, w, h, r: 12, color: '#ffffff0d', bw: 0, bc: '#00000000' })
  out.imgs.push({ k: 'i', x: 1, y: 1, w: w - 2, h: h - 2, r: 11, src: c.src })
  if (c.kind === 'current') {
    const label = $L('Current').toUpperCase()
    const bw = 12 + measure(label, 11, 'bold')
    out.rects.push({ k: 'b', x: 9, y: 9, w: bw, h: 39, r: 4, color: ACCENT, bw: 0, bc: '#00000000' })
    out.texts.push({ k: 'bt', x: 15, y: 12, t: label, size: 11, weight: 'bold', color: '#ffffffff' })
    if (c.canDelete) out.del = { x: w - 41, y: 9, w: 32, h: 32 }
  } else {
    out.footer = { x: 1, y: h - 42, w: w - 2, h: 41 }
    out.texts.push({ k: 'p', x: 9, y: h - 38, t: c.provider || '', size: 11, weight: 'regular', color: '#ffffffb3', maxw: w - 18 - (c.res ? measure(c.res, 10) + 8 : 0) })
    if (c.res) out.texts.push({ k: 'r', x: w - 9 - measure(c.res, 10), y: h - 38, t: c.res, size: 10, weight: 'regular', color: '#ffffff80' })
  }
  return out
}

const cardsFor = (s, category, remote, preview) => {
  const it = s.item
  const [w, h] = cardSize(category, it.Type)
  const imageWidth = getRemoteImageWidth(category, it.Type)
  const tags = getCurrentTags(it, category)
  const cards = tags.map((tag, i) => ({ id: `card:${category}:c${i}`, kind: 'current', w, h, index: i, src: s.urlOf(it.Id, category, tag), canDelete: s.canDelete }))
  const loading = !preview ? false : Boolean(s.loading[category])
  if (loading) cards.push({ id: `load:${category}`, kind: 'loading', w, h })
  if (!loading) {
    const list = preview ? remote.slice(0, ROW_PREVIEW_COUNT) : remote
    list.forEach((img, i) => cards.push({
      id: `card:${category}:r${i}`, kind: 'remote', w, h, image: img, src: getOptimizedRemoteImageUrl(img.ThumbnailUrl || img.Url, category, imageWidth),
      provider: img.ProviderName, res: img.Width && img.Height ? `${img.Width}x${img.Height}` : '',
    }))
  }
  if (!loading && !tags.length && !remote.length) cards.push({ id: `empty:${category}`, kind: 'empty', w: preview ? w : 160, h: preview ? h : 240 })
  return cards
}

const button = (out, f, extra) => out.focusables.push({ ...f, ...extra })

export const artworkLayout = (s, measure) => {
  const it = s.item
  const fixed = { rects: [], texts: [], icons: [] }
  const body = { rows: [], cards: [], rects: [], texts: [] }
  const out = { fixed, body, focusables: [] }
  const text = (list, k, x, y, t, size, weight, color, extra) => list.push({ k, x, y, t, size, weight, color, ...extra })

  // The header: the title, the crumbs (a season or episode links up its show), the round buttons.
  let y = CONTENT.y
  text(fixed.texts, 'title', CONTENT.x, y, $L('Change Artwork'), 26, 'bold', '#ffffffff')
  let cx = CONTENT.x
  const cy = y + LH + 6
  const crumbs = []
  if ((it.Type === 'Episode' || it.Type === 'Season') && it.SeriesName) crumbs.push({ id: it.SeriesId, name: it.SeriesName })
  if (it.Type === 'Episode' && it.SeasonName) crumbs.push({ id: it.SeasonId, name: it.SeasonName })
  crumbs.forEach((c, i) => {
    const w = 16 + measure(c.name, 15, 'bold')
    button(out, { id: `crumb:${c.id}`, x: cx, y: cy, w, h: 33 + 8, zone: 'fixed', kind: 'crumb', r: 6 })
    text(fixed.texts, `cr${i}`, cx + 8, cy + 4, c.name, 15, 'bold', ACCENT, { underline: true })
    fixed.rects.push({ k: `cru${i}`, id: `crumb:${c.id}`, x: cx + 8, y: cy + 4 + 25, w: w - 16, h: 1, r: 0, color: ACCENT, underline: true })
    cx += w + 4
    text(fixed.texts, `cs${i}`, cx, cy + 4, ' \\ ', 15, 'regular', '#ffffff4d')
    cx += measure(' \\ ', 15) + 4
  })
  text(fixed.texts, 'name', cx, cy + (crumbs.length ? 4 : 0), it.Name || '', 15, 'regular', '#ffffffb3', { maxw: 300 })
  ;[['back', s.canBack, 'icons/chevron_left.webp'], ['forward', s.canForward, 'icons/chevron_right.webp'], ['close', true, 'icons/close.webp']].forEach(([id, on, src], i) => {
    const bx = CONTENT.x + CONTENT.w - 44 - (2 - i) * 52
    fixed.rects.push({ k: `hb-${id}`, id, x: bx, y, w: 44, h: 44, r: 22, color: '#ffffff14', bw: 0, bc: '#00000000', dim: !on, focusFill: ACCENT })
    fixed.icons.push({ k: `hi-${id}`, x: bx + 10, y: y + 10, w: 24, h: 24, src, dim: !on })
    if (on) button(out, { id, x: bx, y, w: 44, h: 44, zone: 'fixed', kind: 'round' })
  })
  y += 72 + 16

  if (s.view === 'main') {
    // The filter bar, its buttons in a run from the left.
    let fx = CONTENT.x
    const chip = (id, label, look) => {
      const w = 34 + measure(label, 15, 'bold')
      fixed.rects.push({ k: `fb-${id}`, id, x: fx, y, w, h: 36, r: 12, color: look[0], bw: 1, bc: look[1], focusFill: look[2] })
      text(fixed.texts, `ft-${id}`, fx + 17, y + 9 - 7.5, label, 15, 'bold', '#ffffffff')
      button(out, { id, x: fx, y, w, h: 36, zone: 'fixed', kind: 'filter' })
      fx += w + 12
    }
    if (s.hasSources) chip('sources', $L('Sources'), ['#ffffff0f', '#ffffff1a', ACCENT])
    chip('lang', s.onlyLang ? $L('Show All Languages') : $L('Local Language Only'), s.onlyLang ? ['#00a4dc33', ACCENT, ACCENT] : ['#ffffff0f', '#ffffff1a', ACCENT])
    if (s.canDelete) chip('clear', $L('Clear All Artwork'), ['#ff475726', '#ff47574d', '#ff4757ff'])
    y += 36 + 20
    out.bodyTop = y

    // A section per category: the title and View All, then the row.
    let by = 0
    s.categories.forEach((category) => {
      const remote = s.remote[category] || []
      body.texts.push({ k: `st-${category}`, x: 0, y: by, t: getCategoryDisplayName(category, it.Type), size: 18, weight: 'bold', color: '#ffffffff' })
      if (remote.length) {
        const label = $L('View All ({count})').replace('{count}', remote.length)
        const w = 24 + measure(label, 14, 'bold')
        const vx = CONTENT.w - w
        body.rects.push({ k: `va-${category}`, id: `all:${category}`, x: vx, y: by + 4.5, w, h: 24, r: 8, color: '#ffffff0f', bw: 0, bc: '#00000000', focusFill: ACCENT })
        body.texts.push({ k: `vt-${category}`, id: `all:${category}`, x: vx + 12, y: by + 4.5 + 4 - 8.5, t: label, size: 14, weight: 'bold', color: '#ffffffb3', focusColor: '#ffffffff' })
        button(out, { id: `all:${category}`, x: vx, y: by + 4.5, w, h: 24, zone: 'body', kind: 'viewAll' })
      }
      by += LH + 10 + 4
      const cards = cardsFor(s, category, remote, true)
      const rowH = Math.max(...cards.map((c) => c.h))
      const row = { category, y: by, h: rowH, cards: [], width: 0 }
      let x = 0
      cards.forEach((c) => {
        const placed = { ...c, x, y: by, row: category }
        row.cards.push(placed)
        body.cards.push(placed)
        if (c.kind === 'current' || c.kind === 'remote') {
          button(out, { id: c.id, x, y: by, w: c.w, h: c.h, zone: 'body', kind: 'card', row: category, card: placed })
          if (c.kind === 'current' && c.canDelete) button(out, { id: `del:${c.id}`, x: x + c.w - 41, y: by + 9, w: 32, h: 32, zone: 'body', kind: 'del', row: category, card: placed })
        }
        x += c.w + ROW_GAP
      })
      row.width = x - ROW_GAP
      body.rows.push(row)
      by += rowH + 4 + 24
    })
    out.bodyH = by - 24
  } else {
    // One category's grid: Back, its name and the resolution chips, then the cards in columns.
    const category = s.gridCategory
    const backLabel = $L('Back')
    const bw = 16 + 24 + 8 + measure(backLabel, 16, 'bold') + 16
    fixed.rects.push({ k: 'gb', id: 'gridBack', x: CONTENT.x, y, w: bw, h: 40, r: 12, color: '#ffffff14', bw: 0, bc: '#00000000', focusFill: ACCENT })
    fixed.icons.push({ k: 'gbi', x: CONTENT.x + 16, y: y + 8, w: 24, h: 24, src: 'icons/arrow_back.webp' })
    text(fixed.texts, 'gbt', CONTENT.x + 48, y + 10.5 - 7, backLabel, 16, 'bold', '#ffffffff')
    button(out, { id: 'gridBack', x: CONTENT.x, y, w: bw, h: 40, zone: 'fixed', kind: 'back' })
    const title = getCategoryDisplayName(category, it.Type)
    const tx = CONTENT.x + bw + 16
    text(fixed.texts, 'gt', tx, y + 3.5, title, 22, 'bold', '#ffffffff')
    let chx = tx + measure(title, 22, 'bold') + 16
    RESOLUTIONS.forEach((res, i) => {
      const label = $L(res)
      const on = s.resolution === res
      const w = 28 + measure(label, 13, 'bold') + (on ? 2 : 0)
      fixed.rects.push({ k: `rc${i}`, id: `res:${res}`, x: chx, y: y + 5.5, w, h: 29, r: 14.5, color: on ? '#00a4dc40' : '#ffffff0f', bw: on ? 1 : 0, bc: on ? ACCENT : '#00000000', focusFill: ACCENT })
      text(fixed.texts, `rt${i}`, chx + 14 + (on ? 1 : 0), y + 5.5 + 6 - 8, label, 13, 'bold', on ? '#ffffffff' : '#ffffff99', { id: `res:${res}`, focusColor: '#ffffffff' })
      button(out, { id: `res:${res}`, x: chx, y: y + 5.5, w, h: 29, zone: 'fixed', kind: 'chip' })
      chx += w + 8
    })
    y += 40 + 16
    out.bodyTop = y
    const cards = cardsFor(s, category, s.remote[category] || [], false)
    const cols = Math.max(1, Math.floor((CONTENT.w - 8 + 16) / (180 + 16)))
    const colW = (CONTENT.w - 8 - 16 * (cols - 1)) / cols
    let gy = 8
    for (let i = 0; i < cards.length; i += cols) {
      const line = cards.slice(i, i + cols)
      const rowH = Math.max(...line.map((c) => c.h))
      line.forEach((c, j) => {
        const placed = { ...c, x: 4 + j * (colW + 16), y: gy, row: null }
        body.cards.push(placed)
        if (c.kind === 'current' || c.kind === 'remote') {
          button(out, { id: c.id, x: placed.x, y: gy, w: c.w, h: c.h, zone: 'body', kind: 'card', card: placed })
          if (c.kind === 'current' && c.canDelete) button(out, { id: `del:${c.id}`, x: placed.x + c.w - 41, y: gy + 9, w: 32, h: 32, zone: 'body', kind: 'del', card: placed })
        }
      })
      gy += rowH + 16
    }
    out.bodyH = gy - 16 + 8
  }
  return out
}

// The preview, confirm, warning and sources panels, centered over the dialog's 70% dim.
const OVERLAY ={ x: 97, y: 82, w: 1726, h: 916 }
export const overlayLayout = (o, measure, wrap) => {
  if (!o) return null
  const cw = o.kind === 'preview' ? 700 : 500
  const out = { w: cw + 50, rects: [], texts: [], imgs: [], focusables: [] }
  const x0 = 25
  let y = 25
  const btn = (id, label, primary, x, by) => {
    const w = 48 + measure(label, 16, 'bold')
    out.rects.push({ k: `b-${id}`, id, x, y: by, w, h: 39, r: 10, color: primary ? ACCENT : '#ffffff14', focusFill: primary ? ACCENT : '#ffffff33', ring: primary })
    out.texts.push({ k: `bt-${id}`, x: x + 24, y: by + 10 - 7, t: label, size: 16, weight: 'bold', color: '#ffffffff' })
    out.focusables.push({ id, x, y: by, w, h: 39 })
    return w
  }
  const rightButtons = (list) => {
    const widths = list.map(([, label]) => 48 + measure(label, 16, 'bold'))
    let x = x0 + cw - widths.reduce((a, b) => a + b, 0) - 12 * (list.length - 1)
    list.forEach(([id, label, primary], i) => {
      btn(id, label, primary, x, y)
      x += widths[i] + 12
    })
    y += 39
  }
  const centered = (k, t, size, weight, color) => wrap(t, size, weight, cw).forEach((line, i, all) => {
    out.texts.push({ k: `${k}${i}`, x: x0 + (cw - measure(line, size, weight)) / 2, y: y + i * LH, t: line, size, weight, color })
    if (i === all.length - 1) y += all.length * LH
  })
  if (o.kind === 'preview') {
    const img = o.image
    out.texts.push({ k: 'pt', x: x0, y, t: $L('Preview: {provider}').replace('{provider}', img.ProviderName), size: 18, weight: 'bold', color: '#ffffffff' })
    if (img.Width && img.Height) {
      const res = `${img.Width}x${img.Height}`
      out.texts.push({ k: 'pr', x: x0 + cw - measure(res, 14), y, t: res, size: 14, weight: 'regular', color: '#ffffff66' })
    }
    y += LH + 12
    const ratio = img.Width && img.Height ? img.Width / img.Height : 16 / 9
    const ih = Math.min(432, cw / ratio)
    const iw = ih * ratio
    out.rects.push({ k: 'pw', x: x0, y, w: cw, h: ih, r: 8, color: '#0000004d' })
    out.imgs.push({ k: 'pi', x: x0 + (cw - iw) / 2, y, w: iw, h: ih, src: img.Url })
    y += ih + 16
    rightButtons([['use', $L('Use Image'), true], ['cancel', $L('Cancel'), false]])
  } else if (o.kind === 'confirm') {
    centered('t', o.title, 22, 'bold', '#ffffffff')
    y += 16
    centered('m', o.message, 16, 'regular', '#ffffffb3')
    y += 20
    rightButtons([['yes', o.confirmLabel, true], ['cancel', $L('Cancel'), false]])
  } else if (o.kind === 'warning') {
    centered('t', $L('Warning: No Write Access'), 22, 'bold', '#ffffffff')
    y += 16
    centered('m', o.message, 16, 'regular', '#ffffffb3')
    y += 20
    const tipLines = wrap($L('Make sure the media folders are writable by the Jellyfin system user on your host.'), 14, 'regular', cw - 20)
    out.rects.push({ k: 'tip', x: x0, y, w: cw, h: 20 + tipLines.length * LH, r: 8, color: '#ff475714' })
    tipLines.forEach((line, i) => out.texts.push({ k: `tip${i}`, x: x0 + (cw - measure(line, 14)) / 2, y: y + 10 + i * LH, t: line, size: 14, weight: 'regular', color: '#ff4757cc' }))
    y += 20 + tipLines.length * LH + 22
    btn('dismiss', $L('Dismiss'), false, x0, y)
    y += 39
  } else if (o.kind === 'sources') {
    centered('t', $L('Filter Providers'), 22, 'bold', '#ffffffff')
    y += 16
    o.sources.forEach((src, i) => {
      if (i) y += 4
      out.rects.push({ k: `s${i}`, id: `src:${src}`, x: x0, y, w: cw, h: 53, r: 8, color: '#00000000', focusFill: '#00a4dc33' })
      out.rects.push({ k: `sc${i}`, x: x0 + 16, y: y + 17.5, w: 18, h: 18, r: 3, color: o.off.indexOf(src) < 0 ? '#0075ffff' : '#ffffffff', bw: o.off.indexOf(src) < 0 ? 0 : 1, bc: '#767676ff', check: o.off.indexOf(src) < 0 })
      out.texts.push({ k: `sn${i}`, x: x0 + 46, y: y + 10, t: src, size: 16, weight: 'regular', color: '#ffffffff' })
      out.focusables.push({ id: `src:${src}`, x: x0, y, w: cw, h: 53 })
      y += 53
    })
    y += 22
    btn('close', $L('Close'), false, x0, y)
    y += 39
  }
  out.h = y + 25
  out.x = Math.round(OVERLAY.x + (OVERLAY.w - out.w) / 2)
  out.y = Math.round(OVERLAY.y + (OVERLAY.h - out.h) / 2)
  return out
}
