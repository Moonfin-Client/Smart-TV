import { For, Index, Show, createMemo, createSelector, createSignal } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import Card from '../../../ui/components/Card.jsx'
import FileInfo from '../../../ui/components/details/FileInfo.jsx'
import Spinner from '../../../ui/components/Spinner.jsx'
import { byKey } from '../../../ui/components/details/keyed.js'
import { fontFor, uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { holdPress } from '../../../utils/longPress.js'
import { layoutModal } from './modalLayout.js'
import { nextCell } from './modalNav.js'

// The panel a Spotlight card opens: a header with the card's icon, title and any action, over a
// scroll box of the card's sections. Focus stays inside. Opening lands on the first section's first
// cell, a cell in a section's top row brings its heading into view 12px clear of the top, and any
// other cell is kept 20px clear of either edge. A list that pages in asks for more once the viewer
// is within a screenful of its end.
//
// Props: `tokens`. Its node has open(card, state), update(card, state) and close(), and it calls
// onModalAction(kind, data) and onModalClose().
const PANEL_Y = 81
const WINDOW = 500
const HEADING_CLEARANCE = 12
const CARD_CLEARANCE = 20
const KINDS = ['card', 'person', 'studio', 'chapter', 'review', 'track', 'chips']
const NO_LAID = { rects: [], imgs: [], texts: [], cells: [], h: 0, fileInfo: null, spinner: null, first: -1 }
const GONE = {
  k: '', i: -1, kind: '', x: 0, y: 0, w: 0, h: 0, r: 0, color: '#00000000', bw: 0, bc: '#00000000', src: '', text: '', size: 20, font: 'roboto',
  lh: 33, maxw: 0, maxlines: 1, align: 'left', model: { type: 'poster' }, cardW: 0, cardH: 0, credit: '', creditY: 0, photo: '', name: '', role: '',
  nameLines: 1, logo: '', thumb: '', time: '', timeW: 0, initial: '', avatar: '', author: '', meta: '', preview: '', index: '', title: '', runtime: '', label: '',
}
// The Seerr facts box, the section toggles and the header action keep a white focus ring in every
// theme.
const WHITE = hex('#ffffffff')
const FADE = { duration: 150 }
const SCROLL = { y: { duration: 250, easing: 'ease-out' } }
const COVER = { resizeMode: { type: 'cover' } }
const CONTAIN = { resizeMode: { type: 'contain' } }

export default function SectionModal(props) {
  const [visible, setVisible] = createSignal(false)
  const [head, setHead] = createSignal({ title: '', titleFont: 'roboto', titleW: 0, icon: '', action: '', actionW: 0, headerH: 70 })
  const [laid, setLaid] = createSignal(NO_LAID)
  const [scroll, setScroll] = createSignal(0)
  const [cur, setCur] = createSignal(-1)
  const [onAction, setOnAction] = createSignal(false)
  const [info, setInfo] = createSignal(null)
  let root
  let fileinfo
  // Plain state that nothing needs to react to.
  const m = { expanded: {}, asked: false, card: null, state: null, contentH: 0 }
  const hold = holdPress()

  const t = () => props.tokens || { focus: '#00a4dcff', surfaceA: () => '#0e1117f5' }
  const panelColor = () => (t().surfaceA ? t().surfaceA(0.96) : '#0e1117f5')
  // The theme's colors for the panel's edge and the names and titles in it.
  const panelEdge = () => hex(t().os ? t().os(0.12) : '#ffffff1f')
  const ink = () => t().onBackground || '#ffffffff'
  const bold = () => uiFont('bold')
  const regular = () => uiFont('regular')
  const viewTop = () => PANEL_Y + 1 + head().headerH + 16
  const viewH = () => PANEL_Y + 920 - 1 - 24 - viewTop()
  // True while the panel itself holds focus, not the file details inside it. The signal is read
  // first, so the selector below tracks it even before the ref is set.
  const self = () => {
    const el = activeElement()
    return Boolean(root) && el === root
  }
  const focusIdx = () => (self() && !onAction() ? cur() : -1)
  const isFocus = createSelector(focusIdx)
  const headFocused = () => onAction() && self()

  const cellMap = createMemo(() => {
    const out = {}
    laid().cells.forEach((c) => (out[c.k] = c))
    return out
  })
  const at = (k) => cellMap()[k] || GONE
  // Each kind's cells near the scroll box, by key, so a scroll only adds and drops cells at the edges.
  const groups = createMemo(() => {
    const top = scroll() - WINDOW
    const bottom = scroll() + viewH() + WINDOW
    const g = {}
    KINDS.forEach((kind) => (g[kind] = []))
    laid().cells.forEach((c) => {
      if (g[c.kind] && c.y + c.h >= top && c.y <= bottom) g[c.kind].push(c.k)
    })
    return g
  })
  const rects = byKey(() => laid().rects, GONE)
  const imgs = byKey(() => laid().imgs, GONE)
  const texts = byKey(() => {
    const top = scroll() - WINDOW
    const bottom = scroll() + viewH() + WINDOW
    return laid().texts.filter((tx) => tx.y + 40 >= top && tx.y <= bottom)
  }, GONE)
  // The focus marks for the cells that draw no focus of their own.
  const focused = () => laid().cells[focusIdx()]
  const ring = () => {
    const c = focused()
    if (!c || ['person', 'studio', 'chapter', 'facts'].indexOf(c.kind) < 0) return { show: false, x: 0, y: 0, w: 0, h: 0, white: false }
    return { show: true, x: c.x, y: c.y, w: c.w, h: c.h, white: c.kind === 'facts' }
  }
  const trackMark = () => {
    const c = focused()
    return c && c.kind === 'track' ? { show: true, y: c.y } : { show: false, y: 0 }
  }
  const toggleMark = () => {
    const c = focused()
    return c && c.kind === 'toggle' ? { show: true, y: c.y } : { show: false, y: 0 }
  }

  const show = (card, state) => {
    m.card = card
    m.state = state
    const title = card.modalTitle || card.title || ''
    const action = card.headerAction ? card.headerAction.label : ''
    setHead({
      title,
      titleFont: fontFor(title, 'bold'),
      titleW: textWidth(title, 30, 'bold'),
      icon: card.icon || '',
      action,
      actionW: action ? 2 + 36 + textWidth(action, 17, 'bold') : 0,
      headerH: action ? 88 : 70,
    })
    const sr = state.seerr
    const tok = t()
    const next = layoutModal(card, m.expanded || {}, {
      serverUrl: state.serverUrl,
      seerr: { ...sr, streaming: sr.overlay.streamingProviders || [], mediaType: sr.overlay.mediaType },
      ink: tok.onBackground,
      os: tok.os,
    })
    setLaid(next)
    m.contentH = next.h
    setScroll(Math.min(scroll(), Math.max(0, next.h - viewH())))
    const tracks = state.tracks || { audio: 0, subtitle: -1 }
    setInfo(next.fileInfo ? { item: next.fileInfo.item, mediaSource: next.fileInfo.mediaSource, audio: tracks.audio, subtitle: tracks.subtitle, w: 1100, showTitle: false } : null)
  }
  const open = (card, state) => {
    m.expanded = {}
    m.asked = false
    setScroll(0)
    setCur(-1)
    setOnAction(false)
    show(card, state)
    setVisible(true)
    const l = laid()
    const first = l.first >= 0 ? l.first : head().action ? -1 : l.cells.length ? 0 : -1
    if (first < 0) setOnAction(Boolean(head().action))
    else moveTo(first)
  }
  const update = (card, state) => {
    if (!visible()) return
    const was = laid().cells[cur()]
    show(card, state)
    // The cell under the remote stays put as the lists grow around it.
    if (was) {
      const same = laid().cells.find((c) => c.k === was.k && c.kind === was.kind)
      if (same) setCur(same.i)
    }
  }
  const close = () => {
    setVisible(false)
    setInfo(null)
    m.card = null
  }

  const moveTo = (i) => {
    const c = laid().cells[i]
    if (!c) return
    setCur(i)
    setOnAction(false)
    if (c.kind === 'fileInfo') {
      if (fileinfo) fileinfo.setFocus()
      return
    }
    if (root) root.setFocus()
    // A Seerr credit sits under the card, outside the box that's kept in view.
    keepInView(c.y, c.credit ? c.h - 6 - 33 : c.h, c)
  }
  // A cell in its section's top row brings the section's heading into view too.
  const keepInView = (top, h, c) => {
    const vh = viewH()
    const max = Math.max(0, m.contentH - vh)
    let s = scroll()
    if (c && c.headingTop != null && c.y - c.gridTop <= 8) s = c.headingTop - HEADING_CLEARANCE
    else if (top < s + CARD_CLEARANCE) s = top - CARD_CLEARANCE
    else if (top + h > s + vh - CARD_CLEARANCE) s = top + h - vh + CARD_CLEARANCE
    setScroll(Math.max(0, Math.min(max, s)))
    if (!m.asked && scroll() >= m.contentH - vh * 2) {
      m.asked = true
      props.onModalAction('more')
      setTimeout(() => (m.asked = false), 500)
    }
  }
  // From the file details, which size themselves, so the scroll box learns their height from them.
  const onCellFocus = (r) => {
    const fi = laid().fileInfo
    const fileY = fi ? fi.y : 0
    if (fileinfo && fileinfo.contentHeight) m.contentH = Math.max(laid().h, fileY + fileinfo.contentHeight() + 24)
    keepInView(fileY + r.y, r.h, null)
  }
  const step = (dir) => {
    if (onAction()) {
      if (dir === 'down' && laid().cells.length) moveTo(0)
      return
    }
    const next = nextCell(laid().cells, cur(), dir)
    if (next >= 0) moveTo(next)
    else if (dir === 'up' && head().action) {
      setOnAction(true)
      if (root) root.setFocus()
    }
  }
  const activate = (c) => {
    if (c.kind === 'toggle') {
      m.expanded = { ...(m.expanded || {}), [c.key]: !c.open }
      show(m.card, m.state)
      const same = laid().cells.find((x) => x.k === c.k)
      if (same) setCur(same.i)
      return
    }
    if (c.kind === 'card') return props.onModalAction(c.seerr ? 'seerrItem' : 'item', c.item)
    if (c.kind === 'person') return props.onModalAction('person', c.item)
    if (c.kind === 'studio') return props.onModalAction('studio', c.name)
    if (c.kind === 'chapter') return props.onModalAction('chapter', c.ticks)
    if (c.kind === 'review') return props.onModalAction('review', c.review)
    if (c.kind === 'track') return props.onModalAction('track', { item: c.item, list: c.list, opens: c.opens })
    if (c.kind === 'chips') return props.onModalAction('seerrPiece', { kind: 'chips' })
    return undefined
  }

  return (
    <view
      ref={(n) => {
        root = n
        n.open = open
        n.update = update
        n.close = close
        if (props.ref) props.ref(n)
      }}
      alpha={visible() ? 1 : 0}
      width={1920}
      height={1080}
      forwardFocus={() => {
        const c = laid().cells[cur()]
        if (onAction() || !c || c.kind !== 'fileInfo' || !fileinfo) return false
        fileinfo.setFocus()
        return true
      }}
      onFocusChanged={(has) => {
        if (has) return
        // A hold that opened a menu ends there, and its release goes to the menu.
        hold.cancel()
      }}
      onUp={() => {
        step('up')
        return true
      }}
      onDown={() => {
        step('down')
        return true
      }}
      onLeft={() => {
        if (!onAction()) step('left')
        return true
      }}
      onRight={() => {
        if (!onAction()) step('right')
        return true
      }}
      onEnter={() => {
        // A card or track that has a menu opens it when held, and acts on release otherwise.
        if (onAction()) {
          props.onModalAction('sort')
          return true
        }
        const c = laid().cells[cur()]
        if (!c) return true
        if ((c.kind !== 'card' || c.seerr) && c.kind !== 'track') {
          activate(c)
          return true
        }
        hold.start(c, () => {
          props.onModalAction('hold', { kind: c.kind === 'card' ? 'card' : 'track', item: c.item })
        })
        return true
      }}
      onMenu={() => {
        const c = !onAction() && laid().cells[cur()]
        if (!c || ((c.kind !== 'card' || c.seerr) && c.kind !== 'track')) return false
        props.onModalAction('hold', { kind: c.kind === 'card' ? 'card' : 'track', item: c.item })
        return true
      }}
      onEnterRelease={() => {
        return hold.end((c) => activate(c))
      }}
      onBack={() => {
        close()
        props.onModalClose()
        return true
      }}
    >
      <view width={1920} height={1080} color="#0000008a" />
      <view x={173} y={81} width={1576} height={920} borderRadius={20} color={panelColor()} border={{ width: 1, color: panelEdge() }} />
      <view x={198} y={102 + (head().headerH - 37 - 30) / 2} width={30} height={30} src={head().icon || undefined} color="#ffffffcc" />
      <text
        x={240}
        y={102 + (head().headerH - 37 - 33) / 2 + 3}
        fontFamily={head().titleFont}
        fontSize={30}
        lineHeight={33}
        maxWidth={1460}
        maxLines={1}
        color={ink()}
      >
        {head().title}
      </text>
      <view alpha={head().action ? 1 : 0} x={252 + head().titleW} y={102} width={head().actionW} height={51}>
        <view width={head().actionW} height={51} borderRadius={25.5} color={headFocused() ? '#ffffff29' : '#ffffff14'} />
        <view alpha={headFocused() ? 1 : 0} width={head().actionW} height={51} borderRadius={25.5} color="#00000001" border={{ width: 1, color: WHITE }} />
        <text x={19} y={10.5} fontFamily={bold()} fontSize={17} lineHeight={33} color="#ffffffff">
          {head().action}
        </text>
      </view>
      <view x={174} y={82 + head().headerH - 1} width={1574} height={1} color="#ffffff14" />

      <view x={198} y={viewTop()} width={1526} height={viewH()} clipping>
        <view transition={SCROLL} y={-scroll()} width={1526} height={Math.max(viewH(), laid().h)}>
          <view>
            <For each={rects.keys()}>
              {(k) => (
                <view
                  x={rects.at(k).x}
                  y={rects.at(k).y}
                  width={rects.at(k).w}
                  height={rects.at(k).h}
                  borderRadius={rects.at(k).r}
                  color={rects.at(k).color}
                  border={rects.at(k).bw ? { width: rects.at(k).bw, color: hex(rects.at(k).bc) } : undefined}
                />
              )}
            </For>
          </view>
          <view
            alpha={toggleMark().show ? 1 : 0}
            x={-10}
            y={toggleMark().y}
            width={1536}
            height={47}
            borderRadius={8}
            color="#ffffff1a"
            border={{ width: 1, color: WHITE }}
          />
          <view alpha={trackMark().show ? 1 : 0} y={trackMark().y} width={1526} height={88} borderRadius={8} color="#fffffff2" border={{ width: 1, color: hex(t().focus) }} />
          <view>
            <For each={imgs.keys()}>
              {(k) => (
                <view
                  x={imgs.at(k).x}
                  y={imgs.at(k).y}
                  width={imgs.at(k).w}
                  height={imgs.at(k).h}
                  src={imgs.at(k).src || undefined}
                  color={imgs.at(k).color}
                  borderRadius={imgs.at(k).r}
                  textureOptions={COVER}
                />
              )}
            </For>
          </view>

          <view>
            <For each={groups().card}>
              {(k) => (
                <view x={at(k).x} y={at(k).y}>
                  <Card
                    card={at(k).model}
                    w={at(k).cardW}
                    h={at(k).cardH}
                    focused={isFocus(at(k).i)}
                    look="media"
                    cardType={at(k).cardType}
                    seerrSeason={at(k).marker || null}
                  />
                  <text y={at(k).creditY + 2.5} fontFamily={regular()} fontSize={18} lineHeight={33} maxWidth={at(k).cardW || 1} maxLines={1} color="#ffffff99">
                    {at(k).credit}
                  </text>
                </view>
              )}
            </For>
          </view>
          <view>
            <For each={groups().person}>
              {(k) => (
                <view x={at(k).x} y={at(k).y} width={198} height={at(k).h}>
                  <view x={19} y={9} width={160} height={160} borderRadius={80} color="#ffffff14" />
                  <view alpha={at(k).photo ? 0 : 0.35} x={75} y={65} width={48} height={48} src="icons/d/group.webp" color="#ffffffff" />
                  <view alpha={at(k).photo ? 1 : 0} x={19} y={9} width={160} height={160} borderRadius={80} src={at(k).photo || undefined} textureOptions={COVER} />
                  <Centered text={at(k).name} size={20} w={180} cx={99} y={181} color={ink()} />
                  <Centered text={at(k).role} size={17} w={180} cx={99} y={179 + at(k).nameLines * 33 + 10 + 1.5} color="#ffffff99" />
                </view>
              )}
            </For>
          </view>
          <view>
            <For each={groups().studio}>
              {(k) => (
                <view x={at(k).x} y={at(k).y} width={266} height={at(k).h}>
                  <view y={(at(k).h - 2 - 24 - 90 - 12 - at(k).nameLines * 33) / 2}>
                    <view alpha={at(k).logo ? 1 : 0} x={13} y={13} width={240} height={90} src={at(k).logo || undefined} textureOptions={CONTAIN} />
                    <view alpha={at(k).logo ? 0 : 0.35} x={109} y={34} width={48} height={48} src="icons/d/series.webp" color="#ffffffff" />
                    <Centered text={at(k).name} size={19} w={240} cx={133} y={117.5} color={ink()} />
                  </view>
                </view>
              )}
            </For>
          </view>
          <view>
            <For each={groups().chapter}>
              {(k) => (
                <view x={at(k).x} y={at(k).y} width={314} height={at(k).h}>
                  <view x={7} y={7} width={300} height={158} borderRadius={6} color="#ffffff14" />
                  <view alpha={at(k).thumb ? 1 : 0} x={7} y={7} width={300} height={158} borderRadius={6} src={at(k).thumb || undefined} textureOptions={COVER} />
                  <view x={7 + 300 - 6 - at(k).timeW} y={130} width={at(k).timeW} height={37} borderRadius={4} color="#000000bf">
                    <text x={6} y={3.5} fontFamily={regular()} fontSize={16} lineHeight={33} color="#ffffffff">
                      {at(k).time}
                    </text>
                  </view>
                  <text x={7} y={175.5} fontFamily={fontFor(at(k).name)} fontSize={19} lineHeight={33} maxWidth={300} maxLines={1} color={ink()}>
                    {at(k).name}
                  </text>
                </view>
              )}
            </For>
          </view>
          <view>
            {/* With a date the author block (two 33px lines) outgrows the avatar, which then centers beside it. */}
            <For each={groups().review}>
              {(k) => (
                <view x={at(k).x} y={at(k).y} width={520} height={250}>
                  <view width={520} height={250} borderRadius={16} color={isFocus(at(k).i) ? '#34343cd1' : '#24242ab8'} />
                  <view width={520} height={250} borderRadius={16} color="#00000001" border={{ width: 3, color: hex(t().focus) }} alpha={isFocus(at(k).i) ? 1 : 0} />
                  <view x={27} y={at(k).meta ? 31 : 25} width={56} height={56} borderRadius={28} color="#ffffff29">
                    <text y={13.5} fontFamily={bold()} fontSize={26} lineHeight={34} maxWidth={56} textAlign="center" contain="width" color="#ffffffff">
                      {at(k).initial}
                    </text>
                    <view alpha={at(k).avatar ? 1 : 0} width={56} height={56} borderRadius={28} src={at(k).avatar || undefined} textureOptions={COVER} />
                  </view>
                  <text
                    x={99}
                    y={at(k).meta ? 27 : 39}
                    fontFamily={fontFor(at(k).author, 'bold')}
                    fontSize={24}
                    lineHeight={33}
                    maxWidth={394}
                    maxLines={1}
                    color="#ffffffff"
                  >
                    {at(k).author}
                  </text>
                  <text x={99} y={61.5} fontFamily={regular()} fontSize={18} lineHeight={33} color="#ffffffa8">
                    {at(k).meta}
                  </text>
                  <text x={27} y={at(k).meta ? 111 : 99} fontFamily={fontFor(at(k).preview)} fontSize={20} lineHeight={28} maxWidth={466} maxLines={4} color="#ffffffd1">
                    {at(k).preview}
                  </text>
                </view>
              )}
            </For>
          </view>
          <view>
            <For each={groups().track}>
              {(k) => (
                <view y={at(k).y} width={1526} height={88}>
                  <text x={17} y={29.5} fontFamily={regular()} fontSize={20} lineHeight={33} maxWidth={52} textAlign="center" contain="width" color="#ffffff80">
                    {at(k).index}
                  </text>
                  <text x={89} y={13} fontFamily={fontFor(at(k).title)} fontSize={22} lineHeight={33} maxWidth={1400} maxLines={1} color={ink()}>
                    {at(k).title}
                  </text>
                  <text x={89} y={45.5} fontFamily={regular()} fontSize={18} lineHeight={33} color="#ffffff99">
                    {at(k).runtime}
                  </text>
                </view>
              )}
            </For>
          </view>
          <view>
            <For each={groups().chips}>
              {(k) => (
                <view x={at(k).x} y={at(k).y} width={at(k).w} height={53} pivot={0.5} transition={{ scale: FADE }} scale={isFocus(at(k).i) ? 1.05 : 1}>
                  <view width={at(k).w} height={53} borderRadius={26.5} color={isFocus(at(k).i) ? '#4b5563ff' : '#374151ff'} />
                  <text x={20} y={11.5} fontFamily={regular()} fontSize={14} lineHeight={33} color="#ffffffff">
                    {at(k).label}
                  </text>
                </view>
              )}
            </For>
          </view>
          <view
            alpha={ring().show ? 1 : 0}
            x={ring().x}
            y={ring().y}
            width={ring().w}
            height={ring().h}
            borderRadius={10}
            color="#00000001"
            border={{ width: 1, color: ring().white ? WHITE : hex(t().focus) }}
          />
          <view>
            <For each={texts.keys()}>
              {(k) => (
                <text
                  x={texts.at(k).x}
                  y={texts.at(k).y}
                  fontFamily={texts.at(k).font}
                  fontSize={texts.at(k).size}
                  color={texts.at(k).color}
                  lineHeight={texts.at(k).lh || undefined}
                  maxWidth={texts.at(k).maxw || 1526}
                  maxLines={texts.at(k).maxlines || 1}
                  textAlign={texts.at(k).align === 'center' ? 'center' : 'left'}
                  contain={texts.at(k).align === 'center' ? 'width' : 'none'}
                >
                  {texts.at(k).text}
                </text>
              )}
            </For>
          </view>
          <FileInfo
            ref={(n) => (fileinfo = n)}
            alpha={info() ? 1 : 0}
            y={laid().fileInfo ? laid().fileInfo.y : 0}
            info={info()}
            tokens={props.tokens}
            onCellFocus={onCellFocus}
            onCellsEdge={(dir) => dir === 'up' && step('up')}
          />
          <view>
            <Show when={laid().spinner}>
              <Spinner x={735} y={laid().spinner ? laid().spinner.y + 52 : 0} size={56} />
            </Show>
          </view>
        </view>
      </view>
    </view>
  )
}

// A centered name, wrapped line by line. A word wider than the cell runs past both edges, where the
// renderer's own wrap would break it.
function Centered(props) {
  const lines = createMemo(() => (props.text ? wrapLines(props.text, props.size, 'regular', props.w) : []))
  return (
    <view>
      <Index each={lines()}>
        {(line, i) => (
          <text x={props.cx} mountX={0.5} y={props.y + i * 33} fontFamily={fontFor(line())} fontSize={props.size} lineHeight={33} color={props.color}>
            {line()}
          </text>
        )}
      </Index>
    </view>
  )
}
