import $L from '../../../services/i18n.js'
import { Match, Show, Switch, batch, createSignal, onCleanup, untrack } from 'solid-js'
import OptionSheet from './OptionSheet.jsx'
import PanelDialog, { layoutPanelDialog } from './PanelDialog.jsx'
import ItemMenu from './ItemMenu.jsx'
import ArtworkModal from './ArtworkModal.jsx'
import IdentifyModal from './IdentifyModal.jsx'
import SeerrSheets from './SeerrSheets.jsx'
import SubtitleSearch from './SubtitleSearch.jsx'
import TrailerPicker from './TrailerPicker.jsx'
import ReviewDialog from './ReviewDialog.jsx'
import OverflowMenu from './OverflowMenu.jsx'
import Keyboard from '../Keyboard.jsx'
import { OverNav } from '../../layers.jsx'
import { openNativeInput, usesNativeKeyboard } from '../account/nativeInput.js'
import { pollForSubtitleAppearance, remoteSubtitleNotAppearedMessage, subtitleDownloadLanguages, toSubtitleLanguage } from './remoteSubtitleUtils.js'
import { itemMenuActions, MEDIA_TYPES } from './itemMenuActions.js'
import { api, getServerType, getServerUrl, getUserId } from '../../../services/jellyfinApi.js'
import * as seerrApi from '../../../services/seerrApi.js'
import {
  canonicalServerKey,
  getCachedCollectionsContaining,
  getCachedPlaylistsContaining,
  getCollectionsContaining,
  getPlaylistsContaining,
  isExternalItem,
  notifyItemAddedToCollection,
  notifyItemAddedToPlaylist,
  notifyItemRemovedFromCollection,
  notifyItemRemovedFromPlaylist,
} from '../../../services/itemMembershipService.js'
import { saveAudioPref, saveSubtitlePref } from '../../../services/subtitlePrefs.js'
import { fromServerStream } from '../../../utils/seriesTrackPrefs.js'
import { audioTrackDetail, isExternalSubtitleStream, numberedTrackName, subtitleTrackDetail } from '../../../utils/trackLabels.js'
import { clampRating, clearedRatingPatch, displayRatingLikes, numericRatingPatch, personalRatingOf, starsFromRating, thumbRatingPatch } from '../../../utils/personalRating.js'
import { playedFilterOptions, playlistSortOptions, PLAYLIST_SORT_RANDOM, SORT_DIR_ASC, SORT_DIR_DESC } from '../../../utils/playlistSortFilter.js'
import { getStore, toast } from '../../../state/store.js'
import * as settings from '../../../state/settings.js'
import { parseHiddenMap } from '../../../state/homeRows.js'
import { router } from '../../../app/router.js'
import { collectionSortOptions } from '../../../pages/Details/nouveau/nouveauCollectionSort.js'
import { TRANSCODE_QUALITIES } from '../../../pages/Details/detailsMedia.js'
import { fetchItem, loadTrailerChoices } from '../../../pages/Details/load.js'

// Every dialog the details screen opens. Only the open one is mounted. The page calls open*() on
// the handle this gives `ref` and hears back through `page` (onTracksPicked, onSubtitleAdded,
// onRated, onDeleted, onMoreAction, onItemRefreshed, onSeerrRefresh, onModalClosed and others).
const describeError = (err) => {
  const status = err && err.status
  if (status === 401) return 'Unauthorized'
  if (status === 403) return 'Forbidden'
  if (status === 404) return 'Not found'
  if (status) return `HTTP ${status}`
  return (err && err.message) || 'HTTP error'
}
// Emby, Plex and Silo take an item off resume and keep its progress. Jellyfin can only clear the
// play state, and audio is always cleared.
const hideFromResume = (a, item, serverType) => {
  const audio = item.Type === 'Audio' || item.Type === 'AudioBook' || item.MediaType === 'Audio'
  if (serverType === 'silo') return a.hideFromResume(item.Id, item).catch(() => {})
  if ((serverType === 'emby' || serverType === 'plex') && !audio) return a.hideFromResume(item.Id).catch(() => {})
  return a.setWatched(item.Id, false).catch(() => {})
}
const hideFromNextUp = (a, item, serverType) => (serverType === 'silo' ? a.hideFromNextUp(item).catch(() => {}) : hideFromResume(a, item, serverType))
// The card menu, Seerr's sheets, the trailer picker, a review and Genres and Tags draw over the
// nav. The other dialogs sit in the details page's own layer, under it.
const OVER_NAV = { menu: true, seerr: true, trailers: true }
// A Seerr card stands for a title the server doesn't hold, so the menu has nothing for it.
const fromSeerr = (item) => Boolean(item._seerr || item._seerrRaw || item._seerrCredit) || String(item.Id || '').indexOf('seerr-') === 0
const streamsOf = (ms, type) => ((ms && ms.MediaStreams) || []).filter((s) => s.Type === type)

export default function DetailModals(props) {
  const [mode, setMode] = createSignal('')
  const [over, setOver] = createSignal(false)
  const [sheet, setSheet] = createSignal(null)
  const [dialog, setDialog] = createSignal(null)
  const [menu, setMenu] = createSignal(null)
  // What a dialog with a component of its own opens on: the item, the trailer choices, the search.
  const [args, setArgs] = createSignal(null)
  // The in-app keyboard over a dialog's name field, built only while it types.
  const [kbOn, setKbOn] = createSignal(false)
  // Whether a held OK opened the sheet or menu, which drops that hold's repeats and release.
  const [held, setHeld] = createSignal(false)
  const p = props.page
  const h = {}
  let active = null
  let kb = null
  let onPick = null
  let onAdjust = null
  let onBack = null
  let menuOpen = null
  let removeGen = 0
  let removing = false
  let naming = null
  let subCtx = null
  let alive = true
  onCleanup(() => (alive = false))

  const focusActive = () => {
    if (active && active.setFocus) active.setFocus()
  }
  const raise = (m, a, overNav) => {
    batch(() => {
      if (a !== undefined) setArgs(a)
      setOver(Boolean(OVER_NAV[m] || overNav))
      setMode(m)
    })
    focusActive()
  }
  const show = (m, data) => {
    onPick = data.onPick
    onAdjust = data.onAdjust || null
    onBack = data.onBack || null
    batch(() => {
      setHeld(Boolean(data.held))
      setMenu(m === 'menu' ? data.menu : null)
      setSheet(m === 'sheet' ? data.sheet : null)
      setDialog(m !== 'menu' && m !== 'sheet' ? data.dialog : null)
    })
    raise(m, undefined, data.overNav)
  }
  const close = () => {
    if (!untrack(mode)) return
    batch(() => {
      setMode('')
      setArgs(null)
    })
    active = null
    onPick = null
    if (p && p.onModalClosed) p.onModalClosed()
  }
  const ref = (n) => (active = n)

  // The card menu, from a long press on a card or row. `ctx` says what the page lets this card
  // do. The playlists and collections holding the item come from the cache at once and from the
  // server a moment later, which can add the remove entries while the menu is up. The hold that
  // opened it is still down, so its repeats and release don't pick from it.
  h.openItemMenu = (item, ctx) => {
    if (fromSeerr(item)) return false
    const store = getStore()
    const user = store && store.user
    const serverUrl = getServerUrl()
    const mctx = { serverUrl, userId: getUserId() }
    const type = getServerType()
    const sameServer = !item._serverUrl || item._serverUrl === serverUrl
    const canManageCollections =
      !((type === 'jellyfin' || type === 'plex') && sameServer) || Boolean(user && user.Policy && (user.Policy.EnableCollectionManagement || user.Policy.IsAdministrator))
    const m = { item, ctx, playlists: getCachedPlaylistsContaining(item, mctx), collections: getCachedCollectionsContaining(item, mctx) }
    const actionsOf = () =>
      itemMenuActions(item, {
        isAdmin: ctx.isAdmin,
        isJellyfin: (item._serverType || type) === 'jellyfin',
        isSilo: (item._serverType || type) === 'silo' && sameServer,
        canManageCollections,
        inCollection: Boolean(ctx.collection),
        playlist: ctx.playlist || null,
        playlistMemberships: m.playlists,
        collectionMemberships: m.collections,
        isContinueWatchingOrNextUp: Boolean(ctx.isContinueWatchingOrNextUp),
        playImmediately: Boolean(ctx.playImmediately),
      })
    const actions = actionsOf()
    if (!actions.length) return false
    menuOpen = m
    const refresh = (patch) => {
      if (!alive || menuOpen !== m || untrack(mode) !== 'menu') return
      Object.assign(m, patch)
      const list = active
      const at = list && list.rows()[list.cur()]
      setMenu({ title: item.Name || '', actions: actionsOf() })
      const i = at ? list.rows().findIndex((r) => r.id === at.id) : -1
      if (i >= 0) list.setCur(i)
    }
    if (!isExternalItem(item) && MEDIA_TYPES.indexOf(item.Type) >= 0) {
      getPlaylistsContaining(item, api, mctx)
        .then((playlists) => refresh({ playlists }))
        .catch(() => {})
      getCollectionsContaining(item, api, { ...mctx, canManageCollections })
        .then((collections) => refresh({ collections }))
        .catch(() => {})
    }
    show('menu', {
      held: ctx.held !== false,
      menu: { title: item.Name || '', actions },
      onPick: (id) => {
        menuOpen = null
        close()
        runMenuAction(id, item, ctx, m)
      },
    })
    return true
  }
  const runMenuAction = async (id, item, ctx, m) => {
    const ud = item.UserData || {}
    const s = settings.all()
    const hide = (stored, key) => JSON.stringify({ ...parseHiddenMap(stored), [key]: new Date().toISOString() })
    try {
      if (id === 'play') p.playCard(item)
      else if (id === 'viewDetails') p.open(item)
      else if (id === 'watched') await api.setWatched(item.Id, !ud.Played)
      else if (id === 'favorite') await api.setFavorite(item.Id, !ud.IsFavorite)
      else if (id === 'hideContinueWatching') {
        settings.set('hiddenContinueWatchingItems', hide(s.hiddenContinueWatchingItems, item.SeriesId || item.Id))
        await hideFromResume(api, item, item._serverType || getServerType())
      } else if (id === 'hideNextUp') {
        settings.update({
          hiddenNextUpSeries: hide(s.hiddenNextUpSeries, item.SeriesId),
          hiddenContinueWatchingItems: hide(s.hiddenContinueWatchingItems, item.SeriesId),
        })
        await hideFromNextUp(api, item, item._serverType || getServerType())
      } else if (id === 'addToCollection') h.openAddTo('collection', item)
      else if (id === 'addToPlaylist') h.openAddTo('playlist', item)
      else if (id === 'removeFromCollection') {
        if (ctx.collection) confirmCollectionRemoval(item, ctx.collection)
        else openRemoveFrom('collection', item, m.collections)
      } else if (id === 'removeFromPlaylist') await p.removeCard(item)
      else if (id === 'removeFromPlaylistPicker') openRemoveFrom('playlist', item, m.playlists)
      else if (id === 'moveUp' || id === 'moveDown') await p.moveCard(item, id === 'moveUp' ? -1 : 1)
      else if (id === 'refreshMetadata') {
        try {
          await api.refreshItem(item.Id)
          toast($L('Metadata refresh requested'))
        } catch (e) {
          toast($L('Failed to refresh metadata: {error}').replace('{error}', describeError(e)))
        }
      } else if (id === 'identify') {
        // Identify matches a whole show, so an episode or a season hands over its series.
        const tvChild = (item.Type === 'Episode' || item.Type === 'Season') && item.SeriesId
        h.openIdentify(tvChild ? { Id: item.SeriesId, Type: 'Series', Name: item.SeriesName, ProductionYear: null } : item)
      } else if (id === 'changeArtwork') h.openArtwork(item)
      else if (id === 'goToSeries') router.to(`/details/${item.SeriesId}`)
    } catch (e) {
      toast($L('Action failed: {err}').replace('{err}', (e && e.message) || ''))
    }
  }
  // The menu's own confirmation for a title leaving the collection whose page it's on.
  const confirmCollectionRemoval = (item, collection) => {
    show('menu', {
      menu: {
        kind: 'confirm',
        title: $L('Remove from Collection'),
        message: $L('Remove {item} from {collection}? The item stays in your library.').replace('{item}', item.Name || '').replace('{collection}', collection.Name || ''),
        buttons: [{ id: 'cancel', label: $L('Cancel') }, { id: 'remove', label: $L('Remove'), strong: true }],
      },
      onPick: async (id) => {
        close()
        if (id !== 'remove') return
        try {
          await p.removeCard(item)
          notifyItemRemovedFromCollection(canonicalServerKey(item, { serverUrl: getServerUrl(), userId: getUserId() }), collection.Id, item.Id)
        } catch (e) {
          toast(`${$L('Failed to remove from collection')}: ${describeError(e)}`)
        }
      },
    })
  }
  // Remove from Playlist or Collection: pick the list, then confirm. The playlists are asked for
  // again as the picker opens, since the menu's may be stale.
  const openRemoveFrom = async (kind, item, known) => {
    const playlist = kind === 'playlist'
    const title = playlist ? $L('Remove from Playlist') : $L('Remove from Collection')
    const mctx = { serverUrl: getServerUrl(), userId: getUserId() }
    const gen = ++removeGen
    const cancel = { id: 'cancel', label: $L('Cancel') }
    const pickList = (lists, loading) => {
      const empty = !loading && !lists.length
      show('dialog', {
        dialog:
          loading || empty
            ? {
                kind: 'list', form: 'message', title, buttons: [cancel], rows: [],
                message: loading ? $L('Loading playlists…') : playlist ? $L('No playlists found') : $L('No collections found'),
              }
            : {
                kind: 'list', title,
                rows: lists.map((l) => ({ id: playlist ? `${l.playlistId}:${l.entryId}` : l.collectionId, icon: 'menu_playlistRemove', label: playlist ? l.playlistName : l.collectionName })),
              },
        onPick: (id) => {
          if (id === 'cancel') return close()
          const match = lists.find((l) => (playlist ? `${l.playlistId}:${l.entryId}` : l.collectionId) === id)
          if (match) confirm(match, lists)
        },
      })
    }
    const confirm = (match, lists) => {
      const listName = playlist ? match.playlistName : match.collectionName
      show('dialog', {
        dialog: {
          kind: 'list', form: 'confirm', title, initial: 'remove', rows: [],
          message: (playlist ? $L('Remove {item} from {playlist}? The item stays in your library.') : $L('Remove {item} from {collection}? The item stays in your library.'))
            .replace('{item}', item.Name || '')
            .replace(playlist ? '{playlist}' : '{collection}', listName || ''),
          buttons: [cancel, { id: 'remove', label: $L('Remove'), primary: true }],
        },
        onBack: () => {
          if (!removing) pickList(lists, false)
        },
        onPick: async (id) => {
          if (id === 'cancel') return pickList(lists, false)
          if (removing) return
          removing = true
          try {
            const key = canonicalServerKey(item, mctx)
            if (playlist) {
              await api.removeFromPlaylist(match.playlistId, [match.entryId])
              notifyItemRemovedFromPlaylist(key, match.playlistId, item.Id)
              toast($L('Removed from {playlist}').replace('{playlist}', match.playlistName))
            } else {
              await api.removeFromCollection(match.collectionId, [item.Id])
              notifyItemRemovedFromCollection(key, match.collectionId, item.Id)
              toast($L('Removed from {collection}').replace('{collection}', match.collectionName))
            }
            close()
          } catch (e) {
            toast(playlist ? $L('Failed to remove from playlist') : $L('Failed to remove from collection'))
          } finally {
            removing = false
          }
        },
      })
    }
    if (!playlist) return pickList(known || [], false)
    pickList([], true)
    let fresh = known || []
    try {
      fresh = await getPlaylistsContaining(item, api, mctx)
    } catch (e) {
      fresh = known || []
    }
    if (alive && gen === removeGen && untrack(mode) === 'dialog') pickList(fresh, false)
  }

  h.openTracks = (kind, ctx) => {
    const it = ctx.item
    const tr = ctx.tracks
    const ms = (it.MediaSources || [])[tr.version] || (it.MediaSources || [])[0]
    const cancel = [{ divider: true }, { id: 'cancel', label: $L('Cancel'), dimmed: true }]
    let sh
    if (kind === 'version') {
      sh = {
        variant: 'track',
        title: $L('Select Version'),
        items: it.MediaSources.map((src, i) => {
          const video = streamsOf(src, 'Video')[0]
          const w = video && video.Width
          const res = w >= 3800 ? '4K' : w >= 1900 ? '1080p' : w >= 1260 ? '720p' : w ? `${w}p` : ''
          const rate = src.Bitrate ? `${(src.Bitrate / 1000000).toFixed(1)} Mbps` : ''
          return {
            id: String(i), label: src.Name || `${$L('Version')} ${i + 1}`,
            detail: [res, (src.Container || '').toUpperCase(), rate].filter(Boolean).join(' · '), selected: i === tr.version,
          }
        }).concat(cancel),
      }
    } else if (kind === 'audio') {
      sh = {
        variant: 'track',
        title: $L('Audio Track'),
        items: streamsOf(ms, 'Audio')
          .map((s, i) => ({
            id: String(i),
            label: numberedTrackName(i + 1, s.DisplayTitle || s.Title || s.Language, $L('Audio')),
            detail: audioTrackDetail({ language: s.Language, displayTitle: s.DisplayTitle, codec: s.Codec, channels: s.Channels }),
            selected: i === tr.audio,
          }))
          .concat(cancel),
      }
    } else if (kind === 'advanced') {
      sh = {
        variant: 'track',
        title: $L('Advanced Playback'),
        items: TRANSCODE_QUALITIES.map((q, i) => ({ id: String(q.bitrate), label: `${$L('Transcode Stream')}: ${q.label()}`, selected: i === 0 })).concat(cancel),
      }
    } else {
      const subs = streamsOf(ms, 'Subtitle').map((stream, position) => ({ stream, position }))
      const inside = subs.filter((e) => !isExternalSubtitleStream(e.stream))
      const outside = subs.filter((e) => isExternalSubtitleStream(e.stream))
      const ordered = ctx.preferExternal ? outside.concat(inside) : inside.concat(outside)
      sh = {
        variant: 'track',
        title: $L('Subtitle Track'),
        items: [{ id: '-1', label: $L('None'), selected: tr.subtitle === -1 }]
          .concat(
            ordered.map(({ stream: s, position }, i) => ({
              id: String(position),
              label: numberedTrackName(i + 1, s.DisplayTitle || s.Title || s.Language, $L('Subtitle')),
              detail: subtitleTrackDetail({
                name: s.DisplayTitle || s.Title || s.Language, codec: s.Codec, language: s.Language, isExternal: s.IsExternal,
                deliveryMethod: s.DeliveryMethod, isForced: s.IsForced, isHearingImpaired: s.IsHearingImpaired,
              }),
              selected: position === tr.subtitle,
            })),
          )
          .concat([{ divider: true }, { id: 'download', label: $L('Download subtitles...'), detail: $L('Search using OpenSubtitles') }], cancel),
      }
    }
    show('sheet', {
      // Advanced Playback opens from a held Play.
      held: kind === 'advanced',
      sheet: sh,
      onPick: (id) => {
        if (id === 'cancel') return close()
        if (id === 'download') return openSubtitleSearch(it, tr)
        if (kind === 'advanced') {
          close()
          return p.onAdvancedPick(Number(id))
        }
        const i = Number(id)
        const audios = streamsOf(ms, 'Audio')
        const subStreams = streamsOf(ms, 'Subtitle')
        if (kind === 'audio' && audios[i]) saveAudioPref(it, audios[i].Index, audios.map(fromServerStream)).catch(() => {})
        if (kind === 'subtitles') saveSubtitlePref(it, subStreams[i] ? subStreams[i].Index : -1, subStreams.map(fromServerStream)).catch(() => {})
        close()
        p.onTracksPicked(kind === 'subtitles' ? 'subtitle' : kind, i)
      },
    })
  }

  // Download Subtitles searches in the languages picked in settings, or else in a guess from the
  // tracks picked here.
  const openSubtitleSearch = (item, tracks) => {
    const ms = (item.MediaSources || [])[tracks.version] || (item.MediaSources || [])[0]
    const subs = streamsOf(ms, 'Subtitle')
    const audios = streamsOf(ms, 'Audio')
    const cur = tracks.subtitle >= 0 ? subs[tracks.subtitle] : null
    const s = settings.all()
    const languages = subtitleDownloadLanguages(
      s.subtitleDownloadLanguages,
      toSubtitleLanguage(s.subtitleLanguage, cur && cur.Language, audios[tracks.audio] && audios[tracks.audio].Language, subs[0] && subs[0].Language),
    )
    subCtx = { item, version: tracks.version }
    raise('subsearch', { itemId: item.Id, languages })
  }
  // The server saves the file and only then lists it, so the new track is waited for.
  const onRemoteSubtitlePick = async (result) => {
    const { item, version } = subCtx
    const subsOf = (it) => streamsOf((it.MediaSources || [])[version] || (it.MediaSources || [])[0], 'Subtitle')
    const old = subsOf(item).map((x) => x.Index)
    await api.downloadRemoteSubtitle(item.Id, result.id)
    const appeared = await pollForSubtitleAppearance(async () => {
      const position = subsOf((await api.getItemMediaInfo(item.Id)) || {}).findIndex((x) => old.indexOf(x.Index) < 0)
      return position >= 0 ? { position } : null
    })
    if (!appeared) return remoteSubtitleNotAppearedMessage()
    const fresh = await fetchItem(item.Id)
    close()
    p.onSubtitleAdded(fresh, appeared.position)
    return null
  }

  // The server's trailers first, then YouTube's. One plays straight away, more open TrailerPicker.
  h.openTrailer = async (item) => {
    const choices = await loadTrailerChoices(item).catch(() => [])
    if (!alive) return
    if (!choices.length) {
      toast($L('This item could not be played.'))
      return
    }
    if (choices.length === 1) return p.playTrailerChoice(choices[0])
    raise('trailers', { choices, item })
  }

  // Rate: thumbs, half stars or a score out of ten, all saved to the same score.
  h.openRating = (item, style) => {
    const ud = item.UserData || {}
    const draft = { v: clampRating(personalRatingOf(ud) == null ? 0 : personalRatingOf(ud)) }
    const spec = () => {
      const base = {
        kind: 'rating', title: $L('Rate'), style, likes: displayRatingLikes(ud), stars: starsFromRating(draft.v),
        scoreLabel: $L('{rating} / 10').replace('{rating}', draft.v), hint: $L('{rating} / 5').replace('{rating}', starsFromRating(draft.v)),
      }
      const buttons = [{ id: 'cancel', label: $L('Cancel') }]
      if (style !== 'thumbs') buttons.push({ id: 'save', label: $L('Save') })
      if (personalRatingOf(ud) !== null || displayRatingLikes(ud) !== null) buttons.push({ id: 'clear', label: $L('Clear rating') })
      return { ...base, buttons, initial: style === 'thumbs' ? 'like' : style === 'stars' ? 'stars' : 'up' }
    }
    const save = async (patch, call) => {
      close()
      p.onRated(patch)
      try {
        await call()
      } catch (e) {
        p.onRated(ud)
        toast($L('Could not save rating'))
      }
    }
    show('dialog', {
      dialog: spec(),
      onAdjust: (d) => {
        draft.v = clampRating(draft.v + d * 0.5)
        setDialog({ ...spec(), initial: 'stars' })
      },
      onPick: (id) => {
        if (id === 'cancel') return close()
        if (id === 'like' || id === 'dislike') return save(thumbRatingPatch(id === 'like'), () => api.setRating(item.Id, id === 'like'))
        if (id === 'clear') return save(clearedRatingPatch(), () => api.clearRating(item.Id))
        if (id === 'down' || id === 'up') {
          draft.v = clampRating(id === 'up' ? Math.floor(draft.v) + 1 : Math.ceil(draft.v) - 1)
          setDialog({ ...spec(), initial: id })
          return
        }
        if (id === 'save') return save(numericRatingPatch(draft.v), () => api.setNumericRating(item.Id, draft.v))
      },
    })
  }

  h.openAddTo = async (kind, item) => {
    const playlist = kind === 'playlist'
    const title = playlist ? $L('Add to Playlist') : $L('Add to Collection')
    const create = { id: '#new', icon: 'rating_add', label: playlist ? $L('Create New Playlist') : $L('Create New Collection') }
    show('dialog', { dialog: { kind: 'list', title, message: playlist ? $L('Loading playlists…') : $L('Loading collections...'), rows: [] }, onPick: () => {} })
    let lists = []
    try {
      const res = playlist ? await api.getPlaylists() : await api.getCollections(200, 'SortName', 'Ascending')
      lists = (res && res.Items) || []
    } catch (e) {
      lists = []
    }
    if (!alive || untrack(mode) !== 'dialog') return
    const rows = [create].concat(
      lists.map((x) => ({
        id: x.Id, icon: playlist ? 'playlist' : 'collection', label: x.Name || '',
        detail: x.ChildCount != null ? $L('{count} items').replace('{count}', x.ChildCount) : '',
      })),
    )
    const showList = () =>
      show('dialog', {
        dialog: { kind: 'list', title, message: lists.length ? '' : playlist ? $L('No playlists found') : $L('No collections found'), rows },
        onPick: (id) => (id === '#new' ? showCreate() : addTo(kind, item, id)),
      })
    // Create New swaps the list for the name field, Create and Cancel.
    const showCreate = () => {
      let value = ''
      const spec = () => ({
        kind: 'list', form: 'create', initial: 'input', value,
        title: playlist ? $L('New Playlist') : $L('New Collection'),
        placeholder: playlist ? $L('Playlist name') : $L('Collection name'),
        buttons: [{ id: 'create', label: $L('Create'), primary: true, disabled: !value.trim() }, { id: 'cancel', label: $L('Cancel') }],
      })
      const submit = () => value.trim() && addTo(kind, item, null, value.trim())
      show('dialog', {
        dialog: spec(),
        onBack: showList,
        onPick: (id) => {
          if (id === 'cancel') return showList()
          if (id === 'create') return submit()
          if (id !== 'input') return
          typeName(
            spec(),
            (text) => {
              value = String(text || '')
              setDialog(spec())
            },
            (submitted) => submitted && submit(),
          )
        },
      })
    }
    showList()
  }
  // The name field types on the TV's own keyboard when Keyboard Style is Native and on the in-app
  // one otherwise. Done on either one creates the list.
  const typeName = (spec, onText, onDone) => {
    let text = spec.value
    if (usesNativeKeyboard()) {
      const L = layoutPanelDialog(spec)
      const f = L.focusables.find((x) => x.id === 'input')
      openNativeInput({
        value: text,
        maxLength: 100,
        rect: { x: L.x + f.x, y: L.y + f.y, w: f.w, h: f.h },
        onChange: (t) => {
          text = t
          onText(t)
        },
        onClose: (submitted) => onDone(submitted),
      })
      return
    }
    naming = { onText, onDone }
    setKbOn(true)
    if (kb) {
      kb.open({ value: text, purpose: 'text', maxLength: 100 })
      kb.setFocus()
    }
  }
  const onKeyboardClose = (submitted) => {
    const n = naming
    naming = null
    setKbOn(false)
    focusActive()
    if (n) n.onDone(submitted)
  }
  const addTo = async (kind, item, listId, newName) => {
    const playlist = kind === 'playlist'
    const serverKey = canonicalServerKey(item, { serverUrl: getServerUrl(), userId: getUserId() })
    close()
    try {
      if (newName) await (playlist ? api.createPlaylist(newName, [item.Id]) : api.createCollection(newName, [item.Id]))
      else await (playlist ? api.addToPlaylist(listId, [item.Id]) : api.addToCollection(listId, [item.Id]))
    } catch (e) {
      toast($L('Action failed: {err}').replace('{err}', (e && e.message) || ''))
      return
    }
    if (playlist) notifyItemAddedToPlaylist(serverKey)
    else notifyItemAddedToCollection(serverKey, newName ? undefined : listId, [item.Id])
    toast(newName ? $L('Created "{name}" and added item').replace('{name}', newName) : playlist ? $L('Added to playlist') : $L('Added to collection'))
  }

  h.openDelete = (item) => {
    const n = item.Name || ''
    show('dialog', {
      dialog: {
        kind: 'confirm', title: $L('Delete Item?'), initial: 'cancel', toggle: true,
        message: n ? $L('Are you sure you want to permanently delete "{itemName}"?').replace('{itemName}', n) : $L('Are you sure you want to permanently delete this item?'),
        buttons: [{ id: 'cancel', label: $L('Cancel') }, { id: 'delete', label: $L('Delete'), danger: true }],
      },
      onPick: async (id) => {
        close()
        if (id !== 'delete') return
        try {
          await api.deleteItem(item.Id)
          p.onDeleted()
        } catch (e) {
          toast($L('Failed to delete item'))
        }
      },
    })
  }

  h.openArtwork = (item) => raise('artwork', { item })
  h.openIdentify = (item) => raise('identify', { item })

  // The buttons a capped row folds behind More Actions.
  h.openMore = (buttons, frame) => raise('more', { buttons: buttons || [], frame })

  // The watchlist toggles here. Request, cancel, report, manage and swap open SeerrSheets.
  h.openSeerr = async (id, seerr, item, season) => {
    if (id === 'seerrWatchlist') {
      const on = !seerr.onWatchlist
      try {
        if (on) await seerrApi.addToWatchlist(seerr.mediaId, seerr.mediaType)
        else await seerrApi.removeFromWatchlist(seerr.mediaId, seerr.mediaType)
        p.onSeerrWatchlist(on)
      } catch (e) {
        toast($L('Action failed: {err}').replace('{err}', (e && e.message) || ''))
      }
      return
    }
    raise('seerr', { action: id, seerr, item, season })
  }

  // Seerr's genres, networks and tags, as rows under their headings.
  h.openSeerrTags = (details, mediaType, pick) => {
    const items = []
    const section = (title, list, kind) => {
      if (!list || !list.length) return
      if (items.length) items.push({ divider: true })
      items.push({ header: title })
      list.forEach((e) => items.push({ id: `${kind}:${e.id}`, label: e.name || '' }))
    }
    section($L('Genres'), details.genres, 'genre')
    section($L('Networks'), details.networks, 'network')
    section($L('Tags'), details.keywords, 'keyword')
    show('sheet', {
      overNav: true,
      sheet: { variant: 'panel', title: $L('Genres and Tags'), items },
      onPick: (id) => {
        close()
        pick(id)
      },
    })
  }

  h.openReview = (review) => raise('review', { review }, true)

  // A person's Display Options: how their credits sort, and whether one title's roles group.
  h.openPersonDisplay = () => {
    const build = () => {
      const s = settings.all()
      const on = s.personPageSortOption || 'alphabetical'
      return {
        variant: 'sort',
        title: $L('Display Options'),
        items: [{ header: $L('Sort By') }]
          .concat(
            [
              ['alphabetical', $L('Alphabetical')],
              ['releaseDateAsc', $L('Release Date (Ascending)')],
              ['releaseDateDesc', $L('Release Date (Descending)')],
            ].map(([id, label]) => ({ id, label, selected: id === on })),
          )
          .concat([{ divider: true }, { header: $L('Group Contributions') }, { id: 'group', label: $L('Group multiple roles'), selected: Boolean(s.personPageGroupItems) }]),
      }
    }
    show('sheet', {
      sheet: build(),
      onPick: (id) => {
        if (id === 'group') settings.set('personPageGroupItems', !settings.all().personPageGroupItems)
        else settings.set('personPageSortOption', id)
        const cur = active ? active.cur() : 0
        setSheet(build())
        if (active) active.setCur(cur)
        p.onSettingsChanged()
      },
    })
  }

  h.openCollectionSort = (current, choose) => {
    show('sheet', {
      sheet: { variant: 'sort', title: $L('Playlist Sort Options'), items: collectionSortOptions().map((o) => ({ id: o.id, label: o.label, selected: o.id === current })) },
      onPick: (id) => {
        close()
        choose(id)
      },
    })
  }

  // The playlist sort: the order, then the field. Picking a field closes it, the order doesn't.
  h.openPlaylistSort = (state, onChange) => {
    const build = () => {
      const items = []
      if (state.sortBy !== PLAYLIST_SORT_RANDOM) {
        items.push({ header: $L('Order') })
        items.push({ id: `dir:${SORT_DIR_ASC}`, label: $L('Ascending'), selected: state.sortDirection === SORT_DIR_ASC })
        items.push({ id: `dir:${SORT_DIR_DESC}`, label: $L('Descending'), selected: state.sortDirection === SORT_DIR_DESC })
        items.push({ divider: true })
      }
      items.push({ header: $L('Field') })
      playlistSortOptions().forEach((o) => items.push({ id: `sort:${o.id}`, label: o.label, selected: o.id === state.sortBy }))
      // The playlist page's layer starts 16px down, and its dialogs center in what's left.
      return { variant: 'panel', title: $L('Sort By'), items, top: 16 }
    }
    show('sheet', {
      sheet: build(),
      onPick: (id) => {
        const [what, value] = id.split(':')
        if (what === 'dir') {
          state.sortDirection = value
          onChange({ sortBy: state.sortBy, sortDirection: value })
          setSheet(build())
          return
        }
        state.sortBy = value
        onChange({ sortBy: value, sortDirection: state.sortDirection })
        close()
      },
    })
  }

  // The playlist filter: favorites, watched state and, with more than one kind, media type.
  h.openPlaylistFilter = (state, types, onChange) => {
    const build = () => {
      const items = [{ header: $L('Favorites') }, { id: 'fav', label: $L('Favorites Only'), selected: state.favoriteOnly }, { divider: true }, { header: $L('Status') }]
      playedFilterOptions().forEach((c) => items.push({ id: `played:${c.id}`, label: c.label, selected: state.playedFilter === c.id }))
      if (types.length > 1) {
        items.push({ divider: true }, { header: $L('Media Type') }, { id: 'type:all', label: $L('All Types'), selected: !state.mediaTypeFilter || state.mediaTypeFilter === 'all' })
        types.forEach((ty) => items.push({ id: `type:${ty}`, label: ty === 'Audio' ? $L('Audio') : ty === 'Video' ? $L('Video') : ty, selected: state.mediaTypeFilter === ty }))
      }
      return { variant: 'panel', title: $L('Filter Tracks'), items, top: 16 }
    }
    show('sheet', {
      sheet: build(),
      onPick: (id) => {
        const [what, value] = id.split(':')
        if (what === 'fav') state.favoriteOnly = !state.favoriteOnly
        else if (what === 'played') state.playedFilter = value
        else if (what === 'type') state.mediaTypeFilter = value
        onChange({ playedFilter: state.playedFilter, favoriteOnly: state.favoriteOnly, mediaTypeFilter: state.mediaTypeFilter })
        const cur = active ? active.cur() : 0
        setSheet(build())
        if (active) active.setCur(cur)
      },
    })
  }

  h.close = close
  h.mode = mode
  if (props.ref) props.ref(h)

  const a = () => args() || {}
  const body = () => (
    <Switch>
      <Match when={mode() === 'sheet'}>
        <OptionSheet ref={ref} sheet={sheet()} held={held()} tokens={props.tokens} onSheetPick={(id) => onPick && onPick(id)} onSheetClose={close} />
      </Match>
      <Match when={mode() === 'dialog'}>
        <PanelDialog
          ref={ref}
          dialog={dialog()}
          tokens={props.tokens}
          onDialogPick={(id) => onPick && onPick(id)}
          onDialogAdjust={(d) => onAdjust && onAdjust(d)}
          onDialogClose={() => (onBack ? onBack() : close())}
        />
      </Match>
      <Match when={mode() === 'menu'}>
        <ItemMenu ref={ref} menu={menu()} held={held()} tokens={props.tokens} onMenuPick={(id) => onPick && onPick(id)} onMenuClose={close} />
      </Match>
      <Match when={mode() === 'artwork'}>
        <ArtworkModal
          ref={ref}
          item={a().item}
          tokens={props.tokens}
          onArtworkClose={(changed) => {
            close()
            if (changed && p.onItemRefreshed) p.onItemRefreshed()
          }}
        />
      </Match>
      <Match when={mode() === 'identify'}>
        <IdentifyModal ref={ref} item={a().item} tokens={props.tokens} onIdentifyClose={close} onItemRefreshed={(id) => p.onItemRefreshed && p.onItemRefreshed(id)} />
      </Match>
      <Match when={mode() === 'seerr'}>
        <SeerrSheets
          ref={ref}
          action={a().action}
          seerr={a().seerr}
          item={a().item}
          season={a().season}
          tokens={props.tokens}
          onSeerrClose={close}
          onSeerrRefresh={() => p.onSeerrRefresh && p.onSeerrRefresh()}
          onSeerrSwapping={() => p.onSeerrSwapping && p.onSeerrSwapping()}
        />
      </Match>
      <Match when={mode() === 'subsearch'}>
        <SubtitleSearch ref={ref} variant="details" itemId={a().itemId} languages={a().languages} onRemoteSubtitlePick={onRemoteSubtitlePick} onSubtitleSearchClose={close} />
      </Match>
      <Match when={mode() === 'more'}>
        <OverflowMenu
          ref={ref}
          buttons={a().buttons}
          frame={a().frame}
          tokens={props.tokens}
          onMorePick={(id) => {
            close()
            p.onMoreAction(id)
          }}
          onMoreClose={close}
        />
      </Match>
      <Match when={mode() === 'review'}>
        <ReviewDialog ref={ref} review={a().review} onReviewClose={close} />
      </Match>
      <Match when={mode() === 'trailers'}>
        <TrailerPicker
          ref={ref}
          choices={a().choices}
          item={a().item}
          onTrailerPick={(choice) => {
            close()
            p.playTrailerChoice(choice)
          }}
          onTrailerPickerClose={close}
        />
      </Match>
    </Switch>
  )
  return (
    <view>
      <view>
        <Show when={mode() && !over()}>{body()}</Show>
      </view>
      <Show when={mode() && over()}>
        <OverNav>{body()}</OverNav>
      </Show>
      <view>
        <Show when={kbOn()}>
          <Keyboard overlay ref={(n) => (kb = n)} onKeyboardChange={(text) => naming && naming.onText(text)} onKeyboardClose={onKeyboardClose} />
        </Show>
      </view>
    </view>
  )
}
