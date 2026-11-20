<#
.SYNOPSIS
  Checks the Xbox host's HTTP relay (Smart-TV fix/xbox-silo-cors) on a Windows PC.
  Temporary: for testing the branch, removed before merge.

.DESCRIPTION
  Three stages, each reported PASS or FAIL:

  1. build   Builds the real Xbox Debug package (node packages\build-xbox\build.js --debug).
             This proves HttpRelay.cs compiles in the UWP project with .NET Native.
  2. relay   Compiles HttpRelay.cs and Bridge.cs from the repo into a small .NET test program and
             sends them requests the way the page does, against a local test server: JSON, a
             POST echo (headers, UTF-8 body, no cookies, no Origin), a Latin-1 body, a BOM, a
             redirect, 401 with a sign-in challenge, a 404, a timeout, an answer over the
             24 MB limit with and without Content-Length, a bad scheme and a closed port.
             With -Server it also reads Silo's /api/v2/system/info through the relay.
  3. desktop (only with -Desktop, needs an admin PowerShell) Builds a copy of the package that
             targets Windows desktop instead of Xbox, trusts its throwaway certificate,
             installs and starts it, so you can add the Silo server and play something by
             hand. Package.appxmanifest is put back afterwards. Not a shipping
             configuration, only a way to run the host without a console.

.PARAMETER Repo
  The Smart-TV checkout. Defaults to the one this script sits in (packages\build-xbox).
.PARAMETER Server
  A Silo server, such as http://192.168.1.49:8090, to read through the relay.
.PARAMETER SkipBuild
  Skips stage 1. Stage 3 still builds.
.PARAMETER Desktop
  Runs stage 3.
.PARAMETER Uninstall
  Removes the desktop test install and its certificate, then stops.

.EXAMPLE
  .\packages\build-xbox\check-xbox-relay.ps1 -Server http://192.168.1.49:8090
.EXAMPLE
  # in an admin PowerShell
  .\packages\build-xbox\check-xbox-relay.ps1 -Server http://192.168.1.49:8090 -Desktop
#>
param(
    [string]$Repo = '',
    [string]$Server = '',
    [switch]$SkipBuild,
    [switch]$Desktop,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Continue'
if (-not $Repo) { $Repo = Join-Path $PSScriptRoot '..\..' }
$Repo = (Resolve-Path $Repo).Path
$HostDir = Join-Path $Repo 'packages\build-xbox\shell\Moonfin.Xbox'
$Manifest = Join-Path $HostDir 'Package.appxmanifest'
$CertDir = Join-Path $Repo 'packages\build-xbox\.cert'
$LogDir = Join-Path $env:TEMP 'moonfin-relay-check'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$results = [ordered]@{}

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Stage($name) { Say "`n=== $name ===" 'Cyan' }
function Done($name, $ok, $detail = '') {
    $results[$name] = $ok
    if ($ok) { Say "  PASS  $name $detail" 'Green' } else { Say "  FAIL  $name $detail" 'Red' }
}
function IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($Uninstall) {
    Get-AppxPackage -Name 'Moonfin.Xbox' | Remove-AppxPackage
    if (IsAdmin) {
        Get-ChildItem Cert:\LocalMachine\TrustedPeople | Where-Object { $_.Subject -eq 'CN=Moonfin' } | Remove-Item
        Say 'Removed the desktop test install and the CN=Moonfin certificate.' 'Green'
    } else {
        Say 'Removed the desktop test install. Run as admin to also remove the CN=Moonfin certificate from TrustedPeople.' 'Yellow'
    }
    return
}

# --- Prerequisites -------------------------------------------------------------------------
Stage 'prerequisites'
if (-not (Test-Path (Join-Path $HostDir 'HttpRelay.cs'))) {
    Say "No packages\build-xbox\shell\Moonfin.Xbox\HttpRelay.cs under $Repo. Check out fix/xbox-silo-cors, or pass -Repo." 'Red'
    exit 1
}
$branch = (git -C $Repo rev-parse --abbrev-ref HEAD) 2>$null
Say "  repo   $Repo ($branch)"
git -C $Repo merge-base --is-ancestor 0c19079a HEAD 2>$null
if ($LASTEXITCODE -ne 0) { Say '  The checkout does not have commit 0c19079a (the review fixes). Pull the branch first.' 'Yellow' }
foreach ($tool in 'node', 'npm', 'dotnet') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Say "  $tool is not on PATH." 'Red'; exit 1 }
}
Say "  node   $(node --version)"
Say "  dotnet $(dotnet --version)"
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) { Say '  No Visual Studio Build Tools (vswhere.exe). Stages 1 and 3 need them, with the UWP workload.' 'Yellow' }

function Build-Package($label, $extraArgs) {
    if (-not (Test-Path (Join-Path $Repo 'node_modules'))) {
        Say '  npm ci (first run)...'
        cmd /c "cd /d `"$Repo`" && npm ci 2>&1" | Out-File (Join-Path $LogDir 'npm-ci.log')
    }
    $log = Join-Path $LogDir "build-$label.log"
    Say "  node build.js --debug $extraArgs   (log: $log)"
    cmd /c "cd /d `"$Repo\packages\build-xbox`" && node build.js --debug $extraArgs 2>&1" | Tee-Object -FilePath $log | Out-Null
    $code = $LASTEXITCODE
    $errors = Select-String -Path $log -Pattern 'error CS\d+|error MSB\d+|error APPX\d+|Build failed' | Select-Object -First 15
    foreach ($e in $errors) { Say "    $($e.Line.Trim())" 'Red' }
    return ($code -eq 0)
}

# --- 1. Build the real package -------------------------------------------------------------
if (-not $SkipBuild) {
    Stage '1. build the Xbox Debug package'
    Done 'build' (Build-Package 'xbox' '') '(HttpRelay.cs compiles with .NET Native)'
}

# --- 2. The relay against a local test server ----------------------------------------------
Stage '2. HttpRelay.cs against a test server'
$proj = Join-Path $LogDir 'RelayCheck'
New-Item -ItemType Directory -Force -Path $proj | Out-Null
@"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0-windows10.0.19041.0</TargetFramework>
    <SupportedOSPlatformVersion>10.0.19041.0</SupportedOSPlatformVersion>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <Nullable>disable</Nullable>
    <LangVersion>latest</LangVersion>
    <NoWarn>CA1416;CS8632;CS0649</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Program.cs" />
    <Compile Include="$HostDir\HttpRelay.cs" Link="HttpRelay.cs" />
    <Compile Include="$HostDir\Bridge.cs" Link="Bridge.cs" />
  </ItemGroup>
</Project>
"@ | Set-Content -Encoding UTF8 (Join-Path $proj 'RelayCheck.csproj')

@'
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Data.Json;

namespace Moonfin.Xbox
{
    // The host's log, to the console here.
    internal static class HostLog
    {
        public static Action<string> ToPage;
        public static void Write(string area, string message) => Console.WriteLine("        host: [" + area + "] " + message);
    }

    internal static class Program
    {
        private static readonly ConcurrentDictionary<double, TaskCompletionSource<JsonObject>> Waiting = new ConcurrentDictionary<double, TaskCompletionSource<JsonObject>>();
        private static HttpRelay relay;
        private static double nextId = 1;
        private static int failed;
        private static string baseUrl;
        private static readonly byte[] Big = new byte[64 * 1024];

        private static async Task<int> Main(string[] args)
        {
            string server = args.Length > 0 ? args[0].TrimEnd('/') : "";
            relay = new HttpRelay((type, payload) =>
            {
                if (type != "HTTP_RESPONSE") return;
                JsonObject answer = payload.GetObject();
                if (Waiting.TryRemove(answer.GetNamedNumber("id"), out var waiting)) waiting.TrySetResult(answer);
            }, authority => false);

            int port = FreePort();
            baseUrl = "http://localhost:" + port;
            var listener = new HttpListener();
            listener.Prefixes.Add(baseUrl + "/");
            listener.Start();
            _ = Task.Run(() => Serve(listener));

            await Check("GET JSON: status, UTF-8 body, headers in lower case", async () =>
            {
                var (a, _) = await Ask(baseUrl + "/json");
                return Expect(a, 200) && Body(a) == "{\"ok\":true,\"text\":\"h\u00e9llo \u2713\"}"
                    && Header(a, "x-custom") == "yes" && (Header(a, "content-type") ?? "").StartsWith("application/json");
            });

            await Check("POST: method, headers, Content-Type, Content-Language and UTF-8 body reach the server; no Origin, no cookies", async () =>
            {
                var headers = new JsonObject();
                headers.SetNamedValue("Content-Type", JsonValue.CreateStringValue("application/json"));
                headers.SetNamedValue("X-Test", JsonValue.CreateStringValue("relay"));
                headers.SetNamedValue("Content-Language", JsonValue.CreateStringValue("fr"));
                headers.SetNamedValue("Authorization", JsonValue.CreateStringValue("Bearer test-token"));
                string sent = "{\"name\":\"h\u00e9llo \u2713\"}";
                var (a, _) = await Ask(baseUrl + "/echo", "POST", headers, sent);
                if (!Expect(a, 200)) return false;
                JsonObject echo = JsonObject.Parse(Body(a));
                bool ok = echo.GetNamedString("method") == "POST"
                    && echo.GetNamedString("contentType").StartsWith("application/json")
                    && echo.GetNamedString("xTest") == "relay"
                    && echo.GetNamedString("contentLanguage") == "fr"
                    && echo.GetNamedString("authorization") == "Bearer test-token"
                    && echo.GetNamedString("origin") == ""
                    && echo.GetNamedString("cookie") == ""
                    && echo.GetNamedString("body") == sent;
                if (!ok) Console.WriteLine("        server saw: " + Body(a));
                return ok;
            });

            await Check("DELETE with no body", async () => Expect((await Ask(baseUrl + "/echo", "DELETE")).Item1, 200));

            await Check("Latin-1 body (a subtitle file): answered, the odd byte read as U+FFFD", async () =>
            {
                var (a, _) = await Ask(baseUrl + "/latin1");
                return Expect(a, 200) && Body(a) == "caf\uFFFD";
            });

            await Check("UTF-8 BOM is dropped", async () =>
            {
                var (a, _) = await Ask(baseUrl + "/bom");
                return Expect(a, 200) && Body(a) == "{\"a\":1}";
            });

            await Check("redirect is followed", async () =>
            {
                var (a, _) = await Ask(baseUrl + "/redirect");
                return Expect(a, 200) && Body(a).Contains("\"ok\":true");
            });

            await Check("401 with a sign-in challenge comes back as 401 (and no Windows sign-in window opens)", async () =>
            {
                var (a, _) = await Ask(baseUrl + "/401");
                return Expect(a, 401) && Body(a).Contains("no");
            });

            await Check("404 comes back as 404 with its body", async () =>
            {
                var (a, _) = await Ask(baseUrl + "/missing");
                return Expect(a, 404) && Body(a) == "not here";
            });

            await Check("timeout: a 1.5 s request to a server that takes 6 s answers status 0 in time", async () =>
            {
                var (a, seconds) = await Ask(baseUrl + "/slow", timeoutMs: 1500);
                Console.WriteLine("        took " + seconds.ToString("0.0") + " s");
                return Expect(a, 0) && seconds < 4;
            });

            await Check("over 24 MB with Content-Length: turned away before reading (status 0, quickly)", async () =>
            {
                var (a, seconds) = await Ask(baseUrl + "/big-announced", timeoutMs: 60000);
                Console.WriteLine("        took " + seconds.ToString("0.0") + " s");
                return Expect(a, 0) && seconds < 5;
            });

            await Check("over 24 MB without Content-Length: refused after reading (status 0)", async () =>
                Expect((await Ask(baseUrl + "/big-chunked", timeoutMs: 60000)).Item1, 0));

            await Check("a scheme that isnt http(s) answers status 0", async () => Expect((await Ask("ftp://localhost/x")).Item1, 0));

            await Check("a closed port answers status 0", async () => Expect((await Ask("http://localhost:" + FreePort() + "/x", timeoutMs: 5000)).Item1, 0));

            await Check("answers to several requests at once each reach their own caller", async () =>
            {
                var asks = Enumerable.Range(0, 8).Select(i => Ask(baseUrl + "/n/" + i)).ToArray();
                await Task.WhenAll(asks);
                return asks.Select((t, i) => t.Result.Item1 != null && Body(t.Result.Item1) == i.ToString()).All(x => x);
            });

            if (server.Length > 0)
            {
                await Check("Silo " + server + "/api/v2/system/info through the relay", async () =>
                {
                    var headers = new JsonObject();
                    headers.SetNamedValue("Accept", JsonValue.CreateStringValue("application/json"));
                    var (a, _) = await Ask(server + "/api/v2/system/info", "GET", headers);
                    if (!Expect(a, 200)) return false;
                    Console.WriteLine("        " + Body(a).Substring(0, Math.Min(160, Body(a).Length)));
                    return Body(a).Contains("server_version");
                });
            }
            else
            {
                Console.WriteLine("  (no -Server given, so Silo itself was not tried)");
            }

            listener.Stop();
            Console.WriteLine(failed == 0 ? "\n  relay: all checks passed" : "\n  relay: " + failed + " check(s) failed");
            return failed;
        }

        // Sends one request the way the page does and waits for the host's answer.
        private static async Task<(JsonObject, double)> Ask(string url, string method = "GET", JsonObject headers = null, string body = null, double timeoutMs = 15000)
        {
            double id = nextId++;
            var waiting = new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
            Waiting[id] = waiting;
            var payload = new JsonObject();
            payload.SetNamedValue("id", JsonValue.CreateNumberValue(id));
            payload.SetNamedValue("url", JsonValue.CreateStringValue(url));
            payload.SetNamedValue("method", JsonValue.CreateStringValue(method));
            payload.SetNamedValue("headers", headers ?? new JsonObject());
            payload.SetNamedValue("body", body == null ? JsonValue.CreateNullValue() : JsonValue.CreateStringValue(body));
            payload.SetNamedValue("timeoutMs", JsonValue.CreateNumberValue(timeoutMs));
            var clock = Stopwatch.StartNew();
            relay.Handle(new PageMessage { Type = "HTTP_REQUEST", Payload = payload });
            Task finished = await Task.WhenAny(waiting.Task, Task.Delay(TimeSpan.FromMilliseconds(timeoutMs + 15000)));
            if (finished != waiting.Task) Console.WriteLine("        the host never answered");
            return (finished == waiting.Task ? waiting.Task.Result : null, clock.Elapsed.TotalSeconds);
        }

        private static async Task Check(string name, Func<Task<bool>> test)
        {
            bool ok;
            try { ok = await test(); }
            catch (Exception ex) { Console.WriteLine("        threw: " + ex.Message); ok = false; }
            if (!ok) failed++;
            Console.ForegroundColor = ok ? ConsoleColor.Green : ConsoleColor.Red;
            Console.WriteLine((ok ? "  PASS  " : "  FAIL  ") + name);
            Console.ResetColor();
        }

        private static bool Expect(JsonObject answer, int status)
        {
            if (answer == null) return false;
            int got = (int)answer.GetNamedNumber("status");
            if (got != status) Console.WriteLine("        status " + got + ", expected " + status);
            return got == status;
        }

        private static string Body(JsonObject answer) => answer.GetNamedString("body");

        private static string Header(JsonObject answer, string name)
        {
            JsonObject headers = answer.GetNamedObject("headers");
            return headers.ContainsKey(name) ? headers.GetNamedString(name) : null;
        }

        private static int FreePort()
        {
            var probe = new TcpListener(IPAddress.Loopback, 0);
            probe.Start();
            int port = ((IPEndPoint)probe.LocalEndpoint).Port;
            probe.Stop();
            return port;
        }

        // The test server.
        private static async Task Serve(HttpListener listener)
        {
            while (listener.IsListening)
            {
                HttpListenerContext context;
                try { context = await listener.GetContextAsync(); } catch { return; }
                _ = Task.Run(() => Answer(context));
            }
        }

        private static async Task Answer(HttpListenerContext context)
        {
            HttpListenerRequest request = context.Request;
            HttpListenerResponse response = context.Response;
            string path = request.Url.AbsolutePath;
            try
            {
                if (path == "/json")
                {
                    response.ContentType = "application/json; charset=utf-8";
                    response.AddHeader("X-Custom", "yes");
                    await Write(response, Encoding.UTF8.GetBytes("{\"ok\":true,\"text\":\"h\u00e9llo \u2713\"}"));
                }
                else if (path == "/echo")
                {
                    string body;
                    using (var reader = new StreamReader(request.InputStream, Encoding.UTF8)) body = await reader.ReadToEndAsync();
                    var echo = new JsonObject();
                    echo.SetNamedValue("method", JsonValue.CreateStringValue(request.HttpMethod));
                    echo.SetNamedValue("contentType", JsonValue.CreateStringValue(request.ContentType ?? ""));
                    echo.SetNamedValue("xTest", JsonValue.CreateStringValue(request.Headers["X-Test"] ?? ""));
                    echo.SetNamedValue("contentLanguage", JsonValue.CreateStringValue(request.Headers["Content-Language"] ?? ""));
                    echo.SetNamedValue("authorization", JsonValue.CreateStringValue(request.Headers["Authorization"] ?? ""));
                    echo.SetNamedValue("origin", JsonValue.CreateStringValue(request.Headers["Origin"] ?? ""));
                    echo.SetNamedValue("cookie", JsonValue.CreateStringValue(request.Headers["Cookie"] ?? ""));
                    echo.SetNamedValue("body", JsonValue.CreateStringValue(body));
                    response.ContentType = "application/json";
                    await Write(response, Encoding.UTF8.GetBytes(echo.Stringify()));
                }
                else if (path == "/latin1")
                {
                    response.ContentType = "text/plain; charset=ISO-8859-1";
                    await Write(response, new byte[] { 0x63, 0x61, 0x66, 0xE9 });
                }
                else if (path == "/bom")
                {
                    response.ContentType = "application/json";
                    await Write(response, new byte[] { 0xEF, 0xBB, 0xBF }.Concat(Encoding.UTF8.GetBytes("{\"a\":1}")).ToArray());
                }
                else if (path == "/redirect")
                {
                    response.StatusCode = 302;
                    response.RedirectLocation = baseUrl + "/json";
                }
                else if (path == "/401")
                {
                    response.StatusCode = 401;
                    response.AddHeader("WWW-Authenticate", "Basic realm=\"moonfin-relay-check\"");
                    await Write(response, Encoding.UTF8.GetBytes("{\"error\":\"no\"}"));
                }
                else if (path == "/slow")
                {
                    await Task.Delay(6000);
                    await Write(response, Encoding.UTF8.GetBytes("late"));
                }
                else if (path == "/big-announced")
                {
                    response.ContentLength64 = 30L * 1024 * 1024;
                    for (int i = 0; i < 480; i++) await response.OutputStream.WriteAsync(Big, 0, Big.Length);
                }
                else if (path == "/big-chunked")
                {
                    response.SendChunked = true;
                    for (int i = 0; i < 420; i++) await response.OutputStream.WriteAsync(Big, 0, Big.Length);
                }
                else if (path.StartsWith("/n/"))
                {
                    await Task.Delay(new Random().Next(10, 300));
                    await Write(response, Encoding.UTF8.GetBytes(path.Substring(3)));
                }
                else
                {
                    response.StatusCode = 404;
                    await Write(response, Encoding.UTF8.GetBytes("not here"));
                }
            }
            catch
            {
                // the relay hung up, as it should for the large answers
            }
            finally
            {
                try { response.Close(); } catch { }
            }
        }

        private static Task Write(HttpListenerResponse response, byte[] bytes)
        {
            response.ContentLength64 = bytes.Length;
            return response.OutputStream.WriteAsync(bytes, 0, bytes.Length);
        }
    }
}
'@ | Set-Content -Encoding UTF8 (Join-Path $proj 'Program.cs')

$relayLog = Join-Path $LogDir 'relay.log'
Say "  dotnet build (log: $relayLog)"
cmd /c "dotnet build `"$proj`" -c Release -nologo -v q 2>&1" | Out-File $relayLog
if ($LASTEXITCODE -ne 0) {
    Select-String -Path $relayLog -Pattern 'error' | Select-Object -First 15 | ForEach-Object { Say "    $($_.Line.Trim())" 'Red' }
    Done 'relay' $false '(the test program did not compile; see the errors above)'
} else {
    dotnet run --project $proj -c Release --no-build -- $Server
    Done 'relay' ($LASTEXITCODE -eq 0)
}

# --- 3. Desktop install --------------------------------------------------------------------
if ($Desktop) {
    Stage '3. desktop test install'
    if (-not (IsAdmin)) {
        Say '  Needs an admin PowerShell, to trust the throwaway certificate. Skipped.' 'Yellow'
        Done 'desktop' $false '(not admin)'
    } elseif ([Environment]::OSVersion.Version.Build -lt 26100) {
        Say "  The package needs Windows build 26100 (24H2) or later; this is $([Environment]::OSVersion.Version.Build). Skipped." 'Yellow'
        Done 'desktop' $false '(Windows too old)'
    } else {
        $original = [IO.File]::ReadAllText($Manifest)
        $built = $false
        try {
            [IO.File]::WriteAllText($Manifest, $original.Replace('TargetDeviceFamily Name="Windows.Xbox"', 'TargetDeviceFamily Name="Windows.Desktop"'))
            $web = if ((Test-Path (Join-Path $HostDir 'www\main.js')) -and -not (Test-Path (Join-Path $HostDir 'www\dev-url.txt'))) { '--no-web' } else { '' }
            $built = Build-Package 'desktop' $web
        } finally {
            [IO.File]::WriteAllText($Manifest, $original)
            Say '  Package.appxmanifest put back.'
        }
        if (-not $built) {
            Done 'desktop' $false '(the desktop build failed)'
        } else {
            $msix = Get-ChildItem $Repo -Filter 'Moonfin_Xbox_Debug_v*.msix' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            $cer = Get-ChildItem $CertDir -Filter 'moonfin-xbox-dev.cer' -ErrorAction SilentlyContinue | Select-Object -First 1
            $deps = Get-ChildItem (Join-Path $HostDir 'AppPackages') -Recurse -Filter '*.appx' -ErrorAction SilentlyContinue |
                Where-Object { $_.DirectoryName -like '*Dependencies\x64' } | Select-Object -ExpandProperty FullName
            if (-not $msix -or -not $cer) {
                Done 'desktop' $false '(no package or certificate found after the build)'
            } else {
                Import-Certificate -FilePath $cer.FullName -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
                Say "  installing $($msix.Name)"
                try {
                    $install = @{ Path = $msix.FullName; ForceApplicationShutdown = $true; ForceUpdateFromAnyVersion = $true; ErrorAction = 'Stop' }
                    if ($deps) { $install.DependencyPath = @($deps) }
                    Add-AppxPackage @install
                    $pkg = Get-AppxPackage -Name 'Moonfin.Xbox'
                    Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!App"
                    Done 'desktop' $true '(installed and started)'
                    $serverText = if ($Server) { $Server } else { 'http://<silo-ip>:8090' }
                    Say @"

  Now check by hand in the app window (Debug build: F12 opens DevTools; the host's own
  log lines show in its console starting with [XBOX:http] or [XBOX:relay]):
    1. Discovered Servers lists the Silo server.
    2. Add Server -> $serverText -> Connect, then sign in.
    3. Home loads; open a title and play it; press Back. Silo's admin Activity shows the
       session end.
    4. Close the app and start it again: the saved server comes back signed in, with no
       network error while it starts.
    5. In DevTools' Network tab there are no CORS errors for the Silo address.
  The window is a 1080p TV layout on a desktop, and Xbox-only things (HDMI modes, HDR
  switching, passthrough) do nothing here. Remove it afterwards with -Uninstall.
"@ 'White'
                } catch {
                    Say "  $($_.Exception.Message)" 'Red'
                    Done 'desktop' $false '(Add-AppxPackage refused it)'
                }
            }
        }
    }
}

# --- Summary -------------------------------------------------------------------------------
Stage 'summary'
foreach ($k in $results.Keys) {
    if ($results[$k]) { Say "  PASS  $k" 'Green' } else { Say "  FAIL  $k" 'Red' }
}
Say "  Logs: $LogDir"
if ($results.Values -contains $false) { exit 1 }
