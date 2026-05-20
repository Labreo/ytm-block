# YTM Block 🚫🎵

<!-- INSERT BANNER IMAGE HERE (e.g. ![YTM Block Banner](https://your-github-url/banner.png)) -->
<!-- Recommended banner dimension: 1280x640. You can place this file in your assets folder. -->
![YTM Block Screenshot](icons/128.png)

An elegant, secure, and lightweight browser extension for **YouTube Music** (`music.youtube.com`) that automatically skips tracks from blocked artists, songs, and albums, scrubs them from your "Up Next" queue, filters recommendation cards, and provides context-aware right-click entity blocking.

![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 📥 Installation

<!-- INSERT FIREFOX ADD-ON STORE LINK HERE -->
<a href="https://addons.mozilla.org/en-US/firefox/addon/ytm-block/"><img src="https://user-images.githubusercontent.com/585534/107280546-7b9b2a00-6a26-11eb-8f9f-f95932f4bfec.png" alt="Get YTM Block for Firefox" height="40"></a>

<!-- INSERT EDGE ADD-ON STORE LINK HERE -->
<a href="https://microsoftedge.microsoft.com/addons/detail/ytm-block/YOUR-ADDON-ID"><img src="https://user-images.githubusercontent.com/585534/107280673-a5ece780-6a26-11eb-9cc7-9fa9f9f81180.png" alt="Get YTM Block for Microsoft Edge" height="40"></a>

<!-- INSERT CHROME WEB STORE LINK HERE -->
<a href="https://chromewebstore.google.com/detail/ytm-block/YOUR-ADDON-ID"><img src="https://user-images.githubusercontent.com/585534/107280622-91a8ea80-6a26-11eb-8d07-77c548b28665.png" alt="Get YTM Block for Chrome" height="40"></a>


## 📖 Project Purpose

YouTube Music is great, but managing playback quality while coding or studying often means being forced to listen to artists, tracks, or albums you dislike. **YTM Block** solves this by integrating directly with YouTube Music's interface and underlying player.

With a single right-click or dashboard update, you can permanently block any artist, track, or album. YTM Block will ensure they are automatically skipped, hidden, and filtered with zero distraction, allowing you to stay focused on your work.

### ✨ Features
* **🖱️ Multi-Entity Right-Click Context Blocking:** Block any Artist, Song, or Album by right-clicking elements directly on the YouTube Music page and selecting context options. Includes automatic Shadow DOM crawling.
* **🔔 Premium Capsule Toasts:** Floating glass notifications with blur-filters and custom icons showing three distinct states: Successfully Blocked (with a one-click "Unblock" button inside the toast!), Already Blocked, and Detection Failure.
* **⚡ Prioritized Auto-Skipping:** Programmatic skip engine respects blocklists in strict order of precedence (Blocked Songs -> Blocked Albums -> Blocked Artists) with sub-second response times and fuzzy-normalized song matching.
* **👁️ Queue Intelligence:** Visually dims and crosses out blocked songs inside your "Up Next" panel, injects an absolute-positioned `"BLOCKED"` capsule badge, and displays a counter badge in the header.
* **🚫 Click Protection:** Restricts clicks on blocked queue elements, preventing accidental selections.
* **🔍 Recommendation Filtering:** Visual layout-safe suppression blurs blocked items on home grids, mixes, and shelves with a custom translucent overlay badge, preserving grid alignment.
* **🎨 Premium Glass Dashboard UI:** Multi-list dashboard popup showing Blocked Songs, Blocked Albums, and Blocked Artists concurrently, with real-time search filtering, tag removal fade animations, and a Live Now Playing Card.
* **🔒 100% Local & Secure:** No tracker scripts, no third-party libraries, and zero external network calls. Your blocklist syncs securely using Chrome's native storage profile bridge.

---

## 🛠️ Tech Stack

This project is built using:
* **Vanilla JavaScript** & **CSS** (utilizes custom inline styling to pierce Shadow DOM boundaries).
* **Manifest V3** (Chrome, Edge) and **Firefox MV3 compatibility** (via separate manifests).
* **Bash** for standard build automation without heavy webpack/bundlers.

---

## 💻 Local Setup Instructions

These instructions have been designed and tested for a clean local machine environment.

### Prerequisites
* Git
* A browser (Chrome, Edge, or Firefox)

### Step-by-Step Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Labreo/ytm-block.git
   cd ytm-block
   ```

2. **Build the extension:**
   Generate the clean, store-ready browser distributions:
   ```bash
   chmod +x build.sh
   ./build.sh
   ```
   *This will create a `dist/` directory containing `chrome/`, `firefox/`, and `edge/` builds, along with release zip archives.*

3. **Load the extension manually into your browser:**
   * **For Chrome:** Navigate to `chrome://extensions/`, toggle on "Developer mode" in the top right, click "Load unpacked", and select the `dist/chrome/` folder.
   * **For Edge:** Navigate to `edge://extensions/`, toggle on "Developer mode", click "Load unpacked", and select `dist/edge/`.
   * **For Firefox:** Navigate to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select the `manifest.json` inside the `dist/firefox/` folder.

---

## 🤝 Contribution Guidelines

Contributions, issues, and feature requests are highly encouraged! 

We follow standard GitHub flow and require that all pull requests pass basic code style and lint check requirements. Before starting major work, please review our comprehensive **[CONTRIBUTING.md](CONTRIBUTING.md)** (create this file if not already present) for our full code style rules, PR expectations, and standard practices.

---

## 💬 Contact & Support

**Have questions or want to discuss a major feature?**
Reach out to me directly on **Discord**: `.kakaroth`

If this extension makes your daily workflow a little smoother, consider supporting the development! 

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/kakeroth)

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

**Built by Kanak Waradkar**
