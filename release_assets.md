# YTM Block - Release Assets & Packaging Guidelines 📦🚀

This document compiles the Firefox MV3 compatibility analysis, production packaging guides, promotional copy, and release checkpoints for publishing **YTM Block** to the Chrome Web Store and Firefox AMO.

---

## 🦊 Firefox MV3 Compatibility Profile

Mozilla Firefox fully supports Manifest V3 (since Firefox 109). Here is the compatibility profile for YTM Block's APIs:

### 1. API Namespaces & Event Wrappers
*   **The Namespace (`chrome.*` vs `browser.*`):**
    Firefox natively provides a complete compatibility alias mapping `chrome.*` to `browser.*`. Because YTM Block uses standard, promise-compatible chrome APIs (`chrome.storage.sync.get`, `chrome.runtime.onMessage`, `chrome.tabs.query`, and `chrome.contextMenus`), **no code changes or polyfill scripts are required**.
*   **Compatibility Wrapper (Optional):**
    If explicit standards alignment is desired, you can add this line at the top of your scripts:
    ```javascript
    globalThis.browser = globalThis.browser || globalThis.chrome;
    ```
    YTM Block’s code is written using native standard Chrome bindings which run perfectly on both platforms out-of-the-box.

### 2. Manifest V3 Adjustments for Firefox AMO
To successfully pass Firefox AMO's automated linter and list the extension under a distinct identifier, append the `browser_specific_settings` key to `manifest.json`:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "ytm-block@sanjaywaradkar.com",
    "strict_min_version": "109.0"
  }
}
```

---

## 📦 Production Packaging Instructions

Extensions must be packaged as standard compression archives (`.zip` for Chrome, and `.zip` or `.xpi` for Firefox).

### 🛠️ Terminal Commands (macOS / Linux)

Run these terminal operations from the project root `/Users/sanjaywaradkar/ytm-block` to package production-ready archives, automatically excluding development assets (`release_assets.md`, `README.md`, Git configurations, etc.):

```bash
# 1. Package for Chrome Web Store (Includes background.js and shared storage.js scripts)
zip -r ytm-block-chrome.zip manifest.json popup.html popup.js content.js background.js storage.js icons/

# 2. Package for Firefox AMO (Includes background.js and shared storage.js scripts)
zip -r ytm-block-firefox.zip manifest.json popup.html popup.js content.js background.js storage.js icons/
```

> [!NOTE]
> Firefox AMO requires that the manifest and core scripts remain in the root of the zip archive. Do not wrap the files in a sub-folder inside the zip.

---

## 📝 Store Listing Copy

### 🏷️ Short Tagline (Max 60 Characters)
> Block songs, albums, and artists on YouTube Music.

---

### 📖 Full Store Description (Rich Text)
Take complete control of your YouTube Music listening experience! 

**YTM Block** is a sleek, ultra-lightweight, and privacy-focused browser extension designed specifically for `music.youtube.com`. If there are songs, albums, or artists you simply do not want to hear, just add them to your blocklist. The extension will automatically skip matching tracks the split-second they start, scrub them from your "Up Next" queue, and filter them out of recommendation cards.

With our brand-new **Right-Click Context Menu Scraper**, blocking is faster than ever! Simply right-click on any track, artist link, album cover, playlist row, or player bar and select the desired action (e.g., **Block Song**, **Block Album**, or **Block Artist**). The service worker dynamically updates titles in the browser's context menu based on what you clicked and handles the block event instantly, displaying a gorgeous, glowing capsule notification toast right inside your browser window.

Built with a gorgeous, high-fidelity dark obsidian glassmorphism interface, YTM Block fits right in with YouTube Music’s premium dark theme.

---

### ✨ Feature Highlights
*   **🖱️ Multi-Entity Right-Click Context Blocking:** Block any Artist, Song, or Album by right-clicking elements directly on the YouTube Music page and selecting context options. Includes automatic Shadow DOM crawling.
*   **🔔 Premium Capsule Toasts:** Floating glass notifications with blur-filters and custom icons showing three distinct states: Successfully Blocked (with a **one-click "Unblock" button** inside the toast!), Already Blocked, and Detection Failure.
*   **⚡ Prioritized Auto-Skipping:** Programmatic skip engine respects blocklists in strict order of precedence (Blocked Songs -> Blocked Albums -> Blocked Artists) with sub-second response times.
*   **🔍 Resilient Matching:** Employs smart, case-insensitive, partial-substring matching for collaborative tracks, and cleans song titles of annotations like "remix", "feat", punctuation, and parentheses.
*   **👁️ Queue Intelligence:** Visually dims and crosses out blocked songs inside your "Up Next" panel, injects an absolute-positioned `"BLOCKED"` capsule badge, shows a warning tooltip on hover, and displays a responsive badge summarizing total blocked tracks hidden in the queue header.
*   **🚫 Click Protection:** Restricts clicks on blocked queue elements, preventing accidental selections.
*   **🔍 recommendation Filtering:** Visual layout-safe suppression blurs blocked items on home grids, mixes, and shelves with a custom translucent overlay badge, preserving grid alignment.
*   **🔒 Multi-Tier Loop Protection:** Built-in safeguards like click rate-limiting (1.0s cooldown), stuck DOM prevention, and a runaway skip ceiling (locks skipping for 8 seconds if 5 tracks are skipped consecutively) keep your browser running fast.
*   **🎨 Premium Glass Dashboard UI:** Multi-list dashboard popup showing Blocked Songs, Blocked Albums, and Blocked Artists concurrently, with real-time search filtering, tag removal fade animations, and a Live Now Playing Card with one-click actions.
*   **🔒 100% Local & Secure:** No tracker scripts, no third-party libraries, and zero external network calls. Your blocklist syncs securely using Chrome's native storage profile bridge.

---

## 🔒 Privacy Policy Text
> **YTM Block Privacy Commitment:**
> YTM Block is dedicated to absolute user privacy. This extension runs 100% locally inside your browser sandbox. 
> *   We do NOT collect, store, or transmit any user data, browsing history, or analytics.
> *   Your list of blocked items is stored strictly inside your browser's local sandbox and synchronized securely using your browser's native account sync node (`chrome.storage.sync`).
> *   The extension does not communicate with any external servers or third-party APIs.
> *   No tracking pixels, cookies, or advertisement engines are contained within the package.

---

## 📐 Versioning Strategy (Semantic Versioning)

YTM Block adheres strictly to **SemVer (Semantic Versioning)** (`MAJOR.MINOR.PATCH`):

*   **`1.0.0` (Initial Release):** Fully functional MVP containing persistent sync storage, content observers, rate-limiting, and queue scrubbing.
*   **`1.1.0` (Minor Feature Release):** Integrated background service worker, right-click artist extraction, context menus, interactive unblock toasts, and toast layouts.
*   **`1.2.0` (Feature Upgrade - Active):** Support for song and album blocking, prioritized skip engine matching, queue intelligence indicators, recommendation filtering blurs, zero-polling SPA observers, and a unified categorized dashboard.

---

## 🏁 Production Release Checklist

Before submitting YTM Block to the Chrome Web Store Developer Console or Firefox AMO:

1.  [ ] **Lint Check:** Ensure no console debug loops or test profiles are left active inside `content.js`, `background.js`, `storage.js`, or `popup.js`.
2.  [ ] **Icon Verification:** Confirm that `icons/16.png`, `icons/48.png`, and `icons/128.png` are sharp, correctly sized, and have transparent alpha layers.
3.  [ ] **Manifest Version:** Verify `"version": "1.2.0"` is correctly set inside `manifest.json`.
4.  [ ] **Background Registration:** Test loading the extension unpacked and verify that `background.js` registers the context menu successfully.
5.  [ ] **Right-Click Detection Scraper:** Open search cards, playlist lists, artist links, and queue items, right-click, and verify the console outputs showing clean extracted artist, song, and album names.
6.  [ ] **Dynamic Toast Transitions:** Confirm the glass capsule toast slides down from top-center on blocking events, and that the unblock button triggers successfully inside the toast.
7.  [ ] **Shadow DOM Scraper Scoping:** Confirm that right-clicking custom cards successfully resolves the parent host nodes and detects metadata.
8.  [ ] **Queue Intelligence Check:** Open "Up Next" queue, verify blocked items dim, and the statistics badge is dynamically updated in the header.
9.  [ ] **recommendation Suppression Check:** Verify that blocked recommendation cards on the home page are blurred and have "Blocked by YTM Block" overlay badges without breaking grid layouts.
10. [ ] **Loop Guard Test:** Trigger a synthetic skipped queue of 5 tracks to confirm the runaway consecutive skip protection locks the engine and resets correctly after 8 seconds.
11. [ ] **Zip Validation:** Open the generated `.zip` file to confirm that all files (`manifest.json`, `content.js`, `background.js`, `storage.js`, etc.) sit directly at the root level of the folder structure.
