// Moonbase games mapped into the card models Row and Grid draw, and the paths the game pages
// live at. Game ids and system names can hold spaces and slashes, so they ride encoded.
import $L from '../../services/i18n.js'
import * as gamesApi from '../../services/gamesApi.js'
import { PORTRAIT_HEIGHT, boxArtCell, boxArtNeedsFill, gameDisplayTitle } from '../../utils/gameArt.js'
import { lineCount } from '../../ui/components/games/wrap.js'
import { faceDy, fontFor } from '../../ui/text.js'
import { fallbackHex } from '../../ui/components/games/art.js'
import { textWidth } from '../../ui/components/library/measure.js'

const enc = encodeURIComponent

export const decodeParam = (value) => {
  try {
    return decodeURIComponent(value || '')
  } catch (e) {
    return value || ''
  }
}

export const systemPath = (lib, system) => `/games/system/${enc(lib)}/${enc(system)}`
export const gamePath = (lib, gameId) => `/games/item/${enc(lib)}/${enc(gameId)}`
export const playPath = (lib, gameId) => `/games/play/${enc(lib)}/${enc(gameId)}`

// The tile model GameSystemCard draws. The covers stretch across the tile in equal columns, so a
// system with fewer than four still fills the width, and the name and count sit centered.
const TILE_INNER_W = 423.5
const TILE_TEXT_W = 249.5
export const systemTile = (lib, system, previews, count) => {
  const name = system.name || system.id
  const countText = count > 0 ? $L('{count} items').replace('{count}', count) : ''
  const lines = textWidth(name, 26, 'bold') > TILE_TEXT_W ? 2 : 1
  const blockH = lines * 31.2 + (countText ? 9 + 33 : 0)
  const nameY = (183 - blockH) / 2
  const cw = previews.length ? TILE_INNER_W / previews.length : 0
  const last = previews.length - 1
  return {
    k: `system-${system.id}`,
    name,
    nameFont: fontFor(name, 'bold'),
    count: countText,
    countFont: fontFor(countText),
    // Canvas text sits a little higher in its line than CSS text, by about 6% of its size. A theme's
    // own face sits where CSS puts it.
    nameY: nameY + 1.5 + faceDy(26, false, fontFor(name, 'bold')),
    countY: nameY + lines * 31.2 + 9 + 1 + faceDy(19, false, fontFor(countText)),
    bg: fallbackHex(system.id),
    cells: previews.map((g, i) => ({
      k: g.id,
      x: i * cw,
      w: cw,
      r: [i === 0 ? 11 : 0, i === last ? 11 : 0, i === last ? 11 : 0, i === 0 ? 11 : 0],
      color: fallbackHex(g.id),
      image: gamesApi.gameThumbUrl(lib, g.id),
    })),
    raw: system,
  }
}

// A GameCard model. With the art's shape the card takes it, and cards of different shapes share a
// bottom edge. The details screen's More row doesn't wrap, so it passes `maxLines` 1.
const RELATED_W = 150
export const relatedCard = (lib, game, aspect, width = RELATED_W, maxLines = 2) => {
  const cell = boxArtCell(aspect)
  const title = gameDisplayTitle(game.title, game.fileName)
  const w = width * cell.width
  const posterH = width * cell.height
  const top = width * (PORTRAIT_HEIGHT - cell.height)
  const titleH = 8 + Math.min(maxLines, Math.max(1, lineCount(title, 22, 'regular', w, textWidth))) * 26.4
  return {
    k: game.id,
    title,
    titleFont: fontFor(title),
    maxLines,
    w,
    posterH,
    top,
    titleH,
    h: top + posterH + titleH,
    bg: fallbackHex(game.id),
    image: gamesApi.gameThumbUrl(lib, game.id),
    contain: aspect != null && boxArtNeedsFill(aspect, cell.width / cell.height),
    raw: game,
  }
}

// The theme's background laid three times over white, so a see-through theme like Glass comes out
// a shade lighter than its color.
export const appBackground = (rgba) => {
  const v = String(rgba || '#000000ff').replace('#', '')
  const a = v.length >= 8 ? parseInt(v.slice(6, 8), 16) / 255 : 1
  const out = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16)
    let x = 255
    for (let n = 0; n < 3; n++) x = c * a + x * (1 - a)
    const h = Math.round(x).toString(16)
    return h.length < 2 ? '0' + h : h
  })
  return '#' + out.join('')
}

// The game screens go Home on Back and drop the screens between, like the library screens do.
export { goHome } from '../../ui/components/library/goHome.js'

export const playersLabel = (players) =>
  players ? (players === 1 ? $L('1 player') : $L('{count} players').replace('{count}', players)) : ''

// The first of `urls` that loads, tried one after another as an <img> tries them, or null when none does.
export const firstImage = (urls) =>
  new Promise((resolve) => {
    let i = 0
    const next = () => {
      if (i >= urls.length) return resolve(null)
      const url = urls[i++]
      const img = new window.Image()
      img.onload = () => resolve(url)
      img.onerror = next
      img.src = url
    }
    next()
  })
