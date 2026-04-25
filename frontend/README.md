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
2. Build TypeScript (required before Chrome can use latest values/code):
   - `npm run build`
3. Load in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `frontend/` folder

## Test Workflow (Important)

Chrome loads JavaScript files from `dist/` based on `manifest.json`.  
Edits in `src/**/*.ts` do **not** appear in Chrome until you rebuild.

Use this loop whenever you change extension code:

1. Edit files in `src/` (for example `src/content/index.ts`).
2. Run `npm run build` to compile updated values into `dist/`.
3. Go to `chrome://extensions` and click **Reload** for this extension.
4. Refresh the target webpage tab.
5. Check the webpage DevTools console for content-script logs.

Optional for faster iteration:

- Run `npm run watch` in a terminal to auto-compile while editing.
- You still need to click **Reload** in `chrome://extensions` after new output is generated.

## Verify Content Script Is Running

- Confirm `manifest.json` points to `dist/content/index.js`.
- In Chrome DevTools (on the target webpage), look for logs such as:
  - `AI Safe Link content script injected`
  - `AI Safe Link content script discovered links`
- In DevTools Sources, check:
  - `Content scripts -> AI Safe Link Sandbox -> dist/content/index.js`

## Notes

- This is scaffold-only; it does not yet call your backend endpoint.
- The manifest references built files under `dist/`, so run a build before loading.
