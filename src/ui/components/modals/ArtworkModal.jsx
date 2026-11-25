import $L from '../../../services/i18n.js'
import { Show, batch, createMemo, createSignal, onCleanup, untrack } from 'solid-js'
import { cssShift, fontFor } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { textWidth, wrapLines } from '../details/measure.js'
import { api, getServerType, getServerUrl } from '../../../services/jellyfinApi.js'
import { getImageUrl } from '../../../utils/helpers.js'
import { getStore, toast } from '../../../state/store.js'
import * as settings from '../../../state/settings.js'
import { getCurrentTags, getSupportedImageTypes, hasRemoteImages, matchesLanguage, matchesResolution } from './artwork/artworkTypes.js'
import { CONTENT, artworkLayout, cardPieces, overlayLayout } from './artwork/artworkLayout.js'
import { Icons, Imgs, Rects, Texts } from './draw.jsx'

// Change Artwork: a row per image category with what's on the item now and what the metadata
// providers offer. An episode or season can step up to its show through the crumbs, with back and
// forward between them.
// Props: `item`. Closing calls onArtworkClose(changed), changed true once anything was written.
// shortcut: the loading card's spinner is a still ring, the empty card's dashed edge is solid and
// the cards' soft drop shadow is left out. Draw them if testers notice.
const ROW_SCROLL_MARGIN = 40
const NONE = []
const BOTTOM_R = [0, 0, 11, 11]
const errorTemplate = (action) => {
  if (action === 'download') return $L('Image download failed: {err}')
  if (action === 'delete') return $L('Image delete failed: {err}')
  if (action === 'clear') return $L('Clear artwork failed: {err}')
  return $L('Action failed: {err}')
}

export default function ArtworkModal(props) {
  const [item, setItem] = createSignal(null)
  const [categories, setCategories] = createSignal([])
  const [remote, setRemote] = createSignal({})
  const [loading, setLoading] = createSignal({})
  const [onlyLang, setOnlyLang] = createSignal(true)
  const [off, setOff] = createSignal([])
  const [resolution, setResolution] = createSignal('All')
  const [view, setView] = createSignal('main')
  const [gridCategory, setGridCategory] = createSignal('')
  const [overlay, setOverlay] = createSignal(null)
  const [cur, setCur] = createSignal('')
  const [scrollY, setScrollY] = createSignal(0)
  const [rowScroll, setRowScroll] = createSignal({})
  const [hi, setHi] = createSignal(0)
  const [histLen, setHistLen] = createSignal(1)
  let history = []
  let writeReports = null
  let changed = false
  let busy = {}
  let gen = 0
  let alive = true
  onCleanup(() => (alive = false))

  const filtered = createMemo(() => {
    const lang = settings.all().uiLanguage
    const out = {}
    const o = off()
    const r = remote() || {}
    Object.keys(r).forEach((c) => {
      out[c] = (r[c] || []).filter(
        (img) => o.indexOf(img.ProviderName) < 0 && (!onlyLang() || matchesLanguage(img, lang)) && (view() !== 'grid' || matchesResolution(img, resolution())),
      )
    })
    return out
  })
  const sources = createMemo(() => {
    const seen = []
    const r = remote() || {}
    Object.keys(r).forEach((c) =>
      (r[c] || []).forEach((img) => {
        if (img.ProviderName && seen.indexOf(img.ProviderName) < 0) seen.push(img.ProviderName)
      }),
    )
    return seen
  })
  const laid = createMemo(() => {
    const it = item()
    if (!it) return null
    const server = getServerUrl()
    return artworkLayout(
      {
        item: it, view: view(), gridCategory: gridCategory(), categories: categories(), remote: filtered(), loading: loading() || {},
        onlyLang: onlyLang(), resolution: resolution(), hasSources: sources().length > 0, canDelete: getServerType() !== 'silo',
        canBack: hi() > 0, canForward: hi() < histLen() - 1,
        urlOf: (id, category, tag) => getImageUrl(server, id, category, { maxWidth: 400, tag }),
      },
      textWidth,
    )
  })
  // Where every focusable is on screen now, with the rows and the body scrolled.
  const spots = createMemo(() => {
    const L = laid()
    if (!L) return NONE
    const rs = rowScroll() || {}
    const sy = scrollY()
    return L.focusables.map((f) =>
      f.zone === 'body' ? { ...f, sx: CONTENT.x + f.x - ((f.row && rs[f.row]) || 0), sy: L.bodyTop + f.y - sy } : { ...f, sx: f.x, sy: f.y },
    )
  })
  const focused = () => spots().find((f) => f.id === cur()) || null
  const texts = (list, on = cur()) =>
    list.map((t) => ({
      ...t,
      font: fontFor(t.t, t.weight),
      y: t.y + cssShift(t.size),
      color: t.id && t.id === on && t.focusColor ? t.focusColor : t.color,
      lh: 33,
      maxw: t.maxw || 1600,
      lines: 1,
    }))

  const fixedRects = createMemo(() => {
    const L = laid()
    if (!L) return NONE
    return L.fixed.rects
      .filter((r) => !r.underline)
      .map((r) => {
        const on = Boolean(r.id) && r.id === cur()
        return {
          ...r,
          color: on && r.focusFill ? r.focusFill : r.color,
          bc: on && r.bw && r.id !== 'lang' && r.id.indexOf('res:') < 0 ? '#ffffffff' : r.bc,
          bw: r.bw || 0,
          a: r.dim ? 0.3 : 1,
        }
      })
  })
  const fixedLines = createMemo(() => (laid() ? laid().fixed.rects.filter((r) => r.underline && r.id !== cur()) : NONE))
  const fixedIcons = createMemo(() => (laid() ? laid().fixed.icons.map((ic) => ({ ...ic, color: '#ffffffff', a: ic.dim ? 0.3 : 1 })) : NONE))
  const fixedTexts = createMemo(() => (laid() ? texts(laid().fixed.texts) : NONE))

  // Each card's pieces, kept while the layout, the settings and the measuring faces stay the same, so
  // a focus move only shifts the rows and colors what it lands on.
  let parts = { L: null, v: -1, list: NONE }
  const cardParts = (L) => {
    const v = untrack(() => getStore().settingsVersion)
    if (parts.L === L && parts.v === v) return parts.list
    const list = L.body.cards.map((c) => {
      const p = cardPieces(c, textWidth)
      return { c, p, t: texts(p.texts, '') }
    })
    parts = { L, v, list }
    return list
  }
  // The body's own pieces: section titles, View All, and each row's cards, shifted by its scroll.
  const bodyNodes = createMemo(() => {
    const L = laid()
    const out = { rects: [], imgs: [], tops: [], texts: [], icons: [], spinners: [] }
    if (!L) return out
    const rs = rowScroll() || {}
    L.body.rects.forEach((r) => out.rects.push({ ...r, color: r.id === cur() ? r.focusFill : r.color, bw: r.bw || 0 }))
    out.texts = texts(L.body.texts)
    cardParts(L).forEach(({ c, p, t: cardTexts }) => {
      const dx = c.x - ((c.row && rs[c.row]) || 0)
      const k = c.id
      // The frame under the image, the badge, footer and delete button over it.
      p.rects.forEach((r) => (r.k === 'f' ? out.rects : out.tops).push({ ...r, k: `${k}${r.k}`, x: r.x + dx, y: r.y + c.y }))
      p.imgs.forEach((im) => out.imgs.push({ ...im, k: `${k}${im.k}`, x: im.x + dx, y: im.y + c.y }))
      if (p.footer) out.tops.push({ k: `${k}ft`, x: p.footer.x + dx, y: p.footer.y + c.y, w: p.footer.w, h: p.footer.h, r: BOTTOM_R, color: '#00000099' })
      cardTexts.forEach((t) => out.texts.push({ ...t, k: `${k}${t.k}`, x: t.x + dx, y: t.y + c.y }))
      if (p.del) {
        const on = cur() === `del:${c.id}`
        out.tops.push({ k: `${k}d`, x: p.del.x + dx, y: p.del.y + c.y, w: 32, h: 32, r: 16, color: on ? '#ff4757ff' : '#00000099' })
        out.icons.push({ k: `${k}di`, x: p.del.x + dx + 6, y: p.del.y + c.y + 6, w: 20, h: 20, src: 'icons/delete.webp' })
      }
      if (p.spinner) out.spinners.push({ k: `${k}sp`, x: p.spinner.x + dx, y: p.spinner.y + c.y, w: 24, h: 24, r: 12, color: '#00000000', bw: 2, bc: '#ffffff1a' })
    })
    return out
  })
  // The focused card grows 2% over itself, ringed white and in the accent, its footer darker.
  const lift = createMemo(() => {
    const f = focused()
    if (!f || f.kind !== 'card' || overlay()) return null
    const c = f.card
    const p = cardPieces(c, textWidth)
    return {
      k: `lift-${c.id}`, x: f.sx, y: f.sy, w: c.w, h: c.h, src: p.imgs[0] ? p.imgs[0].src : '', footer: p.footer || null,
      rects: p.rects.filter((r) => r.k === 'b'), texts: texts(p.texts), del: p.del || null,
    }
  })
  const over = createMemo(() => {
    const o = overlay()
    if (!o) return null
    return overlayLayout(o, textWidth, (t, size, weight, w) => wrapLines(t, size, weight, w))
  })
  const overRects = createMemo(() => {
    const O = over()
    if (!O) return NONE
    return O.rects.map((r) => ({
      ...r,
      color: r.id && r.id === cur() && r.focusFill ? r.focusFill : r.color,
      bw: r.bw || 0,
      bc: r.bc || '#00000000',
      ring: Boolean(r.ring && r.id === cur()),
    }))
  })
  const overRings = () => overRects().filter((r) => r.ring).map((r) => ({ k: r.k, x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4, r: r.r + 2, color: '#ffffffff' }))
  const overChecks = () => overRects().filter((r) => r.check).map((r) => ({ k: r.k, x: r.x + 1, y: r.y + 1, w: 16, h: 16, src: 'icons/check.webp', color: '#ffffffff' }))
  const overTexts = createMemo(() => (over() ? texts(over().texts) : NONE))
  const overImgs = () => (over() ? over().imgs.map((im) => ({ ...im, fit: 'contain' })) : NONE)
  const bodyTop = () => (laid() ? laid().bodyTop : 0)

  const focusDefault = () => {
    const card = untrack(spots).find((f) => f.kind === 'card')
    setCur(card ? card.id : 'close')
    if (card) reveal(card)
  }
  const showOverlay = (o) => {
    setOverlay(null)
    setOverlay(o)
    const first = untrack(over) && untrack(over).focusables[0]
    setCur(first ? first.id : '')
  }
  const closeLayer = () => {
    if (untrack(overlay)) {
      setOverlay(null)
      focusDefault()
      return true
    }
    if (untrack(view) === 'grid') {
      setView('main')
      setScrollY(0)
      focusDefault()
      return true
    }
    return false
  }
  const close = () => {
    gen++
    if (props.onArtworkClose) props.onArtworkClose(changed)
  }
  const load = (it) => {
    const mine = ++gen
    batch(() => {
      setItem(it)
      setCategories(getSupportedImageTypes(it.Type, getServerType()))
      setRemote({})
      setLoading({})
      setRowScroll({})
      setScrollY(0)
    })
    focusDefault()
    const cats = untrack(categories)
    if (hasRemoteImages(it.Type)) {
      cats.forEach((category) => {
        setLoading({ ...untrack(loading), [category]: true })
        api
          .getRemoteImages(it.Id, category)
          .then((res) => {
            if (alive && mine === gen) setRemote({ ...untrack(remote), [category]: (res && res.Images) || [] })
          })
          .catch((e) => console.warn(`Failed to fetch remote images for ${category}:`, e))
          .then(() => {
            if (!alive || mine !== gen) return
            setLoading({ ...untrack(loading), [category]: false })
            // Focus moves to the first card once the rows fill in.
            if (!untrack(overlay) && (untrack(cur) === 'close' || !untrack(focused))) focusDefault()
          })
      })
    } else {
      const empty = {}
      cats.forEach((c) => (empty[c] = []))
      setRemote(empty)
    }
    checkWriteAccess(it, mine)
  }
  // The server's write access report covers every library, so it's read once and matched here.
  const checkWriteAccess = async (it, mine) => {
    if (!api.checkWriteAccess) return
    try {
      if (!writeReports) writeReports = await api.checkWriteAccess()
      const reports = writeReports
      const path = it.Path
      if (!alive || mine !== gen || !path || !Array.isArray(reports)) return
      const match = reports.find((r) => (r.FailedPaths || []).some((p) => path.indexOf(p) === 0))
      if (match) {
        showOverlay({
          kind: 'warning',
          message: $L('The server does not have write permissions for "{libraryName}" library path. Local artwork changes may fail to save.').replace(
            '{libraryName}',
            match.LibraryName || $L('Library'),
          ),
        })
      }
    } catch (e) {
      console.warn('Failed to check libraries write access:', e)
    }
  }
  const navigateTo = async (id) => {
    try {
      const updated = await api.getItem(id)
      if (!updated || !alive) return
      history = history.slice(0, untrack(hi) + 1).concat(updated)
      setHi(history.length - 1)
      setHistLen(history.length)
      setView('main')
      load(updated)
    } catch (e) {
      toast($L('Failed to load item'))
    }
  }
  const step = (d) => {
    const next = untrack(hi) + d
    if (next < 0 || next >= history.length) return
    setHi(next)
    setView('main')
    load(history[next])
  }
  // Read again after a write so the current cards show the new tags.
  const refreshItem = async () => {
    try {
      const updated = await api.getItem(untrack(item).Id)
      if (updated && alive) {
        setItem(updated)
        history[untrack(hi)] = updated
      }
    } catch (e) {
      console.warn('Failed to refresh item metadata:', e)
    }
  }
  // A library that saves metadata next to the media needs write access there, which gets its own
  // explanation rather than the server's error.
  const actionError = async (error, action) => {
    let local = false
    if (api.getVirtualFolders) {
      try {
        const folders = await api.getVirtualFolders()
        const path = untrack(item).Path
        if (path && Array.isArray(folders)) {
          const match = folders.find((f) => (f.Locations || []).some((loc) => path.indexOf(loc) === 0))
          if (match) local = Boolean(match.LibraryOptions && match.LibraryOptions.SaveLocalMetadata === true)
        }
      } catch (e) {
        console.warn('Failed to check virtual folders:', e)
      }
    }
    if (!alive) return
    if (local) {
      showOverlay({
        kind: 'warning',
        message: $L('Saving metadata locally is enabled for this library, but the server lacks write permissions to write files to the library folder.'),
      })
    } else toast(errorTemplate(action).replace('{err}', (error && (error.message || String(error))) || ''))
  }
  const write = async (category, action, run, done) => {
    if (busy[category]) return
    busy[category] = true
    try {
      await run()
      changed = true
      await refreshItem()
      toast(done)
    } catch (e) {
      actionError(e, action)
    } finally {
      busy[category] = false
    }
  }
  const clearAll = async () => {
    const it = untrack(item)
    const types = getSupportedImageTypes(it.Type, getServerType())
    types.forEach((t) => (busy[t] = true))
    try {
      for (const category of types) {
        const tags = getCurrentTags(it, category)
        if (!tags.length) continue
        // Backdrops go back to front, since removing one shifts the rest down.
        if (category === 'Backdrop') for (let i = tags.length - 1; i >= 0; i--) await api.deleteItemImage(it.Id, category, i)
        else await api.deleteItemImage(it.Id, category)
      }
      changed = true
      await refreshItem()
      toast($L('All custom artwork cleared'))
    } catch (e) {
      actionError(e, 'clear')
    } finally {
      busy = {}
    }
  }
  const press = () => {
    const id = cur()
    const o = overlay()
    const it = item()
    if (o) {
      if (id === 'cancel' || id === 'dismiss' || id === 'close') return closeLayer()
      if (o.kind === 'preview' && id === 'use') {
        closeLayer()
        return write(o.category, 'download', () => api.downloadRemoteImage(it.Id, o.category, o.image.Url), $L('Artwork updated successfully'))
      }
      if (o.kind === 'confirm' && id === 'yes') {
        closeLayer()
        if (o.clear) return clearAll()
        return write(o.category, 'delete', () => api.deleteItemImage(it.Id, o.category, o.index), $L('Image deleted successfully'))
      }
      if (id.indexOf('src:') === 0) {
        const src = id.slice(4)
        const next = off().indexOf(src) >= 0 ? off().filter((x) => x !== src) : off().concat(src)
        setOff(next)
        setOverlay({ ...o, off: next })
      }
      return undefined
    }
    if (id === 'close') return close()
    if (id === 'back') return step(-1)
    if (id === 'forward') return step(1)
    if (id.indexOf('crumb:') === 0) return navigateTo(id.slice(6))
    if (id === 'sources') return showOverlay({ kind: 'sources', sources: sources(), off: off() })
    if (id === 'lang') return setOnlyLang(!onlyLang())
    if (id === 'clear') {
      return showOverlay({
        kind: 'confirm', clear: true, title: $L('Confirm Clear All'),
        message: $L('Are you sure you want to clear all custom artwork for this item?'), confirmLabel: $L('Clear'),
      })
    }
    if (id === 'gridBack') return closeLayer()
    if (id.indexOf('res:') === 0) return setResolution(id.slice(4))
    if (id.indexOf('all:') === 0) {
      batch(() => {
        setGridCategory(id.slice(4))
        setView('grid')
        setScrollY(0)
        setCur('gridBack')
      })
      return undefined
    }
    const f = focused()
    if (!f || !f.card) return undefined
    const c = f.card
    const category = c.id.split(':')[1]
    if (f.kind === 'del') {
      const index = category === 'Backdrop' ? c.index : null
      return showOverlay({
        kind: 'confirm', category, index, title: $L('Confirm Delete'),
        message: $L('Are you sure you want to delete this custom artwork?'), confirmLabel: $L('Delete'),
      })
    }
    if (c.kind === 'remote') return showOverlay({ kind: 'preview', category, image: c.image })
    return undefined
  }
  // Up and Down find the nearest focusable that way. Left and Right walk a row's cards and delete
  // buttons in order and stop at its ends.
  const move = (dir) => {
    const all = overlay() && over() ? over().focusables.map((f) => ({ ...f, sx: f.x, sy: f.y })) : spots()
    const f = all.find((x) => x.id === cur())
    if (!f) return true
    if ((dir === 'left' || dir === 'right') && (f.kind === 'card' || f.kind === 'del')) {
      const line = all.filter((x) => (x.kind === 'card' || x.kind === 'del') && (f.row ? x.row === f.row : Math.abs(x.card.y - f.card.y) < 1))
      const next = line[line.indexOf(f) + (dir === 'left' ? -1 : 1)]
      if (next) focusOn(next)
      return true
    }
    const fx2 = f.sx + f.w
    const fy2 = f.sy + f.h
    let best = null
    let bestScore = Infinity
    all.forEach((c) => {
      if (c === f) return
      const cx2 = c.sx + c.w
      const cy2 = c.sy + c.h
      let gap
      let perp
      if (dir === 'down' || dir === 'up') {
        if (dir === 'down' ? c.sy < fy2 - 2 : cy2 > f.sy + 2) return
        gap = dir === 'down' ? c.sy - fy2 : f.sy - cy2
        perp = Math.max(0, c.sx - fx2, f.sx - cx2)
      } else {
        if (dir === 'right' ? c.sx < fx2 - 2 : cx2 > f.sx + 2) return
        gap = dir === 'right' ? c.sx - fx2 : f.sx - cx2
        perp = Math.max(0, c.sy - fy2, f.sy - cy2)
      }
      const score = gap + 2 * perp
      if (score < bestScore) {
        bestScore = score
        best = c
      }
    })
    if (best) focusOn(best)
    return true
  }
  const focusOn = (f) => {
    setCur(f.id)
    if (f.zone === 'body') reveal(f)
  }
  // A card scrolls its row to show itself 40px clear of the edge, and the body scrolls to show it.
  const reveal = (f) => {
    const L = untrack(laid)
    if (!L || f.zone !== 'body') return
    if (f.row) {
      const row = L.body.rows.find((r) => r.category === f.row)
      const box = f.card || f
      const rs = untrack(rowScroll) || {}
      const s = rs[f.row] || 0
      let next = s
      if (box.x - s < 0) next = box.x - ROW_SCROLL_MARGIN
      else if (box.x + box.w - s > CONTENT.w) next = box.x + box.w - CONTENT.w + ROW_SCROLL_MARGIN
      next = Math.max(0, Math.min(Math.max(0, row.width - CONTENT.w), next))
      if (next !== s) setRowScroll({ ...rs, [f.row]: next })
    }
    const viewH = CONTENT.bottom - L.bodyTop
    const max = Math.max(0, L.bodyH - viewH)
    let y = untrack(scrollY)
    // A row's card scrolls in with its section's 24px margin under it.
    const below = f.row ? 24 : 0
    if (f.y - y < 0) y = f.y
    else if (f.y + f.h + below - y > viewH) y = f.y + f.h + below - viewH
    setScrollY(Math.max(0, Math.min(max, y)))
  }

  history = [props.item]
  load(props.item)

  const ov = () => over() || { x: 0, y: 0, w: 0, h: 0 }
  return (
    <view
      ref={props.ref}
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
        if (!closeLayer()) close()
        return true
      }}
      onKeyPress={() => true}
    >
      <view width={1920} height={1080} color="#00000099" />
      <view x={96} y={81} width={1728} height={918} borderRadius={24} color="#00000000" shadow={{ color: shadowColor('#00000080'), x: 0, y: 12, blur: 48, spread: 0 }} />
      <view x={96} y={81} width={1728} height={918} borderRadius={24} color="#14141afa" border={{ width: 1, color: hex('#ffffff1f') }} />
      <view x={120} y={82} width={1680} height={1} color="#ffffff14" />
      <Rects list={fixedRects()} />
      <Rects list={fixedLines()} />
      <Icons list={fixedIcons()} />
      <Texts list={fixedTexts()} />
      <view x={129} y={bodyTop()} width={1662} height={CONTENT.bottom - bodyTop()} clipping>
        <view y={-scrollY()} width={1662} height={Math.max(laid() ? laid().bodyH : 0, CONTENT.bottom - bodyTop())}>
          <Rects list={bodyNodes().rects} />
          <Imgs list={bodyNodes().imgs} />
          <Rects list={bodyNodes().tops} />
          <Icons list={bodyNodes().icons} />
          <Rects list={bodyNodes().spinners} />
          <Texts list={bodyNodes().texts} />
        </view>
      </view>
      <view>
        <Show when={lift()} keyed>
          {(lf) => (
            <view x={lf.x} y={lf.y} width={lf.w} height={lf.h} scale={1.02}>
              <view x={-2} y={-2} width={lf.w + 4} height={lf.h + 4} borderRadius={14} color="#00000000" border={{ width: 2, color: hex('#00a4dcff') }} />
              <view width={lf.w} height={lf.h} borderRadius={12} color="#1b1b21ff" border={{ width: 1, color: hex('#ffffffff') }} />
              <view x={1} y={1} width={lf.w - 2} height={lf.h - 2} borderRadius={11} src={lf.src} textureOptions={{ resizeMode: { type: 'cover' } }} />
              <view alpha={lf.footer ? 1 : 0} x={lf.footer ? lf.footer.x : 0} y={lf.footer ? lf.footer.y : 0} width={lf.footer ? lf.footer.w : 0} height={lf.footer ? lf.footer.h : 0} borderRadius={BOTTOM_R} color="#000000d9" />
              <Rects list={lf.rects} />
              <view alpha={lf.del ? 1 : 0} x={lf.del ? lf.del.x : 0} y={lf.del ? lf.del.y : 0}>
                <view width={32} height={32} borderRadius={16} color="#00000099" />
                <view x={6} y={6} width={20} height={20} src="icons/delete.webp" />
              </view>
              <Texts list={lf.texts} />
            </view>
          )}
        </Show>
      </view>
      <view alpha={over() ? 1 : 0}>
        <view x={97} y={82} width={1726} height={916} borderRadius={24} color="#000000b3" />
        <view x={ov().x} y={ov().y} width={ov().w} height={ov().h}>
          <view width={ov().w} height={ov().h} borderRadius={20} color="#00000000" shadow={{ color: shadowColor('#00000099'), x: 0, y: 8, blur: 32, spread: 0 }} />
          <view width={ov().w} height={ov().h} borderRadius={20} color="#1e1e28f2" border={{ width: 1, color: hex('#ffffff1f') }} />
          <Rects list={overRings()} />
          <Rects list={overRects()} />
          <Icons list={overChecks()} />
          <Imgs list={overImgs()} />
          <Texts list={overTexts()} />
        </view>
      </view>
    </view>
  )
}
