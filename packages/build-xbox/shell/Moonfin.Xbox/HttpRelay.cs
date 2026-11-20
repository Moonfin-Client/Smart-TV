using System;
using System.Collections.Generic;
using System.Runtime.InteropServices.WindowsRuntime;
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
    // Requests the page makes through the host, for servers that dont let other sites
    // read their answers.
    //
    // The page is at http://moonfin.internal and the WebView holds it to CORS. Silo sends
    // no CORS headers and a Plex server only allows app.plex.tv, so the WebView would hold
    // every answer back. A request from here has no origin to check. The Fire TV shell does
    // the same, and the page side is corsFreeFetch in packages/app/src/services/secureFetch.js
    // with requestThroughShell in packages/platform-xbox/src/bridge.js.
    //
    // Page to host: HTTP_REQUEST  {id, url, method, headers, body, timeoutMs, quiet}
    // Host to page: HTTP_RESPONSE {id, status, body, headers, failure}, a status of 0 when nothing answered,
    //              with failure "certificate" or "timeout" when that is why. A request with quiet set isnt logged.
    internal sealed class HttpRelay
    {
        private const int MaxHeaders = 32;
        private const uint MaxResponseBytes = 24 * 1024 * 1024;
        private static readonly TimeSpan ShortestWait = TimeSpan.FromSeconds(1);
        private static readonly TimeSpan LongestWait = TimeSpan.FromMinutes(2);

        private readonly Action<string, IJsonValue> sendToPage;
        private readonly Func<string, bool> isInsecureHost;

        // One for servers the user chose to trust as they are, one for every other, each
        // shared so requests to a server reuse its connections.
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

        // Runs on the UI thread, and the awaits come back to it, so the answer goes to the
        // page from there.
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

            // Discovery walks a whole subnet, where nearly every request is meant to fail.
            IJsonValue quietValue = Bridge.Named(payload, "quiet");
            bool quiet = quietValue != null && quietValue.ValueType == JsonValueType.Boolean && quietValue.GetBoolean();

            using (var request = new HttpRequestMessage(new HttpMethod(Bridge.NamedString(payload, "method") ?? "GET"), uri))
            using (var cancel = new CancellationTokenSource(WaitOf(payload)))
            {
                try
                {
                    string contentType = null;
                    // The others that describe the body go on the body, where Windows takes them.
                    var contentHeaders = new List<KeyValuePair<string, string>>();
                    IJsonValue headers = Bridge.Named(payload, "headers");
                    if (headers != null && headers.ValueType == JsonValueType.Object)
                    {
                        int count = 0;
                        foreach (KeyValuePair<string, IJsonValue> header in headers.GetObject())
                        {
                            if (count++ >= MaxHeaders) break;
                            if (header.Value.ValueType != JsonValueType.String) continue;
                            string value = header.Value.GetString();
                            if (string.Equals(header.Key, "Content-Type", StringComparison.OrdinalIgnoreCase)) contentType = value;
                            else if (header.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase)) contentHeaders.Add(new KeyValuePair<string, string>(header.Key, value));
                            else request.Headers.TryAppendWithoutValidation(header.Key, value);
                        }
                    }
                    string body = Bridge.NamedString(payload, "body");
                    if (body != null)
                    {
                        // The body goes as UTF-8 whatever charset the page named, and says so.
                        string mediaType = (contentType ?? "text/plain").Split(';')[0].Trim();
                        request.Content = new HttpStringContent(body, UnicodeEncoding.Utf8, mediaType.Length > 0 ? mediaType : "text/plain");
                        foreach (KeyValuePair<string, string> header in contentHeaders)
                        {
                            // Its length is the content's own.
                            if (!string.Equals(header.Key, "Content-Length", StringComparison.OrdinalIgnoreCase)) request.Content.Headers.TryAppendWithoutValidation(header.Key, header.Value);
                        }
                    }

                    HttpClient chosen = isInsecureHost(uri.Authority) ? LenientClient() : Client();
                    // Only the headers first, so an answer too large to take is turned away before it is read.
                    using (HttpResponseMessage answer = await chosen.SendRequestAsync(request, HttpCompletionOption.ResponseHeadersRead).AsTask(cancel.Token))
                    {
                        ulong? announced = answer.Content.Headers.ContentLength;
                        IBuffer buffer = announced.HasValue && announced.Value > MaxResponseBytes ? null : await answer.Content.ReadAsBufferAsync().AsTask(cancel.Token);
                        if (buffer == null || buffer.Length > MaxResponseBytes)
                        {
                            HostLog.Write("http", uri.Host + " answered with more than the relay takes");
                            Answer(id, 0, "", null);
                            return;
                        }
                        string text = DecodeText(buffer.ToArray());
                        Answer(id, (int)answer.StatusCode, text, HeadersOf(answer));
                    }
                }
                catch (Exception ex)
                {
                    // Why it failed, for the page: a certificate it may let through, or a server too slow.
                    string failure = null;
                    if (request.TransportInformation != null && request.TransportInformation.ServerCertificateErrorSeverity != SocketSslErrorSeverity.None) failure = "certificate";
                    else if (cancel.IsCancellationRequested) failure = "timeout";
                    if (!quiet) HostLog.Write("http", uri.Host + " failed" + (failure != null ? " (" + failure + ")" : "") + ": " + ex.Message);
                    Answer(id, 0, "", null, failure);
                }
            }
        }

        private void Answer(double id, int status, string body, JsonObject headers, string failure = null)
        {
            var answer = new JsonObject();
            if (failure != null) answer.SetNamedValue("failure", JsonValue.CreateStringValue(failure));
            answer.SetNamedValue("id", JsonValue.CreateNumberValue(id));
            answer.SetNamedValue("status", JsonValue.CreateNumberValue(status));
            answer.SetNamedValue("body", JsonValue.CreateStringValue(body));
            answer.SetNamedValue("headers", headers ?? new JsonObject());
            sendToPage("HTTP_RESPONSE", answer);
        }

        // As a browser reads a body as text: UTF-8 without its byte order mark, and a byte
        // that isnt UTF-8 (a subtitle file saved as Latin-1) as a replacement character
        // rather than a failed request.
        private static string DecodeText(byte[] bytes)
        {
            int start = bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF ? 3 : 0;
            return System.Text.Encoding.UTF8.GetString(bytes, start, bytes.Length - start);
        }

        // Named in lower case, as the page looks them up.
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

        // The page's own requests carry no cookies either, and the API's answers arent
        // worth keeping.
        private static HttpClient CreateClient(bool acceptUntrustedCertificate)
        {
            var filter = new HttpBaseProtocolFilter();
            // A server that asks for a password gets its 401 back to the page, never a system dialog.
            filter.AllowUI = false;
            filter.CookieUsageBehavior = HttpCookieUsageBehavior.NoCookies;
            filter.CacheControl.ReadBehavior = HttpCacheReadBehavior.NoCache;
            filter.CacheControl.WriteBehavior = HttpCacheWriteBehavior.NoCache;
            if (acceptUntrustedCertificate)
            {
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.Untrusted);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.Expired);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.InvalidName);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.IncompleteChain);
                // The WebView takes every certificate of a server the user accepted, so these too.
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.RevocationFailure);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.RevocationInformationMissing);
                filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.WrongUsage);
            }
            return new HttpClient(filter);
        }
    }
}
