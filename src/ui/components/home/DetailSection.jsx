import $L from '../../../services/i18n.js'
import { Index, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import RatingsRow from './RatingsRow.jsx'
import { api, getServerUrl } from '../../../services/jellyfinApi.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import { formatDuration, getImageUrl, videoResolutionLabel } from '../../../utils/helpers.js'
import * as settings from '../../../state/settings.js'
import { fontFor, textWidth, uiFont } from '../../text.js'
import { theme } from '../../theme.js'
import { hex } from '../../color.js'

// The info area above Classic rows: the focused title's logo or name, one line of episode, year,
// certification, runtime, resolution and genres, the ratings and the overview. It follows focus
// 400ms after it settles and reads the full item when the row's copy has no backdrop or provider
// ids. Props: `visible`, `left` (a docked sidebar), `ref`, and onFocusedItemChange(item), which
// feeds the backdrop. Its node has focusItem(item) and clear().

const FOCUS_ITEM_DEBOUNCE_MS = 400
const GENRES = 3
const X = { left: 110, top: 60 }
const CONTAIN = { resizeMode: { type: 'contain', x: 0, y: 1 } }

// An episode's number and name, then year, certification chip, runtime, resolution chip and genres.
const buildInfoParts = (item) => {
  const parts = []
  if (item.Type === 'Episode') {
    const number = item.ParentIndexNumber != null && item.IndexNumber != null ? `S${item.ParentIndexNumber}:E${item.IndexNumber}` : null
    const lead = [number, item.Name].filter(Boolean).join(' - ')
    if (lead) parts.push({ text: lead, lead: true })
  }
  if (item.ProductionYear) parts.push({ text: String(item.ProductionYear) })
  if (item.OfficialRating) parts.push({ chip: item.OfficialRating })
  if (item.RunTimeTicks && item.Type !== 'Series') {
    const dur = formatDuration(item.RunTimeTicks)
    if (dur && dur !== '0m') parts.push({ text: dur })
  }
  const resolution = videoResolutionLabel(item)
  if (resolution) parts.push({ chip: resolution })
  const genres = (item.Genres || []).slice(0, GENRES)
  if (genres.length) parts.push({ text: genres.join(', ') })
  return parts
}

const detailTitleFor = (item) => (item.Type === 'Episode' && item.SeriesName) || item.Name || ''

const logoUrlFor = (item) => {
  const serverUrl = item._serverUrl || getServerUrl()
  if (item.Type === 'Episode') {
    const id = item.ParentLogoItemId || item.SeriesId
    return item.ParentLogoImageTag && id ? getImageUrl(serverUrl, id, 'Logo', { maxWidth: 800, quality: 80, tag: item.ParentLogoImageTag }) : ''
  }
  return item.ImageTags && item.ImageTags.Logo ? getImageUrl(serverUrl, item.Id, 'Logo', { maxWidth: 800, quality: 80, tag: item.ImageTags.Logo }) : ''
}

export default function DetailSection(props) {
  const [item, setItem] = createSignal(null)
  const [failedLogo, setFailedLogo] = createSignal('')
  const [logoW, setLogoW] = createSignal(640)
  const [ratingsH, setRatingsH] = createSignal(0)
  const t = () => theme()
  const x = () => (props.left ? X.left : X.top)
  const m = createMemo(() => {
    const it = item()
    if (!it) return null
    const title = detailTitleFor(it)
    const logo = logoUrlFor(it)
    const s = settings.all()
    const overview = !s.hideHomeMediaDescription && it.Overview ? it.Overview : ''
    // Laid out along the 36px line. A chip is its text padded 10 by 1.
    let px = 0
    const parts = buildInfoParts(it).map((p, i) => {
      const chip = !!p.chip
      const label = p.chip || p.text
      const weight = p.lead ? 'bold' : 'medium'
      const dotX = i > 0 ? px + 12 : -1
      if (i > 0) px += 24 + textWidth('•', 24)
      const w = chip ? textWidth(label, 20, 'medium') + 20 : textWidth(label, 24, weight)
      const part = { dotX, x: px, w, chip, lead: !!p.lead, label, font: fontFor(label, weight) }
      px += w
      return part
    })
    return {
      title,
      titleFont: fontFor(title, 'bold'),
      logo: logo && logo !== failedLogo() ? logo : '',
      parts,
      overview,
      overviewFont: fontFor(overview),
      mdb: isMdblistEnabled(s, 'homeRows'),
    }
  })

  let timer = null
  let reading = null
  let shownLogo = ''
  const cancel = () => {
    clearTimeout(timer)
    timer = null
    reading = null
  }
  onCleanup(cancel)
  const show = (it) => {
    const logo = it ? logoUrlFor(it) : ''
    if (logo !== shownLogo) setLogoW(640)
    shownLogo = logo
    setItem(it)
    if (props.onFocusedItemChange) props.onFocusedItemChange(it)
  }
  // Called by the page for each focused card. The item lands after focus has rested.
  const focusItem = (it) => {
    cancel()
    timer = setTimeout(() => {
      show(it)
      if (it._seerr || it._external || it._resolvedFromExternal || it.isGame) return
      const needsBackdrop = !(it.BackdropImageTags && it.BackdropImageTags.length) && !(it.ParentBackdropImageTags && it.ParentBackdropImageTags.length)
      if (needsBackdrop || !it.ProviderIds) {
        const id = (reading = it.Id)
        api
          .getItemForDetail(it.Id)
          .then((full) => {
            if (reading === id && full) show(full)
          })
          .catch(() => {})
      }
    }, FOCUS_ITEM_DEBOUNCE_MS)
  }

  const chipEdge = () => ({ width: t().chipBorder.w, color: hex(t().chipBorder.color) })
  return (
    <view
      ref={(n) => {
        n.focusItem = focusItem
        n.clear = () => {
          cancel()
          show(null)
        }
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={461}
      clipping
      alpha={props.visible ? 1 : 0}
      transition={{ alpha: { duration: 300, easing: 'ease' } }}
    >
      <Show
        when={m()}
        fallback={
          <text x={x()} y={132} fontFamily={uiFont()} fontSize={24} lineHeight={33} color={t().os(0.7)} alpha={0.5}>
            {$L('Navigate to an item to see details')}
          </text>
        }
      >
        <view>
          <Show
            when={m().logo}
            fallback={
              <text
                x={x()}
                y={170.5}
                fontFamily={m().titleFont}
                fontSize={48}
                lineHeight={60}
                maxWidth={1920 - x() - 60}
                maxLines={1}
                color={t().onBackground}
              >
                {m().title}
              </text>
            }
          >
            {/* The logo sits bottom left in its 640 by 96 band. */}
            <view
              x={x()}
              y={130}
              width={logoW()}
              height={96}
              src={m().logo}
              textureOptions={CONTAIN}
              onEvent={{
                loaded: (_, e) => {
                  const d = e && e.dimensions
                  if (d && d.w && d.h) setLogoW(Math.min(640, (d.w / d.h) * 96))
                },
                failed: () => setFailedLogo(m().logo),
              }}
            />
          </Show>
        </view>
        <view x={x()} y={240} width={1920 - x() - 60} height={36}>
          <Index each={m().parts}>
            {(p) => (
              <view>
                <Show when={p().dotX >= 0}>
                  <text x={p().dotX} fontFamily={uiFont()} fontSize={24} lineHeight={36} color={t().os(0.5)}>
                    •
                  </text>
                </Show>
                <Show
                  when={p().chip}
                  fallback={
                    <text x={p().x} fontFamily={p().font} fontSize={24} lineHeight={36} color={p().lead ? t().onBackground : t().os(0.8)}>
                      {p().label}
                    </text>
                  }
                >
                  <view
                    x={p().x}
                    y={4}
                    width={p().w}
                    height={28}
                    borderRadius={Math.min(14, t().chipRadius)}
                    color={t().chipBackground}
                    border={t().chipBorder.w ? chipEdge() : undefined}
                  >
                    <text x={10} y={1} fontFamily={p().font} fontSize={20} lineHeight={26} color={t().os(0.85)}>
                      {p().label}
                    </text>
                  </view>
                </Show>
              </view>
            )}
          </Index>
        </view>
        <RatingsRow
          x={x()}
          y={274}
          item={item()}
          inline
          surface="homeRows"
          pluginEnabled={m().mdb}
          maxW={1920 - x() - 60}
          onLayout={(b) => setRatingsH(b.empty ? 0 : b.h)}
        />
        <Show when={m().overview}>
          <text
            x={x()}
            y={276 + ratingsH() + 16}
            fontFamily={m().overviewFont}
            fontSize={24}
            lineHeight={36}
            maxWidth={Math.min(1200, 1920 - x() - 60)}
            maxLines={3}
            color={t().os(0.85)}
          >
            {m().overview}
          </text>
        </Show>
      </Show>
    </view>
  )
}
