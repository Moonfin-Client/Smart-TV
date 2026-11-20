# Hosted TV edition (moonfin.io/tv/)

The same Smart-TV app as the packaged builds, built as a static site that runs in a browser. On a Titan OS or Saphi TV it uses the Titan platform, and anywhere else it uses the plain web platform. It never calls webOS, Tizen, Fire TV or Xbox native APIs, even when the browser's user agent names one of those.

## Building

```bash
npm run build:web-tv    # packages/build-web/dist/tv, picks Titan or web at runtime
npm run build:titan     # packages/build-web/dist/titan, always Titan, for Titan's QA
npm run dev:web-tv      # dev server, add ?platform=titan to walk the Titan path
npm run dev:titan       # dev server that's always Titan
```

`--skip-lint` skips the lint and CSS gates. The `<meta name="moonfin-build">` tag in `index.html` carries the version and commit the build came from.

Every path in the bundle is relative, so the folder works under any path as long as the address ends in a slash.

### Browser support

The bundle targets Chrome and Edge 84, Firefox 91 and Safari 14 (`.browserslistrc`). Chrome 84 is the engine on the oldest sets in Titan's store, the 2020 to 2022 Philips models. Nothing older has been tried.

## How the platform is picked

| Where it runs | Picked by | Platform |
| --- | --- | --- |
| Philips or JVC on Titan OS | `TitanOS/` in the user agent | `titan` |
| Philips 2020 to 2022 on Saphi | `Philips` with `SmartTvA/` or `WhaleTV/` in the user agent | `titan` |
| LG or Samsung TV browser | nothing, a TV browser has no native bridge | `web` |
| Philips Android TV, other TVs, computers | nothing matched | `web` |
| A build made with `build:titan` | the build | `titan` |

Detection runs at startup from the user agent alone, so nothing renders as one platform and then switches. Titan's SDK is only loaded once Titan is picked, in its own chunk.

### Where each capability comes from

| Capability | Titan | Web |
| --- | --- | --- |
| Model, brand, year | SDK, then the user agent (`TV_NT72690_2025_4K`, `Model/Vestel-MB190`) | browser name and version |
| OS version | user agent (`TitanOS/3.0`), the SDK's firmware field is unreliable | none |
| 4K | SDK `supportUHD`, or `_4K` in the user agent | screen width times device pixel ratio |
| HDR10 and HLG | Titan documents them on every set, the SDK can say no, and `canPlayType` has to accept 10-bit HEVC or VP9 | the display reports high dynamic range and `canPlayType` accepts 10-bit HEVC or VP9 |
| Dolby Vision | off | off |
| HEVC, VP9, AC3, E-AC-3, Opus | `canPlayType` | `canPlayType` |
| AV1, FLAC, DTS, MKV, MPEG-TS files | off, Titan doesn't list them for progressive files | AV1 and FLAC by `canPlayType`, the rest off |
| HLS segments | TS only (Titan lists HLS version 3) | fMP4, with TS for live TV |
| Audio track switching | `audioTracks` on the element, otherwise the server picks the track | same |

### What plays how

| File | Titan | Web |
| --- | --- | --- |
| MP4 with H.264 and AAC | direct | direct |
| MP4 with HEVC, SDR or HDR10 | direct when the set takes it | direct on an HDR display with an HEVC decoder |
| WebM with VP9 | direct | direct |
| MKV with H.264 or HEVC | server HLS. H.264 is copied, HEVC is re-encoded to H.264 | server HLS. Both are copied when the browser decodes HEVC |
| DTS or TrueHD with another usable track | the usable track | the usable track |
| DTS or TrueHD only | audio converted to AAC | audio converted to AAC |
| Dolby Vision | server converts | server converts |
| Live TV | TS HLS with H.264 and AAC | TS HLS with H.264 and AAC |
| ASS, SSA and PGS subtitles | drawn in the page | drawn in the page |

`[webVideo] Compatibility check` in the console says why a file wasn't played directly. The server's transcode reasons are in the HLS address.

## Networking

The page is served over https, and a lot of servers sit at an `http://` LAN address.

- Titan's engines (Chrome 84 to 122) block an https page from calling an `http://` server. The sign-in screen then says so and points to the server's https address or the packaged apps. This is the main limit of the hosted edition.
- Current desktop Chrome lets the call through to a private IP address after asking for local network access. It still blocks an `http://` host name.
- Jellyfin and Emby answer every origin, so an https server works from the page.
- Moonfin never proxies a server's requests or video through its own infrastructure.

## Putting it on moonfin.io

moonfin.io deploys from the Moonfin.io repo's main branch through Cloudflare Workers Builds. The Worker there sends `/tv/*` through `serveTvApp`, which turns a missing file into a real 404. The site's single-page fallback would answer it with its own index.html, and the app's locale loader needs the 404. `/tv` redirects to `/tv/` on its own.

1. `npm run build:web-tv` here.
2. In Moonfin.io, replace `public/tv` with `packages/build-web/dist/tv`.
3. `npm run build` and `npx wrangler deploy --dry-run` there. No file in the build is near the 25 MiB asset limit.
4. Push to main. `/` and `/web/` don't change.

Caching: the Workers asset defaults revalidate every file by ETag on each load. File names aren't content hashed, so don't add long cache lifetimes. There's no service worker.

Rollback: revert the commit that changed `public/tv` and push, or roll back to the previous deployment in the Cloudflare dashboard.

Storage: `/tv/` shares moonfin.io's origin, and so its localStorage, with `/web/`. Both use `moonfin_` keys. Clearing data in the TV app leaves the Flutter client's keys alone, see `platform-web/src/storage.js`.

### Smoke test after a deploy

- `/tv/` shows the server screen, `/tv` redirects to it, and `/tv/missing.js` is a 404.
- `/`, `/privacy` and `/web/` look as before.
- Add a server by address with the remote or keyboard, sign in with Quick Connect, and play something.
- In the server's dashboard the session reads "Moonfin TV for Web", or "Moonfin for Titan OS" on a Titan set.

## Titan OS QA

The Partner Portal wants a test URL. That can be `https://moonfin.io/tv/` once deployed, or the `dist/titan` build on a staging host. Titan's intake checks playback and key handling. Changes to playback or navigation after certification need another review.

On a Titan set (DevView, remote debugging on port 9222 or 7001 on Philips and 4725 on JVC), check:

- [ ] The app opens, and the server screen is usable with the remote alone.
- [ ] Back is 8 on Philips and 461 on JVC, and the SDK's `getKeyCodes()` gives it for other brands such as Sharp. It walks back through screens, opens the exit dialog on Home, and Back in that dialog exits, since Titan's guidelines say pressing Back over and over should end in an exit.
- [ ] With Moonfin's keyboard open, Back on a Philips remote closes it instead of deleting a letter, and Titan's own keyboard doesn't open on top of it.
- [ ] The playback info panel shows the right model and Titan OS version. Settings > About still reads Unknown for the platform.
- [ ] H.264 and AAC MP4 plays directly, seeks, resumes and reports its stop.
- [ ] An HEVC Main 10 HDR10 MP4 plays directly with the right colors.
- [ ] An MKV plays through the server and the HLS stream starts.
- [ ] A file with DTS and a second AAC track starts on the AAC track.
- [ ] Live TV starts and channels change.
- [ ] SRT, ASS and PGS subtitles show.
- [ ] Ten rounds of play then back leave the set responsive.
- [ ] On a JVC MB190 or MB191, which draw apps at 720p, the screens fit and nothing is cut off.
- [ ] An https server and an `http://` LAN server, and what each one does.

Not tried on a Titan set yet: HEVC, AC3 and E-AC-3 in TS segments (Titan's media page lists them, but they're left off, so an HEVC MKV is re-encoded), Dolby Vision through the page, `audioTracks`, the real bitrate ceiling (capped at 20 Mbps, 60 Mbps on 4K), and how the SDK behaves on a real set.

Titan's SDK sends Titan a usage event with the page's host name when it loads, and can report its own errors. That only happens on a Titan set.
