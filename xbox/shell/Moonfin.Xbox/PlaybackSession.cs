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
    // The stop report for whatever is playing, sent by the host when the app is
    // suspended. Page scripts are frozen there, so the page keeps the host up to date
    // on every progress tick and the host makes the final call itself.
    internal sealed class PlaybackSession
    {
        private const int MaxUrlLength = 4096;
        private const int MaxBodyLength = 16 * 1024;
        private const int MaxHeaders = 16;
        private static readonly TimeSpan SendTimeout = TimeSpan.FromSeconds(3);

        private Uri stopUrl;
        private string body;
        private readonly Dictionary<string, string> headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        // "host:port" as the page names a server, with the port left off when it's the default.
        public string Authority => stopUrl.Authority;

        // Null when the payload isn't a stop request this host is willing to send.
        public static PlaybackSession FromPayload(JsonObject payload)
        {
            string url = Bridge.NamedString(payload, "stopUrl");
            string body = Bridge.NamedString(payload, "body");
            if (url == null || body == null || url.Length > MaxUrlLength || body.Length > MaxBodyLength) return null;
            if (!Uri.TryCreate(url, UriKind.Absolute, out Uri stopUrl)) return null;
            if (stopUrl.Scheme != "http" && stopUrl.Scheme != "https") return null;

            var session = new PlaybackSession { stopUrl = stopUrl, body = body };

            IJsonValue headers = Bridge.Named(payload, "headers");
            if (headers != null && headers.ValueType == JsonValueType.Object)
            {
                foreach (KeyValuePair<string, IJsonValue> header in headers.GetObject())
                {
                    if (session.headers.Count >= MaxHeaders) break;
                    if (header.Value.ValueType == JsonValueType.String) session.headers[header.Key] = header.Value.GetString();
                }
            }
            return session;
        }

        // The user's choice to accept a server's certificate holds here as it does in the WebView.
        public async Task SendStopAsync(bool acceptUntrustedCertificate)
        {
            try
            {
                using (var filter = new HttpBaseProtocolFilter())
                {
                    if (acceptUntrustedCertificate)
                    {
                        filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.Untrusted);
                        filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.Expired);
                        filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.InvalidName);
                        filter.IgnorableServerCertificateErrors.Add(ChainValidationResult.IncompleteChain);
                    }

                    using (var client = new HttpClient(filter))
                    using (var request = new HttpRequestMessage(HttpMethod.Post, stopUrl))
                    using (var cancel = new CancellationTokenSource(SendTimeout))
                    {
                        string contentType = "application/json";
                        foreach (KeyValuePair<string, string> header in headers)
                        {
                            if (string.Equals(header.Key, "Content-Type", StringComparison.OrdinalIgnoreCase)) contentType = header.Value;
                            else request.Headers.TryAppendWithoutValidation(header.Key, header.Value);
                        }
                        request.Content = new HttpStringContent(body, UnicodeEncoding.Utf8, contentType);

                        await client.SendRequestAsync(request).AsTask(cancel.Token);
                    }
                }
            }
            catch (Exception ex)
            {
                HostLog.Write("playback", "Stop report failed: " + ex.Message);
            }
        }
    }
}
