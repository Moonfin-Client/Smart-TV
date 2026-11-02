<h1 align="center">Moonfin for Smart-TVs</h1>
<h3 align="center">Premium Jellyfin, Emby, Plex and Silo client for webOS and Tizen TVs</h3>

---

<p align="center">
   <img width="1920" height="1080" alt="splash-background" src="https://github.com/Moonfin-Client/.github/blob/main/logo.png" />
</p>

[![License](https://img.shields.io/github/license/Moonfin-Client/Smart-TV.svg)](https://github.com/Moonfin-Client/Smart-TV)
[![Release](https://img.shields.io/github/release/Moonfin-Client/Smart-TV.svg)](https://github.com/Moonfin-Client/Smart-TV/releases)
[![github](https://img.shields.io/github/downloads/Moonfin-Client/Smart-TV/total?logo=github&label=Downloads)](https://github.com/Moonfin-Client/Smart-TV/releases)
[![Amazon Appstore](https://img.shields.io/badge/Amazon%20Appstore-FF9900?logo=amazon&logoColor=white)](https://www.amazon.com/Moonfin/dp/B0H76BG3DW)
[![Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-107C10?logo=data:image/svg%2Bxml;base64,PHN2ZyByb2xlPSJpbWciIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNNC4xMDIgMjEuMDMzQzYuMjExIDIyLjg4MSA4Ljk3NyAyNCAxMiAyNGMzLjAyNiAwIDUuNzg5LTEuMTE5IDcuOTAyLTIuOTY3IDEuODc3LTEuOTEyLTQuMzE2LTguNzA5LTcuOTAyLTExLjQxNy0zLjU4MiAyLjcwOC05Ljc3OSA5LjUwNS03Ljg5OCAxMS40MTd6bTExLjE2LTE0LjQwNmMyLjUgMi45NjEgNy40ODQgMTAuMzEzIDYuMDc2IDEyLjkxMkMyMy4wMDIgMTcuNDggMjQgMTQuODYxIDI0IDEyLjAwNGMwLTMuMzQtMS4zNjUtNi4zNjItMy41Ny04LjUzNiAwIDAtLjAyNy0uMDIyLS4wODItLjA0Mi0uMDYzLS4wMjItLjE1Mi0uMDQ1LS4yODEtLjA0NS0uNTkyIDAtMS45ODUuNDM0LTQuODA1IDMuMjQ2ek0zLjY1NCAzLjQyNmMtLjA1Ny4wMi0uMDgyLjA0MS0uMDg2LjA0MkMxLjM2NSA1LjY0MiAwIDguNjY0IDAgMTIuMDA0YzAgMi44NTQuOTk4IDUuNDczIDIuNjYxIDcuNTMzLTEuNDAxLTIuNjA1IDMuNTc5LTkuOTUxIDYuMDgtMTIuOTEtMi44Mi0yLjgxMy00LjIxNi0zLjI0NS00LjgwNi0zLjI0NS0uMTMxIDAtLjIyMy4wMjEtLjI4MS4wNDZ2LS4wMDJ6TTEyIDMuNTUxUzkuMDU1IDEuODI4IDYuNzU1IDEuNzQ2Yy0uOTAzLS4wMzMtMS40NTQuMjk1LTEuNTIxLjMzOUM3LjM3OS42NDYgOS42NTkgMCAxMS45ODQgMEgxMmMyLjMzNCAwIDQuNjA1LjY0NiA2Ljc2NiAyLjA4NS0uMDY4LS4wNDYtLjYxNS0uMzcyLTEuNTItLjMzOUMxNC45NDYgMS44MjggMTIgMy41NDUgMTIgMy41NDV2LjAwNnoiLz48L3N2Zz4%3D)](https://apps.microsoft.com/detail/9plb327dd51d)
[![BuyMeACoffee](https://raw.githubusercontent.com/pachadotdev/buymeacoffee-badges/main/bmc-yellow.svg)](https://www.buymeacoffee.com/moonfin) 
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&logoColor=white)](https://discord.gg/moonfin)

> **[Back to main Moonfin project](https://github.com/Moonfin-Client)**

## What is Moonfin for Smart TVs?

Moonfin is a Jellyfin, Emby, Plex and Silo client for Samsung Smart TVs (Tizen), LG Smart TVs (webOS), Fire TV sticks running Vega OS and Xbox consoles. One shared codebase powers every platform, with a video pipeline tuned for each, so you get hardware-accelerated playback, a UI designed around a remote instead of a mouse, and features that most TV clients leave out.

## Features

- **Hardware-accelerated playback** through Samsung AVPlay, webOS Starfish, the Fire TV WebView and the Xbox console's own player, with direct play first and a transcode fallback only when needed.
- **Lossless audio passthrough** for DTS, DTS-HD, and Dolby TrueHD to a capable receiver on LG and Samsung TVs. On Xbox, an experimental Passthrough setting does the same for TrueHD, DTS and Dolby Digital. Without it, the console decodes the sound and sends it to the receiver as PCM.
- **Multi-server, Emby and Plex support**, including Emby Connect, Plex sign-in through plex.tv with Plex Home users and Live TV, Quick Connect with a QR code for your phone, and a unified library view across all your Jellyfin servers.
- **Silo support**, through Silo's own API: the household's profiles with their PINs, signing in with a code approved on another device, Silo's playback plans, markers and seek previews, Silo's own home sections, requests and calendar, and Watch Party for watching together. See [Connecting to Silo](#connecting-to-silo).
- **A setup wizard on first run** that walks you through the look of the app with live previews built from your own artwork, including five detail screen styles: Classic, Modern, Spotlight, Nouveau, and Minimalist.
- **Kids Mode and Blocked Ratings.** Kids Mode strips the app back for a child and locks the way out with a PIN, and blocked ratings apply everywhere, from home rows and search to detail screens and playback. Sign-in PINs can be kept on the server through the Moonfin plugin, so one PIN works on every device.
- **A proper on-screen keyboard** in four styles with layouts that follow your language, plus sign-in that finds servers on your network by itself.
- **Native Seerr integration** for browsing, discovering, and requesting content in HD or 4K from your TV, with requests, issue reporting, and a watchlist button built into the detail screen.
- **Retro games** played right on the TV from a server game library or your own RomM account, with save states and battery saves synced through the server. Needs webOS 5 or Tizen 5 and newer. See [Retro Games](https://github.com/Moonfin-Client/Plugin/wiki/Retro-Games).
- **Live TV and DVR** with a program guide that opens on your last channel, a quick channel changer, rewind and Jump to Live during live playback, and recording right from the player.
- **Advanced subtitles**, including PGS image subtitles, styled ASS/SSA through libass, dual subtitles, and in-app subtitle downloads in up to five languages at once.
- **Music, books and comics**, with a music player that keeps playing while you browse, a paginated EPUB reader that syncs your place with jellyfin-web, and CBZ and CBT comics, plus CBR, CB7 and PDF on newer TVs, each library with a choice of styles.
- **SyncPlay and remote control**, for watching together in sync with others and for driving the TV from other Jellyfin apps, including typing a search from your phone. On Silo, Watch Party takes SyncPlay's place, so you can start a room on the TV or join one with its code.
- **Themes** with four built-in looks including Glass and 8-bit Hero, a Theme Store for community themes, custom themes, and accent color customization. Loading animations and the screensaver's backdrop, clock or logo are yours to customize with a live preview, and screens show skeleton placeholders while they load.
- **A featured media bar** with six layouts, including the rounded Aya hero.
- **Personal ratings** as a like, stars, or a score out of ten, usable as a library filter.
- **Achievement Badges** on Jellyfin servers that run the Achievement Badges plugin, and **anime markers** like Filler, Manga Canon, and Subbed/Dubbed on cards and detail screens from the Moonbase plugin.
- **Automatic performance tuning** that matches visual effects to how capable your TV is, with a manual override.
- **Wide device support**, from Samsung 2016 sets (Tizen 2.4) and LG webOS 3.0 through the latest models, including Let's Encrypt support on older webOS models whose built-in certificate stores are out of date.

The full list is on the [Features](https://github.com/Moonfin-Client/Smart-TV/wiki/Features) wiki page.

## Screenshots

<p align="center">
  <img src="images/1-home.png" width="100%" alt="Home screen with the featured media bar" />
</p>
<p align="center">
  <img src="images/2-playback.png" width="49%" alt="Player with trickplay thumbnails and the subtitle menu" />
  <img src="images/5-livetv.png" width="49%" alt="Live TV guide, channel changer and player" />
</p>
<p align="center">
  <img src="images/3-details.png" width="49%" alt="The five detail screen styles" />
  <img src="images/4-mediabars.png" width="49%" alt="The six media bar styles" />
</p>
<p align="center">
  <img src="images/8-home-rows.png" width="49%" alt="Modern and Classic home rows" />
  <img src="images/6-navigation.png" width="49%" alt="Top and Sidebar navigation" />
</p>
<p align="center">
  <img src="images/7-books-games.png" width="49%" alt="Books library and retro game library" />
  <img src="images/9-music.png" width="49%" alt="Music player with synced lyrics" />
</p>

**Disclaimer:** Screenshots shown in this documentation feature media content, artwork, and actor likenesses for demonstration purposes only. None of the media, studios, actors, or other content depicted are affiliated with, sponsored by, or endorsing the Moonfin client or the Jellyfin project. All rights to the portrayed content belong to their respective copyright holders. These screenshots are used solely to demonstrate the functionality and interface of the application.

## Installation

Fire TV sticks running Vega OS can get Moonfin from the [Amazon Appstore](https://www.amazon.com/Moonfin/dp/B0H76BG3DW), and Xbox consoles from the [Microsoft Store](https://apps.microsoft.com/detail/9plb327dd51d). Samsung and LG don't carry it in their TV app stores (yet), so there it's installed by sideloading. On LG the closest thing to a store is the **Homebrew Channel**, which lists Moonfin and updates it like any other app, no root needed. Everyone else downloads a package from the [Releases page](https://github.com/Moonfin-Client/Smart-TV/releases) and picks the file that matches the TV:

| Platform | File | Supported Devices |
|---|---|---|
| **Tizen Regular** | `Moonfin_Tizen_Regular_v*.wgt` | Samsung Smart TVs (2017+, square icon) |
| **Tizen Oblong** | `Moonfin_Tizen_Oblong_v*.wgt` | Samsung Smart TVs (2017+, oblong icon) |
| **Tizen Legacy** | `Moonfin_Tizen_Legacy_v*.wgt` | Samsung Smart TVs (2016, Tizen 2.4) |
| **webOS** | `Moonfin_webOS_v*.ipk` | LG Smart TVs (2016+, webOS 3.0+) |
| **Vega** | `Moonfin_Vega_v*.vpkg` | Fire TV sticks on Vega OS (Fire TV Stick 4K Select and newer) |

The easiest route on each brand:

- **LG:** the Homebrew Channel if your TV has it. Otherwise LG's Developer Mode app plus [Dev Manager Desktop](https://github.com/webosbrew/dev-manager-desktop), a free desktop program that installs the `.ipk` in a few clicks. The webOS CLI (`ares-install`) works too.
- **Samsung:** the [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) tool, which signs and installs the `.wgt` for you.
- **Fire TV (Vega OS):** the [Amazon Appstore](https://www.amazon.com/Moonfin/dp/B0H76BG3DW). The `.vpkg` from the Releases page can still be sideloaded with Developer Mode on the stick and the Vega SDK's `vega device install-app` on a computer.
- **Xbox:** the [Microsoft Store](https://apps.microsoft.com/detail/9plb327dd51d). The `.zip` from the Releases page can still be sideloaded on a console in Developer Mode through the Xbox Device Portal.
  - The console draws every app's interface at 1080p and scales it up to the TV, so on a 4K set the text and posters look a little softer than the TV's own apps. That is how Xbox runs apps, Plex and Jellyfin look the same, and video is not affected: it goes through the console's own player at 4K and in HDR.

Step-by-step instructions for all of them, including turning on Developer Mode, are on the [Installation and Sideloading](https://github.com/Moonfin-Client/Smart-TV/wiki/Installation-and-Sideloading) page. Once installed, [Getting Started](https://github.com/Moonfin-Client/Smart-TV/wiki/Getting-Started) walks through connecting to your server.

Seerr is optional and connects through the [Moonfin server plugin](https://github.com/Moonfin-Client/Plugin) rather than directly, so nothing needs to be entered on the TV. See [Seerr Setup](https://github.com/Moonfin-Client/Smart-TV/wiki/Seerr-Setup).

### Connecting to Silo

Moonfin talks to [Silo](https://github.com/Silo-Server/silo-server) through its native API (`/api/v2`), not its Jellyfin-compatible service. Add the server by its native address, which is usually port 8090 with Silo's Docker setup (8080 otherwise), not the Jellyfin-compatible one on port 8096. Silo servers on your local network also show up during sign-in.

Requests use Silo's own requests feature in place of Seerr, and Watch Together uses Silo's Watch Party in place of SyncPlay. Settings sync, admin defaults and custom themes need the [Moonbase plugin](https://github.com/Moonfin-Client/Plugin) installed in Silo.

Silo has no Live TV, music or retro games, and it doesn't take remote control from other apps or client log uploads, so those aren't available while a Silo server is active. If a Silo server has a newer API than your version of Moonfin, Moonfin won't connect to it and asks you to update Moonfin.

## Documentation

The deeper reference material lives in the [Wiki](https://github.com/Moonfin-Client/Smart-TV/wiki):

| Page | What it covers |
|------|----------------|
| [Features](https://github.com/Moonfin-Client/Smart-TV/wiki/Features) | The full feature list, section by section |
| [Playback and Codecs](https://github.com/Moonfin-Client/Smart-TV/wiki/Playback-and-Codecs) | Video pipelines, direct play and fallback, audio passthrough, and subtitles |
| [Installation and Sideloading](https://github.com/Moonfin-Client/Smart-TV/wiki/Installation-and-Sideloading) | Which release file to pick, and how to sideload on Samsung and LG |
| [Getting Started](https://github.com/Moonfin-Client/Smart-TV/wiki/Getting-Started) | Connecting to your server, Quick Connect, the setup wizard, and the settings worth a look on day one |
| [User Guide](https://github.com/Moonfin-Client/Smart-TV/wiki/User-Guide) | The remote inside the player, typing on a TV, themes, home rows, and parental controls |
| [Common Problems](https://github.com/Moonfin-Client/Smart-TV/wiki/Common-Problems) | Plain fixes for connection, login, install, playback, sound and subtitle trouble |
| [Seerr Setup](https://github.com/Moonfin-Client/Smart-TV/wiki/Seerr-Setup) | Connecting Seerr through the Moonfin server plugin |
| [Building from Source](https://github.com/Moonfin-Client/Smart-TV/wiki/Building-from-Source) | Build scripts, the three Tizen variants, and dev servers |
| [Development](https://github.com/Moonfin-Client/Smart-TV/wiki/Development) | Project structure, platform abstraction, and developer notes |
| [Collecting Logs](https://github.com/Moonfin-Client/Smart-TV/wiki/Collecting-Logs) | Diagnostic logging and what to attach to an issue |

## Building

```bash
npm install
npm run build:tizen:all   # Samsung: Regular, Oblong, and Legacy
npm run build:webos       # LG
npm run build:xbox        # Xbox, on Windows with the Visual Studio Build Tools
```

A current Node.js LTS release (20 or newer) with npm is the only prerequisite.

<details>
<summary><b>Advanced:</b> where the build CLIs live</summary>

`npm install` also sets up the build CLIs in the git-ignored `tools/` directory, which keeps them out of the lockfile on purpose. See `tools/package.json` for the reasoning. Full details, including the individual variant builds and the dev servers, are on [Building from Source](https://github.com/Moonfin-Client/Smart-TV/wiki/Building-from-Source).

</details>

## Contributing

Contributions are welcome. Check the existing issues first, open an issue before starting a large change, match the existing code style, and test on real Samsung or LG hardware where you can. See [Development](https://github.com/Moonfin-Client/Smart-TV/wiki/Development) for how the codebase is laid out and how platform-specific code is kept isolated.

To submit a change, fork the repo, create a feature branch, make your changes with clear commit messages, and open a pull request with a clear description.

## Help translate Moonfin [here](https://translate.moonfin.io/projects/moonfin/smart-tv/)

<a href="https://translate.moonfin.io/projects/moonfin/smart-tv/">
  <img
    src="https://translate.moonfin.io/widget/moonfin/smart-tv/multi-auto.svg"
    alt="Moonfin SmartTV translation status by language"
  />
</a>

## Support and Community

- **Issues** for bugs and feature requests: [GitHub Issues](https://github.com/Moonfin-Client/Smart-TV/issues)
- **Discussions** for questions and ideas: [GitHub Discussions](https://github.com/Moonfin-Client/Smart-TV/discussions)
- **Jellyfin** for server-related questions: [jellyfin.org](https://jellyfin.org)
- **Silo** for Silo server questions: [Silo on GitHub](https://github.com/Silo-Server/silo-server)

## Credits

Moonfin is built on the work of others:

- **[Jellyfin Project](https://jellyfin.org)** for the media server
- **[Enact](https://enactjs.com)** for the React-based framework for TV apps
- **Jellyfin Tizen and webOS Contributors** for the original clients
- **Moonfin Contributors** for everything they have added to the project

## License

This project is licensed under the MPL 2.0 license. Some parts incorporate content licensed under the Apache 2.0 license. All images are taken from and licensed under the same license as https://github.com/jellyfin/jellyfin-ux. See the [LICENSE](LICENSE) file for details.

---
<p align="center">
   <strong>Moonfin for Smart TVs</strong> is an independent client and is not affiliated with the Jellyfin, Emby or Silo projects or with Plex.<br>
   <a href="https://github.com/Moonfin-Client">Back to main Moonfin project</a>
</p>
