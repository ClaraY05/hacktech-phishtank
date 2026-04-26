const MODAL_ID = "pt-warning-modal";

function removeModal(): void {
  document.getElementById(MODAL_ID)?.remove();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function showWarningModal(link: HTMLAnchorElement, explanation: string): void {
  removeModal();

  const url = link.href;
  const opensInNewTab = link.target === "_blank" || link.target === "_new";

  const overlay = document.createElement("div");
  overlay.id = MODAL_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "High-risk link warning");

  overlay.innerHTML = `
    <div class="pt-warning-box">
      <div class="pt-warning-icon">⚠</div>
      <div class="pt-warning-title">High-Risk Link Detected</div>
      <div class="pt-warning-url">${escapeHtml(url)}</div>
      <div class="pt-warning-reason">${escapeHtml(explanation)}</div>
      <div class="pt-warning-actions">
        <button type="button" id="pt-warning-cancel" class="pt-warning-btn pt-warning-btn--safe">Stay safe</button>
        <button type="button" id="pt-warning-proceed" class="pt-warning-btn pt-warning-btn--danger">Go anyway</button>
      </div>
    </div>
  `;

  (document.body || document.documentElement).appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) removeModal();
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removeModal();
  });

  document.getElementById("pt-warning-cancel")?.addEventListener("click", removeModal);

  document.getElementById("pt-warning-proceed")?.addEventListener("click", () => {
    removeModal();
    if (opensInNewTab) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = url;
    }
  });

  (document.getElementById("pt-warning-cancel") as HTMLButtonElement | null)?.focus();
}
