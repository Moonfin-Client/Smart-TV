import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import CalCountdown from '../../ui/components/calendar/CalCountdown.jsx'
import CalAgenda from '../../ui/components/calendar/CalAgenda.jsx'
import * as settings from '../../state/settings.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { PROBLEM, startOfDay } from '../../utils/calendarEntries.js'
import { calendarNow, loadCalendarData, lookKey } from '../../ui/components/calendar/calendarData.js'
import { fontsReady } from '../../ui/components/calendar/calendarLayout.js'

// What the Calendar button opens: the style the user picked, the countdown or the agenda, over the
// whole calendar window loaded once. Both open the month grid from their Full calendar button.
// `preview` draws it in the settings preview with `prefs` as its settings, leaving focus, the nav
// and the route alone.
export default function Calendar(props) {
  const store = getStore()
  const now = calendarNow()
  // Set again with the same data once the fonts are in, so the views measure their text again.
  const [data, setData] = createSignal({ loading: true, all: [], now, today: startOfDay(now) }, { equals: false })
  const [style, setStyle] = createSignal('')
  let view = null
  let gen = 0
  let alive = true
  onCleanup(() => {
    alive = false
  })

  const focusView = () => {
    if (view && !props.preview) view.setFocus()
  }
  const applyStyle = () => {
    const next = (props.prefs || settings.all()).calendarStyle === 'countdown' ? 'countdown' : 'agenda'
    if (next === style()) return
    setStyle(next)
    setTimeout(() => alive && focusView(), 0)
  }
  const load = async (refresh) => {
    const mine = ++gen
    // A reload keeps what's on screen until the new answer is in.
    if (!data().all.length) setData({ ...data(), loading: true })
    let next
    try {
      next = await loadCalendarData(refresh, props.prefs || undefined)
    } catch (e) {
      const at = calendarNow()
      next = { loading: false, problem: PROBLEM.failed, all: [], now: at, today: startOfDay(at) }
    }
    if (mine !== gen || !alive) return
    setData(next)
  }
  const reload = () => load(true)
  const openMonth = () => router.to('/calendar/month')

  const sig = createMemo(lookKey)
  createEffect(
    on(
      sig,
      () => {
        applyStyle()
        // loadCalendar caches the window, so this only fetches when a filter needs new data.
        load(false)
      },
      { defer: true }
    )
  )
  createEffect(
    on(
      () => props.page && props.page.active(),
      (active) => {
        if (active && !props.preview) store.navSection = 'calendar'
      }
    )
  )
  applyStyle()
  load(false)
  // Text is measured for the layout, so it's laid out again once the font files are in.
  fontsReady().then(() => alive && setData(data()))
  // A theme's own face measures once it has loaded, which bumps settingsVersion.
  createEffect(on(() => store.settingsVersion, () => setData(data()), { defer: true }))
  onMount(() => {
    if (!props.preview) setTimeout(() => alive && focusView(), 0)
  })

  return (
    <view
      width={1920}
      height={1080}
      forwardFocus={() => {
        if (!view || props.preview) return false
        view.setFocus()
        return true
      }}
    >
      <view>
        <Show when={style() === 'countdown'}>
          <CalCountdown ref={(n) => (view = n)} data={data()} prefs={props.prefs} preview={props.preview} reload={reload} openMonth={openMonth} />
        </Show>
      </view>
      <view>
        <Show when={style() === 'agenda'}>
          <CalAgenda ref={(n) => (view = n)} data={data()} prefs={props.prefs} preview={props.preview} reload={reload} openMonth={openMonth} />
        </Show>
      </view>
    </view>
  )
}
