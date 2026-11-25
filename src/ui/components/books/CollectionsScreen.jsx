import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSelector, createSignal, onMount } from 'solid-js'
import { hex } from '../../color.js'
import { fontFor, uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { focusScroll } from '../nav/focusScroll.js'
import { api, getServerUrl } from '../../../services/jellyfinApi.js'
import { bookImageUrl, combinedTypes } from '../../../utils/bookLibrary.js'
import { cleanOverview } from '../../../utils/overviewText.js'
import { ScreenTitle } from './BookControls.jsx'
import { bookPointer, showsWhole } from './bookParts.js'
import { countLabel, gridMove, gridRows, rowIndexOf } from './bookGrid.js'
import { ellipsize } from './bookText.js'
import { loadBookCollections } from './bookLibraryData.js'
import { titlesCount } from './bookScreens.js'

const HEADER_H = 73.2
const CARD_H = 393
const ALL_COLLECTIONS = 500
const CLEAR = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }

function CollectionCard(props) {
  const textFont = uiFont()
  return (
    <view x={props.card.x} y={props.card.y} width={props.w} height={CARD_H} onPointerOver={props.onPointerOver} onPointerClick={props.onPointerClick}>
      <view width={props.w} height={CARD_H} borderRadius={24} color={props.look.os06} />
      <view width={props.w} height={CARD_H} borderRadius={24} color={CLEAR} border={{ width: 3, color: hex(props.look.focus) }} alpha={props.focused ? 1 : 0} />
      <For each={props.card.strip}>
        {(sc) => (
          <view x={27 + sc.x} y={27} width={props.card.coverW} height={210} borderRadius={10} color={props.look.os08}>
            <Show when={sc.image}>
              <view width={props.card.coverW} height={210} borderRadius={10} src={sc.image} textureOptions={COVER} />
            </Show>
          </view>
        )}
      </For>
      <text fontFamily={props.card.nameFont} fontSize={28} x={27} y={256} color={props.look.onSurface}>
        {props.card.name}
      </text>
      <text fontFamily={textFont} fontSize={19} x={27} y={300} color={props.look.os65}>
        {props.card.count}
      </text>
      <text fontFamily={props.card.overviewFont} fontSize={21} x={27} y={338} color={props.look.os75}>
        {props.card.overview}
      </text>
    </view>
  )
}

// The host gets onScreenLeft(), onScreenUp() and openDetails(item), and the node has land().
export default function CollectionsScreen(props) {
  const [all, setAll] = createSignal(null)
  const [cur, setCur] = createSignal(0)
  const [scrollY, setScrollY] = createSignal(0)
  const [has, setHas] = createSignal(false)
  const textFont = uiFont()
  const look = () => props.look
  const cw = () => 1920 - (props.railW || 0)
  const items = () => all() || props.data.collections
  const count = () => (items().length ? countLabel(items().length, $L('1 collection'), $L('{count} collections')) : '')
  const cardW = () => (cw() - 90) / 2 - 30
  const rows = createMemo(() => gridRows(items().length, 2))
  const cards = createMemo(() => {
    const w = cardW()
    const inner = w - 54
    const coverW = (inner - 40) / 5
    return items().map((item, i) => {
      const covers = item.Covers || []
      const strip = [0, 1, 2, 3, 4].map((c) => ({
        x: c * (coverW + 10),
        image: covers[c] ? bookImageUrl(covers[c]._serverUrl || getServerUrl(), covers[c]) || '' : '',
      }))
      const name = item.Name || ''
      const overview = cleanOverview(item.Overview) || ''
      return {
        k: item.Id,
        i,
        raw: item,
        x: 60 + (i % 2) * (w + 30),
        y: 24 + Math.floor(i / 2) * (CARD_H + 30),
        strip,
        coverW,
        name: ellipsize(name, 28, 'bold', inner),
        nameFont: fontFor(name, 'bold'),
        count: titlesCount(item.ChildCount) || '',
        overview: ellipsize(overview, 21, 'regular', inner),
        overviewFont: fontFor(overview),
      }
    })
  })
  const list = keyed(cards, (c) => c.k)
  const isCur = createSelector(cur)
  const height = () => 24 + rows().length * (CARD_H + 30) + 60
  onMount(async () => {
    // The library only checked its first few, so the rest are read here when there were more.
    if (!props.data.collectionsIsFloor) return
    try {
      const result = await loadBookCollections(api, props.library.Id, combinedTypes(props.library), ALL_COLLECTIONS)
      setAll(result.items)
    } catch (e) {
      setAll(props.data.collections)
    }
  })
  const reveal = () => {
    const top = 24 + Math.floor(cur() / 2) * (CARD_H + 30)
    const view = props.viewH - HEADER_H
    setScrollY(focusScroll(top, CARD_H, scrollY(), view, Math.max(0, height() - view)))
  }
  const point = bookPointer(props, has)
  const pointCard = (i, click) => {
    const top = 24 + Math.floor(i / 2) * (CARD_H + 30)
    return point(
      () => {
        setCur(i)
        reveal()
      },
      { whole: showsWhole(top, CARD_H, scrollY(), props.viewH - HEADER_H), lit: has() && cur() === i, click },
    )
  }
  const move = (direction) => () => {
    const next = gridMove(rows(), rowIndexOf(rows(), cur()), cur(), direction)
    if (next != null) {
      setCur(next)
      reveal()
    } else if (direction === 'left') props.host.onScreenLeft()
    else if (direction === 'up') props.host.onScreenUp()
    return true
  }
  return (
    <view
      ref={(n) => {
        n.land = () => {
          setCur(0)
          reveal()
        }
        if (props.ref) props.ref(n)
      }}
      width={cw()}
      height={props.viewH}
      onFocusChanged={setHas}
      onUp={move('up')}
      onDown={move('down')}
      onLeft={move('left')}
      onRight={move('right')}
      onEnter={() => {
        const card = cards()[cur()]
        if (card) props.host.openDetails(card.raw)
        return true
      }}
    >
      <ScreenTitle title={$L('Collections')} count={count()} look={look()} />
      <view y={HEADER_H} width={cw()} height={props.viewH - HEADER_H} clipping>
        <view y={-scrollY()} width={cw()} height={Math.max(props.viewH, height())}>
          <For each={list.keys()}>
            {(k) => {
              const cc = list.item(k)
              return (
                <CollectionCard
                  card={cc()}
                  w={cardW()}
                  look={look()}
                  focused={has() && isCur(cc().i)}
                  onPointerOver={() => pointCard(cc().i, false)}
                  onPointerClick={() => pointCard(cc().i, true)}
                />
              )
            }}
          </For>
          <Show when={!items().length}>
            <text fontFamily={textFont} fontSize={20} x={cw() / 2} y={54} mountX={0.5} color={look().os50}>
              {$L('No items found')}
            </text>
          </Show>
        </view>
      </view>
    </view>
  )
}
