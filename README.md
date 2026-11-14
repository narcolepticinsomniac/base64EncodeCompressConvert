# base64EncodeCompressConvert

A Manifest V3 browser extension for encoding, compressing, resizing, and converting images (and other files) into Base64 Data URIs directly in your browser.

## Features

* **Multiple Input Methods**
  * **Context Menu:** Right-click any image, link, or page background (including Shadow DOM elements, CSS `background-image` URLs, and Imagus hover popups) and select `base64EncodeCompressConvert`.
  * **Toolbar Icon:** Click the extension icon to open the encoder workspace directly.
  * **Drag & Drop / File Picker:** Drag and drop multiple files anywhere onto the encoder page or use the file picker button.
  * **Clipboard Paste:** Paste raw images or direct `http`/`https` image URLs anywhere on the page (`Ctrl+V` / `Cmd+V`).
  * **URL Prompt Fallback:** If right-clicking an area without a detectable image, a prompt allows you to manually enter an image URL.

* **Compression, Conversion & Resizing**
  * **Lossy WebP Compression (1%–100%):** Converts images to lightweight WebP Data URIs with adjustable quality (defaults to `50%`).
  * **Lossless Mode (0%):** Preserves original formats without re-encoding (converts SVGs to PNG when needed).
  * **Automatic Metadata Stripping:** Removes unnecessary ICC color profiles (`iCCP`) from WebP outputs and strips non-essential chunks (`iCCP`, `eXIf`, `tEXt`, `zTXt`, `iTXt`, `pHYs`, `tIME`) from lossless PNGs to minimize output size.
  * **Smart Resizing:** Downscale images to preset max dimensions (`2048px`, `1024px`, `512px`, `128px`) or keep `Original (No Resize)`.
  * **Live Re-encoding:** Adjusting the compression slider or max dimension dropdown automatically re-processes all currently loaded images in real time.

* **Output & Workspace Management**
  * **One-Click Copy:** Copy the raw Data URI or copy it pre-formatted as a CSS `background-image: url(...)` rule.
  * **File Download:** Download the converted/compressed image directly to your device with the updated file extension.
  * **Size Comparison & Warnings:** Displays final output size, exact KB/percentage saved, and highlights Data URIs larger than `100 KB`.
  * **Persistent Session:** Saves encoded items in `IndexedDB` and remembers slider/dimension preferences in `localStorage` across sessions (with a one-click reset button to clear all data).
  * **File Size Guardrail:** Skips files larger than `10 MB` to prevent browser memory issues.

## Privacy & Data Handling

* **100% Local Processing:** All image encoding, compression, resizing, and metadata stripping happen entirely inside your browser using native HTML5 Canvas and JavaScript APIs.
* **No External Servers or Tracking:** Your files, images, and generated Base64 strings are never uploaded, transmitted, or logged to any external server, analytics service, or third party.
* **Local-Only Storage:** Encoded items and settings are saved strictly on your own machine (`IndexedDB` and `localStorage`) so your workspace persists across sessions.
* **Full User Control:** You can remove individual items or wipe all stored data and preferences at any time using the clear/reset button in the toolbar.

## Installation (Developer Mode)

* Clone or download this repository to your local machine.
* Open your browser's extensions page (`chrome://extensions` or `edge://extensions`).
* Enable **Developer mode** in the top-right corner.
* Click **Load unpacked** and select the folder containing `manifest.json`.

## Permissions Used

* `contextMenus`: Adds the `base64EncodeCompressConvert` option to the right-click menu.
* `tabs` & `activeTab`: Opens the encoder tab and communicates with the active page to locate right-clicked images.
* `<all_urls>`: Allows the content script to detect images across websites and lets the encoder fetch remote image URLs you explicitly select or paste without CORS blocks.
