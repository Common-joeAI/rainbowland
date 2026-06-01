# 🌈 Rainbow Land

**The free streaming studio built for LGBT+ creators.**

Live stream to TikTok, YouTube, Twitch, and Facebook simultaneously — all from one beautiful desktop app. No subscriptions. No gatekeeping. No ads.

![Rainbow Land](https://rainbowland.cc/preview.png)

---

## ✨ Features

- **Multi-destination streaming** — Go live on up to 5 platforms at once via GPU-accelerated RTMP
- **Pride themes** — Neon Nights, Lofi Sunset, Rainbow Land — full UI skin system
- **TikTok Login** — Connect your TikTok account via OAuth (Login Kit)
- **AI stream titles** — One-click Grok-powered title generation
- **GPU acceleration** — Auto-detects NVENC (NVIDIA), AMF (AMD), QSV (Intel), VideoToolbox (Mac)
- **Loudman.live integration** — Discover LGBT+ independent artists
- **Free forever** — Voluntary donations only (PayPal)

---

## 📥 Download

| Platform | Link |
|----------|------|
| 🪟 Windows (installer) | [Rainbow.Land.Setup.1.0.0.exe](../../releases/latest) |
| 🪟 Windows (portable)  | [Rainbow.Land.1.0.0.exe](../../releases/latest) |
| 🐧 Linux (AppImage)    | [Rainbow.Land-1.0.0.AppImage](../../releases/latest) |
| 🐧 Linux (deb)         | [rainbow-land_1.0.0_amd64.deb](../../releases/latest) |
| 🍎 macOS               | [Rainbow.Land-1.0.0.dmg](../../releases/latest) |

---

## 🚀 Build from Source

```bash
git clone https://github.com/Common-joeAI/rainbowland.git
cd rainbowland
npm install

# Dev mode (hot reload)
npm run dev:electron

# Build for your platform
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

### Requirements
- Node.js 18+
- FFmpeg installed and on PATH (for streaming)
- GPU drivers for hardware encoding (optional but recommended)

---

## 🎥 Streaming Setup

1. Open Rainbow Land → **Studio** tab
2. Click **⚙️ Destinations** → enter your stream keys
3. Toggle which platforms to go live on
4. Hit **Go Live** 🔴

Stream keys can be found in each platform's creator dashboard:
- [TikTok LIVE Studio](https://www.tiktok.com/live/creators)
- [YouTube Studio](https://studio.youtube.com)
- [Twitch Dashboard](https://dashboard.twitch.tv)
- [Facebook Live Producer](https://www.facebook.com/live/producer)

---

## 🔐 TikTok Integration

Rainbow Land uses TikTok **Login Kit** to connect your account. OAuth is handled via a local redirect server — your credentials never leave your device.

Redirect URIs registered:
- `http://localhost:54321/tiktok/callback` (desktop)
- `https://rainbowland.cc/tiktok/callback` (web)

---

## 💜 Support Development

Rainbow Land is and will always be free. If it helps you create, consider buying us a coffee:

👉 [paypal.me/josephbennett99](https://paypal.me/josephbennett99)

---

## 📄 Legal

- [Privacy Policy](https://rainbowland.cc/privacy.html)
- [Terms of Service](https://rainbowland.cc/terms.html)
- [Support](https://rainbowland.cc/support.html)

---

## 🏳️‍🌈 License

MIT — free to use, fork, and build upon.
