import $L from '../../services/i18n.js'
import { For, Show, createEffect, createMemo, on, onCleanup, onMount } from 'solid-js'
import { getRenderer } from '@solidtv/solid'
import { legacy } from '../../ui/tier.js'
import LoadingAnimation from '../../ui/components/shell/LoadingAnimation.jsx'
import Button from '../../ui/components/Button.jsx'
import playbackErrorMessage from './playbackErrorMessage.js'
import NextUpCard from '../../ui/components/player/NextUpCard.jsx'
import SkipPrompt from '../../ui/components/player/SkipPrompt.jsx'
import StillWatchingDialog from '../../ui/components/player/StillWatchingDialog.jsx'
import { episodeMarker, markerPills } from '../../ui/components/player/animePills.js'
import { getImageUrl, getLogoUrl } from '../../utils/helpers.js'
import { airsText } from '../../utils/calendarEntries.js'
import EpisodeBrowser from '../../ui/components/player/EpisodeBrowser.jsx'
import TrackModal from '../../ui/components/player/TrackModal.jsx'
import SecondarySettings from '../../ui/components/player/SecondarySettings.jsx'
import SubtitleSettings from '../../ui/components/player/SubtitleSettings.jsx'
import OffsetOverlay from '../../ui/components/player/OffsetOverlay.jsx'
import PlaybackInfo from '../../ui/components/player/PlaybackInfo.jsx'
import ChapterModal from '../../ui/components/player/ChapterModal.jsx'
import CastModal from '../../ui/components/player/CastModal.jsx'
import ChannelCarousel from '../../ui/components/player/ChannelCarousel.jsx'
import LiveFailedCard from '../../ui/components/player/LiveFailedCard.jsx'
import LiveRecordingDialog from '../../ui/components/player/LiveRecordingDialog.jsx'
import PlayerOsd from '../../ui/components/player/PlayerOsd.jsx'
import SubtitleSearch from '../../ui/components/modals/SubtitleSearch.jsx'
import {
  mapSubtitleStreamsFromMediaSource,
  pollForSubtitleAppearance,
  remoteSubtitleNotAppearedMessage,
  subtitleDownloadLanguages,
  toSubtitleLanguage,
} from '../../ui/components/modals/remoteSubtitleUtils.js'
import { keyed } from '../../ui/components/library/pageKit.js'
import { cssShift, fontFor, uiFont } from '../../ui/text.js'
import { api, getServerType, getServerUrl } from '../../services/jellyfinApi.js'
import { getApiForItem } from '../../services/connectionPool.js'
import * as playback from '../../services/playback.js'
import serverLogger from '../../services/serverLogger.js'
import {
  initVideo,
  getHostAudioOutput,
  getHostDisplay,
  leavesPlayerInBackground,
  notePlaybackError,
  registerAppStateObserver,
  setupVisibilityHandler,
} from '../../services/video.js'
import { getH264FallbackProfile } from '../../services/deviceProfile.js'
import { setLiveTvLastChannelId } from '../../services/liveTvLastChannel.js'
import * as engine from '../../state/videoEngine.js'
import * as party from '../../state/watchParty.js'
import { openPartyChat, openPartyPanel } from '../../ui/components/party/PartyLayer.jsx'
import { stop as stopAudio } from '../../state/audioPlayer.js'
import * as settings from '../../state/settings.js'
import { getStore, toast } from '../../state/store.js'
import { browseRefresh } from '../../state/browseCache.js'
import { router } from '../../app/router.js'
import { getPlatform, isVega } from '../../platform.js'
import { applyResumeRewind, skipBackSeconds, skipForwardSeconds, zoomInternalFromSetting, zoomSettingFromInternal } from '../../utils/playbackTuning.js'
import { chapterStep, chapterMarkerPositions } from '../../utils/chapterMarkers.js'
import { formatPlaybackDuration, formatPlaybackTimeSlot } from '../../utils/playbackTimeLabels.js'
import { formatClockTime } from '../../utils/clock.js'
import { episodeLine, programAiringAt } from '../../utils/liveTvGuide.js'
import { selectPreferredAudioStream } from '../../utils/audioTrackSelection.js'
import { shouldAskStillWatching } from '../../utils/stillWatching.js'
import { buildPlaybackInfo } from '../../utils/playbackInfo.js'
import { isHdrOutput } from '../../utils/videoRange.js'
import { canBrowseEpisodes } from '../../utils/episodeBrowser.js'
import { audioTrackDetail, numberedTrackName, sortSubtitleStreams, subtitleTrackDetail } from '../../utils/trackLabels.js'
import { getItemSecondarySubtitlePref, saveSecondarySubtitlePref, saveSubtitlePref, saveAudioPref } from '../../services/subtitlePrefs.js'
import { resolveInitialSubtitle } from './initialSubtitle.js'
import { asServerAudioStream, directPlayAudio, resolveSeriesAudio } from './initialAudio.js'
import { osdButtons } from './osdButtons.js'
import { trackShortcutAction } from './trackShortcut.js'
import { remoteShortcut } from '../../utils/keys.js'
import { getVideoDisplayAspectRatio } from './aspectRatioUtils.js'
import { resolveSubtitleStyleSettings, getSubtitleFontPx, getAssFontScale } from '../../utils/subtitleConstants.js'
import { drawSubtitles, pictureData } from './subtitleCanvas.js'
import { languageTag } from '../../utils/audioLanguage.js'
import { createPopups } from './popups.js'
import { findNextAirDate } from './nextAirDate.js'
import { createLiveRecovery } from './liveRecovery.js'
import { createStreamReconnect } from './streamReconnect.js'
import { createChannelSwitch, liveTvApiFor } from './channelSwitch.js'
import { createLiveRecording } from './liveRecording.js'
import * as bitmapSubs from './bitmapSubs.js'
import {
  clampSecondaryDelay,
  getSecondarySubtitleColorOptions,
  isSecondaryEligible,
  offsetLabel,
  restoreSecondaryIndex,
  secondaryCandidates,
  secondaryCueText,
  secondarySelection,
  stepSecondarySetting,
} from './secondarySubtitle.js'
import { SLEEP_TIMER_MINUTES, createSleepTimer } from './sleepTimer.js'
import { buildSubtitleTimeline } from './subtitleTimeline.js'
import { createCueText } from './cueText.js'
import { extendServerShuffleQueue } from '../../services/serverShuffle.js'
import { getQualityPresets } from './quality.js'
import { reactive } from '../../state/reactive.js'
import { tx } from '../../ui/fx.js'
import { transcodesAudioCodec } from '../../utils/deviceProfileTuning.js'
import { isPreroll, shouldAutoAdvance } from '../../utils/cinemaMode.js'
import { isTrickplayOn } from '../../utils/trickplayLayout.js'
import { createInBandTextSource } from '../../utils/mkvTextSource.js'
import { shellApp } from '../../state/shell/shellState.js'
import { setPlayerControls } from '../../services/remoteControl.js'
import { errorStep } from './playbackFallback.js'
import { createServerSeek } from './serverSeek.js'
import { AT_LIVE_SECONDS, isAtLive, liveWindowFor, nextLiveWindow } from './liveWindow.js'
import SubtitleFetchIndicator from '../../ui/components/player/SubtitleFetchIndicator.jsx'
import { holdSeekSeconds, holdStep } from '../../ui/components/music/heldSeek.js'

// A title from another server plays, and is marked, through that server.
const apiOf = (item) => getApiForItem(item) || api

const TICKS = 10000000
const SLIDESHOW_ERROR_DELAY = 2500
// A Silo stream moves to a new token while it plays, and is reopened on it.
const SILO_RENEWAL_CHECK_MS = 15000
// AVPlay logs every read of a live range, which only grows a segment at a time.
const LIVE_RANGE_READ_MS = 2000
// Cinema Mode's Skip button stays up for this much of a trailer, so only a longer one gets it.
const CINEMA_SHOW_SECONDS = 10
// How long Wait for ASS/SSA holds the start, and how long the fetch indicator waits on an ASS track.
const ASS_READY_WAIT = 15000
const ASS_FETCH_INDICATOR_LIMIT = 180000
// A subtitle the server answers right away doesn't flash the indicator.
const FETCH_SHOW_DELAY_MS = 500
// The modals the remote's Subtitles button owns.
const SUBTITLE_KINDS = ['subs', 'subSlot', 'secSubs', 'download', 'subOffset', 'secOffset', 'secAppearance', 'subSettings']
// Each modal over the player, with the component that draws it.
const MODALS = {
  audio: 'track',
  subs: 'track',
  subSlot: 'track',
  secSubs: 'track',
  sleep: 'track',
  secAppearance: 'secSettings',
  subSettings: 'subSettings',
  subOffset: 'offset',
  secOffset: 'offset',
  episodes: 'episodes',
  info: 'playInfo',
  chapters: 'chapterModal',
  cast: 'castModal',
  channels: 'carousel',
  quality: 'track',
  download: 'subsearch',
  record: 'record',
}
const TEXT_GLOW = { color: '#000000ff', x: 0, y: 0, blur: 12 }

const clock = (sec0) => {
  let sec1 = sec0
  if (!isFinite(sec1) || sec1 < 0) sec1 = 0
  const h = Math.floor(sec1 / 3600)
  const m = Math.floor((sec1 % 3600) / 60)
  const sec = Math.floor(sec1 % 60)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

// Router data can arrive as strings, and an absent pick must stay undefined so the server decides.
const pick = (v) => (v == null || v === '' ? undefined : Number(v))

// The canvas stays transparent here so the video plane under it shows, and only the OSD, subtitles and pickers
// draw. Props are the route's id and its data: startPositionTicks, resume, live, audioStreamIndex,
// subtitleStreamIndex, mediaSourceId, queue, slideshow and server. `s` holds what draws and `my` the rest.
export default function Player(props) {
  const store = getStore()
  const s = reactive({
    position: 0,
    dur: 0,
    paused: false,
    buffering: true,
    osd: false,
    panel: 'none',
    cue: '',
    secCue: '',
    subSize: 44,
    secSize: 44,
    secOn: false,
    subTex: null,
    subX: 0,
    subY: 0,
    subW: 0,
    subH: 0,
    subAlpha: 1,
    canEpisodes: false,
    sleepOn: false,
    offsetShown: 0,
    offsetTimeline: null,
    secSizeShown: 44,
    secOffsetShown: 8,
    secColorLabel: '',
    error: '',
    reconnecting: '',
    loading: true,
    seekGrace: false,
    seekTarget: -1,
    hasNext: false,
    isLive: false,
    osdHead: null,
    liveProgram: null,
    chapterList: [],
    audioCount: 0,
    subCount: 0,
    subOn: false,
    isFavorite: false,
    zoomMode: 'fit',
    qualityOn: pick(props.forceBitrate) != null,
    inParty: false,
    seeking: false,
    scrubPos: -1,
    stepSec: 10,
    osdTp: null,
    castOk: false,
    recordable: false,
    pauseInfo: null,
    recordMark: null,
    hdr: false,
    buffered: 0,
    skip: null,
    skipLapsed: false,
    nextUp: false,
    nextCard: null,
    nextCount: null,
    dialog: '',
    dialogTitle: '',
    subsearch: null,
    itemId: '',
    preroll: false,
    liveWindow: null,
    fetching: false,
  })
  const my = {
    zone: 'page',
    pos: 0,
    cueText: createCueText(),
    consecutive: 0,
    startGen: 0,
    chapters: [],
    secGen: 0,
    secIndex: null,
    secDelay: 0,
    subDelay: 0,
    listPos: 0,
    fetchToken: 0,
    list: [props.id].concat(Array.isArray(props.queue) ? props.queue.filter((q) => q && q !== props.id) : []),
    // Cinema Mode's trailers lead the queue Details hands over.
    prerolls: Number(props.prerolls) || 0,
    // Details' advanced play: a bitrate, and transcoding whatever the file.
    quality: pick(props.forceBitrate),
    forceTranscode: props.forceTranscode === true,
  }
  const refs = {}
  let root
  let gone = false

  // Every timer is cleared when the player goes.
  const timers = new Set()
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }
  const every = (fn, ms) => {
    const id = setInterval(fn, ms)
    timers.add(id)
    return id
  }
  const cancel = (id) => {
    if (id == null) return
    clearTimeout(id)
    clearInterval(id)
    timers.delete(id)
  }

  // A held scrub shows where it would land, a run of plain seeks where they're headed.
  const shownPosition = () => (s.scrubPos >= 0 ? s.scrubPos : s.seekTarget >= 0 ? s.seekTarget : s.position)
  const progress = () => (s.dur > 0 ? Math.max(0, Math.min(1, shownPosition() / s.dur)) : 0)
  // The loader is dimmed while a stream comes up, and plain while it buffers or reconnects, except while a seek
  // is picked over a trickplay preview and for 3 s after.
  const loaders = createMemo(() => {
    if (s.loading && !s.error) return [{ key: 'load', label: $L('Loading Stream...'), dimmed: true }]
    const behindPreview = !!s.osdTp && isTrickplayOn(settings.all() || {}) && (s.seeking || s.seekGrace)
    if (s.reconnecting || (s.buffering && !behindPreview && !s.error)) {
      return [{ key: 'buffer', label: s.reconnecting || $L('Loading Stream...'), dimmed: false }]
    }
    return []
  })
  const loaderList = keyed(loaders, (l) => l.key)
  // The error screen for anything but a channel, which shows its failed card instead.
  const errorScreen = createMemo(() => {
    if (!s.error || s.isLive) return null
    const title = $L('Playback Error')
    const titleFont = fontFor(title, 'bold')
    const messageFont = fontFor(s.error)
    return {
      title,
      message: s.error,
      back: $L('Go Back'),
      titleFont,
      messageFont,
      titleY: 468 + cssShift(32, titleFont),
      messageY: 501 + cssShift(20, messageFont),
    }
  })
  // The paused item's description, while the controls are away (showDescriptionOnPause).
  const pauseShown = () => !!s.pauseInfo && s.paused && !s.osd && s.panel === 'none' && !s.dialog && !s.error && !s.buffering
  const trackShown = () => MODALS[s.panel] === 'track'
  const skipShown = () => !!s.skip && s.panel === 'none' && !s.dialog && (s.osd || !s.skipLapsed)
  const nextUpShown = () => s.nextUp && !s.osd && s.panel === 'none' && !s.dialog
  // The controls show while up with no modal over them. A failed channel's card hides them too.
  const osdShown = () => s.osd && !s.loading && s.panel === 'none' && s.dialog !== 'lost' && s.dialog !== 'still' && !s.error
  const osdDim = () => {
    const dim = s.hdr ? Number(settings.get('hdrControlsDimming')) || 0 : 0
    return dim > 0 ? 1 - dim / 100 : 1
  }
  const osdBtns = createMemo(() =>
    osdButtons(
      {
        isPaused: s.paused,
        isLive: s.isLive,
        liveRewind: !!s.liveWindow,
        atLive: isAtLive(s.liveWindow, shownPosition()),
        nextEpisode: s.hasNext,
        audioCount: s.audioCount,
        subtitleCount: s.subCount,
        chapterCount: s.chapterList.length,
        canDownload: !!s.itemId,
        subtitleOn: s.subOn,
        hasCast: s.castOk,
        selectedQuality: s.qualityOn ? 1 : null,
        zoomMode: s.zoomMode,
        sleepOn: s.sleepOn,
        canBrowseEpisodes: s.canEpisodes,
        isFavorite: s.isFavorite,
        canFavorite: !!s.osdHead && !s.preroll,
        inParty: s.inParty,
        recordable: s.recordable,
        recordMark: s.recordMark,
      },
      settings.all() || {}
    )
  )
  // The six time slots, each set by its own setting (playbackTimeAboveLeft and the rest).
  const osdSlots = createMemo(() => {
    const st = settings.all() || {}
    const args = { position: shownPosition(), duration: s.dur, clockDisplay: st.clockDisplay, timeOffsetHours: st.timeOffsetHours }
    const slot = (key) => formatPlaybackTimeSlot({ slot: st[key], ...args })
    return {
      above: [slot('playbackTimeAboveLeft'), slot('playbackTimeAboveCenter'), slot('playbackTimeAboveRight')],
      below: [slot('playbackTimeBelowLeft'), slot('playbackTimeBelowCenter'), slot('playbackTimeBelowRight')],
    }
  })
  const osdMarks = createMemo(() => {
    const st = settings.all() || {}
    if (!st.showChapterMarkers || !(s.dur > 0)) return []
    return chapterMarkerPositions(s.chapterList, s.dur * 1000).map((ms) => ({ key: String(ms), x: (ms / (s.dur * 1000)) * 1872 }))
  })
  // The live timeline. With a rewind window the bar runs from its start to the live point, the left label is the
  // time of day being watched and the right one how far behind live it is. Otherwise it's the program's span, or a
  // clock and LIVE without guide data.
  const osdLive = createMemo(() => {
    if (!s.isLive) return null
    const st = settings.all() || {}
    const p = s.liveProgram
    const now = s.position >= 0 && Date.now()
    const w = s.liveWindow
    if (w) {
      const at = shownPosition()
      const behind = Math.max(0, w.edge - at)
      return {
        episode: episodeLine(p) || '',
        progress: Math.max(0, Math.min(1, (at - w.start) / (w.edge - w.start))),
        start: formatClockTime(new Date(now - behind * 1000), st.clockDisplay),
        end: behind <= AT_LIVE_SECONDS ? $L('LIVE') : `-${formatPlaybackDuration(behind)}`,
        window: true,
      }
    }
    const start = p ? new Date(p.StartDate) : null
    const end = p ? new Date(p.EndDate) : null
    const prog = start && end ? Math.max(0, Math.min(1, (now - start.getTime()) / (end.getTime() - start.getTime()))) : 0
    return {
      episode: episodeLine(p) || '',
      progress: prog,
      start: formatClockTime(start || new Date(now), st.clockDisplay),
      end: end ? formatClockTime(end, st.clockDisplay) : $L('LIVE'),
      window: false,
    }
  })

  // picks are the tracks and version Details chose, for the first item only. startTicks null starts where
  // the item was left, unless the route said not to resume.
  async function start(itemId, startTicks, picks = {}) {
    // playback.js holds one session, so music playing behind has to report its stop first.
    stopAudio()
    const mine = ++my.startGen
    s.error = ''
    s.buffering = true
    s.loading = true
    my.stopped = false
    my.startReported = false
    my.reReport = false
    my.burnIn = null
    my.nativeSub = false
    my.reopened = false
    my.ending = null
    my.liveLag = null
    my.liveReadAt = 0
    s.liveWindow = null
    my.cinemaWanted = true
    my.cinemaFrom = null
    my.subEarly = null
    clearSubtitleFetch()
    // A new item gets every fallback afresh.
    if (my.fallbackFor !== itemId) {
      my.fallbackFor = itemId
      my.triedTranscode = false
      my.forceHlsJs = false
      my.hlsRetries = 0
    }
    disposeTextSource()
    s.itemId = itemId
    prepareSecondary(itemId)
    // A new episode starting takes the browser and the cast list with it, whether it was picked there or not.
    if (s.panel === 'episodes' || s.panel === 'cast') closePanel()
    my.segments = null
    my.tp = null
    s.osdTp = null
    s.chapterList = []
    s.liveProgram = null
    dropScrub()
    s.seeking = false
    s.position = (startTicks || 0) / TICKS
    my.pos = s.position
    s.seekTarget = -1
    my.popups.reset()
    setPrompt(null)
    setNextUp(false)
    const tizen = getPlatform() === 'tizen'
    const PM = playback.PlayMethod
    try {
      const read = await apiOf(props.server).getItem(itemId)
      const item = props.server ? { ...read, ...props.server } : read
      if (mine !== my.startGen || gone) return
      if (my.list.length > 1 && my.listPos < my.prerolls) item._preroll = true
      my.item = item
      s.preroll = isPreroll(item)
      s.isLive = !!props.live || item.Type === 'TvChannel'
      s.canEpisodes = canBrowseEpisodes({ item, isLiveTV: s.isLive })
      s.isFavorite = !!(item.UserData && item.UserData.IsFavorite)
      s.castOk = item.Type === 'Episode' && !!(item.SeriesId || item.SeasonId || item.ParentId)
      s.zoomMode = zoomInternalFromSetting(settings.get('playerZoomMode'))
      s.dur = item.RunTimeTicks ? item.RunTimeTicks / TICKS : 0
      const st = settings.all()
      if (startTicks == null) {
        const saved = !s.isLive && props.resume !== false ? (item.UserData && item.UserData.PlaybackPositionTicks) || 0 : 0
        // A group position is exact, and rewinding it only gets the set seeked forward again.
        startTicks = party.isInGroup() ? saved : applyResumeRewind(saved, st)
        s.position = startTicks / TICKS
        my.pos = s.position
      }
      const directAllowed = !my.forceTranscode && !st.preferTranscode
      const opts = {
        item,
        startPositionTicks: startTicks,
        maxBitrate: my.quality || st.maxBitrate || 0,
        enableDirectPlay: directAllowed,
        enableDirectStream: directAllowed,
        forceDirectPlay: s.isLive || my.forceTranscode ? false : st.forceDirectPlay,
        isLiveTV: s.isLive,
        audioStreamIndex: picks.audioStreamIndex,
        subtitleStreamIndex: picks.subtitleStreamIndex,
        mediaSourceId: picks.mediaSourceId,
        stereoUpmixEnabled: st.stereoUpmixEnabled,
      }
      let info = await playback.getPlaybackInfo(itemId, opts)
      if (mine !== my.startGen || gone) return
      // The remembered audio, then the language preferences, then the server's and the file's default.
      const audioStreams = info.audioStreams || []
      const fileDefault = audioStreams.find((a) => a.isDefault)
      let autoAudio =
        (await resolveSeriesAudio(item, audioStreams)) ||
        selectPreferredAudioStream(audioStreams, st) ||
        audioStreams.find((a) => a.index === info.defaultAudioStreamIndex) ||
        fileDefault
      // AVPlay leaves a track the set can't decode out of its list, so direct play starts on the server's pick instead.
      if (tizen && autoAudio && info.playMethod === PM.DirectPlay && !transcodesAudioCodec(st, autoAudio.codec)) {
        autoAudio = await directPlayAudio(autoAudio, audioStreams, info.selectedAudioStreamIndex, (x) => playback.canPlayAudioStreamNatively(asServerAudioStream(x)))
      }
      const startingAudio = picks.audioStreamIndex != null ? audioStreams.find((a) => a.index === picks.audioStreamIndex) : autoAudio
      // A remux or transcode carries only the track the server built it around, and a codec the server converts
      // can't be switched to in the player either, so those are asked of the server. Direct play switches in the
      // player, apart from the Fire TV WebView, which has no audioTracks.
      let negotiated = false
      if (
        picks.audioStreamIndex == null &&
        autoAudio &&
        !s.isLive &&
        (info.playMethod !== PM.DirectPlay || transcodesAudioCodec(st, autoAudio.codec) || (!tizen && isVega())) &&
        autoAudio.index !== info.selectedAudioStreamIndex
      ) {
        try {
          opts.audioStreamIndex = autoAudio.index
          opts.mediaSourceId = opts.mediaSourceId || info.mediaSourceId
          info = await playback.getPlaybackInfo(itemId, opts)
          negotiated = true
        } catch (e) {
          if (playback.isEndedOnServer(e)) throw e
        }
      }
      // The subtitle is settled before the url plays, since a burn-in one needs the stream again.
      let choice = await resolveInitialSubtitle(info, item, picks.subtitleStreamIndex, st, startingAudio)
      if (choice && choice.isBurnIn) {
        let baked = choice.index === picks.subtitleStreamIndex
        if (!baked) {
          try {
            info = await playback.getPlaybackInfo(itemId, { ...opts, subtitleStreamIndex: choice.index })
            baked = true
          } catch (e) {
            if (playback.isEndedOnServer(e)) throw e
          }
        }
        if (baked) my.burnIn = choice.index
      }
      if (mine !== my.startGen || gone) return
      my.info = info
      my.audioIndex = picks.audioStreamIndex != null ? picks.audioStreamIndex : autoAudio ? autoAudio.index : info.selectedAudioStreamIndex
      // Direct play always sets the picked track, since the TV can start on another one whatever the file flags.
      my.startAudio =
        picks.audioStreamIndex != null
          ? picks.audioStreamIndex
          : !negotiated && autoAudio && (info.playMethod === PM.DirectPlay || autoAudio.index !== (fileDefault && fileDefault.index))
            ? autoAudio.index
            : null
      my.subIndex = -1
      s.subOn = false
      s.audioCount = audioStreams.length
      s.subCount = (info.subtitleStreams || []).length
      my.isHdr = isHdrOutput(info.mediaSource, info.playMethod === PM.Transcode)
      s.hdr = my.isHdr
      my.aspect = getVideoDisplayAspectRatio(info.mediaSource)
      applySubtitleStyle()
      s.osdHead = headFor(item)
      // A video's controls open on the seek bar, Live TV's on the buttons.
      const controls = refs.controls
      if (controls) {
        if (s.isLive) controls.focusRow('bottom')
        else controls.setRow('progress')
      }
      const title = item.SeriesName || item.Name || ''
      s.pauseInfo =
        settings.get('showDescriptionOnPause') && item.Overview
          ? {
              label: $L('Paused').toUpperCase(),
              labelFont: uiFont('bold'),
              title,
              titleFont: fontFor(title, 'bold'),
              text: item.Overview,
              textFont: fontFor(item.Overview, 'medium'),
            }
          : null
      party.attach({
        itemId,
        // The first item of this player is a fresh play, which a Jellyfin group takes up for everyone.
        fresh: mine === 1,
        play: () => engine.play(),
        pause: () => engine.pause(),
        seek: (sec) => engine.seek(sec),
        currentTime: () => engine.currentTime(),
        duration: () => engine.duration(),
        isPaused: () => engine.isPaused(),
        stop: () => exit(),
        open: async (id, ticks, groupPicks) => {
          await stopSession()
          await start(id, ticks, groupPicks || {})
          showOsd()
        },
      })
      if (my.offMedia) my.offMedia()
      my.offMedia = engine.setMediaSession(
        {
          title: item.Name,
          artist: item.SeriesName || (item.ProductionYear ? String(item.ProductionYear) : ''),
          artwork: s.isLive ? null : getImageUrl(item._serverUrl || getServerUrl(), item.Id, 'Primary', { maxWidth: 512, quality: 80 }),
        },
        {
          play: () => engine.isPaused() && togglePlay(),
          pause: () => !engine.isPaused() && togglePlay(),
          seekforward: s.isLive ? null : () => onOsdAction('forward'),
          seekbackward: s.isLive ? null : () => onOsdAction('rewind'),
          stop: () => exit(),
        }
      )
      // Tizen reads an embedded track out of the file itself, unless a transcode leaves it out.
      my.nativeSub = !!(tizen && choice && choice.isEmbeddedNative && info.playMethod !== PM.Transcode)
      // Wait for ASS/SSA: the track's renderer gets up to 15 s before the stream starts, so the first lines aren't
      // missed.
      if (choice && my.burnIn == null && !my.nativeSub && choice.isAss && bitmapSubs.canDrawAss() && st.waitForAssSubtitles) {
        await selectSubtitle(choice.index, true)
        await bitmapSubs.ready(ASS_READY_WAIT, () => mine === my.startGen && !gone)
        if (mine !== my.startGen || gone) return
        my.subEarly = choice.index
      }
      // A channel's wait for its first frame starts with the stream.
      if (s.isLive) my.recovery.tuned()
      try {
        await openInfo(info, startTicks / TICKS, startTracks(info, choice))
      } catch (e) {
        // AVPlay refusing a stream at prepare rejects here and never reaches onerror, so the transcode
        // fallback runs from here.
        if (gone || mine !== my.startGen || s.isLive || s.preroll || info.playMethod === PM.Transcode) throw e
        my.triedTranscode = true
        engine.release()
        const chosenAudio = my.startAudio != null ? my.startAudio : info.selectedAudioStreamIndex
        const fallback = await playback.getPlaybackInfo(itemId, {
          ...opts,
          mediaSourceId: opts.mediaSourceId || info.mediaSourceId,
          audioStreamIndex: chosenAudio != null ? chosenAudio : undefined,
          subtitleStreamIndex: choice ? choice.index : opts.subtitleStreamIndex,
          directRefused: true,
          enableTranscoding: true,
          forceDirectPlay: false,
        })
        if (gone || mine !== my.startGen) return
        if (!fallback || !fallback.url) throw e
        info = fallback
        my.info = info
        // The transcode carries only the chosen audio and no embedded subtitles, so the subtitle is drawn here or burnt in.
        if (choice) choice = (info.subtitleStreams || []).find((x) => x.index === choice.index) || choice
        if (choice && choice.isBurnIn) my.burnIn = choice.index
        my.nativeSub = false
        my.startAudio = null
        my.isHdr = isHdrOutput(info.mediaSource, info.playMethod === PM.Transcode)
        s.hdr = my.isHdr
        await openInfo(info, startTicks / TICKS, {})
      }
      if (gone || mine !== my.startGen) return
      // The stream is set, so the loading screen gives way to the video and the buffering animation.
      s.loading = false
      if (props.slideshow && props.slideshow.muted) engine.setMuted(true)
      reportStartAt(startTicks)
      loadExtras(item, info)
      applyInitialSubtitle(choice)
      if (!s.isLive) restoreSecondary(item, info.subtitleStreams || [], my.subIndex)
      if (s.isLive) {
        setLiveTvLastChannelId(item.Id)
        loadLineup()
        loadLiveProgram(item)
      }
    } catch (e) {
      if (mine !== my.startGen || gone) return
      // Silo's admin ended this title's session: the player closes with its own message, not an error.
      if (playback.isEndedOnServer(e)) return
      console.error('[player] start failed', e)
      // A pre-roll that can't even load is skipped, not shown.
      if (s.preroll && my.list[my.listPos + 1]) {
        playAdjacent({ Id: my.list[my.listPos + 1] }, 1, false)
        return
      }
      s.buffering = false
      s.error = playbackErrorMessage(e)
    }
  }
  // The tracks a new stream puts on in the player: the picked audio on direct play, and Tizen's embedded subtitle.
  function startTracks(info, choice) {
    const direct = info.playMethod === playback.PlayMethod.DirectPlay
    const streams = info.subtitleStreams || []
    const sub = my.nativeSub && choice ? streams.find((x) => x.index === choice.index) || choice : null
    return {
      audio: my.startAudio != null && direct ? { streamIndex: my.startAudio, audioStreams: info.audioStreams || [] } : null,
      nativeSub: sub ? { stream: sub, streams } : null,
    }
  }
  // A stream opened again on the same item keeps the tracks it had: the audio afresh on direct play, which the TV
  // can otherwise start on its default track, and Tizen's embedded subtitle.
  function keptTracks(info) {
    const direct = info.playMethod === playback.PlayMethod.DirectPlay
    const streams = info.subtitleStreams || []
    const sub = my.nativeSub && info.playMethod !== playback.PlayMethod.Transcode ? streams.find((x) => x.index === my.subIndex) : null
    if (my.nativeSub && !sub) my.nativeSub = false
    return {
      audio: my.audioIndex != null && direct ? { streamIndex: my.audioIndex, audioStreams: info.audioStreams || [], afterReload: true } : null,
      nativeSub: sub ? { stream: sub, streams } : null,
    }
  }
  // The top bar's titles and logo for a channel, an episode or anything else.
  function headFor(item) {
    if (s.isLive) return { live: true, name: item.Name || 'Live TV', badge: item.ChannelNumber || '', program: '' }
    const logo = getLogoUrl(item._serverUrl || getServerUrl(), item, { maxWidth: 800, quality: 90 })
    if (item.SeriesName) return { logo, name: item.SeriesName, line: `S${item.ParentIndexNumber}:E${item.IndexNumber} - ${item.Name}` }
    return { logo, name: item.Name, line: '' }
  }
  // The program airing on the channel, for the top bar and the timeline, checked every minute.
  function loadLiveProgram(item) {
    cancel(my.programTimer)
    const load = async () => {
      try {
        const now = Date.now()
        const res = await api.getLiveTvPrograms([item.Id], new Date(now - 1800000), new Date(now + 10800000))
        const programs = ((res && res.Items) || []).filter((pr) => pr.StartDate && pr.EndDate)
        if (my.item !== item || !programs.length) return
        const pr = programAiringAt(programs, Date.now()) || programs[0]
        if (s.liveProgram && s.liveProgram.Id === pr.Id) return
        s.liveProgram = pr
        s.osdHead = { ...headFor(item), program: pr.Name || '' }
      } catch (e) {
        // The controls keep the program they had.
      }
    }
    load()
    my.programTimer = every(() => {
      if (my.item === item) load()
    }, 60000)
  }
  // Every stream opens here. The zoom goes on before it opens, since AVPlay takes its display then.
  async function openInfo(info, startSeconds, tracks) {
    engine.setZoom(s.zoomMode, my.aspect)
    await engine.open({
      url: info.url,
      mimeType: info.mimeType,
      playMethod: info.playMethod,
      mediaSource: info.mediaSource,
      startSeconds,
      isLive: s.isLive,
      runTimeSeconds: (info.runTimeTicks || 0) / TICKS,
      startDelayMs: Math.max(0, Number(settings.get('videoStartDelay') || 0) * 1000),
      forceHlsJs: my.forceHlsJs,
      // A group that hasn't started has the stream wait on its first frame.
      hold: party.holdsStart(),
      ...(tracks || {}),
    })
    if (!gone) engine.setZoom(s.zoomMode, my.aspect)
  }
  function startReporting() {
    playback.startProgressReporting(
      () => Math.floor(my.pos * TICKS),
      10000,
      () => ({ isPaused: engine.isPaused() })
    )
  }
  function reportStartAt(ticks) {
    my.startReported = true
    my.reReport = false
    playback.reportStart(ticks)
    startReporting()
  }
  // Every reload of the same item gets a new PlaySessionId, so a new start report.
  async function restart(info, at, tracks) {
    my.info = { ...my.info, ...info }
    my.isHdr = isHdrOutput(info.mediaSource, info.playMethod === playback.PlayMethod.Transcode)
    s.hdr = my.isHdr
    s.buffering = true
    await openInfo(info, at, tracks || keptTracks(info))
    if (gone) return
    reportStartAt(Math.floor(at * TICKS))
  }
  // The same item opened again where it is, as it was. Resolves false when it couldn't, and null when something
  // else took over meanwhile.
  async function reloadHere() {
    const mine = my.startGen
    const at = my.pos
    try {
      const info = await playback.getPlaybackInfo(s.itemId, {
        startPositionTicks: Math.floor(at * TICKS),
        maxBitrate: my.quality || settings.get('maxBitrate') || 0,
        mediaSourceId: my.info && my.info.mediaSourceId,
        audioStreamIndex: my.audioIndex != null ? my.audioIndex : undefined,
        subtitleStreamIndex: my.burnIn != null ? my.burnIn : undefined,
        item: my.item,
        stereoUpmixEnabled: settings.get('stereoUpmixEnabled'),
      })
      if (mine !== my.startGen || gone) return null
      if (!info || !info.url) return false
      await restart(info, at)
      return true
    } catch (e) {
      if (playback.isEndedOnServer(e)) return null
      return false
    }
  }
  // Silo replans the session at a title position and the stream opens there. Rejects when it couldn't.
  // A paused stream stays paused in its new place.
  async function reopenSiloAt(sec) {
    const mine = my.startGen
    const wasPaused = engine.isPaused()
    const info = await playback.reanchorAt(Math.floor(sec * TICKS))
    // The player moved to another item while Silo answered, and this stream isn't that item's.
    if (mine !== my.startGen || gone) return
    if (!info || !info.url) throw new Error('Silo gave no stream to reopen')
    my.pos = sec
    await restart(info, sec, wasPaused ? { ...keptTracks(info), hold: true } : undefined)
  }
  function canReconnect() {
    return !s.isLive && engine.hasMoved() && ((my.item && my.item._serverType) || getServerType()) === 'silo'
  }
  // Segments, chapters, trickplay and what plays next arrive while the item plays.
  function loadExtras(item, info) {
    const id = item.Id
    my.chapters = []
    // Chapters are an item property, so the playback info may come without them.
    if (!s.isLive) {
      const got = (list) => {
        if (s.itemId !== id) return
        my.chapters = (list || []).map((c, i) => ({
          name: c.name || c.Name || `${$L('Chapter')} ${i + 1}`,
          startPositionTicks: c.startPositionTicks != null ? c.startPositionTicks : c.StartPositionTicks,
        }))
        s.chapterList = my.chapters
      }
      if (info.chapters && info.chapters.length) got(info.chapters)
      else playback.fetchItemChapters(id, item).then(got, () => {})
    }
    // playback.getTrickplayInfo asks /Videos/{id}/Trickplay, which 10.11 answers with a 404, so the
    // item's own Trickplay field is read instead, at the widest width up to 320. Plex and Silo answer
    // through their own getTrickplayManifest.
    const type = item._serverType || getServerType()
    if (!s.isLive && (type === 'plex' || type === 'silo')) loadTrickplay(item, info.mediaSourceId)
    const byWidth = !s.isLive && type !== 'plex' && type !== 'silo' && item.Trickplay && item.Trickplay[info.mediaSourceId]
    if (byWidth) {
      const widths = Object.keys(byWidth).map(Number).sort((a, b) => a - b)
      const width = widths.filter((w) => w <= 320).pop() || widths[0]
      my.tp = { info: byWidth[width], width, itemId: id, sourceId: info.mediaSourceId }
      s.osdTp = my.tp
    }
    if (!s.isLive && !props.slideshow) {
      playback.getMediaSegments(id).then((segs) => {
        if (s.itemId === id) my.segments = segs
      })
    }
    my.next = null
    s.hasNext = false
    findAdjacent(item, 1).then((next) => {
      if (s.itemId !== id) return
      my.next = next
      s.hasNext = !!next
    })
  }
  function loadTrickplay(item, sourceId) {
    const id = item.Id
    apiOf(item)
      .getTrickplayManifest(id, sourceId)
      .then((manifest) => {
        if (s.itemId !== id || !manifest) return
        const widths = Object.keys(manifest).map(Number).sort((a, b) => a - b)
        if (!widths.length) return
        const width = widths.filter((w) => w <= 320).pop() || widths[0]
        my.tp = { info: manifest[width], width, itemId: id, sourceId }
        s.osdTp = my.tp
      })
      .catch(() => {})
  }
  // Silo's sheet addresses carry their own credential and stop working at a set time, so the manifest is read
  // again a little before that.
  function refreshTrickplay() {
    const at = my.tp && my.tp.info && Date.parse(my.tp.info.SiloExpiresAt)
    if (!at || at - 120000 >= Date.now() || my.tpRefreshing) return
    my.tpRefreshing = true
    const item = my.item
    loadTrickplay(item, my.tp.sourceId)
    later(() => (my.tpRefreshing = false), 5000)
  }
  // The queue Details handed over, or else the episode either side of this one.
  async function findAdjacent(item, step) {
    if (s.isLive || !item) return null
    if (my.list.length > 1) {
      const id = my.list[my.listPos + step]
      return id ? apiOf(item).getItem(id).then((it) => (props.server ? { ...it, ...props.server } : it)).catch(() => null) : null
    }
    return item.Type === 'Episode' ? playback.getNextEpisode(item, step) : null
  }
  // resolveInitialSubtitle's answer: a stream, null for off, or undefined to leave it be. A burn-in track is
  // already in the picture, and Tizen's embedded one is put on by the engine once AVPlay lists it.
  function applyInitialSubtitle(choice) {
    if (!choice || my.subEarly === choice.index) return
    if (my.burnIn === choice.index || my.nativeSub) {
      my.subIndex = choice.index
      s.subOn = true
      return
    }
    selectSubtitle(choice.index, true)
  }

  function onTime(t) {
    my.pos = t
    // The display only moves when a shown second changes, so a hidden OSD costs nothing.
    if (!s.position || (s.osd && Math.floor(t) !== Math.floor(s.position))) {
      s.position = t
      if (s.osd) updateBuffered()
      if (s.osd && my.tp && refs.controls) refs.controls.warmAt(t * 1000)
    }
    updateCue(t)
    if (my.secEvents) updateSecondaryCue(t)
    if (s.panel === 'secOffset' || s.panel === 'subOffset') updateOffsetTimeline()
    bitmapSubs.tick(t - my.subDelay)
    if (s.isLive) updateLiveWindow(t)
    // A trailer with the Skip button runs no segment prompts of its own.
    if (cinemaActive()) updateCinema(t)
    else checkPopups(t)
  }
  function checkPopups(t) {
    if (s.isLive || !my.info || my.stopped || my.airCard) return
    // When the next episode airs, looked up once per item for the card at the end of one with nothing after it.
    if (my.airFor !== s.itemId) {
      const id = (my.airFor = s.itemId)
      my.airDate = null
      findNextAirDate(my.item, settings.all()).then((a) => {
        if (s.itemId === id) my.airDate = a
      })
    }
    const r = my.popups.check(t * TICKS, {
      segments: my.segments,
      runTicks: s.dur * TICKS,
      hasNext: !!my.next,
      preroll: s.preroll,
      s: settings.all(),
    })
    // Skipping inside a group skips the segment for everyone.
    if (r.skipTo != null && !party.notifyLocal('seek', r.skipTo / TICKS)) engine.seek(r.skipTo / TICKS)
    if (r.playNext) {
      autoAdvance(true)
      return
    }
    setPrompt(r.prompt, r.promptIsNew)
    setNextUp(r.nextUp, r.countdown)
  }
  // The rewindable stretch of a live stream. The live point sits as far behind the range's end as playback first
  // started.
  function updateLiveWindow(t) {
    const now = Date.now()
    if (engine.usesAvplay() && now - my.liveReadAt < LIVE_RANGE_READ_MS) return
    my.liveReadAt = now
    const range = engine.liveRange()
    if (range && my.liveLag == null && !s.paused && t > range.start) my.liveLag = Math.max(0, range.end - t)
    const w = nextLiveWindow(s.liveWindow, liveWindowFor(range, my.liveLag))
    if (w !== s.liveWindow) s.liveWindow = w
  }
  // Cinema Mode's Skip button is up as each trailer starts and gone after ten seconds of it playing, so a
  // pause holds it. Right brings it back, Back puts it away, and Fast Forward skips whether it shows or not.
  function cinemaActive() {
    return s.preroll && settings.get('cinemaModeSkipEnabled') === true && !!my.list[my.listPos + 1] && s.dur > CINEMA_SHOW_SECONDS
  }
  function updateCinema(t) {
    if (my.cinemaWanted) {
      if (my.cinemaFrom == null) my.cinemaFrom = t
      else if (t - my.cinemaFrom >= CINEMA_SHOW_SECONDS) my.cinemaWanted = false
    }
    if (!my.cinemaWanted) {
      if (s.skip && s.skip.cinema) setPrompt(null)
      return
    }
    const left = Math.max(0, s.dur - t)
    setPrompt({ cinema: true, start: -1, label: $L('Skip'), remainingSeconds: Math.round(left), progress: s.dur > 0 ? left / s.dur : 0 }, !(s.skip && s.skip.cinema))
  }
  function skipTrailer() {
    my.cinemaWanted = false
    setPrompt(null)
    playAdjacent({ Id: my.list[my.listPos + 1] }, 1, false)
  }
  // p is popups.js' prompt, which comes back each second with its countdown.
  function setPrompt(p, isNew) {
    if (!p) {
      if (!s.skip) return
      s.skip = null
      s.skipLapsed = false
      cancel(my.lapseTimer)
      if (my.zone === 'skip') focusDefault()
      return
    }
    if (!s.skip || s.skip.start !== p.start || s.skip.remainingSeconds !== p.remainingSeconds) s.skip = { ...p }
    if (!isNew) return
    cancel(my.lapseTimer)
    s.skipLapsed = false
    // Once the Auto Hide Skip Button seconds run out it only shows with the controls, until its segment ends.
    const secs = !p.cinema && { s5: 5, s10: 10 }[settings.get('mediaSegmentAutoHide')]
    if (secs) {
      my.lapseTimer = later(() => {
        my.popups.lapse()
        s.skipLapsed = true
        if (my.zone === 'skip' && !s.osd) focusDefault()
      }, secs * 1000)
    }
    // A new prompt clears the controls away and takes the remote.
    if (s.panel === 'none' && !s.dialog) {
      s.osd = false
      focusRef('skip', 'skip')
    }
  }
  function setNextUp(onNow, countdown) {
    if (onNow && !s.nextUp) {
      const n = my.next
      if (!n) return
      s.nextCard = {
        title: n.Name || '',
        pill: n.ParentIndexNumber != null && n.IndexNumber != null ? `S${n.ParentIndexNumber}:E${n.IndexNumber}` : '',
        image: getImageUrl((my.item && my.item._serverUrl) || getServerUrl(), n.Id, 'Primary', { maxWidth: 400, quality: 80 }),
        minimal: settings.get('nextUpBehavior') === 'minimal',
        airs: '',
        markers: [],
        timeout: settings.get('nextUpTimeout') != null ? settings.get('nextUpTimeout') : 7,
      }
      episodeMarker(n, settings.all()).then((m) => {
        const pills = markerPills(m)
        if (pills.length && s.nextUp && my.next === n) s.nextCard = { ...s.nextCard, markers: pills }
      })
      s.nextCount = countdown
      s.nextUp = true
      // The card takes the remote when it appears, unless a picker or a dialog is up.
      if (s.panel === 'none' && !s.dialog) {
        s.osd = false
        focusRef('nextup', 'nextup')
      }
    } else if (!onNow && s.nextUp) {
      s.nextUp = false
      if (my.zone === 'nextup') focusDefault()
    }
    if (onNow && countdown !== s.nextCount) s.nextCount = countdown
  }
  function onNextUp(id) {
    if (my.airCard) closeAirDate()
    else if (id === 'play') playNextNow()
    else {
      my.popups.dismissNextUp()
      setNextUp(false)
    }
  }
  // The episode ended with nothing after it in the library, so the card says when the next one airs.
  // It closes itself after the Next Up timeout, and closing it leaves the player.
  function showAirDate() {
    const a = my.airDate
    if (my.next || !a || a.itemId !== s.itemId) return false
    s.nextCard = {
      title: a.title,
      pill: `S${a.seasonNumber}:E${a.episodeNumber}`,
      image: '',
      minimal: settings.get('nextUpBehavior') === 'minimal',
      airs: airsText(a.date, new Date(), settings.get('dateFormat')),
      markers: [],
      timeout: 0,
    }
    s.nextCount = null
    my.airCard = true
    s.nextUp = true
    s.panel = 'none'
    s.osd = false
    focusRef('nextup', 'nextup')
    const secs = settings.get('nextUpTimeout') != null ? settings.get('nextUpTimeout') : 7
    if (secs > 0) my.airTimer = later(() => closeAirDate(), secs * 1000)
    return true
  }
  function closeAirDate() {
    if (!my.airCard) return
    cancel(my.airTimer)
    my.airCard = false
    s.nextUp = false
    exit()
  }
  function skipSegment() {
    const p = s.skip
    if (!p) return
    if (p.cinema) return skipTrailer()
    my.consecutive = 0
    // Skipping inside a group skips the segment for everyone.
    if (!party.notifyLocal('seek', p.end / TICKS)) engine.seek(p.end / TICKS)
    dropScrub()
    my.popups.dismissPrompt()
    setPrompt(null)
    // A skip taken by hand lands on the seek bar.
    showOsd()
    focusSeekbar()
  }

  function focusRef(ref, zone) {
    const c = refs[ref]
    const ok = c && !c.destroyed
    my.zone = ok ? zone : 'page'
    if (ok) c.setFocus()
    else if (root) root.setFocus()
  }
  function focusDefault() {
    if (s.dialog) focusRef(s.dialog === 'still' ? 'still' : 'liveFailed', 'dialog')
    else if (MODALS[s.panel]) focusRef(MODALS[s.panel], 'modal')
    else if (s.osd) focusRef('controls', 'controls')
    else if (s.nextUp) focusRef('nextup', 'nextup')
    else if (s.skip && !s.skipLapsed) focusRef('skip', 'skip')
    else {
      my.zone = 'page'
      if (root) root.setFocus()
    }
  }
  // The controls hide after the delay unless playback is paused or a modal is up.
  function armOsdTimer() {
    cancel(my.osdTimer)
    my.osdTimer = later(() => {
      // Paused playback keeps its controls, unless the paused description is waiting for them to go.
      if ((!s.paused || s.pauseInfo) && s.panel === 'none' && !s.dialog) hideOsd()
    }, settings.get('controlsHideDelay') || 5000)
  }
  // Controls that were away come up on the seek bar, apart from Live TV's, and the skip prompt keeps the
  // remote when they come up around it.
  function showOsd() {
    refreshTrickplay()
    const osd = refs.controls
    if (!s.osd && !s.isLive && osd) osd.setRow('progress')
    s.osd = true
    s.position = my.pos
    updateBuffered()
    armOsdTimer()
    if (s.panel === 'none' && !s.dialog && my.zone !== 'skip') focusRef('controls', 'controls')
  }
  // Shows the controls without moving focus.
  function bumpOsd() {
    if (!s.osd) s.position = my.pos
    s.osd = true
    armOsdTimer()
  }
  function hideOsd() {
    s.osd = false
    cancel(my.osdTimer)
    focusDefault()
  }
  function updateBuffered() {
    const end = engine.bufferedEnd(my.pos)
    const b = s.dur > 0 && end > 0 ? Math.min(1, end / s.dur) : progress()
    if (Math.abs(b - s.buffered) > 0.0005) s.buffered = Math.max(b, progress())
  }
  // Where a seek may land: a live stream's rewind window, or the title less its last two seconds.
  function seekBounds() {
    const w = s.liveWindow
    return w ? [w.start, w.edge] : [0, s.dur > 0 ? s.dur - 2 : Infinity]
  }
  function seekTo(to) {
    const [low, high] = seekBounds()
    s.seekTarget = Math.max(low, Math.min(high, to))
    my.consecutive = 0
    my.popups.seeked()
    bumpOsd()
    cancel(my.seekTimer)
    // Repeated presses add up and land as one seek.
    my.seekTimer = later(async () => {
      const at = s.seekTarget
      s.seekTarget = -1
      s.position = at
      my.pos = at
      noteSeek()
      if (!party.notifyLocal('seek', at)) await engine.seek(at)
      my.popups.seeked()
      bumpOsd()
    }, 600)
  }
  function seekBy(delta) {
    seekTo((s.seekTarget >= 0 ? s.seekTarget : engine.currentTime()) + delta)
  }

  function heldStep(dir) {
    const base = Number(settings.get('seekStep')) || 10
    const step = holdStep(my.hold, dir, base, Date.now())
    my.hold = step.hold
    s.stepSec = holdSeekSeconds(base, step.hold.count + 1)
    return step.delta
  }
  function releaseHold() {
    if (my.hold) my.hold.count = 0
    s.stepSec = Number(settings.get('seekStep')) || 10
  }
  // With a preview to look at, a scrub pauses playback so the preview holds still, and only play commits it.
  function beginScrub() {
    if (my.held || !my.tp || settings.get('trickPlayPauseWhileScrubbing') === false || settings.get('trickPlayMode') === 'disabled' || party.isInGroup()) return
    const wasPlaying = !engine.isPaused()
    my.held = { wasPlaying }
    if (wasPlaying) engine.pause()
  }
  function scrubBy(delta) {
    my.consecutive = 0
    my.popups.seeked()
    beginScrub()
    s.seeking = true
    cancel(my.settleTimer)
    if (!my.held) {
      seekBy(delta)
      // A scrub that doesn't hold playback has landed once the presses stop, and the preview goes with it.
      my.settleTimer = later(() => {
        s.seeking = false
      }, 600)
      return
    }
    const [low, high] = seekBounds()
    const base = s.scrubPos >= 0 ? s.scrubPos : my.pos
    s.scrubPos = Math.max(low, Math.min(high, base + delta))
  }
  // A seek with a trickplay preview keeps the buffering animation off for 3 s after it lands.
  function noteSeek() {
    s.seekGrace = true
    cancel(my.graceTimer)
    my.graceTimer = later(() => {
      s.seekGrace = false
    }, 3000)
  }
  function seekNow(at) {
    noteSeek()
    my.popups.seeked()
    s.position = at
    my.pos = at
    if (!party.notifyLocal('seek', at)) engine.seek(at)
  }
  // Play during a held scrub commits it, landing on the scrubbed spot and playing on from there.
  function resumeHeldScrub() {
    const held = my.held
    if (!held) return false
    my.held = null
    s.seeking = false
    if (s.scrubPos >= 0) seekNow(s.scrubPos)
    s.scrubPos = -1
    engine.play()
    return true
  }
  // Moving off the bar lands a held scrub where it is and stays paused.
  function settleHeldScrub() {
    if (!my.held || s.scrubPos < 0) return
    seekNow(s.scrubPos)
    s.scrubPos = -1
  }
  // A skip or a chapter jump lands somewhere the scrub knows nothing about, so a held scrub is dropped.
  function dropScrub() {
    const held = my.held
    if (!held) return
    my.held = null
    s.seeking = false
    s.scrubPos = -1
    if (held.wasPlaying) engine.play()
  }

  // Every key on the controls restarts their hide timer. Up on live TV opens the channel carousel, and the skip
  // prompt takes Up from the seek bar.
  function onOsdKey(name, row) {
    bumpOsd()
    if (name === 'up' && s.isLive) {
      openCarousel()
      return true
    }
    if (row === 'progress' && (name === 'up' || name === 'down')) {
      settleHeldScrub()
      s.seeking = false
      if (name === 'up' && skipShown()) {
        focusRef('skip', 'skip')
        return true
      }
    }
    return false
  }
  function onScrub(dir) {
    scrubBy(heldStep(dir))
  }
  function onProgressEnter() {
    if (resumeHeldScrub()) {
      showOsd()
      return
    }
    s.seeking = false
    togglePlay()
  }
  // Right from the last button reaches the skip prompt.
  function onOsdEdge(side) {
    if (side === 'right' && skipShown()) focusRef('skip', 'skip')
  }
  function focusSeekbar() {
    if (refs.controls) refs.controls.setRow('progress')
    focusRef('controls', 'controls')
  }
  function togglePlay() {
    if (resumeHeldScrub()) {
      showOsd()
      return
    }
    my.consecutive = 0
    if (party.notifyLocal(engine.isPaused() ? 'play' : 'pause')) {
      showOsd()
      return
    }
    if (engine.isPaused()) unpause()
    else engine.pause()
    s.paused = engine.isPaused()
    if (s.paused && s.pauseInfo) hideOsd()
    else showOsd()
  }
  // Playing again goes back the Unpause Rewind seconds first.
  function unpause() {
    const rewind = Number(settings.get('unpauseRewind')) || 0
    if (rewind > 0) seekNow(Math.max(0, engine.currentTime() - rewind))
    engine.play()
  }
  // Left and Right that reach the page: with the controls away they come up on the seek bar and take a step,
  // a slideshow's video steps through the slideshow, and on the skip prompt Left goes to the seek bar.
  function arrow(dir) {
    const z = my.zone
    if (z === 'skip') {
      if (dir < 0 && s.osd) focusSeekbar()
      else if (dir > 0) showOsd()
      return
    }
    if (z !== 'page') return
    if (props.slideshow) return stepSlideshow(dir)
    if (dir > 0 && !s.osd && cinemaActive() && !my.cinemaWanted) {
      my.cinemaWanted = true
      my.cinemaFrom = null
      updateCinema(my.pos)
      return
    }
    showOsd()
    if (s.isLive && !s.liveWindow) return
    focusSeekbar()
    onScrub(dir)
  }
  // Up and Down that reach the page. Live TV's Up opens the carousel. With the controls away, a skip prompt
  // brings them up on itself, even once its seconds ran out, and otherwise they come up on the seek bar.
  function vertical(name) {
    const z = my.zone
    if (name === 'up' && s.isLive && s.panel === 'none' && (!s.dialog || s.dialog === 'lost')) return openCarousel()
    if (z === 'skip') {
      showOsd()
      if (name === 'down') focusSeekbar()
      return
    }
    if (z !== 'page') return
    if (s.skip && !s.osd) {
      showOsd()
      focusRef('skip', 'skip')
      return
    }
    showOsd()
  }

  function updateCue(t) {
    // AVPlay hands its own track's lines over as they come ('cue').
    if (my.nativeSub) return
    const events = my.cues
    if (!events) {
      if (s.cue) s.cue = ''
      return
    }
    const text = my.cueText(events, (t - my.subDelay) * TICKS)
    if (text !== s.cue) s.cue = text
  }
  function subStyle() {
    return resolveSubtitleStyleSettings(settings.all(), my.isHdr)
  }
  function applySubtitleStyle() {
    const st = subStyle()
    s.subSize = getSubtitleFontPx(st)
    s.secSize = st.secondarySubtitleSize > 0 ? st.secondarySubtitleSize : s.subSize
    drawSubs()
    bitmapSubs.setFontScale(getAssFontScale(st))
  }
  // Both tracks' lines are one picture, drawn again when a line or the look changes. They stay
  // put under the controls while those show.
  function drawSubs() {
    if (gone) return
    const streams = (my.info && my.info.subtitleStreams) || []
    const lang = (index) => {
      const stream = index != null && streams.find((x) => x.index === index)
      return stream ? languageTag(stream.language) : undefined
    }
    const langs = { primary: lang(my.subIndex), secondary: lang(my.secIndex) }
    const pic = drawSubtitles(s.cue, s.secCue, subStyle(), s.secOn, () => drawSubs(), langs)
    if (!pic) {
      s.subTex = null
      return
    }
    s.subX = pic.x
    s.subY = pic.y
    s.subW = pic.w
    s.subH = pic.h
    s.subAlpha = pic.alpha
    // The texture holds the pixels only until they're on the GPU, so a long film's lines don't pile up in memory.
    // shortcut: a picture the renderer evicts and reloads comes back blank until the next line, which only happens
    // after the player was hidden. Keep the pixels if that ever shows.
    let held = pictureData(pic)
    if (!held) {
      s.subTex = null
      return
    }
    const tex = getRenderer().stage.txManager.createTexture('ImageTexture', { src: () => held })
    tex.once('loaded', () => (held = null))
    s.subTex = tex
  }

  // The second track and its delay belong to one item, and a fresh start of the same item keeps both.
  function prepareSecondary(itemId) {
    if (my.secItemId === itemId) return
    my.secItemId = itemId
    clearSecondary()
    my.secDelay = 0
  }
  function clearSecondary() {
    my.secGen++
    my.secIndex = null
    my.secEvents = null
    s.secCue = ''
    if (s.secOn) {
      s.secOn = false
      applySubtitleStyle()
    }
  }
  // Nothing waits on the fetch, the lines fill in once the server answers.
  function loadSecondary(stream) {
    const gen = ++my.secGen
    my.secIndex = stream.index
    my.secEvents = null
    s.secCue = ''
    trackFetch(playback.fetchSubtitleData(stream)).then((data) => {
      if (gen !== my.secGen) return
      my.secEvents = (data && data.TrackEvents) || null
      if (s.secOn !== !!my.secEvents) {
        s.secOn = !!my.secEvents
        applySubtitleStyle()
      }
      if (my.secEvents) updateSecondaryCue(my.pos)
    })
  }
  function selectSecondary(index) {
    const streams = (my.info && my.info.subtitleStreams) || []
    const stream = index >= 0 ? streams.find((x) => x.index === index) : null
    if (stream && isSecondaryEligible(stream)) loadSecondary(stream)
    else clearSecondary()
    saveSecondarySubtitlePref(my.item, secondarySelection(streams, stream ? stream.index : -1))
  }
  // Puts back the track remembered for this item, unless it's now the primary.
  async function restoreSecondary(item, streams, primary) {
    if (settings.get('secondarySubtitlesEnabled') !== true) return
    const saved = await getItemSecondarySubtitlePref(item.Id)
    if (my.secItemId !== item.Id) return
    const restored = restoreSecondaryIndex(saved, streams)
    const stream = restored >= 0 && restored !== primary ? streams.find((x) => x.index === restored) : null
    if (stream) loadSecondary(stream)
    else clearSecondary()
  }
  function secondaryStreams() {
    return secondaryCandidates((my.info && my.info.subtitleStreams) || [], my.subIndex, {
      preferExternal: settings.get('preferExternalSubtitles') === true,
      preferredLanguage: settings.get('preferredSecondarySubtitleLanguage'),
    })
  }
  // The Subtitles button asks which slot first while the setting is on and there's something for
  // the second one. A track already showing keeps the step so it can still be turned off.
  function secondaryOffered() {
    if (s.isLive || !my.info) return false
    return my.secIndex != null || (settings.get('secondarySubtitlesEnabled') === true && secondaryStreams().length > 0)
  }
  function updateSecondaryCue(t) {
    const text = secondaryCueText(my.secEvents, t * TICKS, my.secDelay) || ''
    if (text !== s.secCue) s.secCue = text
  }
  function setSecondaryDelay(seconds) {
    my.secDelay = clampSecondaryDelay(seconds)
    if (my.secEvents) updateSecondaryCue(my.pos)
  }
  // The offset strip moves the primary track's lines or the second one's, whichever opened it.
  function onOffsetChange(seconds) {
    if (s.panel === 'subOffset') {
      my.subDelay = seconds
      updateCue(my.pos)
    } else setSecondaryDelay(seconds)
    s.offsetShown = s.panel === 'subOffset' ? my.subDelay : my.secDelay
    updateOffsetTimeline()
  }
  // The strip's timeline follows the playhead while it's open.
  function updateOffsetTimeline() {
    // An ASS track drawn by libass has no cues of its own, so its timeline reads the script's lines.
    if (s.panel === 'subOffset') s.offsetTimeline = buildSubtitleTimeline(my.cues || bitmapSubs.assEvents(), my.pos, my.subDelay)
    else if (s.panel === 'secOffset') s.offsetTimeline = buildSubtitleTimeline(my.secEvents, my.pos, my.secDelay)
  }
  // The second track's settings stay on this device, settings sync never sends them.
  function onSecondaryStep(key, dir) {
    settings.set(key, stepSecondarySetting(settings.all(), key, dir, s.subSize))
    applySubtitleStyle()
    fillSecondarySettings()
  }
  function fillSecondarySettings() {
    const st = settings.all()
    const colors = getSecondarySubtitleColorOptions()
    s.secSizeShown = s.secSize
    s.secOffsetShown = st.secondarySubtitleOffset
    s.secColorLabel = (colors.find((c) => c.value === st.secondarySubtitleColor) || colors[0]).label
  }
  function slotLabel(index) {
    const stream = index != null && ((my.info && my.info.subtitleStreams) || []).find((x) => x.index === index)
    return stream ? stream.displayTitle || stream.language || $L('Subtitle') : $L('None')
  }
  // Whether the subtitle picked last is still on its way. Each load takes over from the one before, so a slow
  // answer for a track already left can't keep the indicator up.
  function trackFetch(promise) {
    const token = ++my.fetchToken
    showFetching(true)
    const done = () => {
      if (token === my.fetchToken) showFetching(false)
    }
    promise.then(done, done)
    return promise
  }
  function clearSubtitleFetch() {
    my.fetchToken = (my.fetchToken || 0) + 1
    showFetching(false)
  }
  function showFetching(onNow) {
    cancel(my.fetchTimer)
    if (!onNow) {
      if (s.fetching) s.fetching = false
      return
    }
    my.fetchTimer = later(() => (s.fetching = true), FETCH_SHOW_DELAY_MS)
  }
  async function loadCues(stream, quiet) {
    const index = stream.index
    const data = await trackFetch(playback.fetchSubtitleData(stream))
    if (my.subIndex !== index) return
    my.cues = data && data.TrackEvents ? data.TrackEvents.slice().sort((a, b) => a.StartPositionTicks - b.StartPositionTicks) : null
    if (!my.cues && !quiet) toast($L('Subtitles could not be loaded'))
  }
  // An SRT track left inside the file is read out of it near the playhead, and only a track that can't be read
  // that way is asked of the server.
  function startInBandText(stream) {
    disposeTextSource()
    const index = stream.index
    const { streamUrl, ordinal, language } = stream.inBandText
    const source = createInBandTextSource({
      streamUrl,
      subtitleOrdinal: ordinal,
      language,
      getTime: () => engine.currentTime() - my.subDelay,
      onEvents: (events) => {
        if (my.textSource !== source || my.subIndex !== index) return
        my.cues = (my.cues || []).concat(events).sort((x, y) => x.StartPositionTicks - y.StartPositionTicks)
        updateCue(my.pos)
      },
    })
    my.textSource = source
    source.ready.then((ok) => {
      if (my.textSource !== source || ok) return
      my.textSource = null
      if (my.subIndex === index) loadCues(stream, true)
    })
  }
  function disposeTextSource() {
    if (my.textSource) my.textSource.dispose()
    my.textSource = null
  }
  // Whatever draws the primary track stops: the cues, libass and libpgs, the file reader, and the host's or AVPlay's own.
  function clearSubtitleDrawing() {
    my.cues = null
    s.cue = ''
    clearSubtitleFetch()
    bitmapSubs.stop()
    disposeTextSource()
    my.nativeSub = false
    if (engine.usesAvplay()) engine.silenceNativeSubtitles()
    else engine.showHostSubtitle(-1)
  }
  // dvd and dvb bitmaps have no renderer here, so the server burns them into the picture, which needs the stream
  // again whenever one is picked or dropped.
  async function reloadWithSubtitle(index) {
    const at = my.pos
    s.buffering = true
    const info = await playback.changeSubtitleStream(index)
    if (info && info.url && !gone) await restart(info, at)
  }
  // A track the viewer picked, or the start's own pick when quiet.
  async function selectSubtitle(index, quiet) {
    // Picking the second track's file as the primary takes it over.
    if (index >= 0 && index === my.secIndex) selectSecondary(-1)
    const streams = (my.info && my.info.subtitleStreams) || []
    const stream = index >= 0 ? streams.find((x) => x.index === index) : null
    const tizen = engine.usesAvplay()
    my.subIndex = index
    s.subOn = index >= 0
    clearSubtitleDrawing()
    playback.updateCurrentSession({ subtitleStreamIndex: index })
    // A pick by hand is remembered for the item and its series.
    if (!quiet) saveSubtitlePref(my.item, index, streams)
    try {
      // Leaving a burned-in track needs a stream without it, or it stays in the picture under the new pick.
      if (my.burnIn != null && !(stream && stream.isBurnIn)) {
        my.burnIn = null
        await reloadWithSubtitle(index)
        if (my.subIndex !== index) return
      }
      if (!stream) return
      if (tizen && stream.isEmbeddedNative && engine.selectNativeSubtitle(stream, streams)) {
        my.nativeSub = true
        return
      }
      if (stream.isBurnIn) {
        if (my.burnIn !== index) {
          await reloadWithSubtitle(index)
          my.burnIn = index
        }
        return
      }
    } catch (e) {
      if (!playback.isEndedOnServer(e) && !quiet) toast($L('Could not switch subtitles'))
      return
    }
    if (!tizen && stream.hostRendered && engine.showHostSubtitle(index)) return
    const pgsOn = settings.get('enablePgsRendering') !== false
    if (tizen && stream.isEmbeddedNative && stream.isImageBased && pgsOn) return startPgs(stream, quiet)
    if (stream.isAss && bitmapSubs.canDrawAss()) {
      const onError = () => {
        bitmapSubs.stop()
        if (my.subIndex === index) loadCues(stream, true)
      }
      if (await trackFetch(bitmapSubs.startAss(stream, getAssFontScale(subStyle()), onError))) {
        bitmapSubs.setPaused(engine.isPaused(), my.pos)
        bitmapSubs.tick(my.pos - my.subDelay)
        // The worker reads the whole track and its fonts, which takes a while on a slow TV.
        trackFetch(bitmapSubs.ready(ASS_FETCH_INDICATOR_LIMIT, () => my.subIndex === index))
      } else if (my.subIndex === index) await loadCues(stream, quiet)
      return
    }
    if (!tizen && stream.inBandText) return startInBandText(stream)
    if (stream.isTextBased || (tizen && stream.isEmbeddedNative)) return loadCues(stream, quiet)
    if (stream.isImageBased && pgsOn) return startPgs(stream, quiet)
  }
  async function startPgs(stream, quiet) {
    const index = stream.index
    if (await bitmapSubs.startPgs(stream, my.pos - my.subDelay)) bitmapSubs.tick(my.pos - my.subDelay)
    else if (!quiet && my.subIndex === index) toast($L('Subtitles could not be loaded'))
  }
  // AVPlay never put the embedded track on, so the same track is drawn here instead.
  function nativeFallback(stream) {
    if (my.subIndex !== stream.index) return
    my.nativeSub = false
    engine.silenceNativeSubtitles()
    if (stream.isImageBased && settings.get('enablePgsRendering') !== false) startPgs(stream, true)
    else if (stream.isTextBased) loadCues(stream, true)
  }

  function openPanel(kind) {
    if (!my.info) return
    if (MODALS[kind]) openModal(kind)
  }
  function closePanel() {
    stopSleepTicker()
    s.panel = 'none'
    showOsd()
    // Focus goes back to what opened the modal. The subtitle picker's Offset, Appearance and Download rows are
    // gone by then, so focus lands on play and pause.
    if (my.lostFocus) {
      my.lostFocus = false
      if (refs.controls) refs.controls.focusRow('bottom')
    }
  }
  // The controls hide while a modal is up and come back when it closes. The panel is set first, since the
  // modals mount while they show.
  function openModal(kind) {
    stopSleepTicker()
    s.panel = kind
    const track = refs.track
    const cancelRows = [{ divider: true }, { id: 'cancel', label: $L('Cancel'), dimmed: true }]
    if (kind === 'audio') {
      track.open({
        title: $L('Audio Track'),
        rows: (my.info.audioStreams || [])
          .map((st, i) => ({
            id: st.index,
            label: numberedTrackName(i + 1, st.displayTitle, $L('Audio')),
            detail: audioTrackDetail({ language: st.language, displayTitle: st.displayTitle, codec: st.codec, channels: st.channels }),
            selected: st.index === my.audioIndex,
          }))
          .concat(cancelRows),
      })
    } else if (kind === 'subs') {
      // Right from a track jumps to Appearance and Left to Offset.
      const jump = { left: 'offset', right: 'appearance' }
      const streams = sortSubtitleStreams(my.info.subtitleStreams || [], settings.get('preferExternalSubtitles') === true)
      track.open({
        title: $L('Subtitle Track'),
        rows: [{ id: -1, label: $L('None'), selected: my.subIndex === -1, ...jump }].concat(
          streams.map((st, i) => ({ ...subtitleRow(st, i), selected: st.index === my.subIndex, ...jump })),
          [
            { divider: true },
            { id: 'offset', label: $L('Offset'), detail: offsetLabel(my.subDelay) },
            { id: 'appearance', label: $L('Appearance') },
          ],
          s.itemId ? [{ id: 'download', label: $L('Download subtitles...'), detail: $L('Search using OpenSubtitles') }] : [],
          cancelRows
        ),
      })
    } else if (kind === 'subSlot') {
      track.open({
        title: $L('Subtitles'),
        rows: [
          { id: 'primary', label: $L('Primary'), detail: slotLabel(my.subIndex) },
          { id: 'secondary', label: $L('Secondary'), detail: slotLabel(my.secIndex) },
          ...cancelRows,
        ],
      })
    } else if (kind === 'secSubs') {
      const streams = secondaryStreams().map((st, i) => ({ ...subtitleRow(st, i), selected: st.index === my.secIndex }))
      track.open({
        title: $L('Secondary Subtitle Track'),
        rows: [{ id: -1, label: $L('None'), selected: my.secIndex == null }].concat(
          streams,
          [
            { divider: true },
            { id: 'offset', label: $L('Offset'), detail: offsetLabel(my.secDelay) },
            { id: 'appearance', label: $L('Appearance') },
          ],
          cancelRows
        ),
      })
    } else if (kind === 'sleep') {
      const armed = my.sleep.minutes()
      track.open({
        title: $L('Sleep timer'),
        rows: [{ id: 0, label: $L('Off'), selected: armed == null }].concat(
          SLEEP_TIMER_MINUTES.map((m) => ({ id: m, label: $L('{count} minutes').replace('{count}', m), selected: m === armed }))
        ),
        footers: sleepFooters(),
      })
      // The time left only ticks while this list is open, so the player isn't redrawn every second.
      if (armed != null) my.sleepTick = every(() => sleepFooter(), 1000)
    } else if (kind === 'secAppearance') {
      fillSecondarySettings()
      refs.secSettings.open()
    } else if (kind === 'subSettings') {
      refs.subSettings.open(my.isHdr)
    } else if (kind === 'secOffset' || kind === 'subOffset') {
      s.offsetShown = kind === 'subOffset' ? my.subDelay : my.secDelay
      refs.offset.open()
    } else if (kind === 'episodes') refs.episodes.open(my.item)
    else if (kind === 'info') fillInfo()
    else if (kind === 'chapters') openChapters()
    else if (kind === 'cast') refs.castModal.open(my.item)
    else if (kind === 'channels') fillCarousel()
    else if (kind === 'download') openSubtitleSearch()
    else if (kind === 'record') refs.record.open(recording(), my.item)
    else if (kind === 'quality') {
      const chosen = my.quality == null ? null : my.quality
      track.open({
        title: $L('Max Bitrate'),
        rows: getQualityPresets().map((q) => ({ id: q.value, label: q.label, selected: q.value === chosen })),
        footers: [`${$L('Current')}: ${(my.info && my.info.playMethod) || $L('Unknown')}`],
      })
    }
    updateOffsetTimeline()
    // The controls stay up under a modal, only not drawn, so closing it gives focus back to the button that
    // opened it.
    cancel(my.osdTimer)
    focusDefault()
  }
  function subtitleRow(st, i) {
    return {
      id: st.index,
      label: numberedTrackName(i + 1, st.displayTitle, $L('Subtitle')),
      detail: subtitleTrackDetail({
        name: st.displayTitle,
        codec: st.codec,
        language: st.language,
        isExternal: st.isExternal,
        deliveryMethod: st.deliveryMethod,
        isForced: st.isForced,
        isHearingImpaired: st.isHearingImpaired,
      }),
    }
  }
  function onTrackRow(id) {
    const kind = s.panel
    if (id === 'cancel') return closePanel()
    if (kind === 'subs' && (id === 'offset' || id === 'appearance' || id === 'download')) my.lostFocus = true
    if (kind === 'subs' && id === 'offset') return openPanel('subOffset')
    if (kind === 'subs' && id === 'appearance') return openPanel('subSettings')
    if (kind === 'subs' && id === 'download') return openPanel('download')
    if (kind === 'subSlot') return openPanel(id === 'secondary' ? 'secSubs' : 'subs')
    if (kind === 'secSubs' && id === 'offset') return openPanel('secOffset')
    if (kind === 'secSubs' && id === 'appearance') return openPanel('secAppearance')
    closePanel()
    if (kind === 'audio') selectAudio(id)
    else if (kind === 'subs') selectSubtitle(id)
    else if (kind === 'secSubs') selectSecondary(id)
    else if (kind === 'sleep') setSleep(id)
    else if (kind === 'quality') selectQuality(id)
  }
  // OpenSubtitles through the server, in the Subtitle Download Languages or one guessed from the tracks.
  // The search mounts with what it searches for.
  function openSubtitleSearch() {
    const subs = my.info.subtitleStreams || []
    const audio = my.info.audioStreams || []
    const sub = subs.find((x) => x.index === my.subIndex)
    const aud = audio.find((x) => x.index === my.audioIndex)
    const languages = subtitleDownloadLanguages(
      settings.get('subtitleDownloadLanguages'),
      toSubtitleLanguage(settings.get('subtitleLanguage'), sub && sub.language, aud && aud.language, subs[0] && subs[0].language, audio[0] && audio[0].language)
    )
    s.subsearch = { itemId: s.itemId, languages, key: Date.now() }
  }
  // The server writes the file and lists it a while later, so the item is asked again until the new track shows,
  // then the stream is negotiated once and the track is put on.
  async function onRemoteSubtitlePick(result) {
    const item = my.item
    const existing = ((my.info && my.info.subtitleStreams) || []).map((x) => x.index)
    await apiOf(item).downloadRemoteSubtitle(item.Id, result.id)
    const sourceId = my.info.mediaSourceId
    const appeared = await pollForSubtitleAppearance(async () => {
      const fresh = await apiOf(item).getItemMediaInfo(item.Id)
      const src = ((fresh && fresh.MediaSources) || []).find((m) => m.Id === sourceId) || ((fresh && fresh.MediaSources) || [])[0]
      return ((src && src.MediaStreams) || []).find((m) => m.Type === 'Subtitle' && existing.indexOf(m.Index) < 0) || null
    })
    if (!appeared) return remoteSubtitleNotAppearedMessage()
    const info = await apiOf(item).getPlaybackInfo(item.Id, {
      StartTimeTicks: Math.floor(my.pos * TICKS),
      MediaSourceId: sourceId,
      AudioStreamIndex: my.audioIndex,
      SubtitleStreamIndex: my.subIndex,
      MaxStreamingBitrate: my.quality || settings.get('maxBitrate'),
    })
    const ms = ((info && info.MediaSources) || []).find((m) => m.Id === sourceId) || ((info && info.MediaSources) || [])[0]
    if (my.item !== item) return null
    // Tizen keeps the embedded tracks AVPlay reads itself.
    my.info = {
      ...my.info,
      subtitleStreams: mapSubtitleStreamsFromMediaSource(ms, item._serverUrl || getServerUrl(), { includeEmbeddedNative: engine.usesAvplay() }),
    }
    s.subCount = my.info.subtitleStreams.length
    closePanel()
    selectSubtitle(appeared.Index)
    return null
  }
  function onSubtitleSearchClose() {
    closePanel()
  }
  function stopSleepTicker() {
    cancel(my.sleepTick)
    my.sleepTick = null
  }
  function sleepFooters() {
    const left = my.sleep.remainingSeconds()
    const stopping = my.sleep.minutes() != null && left > 0 ? [$L('Stopping in {time}').replace('{time}', clock(left))] : []
    return stopping.concat([$L('Press BACK to close')])
  }
  function sleepFooter() {
    // A dialog can take the list down without closePanel, and then the ticker stops itself.
    if (s.panel !== 'sleep' || !refs.track) return stopSleepTicker()
    refs.track.setFooters(sleepFooters())
  }
  function setSleep(minutes) {
    my.sleep.start(minutes)
    s.sleepOn = my.sleep.minutes() != null
  }
  // A part watched episode carries on where it stopped and the one playing just closes the browser.
  async function onEpisode(ep) {
    closePanel()
    if (String(ep.Id) === String(s.itemId)) return
    my.consecutive = 0
    await stopSession()
    const at = my.list.indexOf(ep.Id)
    if (at >= 0) my.listPos = at
    else {
      my.list = [ep.Id]
      my.listPos = 0
    }
    my.cues = null
    s.cue = ''
    await start(ep.Id, (ep.UserData && ep.UserData.PlaybackPositionTicks) || 0)
    showOsd()
  }
  // The host's audio output and the transcode are asked for each time the dialog opens, and the rows
  // go without them until they answer.
  async function fillInfo() {
    const box = refs.playInfo
    const sections = (hostAudioOutput, transcodingInfo) =>
      buildPlaybackInfo({
        session: playback.getCurrentSession(),
        playMethod: my.info.playMethod,
        selectedAudioIndex: my.audioIndex,
        selectedSubtitleIndex: my.subIndex,
        maxBitrate: my.quality || settings.get('maxBitrate'),
        transcodeForced: !!settings.get('preferTranscode'),
        isLiveTV: s.isLive,
        item: my.item,
        liveProgram: s.liveProgram,
        isTizen: getPlatform() === 'tizen',
        hostAudioOutput,
        hostDisplay: getHostDisplay(),
        // Only where the platform says the web player's count is worth reading.
        droppedFrames: (playback.getCurrentSession() || {}).capabilities && playback.getCurrentSession().capabilities.watchesDroppedFrames ? engine.droppedFrames() : null,
        transcodingInfo,
      })
    box.open(sections(null, null))
    const [hostAudioOutput, transcodingInfo] = await Promise.all([
      getHostAudioOutput().catch(() => null),
      playback.getTranscodingInfo().catch(() => null),
    ])
    if (s.panel === 'info' && my.info && refs.playInfo === box) box.setSections(sections(hostAudioOutput, transcodingInfo))
  }
  // Chapters live on the item, and the list asks the server when the item came without them.
  async function openChapters() {
    const item = my.item
    const chapters = s.isLive ? [] : await playback.fetchItemChapters(s.itemId, item)
    if (s.panel !== 'chapters' || my.item !== item || !refs.chapterModal) return
    refs.chapterModal.open({ chapters, at: my.pos, item })
  }
  function onChapter(ticks) {
    closePanel()
    seekTo(ticks / TICKS)
  }
  // The person's page takes the player's place, so Back from there skips the player.
  async function onCastMember(person) {
    if (!person || !person.Id) return
    my.recovery.abandon('the viewer left the player')
    await stopSession()
    router.currentRoute.options.inHistory = false
    router.to(`/person/${person.Id}`)
  }
  // A new cap loads the item again from where it is.
  async function selectQuality(value) {
    if (value === (my.quality == null ? null : my.quality)) return
    my.quality = value
    s.qualityOn = value != null
    const at = my.pos
    await stopSession()
    await start(s.itemId, Math.floor(at * TICKS), {
      audioStreamIndex: my.audioIndex,
      subtitleStreamIndex: my.subIndex,
      mediaSourceId: my.info && my.info.mediaSourceId,
    })
    showOsd()
  }
  // Direct play switches in the player when the set decodes the track, and only the rest goes back to the server,
  // which sends the stream again with only that track in it.
  async function selectAudio(index) {
    if (index === my.audioIndex) return
    const streams = (my.info && my.info.audioStreams) || []
    const target = streams.find((x) => x.index === index)
    my.audioIndex = index
    // Saved here, since the switch leaves by several routes and the choice was made either way.
    saveAudioPref(my.item, index, streams)
    my.triedTranscode = false
    my.forceHlsJs = false
    my.hlsRetries = 0
    const st = settings.all()
    // Only direct play has every track, since a remux carries the one the server built it around.
    if (my.info && my.info.playMethod === playback.PlayMethod.DirectPlay && !transcodesAudioCodec(st, target && target.codec)) {
      // A track AVPlay can't decode freezes the picture once switched to, so Tizen asks first.
      const playable = !engine.usesAvplay() || (await playback.canPlayAudioStreamNatively(asServerAudioStream(target)))
      try {
        if (playable && engine.switchAudio(index, streams)) {
          playback.updateCurrentSession({ audioStreamIndex: index })
          return
        }
      } catch (e) {
        // The server sends it instead.
      }
    }
    await reloadWithAudio(index)
  }
  async function reloadWithAudio(index) {
    const at = my.pos
    s.buffering = true
    try {
      const info = await playback.changeAudioStream(index, Math.floor(at * TICKS))
      if (!info || gone) return
      // A direct play url the element already has wouldn't load again.
      const direct = info.playMethod === playback.PlayMethod.DirectPlay
      const url = direct ? `${info.url}${info.url.indexOf('?') >= 0 ? '&' : '?'}_audioSwitch=${Date.now()}` : info.url
      if (info.audioStreams) s.audioCount = info.audioStreams.length
      if (info.subtitleStreams) s.subCount = info.subtitleStreams.length
      await restart({ ...info, url }, at, {
        ...keptTracks(info),
        audio: direct ? { streamIndex: index, audioStreams: info.audioStreams || (my.info && my.info.audioStreams) || [], afterReload: true } : null,
      })
    } catch (e) {
      if (!playback.isEndedOnServer(e)) toast($L('Could not switch audio track'))
    }
  }

  function onOsdAction(action) {
    bumpOsd()
    if (action === 'playPause') togglePlay()
    else if (action === 'rewind') {
      dropScrub()
      seekBy(-skipBackSeconds(settings.all()))
    } else if (action === 'forward') {
      dropScrub()
      seekBy(skipForwardSeconds(settings.all()))
    } else if (action === 'next') playNextNow()
    // Nothing is queued behind a video, so Previous restarts it.
    else if (action === 'prevTrack') {
      dropScrub()
      seekNow(0)
    } else if (action === 'audio') openPanel('audio')
    else if (action === 'subtitle') openPanel(secondaryOffered() ? 'subSlot' : 'subs')
    else if (action === 'chapter') openPanel('chapters')
    else if (action === 'channels') openCarousel()
    else if (action === 'guide') openGuide()
    else if (action === 'record') openRecord()
    else if (action === 'zoom') toggleZoom()
    else if (action === 'jumpToLive') jumpToLive()
    else if (action === 'favorite') toggleFavorite()
    // The party's chat bar and people panel are the layer's, and the controls hide under them as under any modal.
    else if (action === 'partyChat' || action === 'party') {
      if (action === 'party' ? openPartyPanel(closePanel) : openPartyChat(closePanel)) s.panel = action
    }
    else if (MODALS[action]) openPanel(action)
  }
  // A Moonbase party that's playing adds Chat and the party's people to the controls.
  function syncParty() {
    const p = party.state().party || {}
    const onNow = p.backend === 'moonbase' && !!p.room && p.room.phase === 'playing'
    if (onNow !== s.inParty) s.inParty = onNow
  }
  // A slideshow's own video steps to the item before or after it, which stops this one and hands over.
  async function stepSlideshow(dir) {
    if (my.stepping) return
    my.stepping = true
    my.recovery.abandon('the viewer left the player')
    await stopSession()
    props.slideshow.onStep(dir)
  }
  // The Record button's dialog, opened on what the server has now.
  function openRecord() {
    recording()
      .prepare()
      .then((ready) => ready && !gone && openModal('record'))
  }
  // The airing program's recording, which sets the Record button and fills its dialog.
  function recording() {
    if (!my.rec) {
      my.rec = createLiveRecording({
        api: () => (s.isLive && my.item ? liveTvApiFor(my.item._serverUrl) : null),
        program: () => s.liveProgram,
        onChange: (st) => {
          if (s.recordable !== st.available) s.recordable = st.available
          if (s.recordMark !== st.mark) s.recordMark = st.mark
          if (!st.available && s.panel === 'record') closePanel()
        },
        toast: (message) => {
          if (refs.record) refs.record.toast(message)
        },
        onChanged: () => my.live && my.live.refreshRecordings(),
      })
    }
    return my.rec
  }
  function jumpToLive() {
    const w = s.liveWindow
    if (!w) return
    dropScrub()
    seekNow(w.edge)
    if (engine.isPaused()) {
      engine.play()
      my.recovery.setPaused(false)
    }
  }
  // Fit, Zoom to Fill and Stretch in turn, kept as the Zoom setting.
  function toggleZoom() {
    const next = s.zoomMode === 'fit' ? 'fill' : s.zoomMode === 'fill' ? 'stretch' : 'fit'
    s.zoomMode = next
    settings.set('playerZoomMode', zoomSettingFromInternal(next))
    engine.setZoom(next, my.aspect)
  }
  async function toggleFavorite() {
    const item = my.item
    if (!item || !item.Id) return
    const onNow = !s.isFavorite
    s.isFavorite = onNow
    if (s.isLive && my.live) my.live.markFavorite(item.Id, onNow)
    try {
      await apiOf(item).setFavorite(item.Id, onNow)
    } catch (e) {
      if (my.item !== item) return
      s.isFavorite = !onNow
      if (s.isLive) {
        if (my.live) my.live.markFavorite(item.Id, !onNow)
        if (refs.record) refs.record.toast($L('Failed to update favorite channel'))
      }
    }
  }

  // The lineup, the warm guide data and channel switches.
  function liveSwitch() {
    if (!my.live) {
      my.live = createChannelSwitch({
        play: (channel) => tune(channel),
        onFailed: (channel) => {
          if (s.panel === 'channels' && refs.carousel) refs.carousel.showNotice($L('Failed to play {name}').replace('{name}', channel.Name || ''))
        },
        onSucceeded: () => {
          if (s.panel === 'channels') closeCarousel(false)
        },
        onRestore: (channel) => {
          if (s.panel === 'channels' && refs.carousel) refs.carousel.sync(channel.Id)
        },
      })
    }
    return my.live
  }
  function loadLineup() {
    if (my.item) liveSwitch().tuned(my.item, settings.get('liveTvChannelSortBy'))
  }
  // Channel up and down zap through the lineup, and a channel that fails to start hands back to
  // the one that was playing.
  function stepChannel(step) {
    liveSwitch().step(step)
  }
  // Opens a channel in place of the one playing. Switches reach it through liveSwitch.
  async function tune(channel) {
    my.recovery.abandon('the viewer changed channel')
    my.lostPending = false
    if (s.dialog === 'lost') {
      s.dialog = ''
      focusDefault()
    }
    await stopSession()
    await start(channel.Id, 0)
    if (s.osd && s.panel === 'none' && !s.dialog) showOsd()
  }
  function retryChannel() {
    my.recovery.abandon('the viewer retried the channel')
    tune(my.item || { Id: s.itemId })
  }
  function channelPlaying() {
    if (my.live) my.live.playing(s.itemId)
  }
  // A live channel that can't play. A switch goes back to the channel before, the carousel
  // holds the failed card back until it closes, and otherwise the card shows.
  function liveFailed() {
    s.error = ''
    s.buffering = false
    // The card stands alone, so the loading layer goes with the error.
    s.loading = false
    if (my.live && my.live.failed(s.itemId)) return
    if (my.item && my.item.Id === s.itemId) loadLineup()
    if (s.panel === 'channels') my.lostPending = true
    else openDialog('lost')
  }
  // Up on live TV, over the controls or not. The failed card steps aside while it's up.
  function openCarousel() {
    if (!s.isLive || s.panel !== 'none' || (s.dialog && s.dialog !== 'lost')) return
    if (s.dialog === 'lost') {
      s.dialog = ''
      my.lostPending = true
    }
    openModal('channels')
  }
  function fillCarousel() {
    const sw = liveSwitch()
    my.carouselOsd = s.osd
    refs.carousel.open({
      prewarm: sw.prewarm,
      api: sw.api || liveTvApiFor(my.item && my.item._serverUrl),
      channels: sw.lineup.length ? sw.lineup : [my.item],
      currentChannelId: s.itemId,
      sortBy: settings.get('liveTvChannelSortBy'),
    })
  }
  // Hands back to the controls as they were, or opens them on play/pause when Down asked for them.
  function closeCarousel(reveal) {
    if (refs.carousel && !refs.carousel.destroyed) refs.carousel.close()
    s.panel = 'none'
    if (my.lostPending) {
      my.lostPending = false
      openDialog('lost')
    } else if (reveal || my.carouselOsd) {
      showOsd()
      if (reveal && refs.controls) refs.controls.focusRow('bottom')
    } else focusDefault()
  }
  function onCarouselSelect(channel) {
    if (liveSwitch().select(channel) === 'same') closeCarousel(false)
  }
  // The Guide button and the remote's Guide key leave the player for the guide, going back to
  // it when the player was opened from there.
  async function openGuide() {
    my.recovery.abandon('the viewer left the player')
    await stopSession()
    const history = router.history
    const prev = history[history.length - 1]
    if (prev && prev.path === '/livetv') router.back()
    else {
      router.currentRoute.options.inHistory = false
      router.to('/livetv')
    }
  }
  // Asks the server for the channel again on the route the recovery picked, once the stop has freed the tuner.
  async function reResolveLive({ disableDirectPlay, forceTranscode }) {
    const wasDirect = playback.isDirectPlay()
    await engine.stop()
    playback.stopProgressReporting()
    const stopReport = playback.reportStop(Math.floor(my.pos * TICKS)).catch(() => {})
    if (!wasDirect) await Promise.race([stopReport, new Promise((resolve) => setTimeout(resolve, 3000))])
    const directAllowed = !my.forceTranscode && !settings.get('preferTranscode')
    const info = await playback.getPlaybackInfo(s.itemId, {
      startPositionTicks: 0,
      maxBitrate: my.quality || settings.get('maxBitrate') || 0,
      enableDirectPlay: directAllowed && !disableDirectPlay && !forceTranscode,
      enableDirectStream: directAllowed && !forceTranscode,
      enableTranscoding: true,
      mediaSourceId: my.info && my.info.mediaSourceId,
      item: my.item,
      isLiveTV: true,
      stereoUpmixEnabled: settings.get('stereoUpmixEnabled'),
    })
    if (!info || !info.url) throw new Error('No playable stream for the channel')
    await restart(info, 0, {})
  }
  // The stream the server is already making, opened again with its tuner kept.
  async function reloadLive() {
    await engine.stop()
    await openInfo(my.info, 0, {})
  }

  async function stopSession(finished) {
    if (my.stopped) return
    my.stopped = true
    my.reconnect.end()
    playback.stopProgressReporting()
    // The last position heard, since the element reads 0 before a resume lands and after it's let go.
    const ticks = Math.floor(my.pos * TICKS)
    const runTicks = my.info && my.info.runTimeTicks
    bitmapSubs.stop()
    await engine.stop()
    try {
      // Moving on from Next Up leaves the item done, even when its credits start under the server's threshold.
      if (finished && my.item) await playback.reportFinished(my.item, runTicks, ticks)
      else await playback.reportStop(ticks)
    } catch (e) {
      // The server may already have ended the session.
    }
  }
  async function playAdjacent(item, step, finished) {
    if (!item) return
    await stopSession(finished)
    if (my.list.length > 1) my.listPos += step
    my.cues = null
    s.cue = ''
    await start(item.Id, 0)
    if (s.osd) showOsd()
    else focusDefault()
    // A server's shuffle (Silo's) hands out one item ahead: the one starting now was it, so the server picks the next.
    if (step > 0 && props.serverShuffle) {
      const list = await extendServerShuffleQueue(my.list, item.Id, props.serverShuffle).catch((err) => {
        console.warn('[Player] Moving the server shuffle on failed:', err)
        return null
      })
      if (!list || s.itemId !== item.Id) return
      my.list = list
      my.listPos = list.indexOf(item.Id)
      const next = await findAdjacent(my.item, 1)
      if (s.itemId !== item.Id) return
      my.next = next
      s.hasNext = !!next
    }
  }
  // Play Next pressed by hand answers the Still Watching question, so the count starts over.
  function playNextNow() {
    my.consecutive = 0
    my.popups.dismissNextUp()
    playAdjacent(my.next, 1, true)
  }
  async function playPrevious() {
    playAdjacent(await findAdjacent(my.item, -1), -1, false)
  }
  // The automatic path. A long enough run of these asks whether anyone is still watching. Cinema Mode's
  // trailers aren't counted. finished marks the item watched, as moving on from the credits does.
  async function autoAdvance(finished) {
    my.popups.dismissNextUp()
    setNextUp(false)
    if (!s.preroll) {
      if (shouldAskStillWatching(my.consecutive, settings.get('stillWatchingBehavior'))) {
        engine.pause()
        openDialog('still')
        return
      }
      my.consecutive++
    }
    await playAdjacent(my.next, 1, finished)
  }
  // Channel up and down step through chapters and then on to the next or previous item, and
  // change channels on live TV.
  function stepChapterOrItem(step) {
    if (s.isLive) return stepChannel(step)
    showOsd()
    my.consecutive = 0
    // A jump takes a moment to land, so a quick second press steps on from where the first one went.
    const jump = my.jump
    const elapsed = jump ? Date.now() - jump.at : Infinity
    const pos = my.pos * TICKS
    const landed = jump && pos >= jump.ticks - 20000000 && pos <= jump.ticks + elapsed * 10000 + 20000000
    const ticks = chapterStep(my.chapters, elapsed < 5000 && !landed ? jump.ticks : pos, step)
    if (ticks != null) {
      my.jump = { ticks, at: Date.now() }
      dropScrub()
      seekNow(ticks / TICKS)
    } else if (step > 0) playNextNow()
    else playPrevious()
  }
  async function onEnded() {
    if (s.isLive) {
      my.recovery.recover('ended')
      return
    }
    // A slideshow video has no next episode or prompts, it hands over to the slideshow.
    if (props.slideshow) {
      await stopSession(true)
      props.slideshow.onEnded()
      return
    }
    if (showAirDate()) return
    // A trailer before the feature always goes on to it.
    if (my.next && shouldAutoAdvance(settings.get('autoPlay'), my.item)) {
      await autoAdvance(false)
      return
    }
    await stopSession()
    router.back()
  }
  // playbackFallback.js picks the step for a playback error: a Silo stream reconnects, a channel recovers, a
  // broken trailer is skipped, and anything else tries the server's transcode, then hls.js with H.264, before
  // it says so.
  async function onError(e) {
    if (gone || my.stopped || my.handlingError) return
    my.handlingError = true
    try {
      await handleError(e || {})
    } finally {
      my.handlingError = false
    }
  }
  async function handleError(err) {
    const tizen = engine.usesAvplay()
    const PM = playback.PlayMethod
    const info = my.info || {}
    const session = playback.getCurrentSession()
    const source = (session && session.mediaSource) || info.mediaSource
    const hlsSupported = !tizen && info.playMethod === PM.Transcode ? (await import('hls.js')).default.isSupported() : false
    const step = errorStep({
      tizen,
      paused: s.paused,
      elementPaused: engine.elementPaused(),
      readyState: engine.readyState(),
      startTimedOut: engine.startTimedOut(),
      isLive: s.isLive,
      liveEngaged: s.isLive && my.recovery.engaged(),
      canReconnect: canReconnect(),
      reconnecting: my.reconnect.reconnecting,
      code: err.code,
      type: err.type,
      played: engine.hasMoved(),
      skipTo: s.preroll ? my.list[my.listPos + 1] : null,
      audioOnly: !!source && !(source.MediaStreams || []).some((x) => x.Type === 'Video'),
      playMethod: info.playMethod,
      triedTranscode: my.triedTranscode,
      forceHlsJs: my.forceHlsJs,
      hlsRetries: my.hlsRetries,
      hlsSupported,
      reopened: my.reopened,
    })
    if (step.step === 'ignore') return
    if (step.step === 'reconnect') return my.reconnect.lost(err.message || `error ${err.code || 'timeout'}`)
    if (step.step === 'recover') return my.recovery.recover('source-error')
    if (step.step === 'skip') {
      playAdjacent({ Id: my.list[my.listPos + 1] }, 1, false)
      return
    }
    console.error('[player] playback error', err)
    // An Xbox WebView that won't open an HEVC file says so, and the profile remembers it.
    if (!tizen) notePlaybackError(err, source, info.playMethod)
    try {
      if (step.step === 'reopen') {
        my.reopened = true
        if ((await reloadHere()) !== false) return
      }
      if (step.step === 'reopen' || step.step === 'transcode') {
        if (await fallbackStream(tizen, false)) return
      } else if (step.step === 'h264') {
        if (!step.tier2) my.hlsRetries++
        if (await fallbackStream(false, true)) return
      }
    } catch (fallbackErr) {
      if (playback.isEndedOnServer(fallbackErr)) return
      console.error('[player] fallback failed', fallbackErr)
      if (!gone) showError(step.message)
      return
    }
    if (!gone) showError(step.plain || step.message)
  }
  // The stream again through the server's transcode, keeping the position, the audio track and a burned-in
  // subtitle. Tizen refuses the direct routes for the rest of the item. h264 asks for H.264 and AAC, which
  // the next open plays through hls.js. Resolves true once it plays from there.
  async function fallbackStream(directRefused, h264) {
    if (!h264) my.triedTranscode = true
    const at = my.pos
    const st = settings.all()
    // The failed transcode's job ends on the server before the next one starts.
    if (h264) await playback.reportStop(Math.floor(at * TICKS))
    else playback.stopProgressReporting()
    const info = await playback.getPlaybackInfo(s.itemId, {
      startPositionTicks: Math.floor(at * TICKS),
      maxBitrate: my.quality || st.maxBitrate || 0,
      ...(directRefused ? { directRefused: true } : { enableDirectPlay: false, enableDirectStream: false }),
      enableTranscoding: true,
      ...(h264 ? { deviceProfile: await getH264FallbackProfile() } : null),
      mediaSourceId: my.info && my.info.mediaSourceId,
      audioStreamIndex: my.audioIndex != null ? my.audioIndex : undefined,
      subtitleStreamIndex: my.burnIn != null ? my.burnIn : undefined,
      item: my.item,
      isLiveTV: s.isLive,
      stereoUpmixEnabled: st.stereoUpmixEnabled,
    })
    if (gone || !info || !info.url) return false
    if (h264) my.forceHlsJs = true
    // A transcode carries no embedded tracks, so a native subtitle is drawn here from now on.
    if (my.nativeSub) {
      const stream = (info.subtitleStreams || []).find((x) => x.index === my.subIndex)
      my.nativeSub = false
      if (stream) nativeFallback(stream)
    }
    await restart(info, at, {})
    // The server's stream gets its own wait for a first frame.
    if (s.isLive) my.recovery.tuned()
    return true
  }
  function showError(message) {
    s.buffering = false
    engine.stop().catch(() => {})
    s.error = $L(message)
  }
  // Still Watching draws itself (StillWatchingDialog), and a channel that can't play says so in its card.
  function openDialog(kind) {
    if (kind === 'lost') s.dialogTitle = $L('Failed to play {name}').replace('{name}', (my.item && my.item.Name) || '')
    s.panel = 'none'
    s.dialog = kind
    focusDefault()
  }
  function onDialog(id) {
    const kind = s.dialog
    s.dialog = ''
    focusDefault()
    if (kind === 'still') {
      // Back answers it the same as Continue.
      my.consecutive = 0
      if (id === 'stop') exit(true)
      else playAdjacent(my.next, 1, true)
    } else if (kind === 'lost') {
      if (id === 'retry') retryChannel()
      else exit()
    }
  }
  async function exit(finished) {
    if (my.closing) return
    my.closing = true
    my.recovery.abandon('the viewer left the player')
    await stopSession(finished)
    // Leaving a slideshow's own video leaves the slideshow too.
    if (props.slideshow) props.slideshow.onExit()
    else router.back()
  }
  // Media keys do nothing while a dialog asks something.
  function whenFree(fn) {
    if (!s.dialog) fn()
  }

  // Every error on a live channel goes through liveFailed, which shows the failed card.
  createEffect(
    on(
      () => s.error,
      (v) => {
        if (v && s.isLive) liveFailed()
        // A slideshow video that can't play moves on after a moment, so the slideshow never stalls on it.
        if (v && props.slideshow) {
          later(async () => {
            if (!s.error) return
            await stopSession()
            props.slideshow.onEnded()
          }, SLIDESHOW_ERROR_DELAY)
        }
      },
      { defer: true }
    )
  )
  createEffect(on([() => s.cue, () => s.secCue], () => drawSubs(), { defer: true }))
  // A texture made from pixels isn't shared, so the line before goes once the view holds the next.
  createEffect(on(() => s.subTex, (now, before) => before && before !== now && before.destroy()))
  // The Record button follows the controls and the airing program.
  createEffect(
    on(
      () => s.osd,
      (v) => {
        if (s.isLive) recording().sync(v)
      },
      { defer: true }
    )
  )
  createEffect(on(() => s.liveProgram, () => recording().sync(s.osd), { defer: true }))

  my.popups = createPopups()
  my.sleep = createSleepTimer(() => exit())
  my.recovery = createLiveRecovery({
    reResolve: (route) => reResolveLive(route),
    reload: getPlatform() === 'tizen' ? undefined : () => reloadLive(),
    release: () => stopSession(),
    onLost: () => liveFailed(),
    onStatus: (st) => {
      s.reconnecting = st ? $L('Reconnecting… ({attempt} of {total})').replace('{attempt}', st.attempt).replace('{total}', st.maxAttempts) : ''
    },
    isDirectPlay: () => playback.isDirectPlay(),
    log: (message) => serverLogger.playback(message),
  })
  my.reconnect = createStreamReconnect({
    reopen: () => reopenSiloAt(my.pos),
    onReconnecting: (onNow) => {
      s.reconnecting = onNow ? $L('Reconnecting...') : ''
    },
    onLost: () => showError('The connection to the server was lost.'),
    log: (message) => serverLogger.playback(`[Reconnect] ${message}`),
  })
  // Seeks a Silo stream can't make itself have Silo reopen it there, the latest one winning.
  my.serverSeek = createServerSeek(async (ticks) => {
    try {
      await reopenSiloAt(ticks / TICKS)
    } catch (e) {
      // An admin ending the session closes the player, and any other failure leaves the stream where it was.
    }
  })
  engine.setServerSeek((sec) => my.serverSeek(Math.floor(sec * TICKS)))
  const posTicks = () => Math.floor(my.pos * TICKS)
  const checkSiloToken = () => {
    if (!s.paused && !my.stopped && playback.siloStreamTokenRenewed()) my.serverSeek(posTicks())
  }
  const offs = [
    engine.on('time', (t) => {
      // AVPlay's time moving is what says the stream plays.
      if (engine.usesAvplay()) {
        my.recovery.update({ playing: true })
        my.reconnect.playing()
      }
      onTime(t)
    }),
    engine.on('duration', (d) => {
      if (d > 0 && isFinite(d)) s.dur = d
    }),
    engine.on('playing', () => {
      const wasPaused = s.paused
      s.loading = false
      s.paused = false
      s.buffering = false
      my.recovery.setPaused(false)
      my.recovery.update({ playing: true, buffering: false })
      my.reconnect.playing()
      bitmapSubs.setPaused(false, my.pos)
      channelPlaying()
      engine.setMediaPlaybackState(false)
      // On webOS 3 the video wants the memory, so the pictures of the pages hidden under the player are freed
      // once it plays. They load again when they show.
      if (legacy && !my.freedHidden) {
        my.freedHidden = true
        getRenderer().stage.txMemManager.cleanup(true)
      }
      if (my.stopped || !my.info) return
      // A stop reported while the app was away starts the session over on the server.
      if (my.reReport) {
        my.reReport = false
        reportStartAt(posTicks())
      } else if (wasPaused && my.startReported) {
        playback.reportProgress(posTicks(), { isPaused: false, eventName: 'unpause' })
        checkSiloToken()
      }
    }),
    engine.on('paused', () => {
      s.paused = true
      // A pause with a description to show puts the controls away so it comes up at once.
      if (s.pauseInfo && !my.held && s.osd && s.panel === 'none') hideOsd()
      my.recovery.setPaused(true)
      my.reconnect.interrupted()
      bitmapSubs.setPaused(true, my.pos)
      engine.setMediaPlaybackState(true)
      if (my.startReported && !my.stopped) playback.reportProgress(posTicks(), { isPaused: true, eventName: 'pause' })
    }),
    engine.on('cue', (text) => {
      if (my.nativeSub && text !== s.cue) s.cue = text
    }),
    engine.on('subFallback', (stream) => nativeFallback(stream)),
    // The TV's own track list didn't match, so the server sends a stream with only the picked track in it.
    engine.on('audioMismatch', (index) => {
      if (index === my.audioIndex) reloadWithAudio(index)
    }),
    // A stream opened held, for the group or after a paused Silo seek, is up and waiting on its first frame.
    engine.on('held', () => {
      s.loading = false
      s.buffering = false
      s.paused = true
    }),
    // An admin ended this item's Silo session: playback stops, the player closes, and the screen behind says why.
    playback.onEndedOnServer(async (endedId) => {
      if (endedId == null || String(endedId) !== String(s.itemId) || my.ending === endedId || my.closing) return
      my.ending = endedId
      my.reconnect.end()
      my.recovery.abandon('the session ended on the server')
      await stopSession()
      if (gone || my.closing || String(endedId) !== String(s.itemId)) return
      my.closing = true
      if (props.slideshow) props.slideshow.onExit()
      else router.back()
      const app = shellApp()
      if (app && app.showEndedOnServer) app.showEndedOnServer()
    }),
    engine.on('buffering', (b) => {
      s.buffering = b
      my.recovery.update({ buffering: b })
      if (b) my.reconnect.interrupted()
    }),
    engine.on('ended', () => onEnded()),
    engine.on('error', (e) => onError(e)),
    party.subscribe(() => syncParty()),
  ]
  syncParty()
  store.navVisible = false
  // What another client's remote reaches while this plays, through the same handlers as the buttons.
  offs.push(
    setPlayerControls({
      current: {
        pause: () => !engine.isPaused() && togglePlay(),
        resume: () => engine.isPaused() && togglePlay(),
        playPause: () => togglePlay(),
        stop: () => exit(),
        // Another item takes this one's place, so the stop goes in first.
        release: async () => {
          my.popups.dismissNextUp()
          setNextUp(false)
          await playback.reportStop(posTicks())
        },
        seek: (ticks) => {
          dropScrub()
          seekNow(ticks / TICKS)
        },
        next: () => playNextNow(),
        previous: () => onOsdAction('prevTrack'),
        rewind: () => onOsdAction('rewind'),
        fastForward: () => onOsdAction('forward'),
        setAudioStream: (index) => {
          if (((my.info && my.info.audioStreams) || []).some((x) => x.index === index)) selectAudio(index)
        },
        setSubtitleStream: (index) => {
          if (index === -1 || ((my.info && my.info.subtitleStreams) || []).some((x) => x.index === index)) selectSubtitle(index)
        },
      },
    })
  )

  // DevTools reach the player through the active page.
  if (props.page) props.page.player = { s, my, refs, openPanel, closePanel, openDialog, showOsd, hideOsd, onOsdAction, focusDefault, selectAudio, selectSubtitle, engine }

  // webOS, Fire TV and Xbox: the app going away pauses and reports a stop at once, since script freezes
  // there and a kill while suspended runs nothing. Fire TV and Xbox leave the player as well. Coming back
  // plays on if it was playing, and the first play starts the session over.
  function onHidden() {
    if (my.hidden) return
    my.hidden = true
    my.hiddenWasPlaying = !s.paused
    if (my.hiddenWasPlaying) engine.pause()
    playback.reportBackgroundStop(posTicks())
    my.startReported = false
    my.reReport = true
    if (leavesPlayerInBackground()) exit()
  }
  function onVisible() {
    if (!my.hidden) return
    my.hidden = false
    playback.consumeBackgroundStopFired()
    if (my.hiddenWasPlaying) engine.play()
  }
  // Tizen: the stop goes out and AVPlay suspends. The stream opens again where it was on return, and
  // pauses again if it was paused, since the background stop ended the session and a restore can hang.
  function tizenBackground() {
    if (my.suspended) return
    playback.reportBackgroundStop(posTicks())
    my.startReported = false
    my.reReport = true
    my.suspended = engine.suspend()
  }
  function tizenForeground() {
    const stoppedOnServer = playback.consumeBackgroundStopFired()
    const sus = my.suspended
    my.suspended = null
    if (!sus || gone || my.stopped) return
    const mine = my.startGen
    const reload = () =>
      reloadHere().then((ok) => {
        if (mine !== my.startGen || gone) return
        if (ok === false) showError('Playback failed. The file format may not be supported.')
        else if (ok && !sus.wasPlaying) engine.pause()
      })
    if (sus.suspended && stoppedOnServer) return reload()
    if (stoppedOnServer) {
      my.reReport = false
      reportStartAt(posTicks())
    }
    if (sus.suspended) {
      engine.restore(sus).then((ok) => {
        if (!ok && mine === my.startGen && !gone) reload()
      })
      return
    }
    if (sus.wasPlaying) engine.play()
  }
  function setupLifecycle() {
    const tizen = getPlatform() === 'tizen'
    const offState = tizen ? registerAppStateObserver(tizenForeground, tizenBackground) : registerAppStateObserver(null, () => engine.pause())
    const offVisibility = tizen ? null : setupVisibilityHandler(onHidden, onVisible)
    // Backing out of the app never reaches the cleanup, so the stop goes out here or the session stays open.
    const appExit = () => {
      if (playback.reportStopBeacon(posTicks())) playback.discardCurrentSession()
      if (tizen) engine.release()
    }
    window.addEventListener('pagehide', appExit)
    window.addEventListener('beforeunload', appExit)
    offs.push(() => {
      if (offState) offState()
      if (offVisibility) offVisibility()
      window.removeEventListener('pagehide', appExit)
      window.removeEventListener('beforeunload', appExit)
    })
  }

  onMount(async () => {
    if (root) root.setFocus()
    await initVideo()
    if (gone) return
    setupLifecycle()
    every(checkSiloToken, SILO_RENEWAL_CHECK_MS)
    // A route without a start position starts where the item was left.
    const given = props.startPositionTicks != null && props.startPositionTicks !== ''
    const ticks = props.resume === false ? 0 : given ? Number(props.startPositionTicks) || 0 : null
    // A group plays the feature, not Cinema Mode's trailers, which would go to everyone.
    if (party.isInGroup() && my.prerolls > 0 && my.list[my.prerolls]) {
      my.listPos = my.prerolls
      my.prerolls = 0
      await start(my.list[my.listPos], 0)
      if (!gone) focusDefault()
      return
    }
    await start(props.id, ticks == null || party.isInGroup() ? ticks : applyResumeRewind(ticks, settings.all()), {
      audioStreamIndex: pick(props.audioStreamIndex),
      subtitleStreamIndex: pick(props.subtitleStreamIndex),
      mediaSourceId: props.mediaSourceId || undefined,
    })
    // The controls stay away until a key asks for them.
    if (!gone) focusDefault()
  })
  onCleanup(() => {
    gone = true
    party.detach()
    timers.forEach((id) => {
      clearTimeout(id)
      clearInterval(id)
    })
    offs.forEach((off) => off())
    store.navVisible = true
    my.sleep.clear()
    my.secGen++
    my.recovery.abandon('the viewer left the player')
    if (!my.stopped) stopSession()
    if (my.live) my.live.dispose()
    if (my.rec) my.rec.dispose()
    disposeTextSource()
    if (s.subTex) s.subTex.destroy()
    if (my.offMedia) my.offMedia()
    engine.setServerSeek(null)
    playback.releaseEndedOnServer()
    // Home and the rows refresh what was watched, and a viewer in a room or a group goes back to its dialog over
    // the page, where they can rejoin. Another player taking this one's place doesn't.
    browseRefresh({})
    if (party.inPartyOrGroup()) {
      setTimeout(() => {
        const route = router.currentRoute
        const app = shellApp()
        if (app && app.openParty && !(route && route.path && route.path.indexOf('/player') === 0)) app.openParty(false)
      }, 0)
    }
  })

  const pageIs = (kind) => s.panel === kind
  const offsetUp = () => s.panel === 'secOffset' || s.panel === 'subOffset'

  // Keys that reach the page: the controls hidden (zone 'page'), or passed on by the controls, the skip prompt,
  // the Next Up card and the modals. A held seek speeds up until its key comes back up.
  return (
    <view
      ref={(n) => (root = n)}
      width={1920}
      height={1080}
      onEnter={() => {
        // The error screen's one control is Go Back.
        if (errorScreen()) {
          exit()
          return true
        }
        if (my.zone !== 'page') return true
        if (props.slideshow) showOsd()
        else togglePlay()
        return true
      }}
      onLeft={() => {
        arrow(-1)
        return true
      }}
      onRight={() => {
        arrow(1)
        return true
      }}
      onUp={() => {
        vertical('up')
        return true
      }}
      onDown={() => {
        vertical('down')
        return true
      }}
      onLeftRelease={() => {
        releaseHold()
        return true
      }}
      onRightRelease={() => {
        releaseHold()
        return true
      }}
      onPlay={() => {
        whenFree(() => {
          my.consecutive = 0
          showOsd()
          if (resumeHeldScrub()) return
          if (engine.isPaused() && !party.notifyLocal('play')) unpause()
        })
        return true
      }}
      onPause={() => {
        whenFree(() => {
          my.consecutive = 0
          showOsd()
          if (!engine.isPaused() && !party.notifyLocal('pause')) engine.pause()
        })
        return true
      }}
      onPlayPause={() => {
        whenFree(() => togglePlay())
        return true
      }}
      onStop={() => {
        exit()
        return true
      }}
      onFastForward={() => {
        whenFree(() => {
          if (cinemaActive() && !MODALS[s.panel]) return skipTrailer()
          if (!s.isLive || s.liveWindow) onOsdAction('forward')
          showOsd()
        })
        return true
      }}
      onRewind={() => {
        whenFree(() => {
          if (!s.isLive || s.liveWindow) onOsdAction('rewind')
          showOsd()
        })
        return true
      }}
      onChannelUp={() => {
        if (s.isLive && (!MODALS[s.panel] || s.dialog === 'lost')) stepChannel(1)
        else whenFree(() => stepChapterOrItem(1))
        return true
      }}
      onChannelDown={() => {
        if (s.isLive && (!MODALS[s.panel] || s.dialog === 'lost')) stepChannel(-1)
        else whenFree(() => stepChapterOrItem(-1))
        return true
      }}
      onBack={() => {
        if (s.dialog) onDialog('cancel')
        else if (s.panel !== 'none') closePanel()
        else if (skipShown()) {
          // Back takes the prompt down before it closes the controls or leaves the player.
          if (s.skip.cinema) my.cinemaWanted = false
          my.popups.dismissPrompt()
          setPrompt(null)
          my.backHeldUntil = Date.now() + 500
          focusDefault()
        } else if (nextUpShown()) onNextUp('hide')
        else if (Date.now() < (my.backHeldUntil || 0)) return true
        else if (s.osd) hideOsd()
        else exit()
        return true
      }}
      // The remote's Subtitles, Audio and Record buttons open what their OSD buttons open and close it again,
      // and Guide leaves for the guide on live TV.
      onKeyPress={(e) => {
        const shortcut = remoteShortcut(e)
        if (shortcut === 'guide' && s.isLive) {
          openGuide()
          return true
        }
        const open = s.panel === 'none' ? null : SUBTITLE_KINDS.indexOf(s.panel) >= 0 ? 'subtitle' : s.panel
        const act = trackShortcutAction(shortcut, {
          activeModal: open,
          hasSubtitles: s.subCount > 0 || !!s.itemId,
          audioTrackCount: s.audioCount,
          recordable: s.isLive && s.recordable,
        })
        if (act === 'close') closePanel()
        else if (act === 'open') onOsdAction(shortcut)
        else if (act !== 'ignore' && !s.dialog) showOsd()
        return true
      }}
    >
      <view width={1920} height={1080} color="#000000ff" alpha={s.loading ? 1 : 0} />

      <view
        alpha={!s.loading && !s.error && s.subTex ? s.subAlpha : 0}
        texture={s.subTex}
        color="#ffffffff"
        x={s.subX}
        y={s.subY}
        width={s.subW}
        height={s.subH}
      />

      <PlayerOsd
        ref={(n) => (refs.controls = n)}
        fetching={s.fetching}
        shown={osdShown()}
        dim={osdDim()}
        head={s.osdHead}
        slots={osdSlots()}
        progress={progress()}
        buffered={s.buffered}
        marks={osdMarks()}
        live={osdLive()}
        buttons={osdBtns()}
        tp={s.osdTp}
        pos={shownPosition() * 1000}
        dur={s.dur * 1000}
        step={s.stepSec}
        seeking={s.seeking}
        onOsdKey={onOsdKey}
        onScrub={onScrub}
        onProgressEnter={onProgressEnter}
        onOsdAction={onOsdAction}
        onOsdEdge={onOsdEdge}
      />

      <view width={1920} height={1080} transition={tx({ alpha: { duration: pauseShown() ? 300 : 0, easing: 'ease' } })} alpha={pauseShown() ? 1 : 0}>
        <view width={1920} height={1080} colorLeft="#000000d9" colorRight="#0000004d" />
        <text
          fontFamily={s.pauseInfo ? s.pauseInfo.labelFont : uiFont()}
          fontSize={26}
          lineHeight={31.2}
          x={96}
          y={222.5}
          color="#ffffffff"
          textShadow={TEXT_GLOW}
        >
          {s.pauseInfo ? s.pauseInfo.label : ' '}
        </text>
        <text
          fontFamily={s.pauseInfo ? s.pauseInfo.titleFont : uiFont()}
          fontSize={64}
          lineHeight={76.8}
          x={96}
          y={273.2}
          maxWidth={920}
          maxLines={1}
          color="#ffffffff"
          textShadow={TEXT_GLOW}
        >
          {s.pauseInfo ? s.pauseInfo.title : ' '}
        </text>
        <text
          fontFamily={s.pauseInfo ? s.pauseInfo.textFont : uiFont()}
          fontSize={30}
          lineHeight={42}
          x={96}
          y={363}
          maxWidth={920}
          maxLines={8}
          color="#ffffffff"
          textShadow={TEXT_GLOW}
        >
          {s.pauseInfo ? s.pauseInfo.text : ' '}
        </text>
      </view>

      <SubtitleFetchIndicator standalone show={s.fetching && !osdShown() && !s.loading && !s.error} />

      <SkipPrompt ref={(n) => (refs.skip = n)} show={skipShown()} prompt={s.skip} skipSegment={skipSegment} />

      <NextUpCard ref={(n) => (refs.nextup = n)} show={nextUpShown()} card={s.nextCard} countdown={s.nextCount} onNextUp={onNextUp} />

      <view>
        <Show when={pageIs('episodes')}>
          <EpisodeBrowser ref={(n) => (refs.episodes = n)} onEpisode={onEpisode} />
        </Show>
      </view>
      <view>
        <Show when={trackShown()}>
          <TrackModal ref={(n) => (refs.track = n)} onTrackRow={onTrackRow} />
        </Show>
      </view>
      <view>
        <Show when={pageIs('secAppearance')}>
          <SecondarySettings
            ref={(n) => (refs.secSettings = n)}
            size={s.secSizeShown}
            offset={s.secOffsetShown}
            colorLabel={s.secColorLabel}
            onSecondaryStep={onSecondaryStep}
            closePanel={closePanel}
          />
        </Show>
      </view>
      <view>
        <Show when={pageIs('subSettings')}>
          <SubtitleSettings ref={(n) => (refs.subSettings = n)} applySubtitleStyle={applySubtitleStyle} closePanel={closePanel} />
        </Show>
      </view>
      <view>
        <Show when={offsetUp()}>
          <OffsetOverlay
            ref={(n) => (refs.offset = n)}
            offset={s.offsetShown}
            timeline={s.offsetTimeline}
            onOffsetChange={onOffsetChange}
            closePanel={closePanel}
          />
        </Show>
      </view>
      <view>
        <Show when={pageIs('info')}>
          <PlaybackInfo ref={(n) => (refs.playInfo = n)} closePanel={closePanel} />
        </Show>
      </view>
      <view>
        <Show when={pageIs('chapters')}>
          <ChapterModal ref={(n) => (refs.chapterModal = n)} onChapter={onChapter} />
        </Show>
      </view>
      <view>
        <Show when={pageIs('cast')}>
          <CastModal ref={(n) => (refs.castModal = n)} onCastMember={onCastMember} />
        </Show>
      </view>
      <view>
        <Show when={pageIs('download') && s.subsearch} keyed>
          {(q) => (
            <SubtitleSearch
              ref={(n) => (refs.subsearch = n)}
              variant="player"
              itemId={q.itemId}
              languages={q.languages}
              api={apiOf(my.item)}
              onRemoteSubtitlePick={onRemoteSubtitlePick}
              onSubtitleSearchClose={onSubtitleSearchClose}
            />
          )}
        </Show>
      </view>

      <view>
        <For each={loaderList.keys()}>
          {(k) => {
            const ld = loaderList.item(k)
            return <LoadingAnimation label={ld().label} dimmed={ld().dimmed} />
          }}
        </For>
      </view>
      <view>
        <Show when={errorScreen()}>
          {(er) => (
            <view width={1920} height={1080} color="#000000ff">
              <text
                fontFamily={er().titleFont}
                fontSize={32}
                lineHeight={33}
                y={er().titleY}
                maxWidth={1920}
                contain="width"
                textAlign="center"
                color="#ffffffff"
              >
                {er().title}
              </text>
              <text
                fontFamily={er().messageFont}
                fontSize={20}
                lineHeight={33}
                y={er().messageY}
                maxWidth={1920}
                contain="width"
                textAlign="center"
                color="#aaaaaaff"
              >
                {er().message}
              </text>
              <Button x={825} y={537} w={270} label={er().back} neutral />
            </view>
          )}
        </Show>
      </view>

      <view>
        <Show when={pageIs('channels')}>
          <ChannelCarousel
            ref={(n) => (refs.carousel = n)}
            onCarouselSelect={onCarouselSelect}
            onCarouselDismiss={() => closeCarousel(false)}
            onCarouselControls={() => closeCarousel(true)}
          />
        </Show>
      </view>
      <LiveFailedCard
        ref={(n) => (refs.liveFailed = n)}
        show={s.dialog === 'lost'}
        message={s.dialogTitle}
        onDialog={onDialog}
        openCarousel={openCarousel}
      />
      <StillWatchingDialog ref={(n) => (refs.still = n)} show={s.dialog === 'still'} onDialog={onDialog} />
      <LiveRecordingDialog ref={(n) => (refs.record = n)} up={s.panel === 'record'} closePanel={closePanel} />
    </view>
  )
}
