using System;
using Windows.ApplicationModel;
using Windows.ApplicationModel.Activation;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;

namespace Moonfin.Xbox
{
    // The app is one page holding one WebView. Everything the user sees is the web app
    // inside it, and this class only sets the process up for that and passes on the
    // comings and goings the page can't see for itself.
    sealed partial class App : Application
    {
        public App()
        {
            InitializeComponent();

            Suspending += OnSuspending;
            Resuming += OnResuming;
            EnteredBackground += OnEnteredBackground;
            LeavingBackground += OnLeavingBackground;

            // Turns off the virtual cursor, so the controller moves focus instead of a pointer.
            RequiresPointerMode = ApplicationRequiresPointerMode.WhenRequested;

            // The WebView handles the media remote's buttons inconsistently, so they are kept
            // from it and handled through the system transport controls instead. The app is a
            // media player, so playback may start without a press right before it.
            string browserArguments = "--disable-features=HardwareMediaKeyHandling --autoplay-policy=no-user-gesture-required";
#if DEBUG
            // Lets Edge on another machine inspect the page through the Device Portal.
            browserArguments += " --enable-features=msEdgeDevToolsWdpRemoteDebugging";
#endif
            Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", browserArguments);

            // The WebView paints nothing behind the page, so the console's player shows
            // through wherever the page goes clear. The XAML page's background shows while
            // a page loads.
            Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00000000");

            // XAML apps are scaled up 2x on Xbox. Without that the page gets the whole
            // 1920 by 1080 at a scale of one.
            if (!ApplicationViewScaling.TrySetDisableLayoutScaling(true))
            {
                HostLog.Write("app", "Could not turn layout scaling off");
            }
        }

        protected override void OnLaunched(LaunchActivatedEventArgs e)
        {
            Frame rootFrame = Window.Current.Content as Frame;
            if (rootFrame == null)
            {
                rootFrame = new Frame();
                Window.Current.Content = rootFrame;
            }

            if (e.PrelaunchActivated) return;

            if (rootFrame.Content == null)
            {
                rootFrame.Navigate(typeof(MainPage), e.Arguments);
            }
            Window.Current.Activate();
        }

        // The page is frozen once the app is suspended and the app may be ended without
        // another word, so whatever has to reach the server goes out before the deferral ends.
        private async void OnSuspending(object sender, SuspendingEventArgs e)
        {
            SuspendingDeferral deferral = e.SuspendingOperation.GetDeferral();
            try
            {
                if (MainPage.Current != null) await MainPage.Current.SuspendAsync();
            }
            catch (Exception ex)
            {
                HostLog.Write("app", "Suspend failed: " + ex.Message);
            }
            finally
            {
                deferral.Complete();
            }
        }

        private void OnResuming(object sender, object e)
        {
            MainPage.Current?.Resume();
        }

        private void OnEnteredBackground(object sender, EnteredBackgroundEventArgs e)
        {
            MainPage.Current?.SendAppState(false);
        }

        private void OnLeavingBackground(object sender, LeavingBackgroundEventArgs e)
        {
            MainPage.Current?.SendAppState(true);
        }
    }
}
