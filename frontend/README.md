# Frontend Chrome Extension

Manifest V3 Chrome extension scaffold for AI Safe Link Sandbox.

## Structure

- `manifest.json`: extension manifest.
- `src/content/index.ts`: link discovery/content script placeholder.
- `src/background/index.ts`: service worker placeholder for backend orchestration.
- `src/popup/popup.html`: popup UI shell.
- `src/popup/index.ts`: popup TypeScript entrypoint.

## Local Setup

1. Install dependencies:
   - `npm install`
2. Build TypeScript:
   - `npm run build`
3. Load in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `frontend/` folder

## Notes

- This is scaffold-only; it does not yet call your backend endpoint.
- The manifest references built files under `dist/`, so run a build before loading.
