import $L from '../../../services/i18n.js'
import { Show, createSignal, onCleanup } from 'solid-js'
import Keyboard from '../Keyboard.jsx'
import * as seerrApi from '../../../services/seerrApi.js'
import { theme } from '../../theme.js'
import { toast } from '../../../state/store.js'
import { MEDIA_STATUS, REQUEST_STATUS, ISSUE_TYPE, getIssueTypeLabel, isUnlimitedQuota } from '../../../utils/seerrStatus.js'
import { cancelableRequests, isAvailableStatus, isContinuingSeries, seasonNumbersOf, unavailableOrRequestedSeasons } from '../../../utils/seerrRequestRules.js'
import { arrServiceName } from '../../../utils/seerrArrQueue.js'
import { focusScrollFor } from '../../../pages/Seerr/browseGrid.js'
import { openNativeInput, usesNativeKeyboard } from '../account/nativeInput.js'
import { coreAlert, manageDialog, matchDialog, moveFocus, pickerDialog, reportDialog, requestDialog } from '../seerr/SeerrDialogLayout.js'
import { matchState, needsSeriesMatch, resolveAdvanced, requestSheet, requestedByLabel, reportSheet } from '../seerr/SeerrDialogModels.js'
import { Glows, Icons, Imgs, Rects, Texts, oneLine } from './draw.jsx'

// The Seerr popups on a details page: the request sheet with its Sonarr match step, 4K switch, seasons and advanced server picks, Cancel Request's
// confirm, Get a different release, Manage Requests and Report Issue, with the option pickers over
// them. It opens on mount from its props: `action` (seerrRequest, seerrRequest4k,
// seerrRequestSeason, seerrCancel, seerrCancel4k, seerrSwapRelease, seerrManage or
// seerrReportIssue), `seerr` (the page's Seerr overlay), `item` and `season` (a season card's
// number). It calls onSeerrRefresh() after Seerr took a change, onSeerrSwapping() as a release
// swap starts, and onSeerrClose() when it's done.
const NONE = []
const EMPTY = { rects: NONE, glows: NONE, icons: NONE, texts: NONE, spaced: NONE }
const NO_CLIP = { x: 0, y: 0, w: 0, h: 0 }
const ISSUE_TYPES = [ISSUE_TYPE.VIDEO, ISSUE_TYPE.AUDIO, ISSUE_TYPE.SUBTITLES, ISSUE_TYPE.OTHER]

export default function SeerrSheets(props) {
  const [base, setBase] = createSignal(EMPTY)
  const [body, setBody] = createSignal(null)
  const [clip, setClip] = createSignal(NO_CLIP)
  const [spin, setSpin] = createSignal(null)
  const [top, setTop] = createSignal(EMPTY)
  // The keyboard is only built while a report's message types on it.
  const [kbOn, setKbOn] = createSignal(false)
  const overlay = props.seerr || {}
  const item = props.item || {}
  const S = { dialog: null, picker: null, busy: false, details: overlay.details || null, layout: { focusables: [] }, top: null }
  let root
  let kb
  let alive = true
  onCleanup(() => (alive = false))
  const isTv = () => overlay.mediaType === 'tv'

  // Who's asking, for the cancel and moderation rules, and the request sheet's servers and quota.
  const loadViewer = async () => {
    const user = await seerrApi.getUser().catch(() => null)
    const perms = user && user.permissions != null ? user.permissions : null
    const advanced = seerrApi.hasAdvancedRequestPermission(perms)
    const [servers, quota] = await Promise.all([
      advanced ? (isTv() ? seerrApi.getSonarrServers() : seerrApi.getRadarrServers()).catch(() => []) : [],
      user && user.id != null ? seerrApi.getUserQuota(user.id).catch(() => null) : null,
    ])
    return { perms, id: user && user.id != null ? user.id : null, advanced, servers: Array.isArray(servers) ? servers : [], quota }
  }
  const requests = () => (S.details && S.details.mediaInfo && S.details.mediaInfo.requests) || []
  const activeRequests = () => requests().filter((r) => r.status === REQUEST_STATUS.PENDING || r.status === REQUEST_STATUS.APPROVED)

  const done = () => {
    S.dialog = null
    S.picker = null
    render()
    if (alive && props.onSeerrClose) props.onSeerrClose()
  }
  const later = (fn) => setTimeout(() => alive && fn(), 0)

  // The request sheet. A track's own button asks for that track, and the one control of a title
  // with nothing owned starts on HD unless only 4K is open, with a switch when both are. A season
  // card opens it the way that control does, with just its season ticked. A series TMDB has no
  // TVDB id for starts on picking Sonarr's match for it.
  const openRequest = async (only4k, season = null) => {
    const o = overlay
    const hd = o.seerrOnly ? !!o.canRequestHd : !!o.offersRequest
    const fourK = o.seerrOnly ? !!o.canRequest4k : !!o.offersRequest4k
    const choose = season != null || (o.seerrOnly && !only4k)
    const is4k = choose ? !hd : only4k
    const toggle = choose && hd && fourK
    const matching = isTv() && needsSeriesMatch(S.details)
    const g = {
      kind: 'request', focus: toggle ? 'quality' : isTv() ? 'all' : 'advanced',
      is4k, startIs4k: is4k, toggle, allSeasons: season == null, seasons: season == null ? [] : [season],
      advanced: null, picks: { serverId: null, profileId: null, rootFolderId: null }, expanded: false, quota: null,
      matching, matches: null, lookupFailed: false, tvdbId: null, scroll: 0,
    }
    S.dialog = g
    if (matching) {
      g.sheetFocus = g.focus
      g.focus = 'cancel'
      loadMatches()
    }
    render()
    const viewer = await S.viewer
    if (!alive || S.dialog !== g) return
    g.quota = viewer.quota ? (isTv() ? viewer.quota.tv : viewer.quota.movie) : null
    if (viewer.advanced) {
      g.advanced = { loading: true, servers: null }
      render()
      const load = isTv() ? seerrApi.getSonarrServerDetails : seerrApi.getRadarrServerDetails
      const list = await Promise.all(viewer.servers.map((s) => load(s.id))).catch(() => null)
      if (!alive || S.dialog !== g) return
      g.advanced = { loading: false, servers: list }
    } else if (g.focus === 'advanced') {
      g.focus = 'cancel'
    } else if (g.sheetFocus === 'advanced') {
      g.sheetFocus = 'cancel'
    }
    render()
  }
  // Sonarr's series for the title. With no Sonarr to ask the sheet goes on to the request, and a
  // lookup that found nothing or failed keeps the step up, since Seerr would drop the request.
  const loadMatches = async () => {
    const g = S.dialog
    g.lookupFailed = false
    let found
    try {
      found = await seerrApi.lookupSonarrSeries(S.details.id)
    } catch (e) {
      console.warn('[Seerr] Sonarr lookup failed:', e && e.message)
      if (!alive || S.dialog !== g) return
      g.lookupFailed = true
      g.focus = 'next'
      return render()
    }
    if (!alive || S.dialog !== g) return
    if (found === null) return leaveMatches()
    // Seerr's own modal shows the first six, which is where the right one lands.
    g.matches = found.slice(0, 6)
    g.focus = !g.matches.length ? 'next' : `match:${g.matches[0].tvdbId}`
    render()
  }
  const leaveMatches = () => {
    const g = S.dialog
    g.matching = false
    g.focus = g.sheetFocus
    g.scroll = 0
    render()
  }
  const backToMatches = () => {
    const g = S.dialog
    g.matching = true
    g.focus = `match:${g.tvdbId}`
    g.scroll = 0
    render()
  }
  const chosenMatch = () => {
    const g = S.dialog
    return g.tvdbId != null && g.matches ? g.matches.find((m) => m.tvdbId === g.tvdbId) || null : null
  }
  const requestState = () => {
    const g = S.dialog
    const d = S.details
    const media = d.mediaInfo || {}
    const status = (g.is4k ? media.status4k : media.status) || 0
    const numbers = seasonNumbersOf(d.seasons, d.numberOfSeasons || 0)
    const taken = unavailableOrRequestedSeasons(media.seasons, activeRequests().filter((r) => !!r.is4k === g.is4k), g.is4k)
    const available = (media.seasons || []).filter((s) => isAvailableStatus(g.is4k ? s.status4k : s.status)).map((s) => s.seasonNumber)
    const resolved = resolveAdvanced(g.advanced && g.advanced.servers, g.picks, { is4k: g.is4k, isAnime: isTv() && (d.keywords || []).some((k) => k.id === 210024) })
    return requestSheet({
      g, isTv: isTv(), numbers, taken, available, resolved, quota: g.quota, limited: !isUnlimitedQuota(g.quota),
      continuing: isTv() && isContinuingSeries(d.status) && status === MEDIA_STATUS.AVAILABLE, match: chosenMatch(),
    })
  }
  const submitRequest = async () => {
    const g = S.dialog
    const sheet = requestState()
    if (!sheet.canSubmit || S.busy) return
    const seasons = isTv() && !g.allSeasons ? g.seasons.slice().sort((a, b) => a - b) : null
    if (seasons && !seasons.length) return
    const r = sheet.resolved
    const options = { is4k: g.is4k, serverId: r.serverId, profileId: r.profileId, rootFolder: r.rootFolder }
    if (g.tvdbId != null) options.tvdbId = g.tvdbId
    const mediaId = overlay.mediaId
    const tv = isTv()
    const refresh = props.onSeerrRefresh
    S.busy = true
    done()
    try {
      if (tv) await seerrApi.requestTv(mediaId, { ...options, seasons: seasons || 'all' })
      else await seerrApi.requestMovie(mediaId, options)
      if (refresh) refresh()
    } catch (e) {
      console.error('Request failed:', e)
      toast((e && e.message) || $L('Request failed'))
    } finally {
      S.busy = false
    }
  }

  // Cancel Request's confirm starts on Keep.
  const openCancel = async (is4k) => {
    const viewer = await S.viewer
    if (!alive) return
    const targets = cancelableRequests(activeRequests().filter((r) => !!r.is4k === is4k), {
      canManageRequests: seerrApi.canManageRequests(viewer.perms),
      currentUserId: viewer.id,
    })
    if (!targets.length) return done()
    const title = (item.Type === 'Episode' || item.Type === 'Season') && item.SeriesName ? item.SeriesName : item.Name || ''
    S.dialog = { kind: 'cancel', focus: 'keep', targets, is4k, title }
    render()
  }
  const confirmCancel = async () => {
    const targets = S.dialog.targets
    const refresh = props.onSeerrRefresh
    done()
    try {
      for (let i = 0; i < targets.length; i++) await seerrApi.cancelRequest(targets[i].id)
      if (refresh) refresh()
    } catch (e) {
      console.error('Cancel failed:', e)
      toast((e && e.message) || $L('Failed to cancel request'))
    }
  }

  // Get a different release starts on Cancel. It names the release the button stood for, so a poll
  // that lands meanwhile doesn't change what gets removed.
  const openSwap = () => {
    const release = overlay.swapRelease
    if (!release) return later(done)
    S.dialog = { kind: 'swap', focus: 'cancel', release }
    render()
  }
  const confirmSwap = async () => {
    const target = S.dialog.release
    const refresh = props.onSeerrRefresh
    const swapping = props.onSeerrSwapping
    done()
    if (swapping) swapping()
    try {
      await seerrApi.removeArrQueueItem(target.service, target.id)
    } catch (e) {
      toast($L("Couldn't remove the download"))
      // The button comes back for another try.
      if (refresh) refresh()
      return
    }
    toast($L('Removed. {service} is searching for another release.').replace('{service}', () => arrServiceName(target.service)))
    // The fresh overlay asks the queue again, which takes the bar and the button away.
    if (refresh) refresh()
  }

  // Manage Requests for a moderator, one answer at a time.
  const openManage = () => {
    const pending = requests().filter((r) => r.status === REQUEST_STATUS.PENDING)
    if (!pending.length) return later(done)
    S.dialog = { kind: 'manage', focus: `approve:${pending[0].id}`, pending }
    render()
  }
  const resolveRequest = async (requestId, approved) => {
    if (S.busy) return
    S.busy = true
    render()
    try {
      if (approved) await seerrApi.approveRequest(requestId)
      else await seerrApi.declineRequest(requestId)
      S.details = await (overlay.mediaType === 'tv' ? seerrApi.getTv(overlay.mediaId) : seerrApi.getMovie(overlay.mediaId))
      if (props.onSeerrRefresh) props.onSeerrRefresh()
    } catch (e) {
      console.error('Request update failed:', e)
      toast((e && e.message) || $L('Failed to update request'))
    }
    S.busy = false
    if (!alive || !S.dialog || S.dialog.kind !== 'manage') return
    const pending = requests().filter((r) => r.status === REQUEST_STATUS.PENDING)
    // Answering the last request leaves nothing to manage, so the sheet closes.
    if (!pending.length) return done()
    S.dialog.pending = pending
    if (!pending.some((r) => S.dialog.focus.indexOf(`:${r.id}`) > 0)) S.dialog.focus = `approve:${pending[0].id}`
    render()
  }

  // Report Issue opens on a season or episode's own number when it came from one.
  const openReport = () => {
    const d = S.details
    const numbers = seasonNumbersOf(d.seasons, d.numberOfSeasons || 0)
    const fromSeason = item.Type === 'Episode' ? item.ParentIndexNumber : item.Type === 'Season' ? item.IndexNumber : null
    const startsOnSeason = isTv() && fromSeason > 0
    S.dialog = {
      kind: 'report', focus: `type:${ISSUE_TYPE.VIDEO}`, issueType: ISSUE_TYPE.VIDEO, message: '', submitting: false, editing: false,
      season: startsOnSeason ? fromSeason : isTv() && numbers.length === 1 ? numbers[0] : 0,
      episode: startsOnSeason && item.Type === 'Episode' && item.IndexNumber > 0 ? item.IndexNumber : 0,
      numbers,
    }
    render()
  }
  const reportState = () => {
    const g = S.dialog
    const d = S.details
    const episodeCount = g.season > 0 ? ((d.seasons || []).find((s) => s.seasonNumber === g.season) || {}).episodeCount || 0 : 0
    return reportSheet({
      g, isTv: isTv(), episodeCount,
      types: ISSUE_TYPES.map((type) => ({ id: `type:${type}`, label: getIssueTypeLabel(type), selected: g.issueType === type })),
    })
  }
  const submitReport = async () => {
    const g = S.dialog
    const text = g.message.trim()
    if (!text || g.submitting) return
    g.submitting = true
    render()
    try {
      await seerrApi.createIssue({
        issueType: g.issueType, message: text, mediaId: S.details.mediaInfo.id,
        problemSeason: isTv() ? g.season : 0, problemEpisode: isTv() && g.season > 0 ? g.episode : 0,
      })
      if (alive) done()
      return
    } catch (e) {
      console.error('Issue report failed:', e && e.message)
    }
    if (!alive) return
    g.submitting = false
    render()
  }
  const editMessage = (viaNative) => {
    const g = S.dialog
    g.editing = true
    render()
    if (viaNative || usesNativeKeyboard()) {
      const f = (S.layout.focusables || []).find((x) => x.id === 'message') || { x: 634, y: 600, w: 652, h: 89 }
      const opened = openNativeInput({
        value: g.message,
        rect: { x: f.x, y: f.y, w: f.w, h: f.h },
        onChange: (text) => onKeyboardChange(text),
        onClose: (submitted, key) => {
          onKeyboardClose()
          if (key) move(key)
        },
      })
      if (opened !== false) {
        setKbOn(false)
        return
      }
    }
    setKbOn(true)
    if (!kb) return
    kb.open({ value: g.message })
    kb.setFocus()
  }
  const onKeyboardChange = (text) => {
    if (!S.dialog || S.dialog.kind !== 'report') return
    S.dialog.message = String(text || '')
    render()
  }
  const onKeyboardClose = () => {
    setKbOn(false)
    if (!S.dialog || S.dialog.kind !== 'report') return
    S.dialog.editing = false
    render()
    if (root) root.setFocus()
  }

  // The option pickers the selector rows open.
  const openPicker = (key) => {
    const g = S.dialog
    if (g.kind === 'request') {
      const row = requestState().pickers[key]
      if (!row) return
      S.picker = { key, title: row.label, labels: row.labels, selected: row.index, ids: row.ids, focus: `opt${row.index}` }
    } else {
      const labels =
        key === 'season' ? [0].concat(g.numbers).map((n) => (n > 0 ? $L('Season {number}').replace('{number}', n) : $L('All Seasons'))) : reportState().episodeLabels
      const selected = key === 'season' ? Math.max(0, [0].concat(g.numbers).indexOf(g.season)) : g.episode
      S.picker = { key, title: key === 'season' ? $L('Season') : $L('Episode'), labels, selected, focus: `opt${selected}` }
    }
    render()
  }
  const pick = (index) => {
    const p = S.picker
    const g = S.dialog
    S.picker = null
    if (g.kind === 'request') {
      const id = p.ids[index]
      if (p.key === 'server') g.picks = { serverId: id, profileId: null, rootFolderId: null }
      else if (p.key === 'profile') g.picks = { ...g.picks, profileId: id }
      else g.picks = { ...g.picks, rootFolderId: id }
    } else if (p.key === 'season') {
      g.season = [0].concat(g.numbers)[index]
      g.episode = 0
    } else {
      g.episode = index
    }
    render()
  }

  // Draws the dialog and the picker over it from their state. A body taller than the screen
  // scrolls to keep the focused control in view.
  function render() {
    const t = theme()
    const g = S.dialog
    const focusId = g && !S.picker ? g.focus : null
    const scrolled = (make) => {
      let l = make(g.scroll || 0)
      const f = l.focusables.find((x) => x.id === g.focus)
      if (f && l.viewH < l.bodyH) {
        const next = focusScrollFor(f.y - l.bodyTop + l.scroll, f.h, l.scroll, l.viewH, l.bodyH - l.viewH)
        if (next !== l.scroll) l = make((g.scroll = next))
      }
      return l
    }
    let b = null
    if (g && g.kind === 'request' && g.matching) b = scrolled((scroll) => matchDialog({ t, s: matchState(g), focusId, scroll, clipBody: true }))
    else if (g && g.kind === 'request') b = scrolled((scroll) => requestDialog({ t, s: requestState(), focusId, scroll, clipBody: true }))
    else if (g && g.kind === 'swap') {
      const label = $L('Get a different release')
      const message = $L("{service} will remove {release} from the download client, block it so it isn't grabbed again, and search for another release.")
        .replace('{service}', () => arrServiceName(g.release.service))
        .replace('{release}', () => g.release.release || '')
      b = coreAlert({ t, title: label, message, focusId: g.focus, actions: [{ id: 'cancel', label: $L('Cancel') }, { id: 'confirm', label, destructive: true }] })
    } else if (g && g.kind === 'cancel') {
      const label = g.is4k ? $L('Cancel 4K Request') : $L('Cancel Request')
      const message =
        g.targets.length === 1
          ? $L('Cancel request for "{title}"?').replace('{title}', g.title)
          : $L('Cancel {count} requests for "{title}"?').replace('{count}', g.targets.length).replace('{title}', g.title)
      b = coreAlert({ t, title: label, message, focusId: g.focus, actions: [{ id: 'keep', label: $L('Keep') }, { id: 'confirm', label, destructive: true }] })
    } else if (g && g.kind === 'manage') {
      b = scrolled((scroll) =>
        manageDialog({ t, busy: S.busy, focusId: g.focus, scroll, clipBody: true, requests: g.pending.map((r) => ({ id: r.id, label: requestedByLabel(r) })) }),
      )
    } else if (g && g.kind === 'report') {
      b = scrolled((scroll) => reportDialog({ t, s: reportState(), focusId: S.picker || g.editing ? null : g.focus, scroll, clipBody: true }))
    }
    S.layout = b || { focusables: [] }
    setBase(b ? { rects: b.rects, glows: b.glows, icons: b.icons, texts: oneLine(b.texts), spaced: oneLine(b.spaced), imgs: b.imgs || NONE } : EMPTY)
    const bd = b && b.body
    setClip(bd ? b.clip : NO_CLIP)
    setBody(bd ? { rects: bd.rects, imgs: bd.imgs, icons: bd.icons, texts: oneLine(bd.texts), spaced: oneLine(bd.spaced) } : null)
    const sp = bd && bd.spinners[0]
    setSpin(sp ? { x: sp.x, y: sp.y, w: sp.size, h: sp.size } : null)
    const p = S.picker
    const tp = p ? pickerDialog({ t, title: p.title, labels: p.labels, selectedIndex: p.selected, focusId: p.focus }) : null
    S.top = tp
    setTop(tp ? { rects: tp.rects, glows: tp.glows || NONE, icons: tp.icons, texts: oneLine(tp.texts), spaced: oneLine(tp.spaced) } : EMPTY)
  }
  const move = (dir) => {
    const layer = S.picker || S.dialog
    if (!layer) return true
    const list = S.picker ? S.top.focusables : S.layout.focusables
    const next = moveFocus(list, layer.focus, dir)
    if (next) {
      layer.focus = next
      render()
    }
    return true
  }
  const press = () => {
    const p = S.picker
    if (p) {
      if (p.focus === 'cancel') S.picker = null
      else return pick(Number(p.focus.slice(3)))
      return render()
    }
    const g = S.dialog
    if (!g) return
    const f = g.focus
    if (g.kind === 'cancel') return f === 'confirm' ? confirmCancel() : done()
    if (g.kind === 'swap') return f === 'confirm' ? confirmSwap() : done()
    if (g.kind === 'request' && g.matching) {
      if (f === 'cancel') return done()
      if (f.indexOf('match:') === 0) {
        g.tvdbId = Number(f.slice(6))
        g.focus = 'next'
        return render()
      }
      if (f !== 'next') return
      if (g.lookupFailed) {
        loadMatches()
        return render()
      }
      if (g.matches && !g.matches.length) return done()
      if (g.tvdbId != null) leaveMatches()
      return
    }
    // After a match was picked, its card and Back step back to the picker.
    if (g.kind === 'request' && (f === 'match' || (f === 'cancel' && chosenMatch()))) return backToMatches()
    if (g.kind === 'manage') {
      if (S.busy) return
      const [action, id] = f.split(':')
      return resolveRequest(Number(id), action === 'approve')
    }
    if (f === 'cancel') return g.submitting ? null : done()
    if (g.kind === 'request') {
      if (f === 'submit') return submitRequest()
      if (f === 'quality') {
        // Server picks only fill a blank, so a switch of track starts them over.
        g.is4k = !g.is4k
        g.picks = { serverId: null, profileId: null, rootFolderId: null }
      } else if (f === 'all') {
        g.allSeasons = !g.allSeasons
        if (g.allSeasons) g.seasons = []
      } else if (f === 'advanced') g.expanded = !g.expanded
      else if (f.indexOf('adv:') === 0) return openPicker(f.slice(4))
      else if (f.indexOf('season:') === 0) {
        const n = Number(f.slice(7))
        g.seasons = g.seasons.indexOf(n) < 0 ? g.seasons.concat([n]) : g.seasons.filter((x) => x !== n)
      }
      return render()
    }
    if (g.kind === 'report') {
      if (f === 'submit') return submitReport()
      if (f === 'message') return editMessage(false)
      if (f === 'season' || f === 'episode') return openPicker(f)
      if (f.indexOf('type:') === 0) g.issueType = Number(f.slice(5))
      return render()
    }
  }

  S.viewer = loadViewer()
  const id = props.action
  if (!S.details) later(done)
  else if (id === 'seerrRequest' || id === 'seerrRequest4k') openRequest(id === 'seerrRequest4k')
  else if (id === 'seerrRequestSeason') openRequest(false, props.season > 0 ? props.season : null)
  else if (id === 'seerrSwapRelease') openSwap()
  else if (id === 'seerrCancel' || id === 'seerrCancel4k') openCancel(id === 'seerrCancel4k')
  else if (id === 'seerrManage') openManage()
  else if (id === 'seerrReportIssue') openReport()
  else later(done)

  const spinner = (n) => {
    if (!n) return
    n.rotation = 0
    n.animate({ rotation: Math.PI * 2 }, { duration: 1000, easing: 'linear', loop: true }).start()
  }
  const Layer = (lp) => (
    <view>
      <Glows list={lp.d.glows || NONE} />
      <Rects list={lp.d.rects || NONE} />
      <Imgs list={lp.d.imgs || NONE} />
      <Icons list={lp.d.icons || NONE} />
      <Texts list={lp.d.texts || NONE} />
      <Texts list={lp.d.spaced || NONE} />
    </view>
  )
  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onUp={() => move('up')}
      onDown={() => move('down')}
      onLeft={() => move('left')}
      onRight={() => move('right')}
      onEnter={() => {
        press()
        return true
      }}
      onBack={() => {
        if (S.picker) {
          S.picker = null
          render()
        } else if (!(S.dialog && S.dialog.submitting)) done()
        return true
      }}
      onKeyPress={() => true}
    >
      <Layer d={base()} />
      <view x={clip().x} y={clip().y} width={clip().w} height={clip().h} clipping>
        <view x={-clip().x} y={-clip().y} width={1920} height={1080}>
          <view>
            <Show when={body()}>
              <Layer d={body()} />
            </Show>
          </view>
          <view>
            <Show when={spin()} keyed>
              {(sp) => <view ref={spinner} x={sp.x} y={sp.y} width={sp.w} height={sp.h} src="spinner/arc.webp" color={theme().accent} />}
            </Show>
          </view>
        </view>
      </view>
      <Layer d={top()} />
      <view>
        <Show when={kbOn()}>
          <Keyboard overlay ref={(n) => (kb = n)} onKeyboardChange={onKeyboardChange} onKeyboardClose={onKeyboardClose} onKeyboardNative={() => editMessage(true)} />
        </Show>
      </view>
    </view>
  )
}
