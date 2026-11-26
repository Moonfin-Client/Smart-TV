// The Jellyfin device profile from the codecs this Roku reports, per container.
import { canAudio, canVideo, rokuCaps } from './caps.js'

const MAX_BITRATE = 120_000_000
const list = (codecs) => codecs.join(',')
const PROFILE_CODEC = { 'mpeg4 avc': null, mpeg2: 'mpeg2video' }
const videoCodecs = (codecs) =>
  codecs.reduce((out, c) => {
    const name = c in PROFILE_CODEC ? PROFILE_CODEC[c] : c
    if (name) out.push(name)
    if (c === 'hevc') out.push('h265')
    return out
  }, [])

export const clearCapabilitiesCache = () => {}

export const getDeviceCapabilities = async () => {
  const c = await rokuCaps()
  const hdr = c.hdr || {}
  const uhd = /^2160|^4320/.test(c.videoMode || '')
  return {
    platform: 'roku',
    modelName: c.modelName || c.model || 'Roku',
    rokuVersionDisplay: c.osVersion ? `Roku OS ${c.osVersion.major}.${c.osVersion.minor}.${c.osVersion.revision}` : 'Roku OS',
    screenWidth: uhd ? 3840 : 1920,
    screenHeight: uhd ? 2160 : 1080,
    uhd,
    uhd8K: /^4320/.test(c.videoMode || ''),
    hevc: canVideo(c, 'hevc'),
    hevcMain10: !!c.hevcMain10,
    av1: canVideo(c, 'av1'),
    vp9: canVideo(c, 'vp9'),
    hdr10: !!hdr.Hdr10,
    hdr10Plus: !!hdr.Hdr10Plus,
    hlg: !!hdr.HLG,
    dolbyVision: !!hdr.DolbyVision,
    ac3: canAudio(c, 'ac3'),
    eac3: canAudio(c, 'eac3'),
    dts: canAudio(c, 'dts'),
    truehd: canAudio(c, 'truehd'),
    flac: canAudio(c, 'flac'),
    opus: canAudio(c, 'opus'),
    surround: !!c.surround,
    nativeHls: true,
    hasNativeHls: true,
    nativeHlsFmp4: true,
    hlsAc3: canAudio(c, 'ac3'),
    roku: c,
  }
}

// The video ranges Roku plays, as Jellyfin names them, so the server tone maps the rest. A file
// Roku reads itself plays HDR10, HDR10+, HLG and Dolby Vision's base layer on any display. Through
// the server's HLS (inHls), Roku's player drops a variant the display can't show, so there HDR goes
// in only for a display that has it, and a server that can tone map sends SDR.
const videoRanges = (hdr, codec, inHls) => {
  const shows = inHls ? hdr : { Hdr10: true, Hdr10Plus: true, HLG: true, DolbyVision: hdr.DolbyVision }
  const out = ['SDR', 'DOVIWithSDR']
  if (codec !== 'h264') {
    if (shows.Hdr10) out.push('HDR10', 'DOVIWithHDR10', ...(codec === 'hevc' ? ['DOVIWithEL', 'DOVIWithELHDR10Plus', 'DOVIInvalid'] : []))
    if (shows.Hdr10Plus) out.push('HDR10Plus', 'DOVIWithHDR10Plus')
    if (shows.HLG) out.push('HLG', 'DOVIWithHLG')
  }
  if (shows.DolbyVision && codec !== 'vp9') out.push('DOVI', 'DOVIWithHDR10', 'DOVIWithHDR10Plus', 'DOVIWithHLG')
  return [...new Set(out)].join('|')
}

// One codec profile for the files Roku reads and one for the server's HLS, which comes as TS.
const FILES = 'mp4,m4v,mov,mkv,webm'
const rangeProfiles = (hdr, codec, extra = []) =>
  [
    [FILES, false],
    ['ts', true],
  ].map(([container, inHls]) => ({
    Type: 'Video',
    Codec: codec,
    Container: container,
    Conditions: [...extra, { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: videoRanges(hdr, codec, inHls), IsRequired: false }],
  }))

export const getJellyfinDeviceProfile = async (options = {}) => {
  const caps = await getDeviceCapabilities()
  const c = caps.roku
  const direct = (container, key) => ({
    Container: container,
    Type: 'Video',
    VideoCodec: list(videoCodecs(c.video[key] || [])),
    AudioCodec: list(c.audio[key] || []),
  })
  const hlsAudio = ['aac', 'mp3', 'ac3', 'eac3'].filter((a) => a === 'aac' || a === 'mp3' || canAudio(c, a))
  const hlsVideo = caps.hevc ? 'hevc,h264' : 'h264'
  const channels = caps.surround ? '6' : '2'
  const hdr = c.hdr || {}
  return {
    Name: `Moonfin Roku ${caps.modelName}`,
    MaxStreamingBitrate: options.maxBitrate || MAX_BITRATE,
    MaxStaticBitrate: options.maxBitrate || MAX_BITRATE,
    MaxStaticMusicBitrate: 40_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: [
      direct('mp4,m4v,mov', 'mp4'),
      direct('mkv,webm', 'mkv'),
      direct('ts,mpegts,m2ts', 'ts'),
      { Container: 'mp3,aac,m4a,flac,alac,wav,ogg,opus', Type: 'Audio', AudioCodec: list(c.audioAlone || []) },
    ],
    TranscodingProfiles: [
      {
        Container: 'ts',
        Type: 'Video',
        VideoCodec: hlsVideo,
        AudioCodec: list(hlsAudio),
        Context: 'Streaming',
        Protocol: 'hls',
        MaxAudioChannels: channels,
        MinSegments: '1',
        SegmentLength: '6',
        BreakOnNonKeyFrames: false,
      },
      { Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3', Context: 'Streaming', Protocol: 'http', MaxAudioChannels: '2' },
    ],
    CodecProfiles: [
      ...rangeProfiles(hdr, 'h264', [
        { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '51', IsRequired: false },
        { Condition: 'NotEquals', Property: 'IsAnamorphic', Value: 'true', IsRequired: false },
      ]),
      ...rangeProfiles(hdr, 'hevc', caps.hevcMain10 ? [] : [{ Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false }]),
      ...rangeProfiles(hdr, 'av1'),
      ...rangeProfiles(hdr, 'vp9'),
      { Type: 'VideoAudio', Conditions: [{ Condition: 'LessThanEqual', Property: 'AudioChannels', Value: channels, IsRequired: false }] },
    ],
    // SRT and WebVTT come as files the app draws, and the server burns in everything else.
    SubtitleProfiles: [
      { Format: 'srt', Method: 'External' },
      { Format: 'subrip', Method: 'External' },
      { Format: 'vtt', Method: 'External' },
      { Format: 'webvtt', Method: 'External' },
      { Format: 'ass', Method: 'Encode' },
      { Format: 'ssa', Method: 'Encode' },
      { Format: 'pgs', Method: 'Encode' },
      { Format: 'pgssub', Method: 'Encode' },
      { Format: 'dvdsub', Method: 'Encode' },
      { Format: 'dvbsub', Method: 'Encode' },
    ],
    ResponseProfiles: [],
  }
}

export const getH264FallbackProfile = async (options = {}) => {
  const profile = await getJellyfinDeviceProfile(options)
  profile.TranscodingProfiles[0].VideoCodec = 'h264'
  return profile
}
