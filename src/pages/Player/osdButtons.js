// The player's OSD buttons for video and Live TV as plain models: { id, action, icon, label, disabled,
// active, color }. Icons are public/icons/osd_<Name>.webp.
import $L from '../../services/i18n.js'
import { arrange, OSD_BUTTONS, OSD_ORDER_KEY, OSD_HIDDEN_KEY } from '../../utils/buttonLayout.js'
import { skipBackSeconds, skipForwardSeconds, zoomSettingFromInternal } from '../../utils/playbackTuning.js'
import { getZoomModeOptions } from '../Settings/settingsOptions.js'

const LIVE_RED = '#f44336ff'
const FAVORITE_PINK = '#cf6679ff'
const MARK_SKIPPED_GREY = '#9e9e9eff'

const SEEK_ICONS = { 5: '5', 10: '10', 30: '30' }
const seekBackIcon = (s) => (SEEK_ICONS[s] ? `osd_Replay${s}` : 'osd_Rewind')
const seekForwardIcon = (s) => (SEEK_ICONS[s] ? `osd_Forward${s}` : 'osd_Forward')

const zoomLabel = (zoomMode) => {
  const hit = getZoomModeOptions().find((o) => o.value === zoomSettingFromInternal(zoomMode))
  return hit ? hit.label : ''
}

// f: isPaused, isLive, liveRewind, atLive, hasNextTrack, nextEpisode, audioCount, subtitleCount, chapterCount,
// canDownload, subtitleOn, hasCast, selectedQuality, zoomMode, sleepOn, canBrowseEpisodes, isFavorite,
// canFavorite, inParty, recordable, recordMark.
export const osdButtons = (f, s) => {
  const top = []
  if (!f.isLive) {
    top.push(
      { id: 'previous', icon: 'osd_Previous', label: $L('Previous'), action: 'prevTrack' },
      { id: 'rewind', icon: seekBackIcon(skipBackSeconds(s)), label: $L('Seek back'), action: 'rewind' },
      { id: 'playPause', icon: f.isPaused ? 'osd_Play' : 'osd_Pause', label: f.isPaused ? $L('Play') : $L('Pause'), action: 'playPause' },
      { id: 'forward', icon: seekForwardIcon(skipForwardSeconds(s)), label: $L('Seek forward'), action: 'forward' }
    )
    if (f.hasNextTrack) top.push({ id: 'nextTrack', icon: 'osd_Next', label: $L('Next'), action: 'nextTrack' })
    else if (f.nextEpisode) top.push({ id: 'next', icon: 'osd_Next', label: $L('Next Episode'), action: 'next' })
  } else {
    const playPause = { id: 'playPause', icon: f.isPaused ? 'osd_LivePlay' : 'osd_LivePause', label: f.isPaused ? $L('Play') : $L('Pause'), action: 'playPause' }
    if (f.liveRewind) {
      top.push(
        { id: 'rewind', icon: 'osd_LiveRewind', label: $L('Seek back'), action: 'rewind' },
        playPause,
        { id: 'forward', icon: 'osd_LiveForward', label: $L('Seek forward'), action: 'forward' },
        { id: 'jumpToLive', icon: 'osd_LiveTv', color: f.atLive ? LIVE_RED : undefined, label: $L('Jump to Live'), action: 'jumpToLive' }
      )
    } else top.push(playPause)
  }

  const order = s[OSD_ORDER_KEY]
  const hidden = s[OSD_HIDDEN_KEY]
  const subtitles = f.subtitleCount > 0 || f.canDownload
    ? [{ id: 'subtitles', icon: f.subtitleOn ? 'osd_Subtitle' : 'osd_SubtitleOff', label: $L('Subtitles'), action: 'subtitle' }]
    : []
  const audio = f.audioCount > 1 ? [{ id: 'audio', icon: 'osd_Audio', label: $L('Audio'), action: 'audio' }] : []
  const zoom = { id: 'zoom', icon: 'osd_Zoom', label: $L('Zoom').concat(` (${zoomLabel(f.zoomMode)})`), action: 'zoom', active: f.zoomMode !== 'fit' }
  const sleep = { id: 'sleep', icon: 'osd_Sleep', label: $L('Sleep timer'), action: 'sleep', active: !!f.sleepOn }
  const info = { id: 'info', icon: 'osd_Info', label: $L('Playback Information'), action: 'info' }
  let bottom
  if (f.isLive) {
    const mark = f.recordMark
    bottom = arrange(
      [
        { id: 'channels', icon: 'osd_Channels', label: $L('Channels'), action: 'channels' },
        { id: 'guide', icon: 'osd_Guide', label: $L('Guide'), action: 'guide' },
        ...audio,
        ...subtitles,
        { id: 'quality', icon: 'osd_Quality', label: $L('Playback Quality'), action: 'quality' },
        zoom,
        sleep,
        ...(f.recordable
          ? [{
              id: 'record',
              icon: mark === 'series' || mark === 'skipped' ? 'osd_SeriesRecord' : 'osd_Record',
              color: mark === 'series' ? LIVE_RED : mark === 'skipped' ? MARK_SKIPPED_GREY : mark === 'record' ? LIVE_RED : undefined,
              label: mark && mark !== 'skipped' ? $L('Cancel Recording') : $L('Record'),
              action: 'record',
            }]
          : []),
        ...(f.canFavorite
          ? [{
              id: 'channelFavorite',
              icon: f.isFavorite ? 'osd_FavoriteFilled' : 'osd_Favorite',
              color: f.isFavorite ? FAVORITE_PINK : undefined,
              label: f.isFavorite ? $L('Unfavorite Channel') : $L('Favorite Channel'),
              action: 'favorite',
            }]
          : []),
        info,
      ],
      { order, hidden }
    )
  } else {
    const party = f.inParty
      ? [
          { id: 'partyChat', icon: 'osd_Chat', label: $L('Chat'), action: 'partyChat' },
          { id: 'party', icon: 'osd_Cast', label: $L('Your watch party'), action: 'party' },
        ]
      : []
    bottom = party.concat(arrange(
      [
        ...(f.canFavorite
          ? [{
              id: 'favorite',
              icon: f.isFavorite ? 'osd_FavoriteFilled' : 'osd_Favorite',
              color: f.isFavorite ? FAVORITE_PINK : undefined,
              label: f.isFavorite ? $L('Remove from Favorites') : $L('Add to Favorites'),
              action: 'favorite',
            }]
          : []),
        ...(f.chapterCount > 0 ? [{ id: 'chapters', icon: 'osd_Chapters', label: $L('Chapters'), action: 'chapter' }] : []),
        ...(f.canBrowseEpisodes ? [{ id: 'episodes', icon: 'osd_Episodes', label: $L('Episodes'), action: 'episodes' }] : []),
        ...subtitles,
        ...audio,
        { id: 'castAndCrew', icon: 'osd_Cast', label: $L('Cast & Crew'), action: 'cast', disabled: !f.hasCast },
        { id: 'quality', icon: 'osd_Quality', label: $L('Playback Quality'), action: 'quality', active: f.selectedQuality != null },
        zoom,
        sleep,
        info,
      ],
      { order, hidden, catalogue: OSD_BUTTONS }
    ))
  }
  return { top, bottom }
}
