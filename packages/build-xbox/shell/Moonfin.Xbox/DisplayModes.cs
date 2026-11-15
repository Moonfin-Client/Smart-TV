using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.Graphics.Display.Core;

namespace Moonfin.Xbox
{
    // Switching the HDMI output for what is playing.
    //
    // The console's interface runs in SDR, and it isnt converted for an HDR mode, so
    // the output only goes to HDR while HDR video plays and has to be put back after.
    // Media modes stay at 60 Hz, as Microsoft's guidance for video apps has it.
    // https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/hevc-xbox
    internal static class DisplayModes
    {
        private static bool switched;

        // True while this app has the output in Dolby Vision.
        public static bool InDolbyVision { get; private set; }

        // Puts the output into its HDR10 mode. The answer says whether it went, and which
        // mode was asked for, or why none was.
        public static Task<JsonObject> SetForHdr10Async()
        {
            return SetAsync(mode => mode.IsSmpte2084Supported, HdmiDisplayHdrOption.Eotf2084, "the display has no HDR10 mode");
        }

        // Puts the output into low latency Dolby Vision, the only kind an app can ask for.
        // A Dolby Vision video fails to play unless the output is already in it when it opens.
        public static Task<JsonObject> SetForDolbyVisionAsync()
        {
            return SetAsync(mode => mode.IsDolbyVisionLowLatencySupported, HdmiDisplayHdrOption.DolbyVisionLowLatency, "the display has no Dolby Vision mode");
        }

        private static async Task<JsonObject> SetAsync(Func<HdmiDisplayMode, bool> supports, HdmiDisplayHdrOption option, string noMode)
        {
            var answer = new JsonObject();
            try
            {
                HdmiDisplayInformation hdmi = HdmiDisplayInformation.GetForCurrentView();
                if (hdmi == null) return Refused(answer, "no HDMI display to switch");

                HdmiDisplayMode current = hdmi.GetCurrentDisplayMode();
                IReadOnlyList<HdmiDisplayMode> candidates = hdmi.GetSupportedDisplayModes().Where(supports).ToList();
                if (candidates.Count == 0) return Refused(answer, noMode);

                // The size the output is at now, the nearest thing to 60 Hz, and the deepest colour.
                HdmiDisplayMode chosen = candidates
                    .OrderByDescending(mode => mode.ResolutionWidthInRawPixels == current.ResolutionWidthInRawPixels && mode.ResolutionHeightInRawPixels == current.ResolutionHeightInRawPixels)
                    .ThenBy(mode => Math.Abs(mode.RefreshRate - 60))
                    .ThenByDescending(mode => mode.BitsPerPixel)
                    .First();

                bool went = await hdmi.RequestSetCurrentDisplayModeAsync(chosen, option);
                if (went)
                {
                    switched = true;
                    InDolbyVision = option == HdmiDisplayHdrOption.DolbyVisionLowLatency;
                }

                answer.SetNamedValue("ok", JsonValue.CreateBooleanValue(went));
                answer.SetNamedValue("mode", JsonValue.CreateStringValue(chosen.ResolutionWidthInRawPixels + "x" + chosen.ResolutionHeightInRawPixels + " at " + Math.Round(chosen.RefreshRate, 2) + " Hz, " + chosen.BitsPerPixel + " bits per pixel"));
                if (!went) answer.SetNamedValue("reason", JsonValue.CreateStringValue("the console turned the mode down"));
                return answer;
            }
            catch (Exception ex)
            {
                return Refused(answer, ex.Message);
            }
        }

        public static bool DisplayHasHdr10()
        {
            try
            {
                HdmiDisplayInformation hdmi = HdmiDisplayInformation.GetForCurrentView();
                return hdmi != null && hdmi.GetSupportedDisplayModes().Any(mode => mode.IsSmpte2084Supported);
            }
            catch (Exception)
            {
                return false;
            }
        }

        // Back to the mode the console was in, if this app took it out of it.
        public static async Task<bool> RestoreAsync()
        {
            if (!switched) return true;
            try
            {
                HdmiDisplayInformation hdmi = HdmiDisplayInformation.GetForCurrentView();
                if (hdmi == null) return false;
                await hdmi.SetDefaultDisplayModeAsync();
                switched = false;
                InDolbyVision = false;
                return true;
            }
            catch (Exception ex)
            {
                HostLog.Write("display", "Could not restore the default mode: " + ex.Message);
                return false;
            }
        }

        private static JsonObject Refused(JsonObject answer, string reason)
        {
            answer.SetNamedValue("ok", JsonValue.CreateBooleanValue(false));
            answer.SetNamedValue("reason", JsonValue.CreateStringValue(reason));
            return answer;
        }
    }
}
