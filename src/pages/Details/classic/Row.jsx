import { For, Match, Show, Switch, createEffect, createMemo, createSelector, createSignal, on, onCleanup } from 'solid-js'
import Card from '../../../ui/components/Card.jsx'
import StillLabels from '../../../ui/components/details/StillLabels.jsx'
import { byKey } from '../../../ui/components/details/keyed.js'
import { cssShift, displayFont, fontFor, uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { glowShadow } from '../../../ui/theme.js'
import { holdPress } from '../../../utils/longPress.js'
import { rowScroll } from './scroll.js'
import { tx } from '../../../ui/fx.js'

// One of Classic's sections from sections.js: its heading and its cards in a lane that scrolls
// sideways. Only cards near the lane's view are built.
//
// Props: `row`, `tokens`, `x`, `y`. Left and Right move along the lane (past either end they call
// onEdge(dir)), Up and Down go on to the page, Enter calls onSelect(row, cell) and a held Enter on
// a title onLong(row, cell). DEL or the red key calls onRemove(row, cell) on a playlist entry in its
// own order. Every move calls onCellFocus(row, cell). Its node has current(), focusEntry() and
// reveal().
const WINDOW = 700
const HOLD_KINDS = ['media', 'episode', 'seasonEp', 'track']
const GROWS = { episode: 1.03, seasonEp: 1, nextup: 1.01 }
// The anime markers' two sizes: compact 13px on 1 by 9 padding, and the default 15px on 2 by 11,
// each with a 1px border and the text on a 1.5 line.
const pillSize = (size) =>
  size === 'normal'
    ? { h: 28.5, r: 9, font: 15, tx: 12, ty: 3 + (22.5 - 33) / 2 + cssShift(15) }
    : { h: 23.5, r: 8, font: 13, tx: 10, ty: 2 + (19.5 - 33) / 2 + cssShift(13) }
const GROW = { scale: { duration: 200 } }
const FADE = { alpha: { duration: 200 } }
const GLIDE = { x: { duration: 220, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' } }
const STILL = {}
const COVER = { resizeMode: { type: 'cover' } }
// Neon Pulse's look: a pink glow on titles, cyan copy, pink edges.
const NEON_TEXT_GLOW = { color: '#ff2e9259', x: 0, y: 0, blur: 8 }
const NEON_CYAN = '#00e5ffff'
const NEON_EDGE = hex('#ff2e9273')
const NEON_GLOW = glowShadow({ color: '#ff2e9233', x: 0, y: 0, blur: 14, spread: 0 }).shadow
const COUNT_SHADOW = glowShadow({ color: '#00000099', x: 0, y: 1.5, blur: 4, spread: 0 }).shadow
const SEASON_SHADOW = glowShadow({ color: '#00000099', x: 0, y: 8, blur: 24, spread: 0 }).shadow
const DEFAULT_T = {
  focus: '#ffffffff', accent: '#00a4dcff', onSurface: '#ffffffff', recordingActive: '#ff4757ff', badgeWatched: '#00a4dcff', badgeUnplayed: '#00a4dcff', onBadge: '#ffffffff', surface: '#111111ff',
  os: () => '#ffffff0f', accentA: () => '#00a4dcff',
}
const NO_ROW = { k: '', cells: [], title: '', kind: 'none', mode: 'none', cardsY: 0, clipX: 0, clipW: 0, h: 0 }
const GONE = {
  k: '', idx: -1, x: 0, w: 0, h: 0, cardW: 0, cardH: 0, thumbH: 0, progress: 0, numW: 0, nameW: 0, nameX: 0, roleX: 0, runX: 0, rateX: 0, countW: 0, markY: 0,
  textW: 0, infoX: 0, infoW: 0, durX: 0, nameY: 0, ovY: 0, ctaX: 0, pills: [], pillsX: 0, pillsY: 0, name: '', item: null, dot: null,
}
const GONE_PILL = { k: '', x: 0, y: 0, w: 0, vw: 0, h: 0, r: 0, font: 13, tx: 0, ty: 0, fill: '#00000000', border: '#00000000', ink: '#00000000', label: '', idx: -1, grow: 1, pvx: 0, pvy: 0 }
const GONE_FACT = { k: '', x: 0, y: 0, w: 0, h: 0, r: 0, color: '#00000000', bw: 0, bc: '#00000000', src: '', text: '', size: 14, font: 'roboto', lh: 33 }

export default function ClassicRow(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const t = () => props.tokens || DEFAULT_T
  const r = () => props.row || NO_ROW
  const kind = () => r().kind
  const cells = () => r().cells || []
  const isOn = createSelector(() => (focused() ? cur() : -1))
  const bold = () => uiFont('bold')
  const regular = () => uiFont('regular')
  // Pixel themes square off the episode, chapter, Next Up, season poster and season episode cards.
  const sq = (r) => (t().isPixel ? 0 : r)
  // Neon Pulse sets body copy 0.6px apart, and its titles and cast names in its display face.
  const sp = () => t().spacing || 0
  const neon = () => !!t().neon
  const titleFace = (f) => (neon() && f.indexOf('-web') < 0 ? displayFont('bold') : f)
  const clipH = () => r().h - r().cardsY + (r().clipPad || 0)
  // The lane spans its cards, so the renderer never culls it while it scrolls.
  const laneW = () => {
    const cs = cells()
    const last = cs[cs.length - 1]
    return Math.max(r().clipW || 0, last ? last.x + last.w + 2 * (r().clipPad || 20) + 60 : 0)
  }
  const cellMap = createMemo(() => {
    const m = {}
    cells().forEach((c) => (m[c.k] = c))
    return m
  })
  const at = (k) => cellMap()[k] || GONE
  const shown = createMemo(() => {
    const lo = scroll() - WINDOW
    const hi = scroll() + (r().clipW || 1920) + WINDOW
    return cells().filter((c) => c.x + c.w >= lo && c.x <= hi)
  })
  const shownKeys = createMemo(() => shown().map((c) => c.k))
  // The episodes' anime markers, laid flat beside the cards. On a card that grows when focused they
  // grow about the card's middle with it, and a card's info row hides what runs past its edge.
  const pills = byKey(() => {
    const grow = GROWS[kind()]
    if (!grow) return []
    const out = []
    shown().forEach((c) =>
      (c.pills || []).forEach((p) => {
        const z = pillSize(c.pillSize)
        const x = c.pillsX + p.x
        const vw = grow > 1 ? Math.min(p.w, c.w - 1 - x) : p.w
        if (vw <= 0) return
        out.push({
          k: `${c.k}:${p.key}`, x: (c.x || 0) + x, y: c.pillsY, w: p.w, vw, fill: p.fill, border: p.border, ink: p.text, label: p.label,
          idx: c.idx, grow, pvx: (c.w / 2 - x) / vw, pvy: (c.h / 2 - c.pillsY) / z.h, ...z,
        })
      }),
    )
    return out
  }, GONE_PILL)
  const facts = (key, rule) => byKey(() => (kind() === 'facts' ? (r()[key] || []).filter(rule || (() => true)) : []), GONE_FACT)
  const factBlocks = facts('blocks', (b) => b.r)
  // The rules between facts, drawn without the rounded shader that would soften a 1px line away.
  const factLines = facts('blocks', (b) => !b.r)
  const factImgs = facts('imgs')
  const factTexts = facts('texts')
  const factFocus = () => (kind() === 'facts' && isOn(0) && cells().length ? cells()[0] : null)

  const startScroll = (row) => (row && row.startScroll ? rowScroll.clamp(row, row.startScroll) : 0)
  setScroll(startScroll(props.row))
  // A row that comes back with other cards keeps its place within them, and one with another key
  // starts over at its entry.
  createEffect(
    on(
      () => props.row,
      (next, prev) => {
        if (!prev || !next) return
        const n = (next.cells || []).length
        if (next.k === prev.k && n === (prev.cells || []).length) return
        setCur(Math.min(cur(), Math.max(0, n - 1)))
        if (next.k !== prev.k) setScroll(startScroll(next))
      },
      { defer: true },
    ),
  )

  const current = () => cells()[cur()] || null
  const reveal = () => {
    const c = current()
    if (c) setScroll(rowScroll.toShow(props.row, scroll(), c))
  }
  const move = (d) => {
    const next = cur() + d
    if (next < 0 || next >= cells().length) return false
    setCur(next)
    reveal()
    if (props.onCellFocus) props.onCellFocus(props.row, cells()[next])
    return true
  }
  const removeCurrent = () => {
    const c = current()
    if (c && c.kind === 'track' && c.ordered && props.onRemove) props.onRemove(props.row, c)
    return true
  }

  const hold = holdPress()
  onCleanup(() => {
    if (props.ref) props.ref(null)
  })

  const CastCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={145} height={216} pivot={0.5} transition={GROW} scale={p.on ? 1.05 : 1}>
        <view alpha={neon() ? 1 : 0} x={6} width={133} height={133} borderRadius={66.5} color="#00000000" shadow={NEON_GLOW} />
        <view x={6} width={133} height={133} borderRadius={66.5} color="#ffffff0d" />
        <text letterSpacing={sp()}
          alpha={c().photo ? 0 : 1}
          x={6}
          y={54.5}
          fontFamily={bold()}
          fontSize={48}
          lineHeight={33}
          maxWidth={133}
          contain="width"
          textAlign="center"
          color="#ffffff4d"
        >
          {c().initial}
        </text>
        <view alpha={c().photo ? 1 : 0} x={7} y={1} width={131} height={131} borderRadius={65.5} src={c().photo || undefined} textureOptions={COVER} />
        <view x={6} width={133} height={133} borderRadius={66.5} color="#00000001" border={{ width: 1, color: NEON_EDGE }} alpha={neon() && !p.on ? 1 : 0} />
        <view x={6} width={133} height={133} borderRadius={66.5} color="#00000001" border={{ width: 1, color: hex(t().focus) }} alpha={p.on ? 1 : 0} />
        <text
          x={c().nameX}
          y={151.5}
          fontFamily={titleFace(c().nameFont)}
          fontSize={17}
          lineHeight={33}
          letterSpacing={neon() ? 0.4 : 0}
          textShadow={neon() ? NEON_TEXT_GLOW : undefined}
          maxWidth={145}
          maxLines={1}
          color={t().onSurface}
        >
          {c().name}
        </text>
        <text letterSpacing={sp()} x={c().roleX} y={184.5} fontFamily={c().roleFont} fontSize={16} lineHeight={33} maxWidth={145} maxLines={1} color={neon() ? NEON_CYAN : '#ffffff99'}>
          {c().role}
        </text>
      </view>
    )
  }

  const SeasonCell = (p) => {
    const c = () => p.c
    const dot = () => c().dot
    return (
      <view x={c().x} width={224} height={375} pivot={0.5} transition={GROW} scale={p.on ? 1.05 : 1}>
        <view width={224} height={332} borderRadius={sq(12)} color="#00000000" shadow={SEASON_SHADOW} transition={FADE} alpha={p.on ? 1 : 0} />
        <view width={224} height={332} borderRadius={sq(12)} color="#ffffff0d" />
        <view alpha={c().img ? 0 : 1} x={3} y={3} width={218} height={326} borderRadius={sq(9)} color="#323232cc">
          <text letterSpacing={sp()} x={12} y={148} fontFamily={c().nameFont} fontSize={17} lineHeight={33} maxWidth={194} contain="width" textAlign="center" color="#ffffffb3">
            {c().name}
          </text>
        </view>
        <view alpha={c().img ? 1 : 0} x={3} y={3} width={218} height={326} borderRadius={sq(9)} src={c().img || undefined} textureOptions={COVER} />
        <view width={224} height={332} borderRadius={sq(12)} color="#00000001" border={{ width: 3, color: hex(t().focus) }} alpha={p.on ? 1 : 0} />
        <view alpha={c().played ? 1 : 0} x={185} y={3 + c().markY} width={28} height={28} borderRadius={14} color={t().badgeWatched}>
          <view x={6} y={6} width={16} height={16} src="icons/cls_check.webp" color={t().onBadge} />
        </view>
        <view alpha={c().unplayed ? 1 : 0} x={221 - 8 - c().countW} y={3 + c().markY} width={c().countW} height={26} borderRadius={13} color="#00000000" shadow={COUNT_SHADOW} />
        <view
          alpha={c().unplayed ? 1 : 0}
          x={221 - 8 - c().countW}
          y={3 + c().markY}
          width={c().countW}
          height={26}
          borderRadius={13}
          color={t().badgeUnplayed}
          border={{ width: 1.5, color: hex(t().onBadge) }}
        >
          <text letterSpacing={sp()} y={-2} fontFamily={bold()} fontSize={14} lineHeight={30} maxWidth={c().countW || 1} contain="width" textAlign="center" color={t().onBadge}>
            {c().unplayed || ''}
          </text>
        </view>
        <view
          alpha={dot() ? 1 : 0}
          x={11}
          y={11}
          width={28}
          height={28}
          borderRadius={14}
          color={dot() ? dot().fill : '#00000000'}
          border={{ width: 2, color: hex(dot() ? dot().ring : '#00000000') }}
        >
          <view
            x={dot() ? dot().iconAt : 0}
            y={dot() ? dot().iconAt : 0}
            width={dot() ? dot().iconSize : 0}
            height={dot() ? dot().iconSize : 0}
            src={dot() ? `icons/${dot().icon}.webp` : undefined}
            color={dot() ? dot().iconColor : '#00000000'}
          />
        </view>
        <text letterSpacing={sp()} x={c().nameX} y={343.5} fontFamily={c().nameFont} fontSize={18} lineHeight={33} maxWidth={180} maxLines={1} color={t().onSurface}>
          {c().name}
        </text>
      </view>
    )
  }

  // The thumb, its placeholder and its progress, shared by the episode, Next Up and season rows.
  // `dy` drops the placeholder below the middle (1px on the cards, none on a season's rows).
  const Still = (p) => {
    const c = () => p.c
    return (
      <>
        <view x={1} y={1} width={p.w} height={p.h} borderRadius={p.r} color={t().surface} />
        <view alpha={c().thumb ? 0 : 1} x={(p.w + 2 - 40) / 2} y={(p.h - 40) / 2 + (p.dy == null ? 1 : p.dy)} width={40} height={40} src="icons/episode_placeholder.webp" color="#ffffff26" />
        <view alpha={c().thumb ? 1 : 0} x={1} y={1} width={p.w} height={p.h} borderRadius={p.r} src={c().thumb || undefined} textureOptions={COVER} />
        <view alpha={c().progress > 0 ? 1 : 0} x={1} y={p.h - 2} width={p.w} height={3} color="#00000080">
          <view width={p.w * (c().progress || 0)} height={3} color={t().accent} />
        </view>
      </>
    )
  }

  // A watched or favorite mark on a still, in the theme's badge colors.
  const Mark = (p) => (
    <view alpha={p.show ? 1 : 0} x={p.x} y={9} width={28} height={28} borderRadius={14} color={p.fill} border={p.ring ? { width: 1.5, color: hex(t().onBadge) } : undefined}>
      <view x={6} y={6} width={16} height={16} src={p.icon} color={t().onBadge} />
    </view>
  )

  const EpisodeCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={302} height={224} pivot={0.5} transition={GROW} scale={p.on ? 1.03 : 1}>
        <view width={302} height={224} borderRadius={sq(8)} color={c().current ? t().accentA(0.08) : '#00000000'} />
        <Still c={c()} w={300} h={169} r={sq(7)} />
        <Mark show={c().played} x={265} fill={t().badgeWatched} icon="icons/cls_check_compact.webp" />
        <Mark show={c().fav} x={9} fill={t().recordingActive} ring icon="icons/cls_heart.webp" />
        <StillLabels x={1} y={1} w={300} h={169} item={c().item} top={c().fav ? 42 : 8} topRight={c().played ? 42 : 8} />
        <text letterSpacing={sp()} x={13} y={181.5} fontFamily={bold()} fontSize={15} lineHeight={33} color="#ffffff80">
          {c().num}
        </text>
        <text letterSpacing={sp()} x={21 + c().numW} y={181.5} fontFamily={c().nameFont} fontSize={17} lineHeight={33} maxWidth={c().nameW || 1} maxLines={1} color="#ffffffe6">
          {c().name}
        </text>
        <text letterSpacing={sp()} x={1 + c().runX} y={181.5} fontFamily={regular()} fontSize={14} lineHeight={33} color="#ffffff66">
          {c().runtime}
        </text>
        <view alpha={c().rating ? 1 : 0} x={1 + c().rateX} y={190} width={14} height={14} src="icons/ratings/tmdb.webp" />
        <text letterSpacing={sp()} x={18 + c().rateX} y={181.5} fontFamily={regular()} fontSize={14} lineHeight={33} color="#ffffffb3">
          {c().rating}
        </text>
        <view
          width={302}
          height={224}
          borderRadius={sq(8)}
          color="#00000001"
          border={{ width: 1, color: hex(t().accentA(0.4)) }}
          alpha={c().current && !p.on ? 1 : 0}
        />
        <view width={302} height={224} borderRadius={sq(8)} color="#00000001" border={{ width: 1, color: hex(t().focus) }} alpha={p.on ? 1 : 0} />
      </view>
    )
  }

  const ChapterCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={282} height={213} pivot={0.5} transition={GROW} scale={p.on ? 1.03 : 1}>
        <view x={1} y={1} width={280} height={158} borderRadius={sq(7)} color={t().surface} />
        <view
          alpha={c().thumb ? 0 : 1}
          x={121}
          y={60}
          width={40}
          height={40}
          src={c().chapterKind === 'extra' ? 'icons/cls_extra.webp' : 'icons/cls_chapter.webp'}
          color="#ffffff26"
        />
        <view alpha={c().thumb ? 1 : 0} x={1} y={1} width={280} height={158} borderRadius={sq(7)} src={c().thumb || undefined} textureOptions={COVER} />
        <text letterSpacing={sp()} x={13} y={170.5} fontFamily={c().nameFont} fontSize={16} lineHeight={33} maxWidth={c().nameW || 1} maxLines={1} color="#ffffffe6">
          {c().name}
        </text>
        <text letterSpacing={sp()} x={269} y={170.5} mountX={1} fontFamily={regular()} fontSize={14} lineHeight={33} color="#ffffff66">
          {c().time}
        </text>
        <view width={282} height={213} borderRadius={sq(8)} color="#00000001" border={{ width: 1, color: hex(t().accentA(0.5)) }} alpha={p.on ? 1 : 0} />
      </view>
    )
  }

  const MediaCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={c().cardW} height={c().h}>
        <Card card={c().card} w={c().cardW} h={c().cardH} focused={p.on} look="media" cardType={c().cardType} />
      </view>
    )
  }

  const ReviewCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={520} height={250}>
        <view width={520} height={250} borderRadius={16} color={p.on ? '#34343cd1' : '#24242ab8'} />
        <view width={520} height={250} borderRadius={16} color="#00000001" border={{ width: 3, color: hex('#00a4dcff') }} alpha={p.on ? 1 : 0} />
        <view x={27} y={31} width={56} height={56} borderRadius={28} color="#ffffff29">
          <text letterSpacing={sp()} y={13.5} fontFamily={bold()} fontSize={26} lineHeight={34} maxWidth={56} contain="width" textAlign="center" color="#ffffffff">
            {c().initial}
          </text>
          <view alpha={c().avatar ? 1 : 0} width={56} height={56} borderRadius={28} src={c().avatar || undefined} textureOptions={COVER} />
        </view>
        <text letterSpacing={sp()}
          x={99}
          y={c().meta ? 27 : 44.5}
          fontFamily={c().authorFont}
          fontSize={24}
          lineHeight={33}
          maxWidth={394}
          maxLines={1}
          color="#ffffffff"
        >
          {c().author}
        </text>
        <text letterSpacing={sp()} x={99} y={61.5} fontFamily={regular()} fontSize={18} lineHeight={33} color="#ffffffa8">
          {c().meta}
        </text>
        <text letterSpacing={sp()} x={27} y={111} fontFamily={c().previewFont} fontSize={20} lineHeight={28} maxWidth={466} maxLines={4} color="#ffffffd1">
          {c().preview}
        </text>
      </view>
    )
  }

  const NextCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={c().w} height={171} pivot={0.5} transition={GROW} scale={p.on ? 1.01 : 1}>
        <view width={c().w} height={171} borderRadius={sq(8)} color={t().os(0.06)} />
        <Still c={c()} w={300} h={169} r={sq(7)} />
        <StillLabels x={1} y={1} w={300} h={169} item={c().item} />
        <text letterSpacing={sp()} x={321} y={c().nameY + 1.5} fontFamily={c().nameFont} fontSize={18} lineHeight={33} maxWidth={c().textW || 1} maxLines={1} color="#fffffff2">
          {c().name}
        </text>
        <text letterSpacing={sp()} x={321} y={c().ovY + 1.5} fontFamily={c().overviewFont} fontSize={18} lineHeight={24.3} maxWidth={c().textW || 1} maxLines={3} color="#ffffff8c">
          {c().overview}
        </text>
        <view x={c().w - 61} y={65.5} width={40} height={40} src="icons/cls_play_circle.webp" color="#ffffff66" />
        <view width={c().w} height={171} borderRadius={sq(8)} color="#00000001" border={{ width: 1, color: hex(t().focus) }} alpha={p.on ? 1 : 0} />
      </view>
    )
  }

  // The chip and the banner keep their own fixed colors on every theme.
  const ChipCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={c().w} height={53} pivot={0.5} transition={GROW} scale={p.on ? 1.05 : 1}>
        <view width={c().w} height={53} borderRadius={26.5} color={p.on ? '#4b5563ff' : '#374151ff'} />
        <text letterSpacing={sp()} x={20} y={11.5} fontFamily={c().labelFont} fontSize={14} lineHeight={33} color="#ffffffff">
          {c().label}
        </text>
      </view>
    )
  }

  const BannerCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={1162} height={83} pivot={0.5} transition={GROW} scale={p.on ? 1.01 : 1}>
        <view width={1162} height={83} borderRadius={12} color="#181818ff" />
        <view alpha={c().art ? 1 : 0} x={3} y={3} width={1156} height={77} borderRadius={9} src={c().art || undefined} textureOptions={COVER} />
        <view x={3} y={3} width={1156} height={77} borderRadius={9} colorLeft="#000000d1" colorRight="#0000008c" />
        <view x={31} y={27.5} width={28} height={28} src="icons/d/watchlist.webp" color="#ffffffff" />
        <text letterSpacing={sp()} x={75} y={27} fontFamily={c().labelFont} fontSize={24} lineHeight={33} maxWidth={868} maxLines={1} color="#ffffffff">
          {c().label}
        </text>
        <text letterSpacing={sp()} x={c().ctaX} y={27} fontFamily={bold()} fontSize={20} lineHeight={33} color="#00a4dcff">
          {c().cta}
        </text>
        <view x={1107} y={29.5} width={24} height={24} src="icons/d/chevronRight.webp" color="#00a4dcff" />
        <view width={1162} height={83} borderRadius={12} color="#00000001" border={{ width: 3, color: hex(p.on ? '#ffffffff' : '#ffffff1f') }} />
      </view>
    )
  }

  const SeasonEpCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={c().w} height={c().h}>
        <view alpha={neon() ? 1 : 0} width={c().w} height={c().h} borderRadius={sq(12)} color="#00000000" shadow={NEON_GLOW} />
        <view width={c().w} height={c().h} borderRadius={sq(12)} color={t().os(p.on ? 0.08 : 0.04)} />
        <Still c={c()} w={340} h={c().thumbH} r={0} dy={0} />
        <Mark show={c().played} x={305} fill={t().badgeWatched} icon="icons/cls_check.webp" />
        <Mark show={c().fav} x={9} fill={t().recordingActive} ring icon="icons/cls_heart.webp" />
        <StillLabels x={1} y={1} w={340} h={c().thumbH} item={c().item} top={c().fav ? 42 : 8} topRight={c().played ? 42 : 8} />
        <text x={361} y={2.5} fontFamily={bold()} fontSize={16} lineHeight={33} letterSpacing={0.5} color="#ffffff80">
          {c().num}
        </text>
        <text letterSpacing={sp()} x={c().runX} y={2.5} fontFamily={regular()} fontSize={16} lineHeight={33} color={neon() ? NEON_CYAN : '#ffffff66'}>
          {c().runtime}
        </text>
        <view alpha={c().rating ? 1 : 0} x={c().rateX} y={10} width={14} height={14} src="icons/ratings/tmdb.webp" />
        <text letterSpacing={sp()} x={c().rateX + 17} y={2.5} fontFamily={regular()} fontSize={14} lineHeight={33} color={neon() ? NEON_CYAN : '#ffffffb3'}>
          {c().rating}
        </text>
        <text
          x={361}
          y={43}
          fontFamily={titleFace(c().nameFont)}
          fontSize={24}
          lineHeight={33}
          letterSpacing={neon() ? 0.4 : 0}
          textShadow={neon() ? NEON_TEXT_GLOW : undefined}
          maxWidth={c().textW || 1}
          maxLines={1}
          color={t().onSurface}
        >
          {c().name}
        </text>
        <text letterSpacing={sp()} x={361} y={78} fontFamily={c().overviewFont} fontSize={20} lineHeight={30} maxWidth={c().textW || 1} maxLines={3} color={neon() ? NEON_CYAN : '#ffffff8c'}>
          {c().overview}
        </text>
        <view width={c().w} height={c().h} borderRadius={sq(12)} color="#00000001" border={{ width: 1, color: NEON_EDGE }} alpha={neon() && !p.on ? 1 : 0} />
        <view width={c().w} height={c().h} borderRadius={sq(12)} color="#00000001" border={{ width: 1, color: hex(t().focus) }} alpha={p.on ? 1 : 0} />
      </view>
    )
  }

  const TrackCell = (p) => {
    const c = () => p.c
    return (
      <view x={c().x} width={c().w} height={c().h}>
        <view width={c().w} height={c().h} borderRadius={8} color="#ffffff1f" alpha={p.on ? 1 : 0} />
        <view width={c().w} height={c().h} borderRadius={8} color="#00000001" border={{ width: 2, color: hex('#00a4dc99') }} alpha={p.on ? 1 : 0} />
        <text letterSpacing={sp()}
          x={16}
          y={(c().h - 33) / 2 + 2}
          fontFamily={regular()}
          fontSize={20}
          lineHeight={33}
          maxWidth={36}
          contain="width"
          textAlign="center"
          color="#ffffff80"
        >
          {c().num}
        </text>
        <view alpha={c().thumb ? 1 : 0} x={68} y={(c().h - 56) / 2} width={56} height={56} borderRadius={6} src={c().thumb || undefined} textureOptions={COVER} />
        <text letterSpacing={sp()} x={c().infoX} y={14} fontFamily={c().nameFont} fontSize={24} lineHeight={33} maxWidth={c().infoW || 1} maxLines={1} color={t().onSurface}>
          {c().name}
        </text>
        <text letterSpacing={sp()} x={c().infoX} y={49.5} fontFamily={c().subFont} fontSize={18} lineHeight={35} maxWidth={c().infoW || 1} color="#ffffff80">
          {c().sub}
        </text>
        <text letterSpacing={sp()} x={c().durX} y={(c().h - 33) / 2 + 2} mountX={1} fontFamily={regular()} fontSize={20} lineHeight={33} color="#ffffff80">
          {c().dur}
        </text>
        <text letterSpacing={sp()} alpha={c().ordered ? 1 : 0} x={c().w - 32} y={c().h / 2 - 18} fontFamily={fontFor('▲')} fontSize={16} lineHeight={16} color={c().upInk}>
          ▲
        </text>
        <text letterSpacing={sp()} alpha={c().ordered ? 1 : 0} x={c().w - 32} y={c().h / 2} fontFamily={fontFor('▼')} fontSize={16} lineHeight={16} color={c().downInk}>
          ▼
        </text>
      </view>
    )
  }

  const cellsOf = (Cell) => <For each={shownKeys()}>{(k) => <Cell c={at(k)} on={isOn(at(k).idx)} />}</For>

  return (
    <view
      ref={(n) => {
        n.current = current
        n.focusEntry = () => {
          const row = props.row
          setCur(Math.min(row ? row.entry || 0 : 0, Math.max(0, cells().length - 1)))
          reveal()
        }
        n.reveal = reveal
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={1920}
      height={r().h}
      onFocusChanged={(has) => {
        setFocused(has)
        if (!has) hold.cancel()
      }}
      onLeft={() => {
        if (!move(-1) && props.onEdge) props.onEdge('left')
        return true
      }}
      onRight={() => {
        if (!move(1) && props.onEdge) props.onEdge('right')
        return true
      }}
      onRed={removeCurrent}
      onDelete={removeCurrent}
      onEnter={() => {
        const c = current()
        if (!c) return true
        if (HOLD_KINDS.indexOf(c.kind) < 0) {
          if (props.onSelect) props.onSelect(props.row, c)
          return true
        }
        hold.start(c, () => {
          if (props.onLong) props.onLong(props.row, c)
        })
        return true
      }}
      onMenu={() => {
        const c = current()
        if (!c || HOLD_KINDS.indexOf(c.kind) < 0 || !props.onLong) return false
        props.onLong(props.row, c)
        return true
      }}
      onEnterRelease={() => {
        return hold.end((c) => {
          if (props.onSelect) props.onSelect(props.row, c)
        })
      }}
    >
      <text letterSpacing={sp()}
        x={r().titleX || 0}
        y={r().titleSize === 28 ? 2.5 : 3}
        fontFamily={r().titleSize === 28 ? uiFont('medium') : bold()}
        fontSize={r().titleSize || 32}
        lineHeight={33}
        color={t().onSurface}
      >
        {r().title || ''}
      </text>
      <view x={r().clipX} y={r().cardsY - (r().clipPad || 0)} width={r().clipW || 1920} height={clipH()} clipping={r().mode !== 'none'}>
        <view transition={tx(r().mode === 'glide' ? GLIDE : STILL)} x={-r().clipX - scroll()} y={r().clipPad || 0} width={laneW()} height={clipH()}>
          <view width={laneW()} height={clipH()}>
            <Switch>
              <Match when={kind() === 'cast'}>{cellsOf(CastCell)}</Match>
              <Match when={kind() === 'season'}>{cellsOf(SeasonCell)}</Match>
              <Match when={kind() === 'episode'}>{cellsOf(EpisodeCell)}</Match>
              <Match when={kind() === 'chapter'}>{cellsOf(ChapterCell)}</Match>
              <Match when={kind() === 'media'}>{cellsOf(MediaCell)}</Match>
              <Match when={kind() === 'review'}>{cellsOf(ReviewCell)}</Match>
              <Match when={kind() === 'nextup'}>{cellsOf(NextCell)}</Match>
              <Match when={kind() === 'chip'}>{cellsOf(ChipCell)}</Match>
              <Match when={kind() === 'banner'}>{cellsOf(BannerCell)}</Match>
              <Match when={kind() === 'seasonEp'}>{cellsOf(SeasonEpCell)}</Match>
              <Match when={kind() === 'track'}>{cellsOf(TrackCell)}</Match>
            </Switch>
          </view>
          <view width={laneW()} height={clipH()}>
            <For each={pills.keys()}>
              {(k) => {
                const pl = () => pills.at(k)
                return (
                  <view
                    x={pl().x}
                    y={pl().y}
                    width={pl().vw}
                    height={pl().h}
                    clipping={pl().vw < pl().w}
                    pivotX={pl().pvx}
                    pivotY={pl().pvy}
                    transition={GROW}
                    scale={isOn(pl().idx) ? pl().grow : 1}
                  >
                    <view width={pl().w} height={pl().h} borderRadius={pl().r} color={pl().fill} border={{ width: 1, color: hex(pl().border) }} />
                    <text x={pl().tx} y={pl().ty} fontFamily={bold()} fontSize={pl().font} lineHeight={33} letterSpacing={0.2} color={pl().ink}>
                      {pl().label}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
          <view width={laneW()} height={clipH()}>
            <Show when={kind() === 'facts'}>
              <view width={laneW()} height={clipH()}>
                <For each={factBlocks.keys()}>
                  {(k) => {
                    const b = () => factBlocks.at(k)
                    return (
                      <view
                        x={b().x}
                        y={b().y}
                        width={b().w}
                        height={b().h}
                        borderRadius={b().r}
                        color={b().color}
                        border={b().bw ? { width: b().bw, color: hex(b().bc) } : undefined}
                      />
                    )
                  }}
                </For>
              </view>
              <view width={laneW()} height={clipH()}>
                <For each={factLines.keys()}>
                  {(k) => <view x={factLines.at(k).x} y={factLines.at(k).y} width={factLines.at(k).w} height={factLines.at(k).h} color={factLines.at(k).color} />}
                </For>
              </view>
              <view width={laneW()} height={clipH()}>
                <For each={factImgs.keys()}>
                  {(k) => {
                    const im = () => factImgs.at(k)
                    return (
                      <view
                        x={im().x}
                        y={im().y}
                        width={im().w}
                        height={im().h}
                        borderRadius={im().r}
                        src={im().src || undefined}
                        textureOptions={COVER}
                      />
                    )
                  }}
                </For>
              </view>
              <view width={laneW()} height={clipH()}>
                <For each={factTexts.keys()}>
                  {(k) => {
                    const tx = () => factTexts.at(k)
                    return (
                      <text letterSpacing={sp()} x={tx().x} y={tx().y + 1.5} fontFamily={tx().font} fontSize={tx().size} lineHeight={tx().lh} color={tx().color}>
                        {tx().text}
                      </text>
                    )
                  }}
                </For>
              </view>
              <view
                alpha={factFocus() ? 1 : 0}
                width={1142}
                height={factFocus() ? factFocus().h : 0}
                borderRadius={10}
                color="#00000001"
                border={{ width: 1, color: hex('#ffffffff') }}
              />
            </Show>
          </view>
        </view>
      </view>
    </view>
  )
}
