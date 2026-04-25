export const styleLayout = `
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--ink);
  min-width: 420px;
  min-height: 100vh;
}
.shell {
  position: relative;
  overflow: hidden;
  min-height: 100vh;
  padding: 14px;
}
.shell::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(245, 179, 1, 0.22), transparent 45%),
    radial-gradient(circle at 80% 20%, rgba(10, 140, 122, 0.18), transparent 42%),
    radial-gradient(circle at 50% 88%, rgba(232, 71, 47, 0.16), transparent 40%);
  z-index: 0;
  pointer-events: none;
}
.orb { position: absolute; border-radius: 50%; filter: blur(72px); pointer-events: none; }
.orb.one { width: clamp(170px, 44vmin, 360px); height: clamp(170px, 44vmin, 360px); background: rgba(245,179,1,0.42); top: -16%; left: -14%; }
.orb.two { width: clamp(160px, 40vmin, 320px); height: clamp(160px, 40vmin, 320px); background: rgba(10,140,122,0.32); bottom: -14%; right: -12%; }
.orb.three { width: clamp(140px, 34vmin, 280px); height: clamp(140px, 34vmin, 280px); background: rgba(232,71,47,0.22); top: 38%; left: 48%; transform: translate(-50%, -50%); }
.app { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 12px; padding-bottom: 4px; }
.is-hidden { display: none !important; }
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.analyzing-shell {
  position: absolute; inset: 0; z-index: 1;
  display: flex; align-items: center; justify-content: center; padding: 14px;
}
.analyzing-status {
  position: relative; z-index: 1; font-size: clamp(15px, 2.8vmin, 22px);
  font-weight: 700; color: #111110; text-align: center; max-width: min(90%, 560px); text-wrap: balance;
  transition: transform 180ms ease, text-shadow 220ms ease, color 160ms ease;
}
.analyzing-status:hover {
  transform: translateY(-1px);
  color: #1e1d1a;
  text-shadow: 0 5px 14px rgba(245, 179, 1, 0.24);
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .dot,
  .status-box,
  .product-name,
  .safety-donut,
  .metric,
  .explanation-box,
  .chip,
  .item,
  .analyzing-status {
    transition: none !important;
    transform: none !important;
    filter: none !important;
  }
}
`;
