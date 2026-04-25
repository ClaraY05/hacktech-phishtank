# Frontend Chrome Extension

Manifest V3 Chrome extension scaffold for AI Safe Link Sandbox.

## Structure

- `manifest.json`: extension manifest.
- `src/content/index.ts`: content-script orchestration entrypoint.
- `src/content/helper/linkScanner.ts`: link recognition + link payload shaping.
- `src/content/helper/sanitizer.ts`: DOM signal extraction + HTML sanitization/truncation.
- `src/content/helper/styling.ts`: thin facade for content UI orchestration exports.
- `src/content/helper/styleLoader.ts`: runtime CSS loader/injection for content UI.
- `src/content/helper/featureState.ts`: global bubble/activation state management.
- `src/content/helper/tooltipController.ts`: tooltip lifecycle and positioning.
- `src/content/helper/badgeController.ts`: corner bubble rendering and state visuals.
- `src/content/helper/linkBindings.ts`: link hover/focus bindings and mutation observer.
- `src/content/helper/uiConstants.ts`: shared UI constants and bubble-state type.
- `src/content/styles/index.css`: content style entrypoint.
- `src/content/styles/tokens.css`: shared content tokens/font import.
- `src/content/styles/link-highlight.css`: link border/hover highlight styles.
- `src/content/styles/tooltip.css`: tooltip styles.
- `src/content/styles/badge.css`: badge animation/state styles.
- `src/content/helper/styles.css`: compatibility wrapper that imports `src/content/styles/index.css`.
- `src/content/helper/payloadBuilder.ts`: message payload formatting for background.
- `src/content/helper/messages.ts`: content -> background messaging helper.
- `src/background/index.ts`: thin message router.
- `src/background/helper/apiClient.ts`: backend HTTP client for `/analyze-links`.
- `src/popup/popup.html`: popup UI shell.
- `src/popup/index.ts`: popup TypeScript entrypoint.
- `src/popup/styles/index.css`: popup style entrypoint.
- `src/popup/styles/tokens.css`: popup design tokens.
- `src/popup/styles/layout.css`: popup layout/background/shell styles.
- `src/popup/styles/cards.css`: popup card/status/metric styles.
- `src/popup/styles/chips.css`: chip/status-pill styles.
- `src/popup/styles/list.css`: recent-item list styles.

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
- Style injection entrypoint: `src/content/helper/styleLoader.ts`
- Link bind/highlight logic: `src/content/helper/linkBindings.ts`
- Bubble state + activation: `src/content/helper/featureState.ts`
- Badge rendering behavior: `src/content/helper/badgeController.ts`
- Tooltip behavior: `src/content/helper/tooltipController.ts`
- Backend payload shape before send: `src/content/helper/payloadBuilder.ts`
- Content -> background send behavior: `src/content/helper/messages.ts`
- Background -> backend request behavior: `src/background/helper/apiClient.ts`

## State Testing (dataflow.md alignment)

The corner bubble now follows the global states described in `../dataflow.md`:

- `enabled`
- `disabled`
- `analyzing`

For local testing, set this variable in `src/content/helper/styling.ts`:

- `LOCAL_BUBBLE_STATE_OVERRIDE`

Example values:

- `null` -> normal runtime behavior
- `"enabled"` -> active hover/tooltips + backend query flow
- `"disabled"` -> hover/tooltips off, no backend query
- `"analyzing"` -> badge shows analyzing state, tooltip shows "Analysis in progress", no backend query

### Test Steps

1. Edit `src/content/helper/styling.ts` and set `LOCAL_BUBBLE_STATE_OVERRIDE`.
2. Build: `npm run build`
3. Reload extension in `chrome://extensions`.
4. Refresh target page.
5. Validate expected behavior:
   - `enabled`: hover border + tooltip details from backend.
   - `disabled`: no hover effect and no tooltip.
   - `analyzing`: analyzing badge effect + tooltip text "Analysis in progress" without backend link analysis request.

## Notes

- This is scaffold-only; it does not yet call your backend endpoint.
- The manifest references built files under `dist/`, so run a build before loading.
