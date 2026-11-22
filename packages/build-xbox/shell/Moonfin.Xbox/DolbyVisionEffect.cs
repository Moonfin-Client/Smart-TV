using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;

namespace Moonfin.Xbox
{
    // Windows lists the console's Dolby Vision processor as a video renderer effect, with the
    // Dolby Vision profiles it takes, such as dvhe.05. A stream tagged with one of them gets
    // the effect between its decoder and the display.
    internal static class DolbyVisionEffect
    {
        private static readonly Guid VideoRendererEffectCategory = new Guid("145CD8B4-92F4-4B23-8AE7-E0DF06C2DA95");
        private static readonly Guid ExtensionProfileKey = new Guid("62C56928-9A4E-443B-B9DC-CAC830C24100");
        private const uint MfVersion = 0x00020070;
        private const uint MfStartupLite = 1;
        private const uint EnumSortAndFilter = 0x40;
        private const ushort StringVector = 0x101F;
        private const int PropVariantSize = 24;

        private static IReadOnlyList<string> profiles;

        // Empty when the console has no Dolby Vision effect.
        public static IReadOnlyList<string> Profiles => profiles ?? (profiles = Read());

        // The profile to tag a file of the given Dolby Vision profile with, or null when there
        // is no effect. dvhe.05 is the one the console's effect is known to list, and the effect
        // reads each frame's own metadata, so it stands in for a profile the list leaves out.
        public static string ProfileFor(int dolbyVisionProfile)
        {
            IReadOnlyList<string> listed = Profiles;
            if (listed.Count == 0) return null;
            return listed.FirstOrDefault(profile => string.Equals(profile, "dvhe.0" + dolbyVisionProfile, StringComparison.OrdinalIgnoreCase))
                ?? listed.FirstOrDefault(profile => string.Equals(profile, "dvhe.05", StringComparison.OrdinalIgnoreCase))
                ?? listed[0];
        }

        private static IReadOnlyList<string> Read()
        {
            var found = new List<string>();
            IntPtr activates = IntPtr.Zero;
            bool started = false;
            try
            {
                started = MFStartup(MfVersion, MfStartupLite) >= 0;
                Guid category = VideoRendererEffectCategory;
                if (MFTEnumEx(ref category, EnumSortAndFilter, IntPtr.Zero, IntPtr.Zero, out activates, out uint count) < 0) return found;
                for (int i = 0; i < count; i++)
                {
                    IntPtr activate = Marshal.ReadIntPtr(activates, i * IntPtr.Size);
                    try
                    {
                        ReadProfiles(activate, found);
                    }
                    catch (Exception ex)
                    {
                        HostLog.Write("display", "Could not read a video renderer effect: " + ex.Message);
                    }
                    finally
                    {
                        Marshal.Release(activate);
                    }
                }
            }
            catch (Exception ex)
            {
                HostLog.Write("display", "Could not list the video renderer effects: " + ex.Message);
            }
            finally
            {
                if (activates != IntPtr.Zero) Marshal.FreeCoTaskMem(activates);
                if (started) MFShutdown();
            }
            return found;
        }

        // An effect's profiles are a PROPVARIANT holding a vector of strings.
        private static void ReadProfiles(IntPtr activate, List<string> found)
        {
            var attributes = (IMFAttributes)Marshal.GetObjectForIUnknown(activate);
            IntPtr value = Marshal.AllocCoTaskMem(PropVariantSize);
            try
            {
                for (int i = 0; i < PropVariantSize; i++) Marshal.WriteByte(value, i, 0);
                Guid key = ExtensionProfileKey;
                if (attributes.GetItem(ref key, value) < 0) return;
                if ((ushort)Marshal.ReadInt16(value) != StringVector) return;

                int count = Marshal.ReadInt32(value, 8);
                IntPtr strings = Marshal.ReadIntPtr(value, 8 + IntPtr.Size);
                for (int i = 0; i < count; i++)
                {
                    string profile = Marshal.PtrToStringUni(Marshal.ReadIntPtr(strings, i * IntPtr.Size));
                    if (!string.IsNullOrEmpty(profile) && !found.Contains(profile)) found.Add(profile);
                }
            }
            finally
            {
                PropVariantClear(value);
                Marshal.FreeCoTaskMem(value);
            }
        }

        // Only GetItem is called, and it is the interface's first method.
        [ComImport, Guid("2CD2D921-C447-44A7-A13C-4ADABFC247E3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMFAttributes
        {
            [PreserveSig]
            int GetItem(ref Guid key, IntPtr value);
        }

        [DllImport("mfplat.dll", ExactSpelling = true)]
        private static extern int MFStartup(uint version, uint flags);

        [DllImport("mfplat.dll", ExactSpelling = true)]
        private static extern int MFShutdown();

        [DllImport("mfplat.dll", ExactSpelling = true)]
        private static extern int MFTEnumEx(ref Guid category, uint flags, IntPtr inputType, IntPtr outputType, out IntPtr activates, out uint count);

        [DllImport("ole32.dll", ExactSpelling = true)]
        private static extern int PropVariantClear(IntPtr value);
    }
}
