using System;
using System.Diagnostics;

namespace Moonfin.Xbox
{
    // What the host has to say for itself. It goes to the debugger, and in a Debug build
    // to the page's console as well, where the remote DevTools show it beside the page's
    // own log. A Release build tells the page nothing.
    internal static class HostLog
    {
        // Set by the page that holds the WebView. May be called from any thread.
        public static Action<string> ToPage;

        public static void Write(string area, string message)
        {
            string line = "[XBOX:" + area + "] " + message;
            Debug.WriteLine(line);
#if DEBUG
            try
            {
                ToPage?.Invoke(line);
            }
            catch (Exception)
            {
                // the page isn't there to hear it
            }
#endif
        }
    }
}
