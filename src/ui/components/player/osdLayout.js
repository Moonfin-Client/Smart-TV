// Where the player controls put things at 1080p. Text sits in 33px line boxes, and the title keeps a
// heading's 0.67em margins, which collapse with the logo's 8 below it.

const PAD_X = 24
export const BAR = { X: 24, W: 1872, H: 6 }
export const BTN = 84
export const LIVE_BTN = 78
const LINE = 33
const H1_LINE = 32.4
const H1_MARGIN = 27 * 0.67

// The logo's height: 10vh with a 70 floor and a 160 ceiling, shrunk so a wide wordmark stays inside 34vw.
export const logoHeight = (aspect) => {
  const normal = Math.min(160, Math.max(70, 108))
  if (!aspect) return normal
  const max = 1920 * 0.34
  return normal * aspect > max ? max / aspect : normal
}

// The top bar: { titleY, secondaryY, height } for a logo with or without a title line, a secondary line over
// the title, or a title alone. Live TV's row is { badge, nameY, programY, height }.
export const topLayout = ({ logo, logoH, secondary, title, live, program }) => {
  if (live) {
    const infoH = program ? LINE + 3 + LINE : LINE
    const rowH = Math.max(LINE + 12, infoH)
    const top = 12
    return { badgeY: top + (rowH - (LINE + 12)) / 2, nameY: top + (rowH - infoH) / 2, programY: top + (rowH - infoH) / 2 + LINE + 3, height: top + rowH + 18 }
  }
  if (logo) {
    if (!title) return { height: 12 + logoH + 8 + 18 }
    const titleY = 12 + logoH + Math.max(8, H1_MARGIN)
    return { titleY, height: titleY + H1_LINE + H1_MARGIN + 18 }
  }
  if (secondary) {
    const secondaryY = 12 + 21
    const titleY = secondaryY + LINE + Math.max(4, H1_MARGIN)
    return { secondaryY, titleY, height: titleY + H1_LINE + H1_MARGIN + 18 }
  }
  const titleY = 12 + H1_MARGIN
  return { titleY, height: titleY + H1_LINE + H1_MARGIN + 18 }
}

// The subtitle fetch indicator's line, as SubtitleFetchIndicator.jsx draws it.
const FETCH_H = 27

// The bottom bar laid out from the screen's bottom edge up: the button row, then the bar with its time rows
// (or Live TV's timeline), then the 24 of padding where the gradient starts. fetching adds the subtitle fetch
// indicator's line on top, 12 above what it sits on.
export const bottomLayout = ({ live, above, below, buttons, liveEpisode, liveWindow, fetching }) => {
  const rowH = buttons ? (live ? LIVE_BTN : BTN) : 0
  const btnY = 1080 - 12 - rowH
  const out = { btnY }
  let top
  if (!live) {
    let barBottom
    if (below) {
      out.belowY = btnY - 6 - LINE
      barBottom = out.belowY - 8
    } else barBottom = btnY - Math.max(8, 6)
    out.barY = barBottom - BAR.H
    top = out.barY
    if (above) {
      out.aboveY = out.barY - 6 - LINE
      top = out.aboveY
    }
  } else {
    out.labelsY = btnY - 6 - LINE
    const trackH = liveWindow ? BAR.H : 4
    out.barY = out.labelsY - (liveWindow ? 8 : 6) - trackH
    top = out.barY
    if (liveEpisode) {
      out.episodeY = out.barY - 6 - LINE
      top = out.episodeY
    }
  }
  if (fetching) {
    out.fetchY = top - 12 - FETCH_H
    top = out.fetchY
  }
  out.top = top - 24
  return out
}

// Buttons left to right: 12 apart in a group and 6 between the transport and the rest.
export const buttonXs = (topCount, bottomCount, size) => {
  const xs = []
  let x = PAD_X
  for (let i = 0; i < topCount; i++) {
    xs.push(x)
    x += size + 12
  }
  if (topCount) x += 6 - 12
  for (let i = 0; i < bottomCount; i++) {
    xs.push(x)
    x += size + 12
  }
  return xs
}

// The autocropped logo's crop, read back from logoAutocrop's background style: the fraction of the image
// the ink starts at and spans on each axis. The padded crop of a logo inked to its edges spans more than
// the image (a background under 100%), and CSS still places it by the same rule.
export const logoCrop = (result) => {
  const st = result && result.style
  if (!st || !st.backgroundSize) return null
  const size = String(st.backgroundSize).split(' ').map(parseFloat)
  const pos = String(st.backgroundPosition).split(' ').map(parseFloat)
  const across = 100 / size[0]
  const down = 100 / size[1]
  const at = (p, span) => (span === 1 ? 0 : (p / 100) * (1 - span))
  return { left: at(pos[0], across), across, top: at(pos[1], down), down }
}
