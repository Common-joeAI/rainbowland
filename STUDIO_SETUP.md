# 🌈 Rainbow Land — Desktop Studio Setup

## Quick Start

### Prerequisites
- Node.js 18+
- **ffmpeg** installed on your system (required for actual streaming)

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
winget install ffmpeg
# or download from https://ffmpeg.org/download.html
```

### Install & Run (Development)

```bash
git clone https://github.com/Common-joeAI/rainbowland
cd rainbowland
npm install
npm run dev:electron
```

### Build Desktop App

```bash
npm run build:electron
# Output → dist-electron/
# Windows: Rainbow Land Setup.exe
# macOS:   Rainbow Land.dmg
# Linux:   Rainbow Land.AppImage
```

---

## Multi-Streaming Setup

Open the **Studio** tab → expand **Destinations** → enable platforms → paste stream keys.

Keys are saved using Electron's `safeStorage` (encrypted by your OS keychain).

| Platform     | Where to get your key |
|-------------|----------------------|
| 🌈 Rainbow Land | Auto-generated when you go live |
| 🎵 TikTok   | [TikTok Live Studio](https://www.tiktok.com/live/creator) |
| ▶️ YouTube  | [YouTube Studio → Go Live](https://studio.youtube.com) |
| 📘 Facebook | [Facebook Live Producer](https://www.facebook.com/live/producer) |
| 🎮 Twitch   | [Twitch Dashboard](https://dashboard.twitch.tv/u/settings/stream) |
| 📡 Custom   | Any RTMP endpoint |

---

## Streaming Quality

| Preset | Resolution | FPS | Video Bitrate |
|--------|-----------|-----|--------------|
| 480p   | 854×480   | 24  | 1000 kbps   |
| 720p   | 1280×720  | 30  | 2500 kbps   |
| 1080p  | 1920×1080 | 30  | 4500 kbps   |

Recommended internet upload speed: at least 5 Mbps per destination.

---

## Architecture

```
Browser (Renderer)
  getUserMedia() → <video> preview
  MediaRecorder → ArrayBuffer chunks
        ↓ IPC
Electron (Main Process)
  rtmp-engine.js → spawns ffmpeg per destination
  ffmpeg stdin ← video chunks
  ffmpeg → RTMP → TikTok / YouTube / Facebook / Twitch / Rainbow Land
```

## Live Server (VPS)
- Signaling:  `http://67.38.45.238:3004`  (Socket.IO + REST)
- RTMP ingest: `rtmp://67.38.45.238:1935/live/<key>`
- HLS output:  `http://67.38.45.238:8085/live/<key>/index.m3u8`

Will move to `live.rainbowland.cc` once DNS is configured.
