import { Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import * as settings from '../../../state/settings.js'
import { api, getServerUrl } from '../../../services/jellyfinApi.js'
import { getBackdropId, getImageUrl } from '../../../utils/helpers.js'
import { formatClockTime, shiftedNow } from '../../../utils/clock.js'
import { autocropLogoUrl } from '../../../utils/logoAutocrop.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { shuffled } from '../../../utils/shuffled.js'
import { logoUrl } from '../../images.js'
import { fontFor, cssShift, normalLine, normalShift } from '../../text.js'
import Runner from './saver/Runner.jsx'
import { gradientFrame, gradientImages, isGradientBackdrop } from './saver/gradient.js'
import { logoCrop, sizerDims } from './saver/logo.js'

const BOUNCE_MARGIN = 20
const BACKDROP_INTERVAL = 30000
const BATCH_SIZE = 60
const RUNNER_BASE_SIZE = 96
const CLOCK_FONT_SIZE = 32
const SORT_FIELDS = ['DateCreated', 'CommunityRating']
const SORT_ORDERS = ['Descending', 'Ascending']
const START_OFFSETS = [0, 30, 60, 90]
const LIBRARY_TYPES = ['movies', 'tvshows']
const ITEM_FIELDS = 'ImageTags,BackdropImageTags,ParentBackdropItemId,ParentBackdropImageTags,ParentLogoItemId,ParentLogoImageTag,OfficialRating,Genres'
const RATING_MAP = { 0: 'G', 7: 'PG', 13: 'PG-13', 17: 'R', 18: 'NC-17' }

const MOVEMENT_SPEED = { staticCorner: 0, slow: 0.45, moderate: 0.7, fast: 1.0, ultra: 1.6 }
const SIZE_SCALE = { thumbnail: 0.45, small: 0.7, medium: 1.0, large: 1.5 }
const COMPONENT_SIZE = { moonfinLogo: { w: 320, h: 140 }, clock: { w: 200, h: 56 }, runner: { w: 120, h: 120 } }
const SPEED = 30
// The static layer keeps 48px from every edge.
const INSET = 48

// The title info sits 60px up and 50px in, at most 35% wide. Its logo sits on a 33px line of 30px
// Roboto, so its bottom rests 6px above the box's. The logo's height cap is 12vh.
const INFO_BOTTOM = 1080 - 60
const LOGO_BOTTOM = INFO_BOTTOM - 6
const LOGO_MAX_W = 672
const LOGO_MAX_H = 129.6
const TITLE_SIZE = 42

// The vignette, the scrim color from the bottom up.
const VIGNETTE = [{ to: 'top', rgb: '0, 0, 0', stops: [[0, 0.85], [0.3, 0.3], [0.6, 0.05], [1, 0.2]] }]
const CONTAIN = { resizeMode: { type: 'contain' } }
const COVER = { resizeMode: { type: 'cover' } }
const FADE = { duration: 1000, easing: 'ease-in-out' }

const pickOne = (values) => values[Math.floor(Math.random() * values.length)]

const includeItemTypesFor = (contentType) => {
  if (contentType === 'movies') return 'Movie'
  if (contentType === 'tv' || contentType === 'tvshows') return 'Series'
  return 'Movie,Series'
}

const viewMatches = (collectionType, contentType) => {
  if (!collectionType) return true
  if (contentType === 'movies') return collectionType === 'movies'
  if (contentType === 'tv' || contentType === 'tvshows') return collectionType === 'tvshows'
  return LIBRARY_TYPES.indexOf(collectionType) !== -1
}

// One shuffled batch of titles with backdrops, from the chosen libraries and collections or every
// movie and show library.
const loadBackdropBatch = async (s) => {
  const contentType = s.screensaverContentType || 'both'
  let parentIds = (s.screensaverLibraryIds || []).concat(s.screensaverCollectionIds || []).filter(Boolean)
  if (parentIds.length === 0) {
    const views = await api.getAllLibraries()
    parentIds = ((views && views.Items) || []).filter((v) => viewMatches(v.CollectionType, contentType)).map((v) => v.Id).filter(Boolean)
  }
  const query = {
    IncludeItemTypes: includeItemTypesFor(contentType),
    ExcludeItemTypes: 'BoxSet',
    Recursive: true,
    SortBy: pickOne(SORT_FIELDS),
    SortOrder: pickOne(SORT_ORDERS),
    Limit: BATCH_SIZE,
    Fields: ITEM_FIELDS,
    EnableTotalRecordCount: false,
    EnableImageTypes: 'Backdrop,Logo',
  }
  const maxRating = s.screensaverAgeFilter ? s.screensaverMaxRating : null
  if (maxRating != null && RATING_MAP[maxRating]) query.MaxOfficialRating = RATING_MAP[maxRating]
  const startIndex = pickOne(START_OFFSETS)
  const fetchFrom = async (parentId) => {
    const run = (start) => {
      const params = { ...query, StartIndex: start }
      if (parentId) params.ParentId = parentId
      return api.getItems(params).then((r) => (r && r.Items) || [])
    }
    const page = await run(startIndex)
    // A random offset can overshoot a small library, so the second pass starts from the top.
    return page.length === 0 && startIndex > 0 ? run(0) : page
  }
  const batches = parentIds.length > 0 ? await Promise.all(parentIds.map((id) => fetchFrom(id).catch(() => []))) : [await fetchFrom(null)]
  const excluded = (s.screensaverExcludedGenres || []).filter(Boolean)
  return shuffled([].concat.apply([], batches))
    .filter((it) => getBackdropId(it) && !(it.Genres || []).some((g) => excluded.indexOf(g) !== -1))
    .slice(0, BATCH_SIZE)
}

const ANCHORS = {
  topLeft: [0, 0], topCenter: [0.5, 0], topRight: [1, 0],
  middleLeft: [0, 0.5], middle: [0.5, 0.5], middleRight: [1, 0.5],
  bottomLeft: [0, 1], bottomCenter: [0.5, 1], bottomRight: [1, 1],
}
const anchorOf = (position, w, h) => {
  const a = ANCHORS[position] || ANCHORS.middle
  return [INSET + (1920 - INSET * 2 - w) * a[0], INSET + (1080 - INSET * 2 - h) * a[1]]
}

// Library backdrops that change every 30 seconds with the title's logo, or a black or animated
// gradient backdrop, the dimming layer, and the Moonfin logo, a clock or the runner drifting around
// the screen or anchored 48px in. App builds it as it shows and keeps it through the 1s fade out.
// `visible` drives the fade and starts and stops everything inside. Its settings are read once, as
// it's built.
export default function Screensaver(props) {
  const s = settings.all()
  const component = s.screensaverComponent || 'none'
  const backdrop = s.screensaverBackdrop || 'library'
  const library = backdrop === 'library'
  const gradient = isGradientBackdrop(backdrop) ? gradientImages(backdrop) : null
  const neon = backdrop === 'neonPulse'
  const scale = SIZE_SCALE[s.screensaverSize] !== undefined ? SIZE_SCALE[s.screensaverSize] : SIZE_SCALE.medium
  const speed = MOVEMENT_SPEED[s.screensaverMovement] !== undefined ? MOVEMENT_SPEED[s.screensaverMovement] : MOVEMENT_SPEED.moderate
  const box = COMPONENT_SIZE[component] || null
  const level = s.screensaverDimmingLevel == null ? 50 : Number(s.screensaverDimmingLevel) || 0
  const dim = Math.max(0, Math.min(100, level)) / 100
  const boxW = box ? Math.round(box.w * scale) : 0
  const boxH = box ? Math.round(box.h * scale) : 0
  const clockSize = Math.round(CLOCK_FONT_SIZE * scale)
  const clockY = (boxH - normalLine(clockSize)) / 2 + normalShift(clockSize)
  const runnerSize = Math.round(RUNNER_BASE_SIZE * scale)
  const spot = anchorOf(s.screensaverPosition, boxW, boxH)
  const vignette = library ? scrimSrc(VIGNETTE) : ''

  const [shown, setShown] = createSignal(false)
  const [left, setLeft] = createSignal(false)
  const [clock, setClock] = createSignal(formatClockTime(shiftedNow(s.timeOffsetHours), s.clockDisplay))
  const [back, setBack] = createSignal('')
  const [backOn, setBackOn] = createSignal(false)
  const [logo, setLogo] = createSignal('')
  const [logoNat, setLogoNat] = createSignal(null)
  const [crop, setCrop] = createSignal(null)
  const [name, setName] = createSignal('')

  let mover
  let orbit
  let flash
  let accent
  let accentInner
  let timers = []
  let run = 0
  let batch = []
  let used = 0
  let raf = null

  // The logo at its trimmed size (or its own), shrunk to fit 672 by 12vh and never grown, with the
  // full image inside it placed so the trimmed margin falls outside.
  const logoBox = createMemo(() => {
    const c = crop()
    const nat = (c && c.dims) || logoNat()
    if (!nat) return { w: 0, h: 0, y: 0, ix: 0, iy: 0, iw: 0, ih: 0 }
    const k = Math.min(1, LOGO_MAX_W / nat.w, LOGO_MAX_H / nat.h)
    const w = nat.w * k
    const h = nat.h * k
    const iw = c ? w / c.across : w
    const ih = c ? h / c.down : h
    return { w, h, y: LOGO_BOTTOM - h, ix: c ? -c.left * iw : 0, iy: c ? -c.top * ih : 0, iw, ih }
  })
  const logoShown = () => backOn() && !!logo() && logoBox().w > 0
  const titleShown = () => backOn() && !logo() && !!name()

  // A timeout leaves the list once it fires, so a saver left running for hours only holds live ones.
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      const at = timers.indexOf(id)
      if (at >= 0) timers.splice(at, 1)
      fn()
    }, ms)
    timers.push(id)
  }

  // A drift at 30px a second times the movement setting, turning at the walls 20px in. Each leg
  // runs as one linear animation to the next wall.
  const bounce = () => {
    const pxs = SPEED * speed
    const maxX = 1920 - boxW - BOUNCE_MARGIN
    const maxY = 1080 - boxH - BOUNCE_MARGIN
    if (maxX <= BOUNCE_MARGIN || maxY <= BOUNCE_MARGIN) return
    let x = BOUNCE_MARGIN + Math.random() * (maxX - BOUNCE_MARGIN)
    let y = BOUNCE_MARGIN + Math.random() * (maxY - BOUNCE_MARGIN)
    let dx = Math.random() > 0.5 ? 1 : -1
    let dy = Math.random() > 0.5 ? 1 : -1
    mover.x = Math.round(x)
    mover.y = Math.round(y)
    setLeft(dx < 0)
    const leg = () => {
      const toX = dx > 0 ? maxX - x : x - BOUNCE_MARGIN
      const toY = dy > 0 ? maxY - y : y - BOUNCE_MARGIN
      const dist = Math.max(1, Math.min(toX, toY))
      x += dx * dist
      y += dy * dist
      const ms = Math.round((dist / pxs) * 1000)
      setLeft(dx < 0)
      mover.animate({ x, y }, { duration: ms, easing: 'linear' }).start()
      if (toX <= toY) dx = -dx
      if (toY <= toX) dy = -dy
      later(leg, ms)
    }
    later(leg, 50)
  }

  // The gradient's keyframes, sampled every frame onto the layers' nodes. A screenshot test can
  // hold them at a time through window.__moonfinSaver = { at: ms }.
  const animateGradient = () => {
    const started = Date.now()
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const o = orbit.lng
      const a = accent.lng
      if (!orbit.rendered || o.worldAlpha === 0) return
      const pin = window.__moonfinSaver
      const v = gradientFrame(backdrop, pin && typeof pin.at === 'number' ? pin.at : Date.now() - started)
      o.rotation = v.rotation
      o.scale = v.orbitScale
      a.x = v.driftX
      a.y = v.driftY
      a.scale = v.driftScale
      accentInner.lng.alpha = v.accent
      if (neon) {
        flash.lng.rotation = v.rotation
        flash.lng.scale = v.orbitScale
        flash.lng.alpha = v.flash
      }
    }
    raf = requestAnimationFrame(frame)
  }

  const setItem = (item) => {
    const id = getBackdropId(item)
    setBack((id && getImageUrl(getServerUrl(), id, 'Backdrop', { maxWidth: 1920, quality: 80 })) || '')
    setName(item.Name || '')
    setLogoNat(null)
    setCrop(null)
    const url = logoUrl(item, 800)
    setLogo(url)
    if (!url) return
    // The same padding trim as the player, so a logo with a wide transparent margin doesn't read small.
    autocropLogoUrl(url).then((r) => {
      const c = r && logoCrop(r)
      const dims = r && sizerDims(r.url)
      if (logo() !== url || !c || !dims) return
      setCrop({ ...c, dims })
    })
  }

  const cycle = async (mine) => {
    used += 1
    if (used >= batch.length) {
      used = 0
      try {
        const items = await loadBackdropBatch(s)
        if (items.length) batch = items
      } catch (e) {
        console.error('[Screensaver] Failed to refresh backdrop items:', e)
      }
    }
    const next = batch[used]
    if (mine !== run || !next) return
    setBackOn(false)
    later(() => {
      setItem(next)
      later(() => setBackOn(true), 100)
    }, 1000)
  }

  const firstBatch = async (mine) => {
    let items = []
    try {
      items = await loadBackdropBatch(s)
    } catch (e) {
      console.error('[Screensaver] Failed to fetch backdrop items:', e)
    }
    if (mine !== run || !items.length) return
    batch = items
    used = 0
    setItem(items[0])
    later(() => setBackOn(true), 500)
    timers.push(setInterval(() => cycle(mine), BACKDROP_INTERVAL))
  }

  // What it drops as it starts to hide: the timers, the title on show and the batch.
  const stop = () => {
    timers.forEach((id) => {
      clearTimeout(id)
      clearInterval(id)
    })
    timers = []
    run += 1
    batch = []
    setBackOn(false)
    setBack('')
    setLogo('')
    setName('')
  }

  const start = () => {
    stop()
    const mine = run
    // The fade starts two frames in, so the first frame draws at nothing.
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    if (component === 'clock') {
      timers.push(
        setInterval(() => {
          const text = formatClockTime(shiftedNow(s.timeOffsetHours), s.clockDisplay)
          if (text !== clock()) setClock(text)
        }, 1000),
      )
    }
    if (boxW && speed > 0) bounce()
    if (library) later(() => firstBatch(mine), 2000)
    // The gradient keeps turning through the fade out.
    if (gradient && !raf) animateGradient()
  }

  createEffect(on(() => props.visible, (v) => (v ? start() : stop())))
  onCleanup(() => {
    stop()
    if (raf) cancelAnimationFrame(raf)
    raf = null
  })

  return (
    <view width={1920} height={1080} color="#000000ff" alpha={props.visible && shown() ? 1 : 0} transition={{ alpha: FADE }}>
      <view>
        <Show when={library}>
          <view width={1920} height={1080}>
            <view width={1} height={1} alpha={0.001} src={back()} />
            <view width={1920} height={1080} src={back()} textureOptions={COVER} alpha={backOn() ? 1 : 0} transition={{ alpha: FADE }} />
            <view width={1920} height={1080} src={vignette} />
            <view
              width={1}
              height={1}
              alpha={0.001}
              src={logo()}
              onEvent={{
                loaded: (_, e) => e && e.dimensions && e.dimensions.w && setLogoNat({ w: e.dimensions.w, h: e.dimensions.h }),
                failed: () => setLogo(''),
              }}
            />
            <view x={50} y={logoBox().y} width={logoBox().w} height={logoBox().h} clipping alpha={logoShown() ? 1 : 0}>
              <view x={logoBox().ix} y={logoBox().iy} width={logoBox().iw} height={logoBox().ih} src={logo()} />
            </view>
            <text
              x={50}
              y={INFO_BOTTOM + cssShift(TITLE_SIZE)}
              mountY={1}
              fontFamily={fontFor(name(), 'bold')}
              fontSize={TITLE_SIZE}
              lineHeight={50.4}
              maxWidth={672}
              maxLines={2}
              color="#ffffffff"
              alpha={titleShown() ? 1 : 0}
            >
              {name()}
            </text>
          </view>
        </Show>
      </view>
      <view>
        <Show when={gradient}>
          <view width={1920} height={1080} clipping>
            <view ref={orbit} x={-1536} y={-864} width={4992} height={2808} src={gradient.orbit} />
            <view ref={flash} x={-1536} y={-864} width={4992} height={2808} src={gradient.flash} alpha={neon ? 0.5 : 0} />
            <view ref={accent} width={1920} height={1080}>
              <view ref={accentInner} width={1920} height={1080} src={gradient.accent} />
            </view>
          </view>
        </Show>
      </view>
      <view
        x={760}
        y={440}
        width={400}
        height={200}
        src="resources/banner-dark.webp"
        textureOptions={CONTAIN}
        alpha={library && !back() ? 1 : 0}
      />
      <view>
        <Show when={dim > 0}>
          <view width={1920} height={1080} color="#000000ff" alpha={dim} />
        </Show>
      </view>
      <view ref={mover} x={spot[0]} y={spot[1]} width={boxW} height={boxH}>
        <view>
          <Show when={component === 'moonfinLogo'}>
            <view width={boxW} height={boxH} src="resources/banner-dark.webp" textureOptions={CONTAIN} />
          </Show>
        </view>
        <view>
          <Show when={component === 'clock'}>
            <text
              x={boxW / 2}
              y={clockY}
              mountX={0.5}
              fontFamily="roboto-medium"
              fontSize={clockSize}
              lineHeight={1}
              color="#ffffffff"
              alpha={1 - dim * 0.7}
            >
              {clock()}
            </text>
          </Show>
        </view>
        <view>
          <Show when={component === 'runner'}>
            <Runner x={(boxW - runnerSize) / 2} y={(boxH - runnerSize) / 2} size={runnerSize} speed={speed > 0 ? speed : 1} left={left()} />
          </Show>
        </view>
      </view>
    </view>
  )
}
