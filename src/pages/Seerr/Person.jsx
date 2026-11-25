import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import Row from '../../ui/components/Row.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import { toCard } from '../../ui/models.js'
import { fontFor, uiFont } from '../../ui/text.js'
import { navOnLeft, theme } from '../../ui/theme.js'
import { hex } from '../../ui/color.js'
import { textWidth } from '../../ui/components/seerr/look.js'
import { lineCount } from '../../ui/components/player/look.js'
import { focusNav } from '../../app/focus.js'
import { router } from '../../app/router.js'
import { getStore } from '../../state/store.js'
import * as seerrApi from '../../services/seerrApi.js'
import { personDateLines, prepareCredits } from '../../utils/personCredits.js'
import { normalizeMediaItem } from '../../utils/seerrHomeRows.js'
import { openSeerrItem } from './seerrModels.js'

// A TMDB-only person, laid out like a library person: a random backdrop from their credits, the
// round portrait, name, dates, birthplace and department, the biography (Enter opens it in full)
// and Appearances and Crew tabs, each a row of portrait cards. It sits on the theme's background, in
// its text colors, and the portrait has no ring (Core draws none).
const OVERVIEW_LINE = 33
const COVER = { resizeMode: { type: 'cover' } }
const EMPTY_ROW = { title: '', items: [], key: 'none' }

export default function Person(props) {
  const store = getStore()
  const [details, setDetails] = createSignal(null)
  const [credits, setCredits] = createSignal(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  const [zone, setZone] = createSignal('tabs')
  const [tab, setTab] = createSignal(0)
  const [expanded, setExpanded] = createSignal(false)
  const [backdrop, setBackdrop] = createSignal('')
  const nameFont = uiFont('bold')
  const bodyFont = uiFont()
  const tabFont = uiFont('bold')
  const smallFont = uiFont('bold')
  const showLess = $L('Show Less')
  const backLabel = $L('Go Back')
  const rowNodes = []
  let root
  let alive = true
  onCleanup(() => (alive = false))

  const rawCast = () => {
    const c = credits()
    const d = details() || {}
    return (c && c.cast) || (d.combinedCredits && d.combinedCredits.cast) || (d.credits && d.credits.cast) || []
  }
  const rawCrew = () => {
    const c = credits()
    const d = details() || {}
    return (c && c.crew) || (d.combinedCredits && d.combinedCredits.crew) || (d.credits && d.credits.crew) || []
  }
  const tabs = createMemo(() => {
    const rows = (list, isCrew) =>
      prepareCredits(list, { isCrew }).map((credit, i) => {
        const item = normalizeMediaItem(credit)
        return { ...toCard(item, 'poster', i), key: `${item.Id}-${i}`, image: item._externalPosterUrl || '', subtitle: '', raw: item, credit }
      })
    const out = []
    const cast = rows(rawCast(), false)
    const crew = rows(rawCrew(), true)
    if (cast.length) out.push({ key: 'appearances', label: $L('Appearances'), title: `${$L('Appearances')} (${cast.length})`, items: cast })
    if (crew.length) out.push({ key: 'crew', label: $L('Crew'), title: `${$L('Crew')} (${crew.length})`, items: crew })
    let x = 48
    return out.map((tb, i) => {
      const w = textWidth(tb.label, 22, 'bold') + 50
      const at = x
      x += w + 8
      return { ...tb, i, x: at, w }
    })
  })
  const active = () => tabs()[Math.min(tab(), tabs().length - 1)] || null
  const info = createMemo(() => {
    const d = details()
    const t = theme()
    if (!d) return null
    const name = props.name || d.name || ''
    const known = d.knownForDepartment ? `${$L('Known for:')} ${d.knownForDepartment}` : null
    const lines = personDateLines(d.birthday, d.deathday).concat([d.placeOfBirth, known]).filter(Boolean)
    let x = 384
    const meta = []
    lines.forEach((text, i) => {
      if (i) {
        meta.push({ key: `dot${i}`, text: '•', x: x + 16, color: t.os(0.4), font: bodyFont })
        x += 16 + textWidth('•', 24) + 16
      }
      meta.push({ key: `m${i}`, text, x, color: t.os(0.67), font: fontFor(text) })
      x += textWidth(text, 24)
    })
    // The biography's line breaks and runs of spaces collapse into single spaces.
    const bio = String(d.biography || '').replace(/\s+/g, ' ').trim()
    const bioLines = bio ? Math.max(1, lineCount(bio, 22, 'regular', 1462)) : 0
    const shown = expanded() ? bioLines : Math.min(3, bioLines)
    const metaY = 205
    const bioY = lines.length ? metaY + 33 + 16 : metaY
    // The bio box is padded 9px round its lines, and the toggle sits under them.
    const bioH = bio ? 18 + shown * OVERVIEW_LINE + (expanded() ? 8 + 24 : 0) : 0
    const infoBottom = Math.max(412, bio ? bioY + bioH : bioY)
    return {
      name,
      nameFont: fontFor(name, 'bold'),
      meta,
      bio,
      bioFont: fontFor(bio),
      bioY,
      bioH,
      bioLines: shown,
      profile: d.profilePath ? seerrApi.getImageUrl(d.profilePath, 'h632') : d.libraryImageUrl || '',
      initial: (d.name || '').charAt(0),
      tabsY: infoBottom + 32,
      rowY: infoBottom + 32 + 55 + 32 + 40,
    }
  })
  const tabFocus = () => (zone() === 'tabs' ? tab() : -1)
  // The tabs' and the biography's focus border, 2px of the accent at half strength.
  const edge = () => ({ width: 2, color: hex(theme().accentA(0.5)) })
  // One row per tab, so each keeps its own place when the other is picked.
  const rowA = () => tabs()[0] || EMPTY_ROW
  const rowB = () => tabs()[1] || EMPTY_ROW

  const focusZone = () => {
    const row = zone() === 'row' && rowNodes[tab()]
    if (row) row.setFocus()
    else if (root) root.setFocus()
  }
  const load = async () => {
    setLoading(true)
    try {
      const [d, c] = await Promise.all([seerrApi.getPerson(props.id), seerrApi.getPersonCombinedCredits(props.id).catch(() => null)])
      if (!alive) return
      batch(() => {
        setDetails(d)
        setCredits(c)
      })
      // A backdrop from whatever they have been in, rather than a flat screen.
      const urls = []
      rawCast().concat(rawCrew()).forEach((cr) => {
        const path = cr.backdropPath || cr.backdrop_path
        if (path) urls.push(seerrApi.getImageUrl(path, 'w1280'))
      })
      setBackdrop(urls.length ? urls[Math.floor(Math.random() * urls.length)] : '')
    } catch (e) {
      console.error('[seerr] person failed', e)
      if (alive) setError((e && e.message) || $L('Failed to load details'))
    }
    if (!alive) return
    batch(() => {
      setLoading(false)
      // Focus lands on whichever tab comes first.
      setTab(0)
      setZone(tabs().length ? 'tabs' : info() && info().bio ? 'bio' : 'tabs')
    })
    if (props.page.active()) focusZone()
  }
  const onRowSelect = (card) => openSeerrItem(router, card.credit || {})

  createEffect(on(props.page.active, (a) => a && (store.navSection = 'seerr')))
  onMount(() => {
    store.navSection = 'seerr'
    if (root) root.setFocus()
    load()
  })

  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color={theme().background}
      forwardFocus={() => {
        const row = zone() === 'row' && rowNodes[tab()]
        if (!row) return false
        row.setFocus()
        return true
      }}
      onUp={() => {
        if (zone() === 'row') {
          setZone('tabs')
          focusZone()
        } else if (zone() === 'tabs' && info() && info().bio) setZone('bio')
        else if (!navOnLeft() || zone() === 'bio') return focusNav()
        return true
      }}
      onDown={() => {
        if (error()) return true
        if (zone() === 'bio' && tabs().length) setZone('tabs')
        else if (zone() === 'tabs' && active() && active().items.length) {
          setZone('row')
          focusZone()
        }
        return true
      }}
      onLeft={() => {
        if (zone() === 'tabs' && tab() > 0) setTab(tab() - 1)
        else if (navOnLeft()) return focusNav()
        return true
      }}
      onRight={() => {
        if (zone() === 'tabs' && tab() < tabs().length - 1) setTab(tab() + 1)
        return true
      }}
      onEnter={() => {
        if (error()) router.back()
        else if (zone() === 'bio') setExpanded(!expanded())
        return true
      }}
    >
      <view>
        <Show when={backdrop()}>
          <view width={1920} height={1080} src={backdrop()} textureOptions={COVER} alpha={0.4} />
        </Show>
      </view>
      <view>
        <Show when={loading()}>
          <Spinner x={928} y={508} size={64} />
        </Show>
      </view>
      <view>
        <Show when={error()}>
          <text x={960} y={480} mountX={0.5} fontFamily={bodyFont} fontSize={24} color={theme().os(0.53)}>
            {error()}
          </text>
          <view x={895} y={530} width={130} height={50} borderRadius={8} color="#ffffffff" />
          <text x={960} y={544} mountX={0.5} fontFamily={bodyFont} fontSize={18} color="#000000ff">
            {backLabel}
          </text>
        </Show>
      </view>

      <view>
        <Show when={info()}>
          {(nf) => (
            <view>
              <view x={75} y={159} width={250} height={250} borderRadius={125} color={theme().os(0.2)} />
              <Show
                when={nf().profile}
                fallback={
                  <text x={200} y={284} mountX={0.5} mountY={0.5} fontFamily={nameFont} fontSize={72} color={theme().os(0.4)}>
                    {nf().initial}
                  </text>
                }
              >
                <view x={75} y={159} width={250} height={250} borderRadius={125} src={nf().profile} textureOptions={COVER} />
              </Show>
              <text x={384} y={158} fontFamily={nf().nameFont} fontSize={48} lineHeight={33} maxWidth={1488} maxLines={1} color={theme().onSurface}>
                {nf().name}
              </text>
              <view>
                <For each={nf().meta}>
                  {(m) => (
                    <text x={m.x} y={207} fontFamily={m.font} fontSize={24} lineHeight={33} color={m.color}>
                      {m.text}
                    </text>
                  )}
                </For>
              </view>
              <Show when={nf().bio}>
                <view x={384} y={nf().bioY} width={1488} height={nf().bioH}>
                  <view width={1488} height={nf().bioH} borderRadius={8} color="#00000000" border={edge()} alpha={zone() === 'bio' ? 1 : 0} />
                  <text
                    x={13}
                    y={11}
                    fontFamily={nf().bioFont}
                    fontSize={22}
                    lineHeight={33}
                    maxWidth={1462}
                    maxLines={expanded() ? 0 : nf().bioLines}
                    color={theme().os(0.8)}
                  >
                    {nf().bio}
                  </text>
                  <text x={13} y={nf().bioH - 33} fontFamily={smallFont} fontSize={16} lineHeight={24} color={theme().accentA(0.8)} alpha={expanded() ? 1 : 0}>
                    {showLess}
                  </text>
                </view>
              </Show>
              <view>
                <For each={tabs()}>
                  {(tb) => (
                    <view x={tb.x} y={nf().tabsY} width={tb.w} height={55}>
                      <view width={tb.w} height={55} borderRadius={8} color={theme().accentA(0.2)} alpha={tb.i === tab() ? 1 : 0} />
                      <view width={tb.w} height={55} borderRadius={8} color="#00000000" border={edge()} alpha={tb.i === tabFocus() ? 1 : 0} />
                      <text x={25} y={13} fontFamily={tabFont} fontSize={22} lineHeight={33} color={tb.i === tab() ? theme().onSurface : theme().os(0.67)}>
                        {tb.label}
                      </text>
                    </view>
                  )}
                </For>
              </view>
              <view alpha={tab() === 0 ? 1 : 0}>
                <Row ref={(n) => (rowNodes[0] = n)} x={48} y={nf().rowY} title={rowA().title} items={rowA().items} type="poster" look="media" rowKey={rowA().key} onRowSelect={onRowSelect} />
              </view>
              <view alpha={tab() === 1 ? 1 : 0}>
                <Row ref={(n) => (rowNodes[1] = n)} x={48} y={nf().rowY} title={rowB().title} items={rowB().items} type="poster" look="media" rowKey={rowB().key} onRowSelect={onRowSelect} />
              </view>
            </view>
          )}
        </Show>
      </view>
    </view>
  )
}
