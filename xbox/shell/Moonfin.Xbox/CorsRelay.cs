using Microsoft.Web.WebView2.Core;
using System;
using System.Threading;
using System.Threading.Tasks;
using Windows.Storage.Streams;
using Windows.Web.Http;
using Windows.Web.Http.Filters;

namespace Moonfin.Xbox
{
    // Requests the page may read across origins although the far side doesn't say so.
    //
    // On the TVs an app's page isn't held to CORS, and the app counts on that for
    // trailers: it asks YouTube's player API where a trailer's stream is, then reads
    // the stream's playlists and segments itself. YouTube answers none of those with
    // the header that would let a web page read them, and the WebView here does hold
    // the page to CORS, so the host makes those requests and hands them back with the
    // header in place. Nothing of the user's goes along: no cookies, and only the
    // content type and user agent of what the page sent.
    internal static class CorsRelay
    {
        // What the WebView is told to bring here.
        public static readonly string[] Filters = { "https://www.youtube.com/youtubei/v1/*", "https://manifest.googlevideo.com/*", "https://*.googlevideo.com/videoplayback*" };

        private const string PlayerHost = "www.youtube.com";
        private const string PlayerPath = "/youtubei/v1/";
        private const string PlaylistHost = "manifest.googlevideo.com";
        private const string SegmentHostSuffix = ".googlevideo.com";
        private const string SegmentPath = "/videoplayback";
        private const uint MaxRequestBytes = 64 * 1024;
        private const uint MaxResponseBytes = 24 * 1024 * 1024;
        private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(20);

        // Shared, so a trailer's segments reuse a connection instead of each opening its own.
        private static readonly HttpClient Client = CreateClient();

        private static HttpClient CreateClient()
        {
            var filter = new HttpBaseProtocolFilter();
            filter.CookieUsageBehavior = HttpCookieUsageBehavior.NoCookies;
            filter.CacheControl.ReadBehavior = HttpCacheReadBehavior.NoCache;
            filter.CacheControl.WriteBehavior = HttpCacheWriteBehavior.NoCache;
            return new HttpClient(filter);
        }

        // A filter's wildcard also matches inside a path, so the address is taken apart here.
        public static bool Handles(string address)
        {
            if (!Uri.TryCreate(address, UriKind.Absolute, out Uri uri) || uri.Scheme != "https") return false;
            if (uri.Host == PlayerHost) return uri.AbsolutePath.StartsWith(PlayerPath, StringComparison.Ordinal);
            if (uri.Host == PlaylistHost) return true;
            return uri.Host.EndsWith(SegmentHostSuffix, StringComparison.Ordinal) && uri.AbsolutePath.StartsWith(SegmentPath, StringComparison.Ordinal);
        }

        // Null when the request couldn't be relayed, which leaves it to the WebView.
        public static async Task<CoreWebView2WebResourceResponse> RelayAsync(CoreWebView2Environment environment, CoreWebView2WebResourceRequest request, string pageOrigin)
        {
            try
            {
                using (var outgoing = new HttpRequestMessage(new HttpMethod(request.Method), new Uri(request.Uri)))
                using (var cancel = new CancellationTokenSource(Timeout))
                {
                    string userAgent = Header(request, "User-Agent");
                    if (userAgent != null) outgoing.Headers.TryAppendWithoutValidation("User-Agent", userAgent);

                    IBuffer body = await ReadAsync(request.Content, MaxRequestBytes);
                    if (body != null)
                    {
                        var content = new HttpBufferContent(body);
                        content.Headers.TryAppendWithoutValidation("Content-Type", Header(request, "Content-Type") ?? "text/plain;charset=UTF-8");
                        outgoing.Content = content;
                    }

                    using (HttpResponseMessage answer = await Client.SendRequestAsync(outgoing).AsTask(cancel.Token))
                    {
                        var stream = new InMemoryRandomAccessStream();
                        await answer.Content.WriteToStreamAsync(stream).AsTask(cancel.Token);
                        if (stream.Size > MaxResponseBytes) return null;
                        stream.Seek(0);

                        // The WebView wants the headers one to a line, and a reason even where
                        // HTTP/2 gave none.
                        string contentType = answer.Content.Headers.ContentType != null ? answer.Content.Headers.ContentType.ToString() : "application/json";
                        string headers = "Content-Type: " + contentType + "\nAccess-Control-Allow-Origin: " + pageOrigin + "\nCache-Control: no-store";
                        string reason = string.IsNullOrEmpty(answer.ReasonPhrase) ? (answer.IsSuccessStatusCode ? "OK" : "Error") : answer.ReasonPhrase;
                        return environment.CreateWebResourceResponse(stream, (int)answer.StatusCode, reason, headers);
                    }
                }
            }
            catch (Exception ex)
            {
                HostLog.Write("relay", request.Uri + " failed: " + ex.Message);
                return null;
            }
        }

        public static string Header(CoreWebView2WebResourceRequest request, string name)
        {
            return request.Headers.Contains(name) ? request.Headers.GetHeader(name) : null;
        }

        private static async Task<IBuffer> ReadAsync(IRandomAccessStream content, uint limit)
        {
            if (content == null || content.Size == 0) return null;
            if (content.Size > limit) throw new InvalidOperationException("The request is larger than the relay takes");
            using (var reader = new DataReader(content.GetInputStreamAt(0)))
            {
                uint size = (uint)content.Size;
                await reader.LoadAsync(size);
                return reader.ReadBuffer(size);
            }
        }
    }
}
