export const styleList = `
.list { display: flex; flex-direction: column; gap: 6px; }
.table-scroll { max-height: 220px; overflow-y: auto; padding-right: 4px; }
.table-scroll::-webkit-scrollbar { width: 5px; }
.table-scroll::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.18); border-radius: 999px; }
.item {
  border: 1px solid var(--border); border-radius: 8px; background: rgba(255, 255, 255, 0.68); padding: 8px;
  transition: transform 160ms ease, border-color 180ms ease, box-shadow 200ms ease, background-color 180ms ease;
}
.item:hover {
  transform: translateX(1px);
  background: rgba(255, 255, 255, 0.84);
  border-color: rgba(10, 140, 122, 0.26);
  box-shadow: 0 8px 18px rgba(10, 140, 122, 0.1);
}
.item-row { display: flex; justify-content: space-between; gap: 8px; }
.item-url {
  font-size: 11px; color: #2f2d2a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
`;
