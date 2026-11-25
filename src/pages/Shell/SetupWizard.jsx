import $L from '../../services/i18n.js'
import { Index, batch, createMemo, createSelector, createSignal, onCleanup, onMount } from 'solid-js'
import { fontFor, textReady, uiFont } from '../../ui/text.js'
import { hex } from '../../ui/color.js'
import { shadowColor, theme } from '../../ui/theme.js'
import { spacingFor, textWidth, themeDy, wrapLines } from '../../ui/components/account/look.js'
import * as settings from '../../state/settings.js'
import { getStore } from '../../state/store.js'
import { reactive } from '../../state/reactive.js'
import { getActiveServer } from '../../services/multiServerManager.js'
import { moonfinPing } from '../../services/seerrApi.js'
import { getAvailableThemeList, isBuiltInThemeId } from '../../theme/themeRegistry.js'
import { markComplete, remainingSteps } from '../../utils/setupWizardGate.js'
import { STEP_INFO, LANGUAGE_PATH, tourDescription } from '../../ui/components/account/setupSteps.js'
import { columnScroll, listScroll } from '../../ui/components/account/setupScroll.js'
import { getAudioLanguageOptions, getSubtitleLanguageOptions, getSubtitleModeOptions, subtitleModeHint } from '../Settings/settingsOptions.js'
import { router } from '../../app/router.js'
import PreviewStage from '../../ui/components/settings/PreviewStage.jsx'
import { wizardPick } from '../../ui/components/previews/scenePick.js'

// Answers are held and written as one batch at the end, except the theme, which restyles at once.
// shortcut: there's no Moonbase install dialog, so its row shows but OK on it does nothing. Add the
// dialog to make the row work.
const label = (options, value, fallback) => {
  const hit = options.find((o) => o.value === value)
  return hit ? hit.label : fallback
}
const questionFor = (step) => {
  switch (step) {
    case 'navbar':
      return $L('Where should navigation go?')
    case 'mediaBar':
      return $L('How should the top of your Home screen look?')
    case 'homeRows':
      return $L('How should your rows look?')
    case 'detailStyle':
      return $L('How should a movie or show look when you open it?')
    default:
      return $L("You're set. Here's what else is in here.")
  }
}
const COL_TOP = 160
const COL_H = 750
// The picker's list: 80% of the screen less the panel's 2px border, 32px padding and the title.
const LIST_MAX = 864 - 4 - 64 - 49
const NONE = '#00000000'
const STAGE_SHADOW = { color: shadowColor('#00000080'), x: 0, y: 24, blur: 80, spread: 0 }

export default function SetupWizard() {
  const store = getStore()
  const [fontsIn, setFontsIn] = createSignal(false)
  const s = reactive({
    ready: false,
    steps: [],
    cur: 0,
    answers: {},
    previewed: '',
    focusId: '',
    expanded: false,
    offerMoonbase: false,
    picker: null,
    pickIndex: 0,
    pickScroll: 0,
    scroll: 0,
  })
  // The faces follow the theme, which the tour changes as you go.
  const bold = () => uiFont('bold')
  const regular = () => uiFont()
  let leaving = false
  let gone = false

  const t = () => theme()
  const selectedFor = (key) => {
    const held = s.answers[key]
    return held != null ? held : settings.get(key)
  }
  const step = () => (s.ready ? s.steps[s.cur] : '')
  const info = () => STEP_INFO[step()] || null
  const options = createMemo(() => {
    const i = info()
    if (!i) return []
    if (i.options) return i.options()
    const desc = tourDescription()
    return getAvailableThemeList()
      .filter((th) => isBuiltInThemeId(th.id))
      .map((th) => ({ value: th.id, label: th.displayName, desc, theme: th }))
  })
  const activeThemeId = () => {
    const all = settings.all()
    return all.customThemeId || (isBuiltInThemeId(all.visualTheme) ? all.visualTheme : 'moonfin')
  }
  const selected = () => {
    const i = info()
    if (!i) return ''
    return i.settingKey ? selectedFor(i.settingKey) : activeThemeId()
  }
  const shown = () => {
    const value = s.previewed || selected()
    return options().find((o) => o.value === value) || options()[0] || null
  }
  const questionLines = createMemo(() => {
    fontsIn()
    return wrapLines(questionFor(step()), 52, 'bold', 600)
  })
  const isLast = () => s.cur >= s.steps.length - 1
  const header = createMemo(() => {
    fontsIn()
    const n = s.steps.length
    const stepText = $L('Step {n} of {total}').replace('{n}', String(s.cur + 1)).replace('{total}', String(n))
    const name = info() ? info().settingName() : ''
    const stepX = 96 + n * 80 - 8 + 24
    const chipX = stepX + textWidth(stepText, 24) + 24
    const skip = $L('Skip setup')
    const skipW = textWidth(skip, 28) + 32
    return { stepText, stepX, name, chipX, chipW: textWidth(name, 24, 'bold') + 42, skip, skipW, skipX: 1824 - skipW }
  })
  const segments = createMemo(() =>
    s.steps.map((st, i) => ({ x: 96 + i * 80, color: i < s.cur ? t().onSurface : i === s.cur ? t().accent : t().os(0.18) })),
  )
  // A settings path wraps onto another 33px line at maxW, since a theme's wider face can need one.
  const crumbs = (list, name, y, left, maxW) => {
    const th = t()
    const out = []
    let x = left
    let line = y
    const place = (item, w, dy) => {
      if (x > left && x - left + w + 8 > maxW) {
        x = left
        line += 33
      }
      out.push({ ...item, x, y: line + dy })
      x += w + 8
    }
    place({ w: 24, h: 24, icon: 'icons/wiz_settings.webp', color: th.os(0.55), text: '', font: regular() }, 24, 4.5)
    list.forEach((crumb) => {
      place({ w: 0, h: 0, icon: '', color: th.os(0.6), text: crumb, font: fontFor(crumb) }, textWidth(crumb, 22), 0)
      place({ w: 18, h: 18, icon: 'icons/wiz_chevron_right.webp', color: th.os(0.4), text: '', font: regular() }, 18, 7.5)
    })
    place({ w: 0, h: 0, icon: '', color: th.onSurface, text: name, font: fontFor(name, 'bold') }, textWidth(name, 22, 'bold'), 0)
    out.lines = (line - y) / 33 + 1
    return out
  }
  // The open picker has the focus, so nothing in the column draws focused under it.
  const isFocus = createSelector(() => (s.picker ? '' : s.focusId))
  // Focus isn't read here, so moving it doesn't measure the whole column again.
  const column = createMemo(() => {
    fontsIn()
    const out = { rows: [], settings: [] }
    let y = 160 + questionLines().length * 59.8 + 36
    const swatch = !(info() && info().settingKey)
    options().forEach((o) => {
      const colors = swatch && o.theme ? o.theme.colors : null
      out.rows.push({
        id: `opt-${o.value}`, y, sel: o.value === selected(), label: o.label, right: swatch ? 642 - 18 : 672,
        swatch: swatch ? 1 : 0, swAccent: colors ? '#' + colors.accent.slice(3, 9) : NONE, swSurface: colors ? '#' + colors.surface.slice(3, 9) : NONE,
      })
      y += 66
    })
    // The last row's 6px margin counts toward what the column can scroll.
    const rowsEnd = y - 6
    out.end = y
    if (step() !== 'tour') return out
    const audio = selectedFor('audioLanguage')
    const subtitle = selectedFor('subtitleLanguage')
    const mode = selectedFor('subtitleMode')
    const audioLabel = label(getAudioLanguageOptions(), audio, audio)
    const subtitleLabel = label(getSubtitleLanguageOptions(), subtitle, subtitle)
    const modeLabel = label(getSubtitleModeOptions(), mode, $L('Flagged'))
    const subtitlesOn = mode !== 'none'
    y = rowsEnd + 18
    out.section = {
      // The title's line runs 35px around the smaller Optional, and folded open the 40px chevron sets the height.
      y, h: s.expanded ? 84 : 116,
      summary: [audioLabel, subtitlesOn ? subtitleLabel : null, modeLabel].filter(Boolean).join(' · '),
      badgeX: 96 + 26 + 30 + 16 + textWidth($L('Playback languages'), 28, 'bold') + 16,
    }
    y += out.section.h
    if (s.expanded) {
      const list = [
        { key: 'audioLanguage', label: $L('Default Audio Language'), value: audioLabel },
        { key: 'preferDefaultAudioTrack', label: $L('Prefer Default Audio Track'), hint: $L('Pick the track the file marks as default before matching languages'), on: !!selectedFor('preferDefaultAudioTrack') },
        { key: 'subtitleMode', label: $L('Subtitle Mode'), value: modeLabel },
      ]
      if (subtitlesOn) list.push({ key: 'subtitleLanguage', label: $L('Default Subtitle Language'), value: subtitleLabel })
      list.forEach((r) => {
        y += 12
        const hintLines = r.hint ? wrapLines(r.hint, 24, 'regular', 600 - 4 - 64 - 24 - 72) : []
        const h = 40 + 4 + 33 + (hintLines.length ? 4 + hintLines.length * 33 : 0)
        const valueW = r.value != null ? textWidth(r.value, 28, 'bold') : 0
        out.settings.push({
          id: `set-${r.key}`, y, h, label: r.label, hint: hintLines.join('\n'),
          value: r.value || '', valueX: 696 - 2 - 32 - 32 - valueW, isSwitch: r.on != null ? 1 : 0, on: r.on ? 1 : 0,
        })
        y += h
      })
    }
    out.path = y + 12
    y = out.path + crumbs(LANGUAGE_PATH.crumbs(), LANGUAGE_PATH.settingName(), 0, 0, 600).lines * 33
    if (s.offerMoonbase) {
      out.moonbase = { y: y + 18 }
      y += 18 + 114
    }
    out.end = y
    return out
  })
  const rows = () => column().rows
  // A choice row's look on top of its place in the column.
  const rowLook = (o, focused) => {
    const th = t()
    let ring = th.os(0.4)
    if (o.sel) ring = th.accent
    else if (focused) ring = '#10101080'
    const tagW = o.sel ? textWidth($L('Current'), 20, focused ? 'bold' : 'regular') : 0
    return {
      ...o, focused, ring, labelFont: fontFor(o.label, focused ? 'bold' : 'regular'),
      labelColor: focused ? '#101010' : th.os(0.82), labelW: o.right - (o.sel ? tagW + 18 : 0) - 162,
      tagX: o.right - tagW, tagColor: focused ? '#10101099' : th.os(0.55), tagFont: focused ? bold() : regular(),
    }
  }
  const settingRows = () => column().settings
  const section = () => column().section || { y: 0, h: 0, summary: '', badgeX: 0 }
  const moonbase = () => column().moonbase || { y: 0 }
  const languagePath = createMemo(() => {
    fontsIn()
    return crumbs(LANGUAGE_PATH.crumbs(), LANGUAGE_PATH.settingName(), column().path || 0, 96, 600)
  })
  const captionDesc = createMemo(() => {
    fontsIn()
    return shown() ? wrapLines(shown().desc || '', 26, 'regular', 1040).slice(0, 2).join('\n') : ''
  })
  const captionPath = createMemo(() => {
    fontsIn()
    const lines = captionDesc() ? captionDesc().split('\n').length : 0
    return info() ? crumbs(info().crumbs(), info().settingName(), 810 + lines * 32.5 + 16, 784, 1040) : []
  })
  const next = createMemo(() => {
    fontsIn()
    const text = isLast() ? $L('Done') : $L('Next')
    const w = textWidth(text, 28, 'bold') + 96 + 8
    return { text, w, x: 1824 - w }
  })
  // The hint fills the footer between its two 240px slots and centers on the 73px Next button.
  const hintY = createMemo(() => {
    fontsIn()
    const lines = wrapLines($L('Up and down to preview · OK to choose · Back twice to skip'), 22, 'regular', 1248).length
    return 951 + (73 - lines * 33) / 2 + 2.02
  })
  const backW = () => {
    fontsIn()
    return textWidth($L('Back'), 28) + 32
  }
  // The list a setting row opens: its rows, and the panel sized to them up to 80% of the screen.
  const pickerLay = createMemo(() => {
    fontsIn()
    const p = s.picker
    if (!p) return { rows: [], h: 0, y: 0, listH: 0, contentH: 0, title: '' }
    let y = 0
    const list = p.options.map((o) => {
      const hint = p.descriptionOf ? p.descriptionOf(o.value) : ''
      const hintLines = hint ? wrapLines(hint, 22, 'regular', 760 - 4 - 32 - 48 - 16 - 36) : []
      const sel = o.value === p.current
      // The text sits centered in its row, which the 36px check makes taller on the picked one.
      const textH = 33 + (hintLines.length ? 4 + hintLines.length * 29.7 : 0)
      const h = 36 + Math.max(textH, sel ? 36 : 0)
      const out = { y, h, top: 18 + (h - 36 - textH) / 2, label: o.label, font: fontFor(o.label, 'bold'), hint: hintLines.join('\n'), sel }
      y += h
      return out
    })
    const h = 4 + 64 + 49 + Math.min(y, LIST_MAX)
    return { rows: list, h, y: (1080 - h) / 2, listH: Math.min(y, LIST_MAX), contentH: y, title: p.title }
  })
  const isPick = createSelector(() => s.pickIndex)
  const pickTo = (i) => {
    const row = pickerLay().rows[i]
    batch(() => {
      s.pickIndex = i
      if (row) s.pickScroll = listScroll({ scroll: s.pickScroll, top: row.y, bottom: row.y + row.h, viewH: LIST_MAX, contentH: pickerLay().contentH })
    })
  }
  const colMax = () => Math.max(0, column().end - COL_TOP - COL_H)
  const colScroll = () => Math.min(s.scroll, colMax())
  // The column's track, sized to what it holds so the renderer keeps drawing it however far it scrolls.
  const trackH = () => Math.max(COL_TOP + COL_H, column().end)

  const landFocus = () => {
    const opts = options()
    const hit = opts.find((o) => o.value === selected())
    const value = hit ? hit.value : opts[0] ? opts[0].value : ''
    batch(() => {
      s.focusId = `opt-${value}`
      s.previewed = value
      s.scroll = 0
    })
    keepInView()
  }
  const completeAndLeave = async () => {
    if (leaving) return
    leaving = true
    const active = await getActiveServer().catch(() => null)
    await markComplete(active && active.id, store.serverUrl, store.userId).catch(() => null)
    router.to('/home')
  }
  const finish = async () => {
    const changes = {}
    Object.keys(s.answers).forEach((key) => {
      if (s.answers[key] != null) changes[key] = s.answers[key]
    })
    // With subtitles off the language stays as it was.
    if (selectedFor('subtitleMode') === 'none') delete changes.subtitleLanguage
    if (Object.keys(changes).length) settings.update(changes)
    await completeAndLeave()
  }
  const advance = () => {
    if (isLast()) {
      finish()
      return
    }
    s.cur = s.cur + 1
    landFocus()
  }
  const goBack = () => {
    if (s.cur === 0) return
    s.cur = s.cur - 1
    landFocus()
  }
  const pick = (key, value) => {
    s.answers = { ...s.answers, [key]: value }
  }
  // Theme is written straight away rather than held back with the rest, so the wizard restyles around you.
  const pickOption = (value) => {
    if (info().settingKey) pick(info().settingKey, value)
    else settings.update({ visualTheme: value, customThemeId: '' })
  }
  const openPicker = (key) => {
    const lists = {
      audioLanguage: { title: $L('Default Audio Language'), options: getAudioLanguageOptions() },
      subtitleMode: { title: $L('Subtitle Mode'), options: getSubtitleModeOptions(), descriptionOf: subtitleModeHint },
      subtitleLanguage: { title: $L('Default Subtitle Language'), options: getSubtitleLanguageOptions() },
    }
    const p = lists[key]
    const current = selectedFor(key)
    batch(() => {
      s.picker = { ...p, settingKey: key, current }
      s.pickScroll = 0
    })
    pickTo(Math.max(0, p.options.findIndex((o) => o.value === current)))
  }
  // Everything that takes focus in the column, top to bottom.
  const columnIds = () => {
    const ids = options().map((o) => `opt-${o.value}`)
    if (step() === 'tour') {
      ids.push('playback')
      settingRows().forEach((r) => ids.push(r.id))
      if (s.offerMoonbase) ids.push('moonbase')
    }
    return ids
  }
  const keepInView = () => {
    const id = s.focusId
    let top = null
    let bottom = null
    const row = rows().find((r) => r.id === id)
    if (row) {
      top = row.y
      bottom = row.y + 60
    } else if (id === 'playback') {
      top = section().y
      bottom = section().y + section().h
    } else if (id === 'moonbase') {
      top = moonbase().y
      bottom = moonbase().y + 114
    } else {
      const r = settingRows().find((x) => x.id === id)
      if (r) {
        top = r.y
        bottom = r.y + r.h
      }
    }
    if (top == null) return
    // The last row brings the languages path in with it.
    const ids = columnIds()
    const last = id === ids[ids.length - 1]
    s.scroll = columnScroll({ scroll: colScroll(), top, bottom, viewTop: COL_TOP, viewH: COL_H, contentH: column().end - COL_TOP, last })
  }
  const focusTo = (id) => {
    batch(() => {
      s.focusId = id
      if (/^opt-/.test(id)) s.previewed = id.slice(4)
    })
    keepInView()
  }
  // The Magic Remote's cursor focuses a control, and OK then uses it (app/pointer.js).
  const over = (id) => () => {
    if (!s.picker && s.focusId !== id) focusTo(id)
  }
  const activate = () => {
    const id = s.focusId
    if (/^opt-/.test(id)) pickOption(id.slice(4))
    else if (id === 'skip') completeAndLeave()
    else if (id === 'next') advance()
    else if (id === 'back') goBack()
    else if (id === 'playback') {
      // Folding the section up only takes the scroll back within the shorter column.
      s.expanded = !s.expanded
      s.scroll = colScroll()
    } else if (id === 'set-preferDefaultAudioTrack') pick('preferDefaultAudioTrack', !selectedFor('preferDefaultAudioTrack'))
    else if (/^set-/.test(id)) openPicker(id.slice(4))
  }
  const shownValue = () => `opt-${shown() ? shown().value : ''}`
  const stagePick = createMemo(() => (shown() ? wizardPick(step(), shown().value, selectedFor('featuredBarStyle') || 'moonfin') : null))
  // Back never leaves on the first press. It moves to Skip, so leaving is two presses.
  const back = () => {
    if (s.picker) s.picker = null
    else if (s.focusId === 'skip') completeAndLeave()
    else focusTo('skip')
    return true
  }

  onMount(async () => {
    textReady().then(() => setFontsIn(true))
    const remaining = remainingSteps()
    if (!remaining.length) {
      // Everything here was answered on another device or an earlier visit.
      await completeAndLeave()
      return
    }
    // Not waited on, since only the last step needs it.
    moonfinPing(store.serverUrl)
      .then(
        (ping) => !!ping && (ping.installed === false || ping.settingsSyncEnabled === false),
        () => true,
      )
      .then((missing) => {
        if (!gone) s.offerMoonbase = missing
      })
    batch(() => {
      s.steps = remaining
      s.ready = true
    })
    landFocus()
  })
  onCleanup(() => {
    gone = true
  })

  const pathItem = (c) => (
    <view x={c().x} y={c().y} width={c().w} height={c().h} src={c().icon || undefined} color={c().color}>
      <text
        fontFamily={c().font}
        fontSize={22}
        lineHeight={33}
        y={2.02 + themeDy(22, c().font)}
        color={c().color}
        letterSpacing={spacingFor(c().font)}
      >
        {c().text || ''}
      </text>
    </view>
  )
  return (
    <view
      width={1920}
      height={1080}
      color="#000000ff"
      onUp={() => {
        if (s.picker) {
          pickTo(Math.max(0, s.pickIndex - 1))
          return true
        }
        const ids = columnIds()
        const at = ids.indexOf(s.focusId)
        if (at === 0) focusTo('skip')
        else if (at > 0) focusTo(ids[at - 1])
        else if (s.focusId === 'next') focusTo('skip')
        else if (s.focusId === 'back') focusTo(ids[ids.length - 1])
        return true
      }}
      onDown={() => {
        if (s.picker) {
          pickTo(Math.min(s.picker.options.length - 1, s.pickIndex + 1))
          return true
        }
        const ids = columnIds()
        const at = ids.indexOf(s.focusId)
        if (at >= 0 && at < ids.length - 1) focusTo(ids[at + 1])
        else if (at === ids.length - 1 || s.focusId === 'skip') focusTo('next')
        return true
      }}
      onLeft={() => {
        if (s.picker) return true
        if (s.focusId === 'next') focusTo(s.cur > 0 ? 'back' : shownValue())
        else if (s.focusId === 'skip') focusTo(shownValue())
        return true
      }}
      onRight={() => {
        if (s.picker) return true
        if (s.focusId !== 'skip') focusTo('next')
        return true
      }}
      onEnter={() => {
        if (s.picker) {
          const p = s.picker
          const option = p.options[s.pickIndex]
          if (option && option.value !== p.current) pick(p.settingKey, option.value)
          s.picker = null
          return true
        }
        activate()
        return true
      }}
      onBack={back}
    >
      {/* The theme background is drawn opaque, so a see-through one like Glass's still shows its solid color. */}
      <view width={1920} height={1080} color={t().background.slice(0, 7) + 'ff'} />
      <view alpha={s.ready ? 1 : 0}>
        <view>
          <Index each={segments()}>{(g) => <view x={g().x} y={86} width={72} height={6} borderRadius={3} color={g().color} />}</Index>
        </view>
        <text
          fontFamily={regular()}
          fontSize={24}
          lineHeight={33}
          x={header().stepX}
          y={74.7 + themeDy(24, regular())}
          color={t().os(0.6)}
          letterSpacing={spacingFor(regular())}
        >
          {header().stepText}
        </text>
        <view x={header().chipX} y={67} width={header().chipW} height={44}>
          <view width={header().chipW} height={44} borderRadius={22} color={t().os(0.08)} border={{ width: 1, color: hex(t().os(0.16)) }} />
          <text
            fontFamily={bold()}
            fontSize={24}
            lineHeight={33}
            x={21}
            y={7.7 + themeDy(24, bold())}
            color={t().onSurface}
            letterSpacing={spacingFor(bold())}
          >
            {header().name || ' '}
          </text>
        </view>
        <view x={header().skipX} y={64} onPointerOver={over('skip')}>
          <text
            fontFamily={regular()}
            fontSize={28}
            lineHeight={33}
            x={16}
            y={10.57 + themeDy(28, regular())}
            color={t().os(s.focusId === 'skip' ? 1 : 0.62)}
            letterSpacing={spacingFor(regular())}
          >
            {header().skip}
          </text>
          <view y={49} width={header().skipW} height={1} color={t().onSurface} alpha={s.focusId === 'skip' ? 1 : 0} />
        </view>

        <view y={COL_TOP} width={720} height={COL_H} clipping>
          <view y={-COL_TOP - colScroll()} width={720} height={trackH()}>
            <text
              fontFamily={bold()}
              fontSize={52}
              lineHeight={59.8}
              x={96}
              y={164.77 + themeDy(52, bold())}
              maxWidth={600}
              color={t().onSurface}
              letterSpacing={spacingFor(bold())}
            >
              {questionFor(step())}
            </text>
            <view width={720} height={trackH()}>
              <Index each={rows()}>
                {(row) => {
                  const o = createMemo(() => rowLook(row(), isFocus(row().id)))
                  return (
                    <view x={96} y={o().y} width={600} height={60} onPointerOver={over(row().id)}>
                      <view width={600} height={60} borderRadius={14} color={o().focused ? t().onSurface : NONE} />
                      <view x={24} y={18} width={24} height={24} borderRadius={12} color={NONE} border={{ width: 2, color: hex(o().ring) }} />
                      <view x={30} y={24} width={12} height={12} borderRadius={6} color={t().accent} alpha={o().sel ? 1 : 0} />
                      <text
                        fontFamily={o().labelFont}
                        fontSize={28}
                        lineHeight={33}
                        x={66}
                        y={16.07 + themeDy(28, o().labelFont)}
                        maxWidth={o().labelW}
                        maxLines={1}
                        color={o().labelColor}
                        letterSpacing={spacingFor(o().labelFont)}
                      >
                        {o().label}
                      </text>
                      <text
                        fontFamily={o().tagFont}
                        fontSize={20}
                        lineHeight={33}
                        x={o().tagX - 96}
                        y={15.34 + themeDy(20, o().tagFont)}
                        color={o().tagColor}
                        alpha={o().sel ? 1 : 0}
                        letterSpacing={spacingFor(o().tagFont)}
                      >
                        {$L('Current')}
                      </text>
                      <view alpha={o().swatch} x={546} y={15}>
                        <view x={-2} y={-2} width={34} height={34} borderRadius={17} color={t().os(0.2)} />
                        <view width={30} height={30} borderRadius={15} color={o().swSurface} />
                        <view x={6.5} y={6.5} width={17} height={17} borderRadius={8.5} color={o().swAccent} />
                      </view>
                    </view>
                  )
                }}
              </Index>
            </view>

            <view alpha={column().section ? 1 : 0} x={96} y={section().y} width={600} height={section().h} onPointerOver={over('playback')}>
              <view
                width={600}
                height={section().h}
                borderRadius={20}
                color={t().os(isFocus('playback') ? 0.1 : 0.04)}
                border={{ width: 2, color: hex(isFocus('playback') ? t().onSurface : t().os(0.14)) }}
              />
              <view x={26} y={section().h / 2 - 15} width={30} height={30} src="icons/wiz_translate.webp" color={t().onSurface} />
              <text
                fontFamily={bold()}
                fontSize={28}
                lineHeight={33}
                x={72}
                y={(s.expanded ? 27.07 : 24.57) + themeDy(28, bold())}
                color={t().onSurface}
                letterSpacing={spacingFor(bold())}
              >
                {$L('Playback languages')}
              </text>
              <text
                fontFamily={regular()}
                fontSize={24}
                lineHeight={33}
                x={section().badgeX - 96}
                y={(s.expanded ? 28.06 : 25.56) + themeDy(24, regular())}
                color={t().os(0.55)}
                letterSpacing={spacingFor(regular())}
              >
                {$L('Optional')}
              </text>
              <text
                fontFamily={regular()}
                fontSize={24}
                lineHeight={33}
                x={72}
                y={63.2 + themeDy(24, regular())}
                maxWidth={454}
                maxLines={1}
                color={t().os(0.65)}
                alpha={s.expanded ? 0 : 1}
                letterSpacing={spacingFor(regular())}
              >
                {section().summary || ' '}
              </text>
              <view
                x={534}
                y={section().h / 2 - 20}
                width={40}
                height={40}
                pivot={0.5}
                rotation={s.expanded ? Math.PI : 0}
                src="icons/wiz_keyboard_arrow_down.webp"
                color={t().os(0.7)}
              />
            </view>
            <view width={720} height={trackH()}>
              <Index each={settingRows()}>
                {(r) => (
                  <view x={96} y={r().y} width={600} height={r().h} onPointerOver={over(r().id)}>
                    <view
                      width={600}
                      height={r().h}
                      borderRadius={16}
                      color={t().os(isFocus(r().id) ? 0.1 : 0.04)}
                      border={{ width: 2, color: hex(isFocus(r().id) ? t().onSurface : t().os(0.14)) }}
                    />
                    <text
                      fontFamily={regular()}
                      fontSize={28}
                      lineHeight={33}
                      x={34}
                      y={24.57 + themeDy(28, regular())}
                      maxWidth={400}
                      maxLines={1}
                      color={t().os(0.7)}
                      letterSpacing={spacingFor(regular())}
                    >
                      {r().label}
                    </text>
                    <text
                      fontFamily={regular()}
                      fontSize={24}
                      lineHeight={33}
                      x={34}
                      y={61.2 + themeDy(24, regular())}
                      maxWidth={436}
                      color={t().os(0.5)}
                      letterSpacing={spacingFor(regular())}
                    >
                      {r().hint || ' '}
                    </text>
                    <text
                      fontFamily={bold()}
                      fontSize={28}
                      lineHeight={33}
                      x={r().valueX - 96}
                      y={(r().h / 2 - 16.5 + 2.57) + themeDy(28, bold())}
                      color={t().onSurface}
                      letterSpacing={spacingFor(bold())}
                    >
                      {r().value || ' '}
                    </text>
                    <view
                      x={600 - 34 - 32}
                      y={r().h / 2 - 16}
                      width={32}
                      height={32}
                      src="icons/wiz_chevron_right.webp"
                      color={t().os(0.55)}
                      alpha={r().isSwitch ? 0 : 1}
                    />
                    <view alpha={r().isSwitch} x={494} y={r().h / 2 - 20}>
                      <view width={72} height={40} borderRadius={20} color={r().on ? t().accent : t().os(0.25)} />
                      <view x={r().on ? 32 : 4} y={4} width={32} height={32} borderRadius={16} color={r().on ? t().onAccent : t().onSurface} />
                    </view>
                  </view>
                )}
              </Index>
            </view>
            <view alpha={column().section ? 1 : 0} width={720} height={trackH()}>
              <Index each={column().section ? languagePath() : []}>{pathItem}</Index>
            </view>
            <view alpha={column().moonbase ? 1 : 0} x={96} y={moonbase().y} width={600} height={114}>
              <view
                width={600}
                height={114}
                borderRadius={20}
                color={t().os(isFocus('moonbase') ? 0.1 : 0.04)}
                border={{ width: 2, color: hex(isFocus('moonbase') ? t().onSurface : t().os(0.14)) }}
              />
              <view x={26} y={42} width={30} height={30} src="icons/acc_dnsRounded.webp" color={t().onSurface} />
              <text
                fontFamily={bold()}
                fontSize={28}
                lineHeight={33}
                x={72}
                y={24.57 + themeDy(28, bold())}
                maxWidth={430}
                maxLines={1}
                color={t().onSurface}
                letterSpacing={spacingFor(bold())}
              >
                {$L('Add Moonbase to your server')}
              </text>
              <text
                fontFamily={regular()}
                fontSize={24}
                lineHeight={33}
                x={72}
                y={61.2 + themeDy(24, regular())}
                maxWidth={430}
                maxLines={2}
                color={t().os(0.65)}
                letterSpacing={spacingFor(regular())}
              >
                {$L('A free server plugin that unlocks more of Moonfin')}
              </text>
              <view x={542} y={41} width={32} height={32} src="icons/wiz_chevron_right.webp" color={t().os(0.55)} />
            </view>
          </view>
        </view>

        <view x={784} y={160} width={1040} height={585} borderRadius={24} color={t().surface} />
        <PreviewStage x={785} y={161} w={1038} h={583} pick={stagePick()} radius={23} behind={t().background} />
        <view x={784} y={160} width={1040} height={585} borderRadius={24} color={NONE} shadow={STAGE_SHADOW} />
        <view x={784} y={160} width={1040} height={585} borderRadius={24} color={NONE} border={{ width: 1, color: hex(t().os(0.2)) }} />

        <text
          fontFamily={bold()}
          fontSize={36}
          lineHeight={33}
          x={784}
          y={772.3 + themeDy(36, bold())}
          maxWidth={1040}
          maxLines={1}
          color={t().onSurface}
          letterSpacing={spacingFor(bold())}
        >
          {shown() ? shown().label : ' '}
        </text>
        <text
          fontFamily={regular()}
          fontSize={26}
          lineHeight={32.5}
          x={784}
          y={812.39 + themeDy(26, regular())}
          maxWidth={1040}
          color={t().os(0.62)}
          letterSpacing={spacingFor(regular())}
        >
          {captionDesc() || ' '}
        </text>
        <view>
          <Index each={captionPath()}>{pathItem}</Index>
        </view>

        <view alpha={s.cur > 0 ? 1 : 0} x={96} y={962} onPointerOver={over('back')}>
          <text
            fontFamily={regular()}
            fontSize={28}
            lineHeight={33}
            x={16}
            y={10.57 + themeDy(28, regular())}
            color={t().os(s.focusId === 'back' ? 1 : 0.62)}
            letterSpacing={spacingFor(regular())}
          >
            {$L('Back')}
          </text>
          <view y={49} width={backW()} height={1} color={t().onSurface} alpha={s.focusId === 'back' ? 1 : 0} />
        </view>
        <text
          fontFamily={regular()}
          fontSize={22}
          lineHeight={33}
          x={336}
          y={hintY() + themeDy(22, regular())}
          maxWidth={1248}
          contain="width"
          textAlign="center"
          color={t().os(0.5)}
          letterSpacing={spacingFor(regular())}
        >
          {$L('Up and down to preview · OK to choose · Back twice to skip')}
        </text>
        <view x={next().x} y={951} width={next().w} height={73} onPointerOver={over('next')}>
          <view
            width={next().w}
            height={73}
            borderRadius={16}
            color={NONE}
            alpha={s.focusId === 'next' ? 1 : 0}
            shadow={{ color: shadowColor(t().accentA(0.5)), x: 0, y: 0, blur: 36, spread: 2 }}
          />
          <view width={next().w} height={73} borderRadius={16} color={t().accent} />
          <view
            width={next().w}
            height={73}
            borderRadius={16}
            color={NONE}
            border={{ width: 4, color: hex(t().onSurface) }}
            alpha={s.focusId === 'next' ? 1 : 0}
          />
          <text
            fontFamily={bold()}
            fontSize={28}
            lineHeight={33}
            x={next().w / 2}
            y={22.57 + themeDy(28, bold())}
            mountX={0.5}
            color={t().onAccent}
            letterSpacing={spacingFor(bold())}
          >
            {next().text}
          </text>
        </view>
      </view>

      <view alpha={s.picker ? 1 : 0} width={1920} height={1080} color={t().scrim.slice(0, 7) + '99'}>
        <view x={580} y={pickerLay().y} width={760} height={pickerLay().h}>
          <view
            width={760}
            height={pickerLay().h}
            borderRadius={32}
            color={NONE}
            shadow={{ color: shadowColor(t().scrim.slice(0, 7) + '66'), x: 0, y: 0, blur: 60, spread: 2 }}
          />
          <view width={760} height={pickerLay().h} borderRadius={32} color={t().surface} border={{ width: 2, color: hex(t().os(0.22)) }} />
          <text
            fontFamily={bold()}
            fontSize={32}
            lineHeight={33}
            x={42}
            y={36.94 + themeDy(32, bold())}
            color={t().onSurface}
            letterSpacing={spacingFor(bold())}
          >
            {pickerLay().title || ' '}
          </text>
          <view x={18} y={83} width={724} height={pickerLay().listH} clipping>
            <view y={-s.pickScroll} width={724} height={pickerLay().contentH}>
              <Index each={pickerLay().rows}>
                {(o, i) => (
                  <view y={o().y} width={724} height={o().h} onPointerOver={() => s.picker && s.pickIndex !== i && (s.pickIndex = i)}>
                    <view width={724} height={o().h} borderRadius={16} color={isPick(i) ? t().os(0.12) : NONE} />
                    <text
                      fontFamily={o().font}
                      fontSize={26}
                      lineHeight={33}
                      x={24}
                      y={(o().top + 2.39) + themeDy(26, o().font)}
                      maxWidth={608}
                      maxLines={1}
                      color={t().onSurface}
                      letterSpacing={spacingFor(o().font)}
                    >
                      {o().label}
                    </text>
                    <text
                      fontFamily={regular()}
                      fontSize={22}
                      lineHeight={29.7}
                      x={24}
                      y={(o().top + 39.02) + themeDy(22, regular())}
                      maxWidth={608}
                      color={t().os(0.6)}
                      letterSpacing={spacingFor(regular())}
                    >
                      {o().hint || ' '}
                    </text>
                    <view x={664} y={o().h / 2 - 18} width={36} height={36} src="icons/wiz_check.webp" color={t().accent} alpha={o().sel ? 1 : 0} />
                  </view>
                )}
              </Index>
            </view>
          </view>
        </view>
      </view>
    </view>
  )
}
