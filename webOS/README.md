<h1 align="center">Moonfin for webOS</h1>
<h3 align="center">Enhanced Jellyfin client for LG Smart TVs</h3>

---

<p align="center">
  <img alt="Moonfin for webOS" src="resources/splash.png" />
</p>

[![License](https://img.shields.io/github/license/Moonfin-Client/WebOS.svg)](https://github.com/Moonfin-Client/WebOS)
[![Release](https://img.shields.io/github/release/Moonfin-Client/WebOS.svg)](https://github.com/Moonfin-Client/WebOS/releases)

<a href="https://www.buymeacoffee.com/moonfin" target="_blank"><img src="https://github.com/user-attachments/assets/fe26eaec-147f-496f-8e95-4ebe19f57131" alt="Buy Me A Coffee" ></a>

Moonfin for webOS is an enhanced Jellyfin webOS client built with the **Enact/Sandstone framework**, optimized for the viewing experience on LG Smart TVs running webOS.

## Features & Enhancements

Moonfin for webOS builds on the solid foundation of Jellyfin with targeted improvements for TV viewing:

### Hardware-Accelerated Video Playback
- **Native webOS Media Pipeline** - Utilizes LG's native video playback for optimal performance
- Smooth playback with proper hardware decoding support
- Enhanced player controls optimized for TV remote navigation

### Multi-Server & Unified Library Mode
- **Unified Library Mode** - Combine content from all connected Jellyfin servers into a single view
- Browse, search, and play content across multiple servers seamlessly
- Server badges show content origin when unified mode is enabled
- Cross-server playback with proper progress tracking per server
- Favorites, genres, and search aggregate results from all servers

### Jellyseerr Integration (Beta)

Moonfin is the first webOS client with native Jellyseerr support.

- Browse trending, popular, and recommended movies/shows and filter content by Series/Movie Genres, Studio, Network, and keywords
- Request content in HD or 4K directly from your LG TV
- **NSFW Content Filtering** (optional) using Jellyseerr/TMDB metadata
- Smart season selection when requesting TV shows
- View all your pending, approved, and available requests
- Authenticate using your Jellyfin login (permanent local API key saved)
- Global search includes Jellyseerr results
- Rich backdrop images for a more cinematic discovery experience

### Enhanced Navigation
- Quick access home button and search functionality
- Shuffle button for instant random movie/TV show discovery
- Genres menu to browse all media by genre in one place
- Dynamic library buttons automatically populate based on your Jellyfin libraries
- One-click navigation to any library or collection directly from the navbar
- Cleaner icon-based design for frequently used actions

### Playback & Media Control
- **Theme Music Playback** - Background theme music support for TV shows and movies with volume control
- **Pre-Playback Track Selection** - Choose your preferred audio track and subtitle before playback starts (configurable in settings)
- **Next Episode Countdown** - Skip button shows countdown timer when next episode is available
- **Trickplay Preview** - Thumbnail previews when scrubbing through video

### Live TV & Recordings
- **Electronic Program Guide (EPG)** - Browse live TV channels with program information
- **DVR Recordings** - Access and playback recorded content

### Improved Details Screen
- Metadata organized into clear sections: genres, directors, writers, studios, and runtime
- Taglines displayed above the description where available
- Cast photos appear as circles for a cleaner look
- Fits more useful information on screen without feeling cramped

### UI Polish
- **Built with Enact/Sandstone** - Modern React-based framework designed for webOS TVs
- **Accent Color Customization** - Personalize the UI with your preferred accent color
- **Backdrop Blur Settings** - Customizable blur effects for home and details pages
- Item details show up right in the row, no need to open every title to see what it is
- Buttons look better when not focused (transparent instead of distracting)
- Better contrast makes text easier to read
- Transitions and animations feel responsive
- Consistent icons and visual elements throughout

---

## Installation

### Pre-built Releases
Download the latest IPK from the [Releases page](https://github.com/Moonfin-Client/WebOS/releases).

**Supported Devices:**
- LG Smart TVs running webOS 4.0+
- LG webOS TVs (2016 and newer models)

### Jellyseerr Setup (Optional)
To enable media discovery and requesting:

1. Install and configure Jellyseerr on your network ([jellyseerr.dev](https://jellyseerr.dev))
2. In Moonfin, go to **Settings → Jellyseerr**
3. Enter your Jellyseerr server URL (e.g., `http://192.168.1.100:5055`)
4. Click **Connect with Jellyfin** and enter your Jellyfin password
5. Test the connection, then start discovering!

Your session is saved securely and will reconnect automatically.

### Sideloading Instructions
1. Enable Developer Mode on your LG TV
2. Install the webOS Dev Mode app from the LG Content Store
3. Use the ares-cli tools to install the IPK (see Building from Source section)

---

## Building from Source

### Prerequisites
- Node.js and npm
- webOS SDK (ares-cli tools)

### Quick Start

```bash
# Install dependencies
npm install

# Development server
npm run serve

# Build for production
npm run pack-p

# Package for webOS (creates IPK)
npm run package

# Install to TV
npm run install-tv

# Launch on TV
npm run launch-tv
```

### Managing the ares-tools via npm

The webOS ares-cli tools are included as a dev dependency. After running `npm install`, you can package and deploy the app.

### Testing on TV

Testing on a TV requires [registering a LG developer account](https://webostv.developer.lge.com/develop/app-test/preparing-account/) and [setting up the devmode app](https://webostv.developer.lge.com/develop/app-test/using-devmode-app/).

Once you have installed the devmode app on your target TV and logged in with your LG developer account, you need to turn on the `Dev Mode Status` and `Key Server`.
**Make sure** to take a note of the passphrase.

```bash
# Add your TV
ares-setup-device

# Set up SSH key (Key Server must be running)
ares-novacom --device tv --getkey

# Verify connection
ares-device-info -d tv

# Install the app
ares-install -d tv build/*.ipk

# Launch with inspector
ares-inspect -d tv org.moonfin.webos

# Or just launch
ares-launch -d tv org.moonfin.webos
```

---

## Development

This project is built with **Enact**, LG's React-based application framework for webOS TVs.

### Project Structure
```
src/
├── App/              # Main application component
├── components/       # Reusable UI components
├── context/          # React context providers
├── hooks/            # Custom React hooks
├── services/         # API and service modules
├── views/            # Page components
└── styles/           # Global styles and variables
```

### Developer Notes
- Uses Enact/Sandstone for webOS-optimized UI components
- Spotlight navigation for TV remote control support
- Code style follows Enact conventions
- UI changes should be tested on actual LG TV devices when possible

---

## Contributing

We welcome contributions to Moonfin for webOS!

### Guidelines
1. **Check existing issues** - See if your idea/bug is already reported
2. **Discuss major changes** - Open an issue first for significant features
3. **Follow code style** - Match the existing codebase conventions
4. **Test on TV devices** - Verify changes work on actual LG TV hardware

### Pull Request Process
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Test thoroughly on LG TV devices
5. Submit a pull request with a detailed description

---

## Support & Community

- **Issues** - [GitHub Issues](https://github.com/Moonfin-Client/WebOS/issues) for bugs and feature requests
- **Discussions** - [GitHub Discussions](https://github.com/rMoonfin-Client/WebOS/discussions) for questions and ideas
- **Jellyfin** - [jellyfin.org](https://jellyfin.org) for server-related questions

---

## Credits

Moonfin for webOS is built upon the excellent work of:

- **[Jellyfin Project](https://jellyfin.org)** - The media server
- **[Enact](https://enactjs.com)** - LG's React-based framework for webOS
- **Jellyfin webOS Contributors** - The original client developers
- **Moonfin Contributors** - Everyone who has contributed to this project

---

## License

This project is licensed under the MPL 2.0 license. Some parts incorporate content licensed under the Apache 2.0 license. All images are taken from and licensed under the same license as https://github.com/jellyfin/jellyfin-ux. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Moonfin for webOS</strong><br>
  An enhanced Jellyfin client for LG Smart TVs
</p>
