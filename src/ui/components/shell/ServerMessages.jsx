import $L from '../../../services/i18n.js'
import { Index, Show, createMemo, createSignal, onMount } from 'solid-js'
import CoreDialog from './CoreDialog.jsx'
import QrLinkDialog from './QrLinkDialog.jsx'
import { coreFrame, dp } from './coreFrame.js'
import { layoutBlocks, roboto, robotoShift, wrapText } from './MessageMarkdown.js'
import { theme, rgba } from '../../theme.js'
import { hex } from '../../color.js'
import { alphaHex } from '../../themeColor.js'
import { cssShift, fontFor, textReady, textWidth, themeSpacing, uiFont } from '../../text.js'
import { MESSAGE_COLORS, hasAction, stripMarkdown } from '../../../services/serverMessages.js'
import { parseMarkdown } from '../../../utils/markdown.js'
import { localeDate } from '../../../utils/dateFormat.js'
import { uiLocale } from '../../../utils/uiLocale.js'
import { getMessages, isRead, markAllRead, markRead } from '../../../state/shell/messages.js'
import { shell } from '../../../state/shell/shellState.js'

// The messages the server admin wrote, as cards in a wide CoreDialog. A card opens in place on
// Enter, which counts as reading it, and an opened message's action sits under it and shows its
// link as a QR code. Mark all as read sits under the list. The cards, text and buttons take the
// dialog panel's theme colors; a message's own color stays the admin's pick. It takes focus as it mounts and keeps every key. Back closes
// the QR code, then calls onClose().
const LIST_PAD_X = dp(16)
const LIST_PAD_Y = dp(4)
const CARD_PAD = dp(14)
const GAP = dp(8)
const ICON = dp(22)
const TEXT_IN = ICON + dp(12)
const TITLE = dp(15)
const DATE = dp(11)
const BODY = dp(13)
const BTN = dp(13)
const BTN_H = BTN * 1.17 + 2 * dp(8)
const NONE = '#00000000'

const formatWhen = (iso) => {
  const date = new Date(iso)
  return `${localeDate(date, { year: 'numeric', month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(uiLocale(), { hour: 'numeric', minute: '2-digit' })}`
}

export default function ServerMessages(props) {
  const [cur, setCur] = createSignal(0)
  const [expanded, setExpanded] = createSignal('')
  const [version, setVersion] = createSignal(0)
  const [fontsIn, setFontsIn] = createSignal(false)
  const [scroll, setScroll] = createSignal(0)
  const [qr, setQr] = createSignal(null)
  let root
  onMount(() => {
    textReady().then(() => setFontsIn(true))
    root.setFocus()
  })
  const title = $L('Messages')
  const allText = $L('Mark all as read')
  const t = () => theme()
  const bump = () => setVersion(version() + 1)
  // The panel's text is Roboto on every theme, its buttons take the theme's face and spacing.
  const btn = createMemo(() => {
    const font = uiFont('bold')
    return { font, spacing: themeSpacing(), y: dp(8) + cssShift(BTN, font) }
  })
  // What the remote moves through, top to bottom: each card, an opened card's action, and Mark
  // all as read.
  const order = createMemo(() => {
    version()
    const open = expanded()
    const out = []
    getMessages().forEach((m, i) => {
      out.push({ id: m.id, card: i })
      if (open.indexOf(`,${m.id},`) >= 0 && hasAction(m)) out.push({ id: m.id, card: i, action: true })
    })
    if (out.length && shell.unread > 0) out.push({ id: 'all', footer: true })
    return out
  })
  const focusCard = () => {
    const target = order()[cur()]
    return !qr() && target && target.card != null ? target.card : -1
  }
  // Each message's wrapping, date and markdown, kept until the fonts or theme change. A focus move
  // only switches a card between two widths, so it shouldn't measure or parse anything again.
  const measures = createMemo(() => {
    fontsIn()
    t()
    return new WeakMap()
  })
  const measured = (m, key, fn) => {
    const all = measures()
    let mine = all.get(m)
    if (!mine) all.set(m, (mine = {}))
    if (!(key in mine)) mine[key] = fn()
    return mine[key]
  }
  // Every card and what it holds, laid out for the focus: a focused card's border is 2dp to the
  // others' 1dp, which moves everything under it down.
  const laid = createMemo(() => {
    fontsIn()
    version()
    const open = expanded()
    const unread = shell.unread
    const focused = focusCard()
    const th = t()
    const list = getMessages()
    const frame = coreFrame({ title, wide: true, bodyH: 0 })
    const cardW = frame.bodyW - 2 * LIST_PAD_X
    const targets = []
    const cards = []
    const md = { texts: [], rects: [] }
    const actions = []
    let y = LIST_PAD_Y
    list.forEach((m, i) => {
      const color = MESSAGE_COLORS[m.color] || MESSAGE_COLORS.white
      const isOpen = open.indexOf(`,${m.id},`) >= 0
      const action = isOpen && hasAction(m)
      const b = focused === i ? 3 : 1
      const textX = b + CARD_PAD + TEXT_IN
      const textW = cardW - 2 * b - 2 * CARD_PAD - TEXT_IN
      const read = isRead(m.id)
      const cardTitle = m.title || $L('Messages')
      const titleW = textW - (read ? 0 : 2 * dp(8))
      const titleLines = measured(m, `title|${titleW}`, () => wrapText(cardTitle, TITLE, 'bold', titleW).length)
      let cy = b + CARD_PAD
      const titleY = cy
      cy += titleLines * TITLE * 1.17
      const date = m.createdUtc ? measured(m, 'date', () => formatWhen(m.createdUtc)) : ''
      const dateY = cy + dp(2)
      if (date) cy = dateY + DATE * 1.17
      let preview = ''
      const previewY = cy + dp(6)
      if (m.body && !isOpen) {
        preview = measured(m, 'preview', () => stripMarkdown(m.body))
        cy = previewY + Math.min(2, measured(m, `preview|${textW}`, () => wrapText(preview, BODY, 'regular', textW).length)) * BODY * 1.35
      } else if (m.body) {
        const body = measured(m, `body|${textW}`, () => layoutBlocks(parseMarkdown(m.body), textW, th, t().accent))
        body.texts.forEach((x) => md.texts.push({ ...x, x: x.x + LIST_PAD_X + textX, y: x.y + y + previewY }))
        body.rects.forEach((x) => md.rects.push({ ...x, x: x.x + LIST_PAD_X + textX, y: x.y + y + previewY }))
        cy = previewY + body.h
      }
      targets.push({ top: y, bottom: y + cy + CARD_PAD + b })
      if (action) {
        const label = m.actionLabel
        const w = textWidth(label, BTN, 'bold') + 2 * dp(14)
        cy += dp(10)
        actions.push({ label, x: LIST_PAD_X + b + CARD_PAD + dp(34), y: y + cy, w, ti: targets.length, font: fontFor(label, 'bold') })
        targets.push({ top: y + cy, bottom: y + cy + BTN_H })
        cy += BTN_H
      }
      const h = cy + CARD_PAD + b
      cards.push({
        x: LIST_PAD_X,
        y,
        w: cardW,
        h,
        color,
        ring: rgba(color, 0.35),
        unread: !read,
        iconX: b + CARD_PAD,
        textX,
        textW,
        title: cardTitle,
        titleFont: roboto('bold', cardTitle),
        titleY: titleY + robotoShift(TITLE),
        titleW,
        dotX: textX + textW - dp(8),
        dotY: titleY + (titleLines * TITLE * 1.17 - dp(8)) / 2,
        date,
        dateY: dateY + robotoShift(DATE),
        preview,
        previewFont: roboto('regular', preview),
        previewY: previewY + robotoShift(BODY),
      })
      y += h + GAP
    })
    const listH = list.length ? y + LIST_PAD_Y : 0
    const footer = list.length > 0 && unread > 0
    const emptyH = dp(12) + dp(14) * 1.17 + dp(20)
    const allW = textWidth(allText, BTN, 'bold') + 2 * dp(14)
    return { cards, md, actions, targets, listH, footer, footerH: footer ? dp(8) + BTN_H : 0, emptyH, allW }
  })
  const bodyH = () => (laid().cards.length ? laid().listH + laid().footerH : laid().emptyH)
  const frame = createMemo(() => coreFrame({ title, wide: true, bodyH: bodyH() }))
  // The list scrolls under a fixed footer.
  const listViewH = () => frame().bodyH - laid().footerH
  const ring = () => laid().cards[focusCard()] || null

  // Keeps the focused card or button in the list's view, as the browser scrolls a focused node.
  const reveal = () => {
    const target = laid().targets[cur()]
    if (!target) return
    const view = listViewH()
    if (target.bottom - scroll() > view) setScroll(target.bottom - view)
    if (target.top < scroll()) setScroll(target.top)
  }
  const move = (step) => {
    const next = cur() + step
    if (qr() || next < 0 || next >= order().length) return true
    setCur(next)
    reveal()
    return true
  }
  const enter = () => {
    if (qr()) {
      setQr(null)
      return true
    }
    const target = order()[cur()]
    if (!target) return true
    if (target.footer) {
      // The button goes away with the last unread message.
      setCur(0)
      setScroll(0)
      markAllRead()
      bump()
    } else if (target.action) {
      const m = getMessages().find((x) => x.id === target.id)
      setQr({ title: m.actionLabel, url: m.actionUrl })
    } else {
      const key = `,${target.id},`
      const wasOpen = expanded().indexOf(key) >= 0
      setExpanded(wasOpen ? expanded().replace(key, ',') : `${expanded() || ','}${target.id},`)
      if (!wasOpen && !isRead(target.id)) markRead(target.id)
      bump()
      reveal()
    }
    return true
  }
  const pill = (on) => (on ? t().accent : t().accentA(0.16))
  const pillInk = (on) => (on ? t().onAccent : t().onSurface)
  // The card keeps the surface variant's own transparency, so Glass's stays see-through.
  const cardFill = () => {
    const sv = t().surfaceVariant
    return sv.slice(0, 7) + alphaHex((parseInt(sv.slice(7, 9) || 'ff', 16) / 255) * 0.95)
  }

  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onUp={() => move(-1)}
      onDown={() => move(1)}
      onEnter={enter}
      onBack={() => {
        if (qr()) setQr(null)
        else if (props.onClose) props.onClose()
        return true
      }}
      onKeyPress={() => true}
    >
      <CoreDialog title={title} wide bodyH={bodyH()} />
      <view x={frame().bodyX} y={frame().bodyY} width={frame().bodyW} height={listViewH()} clipping>
        <view y={-scroll()} width={frame().bodyW} height={laid().listH}>
          <view width={frame().bodyW} height={laid().listH}>
            <Index each={laid().cards}>
              {(c) => (
                <view
                  x={c().x}
                  y={c().y}
                  width={c().w}
                  height={c().h}
                  borderRadius={26.71}
                  color={cardFill()}
                  border={{ width: 1, color: hex(c().ring) }}
                >
                  <view x={c().iconX} y={c().iconX} width={36.73} height={36.73} src="icons/infoOutlineRounded.webp" color={c().color} />
                  <text
                    fontFamily={c().titleFont}
                    fontSize={25.044}
                    x={c().textX}
                    y={c().titleY}
                    lineHeight={29.301}
                    maxWidth={c().titleW}
                    color={t().onSurface}
                  >
                    {c().title}
                  </text>
                  <view
                    x={c().dotX}
                    y={c().dotY}
                    width={13.36}
                    height={13.36}
                    borderRadius={6.68}
                    color={c().color}
                    alpha={c().unread ? 1 : 0}
                  />
                  <text fontFamily={roboto()} fontSize={18.365} x={c().textX} y={c().dateY} lineHeight={21.487} color={t().os(0.5)}>
                    {c().date || ' '}
                  </text>
                  <text
                    fontFamily={c().previewFont}
                    fontSize={21.704}
                    x={c().textX}
                    y={c().previewY}
                    lineHeight={29.301}
                    maxWidth={c().textW}
                    maxLines={2}
                    color={t().os(0.75)}
                  >
                    {c().preview || ' '}
                  </text>
                </view>
              )}
            </Index>
          </view>
          <view
            x={ring() ? ring().x : 0}
            y={ring() ? ring().y : 0}
            width={ring() ? ring().w : 0}
            height={ring() ? ring().h : 0}
            borderRadius={26.71}
            color={NONE}
            border={{ width: 3, color: hex(ring() ? ring().color : NONE) }}
            alpha={ring() ? 1 : 0}
          />
          <view width={frame().bodyW} height={laid().listH}>
            <Index each={laid().md.rects}>
              {(r) => <view x={r().x} y={r().y} width={r().w} height={r().h} borderRadius={r().r} color={r().color} />}
            </Index>
          </view>
          <view width={frame().bodyW} height={laid().listH}>
            <Index each={laid().md.texts}>
              {(x) => (
                <text fontFamily={x().font} fontSize={x().size} x={x().x} y={x().y} lineHeight={x().lh} color={x().color}>
                  {x().t}
                </text>
              )}
            </Index>
          </view>
          <view width={frame().bodyW} height={laid().listH}>
            <Index each={laid().actions}>
              {(a) => (
                <view x={a().x} y={a().y} width={a().w} height={52.1} borderRadius={13.36} color={pill(a().ti === cur() && !qr())}>
                  <text
                    fontFamily={a().font}
                    fontSize={21.704}
                    x={23.37}
                    y={btn().y}
                    lineHeight={25.394}
                    letterSpacing={btn().spacing}
                    color={pillInk(a().ti === cur() && !qr())}
                  >
                    {a().label}
                  </text>
                </view>
              )}
            </Index>
          </view>
        </view>
      </view>
      <view x={frame().bodyX} y={frame().bodyY + listViewH()}>
        <Show when={laid().footer}>
          <view
            x={(frame().bodyW - laid().allW) / 2}
            y={13.36}
            width={laid().allW}
            height={52.1}
            borderRadius={13.36}
            color={pill(cur() === order().length - 1 && !qr())}
          >
            <text fontFamily={btn().font} fontSize={21.704} x={23.37} y={btn().y} lineHeight={25.394} letterSpacing={btn().spacing} color={pillInk(cur() === order().length - 1 && !qr())}>
              {allText}
            </text>
          </view>
        </Show>
      </view>
      <view x={frame().bodyX} y={frame().bodyY}>
        <Show when={!laid().cards.length}>
          <text fontFamily={roboto()} fontSize={23.374} x={40.07} y={22.03} lineHeight={27.348} color={t().os(0.6)}>
            {$L('No messages from your server yet')}
          </text>
        </Show>
      </view>
      <view>
        <Show when={qr()}>
          <QrLinkDialog title={qr().title} url={qr().url} />
        </Show>
      </view>
    </view>
  )
}
