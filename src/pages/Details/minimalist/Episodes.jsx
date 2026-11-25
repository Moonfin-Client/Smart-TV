import { For, Index, batch, createMemo, createSelector, createSignal } from 'solid-js'
import TabBar from '../../../ui/components/details/TabBar.jsx'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { byKey } from '../../../ui/components/details/keyed.js'
import { cssShift, fontFor, themeSpacing, uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { navOnLeft } from '../../../ui/theme.js'
import { focusNav } from '../../../app/focus.js'
import { holdPress } from '../../../utils/longPress.js'
import { effectiveSeason, groupEpisodesBySeason, seasonOptions } from '../nouveau/nouveauSeasons.js'
import { minimalistCardUrl } from './minimalistRules.js'
import EpisodeCard, { cardMetrics } from './EpisodeCard.jsx'
import { railScroll, revealScroll } from './rail.js'

// Season tabs over a rail of episode cards, and nothing else. A tab picks the season and the rail
// follows. Stage and Premiere draw the same section at their size.
//
// Props: `large` (Stage's size: a strip of season pills and the bigger card), `cardW` (a large card's
// width, 350 by default, a small card is always 266), `bleedRight` (how far the rail runs on past
// `w` into the margin on its right), `leftEdge` (the host has something of its own to the left,
// which then takes Left off the first tab or card, otherwise Left goes to a sidebar or, on a card,
// wraps), `tokens`, `x`, `y`, `alpha`.
// Its node has draw({item, settings, serverUrl, seasons, episodes, seriesEpisodes, w}), which lays
// the section out in `w` and returns its height (0 with no episodes to show), contentHeight(), the
// height draw() last returned, hasTabs(), enter() and setFocus() (where it last left off, else its
// top), enterTabs(at) and enterRail().
// Calls onEpisodesEdge(dir) ('up' off the top part, 'down' off the rail, 'left' as above),
// onEpisodeSelect(ep) on OK, onEpisodeLong(ep) on a held OK when given, onEpisodesFocus({y, h}) as
// a part takes focus, in section pixels, and onEpisodesResize(h) when a picked season changes it.
const CLEARANCE = 20
const SMALL = { w: 266, gap: 20, barH: 63, barGap: 18 }
const LARGE = { gap: 34, barH: 73, barGap: 10 }
// The card title steps up a size from this width.
const WIDE_CARD = 400

// The large season strip: 8px of track around 57px pills, 21.7px labels.
// shortcut: a large bar wider than its room clips instead of scrolling the picked tab into view.
// Scroll it the way TabBar does once a show has that many seasons.
const LARGE_PAD = 8
const largePillW = (label, on) => 25 + textWidth(label, 21.7, on ? 'bold' : 'medium') + 25

const NO_PICK = { x: 0, w: 0 }
const GONE = {
  k: '', idx: -2, x: 0, img: '', title: '', titleFont: 'roboto', titleShift: 0, num: null, numText: '', numFont: 'roboto', numW: 0,
  played: false, current: false, item: null,
}
const DEFAULT_TOKENS = { accent: '#0a84ffff', onAccent: '#ffffffff', focus: '#00a4dcff', os: (a) => `#ffffff${Math.round(a * 255).toString(16)}` }

export default function Episodes(props) {
  const [rw, setRw] = createSignal(1688)
  const [tabs, setTabs] = createSignal([])
  const [active, setActive] = createSignal('')
  const [cards, setCards] = createSignal([])
  const [scroll, setScroll] = createSignal(0)
  const [cur, setCur] = createSignal(0)
  const [focusedPart, setFocusedPart] = createSignal('')
  const [box, setBox] = createSignal({ h: 0, railY: 0, railH: 0, cardH: 0, trackW: 0, cw: SMALL.w, ih: 0, m: cardMetrics(false, false) })
  const [pills, setPills] = createSignal([])
  const [barW, setBarW] = createSignal(0)
  const [tabCur, setTabCur] = createSignal(0)

  const m = { item: null, d: null, picked: null, part: 'rail', lastPart: '', lastTab: 0, startKey: null, list: [], gap: SMALL.gap, railTop: 0, barH: 0 }
  let bar
  let focusSelf = () => {}

  const t = () => props.tokens || DEFAULT_TOKENS
  const viewW = () => rw() + (Number(props.bleedRight) || 0)
  const square = () => Boolean(t().isPixel)
  const barFocused = () => focusedPart() === 'tabs'
  // The picked pill, which swells to the bar's height while the bar has focus.
  const picked = () => pills().find((p) => p.on) || NO_PICK
  const isFocus = createSelector(() => (focusedPart() === 'rail' ? cur() : -1))
  // Only the cards within a screen of the rail's view are built.
  const shown = createMemo(() => {
    const s = scroll()
    const v = viewW()
    const cw = box().cw
    return cards().filter((c) => c.x + cw >= s - v && c.x <= s + v * 2)
  })
  const at = byKey(shown, GONE)

  const draw = (d) =>
    batch(() => {
      const it = d.item
      if (!m.item || m.item.Id !== it.Id) {
        m.picked = null
        m.lastPart = ''
        m.lastTab = 0
        m.startKey = null
        setCur(0)
        setScroll(0)
      }
      m.item = it
      m.d = d
      const w = d.w || 1688
      setRw(w)
      const all = it.Type === 'Season' ? d.episodes || [] : d.seriesEpisodes || []
      const groups = groupEpisodesBySeason(all)
      const numbers = Array.from(groups.keys())
      const arrivedIn = it.Type === 'Episode' ? it.ParentIndexNumber : undefined
      const season = effectiveSeason(numbers, m.picked, arrivedIn)
      const list = groups.get(season) || []
      m.list = list
      const showsTabs = numbers.length > 1
      const large = Boolean(props.large)
      const cw = large ? Math.round(props.cardW || 350) : SMALL.w
      const gap = large ? LARGE.gap : SMALL.gap
      const mt = cardMetrics(large, large && (props.cardW || 350) >= WIDE_CARD)
      const ih = (cw * 9) / 16
      m.gap = gap
      const tb = showsTabs ? seasonOptions(groups, d.seasons || []).map((o) => ({ id: o.id, label: o.label })) : []
      const on = String(season)
      setTabs(tb)
      setActive(on)
      if (large && showsTabs) {
        let x = LARGE_PAD
        setPills(
          tb.map((tab) => {
            const pw = largePillW(tab.label, tab.id === on)
            const p = { id: tab.id, label: tab.label, x, w: pw, on: tab.id === on }
            x += pw
            return p
          }),
        )
        setBarW(Math.min(x + LARGE_PAD, w))
      } else setPills([])
      if (!list.length) {
        setCards([])
        setBox({ h: 0, railY: 0, railH: 0, cardH: 0, trackW: 0, cw, ih, m: mt })
        return 0
      }
      const lines = Math.max(...list.map((ep) => Math.min(2, wrapLines(ep.Name || '', mt.title, 'bold', cw).length)))
      const cardH = ih + mt.titleTop + lines * mt.title * 1.25
      const barH = large ? LARGE.barH : SMALL.barH
      const barGap = large ? LARGE.barGap : SMALL.barGap
      const railTop = showsTabs ? barH + barGap : 0
      const railH = cardH + CLEARANCE * 2
      m.railTop = railTop
      m.barH = barH
      const current = it.Type === 'Episode' ? it.Id : null
      // minimalistCardUrl asks for twice the width it's given, which the 1080p canvas never draws.
      const url = { settings: d.settings, cardWidth: cw / 2 }
      setCards(
        list.map((ep, i) => {
          const num = ep.IndexNumber != null ? String(ep.IndexNumber) : null
          return {
            k: ep.Id,
            idx: i,
            x: i * (cw + gap),
            img: minimalistCardUrl(d.serverUrl, ep, url) || '',
            title: ep.Name || '',
            titleFont: fontFor(ep.Name || '', 'bold'),
            titleShift: cssShift(mt.title),
            num,
            numText: num || '',
            numFont: fontFor(num || '', 'bold'),
            numW: num ? textWidth(num, mt.num, 'bold') : 0,
            played: Boolean(ep.UserData && ep.UserData.Played),
            current: ep.Id === current,
            item: ep,
          }
        }),
      )
      const h = railTop + railH
      setBox({ h, railY: railTop + CLEARANCE, railH, cardH, trackW: list.length * (cw + gap) - gap, cw, ih, m: mt })
      // An episode's own card is where the rail opens and is entered, once per start card.
      const start = it.Type === 'Episode' ? Math.max(0, list.findIndex((ep) => ep.Id === it.Id)) : 0
      const startKey = list[start] && list[start].Id
      if (startKey !== m.startKey) {
        m.startKey = startKey
        setCur(start)
        setScroll(railScroll(start, cw, gap, list.length, w))
      } else {
        setCur(Math.min(cur(), list.length - 1))
        setScroll(Math.min(scroll(), Math.max(0, list.length * (cw + gap) - gap - w)))
      }
      return h
    })

  const hasTabs = () => tabs().length > 0
  const notify = () => {
    if (!props.onEpisodesFocus) return
    if (m.part === 'tabs') props.onEpisodesFocus({ y: 0, h: m.barH })
    else props.onEpisodesFocus({ y: m.railTop, h: box().railH })
  }
  const reveal = () => {
    const next = revealScroll(scroll(), cur(), box().cw, m.gap, m.list.length, rw(), viewW())
    if (next !== scroll()) setScroll(next)
  }
  const enterRail = () => {
    m.part = 'rail'
    m.lastPart = 'rail'
    setFocusedPart('rail')
    focusSelf()
    reveal()
    notify()
  }
  // The small bar is entered on its first tab and the large one on the picked season.
  const enterTabs = (at) => {
    m.part = 'tabs'
    m.lastPart = 'tabs'
    setFocusedPart('tabs')
    if (props.large) {
      setTabCur(Math.max(0, tabs().findIndex((tab) => tab.id === active())))
      focusSelf()
      notify()
      return
    }
    if (!bar) return
    bar.setFocus()
    const tab = tabs()[at] || tabs()[0]
    m.lastTab = tabs().indexOf(tab)
    // The bar's own focus handler lands on the open tab first, once the focus change applies.
    Promise.resolve().then(() => tab && bar.select(tab.id))
    notify()
  }
  const enter = () => {
    if (m.lastPart === 'rail' || !hasTabs()) return enterRail()
    enterTabs(m.lastPart === 'tabs' ? m.lastTab : 0)
  }
  const edge = (dir) => props.onEpisodesEdge && props.onEpisodesEdge(dir)
  const move = (d) => {
    const n = m.list.length
    const next = cur() + d
    if (next >= 0 && next < n) {
      setCur(next)
      reveal()
      return
    }
    if (d < 0 && props.leftEdge) return edge('left')
    if (d < 0 && navOnLeft()) return focusNav()
    // With nothing out to the side the rail wraps rather than letting focus fall off its end.
    setCur(d < 0 ? n - 1 : 0)
    reveal()
  }
  const pick = (id) => {
    m.picked = Number(id)
    const h = m.d ? draw(m.d) : 0
    if (props.onEpisodesResize) props.onEpisodesResize(h)
  }

  // A held OK opens the card's menu, so a card acts on release.
  const hold = holdPress()

  return (
    <view
      ref={(n) => {
        const own = n.setFocus
        focusSelf = () => own.call(n)
        n.draw = draw
        n.contentHeight = () => box().h
        n.hasTabs = hasTabs
        n.enter = enter
        n.enterTabs = enterTabs
        n.enterRail = enterRail
        n.setFocus = enter
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      alpha={props.alpha == null ? 1 : props.alpha}
      width={viewW()}
      height={box().h}
      onFocusChanged={(has) => {
        if (has) return
        setFocusedPart('')
        hold.cancel()
      }}
      onUp={() => {
        // Up from the rail enters the small bar on its first tab.
        if (m.part === 'rail' && hasTabs()) enterTabs(0)
        else edge('up')
        return true
      }}
      onDown={() => {
        if (m.part === 'tabs') enterRail()
        else edge('down')
        return true
      }}
      onLeft={() => {
        if (m.part === 'rail') move(-1)
        else if (props.large && tabCur() > 0) {
          setTabCur(tabCur() - 1)
          pick(tabs()[tabCur()].id)
        } else if (props.leftEdge) edge('left')
        else if (navOnLeft()) focusNav()
        return true
      }}
      onRight={() => {
        if (m.part === 'rail') move(1)
        else if (props.large && tabCur() < tabs().length - 1) {
          setTabCur(tabCur() + 1)
          pick(tabs()[tabCur()].id)
        }
        return true
      }}
      onEnter={() => {
        if (m.part !== 'rail') return true
        const ep = m.list[cur()]
        if (!ep) return true
        if (!props.onEpisodeLong) {
          if (props.onEpisodeSelect) props.onEpisodeSelect(ep)
          return true
        }
        hold.start(ep, () => {
          props.onEpisodeLong(ep)
        })
        return true
      }}
      onMenu={() => {
        const ep = m.part === 'rail' && m.list[cur()]
        if (!ep || !props.onEpisodeLong) return false
        props.onEpisodeLong(ep)
        return true
      }}
      onEnterRelease={() => {
        return hold.end((ep) => {
          if (props.onEpisodeSelect) props.onEpisodeSelect(ep)
        })
      }}
    >
      <TabBar
        ref={(n) => (bar = n)}
        tabs={props.large ? [] : tabs()}
        active={active()}
        maxW={rw()}
        tokens={props.tokens}
        onTabFocus={(id) => (m.lastTab = Math.max(0, tabs().findIndex((tab) => tab.id === id)))}
        onTabEnter={pick}
      />
      <view alpha={props.large && tabs().length ? 1 : 0} width={barW()} height={73}>
        <view width={barW()} height={73} borderRadius={square() ? 0 : 36.5} color={t().os(0.08)} />
        <view width={barW()} height={73} clipping>
          <view
            x={picked().x}
            y={8}
            width={picked().w}
            height={57}
            borderRadius={square() ? 0 : 28.5}
            color={t().accent}
            alpha={barFocused() ? 0 : 1}
          />
          <view x={picked().x} width={picked().w} height={73} borderRadius={square() ? 0 : 36.5} color={t().accent} alpha={barFocused() ? 1 : 0} />
          <view width={barW()} height={73}>
            <Index each={pills()}>
              {(p) => (
                <text
                  x={p().x + 25}
                  y={23.31}
                  fontFamily={uiFont(p().on ? 'bold' : 'medium')}
                  fontSize={21.7}
                  lineHeight={30.38}
                  letterSpacing={themeSpacing()}
                  color={p().on ? t().onAccent : t().os(0.75)}
                >
                  {p().label}
                </text>
              )}
            </Index>
          </view>
        </view>
        <view
          width={barW()}
          height={73}
          borderRadius={36.5}
          color="#00000001"
          border={{ width: 4, color: hex(t().focus) }}
          alpha={barFocused() ? 1 : 0}
        />
      </view>
      <view y={box().railY - CLEARANCE} width={viewW()} height={box().railH} clipping>
        <view x={-scroll()} y={CLEARANCE} width={Math.max(1, box().trackW)} height={Math.max(1, box().cardH)}>
          <For each={at.keys()}>
            {(k) => {
              const c = () => at.at(k)
              return (
                <EpisodeCard
                  x={c().x}
                  card={c()}
                  w={box().cw}
                  ih={box().ih}
                  m={box().m}
                  focused={isFocus(c().idx)}
                  tokens={props.tokens}
                />
              )
            }}
          </For>
        </view>
      </view>
    </view>
  )
}
