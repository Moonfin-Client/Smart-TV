import $L from '../../../services/i18n.js'
import { For, createEffect, createMemo, createSignal, on, onMount } from 'solid-js'
import {
  buildDisplayRatings,
  fetchEpisodeRatings,
  fetchRatings,
  getContentType,
  getSelectionSource,
  getTmdbId,
  isRatingSourceEnabled,
  ratingSettingsFor,
} from '../../../services/mdblistApi.js'
import { normalizeRatingStyle, personalRatingOf } from '../../../utils/personalRating.js'
import * as settings from '../../../state/settings.js'
import { theme, rgba } from '../../theme.js'
import { cssShift, themeSpacing } from '../../text.js'
import { serverOf } from './barKit.js'
import { face, facesReady, textWidth, themeFace } from './faces.js'
import { flowWrap } from './makdLayout.js'

// A row of ratings: the viewer's own score, the community stars, the server's critic score until
// the plugin answers, then the plugin's ratings in the order the surface's settings keep them.
// Props: item, serverUrl, compact, singleLineWidth, pluginEnabled, surface, inline, sampleRatings,
// labels, badges, columns and prefs, plus font, the family it sits in ('roboto' or 'archivo'),
// maxW, the width it wraps at in its own pixels (or shrinks to, with singleLineWidth), and zoom,
// the scale set around it. It reports its drawn size through onLayout({ w, h, empty }), 0 by 0
// when it draws nothing.
// shortcut: `columns` draws the plain row, without the frosted strip.
// shortcut: no text shadows on the values and names, since this renderer has no text shadow.
// The plugin's logos as the PNG copies in public/icons/ratings, each with the width over height its
// SVG gives the browser.
const ICONS = {
  anilist: 1,
  imdb: 2,
  letterboxd: 1,
  mal: 1,
  metacritic: 1.0264,
  'metacritic-score': 0.9931,
  'metacritic-user': 1.0264,
  rogerebert: 1.0958,
  'rt-audience-down': 1.3218,
  'rt-audience-up': 0.7589,
  'rt-certified': 1,
  'rt-fallback-fresh': 0.9823,
  'rt-fallback-rotten': 1.0357,
  'rt-fresh': 0.9823,
  'rt-rotten': 1.0357,
  'rt-verified': 0.9567,
  tmdb: 1,
  trakt: 1,
  // The settings previews' sample tiles (previews/sampleRatings.js).
  'tile-imdb': 2,
  'tile-tmdb': 2,
  'tile-trakt': 2.375,
  'tile-tomatoes_audience': 1.25,
  'tile-metacritic': 1.25,
  'tile-metacriticuser': 1.25,
  'tile-letterboxd': 1.25,
  'tile-rogerebert': 1.25,
  'tile-myanimelist': 1.625,
}
const iconOf = (url) => {
  const m = /([\w-]+)\.svg/.exec(url || '')
  return m && ICONS[m[1]] ? m[1] : ''
}
const rtFallback = (score) => (score >= 60 ? 'rt-fallback-fresh' : 'rt-fallback-rotten')

// Each layout's sizes, before any zoom.
const MODES = {
  compact: {
    icon: 28,
    iconGap: 6,
    star: 26,
    starGap: 6,
    value: 24,
    weight: 600,
    lh: 24,
    name: 15,
    nameLh: 16.5,
    nameGap: 2,
    padX: 10,
    padY: 4,
    radius: 6,
    colGap: 14,
    rowGap: 8,
  },
  rows: {
    icon: 32,
    iconGap: 7,
    star: 28,
    starGap: 6,
    value: 24,
    weight: 700,
    lh: 24,
    name: 16,
    nameLh: 17.6,
    nameGap: 2,
    padX: 12,
    padY: 6,
    radius: 6,
    colGap: 9,
    rowGap: 6,
  },
  inline: {
    icon: 28,
    iconGap: 8,
    star: 28,
    starGap: 8,
    value: 24,
    weight: 700,
    lh: 28,
    name: 18,
    nameLh: 28,
    nameGap: 8,
    padX: 12,
    padY: 0,
    radius: 8,
    colGap: 10,
    rowGap: 0,
    h: 40,
  },
}

// The star is a glyph from the TV's fallback font, about 1.07em wide with its points 0.89em across.
const STAR_ADVANCE = 1.05
const STAR_ICON = 0.89
const STAR_INSET = 0.065

// Roboto sits higher here than in Chrome (ui/text.js), but Archivo Narrow and Noto Sans don't.
const shiftOf = (face, size) => (face.indexOf('roboto') === 0 ? cssShift(size) : 0)

const NONE = { w: 0, h: 0, iw: 0, ih: 0, scale: 1, bgs: [], icons: [], values: [], names: [] }

export default function RatingsRow(props) {
  const [ratings, setRatings] = createSignal([])
  const [fontsIn, setFontsIn] = createSignal(0)
  const t_ = createMemo(() => theme())
  const s_ = createMemo(() => ratingSettingsFor(props.prefs || settings.all(), props.surface || undefined))
  const maxW = () => (props.maxW == null ? 1920 : props.maxW)
  const server = () => props.serverUrl || serverOf(props.item)
  const sourcesKey = () => {
    const list = s_().mdblistRatingSources
    return Array.isArray(list) ? list.join(',') : ''
  }
  const pluginEnabled = () => props.pluginEnabled !== false
  // Changes when the ratings have to be asked for again.
  const fetchKey = createMemo(() => {
    const it = props.item
    const episodes = s_().tmdbEpisodeRatingsEnabled === true && isRatingSourceEnabled(s_(), 'tmdb')
    return [it && it.Id, server(), pluginEnabled(), episodes, sourcesKey(), !!props.sampleRatings].join('|')
  })
  const shown = () => (props.sampleRatings && pluginEnabled() ? props.sampleRatings : ratings())
  const entries = createMemo(() => {
    const it = props.item
    if (!it) return []
    const s = s_()
    const t = t_()
    const compact = props.compact && !props.inline
    const out = []
    const mine = isRatingSourceEnabled(s, 'personal') ? personalRatingOf(it.UserData) : null
    if (mine !== null) {
      const value = normalizeRatingStyle(s.personalRatingStyle) === 'stars' ? `${(mine / 2).toFixed(1)}/5` : mine.toFixed(1)
      out.push({ k: 'personal', star: '#00a4dc', value, name: $L('My Rating') })
    }
    if (isRatingSourceEnabled(s, 'stars') && it.CommunityRating) {
      out.push({
        k: 'community',
        star: compact ? t.recordingScheduled : '#ffc107',
        value: it.CommunityRating.toFixed(1),
        name: $L('Community'),
      })
    }
    // The server's critic score stands in until the plugin's ratings arrive.
    if (shown().length === 0 && it.CriticRating != null) {
      out.push({ k: 'critic', icon: rtFallback(it.CriticRating), value: `${it.CriticRating}%`, name: $L('Rotten Tomatoes') })
    }
    const enabled = s.mdblistRatingSources
    let list = shown()
    if (Array.isArray(enabled)) {
      list = list
        .filter((r) => enabled.indexOf(getSelectionSource(r.source)) >= 0)
        .sort((a, b) => enabled.indexOf(getSelectionSource(a.source)) - enabled.indexOf(getSelectionSource(b.source)))
    }
    list.forEach((r) => out.push({ k: r.source, icon: iconOf(r.iconUrl), value: r.formatted, name: r.name }))
    return out
  })
  const box = createMemo(() => {
    const list = entries()
    if (!list.length) return NONE
    // Read so the row lays out again once its faces have loaded.
    void fontsIn()
    const t = t_()
    const zoom = props.zoom || 1
    const kind = props.inline ? 'inline' : props.compact ? 'compact' : 'rows'
    const m = MODES[kind]
    const showLabels = props.labels !== false && s_().showRatingLabels !== false
    const showBadges = props.badges !== false && s_().showRatingBadges !== false
    const padX = showBadges ? m.padX : 0
    const padY = showBadges ? m.padY : 0
    const valueColor = kind === 'compact' ? t.onBackground : t.onSurface
    const items = list.map((e) => {
      const valueFace = face(props.font || 'roboto', m.weight, e.value)
      const nameFace = face(props.font || 'roboto', 500, e.name)
      // The browser lays the star glyph out in whole pixels at the size it draws.
      const lead = e.star ? Math.round(m.star * STAR_ADVANCE * zoom) / zoom : e.icon ? m.icon * ICONS[e.icon] : 0
      const gap = e.star ? m.starGap : e.icon ? m.iconGap : 0
      // Neon Pulse's body spacing reaches every face here (the theme's own measure with it already).
      const spaced = (f, str) => (themeFace(f) ? 0 : themeSpacing() * String(str || '').length)
      const valueW = textWidth(e.value, m.value, valueFace, zoom) + spaced(valueFace, e.value)
      const topW = lead + gap + valueW
      const topH = Math.max(e.star ? m.star : e.icon ? m.icon : 0, m.lh)
      const nameTextW = showLabels ? textWidth(e.name, m.name, nameFace, zoom) + spaced(nameFace, e.name) : 0
      let w
      let h
      if (kind === 'inline') {
        w = padX * 2 + topW + (showLabels ? m.nameGap + nameTextW : 0)
        h = m.h
      } else {
        w = padX * 2 + Math.max(topW, nameTextW)
        h = padY * 2 + topH + (showLabels ? m.nameGap + m.nameLh : 0)
      }
      return { e, w, h, lead, gap, topW, topH, valueW, valueFace, nameFace }
    })
    const single = !!props.singleLineWidth || kind === 'inline'
    const flow = flowWrap(items, single ? 1e6 : maxW(), m.colGap, m.rowGap)
    const out = { bgs: [], icons: [], values: [], names: [] }
    flow.items.forEach((p) => {
      const e = p.e
      if (showBadges) out.bgs.push({ k: e.k, x: p.x, y: p.y, w: p.w, h: p.h, r: m.radius, c: rgba(t.scrim, 0.45) })
      const topY = kind === 'inline' ? p.y + (m.h - p.topH) / 2 : p.y + padY
      const left = p.x + padX
      if (e.star) {
        const size = m.star * STAR_ICON
        out.icons.push({
          k: e.k,
          x: left + m.star * STAR_INSET,
          y: topY + (p.topH - m.star) / 2,
          w: size,
          h: size,
          src: 'icons/star.webp',
          c: e.star,
        })
      } else if (e.icon) {
        out.icons.push({
          k: e.k,
          x: left,
          y: topY + (p.topH - m.icon) / 2,
          w: p.lead,
          h: m.icon,
          src: `icons/ratings/${e.icon}.webp`,
          c: '#ffffffff',
        })
      }
      const vx = left + p.lead + p.gap
      out.values.push({
        k: e.k,
        x: vx,
        y: topY + (p.topH - m.lh) / 2 + shiftOf(p.valueFace, m.value),
        t: e.value,
        f: p.valueFace,
        s: m.value,
        lh: m.lh,
        c: valueColor,
      })
      if (showLabels) {
        const named =
          kind === 'inline'
            ? { x: vx + p.valueW + m.nameGap, y: p.y + (m.h - m.nameLh) / 2, a: 0.7 }
            : { x: left, y: topY + p.topH + m.nameGap, a: 1 }
        out.names.push({
          k: e.k,
          x: named.x,
          y: named.y + shiftOf(p.nameFace, m.name),
          t: e.name,
          f: p.nameFace,
          s: m.name,
          lh: m.nameLh,
          c: t.onSurface,
          a: named.a,
        })
      }
    })
    // The compact row sits 8px down and gives 4px back under its last line, the inline one is a
    // 40px strip 12px down, the full one is just its lines.
    let w = flow.w
    let h = kind === 'compact' ? 8 + flow.h + m.rowGap - 4 : kind === 'inline' ? 12 + m.h : flow.h
    const shift = kind === 'compact' ? 8 : kind === 'inline' ? 12 : 0
    if (shift) [out.bgs, out.icons, out.values, out.names].forEach((list) => list.forEach((n) => (n.y += shift)))
    let scale = zoom
    if (props.singleLineWidth && w > maxW()) scale *= maxW() / w
    if (kind === 'inline') w = Math.min(w, maxW())
    return { w: w * scale, h: h * scale, iw: w, ih: h, scale, bgs: out.bgs, icons: out.icons, values: out.values, names: out.names }
  })
  let loadFor = null
  const load = () => {
    const it = props.item
    const srv = server()
    const id = (loadFor = it ? it.Id : null)
    setRatings([])
    if (!pluginEnabled() || !it || !srv || props.sampleRatings) return
    const apply = (r) => {
      if (loadFor === id) setRatings(buildDisplayRatings(r, srv))
    }
    // Episodes have no MDBList ratings, only TMDB's episode score when that's on.
    if (it.Type === 'Episode') {
      if (s_().tmdbEpisodeRatingsEnabled === true && isRatingSourceEnabled(s_(), 'tmdb')) fetchEpisodeRatings(srv, it).then(apply)
      return
    }
    if (!getContentType(it) || (!getTmdbId(it) && it.Type !== 'Series')) return
    fetchRatings(srv, it, { sourcesKey: sourcesKey() }).then(apply)
  }
  createEffect(on(fetchKey, load))
  createEffect(
    on(box, (b) => {
      if (props.onLayout) props.onLayout({ w: b.w, h: b.h, empty: b === NONE })
    }),
  )
  onMount(() => {
    const family = props.font === 'archivo' ? 'archivo-narrow' : 'roboto'
    facesReady([family, family + '-medium', family + '-semibold', family + '-bold']).then(() => setFontsIn(fontsIn() + 1))
  })
  return (
    <view x={props.x || 0} y={props.y || 0} width={box().iw} height={box().ih} scale={box().scale} pivot={0} clipping={!!props.inline}>
      <view>
        <For each={box().bgs}>{(b) => <view x={b.x} y={b.y} width={b.w} height={b.h} borderRadius={b.r} color={b.c} />}</For>
      </view>
      <view>
        <For each={box().icons}>{(ic) => <view x={ic.x} y={ic.y} width={ic.w} height={ic.h} src={ic.src} color={ic.c} />}</For>
      </view>
      <view>
        <For each={box().values}>
          {(v) => (
            <text x={v.x} y={v.y} fontFamily={v.f} fontSize={v.s} lineHeight={v.lh} letterSpacing={themeSpacing()} color={v.c}>
              {v.t}
            </text>
          )}
        </For>
      </view>
      <view>
        <For each={box().names}>
          {(n) => (
            <text x={n.x} y={n.y} fontFamily={n.f} fontSize={n.s} lineHeight={n.lh} letterSpacing={themeSpacing()} color={n.c} alpha={n.a}>
              {n.t}
            </text>
          )}
        </For>
      </view>
    </view>
  )
}
