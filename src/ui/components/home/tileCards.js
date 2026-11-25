// Cards and geometry of Home's tile rows: Seerr's genre, shortcut, studio and network tiles, and a
// game library's recent games as box art cards.
import { modernCardMetrics } from './modernCardLayout.js'
import { classicCardSize } from './rowPeek.js'
import { PORTRAIT_HEIGHT } from '../../../utils/gameArt.js'
import { relatedCard } from '../../../pages/Games/gameModels.js'
import { cssShift, fontFor } from '../../text.js'
import { withRaw } from './cards.js'

// Genre tiles are 320x180 inside a 3px border (326x186 in all) and logo tiles 220x132 with the
// border and 24px padding inside, 24px apart. A game card has 12px around every side, with the 24px
// gap in place of its left margin.
const TILE = { w: 326, h: 186 }
const LOGO = { w: 220, h: 132, pad: 24 }
const GAP = 24
const GAME_MARGIN = 12
const LINE = 33
// The description under a Modern game row keeps room for three 36px lines and 24px under it.
const GAME_DESCRIPTION_H = 108 + 24

// Game art fills the height a poster card has in the picked row style.
const gameWidth = (s) =>
  (s.homeRowsStyle !== 'v1' ? modernCardMetrics({ posterSize: s.homeRowsPosterSize }).imageHeight : classicCardSize('portrait', s.homeRowsPosterSize).height) / PORTRAIT_HEIGHT

export const showsGameDescription = (row, s) => !!row.isGameRow && s.homeRowsStyle !== 'v1'

export const shapeTileRow = (row, look, s) => {
  const logo = row.type === 'logo'
  const width = row.isGameRow ? gameWidth(s) : 0
  let x = row.isGameRow ? GAME_MARGIN : 0
  const cards = (row.items || []).map((it, i) => {
    let card
    if (row.isGameRow) {
      const g = relatedCard(it._library && it._library.Id, it, it._aspect, width)
      card = { ...g, key: `${it.Id || i}-${i}`, idx: i, kind: 'game', x, y: GAME_MARGIN, game: g }
      x += g.w + GAME_MARGIN + GAP
    } else {
      const size = logo ? LOGO : TILE
      const name = it.Name || ''
      card = {
        key: `${it.Id || i}-${i}`,
        idx: i,
        kind: logo ? 'logo' : 'tile',
        x,
        y: 0,
        w: size.w,
        h: size.h,
        image: (logo ? it._externalLogoUrl : it._externalTileUrl) || '',
        name,
        nameFont: fontFor(name, 'bold'),
        labelY: size.h - 19 - LINE + cssShift(24),
      }
      x += size.w + GAP
    }
    return withRaw(card, it)
  })
  return { ...row, cards, seeAll: null }
}

// Where a tile row's parts sit from its top: a 28px title 20px over the lane, the lane padded 20px
// above and below its cards, a Modern game row's description, and 30px under the row.
export const tileRowBox = (row, s, top = 0) => {
  const titleY = top
  const scrollerY = top + LINE + 20
  const cardsY = scrollerY + 20
  const cards = row.cards || []
  const tallest = row.isGameRow
    ? cards.reduce((h, c) => Math.max(h, c.h + GAME_MARGIN * 2), 0)
    : row.type === 'logo' ? LOGO.h : TILE.h
  const laneH = 20 + tallest + 20
  const descY = scrollerY + laneH
  const h = descY + (showsGameDescription(row, s) ? GAME_DESCRIPTION_H : 0) + 30
  return { titleY, subtitleY: 0, scrollerY, cardsY, laneH, panelY: 0, descY, h, top, tiles: true }
}
