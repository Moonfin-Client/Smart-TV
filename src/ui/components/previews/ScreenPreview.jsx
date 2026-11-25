import { Show, createMemo, lazy } from 'solid-js'
import { Dynamic } from '@solidtv/solid'
import HomePreview from './HomePreview.jsx'
import { isBookLibraryType } from '../../../utils/bookLibrary.js'

// One of the app's own screens, laid out at the TV's 1920 by 1080 and scaled onto the design screen,
// with the navbar where it's set for the Calendar and none for a library. The screens are the real
// Calendar, CalendarMonth (while Week Start has focus), Library, MusicLibrary or Books pages in their
// preview mode, drawn with the settings being tried [s] and taking no focus. Their code loads the
// first time their scene shows.
const SCREENS = {
  calendar: lazy(() => import('../../../pages/Media/Calendar.jsx')),
  month: lazy(() => import('../../../pages/Media/CalendarMonth.jsx')),
  library: lazy(() => import('../../../pages/Library/Library.jsx')),
  music: lazy(() => import('../../../pages/Music/MusicLibrary.jsx')),
  books: lazy(() => import('../../../pages/Media/Books.jsx')),
}

// Each screen mounts again when one of the settings it tries changes, the way it would load again.
const TRIED = {
  calendar: ['calendarStyle', 'calendarScope'],
  month: ['calendarWeekStart', 'calendarScope'],
  library: ['libraryStyle'],
  music: ['musicLibraryStyle'],
  books: ['bookLibraryStyle'],
}
const NAV_PICK = { kind: 'navOnly' }

export default function ScreenPreview(props) {
  const page = () => {
    const p = props.pick || {}
    if (p.kind === 'calendar') return p.month ? 'month' : 'calendar'
    if (p.kind !== 'library' || !props.library) return ''
    const type = String(props.library.CollectionType || '').toLowerCase()
    return type === 'music' ? 'music' : isBookLibraryType(type) ? 'books' : 'library'
  }
  const libId = () => (props.library ? props.library.Id : '')
  const screenKey = createMemo(() => {
    const pg = page()
    if (!pg) return ''
    const s = props.s || {}
    return [pg, libId()].concat(TRIED[pg].map((key) => s[key])).join('|')
  })
  return (
    <view width={960} height={540} color={props.t.background} clipping>
      <view scale={0.5} pivot={0} width={1920} height={1080}>
        <Show when={screenKey()} keyed>
          {(k) => <Dynamic component={SCREENS[k.split('|')[0]]} preview prefs={props.s} id={libId()} />}
        </Show>
      </view>
      <view>
        <Show when={props.pick && props.pick.kind === 'calendar'}>
          <HomePreview s={props.s} items={props.items} pick={NAV_PICK} />
        </Show>
      </view>
    </view>
  )
}
