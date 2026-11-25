import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import Spinner from '../../ui/components/Spinner.jsx'
import RequestsTile from '../../ui/components/seerr/RequestsTile.jsx'
import RequestsIssueRow from '../../ui/components/seerr/RequestsIssueRow.jsx'
import SeerrIssueThread from '../../ui/components/seerr/SeerrIssueThread.jsx'
import { keyed } from '../../ui/components/library/pageKit.js'
import { cssShift, textReady, uiFont } from '../../ui/text.js'
import { theme, navOnLeft, shadowColor } from '../../ui/theme.js'
import { hex } from '../../ui/color.js'
import { textWidth } from '../../ui/components/seerr/look.js'
import { GRID, ISSUE_ROW, issueRow, requestTile, splitRequester, tileHeight } from '../../ui/components/seerr/RequestsModels.js'
import { focusNav } from '../../app/focus.js'
import { router } from '../../app/router.js'
import { getStore } from '../../state/store.js'
import * as seerrApi from '../../services/seerrApi.js'
import { getServerType } from '../../services/jellyfinApi.js'
import hydrateRequestMediaItems from '../../utils/seerrHydration.js'
import { ISSUE_STATUS, REQUEST_STATUS } from '../../utils/seerrStatus.js'
import { arrQueueTarget, requestIsWatched, requestWantsArrQueue } from '../../utils/seerrArrQueue.js'
import { checkSeerr, seerrState } from '../../state/seerr.js'
import { openSeerrItem } from './seerrModels.js'

// A Requests tab and an Issues tab, each with its filter chips. Requests is a grid of poster tiles
// with the status band, the arr's download bar or Not found yet, and round Approve and Decline,
// Retry or Cancel buttons for whoever may use them. Issues is a list that opens a thread overlay.
// Every action goes straight through with no confirmation, and Right from a tile walks into its
// buttons.
const PAGE_SIZE = 20
const REQUEST_FILTERS = ['all', 'pending', 'approved', 'processing', 'available', 'failed']
const ISSUE_FILTERS = ['open', 'resolved', 'all']
const LIST_X = 114
const POLL_MS = 30000
const WHITE_EDGE = { width: 1, color: hex('#ffffffff') }
const RETRY_SHADOW = { color: shadowColor('#0000004d'), x: 0, y: 18, blur: 18, spread: 0 }

const requestFilterLabel = (f) => {
  switch (f) {
    case 'pending': return $L('Pending')
    case 'approved': return $L('Approved')
    case 'processing': return $L('Processing')
    case 'available': return $L('Available')
    case 'failed': return $L('Failed')
    default: return $L('All')
  }
}
const issueFilterLabel = (f) => (f === 'open' ? $L('Open') : f === 'resolved' ? $L('Resolved') : $L('All'))

const mediaTypeOf = (req) => (req.type === 'movie' || (req.media && req.media.mediaType) === 'movie' ? 'movie' : 'tv')
// Which arr answer a request reads, or null when it asks for none.
const queueKey = (req) => {
  const target = requestWantsArrQueue(req) ? arrQueueTarget(mediaTypeOf(req), req.media) : null
  return target ? `${target.service}:${target.id}` : null
}
const sameJson = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b)

export default function Requests(props) {
  const store = getStore()
  const [view, setView] = createSignal(props.tab === 'issues' ? 'issues' : 'requests')
  const [reqFilter, setReqFilter] = createSignal('all')
  const [issueFilter, setIssueFilter] = createSignal('open')
  const [requests, setRequests] = createSignal([])
  const [issues, setIssues] = createSignal([])
  const [answers, setAnswers] = createSignal({})
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  const [authed, setAuthed] = createSignal(true)
  const [counts, setCounts] = createSignal({ pending: 0, open: 0 })
  const [perms, setPerms] = createSignal(null)
  const [me, setMe] = createSignal(null)
  const [zone, setZone] = createSignal('list')
  const [tabCur, setTabCur] = createSignal(props.tab === 'issues' ? 1 : 0)
  const [filterCur, setFilterCur] = createSignal(0)
  const [cur, setCur_] = createSignal(0)
  const [sub, setSub] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [thread, setThread] = createSignal(null)
  const [fontsIn, setFontsIn] = createSignal(0)
  const my = { gen: 0, more: false, loadingMore: false, queues: false, asked: {}, poll: null, alive: true }
  let root
  onCleanup(() => {
    my.alive = false
    my.gen++
    stopPoll()
  })

  const headerFont = uiFont()
  const loadingFont = uiFont('bold')
  const retryFont = uiFont('bold')
  const bodyFont = uiFont()
  const pillFont = uiFont()
  const boldFont = uiFont('bold')
  const headerTitle = $L('Requests')
  const loadingLabel = $L('Loading requests...')
  const retryLabel = $L('Retry')
  const shifts = {
    header: 19 + cssShift(45, headerFont),
    body: cssShift(30, bodyFont),
    loading: cssShift(30, loadingFont),
    retry: 3 + cssShift(39, retryFont),
  }

  const t = () => theme()
  const headerX = () => (navOnLeft() ? 87 : 147)
  const tabs = createMemo(() => {
    const list = [{ id: 'requests', label: $L('Requests'), count: counts().pending }]
    // Silo's requests have no issues.
    if (getServerType() !== 'silo') list.push({ id: 'issues', label: $L('Issues'), count: counts().open })
    return list
  })
  const tabsH = () => (tabs().some((tab) => tab.count > 0) ? 64 : 59)
  const tabPills = createMemo(() => {
    void fontsIn()
    let x = 138
    const h = tabsH()
    return tabs().map((tab, i) => {
      const textW = textWidth(tab.label, 26.4)
      const badgeW = tab.count > 0 ? textWidth(String(tab.count), 18, 'bold') + 21.6 : 0
      const w = Math.round(textW + 69.2 + (badgeW ? 12 + badgeW : 0))
      const at = x
      x += w + 18
      const selected = tab.id === view()
      const focused = zone() === 'tabs' && !thread() && i === tabCur()
      return {
        key: tab.id, x: at, w, h, label: tab.label, textY: (h - 33) / 2 + 2.5,
        badge: badgeW ? { text: String(tab.count), w: badgeW, x: 34.6 + textW + 12, y: (h - 38) / 2 } : null,
        fill: selected ? '#00a4dc2e' : '#ffffff0f', border: selected ? '#00a4dc99' : '#00000000',
        ink: selected || focused ? '#ffffffff' : '#ffffffa6', ring: focused ? 1 : 0,
      }
    })
  })
  const filtersY = () => 180 + tabsH() + 18
  const filters = createMemo(() => {
    void fontsIn()
    const isReq = view() === 'requests'
    const ids = isReq ? REQUEST_FILTERS : ISSUE_FILTERS
    const picked = isReq ? reqFilter() : issueFilter()
    let x = 138
    return ids.map((id, i) => {
      const label = isReq ? requestFilterLabel(id) : issueFilterLabel(id)
      const count = isReq ? (id === 'pending' ? counts().pending : 0) : id === 'open' ? counts().open : 0
      const textW = textWidth(label, 21.6)
      const countText = count > 0 ? String(count) : ''
      const w = Math.round(textW + 45.2 + (countText ? 9.6 + textWidth(countText, 21.6, 'bold') : 0))
      const at = x
      x += w + 12
      const selected = id === picked
      const focused = zone() === 'filters' && !thread() && i === filterCur()
      return {
        key: `${view()}-${id}`, id, x: at, w, label, countText, countX: 22.6 + textW + 9.6,
        fill: selected ? '#00a4dc29' : '#ffffff0f', border: selected ? '#00a4dc99' : '#ffffff2e',
        ink: selected || focused ? '#ffffffff' : '#ffffffa6', ring: focused ? 1 : 0,
      }
    })
  })
  const listTop = () => 180 + tabsH() + 91
  const listH = () => 1080 - listTop()
  const split = createMemo(() => splitRequester(requests()))
  const viewer = createMemo(() => ({ canManage: seerrApi.canManageRequests(perms()), me: me() }))
  const issueViewer = createMemo(() => ({ canManageIssues: seerrApi.canManageIssues(perms()), me: me() }))
  const stepY = () => (view() === 'requests' ? tileHeight(split()) + GRID.gap : ISSUE_ROW.step)
  const itemH = () => (view() === 'requests' ? tileHeight(split()) : ISSUE_ROW.h + ISSUE_ROW.inset)
  const items = () => (view() === 'requests' ? requests() : issues())
  // Only the rows around what's on screen are built.
  const windowRows = createMemo(() => {
    const first = Math.max(0, Math.floor(scroll() / stepY()) - 1)
    return { first, last: first + Math.ceil(listH() / stepY()) + 2 }
  })
  const showList = () => !loading() && !error()
  // Each tile's model is kept while its request, its arr answer and the viewer stay the same.
  const models = new WeakMap()
  const tileModel = (r, i) => {
    const ans = answers()[queueKey(r)]
    const v = viewer()
    const sp = split()
    const was = models.get(r)
    if (was && was.i === i && was.ans === ans && was.v === v && was.sp === sp) return was.model
    const model = requestTile(r, i, { queueResponse: ans, viewer: v, split: sp })
    models.set(r, { i, ans, v, sp, model })
    return model
  }
  // The list makes way for the spinner or the error.
  const tiles = createMemo(() => {
    if (view() !== 'requests' || !showList()) return []
    void fontsIn()
    const { first, last } = windowRows()
    const list = requests()
    const out = []
    const to = Math.min(list.length, (last + 1) * GRID.cols)
    for (let i = first * GRID.cols; i < to; i++) {
      const model = tileModel(list[i], i)
      out.push({ key: model.key, model, x: LIST_X + (i % GRID.cols) * (GRID.w + GRID.gap), y: Math.floor(i / GRID.cols) * stepY() })
    }
    return out
  })
  const rowModels = new WeakMap()
  const rows = createMemo(() => {
    if (view() !== 'issues' || !showList()) return []
    void fontsIn()
    const { first, last } = windowRows()
    const list = issues()
    const v = issueViewer()
    const out = []
    for (let i = first; i <= last && i < list.length; i++) {
      const was = rowModels.get(list[i])
      const model = was && was.i === i && was.v === v ? was.model : issueRow(list[i], i, v)
      rowModels.set(list[i], { i, v, model })
      out.push({ key: model.key, model, y: i * ISSUE_ROW.step + ISSUE_ROW.inset })
    }
    return out
  })
  const tileList = keyed(tiles, (e) => e.key)
  const rowList = keyed(rows, (e) => e.key)
  const focusAt = () => (zone() === 'list' && !thread() ? cur() : -1)
  const contentH = () => Math.max(listH(), Math.ceil(items().length / (view() === 'requests' ? GRID.cols : 1)) * stepY() + 24)
  // Where the list's message, spinner or error sits: the middle of what's under the chips.
  const midY = () => listTop() + listH() / 2
  const message = () => {
    if (!authed()) return $L('Please configure Seerr in Settings')
    if (loading() || error() || items().length) return ''
    return view() === 'requests' ? $L('No requests found') : $L('No issues found')
  }
  const spinning = () => loading() && authed()
  const showError = () => !!error() && !loading()
  const retryW = () => {
    void fontsIn()
    return Math.max(270, Math.round(textWidth(retryLabel, 39, 'bold') + 120))
  }
  // The theme's background over the #11131a that shows through a translucent one, such as
  // Glass's 80% fill.
  const background = () => {
    const bg = String(t().background || '#101010ff').replace('#', '')
    const a = parseInt(bg.slice(6, 8) || 'ff', 16) / 255
    const base = [17, 19, 26]
    const mix = (i) => {
      const v = Math.round(parseInt(bg.slice(i * 2, i * 2 + 2), 16) * a + base[i] * (1 - a))
      return (v < 16 ? '0' : '') + v.toString(16)
    }
    return `#${mix(0)}${mix(1)}${mix(2)}ff`
  }

  const loadCounts = async () => {
    const next = { pending: 0, open: 0 }
    if (seerrApi.canManageRequests(perms())) {
      next.pending = await seerrApi.getRequestCount().then((c) => (c && c.pending) || 0).catch(() => 0)
    }
    if (seerrApi.canManageIssues(perms())) {
      next.open = await seerrApi.getIssueCount().then((c) => (c && c.open) || 0).catch(() => 0)
    }
    if (my.alive) setCounts(next)
  }
  const fetchPage = async (v, filter, skip) => {
    const data = v === 'requests' ? await seerrApi.getRequests(filter, PAGE_SIZE, skip) : await seerrApi.getIssues(filter, PAGE_SIZE, skip)
    const raw = (data && data.results) || []
    return { results: await hydrateRequestMediaItems(raw), raw }
  }

  // One Moonbase call per title that could be downloading: all of them on a load, only the new ones
  // after load more, or just the ones the poll names. An answer that comes back unchanged keeps the
  // one it had.
  const askQueues = (all, only) => {
    if (!my.queues) return
    if (all) my.asked = {}
    const asked = my.asked
    const keys = []
    ;(only || requests().map(queueKey)).forEach((key) => {
      if (!key || keys.indexOf(key) !== -1 || (!all && !only && asked[key])) return
      keys.push(key)
    })
    if (!keys.length) return
    const gen = my.gen
    keys.forEach((key) => {
      asked[key] = true
    })
    Promise.all(keys.map((key) => {
      const parts = key.split(':')
      return seerrApi.getArrQueue(parts[0], parts[1]).catch(() => null)
    })).then((results) => {
      if (gen !== my.gen) return
      let changed = false
      const next = { ...answers() }
      keys.forEach((key, i) => {
        if (sameJson(next[key], results[i])) return
        next[key] = results[i]
        changed = true
      })
      if (changed) setAnswers(next)
      syncPoll()
    })
  }
  // While a tile shows a bar or Not found yet, the bars are read again every 30 seconds: the arr
  // for those titles, and Seerr's first page for status and its copy of the queue.
  function stopPoll() {
    clearInterval(my.poll)
    my.poll = null
  }
  const syncPoll = () => {
    const watching = view() === 'requests' && !loading() && requests().some((r) => requestIsWatched(r, answers()[queueKey(r)]))
    if (watching && !my.poll) my.poll = setInterval(() => poll(), POLL_MS)
    else if (!watching) stopPoll()
  }
  const poll = () => {
    // Nothing is polled while another screen covers this one.
    if (!props.page.active()) return
    const watched = requests().filter((r) => requestIsWatched(r, answers()[queueKey(r)])).map(queueKey).filter(Boolean)
    askQueues(false, watched)
    const gen = my.gen
    seerrApi.getRequests(reqFilter(), PAGE_SIZE, 0).then((data) => {
      if (gen !== my.gen) return
      const byId = {}
      ;((data && data.results) || []).forEach((r) => {
        byId[r.id] = r
      })
      let changed = false
      const next = requests().map((r) => {
        const fresh = byId[r.id]
        if (!fresh) return r
        const fm = fresh.media || {}
        const m = r.media || {}
        if (r.status === fresh.status && m.status === fm.status && m.status4k === fm.status4k &&
          sameJson(m.downloadStatus, fm.downloadStatus) && sameJson(m.downloadStatus4k, fm.downloadStatus4k)) return r
        changed = true
        return {
          ...r,
          status: fresh.status,
          media: { ...m, status: fm.status, status4k: fm.status4k, downloadStatus: fm.downloadStatus, downloadStatus4k: fm.downloadStatus4k },
        }
      })
      if (changed) setRequests(next)
      syncPoll()
    }).catch(() => {})
  }

  const reload = async () => {
    if (!authed()) return
    const gen = ++my.gen
    const v = view()
    stopPoll()
    batch(() => {
      setLoading(true)
      setError('')
      setScroll(0)
    })
    let failed = ''
    try {
      const { results, raw } = await fetchPage(v, v === 'requests' ? reqFilter() : issueFilter(), 0)
      if (gen !== my.gen) return
      if (v === 'requests') setRequests(results)
      else setIssues(results)
      if (v === 'requests') askQueues(true)
      my.more = raw.length >= PAGE_SIZE
    } catch (e) {
      if (gen !== my.gen) return
      console.error('[SeerrRequests] Load failed:', e)
      failed = (e && e.message) || $L('Failed to load requests')
    }
    batch(() => {
      setError(failed)
      setLoading(false)
      setCur_(0)
      setSub(0)
      // Only a full load of the requests tab puts focus on its first tile.
      if (v === 'requests' && requests().length && !failed) setZone('list')
      else if (zone() === 'list') setZone('filters')
    })
    syncPoll()
  }
  const loadMore = async () => {
    if (my.loadingMore || !my.more || loading()) return
    my.loadingMore = true
    const gen = my.gen
    const v = view()
    const current = items()
    try {
      const { results, raw } = await fetchPage(v, v === 'requests' ? reqFilter() : issueFilter(), current.length)
      if (gen !== my.gen) return
      const seen = {}
      current.forEach((item) => {
        seen[item.id] = true
      })
      const fresh = results.filter((item) => !seen[item.id])
      if (v === 'requests') {
        setRequests(requests().concat(fresh))
        askQueues(false)
      } else setIssues(issues().concat(fresh))
      my.more = raw.length >= PAGE_SIZE
      syncPoll()
    } catch (e) {
      console.warn('[SeerrRequests] Load more failed:', e && e.message)
      my.more = false
    } finally {
      my.loadingMore = false
    }
  }

  const start = async () => {
    const seerr = await checkSeerr(!seerrState().available)
    if (!my.alive) return
    my.queues = !!(seerr.pluginInfo && seerr.pluginInfo.arrQueueAvailable === true)
    if (!seerr.authenticated) {
      batch(() => {
        setAuthed(false)
        setLoading(false)
        setZone('tabs')
      })
      return
    }
    if (seerr.user && seerr.user.seerrUserId != null) setMe(seerr.user.seerrUserId)
    // The status call claims every permission when it leaves them out, so admin actions gate on
    // the real /auth/me answer.
    seerrApi.getUser().then((u) => {
      if (!u || !my.alive) return
      batch(() => {
        setPerms(u.permissions != null ? u.permissions : 0)
        if (u.id != null) setMe(u.id)
      })
      loadCounts()
    }).catch(() => {})
    reload()
  }

  // Keeps the focused item in view by scrolling just far enough, with the gap after it when it
  // comes up from below.
  const reveal = () => {
    const row = view() === 'requests' ? Math.floor(cur() / GRID.cols) : cur()
    const top = row * stepY()
    const bottom = top + itemH()
    const gap = stepY() - itemH()
    if (top < scroll()) setScroll(top)
    else if (bottom + gap > scroll() + listH()) setScroll(bottom + gap - listH())
    if (cur() >= items().length - 5) loadMore()
  }
  const setCur = (i) => {
    batch(() => {
      setCur_(i)
      setSub(0)
    })
    reveal()
  }
  const selectTab = (id) => {
    if (id === view()) return
    batch(() => {
      setView(id)
      setCur_(0)
      setSub(0)
      setFilterCur(0)
    })
    reload()
  }
  const selectFilter = (id) => {
    if (view() === 'requests') {
      if (id === reqFilter()) return
      setReqFilter(id)
    } else {
      if (id === issueFilter()) return
      setIssueFilter(id)
    }
    reload()
  }
  const actionsOf = (i) => {
    const r = requests()[i]
    return r ? tileModel(r, i).actions : []
  }
  const toggleOf = (i) => {
    const e = rows().find((r) => r.model.idx === i)
    return e && e.model.toggle.length ? e.model.toggle[0] : null
  }
  const openItem = (request) => {
    const media = request.media
    if (!media) return
    openSeerrItem(router, { id: media.tmdbId || media.id, mediaType: media.mediaType || media.media_type || request.type, mediaInfo: media })
  }
  const patchRequest = (id, changes) => setRequests(requests().map((r) => (r.id === id ? { ...r, ...changes } : r)))
  const act = async (action, request) => {
    try {
      if (action === 'approve') {
        await seerrApi.approveRequest(request.id)
        patchRequest(request.id, { status: REQUEST_STATUS.APPROVED })
        setCounts({ ...counts(), pending: Math.max(counts().pending - 1, 0) })
      } else if (action === 'decline') {
        await seerrApi.declineRequest(request.id)
        patchRequest(request.id, { status: REQUEST_STATUS.DECLINED })
        setCounts({ ...counts(), pending: Math.max(counts().pending - 1, 0) })
      } else if (action === 'retry') {
        await seerrApi.retryRequest(request.id)
        const fresh = await seerrApi.getRequest(request.id).catch(() => null)
        patchRequest(request.id, fresh || { status: REQUEST_STATUS.APPROVED })
      } else if (action === 'cancel') {
        await seerrApi.cancelRequest(request.id)
        setRequests(requests().filter((r) => r.id !== request.id))
        setCur_(Math.min(cur(), Math.max(0, requests().length - 1)))
      }
    } catch (e) {
      console.error('[SeerrRequests] Action failed:', action, e && e.message)
    }
    if (my.alive) setSub(0)
  }
  const onThreadChanged = (updated) => {
    if (updated.deleted) {
      setIssues(issues().filter((i) => i.id !== updated.id))
      setCur_(Math.min(cur(), Math.max(0, issues().length - 1)))
      setCounts({ ...counts(), open: Math.max(counts().open - 1, 0) })
      return
    }
    setIssues(issues().map((i) => (i.id === updated.id ? { ...i, ...updated } : i)))
    if (perms() != null) loadCounts()
  }
  const toggleIssue = async (issue) => {
    const open = issue.status === ISSUE_STATUS.OPEN
    try {
      const fresh = await seerrApi.setIssueStatus(issue.id, open ? 'resolved' : 'open')
      if (my.alive) onThreadChanged(fresh || { id: issue.id, status: open ? ISSUE_STATUS.RESOLVED : ISSUE_STATUS.OPEN })
    } catch (e) {
      console.error('[SeerrRequests] Issue status change failed:', e && e.message)
    }
  }
  const onThreadClose = () => {
    setThread(null)
    if (root) root.setFocus()
  }

  createEffect(on(props.page.active, (a) => a && (store.navSection = 'seerr')))
  onMount(() => {
    store.navSection = 'seerr'
    // Pill widths are measured with Roboto, so they're laid out again once its faces load.
    textReady().then(() => my.alive && setFontsIn(fontsIn() + 1))
    if (root) root.setFocus()
    start()
  })

  const navLeft = () => (navOnLeft() ? focusNav() : true)
  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color={background()}
      onLeft={() => {
        const z = zone()
        if (z === 'tabs') {
          if (tabCur() > 0) setTabCur(tabCur() - 1)
          else return navLeft()
        } else if (z === 'filters') {
          if (filterCur() > 0) setFilterCur(filterCur() - 1)
          else return navLeft()
        } else if (z === 'list') {
          if (sub() > 0) setSub(sub() - 1)
          else if (view() === 'requests' && cur() % GRID.cols > 0) setCur(cur() - 1)
          else return navLeft()
        } else return navLeft()
        return true
      }}
      onRight={() => {
        const z = zone()
        if (z === 'tabs') {
          if (tabCur() < tabs().length - 1) setTabCur(tabCur() + 1)
        } else if (z === 'filters') {
          if (filterCur() < filters().length - 1) setFilterCur(filterCur() + 1)
        } else if (z === 'list') {
          if (view() === 'requests') {
            if (sub() < actionsOf(cur()).length) setSub(sub() + 1)
            else if (cur() % GRID.cols < GRID.cols - 1 && cur() + 1 < requests().length) setCur(cur() + 1)
          } else if (sub() === 0 && toggleOf(cur())) setSub(1)
        }
        return true
      }}
      onUp={() => {
        const z = zone()
        if (z === 'tabs') {
          if (!navOnLeft()) return focusNav()
        } else if (z === 'filters') setZone('tabs')
        else if (z === 'list') {
          const step = view() === 'requests' ? GRID.cols : 1
          if (cur() - step >= 0) setCur(cur() - step)
          else {
            batch(() => {
              setSub(0)
              setZone('filters')
            })
          }
        } else if (z === 'retry') setZone('filters')
        return true
      }}
      onDown={() => {
        const z = zone()
        if (z === 'tabs') setZone('filters')
        else if (z === 'filters') {
          if (items().length && !loading() && !error()) {
            setZone('list')
            reveal()
          } else if (error() && !loading()) setZone('retry')
        } else if (z === 'list') {
          const step = view() === 'requests' ? GRID.cols : 1
          const lastRow = Math.floor((items().length - 1) / step)
          if (Math.floor(cur() / step) < lastRow) setCur(Math.min(cur() + step, items().length - 1))
        }
        return true
      }}
      onEnter={() => {
        const z = zone()
        if (z === 'tabs') {
          const tab = tabs()[tabCur()]
          if (tab) selectTab(tab.id)
        } else if (z === 'filters') {
          const chip = filters()[filterCur()]
          if (chip) selectFilter(chip.id)
        } else if (z === 'retry') reload()
        else if (z === 'list') {
          if (view() === 'requests') {
            const request = requests()[cur()]
            if (!request) return true
            const action = sub() > 0 && actionsOf(cur())[sub() - 1]
            if (action) act(action.id, request)
            else openItem(request)
          } else {
            const issue = issues()[cur()]
            if (!issue) return true
            if (sub() === 1) toggleIssue(issue)
            else setThread(issue)
          }
        }
        return true
      }}
    >
      <text x={headerX()} y={shifts.header} fontFamily={headerFont} fontSize={45} lineHeight={58.5} color="#e6e6e6ff">
        {headerTitle}
      </text>

      <view>
        <For each={tabPills()}>
          {(p) => (
            <view x={p.x} y={180} width={p.w} height={p.h}>
              <view width={p.w} height={p.h} borderRadius={p.h / 2} color={p.fill} border={{ width: 1, color: hex(p.border) }} />
              <view width={p.w} height={p.h} borderRadius={p.h / 2} color="#00000000" border={WHITE_EDGE} alpha={p.ring} />
              <text x={34.6} y={p.textY} fontFamily={pillFont} fontSize={26.4} lineHeight={33} color={p.ink}>
                {p.label}
              </text>
              <Show when={p.badge}>
                <view x={p.badge.x} y={p.badge.y} width={p.badge.w} height={38} borderRadius={19} color="#00a4dcff">
                  <text x={10.8} y={3.9} fontFamily={boldFont} fontSize={18} lineHeight={33} color="#ffffffff">
                    {p.badge.text}
                  </text>
                </view>
              </Show>
            </view>
          )}
        </For>
      </view>

      <view>
        <For each={filters()}>
          {(c) => (
            <view x={c.x} y={filtersY()} width={c.w} height={49}>
              <view width={c.w} height={49} borderRadius={24.5} color={c.fill} border={{ width: 1, color: hex(c.border) }} />
              <view width={c.w} height={49} borderRadius={24.5} color="#00000000" border={WHITE_EDGE} alpha={c.ring} />
              <text x={22.6} y={10} fontFamily={pillFont} fontSize={21.6} lineHeight={33} color={c.ink}>
                {c.label}
              </text>
              <text x={c.countX} y={10} fontFamily={boldFont} fontSize={21.6} lineHeight={33} color="#00a4dcff">
                {c.countText}
              </text>
            </view>
          )}
        </For>
      </view>

      <view y={listTop() - 12} width={1920} height={listH() + 12} clipping>
        <view transition={{ y: { duration: 250, easing: 'ease-out' } }} y={12 - scroll()} width={1920} height={contentH()}>
          <view width={1920} height={contentH()}>
            <For each={tileList.keys()}>
              {(k) => {
                const e = tileList.item(k)
                return <RequestsTile x={e().x} y={e().y} tile={e().model} focusAt={focusAt()} subAt={sub()} />
              }}
            </For>
          </view>
          <view width={1920} height={contentH()}>
            <For each={rowList.keys()}>
              {(k) => {
                const e = rowList.item(k)
                return <RequestsIssueRow x={138} y={e().y} row={e().model} focusAt={focusAt()} subAt={sub()} />
              }}
            </For>
          </view>
        </view>
      </view>

      <view>
        <Show when={spinning()}>
          <Spinner x={924} y={midY() - 139} size={72} />
          <text x={960} y={midY() - 42.5 + shifts.loading} mountX={0.5} fontFamily={loadingFont} fontSize={30} lineHeight={33} color="#e6e6e6ff">
            {loadingLabel}
          </text>
        </Show>
      </view>
      <text x={960} y={midY() - 33 + shifts.body} mountX={0.5} fontFamily={bodyFont} fontSize={30} lineHeight={33} color="#e6e6e6ff">
        {message()}
      </text>
      <view alpha={showError() ? 1 : 0}>
        <text x={960} y={midY() - 69.5 + shifts.body} mountX={0.5} fontFamily={bodyFont} fontSize={30} lineHeight={33} color="#e6e6e6ff">
          {error()}
        </text>
        <view x={960 - retryW() / 2} y={midY() - 4} width={retryW()} height={72}>
          <view
            width={retryW()}
            height={72}
            pivot={0.5}
            transition={{ scale: { duration: 200, easing: 'ease-out' } }}
            scale={zone() === 'retry' ? 1.05 : 1}
          >
            <view width={retryW()} height={72} borderRadius={6} color="#ffffff01" shadow={RETRY_SHADOW} alpha={zone() === 'retry' ? 1 : 0} />
            <view width={retryW()} height={72} borderRadius={6} color={zone() === 'retry' ? '#e6e6e6ff' : '#7d848cff'} />
          </view>
          <text x={retryW() / 2} y={shifts.retry} mountX={0.5} fontFamily={retryFont} fontSize={39} lineHeight={66} color={zone() === 'retry' ? '#4c5059ff' : '#e6e6e6ff'}>
            {retryLabel}
          </text>
        </view>
      </view>

      <view>
        <Show when={thread()} keyed>
          {(th) => <SeerrIssueThread issue={th} canManage={issueViewer().canManageIssues} me={me()} onThreadClose={onThreadClose} onThreadChanged={onThreadChanged} />}
        </Show>
      </view>
    </view>
  )
}
