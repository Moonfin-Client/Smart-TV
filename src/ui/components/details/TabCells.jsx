import $L from '../../../services/i18n.js'
import { For, createMemo, createSelector, createSignal } from 'solid-js'
import ClassicCard from '../home/ClassicCard.jsx'
import { classicCard } from '../home/cards.js'
import { homeLook } from '../home/look.js'
import * as settings from '../../../state/settings.js'
import StillLabels from './StillLabels.jsx'
import { cssShift, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { textWidth } from './measure.js'
import { byKey } from './keyed.js'
import { holdPress } from '../../../utils/longPress.js'

// The open tab's content on Modern: media cards, cast photos, chapter and extra stills, studio logos,
// review cards, episode rows and track rows, at the places pages/Details/modern/tabs.js gives them.
// Only the cells near the screen are built, since a tab opens on every move along the bar.
//
// Focus moves spatially: Left and Right along a row, Up and Down to the nearest cell of the row above
// or below. Up off the top row and Left off a row's first cell call onCellsEdge(dir), every move
// onCellFocus(cell), Enter onCellSelect(cell), and holding Enter on a card, episode or track
// onCellLong(cell). Props: `cells`, `headings`, `viewTop` (the page's scroll
// over this box's top), `tokens`, `x`, `y`, `alpha`. Its node has current(), setCur(i), entry() and
// resetCur().
const WINDOW = 400
const GONE = {
  k: '', x: 0, y: 0, w: 0, h: 0, idx: -2, name: [], role: [], pills: [], card: { type: 'poster' }, font: 'roboto', nameFont: 'roboto',
  authorFont: 'roboto', previewFont: 'roboto', overviewFont: 'roboto', iconFont: 'roboto', t: '', text: '', label: '', fill: '#00000000', color: '#00000000',
}
const KINDS = ['card', 'person', 'chapter', 'studio', 'review', 'episode', 'track', 'pill', 'clear', 'empty']
const CLEAR_EDGE = hex('#ffffff33')
const FADE = { duration: 150 }

export default function TabCells(props) {
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const t = () => props.tokens || { accent: '#0a84ffff', focus: '#00a4dcff', focusA: () => '#00a4dc99', badgeWatched: '#00a4dcff', onBadge: '#ffffffff' }
  const cells = () => props.cells || []
  const byK = createMemo(() => {
    const m = {}
    cells().forEach((c) => (m[c.k] = c))
    return m
  })
  const at = (k) => byK()[k] || GONE
  // Each kind's cells near the screen, by key, so a scroll only adds and drops cells at the edges.
  const groups = createMemo(() => {
    const top = (props.viewTop || 0) - WINDOW
    const bottom = (props.viewTop || 0) + 1080 + WINDOW
    const g = {}
    KINDS.forEach((kind) => (g[kind] = []))
    g.sort = g.track
    cells().forEach((c) => {
      if (c.y + c.h >= top && c.y <= bottom && g[c.kind]) g[c.kind].push(c.k)
    })
    return g
  })
  const focusIdx = () => (focused() ? cur() : -1)
  const isFocus = createSelector(focusIdx)
  // Cards keep the default poster size, which the tab grids are laid out for.
  const cardSettings = () => ({ ...settings.all(), homeRowsPosterSize: 'default' })
  const look = createMemo(() => ({ ...homeLook({ ...cardSettings(), homeRowsStyle: 'v1' }), plain: true }))
  const regular = () => uiFont('regular')
  const bold = () => uiFont('bold')
  const medium = () => uiFont('medium')
  const incompleteText = $L('Incomplete')
  const incompleteW = () => 2 + 6 + 12 + 3 + textWidth(incompleteText, 12, 'bold') + 8

  // The episodes' anime marker pills and incomplete badges, and the text lines of people and studio
  // cells, laid flat so no list sits inside another.
  const episodePills = createMemo(() => {
    const out = []
    groups().episode.forEach((k) => {
      const c = at(k)
      ;(c.pills || []).forEach((p) => out.push({ ...p, k: `${c.k}:${p.key}`, x: c.x + 296 + p.x, y: c.y + c.pillsY }))
    })
    return out
  })
  const badges = createMemo(() =>
    groups()
      .episode.map(at)
      .filter((c) => c.incomplete)
      .map((c) => ({ k: c.k, x: c.x + c.incompleteX, y: c.y + c.incompleteY })),
  )
  const lines = createMemo(() => {
    const out = []
    groups().person.forEach((k) => {
      const c = at(k)
      c.name.forEach((ln, i) => out.push({ k: `${c.k}n${i}`, x: c.x + ln.x, y: c.y + 152 + ln.y, t: ln.t, font: ln.font, size: 20, color: '#ffffffff' }))
      c.role.forEach((ln, i) => out.push({ k: `${c.k}r${i}`, x: c.x + ln.x, y: c.y + c.roleY + 1.5 + ln.y, t: ln.t, font: ln.font, size: 18, color: '#ffffffa6' }))
    })
    groups().studio.forEach((k) => {
      const c = at(k)
      c.name.forEach((ln, i) => out.push({ k: `${c.k}n${i}`, x: c.x + ln.x, y: c.y + 144 + ln.y, t: ln.t, font: ln.font, size: 20, color: '#ffffffcc' }))
    })
    return out
  })
  const pillsK = byKey(episodePills, GONE)
  const badgesK = byKey(badges, GONE)
  const linesK = byKey(lines, GONE)

  const focusable = () => cells().filter((c) => c.idx >= 0)
  const cell = (i) => focusable().find((c) => c.idx === i)
  const current = () => cell(cur())
  const notify = () => {
    const c = current()
    if (c && props.onCellFocus) props.onCellFocus(c)
  }
  const rowOf = (row) => focusable().filter((c) => c.row === row)
  const vertical = (d) => {
    const c = current()
    if (!c) return false
    const rows = focusable().map((x) => x.row)
    const target = d < 0 ? Math.max(...rows.filter((r) => r < c.row).concat(-1)) : Math.min(...rows.filter((r) => r > c.row).concat(Infinity))
    if (target < 0 || target === Infinity) return false
    const mid = c.x + c.w / 2
    let best = null
    rowOf(target).forEach((x) => {
      const dist = Math.abs(x.x + x.w / 2 - mid)
      if (!best || dist < best.dist) best = { x, dist }
    })
    if (!best) return false
    setCur(best.x.idx)
    notify()
    return true
  }
  const horizontal = (d) => {
    const c = current()
    if (!c) return false
    const row = rowOf(c.row).sort((a, b) => a.x - b.x)
    const next = row[row.indexOf(c) + d]
    if (!next) return false
    setCur(next.idx)
    notify()
    return true
  }

  // A card or row that can open a menu does so when held, and acts on release otherwise.
  const hold = holdPress()

  return (
    <view
      ref={(n) => {
        n.current = current
        n.setCur = (i) => {
          if (cell(i)) setCur(i)
          notify()
        }
        n.resetCur = () => setCur(0)
        // The cell Down lands on from the bar: the current episode on an episode's own page, else the first.
        n.entry = () => {
          const list = focusable()
          const now = list.find((c) => c.current)
          return now ? now.idx : list.length ? list[0].idx : 0
        }
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      alpha={props.alpha == null ? 1 : props.alpha}
      onFocusChanged={(has) => {
        setFocused(has)
        // A hold that opened a menu ends there, and its release goes to the menu.
        if (!has) hold.cancel()
      }}
      onLeft={() => {
        if (!horizontal(-1) && props.onCellsEdge) props.onCellsEdge('left')
        return true
      }}
      onRight={() => {
        horizontal(1)
        return true
      }}
      onUp={() => {
        if (!vertical(-1) && props.onCellsEdge) props.onCellsEdge('up')
        return true
      }}
      onDown={() => {
        vertical(1)
        return true
      }}
      onEnter={() => {
        const c = current()
        if (!c) return true
        if (!c.item || ['card', 'episode', 'track'].indexOf(c.kind) < 0 || !props.onCellLong) {
          if (props.onCellSelect) props.onCellSelect(c)
          return true
        }
        hold.start(c, () => {
          props.onCellLong(c)
        })
        return true
      }}
      onMenu={() => {
        const c = current()
        if (!c || !c.item || ['card', 'episode', 'track'].indexOf(c.kind) < 0 || !props.onCellLong) return false
        props.onCellLong(c)
        return true
      }}
      onEnterRelease={() => {
        return hold.end((c) => {
          if (props.onCellSelect) props.onCellSelect(c)
        })
      }}
    >
      <view>
        <For each={groups().card}>
          {(k) => {
            // The item's card in its own shape, with a centered caption and a season's Seerr marker.
            const c = () => at(k)
            const model = createMemo(() =>
              classicCard(c().card.raw || c().item, c().idx, {
                s: cardSettings(),
                cardType: c().card.type === 'poster' ? 'portrait' : c().card.type,
                imageType: 'poster',
                plain: true,
                seerrSeason: c().marker || null,
              }),
            )
            return (
              <view x={c().x} y={c().y}>
                <ClassicCard card={model()} focused={isFocus(c().idx)} look={look()} />
              </view>
            )
          }}
        </For>
      </view>

      <view>
        <For each={groups().person}>
          {(k) => (
            <view x={at(k).x} y={at(k).y} width={160} height={at(k).h}>
              <view x={10} width={140} height={140} pivot={0.5} scale={isFocus(at(k).idx) ? 1.08 : 1} transition={{ scale: FADE }}>
                <view x={-4} y={-4} width={148} height={148} borderRadius={74} color={t().focusA(0.6)} alpha={isFocus(at(k).idx) ? 1 : 0} transition={{ alpha: FADE }} />
                <view width={140} height={140} borderRadius={70} color="#ffffff1a" />
                <view alpha={at(k).photo ? 0 : 0.4} x={40} y={40} width={60} height={60} src="icons/d/series.webp" color="#ffffffff" />
                <view
                  alpha={at(k).photo ? 1 : 0}
                  width={140}
                  height={140}
                  borderRadius={70}
                  src={at(k).photo || undefined}
                  textureOptions={{ resizeMode: { type: 'cover' } }}
                />
              </view>
            </view>
          )}
        </For>
      </view>

      <view>
        <For each={groups().chapter}>
          {(k) => (
            <view x={at(k).x} y={at(k).y} width={300} height={at(k).h}>
              <view width={300} height={168.75} pivot={0.5} scale={isFocus(at(k).idx) ? 1.05 : 1} transition={{ scale: FADE }}>
                <view x={-4} y={-4} width={308} height={176.75} borderRadius={14} color={t().focusA(0.6)} alpha={isFocus(at(k).idx) ? 1 : 0} transition={{ alpha: FADE }} />
                <view width={300} height={168.75} borderRadius={10} color="#1a1d22ff" />
                <view
                  alpha={at(k).thumb ? 1 : 0}
                  width={300}
                  height={168.75}
                  borderRadius={10}
                  src={at(k).thumb || undefined}
                  textureOptions={{ resizeMode: { type: 'cover' } }}
                />
                <view alpha={at(k).time ? 1 : 0} x={300 - 8 - at(k).timeW} y={125.75} width={at(k).timeW} height={35} borderRadius={6} color="#000000b3">
                  <text x={8} y={3.5} fontFamily={regular()} fontSize={18} lineHeight={33} color="#ffffffff">
                    {at(k).time}
                  </text>
                </view>
              </view>
              <text y={178.75} fontFamily={at(k).nameFont} fontSize={20} lineHeight={33} maxWidth={300} maxLines={1} color="#ffffffff">
                {at(k).name}
              </text>
            </view>
          )}
        </For>
      </view>

      <view>
        <For each={groups().studio}>
          {(k) => (
            <view x={at(k).x} y={at(k).y} width={240} height={at(k).h}>
              <view width={240} height={130} pivot={0.5} scale={isFocus(at(k).idx) ? 1.05 : 1} transition={{ scale: FADE }}>
                <view x={-4} y={-4} width={248} height={138} borderRadius={16} color={t().focusA(0.6)} alpha={isFocus(at(k).idx) ? 1 : 0} transition={{ alpha: FADE }} />
                <view width={240} height={130} borderRadius={12} color="#ffffff1a" />
                <view
                  alpha={at(k).logo ? 1 : 0}
                  x={20}
                  y={20}
                  width={200}
                  height={90}
                  src={at(k).logo || undefined}
                  textureOptions={{ resizeMode: { type: 'contain' } }}
                />
                <view alpha={at(k).logo ? 0 : 0.4} x={90} y={35} width={60} height={60} src="icons/d/series.webp" color="#ffffffff" />
              </view>
            </view>
          )}
        </For>
      </view>

      <view>
        <For each={groups().review}>
          {(k) => (
            <view x={at(k).x} y={at(k).y} width={520} height={250}>
              <view width={520} height={250} borderRadius={16} color={isFocus(at(k).idx) ? '#34343cd1' : '#24242ab8'} />
              <view width={520} height={250} borderRadius={16} color="#00000001" border={{ width: 3, color: hex(t().focus) }} alpha={isFocus(at(k).idx) ? 1 : 0} />
              <view x={27} y={25} width={56} height={56} borderRadius={28} color="#ffffff29">
                <text y={13.5} fontFamily={bold()} fontSize={26} lineHeight={34} textAlign="center" contain="width" maxWidth={56} color="#ffffffff">
                  {at(k).initial}
                </text>
                <view
                  alpha={at(k).avatar ? 1 : 0}
                  width={56}
                  height={56}
                  borderRadius={28}
                  src={at(k).avatar || undefined}
                  textureOptions={{ resizeMode: { type: 'cover' } }}
                />
              </view>
              <text
                x={99}
                y={at(k).meta ? 27 : 39}
                fontFamily={at(k).authorFont}
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
              <text x={27} y={99} fontFamily={at(k).previewFont} fontSize={20} lineHeight={28} maxWidth={466} maxLines={4} color="#ffffffd1">
                {at(k).preview}
              </text>
            </view>
          )}
        </For>
      </view>

      <view>
        <For each={groups().episode}>
          {(k) => (
            <view
              x={at(k).x}
              y={at(k).y}
              width={at(k).w}
              height={at(k).h}
              pivot={0.5}
              scale={isFocus(at(k).idx) ? 1.01 : 1}
              transition={{ scale: FADE }}
            >
              <view width={at(k).w} height={at(k).h} borderRadius={14} color="#ffffff0a" />
              <view width={at(k).w} height={at(k).h} borderRadius={14} color="#ffffff1a" alpha={isFocus(at(k).idx) ? 1 : 0} transition={{ alpha: FADE }} />
              <view
                alpha={at(k).current ? 1 : 0}
                width={at(k).w}
                height={at(k).h}
                borderRadius={14}
                color="#00000001"
                border={{ width: 2, color: hex(t().accentRing || '#00a4dcb3') }}
              />
              <view x={12} y={12} width={260} height={at(k).thumbH} borderRadius={10} color="#1a1d22ff" clipping>
                <view
                  alpha={at(k).thumb ? 1 : 0}
                  width={260}
                  height={at(k).thumbH}
                  src={at(k).thumb || undefined}
                  textureOptions={{ resizeMode: { type: 'cover' } }}
                />
                <view alpha={at(k).progress > 0 ? 1 : 0} y={at(k).thumbH - 5} width={260} height={5} color="#ffffff40">
                  <view height={5} width={260 * at(k).progress} color="#ffffffff" />
                </view>
                <view alpha={at(k).played ? 1 : 0} x={220} y={8} width={32} height={32} borderRadius={16} color={t().badgeWatched}>
                  <view x={6} y={6} width={20} height={20} src="icons/d/watched.webp" color={t().onBadge} />
                </view>
                <StillLabels w={260} h={at(k).thumbH} item={at(k).item} topRight={at(k).played ? 46 : 8} />
              </view>
              <text
                x={296}
                y={20}
                fontFamily={at(k).nameFont}
                fontSize={24}
                lineHeight={33}
                maxWidth={at(k).bodyW}
                maxLines={1}
                color="#ffffffff"
              >
                {at(k).name}
              </text>
              <text x={296} y={61} fontFamily={regular()} fontSize={20} lineHeight={33} color="#ffffff99">
                {at(k).runtime}
              </text>
              <text
                x={296}
                y={at(k).ovY + 2}
                fontFamily={at(k).overviewFont}
                fontSize={20}
                lineHeight={28}
                maxWidth={at(k).bodyW}
                maxLines={2}
                color="#ffffffcc"
              >
                {at(k).overview}
              </text>
            </view>
          )}
        </For>
      </view>
      <view>
        <For each={badgesK.keys()}>
          {(k) => (
            <view x={badgesK.at(k).x} y={badgesK.at(k).y} width={incompleteW()} height={23} borderRadius={11.5} color="#1e1e24ff">
              <view x={1} y={1} width={incompleteW() - 2} height={21} borderRadius={10.5} color="#e0a33cff" />
              <view x={7} y={5.5} width={12} height={12} src="icons/home_incomplete.webp" color="#1e1e24ff" />
              <text x={22} y={-5 + cssShift(12)} fontFamily={bold()} fontSize={12} lineHeight={33} color="#1e1e24ff">
                {incompleteText}
              </text>
            </view>
          )}
        </For>
      </view>
      <view>
        <For each={pillsK.keys()}>
          {(k) => (
            <view
              x={pillsK.at(k).x}
              y={pillsK.at(k).y}
              width={pillsK.at(k).w}
              height={36.5}
              borderRadius={11}
              color={pillsK.at(k).fill}
              border={{ width: 1, color: hex(pillsK.at(k).border || '#00000000') }}
            >
              <text x={15} y={4 + cssShift(19)} fontFamily={bold()} fontSize={19} lineHeight={28.5} letterSpacing={0.2} color={pillsK.at(k).text}>
                {pillsK.at(k).label}
              </text>
            </view>
          )}
        </For>
      </view>

      <view>
        <For each={groups().track}>
          {(k) => (
            <view x={at(k).x} y={at(k).y} width={at(k).w} height={at(k).h}>
              <view
                width={at(k).w}
                height={at(k).h}
                borderRadius={10}
                color="#ffffff26"
                alpha={at(k).kind === 'track' && isFocus(at(k).idx) ? 1 : 0}
                transition={{ alpha: FADE }}
              />
              <text x={20} y={16} fontFamily={regular()} fontSize={22} lineHeight={33} color="#ffffff99">
                {at(k).index || ''}
              </text>
              <text
                x={80}
                y={16}
                fontFamily={at(k).titleFont || regular()}
                fontSize={22}
                lineHeight={33}
                maxWidth={Math.max(1, (at(k).durationX || 0) - 100)}
                maxLines={1}
                color="#ffffffff"
              >
                {at(k).title || ''}
              </text>
              <text x={at(k).durationX || 0} y={16} fontFamily={regular()} fontSize={20} lineHeight={33} color="#ffffff99">
                {at(k).duration || ''}
              </text>
              <view alpha={at(k).kind === 'sort' ? 1 : 0} width={at(k).w} height={at(k).h}>
                <view width={at(k).w} height={at(k).h} borderRadius={27} color="#ffffff1a" />
                <view
                  alpha={isFocus(at(k).idx) ? 1 : 0}
                  width={at(k).w}
                  height={at(k).h}
                  borderRadius={27}
                  color="#ffffffff"
                  border={{ width: 3, color: hex(t().focus) }}
                />
                <text
                  x={27}
                  y={12.5}
                  fontFamily={at(k).font || medium()}
                  fontSize={20}
                  lineHeight={33}
                  color={isFocus(at(k).idx) ? '#000000ff' : '#ffffffff'}
                >
                  {at(k).label || ''}
                </text>
              </view>
            </view>
          )}
        </For>
      </view>
      <view>
        <For each={groups().pill}>
          {(k) => (
            <view x={at(k).x} y={at(k).y} width={at(k).w} height={37} pivot={0.5} scale={isFocus(at(k).idx) ? 1.04 : 1} transition={{ scale: FADE }}>
              <view
                width={at(k).w}
                height={37}
                borderRadius={20}
                color={at(k).active ? t().accentA(0.22) : '#ffffff14'}
                border={{ width: 1, color: hex(at(k).active ? t().accent : '#ffffff1f') }}
              />
              <view alpha={isFocus(at(k).idx) ? 1 : 0} width={at(k).w} height={37} borderRadius={20} color={t().focus} />
              <text
                x={19}
                y={12}
                fontFamily={at(k).font}
                fontSize={16}
                lineHeight={1}
                color={isFocus(at(k).idx) ? t().onButtonFocused : at(k).active ? '#ffffffff' : '#ffffffd9'}
              >
                {at(k).label}
              </text>
              <view
                alpha={at(k).badge ? 1 : 0}
                x={at(k).badgeX}
                y={9}
                width={at(k).badgeW}
                height={19}
                borderRadius={10}
                color={isFocus(at(k).idx) ? '#ffffffff' : t().accent}
              >
                <text x={8} y={5} fontFamily="roboto-bold" fontSize={13} lineHeight={1} color={isFocus(at(k).idx) ? t().accent : '#ffffffff'}>
                  {at(k).badge}
                </text>
              </view>
            </view>
          )}
        </For>
      </view>
      <view>
        <For each={groups().empty}>
          {(k) => (
            <view x={at(k).x} y={at(k).y} width={900} height={at(k).h}>
              <text x={at(k).iconX} y={at(k).iconY} fontFamily={at(k).iconFont} fontSize={48} lineHeight={72} color="#ffffff59">
                {at(k).icon}
              </text>
              <text
                y={120 + cssShift(20)}
                fontFamily={at(k).font}
                fontSize={20}
                lineHeight={33}
                textAlign="center"
                contain="width"
                maxWidth={900}
                color="#ffffffa6"
              >
                {at(k).text}
              </text>
            </view>
          )}
        </For>
      </view>
      <view>
        <For each={groups().clear}>
          {(k) => (
            <view x={at(k).x} y={at(k).y} width={at(k).w} height={41} pivot={0.5} scale={isFocus(at(k).idx) ? 1.05 : 1} transition={{ scale: FADE }}>
              <view width={at(k).w} height={41} borderRadius={20.5} color="#ffffff1a" border={{ width: 1, color: CLEAR_EDGE }} />
              <view alpha={isFocus(at(k).idx) ? 1 : 0} width={at(k).w} height={41} borderRadius={20.5} color={t().focus} />
              <text
                y={4 + cssShift(16)}
                fontFamily={at(k).font}
                fontSize={16}
                lineHeight={33}
                textAlign="center"
                contain="width"
                maxWidth={at(k).w}
                color="#ffffffff"
              >
                {at(k).label}
              </text>
            </view>
          )}
        </For>
      </view>
      <view>
        <For each={linesK.keys()}>
          {(k) => (
            <text
              x={linesK.at(k).x}
              y={linesK.at(k).y}
              fontFamily={linesK.at(k).font}
              fontSize={linesK.at(k).size || 20}
              lineHeight={33}
              color={linesK.at(k).color}
            >
              {linesK.at(k).t}
            </text>
          )}
        </For>
      </view>
      <view>
        <For each={props.headings || []}>
          {(hd) => (
            <text x={hd.x} y={hd.y + 2} fontFamily={hd.font} fontSize={24} lineHeight={29} color="#ffffffff">
              {hd.text}
            </text>
          )}
        </For>
      </view>
    </view>
  )
}
