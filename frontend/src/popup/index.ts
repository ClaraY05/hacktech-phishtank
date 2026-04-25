const statusEl = document.getElementById("status");
const scannedCountEl = document.getElementById("scannedCount");
const flaggedCountEl = document.getElementById("flaggedCount");
const safeCountEl = document.getElementById("safeCount");
const recentListEl = document.getElementById("recentList");

if (statusEl) {
  statusEl.textContent = "Extension active and monitoring links.";
}

if (scannedCountEl) {
  scannedCountEl.textContent = "24";
}

if (flaggedCountEl) {
  flaggedCountEl.textContent = "3";
}

if (safeCountEl) {
  safeCountEl.textContent = "21";
}

if (recentListEl) {
  recentListEl.innerHTML = `
    <div class="item">
      <div class="item-row">
        <span class="item-url mono">example-site.com/login</span>
        <span class="chip warn">flagged</span>
      </div>
    </div>
    <div class="item">
      <div class="item-row">
        <span class="item-url mono">docs.safe-domain.dev/reference</span>
        <span class="chip live">safe</span>
      </div>
    </div>
    <div class="item">
      <div class="item-row">
        <span class="item-url mono">download.host/file.zip</span>
        <span class="chip live">scanned</span>
      </div>
    </div>
  `;
}
