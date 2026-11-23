using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.Networking.Sockets;
using Windows.Security.Cryptography.Certificates;
using Windows.Storage.Streams;
using Windows.Web.Http;
using Windows.Web.Http.Filters;

namespace Moonfin.Xbox
{
    // Makes requests for the page. The WebView holds the page at http://moonfin.internal to
    // CORS, and Silo sends no CORS headers while Plex only allows app.plex.tv, so the WebView
    // would hold back every answer. corsFreeFetch is the page side, and Bridge.cs lists the messages.
    internal sealed class HttpRelay
    {
        private const int MaxRedirects = 10;
        private const uint MaxResponseBytes = 24 * 1024 * 1024;
        private const int ReadPieceBytes = 64 * 1024;
        private static readonly TimeSpan ShortestWait = TimeSpan.FromSeconds(1);
        // Plex live TV gives a tuner five minutes to start.
        private static readonly TimeSpan LongestWait = TimeSpan.FromMinutes(5);

        private readonly Action<string, IJsonValue> sendToPage;
        private readonly Func<string, bool> isInsecureHost;

        private HttpClient client;
        private HttpClient lenientClient;

        public HttpRelay(Action<string, IJsonValue> sendToPage, Func<string, bool> isInsecureHost)
        {
            this.sendToPage = sendToPage;
            this.isInsecureHost = isInsecureHost;
        }

        public bool Handle(PageMessage message)
        {
            if (message.Type != "HTTP_REQUEST") return false;
            Relay(message.Payload);
            return true;
        }

        // Runs on the UI thread and every await comes back to it, so answers go to the page from there.
        private async void Relay(JsonObject payload)
        {
            IJsonValue idValue = Bridge.Named(payload, "id");
            if (idValue == null || idValue.ValueType != JsonValueType.Number) return;
            double id = idValue.GetNumber();

            string url = Bridge.NamedString(payload, "url");
            if (url == null || !Uri.TryCreate(url, UriKind.Absolute, out Uri uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
            {
                Answer(id, 0, "", null);
                return;
            }

            IJsonValue quietValue = Bridge.Named(payload, "quiet");
            bool quiet = quietValue != null && quietValue.ValueType == JsonValueType.Boolean && quietValue.GetBoolean();

            string method = (Bridge.NamedString(payload, "method") ?? "GET").ToUpperInvariant();
            string body = Bridge.NamedString(payload, "body");
            string contentType = null;
            var requestHeaders = new List<KeyValuePair<string, string>>();
            IJsonValue headers = Bridge.Named(payload, "headers");
            if (headers != null && headers.ValueType == JsonValueType.Object)
            {
                foreach (KeyValuePair<string, IJsonValue> header in headers.GetObject())
                {
                    if (header.Value.ValueType != JsonValueType.String) continue;
                    string value = header.Value.GetString();
                    // Content-Type goes on the body, and the page never sends other body headers.
                    if (string.Equals(header.Key, "Content-Type", StringComparison.OrdinalIgnoreCase)) contentType = value;
                    else if (!header.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase)) requestHeaders.Add(new KeyValuePair<string, string>(header.Key, value));
                }
            }

            HttpRequestMessage request = null;
            int redirects = 0;
            bool strict = true;
            bool answered = false;
            using (var cancel = new CancellationTokenSource(WaitOf(payload)))
            {
                try
                {
                    // Redirects are followed here instead of by Windows, so each server gets its own
                    // certificate check and the page's tokens never reach another server.
                    bool sameServer = true;
                    for (; ; redirects++)
                    {
                        HttpRequestMessage previous = request;
                        request = NewRequest(method, uri, requestHeaders, sameServer, body, contentType);
                        previous?.Dispose();
                        strict = !isInsecureHost(uri.Authority);
                        HttpClient chosen = strict ? Client() : LenientClient();
                        answered = false;
                        // Headers first, so an answer that's too large is turned away before its body is read.
                        using (HttpResponseMessage answer = await chosen.SendRequestAsync(request, HttpCompletionOption.ResponseHeadersRead).AsTask(cancel.Token))
                        {
                            answered = true;
                            Uri next = RedirectOf(answer, uri);
                            if (next != null)
                            {
                                if (redirects >= MaxRedirects)
                                {
                                    if (!quiet) HostLog.Write("http", uri.Host + " redirected too many times");
                                    Answer(id, 0, "", null);
                                    return;
                                }
                                int status = (int)answer.StatusCode;
                                // Like a browser, switch to GET and drop the body after a 303, or after a 301 or 302 to a POST.
                                if ((status == 303 && method != "HEAD") || ((status == 301 || status == 302) && method == "POST"))
                                {
                                    method = "GET";
                                    body = null;
                                }
                                if (!SameServer(uri, next))
                                {
                                    // Only a bodyless GET or HEAD goes on to another server, since the relay can't ask
                                    // it first the way a browser's preflight would, and nothing goes from https down to http.
                                    if (body != null || (method != "GET" && method != "HEAD") || (uri.Scheme == "https" && next.Scheme == "http"))
                                    {
                                        if (!quiet) HostLog.Write("http", uri.Host + " redirected to another server, not followed");
                                        Answer(id, 0, "", null);
                                        return;
                                    }
                                    sameServer = false;
                                }
                                uri = next;
                                continue;
                            }

                            MemoryStream bytes = method == "HEAD" ? new MemoryStream() : await ReadBody(answer.Content, cancel.Token);
                            if (bytes == null)
                            {
                                if (!quiet) HostLog.Write("http", uri.Host + " answered with more than the relay takes");
                                Answer(id, 0, "", null);
                                return;
                            }
                            using (bytes) Answer(id, (int)answer.StatusCode, DecodeText(bytes.GetBuffer(), (int)bytes.Length), HeadersOf(answer));
                            return;
                        }
                    }
                }
                catch (Exception ex)
                {
                    // Only a request the server never answered can have failed on its certificate, since a
                    // trusted server still reports its ignored problems on every request.
                    string failure = null;
                    if (cancel.IsCancellationRequested) failure = "timeout";
                    else if (!answered && request?.TransportInformation != null && CertificateRefused(request.TransportInformation.ServerCertificateErrorSeverity, strict)) failure = "certificate";
                    if (!quiet) HostLog.Write("http", uri.Host + " failed" + (failure != null ? " (" + failure + ")" : "") + ": " + ex.Message);
                    Answer(id, 0, "", null, failure, redirects > 0);
                }
                finally
                {
                    request?.Dispose();
                }
            }
        }

        // Another server only gets the headers a browser would send it without a preflight.
        private static readonly HashSet<string> HarmlessHeaders = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Accept", "Accept-Language", "Range" };

        private static HttpRequestMessage NewRequest(string method, Uri uri, List<KeyValuePair<string, string>> headers, bool allHeaders, string body, string contentType)
        {
            var request = new HttpRequestMessage(new HttpMethod(method), uri);
            foreach (KeyValuePair<string, string> header in headers)
            {
                if (!allHeaders && !HarmlessHeaders.Contains(header.Key)) continue;
                request.Headers.TryAppendWithoutValidation(header.Key, header.Value);
            }
            if (body != null)
            {
                // The body always goes as UTF-8, whatever charset the page named, and the header says so.
                string mediaType = (contentType ?? "text/plain").Split(';')[0].Trim();
                request.Content = new HttpStringContent(body, UnicodeEncoding.Utf8, mediaType.Length > 0 ? mediaType : "text/plain");
            }
            return request;
        }

        private static Uri RedirectOf(HttpResponseMessage answer, Uri from)
        {
            int status = (int)answer.StatusCode;
            if (status != 301 && status != 302 && status != 303 && status != 307 && status != 308) return null;
            if (!answer.Headers.TryGetValue("Location", out string location) || string.IsNullOrEmpty(location)) return null;
            if (!Uri.TryCreate(from, location, out Uri next) || (next.Scheme != "http" && next.Scheme != "https")) return null;
            return next;
        }

        // An http to https upgrade on the same host counts as the same server. Any other port
        // change could be a different service.
        private static bool SameServer(Uri from, Uri to)
        {
            if (!string.Equals(from.Host, to.Host, StringComparison.OrdinalIgnoreCase)) return false;
            return (from.Scheme == to.Scheme && from.Port == to.Port) || (from.Scheme == "http" && to.Scheme == "https" && (to.Port == 443 || to.Port == from.Port));
        }

        // Reads in pieces so a body with no length stops at the limit instead of being read whole.
        // Returns null when it's too large.
        private static async Task<MemoryStream> ReadBody(IHttpContent content, CancellationToken cancel)
        {
            ulong? announced = content.Headers.ContentLength;
            if (announced.HasValue && announced.Value > MaxResponseBytes) return null;
            var bytes = new MemoryStream(announced.HasValue ? (int)Math.Min(announced.Value, 1024 * 1024) : 0);
            using (Stream stream = (await content.ReadAsInputStreamAsync().AsTask(cancel)).AsStreamForRead())
            {
                var piece = new byte[ReadPieceBytes];
                while (true)
                {
                    int read = await stream.ReadAsync(piece, 0, piece.Length, cancel);
                    if (read == 0) return bytes;
                    if ((ulong)bytes.Length + (ulong)read > MaxResponseBytes)
                    {
                        bytes.Dispose();
                        return null;
                    }
                    bytes.Write(piece, 0, read);
                }
            }
        }

        // The lenient client ignores the usual problems, so only a fatal one can have stopped it.
        private static bool CertificateRefused(SocketSslErrorSeverity severity, bool strict)
        {
            return strict ? severity != SocketSslErrorSeverity.None : severity == SocketSslErrorSeverity.Fatal;
        }

        private void Answer(double id, int status, string body, JsonObject headers, string failure = null, bool redirected = false)
        {
            var answer = new JsonObject();
            if (failure != null) answer.SetNamedValue("failure", JsonValue.CreateStringValue(failure));
            if (redirected) answer.SetNamedValue("redirected", JsonValue.CreateBooleanValue(true));
            answer.SetNamedValue("id", JsonValue.CreateNumberValue(id));
            answer.SetNamedValue("status", JsonValue.CreateNumberValue(status));
            answer.SetNamedValue("body", JsonValue.CreateStringValue(body));
            answer.SetNamedValue("headers", headers ?? new JsonObject());
            sendToPage("HTTP_RESPONSE", answer);
        }

        // Decodes like a browser does. The byte order mark is dropped, and a byte that isn't UTF-8,
        // like in a Latin-1 subtitle file, becomes a replacement character instead of failing the request.
        private static string DecodeText(byte[] bytes, int length)
        {
            int start = length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF ? 3 : 0;
            return System.Text.Encoding.UTF8.GetString(bytes, start, length - start);
        }

        // Lowercased, since the page looks them up that way.
        private static JsonObject HeadersOf(HttpResponseMessage answer)
        {
            var headers = new JsonObject();
            foreach (KeyValuePair<string, string> header in answer.Headers) headers.SetNamedValue(header.Key.ToLowerInvariant(), JsonValue.CreateStringValue(header.Value));
            foreach (KeyValuePair<string, string> header in answer.Content.Headers) headers.SetNamedValue(header.Key.ToLowerInvariant(), JsonValue.CreateStringValue(header.Value));
            return headers;
        }

        private static TimeSpan WaitOf(JsonObject payload)
        {
            IJsonValue value = Bridge.Named(payload, "timeoutMs");
            if (value == null || value.ValueType != JsonValueType.Number) return TimeSpan.FromSeconds(15);
            TimeSpan wait = TimeSpan.FromMilliseconds(value.GetNumber());
            return wait < ShortestWait ? ShortestWait : wait > LongestWait ? LongestWait : wait;
        }

        private HttpClient Client()
        {
            return client ?? (client = CreateClient(false));
        }

        private HttpClient LenientClient()
        {
            return lenientClient ?? (lenientClient = CreateClient(true));
        }

        private static HttpClient CreateClient(bool acceptUntrustedCertificate)
        {
            var filter = new HttpBaseProtocolFilter();
            // A 401 goes back to the page instead of opening a Windows sign-in dialog.
            filter.AllowUI = false;
            filter.AllowAutoRedirect = false;
            filter.CookieUsageBehavior = HttpCookieUsageBehavior.NoCookies;
            filter.CacheControl.ReadBehavior = HttpCacheReadBehavior.NoCache;
            filter.CacheControl.WriteBehavior = HttpCacheWriteBehavior.NoCache;
            if (acceptUntrustedCertificate)
            {
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.Untrusted);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.Expired);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.InvalidName);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.IncompleteChain);
                // The WebView accepts any certificate from a server the user trusted, so these are ignored too.
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.RevocationFailure);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.RevocationInformationMissing);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.WrongUsage);
            }
            return new HttpClient(filter);
        }
    }
}
