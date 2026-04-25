const statusEl = document.getElementById("status");
if (statusEl) {
  const variants = [
    "Extension active and monitoring links.",
    "Extension active and monitoring links..",
  ];
  let index = 0;
  statusEl.textContent = variants[index];

  window.setInterval(() => {
    index = (index + 1) % variants.length;
    statusEl.textContent = variants[index];
  }, 700);
}
