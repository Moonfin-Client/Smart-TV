import $L from '../../services/i18n.js'
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import Spinner from '../../ui/components/Spinner.jsx'
import NotificationToast from '../../ui/components/shell/NotificationToast.jsx'
import { Icons, Rects, Texts, oneLine } from '../../ui/components/modals/draw.jsx'
import { OverNav } from '../../ui/layers.jsx'
import { keyed } from '../../ui/components/library/pageKit.js'
import { fontFor, uiFont } from '../../ui/text.js'
import { navOnLeft, theme } from '../../ui/theme.js'
import { hex } from '../../ui/color.js'
import { textWidth, seerrBadgeStyle, statusBanner } from '../../ui/components/seerr/look.js'
import { lineCount } from '../../ui/components/player/look.js'
import { advancedLayout, moveFocus, pickerDialog } from '../../ui/components/seerr/SeerrDialogLayout.js'
import { advancedRows, resolveAdvanced } from '../../ui/components/seerr/SeerrDialogModels.js'
import { focusNav } from '../../app/focus.js'
import { router } from '../../app/router.js'
import { getStore } from '../../state/store.js'
import * as seerrApi from '../../services/seerrApi.js'
import { MEDIA_STATUS } from '../../utils/seerrStatus.js'
import { openSeerrItem } from './seerrModels.js'
import { focusScrollFor } from './browseGrid.js'
import { firstSelectable, isPartRequestable, partStatus, partYear, sheetLayout } from './collectionParts.js'

// A TMDB collection's parts over its backdrop, how many the library holds, and a Request
// Collection sheet that asks for every part it can take in one go, with Advanced Options (the
// Radarr server, profile and folder) for a viewer allowed to pick them. The sheet and its option
// picker draw over the nav.
const NO_PICKS = { serverId: null, profileId: null, rootFolderId: null }
const NONE = []
const DOT = { available: '#22c55eff', requested: '#6366f1ff', pending: '#eab308ff' }
const CARD_PITCH = 244
const ROW_W = 1776
// The dialog's body sits under its title and line, and keeps 33px of padding under it.
const BODY_TOP = 108
const BODY_MAX = 1000 - BODY_TOP - 34.4
const COVER = { resizeMode: { type: 'cover' } }
const WHITE_RING = { width: 3, color: hex('#ffffffff') }
const ROW_RING = { width: 1.67, color: hex('#00a4dcff') }
const BUTTON_RING = { width: 3.34, color: hex('#00a4dcff') }
const DOT_EDGE = { width: 1, color: hex('#0000008c') }
const SHEET_EDGE = { width: 1, color: hex('#ffffff33') }

export default function Collection(props) {
  const store = getStore()
  const [collection, setCollection] = createSignal(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  const [permissions, setPermissions] = createSignal(null)
  const [quota, setQuota] = createSignal(null)
  const [zone, setZone] = createSignal('button')
  const [cur, setCur] = createSignal(0)
  const [scrollX, setScrollX] = createSignal(0)
  const [sheet, setSheet] = createSignal(null)
  const [note, setNote] = createSignal(null)
  const titleFont = uiFont('bold')
  const bodyFont = uiFont()
  const buttonFont = uiFont('bold')
  const bannerFont = uiFont('bold')
  const sheetTitle = $L('Request Collection')
  const my = { moved: false, servers: null, alive: true }
  let root
  let sheetNode
  let spinner
  onCleanup(() => (my.alive = false))

  const parts = createMemo(() => ((collection() && collection().parts) || []).filter((p) => !(p.mediaInfo && p.mediaInfo.status === MEDIA_STATUS.BLOCKLISTED)))
  const canUse4k = () => seerrApi.canRequest4kMovies(permissions())
  const showRequest = () => {
    const list = parts()
    const has = list.some((p) => isPartRequestable(p, false)) || (canUse4k() && list.some((p) => isPartRequestable(p, true)))
    return seerrApi.canRequestMovies(permissions()) && has
  }
  const header = createMemo(() => {
    const c = collection()
    if (!c) return null
    const available = parts().filter((p) => {
      const status = p.mediaInfo && p.mediaInfo.status
      return status === MEDIA_STATUS.AVAILABLE || status === MEDIA_STATUS.PARTIALLY_AVAILABLE
    }).length
    const overview = c.overview || ''
    const lines = overview ? Math.min(3, lineCount(overview, 22, 'regular', 1100)) : 0
    const afterOverview = overview ? 148 + lines * 31.9 + 24 : 148
    const label = $L('Request Collection')
    return {
      name: c.name || '',
      nameFont: fontFor(c.name || '', 'bold'),
      summary: $L('{count} of {total} available').replace('{count}', available).replace('{total}', parts().length),
      overview,
      overviewFont: fontFor(overview),
      buttonY: afterOverview,
      buttonLabel: label,
      buttonW: textWidth(label, 24, 'bold') + 74,
      rowY: showRequest() ? afterOverview + 67 + 30 : afterOverview,
      backdrop: c.backdropPath ? seerrApi.getImageUrl(c.backdropPath, 'w1280') : '',
    }
  })
  const cards = createMemo(() => {
    const style = seerrBadgeStyle()
    return parts().map((part, i) => {
      const title = part.title || part.name || ''
      const status = partStatus(part, false)
      const poster = part.posterPath || part.poster_path
      return {
        key: `part-${part.id}`,
        i,
        x: 4 + i * CARD_PITCH,
        title,
        titleFont: fontFor(title),
        year: partYear(part) || '',
        image: poster ? seerrApi.getImageUrl(poster, 'w342') : '',
        dot: style === 'badge' && status ? DOT[status] : '',
        banner: style === 'banner' ? statusBanner(part.mediaInfo && part.mediaInfo.status, 200) : null,
      }
    })
  })
  const cardFocus = () => (zone() === 'parts' && !sheet() ? cur() : -1)
  const buttonFocused = () => zone() === 'button' && !sheet()
  // Where the request goes: the viewer's picks, with each server's defaults filling the rest.
  const resolved = createMemo(() => {
    const s = sheet()
    return resolveAdvanced(s && s.advanced && s.advanced.servers, s ? s.picks : NO_PICKS, { is4k: !!(s && s.is4k) })
  })
  const advanced = createMemo(() => {
    const s = sheet()
    if (!s || !s.advanced) return null
    const a = { expanded: s.expanded, loading: s.advanced.loading, rows: s.advanced.loading ? [] : advancedRows(s.advanced.servers, resolved()) }
    return { ...advancedLayout({ a, w: 652.4, focusId: s.picker ? null : s.focusId }), rows: a.rows }
  })
  const advSpin = () => {
    const sp = advanced() && advanced().spinners[0]
    return sp ? { x: sp.x, y: sp.y, w: sp.size, h: sp.size } : null
  }
  // The option list a selector row opens, over the sheet.
  const picker = createMemo(() => {
    const p = sheet() && sheet().picker
    return p ? pickerDialog({ t: theme(), title: p.title, labels: p.labels, selectedIndex: p.selected, focusId: p.focus }) : null
  })
  const layout = createMemo(() => {
    const s = sheet()
    if (!s) return null
    return sheetLayout({
      parts: parts(),
      is4k: s.is4k,
      selected: s.selected,
      quota: quota(),
      canUse4k: canUse4k(),
      wraps: (label, trailing) => lineCount(label, 23.37, 'regular', trailing ? 468 : 567),
      advanced: advanced(),
    })
  })
  const sheetH = () => (layout() ? Math.min(1000, BODY_TOP + layout().bodyH + 34.4) : 0)
  const sheetY = () => Math.max(40, (1080 - sheetH()) / 2)
  const bodyView = () => (layout() ? Math.min(BODY_MAX, layout().bodyH) : 0)
  // Every row the sheet draws, placed in the body, the parts inside their own window.
  const sheetRows = createMemo(() => {
    const l = layout()
    if (!l) return []
    const s = sheet()
    return l.rows.map((r) => {
      const inList = r.kind === 'part'
      const focused = s.focusId === r.id
      return {
        ...r,
        key: r.id,
        y: inList ? l.listTop + r.listY - s.listScroll : r.y,
        hidden: inList && (r.listY + r.h <= s.listScroll || r.listY >= s.listScroll + l.listH),
        focused,
        ink: focused ? '#000000de' : r.enabled ? '#ffffffff' : '#ffffff61',
        font: fontFor(r.label),
        icon: r.kind === 'toggle' ? (r.on ? 'toggleOn' : 'toggleOff') : r.on ? 'checkBox' : 'checkBoxBlank',
        iconColor: focused ? '#000000de' : r.on ? '#00a4dcff' : '#ffffff61',
        labelX: r.kind === 'all' ? 71 : r.kind === 'toggle' || r.kind === 'quota' ? 14 : 70,
        labelW: r.kind === 'toggle' ? 547 : r.trailing ? 468 : 567,
        trailingColor: focused ? '#000000de' : r.available ? '#81c784ff' : '#90caf9ff',
      }
    })
  })
  const sheetParts = keyed(() => sheetRows().filter((r) => r.kind === 'part' && !r.hidden), (r) => r.key)
  const sheetFixed = keyed(() => sheetRows().filter((r) => r.kind !== 'part' && r.kind !== 'adv'), (r) => r.key)
  const sheetButtons = () => {
    const l = layout()
    const s = sheet()
    if (!l || !s) return []
    const count = s.selected.length
    const off = count === 0 || l.overCap
    return [
      { key: 'cancel', x: 0, label: $L('Cancel'), fill: '#ffffff1a', ink: '#ffffffff', focused: s.focusId === 'cancel' },
      {
        key: 'request', x: 336, label: $L('Request {count} movies').replace('{count}', count),
        fill: off ? '#ffffff1f' : '#6366f1ff', ink: off ? '#ffffff61' : '#ffffffff', focused: s.focusId === 'request',
      },
    ]
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const c = await seerrApi.getCollection(props.id)
      if (my.alive) setCollection(c)
    } catch (e) {
      console.error('[seerr] collection failed', e)
      if (my.alive) setError((e && e.message) || $L('Failed to load'))
    }
    if (!my.alive) return
    setLoading(false)
    if (!showRequest()) setZone('parts')
  }
  const loadUser = async () => {
    const u = await seerrApi.getUser().catch(() => null)
    if (!u || !my.alive) return
    setPermissions(u.permissions != null ? u.permissions : 0)
    if (!loading() && showRequest() && zone() === 'parts' && !my.moved) setZone('button')
    // Only a viewer allowed to pick where requests go gets the Radarr list, and Advanced Options.
    if (seerrApi.hasAdvancedRequestPermission(u.permissions)) {
      seerrApi.getRadarrServers().then((list) => {
        my.servers = Array.isArray(list) ? list : []
      }).catch(() => {})
    }
    if (u.id != null) {
      const q = await seerrApi.getUserQuota(u.id).catch(() => null)
      if (q && my.alive) setQuota(q.movie || null)
    }
  }
  const focusPart = (i) => {
    setCur(i)
    setScrollX(focusScrollFor(4 + i * CARD_PITCH, 222, scrollX(), ROW_W, Math.max(0, 8 + parts().length * CARD_PITCH - 22 - ROW_W)))
  }
  const openSheet = () => {
    const selected = firstSelectable(parts(), false, quota())
    const servers = my.servers
    const advancedState = servers ? { loading: true, servers: null } : null
    setSheet({
      is4k: false, selected, focusId: 'all', listScroll: 0, bodyScroll: 0, busy: false,
      advanced: advancedState, picks: NO_PICKS, expanded: false, picker: null,
    })
    if (sheetNode) sheetNode.setFocus()
    if (!servers) return
    // Each visit loads the servers' profiles and folders again, as the sheet mounts afresh.
    Promise.all(servers.map((sv) => seerrApi.getRadarrServerDetails(sv.id))).catch(() => null).then((list) => {
      const s = sheet()
      if (!my.alive || !s || s.advanced !== advancedState) return
      setSheet({ ...s, advanced: { loading: false, servers: list } })
    })
  }
  const closeSheet = () => {
    setSheet(null)
    if (root) root.setFocus()
  }
  const openPicker = (key) => {
    const row = advanced().rows.find((r) => r.key === key)
    if (!row) return
    setSheet({ ...sheet(), picker: { key, title: row.label, labels: row.labels, ids: row.ids, selected: row.index, focus: `opt${row.index}` } })
  }
  // Server picks only fill a blank, so a new server starts its profile and folder over.
  const pick = (index) => {
    const s = sheet()
    const p = s.picker
    const id = p.ids[index]
    let picks = { ...s.picks, rootFolderId: id }
    if (p.key === 'server') picks = { serverId: id, profileId: null, rootFolderId: null }
    else if (p.key === 'profile') picks = { ...s.picks, profileId: id }
    setSheet({ ...s, picks, picker: null })
  }
  const pickerKey = (dir) => {
    const s = sheet()
    if (dir === 'enter') {
      if (s.picker.focus === 'cancel') return setSheet({ ...s, picker: null })
      return pick(Number(s.picker.focus.slice(3)))
    }
    const next = moveFocus(picker().focusables, s.picker.focus, dir)
    if (next) setSheet({ ...s, picker: { ...s.picker, focus: next } })
  }
  const sheetOrder = () => layout().rows.filter((r) => r.enabled).map((r) => r.id).concat(['cancel', 'request'])
  // Scrolls the focused row into view, first inside the parts list, then the dialog body.
  const sheetFocus = (id) => {
    const l = layout()
    const s = { ...sheet(), focusId: id }
    const row = l.rows.find((r) => r.id === id)
    let top
    let h
    if (row && row.kind === 'part') {
      s.listScroll = focusScrollFor(row.listY, row.h, s.listScroll, l.listH, Math.max(0, l.listFull - l.listH))
      top = l.listTop + row.listY - s.listScroll
      h = row.h
    } else if (row) {
      top = row.y
      h = row.h
    } else {
      top = l.buttonsY
      h = 82.5
    }
    s.bodyScroll = focusScrollFor(top, h, s.bodyScroll, bodyView(), Math.max(0, l.bodyH - bodyView()))
    setSheet(s)
  }
  const sheetMove = (delta) => {
    const s = sheet()
    const order = sheetOrder()
    let at = order.indexOf(s.focusId)
    if (s.focusId === 'request' && delta < 0) at = order.indexOf('cancel')
    if (s.focusId === 'cancel' && delta > 0) return
    const next = order[at + delta]
    if (next) sheetFocus(next)
  }
  // One movie at a time. A duplicate counts as done and a quota refusal stops the run, since the
  // rest would fail the same way.
  const submit = async () => {
    const s = sheet()
    const r = resolved()
    const target = { serverId: r.serverId, profileId: r.profileId, rootFolder: r.rootFolder }
    setSheet({ ...s, busy: true })
    let ok = 0
    let failed = 0
    let quotaStopped = false
    for (let i = 0; i < s.selected.length; i++) {
      try {
        await seerrApi.requestMovie(s.selected[i], { is4k: s.is4k, ...target })
        ok++
      } catch (e) {
        if (e && e.status === 409) ok++
        else if (e && e.status === 403 && /quota/i.test(e.message || '')) {
          quotaStopped = true
          break
        } else failed++
      }
    }
    if (!my.alive) return
    closeSheet()
    load()
    const summary = [`${ok} ${$L('requested')}`]
    if (failed > 0) summary.push(`${failed} ${$L('failed')}`)
    setNote({ key: Date.now(), title: quotaStopped ? $L('Request limit reached') : $L('Request Collection'), body: summary.join(' · ') })
  }
  const sheetSelect = () => {
    const s = sheet()
    const l = layout()
    if (s.busy) return
    if (s.focusId === 'cancel') return closeSheet()
    if (s.focusId === 'request') {
      if (!s.selected.length || l.overCap) return
      return submit()
    }
    if (s.focusId === 'all') {
      setSheet({ ...s, selected: l.rows[0].on ? [] : firstSelectable(parts(), s.is4k, quota()) })
    } else if (s.focusId === '4k') {
      setSheet({ ...s, is4k: !s.is4k, selected: firstSelectable(parts(), !s.is4k, quota()), picks: NO_PICKS })
    } else if (s.focusId === 'advanced') {
      setSheet({ ...s, expanded: !s.expanded })
    } else if (s.focusId.indexOf('adv:') === 0) {
      openPicker(s.focusId.slice(4))
    } else {
      const row = l.rows.find((r) => r.id === s.focusId)
      if (!row || !row.enabled) return
      const on = s.selected.indexOf(row.partId) >= 0
      if (on) setSheet({ ...s, selected: s.selected.filter((id) => id !== row.partId) })
      else if (s.selected.length < l.cap) setSheet({ ...s, selected: s.selected.concat([row.partId]) })
    }
  }

  createEffect(
    on(advSpin, (sp) => {
      if (!sp || !spinner) return
      spinner.rotation = 0
      spinner.animate({ rotation: Math.PI * 2 }, { duration: 1000, easing: 'linear', loop: true }).start()
    }),
  )
  createEffect(on(props.page.active, (a) => a && (store.navSection = 'seerr')))
  onMount(() => {
    store.navSection = 'seerr'
    if (root) root.setFocus()
    loadUser()
    load()
  })

  const h = header
  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color="#000000ff"
      onUp={() => {
        if (zone() === 'parts' && showRequest()) setZone('button')
        else if (!navOnLeft()) return focusNav()
        return true
      }}
      onDown={() => {
        if (zone() === 'button' && parts().length) {
          my.moved = true
          setZone('parts')
          focusPart(cur())
        }
        return true
      }}
      onLeft={() => {
        if (zone() === 'parts' && cur() > 0) focusPart(cur() - 1)
        else if (navOnLeft()) return focusNav()
        return true
      }}
      onRight={() => {
        if (zone() === 'parts' && cur() < parts().length - 1) focusPart(cur() + 1)
        return true
      }}
      onEnter={() => {
        if (zone() === 'button' && showRequest()) openSheet()
        else if (zone() === 'parts' && parts()[cur()]) openSeerrItem(router, { id: parts()[cur()].id, mediaType: 'movie' })
        return true
      }}
    >
      <view>
        <Show when={h() && h().backdrop}>
          <view width={1920} height={1080} src={h().backdrop} textureOptions={COVER} alpha={0.25} />
        </Show>
      </view>
      <view width={1920} height={1080} colorTop="#0f0f0f73" colorBottom="#0f0f0ff2" />

      <view>
        <Show when={loading()}>
          <Spinner x={928} y={508} size={64} />
        </Show>
      </view>
      <text x={112} y={100} fontFamily={bodyFont} fontSize={24} color="#ffffffb3">
        {error()}
      </text>

      <view>
        <Show when={h()}>
          <view>
            <text x={72} y={62} fontFamily={h().nameFont} fontSize={54} lineHeight={33} maxWidth={1776} maxLines={1} color="#ffffffff">
              {h().name}
            </text>
            <text x={72} y={103} fontFamily={bodyFont} fontSize={22} lineHeight={33} color="#ffffffa6">
              {h().summary}
            </text>
            <text x={72} y={150} fontFamily={h().overviewFont} fontSize={22} lineHeight={31.9} maxWidth={1100} maxLines={3} color="#ffffffbf">
              {h().overview}
            </text>
            <view x={72} y={h().buttonY} width={h().buttonW} height={67} pivot={0.5} scale={buttonFocused() ? 1.03 : 1} alpha={showRequest() ? 1 : 0}>
              <view width={h().buttonW} height={67} borderRadius={10} color="#00a4dcff" />
              <view width={h().buttonW} height={67} borderRadius={10} color="#00000000" border={WHITE_RING} alpha={buttonFocused() ? 1 : 0} />
              <text x={37} y={19} fontFamily={buttonFont} fontSize={24} lineHeight={33} color="#ffffffff">
                {h().buttonLabel}
              </text>
            </view>
            <view x={72} y={h().rowY} width={ROW_W} height={418} clipping>
              <view transition={{ x: { duration: 200, easing: 'ease-out' } }} x={-scrollX()} y={10} width={8 + cards().length * CARD_PITCH + ROW_W} height={398}>
                <For each={cards()}>
                  {(card) => {
                    const on = () => card.i === cardFocus()
                    return (
                      <view x={card.x} width={222} height={378} pivot={0.5} scale={on() ? 1.04 : 1}>
                        <view width={222} height={378} borderRadius={10} color="#00000000" border={WHITE_RING} alpha={on() ? 1 : 0} />
                        <view x={11} y={11} width={200} height={280} borderRadius={8} color="#252525ff" />
                        <Show when={card.image}>
                          <view x={11} y={11} width={200} height={280} borderRadius={8} src={card.image} textureOptions={COVER} />
                        </Show>
                        <Show when={card.banner}>
                          <view x={11} y={11} width={200} height={20} borderRadius={[8, 8, 0, 0]} color={card.banner.fill}>
                            <text x={100} mountX={0.5} fontFamily={bannerFont} fontSize={10} lineHeight={20} letterSpacing={1} color={card.banner.ink}>
                              {card.banner.label}
                            </text>
                          </view>
                        </Show>
                        <Show when={card.dot}>
                          <view x={179} y={21} width={22} height={22} borderRadius={11} color={card.dot} border={DOT_EDGE} />
                        </Show>
                        <text x={11} y={303} fontFamily={card.titleFont} fontSize={20} lineHeight={33} maxWidth={200} maxLines={1} color="#ffffffff">
                          {card.title}
                        </text>
                        <text x={11} y={336} fontFamily={bodyFont} fontSize={17} lineHeight={33} color="#ffffff80">
                          {card.year}
                        </text>
                      </view>
                    )
                  }}
                </For>
              </view>
            </view>
          </view>
        </Show>
      </view>

      <Show when={sheet()}>
        <OverNav>
          <view
            ref={sheetNode}
            width={1920}
            height={1080}
            onUp={() => (sheet().picker ? pickerKey('up') : sheetMove(-1), true)}
            onDown={() => (sheet().picker ? pickerKey('down') : sheetMove(1), true)}
            onLeft={() => {
              const s = sheet()
              if (!s.picker && s.focusId === 'request') sheetFocus('cancel')
              return true
            }}
            onRight={() => {
              const s = sheet()
              if (!s.picker && s.focusId === 'cancel') sheetFocus('request')
              return true
            }}
            onEnter={() => (sheet().picker ? pickerKey('enter') : sheetSelect(), true)}
            onBack={() => {
              if (sheet().picker) setSheet({ ...sheet(), picker: null })
              else closeSheet()
              return true
            }}
          >
            <view width={1920} height={1080} color="#0000008a" />
            <view x={592.7} y={sheetY()} width={734.6} height={sheetH()} borderRadius={33.39} color="#0e1117e6" border={SHEET_EDGE}>
              <text x={40.07} y={35.39} fontFamily={titleFont} fontSize={33.39} lineHeight={39.07} color="#ffffffff">
                {sheetTitle}
              </text>
              <view x={1} y={92.5} width={732.6} height={1.67} color="#ffffff14" />
              <view x={1} y={BODY_TOP} width={732.6} height={bodyView()} clipping>
                <view x={40.07} y={-sheet().bodyScroll} width={652.4} height={layout() ? layout().bodyH : 0}>
                  <view y={layout() ? layout().listTop : 0} width={652.4} height={layout() ? layout().listH : 0} clipping>
                    <view y={-(layout() ? layout().listTop : 0)} width={652.4} height={layout() ? layout().listTop + layout().listFull : 0}>
                      <For each={sheetParts.keys()}>
                        {(k) => {
                          const row = sheetParts.item(k)
                          return (
                          <view y={row().y} width={652.4} height={row().h}>
                            <view width={652.4} height={row().h} borderRadius={13.36} color="#ffffffff" border={ROW_RING} alpha={row().focused ? 1 : 0} />
                            <view x={13} y={(row().h - 37) / 2} width={37} height={37} src={'icons/' + row().icon + '.webp'} color={row().iconColor} />
                            <text
                              x={row().labelX}
                              y={(row().h - (row().h > 80 ? 66.84 : 33.42)) / 2 + 2}
                              fontFamily={row().font}
                              fontSize={23.37}
                              lineHeight={33.42}
                              letterSpacing={0.417}
                              maxWidth={row().labelW}
                              maxLines={2}
                              color={row().ink}
                            >
                              {row().label}
                            </text>
                            <text x={639.4} mountX={1} y={(row().h - 27.46) / 2 + 2} fontFamily={bodyFont} fontSize={19.2} lineHeight={27.46} letterSpacing={0.417} color={row().trailingColor}>
                              {row().trailing}
                            </text>
                          </view>
                          )
                        }}
                      </For>
                    </view>
                  </view>
                  <For each={sheetFixed.keys()}>
                    {(k) => {
                      const f = sheetFixed.item(k)
                      return (
                      <view y={f().y} width={652.4} height={f().h}>
                        <view width={652.4} height={f().h} borderRadius={13.36} color="#ffffffff" border={ROW_RING} alpha={f().focused ? 1 : 0} />
                        <Show when={f().kind === 'quota'}>
                          <view width={652.4} height={f().h} borderRadius={13.36} color="#ffffff14" />
                        </Show>
                        <Show when={f().kind === 'all'}>
                          <view x={14} y={21} width={37} height={37} src={'icons/' + f().icon + '.webp'} color={f().iconColor} />
                        </Show>
                        <Show when={f().kind === 'toggle'}>
                          <view x={581} y={21} width={57} height={57} src={'icons/' + f().icon + '.webp'} color={f().iconColor} />
                        </Show>
                        <text
                          x={f().labelX}
                          y={(f().h - 33.42) / 2 + 2}
                          fontFamily={f().font}
                          fontSize={f().kind === 'quota' ? 20.87 : 23.37}
                          lineHeight={33.42}
                          letterSpacing={0.417}
                          maxWidth={f().labelW}
                          maxLines={1}
                          color={f().kind === 'quota' ? (f().blocked ? '#ef4444ff' : '#ffffffb3') : f().ink}
                        >
                          {f().label}
                        </text>
                      </view>
                      )
                    }}
                  </For>
                  <view y={layout() ? layout().listTop - 1.67 : 0} width={652.4} height={1.67} color="#ffffff1f" />
                  <view y={layout() ? layout().advTop : 0} width={652.4} height={advanced() ? advanced().h : 0}>
                    <Rects list={advanced() ? advanced().rects : NONE} />
                    <Icons list={advanced() ? advanced().icons : NONE} />
                    <Texts list={advanced() ? oneLine(advanced().texts) : NONE} />
                    <Texts list={advanced() ? oneLine(advanced().spaced) : NONE} />
                    <view>
                      <Show when={advSpin()} keyed>
                        {(sp) => <view ref={spinner} x={sp.x} y={sp.y} width={sp.w} height={sp.h} pivot={0.5} src="spinner/arc.webp" color="#00a4dcff" />}
                      </Show>
                    </view>
                  </view>
                  <For each={sheetButtons()}>
                    {(b) => (
                      <view x={b.x} y={layout() ? layout().buttonsY : 0} width={316.2} height={82.5}>
                        <view width={316.2} height={82.5} borderRadius={16.7} color={b.fill} />
                        <view width={316.2} height={82.5} borderRadius={16.7} color="#00000000" border={BUTTON_RING} alpha={b.focused ? 1 : 0} />
                        <text x={158.1} mountX={0.5} y={25.35} fontFamily={buttonFont} fontSize={25.04} lineHeight={35.81} letterSpacing={0.417} color={b.ink}>
                          {b.label}
                        </text>
                      </view>
                    )}
                  </For>
                </view>
              </view>
            </view>
            <view>
              <Rects list={picker() ? picker().rects : NONE} />
              <Icons list={picker() ? picker().icons : NONE} />
              <Texts list={picker() ? oneLine(picker().texts) : NONE} />
              <Texts list={picker() ? oneLine(picker().spaced) : NONE} />
            </view>
          </view>
        </OverNav>
      </Show>
      <NotificationToast lane="note" note={note()} onNoteDone={() => setNote(null)} />
    </view>
  )
}
