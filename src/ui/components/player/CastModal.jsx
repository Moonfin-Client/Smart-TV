import $L from '../../../services/i18n.js'
import { For, createSelector, createSignal, onCleanup } from 'solid-js'
import { api, createApiForServer, getServerUrl } from '../../../services/jellyfinApi.js'
import { getApiForItem } from '../../../services/connectionPool.js'
import { mergeEpisodePeople, resolveParentCast } from '../../../utils/episodeCast.js'
import { getImageUrl } from '../../../utils/helpers.js'
import { fontFor, uiFont } from '../../text.js'
import { theme, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { BOX, CAST, castCards, rowScroll, rowWidth } from './modalLayouts.js'
import { tx } from '../../fx.js'

// The status row: one 33px line with 21 above and below.
const STATUS_H = 75
const SHADOW = { color: shadowColor('#000000cc'), x: 0, y: 15, blur: 50, spread: 0 }
const PANEL_EDGE = { width: 1, color: hex('#ffffff29') }
const RING = { width: 3, color: hex('#ffffff') }
const COVER = { resizeMode: { type: 'cover' } }
const FADE = { duration: 200, easing: 'ease' }

const peopleOf = (item, parentActors) => {
  const people = Array.isArray(item && item.People) ? item.People : []
  return item && item.Type === 'Episode' ? mergeEpisodePeople({ episodePeople: people, parentActors }) : people
}

// The modal mounts on each open, so the item's people and whether its parents' cast was found are
// kept here.
const held = { item: null, people: [], resolved: null }

// The Cast & Crew modal: the item's people as a row of round photos in a track dialog. An episode
// asks its season, then its series, for the regular cast the first time it opens, showing
// Loading... until they answer. The status row that held focus goes away then, so nothing is
// focused until the next arrow. The holder mounts it, calls open(item), focuses it and hears
// onCastMember(person). Back is the holder's.
export default function CastModal(props) {
  const [cards, setCards] = createSignal([])
  const [rowH, setRowH] = createSignal(0)
  const [status, setStatus] = createSignal('')
  const [statusFont, setStatusFont] = createSignal(uiFont('bold'))
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [on, setOn] = createSignal(false)
  const [title, setTitle] = createSignal('')
  const [footer, setFooter] = createSignal('')
  const [titleFont, setTitleFont] = createSignal(uiFont('bold'))
  const [footFont, setFootFont] = createSignal(uiFont())
  let timer = null
  let alive = true
  onCleanup(() => {
    alive = false
    clearTimeout(timer)
  })

  // Only the focused row's fill follows the theme.
  const statusFill = () => theme().accentA(0.3)
  const listH = () => (status() ? STATUS_H : rowH())
  const boxH = () => 2 + BOX.LIST_Y + listH() + BOX.FOOT_GAP + BOX.FOOT_H + BOX.PAD
  const boxY = () => Math.round((1080 - boxH()) / 2)
  const isCur = createSelector(cur)
  const contentW = () => rowWidth(cards().length, CAST.PAD_X, CAST.W, CAST.GAP)

  const fill = (loading) => {
    const item = held.item
    const { cards: list, h } = castCards(held.people || [], {
      unknown: $L('Unknown'),
      cast: $L('Cast'),
      image: (p) =>
        getImageUrl(p._serverUrl || item._serverUrl || getServerUrl(), p.Id, 'Primary', {
          maxHeight: 220,
          quality: 90,
          tag: p.PrimaryImageTag || p.ImageTag || (p.ImageTags && p.ImageTags.Primary) || null,
        }) || '',
    })
    setCards(list.map((c) => ({ ...c, nameFont: fontFor(c.name, 'bold'), roleFont: fontFor(c.role) })))
    setRowH(CAST.TOP + h + CAST.BOTTOM)
    const text = loading ? $L('Loading...') : list.length ? '' : $L('No cast information available')
    setStatus(text)
    setStatusFont(fontFor(text, 'bold'))
    setScroll(0)
  }
  const askParents = async (item, seasonId, seriesId) => {
    const id = item.Id
    try {
      const apiClient =
        getApiForItem(item) || (item._serverUrl ? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId) : api)
      const parentActors = await resolveParentCast({ apiClient, seasonId, seriesId })
      if (!held.item || held.item.Id !== id) return
      // A failed lookup also comes back empty, so only a found cast stops the next open from asking again.
      if (parentActors.length > 0) {
        held.people = peopleOf(item, parentActors)
        held.resolved = id
      }
    } catch (e) {
      // Not cached, so the next open tries again.
    }
    if (!alive || !held.item || held.item.Id !== id) return
    fill(false)
    setCur(-1)
  }
  const open = (item) => {
    const heading = $L('Cast & Crew')
    const foot = $L('Press BACK to close')
    setTitle(heading)
    setFooter(foot)
    setTitleFont(fontFor(heading, 'bold'))
    setFootFont(fontFor(foot))
    // A new item starts over with its own people.
    if (!held.item || held.item.Id !== item.Id) {
      held.people = peopleOf(item, [])
      held.resolved = null
    }
    held.item = item
    const seasonId = item.SeasonId || item.ParentId
    const seriesId = item.SeriesId
    const asks = item.Type === 'Episode' && !!(seasonId || seriesId) && held.resolved !== item.Id
    fill(asks)
    setCur(0)
    setOn(false)
    clearTimeout(timer)
    timer = setTimeout(() => setOn(true), 16)
    if (asks) askParents(item, seasonId, seriesId)
  }
  const reveal = (to) => {
    setCur(to)
    setScroll(rowScroll(scroll(), cards()[to].x, CAST.W, 660, contentW()))
  }
  // Any arrow brings focus back to the first card when it was lost.
  const move = (step) => {
    if (status()) setCur(0)
    else if (cur() < 0) reveal(0)
    else if (cards()[cur() + step]) reveal(cur() + step)
    return true
  }

  return (
    <view
      ref={(n) => {
        n.open = open
        if (props.ref) props.ref(n)
      }}
      width={1920}
      pointerModal
      height={1080}
      transition={tx({ alpha: { duration: on() ? 200 : 0, easing: 'ease' } })}
      alpha={on() ? 1 : 0}
      onLeft={() => move(-1)}
      onRight={() => move(1)}
      onUp={() => move(0)}
      onDown={() => move(0)}
      onEnter={() => {
        const card = !status() && cards()[cur()]
        if (card && props.onCastMember) props.onCastMember(card.person)
        return true
      }}
    >
      <view width={1920} height={1080} color="#000000f2" />
      <view
        x={629}
        transition={tx({ y: { duration: on() ? 300 : 0, easing: 'ease' }, alpha: { duration: on() ? 300 : 0, easing: 'ease' } })}
        y={boxY() + (on() ? 0 : 30)}
        alpha={on() ? 1 : 0}
        width={662}
        height={boxH()}
      >
        <view width={662} height={boxH()} borderRadius={20} color="#00000000" shadow={SHADOW} />
        <view width={662} height={boxH()} borderRadius={20} color="#171717f0" border={PANEL_EDGE} />
        <text fontFamily={titleFont()} fontSize={30} x={37} y={33.92} maxWidth={588} lineHeight={33} color="#ffffffff">
          {title() || ' '}
        </text>
        <view x={1} y={82} width={660} height={1} color="#ffffff14" />
        <view
          alpha={status() ? 1 : 0}
          x={1}
          y={101}
          width={660}
          height={75}
          transition={{ color: { duration: 300, easing: 'ease' } }}
          color={cur() === 0 ? statusFill() : '#00000000'}
        >
          <text fontFamily={statusFont()} fontSize={24} x={36} y={25.44} maxWidth={588} maxLines={1} color="#ffffffff">
            {status() || ' '}
          </text>
        </view>
        <view alpha={status() ? 0 : 1} x={1} y={101} width={660} height={Math.max(1, rowH())} clipping>
          <view x={-scroll()} width={Math.max(660, contentW())} height={Math.max(1, rowH())}>
            <For each={cards()}>
              {(c) => {
                const focused = () => isCur(c.i)
                return (
                  <view
                    x={c.x}
                    y={8}
                    width={160}
                    height={rowH() - 20}
                    pivotX={0.5}
                    pivotY={0}
                    transition={{ scale: FADE }}
                    scale={focused() ? 1.06 : 1}
                    // The row scrolls to its focused card, so the Magic Remote's cursor rings a card
                    // and a click picks it (app/pointer.js).
                    pointerRing
                    onPointerClick={() => {
                      if (status()) return false
                      reveal(c.i)
                      return true
                    }}
                  >
                    <view x={7} width={146} height={146} borderRadius={73} color="#ffffff1a" />
                    <view alpha={c.image ? 1 : 0} x={10} y={3} width={140} height={140} borderRadius={70} src={c.image} textureOptions={COVER} />
                    <text alpha={c.image ? 0 : 1} fontFamily={c.nameFont} fontSize={48} x={80} y={46.9} mountX={0.5} color="#ffffff66">
                      {c.letter}
                    </text>
                    <view x={7} width={146} height={146} borderRadius={73} color="#00000000" border={RING} transition={{ alpha: FADE }} alpha={focused() ? 1 : 0} />
                    <text
                      fontFamily={c.nameFont}
                      fontSize={17}
                      y={155}
                      lineHeight={20.4}
                      maxWidth={160}
                      maxLines={2}
                      contain="width"
                      textAlign="center"
                      color="#ffffffff"
                    >
                      {c.name}
                    </text>
                    <text
                      fontFamily={c.roleFont}
                      fontSize={15}
                      y={158 + c.nameH}
                      lineHeight={18}
                      maxWidth={160}
                      maxLines={1}
                      contain="width"
                      textAlign="center"
                      color="#ffffff8a"
                    >
                      {c.role}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
        </view>
        <text fontFamily={footFont()} fontSize={18} x={331} y={boxH() - 75.05} mountX={0.5} color="#ffffff6b">
          {footer() || ' '}
        </text>
      </view>
    </view>
  )
}
