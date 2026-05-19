# YTM Block 🚫🎵

An elegant, secure, and lightweight MV3 browser extension for **YouTube Music** (`music.youtube.com`) that automatically skips tracks from blocked artists and scrubs them from your "Up Next" player queue in real-time.

Built strictly using vanilla JS, HSL gradients, and CSS glassmorphism, YTM Block delivers a premium visual experience with zero tracker scripts, zero bloat, and fully localized storage synchronization.

---

## 🚀 Key Features

*   **⚡ Real-Time Auto-Skipping:** Programmatically skips tracks from blocked artists with a sub-second response time. Supports **case-insensitive** and **partial-substring** matching (e.g., blocking `drake` matches `Drake`, `Drake ft. Future`, and `Drake, Lil Baby`).
*   **👁️ "Up Next" Queue Scrubbing:** Scans the queue dynamically to dim blocked songs (set to `0.16` opacity), apply a line-through, and inject an elegant glowing red `[Blocked]` badge.
*   **🛡️ Click Neutralization:** Employs `pointer-events: none` on blocked queue items, making them unclickable so you never accidentally select them.
*   **🔒 Cooldown & Loop Prevention:** Incorporates state-of-the-art protections:
    *   *1.0s Click Cooldown:* Protects against physical double-clicking.
    *   *Stuck DOM Guard:* Halts click events if the webpage fails to transition.
    *   *Consecutive Skips Ceiling:* Locks the engine for 8s if 5 tracks are skipped in a row to protect tab performance on empty queues.
*   **🎨 Premium Glassmorphic Popup UX:** Features a dark obsidian glass card, alphabetic horizontal pills, single-click tag deletion with scale exit transitions, and a **Live Now Playing Card** with one-click blocking.
*   **🔄 Sync Persistence:** Built on `chrome.storage.sync` to sync your blocklist automatically across all browsers signed into the same account.

---

## 📊 System Architecture

```mermaid
graph TD
    %% Extension Popup Component
    subgraph Popup Context [popup.html / popup.js]
        A[Popup DomLoaded] -->|Query Storage| B[state.blockedArtists]
        B -->|Build Grid| C[Horizontal Pills Grid]
        A -->|1s Poll Timer| D[queryCurrentlyPlaying]
        D -->|tabs.sendMessage| E{Message Port}
        E -->|getCurrentTrack| F[updateNowPlayingUI]
        F -->|Render Track Info| G[Now Playing Card]
        H[Add Artist / Block Current] -->|addArtistToBlocklist| B
    end

    %% Web Content Script Component
    subgraph Content Script Context [content.js]
        I[Injected @ document_idle] -->|init| J[getBlocklist]
        J -->|chrome.storage.sync| K[blockedArtists Cache]
        
        %% Player Observer Loop
        I -->|setupObserver| L[Player MutationObserver]
        L -->|Debounced 300ms| M[getCurrentArtist]
        M -->|Compare Cache| N{shouldSkipArtist?}
        N -->|YES| O[isPlaybackActive?]
        O -->|YES| P[skipTrack]
        P -->|nextBtn.click| Q[Trigger Track Skip]
        
        %% Queue Observer Loop
        I -->|setupQueueObserver| R[Queue MutationObserver]
        R -->|Debounced 400ms| S[scrubQueue]
        S -->|WeakSet & dataset Check| T[getQueueItemArtist]
        T -->|Compare Cache| U{shouldSkipArtist?}
        U -->|YES| V[Apply .ytm-blocked-queue-item CSS]
        
        %% Message Port
        E -.-> W[setupMessageListener]
        W -.->|Scrape Current Title/Artist| E
    end

    %% Chrome Sync Bridge
    B <-->|chrome.storage.onChanged| K
```

---

## 🛠️ Installation Instructions

### Google Chrome & Chromium-based Browsers (Brave, Edge, Opera)
1.  Download or clone this repository to your local system.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  In the top-right corner, toggle the **Developer mode** switch to **ON**.
4.  In the top-left corner, click **Load unpacked**.
5.  Select the `ytm-block` directory containing `manifest.json`.
6.  The extension is now ready! Pin it to your toolbar.

### Mozilla Firefox
1.  Open Firefox and type `about:debugging` in the URL bar.
2.  Click **This Firefox** in the left sidebar.
3.  Click **Load Temporary Add-on...** under the Temporary Extensions section.
4.  Navigate to the `ytm-block` directory and select `manifest.json` (or the packed `.zip` / `.xpi` archive).
5.  Open `music.youtube.com` and click the extensions icon to configure.

---

## 🛡️ Permissions Breakdown

To guarantee complete privacy, YTM Block requests the absolute minimum permissions required to perform its functions:

| Permission | Scope | Technical Purpose |
| :--- | :--- | :--- |
| `storage` | Persistent Sync | Saves your list of blocked artists securely. Uses `storage.sync` to mirror your blocklist across multiple browsers. |
| `activeTab` | Tab Querying | Used strictly inside the popup to query the active tab's URL and title for checking if you are currently on YouTube Music. |
| `https://music.youtube.com/*` | Content Injection | Allows the extension to safely inject `content.js` into the player viewport. The script is sandboxed and never makes external requests. |

---

## 📷 Screenshots Section

*Add your promotional screenshot assets here. Recommended dimensions: `1280x800` (Chrome Web Store) and `1280x800` (Firefox AMO).*

| 1. Premium Dark Popup UI | 2. Up Next Queue Scrubbing |
| :---: | :---: |
| ![Popup UI Placeholder](icons/128.png) | ![Queue Scrubbing Placeholder](icons/128.png) |
| *Elegant Glass Now Playing Panel & tag grid* | *Visually crossed-out and tagged blocked tracks* |

---

## 🔍 Troubleshooting Guide

#### ❓ The popup displays "Disconnected" and "Open YouTube Music tab"
*   **Cause:** The extension popup cannot find an active tab pointed to `https://music.youtube.com/*`.
*   **Fix:** Open a tab on [music.youtube.com](https://music.youtube.com/), start playing any track, and click the popup again.

#### ❓ A song by a blocked artist started playing and didn't skip
*   **Cause:** Playback might be paused, or the content script was injected before the DOM loaded the next-button wrapper.
*   **Fix:** 
    1. Verify that the song is **not paused**. The skip engine is programmatically locked when playback is paused to preserve user focus.
    2. Open your browser console (`Cmd + Option + J` or `Ctrl + Shift + J`) and verify the log: `[YTM Block] next-click cooldown active`.
    3. Make sure the artist's spelling in your blocklist is correct. (Partial matching is supported, but typos will result in a mismatch).

#### ❓ The blocked items inside the "Up Next" queue are not being dimmed
*   **Cause:** YouTube Music uses dynamic virtualization to render elements on scroll. Sometimes the queue container has not been fully rendered in the DOM when the extension initializes.
*   **Fix:** Toggle the **Queue** list icon in the bottom-right corner of the player to force a DOM refresh, or refresh the page. The automatic queue observer will instantly lock onto the container and dim the elements.

---

## 📦 Packaging and Distribution

See [RELEASE_ASSETS.md](release_assets.md) for Chrome Web Store & Firefox AMO packaging instructions, AMO MV3 compatibility wrappers, and the store listing copy.

---

## 📄 License & Privacy

This extension runs **100% locally**. It contains no analytics, no tracker scripts, and never transmits your data or browsing history to external servers. Your blocked artist list remains local to your browser and Chrome profile sync nodes.

Licensed under the MIT License. Developed with care.
