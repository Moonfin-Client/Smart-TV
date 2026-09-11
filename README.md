<h1 align="center">Moonfin for Smart-TVs</h1>
<h3 align="center">Premium Jellyfin and Emby client for webOS and Tizen TVs</h3>

---

<p align="center">
   <img width="1920" height="1080" alt="splash-background" src="https://github.com/Moonfin-Client/.github/blob/main/logo.png" />
</p>

[![License](https://img.shields.io/github/license/Moonfin-Client/Smart-TV.svg)](https://github.com/Moonfin-Client/Smart-TV)
[![Release](https://img.shields.io/github/release/Moonfin-Client/Smart-TV.svg)](https://github.com/Moonfin-Client/Smart-TV/releases)
[![github](https://img.shields.io/github/downloads/Moonfin-Client/Smart-TV/total?logo=github&label=Downloads)](https://github.com/Moonfin-Client/Smart-TV/releases)
[![BuyMeACoffee](https://raw.githubusercontent.com/pachadotdev/buymeacoffee-badges/main/bmc-yellow.svg)](https://www.buymeacoffee.com/moonfin) 
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&logoColor=white)](https://discord.gg/moonfin)

> **[Back to main Moonfin project](https://github.com/Moonfin-Client)**

## What is Moonfin for Smart TVs?

Moonfin is a Jellyfin and Emby client for Samsung Smart TVs (Tizen) and LG Smart TVs (webOS). One shared codebase powers both platforms, with a native video pipeline tuned for each, so you get hardware-accelerated playback, a UI designed around a remote instead of a mouse, and features that most TV clients leave out.

## Features

- **Hardware-accelerated playback** through Samsung AVPlay and webOS Starfish, with direct play first and a transcode fallback only when needed.
- **Lossless audio passthrough** for DTS, DTS-HD, and Dolby TrueHD to a capable receiver.
- **Multi-server and Emby support**, including Emby Connect, Quick Connect, and a unified library view across all your Jellyfin servers.
- **A setup wizard on first run** that walks you through the look of the app with live previews built from your own artwork.
- **A proper on-screen keyboard** with layouts that follow your language, plus sign-in that finds servers on your network by itself.
- **Native Seerr integration** for browsing, discovering, and requesting content in HD or 4K from your TV, with requests, issue reporting, and a watchlist button built into the detail screen.
- **Retro games** played right on the TV from a server game library, with save states synced through the server. Needs webOS 5 or Tizen 5 and newer. See [Retro Games](https://github.com/Moonfin-Client/Plugin/wiki/Retro-Games).
- **Live TV and DVR** with a full program guide and recording management.
- **Advanced subtitles**, including PGS image subtitles and styled ASS/SSA through libass, plus in-app subtitle downloads.
- **SyncPlay** for watching together in sync with others.
- **Themes** with four built-in looks including Glass and 8-Bit Hero, a Theme Store for community themes, custom themes, and accent color customization.
- **A featured media bar** with six layouts, including the rounded Aya hero.
- **Personal ratings** as a like, stars, or a score out of ten, usable as a library filter.
- **Automatic performance tuning** that matches visual effects to how capable your TV is, with a manual override.
- **Wide device support**, from Samsung 2016 sets (Tizen 2.4) and LG webOS 3.0 through the latest models, including Let's Encrypt support on older webOS models whose built-in certificate stores are out of date.

The full list is on the [Features](https://github.com/Moonfin-Client/Smart-TV/wiki/Features) wiki page.

## Screenshots

<img width="1950" height="1060" alt="Home screen" src="https://github.com/user-attachments/assets/660712d2-1893-4c71-afff-5ddc9aa674e0" />
<img width="1950" height="1060" alt="Details screen" src="https://github.com/user-attachments/assets/11f74fad-fd72-43c4-9c6d-7f23c9672751" />
<img width="1950" height="1060" alt="Seerr discovery" src="https://github.com/user-attachments/assets/27eef61b-3295-4949-a34f-58b6166e6e94" />

More in the [Screenshots](https://github.com/Moonfin-Client/Smart-TV/wiki/Screenshots) gallery.

**Disclaimer:** Screenshots shown in this documentation feature media content, artwork, and actor likenesses for demonstration purposes only. None of the media, studios, actors, or other content depicted are affiliated with, sponsored by, or endorsing the Moonfin client or the Jellyfin project. All rights to the portrayed content belong to their respective copyright holders. These screenshots are used solely to demonstrate the functionality and interface of the application.

## Installation

Samsung and LG don't carry Moonfin in their TV app stores, so it's installed by sideloading. On LG the closest thing to a store is the **Homebrew Channel**, which lists Moonfin and updates it like any other app, no root needed. Everyone else downloads a package from the [Releases page](https://github.com/Moonfin-Client/Smart-TV/releases) and picks the file that matches the TV:

| Platform | File | Supported Devices |
|---|---|---|
| **Tizen Regular** | `Moonfin_Tizen_Regular_*.wgt` | Samsung Smart TVs (2017+, square icon) |
| **Tizen Oblong** | `Moonfin_Tizen_Oblong_*.wgt` | Samsung Smart TVs (2017+, oblong icon) |
| **Tizen Legacy** | `Moonfin_Tizen_Legacy_*.wgt` | Samsung Smart TVs (2016, Tizen 2.4) |
| **webOS** | `Moonfin_webOS_*.ipk` | LG Smart TVs (2016+, webOS 3.0+) |

The easiest route on each brand:

- **LG:** the Homebrew Channel if your TV has it. Otherwise LG's Developer Mode app plus [Dev Manager Desktop](https://github.com/webosbrew/dev-manager-desktop), a free desktop program that installs the `.ipk` in a few clicks. The webOS CLI (`ares-install`) works too.
- **Samsung:** the [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) tool, which signs and installs the `.wgt` for you.

Step-by-step instructions for all of them, including turning on Developer Mode, are on the [Installation and Sideloading](https://github.com/Moonfin-Client/Smart-TV/wiki/Installation-and-Sideloading) page. Once installed, [Getting Started](https://github.com/Moonfin-Client/Smart-TV/wiki/Getting-Started) walks through connecting to your server.

Seerr is optional and connects through the [Moonfin server plugin](https://github.com/Moonfin-Client/Plugin) rather than directly, so nothing needs to be entered on the TV. See [Seerr Setup](https://github.com/Moonfin-Client/Smart-TV/wiki/Seerr-Setup).

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
```

A current Node.js LTS release (20 or newer) with npm is the only prerequisite.

<details>
<summary><b>Advanced:</b> where the build CLIs live</summary>

`npm install` also sets up the build CLIs in the git-ignored `tools/` directory, which keeps them out of the lockfile on purpose. See `tools/package.json` for the reasoning. Full details, including the individual variant builds and the dev servers, are on [Building from Source](https://github.com/Moonfin-Client/Smart-TV/wiki/Building-from-Source).

</details>

## Contributing

Contributions are welcome. Check the existing issues first, open an issue before starting a large change, match the existing code style, and test on real Samsung or LG hardware where you can. See [Development](https://github.com/Moonfin-Client/Smart-TV/wiki/Development) for how the codebase is laid out and how platform-specific code is kept isolated.

To submit a change, fork the repo, create a feature branch, make your changes with clear commit messages, and open a pull request with a clear description.

## Help translate Moonfin [here](https://translate.moonfin.io/engage/smart-tv/)

<a href="https://translate.moonfin.io/engage/smart-tv/">
  <img
    src="https://translate.moonfin.io/widgets/smart-tv/-/multi-auto.svg"
    alt="Moonfin SmartTV translation status by language"
  />
</a>

## Support and Community

- **Issues** for bugs and feature requests: [GitHub Issues](https://github.com/Moonfin-Client/Smart-TV/issues)
- **Discussions** for questions and ideas: [GitHub Discussions](https://github.com/Moonfin-Client/Smart-TV/discussions)
- **Jellyfin** for server-related questions: [jellyfin.org](https://jellyfin.org)

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
   <strong>Moonfin for Smart TVs</strong> is an independent client and is not affiliated with the Jellyfin or Emby projects.<br>
   <a href="https://github.com/Moonfin-Client">Back to main Moonfin project</a>
</p>
