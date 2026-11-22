using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.Networking.Sockets;
using Windows.Security.Cryptography.Certificates;
using Windows.Storage.Streams;
using Windows.UI.Core;

namespace Moonfin.Xbox
{
    // WebSockets the page opens through the host.
    //
    // The WebView sends the page's origin, http://moonfin.internal, with every socket
    // handshake, and Silo refuses one from a web origin that isnt its own. A native
    // socket sends no Origin, which Silo takes, as it does from Moonfin's native apps.
    // WebResourceRequested never sees socket handshakes, so CorsRelay can't help here.
    // The page side is packages/platform-xbox/src/socket.js.
    //
    // Page to host: SOCKET_OPEN {id, url, protocols}, SOCKET_SEND {id, data}, SOCKET_CLOSE {id, code, reason}
    // Host to page: SOCKET_OPENED {id, protocol}, SOCKET_MESSAGE {id, data}, SOCKET_CLOSED {id, code, reason}
    internal sealed class SocketRelay
    {
        // The app keeps two open (Silo's events and a Watch Party room); this stops a
        // page that leaks them from piling up connections.
        private const int MaxSockets = 8;
        // What a connection that failed or dropped reports, as a browser does.
        private const ushort Abnormal = 1006;

        private sealed class Relayed
        {
            public MessageWebSocket Socket;
            // Sends run one after another, each a whole message.
            public Task Sending = Task.CompletedTask;
        }

        private readonly CoreDispatcher dispatcher;
        private readonly Action<string, IJsonValue> sendToPage;
        private readonly Func<string, bool> isInsecureHost;
        // Only touched on the UI thread.
        private readonly Dictionary<double, Relayed> sockets = new Dictionary<double, Relayed>();

        public SocketRelay(CoreDispatcher dispatcher, Action<string, IJsonValue> sendToPage, Func<string, bool> isInsecureHost)
        {
            this.dispatcher = dispatcher;
            this.sendToPage = sendToPage;
            this.isInsecureHost = isInsecureHost;
        }

        public bool Handle(PageMessage message)
        {
            switch (message.Type)
            {
                case "SOCKET_OPEN":
                    Open(message.Payload);
                    return true;
                case "SOCKET_SEND":
                    Send(message.Payload);
                    return true;
                case "SOCKET_CLOSE":
                    Close(message.Payload);
                    return true;
                default:
                    return false;
            }
        }

        // A page that loads afresh knows nothing of the last one's sockets.
        public void CloseAll()
        {
            foreach (Relayed relayed in sockets.Values) relayed.Socket.Dispose();
            sockets.Clear();
        }

        private async void Open(JsonObject payload)
        {
            double id = IdOf(payload);
            if (id < 0) return;
            string url = Bridge.NamedString(payload, "url");
            if (url == null || !Uri.TryCreate(url, UriKind.Absolute, out Uri uri) || (uri.Scheme != "ws" && uri.Scheme != "wss")
                || sockets.ContainsKey(id) || sockets.Count >= MaxSockets)
            {
                Closed(id, Abnormal, "Refused by the host");
                return;
            }

            var socket = new MessageWebSocket();
            socket.Control.MessageType = SocketMessageType.Utf8;
            IJsonValue protocols = Bridge.Named(payload, "protocols");
            if (protocols != null && protocols.ValueType == JsonValueType.Array)
            {
                foreach (IJsonValue protocol in protocols.GetArray())
                {
                    if (protocol.ValueType == JsonValueType.String) socket.Control.SupportedProtocols.Add(protocol.GetString());
                }
            }
            // The certificate the user accepted for this server, as NativePlayer and the page's requests take it.
            if (uri.Scheme == "wss" && isInsecureHost(uri.Authority))
            {
                socket.Control.IgnorableServerCertificateErrors.Add(ChainValidationResult.Untrusted);
                socket.Control.IgnorableServerCertificateErrors.Add(ChainValidationResult.Expired);
                socket.Control.IgnorableServerCertificateErrors.Add(ChainValidationResult.InvalidName);
                socket.Control.IgnorableServerCertificateErrors.Add(ChainValidationResult.IncompleteChain);
            }
            var relayed = new Relayed { Socket = socket };
            socket.MessageReceived += (sender, args) => OnMessage(id, relayed, args);
            socket.Closed += (sender, args) => OnUi(() => Ended(id, relayed, args.Code, args.Reason));
            sockets[id] = relayed;

            try
            {
                await socket.ConnectAsync(uri);
            }
            catch (Exception ex)
            {
                HostLog.Write("socket", uri.Host + " refused: " + ex.Message);
                Ended(id, relayed, Abnormal, ex.Message);
                return;
            }
            // Closed by the page while it connected.
            if (!IsCurrent(id, relayed)) return;
            var opened = new JsonObject();
            opened.SetNamedValue("id", JsonValue.CreateNumberValue(id));
            opened.SetNamedValue("protocol", JsonValue.CreateStringValue(socket.Information.Protocol ?? ""));
            sendToPage("SOCKET_OPENED", opened);
        }

        private void Send(JsonObject payload)
        {
            double id = IdOf(payload);
            string data = Bridge.NamedString(payload, "data");
            if (data == null || !sockets.TryGetValue(id, out Relayed relayed)) return;
            relayed.Sending = SendAfter(relayed.Sending, id, relayed, data);
        }

        private async Task SendAfter(Task previous, double id, Relayed relayed, string data)
        {
            await previous;
            if (!IsCurrent(id, relayed)) return;
            try
            {
                using (var writer = new DataWriter(relayed.Socket.OutputStream))
                {
                    writer.WriteString(data);
                    await writer.StoreAsync();
                    writer.DetachStream();
                }
            }
            catch (Exception ex)
            {
                Ended(id, relayed, Abnormal, ex.Message);
            }
        }

        private void Close(JsonObject payload)
        {
            double id = IdOf(payload);
            if (!sockets.TryGetValue(id, out Relayed relayed)) return;
            sockets.Remove(id);
            // Only 1000 and the 3000s and 4000s are a page's to send.
            // A code that isn't a number (the page sent null) closes normally.
            IJsonValue askedValue = Bridge.Named(payload, "code");
            double asked = askedValue != null && askedValue.ValueType == JsonValueType.Number ? askedValue.GetNumber() : 1000;
            ushort code = asked == 1000 || (asked >= 3000 && asked <= 4999) ? (ushort)asked : (ushort)1000;
            string reason = Bridge.NamedString(payload, "reason") ?? "";
            try
            {
                relayed.Socket.Close(code, reason);
            }
            catch (Exception)
            {
                relayed.Socket.Dispose();
            }
            Closed(id, code, reason);
        }

        private void OnMessage(double id, Relayed relayed, MessageWebSocketMessageReceivedEventArgs args)
        {
            string text;
            try
            {
                using (DataReader reader = args.GetDataReader())
                {
                    reader.UnicodeEncoding = UnicodeEncoding.Utf8;
                    text = reader.ReadString(reader.UnconsumedBufferLength);
                }
            }
            catch (Exception ex)
            {
                // A connection that drops shows up here, with no Closed after it.
                OnUi(() => Ended(id, relayed, Abnormal, ex.Message));
                return;
            }
            OnUi(() =>
            {
                if (!IsCurrent(id, relayed)) return;
                var message = new JsonObject();
                message.SetNamedValue("id", JsonValue.CreateNumberValue(id));
                message.SetNamedValue("data", JsonValue.CreateStringValue(text));
                sendToPage("SOCKET_MESSAGE", message);
            });
        }

        // The server or the network ended the socket. The code goes to the page as it came:
        // Silo's 4001 (access changed) decides how the app reconnects.
        private void Ended(double id, Relayed relayed, ushort code, string reason)
        {
            if (!IsCurrent(id, relayed)) return;
            sockets.Remove(id);
            relayed.Socket.Dispose();
            Closed(id, code, reason);
        }

        private void Closed(double id, ushort code, string reason)
        {
            var closed = new JsonObject();
            closed.SetNamedValue("id", JsonValue.CreateNumberValue(id));
            closed.SetNamedValue("code", JsonValue.CreateNumberValue(code));
            closed.SetNamedValue("reason", JsonValue.CreateStringValue(reason ?? ""));
            sendToPage("SOCKET_CLOSED", closed);
        }

        private bool IsCurrent(double id, Relayed relayed)
        {
            return sockets.TryGetValue(id, out Relayed current) && current == relayed;
        }

        private void OnUi(DispatchedHandler action)
        {
            _ = dispatcher.RunAsync(CoreDispatcherPriority.Normal, action);
        }

        private static double IdOf(JsonObject payload)
        {
            IJsonValue id = Bridge.Named(payload, "id");
            return id != null && id.ValueType == JsonValueType.Number ? id.GetNumber() : -1;
        }
    }
}
