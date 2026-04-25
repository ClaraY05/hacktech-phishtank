# Frontend Chrome Extension

Manifest V3 Chrome extension scaffold for AI Safe Link Sandbox.

## Structure

- `manifest.json`: extension manifest.
- `src/content/index.ts`: content-script orchestration entrypoint.
- `src/content/helper/linkScanner.ts`: link recognition + link payload shaping.
- `src/content/helper/sanitizer.ts`: DOM signal extraction + HTML sanitization/truncation.
- `src/content/helper/styling.ts`: stylesheet injection and link class highlighting.
- `src/content/helper/styles.css`: class-based link highlight styles.
- `src/content/helper/payloadBuilder.ts`: message payload formatting for background.
- `src/content/helper/messages.ts`: content -> background messaging helper.
- `src/background/index.ts`: thin message router.
- `src/background/helper/apiClient.ts`: backend HTTP client for `/analyze-links`.
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
The build now uses `esbuild` bundling so extension scripts do not ship raw import statements.

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
  - `AI Safe Link found <count> links on page`
- In DevTools Sources, check:
  - `Content scripts -> AI Safe Link Sandbox -> dist/content/index.js`

## Current Visual Behavior

- The content script adds a CSS class to every `a[href]` and styles it as a red box.
- This is applied at content-script load time (existing links on initial page render).
- After code changes, rebuild (`npm run build`) and reload the extension in Chrome to apply updates.

## Where To Change Key Behaviors

- HTML sanitization logic: `src/content/helper/sanitizer.ts`
- Link recognition and payload link extraction: `src/content/helper/linkScanner.ts`
- Red-box class styling: `src/content/helper/styles.css`
- Style injection/class application: `src/content/helper/styling.ts`
- Backend payload shape before send: `src/content/helper/payloadBuilder.ts`
- Content -> background send behavior: `src/content/helper/messages.ts`
- Background -> backend request behavior: `src/background/helper/apiClient.ts`

## Notes

- This is scaffold-only; it does not yet call your backend endpoint.
- The manifest references built files under `dist/`, so run a build before loading.
