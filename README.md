<h1 align="center">Moonfin for Smart-TVs</h1>
<h3 align="center">Premium Jellyfin and Emby client for webOS and Tizen TVs</h3>

---

<p align="center">
  <img alt="Moonfin" src="packages/app/resources/splash.png" />
</p>

[![License](https://img.shields.io/github/license/Moonfin-Client/Smart-TV.svg)](https://github.com/Moonfin-Client/Smart-TV)
[![Release](https://img.shields.io/github/release/Moonfin-Client/Smart-TV.svg)](https://github.com/Moonfin-Client/Smart-TV/releases)
[![github](https://img.shields.io/github/downloads/Moonfin-Client/Smart-TV/total?logo=github&label=Downloads)](https://github.com/Moonfin-Client/Smart-TV/releases)

<p align="center">
  <a href="https://www.buymeacoffee.com/moonfin" target="_blank"><img src="https://github.com/user-attachments/assets/fe26eaec-147f-496f-8e95-4ebe19f57131" alt="Buy Me A Coffee" ></a>
</p>

> **[Back to main Moonfin project](https://github.com/Moonfin-Client)**

Moonfin is a premium Jellyfin and Emby client built with the **Enact/Sandstone framework**, optimized for Samsung Smart TVs (Tizen) and LG Smart TVs (webOS). A single shared codebase powers both platforms with native video pipelines tuned for each.


<p align="center">
  <a href="#features--enhancements"><b>Features</b></a> &nbsp;|&nbsp;
  <a href="#screenshots"><b>Screenshots</b></a> &nbsp;|&nbsp;
  <a href="#installation"><b>Installation</b></a> &nbsp;|&nbsp;
  <a href="#building-from-source"><b>Building</b></a> &nbsp;|&nbsp;
  <a href="#development"><b>Development</b></a> &nbsp;|&nbsp;
  <a href="#contributing"><b>Contributing</b></a> &nbsp;|&nbsp;
  <a href="#support--community"><b>Support</b></a> &nbsp;|&nbsp;
  <a href="#license"><b>License</b></a>
</p>


## Features & Enhancements

Moonfin builds on the solid foundation of Jellyfin with targeted improvements for the TV viewing experience.

### Hardware-Accelerated Video Playback
- **Samsung AVPlay** (Tizen) and **Starfish/HTML5** (webOS) native video pipelines
- Smooth playback with proper hardware decoding for H.264, HEVC, HDR10, HLG, and Dolby Vision (where supported)
- Automatic DirectPlay to native transcode to hls.js fallback chain when a format isn't natively supported
- **Accurate per-TV codec profiles**: Your device reports exactly what it can play, so more content direct plays instead of burning server CPU on transcodes
- **Lossless audio passthrough**: DTS, DTS-HD, and Dolby TrueHD bitstreaming to a capable receiver, rechecked live when you switch audio outputs (experimental on webOS)
- **Wide device support**: Runs on Samsung TVs going back to 2016 (Tizen 2.4) through the latest models, and LG webOS 3 and up
- Enhanced player controls optimized for TV remote navigation

### Multi-Server & Unified Library Mode
- **Emby server support**: Sign in to Emby servers through Emby Connect, not just Jellyfin
- **Unified Library Mode**: Combine content from all connected Jellyfin servers into a single view
- Browse, search, and play content across multiple servers seamlessly
- Server badges show content origin when unified mode is enabled
- Cross-server playback with proper progress tracking per server
- Favorites, genres, and search aggregate results from all servers
- **Quick Connect and fast user switching** from your avatar, with auto-login and last-server memory

### Jellyseerr Integration

Moonfin is the first smart TV client with native Jellyseerr support.

- Browse trending, popular, and recommended movies/shows and filter by genres, studio, network, and keywords
- Add Seerr discover rows (Trending, Popular, Upcoming, My Requests, and more) directly to your home screen
- Request content in HD or 4K directly from your TV
- **NSFW Content Filtering** (optional) using Jellyseerr/TMDB metadata
- Smart season selection when requesting TV shows
- View all your pending, approved, and available requests
- Authenticate using your API key (required for TV webview compatibility)
- Global search includes Jellyseerr results
- Rich backdrop images for a cinematic discovery experience

### Enhanced Navigation
- Quick access home button and search functionality
- Shuffle button for instant random movie/TV show discovery
- Genres menu to browse all media by genre in one place
- Dynamic library buttons automatically populate based on your Jellyfin libraries
- One-click navigation to any library or collection directly from the navbar
- Cleaner icon-based design for frequently used actions
- Folder view with breadcrumb navigation for browsing nested library folders
- Built-in photo and comic viewer for your image and comic libraries
- **Samsung Smart Hub Preview**: Jump straight into your content from deep-linked cards on the TV's home screen

### Playback & Media Control
- **Theme Music Playback**: Background theme music for TV shows and movies with volume control
- **Pre-Playback Track Selection**: Choose your preferred audio track and subtitle before playback starts
- **Next Episode Countdown**: Skip button with countdown timer when next episode is available
- **Trickplay Preview**: Thumbnail previews when scrubbing through video
- **Media Segment Skipping**: Skip intros, credits, and other segments automatically
- **Remote Media Keys**: Play, pause, fast-forward, rewind, and stop using your TV remote's media buttons
- **SyncPlay (Watch Together)**: Synchronized "watch together" playback using Jellyfin's SyncPlay protocol
- **Advanced Subtitle Rendering**: Client-side PGS image subtitles and styled ASS/SSA subtitles via libass, with embedded font support
- **Subtitle Downloads**: Search for and download subtitles without leaving the app
- **In-App Trailers**: Play trailers right inside Moonfin
- **Music Libraries with Lyrics**: Browse albums, artists, and playlists with synced lyrics
- **OLED Burn-In Protection**: A screensaver kicks in during paused or idle playback to protect OLED panels

### Live TV & Recordings
- **Electronic Program Guide (EPG)**: Browse live TV channels with program information in a much simpler interface
- **DVR Recordings**: Access and play back recorded content with a simple button press

### Improved Details Screen
- Metadata organized into clear sections: genres, directors, writers, studios, and runtime
- Taglines displayed above the description where available
- Cast photos appear as circles for a cleaner look
- Fits more useful information on screen without feeling cramped
- **Playlist Management**: Add any item to an existing playlist or create a new one directly from the details screen; reorder items with the left/right keys and remove them with Delete
- **Chapters, Collections & Media Versions**: Jump straight to chapters, see which collections a title belongs to, and pick between multiple versions of the same media
- **Extras & Special Features**: Behind-the-scenes clips, trailers, and other extras when the server has them
- **Ratings**: Rotten Tomatoes and community ratings shown across Browse, Details, the media bar, and libraries

### UI Polish
- **Built with Enact/Sandstone**: Modern React-based framework optimized for TV experiences
- **Themes**: A full theme system with built-in themes, a Theme Store for installing community themes, a custom theme menu, and per-device persistence
- **Accent Color Customization**: Personalize the UI with your preferred accent color
- **Watched and favorite badges**: See watched status and favorites at a glance right on the cards
- **Backdrop Blur Settings**: Customizable blur effects for home and details pages
- **UI Scale**: Adjust the interface font size to suit your TV size and viewing distance
- **Media Bar Styles**: Pick from 5 different media bars (Moonfin, MakD, Gallery, Banner, and Bookshelf) to showcase featured content on the home screen, each with auto-advance and smooth transitions
- Item details show up right in the row, no need to open every title to see what it is
- Buttons look better when not focused (transparent instead of distracting)
- Better contrast makes text easier to read
- Transitions and animations feel responsive
- Consistent icons and visual elements throughout

### Performance
- **Automatic Performance Tuning**: Detects how capable your TV is and dials the heaviest visual effects up or down to match, so older sets stay responsive while newer ones keep the full look
- **Performance Mode**: Choose between Auto, High Quality, Balanced, and Performance to control the tradeoff yourself
- **Lighter visuals on weaker hardware**: Background blur is reduced or disabled where it would otherwise slow things dow

---

## Screenshots
<img width="1950" height="1060" alt="Screenshot from 2026-03-17 21-55-13" src="https://github.com/user-attachments/assets/660712d2-1893-4c71-afff-5ddc9aa674e0" />
<img width="1950" height="1060" alt="Screenshot from 2026-03-17 21-54-44" src="https://github.com/user-attachments/assets/96438891-3fbd-4e42-80da-4f60b7025165" />
<img width="1950" height="1060" alt="Screenshot from 2026-03-17 21-55-35" src="https://github.com/user-attachments/assets/862923bd-9669-4642-a291-111259ec17a6" />
<img width="1950" height="1060" alt="Screenshot from 2026-03-17 21-56-07" src="https://github.com/user-attachments/assets/11f74fad-fd72-43c4-9c6d-7f23c9672751" />
<img width="1950" height="1060" alt="Screenshot from 2026-03-17 21-56-26" src="https://github.com/user-attachments/assets/c8dc62ba-354b-4ad9-9bf3-5b603d621352" />
<img width="1950" height="1060" alt="Screenshot from 2026-03-17 21-56-36" src="https://github.com/user-attachments/assets/27eef61b-3295-4949-a34f-58b6166e6e94" />
<img width="1950" height="1060" alt="Screenshot from 2026-03-17 22-12-48" src="https://github.com/user-attachments/assets/3726383f-4f86-4943-9227-d0b566e91121" />

---

**Disclaimer:** Screenshots shown in this documentation feature media content, artwork, and actor likenesses for demonstration purposes only. None of the media, studios, actors, or other content depicted are affiliated with, sponsored by, or endorsing the Moonfin client or the Jellyfin project. All rights to the portrayed content belong to their respective copyright holders. These screenshots are used solely to demonstrate the functionality and interface of the application.

---

## Installation

### Pre-built Releases

Download the latest release from the [Releases page](https://github.com/Moonfin-Client/Smart-TV/releases).

| Platform | File | Supported Devices |
|---|---|---|
| **Tizen Regular** | `Moonfin_Tizen_Regular_*.wgt` | Samsung Smart TVs (2017+, square icon) |
| **Tizen Oblong** | `Moonfin_Tizen_Oblong_*.wgt` | Samsung Smart TVs (2017+, oblong icon) |
| **Tizen Legacy** | `Moonfin_Tizen_Legacy_*.wgt` | Samsung Smart TVs (2016, Tizen 2.4) |
| **webOS** | `Moonfin_webOS_*.ipk` | LG Smart TVs (2016+, webOS 3.0+) |

### Sideloading: Samsung (Tizen)

The easiest way to install on Samsung TVs is using the **Jellyfin 2 Samsung** tool:

1. Download [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) by [@PatrickSt1991](https://github.com/PatrickSt1991)
2. Enable Developer Mode on your Samsung TV:
   - Go to **Settings > General > System Manager > Developer Mode**
   - Turn Developer Mode **ON**
   - Enter your PC's IP address
   - Restart the TV
3. Run the tool, select the Moonfin `.wgt` file, enter your TV's IP address, and install

### Sideloading: LG (webOS)

1. Enable Developer Mode on your LG TV via the [LG Developer portal](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)
2. Install the webOS CLI tools (`@webos-tools/cli`)
3. Set up your TV as a device: `ares-setup-device`
4. Install the IPK: `ares-install --device <your-tv> moonfin.ipk`

### Seerr Setup (Optional)

Seerr integration uses the **Moonfin Jellyfin Plugin** to proxy requests through your Jellyfin server, avoiding CORS and cookie issues on TV webviews.

1. Install the [Moonfin Plugin](https://github.com/Moonfin-Client/Plugin) on your Jellyfin server
2. Configure the plugin with your Seerr server URL and API key in the Jellyfin admin dashboard
3. In Moonfin on your TV, go to **Settings > Plugin** and enable the integration. No additional URL or key entry is needed on the TV side, it connects through your Jellyfin server automatically

> **Note:** The plugin acts as a server-side proxy, so your TV only needs to reach your Jellyfin server. Seerr does not need to be directly accessible from the TV.
---

## Building from Source

### Prerequisites
- Node.js 18+ and npm 9+

### Quick Start

```bash
# Install dependencies
npm install

# Build for Samsung: all variants (Regular, Oblong, Legacy) in one command
npm run build:tizen:all

# Build for Samsung: individual variants
npm run build:tizen         # Regular
npm run build:tizen:oblong  # Oblong (512x423 launcher icon)
npm run build:tizen:legacy  # Legacy (Tizen 2.4, no Smart Hub Preview)

# Build for LG (creates .ipk)
npm run build:webos

# Development server (Tizen mode)
npm run dev:tizen

# Development server (webOS mode)
npm run dev:webos
```

Build outputs:
- Tizen: `Moonfin_Tizen_<Regular|Oblong|Legacy>_<version>.wgt` in the project root
- webOS: `Moonfin_webOS_<version>.ipk` in the project root

---

## Development

This project uses **npm workspaces** and **Enact** to share a single React codebase across both platforms while keeping platform-specific code isolated.

### Project Structure

```
moonfin/
├── packages/
│   ├── app/                  # Shared application code
│   │   └── src/
│   │       ├── App/          # Main application component
│   │       ├── components/   # Reusable UI components
│   │       ├── context/      # React context providers
│   │       ├── hooks/        # Custom React hooks
│   │       ├── services/     # API and service modules
│   │       ├── views/        # Page components
│   │       ├── utils/        # Helpers and key handling
│   │       └── styles/       # Global styles and variables
│   ├── platform-tizen/       # Samsung AVPlay, Smart Hub, Tizen storage
│   ├── platform-webos/       # Starfish/HTML5 video, Luna storage
│   ├── build-tizen/          # Tizen build scripts -> .wgt
│   └── build-webos/          # webOS build scripts -> .ipk
├── package.json              # npm workspaces root
└── .eslintrc.js              # Shared ESLint config
```

### Platform Abstraction

Shared code in `packages/app/` never imports directly from `@enact/webos`, `tizen.*`, or `webapis.*`. Platform-specific behavior is isolated through runtime detection:

```js
import { isTizen, isWebOS, getPlatform } from './platform';
```

Services like video, storage, and device profiles use `getPlatform()` to dynamically import the correct platform implementation at runtime.

### Developer Notes
- **Enact/Sandstone** provides TV-optimized UI components and Spotlight navigation
- **Tizen**: AVPlay API for video, `tizen.tvinputdevice` for remote keys
- **webOS**: Shared HTML5 video element with `audioTracks` API, Luna service calls for storage
- Packaged apps (`.wgt` / `.ipk`) bypass CORS restrictions
- Cross-origin cookies don't persist in either platform's webview, use API keys instead
- UI changes should be tested on actual TV hardware when possible

---

## Contributing

We welcome contributions to Moonfin!

### Guidelines
1. **Check existing issues**: See if your idea or bug is already reported
2. **Discuss major changes**: Open an issue first for significant features
3. **Follow code style**: Match the existing codebase conventions
4. **Test on TV devices**: Verify changes work on actual hardware when possible

### Pull Request Process
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Test on Samsung and/or LG TV hardware
5. Submit a pull request with a detailed description

## Help translate Moonfin [here](https://translate.moonfin.io/engage/smart-tv/)

<a href="https://translate.moonfin.io/engage/smart-tv/">
  <img
    src="https://translate.moonfin.io/widgets/smart-tv/-/multi-auto.svg"
    alt="Moonfin SmartTV translation status by language"
  />
</a>

---

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/Moonfin-Client/Smart-TV/issues) for bugs and feature requests
- **Discussions**: [GitHub Discussions](https://github.com/Moonfin-Client/Smart-TV/discussions) for questions and ideas
- **Jellyfin**: [jellyfin.org](https://jellyfin.org) for server-related questions

---

## Credits

Moonfin is built upon the excellent work of:

- **[Jellyfin Project](https://jellyfin.org)**: The media server
- **[Enact](https://enactjs.com)**: React-based framework for TV apps
- **Jellyfin Tizen & webOS Contributors**: The original client developers
- **Moonfin Contributors**: Everyone who has contributed to this project

---

## License

This project is licensed under the MPL 2.0 license. Some parts incorporate content licensed under the Apache 2.0 license. All images are taken from and licensed under the same license as https://github.com/jellyfin/jellyfin-ux. See the [LICENSE](LICENSE) file for details.

---
<p align="center">
   <strong>Moonfin for Smart TVs</strong> is an independent client and is not affiliated with the Jellyfin project.<br>
   <a href="https://github.com/Moonfin-Client">Back to main Moonfin project</a>
</p>
