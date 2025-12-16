#!/bin/bash
# Setup script for msdfgen (SVG to MSDF converter)
# This script installs build dependencies and compiles msdfgen from source

set -e

MSDFGEN_VERSION="v1.13"
INSTALL_DIR="/usr/local/bin"

# Check if msdfgen is already installed
if command -v msdfgen &> /dev/null; then
    echo "msdfgen is already installed: $(msdfgen --version 2>&1 | head -1)"
    exit 0
fi

echo "Installing msdfgen build dependencies..."
sudo apt-get update
sudo apt-get install -y cmake build-essential libfreetype6-dev libpng-dev libtinyxml2-dev

echo "Downloading and building msdfgen ${MSDFGEN_VERSION}..."
cd /tmp
rm -rf msdfgen-build
mkdir msdfgen-build
cd msdfgen-build

# Clone msdfgen repository
git clone --depth 1 --branch ${MSDFGEN_VERSION} https://github.com/Chlumsky/msdfgen.git
cd msdfgen

# Build msdfgen without vcpkg - use system libraries
mkdir build
cd build
cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DMSDFGEN_BUILD_STANDALONE=ON \
    -DMSDFGEN_USE_VCPKG=OFF \
    -DMSDFGEN_USE_SKIA=OFF \
    -DMSDFGEN_INSTALL=OFF
make -j$(nproc)

# Install msdfgen binary
sudo cp msdfgen ${INSTALL_DIR}/
sudo chmod +x ${INSTALL_DIR}/msdfgen

# Cleanup
cd /tmp
rm -rf msdfgen-build

echo "msdfgen installed successfully!"
msdfgen --version 2>&1 | head -1 || echo "msdfgen ready"
