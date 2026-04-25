export const styleChips = `
.chip {
  font-size: 10px; font-weight: 600; border-radius: 999px; padding: 3px 8px; letter-spacing: 0.03em;
  transition: transform 160ms ease, filter 160ms ease, box-shadow 200ms ease;
}
.chip:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
  box-shadow: 0 6px 14px rgba(17, 17, 16, 0.14);
}
.chip.live { color: var(--teal); background: var(--teal-light); border: 1px solid var(--teal-border); }
.chip.warn { color: var(--coral); background: var(--coral-light); border: 1px solid var(--coral-border); }
.chip.danger { color: #fff; background: var(--coral); border: 1px solid rgba(232, 71, 47, 0.55); }
`;
