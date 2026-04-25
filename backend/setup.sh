#!/bin/bash
# setup-host.sh - Run this directly in your WSL terminal (not inside Docker)

echo "Starting Host Infrastructure Setup..."

# 1. Install Docker (if not already installed)
echo "Installing Docker..."
sudo apt-get update
sudo apt-get install -y docker.io

# 2. Download and install gVisor (runsc)
echo "Downloading gVisor (runsc)..."
set -e
ARCH=$(uname -m)
URL=https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}
wget ${URL}/runsc ${URL}/runsc.sha512 \
  ${URL}/containerd-shim-runsc-v1 ${URL}/containerd-shim-runsc-v1.sha512

# Verify the download
sha512sum -c runsc.sha512 -c containerd-shim-runsc-v1.sha512
rm -f *.sha512

# Make them executable and move to system bin
chmod a+rx runsc containerd-shim-runsc-v1
sudo mv runsc containerd-shim-runsc-v1 /usr/local/bin

# 3. Configure Docker to use gVisor
echo "Configuring Docker runtimes..."

# The 'runsc install' command automatically updates /etc/docker/daemon.json
sudo /usr/local/bin/runsc install

# Restart Docker so it loads the new gVisor runtime
echo "Restarting Docker daemon..."
sudo systemctl restart docker

echo "Setup Complete! You can now use --runtime=runsc with Docker."