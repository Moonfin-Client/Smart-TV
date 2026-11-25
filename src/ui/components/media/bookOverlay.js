// The EPUB and PDF readers. epub.js and pdf.js draw into the DOM, which the canvas can't host, so
// the reader, its menus and its panels are a full-screen DOM layer above it. The layer takes every
// key itself while it's open, and calls onClose().
import $L from '../../../services/i18n.js'
import { fetchBook, loadScript, startPage, epubTicks, newerServerEpubFraction } from '../../../utils/books.js'
import { loadEpubJs, openEpub } from '../../../utils/epubEngine.js'
import {
  READER_DEFAULTS,
  READER_SETTINGS_KEY,
  FIXED_LAYOUT_INVERT_KEY,
  PAGE_THEMES,
  FONT_SCALE_RANGE,
  BRIGHTNESS_RANGE,
  WARMTH_RANGE,
  normalizeReaderSettings,
  readerPageStyle,
  readerTint,
} from '../../../utils/readerSettings.js'
import { getFromStorage, saveToStorage } from '../../../services/storage.js'
import { getApiForItem } from '../../../services/connectionPool.js'
import { api as activeApi, getServerType, getServerUrl, getApiKey } from '../../../services/jellyfinApi.js'
import { theme } from '../../theme.js'
import { pageProgress } from './bookProgress.js'
import { h, nextSpot, readerCss, spot, svgIcon } from './readerDom.js'
import { assetUrl } from '../../../utils/assetUrl.js'

const INFO_MS = 4000
const SCRUB_STEP = 0.01
const KEY = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 32: 'enter' }
const BACK_KEYS = { 461: 1, 10009: 1, 27: 1, 8: 1 }

const ICONS = {
  contents: 'M3 18H21V15.98H3V18ZM3 12.98H21V11.02H3V12.98ZM3 6V8.02H21V6H3Z',
  bookmark: 'M17.02 3H6.98C5.91 3 5.02 3.89 5.02 5.02V21L12 18L18.98 21V5.02C18.98 3.89 18.09 3 17.02 3Z',
  bookmarkBorder:
    'M17.02 3H6.98C5.91 3 5.02 3.89 5.02 5.02V21L12 18L18.98 21V5.02C18.98 3.89 18.09 3 17.02 3ZM17.02 18 12 15.8 6.98 18V5.02H17.02V18Z',
  invert:
    'M12 4.83V18.98C8.67 18.98 6 16.36 6 13.12C6 11.58 6.61 10.08 7.73 9L12 4.83ZM6.33 7.55C4.92 9 3.98 10.97 3.98 13.12C3.98 17.48 7.59 21 12 21C16.41 21 20.02 17.48 20.02 13.12C20.02 10.97 19.08 9 17.67 7.55L12 2.02L6.33 7.55Z',
  selected: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-1.4 14.6L6.4 12.4l1.4-1.4 2.8 2.8 5.6-5.6 1.4 1.4z',
  unselected: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16m0-2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
}

const navHint = (withBack) =>
  ['◀ ▶ ' + $L('Navigate'), 'OK ' + $L('Menu')].concat(withBack ? [$L('Back') + ' ' + $L('Close')] : []).join('   ')

let styled = false
const ensureStyle = () => {
  if (styled) return
  styled = true
  const t = theme()
  const css = (c) => {
    const v = String(c).replace('#', '')
    const a = v.length > 6 ? parseInt(v.slice(6, 8), 16) / 255 : 1
    return 'rgba(' + parseInt(v.slice(0, 2), 16) + ',' + parseInt(v.slice(2, 4), 16) + ',' + parseInt(v.slice(4, 6), 16) + ',' + a.toFixed(3) + ')'
  }
  const style = document.createElement('style')
  style.textContent = readerCss({ accent: css(t.accent), accentA30: css(t.accentA(0.3)), onSurface: css(t.onSurface) })
  document.head.appendChild(style)
}

// Reader sizes are set for a 960 by 540 page and scaled up to the screen.
const pageStyleFor = (settings) => {
  const unit = window.innerHeight / 540
  return readerPageStyle(settings, { baseSize: 18 * unit, unit })
}

// The chapter on screen: the first entry for the latest section at or before it.
const chapterAt = (toc, index) => {
  let found = -1
  toc.forEach((entry, i) => {
    if (entry.index >= 0 && entry.index <= index && (found < 0 || entry.index > toc[found].index)) found = i
  })
  return found
}

const percent = (value) => Math.round(value * 100) + '%'

// The loading or failure cover over the page.
const cover = (cls) => {
  const node = h('div', cls)
  const box = h('div', 'brv-loadingContainer')
  node.appendChild(box)
  return {
    node,
    loading(text) {
      box.innerHTML = ''
      box.appendChild(h('div', 'brv-spinner'))
      box.appendChild(h('div', 'brv-loadingText', { text }))
    },
    fail(text) {
      box.innerHTML = ''
      box.appendChild(h('div', 'brv-errorText', { text }))
      box.appendChild(h('div', 'brv-loadingText', { text: $L('Press Back to close') }))
    },
  }
}

// The title over the page and the place under it, shown for a few seconds after each move.
const infoBars = (title, withBack) => {
  const counter = h('div', 'brv-pageCounter')
  const node = h('div', 'brv-infoOverlay', null, [
    h('div', 'brv-topBar', null, [h('div', 'brv-title', { text: title })]),
    h('div', 'brv-bottomBar', null, [counter, h('div', 'brv-navHint', { text: navHint(withBack) })]),
  ])
  let timer = null
  return {
    node,
    set(text) {
      counter.textContent = text
    },
    show() {
      node.classList.add('brv-infoVisible')
      clearTimeout(timer)
      timer = setTimeout(() => node.classList.remove('brv-infoVisible'), INFO_MS)
    },
    hidden(off) {
      node.style.display = off ? 'none' : ''
    },
    stop() {
      clearTimeout(timer)
    },
  }
}

const chromeButton = ({ icon, mark, label, id, onEnter }) =>
  spot(
    h('div', 'brv-chromeButton', { 'data-spot-id': id }, [
      icon ? svgIcon(icon) : null,
      mark ? h('span', 'brv-chromeMark', { text: mark }) : null,
      h('span', null, { text: label }),
    ]),
    onEnter
  )

// The remote inside an open menu: the arrows walk its stops, OK presses the one in focus, and a
// stop can take an arrow first. Nothing leaves the menu.
const menuKeys = (layer, name) => {
  const stops = Array.prototype.slice.call(layer.querySelectorAll('.brv-spot'))
  const active = document.activeElement
  const current = stops.indexOf(active) >= 0 ? active : null
  if (!current) {
    if (stops[0]) stops[0].focus()
    return
  }
  if (current._onKey && current._onKey(name)) return
  if (name === 'enter') {
    if (current._onEnter) current._onEnter()
    return
  }
  const next = nextSpot(current, stops, name)
  if (next) next.focus()
}

// Focus lands on `id`, else the stop marked chosen, else the first.
const enterLayer = (layer, id) => {
  const target =
    (id && layer.querySelector('[data-spot-id="' + id + '"]')) ||
    layer.querySelector('.brv-spot[data-selected="true"]') ||
    layer.querySelector('.brv-spot')
  if (target) target.focus()
}

const placeKey = (item) => 'epub_place_' + (item.ServerId || '') + '_' + item.Id
const bookmarksKey = (item) => 'epub_bookmarks_' + (item.ServerId || '') + '_' + item.Id

const choice = (label, selected, onEnter, id, extraCls, style) =>
  spot(
    h('div', ['brv-choice', selected && 'brv-choiceOn', extraCls], { 'data-selected': selected ? 'true' : null, 'data-spot-id': id, style, text: label }),
    onEnter
  )

const trackRow = ({ label, detail, selected, onEnter, indent }) =>
  spot(
    h('div', ['brv-trackOption', selected && 'brv-selected'], { 'data-selected': selected ? 'true' : null, style: indent ? { paddingLeft: indent + 'px' } : null }, [
      svgIcon(selected ? ICONS.selected : ICONS.unselected, 'brv-trackIndicator'),
      h('span', 'brv-trackText', null, [h('span', 'brv-trackName', { text: label }), detail ? h('span', 'brv-trackInfo', { text: detail }) : null]),
    ]),
    onEnter
  )

const settingRow = (label, children) =>
  h('div', 'brv-settingRow', null, [label ? h('div', 'brv-settingLabel', { text: label }) : null, h('div', 'brv-settingChoices', null, children)])

const THEME_LABELS = () => ({ original: $L('Original'), paper: $L('Paper'), quiet: $L('Quiet'), calm: $L('Calm'), night: $L('Night') })
const FONT_LABELS = () => ({ system: $L('System'), serif: $L('Serif'), sans: $L('Sans'), mono: $L('Mono') })
const SPACING_LABELS = () => ({ tight: $L('Tight'), normal: $L('Normal'), relaxed: $L('Relaxed') })
const MARGIN_LABELS = () => ({ narrow: $L('Narrow'), normal: $L('Normal'), wide: $L('Wide') })

const openEpubIn = (item, root, close) => {
  root.classList.add('brv-reader')
  const frame = h('div', 'brv-frame')
  const pages = h('div', 'brv-pages')
  frame.appendChild(pages)
  root.appendChild(frame)
  const tintDim = h('div', 'brv-tint', { style: { background: '#000', display: 'none' } })
  const tintWarm = h('div', 'brv-tint', { style: { background: '#ff9b2e', display: 'none' } })
  root.appendChild(tintDim)
  root.appendChild(tintWarm)
  const info = infoBars(item.Name || $L('Book'), true)
  info.hidden(true)
  root.appendChild(info.node)
  const loader = cover('brv-cover')
  loader.loading($L('Opening book...'))
  root.appendChild(loader.node)

  // Jellyfin's EPUB position is the percentage jellyfin-web reads. Emby has no such contract, so
  // it only gets this TV's own exact place.
  const reportsProgress = (item._serverType || getServerType()) !== 'emby'
  let engine = null
  let cancelled = false
  let latest = null
  let reportedTicks = null
  let bytes = 0
  let saveTimer = null
  let settings = READER_DEFAULTS
  let toc = []
  let bookmarks = []
  let scrub = null
  let chrome = null
  let panel = null
  let panelKind = null
  let contentsTab = 'chapters'
  let opener = null

  const applyLook = () => {
    const style = pageStyleFor(settings)
    root.style.background = style.bg
    frame.style.maxWidth = style.maxWidth + 'px'
    frame.style.paddingLeft = frame.style.paddingRight = style.margin + 'px'
    const tint = readerTint(settings)
    tintDim.style.display = tintWarm.style.display = tint ? '' : 'none'
    if (tint) {
      tintDim.style.opacity = tint.dim
      tintWarm.style.opacity = tint.warmth
    }
    return style
  }

  const save = () => {
    clearTimeout(saveTimer)
    saveTimer = null
    const at = latest
    if (!at) return
    const savedAt = Date.now()
    const record = (reported) => ({ cfi: at.cfi, ticks: reported, bytes, savedAt })
    saveToStorage(placeKey(item), record(reportedTicks)).catch(() => {})
    if (!reportsProgress || at.percentage == null) return
    const ticks = epubTicks(at.percentage)
    if (ticks === reportedTicks) return
    const api = getApiForItem(item) || activeApi
    // The ticks kept with the place are the last the server took, which is how the next open
    // knows the server position is this one.
    api
      .setPlaybackPosition(item.Id, ticks)
      .then(() => {
        reportedTicks = ticks
        saveToStorage(placeKey(item), record(ticks)).catch(() => {})
        if (at.atEnd) return api.setWatched(item.Id, true)
      })
      .catch(() => {})
  }

  const minutesLeft = () => (latest && latest.minutesLeft ? $L('{minutes} min left in chapter').replace('{minutes}', latest.minutesLeft) : '')
  const showPlace = () => {
    info.set((latest && latest.percentage != null ? percent(latest.percentage) : '') + (minutesLeft() ? ' · ' + minutesLeft() : ''))
  }

  const currentChapter = () => (latest && latest.index != null ? chapterAt(toc, latest.index) : -1)
  const bookmarked = () => !!(latest && bookmarks.some((mark) => mark.cfi === latest.cfi))

  // The chrome: the title with Contents, Bookmark and Display over the page, the scrubber under it.
  let scrubParts = null
  const shownFraction = () => (scrub != null ? scrub : latest && latest.percentage)
  const paintScrub = () => {
    if (!scrubParts) return
    const f = shownFraction()
    scrubParts.fill.style.width = (f || 0) * 100 + '%'
    scrubParts.thumb.style.left = (f || 0) * 100 + '%'
    scrubParts.left.textContent = f != null ? percent(f) : ''
    scrubParts.right.textContent = scrub == null ? minutesLeft() : ''
  }

  const bookmarkButton = () =>
    chromeButton({ icon: bookmarked() ? ICONS.bookmark : ICONS.bookmarkBorder, label: $L('Bookmark'), id: 'epub-bookmark', onEnter: toggleBookmark })

  const openChrome = () => {
    if (chrome) return
    info.hidden(true)
    scrubParts = { fill: h('div', 'brv-fill'), thumb: h('div', 'brv-thumb'), left: h('span'), right: h('span') }
    // Left and right move the mark and OK goes there, so a long book is crossed without paging it.
    const scrubber = spot(h('div', 'brv-scrubber', null, [h('div', 'brv-track', null, [scrubParts.fill, scrubParts.thumb])]), null, (name) => {
      if (name !== 'left' && name !== 'right' && name !== 'enter') return false
      const f = shownFraction()
      if (f == null) return true
      if (name === 'enter') {
        if (scrub != null && engine) engine.displayFraction(scrub)
        scrub = null
      } else {
        scrub = Math.min(1, Math.max(0, Math.round((f + (name === 'right' ? SCRUB_STEP : -SCRUB_STEP)) * 100) / 100))
      }
      paintScrub()
      return true
    })
    scrubber.addEventListener('blur', () => {
      scrub = null
      paintScrub()
    })
    chrome = h('div', 'brv-chrome', null, [
      h('div', 'brv-chromeTop', null, [
        h('div', 'brv-chromeTitle', { text: item.Name || $L('Book') }),
        chromeButton({ icon: ICONS.contents, label: $L('Contents'), id: 'epub-contents', onEnter: () => openPanel('contents', 'epub-contents') }),
        bookmarkButton(),
        chromeButton({ mark: 'Aa', label: $L('Display'), id: 'epub-display', onEnter: () => openPanel('display', 'epub-display') }),
      ]),
      h('div', 'brv-chromeBottom', null, [scrubber, h('div', 'brv-scrubLabel', null, [scrubParts.left, scrubParts.right])]),
    ])
    root.appendChild(chrome)
    paintScrub()
    enterLayer(chrome, 'epub-contents')
  }

  const closeMenus = () => {
    if (panel) panel.parentNode.removeChild(panel)
    if (chrome) chrome.parentNode.removeChild(chrome)
    panel = null
    panelKind = null
    chrome = null
    scrub = null
    scrubParts = null
    opener = null
    info.hidden(false)
  }

  const toggleBookmark = () => {
    if (!latest) return
    const chapter = currentChapter()
    bookmarks = bookmarked()
      ? bookmarks.filter((mark) => mark.cfi !== latest.cfi)
      : bookmarks
          .concat({ cfi: latest.cfi, label: (chapter >= 0 && toc[chapter].label) || item.Name || $L('Book'), percentage: latest.percentage })
          .sort((a, b) => (a.percentage != null ? a.percentage : 2) - (b.percentage != null ? b.percentage : 2))
    saveToStorage(bookmarksKey(item), bookmarks).catch(() => {})
    const old = chrome && chrome.querySelector('[data-spot-id="epub-bookmark"]')
    if (!old) return
    const fresh = bookmarkButton()
    old.parentNode.replaceChild(fresh, old)
    fresh.focus()
  }

  const openTarget = (target) => {
    if (engine && target) engine.display(target)
    closeMenus()
  }

  // Chapters to jump to, and the places this TV has bookmarked in the book.
  const contentsPanel = (tab) => {
    const chapter = currentChapter()
    const rows =
      tab === 'chapters'
        ? toc.map((entry, i) =>
            trackRow({ label: entry.label, selected: i === chapter, indent: entry.depth ? 36 + entry.depth * 32 : 0, onEnter: () => openTarget(entry.href) })
          )
        : bookmarks.map((mark) =>
            trackRow({ label: mark.label, detail: mark.percentage != null ? percent(mark.percentage) : null, onEnter: () => openTarget(mark.cfi) })
          )
    // The tabs only look chosen, so the panel opens on the chapter being read rather than on a tab.
    const tabs = h('div', 'brv-tabs', null, [
      spot(h('div', ['brv-choice', tab === 'chapters' && 'brv-choiceOn'], { 'data-spot-id': 'tab-chapters', text: $L('Chapters') }), () =>
        showPanel('contents', 'chapters', 'tab-chapters')
      ),
      spot(h('div', ['brv-choice', tab === 'bookmarks' && 'brv-choiceOn'], { 'data-spot-id': 'tab-bookmarks', text: $L('Bookmarks') }), () =>
        showPanel('contents', 'bookmarks', 'tab-bookmarks')
      ),
    ])
    const list = h(
      'div',
      'brv-list',
      null,
      rows.length ? rows : [h('div', 'brv-empty', { text: tab === 'chapters' ? $L('No table of contents available') : $L('No bookmarks yet') })]
    )
    return h('div', 'brv-panel', null, [h('h2', 'brv-panelTitle', { text: $L('Contents') }), tabs, list])
  }

  const updateSettings = (patch) => {
    settings = normalizeReaderSettings(Object.assign({}, settings, patch))
    saveToStorage(READER_SETTINGS_KEY, settings).catch(() => {})
    const style = applyLook()
    if (engine) engine.restyle(style)
  }

  // The page look: theme, type, spacing, and the dim and warmth laid over the page. Every stop
  // keeps an id, so a change redraws the panel with focus where it was.
  const displayPanel = () => {
    const s = settings
    const change = (patch) => () => {
      updateSettings(patch)
      showPanel('display')
    }
    const picks = (key, labels) => Object.keys(labels).map((value) => choice(labels[value], s[key] === value, change({ [key]: value }), key + ':' + value))
    const round = (n) => Math.round(n * 100) / 100
    const stepper = (key, range, smaller, larger) => [
      choice(smaller, false, change({ [key]: round(Math.max(range[0], s[key] - 0.1)) }), key + ':down'),
      h('span', 'brv-stepValue', { text: percent(s[key]) }),
      choice(larger, false, change({ [key]: round(Math.min(range[1], s[key] + 0.1)) }), key + ':up'),
    ]
    const themeLabels = THEME_LABELS()
    const swatches = Object.keys(PAGE_THEMES).map((value) =>
      choice('Aa', s.pageTheme === value, change({ pageTheme: value }), 'pageTheme:' + value, 'brv-swatch', {
        background: PAGE_THEMES[value].bg,
        color: PAGE_THEMES[value].fg,
      })
    )
    const list = h('div', 'brv-list', null, [
      settingRow($L('Theme'), swatches.concat(h('span', 'brv-stepValue', { text: themeLabels[s.pageTheme] }))),
      settingRow($L('Font'), picks('fontFamily', FONT_LABELS())),
      settingRow($L('Text size'), stepper('fontScale', FONT_SCALE_RANGE, 'A-', 'A+')),
      settingRow($L('Line spacing'), picks('lineSpacing', SPACING_LABELS())),
      settingRow($L('Margins'), picks('margin', MARGIN_LABELS())),
      settingRow(null, [
        choice($L('Justify'), s.justify, change({ justify: !s.justify }), 'justify'),
        choice($L('Bold'), s.bold, change({ bold: !s.bold }), 'bold'),
      ]),
      settingRow($L('Brightness'), stepper('brightness', BRIGHTNESS_RANGE, '-', '+')),
      settingRow($L('Warmth'), stepper('warmth', WARMTH_RANGE, '-', '+')),
    ])
    return h('div', 'brv-panel', null, [h('h2', 'brv-panelTitle', { text: $L('Display') }), list])
  }

  const showPanel = (kind, tab, focusId) => {
    const same = panel && kind === panelKind
    const scroll = same ? panel.querySelector('.brv-list').scrollTop : 0
    const active = document.activeElement
    const focused = same && active && active.getAttribute ? active.getAttribute('data-spot-id') : null
    if (panel) panel.parentNode.removeChild(panel)
    panelKind = kind
    if (tab) contentsTab = tab
    panel = kind === 'contents' ? contentsPanel(contentsTab) : displayPanel()
    if (chrome) chrome.style.display = 'none'
    root.appendChild(panel)
    if (scroll) panel.querySelector('.brv-list').scrollTop = scroll
    const keep = focusId || focused
    const target = keep && panel.querySelector('[data-spot-id="' + keep + '"]')
    if (target) target.focus()
    else enterLayer(panel)
  }

  const openPanel = (kind, from) => {
    opener = from
    contentsTab = 'chapters'
    showPanel(kind)
  }

  // Focus goes back to the button that raised the panel.
  const closePanel = () => {
    if (panel) panel.parentNode.removeChild(panel)
    panel = null
    panelKind = null
    if (chrome) {
      chrome.style.display = ''
      enterLayer(chrome, opener || 'epub-contents')
    }
  }

  const open = async () => {
    try {
      const [ePub, buffer, stored, storedLook, storedBookmarks] = await Promise.all([
        loadEpubJs(),
        fetchBook(item, getServerUrl(), getApiKey()),
        getFromStorage(placeKey(item)).catch(() => null),
        getFromStorage(READER_SETTINGS_KEY).catch(() => null),
        getFromStorage(bookmarksKey(item)).catch(() => null),
      ])
      if (cancelled) return
      settings = normalizeReaderSettings(storedLook)
      if (Array.isArray(storedBookmarks)) bookmarks = storedBookmarks
      const style = applyLook()
      bytes = buffer.byteLength
      // A different file size means the server has another copy of the book, where the saved
      // spot may point anywhere.
      const local = stored && stored.cfi && stored.bytes === bytes ? stored : null
      reportedTicks = local ? local.ticks : null
      const fraction = reportsProgress ? newerServerEpubFraction(item, local) : null
      const opened = await openEpub({
        ePub,
        element: pages,
        buffer,
        cfi: fraction == null && local ? local.cfi : null,
        fraction,
        style,
        onKey: (e) => onKeyDown(e),
        onRelocated: (at) => {
          const moved = !latest || latest.cfi !== at.cfi
          latest = at
          showPlace()
          paintScrub()
          if (moved) info.show()
          clearTimeout(saveTimer)
          saveTimer = setTimeout(save, 2000)
        },
      })
      if (cancelled) {
        opened.destroy()
        return
      }
      engine = opened
      toc = engine.toc()
      loader.node.style.display = 'none'
      info.hidden(false)
      info.show()
    } catch (e) {
      console.warn('[reader] epub failed', e)
      if (!cancelled) loader.fail($L('Failed to open book'))
    }
  }

  const onKeyDown = (e) => {
    const code = e.keyCode
    if (BACK_KEYS[code]) {
      e.preventDefault()
      e.stopPropagation()
      if (panel) closePanel()
      else if (chrome) closeMenus()
      else close()
      return
    }
    const name = KEY[code]
    if (!name) return
    e.preventDefault()
    e.stopPropagation()
    // The menus are walked with the remote like any other screen.
    if (panel) return menuKeys(panel, name)
    if (chrome) return menuKeys(chrome, name)
    if (!engine) return
    if (name === 'left' || name === 'right') engine.turnToward(name === 'right' ? 1 : -1)
    else if (name === 'up' || name === 'down') engine[name === 'down' ? 'next' : 'prev']()
    else openChrome()
  }

  open()
  return {
    onKeyDown,
    close() {
      cancelled = true
      info.stop()
      if (saveTimer) save()
      if (engine) engine.destroy()
      engine = null
    },
  }
}

const openPdfIn = (item, root, close) => {
  const canvas = h('canvas', 'brv-pdfPage')
  root.appendChild(h('div', 'brv-imageContainer', null, [canvas]))
  const spinner = h('div', 'brv-loading', { style: { display: 'none' } }, [h('div', 'brv-spinner')])
  root.appendChild(spinner)
  const info = infoBars(item.Name || $L('Book'), true)
  info.hidden(true)
  root.appendChild(info.node)
  const loader = cover('brv-pdfCover')
  loader.loading($L('Opening book...'))
  root.appendChild(loader.node)

  const progress = pageProgress(item)
  let doc = null
  let page = 0
  let task = null
  let cancelled = false
  let invert = false
  let chrome = null

  const fail = () => {
    loader.node.style.display = ''
    info.hidden(true)
    loader.fail($L('Failed to open book'))
  }

  const render = () => {
    const at = page
    info.set(at + 1 + ' / ' + doc.numPages)
    info.show()
    progress.update(at, doc.numPages)
    if (task) task.cancel()
    spinner.style.display = ''
    doc
      .getPage(at + 1)
      .then((p) => {
        if (cancelled || at !== page) return
        const natural = p.getViewport({ scale: 1 })
        const fit = Math.min(window.innerWidth / natural.width, window.innerHeight / natural.height)
        const ratio = window.devicePixelRatio || 1
        const viewport = p.getViewport({ scale: fit * ratio })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = Math.floor(viewport.width / ratio) + 'px'
        canvas.style.height = Math.floor(viewport.height / ratio) + 'px'
        task = p.render({ canvasContext: canvas.getContext('2d'), viewport })
        return task.promise
      })
      .then(
        () => {
          if (!cancelled && at === page) spinner.style.display = 'none'
        },
        (err) => {
          if (!cancelled && !(err && err.name === 'RenderingCancelledException')) fail()
        }
      )
  }

  const paintInvert = () => {
    if (invert) canvas.classList.add('brv-inverted')
    else canvas.classList.remove('brv-inverted')
  }

  const open = async () => {
    try {
      const [lib, buffer, storedInvert] = await Promise.all([
        loadScript(assetUrl('reader/pdf.min.js')).then(() => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = assetUrl('reader/pdf.worker.min.js')
          return window.pdfjsLib
        }),
        fetchBook(item, getServerUrl(), getApiKey()),
        getFromStorage(FIXED_LAYOUT_INVERT_KEY).catch(() => null),
      ])
      // Fonts compiled to code are how CVE-2024-4367 runs script, so they're drawn without it.
      const opened = await lib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise
      if (cancelled) {
        opened.destroy()
        return
      }
      doc = opened
      invert = storedInvert === true
      paintInvert()
      page = startPage(item, doc.numPages)
      loader.node.style.display = 'none'
      info.hidden(false)
      render()
    } catch (e) {
      console.warn('[reader] pdf failed', e)
      if (!cancelled) loader.fail($L('Failed to open book'))
    }
  }

  const openChrome = () => {
    info.hidden(true)
    const button = chromeButton({
      icon: ICONS.invert,
      label: $L('Invert Colors (fixed layout)'),
      id: 'pdf-invert',
      onEnter: () => {
        invert = !invert
        paintInvert()
        saveToStorage(FIXED_LAYOUT_INVERT_KEY, invert).catch(() => {})
      },
    })
    chrome = h('div', 'brv-chrome', null, [h('div', 'brv-chromeTop', null, [h('div', 'brv-chromeTitle', { text: item.Name || $L('Book') }), button])])
    root.appendChild(chrome)
    button.focus()
  }

  const closeChrome = () => {
    chrome.parentNode.removeChild(chrome)
    chrome = null
    info.hidden(false)
  }

  const onKeyDown = (e) => {
    const code = e.keyCode
    if (BACK_KEYS[code]) {
      e.preventDefault()
      e.stopPropagation()
      if (chrome) closeChrome()
      else close()
      return
    }
    const name = KEY[code]
    if (!name) return
    e.preventDefault()
    e.stopPropagation()
    // The menu is walked with the remote like any other screen.
    if (chrome) return menuKeys(chrome, name)
    if (name === 'enter') {
      if (doc) openChrome()
      return
    }
    if (!doc) return
    const step = name === 'right' || name === 'down' ? 1 : -1
    const next = Math.min(Math.max(page + step, 0), doc.numPages - 1)
    if (next === page) return info.show()
    page = next
    render()
  }

  open()
  return {
    onKeyDown,
    close() {
      cancelled = true
      info.stop()
      progress.flush()
      if (task) task.cancel()
      if (doc) doc.destroy()
      doc = null
    },
  }
}

// kind is 'epub' or 'pdf'. The layer takes the keys on the window's capture phase, ahead of the
// canvas app, until it's closed. onClose runs when Back leaves the book.
export const openBookOverlay = ({ item, kind, onClose }) => {
  ensureStyle()
  const root = h('div', 'brv')
  document.body.appendChild(root)
  let closed = false
  const reader = (kind === 'pdf' ? openPdfIn : openEpubIn)(item, root, () => {
    if (onClose) onClose()
  })
  const onKey = (e) => {
    if (!closed) reader.onKeyDown(e)
  }
  window.addEventListener('keydown', onKey, true)
  return {
    close() {
      if (closed) return
      closed = true
      window.removeEventListener('keydown', onKey, true)
      reader.close()
      if (root.parentNode) root.parentNode.removeChild(root)
    },
  }
}
