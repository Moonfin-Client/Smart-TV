import $L from '../../services/i18n.js'
import { Show, createEffect, createMemo, on, onCleanup, onMount } from 'solid-js'
import DetailModals from '../../ui/components/modals/DetailModals.jsx'
import LoadingAnimation from '../../ui/components/shell/LoadingAnimation.jsx'
import { AmbientBackground, QualityBadge, TrackInfo, LyricsPanel, QueuePanel, Dock, SeekBar, qualityLabel, PLAYER_ACCENT } from '../../ui/components/music/NowPlayingParts.jsx'
import { trackArt } from '../../ui/components/music/trackArt.js'
import { holdStep } from '../../ui/components/music/heldSeek.js'
import { detailTokens } from '../Details/modern/tokens.js'
import { uiFont, textReady } from '../../ui/text.js'
import { theme } from '../../ui/theme.js'
import { reactive } from '../../state/reactive.js'
import { router } from '../../app/router.js'
import { api, getServerUrl } from '../../services/jellyfinApi.js'
import { getImageUrl } from '../../utils/helpers.js'
import { getAmbientPalette, accentPalette } from '../../utils/ambientPalette.js'
import { formatPlaybackDuration, formatPlaybackTrailingTime } from '../../utils/playbackTimeLabels.js'
import * as player from '../../state/audioPlayer.js'
import * as settings from '../../state/settings.js'

const { audio } = player

const PANEL_X = 598
const PANEL_Y = 64
const PANEL_W = 1282
const PANEL_H = 756

const lineAt = (lines, t) => {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (typeof lines[i].startSeconds === 'number' && t >= lines[i].startSeconds) return i
  }
  return -1
}

const parseLyrics = (response) =>
  ((response && Array.isArray(response.Lyrics) && response.Lyrics) || [])
    .map((line) => ({
      startSeconds: line && typeof line.Start === 'number' ? line.Start / 10000000 : null,
      text: ((line && line.Text) || '').replace(/\r/g, '').trim(),
    }))
    .filter((line) => line.text)
    .sort((a, b) => (typeof a.startSeconds === 'number' ? a.startSeconds : 9e15) - (typeof b.startSeconds === 'number' ? b.startSeconds : 9e15))

const thumbOf = (t) => {
  const id = t.AlbumId || t.Id
  return id ? getImageUrl(t._serverUrl || getServerUrl(), id, 'Primary', { maxHeight: 96 }) || '' : ''
}
const artistOf = (t) => (t && (t.AlbumArtist || (t.Artists && t.Artists[0]) || t.Album)) || ''

// Up from the dock reaches the seekbar and then the panel, whose rows own Up and Down, and Left,
// Back or Down past the last row leave it. Back from anywhere else leaves with the music playing.
export default function NowPlaying() {
  const st = reactive({
    row: 'bottom',
    dcur: 4,
    dockNote: -1,
    pcur: 0,
    tab: 'lyrics',
    lyrics: [],
    lyricsLoading: false,
    lyricsError: '',
    lyricTime: 0,
    favorite: false,
    palette: accentPalette(PLAYER_ACCENT),
    modalOpen: false,
    // Where a seekbar scrub has got to. It lands once the presses stop.
    scrubTo: -1,
  })
  const my = { itemId: null, hold: null, scrubTimer: null, ready: false, alive: true }
  let root
  let modals = null

  const track = () => (audio.itemId ? player.current() : null)
  const art = createMemo(() => trackArt(track()))
  const album = () => (track() && track().Album) || ''
  const infoY = () => {
    const h = 518 + 21 + 60 + (audio.artist ? 6 + 35 : 0) + (album() ? 4 + 30 : 0)
    return PANEL_Y + (PANEL_H - h) / 2
  }
  // The badge reads only what the track item carries, so a song loaded without its media streams
  // shows none.
  const badge = () => (audio.itemId && !audio.loading ? qualityLabel(track()) : '')
  const hasLyrics = () => st.lyrics.length > 0
  const panel = () => (st.tab === 'lyrics' && hasLyrics() ? 'lyrics' : 'queue')
  const synced = createMemo(() => st.lyrics.some((l) => typeof l.startSeconds === 'number'))
  const activeLine = createMemo(() => lineAt(st.lyrics, st.lyricTime))
  const queueRows = createMemo(() => {
    const v = audio.orderVersion
    const playing = audio.itemId
    return player.playOrder().map((t, i) => ({
      k: (t.Id || 'q') + ':' + i + ':' + v,
      i,
      raw: t,
      art: thumbOf(t),
      title: t.Name || '',
      artist: artistOf(t),
      current: playing === t.Id,
    }))
  })
  const currentRow = () => queueRows().findIndex((r) => r.current)
  const showLyrics = () => panel() === 'lyrics' || (st.tab === 'lyrics' && st.lyricsLoading)
  const buttons = createMemo(() => {
    const list = [
      { id: 'favorite', icon: st.favorite ? 'mus_p_favorite_filled' : 'mus_p_favorite', label: $L('Favorite'), active: st.favorite, x: 40 },
      { id: 'addToPlaylist', icon: 'mus_p_playlist_add', label: $L('Add to Playlist'), x: 132 },
      { id: 'shuffle', icon: 'mus_p_shuffle', label: $L('Shuffle'), active: audio.shuffle, x: 702 },
      { id: 'previous', icon: 'mus_p_previous', label: $L('Previous'), disabled: !(audio.orderVersion >= 0 && player.hasPrev()) && !audio.shuffle, x: 810 },
      // The player starts unpaused, so a track still loading shows Pause.
      { id: 'playPause', icon: audio.playing || audio.loading ? 'mus_p_pause' : 'mus_p_play', label: audio.playing || audio.loading ? $L('Pause') : $L('Play'), x: 918 },
      {
        id: 'next', icon: 'mus_p_next', label: $L('Next'), x: 1026,
        disabled: !(audio.orderVersion >= 0 && player.hasNext()) && audio.repeat === 'off' && !audio.shuffle,
      },
      { id: 'repeat', icon: audio.repeat === 'one' ? 'mus_p_repeat_one' : 'mus_p_repeat', label: $L('Repeat'), active: audio.repeat !== 'off', x: 1134 },
    ]
    if (hasLyrics()) {
      list.push(
        { id: 'lyrics', icon: 'mus_p_lyrics', label: $L('Lyrics'), active: panel() === 'lyrics', selected: panel() === 'lyrics', x: 1704 },
        { id: 'queue', icon: 'mus_p_queue', label: $L('Up Next'), active: panel() === 'queue', selected: panel() === 'queue', x: 1796 }
      )
    }
    return list.map((b, i) => ({ ...b, i }))
  })
  const dockFocus = () => (!st.modalOpen && st.row === 'bottom' ? st.dcur : -1)
  // The bar and the times follow a scrub while it's under way.
  const shown = () => (st.scrubTo >= 0 ? st.scrubTo : audio.position)
  const trailing = () =>
    formatPlaybackTrailingTime({
      mode: settings.get('musicPlaybackTimeDisplay'),
      position: shown(),
      duration: audio.duration,
      clockDisplay: settings.get('clockDisplay'),
      timeOffsetHours: settings.get('timeOffsetHours'),
    })
  const seekColors = createMemo(() => {
    const t = theme()
    return { track: t.rangeTrack, buffered: t.rangeTrack.slice(0, 7) + 'cc', fill: t.rangeProgress, thumb: t.rangeThumb }
  })
  const timeY = 908 + 7.4

  const loadTrack = async () => {
    const id = audio.itemId
    my.itemId = id
    // A scrub of the last track doesn't carry over.
    clearTimeout(my.scrubTimer)
    my.scrubTimer = null
    st.scrubTo = -1
    const t = player.current()
    st.favorite = !!(t && t.UserData && t.UserData.IsFavorite)
    st.lyrics = []
    st.lyricsError = ''
    st.lyricTime = 0
    if (!id) return
    st.lyricsLoading = true
    if (st.row === 'panel') st.row = 'progress'
    try {
      const res = await api.getLyrics(id)
      if (my.itemId === id && my.alive) st.lyrics = parseLyrics(res)
    } catch (e) {
      if (my.itemId === id && my.alive && e && e.status && e.status !== 404) st.lyricsError = $L('Unable to load lyrics right now.')
    }
    if (my.itemId !== id || !my.alive) return
    st.lyricsLoading = false
    getAmbientPalette(trackArt(t), PLAYER_ACCENT).then((pal) => {
      if (my.itemId === id && my.alive && pal) st.palette = pal
    })
  }
  const enterPanel = () => {
    st.dockNote = st.dcur
    st.row = 'panel'
    st.pcur = panel() === 'lyrics' ? Math.max(activeLine(), 0) : Math.max(currentRow(), 0)
  }
  const leavePanel = () => (st.row = 'progress')
  const panelCount = () => (panel() === 'lyrics' ? st.lyrics.length : queueRows().length)
  const toggleFavorite = async () => {
    const t = player.current()
    if (!t) return
    const next = !st.favorite
    st.favorite = next
    try {
      await api.setFavorite(t.Id, next)
      t.UserData = { ...(t.UserData || {}), IsFavorite: next }
    } catch (e) {
      if (my.alive) st.favorite = !next
    }
  }
  const press = (btn) => {
    if (btn.id === 'favorite') toggleFavorite()
    else if (btn.id === 'addToPlaylist') {
      const t = player.current()
      if (!t || !modals) return
      st.modalOpen = true
      modals.openAddTo('playlist', t)
    } else if (btn.id === 'shuffle') player.toggleShuffle()
    else if (btn.id === 'repeat') player.cycleRepeat()
    else if (btn.id === 'previous') player.previous()
    else if (btn.id === 'next') player.next()
    else if (btn.id === 'playPause') player.toggle()
    else if (btn.id === 'lyrics' || btn.id === 'queue') {
      if (panel() === btn.id) enterPanel()
      else st.tab = btn.id
    }
  }
  const seekBy = (direction) => {
    const step = direction < 0 ? (settings.get('skipBackLength') || 10000) / 1000 : (settings.get('skipForwardLength') || 30000) / 1000
    player.seek(audio.position + direction * step)
  }
  const landScrub = () => {
    clearTimeout(my.scrubTimer)
    my.scrubTimer = null
    if (st.scrubTo < 0) return
    player.seek(st.scrubTo)
    st.scrubTo = -1
  }
  // Left and Right on the seekbar move by the Seek Step setting, growing while the key is held. The
  // presses add up and land as one seek.
  const scrubBy = (direction) => {
    const r = holdStep(my.hold, direction, Number(settings.get('seekStep')) || 10, Date.now())
    my.hold = r.hold
    const end = audio.duration ? audio.duration - 1 : Infinity
    st.scrubTo = Math.max(0, Math.min(end, shown() + r.delta))
    clearTimeout(my.scrubTimer)
    my.scrubTimer = setTimeout(landScrub, 600)
  }
  const releaseHold = () => {
    if (my.hold) my.hold.count = 0
    return false
  }
  const page = {
    onModalClosed: () => {
      st.modalOpen = false
      if (root) root.setFocus()
    },
  }

  createEffect(
    on(
      () => audio.itemId,
      () => {
        if (my.ready) loadTrack()
      },
      { defer: true }
    )
  )
  // The queue ran out or Stop was pressed, so there is nothing left to show.
  createEffect(
    on(
      () => audio.active,
      (active) => {
        if (!active) router.back()
      },
      { defer: true }
    )
  )
  onMount(async () => {
    if (root) root.setFocus()
    // Only writes when the line changes, so a paused song draws nothing.
    const timer = setInterval(() => {
      if (panel() !== 'lyrics' || !synced()) return
      const t = player.currentTime()
      if (lineAt(st.lyrics, t) !== activeLine()) st.lyricTime = t
    }, 250)
    onCleanup(() => clearInterval(timer))
    await textReady()
    if (!my.alive) return
    my.ready = true
    loadTrack()
  })
  onCleanup(() => {
    my.alive = false
    clearTimeout(my.scrubTimer)
  })

  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color="#000000ff"
      onLeft={() => {
        if (st.row === 'panel') leavePanel()
        else if (st.row === 'progress') scrubBy(-1)
        else if (st.dcur > 0) st.dcur = st.dcur - 1
        return true
      }}
      onRight={() => {
        if (st.row === 'progress') scrubBy(1)
        else if (st.row !== 'panel' && st.dcur < buttons().length - 1) st.dcur = st.dcur + 1
        return true
      }}
      onLeftRelease={releaseHold}
      onRightRelease={releaseHold}
      onUp={() => {
        if (st.row === 'panel') {
          if (st.pcur > 0) st.pcur = st.pcur - 1
        } else if (st.row === 'bottom') {
          st.dockNote = st.dcur
          st.row = 'progress'
        } else if (st.row === 'progress') enterPanel()
        return true
      }}
      onDown={() => {
        if (st.row === 'panel') {
          if (st.pcur < panelCount() - 1) st.pcur = st.pcur + 1
          else leavePanel()
        } else if (st.row === 'progress') {
          st.row = 'bottom'
          if (st.dockNote >= 0 && st.dockNote < buttons().length) st.dcur = st.dockNote
          else st.dcur = buttons().findIndex((b) => b.id === 'playPause')
        }
        return true
      }}
      onEnter={() => {
        if (st.row === 'progress') {
          landScrub()
          player.toggle()
        } else if (st.row === 'panel') {
          if (panel() === 'lyrics') {
            const line = st.lyrics[st.pcur]
            if (line && typeof line.startSeconds === 'number') player.seek(line.startSeconds)
          } else {
            const row = queueRows()[st.pcur]
            if (row) player.jumpTo(row.raw)
          }
        } else {
          const btn = buttons()[st.dcur]
          if (btn && !btn.disabled) press(btn)
        }
        return true
      }}
      onBack={() => {
        if (st.row === 'panel') leavePanel()
        else router.back()
        return true
      }}
      onPlay={() => {
        if (!audio.playing) player.toggle()
        return true
      }}
      onPause={() => {
        if (audio.playing) player.toggle()
        return true
      }}
      onPlayPause={() => {
        player.toggle()
        return true
      }}
      onStop={() => {
        player.stop()
        return true
      }}
      onFastForward={() => {
        seekBy(1)
        return true
      }}
      onRewind={() => {
        seekBy(-1)
        return true
      }}
    >
      <AmbientBackground palette={st.palette} bg="#0a0a0a" />
      <view>
        <Show when={badge()}>
          <QualityBadge label={badge()} />
        </Show>
      </view>
      <TrackInfo x={40} y={infoY()} art={art()} title={audio.title} artist={audio.artist} album={album()} />
      <view x={PANEL_X} y={PANEL_Y} width={PANEL_W} height={PANEL_H}>
        <Show
          when={showLyrics()}
          fallback={<QueuePanel rows={queueRows()} currentIndex={currentRow()} cursor={st.row === 'panel'} cur={st.pcur} w={PANEL_W} h={PANEL_H} />}
        >
          <LyricsPanel
            lines={st.lyrics}
            activeIndex={activeLine()}
            loading={st.lyricsLoading}
            error={st.lyricsError}
            synced={synced()}
            cursor={st.row === 'panel'}
            cur={st.pcur}
            w={PANEL_W}
            h={PANEL_H}
          />
        </Show>
      </view>
      <view width={1920} height={1080} transition={{ alpha: { duration: 300 } }} alpha={st.modalOpen ? 0 : 1}>
        <SeekBar
          x={24}
          y={888}
          progress={audio.duration ? shown() / audio.duration : 0}
          buffered={audio.duration ? audio.buffered / audio.duration : 0}
          focused={st.row === 'progress' && !st.modalOpen}
          colors={seekColors()}
        />
        <text fontFamily={uiFont()} fontSize={18} x={48} y={timeY} color="#ffffffb3">
          {formatPlaybackDuration(shown())}
        </text>
        <text fontFamily={uiFont()} fontSize={18} x={1872} y={timeY} mountX={1} color="#ffffffb3">
          {trailing()}
        </text>
        <Dock y={956} buttons={buttons()} focus={dockFocus()} />
      </view>
      <view>
        <Show when={audio.waiting}>
          <LoadingAnimation label={$L('Loading Stream...')} />
        </Show>
      </view>
      <DetailModals ref={(h) => (modals = h)} page={page} tokens={detailTokens()} />
    </view>
  )
}
