// The editor screens of Settings: Home's Rows, the action and player buttons and the
// metadata row, the details Sections, the rating sources, the row image types, the Seerr, IMDb
// and TMDB lists, the Seasonal Row, the upcoming calendars, custom lists, and the libraries.
// The rearranging editors work on a copy kept on their view and write it back when they close.
import $L from '../../../services/i18n.js'
import * as settings from '../../../state/settings.js'
import { api, createApiForServer, getServerType, getServerUrl } from '../../../services/jellyfinApi.js'
import { canKeepAsComplete } from '../../../services/incompleteRecordings.js'
import { defaultSettings } from '../../../context/defaultSettings.js'
import { DEFAULT_HOME_ROWS } from '../../../utils/homeLayout.js'
import { ratingKey } from '../../../utils/ratingSources.js'
import { isPickedRow, isSameServer, isSectionTypeRow, isSeerrSliderRow, makePickedRow, makeSeerrSliderRow, serverKey } from '../../../utils/pickedRows.js'
import { getGenresIncludeTypes } from '../../../utils/homeRowSorting.js'
import { isSupportedSlider, loadDiscoverSliders, reconcileSliderRows } from '../../../utils/seerrSliders.js'
import { getSeerrHomeRowConfigs, SEERR_CONFIG_TO_SECTION } from '../../../utils/seerrHomeRows.js'
import { seasonalCountryLabel, seasonalTitle } from '../../../utils/seasonalTitles.js'
import { SEASONAL_COUNTRY_OPTIONS, SEASONAL_HOLIDAYS } from '../../../utils/seasonalRow.js'
import { ordered, hiddenSet, withUnknownIds, DETAIL_BUTTONS, OSD_BUTTONS, DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY, OSD_ORDER_KEY, OSD_HIDDEN_KEY } from '../../../utils/buttonLayout.js'
import { DETAIL_METADATA, DETAIL_METADATA_ORDER_KEY, DETAIL_METADATA_HIDDEN_KEY } from '../../../utils/detailMetadataLayout.js'
import { DETAIL_SECTION_GROUPS, offeredSections, sectionVisibility, toggleHiddenSection } from '../../../utils/detailSectionLayout.js'
import { BORDER_REST, ROW, TOGGLE, dp, textWidth } from '../../../ui/components/settings/look.js'
import { buttonsBlock, cancelSave, inputBlock, spinnerBlock } from '../../../ui/components/settings/blocks.js'
import { COLUMN_W, layoutCard } from '../../../ui/components/settings/layoutRows.js'
import connectionPool from '../../../services/connectionPool.js'
import { resetLibraryScope } from '../../../services/libraryScope.js'
import serverLogger from '../../../services/serverLogger.js'
import { fetchCustomRow, constructSourceUrl } from '../../../services/externalRowsApi.js'
import { buildManualCustomSource, detectCustomSource, sourceKeyForRow, validateCustomRow } from '../../../utils/externalHomeRows.js'
import { isFirstOfServer, isLastOfServer, libraryOrderIcon, moveLibrary, orderedViewsByServer } from '../libraryOrder.js'
import { loadLibraries } from '../../../state/homeRows.js'
import { getStore } from '../../../state/store.js'
import { browseRefresh } from '../../../state/browseCache.js'
import { getChipLabel, getExternalRowSortByOptions, getExternalRowSortOrderOptions, getImageTypeOptions, getLabel, getRatingSourceOptions } from '../settingsOptions.js'
import { HOME_ROW_GROUPS, editorRowName, homeRowGroup, homeRowSource, isHomeRowVisibleByGates, mergeFoundRows, pickedRowLabel } from '../homeSectionsModel.js'
import { toggleEntry } from '../schemaEntries.js'

export const SCREENS = {}
export const CUSTOM = {}

const withOrder = (rows) => rows.map((row, order) => ({ ...row, order }))
const listKey = (items) => items.map((item) => `${item.id}:${item.enabled ? 1 : 0}`).join(',')
const icon = (name) => 'icons/settings/' + name + '.webp'

const ARROW_BOX = dp(48)
const ARROW = dp(24)
const CARET = dp(18)

// One entry of a list the remote rearranges. Left and right move it and OK switches it. [buttons]
// marks the moves with up and down arrows and ends in a switch, a checkbox list marks them with
// side arrows, and a [plain] list draws no card. A [fixed] one has nothing to move.
const reorderEntry = (o) => {
  const hints = []
  let trailW = 0
  const w = o.plain ? COLUMN_W : COLUMN_W - 2 * dp(12)
  const padX = o.plain ? dp(16) : dp(16) + BORDER_REST
  const right = w - 1 - padX
  if (o.buttons) {
    const tail = o.locked ? dp(12) * 2 + CARET : dp(52) + 2 * dp(4)
    const arrows = o.fixed ? 0 : 2 * ARROW_BOX
    trailW = arrows + tail
    let x = right - trailW
    if (!o.fixed) {
      hints.push({ k: 'up', x: x + (ARROW_BOX - ARROW) / 2, size: ARROW, src: icon('keyboard_arrow_up'), off: o.isFirst })
      x += ARROW_BOX
      hints.push({ k: 'down', x: x + (ARROW_BOX - ARROW) / 2, size: ARROW, src: icon('keyboard_arrow_down'), off: o.isLast })
      x += ARROW_BOX
    }
    if (o.locked) hints.push({ k: 'lock', x: x + dp(12), size: CARET, src: icon('lock_outline'), tone: 'lock' })
  } else {
    const carets = (o.isFirst ? 0 : 1) + (o.isLast ? 0 : 1)
    trailW = carets * CARET
    let x = right - trailW
    if (!o.isFirst) {
      hints.push({ k: 'left', x, size: CARET, src: icon('arrow_left') })
      x += CARET
    }
    if (!o.isLast) hints.push({ k: 'right', x, size: CARET, src: icon('arrow_right') })
  }
  const leading = o.checkbox ? (o.enabled ? 'check_box' : 'check_box_outline_blank') : o.icon
  return {
    type: 'card',
    sid: o.sid,
    title: o.title,
    sub: o.subtitle || '',
    subTone: o.plain ? 'caption' : 'desc',
    icon: leading,
    iconStyle: o.plain && o.checkbox ? (o.enabled ? 'checkOn' : 'plain') : o.plain ? 'plain' : o.buttons ? 'strong' : 'tile',
    plainCard: !!o.plain,
    tight: !!o.buttons,
    trail: 'reorder',
    reorderW: trailW,
    hints,
    reorderToggle: !!o.buttons && !o.locked,
    on: !!o.enabled,
    press: o.locked ? null : o.onToggle,
    // Left and right move the row while it can move, and otherwise fall through to the panel.
    side: (page, dir) => {
      if (o.fixed) return false
      if (dir === 'left' && o.isFirst) return false
      if (dir === 'right' && o.isLast) return false
      o.onMove(page, dir === 'left' ? -1 : 1)
      return true
    },
  }
}

// The title's Reset action, as each editor carries it.
const RESET = 'restore'

const PICKABLE_LIMIT = 500
// A server can have hundreds of collections, so an open group lists this many at a time.
const ROW_RENDER_STEP = 60

const groupLabel = (group) => {
  switch (group) {
    case 'collections':
      return $L('Collections')
    case 'favorites':
      return $L('Favorites')
    case 'genres':
      return $L('Genres and Studios')
    case 'playlists':
      return $L('Playlists')
    case 'seerr':
      return $L('Seerr')
    case 'imdb':
      return 'IMDb'
    case 'tmdb':
      return 'TMDB'
    case 'streaming':
      return $L('Streaming Services')
    case 'mdblist':
      return 'MDBList'
    case 'justwatch':
      return 'JustWatch'
    default:
      return $L('General')
  }
}

const rowTitle = (item) => (isPickedRow(item) || isSeerrSliderRow(item) ? item.name : editorRowName($L(item.name)))

// One sign in per server other than this one.
const otherServers = (servers, url) => {
  const seen = [serverKey(url)]
  return (servers || []).filter((server) => {
    const key = serverKey(server.url)
    if (seen.indexOf(key) >= 0) return false
    seen.push(key)
    return true
  })
}

// Everything that can have a row of its own: the collections, genres and playlists of the lists
// switched on, the collections of the other signed in servers while multi-server libraries is on,
// and Silo's own home sections.
const findPickableRows = async (s, servers, rows) => {
  const lists = []
  const url = getServerUrl()
  const add = (source, serverUrl, request) =>
    lists.push(
      request.then(
        (result) => ((result && result.Items) || []).map((item) => makePickedRow({ source, serverUrl, itemId: String(item.Id), name: item.Name }, false, 0)),
        () => []
      )
    )
  if (s.displayCollectionsRows) {
    add('collections', url, api.getCollections(PICKABLE_LIMIT))
    if (s.unifiedLibraryMode) {
      otherServers(servers, url).forEach((server) => {
        const serverApi = createApiForServer(server.url, server.accessToken, server.userId, server.serverType || 'jellyfin')
        add('collections', server.url, serverApi.getCollections(PICKABLE_LIMIT))
      })
    }
  }
  if (s.displayGenresRows) add('genres', url, api.getGenres(undefined, getGenresIncludeTypes(s.genresRowItemFilter)))
  if (s.displayPlaylistsRows) add('playlists', url, api.getPlaylists())
  // A Silo section a section-type row (from Moonbase's defaults) already stands for isn't listed again.
  if (getServerType() === 'silo') {
    const typed = rows.filter((row) => isSectionTypeRow(row) && (!row.serverUrl || isSameServer(row.serverUrl, url))).map((row) => row.itemId)
    add(
      'server',
      url,
      api.getServerHomeSections().then((sections) => {
        const standIns = [...typed]
        return {
          Items: sections
            .filter((section) => {
              const at = standIns.indexOf(`type:${section.kind}`)
              if (at < 0) return true
              standIns.splice(at, 1)
              return false
            })
            .map((section) => ({ Id: section.id, Name: section.title })),
        }
      })
    )
  }
  return [].concat(...(await Promise.all(lists)))
}

const openHomeRows = (page, view) => {
  const s = settings.all()
  const rows = [...(s.homeRows || DEFAULT_HOME_ROWS)].sort((a, b) => a.order - b.order)
  view.rows = rows
  view.opened = listKey(rows)
  view.found = { rows: [], added: {} }
  view.loading = true
  view.groups = {}
  view.limit = ROW_RENDER_STEP
  view.liveTv = true
  api
    .getLiveTvChannels(0, 1)
    .then((result) => {
      view.liveTv = ((result && result.Items) || []).length > 0
      page.refresh()
    })
    .catch(() => {})
  // A failed slider read leaves the slider rows alone, rather than reading as Seerr having none.
  Promise.all([findPickableRows(s, page.ctx.accounts, rows).catch(() => []), s.useMoonfinPlugin ? loadDiscoverSliders({ force: true }).catch(() => null) : null]).then(
    ([found, sliders]) => {
      const reconciled = sliders ? reconcileSliderRows(rows, sliders, getServerUrl()) : { rows, changed: false }
      const merged = mergeFoundRows(reconciled.rows, found)
      // A pick or slider the server dropped or renamed is saved right away.
      if (merged.changed || reconciled.changed) settings.set('homeRows', withOrder(merged.rows))
      view.opened = listKey(merged.rows)
      const added = {}
      merged.added.forEach((row) => (added[row.id] = true))
      view.found = { rows: found, added }
      view.rows = withOrder([...merged.rows, ...merged.added])
      view.loading = false
      page.refresh()
      page.$setTimeout(() => page.focusList(null), 0)
    }
  )
}

// Switching a row on puts it after the last enabled one. Switching one off leaves it in place.
const toggleRowIn = (list, id) => {
  const row = list.find((entry) => entry.id === id)
  if (!row) return list
  if (row.enabled) return list.map((entry) => (entry.id === id ? { ...entry, enabled: false } : entry))
  const rest = list.filter((entry) => entry.id !== id)
  const after = rest.reduce((last, entry, index) => (entry.enabled ? index + 1 : last), 0)
  return [...rest.slice(0, after), { ...row, enabled: true }, ...rest.slice(after)].map((entry, index) => ({ ...entry, order: index }))
}

const homeRowsVisible = (page, view, row) => isHomeRowVisibleByGates(row, settings.all(), view.liveTv, getServerUrl(), page.ctx.seerr.pluginInfo)

SCREENS.homeRows = {
  clean: true,
  title: () => $L('Rows'),
  action: (page, view) => (view.loading ? null : RESET),
  // A reset keeps no picks, so everything found comes back as rows to switch on.
  onAction: (page, view) => {
    const found = view.found.rows
    const added = {}
    found.forEach((row) => (added[row.id] = true))
    view.found = { rows: found, added }
    view.rows = withOrder([...DEFAULT_HOME_ROWS, ...found])
    page.refresh()
  },
  entries: (page, view) => {
    if (!view.rows) openHomeRows(page, view)
    if (view.loading) return [spinnerBlock('spin')]
    const visible = view.rows.filter((row) => homeRowsVisible(page, view, row))
    const enabled = visible.filter((row) => row.enabled)
    const disabled = visible.filter((row) => !row.enabled)
    const subtitle = (item) => {
      if (isSeerrSliderRow(item)) return $L('Seerr Discovery Rows')
      if (isPickedRow(item)) return pickedRowLabel(item, getServerUrl(), page.ctx.accounts)
      const source = homeRowSource(item)
      return source ? $L(source) : ''
    }
    const toggle = (id, nextSid) => (pg) => {
      view.rows = toggleRowIn(view.rows, id)
      pg.refresh()
      // The row slides out of the list it was in, so focus goes to the one taking its place.
      pg.$setTimeout(() => pg.focusList(nextSid), 0)
    }
    // Only enabled rows move, and a press steps over the ones the gates hide.
    const move = (id) => (pg, direction) => {
      const shown = view.rows.filter((row) => row.enabled && homeRowsVisible(pg, view, row))
      const at = shown.findIndex((row) => row.id === id)
      const target = shown[at + direction]
      if (at < 0 || !target) return
      const a = view.rows.findIndex((r) => r.id === id)
      const b = view.rows.findIndex((r) => r.id === target.id)
      const next = [...view.rows]
      next[a] = { ...view.rows[a], order: view.rows[b].order }
      next[b] = { ...view.rows[b], order: view.rows[a].order }
      view.rows = next.sort((x, y) => x.order - y.order)
      pg.refresh()
    }
    const out = [{ type: 'section', k: 'sec-enabled', text: $L('Enabled') }]
    enabled.forEach((item, index) => {
      const next = enabled[index + 1] || enabled[index - 1]
      out.push(
        reorderEntry({
          sid: 'homerow-' + item.id,
          title: rowTitle(item),
          subtitle: subtitle(item),
          checkbox: true,
          enabled: true,
          isFirst: index === 0,
          isLast: index === enabled.length - 1,
          onToggle: toggle(item.id, next ? 'homerow-' + next.id : 'homerows-group-' + homeRowGroup(item)),
          onMove: move(item.id),
        })
      )
    })
    const groups = HOME_ROW_GROUPS.map((group) => ({ group, items: disabled.filter((item) => homeRowGroup(item) === group) })).filter((g) => g.items.length > 0)
    if (groups.length) out.push({ type: 'section', k: 'sec-disabled', text: $L('Disabled') })
    groups.forEach(({ group, items }) => {
      const open = !!view.groups[group]
      out.push({
        type: 'card',
        sid: 'homerows-group-' + group,
        title: groupLabel(group),
        icon: open ? 'keyboard_arrow_down' : 'chevron_right',
        iconStyle: 'plain',
        trail: 'bubble',
        bubble: String(items.length),
        press: (pg) => {
          view.groups[group] = !view.groups[group]
          pg.refresh()
        },
      })
      if (!open) return
      const shown = items.slice(0, view.limit)
      shown.forEach((item, i) => {
        const next = shown[i + 1] || shown[i - 1]
        out.push(
          reorderEntry({
            sid: 'homerow-' + item.id,
            title: rowTitle(item),
            subtitle: subtitle(item),
            checkbox: true,
            enabled: false,
            isFirst: true,
            isLast: true,
            onToggle: toggle(item.id, next ? 'homerow-' + next.id : 'homerow-' + item.id),
            onMove: () => {},
          })
        )
      })
      if (items.length > shown.length) {
        out.push(
          buttonsBlock('more-' + group, [
            {
              sid: 'homerows-more-' + group,
              label: `${$L('Show More')} (${items.length - shown.length})`,
              press: (pg) => {
                view.limit += ROW_RENDER_STEP
                pg.refresh()
              },
            },
          ])
        )
      }
    })
    return out
  },
  leave: (page, view) => {
    if (!view.rows || view.loading) return
    const added = view.found.added
    const rows = withOrder(view.rows.filter((row) => row.enabled || !added[row.id]))
    if (listKey(rows) === view.opened) return
    const updates = { homeRows: rows }
    // Older app versions still show or hide these rows by their own switches, so each follows its row.
    const switchMap = {
      'imdb-top250-movies': 'imdbTop250MoviesEnabled',
      'imdb-top250-tv': 'imdbTop250TvShowsEnabled',
      'imdb-popular-movies': 'imdbMostPopularMoviesEnabled',
      'imdb-popular-tv': 'imdbMostPopularTvShowsEnabled',
      'imdb-lowest-rated': 'imdbLowestRatedMoviesEnabled',
      'imdb-top-english': 'imdbTopEnglishMoviesEnabled',
      seasonal: 'seasonalRowEnabled',
      mdblist_watching_now: 'mdblistWatchingNowEnabled',
    }
    rows.forEach((row) => {
      if (switchMap[row.id]) updates[switchMap[row.id]] = row.enabled
    })
    settings.update(updates)
  },
}

const LAYOUT_ICONS = {
  detail: {
    seerrRequest: 'add', seerrRequest4k: 'add', shuffle: 'shuffle_rounded', version: 'video_file', audio: 'audiotrack', subtitles: 'subtitles',
    trailer: 'movie_outlined', watchWithGroup: 'groups_rounded', watched: 'check_circle_outline', favorite: 'favorite_border',
    personalRating: 'star_outline', goToSeries: 'tv', playlist: 'playlist_add', collection: 'library_add', deleteFiles: 'delete_outline',
    artwork: 'image', seerrWatchlist: 'bookmark_border', seerrReportIssue: 'report_problem_outlined', seerrManage: 'rule',
    keepAsComplete: 'task_alt', admin: 'settings',
  },
  osd: {
    favorite: 'favorite_border', chapters: 'bookmark_outline_rounded', episodes: 'video_library_outlined', subtitles: 'subtitles_outlined',
    audio: 'audiotrack_outlined', castAndCrew: 'people_outline_rounded', quality: 'video_settings_outlined', zoom: 'zoom_out_map',
    sleep: 'bedtime', info: 'info_outline_rounded',
  },
  metadata: {
    year: 'calendar_today_outlined', parentalRating: 'verified_user_outlined', runtimeAndSeasons: 'schedule_outlined', status: 'timelapse_outlined',
    upcomingEpisodeDate: 'event_available_outlined', genres: 'category_outlined', seerrAvailability: 'cloud_download_outlined',
  },
}
const LAYOUT_TITLES = { osd: () => $L('Player Buttons'), metadata: () => $L('Metadata Row'), detail: () => $L('Action Buttons') }
const LAYOUT_DESCRIPTIONS = {
  osd: () => $L('Playback controls are always shown. Everything below is up to you.'),
  metadata: () => $L('Turn metadata items on or off, and arrange the order they appear on the details screen.'),
  detail: () => $L('Play is always first. Everything else is up to you.'),
}

// The details row, the player controls and the metadata row differ only in their keys and catalog.
// Keep as Complete is only offered when the server has Live TV and its recordings can be managed.
const layoutKeys = (kind, hasLiveTv) => {
  if (kind === 'osd') return { catalog: OSD_BUTTONS, orderKey: OSD_ORDER_KEY, hiddenKey: OSD_HIDDEN_KEY }
  if (kind === 'metadata') return { catalog: DETAIL_METADATA, orderKey: DETAIL_METADATA_ORDER_KEY, hiddenKey: DETAIL_METADATA_HIDDEN_KEY }
  const catalog = canKeepAsComplete() && hasLiveTv ? DETAIL_BUTTONS : DETAIL_BUTTONS.filter((item) => item.id !== 'keepAsComplete')
  return { catalog, orderKey: DETAIL_ORDER_KEY, hiddenKey: DETAIL_HIDDEN_KEY }
}

SCREENS.buttonLayout = {
  clean: true,
  title: (page, view) => (LAYOUT_TITLES[view.kind] || LAYOUT_TITLES.detail)(),
  action: () => RESET,
  onAction: (page, view) => {
    view.buttons = layoutKeys(view.kind, page.ctx.hasLiveTv).catalog.map((btn) => ({ ...btn, enabled: true }))
    page.refresh()
  },
  entries: (page, view) => {
    const kind = LAYOUT_TITLES[view.kind] ? view.kind : 'detail'
    if (!view.buttons) {
      const s = settings.all()
      const { catalog, orderKey, hiddenKey } = layoutKeys(kind, page.ctx.hasLiveTv)
      const off = hiddenSet(s[hiddenKey])
      view.buttons = ordered(catalog, s[orderKey]).map((btn) => ({ ...btn, enabled: !off.has(btn.id) }))
      view.opened = listKey(view.buttons)
    }
    const list = view.buttons
    const out = [
      { type: 'text', style: 'hint', k: 'hint', text: LAYOUT_DESCRIPTIONS[kind]() },
      { type: 'text', style: 'hintLast', k: 'hint2', text: $L('Press left or right to move the highlighted button.') },
    ]
    list.forEach((btn, index) => {
      out.push(
        reorderEntry({
          sid: 'layoutbtn-' + btn.id,
          title: $L(btn.label),
          subtitle: btn.subtitle ? $L(btn.subtitle) : '',
          icon: LAYOUT_ICONS[kind][btn.id] || 'tune',
          buttons: true,
          enabled: btn.enabled,
          isFirst: index === 0,
          isLast: index === list.length - 1,
          onToggle: (pg) => {
            view.buttons = view.buttons.map((b) => (b.id === btn.id ? { ...b, enabled: !b.enabled } : b))
            pg.refresh()
          },
          onMove: (pg, delta) => {
            const at = view.buttons.findIndex((b) => b.id === btn.id)
            const target = at + delta
            if (at < 0 || target < 0 || target >= view.buttons.length) return
            const next = [...view.buttons]
            next[at] = view.buttons[target]
            next[target] = view.buttons[at]
            view.buttons = next
            pg.refresh()
          },
        })
      )
    })
    return out
  },
  leave: (page, view) => {
    if (!view.buttons || listKey(view.buttons) === view.opened) return
    const s = settings.all()
    const kind = LAYOUT_TITLES[view.kind] ? view.kind : 'detail'
    const { catalog, orderKey, hiddenKey } = layoutKeys(kind, page.ctx.hasLiveTv)
    const merged = withUnknownIds(
      catalog,
      { order: view.buttons.map((b) => b.id), hidden: view.buttons.filter((b) => !b.enabled).map((b) => b.id) },
      { order: s[orderKey], hidden: s[hiddenKey] }
    )
    settings.update({ [orderKey]: merged.order, [hiddenKey]: merged.hidden })
  },
}

const SECTION_ICONS = {
  logo: 'branding_watermark_outlined', tagline: 'format_quote', poster: 'image_outlined', versionBadge: 'video_file_outlined', upNext: 'skip_next_outlined',
  cast: 'people_outline', crew: 'movie_creation_outlined', studios: 'business_outlined', chapters: 'bookmarks_outlined', extras: 'video_library_outlined',
  collections: 'collections_bookmark_outlined', moreLikeThis: 'recommend_outlined', reviews: 'rate_review', moreEpisodes: 'view_list_outlined',
  mediaInfo: 'info_outline', seerrGenresTags: 'sell_outlined', seerrStats: 'bar_chart', seerrStreaming: 'ondemand_video',
  seerrRecommendations: 'auto_awesome_outlined', seerrSimilar: 'grid_view_outlined', seerrCollection: 'collections_outlined',
  seerrPersonAppearances: 'theaters_outlined', seerrPersonCrew: 'engineering_outlined', biography: 'article_outlined', birthplace: 'place_outlined',
  guestAppearances: 'person_add_alt_outlined', musicVideos: 'music_video_outlined', playlistOrder: 'format_list_numbered',
}

// Switches for the parts of the Details screen the chosen style draws. Each press writes straight away.
SCREENS.detailSections = {
  clean: true,
  title: () => $L('Sections'),
  entries: (page) => {
    const s = settings.all()
    const ctx = page.ctx
    const shows = sectionVisibility(s.hiddenDetailSectionsTv)
    const offered = offeredSections(s.detailScreenStyle, ctx.seerr.isEnabled)
    const out = [
      {
        type: 'text',
        style: 'hintSolo',
        k: 'hint',
        text: $L('Only the sections the current Details screen style can show are listed. Hiding one hides it in every style that has it.'),
      },
    ]
    DETAIL_SECTION_GROUPS.forEach((group) => {
      const sections = offered.filter((section) => section.group === group.id)
      if (!sections.length) return
      out.push({ type: 'section', k: 'sec-' + group.id, text: group.id === 'seerr' ? ctx.seerrLabel : $L(group.label) })
      sections.forEach((section) => {
        out.push(
          reorderEntry({
            sid: 'detail-section-' + section.id,
            title: $L(section.label),
            subtitle: section.subtitle ? $L(section.subtitle) : '',
            icon: SECTION_ICONS[section.id] || 'dashboard_customize_outlined',
            buttons: true,
            fixed: true,
            enabled: shows(section.id),
            onToggle: () => settings.set('hiddenDetailSectionsTv', toggleHiddenSection(settings.get('hiddenDetailSectionsTv'), section.id)),
            onMove: () => {},
          })
        )
      })
    })
    return out
  },
}

// Enabled sources lead in their stored order, the order the ratings row draws them in, and only
// those move. The list is written back when the screen closes.
SCREENS.ratingSources = {
  clean: true,
  title: () => $L('Ratings'),
  action: () => RESET,
  onAction: (page, view) => {
    view.selected = [...defaultSettings[ratingKey(view.surface || '', 'mdblistRatingSources')]]
    page.refresh()
  },
  entries: (page, view) => {
    const key = ratingKey(view.surface || '', 'mdblistRatingSources')
    if (!view.selected) {
      const stored = settings.get(key)
      view.selected = Array.isArray(stored) ? [...stored] : []
      view.opened = view.selected.join(',')
    }
    const options = getRatingSourceOptions()
    const byValue = {}
    options.forEach((o) => (byValue[o.value] = o))
    const sel = view.selected
    const list = [...sel.map((v) => byValue[v]).filter(Boolean), ...options.filter((o) => sel.indexOf(o.value) < 0)]
    const out = [
      {
        type: 'card',
        sid: 'rating-sources-head',
        static: true,
        plainCard: true,
        title: $L('Rating Sources'),
        sub: $L('Enable and reorder the rating sources shown throughout the app'),
        icon: 'reorder',
        iconStyle: 'plain',
        trail: 'none',
      },
    ]
    list.forEach((option) => {
      const index = view.selected.indexOf(option.value)
      out.push(
        reorderEntry({
          sid: 'rating-source-' + option.value,
          title: option.label,
          plain: true,
          checkbox: true,
          enabled: index >= 0,
          isFirst: index <= 0,
          isLast: index < 0 || index === view.selected.length - 1,
          onToggle: (pg) => {
            const now = view.selected
            view.selected = now.indexOf(option.value) >= 0 ? now.filter((v) => v !== option.value) : [...now, option.value]
            pg.refresh()
          },
          onMove: (pg, delta) => {
            const prev = view.selected
            const from = prev.indexOf(option.value)
            const to = from + delta
            if (from < 0 || to < 0 || to >= prev.length) return
            const next = [...prev]
            next.splice(from, 1)
            next.splice(to, 0, option.value)
            view.selected = next
            pg.refresh()
          },
        })
      )
    })
    return out
  },
  leave: (page, view) => {
    if (!view.selected || view.selected.join(',') === view.opened) return
    settings.set(ratingKey(view.surface || '', 'mdblistRatingSources'), view.selected)
  },
}

// One row per enabled home section. A press cycles through Default and the image types, writing
// through straight away.
SCREENS.rowImageTypes = {
  clean: true,
  title: () => $L('Row Image Types'),
  entries: () => {
    const s = settings.all()
    const rows = (s.homeRows || []).filter(
      (row) => row.enabled && row.id !== 'librarybuttons' && row.id !== 'mdblist_watching_now' && !isPickedRow(row) && !isSeerrSliderRow(row)
    )
    const overrides = s.homeRowImageTypes || {}
    const globalLabel = getLabel(getImageTypeOptions(), s.homeRowsImageType, $L('Poster'))
    const out = [{ type: 'text', k: 'desc', text: $L('Choose the artwork each classic home row uses. Default follows the global Home Rows Image Type.') }]
    rows.forEach((row) => {
      const current = overrides[row.id]
      const label = current
        ? (getImageTypeOptions().find((o) => o.value === current) || {}).label || current
        : $L('Default ({global})').replace('{global}', globalLabel)
      out.push({
        type: 'card',
        sid: 'row-image-type-' + row.id,
        title: row.name,
        sub: label,
        subTone: 'caption',
        trail: 'none',
        press: () => {
          const now = settings.get('homeRowImageTypes') || {}
          const order = [undefined, ...getImageTypeOptions().map((o) => o.value)]
          const next = order[(order.indexOf(now[row.id]) + 1) % order.length]
          const updated = { ...now }
          if (next === undefined) delete updated[row.id]
          else updated[row.id] = next
          settings.set('homeRowImageTypes', updated)
        },
      })
    })
    if (!rows.length) out.push({ type: 'text', k: 'none', text: $L('No home rows are enabled') })
    return out
  },
}

// The sort a list screen gives its rows. A direction means nothing for the list's own order or a
// shuffle, so it only shows for the others.
const sortRows = (page, sortByKey, sortOrderKey, title, desc, orderDesc) => {
  const s = settings.all()
  const sortBy = s[sortByKey] || 'none'
  const open = (key, heading, options) =>
    page.openOptions({
      title: heading,
      options: options.map((o) => ({ value: o.value, label: o.label })),
      settingKey: key,
      value: s[key],
      returnFocusTo: 'setting-' + key,
    })
  const out = [
    { type: 'section', k: 'sec-sorting', text: $L('Sorting') },
    {
      type: 'card',
      sid: 'setting-' + sortByKey,
      title,
      sub: desc,
      subTone: 'desc',
      three: true,
      tight: true,
      icon: 'sort',
      iconStyle: 'tile',
      trail: 'bubble',
      bubble: getChipLabel(getExternalRowSortByOptions(), sortBy, $L('Default (List Order)')),
      press: () => open(sortByKey, title, getExternalRowSortByOptions()),
    },
  ]
  if (sortBy !== 'none' && sortBy !== 'shuffle') {
    out.push({
      type: 'card',
      sid: 'setting-' + sortOrderKey,
      title: $L('Sort Order'),
      sub: orderDesc,
      subTone: 'desc',
      three: true,
      tight: true,
      icon: 'swap_vert',
      iconStyle: 'tile',
      trail: 'bubble',
      bubble: getChipLabel(getExternalRowSortOrderOptions(), s[sortOrderKey], $L('Ascending')),
      press: () => open(sortOrderKey, $L('Sort Order'), getExternalRowSortOrderOptions()),
    })
  }
  return out
}

const toggleItem = (sid, title, checked, press) => ({ type: 'card', sid, title, trail: 'toggle', on: checked, press })

SCREENS.imdbLists = {
  clean: true,
  title: () => $L('IMDb Lists'),
  entries: (page) => [
    { type: 'text', k: 'desc', text: $L('Switch IMDb rows on in Home Sections.') },
    ...sortRows(
      page,
      'imdbRowsSortBy',
      'imdbRowsSortOrder',
      $L('IMDb Row Sorting'),
      $L('Sort IMDb rows by name, release date, rating, and more.'),
      $L('Sort IMDb rows in ascending or descending order.')
    ),
  ],
}

SCREENS.externalTmdbLists = {
  clean: true,
  title: () => $L('TMDB Lists'),
  entries: (page) => [
    { type: 'text', k: 'desc', text: $L('Switch TMDB rows on in Home Sections.') },
    ...sortRows(
      page,
      'tmdbRowsSortBy',
      'tmdbRowsSortOrder',
      $L('TMDB Row Sorting'),
      $L('Sort TMDB rows by name, release date, rating, and more.'),
      $L('Sort TMDB rows in ascending or descending order.')
    ),
  ],
}

// The custom sliders a Seerr admin set up come after the rows this app knows, read fresh each
// time the screen opens. A failed read just leaves them off.
SCREENS.seerrHomeRows = {
  clean: true,
  title: (page) => `${page.ctx.seerrLabel} ${$L('Home Rows')}`,
  entries: (page, view) => {
    if (!view.sliders) {
      view.sliders = []
      loadDiscoverSliders({ force: true }).then(
        (list) => {
          view.sliders = list.filter(isSupportedSlider)
          page.refresh()
        },
        () => {}
      )
    }
    const s = settings.all()
    const enabled = {}
    ;(s.homeRows || []).forEach((r) => (enabled[r.id] = r.enabled))
    const toggleSection = (id) => {
      const current = Array.isArray(settings.get('homeRows')) ? settings.get('homeRows') : []
      settings.set('homeRows', current.map((row) => (row.id === id ? { ...row, enabled: !row.enabled } : row)))
    }
    const out = [
      { type: 'text', k: 'desc', text: $L('Choose which Seerr discover rows appear on the home screen.') },
      ...sortRows(
        page,
        'seerrRowsSortBy',
        'seerrRowsSortOrder',
        $L('Seerr Row Sorting'),
        $L('Sort Seerr rows by name, release date, rating, and more.'),
        $L('Sort Seerr rows in ascending or descending order.')
      ),
      { type: 'section', k: 'sec-rows', text: $L('Rows') },
    ]
    getSeerrHomeRowConfigs().forEach((cfg) => {
      const section = SEERR_CONFIG_TO_SECTION[cfg.id] || cfg.id
      out.push(toggleItem('seerrrow-' + cfg.id, cfg.title, enabled[section] === true, () => toggleSection(section)))
    })
    if (view.sliders.length) out.push({ type: 'section', k: 'sec-sliders', text: $L('Seerr Discover Sliders') })
    view.sliders.forEach((slider) => {
      const entry = makeSeerrSliderRow({ serverUrl: getServerUrl(), sliderId: slider.id, sliderType: slider.type, name: slider.title }, true, 0)
      const shown = (s.homeRows || []).some((row) => row.id === entry.id && row.enabled)
      out.push(
        toggleItem('seerrslider-' + slider.id, slider.title, shown, () => {
          // A slider put on Home for the first time joins the end. One taken off keeps its entry.
          const current = Array.isArray(settings.get('homeRows')) ? settings.get('homeRows') : []
          const made = makeSeerrSliderRow({ serverUrl: getServerUrl(), sliderId: slider.id, sliderType: slider.type, name: slider.title }, true, current.length)
          const existing = current.find((row) => row.id === made.id)
          settings.set('homeRows', existing ? current.map((row) => (row.id === made.id ? { ...row, enabled: !row.enabled } : row)) : [...current, made])
        })
      )
    })
    return out
  },
}

const toggleRow = (key, title, desc, iconName) =>
  toggleEntry('setting-' + key, title, desc, iconName, !!settings.get(key), () => settings.set(key, !settings.get(key)))

// The Radarr and Sonarr rows are switched on in Home Sections, and their options show either way.
SCREENS.externalCalendars = {
  clean: true,
  title: () => $L('Upcoming Calendars'),
  entries: (page) => {
    const rows = settings.get('homeRows') || []
    const on = (id) => rows.some((r) => r.id === id && r.enabled)
    const out = [
      { type: 'text', k: 'desc', text: $L('Show upcoming releases from Radarr and Sonarr. Requires the servers to be configured in Seerr.') },
      { type: 'section', k: 'sec-radarr', text: $L('Radarr') },
      toggleRow('radarrCalendarShowCinema', $L('Show Cinema Releases'), '', 'movie'),
      toggleRow('radarrCalendarShowDigital', $L('Show Digital Releases'), '', 'movie'),
      toggleRow('radarrCalendarShowPhysical', $L('Show Physical Releases'), '', 'movie'),
      toggleRow('radarrCalendarShowDate', $L('Show Release Date'), '', 'movie'),
      toggleRow('radarrCalendarHideDownloaded', $L('Hide Movies Already on the Server'), '', 'movie'),
      { type: 'section', k: 'sec-sonarr', text: $L('Sonarr') },
      toggleRow('sonarrCalendarShowEpisodeInfo', $L('Show Episode Information'), '', 'tv'),
      toggleRow('sonarrCalendarShowDate', $L('Show Release Date'), '', 'tv'),
      toggleRow('sonarrCalendarHideDownloaded', $L('Hide Episodes Already on the Server'), '', 'tv'),
    ]
    if (on('radarr_calendar') && on('sonarr_calendar')) {
      out.push(toggleRow('mergeRadarrSonarrCalendars', $L('Merge Into One Row'), $L('Combine Radarr and Sonarr into a single upcoming row'), 'list'))
    }
    if (page.ctx.seerr.pluginInfo && page.ctx.seerr.pluginInfo.calendarAvailable === true) {
      out.push(toggleRow('calendarRowSeeAll', $L('See All card'), $L('End the upcoming rows with a card that opens the calendar'), 'calendar_view_month'))
    }
    return out
  },
}

// Holidays are stored as the hidden ones, so a ticked box is a holiday not in the list.
SCREENS.seasonalRow = {
  clean: true,
  title: () => $L('Seasonal Row'),
  entries: () => {
    const s = settings.all()
    const allYear = s.seasonalRowAllYear === true
    const country = s.seasonalRowCountry || 'auto'
    const hidden = Array.isArray(s.seasonalRowHiddenHolidays) ? s.seasonalRowHiddenHolidays : []
    const out = [{ type: 'text', k: 'desc', text: $L('Show a row of holiday movies from your library, with Seerr suggestions when available.') }]
    if (getServerType() !== 'silo') {
      out.push({
        type: 'card',
        sid: 'setting-seasonalRowAllYear',
        tight: true,
        title: $L('Show All Year'),
        sub: $L('Show a holiday row outside the holiday dates too, a different ticked holiday each day.'),
        subTone: 'desc',
        icon: 'event_repeat',
        iconStyle: 'strong',
        trail: 'toggle',
        on: allYear,
        press: () => settings.update({ seasonalRowAllYear: !allYear }),
      })
    }
    out.push({ type: 'section', k: 'sec-country', text: $L('Country') })
    SEASONAL_COUNTRY_OPTIONS.forEach((code) => {
      out.push({
        type: 'card',
        sid: 'seasonal-country-' + code,
        title: seasonalCountryLabel(code),
        trail: 'check',
        on: code === country,
        selected: code === country,
        press: () => settings.update({ seasonalRowCountry: code }),
      })
    })
    out.push({ type: 'section', k: 'sec-holidays', text: $L('Holidays') })
    out.push({ type: 'text', style: 'caption', k: 'caption', text: $L('Untick a holiday to hide its row.') })
    SEASONAL_HOLIDAYS.forEach((id) => {
      out.push({
        type: 'card',
        sid: 'seasonal-holiday-' + id,
        title: seasonalTitle(id),
        trail: 'toggle',
        on: hidden.indexOf(id) < 0,
        press: () => {
          const now = Array.isArray(settings.get('seasonalRowHiddenHolidays')) ? settings.get('seasonalRowHiddenHolidays') : []
          settings.update({ seasonalRowHiddenHolidays: now.indexOf(id) >= 0 ? now.filter((h) => h !== id) : [...now, id] })
        },
      })
    })
    return out
  },
}

const sourceLabel = (source) => {
  if (source === 'tmdb') return $L('TMDB')
  if (source === 'mdblist') return $L('MDBList')
  if (source === 'letterboxd') return $L('Letterboxd')
  if (source === 'imdb') return $L('IMDb')
  return source
}

// The manual builder's sources and the fields each one asks for.
const builderSources = () => [
  { key: 'tmdb_list', label: $L('TMDB List'), fieldA: $L('List ID'), fieldB: null },
  { key: 'tmdb_collection', label: $L('TMDB Collection'), fieldA: $L('Collection ID'), fieldB: null },
  { key: 'mdblist', label: $L('MDBList'), fieldA: $L('Username'), fieldB: $L('List name') },
  { key: 'letterboxd', label: $L('Letterboxd'), fieldA: $L('Username'), fieldB: null },
]

const builderSorts = () => [
  { value: 'none', label: $L('Default (When Added)') },
  { value: 'title', label: $L('Film Name') },
  { value: 'popularity', label: $L('Popularity') },
  { value: 'year', label: $L('Release Date') },
  { value: 'rating', label: $L('Average Rating') },
  { value: 'shuffle', label: $L('Shuffle') },
]

// The form lives on the page so it outlasts the screen. A reset keeps the mode and the source.
const clearedForm = (f) => ({
  ...f,
  url: '',
  name: '',
  paramA: '',
  paramB: '',
  sortBy: 'none',
  sortOrder: 'desc',
  showUserRatings: true,
  editingId: null,
  error: '',
})
const customForm = (page) =>
  page._customRows ||
  (page._customRows = clearedForm({ mode: 'url', sourceKey: 'tmdb_list', saving: false, refreshing: false, refreshMessage: '' }))

const customRows = () => settings.get('customHomeRows') || []

const refreshAllCustomRows = async (page) => {
  const f = customForm(page)
  const enabled = customRows().filter((row) => row.enabled)
  if (!enabled.length || f.refreshing) return
  f.refreshing = true
  f.refreshMessage = ''
  page.refresh()
  let refreshed = 0
  await Promise.all(
    enabled.map(async (row) => {
      try {
        // forceRefresh also asks the plugin to rebuild its own cache.
        await fetchCustomRow(row, { forceRefresh: true, language: settings.get('uiLanguage') })
        refreshed += 1
      } catch (e) {
        // A list that fails just isn't counted.
      }
    })
  )
  f.refreshing = false
  f.refreshMessage = $L('{done} of {total} lists refreshed').replace('{done}', String(refreshed)).replace('{total}', String(enabled.length))
  page.refresh()
}

const addCustomRow = async (page) => {
  let f = customForm(page)
  f.error = ''
  const detected = f.mode === 'url' ? detectCustomSource(f.url) : buildManualCustomSource(f.sourceKey, f.paramA, f.paramB)
  if (detected.error) {
    f.error = detected.error
    page.refresh()
    return
  }
  const existing = f.editingId ? customRows().find((r) => r.id === f.editingId) : null
  const row = {
    id: f.editingId || `custom_${Date.now()}`,
    name: f.name.trim() || detected.params.id || detected.params.listname || detected.params.user || $L('Custom List'),
    source: detected.source,
    type: detected.type,
    params: detected.params,
    enabled: existing ? existing.enabled : true,
    sortBy: f.sortBy,
    sortOrder: f.sortOrder,
  }
  if (detected.source === 'letterboxd') row.showUserRatings = f.showUserRatings
  f.saving = true
  page.refresh()
  const result = await validateCustomRow(row, { language: settings.get('uiLanguage') }).catch((err) => ({ error: (err && err.message) || $L('Could not load that list') }))
  f = customForm(page)
  f.saving = false
  if (result.error) {
    f.error = result.error
    page.refresh()
    return
  }
  const rows = customRows()
  settings.set('customHomeRows', existing ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row])
  page._customRows = clearedForm(f)
  page.refresh()
}

// Loads a stored row into the form so its ids and sorting can change without removing it.
const editCustomRow = (page, id) => {
  const row = customRows().find((r) => r.id === id)
  if (!row) return
  const f = customForm(page)
  const params = row.params || {}
  // The manual form has no place for an official list's movies or shows choice, so that row opens as its URL.
  if (params.mediatype) {
    f.mode = 'url'
    f.url = constructSourceUrl(row.source, row.type, params)
  } else f.mode = 'manual'
  f.sourceKey = sourceKeyForRow(row)
  f.paramA = params.id || params.username || params.user || ''
  f.paramB = params.listname || ''
  f.name = row.name || ''
  f.sortBy = row.sortBy || 'none'
  f.sortOrder = row.sortOrder || 'desc'
  f.showUserRatings = row.showUserRatings !== false
  f.editingId = id
  f.error = ''
  page.refresh()
}

// A card with its lines stacked in the middle, for the rows that cycle a value and the ones like them.
const centerCard = (sid, title, sub, extra) => ({ type: 'card', sid, title, sub: sub || '', subTone: 'caption', body: 'center', trail: 'none', ...extra })
const bareCard = (sid, title, press) => ({ type: 'card', sid, title, body: 'bare', trail: 'none', press })

const EDGE = dp(12)

// A saved list: a card that isn't focusable itself, holding the part that switches it (which
// draws no focus of its own), its switch, and Edit and Delete as cards inside it.
const customRowBlock = (page, row, f) => {
  const outer = layoutCard({ sid: 'customrow-card-' + row.id, title: row.name, sub: sourceLabel(row.source), subTone: 'caption', body: 'center', trail: 'toggle', on: row.enabled === true })
  const small = (sid, title, press) => {
    const m = layoutCard({ sid, title, body: 'bare', trail: 'none', press })
    return { ...m, k: sid, w: textWidth(title, dp(14), 'bold') + 2 * (dp(16) + BORDER_REST) + 2 }
  }
  const del = small('customrow-del-' + row.id, $L('Delete'), (pg) => settings.set('customHomeRows', customRows().filter((r) => r.id !== row.id)))
  const edit = small('customrow-edit-' + row.id, f.editingId === row.id ? $L('Editing') : $L('Edit'), (pg) => editCustomRow(pg, row.id))
  // Inside the card's padding, Delete keeps its 12 unit margin from the end and Edit sits a margin pair before it.
  const end = EDGE + outer.w - 1 - (dp(16) + BORDER_REST)
  del.x = end - EDGE - del.w
  edit.x = del.x - 2 * EDGE - edit.w
  // The switch ends at Edit's margin, and the body stops the trailing gap short of the switch.
  outer.x = EDGE
  outer.trailX = edit.x - EDGE - outer.x
  outer.bodyW = outer.trailX - (TOGGLE.w + 2 * TOGGLE.margin) - ROW.trailGap - outer.bodyX
  outer.y = ROW.marginY
  outer.k = outer.sid
  del.y = edit.y = ROW.marginY + (outer.h - del.h) / 2
  const cards = [outer, edit, del]
  return {
    type: 'block',
    block: 'edit.cards',
    k: 'customrow-' + row.id,
    h: outer.h + 2 * ROW.marginY,
    cards,
    stops: [
      {
        sid: 'customrow-' + row.id,
        x: outer.x + outer.bodyX,
        y: outer.y + 1 + ROW.padY,
        w: outer.bodyW,
        h: outer.h - 2 - 2 * ROW.padY,
        press: () => settings.set('customHomeRows', customRows().map((r) => (r.id === row.id ? { ...r, enabled: !r.enabled } : r))),
      },
      { sid: edit.sid, x: edit.x, y: edit.y, w: edit.w, h: edit.h, press: edit.press },
      { sid: del.sid, x: del.x, y: del.y, w: del.w, h: del.h, press: del.press },
    ],
  }
}

SCREENS.externalCustomRows = {
  clean: true,
  title: () => $L('Custom Home Rows'),
  entries: (page) => {
    const f = customForm(page)
    const rows = customRows()
    const sources = builderSources()
    const sorts = builderSorts()
    const source = sources.find((x) => x.key === f.sourceKey) || sources[0]
    const sort = sorts.find((x) => x.value === f.sortBy) || sorts[0]
    const editing = !!f.editingId
    const manual = f.mode === 'manual' || editing
    const set = (patch) => {
      Object.assign(customForm(page), patch)
      page.refresh()
    }
    const field = (k, sid, label, key, options) =>
      inputBlock(k, {
        sid,
        label,
        value: f[key],
        ...options,
        onLive: (value) => set({ [key]: value, ...(key === 'url' ? { error: '' } : {}) }),
        onDone: (value) => set({ [key]: value, ...(key === 'url' ? { error: '' } : {}) }),
      })
    const out = [{ type: 'text', k: 'desc', text: $L('Add a home row from a TMDB list or collection, an MDBList list, or a Letterboxd profile.') }]
    if (rows.some((row) => row.enabled)) {
      out.push(
        centerCard('custom-rows-refresh-all', f.refreshing ? $L('Refreshing...') : $L('Refresh All Enabled Lists'), f.refreshMessage || $L('Fetch fresh items for every enabled list'), {
          press: (pg) => (customForm(pg).refreshing ? null : refreshAllCustomRows(pg)),
        })
      )
    }
    rows.forEach((row) => out.push(customRowBlock(page, row, f)))
    out.push(
      centerCard(
        'custom-row-mode',
        editing ? $L('Editing Saved Row') : $L('Add By'),
        editing ? $L('Changes apply to the row being edited') : f.mode === 'url' ? $L('Pasted URL') : $L('Source and IDs'),
        { press: () => (editing ? null : set({ mode: f.mode === 'url' ? 'manual' : 'url' })) }
      )
    )
    if (f.mode === 'url' && !editing) {
      out.push(field('url', 'custom-row-url-input', $L('List URL'), 'url', { placeholder: $L('Paste a TMDB, MDBList, or Letterboxd URL'), purpose: 'url' }))
    }
    if (manual) {
      out.push(
        centerCard('custom-row-source', $L('Source'), source.label, {
          press: () => set({ sourceKey: sources[(sources.findIndex((x) => x.key === f.sourceKey) + 1) % sources.length].key }),
        })
      )
      out.push(field('param-a', 'custom-row-param-a', source.fieldA, 'paramA', {}))
      if (source.fieldB) out.push(field('param-b', 'custom-row-param-b', source.fieldB, 'paramB', {}))
    }
    out.push(field('name', 'custom-row-name-input', $L('Row Name (optional)'), 'name', { placeholder: $L('Home row title') }))
    out.push(
      centerCard('custom-row-sort-by', $L('Sort By'), sort.label, {
        // The title sort reads naturally A to Z, everything else biggest first.
        press: () => {
          const next = sorts[(sorts.findIndex((x) => x.value === f.sortBy) + 1) % sorts.length].value
          set({ sortBy: next, sortOrder: next === 'title' ? 'asc' : 'desc' })
        },
      })
    )
    if (f.sortBy !== 'none' && f.sortBy !== 'shuffle') {
      out.push(
        centerCard('custom-row-sort-order', $L('Sort Order'), f.sortOrder === 'asc' ? $L('Ascending') : $L('Descending'), {
          press: () => set({ sortOrder: f.sortOrder === 'asc' ? 'desc' : 'asc' }),
        })
      )
    }
    if (f.sourceKey === 'letterboxd' && manual) {
      out.push(
        centerCard('custom-row-user-ratings', $L('Show User Ratings'), $L("Show the profile owner's star ratings on cards"), {
          trail: 'toggle',
          on: !!f.showUserRatings,
          press: () => set({ showUserRatings: !f.showUserRatings }),
        })
      )
    }
    if (f.error) out.push({ type: 'text', k: 'err', text: f.error })
    out.push(bareCard('custom-row-add', f.saving ? $L('Checking...') : editing ? $L('Save Changes') : $L('Add Row'), (pg) => (customForm(pg).saving ? null : addCustomRow(pg))))
    if (editing) out.push(bareCard('custom-row-cancel-edit', $L('Cancel Edit'), (pg) => set({ ...clearedForm(customForm(pg)) })))
    return out
  },
}

// Jellyfin's 400 doesn't say which field it couldn't read, so the library ids that were sent go
// into the diagnostics log along with its reply.
const saveLogged = (saving, config) =>
  saving.catch((err) => {
    if (err && err.status >= 400 && err.status < 500) {
      serverLogger.error(serverLogger.LOG_CATEGORIES.NETWORK, `User configuration rejected with ${err.status}.${err.body ? ' ' + err.body : ''}`, {
        OrderedViews: config.OrderedViews,
        MyMediaExcludes: config.MyMediaExcludes,
        LatestItemsExcludes: config.LatestItemsExcludes,
        GroupedFolders: config.GroupedFolders,
      })
    }
    throw err
  })

const unifiedLibraries = (page) => !!settings.get('unifiedLibraryMode') && !!page.ctx.hasMultipleServers
const libraryName = (lib, unified) => `${lib.Name}${unified && lib._serverName ? ` (${lib._serverName})` : ''}`

// The rows narrow themselves against the library list, so it's read again before the refresh.
const librariesChanged = (detail) => {
  resetLibraryScope()
  loadLibraries()
    .then((libs) => {
      const st = getStore()
      if (st) st.libraries = libs
    })
    .catch(() => {})
  browseRefresh(detail)
}

// Which libraries the viewer has hidden. This lives on the Jellyfin user configuration rather
// than in app settings, and in unified mode it's written to every server.
const loadLibraryVisibility = async (page, view) => {
  view.loading = true
  try {
    if (unifiedLibraries(page)) {
      const [all, configs] = await Promise.all([connectionPool.getAllLibrariesFromAllServers(), connectionPool.getUserConfigFromAllServers()])
      view.libraries = all.filter((lib) => lib.CollectionType)
      view.configs = configs
      const excluded = configs.reduce((acc, cfg) => acc.concat((cfg.configuration && cfg.configuration.MyMediaExcludes) || []), [])
      view.hidden = excluded.filter((id, i) => excluded.indexOf(id) === i)
    } else {
      const [views, user] = await Promise.all([api.getAllLibraries(), api.getUserConfiguration()])
      view.libraries = ((views && views.Items) || []).filter((lib) => lib.CollectionType)
      view.hidden = [...((user && user.Configuration && user.Configuration.MyMediaExcludes) || [])]
    }
  } catch (err) {
    console.error('Failed to load libraries:', err)
  }
  view.loading = false
  page.refresh()
  page.$setTimeout(() => page.focusList(null), 0)
}

const saveLibraryVisibility = async (page, view) => {
  view.saving = true
  page.refresh()
  try {
    if (unifiedLibraries(page)) {
      const excludes = {}
      view.libraries.forEach((lib) => {
        const key = lib._serverUrl
        if (!excludes[key]) excludes[key] = []
        if (view.hidden.indexOf(lib.Id) >= 0) excludes[key].push(lib.Id)
      })
      await Promise.all(
        (view.configs || []).map((cfg) => {
          const updated = { ...cfg.configuration, MyMediaExcludes: excludes[cfg.serverUrl] || [] }
          return saveLogged(connectionPool.updateUserConfigOnServer(cfg.serverUrl, cfg.accessToken, cfg.userId, updated, cfg.serverType), updated)
        })
      )
    } else {
      const user = await api.getUserConfiguration()
      const updated = { ...user.Configuration, MyMediaExcludes: view.hidden }
      await saveLogged(api.updateUserConfiguration(updated), updated)
    }
    view.saving = false
    page.pop()
    // Hiding a library can change the media bar, so it's redrawn along with the rows.
    librariesChanged({ featured: true, libraries: true })
  } catch (err) {
    console.error('Failed to save library visibility:', err)
    view.saving = false
    page.refresh()
    page.showToast($L('Could not save your settings.'))
  }
}

SCREENS.libraries = {
  clean: true,
  title: () => $L('Hide Libraries'),
  entries: (page, view) => {
    if (!view.libraries) {
      view.libraries = []
      view.hidden = []
      loadLibraryVisibility(page, view)
    }
    const out = [{ type: 'text', k: 'desc', text: $L('Hidden libraries are removed from all Jellyfin clients. This is a server-level setting.') }]
    if (view.loading) {
      out.push({ type: 'text', style: 'loading', k: 'loading', text: $L('Loading libraries...') })
      return out
    }
    const unified = unifiedLibraries(page)
    view.libraries.forEach((lib) => {
      const isHidden = view.hidden.indexOf(lib.Id) >= 0
      out.push(
        centerCard('lib-' + lib.Id, libraryName(lib, unified), isHidden ? $L('Hidden') : $L('Visible'), {
          trail: 'toggle',
          on: !isHidden,
          press: (pg) => {
            view.hidden = view.hidden.indexOf(lib.Id) >= 0 ? view.hidden.filter((id) => id !== lib.Id) : [...view.hidden, lib.Id]
            pg.refresh()
          },
        })
      )
    })
    out.push(
      cancelSave('lib-btns', {
        cancelSid: 'lib-cancel',
        saveSid: 'lib-save',
        saveLabel: view.saving ? $L('Saving...') : $L('Save'),
        saveBusy: view.saving,
        onCancel: (pg) => pg.pop(),
        onSave: (pg) => saveLibraryVisibility(pg, view),
      })
    )
    return out
  },
}

// A run of moves goes out as one write instead of one per move.
const ORDER_SAVE_MS = 600

const loadLibraryOrder = async (page, view) => {
  view.loading = true
  view.loadFailed = false
  page.refresh()
  try {
    let loaded
    let configurations
    if (view.unified) {
      const [all, configs] = await Promise.all([connectionPool.getAllLibrariesFromAllServers(), connectionPool.getUserConfigFromAllServers()])
      loaded = all
      configurations = configs.map((config) => config.configuration)
    } else {
      const [views, user] = await Promise.all([api.getAllLibraries(), api.getUserConfiguration()])
      loaded = (views && views.Items) || []
      configurations = [user && user.Configuration]
    }
    view.libraries = loaded
    view.saved = loaded
    view.hidden = configurations.reduce((ids, c) => ids.concat((c && c.MyMediaExcludes) || []), [])
  } catch (e) {
    view.loadFailed = true
  }
  view.loading = false
  page.refresh()
  // Nothing here can take focus while the list loads, so the first row, or Retry, asks for it once it shows.
  if (view.libraries && view.libraries.length) page.$setTimeout(() => page.focusList(rowIdOf(view.libraries[0])), 0)
  else if (view.loadFailed) page.$setTimeout(() => page.focusList('library-order-retry'), 0)
}

// The server replaces the whole configuration on every write, so each save starts from the
// configuration as it is now.
const writeLibraryOrder = async (ordered, unified) => {
  const orders = orderedViewsByServer(ordered)
  if (!unified) {
    const user = await api.getUserConfiguration()
    await api.updateUserConfiguration({ ...user.Configuration, OrderedViews: orders[''] || [] })
    return
  }
  const configs = await connectionPool.getUserConfigFromAllServers()
  if (Object.keys(orders).some((url) => !configs.some((config) => config.serverUrl === url))) throw new Error('A server did not return its configuration')
  await Promise.all(
    configs
      .filter((config) => orders[config.serverUrl])
      .map((config) =>
        connectionPool.updateUserConfigOnServer(config.serverUrl, config.accessToken, config.userId, { ...config.configuration, OrderedViews: orders[config.serverUrl] }, config.serverType)
      )
  )
}

// Queued so writes land in the order they were made and a slow one can't undo a later move. A
// failed write puts the order the servers last took back.
const saveLibraryOrder = (page, view) => {
  const ordered = view.libraries
  if (!ordered) return
  const id = (view.saveId = (view.saveId || 0) + 1)
  view.queue = (view.queue || Promise.resolve()).then(async () => {
    try {
      await writeLibraryOrder(ordered, view.unified)
      view.saved = ordered
      librariesChanged({ libraries: true })
    } catch (e) {
      if (view.closed || id !== view.saveId) return
      clearTimeout(view.timer)
      view.timer = null
      view.libraries = view.saved
      page.refresh()
      page.showToast($L("Couldn't save the library order"))
    }
  })
}

const rowIdOf = (library) => 'library-order-' + library.Id

SCREENS.libraryOrder = {
  clean: true,
  title: () => $L('Library Order'),
  entries: (page, view) => {
    if (view.libraries === undefined) {
      view.libraries = null
      view.hidden = []
      view.unified = unifiedLibraries(page)
      loadLibraryOrder(page, view)
    }
    const out = [
      {
        type: 'text',
        style: 'hint',
        k: 'hint',
        text: $L(
          'Your libraries appear in this order on My Media, the recently added rows and the navigation bar. The order is saved to your server account, so other apps you sign in to use it too.'
        ),
      },
      { type: 'text', style: 'hintClean', k: 'hint2', text: $L('Press left or right to move the highlighted library.') },
    ]
    if (view.loading) {
      out.push(spinnerBlock('spin'))
      return out
    }
    if (view.loadFailed) {
      out.push({ type: 'text', style: 'orderMessageLead', k: 'failed', text: $L('Failed to load libraries') })
      out.push(
        buttonsBlock('retry', [{ sid: 'library-order-retry', label: $L('Retry'), press: (pg) => loadLibraryOrder(pg, view) }], { align: 'center', padTop: 0, padBottom: 8 })
      )
      return out
    }
    const libs = view.libraries || []
    if (!libs.length) {
      out.push({ type: 'text', style: 'orderMessage', k: 'none', text: $L('No libraries found') })
      return out
    }
    libs.forEach((library, index) => {
      out.push(
        reorderEntry({
          sid: rowIdOf(library),
          title: libraryName(library, view.unified),
          subtitle: view.hidden.indexOf(library.Id) >= 0 ? $L('Hidden') : '',
          icon: libraryOrderIcon(library),
          plain: true,
          isFirst: isFirstOfServer(libs, index),
          isLast: isLastOfServer(libs, index),
          onToggle: null,
          onMove: (pg, delta) => {
            const at = view.libraries.findIndex((l) => l.Id === library.Id && l._serverUrl === library._serverUrl)
            const next = at >= 0 && moveLibrary(view.libraries, at, at + delta)
            if (!next) return
            view.libraries = next
            pg.refresh()
            clearTimeout(view.timer)
            view.timer = setTimeout(() => {
              view.timer = null
              saveLibraryOrder(pg, view)
            }, ORDER_SAVE_MS)
          },
        })
      )
    })
    return out
  },
  // Backing out right after a move still keeps the move.
  leave: (page, view) => {
    view.closed = true
    if (view.timer) {
      clearTimeout(view.timer)
      view.timer = null
      saveLibraryOrder(page, view)
    }
  },
}
