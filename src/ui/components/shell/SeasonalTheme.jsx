import { createEffect, createMemo, on, onCleanup, untrack } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import * as settings from '../../../state/settings.js'
import { normalizeSeasonalDensity, normalizeSeasonalTheme } from '../../../utils/seasonalEffects.js'
import { perfTier } from '../../tier.js'
import { sideNavRoom } from '../../theme.js'
import { buildSeasonalParticles } from './seasonal/seasonalParticles.js'
import { FOLLOWERS, HIDDEN, placeFollower } from './seasonal/followerPlacement.js'
import { buildScene } from './seasonal/scene.js'
import { applyPlace, buildFollowers, destroyFollowers, drawFollower } from './seasonal/follower.js'
import { drawn } from './sprite.js'

// While particles move every frame is redrawn, which on the low and mid tiers eats the frame budget
// the remote needs, so they hold still while it's in use and carry on once it settles.
const PAUSE_TIERS = ['low', 'mid']
const RESUME_AFTER_MS = 700
const INPUT_EVENTS = ['keydown', 'wheel', 'mousemove']
const SETTLE_MS = 100

const rectOf = (node) => {
  const lng = node && node.lng
  const gt = lng && lng.globalTransform
  if (!gt) return null
  return { left: gt.tx, top: gt.ty, width: lng.w * gt.ta, height: lng.h * gt.td }
}

// What has focus on Home or in the nav, or null for anything else. The nav's root says so with
// seasonalZone="nav" and Home's rows with seasonalZone="rows". A list that draws its focused card
// itself names that card's art with focusTarget={() => node}, and the nav gives its rail's right
// edge as navRight.
const readFocus = () => {
  const el = activeElement()
  let zone = el
  while (zone && !zone.seasonalZone) zone = zone.parent
  if (!zone) return null
  const target = (typeof el.focusTarget === 'function' && el.focusTarget()) || el
  const rect = rectOf(target)
  if (!rect) return null
  const focus = { landing: 'card', rect, screenWidth: 1920, screenHeight: 1080, scale: 1 }
  if (zone.seasonalZone === 'nav') {
    // It lands beside the classic sidebar's tall rail and below anything else, the Reel and Mosaic
    // controls included, whose nav container has no size.
    focus.landing = sideNavRoom() === 'rail' ? 'right' : 'below'
    const right = typeof zone.navRight === 'function' ? zone.navRight() : zone.navRight
    if (focus.landing === 'right') focus.navRight = typeof right === 'number' ? right : rect.left + rect.width
  }
  return focus
}

// The seasonal effect on Home: the falling, flying and bursting particles, and the drawing that
// follows focus. App mounts it twice, with layer="particles" under the nav and layer="follower"
// over it. `on` says when it shows: Home with no screensaver or Shuffle overlay over it. `prefs`
// stands in for the saved settings, for the settings live preview. The particles are renderer
// nodes moved straight from one clock per frame, outside Solid.
export default function SeasonalTheme(props) {
  let root
  let built
  let raf = null
  let scene = null
  let paused = false
  let resume = null
  let pause = null
  let followers = null
  let places = null
  let poll = null
  let clock = 0
  let last = 0
  let dead = false

  // What the particles are built from, plus whether it shows.
  const want = createMemo(() => {
    const s = props.prefs || settings.all()
    const effect = normalizeSeasonalTheme(s.seasonalTheme)
    if (!props.on || !effect || effect === 'none') return ''
    const follower = s.seasonalFollower !== false
    if (props.layer === 'follower') return follower && FOLLOWERS[effect] ? effect : ''
    return [effect, normalizeSeasonalDensity(s.seasonalDensity), perfTier()].join('|')
  })

  const teardown = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = null
    if (scene) scene.destroy()
    scene = null
    paused = false
    clearTimeout(resume)
    if (pause) INPUT_EVENTS.forEach((name) => window.removeEventListener(name, pause, true))
    pause = null
    if (followers) destroyFollowers(followers)
    followers = null
    clearInterval(poll)
  }

  const startParticles = (stage, parent, [effect, level, tier]) => {
    const pin = window.__moonfinSeasonal
    const seed = pin && typeof pin.seed === 'number' ? pin.seed : Math.floor(Math.random() * 0x7fffffff)
    scene = buildScene(stage, parent, buildSeasonalParticles(effect, level, seed, tier))
    clock = 0
    scene.update(0)
    if (PAUSE_TIERS.indexOf(tier) < 0) return
    pause = () => {
      paused = true
      clearTimeout(resume)
      resume = setTimeout(() => {
        paused = false
      }, RESUME_AFTER_MS)
    }
    INPUT_EVENTS.forEach((name) => window.addEventListener(name, pause, true))
  }

  // It's placed once focus has rested for 100ms after any focus, scroll or size change. Nothing
  // announces those, so focus is read every 100ms and a spot is taken once it reads the same twice
  // running.
  const startFollower = (stage, parent, effect) => {
    const kinds = FOLLOWERS[effect]
    followers = buildFollowers(stage, parent, kinds)
    places = kinds.map(() => HIDDEN)
    let seen = null
    let placed = null
    poll = setInterval(() => {
      const focus = readFocus()
      const r = focus && focus.rect
      const key = r ? [focus.landing, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), focus.navRight].join() : 'none'
      if (key === seen && key !== placed) {
        placed = key
        const now = performance.now() / 1000
        places = kinds.map((kind, i) => {
          const next = placeFollower(kind, focus, places[i])
          if (next !== places[i]) applyPlace(followers[i], next, places[i], now)
          return next
        })
      }
      seen = key
    }, SETTLE_MS)
  }

  const build = () => {
    const next = want()
    // Only a real change rebuilds. Destroying a node while its image loads leaves that image stuck
    // loading for the next node that asks for it, so a needless rebuild can lose the follower.
    if (dead || next === built) return
    if (!root.rendered) {
      setTimeout(build, 16)
      return
    }
    teardown()
    built = next
    if (!next) return
    const parent = root.lng
    const stage = parent.stage
    if (props.layer === 'follower') startFollower(stage, parent, next)
    else startParticles(stage, parent, next.split('|'))
    last = 0
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const dt = last ? now - last : 0
      last = now
      if (!drawn(root)) return
      if (scene && !paused) {
        clock += dt
        // A screenshot test can pin the clock and seed through window.__moonfinSeasonal.
        const pin = window.__moonfinSeasonal
        scene.update(pin && typeof pin.at === 'number' ? pin.at : clock / 1000)
      }
      if (followers) {
        const t = now / 1000
        followers.forEach((f) => drawFollower(f, t))
      }
    }
    raf = requestAnimationFrame(tick)
  }

  createEffect(on(want, () => untrack(build)))
  onCleanup(() => {
    dead = true
    teardown()
  })

  return <view ref={root} width={1920} height={1080} clipping={props.layer !== 'follower'} />
}
