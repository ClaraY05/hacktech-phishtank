#!/bin/bash
# setup.sh - Run this directly in your Linux/WSL terminal (not inside Docker).
#
# Bootstraps the host so DockerBackend (sandbox_backend.py) can spawn
# the safe-link-worker image per request, optionally under gVisor.
#
# On macOS, install Docker Desktop instead (https://docs.docker.com/desktop/);
# this script targets apt-based Linux/WSL distros.

set -e

echo "Starting Host Infrastructure Setup..."

# 1. Install Docker (skip if `docker` already on PATH; Docker Desktop counts).
echo "Installing Docker..."
if command -v docker >/dev/null 2>&1; then
  echo "  docker already installed at $(command -v docker); skipping apt install"
else
  sudo apt-get update
  sudo apt-get install -y docker.io
  sudo systemctl enable --now docker
fi

# 2. Download and install gVisor (runsc).
echo "Downloading gVisor (runsc)..."
ARCH=$(uname -m)
URL=https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}
wget ${URL}/runsc ${URL}/runsc.sha512 \
  ${URL}/containerd-shim-runsc-v1 ${URL}/containerd-shim-runsc-v1.sha512

# Verify the download.
sha512sum -c runsc.sha512 -c containerd-shim-runsc-v1.sha512
rm -f *.sha512

# Make them executable and move to system bin.
chmod a+rx runsc containerd-shim-runsc-v1
sudo mv runsc containerd-shim-runsc-v1 /usr/local/bin

# 3. Register runsc as a Docker runtime.
# Docker reads runtimes from /etc/docker/daemon.json. We merge instead
# of clobbering so we don't drop any existing keys (registry mirrors,
# log-opts, etc.).
echo "Configuring Docker runtimes..."
sudo mkdir -p /etc/docker
DAEMON_JSON=/etc/docker/daemon.json
if [ -f "$DAEMON_JSON" ] && command -v jq >/dev/null 2>&1; then
  TMP=$(mktemp)
  sudo jq '.runtimes.runsc = {"path": "/usr/local/bin/runsc"}' "$DAEMON_JSON" > "$TMP"
  sudo mv "$TMP" "$DAEMON_JSON"
else
  cat <<'EOF' | sudo tee "$DAEMON_JSON" > /dev/null
{
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc"
    }
  }
}
EOF
fi

# 4. Reload the docker daemon so the new runtime is picked up.
echo "Reloading docker daemon..."
sudo systemctl restart docker || \
  echo "  (skipping systemctl restart — restart Docker Desktop manually if you're on WSL)"

echo "Setup Complete! You can now use --runtime=runsc with Docker."
echo "Verify with:  docker run --rm --runtime=runsc hello-world"
