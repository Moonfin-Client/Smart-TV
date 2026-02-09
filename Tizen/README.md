<h1 align="center">Moonfin for Tizen</h1>
<h3 align="center">Enhanced Jellyfin client for Samsung Smart TVs</h3>

---

<p align="center">
  <img alt="Moonfin for Tizen" src="resources/splash.png" />
</p>

[![License](https://img.shields.io/github/license/Moonfin-Client/Tizen.svg)](https://github.com/Moonfin-Client/Tizen)
[![Release](https://img.shields.io/github/release/Moonfin-Client/Tizen.svg)](https://github.com/Moonfin-Client/Tizen/releases)

<a href="https://www.buymeacoffee.com/moonfin" target="_blank"><img src="https://github.com/user-attachments/assets/fe26eaec-147f-496f-8e95-4ebe19f57131" alt="Buy Me A Coffee" ></a>

Moonfin for Tizen is an enhanced Jellyfin Tizen client built with the **Enact/Sandstone framework**, optimized for the viewing experience on Samsung Smart TVs running Tizen.

## Features & Enhancements

Moonfin for Tizen builds on the solid foundation of Jellyfin with targeted improvements for TV viewing:

### Hardware-Accelerated Video Playback
- **Native Samsung AVPlay Pipeline** - Utilizes Samsung's native video playback for optimal performance
- Smooth playback with proper hardware decoding support
- Enhanced player controls optimized for TV remote navigation

### Multi-Server & Unified Library Mode
- **Unified Library Mode** - Combine content from all connected Jellyfin servers into a single view
- Browse, search, and play content across multiple servers seamlessly
- Server badges show content origin when unified mode is enabled
- Cross-server playback with proper progress tracking per server
- Favorites, genres, and search aggregate results from all servers

### Jellyseerr Integration (Beta)

Moonfin is the first Tizen client with native Jellyseerr support.

- Browse trending, popular, and recommended movies/shows and filter content by Series/Movie Genres, Studio, Network, and keywords
- Request content in HD or 4K directly from your Samsung TV
- **NSFW Content Filtering** (optional) using Jellyseerr/TMDB metadata
- Smart season selection when requesting TV shows
- View all your pending, approved, and available requests
- Authenticate using your API key (required for Tizen webview compatibility)
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
- **Built with Enact/Sandstone** - Modern React-based framework optimized for TV experiences
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
Download the latest WGT from the [Releases page](https://github.com/Moonfin-Client/Tizen/releases).

**Supported Devices:**
- Samsung Smart TVs running Tizen 4.0+
- Samsung Tizen TVs (2018 and newer models)

### Jellyseerr Setup (Optional)
To enable media discovery and requesting:

1. Install and configure Jellyseerr on your network ([jellyseerr.dev](https://jellyseerr.dev))
2. In Moonfin, go to **Settings → Jellyseerr**
3. Enter your Jellyseerr server URL (e.g., `http://192.168.1.100:5055`)
4. Enter your Jellyseerr **API Key** (found in Jellyseerr Settings → General)
5. Test the connection, then start discovering!

> **Note:** Tizen apps use API key authentication instead of cookie-based login due to webview restrictions.

### Sideloading Instructions

The easiest way to install Moonfin on your Samsung TV is using the **Jellyfin 2 Samsung** tool:

1. Download [Jellyfin 2 Samsung](https://github.com/PatrickSt1991/Samsung-Jellyfin-Installer) tool by [@PatrickSt1991](https://github.com/PatrickSt1991)
2. Enable Developer Mode on your Samsung TV:
   - Go to **Settings → General → System Manager → Developer Mode**
   - Turn Developer Mode **ON**
   - Enter your PC's IP address
   - Restart the TV
3. Run the Jellyfin 2 Samsung tool and select the Moonfin WGT file
4. Enter your TV's IP address and install!

---

## Building from Source

### Prerequisites
- Node.js 18+ and npm 9+

### Quick Start

```bash
# Install dependencies
npm install

# Development server
npm run serve

# Build for production (creates WGT)
npm run build
```

The build script will create a `Moonfin.wgt` file in the `build/` folder.

### Installing to TV

Use the [Jellyfin 2 Samsung](https://github.com/PatrickSt1991/Samsung-Jellyfin-Installer) tool to install the WGT to your TV. No Tizen Studio or certificates required!

---

## Development

This project is built with **Enact**, a React-based application framework that works excellently on Tizen TVs.

### Project Structure
```
src/
├── App/              # Main application component
├── components/       # Reusable UI components
├── context/          # React context providers
├── hooks/            # Custom React hooks
├── services/         # API and service modules
│   ├── jellyfinApi.js    # Jellyfin API client
│   ├── jellyseerrApi.js  # Jellyseerr API client
│   ├── tizenVideo.js     # Samsung AVPlay wrapper
│   └── storage.js        # LocalStorage wrapper
├── views/            # Page components
└── styles/           # Global styles and variables
```

### Developer Notes
- Uses Enact/Sandstone for TV-optimized UI components
- Spotlight navigation for TV remote control support
- Tizen AVPlay API for hardware-accelerated video playback
- Remote keys registered via `tizen.tvinputdevice` API
- Code style follows Enact conventions
- UI changes should be tested on actual Samsung TV devices when possible

### Tizen-Specific Considerations
- **CORS**: Packaged Tizen apps (`.wgt`) bypass CORS restrictions
- **Cookies**: Cross-origin cookies don't persist in Tizen webviews - use API keys instead
- **Remote Keys**: Must be registered via `tvinputdevice.registerKey()` before use

---

## Contributing

We welcome contributions to Moonfin for Tizen!

### Guidelines
1. **Check existing issues** - See if your idea/bug is already reported
2. **Discuss major changes** - Open an issue first for significant features
3. **Follow code style** - Match the existing codebase conventions
4. **Test on TV devices** - Verify changes work on actual Samsung TV hardware

### Pull Request Process
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Test thoroughly on Samsung TV devices
5. Submit a pull request with a detailed description

---

## Support & Community

- **Issues** - [GitHub Issues](https://github.com/Moonfin-Client/Tizen/issues) for bugs and feature requests
- **Discussions** - [GitHub Discussions](https://github.com/Moonfin-Client/Tizen/discussions) for questions and ideas
- **Jellyfin** - [jellyfin.org](https://jellyfin.org) for server-related questions

---

## Credits

Moonfin for Tizen is built upon the excellent work of:

- **[Jellyfin Project](https://jellyfin.org)** - The media server
- **[Enact](https://enactjs.com)** - React-based framework for TV apps
- **Jellyfin Tizen Contributors** - The original client developers
- **Moonfin Contributors** - Everyone who has contributed to this project

---

## License

This project is licensed under the MPL 2.0 license. Some parts incorporate content licensed under the Apache 2.0 license. All images are taken from and licensed under the same license as https://github.com/jellyfin/jellyfin-ux. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Moonfin for Tizen</strong><br>
  An enhanced Jellyfin client for Samsung Smart TVs
</p>
