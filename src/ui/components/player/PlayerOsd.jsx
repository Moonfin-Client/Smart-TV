import { For, createEffect, createMemo, createSignal, on } from 'solid-js'
import { fontFor, uiFont, textWidth } from '../../text.js'
import { theme, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { autocropLogoUrl } from '../../../utils/logoAutocrop.js'
import { keyed } from '../library/pageKit.js'
import TrickplayPreview from './TrickplayPreview.jsx'
import SubtitleFetchIndicator from './SubtitleFetchIndicator.jsx'
import { BAR, BTN, LIVE_BTN, bottomLayout, buttonXs, logoCrop, logoHeight, topLayout } from './osdLayout.js'

const ACTIVE = '#00a4dc'
const CLEAR = '#00000000'
const FADE = { duration: 300, easing: 'ease' }
const RING_FADE = { duration: 200, easing: 'ease' }
const THUMB_SHADOW = { color: shadowColor('#00000066'), x: 0, y: 2, blur: 8, spread: 0 }
const TIP_BORDER = { width: 1, color: hex('#ffffff73') }
const CHIP_BORDER = { width: 1, color: hex('#ffffff1a') }

// The player controls for video and Live TV: the 0.3 scrim, the top bar with the logo or titles (or the
// channel badge, name and program), the bottom bar with the time rows, the seek bar with its buffered part,
// thumb and chapter marks (or the program's timeline), and the button row with the focused button's tooltip.
// The holder passes plain models and hears onOsdKey(name, row) before each key (true takes it), onScrub(dir),
// onProgressEnter(), onOsdAction(action) and onOsdEdge(side). Focus is the 'progress' row or the 'bottom' row.
// A focus ring fades out on the old button while another fades in on the new one, so moving along the row
// only moves two nodes.
// Props: head ({ logo, name, line, live, badge, program }), slots ({ above: [3], below: [3] }), live (null or
// { episode, progress, start, end, window }), buttons ({ top, bottom } from osdButtons.js), marks ([{ key, x }]),
// shown, dim, progress, buffered, tp, pos, dur, step, seeking, fetching, and barColors ({ track, fill, thumb })
// in place of the theme's for the settings preview, which also sets held to draw the focused button without
// focus. The node has setRow(row), focusRow(row) and warmAt(ms).
export default function PlayerOsd(props) {
  const [row, setRow] = createSignal('bottom')
  const [cur, setCur] = createSignal(0)
  const [active, setActive] = createSignal(false)
  const [ringA, setRingA] = createSignal(0)
  const [ringB, setRingB] = createSignal(0)
  const [flip, setFlip] = createSignal(false)
  const [logoSrc, setLogoSrc] = createSignal('')
  const [logoAspect, setLogoAspect] = createSignal(0)
  const [crop, setCrop] = createSignal(null)
  const font = uiFont()
  const boldFont = uiFont('bold')
  let tpStrip

  const t = () => theme()
  const isLive = createMemo(() => !!(props.head && props.head.live))
  const list = createMemo(() => {
    const b = props.buttons || { top: [], bottom: [] }
    return b.top.concat(b.bottom)
  })
  const size = () => (isLive() ? LIVE_BTN : BTN)
  const top = createMemo(() => {
    const h = props.head || {}
    const logoH = logoHeight(logoAspect())
    const logo = !!h.logo && !!logoSrc()
    const line = h.line || ''
    const title = logo ? line : line || h.name || ''
    const secondary = !logo && line ? h.name || '' : ''
    const lay = topLayout({ logo, logoH, secondary: !!secondary, title, live: h.live, program: h.program })
    return {
      ...lay,
      logo,
      logoH,
      logoW: logoAspect() ? logoH * logoAspect() : 0,
      title,
      titleFont: fontFor(title, 'bold'),
      secondary,
      secondaryFont: fontFor(secondary),
      badge: h.badge || '',
      badgeW: h.badge ? textWidth(h.badge, 24, 'bold') + 30 : 0,
      channel: h.name || '',
      channelFont: fontFor(h.name || '', 'bold'),
      program: h.program || '',
      programFont: fontFor(h.program || ''),
    }
  })
  // The image inside the logo's box, cropped to its ink once autocrop has measured it.
  const logoImg = createMemo(() => {
    const tp = top()
    const c = crop()
    if (!c) return { x: 0, y: 0, w: tp.logoW, h: tp.logoH }
    const w = tp.logoW / c.across
    const h = tp.logoH / c.down
    return { x: -c.left * w, y: -c.top * h, w, h }
  })
  const lay = createMemo(() => {
    const s = props.slots || { above: [], below: [] }
    const live = props.live
    return bottomLayout({
      live: isLive(),
      above: s.above.some((x) => x !== ''),
      below: s.below.some((x) => x !== ''),
      buttons: list().length > 0,
      liveEpisode: !!(live && live.episode),
      liveWindow: !!(live && live.window),
      fetching: !!props.fetching,
    })
  })
  const slot = (where, i) => {
    const s = props.slots
    return (s && s[where] && s[where][i]) || ''
  }
  const btns = createMemo(() => {
    const b = props.buttons || { top: [], bottom: [] }
    const sz = size()
    const xs = buttonXs(b.top.length, b.bottom.length, sz)
    const icon = isLive() ? 36 : 42
    return list().map((btn, n) => ({
      key: btn.id,
      x: xs[n],
      src: `icons/${btn.icon}.webp`,
      ix: (sz - icon) / 2,
      is: icon,
      color: btn.color || (btn.active ? ACTIVE : '#ffffff'),
      alpha: btn.disabled ? 0.3 : 1,
      chip: isLive(),
    }))
  })
  const kept = keyed(btns, (b) => b.key)
  const focusBtn = () => ((active() || props.held) && row() === 'bottom' ? list()[cur()] || null : null)
  const tip = createMemo(() => {
    const b = focusBtn()
    const x = b ? (btns()[cur()] || {}).x + size() / 2 : 0
    const w = b ? textWidth(b.label, 18, 'bold') + 32 : 0
    return { on: !!b, label: (b && b.label) || ' ', x: x - w / 2, w }
  })
  const ring = createMemo(() =>
    isLive() ? { fill: '#00a4dc4d', border: { width: 1, color: hex(t().focus) } } : { fill: '#ffffff38', border: { width: 3, color: hex('#ffffff') } }
  )
  const ringAlpha = () => {
    const b = focusBtn()
    return b && b.disabled ? 0.3 : 1
  }
  const barFocused = () => active() && row() === 'progress'
  const thumbX = () => BAR.X + BAR.W * (props.progress || 0)
  const liveProgress = () => (props.live && props.live.progress) || 0
  const liveWindow = () => !!(props.live && props.live.window)

  const moveTo = (i) => {
    const x = (btns()[i] || {}).x || 0
    // Already there: the showing ring only needs to sit on the button, which a new model can move.
    if (i === cur()) {
      if (flip()) setRingB(x)
      else setRingA(x)
      return
    }
    const f = !flip()
    setFlip(f)
    if (f) setRingB(x)
    else setRingA(x)
    setCur(i)
  }
  // Focusing the button row lands on play and pause.
  const focusRow = (r) => {
    setRow(r)
    if (r === 'bottom') moveTo(Math.max(0, list().findIndex((b) => b.id === 'playPause')))
  }

  // Focus stays on the same button when the row changes around it.
  createEffect(
    on(
      list,
      (now, old) => {
        const id = old && old[cur()] && old[cur()].id
        let i = id ? now.findIndex((b) => b.id === id) : -1
        if (i < 0) i = Math.min(cur(), now.length - 1)
        const c = Math.max(0, i)
        setCur(c)
        const x = (btns()[c] || {}).x || 0
        if (flip()) setRingB(x)
        else setRingA(x)
      },
      { defer: true }
    )
  )
  createEffect(
    on(
      () => props.head,
      (h, old) => {
        const url = h && h.logo
        if (old && old.logo === url) return
        setLogoAspect(0)
        setCrop(null)
        setLogoSrc(url || '')
        if (!url) return
        // The raw logo shows at once and is swapped for its trimmed crop when autocrop has measured it.
        autocropLogoUrl(url).then((r) => {
          if (!props.head || props.head.logo !== url || !r) return
          const c = logoCrop(r)
          if (c && r.aspectRatio) {
            setCrop(c)
            setLogoAspect(r.aspectRatio)
          }
        })
      }
    )
  )

  const key = (name) => !!(props.onOsdKey && props.onOsdKey(name, row()))

  return (
    <view
      ref={(n) => {
        n.setRow = setRow
        n.focusRow = focusRow
        n.warmAt = (ms) => tpStrip && tpStrip.warmAt(ms)
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      transition={{ alpha: FADE }}
      alpha={props.shown ? props.dim || 1 : 0}
      onFocusChanged={setActive}
      onUp={() => {
        if (key('up')) return true
        if (row() === 'bottom') {
          if (!isLive()) setRow('progress')
        } else focusRow('bottom')
        return true
      }}
      onDown={() => {
        if (key('down')) return true
        if (row() === 'progress' && list().length) focusRow('bottom')
        return true
      }}
      onLeft={() => {
        if (key('left')) return true
        if (row() === 'progress') props.onScrub(-1)
        else if (cur() > 0) moveTo(cur() - 1)
        return true
      }}
      onRight={() => {
        if (key('right')) return true
        if (row() === 'progress') props.onScrub(1)
        else if (cur() < list().length - 1) moveTo(cur() + 1)
        else if (props.onOsdEdge) props.onOsdEdge('right')
        return true
      }}
      onEnter={() => {
        if (key('enter')) return true
        if (row() === 'progress') props.onProgressEnter()
        else {
          const b = list()[cur()]
          if (b && !b.disabled) props.onOsdAction(b.action)
        }
        return true
      }}
    >
      <view width={1920} height={1080} color="#0000004d" />
      <TrickplayPreview
        cover
        tp={props.tp}
        pos={props.pos}
        dur={props.dur}
        step={props.step}
        visible={props.seeking}
        warm={props.shown}
        barY={lay().barY}
      />

      <view width={1920} height={top().height} colorTop="#000000de" colorBottom="#00000000" />
      <view alpha={top().logo ? 1 : 0} x={24} y={12} width={top().logoW} height={top().logoH} clipping>
        <view src={logoSrc()} x={logoImg().x} y={logoImg().y} width={logoImg().w} height={logoImg().h} />
      </view>
      <view
        alpha={props.head && props.head.logo && !logoAspect() ? 0.001 : 0}
        width={1}
        height={1}
        src={logoSrc()}
        onEvent={{
          loaded: (_n, e) => {
            const d = e && e.dimensions
            if (!logoAspect() && d && d.w && d.h) setLogoAspect(d.w / d.h)
          },
          failed: () => setLogoSrc(''),
        }}
      />
      <text
        alpha={!isLive() && top().secondary ? 1 : 0}
        fontFamily={top().secondaryFont}
        fontSize={21}
        lineHeight={33}
        x={24}
        y={(top().secondaryY || 0) + 2}
        maxWidth={1310.4}
        maxLines={1}
        color="#ffffffb3"
      >
        {top().secondary || ' '}
      </text>
      <text
        alpha={!isLive() && top().title ? 1 : 0}
        fontFamily={top().titleFont}
        fontSize={27}
        lineHeight={32.4}
        x={24}
        y={(top().titleY || 0) + 2.5}
        maxWidth={1310.4}
        maxLines={1}
        color="#ffffffff"
      >
        {top().title || ' '}
      </text>
      <view alpha={isLive() && top().badge ? 1 : 0} x={24} y={top().badgeY || 0} width={top().badgeW || 1} height={45} borderRadius={6} color="#00a4dcff">
        <text fontFamily={boldFont} fontSize={24} lineHeight={33} x={15} y={8} color="#ffffffff">
          {top().badge || ' '}
        </text>
      </view>
      <text
        alpha={isLive() ? 1 : 0}
        fontFamily={top().channelFont}
        fontSize={27}
        lineHeight={33}
        x={top().badge ? 42 + top().badgeW : 24}
        y={(top().nameY || 0) + 2.5}
        maxWidth={1250}
        maxLines={1}
        color="#ffffffff"
      >
        {top().channel || ' '}
      </text>
      <text
        alpha={isLive() && top().program ? 1 : 0}
        fontFamily={top().programFont}
        fontSize={21}
        lineHeight={33}
        x={top().badge ? 42 + top().badgeW : 24}
        y={(top().programY || 0) + 2}
        maxWidth={1250}
        maxLines={1}
        color="#ffffffb3"
      >
        {top().program || ' '}
      </text>

      <view y={lay().top} width={1920} height={1080 - lay().top} colorTop="#00000000" colorBottom="#000000de" />
      <SubtitleFetchIndicator x={24} y={lay().fetchY || 0} show={!!props.fetching} />

      <view alpha={isLive() ? 0 : 1} width={1920} height={1080}>
        <text alpha={slot('above', 0) ? 1 : 0} fontFamily={boldFont} fontSize={18} lineHeight={33} x={48} y={(lay().aboveY || 0) + 1.5} maxWidth={608} maxLines={1} color="#ffffffb3">
          {slot('above', 0) || ' '}
        </text>
        <text
          alpha={slot('above', 1) ? 1 : 0}
          fontFamily={boldFont}
          fontSize={18}
          lineHeight={33}
          x={656}
          y={(lay().aboveY || 0) + 1.5}
          maxWidth={608}
          contain="width"
          textAlign="center"
          maxLines={1}
          color="#ffffffb3"
        >
          {slot('above', 1) || ' '}
        </text>
        <text
          alpha={slot('above', 2) ? 1 : 0}
          fontFamily={boldFont}
          fontSize={18}
          lineHeight={33}
          x={1264}
          y={(lay().aboveY || 0) + 1.5}
          maxWidth={608}
          contain="width"
          textAlign="right"
          maxLines={1}
          color="#ffffffb3"
        >
          {slot('above', 2) || ' '}
        </text>
        <view x={24} y={lay().barY} width={1872} height={6} borderRadius={3} color={props.barColors ? props.barColors.track : t().rangeTrack}>
          <view height={6} borderRadius={3} width={1872 * (props.buffered || 0)} color={t().rangeTrack.slice(0, 7) + 'cc'} />
          <view height={6} borderRadius={3} width={1872 * (props.progress || 0)} color={props.barColors ? props.barColors.fill : t().rangeProgress} />
        </view>
        <view x={thumbX()} y={lay().barY + 3} width={21} height={21} mountX={0.5} mountY={0.5} scale={barFocused() ? 1.3 : 1}>
          <view width={21} height={21} borderRadius={10.5} color={CLEAR} shadow={THUMB_SHADOW} />
          <view width={21} height={21} borderRadius={10.5} color={barFocused() ? '#ffffffff' : props.barColors ? props.barColors.thumb : t().rangeThumb} />
        </view>
        <view y={lay().barY - 4.25} width={1920} height={15}>
          <For each={props.marks || []}>{(m) => <view x={22.5 + m.x} width={3} height={14.5} color="#ffffffe6" />}</For>
        </view>
        <text alpha={slot('below', 0) ? 1 : 0} fontFamily={font} fontSize={18} lineHeight={33} x={48} y={(lay().belowY || 0) + 1.5} maxWidth={608} maxLines={1} color="#ffffffb3">
          {slot('below', 0) || ' '}
        </text>
        <text
          alpha={slot('below', 1) ? 1 : 0}
          fontFamily={font}
          fontSize={18}
          lineHeight={33}
          x={656}
          y={(lay().belowY || 0) + 1.5}
          maxWidth={608}
          contain="width"
          textAlign="center"
          maxLines={1}
          color="#ffffffb3"
        >
          {slot('below', 1) || ' '}
        </text>
        <text
          alpha={slot('below', 2) ? 1 : 0}
          fontFamily={font}
          fontSize={18}
          lineHeight={33}
          x={1264}
          y={(lay().belowY || 0) + 1.5}
          maxWidth={608}
          contain="width"
          textAlign="right"
          maxLines={1}
          color="#ffffffb3"
        >
          {slot('below', 2) || ' '}
        </text>
      </view>

      <view alpha={isLive() && props.live ? 1 : 0} width={1920} height={1080}>
        <text
          alpha={props.live && props.live.episode ? 1 : 0}
          fontFamily={font}
          fontSize={21}
          lineHeight={33}
          x={24}
          y={(lay().episodeY || 0) + 2}
          maxWidth={1872}
          maxLines={1}
          color="#ffffffb3"
        >
          {(props.live && props.live.episode) || ' '}
        </text>
        <view alpha={props.live && !liveWindow() ? 1 : 0} x={24} y={lay().barY} width={1872} height={4} borderRadius={3} color="#ffffff3d" clipping>
          <view height={4} width={1872 * liveProgress()} color={t().accent} />
        </view>
        <view alpha={liveWindow() ? 1 : 0} x={24} y={lay().barY} width={1872} height={6} borderRadius={3} color={t().rangeTrack}>
          <view height={6} borderRadius={3} width={1872 * liveProgress()} color={t().rangeProgress} />
        </view>
        <view
          alpha={liveWindow() ? 1 : 0}
          x={24 + 1872 * liveProgress()}
          y={lay().barY + 3}
          width={21}
          height={21}
          mountX={0.5}
          mountY={0.5}
          borderRadius={10.5}
          scale={barFocused() ? 1.3 : 1}
          color={barFocused() ? '#ffffffff' : t().rangeThumb}
        />
        <text fontFamily={font} fontSize={18} lineHeight={33} x={24} y={(lay().labelsY || 0) + 1.5} color="#ffffff8a">
          {(props.live && props.live.start) || ' '}
        </text>
        <text fontFamily={font} fontSize={18} lineHeight={33} x={1896} y={(lay().labelsY || 0) + 1.5} mountX={1} color="#ffffff8a">
          {(props.live && props.live.end) || ' '}
        </text>
      </view>

      <view y={lay().btnY} width={1920} height={size()}>
        <view
          x={ringA()}
          width={size()}
          height={size()}
          borderRadius={size() / 2}
          color={ring().fill}
          border={ring().border}
          transition={{ alpha: RING_FADE }}
          alpha={focusBtn() && !flip() ? ringAlpha() : 0}
        />
        <view
          x={ringB()}
          width={size()}
          height={size()}
          borderRadius={size() / 2}
          color={ring().fill}
          border={ring().border}
          transition={{ alpha: RING_FADE }}
          alpha={focusBtn() && flip() ? ringAlpha() : 0}
        />
        <view width={1920} height={size()}>
          <For each={kept.keys()}>
            {(k) => {
              const b = kept.item(k)
              return (
                <view x={b().x} width={size()} height={size()} alpha={b().alpha}>
                  <view alpha={b().chip ? 1 : 0} width={size()} height={size()} borderRadius={size() / 2} color="#ffffff24" border={CHIP_BORDER} />
                  <view x={b().ix} y={b().ix} width={b().is} height={b().is} src={b().src} color={b().color} />
                </view>
              )
            }}
          </For>
        </view>
        <view alpha={tip().on ? 1 : 0} x={tip().x} y={-63} width={tip().w || 1} height={51} borderRadius={12} color="#000000c7" border={TIP_BORDER}>
          <text fontFamily={boldFont} fontSize={18} lineHeight={33} x={16} y={10.5} color="#ffffffff">
            {tip().label}
          </text>
        </view>
      </view>

      <TrickplayPreview
        ref={(n) => (tpStrip = n)}
        tp={props.tp}
        pos={props.pos}
        dur={props.dur}
        step={props.step}
        visible={props.seeking}
        warm={props.shown}
        barY={lay().barY}
      />
    </view>
  )
}
