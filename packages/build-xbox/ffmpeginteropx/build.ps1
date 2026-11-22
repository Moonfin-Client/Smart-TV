# Rebuilds Moonfin.FFmpegInteropX.UWP.Lib into ../nuget, as README.md describes.
param(
    # Kept short, since the restored packages nest past Windows' 260 character path limit otherwise
    [string] $WorkDir = (Join-Path $env:TEMP 'moonfin-ffmpeginteropx'),
    [string] $Version = '2.1.0.2'
)

$ErrorActionPreference = 'Stop'
$source = Join-Path $WorkDir 'FFmpegInteropX'
$pack = Join-Path $WorkDir 'pack'
$out = Join-Path $source 'Output\FFmpegInteropX\x64\Release_UWP'

if (Test-Path $WorkDir) { Remove-Item -Recurse -Force $WorkDir }
git clone --branch v2.1.0 --depth 1 https://github.com/ffmpeginteropx/FFmpegInteropX.git $source
if ($LASTEXITCODE) { throw 'Could not clone FFmpegInteropX' }
git -C $source apply (Join-Path $PSScriptRoot 'moonfin.patch')
if ($LASTEXITCODE) { throw 'The patch did not apply' }

# The sources name a prerelease FFmpeg package. This builds against the released one the app ships.
$config = Join-Path $source 'Source\packages.config'
(Get-Content $config) |
    Where-Object { $_ -notmatch 'Desktop\.FFmpeg' } |
    ForEach-Object { $_ -replace '(UWP\.FFmpeg" version=")[^"]+', '${1}8.1.2' } |
    Set-Content $config -Encoding UTF8

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
$project = Join-Path $source 'Source\FFmpegInteropX.vcxproj'

& $msbuild $project -t:restore -p:RestorePackagesConfig=true -p:Configuration=Release_UWP -p:Platform=x64 -nologo -v:minimal
if ($LASTEXITCODE) { throw 'Restoring the FFmpegInteropX packages failed' }
& $msbuild $project -p:Configuration=Release_UWP -p:Platform=x64 -p:WindowsTargetPlatformVersion=10.0.26100.0 -p:WindowsTargetPlatformMinVersion=10.0.17763.0 -p:PlatformToolset=v143 -p:FFmpegPackageVersion=8.1.2 -p:LibraryVersionNumber=$Version -m -nologo -v:minimal
if ($LASTEXITCODE) { throw 'Building FFmpegInteropX failed' }

# Packed from a copy, so the pack project's obj folder stays out of the repo
New-Item -ItemType Directory -Force $pack | Out-Null
Copy-Item (Join-Path $PSScriptRoot '*') $pack -Include 'pack.csproj', '*.nuspec', '*.targets'
$nuget = Join-Path $PSScriptRoot '..\nuget'
dotnet pack (Join-Path $pack 'pack.csproj') -nologo "-p:PackageVersion=$Version" "-p:FFmpegInteropXOut=$out" "-p:FFmpegInteropXSource=$source" "-p:PackageOutputPath=$nuget"
if ($LASTEXITCODE) { throw 'Packing failed' }
