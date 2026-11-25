import $L from '../../../services/i18n.js'
import { For, createEffect, createMemo, createSignal, on, onMount, untrack } from 'solid-js'
import PartyImage from '../party/PartyImage.jsx'
import { watchParty } from '../../../services/siloWatchParty.js'
import { joinGroup } from '../../../state/watchParty.js'
import { getImageUrl } from '../../../utils/helpers.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import { getStore } from '../../../state/store.js'
import * as settings from '../../../state/settings.js'
import { router } from '../../../app/router.js'
import { openSyncPlay } from '../../../pages/WatchParty/syncPlayNext.js'
import { cssShift, textReady, textWidth, uiFont, fontFor } from '../../text.js'

// The Watch Parties row on Home, laid out as a classic row: a card per party with its art, its kind
// and PIN chips and who's in it, then a dashed card to start one. Left and Right walk the cards
// without wrapping (Left from the first goes to the sidebar when there is one), Up and Down go to
// the rows. Enter joins the party, or starts one, and opens the Watch Parties dialog. Props as
// MediaRow's, the rooms in `row.rooms`.

const CARD_W = 384
const CARD_H = 216
const GAP = 24
// The start card's 3px dashed border sits outside its 384 by 216 box.
const START_W = 390
const START_H = 222
const RING = { width: 4, color: 0xffffffff }

const cardLine = (room) => {
  if (room.kind === 'syncplay') return `${room.hostName} · ${room.memberCount}`
  if (room.phase !== 'playing') return `${room.hostName} · ${$L('In the lobby')}`
  return `${room.hostName} · ${$L('{count} watching').replace('{count}', String(room.memberCount))}`
}

const dotColor = (room) => {
  if (room.kind === 'syncplay' || room.playbackState === 'paused') return '#c8c8c8ff'
  return room.phase === 'playing' ? '#3ecf8eff' : '#f5b942ff'
}

// The wide art first, then the poster, for what the party picked.
const artOf = (room) => {
  if (!room.selectedContentId) return []
  const types = room.contentType === 'Episode' ? ['Primary'] : ['Backdrop', 'Primary']
  return types.map((t) => getImageUrl(getServerUrl(), room.selectedContentId, t, { maxWidth: 480, quality: 80 }))
}

// The chips across the top: Watch Party or SyncPlay where both are listed, and PIN, 8px apart,
// each 14px in from its ends inside a 1px border.
const chipsOf = (room, labels) => {
  const out = []
  let x = 0
  const add = (k, text, party, lock) => {
    const w = 30 + (lock ? 23 : 0) + textWidth(text, 17, 'medium')
    out.push({
      k,
      x,
      w,
      text,
      lock,
      fill: party ? '#0b3a4cff' : '#2e2e2eff',
      ink: party ? '#8fdcf7ff' : '#e6e6e6ff',
      edge: { width: 1, color: party ? 0x1d6f8fff : 0x6a6a6aff },
    })
    x += w + 8
  }
  if (labels) add('kind', room.kind === 'syncplay' ? $L('SyncPlay') : $L('Watch Party'), room.kind !== 'syncplay', false)
  if (room.hasPin) add('pin', $L('PIN'), false, true)
  return out
}

const s17 = cssShift(17)
const titleFont = uiFont('bold')
const chipFont = uiFont('medium')

export default function WatchPartyRow(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const [sizes, setSizes] = createSignal(0)
  let key = ''
  let busy = false
  const L = () => props.look
  const rooms = () => (props.row && props.row.rooms) || []
  const cards = createMemo(() => {
    sizes()
    const labels = !!(props.row && props.row.labels)
    return rooms().map((room, i) => {
      const line = cardLine(room)
      return {
        k: `${room.kind}-${room.roomId}`,
        x: i * (CARD_W + GAP),
        srcs: artOf(room),
        chips: chipsOf(room, labels),
        line,
        lineFont: fontFor(line, 'medium'),
        // The line starts right after the dot, with no gap.
        pillW: 12 + 11 + textWidth(line, 17, 'medium') + 12,
        dot: dotColor(room),
      }
    })
  })
  // Each chip flattened into one list, so they draw as one batch over every card's art.
  const chipList = createMemo(() => {
    const out = []
    cards().forEach((c) => c.chips.forEach((ch) => out.push({ ...ch, k: c.k + ':' + ch.k, x: c.x + 12 + ch.x })))
    return out
  })
  const startX = () => rooms().length * (CARD_W + GAP)
  const count = () => rooms().length + 1
  // The lane spans every card, since an unsized view scrolled past its parent counts as off screen.
  const spanW = () => startX() + START_W + 1920
  const ring = () => {
    const start = cur() >= rooms().length
    return { x: (start ? startX() : cur() * (CARD_W + GAP)) - 4, w: (start ? START_W : CARD_W) + 8, h: (start ? START_H : CARD_H) + 8 }
  }
  // Focus stays on the card it was on as parties come and go.
  createEffect(
    on(cards, (list) => {
      const at = key ? list.findIndex((c) => c.k === key) : -1
      if (at >= 0) setCur(at)
      else if (key === 'start' || untrack(cur) >= list.length + 1) setCur(list.length)
    }),
  )
  // The chips and pills are sized from measured text, which waits on the faces.
  onMount(() => textReady().then(() => setSizes(sizes() + 1)))

  // A card past either edge scrolls in with 50px to spare.
  const move = (to) => {
    if (to < 0 || to >= count()) return
    key = to < rooms().length ? cards()[to].k : 'start'
    setCur(to)
    const start = to >= rooms().length
    const left = L().clipX + L().pad + (start ? startX() : to * (CARD_W + GAP)) - scroll()
    const right = left + (start ? START_W : CARD_W)
    if (left < L().clipX) setScroll(scroll() - (L().clipX - left + 50))
    else if (right > 1920) setScroll(scroll() + right - 1920 + 50)
  }
  const join = async (room) => {
    if (busy) return
    if (room.kind === 'syncplay') {
      busy = true
      const ok = await joinGroup(room.roomId)
      busy = false
      if (ok) openSyncPlay(router)
      return
    }
    watchParty.joinRoom(room)
    router.to('/party')
  }
  // With Jellyfin's SyncPlay as the party service, Start opens the SyncPlay dialog instead.
  const start = () => {
    if (getStore().serverType === 'jellyfin' && settings.get('watchPartyService') === 'syncplay') return openSyncPlay(router)
    watchParty.create()
    router.to('/party')
  }

  return (
    <view
      ref={(n) => {
        n.focusIndex = () => {}
        n.cur = cur
        if (props.ref) props.ref(n)
      }}
      y={props.y || 0}
      width={1920}
      height={props.box.h}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) key = cur() < rooms().length ? cards()[cur()].k : 'start'
      }}
      onLeft={() => {
        if (cur() > 0) move(cur() - 1)
        else if (props.leftNav) return false
        return true
      }}
      onRight={() => {
        move(cur() + 1)
        return true
      }}
      onEnter={() => {
        const room = rooms()[cur()]
        if (room) join(room)
        else start()
        return true
      }}
    >
      <text x={L().inset} y={props.box.titleY + cssShift(28)} fontFamily={titleFont} fontSize={28} lineHeight={33} color={L().onSurface}>
        {props.row.title || ''}
      </text>
      <view x={L().clipX} y={props.box.scrollerY} width={L().viewW} height={262} clipping>
        <view y={20} x={L().pad - scroll()} width={spanW()} height={230}>
          <view width={spanW()} height={230}>
            <For each={cards()}>
              {(c) => (
                <view x={c.x} width={CARD_W} height={CARD_H}>
                  <view width={CARD_W} height={CARD_H} borderRadius={12} color="#222222ff" />
                  <PartyImage srcs={c.srcs} w={CARD_W} h={CARD_H} r={12} />
                  <view x={12} y={170} width={c.pillW} height={34} borderRadius={9} color="#101010d9">
                    <view x={12} y={11.5} width={11} height={11} borderRadius={5.5} color={c.dot} />
                    <text x={23} y={0.5 + s17} fontFamily={c.lineFont} fontSize={17} lineHeight={33} color="#ffffffff">
                      {c.line}
                    </text>
                  </view>
                </view>
              )}
            </For>
          </view>
          <view width={spanW()} height={230}>
            <For each={chipList()}>
              {(ch) => (
                <view x={ch.x} y={12} width={ch.w} height={34} borderRadius={17} color={ch.fill} border={ch.edge}>
                  <view alpha={ch.lock ? 1 : 0} x={15} y={8.5} width={17} height={17} src="party/lock.webp" color={ch.ink} />
                  <text x={ch.lock ? 38 : 15} y={0.5 + s17} fontFamily={chipFont} fontSize={17} lineHeight={33} color={ch.ink}>
                    {ch.text}
                  </text>
                </view>
              )}
            </For>
          </view>
          <view x={startX()} width={START_W} height={START_H}>
            <view width={START_W} height={START_H} src="images/party-start-dash.webp" color="#4a4a4aff" />
            <view x={173} y={67.5} width={44} height={44} src="party/plus.webp" color="#d6d6d6ff" />
            <text
              x={0}
              y={121.5 + cssShift(22)}
              fontFamily={chipFont}
              fontSize={22}
              lineHeight={33}
              maxWidth={START_W}
              contain="width"
              textAlign="center"
              color="#d6d6d6ff"
            >
              {$L('Start a watch party')}
            </text>
          </view>
          <view x={ring().x} y={-4} width={ring().w} height={ring().h} borderRadius={16} color="#00000000" border={RING} alpha={focused() ? 1 : 0} />
        </view>
      </view>
    </view>
  )
}
