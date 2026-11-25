import $L from '../../../services/i18n.js'
import { For, createMemo, createSelector, createSignal } from 'solid-js'
import Card from '../Card.jsx'
import { cssShift, fontFor } from '../../text.js'
import { hex } from '../../color.js'
import { textWidth, wrapLines } from './measure.js'
import { byKey } from './keyed.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { buildMediaFacts } from '../../../utils/seerrMediaFacts.js'

// Modern's Seerr tab: the Genres and Tags chip, the collection banner, the production facts three to
// a line, where it streams, then Seerr's recommendations and similar titles as headed grids, all
// stacked 32px apart.
//
// Props: `tab` ({seerr, w}), `viewTop`, `tokens`, `x`, `y`, `alpha`. Up and Down move between the
// pieces and the grid rows, Left and Right along a row. Enter calls onSeerrPiece(kind, data) for the
// chip and the banner, and onSeerrCardSelect(card) for a title. Its node has setCur(i) and entry().
const CARD = { w: 240, h: 360, labels: 90 }
const GAP = 30
const NONE = '#00000000'
const WINDOW = 400
const GONE = { k: '', x: 0, y: 0, w: 0, h: 0, r: 0, t: '', size: 14, font: 'roboto', color: NONE, lh: 33, bw: 0, bc: NONE, src: '', card: { type: 'poster' } }
const NO_LAID = { blocks: [], texts: [], imgs: [], cells: [], focusables: [], h: 0, scrim: null }

const toModel = (c, i) => {
  const year = c.ProductionYear ? String(c.ProductionYear) : ''
  return {
    key: `s${i}`,
    idx: i,
    type: 'poster',
    title: c.Name || '',
    subtitle: year,
    titleFont: fontFor(c.Name || '', 'medium'),
    subtitleFont: 'roboto',
    image: c._externalPosterUrl || '',
    progress: 0,
    played: false,
    raw: c,
  }
}

export default function SeerrTab(props) {
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const t = () => props.tokens || { focus: '#00a4dcff' }
  const laid = createMemo(() => {
    const tab = props.tab
    if (!tab || !tab.seerr || !tab.seerr.details) return NO_LAID
    const out = { blocks: [], texts: [], imgs: [], cells: [], focusables: [], h: 0, scrim: null }
    const sr = tab.seerr
    const d = sr.details
    const width = tab.w || 1688
    const text = (k, x, y, str, size, weight, color, lh = 33) => out.texts.push({ k, x, y: y + cssShift(size), t: str, size, font: fontFor(str, weight), color, lh })
    let y = 0
    let row = 0
    const next = () => {
      if (y > 0) y += 32
    }
    if (sr.pieces.chips) {
      next()
      out.focusables.push({ id: 'chips', kind: 'chips', row: row++, x: 0, y, w: width, h: 53 })
      out.blocks.push({ k: 'chips', x: 0, y, w: width, h: 53, r: 26.5, color: '#374151ff', bw: 0, bc: NONE, chip: true })
      text('chips', 20, y + 10, $L('Genres and Tags'), 14, 'regular', '#ffffffff')
      y += 53
    }
    if (sr.pieces.collection && d.collection) {
      next()
      const c = d.collection
      out.focusables.push({ id: 'collection', kind: 'collection', row: row++, x: 0, y, w: 1162, h: 83, data: c })
      out.blocks.push({ k: 'banner', x: 0, y, w: 1162, h: 83, r: 12, color: '#181818ff', bw: 3, bc: '#ffffff1f' })
      // The art and its scrim draw under the icons, in a pair of their own.
      out.scrim = { x: 3, y: y + 3, src: c.backdropPath ? seerrApi.getImageUrl(c.backdropPath, 'w780') : '' }
      out.imgs.push({ k: 'bannerIcon', x: 31, y: y + 27.5, w: 28, h: 28, src: 'icons/d/watchlist.webp', r: 0, fit: 'contain', color: '#ffffffff' })
      const cta = $L('View Collection')
      const ctaW = textWidth(cta, 20, 'bold')
      text('bannerText', 75, y + 25, $L('Part of {name}').replace('{name}', c.name || ''), 24, 'bold', '#ffffffff')
      text('bannerCta', 1162 - 31 - 24 - ctaW, y + 25, cta, 20, 'bold', '#00a4dcff')
      out.imgs.push({ k: 'bannerChevron', x: 1162 - 31 - 24, y: y + 29.5, w: 24, h: 24, src: 'icons/d/chevronRight.webp', r: 0, fit: 'contain', color: '#00a4dcff' })
      y += 83
    }
    if (sr.pieces.facts) {
      next()
      const facts = buildMediaFacts(d, sr.mediaType)
      const lines = []
      for (let i = 0; i < facts.length; i += 3) lines.push(facts.slice(i, i + 3))
      const top = y
      let ly = y + 15
      const box = { k: 'facts', x: 0, y: top, w: 1142, h: 0, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f' }
      out.blocks.push(box)
      lines.forEach((line, li) => {
        if (li) {
          ly += 10
          out.blocks.push({ k: `rule${li}`, x: 21, y: ly, w: 1100, h: 1, r: 0, color: '#ffffff1a', bw: 0, bc: NONE })
          ly += 11
        }
        line.forEach((f, ci) => {
          const x = 21 + ci * 378
          if (ci) out.blocks.push({ k: `sep${li}-${ci}`, x: x - 17, y: ly + 18, w: 1, h: 32, r: 0, color: '#ffffff1a', bw: 0, bc: NONE })
          text(`fl${li}-${ci}`, x, ly, f.label, 14, 'medium', '#ffffff99')
          text(`fv${li}-${ci}`, x, ly + 36, f.value, 16, 'bold', '#ffffffff')
        })
        ly += 69
      })
      box.h = ly + 15 - top
      out.focusables.push({ id: 'facts', kind: 'facts', row: row++, x: 0, y: top, w: 1142, h: box.h })
      y = top + box.h
    }
    if (sr.pieces.streaming) {
      next()
      const top = y
      const box = { k: 'streaming', x: 0, y: top, w: 1142, h: 0, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f' }
      out.blocks.push(box)
      text('streamLabel', 21, y + 15, $L('Streaming on'), 14, 'medium', '#ffffff99')
      let px = 21
      let py = y + 15 + 33 + 10
      let rowH = 0
      sr.streamingProviders.forEach((p, i) => {
        if (px + 92 > 21 + 1100) {
          px = 21
          py += rowH + 10
          rowH = 0
        }
        out.imgs.push({ k: `sl${i}`, x: px + 14, y: py, w: 64, h: 64, src: seerrApi.getImageUrl(p.logoPath, 'w92'), r: 12, fit: 'cover', color: '#ffffffff' })
        const names = wrapLines(p.name || '', 14, 'bold', 92)
        names.forEach((n, j) =>
          out.texts.push({
            k: `sn${i}-${j}`,
            x: px + (92 - textWidth(n, 14, 'bold')) / 2,
            y: py + 70 + j * 16.8 + cssShift(14),
            t: n,
            size: 14,
            font: fontFor(n, 'bold'),
            color: '#ffffffff',
            lh: 16.8,
          }),
        )
        rowH = Math.max(rowH, 70 + names.length * 16.8)
        px += 92 + 20
      })
      box.h = py + rowH + 10 + 15 - top
      y = top + box.h
    }
    const perRow = Math.max(1, Math.floor((width + GAP) / (CARD.w + GAP)))
    let idx = 0
    const grid = (title, cards) => {
      if (!cards || !cards.length) return
      next()
      text(`h-${title}`, 0, y, title, 24, 'bold', '#ffffffff', 29)
      y += 29 + 12
      cards.forEach((c, i) => {
        const col = i % perRow
        if (i && col === 0) {
          y += CARD.h + CARD.labels + GAP
          row++
        }
        const cell = { k: `c${idx}`, id: `c${idx}`, kind: 'card', row, x: col * (CARD.w + GAP), y, w: CARD.w, h: CARD.h, card: toModel(c, idx) }
        out.cells.push(cell)
        out.focusables.push(cell)
        idx++
      })
      y += CARD.h + CARD.labels
      row++
    }
    if (sr.pieces.recommendations) grid($L('Recommendations'), sr.recommendationCards)
    if (sr.pieces.similar) grid($L('Similar'), sr.similarCards)
    out.h = y
    return out
  })
  const blocks = byKey(() => laid().blocks, GONE)
  const texts = byKey(() => laid().texts, GONE)
  const imgs = byKey(() => laid().imgs, GONE)
  // Only the cards near the screen are built.
  const cells = byKey(() => {
    const top = (props.viewTop || 0) - WINDOW
    const bottom = (props.viewTop || 0) + 1080 + WINDOW
    return laid().cells.filter((c) => c.y + c.h + CARD.labels >= top && c.y <= bottom)
  }, GONE)
  const focusItem = () => (focused() ? laid().focusables[cur()] || null : null)
  const ring = () => {
    const f = focusItem()
    return f && (f.kind === 'collection' || f.kind === 'facts') ? f : null
  }
  const chipOn = () => Boolean(focusItem() && focusItem().kind === 'chips')
  const isCard = createSelector(() => {
    const f = focusItem()
    return f && f.kind === 'card' ? f.id : ''
  })

  const notify = () => {
    const f = laid().focusables[cur()]
    if (f && props.onCellFocus) props.onCellFocus({ y: f.y, h: f.h, kind: f.kind === 'card' ? 'card' : 'info', cardH: CARD.h, idx: cur() })
  }
  const step = (dRow, dCol) => {
    const list = laid().focusables
    const f = list[cur()]
    if (!f) return false
    let target = null
    if (dCol) {
      target = list.find((x) => x.row === f.row && x.kind === 'card' && x.x === f.x + dCol * (CARD.w + GAP)) || null
    } else {
      list
        .filter((x) => x.row === f.row + dRow)
        .forEach((x) => {
          if (!target || Math.abs(x.x - f.x) < Math.abs(target.x - f.x)) target = x
        })
    }
    if (!target) return false
    setCur(list.indexOf(target))
    notify()
    return true
  }

  return (
    <view
      ref={(n) => {
        n.entry = () => 0
        n.setCur = (i) => {
          setCur(i)
          notify()
        }
        n.resetCur = () => setCur(0)
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      alpha={props.alpha == null ? 1 : props.alpha}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) notify()
      }}
      onLeft={() => {
        if (!step(0, -1) && props.onCellsEdge) props.onCellsEdge('left')
        return true
      }}
      onRight={() => {
        step(0, 1)
        return true
      }}
      onUp={() => {
        if (!step(-1, 0) && props.onCellsEdge) props.onCellsEdge('up')
        return true
      }}
      onDown={() => {
        step(1, 0)
        return true
      }}
      onEnter={() => {
        const f = laid().focusables[cur()]
        if (!f) return true
        if (f.kind === 'card' && props.onSeerrCardSelect) props.onSeerrCardSelect(f.card.raw)
        else if (props.onSeerrPiece) props.onSeerrPiece(f.kind, f.data)
        return true
      }}
    >
      <view alpha={chipOn() ? 1 : 0} width={props.tab ? props.tab.w : 0} height={53} borderRadius={26.5} color="#4b5563ff" />
      <view>
        <For each={blocks.keys()}>
          {(k) => (
            <view
              x={blocks.at(k).x}
              y={blocks.at(k).y}
              width={blocks.at(k).w}
              height={blocks.at(k).h}
              borderRadius={blocks.at(k).r}
              color={blocks.at(k).color}
              border={blocks.at(k).bw ? { width: blocks.at(k).bw, color: hex(blocks.at(k).bc) } : undefined}
              alpha={blocks.at(k).chip && chipOn() ? 0 : 1}
            />
          )}
        </For>
      </view>
      <view
        alpha={laid().scrim && laid().scrim.src ? 1 : 0}
        x={laid().scrim ? laid().scrim.x : 0}
        y={laid().scrim ? laid().scrim.y : 0}
        width={1156}
        height={77}
        borderRadius={9}
        src={laid().scrim ? laid().scrim.src || undefined : undefined}
        textureOptions={{ resizeMode: { type: 'cover' } }}
      />
      <view
        alpha={laid().scrim ? 1 : 0}
        x={laid().scrim ? laid().scrim.x : 0}
        y={laid().scrim ? laid().scrim.y : 0}
        width={1156}
        height={77}
        borderRadius={9}
        colorLeft="#000000d1"
        colorRight="#0000008c"
      />
      <view>
        <For each={imgs.keys()}>
          {(k) => (
            <view
              x={imgs.at(k).x}
              y={imgs.at(k).y}
              width={imgs.at(k).w}
              height={imgs.at(k).h}
              src={imgs.at(k).src || undefined}
              borderRadius={imgs.at(k).r}
              textureOptions={{ resizeMode: { type: imgs.at(k).fit || 'cover' } }}
              color={imgs.at(k).color}
            />
          )}
        </For>
      </view>
      <view
        alpha={ring() ? 1 : 0}
        x={ring() ? ring().x : 0}
        y={ring() ? ring().y : 0}
        width={ring() ? ring().w : 0}
        height={ring() ? ring().h : 0}
        borderRadius={ring() && ring().kind === 'facts' ? 10 : 12}
        color="#00000001"
        border={{ width: ring() && ring().kind === 'facts' ? 1 : 3, color: hex(t().focus) }}
      />
      <view>
        <For each={texts.keys()}>
          {(k) => (
            <text x={texts.at(k).x} y={texts.at(k).y} fontFamily={texts.at(k).font} fontSize={texts.at(k).size} lineHeight={texts.at(k).lh} color={texts.at(k).color}>
              {texts.at(k).t}
            </text>
          )}
        </For>
      </view>
      <view>
        <For each={cells.keys()}>
          {(k) => (
            <view x={cells.at(k).x} y={cells.at(k).y}>
              <Card card={cells.at(k).card} w={CARD.w} h={CARD.h} focused={isCard(cells.at(k).id)} />
            </view>
          )}
        </For>
      </view>
    </view>
  )
}
