import { For, Index, createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js'
import { navOnLeft } from '../../theme.js'
import { cssShift, fontFor, uiFont } from '../../text.js'
import * as settings from '../../../state/settings.js'
import { focusNav } from '../../../app/focus.js'
import { createBarContext } from './barContext.js'
import { genreGlowRgb } from './galleryGlow.js'
import { glowOf, imageOf, padIndex, restartCarousel, rgbA, stopCarousel } from './barKit.js'
import { pointerFocus } from '../../../app/pointer.js'

// The Bookshelf media bar: the slide's poster as a book standing in a lit alcove, between up to
// seven spines a side in their genre colors. Trailers don't play here.
// shortcut: the poster isn't desaturated, since the renderer has no filter. A custom shader would do it.

const SPINES = 7
const ROW_H = 1068
// Chrome floors the 8px alcove borders to 7 at this root size.
const ALCOVE_BORDER = 7
const BOOK_W = 653.4
const BOOK_H = 907.2
const CENTER_W = ALCOVE_BORDER * 2 + 28 * 2 + BOOK_W
const SIDE_W = (1920 - CENTER_W) / 2
const SPINE_W = 44
const SPINE_STEP = 48
const BOOK_X = SIDE_W + ALCOVE_BORDER + 28
const BOOK_Y = ROW_H - BOOK_H
const EMPTY = {}
// Turned a quarter left, the title's line box shift runs along x.
const SPINE_SHIFT = { index: cssShift(14), title: cssShift(16) }
const COVER = { resizeMode: { type: 'cover' } }
// Four shadows make the spine text's outline.
const OUTLINE = [
  { color: '#000000ff', x: -0.8, y: -0.8, blur: 1.2 },
  { color: '#000000ff', x: 0.8, y: -0.8, blur: 1.2 },
  { color: '#000000ff', x: 0.8, y: 0.8, blur: 1.2 },
  { color: '#000000ff', x: -0.8, y: 0.8, blur: 1.2 },
]

// A left to right CSS gradient as side by side strips with their ends colored, which the GPU blends
// exactly the way CSS does between stops. The outer strips take the box's corners, so no clip is needed.
const strips = (w, stops, left = 0, right = 0) => {
  const out = []
  const last = stops.length - 2
  for (let i = 0; i <= last; i++) {
    const [a, ca] = stops[i]
    const [b, cb] = stops[i + 1]
    const r = [i === 0 ? left : 0, i === last ? right : 0, i === last ? right : 0, i === 0 ? left : 0]
    out.push({ x: a * w, w: (b - a) * w, l: ca, rc: cb, r })
  }
  return out
}

const GROUND = strips(1920, [[0, '#130905ff'], [0.22, '#23150dff'], [0.5, '#1c100aff'], [0.78, '#23150dff'], [1, '#130905ff']])
const SPINE_LIGHT = strips(SPINE_W, [[0, '#00000059'], [0.25, '#ffffff1f'], [0.6, '#00000000'], [1, '#00000073']], 6, 6)
const BOOK_SHADE = strips(BOOK_W, [[0, '#00000059'], [0.05, '#ffffff1a'], [0.08, '#00000080'], [0.11, '#00000000'], [0.14, '#ffffff0f'], [1, '#00000040']], 3, 8)
// A multiply blend with rgba(195, 177, 146, 0.18) is the same as tinting by 0.82 plus 0.18 of that color.
const PAPER = '#' + [195, 177, 146].map((c) => Math.round(255 * (0.82 + (0.18 * c) / 255)).toString(16)).join('') + 'ff'
const SHADOWS = {
  spine: glowOf({ color: '#0000008c', x: 0, y: 3, blur: 6, spread: 0 }).shadow,
  book: glowOf({ color: '#000000bf', x: 0, y: 6, blur: 14, spread: 0 }).shadow,
  ledge: glowOf({ color: '#000000a6', x: 0, y: -2, blur: 5, spread: 0 }).shadow,
}

function Spine(props) {
  return (
    <view x={props.x} y={247.2} width={44} height={820.8}>
      <view width={44} height={820.8} borderRadius={6} color={props.color} />
      <view>
        <Index each={SPINE_LIGHT}>
          {(st) => <view x={st().x} width={st().w} height={820.8} borderRadius={st().r} colorLeft={st().l} colorRight={st().rc} />}
        </Index>
      </view>
      <text
        x={22}
        y={10 + SPINE_SHIFT.index}
        mountX={0.5}
        fontFamily={props.numFont}
        fontSize={14}
        lineHeight={33}
        letterSpacing={0.5}
        color="#e5d5b8e6"
        textShadow={OUTLINE}
      >
        {props.num}
      </text>
      <view x={21.5} y={47} width={1} height={16} color="#e5d5b840" />
      <text
        x={22 + SPINE_SHIFT.title}
        y={438.9}
        mountX={0.5}
        mountY={0.5}
        rotation={-Math.PI / 2}
        fontFamily={props.font}
        fontSize={16}
        lineHeight={33}
        letterSpacing={1}
        maxWidth={669.6}
        maxLines={1}
        contain="width"
        textAlign="center"
        color="#e5d5b8ff"
        textShadow={OUTLINE}
      >
        {props.title}
      </text>
    </view>
  )
}

export default function BookshelfBar(props) {
  const { bar } = createBarContext(props)
  const [cur, setCur] = createSignal(0)
  const left = () => navOnLeft(settings.all())
  const count = () => (props.items || []).length
  const safe = () => Math.min(cur(), Math.max(0, count() - 1))
  const item = createMemo(() => (props.items || [])[safe()] || EMPTY)
  const bannerH = () => 1080 - (props.rowPeek || 0)
  // The shelf is laid out at full height and shrunk from its top middle to what the peek leaves.
  const shelfScale = () => (props.rowPeek ? bannerH() / 1080 : 1)
  const spines = createMemo(() => {
    const list = props.items || []
    const at = safe()
    const keys = []
    const map = {}
    const add = (it, idx, x) => {
      const title = (it.Name || '').toUpperCase()
      const k = (it.Id || '') + '-' + idx
      keys.push(k)
      map[k] = { x, color: rgbA(genreGlowRgb(it.Genres)), num: padIndex(idx), title, font: fontFor(title, 'bold') }
    }
    const leftStart = Math.max(0, at - SPINES)
    const lefts = list.slice(leftStart, at)
    lefts.forEach((it, i) => add(it, leftStart + i, SIDE_W - SPINE_STEP * (lefts.length - i) + 2))
    list.slice(at + 1, at + 1 + SPINES).forEach((it, i) => add(it, at + 1 + i, SIDE_W + CENTER_W + 2 + SPINE_STEP * i))
    return { keys, map }
  })
  const book = createMemo(() => {
    const it = item()
    return {
      color: rgbA(genreGlowRgb(it.Genres)),
      poster: it._external ? it._externalPosterUrl || '' : imageOf(it, 'Primary', { maxWidth: 500, quality: 85 }),
    }
  })
  const numFont = () => uiFont('bold')

  const slideChanged = () => {
    const it = (props.items || [])[untrack(safe)]
    if (it && props.onBarSlide) props.onBarSlide(it)
  }
  const restart = () =>
    restartCarousel(bar, () => {
      if (count() < 2) return
      setCur((safe() + 1) % count())
      slideChanged()
    })
  // The shelf stops at its ends rather than wrapping.
  const go = (delta) => {
    const next = Math.max(0, Math.min(count() - 1, safe() + delta))
    if (next !== safe()) {
      setCur(next)
      slideChanged()
    }
    restart()
  }

  createEffect(
    on(
      () => props.items,
      () => {
        setCur(0)
        slideChanged()
        if (bar._focused) restart()
      },
    ),
  )
  onCleanup(() => stopCarousel(bar))

  return (
    <view
      ref={(n) => {
        bar.root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={bannerH()}
      alpha={props.alpha === undefined ? 1 : props.alpha}
      // A click on the banner opens its title (app/pointer.js). The bar spans the screen under
      // Home's rows, so hovering it doesn't take focus from them.
      onPointerClick={(n) => {
        pointerFocus(n)
        return true
      }}
      onFocusChanged={(has) => {
        bar._focused = has
        if (has) restart()
        else stopCarousel(bar)
      }}
      onLeft={() => {
        if (safe() === 0 && left()) focusNav()
        else go(-1)
        return true
      }}
      onRight={() => {
        go(1)
        return true
      }}
      onEnter={() => {
        const it = (props.items || [])[safe()]
        if (it && props.onBarInfo) props.onBarInfo(it)
        return true
      }}
    >
      <view>
        <Index each={GROUND}>{(g) => <view x={g().x} width={g().w} height={bannerH()} colorLeft={g().l} colorRight={g().rc} />}</Index>
      </view>

      <view width={1920} height={ROW_H} scale={shelfScale()} pivotX={0.5} pivotY={0}>
        <view x={SIDE_W} width={CENTER_W} height={ROW_H} color="#1c100aff" />
        <view x={SIDE_W} width={ALCOVE_BORDER} height={ROW_H} color="#382314ff" />
        <view x={SIDE_W + CENTER_W - ALCOVE_BORDER} width={ALCOVE_BORDER} height={ROW_H} color="#382314ff" />

        <view>
          <For each={spines().keys}>
            {(k) => (
              <view
                x={(spines().map[k] || EMPTY).x}
                y={247.2}
                width={44}
                height={820.8}
                borderRadius={6}
                color="#00000000"
                shadow={SHADOWS.spine}
              />
            )}
          </For>
        </view>
        <view>
          <For each={spines().keys}>
            {(k) => {
              const s = () => spines().map[k] || EMPTY
              return <Spine x={s().x} color={s().color} num={s().num} numFont={numFont()} title={s().title} font={s().font} />
            }}
          </For>
        </view>

        <view x={BOOK_X} y={BOOK_Y}>
          <view width={BOOK_W} height={BOOK_H} borderRadius={[3, 8, 8, 3]} color="#00000000" shadow={SHADOWS.book} />
          <view width={BOOK_W} height={BOOK_H} borderRadius={[3, 8, 8, 3]} color={book().color} />
          <view
            x={BOOK_W * 0.12}
            width={BOOK_W * 0.88}
            height={BOOK_H}
            src={book().poster}
            textureOptions={COVER}
            borderRadius={[0, 8, 8, 0]}
            color={PAPER}
            alpha={book().poster ? 1 : 0}
          />
          <view>
            <Index each={BOOK_SHADE}>
              {(b) => <view x={b().x} width={b().w} height={BOOK_H} borderRadius={b().r} colorLeft={b().l} colorRight={b().rc} />}
            </Index>
          </view>
        </view>
      </view>

      <view y={bannerH() - 13} width={1920} height={13} color="#00000000" shadow={SHADOWS.ledge} />
      <view y={bannerH() - 13} width={1920} height={1} color="#ffffff14" />
      <view y={bannerH() - 12} width={1920} height={12} colorTop="#5a3d28ff" colorBottom="#26180eff" />
    </view>
  )
}
