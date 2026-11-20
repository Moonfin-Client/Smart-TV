using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Windows.Data.Json;
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
    // Page to host: HTTP_REQUEST  {id, url, method, headers, body, timeoutMs}
    // Host to page: HTTP_RESPONSE {id, status, body, headers}, a status of 0 when nothing answered
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

            try
            {
                using (var request = new HttpRequestMessage(new HttpMethod(Bridge.NamedString(payload, "method") ?? "GET"), uri))
                using (var cancel = new CancellationTokenSource(WaitOf(payload)))
                {
                    string contentType = null;
                    IJsonValue headers = Bridge.Named(payload, "headers");
                    if (headers != null && headers.ValueType == JsonValueType.Object)
                    {
                        int count = 0;
                        foreach (KeyValuePair<string, IJsonValue> header in headers.GetObject())
                        {
                            if (count++ >= MaxHeaders) break;
                            if (header.Value.ValueType != JsonValueType.String) continue;
                            if (string.Equals(header.Key, "Content-Type", StringComparison.OrdinalIgnoreCase)) contentType = header.Value.GetString();
                            else request.Headers.TryAppendWithoutValidation(header.Key, header.Value.GetString());
                        }
                    }
                    string body = Bridge.NamedString(payload, "body");
                    if (body != null)
                    {
                        // The body goes as UTF-8 whatever charset the page named, and says so.
                        string mediaType = (contentType ?? "text/plain").Split(';')[0].Trim();
                        request.Content = new HttpStringContent(body, UnicodeEncoding.Utf8, mediaType.Length > 0 ? mediaType : "text/plain");
                    }

                    HttpClient chosen = isInsecureHost(uri.Authority) ? LenientClient() : Client();
                    using (HttpResponseMessage answer = await chosen.SendRequestAsync(request).AsTask(cancel.Token))
                    {
                        IBuffer buffer = await answer.Content.ReadAsBufferAsync().AsTask(cancel.Token);
                        if (buffer.Length > MaxResponseBytes)
                        {
                            HostLog.Write("http", uri.Host + " answered with more than the relay takes");
                            Answer(id, 0, "", null);
                            return;
                        }
                        string text;
                        using (DataReader reader = DataReader.FromBuffer(buffer))
                        {
                            reader.UnicodeEncoding = UnicodeEncoding.Utf8;
                            text = reader.ReadString(buffer.Length);
                        }
                        Answer(id, (int)answer.StatusCode, text, HeadersOf(answer));
                    }
                }
            }
            catch (Exception ex)
            {
                HostLog.Write("http", uri.Host + " failed: " + ex.Message);
                Answer(id, 0, "", null);
            }
        }

        private void Answer(double id, int status, string body, JsonObject headers)
        {
            var answer = new JsonObject();
            answer.SetNamedValue("id", JsonValue.CreateNumberValue(id));
            answer.SetNamedValue("status", JsonValue.CreateNumberValue(status));
            answer.SetNamedValue("body", JsonValue.CreateStringValue(body));
            answer.SetNamedValue("headers", headers ?? new JsonObject());
            sendToPage("HTTP_RESPONSE", answer);
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
            }
            return new HttpClient(filter);
        }
    }
}
