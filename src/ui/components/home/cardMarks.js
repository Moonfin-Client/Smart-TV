// What a card learns after it's built: the admin's poster labels (services/posterBadgesApi.js) and
// whether a Live TV recording is incomplete (services/incompleteRecordings.js), with the art a
// label draws. Each card watches its own item and redraws only when its answer changes.
import { posterBadgesFor, posterBadgesPerCorner, posterLabelsBase, watchPosterBadges } from '../../../services/posterBadgesApi.js'
import { incompleteRecordingFor, onIncompleteRecordings } from '../../../services/incompleteRecordings.js'
import { coreIconPath } from '../../../utils/coreIconPaths.js'
import { cssShift, fontFor, textWidth } from '../../text.js'
import { labelNodes, posterLabelBoxes } from './posterLabels.js'

const NONE = []
const ART_PX = 48

// The renderer can't load an SVG on every TV, so a label's Material icon is drawn once into a
// canvas and handed over as a white PNG the node tints.
const icons = {}
const iconSrc = (name) => {
  if (icons[name] !== undefined) return icons[name]
  let url = ''
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = ART_PX
    const ctx = canvas.getContext('2d')
    ctx.scale(ART_PX / 24, ART_PX / 24)
    ctx.fillStyle = '#ffffff'
    ctx.fill(new Path2D(coreIconPath(name)))
    url = canvas.toDataURL('image/png')
  } catch (e) {
    url = ''
  }
  icons[name] = url
  return url
}

// A flag is the plugin's SVG, drawn the same way once it has loaded. Cards asking before then
// hear when it's in.
const flags = {}
const flagWaits = {}
const flagSrc = (code, onReady) => {
  if (flags[code] !== undefined) return flags[code]
  if (!flagWaits[code]) {
    flagWaits[code] = []
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const settle = (url) => {
      flags[code] = url
      const waits = flagWaits[code]
      delete flagWaits[code]
      waits.forEach((fn) => fn())
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = ART_PX
        canvas.height = (ART_PX * 3) / 4
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        settle(canvas.toDataURL('image/png'))
      } catch (e) {
        settle('')
      }
    }
    img.onerror = () => settle('')
    img.src = `${posterLabelsBase()}/Moonfin/Assets/flag-${code}.svg`
  }
  if (onReady) flagWaits[code].push(onReady)
  return ''
}

const env = (onArt) => ({
  measure: (text, size) => textWidth(text, size, 'bold'),
  shift: (size) => cssShift(size),
  knownIcon: (name) => typeof coreIconPath(name) === 'string',
  iconSrc,
  flagSrc: (code) => flagSrc(code, onArt),
  fontOf: (text) => fontFor(text, 'bold'),
})

// Starts watching for `card`, calling `changed()` whenever what it shows changes. Returns the stop.
export const watchMarks = (card, changed) => {
  const raw = card && card.raw
  const labelsId = card && card.labelsId
  const itemId = raw && raw.Id
  let seen = { badges: labelsId ? posterBadgesFor(labelsId) : NONE, incomplete: !!incompleteRecordingFor(itemId) }
  const check = () => {
    const now = { badges: labelsId ? posterBadgesFor(labelsId) : NONE, incomplete: !!incompleteRecordingFor(itemId) }
    if (now.badges === seen.badges && now.incomplete === seen.incomplete) return
    seen = now
    changed()
  }
  const stops = [labelsId ? watchPosterBadges(labelsId, check) : null, itemId ? onIncompleteRecordings(check) : null]
  return {
    read: () => seen,
    stop: () => stops.forEach((stop) => stop && stop()),
  }
}

// The label sets a card draws over art `w` by `h`: [{ k, right, nodes }], left corners and right
// ones apart. `card` carries the corner offsets cards.js worked out (labelsTop, labelsTopRight,
// labelsBottom). Episode stills pass their own `scale` and `inset`.
export const labelSets = (badges, card, w, h, incomplete, onArt, { scale = 0.85, inset = 8 } = {}) => {
  if (!badges || !badges.length) return NONE
  const art = env(onArt)
  const boxes = posterLabelBoxes(
    badges,
    {
      w,
      h,
      perCorner: posterBadgesPerCorner(),
      scale,
      inset,
      // An incomplete badge holds the top left corner, so the labels start under it.
      top: card.labelsTop + (incomplete ? 32 : 0),
      topRight: card.labelsTopRight,
      bottom: card.labelsBottom,
    },
    art
  )
  if (!boxes) return NONE
  const sets = []
  if (boxes.left.length) sets.push({ k: 'l', right: false, nodes: labelNodes(boxes.left, art) })
  if (boxes.right.length) sets.push({ k: 'r', right: true, nodes: labelNodes(boxes.right, art) })
  return sets
}
