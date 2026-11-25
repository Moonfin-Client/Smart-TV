import $L from '../../services/i18n.js'
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import { router } from '../../app/router.js'
import { showPageUnder } from '../../app/PageStack.jsx'
import { OverNav } from '../../ui/layers.jsx'
import { getStore } from '../../state/store.js'
import * as settings from '../../state/settings.js'
import { pageTimers } from '../../ui/components/library/pageKit.js'
import { uiFont, faceDy, textReady, textWidth as uiWidth, themeSpacing } from '../../ui/text.js'
import { theme } from '../../ui/theme.js'
import { highMs, perfTier } from '../../ui/tier.js'
import Keyboard from '../../ui/components/Keyboard.jsx'
import { openNativeInput, usesNativeKeyboard } from '../../ui/components/account/nativeInput.js'
import { fontsReady } from '../../ui/components/party/measure.js'
import { reDy, rowLook } from '../../ui/components/settings/faces.js'
import SettingsList from '../../ui/components/settings/SettingsList.jsx'
import OptionsDialog from '../../ui/components/settings/OptionsDialog.jsx'
import ChecklistDialog from '../../ui/components/settings/ChecklistDialog.jsx'
import ClearDataDialog from '../../ui/components/settings/ClearDataDialog.jsx'
import LivePreview from '../../ui/components/settings/LivePreview.jsx'
import { dp, textWidth } from '../../ui/components/settings/look.js'
import { palette } from '../../ui/components/settings/palette.js'
import { layoutRows, setColumnWidth, COLUMN_W } from '../../ui/components/settings/layoutRows.js'
import { searchBlock } from '../../ui/components/settings/blocks.js'
import { nextStop } from '../../ui/components/settings/focusStops.js'
import { SETTINGS_SCHEMA, SCHEMA_BY_KEY, KIND, resolve, spotlightIdOf } from './settingsSchema.js'
import { screenEntries, navEntry, toLightning } from './schemaEntries.js'
import { SCENE_BY_KEY, describeRow, sceneOfRow } from './previewRows.js'
import { MIN_QUERY_LENGTH, buildSettingsIndex, matchSettings, resultSpotlightId } from './settingsSearch.js'
import { buildCtx, loadCtx } from './settingsCtx.js'
import { SCREENS, CUSTOM } from './screens/index.js'
import { rowOptionsBlockedReason } from './rowOptionsBlocked.js'
import { fx } from '../../ui/components/settings/fx.js'

// Settings with its live preview: the categories in a pill across the top with the search field
// beside it, the chosen category's screens in a column on the left, and a preview of the screen
// the focused setting changes on the right, with the setting spelled out under it. Its page stays
// #101010 under every theme, and only the list column takes the theme's.
//
// The screen modules (screens/*.js, settingsCtx.js) call the page through `page` below.

const PANEL_X = dp(32)
const PILL_FS = dp(15)
const PILL_PAD_X = dp(16)
const PILL_PAD = dp(5)
const PILL_GAP = dp(2)
const SEARCH_W = dp(300)
const SEARCH_MIN = dp(180)
const ENTER_MS = 160
const LEAVE_MS = 130
const COL_H = 883
const COL_X = 53.43
const COL_Y = 156.89
const PREVIEW_X = 828.1
const EASE = 'cubic-bezier(0.33, 1, 0.68, 1)'
const TOAST_EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)'
const PAGE = '#101010ff'
const FADE_MS = 220
// The Friends drawer, which is Settings opened on one screen at the right edge.
const DRAWER_W = dp(420)
const DRAWER_R = [dp(16), 0, 0, dp(16)]
const DRAWER_SLIDE = { x: { duration: FADE_MS, easing: EASE }, alpha: { duration: FADE_MS, easing: EASE } }
const SCRIM_FADE = { alpha: { duration: FADE_MS, easing: 'ease' } }

// A picker or checklist is drawn over the screen it was opened from.
const isOverlay = (view) => view.view === 'options' || view.view === 'checklist'

export default function Settings(props) {
  const store = getStore()
  const timer = pageTimers()
  const intervals = []
  // Opened on one screen (the nav's Friends), Settings is a side drawer over the page, with the
  // categories under that screen so Back walks out the usual way.
  const drawer = Boolean(props.initial && SCREENS[props.initial])
  setColumnWidth(drawer ? DRAWER_W : dp(440))
  onCleanup(() => setColumnWidth(dp(440)))
  const colX = () => (drawer ? 1920 - DRAWER_W : COL_X)
  const colY = () => (drawer ? 0 : COL_Y)
  const colH = () => (drawer ? 1080 : COL_H)
  const [zone, setZone] = createSignal(drawer ? 'list' : 'pill')
  const [category, setCategoryId] = createSignal('')
  const [stack, setStack] = createSignal([])
  const [rowSid, setRowSid] = createSignal(null)
  const [scene, setScene] = createSignal('home')
  const [trying, setTrying] = createSignal(null)
  const [query, setQueryText] = createSignal('')
  const [enterX, setEnterX] = createSignal(0)
  const [enterMs, setEnterMs] = createSignal(0)
  const [leave, setLeave] = createSignal(null)
  const [leaveX, setLeaveX] = createSignal(0)
  const [leaveMs, setLeaveMs] = createSignal(0)
  const [loaded, setLoaded] = createSignal(0)
  const [tick, setTick] = createSignal(0)
  const [kbFrom, setKbFrom] = createSignal('')
  const [clearAsk, setClearAsk] = createSignal(null)
  const [toast, setToast] = createSignal(null)
  const [toastY, setToastY] = createSignal(0)
  const [toastAlpha, setToastAlpha] = createSignal(0)
  const [toastMs, setToastMs] = createSignal(0)
  const [fontsIn, setFontsIn] = createSignal(false)
  const [shown, setShown] = createSignal(perfTier() === 'low')
  const [closing, setClosing] = createSignal(false)
  let topEl
  let listRef
  let leaveRef
  let optionsRef
  let checklistRef
  let previewRef
  let clearRef
  let kb
  let kbOpts = null
  let lastSid = null
  let clearFrom = null
  let toasts = 0

  // The surface the screen modules call. Its methods are added further down, once they're defined.
  const page = { $store: store, $router: router, $setTimeout: timer }
  Object.defineProperties(page, {
    ctx: { get: () => ctx() },
    p: { get: () => p() },
    stack: { get: () => stack() },
    zone: { get: () => zone() },
    current: { get: () => current() },
    loaded: { get: () => untrack(loaded), set: (v) => setLoaded(v) },
  })

  // Widths are estimates until the measuring faces load, so the layouts measure again once they have.
  Promise.all([fontsReady(), textReady()]).then(() => setFontsIn(true))

  const s = () => settings.all()
  const p = createMemo(() => palette())
  const ctx = createMemo(() => buildCtx(page, s(), loaded() + tick()))
  const categories = createMemo(() => {
    const all = s()
    return SETTINGS_SCHEMA.filter((c) => !c.when || c.when({ settings: all })).map((c) => ({ id: c.id, label: resolve(c.label) }))
  })
  const heading = $L('Settings')
  const t = () => theme()
  // The title, the pill and the search field across the top, laid out as a flex row would: the
  // search gives up its width well before the pill does. They take the theme's face.
  const top = createMemo(() => {
    fontsIn()
    store.settingsVersion
    const kids = !!s().kidsModeEnabled
    const width = (text, size) => uiWidth(text, size, 'bold')
    const titleW = width(heading, dp(24))
    const items = categories().map((c) => ({ ...c, w: width(c.label, PILL_FS) + 2 * PILL_PAD_X }))
    const pillW = items.reduce((a, it) => a + it.w, 0) + PILL_GAP * Math.max(0, items.length - 1) + 2 * PILL_PAD
    const rowW = 1920 - 2 * PANEL_X
    const wrapX = PANEL_X + titleW + dp(24)
    let searchW = 0
    let wrapW = rowW - titleW - dp(24)
    if (!kids) {
      const room = wrapW - dp(16)
      const over = pillW + SEARCH_W - room
      searchW = over > 0 ? Math.max(SEARCH_MIN, SEARCH_W - (over * 100 * SEARCH_W) / (pillW + 100 * SEARCH_W)) : SEARCH_W
      wrapW = room - searchW
    }
    const pillX = wrapX + Math.max(0, (wrapW - pillW) / 2)
    let x = PILL_PAD
    const pill = items.map((it, i) => {
      const out = { ...it, i, x }
      x += it.w + PILL_GAP
      return out
    })
    return { titleW, pill, pillX, pillW, wrapX, wrapW, searchX: wrapX + wrapW + dp(16), searchW, kids }
  })
  // The pill is clipped to its room, and a focused category scrolls it just far enough into view,
  // which a pill set in a wide face needs.
  const [pillScroll, setPillScroll] = createSignal(0)
  createEffect(() => {
    if (zone() !== 'pill') return
    const tp = top()
    const it = tp.pill[pillCur()]
    if (!it) return
    const now = untrack(pillScroll)
    const left = tp.pillX - now + it.x
    const right = left + it.w
    if (right > tp.wrapX + tp.wrapW) setPillScroll(now + right - (tp.wrapX + tp.wrapW))
    else if (left < tp.wrapX) setPillScroll(Math.max(0, now - (tp.wrapX - left)))
  })
  const pillCur = () => categories().findIndex((c) => c.id === category())
  const current = () => {
    const st = stack()
    return st[st.length - 1] || { view: 'category', id: category() }
  }
  const base = () => {
    const st = stack()
    if (!st.length) return { view: 'category', id: category() }
    return isOverlay(st[st.length - 1]) ? st[st.length - 2] || st[0] : st[st.length - 1]
  }

  // The page a category opens on: its one screen when it has only one, else its menu.
  const rootViewFor = (id) => {
    const cat = SETTINGS_SCHEMA.find((c) => c.id === id)
    const c = untrack(ctx)
    const visible = ((cat && cat.subcategories) || []).filter((sub) => sub.menu !== false && (!sub.when || sub.when(c)))
    if (visible.length === 1 && !cat.alwaysMenu) {
      const only = visible[0]
      const label = resolve(only.label, c)
      return only.opensView ? { view: only.opensView, label } : { view: 'subcategory', categoryId: id, subcategoryId: only.id, label }
    }
    return { view: 'category', id }
  }
  const subcategoriesOf = (catId) => {
    const cat = SETTINGS_SCHEMA.find((c) => c.id === catId)
    if (!cat) return []
    const c = ctx()
    return cat.subcategories
      .filter((sub) => sub.menu !== false && (!sub.when || sub.when(c)))
      .map((sub) => ({
        id: sub.id,
        label: resolve(sub.label, c),
        description: resolve(sub.description, c),
        section: resolve(sub.section, c),
        icon: sub.icon,
        opensView: sub.opensView,
      }))
  }
  const searchScreen = () => {
    const q = query().trim()
    const index = buildSettingsIndex(SETTINGS_SCHEMA, ctx(), { resolve, spotlightIdOf })
    const results = q.length >= MIN_QUERY_LENGTH ? matchSettings(index, q) : []
    const entries = results.length
      ? results.map((r) => ({
          type: 'card',
          sid: resultSpotlightId(r),
          result: r,
          title: r.title,
          sub: r.breadcrumb,
          subTone: 'caption',
          icon: r.icon,
          iconStyle: 'tile',
          trail: 'chevron',
        }))
      : [{ type: 'text', k: 'none', text: $L('No settings found') }]
    // The results take the place of the categories, under their root title.
    return { title: $L('Settings'), root: true, entries }
  }
  // The drawer's root: the search field over the categories, or over what a query finds.
  // shortcut: the field scrolls with the list instead of staying under the title. Only a long
  // list of results scrolls, so pin it if that shows up on TVs.
  const categoriesScreen = () => {
    const kids = !!s().kidsModeEnabled
    const head = kids ? [] : [searchBlock('settings-search', { sid: 'settings-search-input', value: query(), live: (text) => setQueryText(text) })]
    if (!kids && query().trim()) {
      const found = searchScreen()
      return { ...found, entries: head.concat(found.entries) }
    }
    const entries = categories().map((cat) => {
      const schema = SETTINGS_SCHEMA.find((c) => c.id === cat.id) || {}
      return navEntry('cat-' + cat.id, cat.label, resolve(schema.description, ctx()), schema.icon, { cat })
    })
    return { title: $L('Settings'), root: true, entries: head.concat(entries) }
  }
  // What a view draws: its title, the title's action and its entries.
  const screenFor = (view) => {
    const c = ctx()
    if (view.view === 'category') {
      const subs = subcategoriesOf(view.id)
      const entries = []
      subs.forEach((sub, i) => {
        if (sub.section && sub.section !== (subs[i - 1] && subs[i - 1].section)) entries.push({ type: 'section', k: 'sec-' + sub.section, text: sub.section })
        entries.push(navEntry('subcat-' + sub.id, sub.label, sub.description, sub.icon, { subcat: sub }))
      })
      const cat = categories().find((x) => x.id === view.id)
      const schemaCat = SETTINGS_SCHEMA.find((x) => x.id === view.id)
      return { title: cat ? cat.label : $L('Settings'), clean: !!(schemaCat && schemaCat.clean), entries }
    }
    if (view.view === 'subcategory') {
      const screen = SCHEMA_BY_KEY[`${view.categoryId}.${view.subcategoryId}`]
      if (!screen) return { title: view.label || '', entries: [] }
      const action = screen.appBarAction
      return {
        title: view.label || resolve(screen.label, c),
        action: action ? action.icon : null,
        clean: !!screen.clean,
        entries: screenEntries(screen.rows, c, p(), (row) => (CUSTOM[row.render] ? CUSTOM[row.render](page, row, c) : null)),
      }
    }
    if (view.view === 'searchResults') return searchScreen()
    if (view.view === 'categories') return categoriesScreen()
    const handler = SCREENS[view.view]
    if (handler) {
      return {
        title: handler.title ? handler.title(page, view) : view.label || '',
        action: handler.action ? handler.action(page, view) : null,
        clean: !!handler.clean,
        entries: handler.entries(page, view) || [],
      }
    }
    return { title: view.label || '', entries: [] }
  }
  const screen = createMemo(() => screenFor(base()))
  const layout = createMemo(() => {
    fontsIn()
    const st = stack()
    const sc = screen()
    return layoutRows(sc.entries, !st.length || base() === st[0], rowLook(sc.clean))
  })
  // Rebuilds the screen after a change that isn't a setting.
  const refresh = () => setTick(tick() + 1)

  const described = createMemo(() => {
    const sid = rowSid()
    if (!sid) return null
    const all = s()
    const row = describeRow(sid, all, ctx())
    if (!row) return null
    // Judged with the value a picker is trying, as the preview draws it.
    const tr = trying()
    const judged = tr && tr.key === row.key ? { ...all, [row.key]: tr.value } : all
    const blocked = row.key ? rowOptionsBlockedReason(row.key, judged, ctx().hasMultipleServers) : null
    return blocked ? { ...row, blocked } : row
  })
  const scenes = createMemo(() => {
    const list = ['home', 'details', 'player', 'search']
    const c = ctx()
    if (c.seerr && c.seerr.pluginInfo && c.seerr.pluginInfo.calendarAvailable === true) list.push('calendar')
    if (c.hasLibrary) list.push('library')
    return list
  })
  const tryingHere = () => {
    const row = described()
    const tr = trying()
    return !!(tr && row && tr.key === row.key)
  }
  // The value a picker has focus on, which the preview draws before it's saved.
  const tried = createMemo(() => (tryingHere() ? { [trying().key]: trying().value } : null))
  const live = () => {
    const row = described()
    return tryingHere() ? trying().index : row ? row.saved : -1
  }

  // A pushed screen slides in over the one it opened from, on every tier but the lowest.
  const slideIn = () => {
    if (perfTier() === 'low') return
    setEnterMs(0)
    setEnterX(COLUMN_W)
    timer(() => {
      setEnterMs(ENTER_MS)
      setEnterX(0)
    }, 16)
  }
  // The screen being left slides out over the one it goes back to, as a copy.
  const slideOut = () => {
    if (perfTier() === 'low' || !listRef) return
    const sc = screen()
    const lay = layout()
    setLeaveMs(0)
    setLeaveX(0)
    setLeave({ title: sc.title, clean: !!sc.clean, rows: lay.rows, height: lay.height })
    if (leaveRef) {
      leaveRef.setSid(listRef.getSid())
      leaveRef.setActive(true)
      leaveRef.setScroll(listRef.getScroll())
    }
    timer(() => {
      setLeaveMs(LEAVE_MS)
      setLeaveX(COLUMN_W)
    }, 16)
    timer(() => {
      setLeave(null)
      setLeaveMs(0)
      setLeaveX(0)
    }, LEAVE_MS + 40)
  }
  const push = (view) => {
    if (!isOverlay(view)) slideIn()
    setStack([...stack(), view])
    setTrying(null)
    if (!isOverlay(view)) timer(() => focusList(view.focusSid || null), 0)
  }
  const pop = () => {
    const st = stack()
    if (st.length <= 1) {
      if (drawer) close()
      else toPill()
      return
    }
    const popped = st[st.length - 1]
    if (!isOverlay(popped)) {
      const handler = SCREENS[popped.view]
      if (handler && handler.leave) handler.leave(page, popped)
      slideOut()
    }
    setStack(st.slice(0, -1))
    setTrying(null)
    timer(() => focusList(popped.returnFocusTo || null), 0)
  }
  // Back to the category's own page, as Kids Mode going on or off does.
  const resetStack = () => {
    if (drawer) {
      setStack([{ view: 'categories' }])
      focusList(null)
      return
    }
    setStack([rootViewFor(category())])
    toPill()
  }

  const focusZone = () => {
    const z = zone()
    if (z === 'list') focusList()
    else if (z === 'chips' && previewRef) previewRef.setFocus()
    else if (z === 'options' && optionsRef) optionsRef.setFocus()
    else if (z === 'checklist' && checklistRef) checklistRef.setFocus()
    else if (z === 'keyboard' && kb && kbOpts && !usesNativeKeyboard()) kb.setFocus()
    else if (z === 'clear' && clearRef) clearRef.setFocus()
    else if (topEl) topEl.setFocus()
  }
  // Focus on the list, on [sid] when it's there, else where it was or its first row.
  const focusList = (sid) => {
    if (!listRef) return
    setZone('list')
    listRef.setFocus()
    listRef.setActive(true)
    if (sid && listRef.stopBySid(sid)) listRef.focusSid(sid)
    else if (sid === null || !listRef.stopBySid(listRef.getSid())) listRef.focusFirst()
    else listRef.focusSid(listRef.getSid())
  }
  const toPill = () => {
    setZone('pill')
    setRowSid('cat-' + category())
    setTrying(null)
    if (topEl) topEl.setFocus()
  }
  const toSearch = () => {
    setZone('search')
    if (topEl) topEl.setFocus()
  }
  const setCategory = (id, force) => {
    if (id === category() && !force) return
    // The drawer has no pill: its categories are a screen of their own.
    if (drawer) return setCategoryId(id)
    setCategoryId(id)
    setTrying(null)
    if (query()) setQueryText('')
    setStack([rootViewFor(id)])
    if (listRef) {
      listRef.setSid('')
      listRef.setScroll(0)
    }
  }

  const onListFocus = (sid, stop) => {
    lastSid = sid
    if (stop && stop.onFocus) stop.onFocus(page)
    // A custom row like Check for Updates has no description, so the inspector clears instead of keeping the last row.
    setRowSid(sid)
    const row = describeRow(sid, s(), ctx())
    if (!row) return
    const next = sceneOfRow(row)
    if (next) setScene(next)
  }
  const onListEdge = (dir) => {
    if (drawer) return
    if (dir === 'up') toPill()
    else if (dir === 'right') toChips()
  }
  const stepSlider = (model, dir) => {
    const row = model.row
    const step = row.step
    const now = s()[row.key] == null ? row.min : s()[row.key]
    const next = Math.min(row.max, Math.max(row.min, Math.round((now + dir * step) / step) * step))
    const tidy = Number(next.toFixed(4))
    if (tidy !== now) settings.set(row.key, tidy)
  }
  const onListSide = (sid, dir, stop) => {
    const sider = stop && (stop.side || (stop.row && stop.row.side))
    if (sider && sider(page, dir) !== false) return true
    const view = base()
    const handler = SCREENS[view.view]
    if (handler && handler.side && handler.side(page, sid, dir, stop, view)) return true
    const model = stop && stop.row
    if (model && model.shape === 'slider') {
      stepSlider(model, dir === 'right' ? 1 : -1)
      return true
    }
    // The list moves focus first, and Right that finds nothing in the list goes over to the scene
    // chips through onListEdge.
    return false
  }
  const onListAction = () => {
    const view = base()
    if (view.view === 'subcategory') {
      const sc = SCHEMA_BY_KEY[`${view.categoryId}.${view.subcategoryId}`]
      if (sc && sc.appBarAction) sc.appBarAction.action(ctx())
      return
    }
    const handler = SCREENS[view.view]
    if (handler && handler.onAction) handler.onAction(page, view)
  }
  const openOptions = (picker) => {
    setStack([...stack(), { view: 'options', ...picker }])
    setZone('options')
    const index = Math.max(0, picker.options.findIndex((o) => o.value === picker.value))
    timer(() => {
      if (!optionsRef || zone() !== 'options') return
      optionsRef.setFocus()
      optionsRef.start(index)
    }, 0)
  }
  const onListEnter = (sid, stop) => {
    const view = base()
    const entry = stop && stop.row
    if (stop && stop.press) {
      stop.press(page)
      return
    }
    if (view.view === 'category' && entry && entry.subcat) {
      const sub = entry.subcat
      push(
        sub.opensView
          ? { view: sub.opensView, label: sub.label, returnFocusTo: sid }
          : { view: 'subcategory', categoryId: view.id, subcategoryId: sub.id, label: sub.label, returnFocusTo: sid }
      )
      return
    }
    if (view.view === 'categories' && entry && entry.cat) {
      push({ ...rootViewFor(entry.cat.id), returnFocusTo: sid })
      return
    }
    if ((view.view === 'searchResults' || view.view === 'categories') && entry && entry.result) {
      const r = entry.result
      push({ view: 'subcategory', categoryId: r.categoryId, subcategoryId: r.subcategoryId, label: r.subcategoryLabel, returnFocusTo: sid, focusSid: r.spotlightId })
      return
    }
    const handler = SCREENS[view.view]
    if (handler && handler.enter && handler.enter(page, sid, stop, view)) return
    if (entry && entry.press) {
      entry.press(page)
      return
    }
    const row = entry && entry.row
    if (!row) return
    const c = ctx()
    if (row.kind === KIND.TOGGLE) {
      if (row.onToggle) row.onToggle(c)
      else settings.set(row.key, !s()[row.key])
    } else if (row.kind === KIND.OPTION) {
      const options = row.options(c)
      const value = row.value ? row.value(c) : s()[row.key]
      openOptions({
        title: resolve(row.label, c),
        options: options.map((o) => ({
          value: o.value,
          label: o.label,
          hint: row.subtitleOf ? row.subtitleOf(o.value) : '',
          swatch: row.swatchOf ? toLightning(row.swatchOf(o.value)) : null,
          swatchEdge: row.swatchOf && row.swatchEdge ? null : undefined,
        })),
        settingKey: row.key,
        value,
        onSelect: row.onSelect ? (picked) => row.onSelect(c, picked) : null,
        returnFocusTo: sid,
      })
    } else if (row.kind === KIND.NAV) {
      if (row.action) row.action(c)
    } else if (row.kind === KIND.INFO) {
      if (row.onSelect) row.onSelect(c)
    }
  }

  const onOptionFocus = (index) => {
    const cv = current()
    if (cv.view !== 'options' || !cv.settingKey) return
    const option = cv.options[index]
    if (!option) return
    setTrying({ key: cv.settingKey, value: option.value, index })
    if (SCENE_BY_KEY[cv.settingKey]) setScene(SCENE_BY_KEY[cv.settingKey])
  }
  const applySetting = (key, value) => {
    const c = ctx()
    if (key === 'autoLoginBehavior' && value === 'currentUser') {
      const active = c.activeServer
      settings.update({ autoLoginServerId: (active && active.serverId) || '', autoLoginUserId: (active && active.userId) || '' })
    }
    settings.set(key, value)
    if (key === 'uiLanguage' && c.actions.changeLanguage) c.actions.changeLanguage(value)
  }
  const onOptionPick = (index) => {
    const cv = current()
    const option = cv.options && cv.options[index]
    if (!option) return
    if (cv.onSelect) cv.onSelect(option.value)
    else if (cv.settingKey) applySetting(cv.settingKey, option.value)
    pop()
  }
  const openChecklist = (list) => {
    setStack([...stack(), { view: 'checklist', ...list }])
    setZone('checklist')
    timer(() => {
      if (!checklistRef || zone() !== 'checklist') return
      checklistRef.start(list.options, list.picked || [], list.max, list.sortByLabel)
      checklistRef.setFocus()
    }, 0)
  }
  const onChecklistSave = (picked) => {
    const cv = current()
    if (cv.onSave) cv.onSave(picked)
    pop()
  }

  const toChips = () => {
    if (!previewRef) return
    setZone('chips')
    setTrying(null)
    previewRef.setFocus()
  }
  const onLeaveChips = () => focusList(lastSid || null)
  // Up from a chip goes to whichever of the pill and the search field nextStop finds above it,
  // which turns on where the chip sits under them.
  const onChipsUp = (chip) => {
    const tp = top()
    const stops = [{ sid: 'pill', x: tp.pillX, y: 41.9, w: tp.pillW, h: 76.43 }]
    if (!tp.kids) stops.push({ sid: 'search', x: tp.searchX + 26.71, y: 40.07, w: tp.searchW - 53.43, h: 80.14 })
    const from = chip ? { sid: 'chip', x: PREVIEW_X + chip.x, y: 156.06, w: chip.w, h: 48.36 } : null
    const next = from ? nextStop(stops, from, 'up') : stops[0]
    if (next && next.sid === 'search') toSearch()
    else toPill()
  }

  const setQuery = (value) => {
    setQueryText(value)
    if (value.trim()) setStack([{ view: 'searchResults' }])
    else setStack([rootViewFor(category())])
  }
  // Where the focused field sits on the stage, for the TV's keyboard to rise over.
  const fieldRect = () => {
    const stop = listRef && listRef.current()
    if (!stop) return { x: 80, y: 250, w: 681, h: 67 }
    return { x: colX() + stop.x, y: colY() + 93.5 + stop.y - listRef.getScroll(), w: stop.w, h: stop.h }
  }
  const onKeyboardChange = (text) => {
    const o = kbOpts
    const value = o && o.maxLength ? String(text).slice(0, o.maxLength) : String(text)
    if (o) o.value = value
    if (o && o.live) o.live(value)
  }
  // Closing hands focus back to the field, and Down out of the TV's own keyboard goes on into the list.
  const onKeyboardClose = (submitted, key) => {
    const o = kbOpts || {}
    const from = kbFrom()
    kbOpts = null
    if (submitted && o.done) o.done(o.value || '')
    if (from === 'search') {
      if (key === 'down') focusList(null)
      else toSearch()
    } else focusList()
  }
  const openNativeKeyboard = () => {
    const o = kbOpts || {}
    setZone('keyboard')
    openNativeInput({
      value: o.value || '',
      password: !!o.secret,
      maxLength: o.maxLength,
      rect: o.rect || fieldRect(),
      onChange: (text) => onKeyboardChange(text),
      onClose: (submitted, key) => onKeyboardClose(submitted, key),
    })
  }
  // Text typed for search and the screens that take it: the TV's own keyboard when Keyboard Style
  // is Native, else the on-screen keyboard. [o] is {value, secret, purpose, maxLength, rect,
  // live(text), done(text)}: live hears every change and done the text when it's submitted.
  const openKeyboard = (o) => {
    setKbFrom(zone())
    kbOpts = { ...o, value: o.value || '' }
    if (usesNativeKeyboard()) {
      openNativeKeyboard()
      return
    }
    setZone('keyboard')
    kb.open({ value: kbOpts.value, purpose: o.purpose || 'text', password: !!o.secret, maxLength: o.maxLength, recents: [] })
    kb.setFocus()
  }

  const openAsk = (ask) => {
    clearFrom = lastSid
    setZone('clear')
    setClearAsk({ ask })
    timer(() => zone() === 'clear' && clearRef && clearRef.setFocus(), 0)
  }
  // A canceled Clear All Data hands focus to the pill, and the other asks hand it back to the row.
  const onClearDataCancel = () => {
    const open = clearAsk()
    setClearAsk(null)
    if (open && open.ask) focusList(clearFrom || null)
    else if (drawer) focusList(lastSid || null)
    else toPill()
  }
  const onClearDataConfirm = () => {
    const open = clearAsk()
    const ask = open && open.ask
    setClearAsk(null)
    if (ask) {
      focusList(clearFrom || null)
      ask.onConfirm()
      return
    }
    if (SCREENS.clearAllData) SCREENS.clearAllData(page)
  }

  // A message over the bottom of the screen for four seconds. It rises as it fades in and sinks
  // as it fades out.
  const showToast = (text) => {
    const restY = 1080 - 60 - 49.09
    const n = ++toasts
    setToastMs(0)
    setToastAlpha(0)
    setToastY(restY + 16)
    setToast({ text, w: textWidth(text, 18, 'medium') + 56 })
    timer(() => {
      if (n !== toasts) return
      setToastMs(320)
      setToastAlpha(1)
      setToastY(restY)
    }, 16)
    timer(() => {
      if (n !== toasts) return
      setToastMs(680)
      setToastAlpha(0)
      setToastY(restY + 16)
    }, 3320)
    timer(() => {
      if (n === toasts) setToast(null)
    }, 4000)
  }

  // Leaves Settings for wherever it was opened from, fading out over that screen when it's still
  // there to show (a page kept alive).
  const goBack = () => {
    if (!router.back()) {
      store.navSection = 'home'
      router.to('/home')
    }
  }
  const close = () => {
    if (untrack(closing)) return
    store.navVisible = true
    if (perfTier() === 'low' || !showPageUnder(true)) return goBack()
    setClosing(true)
    timer(goBack, FADE_MS)
  }

  Object.assign(page, {
    $setInterval: (fn, ms) => {
      const id = setInterval(fn, ms)
      intervals.push(id)
      return id
    },
    $clearInterval: (id) => clearInterval(id),
    refresh,
    push,
    pop,
    resetStack,
    focusList,
    openOptions,
    openChecklist,
    openKeyboard,
    openClearData: () => openAsk(null),
    openConfirm: (ask) => openAsk(ask),
    showToast,
  })

  // Kids Mode coming or going swaps the categories out from under the one that was open.
  createEffect(
    on(
      categories,
      (list) => {
        if (!list.some((c) => c.id === untrack(category))) setCategory(list[0].id, true)
      },
      { defer: true }
    )
  )

  {
    const first = untrack(categories)
    const id = (first[0] && first[0].id) || 'account'
    setCategoryId(id)
    // Back from the drawer's screen lands on the first category, past the search field over them.
    setStack(drawer ? [{ view: 'categories' }, { view: props.initial, returnFocusTo: 'cat-' + id }] : [rootViewFor(id)])
    setRowSid('cat-' + id)
  }

  onMount(() => {
    store.navSection = 'settings'
    // The drawer leaves the nav up under its scrim.
    if (!drawer) store.navVisible = false
    loadCtx(page)
    if (!shown()) {
      // The screen it opened over shows through while it fades in.
      timer(() => {
        if (showPageUnder(true) && !drawer) timer(() => showPageUnder(false), FADE_MS)
        setShown(true)
      }, 16)
    }
    if (drawer) {
      // The page it opened on stays drawn under the scrim the whole time.
      // shortcut: a page that isn't kept alive (Search) is already gone, so the scrim covers the
      // app's background there. Keep the opener alive under the drawer if that shows up on TVs.
      showPageUnder(true)
      timer(() => focusList(null), 0)
      return
    }
    focusZone()
  })
  onCleanup(() => {
    intervals.forEach(clearInterval)
    if (page._romm && page._romm.timer) clearInterval(page._romm.timer)
    if (typeof page._prefsSub === 'function') page._prefsSub()
    store.navVisible = true
  })

  // Keys from the top bar and whatever the zones leave.
  const onLeft = () => {
    if (zone() === 'pill') {
      if (pillCur() > 0) setCategory(categories()[pillCur() - 1].id)
      setRowSid('cat-' + category())
    } else if (zone() === 'search') toPill()
    return true
  }
  const onRight = () => {
    if (zone() === 'pill') {
      if (pillCur() < categories().length - 1) {
        setCategory(categories()[pillCur() + 1].id)
        setRowSid('cat-' + category())
      } else if (!top().kids) toSearch()
    }
    return true
  }
  const onDown = () => {
    if (zone() === 'pill' || zone() === 'search') focusList(null)
    return true
  }
  const onEnter = () => {
    // The query filters as it's typed.
    if (zone() === 'search') {
      const tp = top()
      openKeyboard({
        value: query(),
        purpose: 'text',
        rect: { x: tp.searchX + 26.71, y: 40.07, w: tp.searchW - 53.43, h: 80.14 },
        live: (text) => setQuery(text),
        done: (text) => setQuery(text),
      })
    }
    return true
  }
  const onBack = () => {
    const z = zone()
    if (z === 'keyboard') {
      if (kb && kbOpts && !usesNativeKeyboard()) kb.close(false)
      else onKeyboardClose(false)
      return true
    }
    if (z === 'pill') {
      close()
      return true
    }
    if (z === 'search') {
      if (query()) setQuery('')
      else toPill()
      return true
    }
    if (z === 'chips') {
      onLeaveChips()
      return true
    }
    if (isOverlay(current())) {
      pop()
      return true
    }
    if (stack().length <= 1) {
      // A query is its own layer to back out of before leaving the screen.
      if (query() && drawer) {
        setQueryText('')
        focusList('settings-search-input')
        return true
      }
      if (query()) {
        setQuery('')
        toSearch()
        return true
      }
      if (drawer) close()
      else toPill()
      return true
    }
    pop()
    return true
  }

  const pillLit = () => (zone() === 'pill' ? pillCur() : -1)
  // The field keeps its focused look while its keyboard is up.
  const searchFocused = () => zone() === 'search' || (zone() === 'keyboard' && kbFrom() === 'search')
  const fade = () => highMs(90)
  const slideMs = () => highMs(300)
  const scrollMs = () => highMs(120)
  const titleFont = () => uiFont('bold')
  const pillFont = () => uiFont('bold')
  const searchFont = () => uiFont()
  const pixel = () => !!t().isPixel
  const searchSize = () => 23.37 * (pixel() ? 0.6 : 1)
  const overlayView = () => (isOverlay(current()) ? current() : null)
  // The list column: the screen, the copy of the one being left, and the pickers over them.
  const column = (x, y, corners) => (
    <view x={x} y={y} width={COLUMN_W} height={colH()} clipping>
      <view width={COLUMN_W} height={colH()} borderRadius={corners} color={p().column} />
      <view width={COLUMN_W} height={colH()} borderRadius={corners} color={p().page} />
      <SettingsList
        ref={(n) => (listRef = n)}
        x={enterX()}
        xMs={enterMs()}
        title={screen().title}
        root={screen().root}
        action={screen().action}
        clean={screen().clean}
        rows={layout().rows}
        height={layout().height}
        p={p()}
        fade={fade()}
        slide={slideMs()}
        scrollMs={scrollMs()}
        viewH={colH()}
        corners={drawer ? DRAWER_R : undefined}
        onListFocus={onListFocus}
        onListEnter={onListEnter}
        onListSide={onListSide}
        onListEdge={onListEdge}
        onListAction={onListAction}
      />
      <SettingsList
        ref={(n) => (leaveRef = n)}
        alpha={leave() ? 1 : 0}
        x={leaveX()}
        xMs={leaveMs()}
        title={leave() ? leave().title : ''}
        clean={leave() ? leave().clean : false}
        rows={leave() ? leave().rows : []}
        height={leave() ? leave().height : 0}
        p={p()}
        fade={0}
        slide={0}
        scrollMs={0}
        viewH={colH()}
        corners={drawer ? DRAWER_R : undefined}
      />
      <view>
        <Show when={overlayView() && overlayView().view === 'options' ? overlayView() : null} keyed>
          {(view) => (
            <OptionsDialog
              ref={(n) => (optionsRef = n)}
              title={view.title}
              options={view.options}
              current={view.value}
              p={p()}
              colH={colH()}
              onOptionFocus={onOptionFocus}
              onOptionPick={onOptionPick}
            />
          )}
        </Show>
      </view>
      <view>
        <Show when={overlayView() && overlayView().view === 'checklist' ? overlayView() : null} keyed>
          {(view) => (
            <ChecklistDialog
              ref={(n) => (checklistRef = n)}
              title={view.title}
              p={p()}
              colH={colH()}
              onChecklistSave={onChecklistSave}
              onChecklistCancel={pop}
            />
          )}
        </Show>
      </view>
    </view>
  )
  // Clear All Data and the toast, over everything the page draws.
  const overlays = () => (
    <view>
      <view>
        <Show when={clearAsk()}>
          {(open) => (
            <ClearDataDialog
              ref={(n) => (clearRef = n)}
              ask={open().ask}
              onClearDataCancel={onClearDataCancel}
              onClearDataConfirm={onClearDataConfirm}
            />
          )}
        </Show>
      </view>
      <view>
        <Show when={toast()}>
          {(tt) => (
            <view
              transition={fx('y,alpha', toastMs(), TOAST_EASE)}
              x={960 - tt().w / 2}
              y={toastY()}
              width={tt().w}
              height={49.09}
              borderRadius={12}
              color="#1e1e28f2"
              alpha={toastAlpha()}
            >
              <text fontFamily={uiFont('medium')} fontSize={18} lineHeight={21.09} x={28} y={15.53} color="#ffffffff">
                {tt().text}
              </text>
            </view>
          )}
        </Show>
      </view>
    </view>
  )
  if (drawer) {
    const open = () => shown() && !closing()
    return (
      <view
        width={1920}
        height={1080}
        forwardFocus={() => {
          focusZone()
          return true
        }}
      >
        {/* Over the nav: focus stays inside, and Back walks out. */}
        <OverNav>
          <view width={1920} height={1080} onLeft={() => true} onRight={() => true} onUp={() => true} onDown={() => true} onEnter={() => true} onBack={onBack}>
            <view transition={SCRIM_FADE} width={1920 - DRAWER_W} height={1080} color="#0000008a" alpha={open() ? 1 : 0} />
            <view transition={DRAWER_SLIDE} x={open() ? 1920 - DRAWER_W : 1920} width={DRAWER_W} height={1080} alpha={open() ? 1 : 0}>
              <view width={DRAWER_W} height={1080} borderRadius={DRAWER_R} color={PAGE} />
              {column(0, 0, DRAWER_R)}
            </view>
            {overlays()}
          </view>
        </OverNav>
        <Keyboard
          ref={(n) => (kb = n)}
          overlay
          onKeyboardChange={(text) => onKeyboardChange(text)}
          onKeyboardClose={(submitted) => onKeyboardClose(submitted)}
          onKeyboardNative={() => openNativeKeyboard()}
        />
      </view>
    )
  }
  return (
    <view
      width={1920}
      height={1080}
      color={PAGE}
      transition={fx('alpha', shown() ? FADE_MS : 0, 'ease')}
      alpha={shown() && !closing() ? 1 : 0}
      forwardFocus={() => {
        focusZone()
        return true
      }}
      onLeft={onLeft}
      onRight={onRight}
      onUp={() => true}
      onDown={onDown}
      onEnter={onEnter}
      onBack={onBack}
    >
      <view ref={(n) => (topEl = n)} width={1920} height={140}>
        <text
          fontFamily={titleFont()}
          fontSize={40.07}
          lineHeight={33}
          x={53.43}
          y={65.65 + faceDy(40.07, false, titleFont())}
          letterSpacing={themeSpacing()}
          color="#ffffff"
        >
          {heading}
        </text>
        <view x={top().wrapX} width={Math.max(1, top().wrapW)} height={140} clipping>
        <view x={top().pillX - top().wrapX - pillScroll()} y={41.9} width={top().pillW} height={76.43} borderRadius={38.2} color="#ffffff14">
          <For each={top().pill}>
            {(it) => (
              <view
                x={it.x}
                y={8.35}
                width={it.w}
                height={59.72}
                borderRadius={29.86}
                color={it.i === pillLit() ? '#ffffffff' : it.id === category() ? p().accent : '#00000000'}
              >
                <text
                  fontFamily={pillFont()}
                  fontSize={25.04}
                  lineHeight={33}
                  x={26.71}
                  y={15.49 + faceDy(25.04, false, pillFont())}
                  letterSpacing={themeSpacing()}
                  color={it.i === pillLit() ? '#000000ff' : it.id === category() ? '#ffffffff' : '#ffffffc7'}
                >
                  {it.label}
                </text>
              </view>
            )}
          </For>
        </view>
        </view>
        <view x={top().searchX + 26.71} y={40.07} width={Math.max(0, top().searchW - 53.43)} height={80.14} alpha={top().kids ? 0 : 1}>
          <view
            width={Math.max(0, top().searchW - 53.43)}
            height={80.14}
            borderRadius={40.07}
            color={searchFocused() ? p().tileFocusFill : p().surfaceVariant}
          />
          <view x={23.37} y={20.04} width={40.07} height={40.07} src="icons/settings/search.webp" color={searchFocused() ? p().onButtonFocused : p().caption} />
          <text
            fontFamily={searchFont()}
            fontSize={searchSize()}
            lineHeight={33}
            letterSpacing={themeSpacing() || 0.42}
            x={76.79}
            y={25.56 + reDy(23.37, searchSize(), searchFont())}
            maxWidth={Math.max(1, top().searchW - 53.43 - 100)}
            maxLines={1}
            color={query() ? (searchFocused() ? p().onButtonFocused : p().onSurface) : p().os55}
          >
            {query() || $L('Search settings')}
          </text>
        </view>
      </view>

      {column(COL_X, COL_Y, 33.39)}
      <view>
        <LivePreview
          ref={(n) => (previewRef = n)}
          x={PREVIEW_X}
          y={COL_Y}
          scenes={scenes()}
          scene={scene()}
          row={described()}
          live={live()}
          tryingHere={tryingHere()}
          tried={tried()}
          accent={p().accent}
          stageProps={p()}
          colH={COL_H}
          multiServer={ctx().hasMultipleServers}
          bg={PAGE}
          hasLiveTv={ctx().hasLiveTv}
          onPickScene={setScene}
          onLeaveChips={onLeaveChips}
          onChipsUp={onChipsUp}
        />
      </view>

      {overlays()}
      <Keyboard
        ref={(n) => (kb = n)}
        overlay
        onKeyboardChange={(text) => onKeyboardChange(text)}
        onKeyboardClose={(submitted) => onKeyboardClose(submitted)}
        onKeyboardNative={() => openNativeKeyboard()}
      />
    </view>
  )
}
