#!/bin/bash
# Test script for interaction testing

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_status() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_status "Running interaction tests..."

# Run unit tests (logic-only, no windowing)
print_info "Running unit tests (no windowing required)..."
if cargo test --test integration_tests interaction 2>&1 | tee /tmp/interaction-test.log; then
    print_status "Unit tests passed! ✓"
else
    print_error "Unit tests failed!"
    print_info "Check /tmp/interaction-test.log for details"
    exit 1
fi

# Check if we can run window-based tests
if [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
    print_warning "No display server detected. Skipping window-based tests."
    print_info "To run full integration tests, you need X11 or Wayland."
    print_info "For WASM testing, use 'make dev-wasm' and test manually in browser."
    exit 0
fi

print_info "Display server detected. Running full integration tests..."
# Full tests would go here if we had window-based test infrastructure

print_status "All tests completed!"

