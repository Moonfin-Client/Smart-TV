// The How to play card as markup for the arcade's DOM layer: the game's remote controls, then its
// enemies, obstacles and powerups, each with its sprite drawn on a small canvas.
import $L from '../../services/i18n.js'
import { CAST, drawIcon } from './games.js'
import { esc } from './dom.js'

// A controls line stays under about 90 characters, so a translation still fits.
export const remoteLines = () => ({
  'buffer-run': $L('OK jumps, again mid-air to flip sides. Down slides. On the ceiling Up and Down swap.'),
  'fast-forward': $L('Up and Down change lanes. OK jumps.'),
  'cable-crawl': $L('Arrows turn. The cable never stops.'),
  'case-stack': $L('OK drops the case.'),
  'pixel-purge': $L('Left and Right slide the scrubber.'),
})

// Each entry's name and line, by the sprite that draws it. A line stays under about 60 characters,
// since it shows in a narrow column and wraps to three lines at most.
const castText = () => ({
  lagBat: [$L('Lag Bat'), $L('Swoops in at head height. Slide under it.')],
  gremlin: [$L('Static Gremlin'), $L('Hops along the floor or the ceiling toward you. Jump it.')],
  cable: [$L('Cable Coil'), $L('Low on the floor or the ceiling. Jump it.')],
  banner: [$L('Buffering Banner'), $L('Slide under the sign. Its pole is a wall on the other side.')],
  directPlay: [$L('Direct Play'), $L('A shield that takes one hit.')],
  skipIntro: [$L('Skip Intro'), $L('Three seconds of dash that smashes anything.')],
  popcorn: [$L('Popcorn'), $L('25 points a piece.')],
  rollingReel: [$L('Loose Reel'), $L('Rolls down your lane faster than you run. Jump it.')],
  usher: [$L('Usher'), $L('Walks toward you and changes lanes once.')],
  velvetRope: [$L('Velvet Rope'), $L('Low. Jump it or change lanes.')],
  popcornCart: [$L('Popcorn Cart'), $L('Too tall to jump. Change lanes.')],
  frontRowPass: [$L('Front Row Pass'), $L('A shield that takes one hit.')],
  magnet: [$L('Magnet'), $L('Pulls in tickets from every lane for eight seconds.')],
  ticket: [$L('Ticket'), $L('25 points a piece.')],
  bug: [$L('Interference Bug'), $L('Wanders at random.')],
  tangle: [$L('Tangle'), $L('Slowly chases your plug.')],
  staticBlock: [$L('Static'), $L('A dead cell. One appears every third signal.')],
  brick: [$L('Power Brick'), $L('A 2 by 2 block every fifth signal.')],
  ghost: [$L('Ghost'), $L('Five seconds of passing through everything but the edge.')],
  snip: [$L('Snip'), $L('Cuts the cable in half for bonus points.')],
  signal: [$L('Signal'), $L('Points, and two more segments.')],
  shelfCat: [$L('Shelf Cat'), $L('Bats a case as it comes in, so that one slides faster.')],
  bluCase: [$L('Blu-ray Case'), $L('A title from your library. The overhang gets trimmed off.')],
  steelbook: [$L('Steelbook'), $L('Every tenth case. Slides much faster.')],
  perfect: [$L('Perfect Drop'), $L('Land it dead on and the stack grows a little wider.')],
  boxSet: [$L('Box Set'), $L('Three perfect drops in a row grow it a lot wider.')],
  deadPixel: [$L('Dead Pixel'), $L('Falls from cleared blocks. Catching it shrinks the scrubber.')],
  macroblock: [$L('Macroblock'), $L('One hit clears it.')],
  keyframe: [$L('Keyframe'), $L('Takes three hits and drops a powerup.')],
  hdr: [$L('HDR'), $L('A scrubber twice as wide for eight seconds.')],
  bufferNet: [$L('Buffer'), $L('A net under the scrubber that saves one miss.')],
})

// The card's markup. Its sprite canvases are drawn by drawHowToIcons once it's in the page.
export const howToMarkup = (id, name, buttons) => {
  const text = castText()
  const remote = remoteLines()
  const groups = [
    ['enemy', $L('Enemies'), 'ah-enemy'],
    ['obstacle', $L('Obstacles'), 'ah-obstacle'],
    ['power', $L('Powerups'), 'ah-power'],
  ]
  const groupHtml = groups
    .map(([key, label, tone]) => {
      const items = CAST[id][key]
        .map(
          ([sprite, s, dy, dx]) =>
            `<div class="ah-item"><canvas width="88" height="88" class="ah-icon" data-sprite="${sprite}" data-s="${s}" data-dy="${dy || 0}" data-dx="${dx || 0}"></canvas>` +
            `<div><b>${esc(text[sprite][0])}</b><span>${esc(text[sprite][1])}</span></div></div>`
        )
        .join('')
      return `<div class="ah-group"><h4 class="${tone}">${esc(label)}</h4>${items}</div>`
    })
    .join('')
  return (
    `<div class="ah-howTo"><span class="ah-heading">${esc($L('How to play'))}</span><h3>${esc(name)}</h3>` +
    `<div class="ah-controls"><b>${esc($L('Remote'))}</b><span>${esc(remote[id])}</span></div>` +
    `<div class="ah-groups">${groupHtml}</div><div class="ah-buttons">${buttons}</div></div>`
  )
}

export const drawHowToIcons = (root) => {
  const canvases = root.querySelectorAll('canvas[data-sprite]')
  for (let i = 0; i < canvases.length; i++) {
    const el = canvases[i]
    const c = el.getContext && el.getContext('2d')
    if (c) drawIcon(c, el.getAttribute('data-sprite'), +el.getAttribute('data-s'), +el.getAttribute('data-dy'), +el.getAttribute('data-dx'))
  }
}
