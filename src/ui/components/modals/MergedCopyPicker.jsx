import $L from '../../../services/i18n.js'
import { Index, createMemo, createSignal } from 'solid-js'
import { cssShift, fontFor, normalShift, uiFont } from '../../text.js'
import { theme } from '../../theme.js'
import { hex } from '../../color.js'
import { getApiForItem } from '../../../services/connectionPool.js'
import { copiesOf, copyKey, withoutCopies } from '../../../utils/mergedCopies.js'
import { formatFileSize } from '../../../utils/formatFileSize.js'

// Which server's copy to open when several servers hold a title (a merged library's card). Each
// server is asked for its copy's details as it opens, and one that doesn't answer in 4s is listed
// without them.
// App mounts one. `await node.pick(item)` gives the chosen copy (without the other copies) or null
// for Cancel and Back. It takes focus itself, and the caller puts focus back once the promise
// settles. App's beforeEach asks it whenever hasMergedCopies(item).
const DP = 1.66957
const dp = (n) => n * DP
const PANEL_W = dp(440)
const DETAILS_TIMEOUT_MS = 4000

const withTimeout = (promise) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), DETAILS_TIMEOUT_MS)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value || null)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })

// The quality, sound and size of a copy, and how far into it the viewer is.
const describe = (copy, details) => {
  const shown = details || copy
  const source = details && Array.isArray(details.MediaSources) ? details.MediaSources[0] : null
  const streams = source && Array.isArray(source.MediaStreams) ? source.MediaStreams : (details && details.MediaStreams) || []
  const titleOf = (type) => {
    const s = streams.find((x) => x && x.Type === type)
    return (s && s.DisplayTitle) || null
  }
  const parts = [titleOf('Video'), titleOf('Audio'), formatFileSize(source && source.Size)].filter(Boolean)
  const ud = shown.UserData || {}
  let status = null
  if (!details) status = $L('Unavailable')
  else if (ud.Played) status = $L('Watched')
  else if (ud.PlayedPercentage > 0) status = $L('{percent}% watched').replace('{percent}', String(Math.round(ud.PlayedPercentage)))
  return [status, ...parts].filter(Boolean).join(' · ')
}

export default function MergedCopyPicker(props) {
  const [item, setItem] = createSignal(null)
  const [details, setDetails] = createSignal({})
  const [cur, setCur] = createSignal(0)
  let root
  let resolver = null
  let gen = 0
  const t = () => theme()
  const nShift24 = normalShift(24)
  const nShift20 = normalShift(20)
  const laid = createMemo(() => {
    const it = item()
    if (!it) return null
    const known = details()
    const subtitle = it.Name || ''
    const titleH = dp(20) * 1.17
    let y = 1 + dp(20)
    const out = { titleY: y + cssShift(dp(20)), subtitle }
    y += titleH + (subtitle ? dp(4) : dp(12))
    if (subtitle) {
      out.subtitleY = y + cssShift(dp(13))
      y += dp(13) * 1.17 + dp(12)
    }
    out.dividerY = y
    y += dp(1) + dp(8)
    out.rows = copiesOf(it).map((copy, i) => {
      const label = copy._serverName || $L('Server')
      const detail = Object.prototype.hasOwnProperty.call(known, i) ? describe(copy, known[i] || null) : $L('Loading...')
      const row = { k: copyKey(copy), y, label, detail, selected: i === 0 }
      y += 94
      return row
    })
    y += dp(4)
    out.cancelDivider = y
    y += dp(1) + dp(4)
    out.cancelY = y
    out.cancelH = dp(14) * 2 + dp(16) * 1.17
    y += out.cancelH + dp(20) + 1
    out.h = y
    out.x = (1920 - PANEL_W) / 2
    out.y = Math.max(dp(24), (1080 - y) / 2)
    return out
  })
  const L = () => laid() || { x: 0, y: 0, h: 0, rows: [], titleY: 0, subtitleY: 0, dividerY: 0, cancelDivider: 0, cancelY: 0, cancelH: 0 }
  const onCancel = () => cur() >= L().rows.length
  const focusRow = () => (onCancel() ? { y: L().cancelY, h: L().cancelH } : { y: L().rows[cur()].y, h: 94 })

  // Resolves with the picked copy, or null. A second pick while one is open replaces it.
  const pick = (it) => {
    if (resolver) resolver(null)
    const mine = ++gen
    setDetails({})
    setItem(it)
    setCur(0)
    copiesOf(it).forEach((copy, i) => {
      const api = getApiForItem(copy)
      const ask = api && api.getItem ? withTimeout(api.getItem(copy.Id)) : Promise.resolve(null)
      ask.then((value) => {
        if (mine === gen) setDetails({ ...details(), [i]: value || false })
      })
    })
    root.setFocus()
    return new Promise((resolve) => (resolver = resolve))
  }
  const finish = (copy) => {
    const resolve = resolver
    resolver = null
    gen++
    setItem(null)
    if (resolve) resolve(copy)
    return true
  }
  return (
    <view
      ref={(n) => {
        root = n
        n.pick = pick
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      alpha={item() ? 1 : 0}
      onUp={() => {
        if (cur() > 0) setCur(cur() - 1)
        return true
      }}
      onDown={() => {
        if (cur() < L().rows.length) setCur(cur() + 1)
        return true
      }}
      onEnter={() => {
        const copies = copiesOf(item())
        return finish(cur() >= copies.length ? null : withoutCopies(copies[cur()]))
      }}
      onBack={() => finish(null)}
      onKeyPress={() => true}
    >
      <view width={1920} height={1080} color="#0000008a" />
      <view x={L().x} y={L().y}>
        <view width={734.61} height={L().h} borderRadius={33.39} color={t().surface.slice(0, 7) + 'e6'} border={{ width: 1.67, color: hex('#8ec8f054') }} />
        <view
          x={1}
          y={focusRow().y}
          width={732.61}
          height={focusRow().h}
          color={onCancel() ? t().accentA(0.2) : t().accentA(0.3)}
        />
        <text fontFamily={uiFont('bold')} fontSize={33.39} x={41.07} y={L().titleY} lineHeight={39.07} color="#ffffffff">
          {$L('Select Server')}
        </text>
        <text fontFamily={fontFor(L().subtitle || '')} fontSize={21.7} x={41.07} y={L().subtitleY || 0} lineHeight={25.4} color="#ffffff8a">
          {L().subtitle || ' '}
        </text>
        <view x={1} y={L().dividerY} width={732.61} height={1.67} color="#ffffff14" />
        <view>
          <Index each={L().rows}>
            {(r) => (
              <view x={1} y={r().y} width={732.61} height={94}>
                <view
                  x={36}
                  y={32}
                  width={30}
                  height={30}
                  src={r().selected ? 'icons/d/radio_on.webp' : 'icons/d/radio_off.webp'}
                  color={r().selected ? t().accent : '#ffffff8c'}
                />
                <text
                  fontFamily={fontFor(r().label, 'bold')}
                  fontSize={24}
                  x={84}
                  y={21 + nShift24}
                  lineHeight={1}
                  maxWidth={612}
                  maxLines={1}
                  color="#ffffffff"
                >
                  {r().label}
                </text>
                <text
                  fontFamily={fontFor(r().detail)}
                  fontSize={20}
                  x={84}
                  y={49 + nShift20}
                  lineHeight={1}
                  maxWidth={612}
                  maxLines={1}
                  color="#ffffffb3"
                >
                  {r().detail || ' '}
                </text>
              </view>
            )}
          </Index>
        </view>
        <view x={1} y={L().cancelDivider} width={732.61} height={1.67} color="#ffffff14" />
        <text fontFamily={uiFont()} fontSize={26.71} x={41.07} y={L().cancelY + 23.37 + cssShift(dp(16))} lineHeight={31.25} color="#ffffff80">
          {$L('Cancel')}
        </text>
      </view>
    </view>
  )
}
