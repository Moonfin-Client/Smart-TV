import $L from '../../services/i18n.js'
import { Match, Switch, createEffect, createMemo, on, onCleanup, onMount } from 'solid-js'
import ImmersiveMusic from '../../ui/components/music/ImmersiveMusic.jsx'
import ClassicMusic from '../../ui/components/music/ClassicMusic.jsx'
import QuickAccessMusic from '../../ui/components/music/QuickAccessMusic.jsx'
import MusicCategory from '../../ui/components/music/MusicCategory.jsx'
import { goHome } from '../../ui/components/library/goHome.js'
import { textReady } from '../../ui/text.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { api } from '../../services/jellyfinApi.js'
import * as settings from '../../state/settings.js'
import { itemsOf, musicLook, musicScreenFor, filterAudioPlaylists, PLAYLIST_FIELDS, resolveSort } from './music.js'

const ROW_LIMIT = 30
const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,ImageTags,UserData,AlbumArtist,AlbumArtists,Artists,ChildCount,RecursiveItemCount'
const loadRows = async (libraryId, libraryName) => {
  const s = settings.all()
  const base = { ParentId: libraryId, Recursive: true, Limit: ROW_LIMIT, Fields: FIELDS }
  const sorted = (type) => ({ ...base, ...resolveSort(s.audioSortOption, type) })
  const none = Promise.resolve(null)
  const [latest, lastPlayed, favorites, playlists, albumArtists, artists, albums] = await Promise.all([
    s.displayAudioLatest ? api.getItems({ ...base, IncludeItemTypes: 'MusicAlbum', SortBy: 'DateCreated', SortOrder: 'Descending' }) : none,
    s.displayAudioLastPlayed ? api.getItems({ ...base, IncludeItemTypes: 'Audio', SortBy: 'DatePlayed', SortOrder: 'Descending', Filters: 'IsPlayed' }) : none,
    s.displayAudioFavorites ? api.getItems({ ...sorted('Favorites'), IncludeItemTypes: 'MusicAlbum', Filters: 'IsFavorite' }) : none,
    s.displayAudioPlaylists
      ? api.getItems({ Recursive: true, Limit: ROW_LIMIT, IncludeItemTypes: 'Playlist', Fields: PLAYLIST_FIELDS, ...resolveSort(s.audioSortOption, 'Playlist') })
      : none,
    s.displayAudioAlbumArtists ? api.getAlbumArtists(sorted('AlbumArtist')) : none,
    s.displayAudioArtists ? api.getArtists(sorted('MusicArtist')) : none,
    s.displayAudioAlbums ? api.getItems({ ...sorted('MusicAlbum'), IncludeItemTypes: 'MusicAlbum' }) : none,
  ])
  const audioPlaylists = playlists ? await filterAudioPlaylists(itemsOf(playlists)) : []
  return [
    { id: 'latestMusic', title: $L('Latest {name}').replace('{name}', libraryName || $L('Music')), items: itemsOf(latest), cardType: 'square' },
    { id: 'lastPlayed', title: $L('Last Played'), items: itemsOf(lastPlayed), cardType: 'square' },
    { id: 'favorites', title: $L('Favorites'), items: itemsOf(favorites), cardType: 'square' },
    { id: 'playlists', title: $L('Playlists'), items: audioPlaylists, cardType: 'square' },
    { id: 'albumArtists', title: $L('Album Artists'), items: itemsOf(albumArtists), cardType: 'circle' },
    { id: 'artists', title: $L('Artists'), items: itemsOf(artists), cardType: 'circle' },
    { id: 'albums', title: $L('Albums'), items: itemsOf(albums), cardType: 'square' },
  ].filter((r) => r.items.length > 0)
}

// The settings the rows are built from, so a change elsewhere reloads them.
const ROW_KEYS = ['displayAudioLatest', 'displayAudioLastPlayed', 'displayAudioFavorites', 'displayAudioPlaylists',
  'displayAudioAlbumArtists', 'displayAudioArtists', 'displayAudioAlbums', 'audioSortOption']
const rowKey = () => ROW_KEYS.map((k) => String(settings.get(k))).join('|')

// The page is kept alive, so coming back from an album lands on the screen it was left on. `preview`
// draws it in the settings preview with `prefs` as its settings, leaving focus, the nav and the
// route alone.
export default function MusicLibrary(props) {
  const store = getStore()
  const st = reactive({ library: null, rows: [], loading: true, screen: null })
  const my = { req: 0, alive: true }
  onCleanup(() => (my.alive = false))
  let child = null
  const look = createMemo(() => musicLook())
  const featured = createMemo(() => {
    const last = st.rows.find((r) => r.id === 'lastPlayed')
    return (last && last.items[0]) || (st.rows[0] && st.rows[0].items[0]) || null
  })
  const style = () => {
    const v = props.prefs ? props.prefs.musicLibraryStyle : settings.get('musicLibraryStyle')
    return v === 'classic' || v === 'quickAccess' ? v : 'immersive'
  }

  const focusChild = () => {
    if (props.preview || !child) return
    if (st.screen && child.focusIn) child.focusIn()
    else child.setFocus()
  }
  const load = async () => {
    const req = ++my.req
    st.loading = true
    try {
      await textReady()
      const lib = (store.libraries || []).find((l) => l.Id === props.id) || (await api.getItem(props.id).catch(() => null))
      if (req !== my.req || !my.alive) return
      st.library = lib || { Id: props.id }
      const rows = await loadRows(props.id, lib && lib.Name)
      if (req !== my.req || !my.alive) return
      st.rows = rows
    } catch (e) {
      console.error('[music] failed to load rows', e)
      if (req === my.req && my.alive) st.rows = []
    }
    if (req === my.req && my.alive) st.loading = false
  }
  createEffect(on(rowKey, load))

  const handlers = {
    onHome: () => goHome(),
    onSearch: () => router.to('/search'),
    onOpenGrid: (target) => {
      const screen = musicScreenFor(target)
      if (!screen) return
      st.screen = screen
      focusChild()
    },
    // A genre tile and the Songs screen's All Songs A to Z leave for the library grid instead of
    // opening a screen in place.
    onOpenGenre: (genre) => {
      if (genre) router.to(`/library/${props.id}`, { musicView: 'albums', musicGenre: genre.Name })
    },
    onOpenSongsGrid: () => router.to(`/library/${props.id}`, { musicView: 'songs' }),
    onCloseScreen: () => {
      st.screen = null
      focusChild()
    },
    // Nothing to do, since the rows already reload when their settings change.
    onSettingsChanged: () => {},
  }
  createEffect(() => {
    if (!props.preview && (!props.page || props.page.active())) store.navSection = props.id
  })
  onMount(focusChild)

  const common = {
    get library() {
      return st.library
    },
    get rows() {
      return st.rows
    },
    get featured() {
      return featured()
    },
    get loading() {
      return st.loading
    },
    get look() {
      return look()
    },
    ref: (n) => (child = n),
    ...handlers,
  }

  return (
    <view
      width={1920}
      height={1080}
      color="#0a0a0aff"
      forwardFocus={() => {
        focusChild()
        return true
      }}
      onBack={() => {
        if (st.screen) handlers.onCloseScreen()
        else router.back()
        return true
      }}
    >
      <Switch>
        <Match when={st.screen} keyed>
          {(s) => <MusicCategory screen={s} {...common} />}
        </Match>
        <Match when={style() === 'classic'}>
          <ClassicMusic {...common} />
        </Match>
        <Match when={style() === 'quickAccess'}>
          <QuickAccessMusic {...common} />
        </Match>
        <Match when={style() === 'immersive'}>
          <ImmersiveMusic {...common} />
        </Match>
      </Switch>
    </view>
  )
}
