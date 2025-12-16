#!/bin/bash
# Setup WebGPU (Dawn) bindings for linux-arm64 devcontainers
# Downloads pre-built binary from GitHub Releases

set -e

# Configuration
NODE_WEBGPU_VERSION="0.3.8"
REPO="AlonKellner-RedHat/chem-game"
BINARY_NAME="linux-arm64.dawn.node"
TARGET_DIR="node_modules/webgpu/dist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}[WebGPU Setup]${NC} Checking platform..."

# Check if we're on linux-arm64
ARCH=$(uname -m)
OS=$(uname -s)

if [ "$OS" != "Linux" ] || [ "$ARCH" != "aarch64" ]; then
    echo -e "${GREEN}[WebGPU Setup]${NC} Not linux-arm64 (${OS}/${ARCH}), skipping Dawn binary download."
    echo -e "${GREEN}[WebGPU Setup]${NC} WebGPU bindings should be available via npm package."
    exit 0
fi

echo -e "${YELLOW}[WebGPU Setup]${NC} Platform: linux-arm64"

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${YELLOW}[WebGPU Setup]${NC} Target directory not found. Run 'npm install' first."
    exit 0
fi

# Check if binary already exists
if [ -f "$TARGET_DIR/$BINARY_NAME" ]; then
    echo -e "${GREEN}[WebGPU Setup]${NC} Dawn binary already exists, skipping download."
    exit 0
fi

# Download URL
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/dawn-arm64-v${NODE_WEBGPU_VERSION}/${BINARY_NAME}"

echo -e "${YELLOW}[WebGPU Setup]${NC} Downloading Dawn ARM64 binary..."
echo -e "${YELLOW}[WebGPU Setup]${NC} URL: ${DOWNLOAD_URL}"

# Attempt download
if curl -L -f -o "$TARGET_DIR/$BINARY_NAME" "$DOWNLOAD_URL" 2>/dev/null; then
    chmod +x "$TARGET_DIR/$BINARY_NAME"
    echo -e "${GREEN}[WebGPU Setup]${NC} Successfully downloaded Dawn ARM64 binary!"
    echo -e "${GREEN}[WebGPU Setup]${NC} WebGPU shader tests are now available."
    ls -la "$TARGET_DIR/$BINARY_NAME"
else
    echo -e "${RED}[WebGPU Setup]${NC} Failed to download Dawn ARM64 binary."
    echo -e "${YELLOW}[WebGPU Setup]${NC} The binary may not be built yet."
    echo -e "${YELLOW}[WebGPU Setup]${NC} To build it, run the 'Build Dawn ARM64' workflow on GitHub Actions."
    echo -e "${YELLOW}[WebGPU Setup]${NC} WebGPU shader tests will be skipped until the binary is available."
    # Don't fail the script - the container should still work without GPU tests
    exit 0
fi

