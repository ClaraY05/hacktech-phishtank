#!/bin/bash
# setup-host.sh - Run this directly in your WSL terminal (not inside Docker)

echo "Starting Host Infrastructure Setup..."

# 1. Install Podman
echo "Installing Podman..."
sudo apt-get update
sudo apt-get install -y podman

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

# 3. Configure Podman to use gVisor
echo "Configuring Podman runtimes..."
sudo mkdir -p /etc/containers
# Create or overwrite the containers.conf file with the runsc configuration
cat <<EOF | sudo tee /etc/containers/containers.conf > /dev/null
[engine.runtimes]
runsc = [
    "/usr/local/bin/runsc"
]
EOF

echo "Setup Complete! You can now use --runtime=runsc with Podman."