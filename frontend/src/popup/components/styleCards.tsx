export const styleCards = `
.card {
  background: var(--paper);
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-bottom-color: var(--border);
  border-right-color: var(--border);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: transform 180ms ease, box-shadow 220ms ease, border-color 220ms ease;
}
.card:hover {
  transform: translateY(-2px);
  border-color: rgba(245, 179, 1, 0.36);
  box-shadow: 0 10px 28px rgba(17, 17, 16, 0.12);
}
.card-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 12px; border-bottom: 1px solid var(--border); background: rgba(255, 255, 255, 0.45);
}
.title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--yellow); transition: transform 180ms ease, box-shadow 180ms ease; }
.card:hover .dot {
  transform: scale(1.2);
  box-shadow: 0 0 0 5px rgba(245, 179, 1, 0.18);
}
.body { padding: 12px; }
.status-box {
  background: rgba(255,255,255,0.7);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  transition: background-color 180ms ease, border-color 180ms ease, box-shadow 220ms ease;
}
.status-box:hover {
  background: rgba(255, 255, 255, 0.84);
  border-color: rgba(10, 140, 122, 0.28);
  box-shadow: 0 8px 18px rgba(10, 140, 122, 0.12);
}
.status-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
.product-name {
  font-family: "Fraunces", Georgia, "Times New Roman", serif;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: var(--ink);
  padding: 2px 2px 6px;
  transition: transform 160ms ease, color 160ms ease, text-shadow 180ms ease;
}
.product-name:hover {
  transform: translateX(1px);
  color: #2b2925;
  text-shadow: 0 2px 10px rgba(245, 179, 1, 0.22);
}
.url-line {
  font-size: 11px; color: #2f2d2a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.breakdown-grid { display: grid; grid-template-columns: 124px 1fr; gap: 10px; align-items: start; }
.donut-wrap { display: flex; align-items: center; justify-content: center; padding-top: 2px; }
.safety-donut {
  width: 112px; height: 112px; border-radius: 50%;
  background: conic-gradient(var(--coral) 0turn 0.33turn, #e8a90e 0.33turn 0.66turn, var(--teal) 0.66turn 1turn);
  position: relative; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.45);
  transition: transform 220ms ease, box-shadow 240ms ease, filter 220ms ease;
}
.safety-donut:hover {
  transform: scale(1.03);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.7), 0 10px 24px rgba(17, 17, 16, 0.14);
  filter: saturate(1.08);
}
.safety-donut::after {
  content: ""; position: absolute; inset: 24px; border-radius: 50%; background: rgba(255,255,255,0.86);
}
.metrics { margin-top: 10px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.metric {
  background: rgba(255,255,255,0.7);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 8px;
  transition: transform 160ms ease, border-color 180ms ease, box-shadow 200ms ease;
}
.metric:hover {
  transform: translateY(-1px);
  border-color: rgba(245, 179, 1, 0.3);
  box-shadow: 0 8px 16px rgba(245, 179, 1, 0.12);
}
.metric-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.metric-value { margin-top: 4px; font-size: 18px; font-weight: 700; line-height: 1; }
.metric-value.metric-red { color: var(--coral); }
.metric-value.metric-yellow { color: #e8a90e; }
.metric-value.metric-green { color: var(--teal); }
.explanation-box {
  margin-top: 10px; background: rgba(255,255,255,0.7); border: 1px solid var(--border);
  border-radius: 10px; padding: 10px; font-size: 12px; line-height: 1.45; color: var(--muted);
  transition: border-color 180ms ease, background-color 180ms ease, box-shadow 220ms ease;
}
.explanation-box:hover {
  background: rgba(255, 255, 255, 0.84);
  border-color: rgba(232, 71, 47, 0.24);
  box-shadow: 0 8px 18px rgba(232, 71, 47, 0.1);
}
.table-head {
  display: flex; justify-content: space-between; gap: 8px; font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); padding: 0 2px 8px;
}
`;
