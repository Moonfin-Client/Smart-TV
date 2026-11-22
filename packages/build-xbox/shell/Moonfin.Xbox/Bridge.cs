using Windows.Data.Json;

namespace Moonfin.Xbox
{
    // One message from the page, already checked for shape.
    internal sealed class PageMessage
    {
        public string Type;
        // Set when the page wants an answer, and repeated in the reply.
        public double? Id;
        // Null when the page sent none, or sent something that isnt an object.
        public JsonObject Payload;
    }

    // Messages between the web app and this host.
    //
    // The page talks to the host with window.chrome.webview.postMessage, which is
    // given one JSON string. The host talks to the page by running a script that
    // dispatches a moonfin:xbox CustomEvent on window. Both directions carry the same
    // envelope, and the version lets either side refuse what it doesnt understand.
    // The page side is packages/platform-xbox/src/bridge.js.
    //
    // Page to host:
    //   EXIT_APP
    //   KEEP_DISPLAY_ACTIVE  {active}
    //   PLAYBACK_SESSION     {stopUrl, headers, body} or null
    //   ALLOW_INSECURE_HOST  {host}
    //   MEMORY               (answered with {usage, limit, level})
    //   SAVE_REPORT          {text} (answered with {path}), from the probe page
    //   DISPLAY_GET_MODES    (answered with the display as in the boot data)
    //   DISPLAY_SET_FOR_MEDIA {hdr: "hdr10"} (answered with {ok, mode, reason})
    //   DISPLAY_RESTORE      (answered with {ok})
    //   PLAYER_OPEN          {session, url, hls, reader, fallback, hdr10, startSeconds, autoplay, volume, muted, subtitle} (answered with {ok}),
    //                        reader "system" to open a file without FFmpeg, fallback to try FFmpeg when that
    //                        fails, and hdr10 for a file that reader cant say is HDR10
    //   PLAYER_CLOSE         {session} (answered with {ok})
    //   PLAYER_PLAY, PLAYER_PAUSE {session}
    //   PLAYER_SEEK          {session, seconds}
    //   PLAYER_SET_VOLUME    {session, volume, muted}
    //   PLAYER_SELECT_AUDIO  {session, index}
    //   PLAYER_SELECT_SUBTITLE {session, index}
    //   PLAYER_SET_RECT      {session, x, y, width, height}
    //   PLAYER_GET_STATE     (answered with where the player is)
    //   SOCKET_OPEN          {id, url, protocols}, a WebSocket the host opens (SocketRelay)
    //   SOCKET_SEND          {id, data}
    //   SOCKET_CLOSE         {id, code, reason}
    //
    // Host to page:
    //   APP_STATE    {state: "active" | "background"}
    //   NETWORK      {connected, ip}
    //   KEY          {key}
    //   PLAYER_EVENT {session, event, ...} for opened, playing, paused, waiting, timeupdate,
    //                seeked, ended, audioTracks, natural, display, error and closed
    //   SOCKET_OPENED  {id, protocol}
    //   SOCKET_MESSAGE {id, data}
    //   SOCKET_CLOSED  {id, code, reason}, also for a socket that failed to open (1006)
    //   REPLY        the answer to a message that carried an id
    internal static class Bridge
    {
        public const int Version = 1;
        public const string PageEvent = "moonfin:xbox";

        // The probe's report is the longest thing the page sends and stays well under
        // this. A longer message is dropped unread.
        public const int MaxMessageLength = 256 * 1024;

        public static PageMessage Parse(string raw)
        {
            if (string.IsNullOrEmpty(raw) || raw.Length > MaxMessageLength) return null;
            if (!JsonObject.TryParse(raw, out JsonObject envelope)) return null;

            IJsonValue version = Named(envelope, "v");
            if (version == null || version.ValueType != JsonValueType.Number || version.GetNumber() != Version) return null;

            IJsonValue type = Named(envelope, "type");
            if (type == null || type.ValueType != JsonValueType.String) return null;

            var message = new PageMessage { Type = type.GetString() };

            IJsonValue id = Named(envelope, "id");
            if (id != null && id.ValueType == JsonValueType.Number) message.Id = id.GetNumber();

            IJsonValue payload = Named(envelope, "payload");
            if (payload != null && payload.ValueType == JsonValueType.Object) message.Payload = payload.GetObject();

            return message;
        }

        // A script for ExecuteScriptAsync that hands the page one message.
        public static string ToPageScript(string type, IJsonValue payload)
        {
            return DispatchScript(Envelope(type, payload));
        }

        // The answer to a page message that carried an id. A null error means it went well.
        public static string ReplyScript(double id, IJsonValue payload, string error)
        {
            JsonObject envelope = Envelope("REPLY", payload);
            envelope.SetNamedValue("id", JsonValue.CreateNumberValue(id));
            if (error != null) envelope.SetNamedValue("error", JsonValue.CreateStringValue(error));
            return DispatchScript(envelope);
        }

        // Runs before any page code, so the app can read the console and its address
        // synchronously at boot instead of waiting on a message round trip.
        public static string BootScript(JsonObject data)
        {
            data.SetNamedValue("v", JsonValue.CreateNumberValue(Version));
            return "window.__MOONFIN_XBOX__ = " + data.Stringify() + ";";
        }

        // The named value, or null when the object has none by that name.
        public static IJsonValue Named(JsonObject source, string name)
        {
            return source != null && source.ContainsKey(name) ? source.GetNamedValue(name) : null;
        }

        public static string NamedString(JsonObject source, string name)
        {
            IJsonValue value = Named(source, name);
            return value != null && value.ValueType == JsonValueType.String ? value.GetString() : null;
        }

        private static JsonObject Envelope(string type, IJsonValue payload)
        {
            var envelope = new JsonObject();
            envelope.SetNamedValue("v", JsonValue.CreateNumberValue(Version));
            envelope.SetNamedValue("type", JsonValue.CreateStringValue(type));
            if (payload != null) envelope.SetNamedValue("payload", payload);
            return envelope;
        }

        private static string DispatchScript(JsonObject envelope)
        {
            return "window.dispatchEvent(new CustomEvent(" + JsonValue.CreateStringValue(PageEvent).Stringify() + ", {detail: " + envelope.Stringify() + "}));";
        }
    }
}
