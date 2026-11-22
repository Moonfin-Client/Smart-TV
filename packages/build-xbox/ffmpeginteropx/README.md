# FFmpegInteropX for the Xbox app

The Xbox app plays files through FFmpegInteropX. `moonfin.patch` adds two settings to version 2.1.0. Both are off by default, and with both off the build behaves exactly like 2.1.0.

## Dolby Vision

Version 2.1.0 gives Dolby Vision HEVC to the console's decoder without the media type attributes that Windows needs to load the console's Dolby Vision renderer effect. Profile 5 then shows green and purple, and other profiles play as their base layer.

`MediaSourceConfig.Video.DolbyVisionRendererProfile` fixes that. The host sets it to a profile that the console's effect lists, such as `dvhe.05`, and opens the file with `VideoDecoderMode.ForceSystemDecoder`. If an HEVC stream has a Dolby Vision configuration record with an RPU, its media type then gets these attributes:

- `MF_MT_VIDEO_RENDERER_EXTENSION_PROFILE`, the profile string
- `MF_MT_FORWARD_CUSTOM_NALU`, set to 62 so the decoder forwards each frame's RPU
- `MF_DECODER_FWD_CUSTOM_SEI_DECODE_ORDER`
- `MF_MT_DECODER_USE_MAX_RESOLUTION`

## Passthrough

Version 2.1.0 decodes AC-3, E-AC-3, TrueHD and DTS to PCM itself, so a receiver never gets them as they are. `MediaSourceConfig.Audio.SystemDecoderSurround` hands them to Windows compressed instead, with the subtypes Windows' own MKV and MP4 sources use:

- `Ac3` and `Eac3`
- `MEDIASUBTYPE_DOLBY_TRUEHD` for TrueHD
- `MFAudioFormat_DTS_HD` for DTS

The console then passes them to a receiver, or decodes them itself.

## The package

`../nuget/Moonfin.FFmpegInteropX.UWP.Lib.2.1.0.2.nupkg` is the result. It holds only the x64 UWP library, and it depends on the unchanged `FFmpegInteropX.UWP.FFmpeg` 8.1.2. `../shell/nuget.config` adds that folder as a package source.

## Rebuilding

Run this on Windows from the repo root:

```
powershell -NoProfile -ExecutionPolicy Bypass -File packages/build-xbox/ffmpeginteropx/build.ps1
```

You need git, the .NET SDK, and the Visual Studio Build Tools 2022 with MSVC v143 and the Universal Windows Platform workload. The script does these steps:

1. Clones the v2.1.0 tag.
2. Applies the patch.
3. Builds against the released FFmpeg 8.1.2 package.
4. Packs the result into `../nuget`.

When the package changes, raise its version in `build.ps1` and in `Moonfin.Xbox.csproj`, because NuGet caches a package by its version.

## Licenses

FFmpegInteropX is Apache-2.0 (https://github.com/ffmpeginteropx/FFmpegInteropX), and its license is packed as `LICENSE`. The patch changes `Source/FFmpegInteropX.idl`, `Source/VideoConfig.h`, `Source/AudioConfig.h`, `Source/MediaSampleProvider.cpp` and `Source/FFmpegMediaSource.cpp`. The choice of Dolby Vision attributes follows Chromium's `media/renderers/win/media_foundation_video_stream.cc` (BSD-3-Clause). `Moonfin.FFmpegInteropX.UWP.Lib.targets` is FFmpegInteropX's own targets file under the new package name.
