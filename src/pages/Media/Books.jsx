import $L from '../../services/i18n.js'
import { Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import Dialog from '../../ui/components/Dialog.jsx'
import BookRail from '../../ui/components/books/BookRail.jsx'
import BookSkeleton from '../../ui/components/books/BookSkeleton.jsx'
import BookStrip from '../../ui/components/books/BookStrip.jsx'
import BookChips from '../../ui/components/books/BookChips.jsx'
import TitlesScreen from '../../ui/components/books/TitlesScreen.jsx'
import ClassicOverview from '../../ui/components/books/ClassicOverview.jsx'
import ReadingRoomOverview from '../../ui/components/books/ReadingRoomOverview.jsx'
import SeriesScreen from '../../ui/components/books/SeriesScreen.jsx'
import AuthorsScreen from '../../ui/components/books/AuthorsScreen.jsx'
import GenresScreen from '../../ui/components/books/GenresScreen.jsx'
import CollectionsScreen from '../../ui/components/books/CollectionsScreen.jsx'
import FavoritesScreen from '../../ui/components/books/FavoritesScreen.jsx'
import DiscoverScreen from '../../ui/components/books/DiscoverScreen.jsx'
import { Kept } from '../../ui/components/library/pageKit.js'
import { CHIPS_H, RAIL_WIDTH, STRIP_H } from '../../ui/components/books/bookParts.js'
import { measureReady } from '../../ui/components/books/bookText.js'
import { bookLook } from '../../ui/components/books/bookLook.js'
import { emptyBookLibrary, loadBookLibrary } from '../../ui/components/books/bookLibraryData.js'
import { OVERVIEW, ROOT_SCREEN, backTarget, bookNavFor, navEntries, navKeyFor } from '../../ui/components/books/bookScreens.js'
import { api } from '../../services/jellyfinApi.js'
import { isAudiobookItem, titlesLabel } from '../../utils/bookLibrary.js'
import { bookReader, isBookItem, supportsNewerBookFormats } from '../../utils/books.js'
import * as settings from '../../state/settings.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { openBookSeries } from '../Details/bookSeries.js'

const STYLES = ['bookstore', 'classic', 'readingRoom']

// A book library: the library read once, then the style picked in Settings. Bookstore keeps a rail
// of formats and destinations down the left with All Titles as its root, Classic a pill strip and
// Reading Room a row of chips over the screens. The library takes the whole screen, with no nav
// bar. `preview` draws it in the settings preview with `prefs` as its settings, leaving focus, the
// nav and the route alone.
export default function Books(props) {
  const store = getStore()
  const [library, setLibrary] = createSignal(null)
  const [data, setData] = createSignal(emptyBookLibrary())
  const [screen, setScreen] = createSignal(null)
  const [zone, setZone] = createSignal('screen')
  const [dialog, setDialog] = createSignal('')
  let navRef = null
  let screenRef = null
  let dialogRef = null
  let alive = true
  onCleanup(() => (alive = false))

  const prefs = () => props.prefs || settings.all()
  const look = createMemo(() => {
    prefs()
    return bookLook()
  })
  const bookStyle = createMemo(() => (STYLES.indexOf(prefs().bookLibraryStyle) >= 0 ? prefs().bookLibraryStyle : 'bookstore'))
  const showDiscover = createMemo(() => prefs().showBookDiscoverTab !== false)
  const zoom = () => prefs().cardFocusZoom !== false
  const foldersAsSeries = () => prefs().bookFoldersAsSeries === true
  // The style changed in Settings while this page was kept, so it opens on its root again.
  createEffect(on([bookStyle, showDiscover], () => setScreen(null), { defer: true }))

  const nav = () => bookNavFor(bookStyle())
  // Bookstore has no overview, so its root is All Titles. The others show their overview with no screen.
  const shown = () => (nav() === 'rail' ? screen() || ROOT_SCREEN : screen())
  const current = () => navKeyFor(bookStyle(), shown())
  const entries = createMemo(() => {
    const lib = library()
    if (!lib) return []
    const d = data()
    return navEntries({ style: bookStyle(), library: lib, data: d, showDiscover: showDiscover() }).map((entry) =>
      Object.assign({}, entry, { floor: entry.key === 'collections' && d.collectionsIsFloor }),
    )
  })
  const railW = () => (nav() === 'rail' ? RAIL_WIDTH : 0)
  const navTop = () => (nav() === 'strip' ? STRIP_H : nav() === 'chips' ? CHIPS_H : 0)
  const viewH = () => 1080 - navTop()
  const libraryName = () => (library() && library().Name) || $L('Books')
  const loading = () => data().loading
  // A screen remounts when its destination or format changes.
  const screenKey = () => {
    const s = shown()
    return s ? s.id + '-' + (s.scope || '') : ''
  }

  const focusZone = (land) => {
    if (props.preview) return false
    if (dialog() && dialogRef) {
      dialogRef.setFocus()
      return true
    }
    if (zone() === 'nav' && navRef) {
      navRef.setFocus()
      return true
    }
    if (screenRef) {
      if (land) screenRef.land()
      screenRef.setFocus()
      return true
    }
    return false
  }

  onMount(async () => {
    let lib
    try {
      lib = await api.getItem(props.id)
    } catch (e) {
      lib = { Id: props.id, Name: $L('Books'), CollectionType: 'books' }
    }
    if (!alive) return
    setLibrary(lib)
    // Layouts measure their text, so the measuring fonts have to be in first.
    const [loaded] = await Promise.all([loadBookLibrary(api, lib, untrack(foldersAsSeries)), measureReady()])
    if (!alive) return
    setData(loaded)
    if (!props.page || props.page.active()) focusZone(true)
  })
  createEffect(() => {
    if (!props.preview && (!props.page || props.page.active())) store.navSection = props.id
  })


  const openScreen = (next) => {
    setScreen(next)
    // The nav stays put across a switch, so focus stays on it. Otherwise the new screen lands.
    focusZone(true)
  }
  const host = {
    onScreenLeft: () => {
      if (nav() !== 'rail') return
      setZone('nav')
      focusZone()
    },
    // Up off the top of a screen goes to Classic's strip or Reading Room's chips.
    onScreenUp: () => {
      if (nav() === 'rail') return
      setZone('nav')
      focusZone()
    },
    // Down from the strip or the chips goes to the screen's own controls, or into it when it has none.
    onStripDown: () => {
      setZone('screen')
      if (screenRef && screenRef.landControls && screenRef.landControls()) screenRef.setFocus()
      else focusZone(true)
    },
    onStripOpen: (entry) => host.onRailOpen(entry),
    onSearch: () => router.to('/search'),
    // The Magic Remote's cursor moved onto the nav or the screen, which takes focus as it is, without
    // landing (app/pointer.js).
    pointNav: () => {
      if (zone() === 'nav' && !dialog()) return
      setZone('nav')
      focusZone()
    },
    pointScreen: () => {
      if (zone() === 'screen' && !dialog()) return
      setZone('screen')
      focusZone()
    },
    onRailRight: () => {
      setZone('screen')
      focusZone(true)
    },
    onRailOpen: (entry) => {
      if (entry.key === current()) return host.onRailRight()
      if (entry.grid) return router.to('/library/' + library().Id)
      openScreen(entry.screen)
    },
    openScreen,
    openDetails: (item) => {
      // A series named by its books has no item of its own, so it opens on its featured book.
      if (item.Type === 'BookSeries' && openBookSeries(router, item)) return
      router.to('/details/' + item.Id)
    },
    // A genre opens the titles in it, a folder opens in folder view, and everything else, a
    // collection included, opens its details.
    openItem: (item) => {
      if (item.Type === 'Genre') return router.to('/genre/' + library().Id + '/' + item.Id, { genreName: item.Name })
      if (item.Type !== 'BoxSet' && (item.IsFolder || item.Type === 'Folder' || item.Type === 'CollectionFolder')) return router.to('/library/' + item.Id)
      host.openDetails(item)
    },
    // A book opens in its reader and an audiobook plays from where it was left, or a format this
    // TV can't read gets an explanation over the screen.
    readItem: (item, queue) => {
      if (isAudiobookItem(item) || !isBookItem(item)) {
        const ticks = (item.UserData && item.UserData.PlaybackPositionTicks) || 0
        const extra = queue ? { queue: queue.map((q) => q.Id) } : {}
        return router.to('/player/' + item.Id, Object.assign({ startPositionTicks: ticks, resume: true }, extra))
      }
      const reader = bookReader(item)
      if (reader && (!reader.newer || supportsNewerBookFormats())) return router.to('/read/' + item.Id)
      setDialog(
        reader
          ? $L('{format} books need a newer TV. Read this one in Moonfin on a phone, tablet or computer.').replace('{format}', reader.ext.toUpperCase())
          : $L("This TV can't read books in this format. Read this one in Moonfin on a phone, tablet or computer."),
      )
      focusZone()
    },
  }
  const onDialog = () => {
    setDialog('')
    focusZone()
  }
  const back = () => {
    const target = backTarget(bookStyle(), shown())
    if (target === OVERVIEW) openScreen(null)
    else if (target) openScreen(target)
    else router.back()
    return true
  }

  const screenProps = (extra) => ({
    get library() {
      return library()
    },
    get data() {
      return data()
    },
    get look() {
      return look()
    },
    get viewH() {
      return viewH()
    },
    get zoom() {
      return zoom()
    },
    get railW() {
      return railW()
    },
    get top() {
      return navTop()
    },
    host,
    ref: (n) => (screenRef = n),
    ...extra,
  })
  const keep = (child) => <Kept gone={() => (screenRef = null)}>{child}</Kept>

  return (
    <view width={1920} height={1080} color={look().bg} forwardFocus={() => focusZone()} onBack={back}>
      <view>
        <Show when={loading()}>
          <BookSkeleton look={look()} />
        </Show>
      </view>
      <view>
        <Show when={!loading()}>
          <Kept gone={() => (navRef = null)}>
            <Switch>
              <Match when={nav() === 'rail'}>
                <BookRail ref={(n) => (navRef = n)} name={libraryName()} subtitle={titlesLabel(data().counts.all)} entries={entries()} current={current()} look={look()} host={host} />
              </Match>
              <Match when={nav() === 'strip'}>
                <BookStrip ref={(n) => (navRef = n)} name={libraryName()} entries={entries()} current={current()} look={look()} host={host} />
              </Match>
              <Match when={nav() === 'chips'}>
                <BookChips ref={(n) => (navRef = n)} entries={entries()} current={current()} look={look()} host={host} />
              </Match>
            </Switch>
          </Kept>
        </Show>
      </view>
      <view x={railW()} y={navTop()} width={1920 - railW()} height={viewH()}>
        <Show when={!loading()}>
          <Switch>
            <Match when={!shown() && nav() === 'strip'}>
              {keep(<ClassicOverview {...screenProps({ foldersAsSeries: foldersAsSeries() })} />)}
            </Match>
            <Match when={!shown() && nav() === 'chips'}>{keep(<ReadingRoomOverview {...screenProps({})} />)}</Match>
            <Match when={screenKey()} keyed>
              {(k) => {
                const s = untrack(shown)
                const p = screenProps({ scope: s.scope, sort: s.sort, bookStyle: untrack(bookStyle) })
                if (s.id === 'titles') return keep(<TitlesScreen {...p} />)
                if (s.id === 'series') return keep(<SeriesScreen {...p} />)
                if (s.id === 'authors') return keep(<AuthorsScreen {...p} />)
                if (s.id === 'genres') return keep(<GenresScreen {...p} />)
                if (s.id === 'collections') return keep(<CollectionsScreen {...p} />)
                if (s.id === 'favorites') return keep(<FavoritesScreen {...p} />)
                if (s.id === 'discover') return keep(<DiscoverScreen {...p} />)
                return null
              }}
            </Match>
          </Switch>
        </Show>
      </view>
      <view>
        <Show when={dialog()}>
          <Kept gone={() => (dialogRef = null)}>
            <Dialog ref={(n) => (dialogRef = n)} variant="message" title={$L("This book can't be read here")} message={dialog()} buttons={[{ id: 'ok', label: $L('OK'), primary: true }]} onDialog={onDialog} />
          </Kept>
        </Show>
      </view>
    </view>
  )
}
