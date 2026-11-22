using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using Windows.ApplicationModel;
using Windows.Data.Json;
using Windows.Graphics.Display;
using Windows.Graphics.Display.Core;
using Windows.Media.Protection;
using Windows.Networking;
using Windows.Networking.Connectivity;
using Windows.System.Profile;
using Windows.System.UserProfile;
using Windows.UI.Xaml;

namespace Moonfin.Xbox
{
    // What the host knows about the console that the page cant find out for itself.
    internal static class BootData
    {
        private const int MaxDisplayModes = 32;

        // The questions Microsoft gives for telling what the console decodes and what the
        // display it is plugged into shows.
        // https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/hevc-xbox
        private const string HardwareKeySystem = "com.microsoft.playready.hardware";
        private const string Decode4K = "decode-res-x=3840,decode-res-y=2160,decode-bitrate=20000,decode-fps=30,decode-bpc=10";
        private const string HevcQuery = "video/mp4;codecs=\"hvc1,mp4a\";features=\"" + Decode4K + "\"";
        private const string UhdQuery = "video/mp4;codecs=\"hvc1,mp4a\";features=\"" + Decode4K + ",display-res-x=3840,display-res-y=2160,display-bpc=8\"";
        private const string UhdHdrQuery = "video/mp4;codecs=\"hvc1,mp4a\";features=\"" + Decode4K + ",display-res-x=3840,display-res-y=2160,display-bpc=10, hdr=1\"";
        private const string Hdcp22Query = "video/mp4;codecs=\"hvc1,mp4a\";features=\"hdcp=2\"";

        // An answer can take a moment to arrive, and the HDCP one is slow. The page waits
        // on all of this before it loads, so whatever isnt known by then is left unknown.
        private static readonly TimeSpan ProtectionBudget = TimeSpan.FromSeconds(2.5);

        // Has to be called on the UI thread, which is where the display is asked from.
        public static async Task<JsonObject> CollectAsync(string webViewVersion)
        {
            var data = new JsonObject();
            data.SetNamedValue("os", ReadOs());
            data.SetNamedValue("device", ReadDevice());
            data.SetNamedValue("display", ReadDisplay());
            data.SetNamedValue("dolbyVision", ReadDolbyVision());
            data.SetNamedValue("protection", await ReadProtectionAsync());
            data.SetNamedValue("webview", ReadWebView(webViewVersion));
            data.SetNamedValue("package", ReadPackage());
            data.SetNamedValue("nativePlayer", ReadNativePlayer());
            data.SetNamedValue("ip", NullableString(ReadIp()));
            data.SetNamedValue("country", NullableString(ReadCountry()));
            return data;
        }

        public static bool IsConnected()
        {
            try
            {
                return NetworkInformation.GetConnectionProfiles().Any(profile => profile.GetNetworkConnectivityLevel() != NetworkConnectivityLevel.None);
            }
            catch (Exception)
            {
                return true;
            }
        }

        // The console's own address. The page cant learn it, since Chromium hides the host
        // candidates WebRTC used to give up, and the app's server discovery walks the
        // subnet from it.
        public static string ReadIp()
        {
            try
            {
                Guid? adapter = NetworkInformation.GetInternetConnectionProfile()?.NetworkAdapter?.NetworkAdapterId;
                string first = null;
                foreach (HostName host in NetworkInformation.GetHostNames())
                {
                    if (host.Type != HostNameType.Ipv4 || host.IPInformation == null) continue;
                    if (adapter != null && host.IPInformation.NetworkAdapter?.NetworkAdapterId == adapter) return host.CanonicalName;
                    if (first == null) first = host.CanonicalName;
                }
                return first;
            }
            catch (Exception)
            {
                return null;
            }
        }

        // The region the console is set to, as two letters. Windows gives a number for a
        // few places, which is left out.
        private static string ReadCountry()
        {
            try
            {
                string region = GlobalizationPreferences.HomeGeographicRegion;
                return region != null && region.Length == 2 ? region.ToUpperInvariant() : null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        public static IJsonValue NullableString(string value)
        {
            return value == null ? JsonValue.CreateNullValue() : JsonValue.CreateStringValue(value);
        }

        private static JsonObject ReadOs()
        {
            var os = new JsonObject();
            string name = "Xbox";
            string version = "";
            try
            {
                name = AnalyticsInfo.VersionInfo.DeviceFamily;
                ulong packed = ulong.Parse(AnalyticsInfo.VersionInfo.DeviceFamilyVersion);
                version = ((packed >> 48) & 0xFFFF) + "." + ((packed >> 32) & 0xFFFF) + "." + ((packed >> 16) & 0xFFFF) + "." + (packed & 0xFFFF);
            }
            catch (Exception)
            {
                // left as they are
            }
            os.SetNamedValue("name", JsonValue.CreateStringValue(name));
            os.SetNamedValue("version", JsonValue.CreateStringValue(version));
            return os;
        }

        // "Xbox One", "Xbox One S", "Xbox One X", "Xbox Series S" or "Xbox Series X".
        private static JsonObject ReadDevice()
        {
            var device = new JsonObject();
            string form = "";
            try
            {
                form = AnalyticsInfo.DeviceForm ?? "";
            }
            catch (Exception)
            {
                // left empty
            }
            device.SetNamedValue("form", JsonValue.CreateStringValue(form));
            return device;
        }

        public static IJsonValue ReadDisplay()
        {
            try
            {
                HdmiDisplayInformation hdmi = HdmiDisplayInformation.GetForCurrentView();
                if (hdmi == null) return JsonValue.CreateNullValue();

                HdmiDisplayMode current = hdmi.GetCurrentDisplayMode();
                IReadOnlyList<HdmiDisplayMode> supported = hdmi.GetSupportedDisplayModes();

                var display = new JsonObject();
                display.SetNamedValue("width", JsonValue.CreateNumberValue(current.ResolutionWidthInRawPixels));
                display.SetNamedValue("height", JsonValue.CreateNumberValue(current.ResolutionHeightInRawPixels));
                display.SetNamedValue("refreshRate", JsonValue.CreateNumberValue(Math.Round(current.RefreshRate, 3)));
                // The size the app is drawn at and how many of the display's pixels each of its
                // pixels gets, which says whether the console scales the app up to the display
                DisplayInformation info = DisplayInformation.GetForCurrentView();
                display.SetNamedValue("scale", JsonValue.CreateNumberValue(info.RawPixelsPerViewPixel));
                display.SetNamedValue("resolutionScale", JsonValue.CreateNumberValue((int)info.ResolutionScale));
                display.SetNamedValue("appWidth", JsonValue.CreateNumberValue(Math.Round(Window.Current.Bounds.Width)));
                display.SetNamedValue("appHeight", JsonValue.CreateNumberValue(Math.Round(Window.Current.Bounds.Height)));

                var hdr = new JsonArray();
                if (supported.Any(mode => mode.IsSmpte2084Supported)) hdr.Add(JsonValue.CreateStringValue("hdr10"));
                if (supported.Any(mode => mode.IsDolbyVisionLowLatencySupported)) hdr.Add(JsonValue.CreateStringValue("dolbyvision"));
                display.SetNamedValue("hdr", hdr);

                var modes = new JsonArray();
                var seen = new HashSet<string>();
                foreach (HdmiDisplayMode mode in supported)
                {
                    double refreshRate = Math.Round(mode.RefreshRate, 3);
                    string key = mode.ResolutionWidthInRawPixels + "x" + mode.ResolutionHeightInRawPixels + "@" + refreshRate + "/" + mode.BitsPerPixel + (mode.IsSmpte2084Supported ? "h" : "s") + (mode.IsDolbyVisionLowLatencySupported ? "d" : "");
                    if (!seen.Add(key)) continue;
                    if (modes.Count >= MaxDisplayModes) break;

                    var entry = new JsonObject();
                    entry.SetNamedValue("width", JsonValue.CreateNumberValue(mode.ResolutionWidthInRawPixels));
                    entry.SetNamedValue("height", JsonValue.CreateNumberValue(mode.ResolutionHeightInRawPixels));
                    entry.SetNamedValue("refreshRate", JsonValue.CreateNumberValue(refreshRate));
                    entry.SetNamedValue("bitsPerPixel", JsonValue.CreateNumberValue(mode.BitsPerPixel));
                    entry.SetNamedValue("hdr10", JsonValue.CreateBooleanValue(mode.IsSmpte2084Supported));
                    entry.SetNamedValue("dolbyVision", JsonValue.CreateBooleanValue(mode.IsDolbyVisionLowLatencySupported));
                    modes.Add(entry);
                }
                display.SetNamedValue("modes", modes);
                return display;
            }
            catch (Exception ex)
            {
                HostLog.Write("boot", "Display could not be read: " + ex.Message);
                return JsonValue.CreateNullValue();
            }
        }

        private static JsonObject ReadDolbyVision()
        {
            var effect = new JsonArray();
            foreach (string profile in DolbyVisionEffect.Profiles) effect.Add(JsonValue.CreateStringValue(profile));
            var dolbyVision = new JsonObject();
            dolbyVision.SetNamedValue("effect", effect);
            return dolbyVision;
        }

        // True or false where the console answered, and null where it didnt in time.
        private static async Task<JsonObject> ReadProtectionAsync()
        {
            var protection = new JsonObject();
            Stopwatch clock = Stopwatch.StartNew();
            ProtectionCapabilities capabilities = null;
            try
            {
                capabilities = new ProtectionCapabilities();
            }
            catch (Exception ex)
            {
                HostLog.Write("boot", "Protection capabilities unavailable: " + ex.Message);
            }

            protection.SetNamedValue("hevc", NullableBoolean(await AskAsync(capabilities, HevcQuery, clock)));
            protection.SetNamedValue("uhd", NullableBoolean(await AskAsync(capabilities, UhdQuery, clock)));
            protection.SetNamedValue("uhdHdr", NullableBoolean(await AskAsync(capabilities, UhdHdrQuery, clock)));
            protection.SetNamedValue("hdcp22", NullableBoolean(await AskAsync(capabilities, Hdcp22Query, clock)));
            return protection;
        }

        // "Maybe" means the console is still finding out, so it is asked again shortly.
        private static async Task<bool?> AskAsync(ProtectionCapabilities capabilities, string query, Stopwatch clock)
        {
            if (capabilities == null) return null;
            try
            {
                while (clock.Elapsed < ProtectionBudget)
                {
                    ProtectionCapabilityResult result = capabilities.IsTypeSupported(query, HardwareKeySystem);
                    if (result == ProtectionCapabilityResult.Probably) return true;
                    if (result == ProtectionCapabilityResult.NotSupported) return false;
                    await Task.Delay(100);
                }
            }
            catch (Exception ex)
            {
                HostLog.Write("boot", "Protection query failed: " + ex.Message);
            }
            return null;
        }

        // Says the host has the console's player, and the version of what the page can ask of it.
        private static JsonObject ReadNativePlayer()
        {
            var nativePlayer = new JsonObject();
            nativePlayer.SetNamedValue("v", JsonValue.CreateNumberValue(1));
            return nativePlayer;
        }

        // The package version, which counts up with every build and tells a report apart
        // from one made on an earlier one.
        private static JsonObject ReadPackage()
        {
            PackageVersion version = Package.Current.Id.Version;
            var package = new JsonObject();
            package.SetNamedValue("version", JsonValue.CreateStringValue(version.Major + "." + version.Minor + "." + version.Build + "." + version.Revision));
            return package;
        }

        private static JsonObject ReadWebView(string version)
        {
            var webView = new JsonObject();
            webView.SetNamedValue("version", JsonValue.CreateStringValue(version ?? ""));
            return webView;
        }

        private static IJsonValue NullableBoolean(bool? value)
        {
            return value.HasValue ? JsonValue.CreateBooleanValue(value.Value) : JsonValue.CreateNullValue();
        }
    }
}
