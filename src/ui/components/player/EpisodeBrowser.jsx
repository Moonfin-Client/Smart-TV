import $L from '../../../services/i18n.js'
import { For, createMemo, createSelector, createSignal, onCleanup } from 'solid-js'
import { api, getServerUrl, getUserId } from '../../../services/jellyfinApi.js'
import { withoutBlockedItems } from '../../../services/parentalControls.js'
import { browsableEpisodes, initialSeasonId, seasonIdOf } from '../../../utils/episodeBrowser.js'
import { getImageUrl } from '../../../utils/helpers.js'
import * as settings from '../../../state/settings.js'
import { logoUrl } from '../../images.js'
import { fontFor, uiFont } from '../../text.js'
import { theme, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { keyed } from '../library/pageKit.js'
import { EB, episodeRows, keepInView, revealTab, seasonTabs } from './layouts.js'
import { markerPills } from './animePills.js'
import { areAnimeMarkersEnabled, fetchSeriesMarkers, markerForEpisode } from '../../../services/animeMarkersApi.js'

// What the browser last showed for each series, so opening it again draws at once while it asks
// the server again. The key keeps one viewer's watched marks away from another account.
const cache = {}

const thumb = (ep) =>
  ep.ImageTags && ep.ImageTags.Primary ? getImageUrl(getServerUrl(), ep.Id, 'Primary', { maxWidth: 320, quality: 70, tag: ep.ImageTags.Primary }) : ''

const TITLE_LINE = EB.TITLE_SIZE * 1.17
const BAR_MAX_W = EB.LIST_W
const MARGIN = 300
const COVER = { resizeMode: { type: 'cover' } }
const TAB_GLOW = { color: shadowColor('#ffffff40'), x: 0, y: 0, blur: 14, spread: 1 }
const BADGE_EDGE = { width: 1.5, color: hex('#ffffff') }
const BADGE_SHADOW = { color: shadowColor('#00000099'), x: 0, y: 1.5, blur: 4, spread: 0 }
const TAB_FADE = { duration: 120 }
const TAB_FILL = { duration: 200 }

// The in-player episode browser: a dialog with the series logo, the seasons as tabs and the
// season's episodes underneath. The holder mounts it, calls open(item) with the playing episode,
// focuses it, and hears onEpisode(episode). Back is the holder's. Each row carries the series'
// filler, canon and dub pills when the Moonfin plugin has anime markers for it.
// shortcut: only the signed-in server's episodes are listed. Add the other servers if merged
// libraries reach the player.
export default function EpisodeBrowser(props) {
  const [name, setName] = createSignal('')
  const [nameFont, setNameFont] = createSignal(uiFont('bold'))
  const [logo, setLogo] = createSignal('')
  const [logoW, setLogoW] = createSignal(0)
  const [tabs, setTabs] = createSignal([])
  const [tabAt, setTabAt] = createSignal(0)
  const [seasonAt, setSeasonAt] = createSignal(-1)
  const [tabScroll, setTabScroll] = createSignal(0)
  const [rows, setRows] = createSignal([])
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [zone, setZone] = createSignal('list')
  const [active, setActive] = createSignal(false)
  const [message, setMessage] = createSignal('')
  const msgFont = uiFont()
  const lineFont = uiFont('bold')

  let alive = true
  onCleanup(() => (alive = false))
  let item = null
  let heldEntry = null
  let gen = 0
  let asked = {}
  let seasonsFailed = false
  let placed = false
  let episodes = []
  let seasonId = null
  let markers = null
  let seasons = []

  // The theme colors the panel, its title and rule, the season tabs and the focus ring. The row
  // fills and the progress stay the default blue.
  const t = createMemo(() => theme())
  const shape = createMemo(() => {
    const th = t()
    if (th.isPixel) return { radius: 0, border: { width: 3, color: hex(th.surfaceVariant) } }
    return { radius: 33.39, border: { width: 1, color: hex(th.isGlass ? '#ffffff33' : th.os(0.12)) } }
  })
  const titleH = () => (logo() ? EB.LOGO_H : TITLE_LINE)
  const panelH = () => EB.PANEL_PAD * 2 + titleH() + EB.TITLE_PAD_B + EB.RULE + EB.CONTENT_TOP + EB.CONTENT_H + EB.BORDER * 2
  const panelY = () => (1080 - panelH()) / 2
  const ruleY = () => EB.BORDER + EB.PANEL_PAD + titleH() + EB.TITLE_PAD_B
  const contentY = () => ruleY() + EB.RULE + EB.CONTENT_TOP
  const hasTabs = () => tabs().length > 1
  const listY = () => contentY() + (hasTabs() ? EB.TABS_H : 0)
  const listH = () => EB.CONTENT_H - (hasTabs() ? EB.TABS_H : 0)
  const barW = () => {
    const list = tabs()
    const last = list[list.length - 1]
    return last ? Math.min(BAR_MAX_W, last.x + last.w + 4) : 0
  }
  const tabsW = () => {
    const list = tabs()
    const last = list[list.length - 1]
    return last ? last.x + last.w + 4 : 1
  }
  const maxScroll = () => {
    const list = rows()
    const last = list[list.length - 1]
    return last ? Math.max(0, last.y + last.h + EB.ROW_GAP - listH()) : 0
  }

  // Rows near the scrolled window exist as nodes, the rest are left out.
  const shown = createMemo(() => {
    const top = scroll() - MARGIN
    const bottom = scroll() + listH() + MARGIN
    return rows().filter((r) => r.y + r.h > top && r.y < bottom)
  })
  // Picking a season lays the tabs out again (the picked one is bold), so they stay by key.
  const tabList = keyed(tabs, (tab) => tab.key)
  const rowLit = createSelector(() => (active() && zone() === 'list' ? cur() : -1))
  const tabLit = createSelector(() => (active() && zone() === 'tabs' ? tabAt() : -1))
  const isSeason = createSelector(seasonAt)
  // The shown rows' anime pills, in one list of their own.
  const pills = keyed(
    createMemo(() => {
      const out = []
      shown().forEach((r) => {
        ;(r.pills || []).forEach((pl) =>
          out.push({ ...pl, key: `${r.key}:${pl.key}`, x: 363 + pl.x, y: r.y + r.pillsY, edge: { width: 1, color: hex(pl.border) } }),
        )
      })
      return out
    }),
    (pl) => pl.key,
  )

  const placePlaying = () => {
    const r = rows()[cur()]
    setScroll(Math.min(maxScroll(), Math.max(0, (r ? r.y : 0) - 24)))
  }
  const updateSeasons = (list) => {
    seasons = list ? withoutBlockedItems(list, item.OfficialRating) : []
    const at = seasons.findIndex((s) => String(s.Id) === String(seasonId))
    setSeasonAt(at)
    const laid = seasonTabs(seasons, at)
    setTabs(laid)
    if (zone() !== 'tabs') setTabAt(Math.max(0, at))
    setTabScroll(revealTab(tabScroll(), laid[Math.max(0, at)], barW()))
  }
  // Draws the selected season from what is held, keeping the cursor on the same episode.
  const show = () => {
    const entry = seasonId != null ? heldEntry.bySeason[seasonId] : undefined
    const failed = seasonsFailed || !!(entry && entry.failed)
    const list = !failed && entry && entry.items ? withoutBlockedItems(entry.items, item.OfficialRating) : null
    setMessage(failed ? $L('Failed to load') : !list ? $L('Loading...') : !list.length ? $L('Nothing here yet.') : '')
    const was = episodes[cur()]
    episodes = list || []
    const at = (id) => episodes.findIndex((e) => String(e.Id) === String(id))
    const marks = markers
    const laid = episodeRows(episodes, item.Id, {
      thumb,
      hideOverview: settings.get('hideDetailsMediaDescription') === true,
      pillsFor: (ep) => (marks ? markerPills(markerForEpisode(marks, ep.Id), null, true) : []),
    })
    setRows(laid)
    // The first time episodes show, the list scrolls to the playing one and focus moves to it. That
    // happens once, so season tabs that arrive later don't move the scroll.
    if (!placed && laid.length) {
      placed = true
      setCur(Math.max(0, at(item.Id)))
      placePlaying()
      setZone('list')
      return
    }
    const keep = was ? at(was.Id) : -1
    setCur(Math.max(0, keep))
    setScroll(Math.min(maxScroll(), scroll()))
  }
  // Each season is asked for once per open. A late answer from an earlier open is dropped.
  const loadSeason = (id) => {
    if (id == null || asked[id]) return
    asked[id] = true
    const mine = gen
    api
      .getEpisodes(item.SeriesId, id)
      .then((data) => {
        if (!alive || mine !== gen) return
        heldEntry.bySeason[id] = { items: browsableEpisodes((data && data.Items) || []) }
        if (String(id) === String(seasonId)) show()
      })
      .catch(() => {
        if (!alive || mine !== gen) return
        // A season that was already showing keeps what it has.
        const had = heldEntry.bySeason[id]
        if (!had || !had.items) heldEntry.bySeason[id] = { failed: true }
        if (String(id) === String(seasonId)) show()
      })
  }
  // Starts on the playing season and asks for its episodes together with the season list.
  const open = (it) => {
    const key = `${getServerUrl()}|${getUserId()}|${it.SeriesId}`
    item = it
    heldEntry = cache[key] || (cache[key] = { seasons: null, bySeason: {} })
    gen++
    const mine = gen
    asked = {}
    seasonsFailed = false
    placed = false
    episodes = []
    setZone('list')
    setCur(0)
    setScroll(0)
    setTabScroll(0)
    setLogoW(0)
    setLogo(logoUrl(it, 1185))
    const heading = it.SeriesName || $L('Episodes')
    setName(heading)
    setNameFont(fontFor(heading, 'bold'))
    const known = heldEntry.seasons
    seasonId = known ? initialSeasonId(known, it) : seasonIdOf(it)
    markers = null
    if (areAnimeMarkersEnabled(settings.all()) && it.SeriesId) {
      fetchSeriesMarkers(it.SeriesId, { serverUrl: it._serverUrl })
        .then((m) => {
          if (!alive || mine !== gen || !m) return
          markers = m
          show()
        })
        .catch(() => {})
    }
    updateSeasons(known)
    show()
    loadSeason(seasonIdOf(it))
    loadSeason(seasonId)
    api
      .getSeasons(it.SeriesId)
      .then((data) => {
        if (!alive || mine !== gen) return
        const list = (data && data.Items) || []
        heldEntry.seasons = list
        // The playing season stays selected, unless the server no longer lists it.
        if (!list.some((s) => String(s.Id) === String(seasonId))) {
          seasonId = initialSeasonId(list, it)
          loadSeason(seasonId)
        }
        updateSeasons(list)
        show()
      })
      .catch(() => {
        if (!alive || mine !== gen) return
        seasonsFailed = true
        show()
      })
  }
  const focusRow = (i) => {
    const r = rows()[i]
    if (!r) return
    setCur(i)
    setScroll(keepInView(scroll(), r.y, r.h, listH(), maxScroll() + listH()))
  }
  const pickTab = (at) => {
    const season = seasons[at]
    if (!season) return
    setTabAt(at)
    setTabScroll(revealTab(tabScroll(), tabs()[at], barW()))
    if (at === seasonAt()) return
    setSeasonAt(at)
    seasonId = season.Id
    setTabs(seasonTabs(seasons, at))
    show()
    loadSeason(season.Id)
  }

  return (
    <view
      ref={(n) => {
        n.open = open
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onFocusChanged={setActive}
      onUp={() => {
        if (zone() !== 'list') return true
        if (rows().length && cur() > 0) focusRow(cur() - 1)
        else if (hasTabs()) setZone('tabs')
        return true
      }}
      onDown={() => {
        // From the tabs, Down lands on the first row in view.
        if (zone() === 'tabs') {
          setZone('list')
          const first = rows().findIndex((r) => r.y + r.h > scroll())
          if (first >= 0) focusRow(first)
        } else if (cur() < rows().length - 1) focusRow(cur() + 1)
        return true
      }}
      onLeft={() => {
        if (zone() === 'tabs' && tabAt() > 0) pickTab(tabAt() - 1)
        return true
      }}
      onRight={() => {
        if (zone() === 'tabs' && tabAt() < tabs().length - 1) pickTab(tabAt() + 1)
        return true
      }}
      onEnter={() => {
        if (zone() !== 'list') return true
        const ep = episodes[cur()]
        if (ep && props.onEpisode) props.onEpisode(ep)
        return true
      }}
    >
      <view width={1920} height={1080} color="#0000008a" />
      <view x={325.56} y={panelY()} width={1268.87} height={panelH()}>
        <view
          width={1268.87}
          height={panelH()}
          borderRadius={shape().radius}
          color={t().surface.slice(0, 7) + 'e6'}
          border={shape().border}
        />
        <view
          x={41.07}
          y={34.39}
          width={logoW() || 1}
          height={60.1}
          src={logo()}
          alpha={logo() ? (logoW() ? 1 : 0.001) : 0}
          onEvent={{
            loaded: (_, e) => {
              const d = e && e.dimensions
              if (d && d.w && d.h) setLogoW(Math.min(1185.4, (d.w * EB.LOGO_H) / d.h))
            },
            failed: () => setLogo(''),
          }}
        />
        <text
          alpha={logo() ? 0 : 1}
          fontFamily={nameFont()}
          fontSize={33.39}
          x={41.07}
          y={34.39}
          maxWidth={1186.8}
          maxLines={1}
          color={t().textGlow.length ? t().accent : t().onSurface}
        >
          {name() || ' '}
        </text>
        <view x={1} y={ruleY()} width={1266.87} height={1.67} color={t().os(0.08)} />

        <view alpha={hasTabs() ? 1 : 0} x={34.39} y={contentY() + 6.68} width={Math.max(1, barW())} height={63} clipping>
          <view width={Math.max(1, barW())} height={63} borderRadius={31.5} color={t().os(0.08)} />
          <view transition={{ x: { duration: 250, easing: 'ease-in-out' } }} x={-tabScroll()} width={tabsW()} height={63}>
            <For each={tabList.keys()}>
              {(k) => {
                const tab = tabList.item(k)
                const picked = () => isSeason(tab().i)
                const lit = () => tabLit(tab().i)
                return (
                  <view x={tab().x} y={4} width={tab().w} height={55}>
                    <view width={tab().w} height={55} borderRadius={27.5} color="#00000000" shadow={TAB_GLOW} transition={{ alpha: TAB_FADE }} alpha={lit() ? 1 : 0} />
                    <view
                      width={tab().w}
                      height={55}
                      borderRadius={27.5}
                      transition={{ color: TAB_FILL }}
                      color={picked() ? t().accent : t().accent.slice(0, 7) + '00'}
                    />
                    <view
                      width={tab().w}
                      height={55}
                      borderRadius={27.5}
                      color="#00000000"
                      border={{ width: 3, color: hex(t().focus) }}
                      transition={{ alpha: TAB_FADE }}
                      alpha={lit() ? 1 : 0}
                    />
                    <text
                      fontFamily={fontFor(tab().label, picked() ? 'bold' : 'medium')}
                      fontSize={19}
                      x={25}
                      y={16.4}
                      transition={{ color: TAB_FILL }}
                      color={picked() ? t().onAccent : t().os(0.75)}
                    >
                      {tab().label}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
        </view>

        <view x={34.39} y={listY()} width={1200.09} height={listH()} clipping>
          <text alpha={message() ? 1 : 0} fontFamily={msgFont} fontSize={26} x={8} y={24} color={t().os(0.7)}>
            {message() || ' '}
          </text>
          <view y={-scroll()} width={1200.09} height={maxScroll() + listH()}>
            <view>
              <For each={shown()}>
                {(r) => {
                  const focused = () => rowLit(r.idx)
                  return (
                    <view y={r.y} width={1200.09} height={r.h}>
                      <view width={1200.09} height={r.h} borderRadius={16} color={focused() ? t().accentA(0.3) : r.current ? t().accentA(0.18) : t().os(0.06)} />
                      <view width={1200.09} height={r.h} borderRadius={16} color="#00000000" border={{ width: 3, color: hex(t().accentA(0.5)) }} alpha={!focused() && r.current ? 1 : 0} />
                      <view
                        width={1200.09}
                        height={r.h}
                        borderRadius={16}
                        color="#00000000"
                        border={{ width: 3, color: hex(t().focus) }}
                        alpha={focused() ? 1 : 0}
                      />
                      <view x={17} y={17} width={320} height={180} borderRadius={12} color={t().os(0.08)}>
                        <view alpha={r.thumb ? 0 : 1} x={128} y={58} width={64} height={64} src="icons/episode_placeholder.webp" color={t().os(0.3)} />
                        <view alpha={r.thumb ? 1 : 0} width={320} height={180} borderRadius={12} src={r.thumb} textureOptions={COVER} />
                        <view alpha={r.pct > 0 ? 1 : 0} x={6} y={162} width={308} height={12} borderRadius={6} color="#0000008a">
                          <view height={12} borderRadius={6} color={t().accent} width={Math.max(1, 3.08 * r.pct)} />
                        </view>
                        <view alpha={r.played ? 1 : 0} x={286} y={8} width={26} height={26}>
                          <view width={26} height={26} borderRadius={13} color="#00000000" shadow={BADGE_SHADOW} />
                          <view width={26} height={26} borderRadius={13} color={t().accentA(0.9)} border={BADGE_EDGE} />
                          <view x={5.5} y={5.5} width={15} height={15} src="icons/watched_check.webp" color={t().onAccent} />
                        </view>
                      </view>
                      <text fontFamily={lineFont} fontSize={22} x={363} y={23} color={t().os(0.6)}>
                        {r.line}
                      </text>
                      <text fontFamily={r.titleFont} fontSize={30} x={363} y={54.74} maxWidth={820.09} lineHeight={36} color={t().onSurface}>
                        {r.title || ' '}
                      </text>
                      <text
                        alpha={r.overview ? 1 : 0}
                        fontFamily={r.overviewFont}
                        fontSize={22}
                        x={363}
                        y={64.74 + r.titleH}
                        maxWidth={820.09}
                        maxLines={3}
                        lineHeight={29.7}
                        color={t().os(0.72)}
                      >
                        {r.overview || ' '}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
            <view>
              <For each={pills.keys()}>
                {(k) => {
                  const pl = pills.item(k)
                  return (
                    <view x={pl().x} y={pl().y} width={pl().w} height={23.5} borderRadius={8} color={pl().fill} border={pl().edge}>
                      <text fontFamily={lineFont} fontSize={13} x={10} y={3} lineHeight={19.5} letterSpacing={0.2} color={pl().text}>
                        {pl().label}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
          </view>
        </view>
      </view>
    </view>
  )
}
