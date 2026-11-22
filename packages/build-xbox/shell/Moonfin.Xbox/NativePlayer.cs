using System;
using System.Threading.Tasks;
using FFmpegInteropX;
using Windows.Data.Json;
using Windows.Foundation.Collections;
using Windows.Media;
using Windows.Media.Core;
using Windows.Media.MediaProperties;
using Windows.Media.Playback;
using Windows.Media.Streaming.Adaptive;
using Windows.Security.Cryptography.Certificates;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.UI.Core;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.Web.Http;
using Windows.Web.Http.Filters;

namespace Moonfin.Xbox
{
    // The console's own player, drawn behind the WebView.
    //
    // The WebView decodes H.264 on the processor and wont open the console's HEVC
    // decoder on the Series consoles at all, so the page hands its video to this
    // player instead and keeps drawing its controls and subtitles over it. The page
    // drives it the way it would a video element, through PLAYER_* messages, and hears
    // back through PLAYER_EVENT. Every open gets a session number from the page, and a
    // message for an older session is dropped, so a stream closed and reopened in
    // quick succession cant have the old one's events land on the new one.
    //
    // Files are opened through FFmpeg, which reads them in one pass and hands the
    // picture to the console's decoders, since the system's own reader crawls on a slow
    // link and wont take HEVC out of a Matroska file. The server's HLS transcodes go
    // through the system's adaptive source. With passthrough on, the page sends a film
    // whose sound a receiver decodes to the system's reader after all, which hands that
    // sound to the console as it is. FFmpeg takes the file when that reader cant play it,
    // and is then told to hand the sound on as it is too.
    //
    // A Dolby Vision film is opened with the display already in Dolby Vision mode, and
    // FFmpeg hands its picture to the console's decoder tagged with the profile of the
    // console's Dolby Vision effect, which Windows then puts between the decoder and the
    // display.
    internal sealed class NativePlayer
    {
        private static readonly TimeSpan TickInterval = TimeSpan.FromMilliseconds(250);
        private static readonly TimeSpan ReadAhead = TimeSpan.FromSeconds(30);
        private const uint ReadAheadBytes = 48 * 1024 * 1024;

        private readonly MediaPlayer player = new MediaPlayer();
        private readonly MediaPlayerElement element;
        private readonly UIElement backdrop;
        private readonly CoreDispatcher dispatcher;
        private readonly Action<string, IJsonValue> send;
        private readonly Func<string, bool> acceptsUntrusted;
        private readonly DispatcherTimer ticker = new DispatcherTimer();

        private double session = -1;
        private MediaPlaybackItem item;
        private FFmpegMediaSource file;
        private MediaSource source;
        private AdaptiveMediaSource adaptive;
        private IRandomAccessStream packagedStream;
        private HttpClient client;
        private double startSeconds;
        private int wantsSubtitle = -1;
        private bool wantsPlay;
        private bool opened;
        private Uri openedUri;
        private bool fallsBack;
        private bool wantsHdr10;
        private bool passthrough;
        // The effect's profile the open's stream is tagged with, such as dvhe.05
        private string dolbyVision;

        public NativePlayer(MediaPlayerElement element, UIElement backdrop, CoreDispatcher dispatcher, Action<string, IJsonValue> send, Func<string, bool> acceptsUntrusted)
        {
            this.element = element;
            this.backdrop = backdrop;
            this.dispatcher = dispatcher;
            this.send = send;
            this.acceptsUntrusted = acceptsUntrusted;

            player.AutoPlay = false;
            player.AudioCategory = MediaPlayerAudioCategory.Movie;
            // The page owns the transport controls and hears their buttons as keys.
            player.CommandManager.IsEnabled = false;
            element.SetMediaPlayer(player);

            player.MediaOpened += (sender, args) => OnUi(OnOpened);
            player.MediaFailed += (sender, args) => OnUi(() => OnFailed(args));
            player.MediaEnded += (sender, args) => OnUi(() => Push("ended", Position()));
            player.PlaybackSession.PlaybackStateChanged += (sender, args) => OnUi(OnStateChanged);
            player.PlaybackSession.SeekCompleted += (sender, args) => OnUi(() => Push("seeked", Position()));
            player.PlaybackSession.NaturalVideoSizeChanged += (sender, args) => OnUi(() => Push("natural", Natural()));

            ticker.Interval = TickInterval;
            ticker.Tick += (sender, args) => Push("timeupdate", Timing());
        }

        // True when the message was one of the player's. A reply goes out for the ones
        // that carried an id.
        public bool Handle(PageMessage message)
        {
            switch (message.Type)
            {
                case "PLAYER_OPEN":
                    Open(message);
                    return true;
                case "PLAYER_CLOSE":
                    CloseFor(message);
                    return true;
                case "PLAYER_PLAY":
                    if (IsCurrent(message)) Play();
                    return true;
                case "PLAYER_PAUSE":
                    if (IsCurrent(message)) Pause();
                    return true;
                case "PLAYER_SEEK":
                    if (IsCurrent(message)) Seek(message.Payload.GetNamedNumber("seconds", 0));
                    return true;
                case "PLAYER_SET_VOLUME":
                    if (IsCurrent(message)) SetVolume(message.Payload);
                    return true;
                case "PLAYER_SELECT_AUDIO":
                    if (IsCurrent(message)) SelectAudio((int)message.Payload.GetNamedNumber("index", -1));
                    return true;
                case "PLAYER_SELECT_SUBTITLE":
                    if (IsCurrent(message)) SelectSubtitle((int)message.Payload.GetNamedNumber("index", -1));
                    return true;
                case "PLAYER_SET_RECT":
                    if (IsCurrent(message)) SetRect(message.Payload);
                    return true;
                case "PLAYER_GET_STATE":
                    MainPage.Current?.Reply(message, State(), null);
                    return true;
                default:
                    return false;
            }
        }

        private bool IsCurrent(PageMessage message)
        {
            return message.Payload != null && message.Payload.GetNamedNumber("session", -2) == session;
        }

        private async void Open(PageMessage message)
        {
            JsonObject payload = message.Payload;
            string url = Bridge.NamedString(payload, "url");
            if (payload == null || url == null || !Uri.TryCreate(url, UriKind.Absolute, out Uri uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
            {
                MainPage.Current?.Reply(message, null, "No stream address");
                return;
            }

            Release();
            session = payload.GetNamedNumber("session", 0);
            wantsPlay = payload.GetNamedBoolean("autoplay", false);
            startSeconds = payload.GetNamedNumber("startSeconds", 0);
            wantsSubtitle = (int)payload.GetNamedNumber("subtitle", -1);
            player.Volume = payload.GetNamedNumber("volume", 1);
            player.IsMuted = payload.GetNamedBoolean("muted", false);
            bool systemReader = Bridge.NamedString(payload, "reader") == "system";
            // A film the page sent to the system's reader goes to FFmpeg if that reader cant
            // play it, and the probe, which asks for no fallback, hears that it failed.
            fallsBack = systemReader && payload.GetNamedBoolean("fallback", false);
            wantsHdr10 = systemReader && payload.GetNamedBoolean("hdr10", false);
            passthrough = payload.GetNamedBoolean("passthrough", false);
            openedUri = uri;
            int dolbyVisionProfile = (int)payload.GetNamedNumber("dolbyVision", 0);
            double opening = session;

            try
            {
                if (dolbyVisionProfile > 0)
                {
                    JsonObject answer = await DisplayModes.SetForDolbyVisionAsync();
                    if (session != opening)
                    {
                        // The page closed it while the display was switching
                        if (session < 0) await DisplayModes.RestoreAsync();
                        MainPage.Current?.Reply(message, Ok(), null);
                        return;
                    }
                    answer.SetNamedValue("hdr", JsonValue.CreateStringValue("dolbyvision"));
                    Push("display", answer);
                    bool inDolbyVision = answer.GetNamedBoolean("ok", false);
                    // Profile 5 has no HDR10 picture under its Dolby Vision one, so it cant play without the mode
                    if (!inDolbyVision && dolbyVisionProfile == 5)
                    {
                        Fail(4, "The display would not switch to Dolby Vision: " + Bridge.NamedString(answer, "reason"));
                        MainPage.Current?.Reply(message, Ok(), null);
                        return;
                    }
                    // The probe leaves the tags off to see what the console does without them
                    if (inDolbyVision && !systemReader && payload.GetNamedBoolean("dolbyVisionTags", true))
                    {
                        dolbyVision = DolbyVisionEffect.ProfileFor(dolbyVisionProfile);
                    }
                }
                else if (DisplayModes.InDolbyVision)
                {
                    // A film after a Dolby Vision one would otherwise play in Dolby Vision mode
                    await DisplayModes.RestoreAsync();
                }

                if (await LoadAsync(uri, payload.GetNamedBoolean("hls", false), systemReader))
                {
                    Show();
                    player.Source = item;
                }
                MainPage.Current?.Reply(message, Ok(), null);
            }
            catch (Exception ex)
            {
                HostLog.Write("player", "Could not open " + uri.Host + ": " + ex.Message);
                Fail(2, ex.Message);
                MainPage.Current?.Reply(message, Ok(), null);
            }
        }

        // Makes the item for a stream, false when its playlist was turned away.
        private async Task<bool> LoadAsync(Uri uri, bool hls, bool systemReader)
        {
            bool untrusted = acceptsUntrusted(uri.Authority);
            bool packaged = string.Equals(uri.Host, MainPage.AppHost, StringComparison.OrdinalIgnoreCase);
            if (hls)
            {
                AdaptiveMediaSourceCreationResult created;
                if (packaged)
                {
                    // A stream of the package, which the probe plays as a server transcode.
                    // The system's source cant see the WebView's name for it either, so the
                    // playlist and its segments are read from the package itself.
                    packagedStream = await (await PackagedFile(uri)).OpenReadAsync();
                    created = await AdaptiveMediaSource.CreateFromStreamAsync(packagedStream, uri, "application/vnd.apple.mpegurl");
                }
                else
                {
                    if (untrusted) client = UntrustingClient();
                    created = untrusted
                        ? await AdaptiveMediaSource.CreateFromUriAsync(uri, client)
                        : await AdaptiveMediaSource.CreateFromUriAsync(uri);
                }
                if (created.Status != AdaptiveMediaSourceCreationStatus.Success)
                {
                    Fail(created.Status == AdaptiveMediaSourceCreationStatus.UnsupportedManifestContentType ? 4 : 2, "Playlist " + created.Status);
                    return false;
                }
                adaptive = created.MediaSource;
                if (packaged) adaptive.DownloadRequested += ServeFromPackage;
                source = MediaSource.CreateFromAdaptiveMediaSource(adaptive);
                item = new MediaPlaybackItem(source);
            }
            else if (systemReader && !untrusted)
            {
                // The system's own reader, which hands the console the sound as it is in the
                // file, so a receiver can decode it. It takes no certificate the console
                // refuses, so such a server's files stay with FFmpeg.
                source = packaged ? MediaSource.CreateFromStorageFile(await PackagedFile(uri)) : MediaSource.CreateFromUri(uri);
                item = new MediaPlaybackItem(source);
            }
            else if (packaged)
            {
                // A file of the package, which the probe plays. FFmpeg cant see the
                // WebView's name for it, so it is opened from the package itself.
                packagedStream = await (await PackagedFile(uri)).OpenReadAsync();
                file = await FFmpegMediaSource.CreateFromStreamAsync(packagedStream, FileConfig(false));
                item = file.CreateMediaPlaybackItem();
            }
            else
            {
                file = await FFmpegMediaSource.CreateFromUriAsync(uri.OriginalString, FileConfig(untrusted));
                item = file.CreateMediaPlaybackItem();
            }
            return true;
        }

        // The system's reader turned the file away or found no picture in it, so FFmpeg
        // opens it after all.
        private async void FallBackToFFmpeg(string why)
        {
            HostLog.Write("player", "The system reader could not play " + openedUri.Host + " (" + why + "), so FFmpeg opens it");
            double forSession = session;
            fallsBack = false;
            wantsHdr10 = false;
            ReleaseSource();
            try
            {
                await LoadAsync(openedUri, false, false);
                if (session == forSession) player.Source = item;
            }
            catch (Exception ex)
            {
                if (session == forSession) Fail(2, ex.Message);
            }
        }

        private static async Task<StorageFile> PackagedFile(Uri uri)
        {
            return await StorageFile.GetFileFromApplicationUriAsync(new Uri("ms-appx:///www" + uri.AbsolutePath));
        }

        // The segments of a stream of the package, read from it as the source asks for them.
        private static async void ServeFromPackage(AdaptiveMediaSource sender, AdaptiveMediaSourceDownloadRequestedEventArgs args)
        {
            AdaptiveMediaSourceDownloadRequestedDeferral deferral = args.GetDeferral();
            try
            {
                args.Result.Buffer = await FileIO.ReadBufferAsync(await PackagedFile(args.ResourceUri));
                args.Result.ContentType = SegmentType(args.ResourceUri.AbsolutePath);
            }
            catch (Exception ex)
            {
                HostLog.Write("player", "Could not read " + args.ResourceUri.AbsolutePath + " from the package: " + ex.Message);
            }
            finally
            {
                deferral.Complete();
            }
        }

        private static string SegmentType(string path)
        {
            if (path.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase)) return "application/vnd.apple.mpegurl";
            if (path.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".m4s", StringComparison.OrdinalIgnoreCase)) return "video/mp4";
            return "video/mp2t";
        }

        private MediaSourceConfig FileConfig(bool untrusted)
        {
            var config = new MediaSourceConfig();
            config.General.ReadAheadBufferEnabled = true;
            config.General.ReadAheadBufferDuration = ReadAhead;
            config.General.ReadAheadBufferSize = ReadAheadBytes;
            config.General.FastSeek = true;
            config.Video.VideoDecoderMode = VideoDecoderMode.Automatic;
            // In Dolby Vision mode the console's decoder takes the picture, since only it hands
            // each frame's Dolby Vision metadata on to the effect.
            if (DisplayModes.InDolbyVision)
            {
                config.Video.VideoDecoderMode = VideoDecoderMode.ForceSystemDecoder;
                if (dolbyVision != null) config.Video.DolbyVisionRendererProfile = dolbyVision;
            }
            // The console passes AC-3, E-AC-3, TrueHD and DTS to a receiver when it gets them as they are
            config.Audio.SystemDecoderSurround = passthrough;
            // Marks HDR frames as HDR whatever mode the display is in when the file opens,
            // since the display is only switched once the file has.
            config.Video.HdrSupport = HdrSupport.Enabled;
            // The page says which subtitle track shows, if any
            config.Subtitles.AutoSelectForcedSubtitles = false;
            config.FFmpegOptions = new PropertySet
            {
                {"reconnect", 1},
                {"reconnect_streamed", 1},
                {"reconnect_on_network_error", 1},
                {"user_agent", "Moonfin Xbox"}
            };
            // The user's choice to accept a server's certificate holds here as it does in the WebView.
            if (untrusted) config.FFmpegOptions.Add("tls_verify", 0);
            return config;
        }

        private async void CloseFor(PageMessage message)
        {
            if (IsCurrent(message)) await CloseAsync();
            MainPage.Current?.Reply(message, Ok(), null);
        }

        // Lets go of whatever is open, puts the display back and tells the page.
        public async Task CloseAsync()
        {
            if (session < 0) return;
            double closing = session;
            Release();
            await DisplayModes.RestoreAsync();
            Push(closing, "closed", new JsonObject());
        }

        private void Release()
        {
            ticker.Stop();
            opened = false;
            wantsPlay = false;
            wantsSubtitle = -1;
            fallsBack = false;
            wantsHdr10 = false;
            passthrough = false;
            dolbyVision = null;
            session = -1;
            try
            {
                player.Pause();
            }
            catch (Exception)
            {
                // nothing was playing
            }
            element.Visibility = Visibility.Collapsed;
            backdrop.Visibility = Visibility.Collapsed;
            ReleaseSource();
        }

        private void ReleaseSource()
        {
            player.Source = null;
            item = null;
            file?.Dispose();
            file = null;
            adaptive?.Dispose();
            adaptive = null;
            source?.Dispose();
            source = null;
            packagedStream?.Dispose();
            packagedStream = null;
            client?.Dispose();
            client = null;
        }

        private void Play()
        {
            wantsPlay = true;
            if (opened) player.Play();
        }

        private void Pause()
        {
            wantsPlay = false;
            if (opened) player.Pause();
        }

        private void Seek(double seconds)
        {
            MediaPlaybackSession playback = player.PlaybackSession;
            if (opened && playback.CanSeek)
            {
                playback.Position = TimeSpan.FromSeconds(Math.Max(0, seconds));
            }
            else
            {
                Push("seeked", Position());
            }
        }

        private void SetVolume(JsonObject payload)
        {
            player.Volume = payload.GetNamedNumber("volume", player.Volume);
            player.IsMuted = payload.GetNamedBoolean("muted", player.IsMuted);
        }

        private void SelectAudio(int index)
        {
            if (item == null || index < 0 || index >= item.AudioTracks.Count) return;
            item.AudioTracks.SelectedIndex = index;
        }

        private void SelectSubtitle(int streamIndex)
        {
            wantsSubtitle = streamIndex;
            if (opened) ApplySubtitle();
        }

        // Shows the file's subtitle track of that stream index, drawn by the player under
        // the page, and hides every other one. The page draws text subtitles itself and
        // hands over the bitmap ones it cant.
        private void ApplySubtitle()
        {
            if (item == null) return;
            TimedMetadataTrack wanted = null;
            if (file != null)
            {
                foreach (SubtitleStreamInfo stream in file.SubtitleStreams)
                {
                    if (stream.StreamIndex == wantsSubtitle) wanted = stream.SubtitleTrack;
                }
            }
            for (int i = 0; i < item.TimedMetadataTracks.Count; i++)
            {
                item.TimedMetadataTracks.SetPresentationMode((uint)i, item.TimedMetadataTracks[i] == wanted ? TimedMetadataTrackPresentationMode.PlatformPresented : TimedMetadataTrackPresentationMode.Disabled);
            }
        }

        // Where the page has laid its video out, in its own pixels, which are the screen's.
        private void SetRect(JsonObject payload)
        {
            element.Margin = new Thickness(payload.GetNamedNumber("x", 0), payload.GetNamedNumber("y", 0), 0, 0);
            element.Width = Math.Max(0, payload.GetNamedNumber("width", 0));
            element.Height = Math.Max(0, payload.GetNamedNumber("height", 0));
            Show();
        }

        private void Show()
        {
            backdrop.Visibility = Visibility.Visible;
            element.Visibility = Visibility.Visible;
        }

        private async void OnOpened()
        {
            if (item == null || player.Source != item) return;
            // A Matroska file whose picture the system's reader cant take out opens as sound alone
            if (fallsBack && item.VideoTracks.Count == 0)
            {
                FallBackToFFmpeg("no picture");
                return;
            }
            opened = true;
            item.AudioTracksChanged += (sender, args) => OnUi(() => Push("audioTracks", Tracks()));

            if (!DisplayModes.InDolbyVision && (file?.CurrentVideoStream?.HasHdrMetadata == true || wantsHdr10) && DisplayModes.DisplayHasHdr10())
            {
                JsonObject answer = await DisplayModes.SetForHdr10Async();
                answer.SetNamedValue("hdr", JsonValue.CreateStringValue("hdr10"));
                Push("display", answer);
            }

            if (startSeconds > 0 && player.PlaybackSession.CanSeek) player.PlaybackSession.Position = TimeSpan.FromSeconds(startSeconds);
            ApplySubtitle();

            JsonObject payload = Tracks();
            TimeSpan duration = player.PlaybackSession.NaturalDuration;
            payload.SetNamedValue("duration", duration > TimeSpan.Zero ? JsonValue.CreateNumberValue(duration.TotalSeconds) : JsonValue.CreateNullValue());
            payload.SetNamedValue("width", JsonValue.CreateNumberValue(player.PlaybackSession.NaturalVideoWidth));
            payload.SetNamedValue("height", JsonValue.CreateNumberValue(player.PlaybackSession.NaturalVideoHeight));
            payload.SetNamedValue("canSeek", JsonValue.CreateBooleanValue(player.PlaybackSession.CanSeek));
            payload.SetNamedValue("isLive", JsonValue.CreateBooleanValue(adaptive != null && adaptive.IsLive));
            Push("opened", payload);

            if (wantsPlay) player.Play();
        }

        private void OnFailed(MediaPlayerFailedEventArgs args)
        {
            if (fallsBack && !opened)
            {
                FallBackToFFmpeg(args.Error + ": " + args.ErrorMessage);
                return;
            }
            int code;
            switch (args.Error)
            {
                case MediaPlayerError.Aborted: code = 1; break;
                case MediaPlayerError.NetworkError: code = 2; break;
                case MediaPlayerError.SourceNotSupported: code = 4; break;
                default: code = 3; break;
            }
            string detail = args.ExtendedErrorCode != null ? " (0x" + args.ExtendedErrorCode.HResult.ToString("X8") + ")" : "";
            Fail(code, args.Error + ": " + args.ErrorMessage + detail);
        }

        private void Fail(int code, string message)
        {
            ticker.Stop();
            var payload = new JsonObject();
            payload.SetNamedValue("code", JsonValue.CreateNumberValue(code));
            payload.SetNamedValue("message", JsonValue.CreateStringValue(message ?? ""));
            Push("error", payload);
        }

        private void OnStateChanged()
        {
            switch (player.PlaybackSession.PlaybackState)
            {
                case MediaPlaybackState.Playing:
                    ticker.Start();
                    Push("playing", Position());
                    break;
                case MediaPlaybackState.Buffering:
                    Push("waiting", Position());
                    break;
                case MediaPlaybackState.Paused:
                    ticker.Stop();
                    Push("paused", Position());
                    break;
            }
        }

        private JsonObject Position()
        {
            var payload = new JsonObject();
            payload.SetNamedValue("position", JsonValue.CreateNumberValue(player.PlaybackSession.Position.TotalSeconds));
            return payload;
        }

        private JsonObject Timing()
        {
            MediaPlaybackSession playback = player.PlaybackSession;
            JsonObject payload = Position();
            TimeSpan duration = playback.NaturalDuration;
            payload.SetNamedValue("duration", duration > TimeSpan.Zero ? JsonValue.CreateNumberValue(duration.TotalSeconds) : JsonValue.CreateNullValue());
            var ranges = new JsonArray();
            try
            {
                foreach (MediaTimeRange range in playback.GetBufferedRanges())
                {
                    var pair = new JsonArray();
                    pair.Add(JsonValue.CreateNumberValue(range.Start.TotalSeconds));
                    pair.Add(JsonValue.CreateNumberValue(range.End.TotalSeconds));
                    ranges.Add(pair);
                }
            }
            catch (Exception)
            {
                // not every source says what it holds
            }
            payload.SetNamedValue("buffered", ranges);
            return payload;
        }

        private JsonObject Natural()
        {
            var payload = new JsonObject();
            payload.SetNamedValue("width", JsonValue.CreateNumberValue(player.PlaybackSession.NaturalVideoWidth));
            payload.SetNamedValue("height", JsonValue.CreateNumberValue(player.PlaybackSession.NaturalVideoHeight));
            return payload;
        }

        private JsonObject Tracks()
        {
            var payload = new JsonObject();
            var tracks = new JsonArray();
            int selected = -1;
            if (item != null)
            {
                for (int i = 0; i < item.AudioTracks.Count; i++)
                {
                    AudioTrack track = item.AudioTracks[i];
                    var entry = new JsonObject();
                    entry.SetNamedValue("index", JsonValue.CreateNumberValue(i));
                    entry.SetNamedValue("id", JsonValue.CreateStringValue(track.Id ?? ""));
                    entry.SetNamedValue("language", JsonValue.CreateStringValue(track.Language ?? ""));
                    entry.SetNamedValue("label", JsonValue.CreateStringValue(track.Name ?? ""));
                    tracks.Add(entry);
                }
                selected = item.AudioTracks.SelectedIndex;
            }
            payload.SetNamedValue("audioTracks", tracks);
            payload.SetNamedValue("selectedAudio", JsonValue.CreateNumberValue(selected));
            return payload;
        }

        private JsonObject State()
        {
            JsonObject payload = Timing();
            payload.SetNamedValue("session", JsonValue.CreateNumberValue(session));
            payload.SetNamedValue("opened", JsonValue.CreateBooleanValue(opened));
            payload.SetNamedValue("state", JsonValue.CreateStringValue(player.PlaybackSession.PlaybackState.ToString()));
            payload.SetNamedValue("width", JsonValue.CreateNumberValue(player.PlaybackSession.NaturalVideoWidth));
            payload.SetNamedValue("height", JsonValue.CreateNumberValue(player.PlaybackSession.NaturalVideoHeight));
            if (item != null) payload.SetNamedValue("selectedAudio", JsonValue.CreateNumberValue(item.AudioTracks.SelectedIndex));
            if (file != null)
            {
                VideoStreamInfo video = file.CurrentVideoStream;
                AudioStreamInfo audio = file.CurrentAudioStream;
                if (video != null) payload.SetNamedValue("videoDecoder", JsonValue.CreateStringValue(video.CodecName + " " + video.DecoderEngine));
                if (audio != null) payload.SetNamedValue("audioDecoder", JsonValue.CreateStringValue(audio.CodecName + " " + audio.DecoderEngine));
            }
            payload.SetNamedValue("dolbyVisionProfile", dolbyVision != null ? JsonValue.CreateStringValue(dolbyVision) : JsonValue.CreateNullValue());
            string format = AudioFormat();
            if (format != null) payload.SetNamedValue("audioFormat", JsonValue.CreateStringValue(format));
            return payload;
        }

        // The format the console gets for the playing track. A compressed one such as EAC3,
        // or a GUID for TrueHD and DTS, can go on to a receiver, and PCM or Float means
        // FFmpeg decoded it.
        private string AudioFormat()
        {
            if (item == null || item.AudioTracks.Count == 0) return null;
            int index = Math.Max(0, item.AudioTracks.SelectedIndex);
            try
            {
                AudioEncodingProperties format = item.AudioTracks[index].GetEncodingProperties();
                // An fMP4 stream's AAC has no channel count until it is decoded
                string channels = format.ChannelCount > 0 ? " " + format.ChannelCount + " ch" : "";
                return format.Subtype + channels + " " + format.SampleRate + " Hz";
            }
            catch (Exception)
            {
                // not every source says
                return null;
            }
        }

        private static JsonObject Ok()
        {
            var payload = new JsonObject();
            payload.SetNamedValue("ok", JsonValue.CreateBooleanValue(true));
            return payload;
        }

        private static HttpClient UntrustingClient()
        {
            var filter = new HttpBaseProtocolFilter();
            filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.Untrusted);
            filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.Expired);
            filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.InvalidName);
            filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.IncompleteChain);
            return new HttpClient(filter);
        }

        private void Push(string kind, JsonObject payload)
        {
            Push(session, kind, payload);
        }

        private void Push(double forSession, string kind, JsonObject payload)
        {
            if (forSession < 0) return;
            payload.SetNamedValue("session", JsonValue.CreateNumberValue(forSession));
            payload.SetNamedValue("event", JsonValue.CreateStringValue(kind));
            send("PLAYER_EVENT", payload);
        }

        // The player raises its events off the UI thread, and the page is reached from it.
        private async void OnUi(Action action)
        {
            await dispatcher.RunAsync(CoreDispatcherPriority.Normal, () =>
            {
                try
                {
                    action();
                }
                catch (Exception ex)
                {
                    HostLog.Write("player", ex.Message);
                }
            });
        }
    }
}
