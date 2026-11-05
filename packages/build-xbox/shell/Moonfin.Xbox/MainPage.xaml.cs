using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.Media;
using Windows.Networking.Connectivity;
using Windows.Storage;
using Windows.System;
using Windows.System.Display;
using Windows.UI;
using Windows.UI.Core;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Media;

namespace Moonfin.Xbox
{
    // The one page of the app: a full screen WebView showing the web app that ships in
    // the package under www, and the handful of things only native code can do for it.
    public sealed partial class MainPage : Page
    {
        // The page is served from the package under this name. It has no dot-local
        // ending, which WebView2 is slow to resolve.
        public const string AppHost = "moonfin.internal";

        // Served over http so a server on the home network that only speaks http isnt
        // mixed content, which is how the app behaves on the TVs. The price is that the page
        // isnt a secure context. Saved servers and settings live in the storage of this
        // exact origin, so changing the scheme signs every user out.
        private const string AppOrigin = "http://" + AppHost;
        private const string StartPage = AppOrigin + "/index.html";

        // A second failure of the WebView this soon after the first isnt worth another reload.
        private static readonly TimeSpan FailureWindow = TimeSpan.FromSeconds(30);

        // A server as the page names it: a host name or address, with a port if it has one.
        private static readonly Regex ServerAuthority = new Regex(@"^([A-Za-z0-9.\-]{1,253}|\[[0-9A-Fa-f:.]{2,45}\])(:\d{1,5})?$");

        public static MainPage Current { get; private set; }

        private WebView2 webView;
        private bool pageReady;
        private DateTimeOffset lastFailure = DateTimeOffset.MinValue;

#if DEBUG
        // The origin of a dev server the page is loaded from instead, see ReadDevUrlAsync.
        private string devOrigin;
#endif

        // Lets the system know a video is playing, and brings the media remote's buttons here.
        private readonly SystemMediaTransportControls transportControls;

        private readonly DisplayRequest displayRequest = new DisplayRequest();
        private bool displayHeld;

        // Servers whose certificate the user chose to accept, as "host" or "host:port".
        private readonly HashSet<string> insecureHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private PlaybackSession playbackSession;

        private readonly NativePlayer nativePlayer;

        private readonly SocketRelay socketRelay;

        public MainPage()
        {
            InitializeComponent();
            Current = this;

            nativePlayer = new NativePlayer(VideoHost, VideoBackdrop, Dispatcher, SendToPage, authority => insecureHosts.Contains(authority));
            socketRelay = new SocketRelay(Dispatcher, SendToPage, authority => insecureHosts.Contains(authority));

            // Xbox keeps a border around the content for sets that cut the edges off. The web
            // app lays itself out for a TV already, so it is given the whole screen.
            ApplicationView.GetForCurrentView().SetDesiredBoundsMode(ApplicationViewBoundsMode.UseCoreWindow);

            transportControls = SystemMediaTransportControls.GetForCurrentView();
            transportControls.IsPlayEnabled = true;
            transportControls.IsPauseEnabled = true;
            transportControls.IsStopEnabled = true;
            transportControls.IsFastForwardEnabled = true;
            transportControls.IsRewindEnabled = true;
            transportControls.ButtonPressed += OnTransportButtonPressed;
            transportControls.DisplayUpdater.Type = MediaPlaybackType.Video;
            transportControls.DisplayUpdater.VideoProperties.Title = "Moonfin";
            transportControls.DisplayUpdater.Update();

            // Left alone, B on the first screen takes the user out of the app. The web app
            // decides what Back does, so it is always claimed here and passed on.
            SystemNavigationManager.GetForCurrentView().BackRequested += OnBackRequested;

            NetworkInformation.NetworkStatusChanged += OnNetworkStatusChanged;

            HostLog.ToPage = LogToPage;

            InitializeWebView();
        }

        private async void InitializeWebView()
        {
            try
            {
                ErrorPanel.Visibility = Visibility.Collapsed;
                pageReady = false;

                var view = new WebView2();
                await view.EnsureCoreWebView2Async();

                CoreWebView2 core = view.CoreWebView2;
                if (core == null)
                {
                    ShowError("Moonfin could not start its web view.");
                    return;
                }

                // Only now can the WebView take focus, so only now does it go on the page.
                webView = view;
                WebViewHost.Children.Clear();
                WebViewHost.Children.Add(view);
                view.Focus(FocusState.Programmatic);

                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsGeneralAutofillEnabled = false;
                core.Settings.IsPasswordAutosaveEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.IsZoomControlEnabled = false;
                core.Settings.IsPinchZoomEnabled = false;
                core.Settings.IsSwipeNavigationEnabled = false;
                core.Settings.AreBrowserAcceleratorKeysEnabled = false;
                // The WebView only ever shows the app's own page, so the check is all cost.
                core.Settings.IsReputationCheckingRequired = false;
#if DEBUG
                core.Settings.AreDevToolsEnabled = true;
#else
                core.Settings.AreDevToolsEnabled = false;
#endif

                // A file the folder doesnt hold is answered with a network error, not a 404, and
                // requests for mapped files never reach WebResourceRequested, so the page deals
                // with that itself. See packages/platform-xbox/src/packageFiles.js.
                core.SetVirtualHostNameToFolderMapping(AppHost, "www", CoreWebView2HostResourceAccessKind.DenyCors);

                string startUrl = StartPage;
#if DEBUG
                string devUrl = await ReadDevUrlAsync();
                if (devUrl != null)
                {
                    devOrigin = new Uri(devUrl).GetLeftPart(UriPartial.Authority);
                    startUrl = devUrl;
                }
#endif

                JsonObject boot = await BootData.CollectAsync(core.Environment.BrowserVersionString);
                await core.AddScriptToExecuteOnDocumentCreatedAsync(Bridge.BootScript(boot));

                view.WebMessageReceived += OnWebMessageReceived;
                view.NavigationCompleted += OnNavigationCompleted;
                core.NavigationStarting += OnNavigationStarting;
                core.NewWindowRequested += OnNewWindowRequested;
                core.LaunchingExternalUriScheme += OnLaunchingExternalUriScheme;
                core.ServerCertificateErrorDetected += OnServerCertificateError;
                // Only what script asks for, which leaves the video element to fetch the
                // muxed file from the same hosts by itself.
                foreach (string filter in CorsRelay.Filters)
                {
                    core.AddWebResourceRequestedFilter(filter, CoreWebView2WebResourceContext.XmlHttpRequest);
                    core.AddWebResourceRequestedFilter(filter, CoreWebView2WebResourceContext.Fetch);
                }
                core.WebResourceRequested += OnWebResourceRequested;
                core.ProcessFailed += OnProcessFailed;

                core.Navigate(startUrl);
            }
            catch (Exception ex)
            {
                HostLog.Write("host", "WebView could not be set up: " + ex);
                ShowError("Moonfin could not start its web view.");
            }
        }

#if DEBUG
        // A Debug package built with --dev-url carries the address of a dev server in
        // www/dev-url.txt, and loads the app from there so a change shows on the console
        // without a new package.
        private static async Task<string> ReadDevUrlAsync()
        {
            try
            {
                StorageFile file = await StorageFile.GetFileFromApplicationUriAsync(new Uri("ms-appx:///www/dev-url.txt"));
                string text = (await FileIO.ReadTextAsync(file)).Trim();
                if (Uri.TryCreate(text, UriKind.Absolute, out Uri url) && (url.Scheme == "http" || url.Scheme == "https")) return url.AbsoluteUri;
            }
            catch (Exception)
            {
                // no dev server named, which is the usual case
            }
            return null;
        }
#endif

        // The app's own page and nothing else. A Debug build also takes the page over https
        // and from the dev server.
        private bool IsAppPage(string address)
        {
            if (!Uri.TryCreate(address, UriKind.Absolute, out Uri uri)) return false;
            string origin = uri.GetLeftPart(UriPartial.Authority);
            if (string.Equals(origin, AppOrigin, StringComparison.OrdinalIgnoreCase)) return true;
#if DEBUG
            if (string.Equals(origin, "https://" + AppHost, StringComparison.OrdinalIgnoreCase)) return true;
            if (devOrigin != null && string.Equals(origin, devOrigin, StringComparison.OrdinalIgnoreCase)) return true;
#endif
            return false;
        }

        private void OnNavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args)
        {
            if (IsAppPage(args.Uri))
            {
                pageReady = false;
                // A page that loads afresh knows nothing of what the last one left playing or open.
                _ = nativePlayer.CloseAsync();
                socketRelay.CloseAll();
                return;
            }
            // Anything else would run in a WebView that has the bridge, so it never loads here.
            args.Cancel = true;
            OpenOutside(args.Uri);
        }

        private void OnNavigationCompleted(WebView2 sender, CoreWebView2NavigationCompletedEventArgs args)
        {
            if (!args.IsSuccess)
            {
                HostLog.Write("host", "Navigation failed: " + args.WebErrorStatus);
                return;
            }
            pageReady = true;
            SendNetwork();
        }

        private void OnNewWindowRequested(CoreWebView2 sender, CoreWebView2NewWindowRequestedEventArgs args)
        {
            args.Handled = true;
            OpenOutside(args.Uri);
        }

        // The WebView's own confirmation dialog cant be worked with a controller.
        private void OnLaunchingExternalUriScheme(CoreWebView2 sender, CoreWebView2LaunchingExternalUriSchemeEventArgs args)
        {
            args.Cancel = true;
        }

        // A web address goes to the system's browser. Anything else is dropped.
        private static async void OpenOutside(string address)
        {
            if (!Uri.TryCreate(address, UriKind.Absolute, out Uri uri) || (uri.Scheme != "http" && uri.Scheme != "https")) return;
            try
            {
                await Launcher.LaunchUriAsync(uri);
            }
            catch (Exception ex)
            {
                HostLog.Write("host", "Could not open " + address + ": " + ex.Message);
            }
        }

        // Only what CorsRelay names arrives here, and only the app's own page is served.
        private async void OnWebResourceRequested(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs args)
        {
            if (!CorsRelay.Handles(args.Request.Uri)) return;
            string origin = CorsRelay.Header(args.Request, "Origin");
            if (origin == null || !IsAppPage(origin + "/")) return;

            Windows.Foundation.Deferral deferral = args.GetDeferral();
            try
            {
                CoreWebView2WebResourceResponse response = await CorsRelay.RelayAsync(sender.Environment, args.Request, origin);
                if (response != null) args.Response = response;
            }
            catch (Exception ex)
            {
                HostLog.Write("relay", "Could not hand the answer over: " + ex.Message);
            }
            finally
            {
                deferral.Complete();
            }
        }

        // Raised for every request the WebView refuses over its certificate, the page's
        // own calls, images and video alike. It goes ahead only for a server the user chose.
        private void OnServerCertificateError(CoreWebView2 sender, CoreWebView2ServerCertificateErrorDetectedEventArgs args)
        {
            if (Uri.TryCreate(args.RequestUri, UriKind.Absolute, out Uri uri) && insecureHosts.Contains(uri.Authority))
            {
                args.Action = CoreWebView2ServerCertificateErrorAction.AlwaysAllow;
            }
        }

        private void OnProcessFailed(CoreWebView2 sender, CoreWebView2ProcessFailedEventArgs args)
        {
            HostLog.Write("host", "WebView process failed: " + args.ProcessFailedKind + ", " + args.Reason + ", exit code " + args.ExitCode);

            bool browserGone = args.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited;
            bool pageGone = args.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited
                || args.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive;
            // The other processes are restarted by the WebView itself.
            if (!browserGone && !pageGone) return;

            pageReady = false;
            SetDisplayActive(false);
            _ = nativePlayer.CloseAsync();
            socketRelay.CloseAll();

            DateTimeOffset now = DateTimeOffset.UtcNow;
            bool again = now - lastFailure < FailureWindow;
            lastFailure = now;

            // Without its browser process the WebView has nothing left to reload.
            if (again || browserGone)
            {
                ShowError("Moonfin ran into a problem and had to stop.");
                return;
            }

            try
            {
                sender.Reload();
            }
            catch (Exception)
            {
                ShowError("Moonfin ran into a problem and had to stop.");
            }
        }

        private void ShowError(string message)
        {
            WebView2 failed = webView;
            webView = null;
            pageReady = false;
            _ = nativePlayer.CloseAsync();
            socketRelay.CloseAll();
            WebViewHost.Children.Clear();
            try
            {
                failed?.Close();
            }
            catch (Exception)
            {
                // already gone
            }

            ErrorText.Text = message;
            ErrorPanel.Visibility = Visibility.Visible;
            RestartButton.Focus(FocusState.Programmatic);
        }

        private void OnRestartClick(object sender, RoutedEventArgs e)
        {
            InitializeWebView();
        }

        private void OnWebMessageReceived(WebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            try
            {
                if (!IsAppPage(args.Source)) return;
                PageMessage message = Bridge.Parse(args.TryGetWebMessageAsString());
                if (message != null) HandlePageMessage(message);
            }
            catch (Exception ex)
            {
                // A message that isnt a string, or doesnt hold what its type promises
                HostLog.Write("bridge", "Message refused: " + ex.Message);
            }
        }

        private void HandlePageMessage(PageMessage message)
        {
            switch (message.Type)
            {
                case "EXIT_APP":
                    ExitApp();
                    break;

                case "KEEP_DISPLAY_ACTIVE":
                    SetDisplayActive(message.Payload != null && message.Payload.GetNamedBoolean("active", false));
                    break;

                case "PLAYBACK_SESSION":
                    playbackSession = message.Payload == null ? null : PlaybackSession.FromPayload(message.Payload);
                    break;

                case "ALLOW_INSECURE_HOST":
                    AllowInsecureHost(Bridge.NamedString(message.Payload, "host"));
                    break;

                case "MEMORY":
                    Reply(message, ReadMemory(), null);
                    break;

                case "SAVE_REPORT":
                    SaveReport(message);
                    break;

                case "DISPLAY_GET_MODES":
                    Reply(message, BootData.ReadDisplay(), null);
                    break;

                case "DISPLAY_SET_FOR_MEDIA":
                    SetDisplayForMedia(message);
                    break;

                case "DISPLAY_RESTORE":
                    RestoreDisplay(message);
                    break;

                default:
                    if (nativePlayer.Handle(message)) break;
                    if (socketRelay.Handle(message)) break;
                    HostLog.Write("bridge", "Unknown message " + message.Type);
                    Reply(message, null, "Unknown message " + message.Type);
                    break;
            }
        }

        private void AllowInsecureHost(string host)
        {
            if (host == null || !ServerAuthority.IsMatch(host)) return;
            // The WebView names a server without its port when the port is the usual one.
            if (host.EndsWith(":443", StringComparison.Ordinal)) host = host.Substring(0, host.Length - 4);
            insecureHosts.Add(host);
        }

        // The probe page's findings, kept in the app's own folder where the Device Portal's
        // file explorer can fetch them: LocalAppData, this package, LocalState.
        private async void SaveReport(PageMessage message)
        {
            try
            {
                string text = Bridge.NamedString(message.Payload, "text");
                if (text == null)
                {
                    Reply(message, null, "No report text");
                    return;
                }
                StorageFile file = await ApplicationData.Current.LocalFolder.CreateFileAsync("probe-report.txt", CreationCollisionOption.ReplaceExisting);
                await FileIO.WriteTextAsync(file, text);

                var saved = new JsonObject();
                saved.SetNamedValue("path", JsonValue.CreateStringValue(file.Path));
                Reply(message, saved, null);
            }
            catch (Exception ex)
            {
                Reply(message, null, ex.Message);
            }
        }

        // Only HDR10 is asked for. Anything else the page names is left as the console has it.
        private async void SetDisplayForMedia(PageMessage message)
        {
            if (Bridge.NamedString(message.Payload, "hdr") != "hdr10")
            {
                Reply(message, null, "Only hdr10 can be asked for");
                return;
            }
            Reply(message, await DisplayModes.SetForHdr10Async(), null);
        }

        private async void RestoreDisplay(PageMessage message)
        {
            var answer = new JsonObject();
            answer.SetNamedValue("ok", JsonValue.CreateBooleanValue(await DisplayModes.RestoreAsync()));
            Reply(message, answer, null);
        }

        private static JsonObject ReadMemory()
        {
            var memory = new JsonObject();
            memory.SetNamedValue("usage", JsonValue.CreateNumberValue(MemoryManager.AppMemoryUsage));
            memory.SetNamedValue("limit", JsonValue.CreateNumberValue(MemoryManager.AppMemoryUsageLimit));
            memory.SetNamedValue("level", JsonValue.CreateStringValue(MemoryManager.AppMemoryUsageLevel.ToString()));
            return memory;
        }

        // The console dims the screen when the controller is left alone, so the request is
        // held for as long as the page says something is playing.
        private void SetDisplayActive(bool active)
        {
            try
            {
                if (active && !displayHeld)
                {
                    displayRequest.RequestActive();
                    displayHeld = true;
                }
                else if (!active && displayHeld)
                {
                    displayRequest.RequestRelease();
                    displayHeld = false;
                }
                transportControls.PlaybackStatus = active ? MediaPlaybackStatus.Playing : MediaPlaybackStatus.Paused;
            }
            catch (Exception ex)
            {
                HostLog.Write("host", "Display request failed: " + ex.Message);
            }
        }

        // A failure here goes to the debugger alone, since the page is what HostLog would tell.
        private async void RunScript(string script, bool whileLoading = false)
        {
            WebView2 view = webView;
            if (view == null || !(pageReady || whileLoading)) return;
            try
            {
                await view.ExecuteScriptAsync(script);
            }
            catch (Exception ex)
            {
                Debug.WriteLine("[XBOX:bridge] Could not reach the page: " + ex.Message);
            }
        }

        private async void LogToPage(string line)
        {
            await Dispatcher.RunAsync(CoreDispatcherPriority.Low, () => RunScript("console.log(" + JsonValue.CreateStringValue(line).Stringify() + ");", true));
        }

        private void SendToPage(string type, IJsonValue payload)
        {
            RunScript(Bridge.ToPageScript(type, payload));
        }

        // The page that asked is there to hear the answer, loaded or not.
        internal void Reply(PageMessage message, IJsonValue payload, string error)
        {
            if (message.Id.HasValue) RunScript(Bridge.ReplyScript(message.Id.Value, payload, error), true);
        }

        private void SendKey(string key)
        {
            var payload = new JsonObject();
            payload.SetNamedValue("key", JsonValue.CreateStringValue(key));
            SendToPage("KEY", payload);
        }

        private void SendNetwork()
        {
            var payload = new JsonObject();
            payload.SetNamedValue("connected", JsonValue.CreateBooleanValue(BootData.IsConnected()));
            payload.SetNamedValue("ip", BootData.NullableString(BootData.ReadIp()));
            SendToPage("NETWORK", payload);
        }

        public void SendAppState(bool active)
        {
            var payload = new JsonObject();
            payload.SetNamedValue("state", JsonValue.CreateStringValue(active ? "active" : "background"));
            SendToPage("APP_STATE", payload);
            if (active) webView?.Focus(FocusState.Programmatic);
        }

        private void OnBackRequested(object sender, BackRequestedEventArgs e)
        {
            e.Handled = true;
            SendKey("Back");
        }

        // Arrives on a background thread.
        private async void OnTransportButtonPressed(SystemMediaTransportControls sender, SystemMediaTransportControlsButtonPressedEventArgs args)
        {
            string key;
            switch (args.Button)
            {
                case SystemMediaTransportControlsButton.Play: key = "Play"; break;
                case SystemMediaTransportControlsButton.Pause: key = "Pause"; break;
                case SystemMediaTransportControlsButton.Stop: key = "Stop"; break;
                case SystemMediaTransportControlsButton.FastForward: key = "FastForward"; break;
                case SystemMediaTransportControlsButton.Rewind: key = "Rewind"; break;
                default: return;
            }
            await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () => SendKey(key));
        }

        // Arrives on a background thread.
        private async void OnNetworkStatusChanged(object sender)
        {
            await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, SendNetwork);
        }

        // Called by the app with a deferral held. The page is told, though it may be frozen
        // before it hears, and the stop report for whatever is playing goes out from here.
        public async Task SuspendAsync()
        {
            SetDisplayActive(false);
            SendAppState(false);
            await nativePlayer.CloseAsync();
            await DisplayModes.RestoreAsync();

            PlaybackSession session = playbackSession;
            playbackSession = null;
            if (session != null) await session.SendStopAsync(insecureHosts.Contains(session.Authority));
        }

        // Leaving by the app's own exit isnt a suspend, so whatever is playing is reported
        // stopped from here first.
        private async void ExitApp()
        {
            try
            {
                await SuspendAsync();
            }
            catch (Exception ex)
            {
                HostLog.Write("host", "Could not wrap up before exit: " + ex.Message);
            }
            Application.Current.Exit();
        }

        public void Resume()
        {
            SendAppState(true);
            SendNetwork();
        }
    }
}
