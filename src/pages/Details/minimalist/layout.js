// Minimalist's page: the content padded 40 56 44 and anchored to the bottom, the episodes at the
// foot, and above them the headline (logo or title, the episode's name, the buttons) with the
// episode's still beside it, both sitting on the same bottom edge.
import { wrapLines } from '../../../ui/components/details/measure.js'

const BOTTOM = 1080 - 44
const RIGHT = 1920 - 56
const HEADLINE_W = 760

// Where the content starts beside the nav: the classic sidebar's rail, Reel and Mosaic's control,
// or the page's own 56px.
export const minimalistLeft = (sideRoom) => (sideRoom === 'rail' ? 176 : sideRoom === 'control' ? 120 : 56)

// The logo drawn at its own size, scaled down to fit 340 by 160.
export const logoBox = (nw, nh) => {
  if (!nw || !nh) return { w: 0, h: 0 }
  const k = Math.min(1, 340 / nw, 160 / nh)
  return { w: nw * k, h: nh * k }
}

// `d`: left, episodesH (0 without a rail), logo {w, h} or null, title, episodeName, incomplete (bool), still (bool).
export const layoutMinimalist = (d) => {
  const contentW = RIGHT - d.left
  const episodesY = BOTTOM - d.episodesH
  const upperBottom = d.episodesH ? episodesY - 34 : BOTTOM
  const actionsY = upperBottom - 75
  let top = actionsY - 26
  // The incomplete line, 8px under what's above it.
  let incomplete = null
  if (d.incomplete) {
    incomplete = { y: top - 33 }
    top = incomplete.y - 8
  }
  let episodeName = null
  if (d.episodeName) {
    const lines = Math.min(2, wrapLines(d.episodeName, 34, 'bold', HEADLINE_W).length)
    episodeName = { y: top - lines * 35.7, lines }
    top = episodeName.y - 14
  }
  let logo = null
  let title = null
  if (d.logo) logo = { x: d.left, y: top - d.logo.h, w: d.logo.w, h: d.logo.h }
  else if (d.title) {
    const lines = Math.min(2, wrapLines(d.title, 56, 'bold', HEADLINE_W).length)
    title = { y: top - lines * 58.8, lines }
  }
  let still = null
  if (d.still) {
    const w = Math.max(240, Math.min(440, contentW * 0.3))
    const h = w * 0.5625
    still = { x: d.left + Math.min(HEADLINE_W, contentW - 48 - w) + 48, y: upperBottom - h, w, h }
  }
  return { headlineW: HEADLINE_W, actionsY, episodeName, incomplete, logo, title, still, episodesY, contentW }
}
