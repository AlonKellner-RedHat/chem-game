#!/bin/bash
# Game runner script for Chemistry Simulator

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_status() {
    echo -e "${GREEN}[RUN]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Parse arguments
MODE="${1:-debug}"

case "$MODE" in
    debug)
        print_status "Starting Chemistry Simulator (debug mode)..."
        print_info "Press Ctrl+C to stop"
        print_info "Note: Requires X11 display server. Use 'dev' mode for auto-reload."
        cargo run
        ;;
    dev|watch)
        print_status "Starting Chemistry Simulator (dev mode with auto-reload)..."
        print_info "The game will automatically restart when you save changes to .rs files"
        print_info "Assets (images, scenes) will hot-reload automatically"
        print_info "Press Ctrl+C to stop"
        if ! command -v cargo-watch &> /dev/null; then
            print_warning "cargo-watch not found. Installing..."
            cargo install cargo-watch --quiet
        fi
        cargo watch -x "run"
        ;;
    wasm)
        print_status "Starting WASM dev mode (build + serve + auto-reload)..."
        print_info "Open http://localhost:8000 in your browser"
        print_info "Press Ctrl+C to stop"
        ./scripts/dev-wasm.sh
        ;;
    release)
        print_status "Building in release mode..."
        cargo build --release
        print_status "Starting Chemistry Simulator (release mode)..."
        print_info "Press Ctrl+C to stop"
        print_info "Note: Requires X11 display server. Set BEVY_HEADLESS=1 for headless mode."
        cargo run --release
        ;;
    headless)
        print_status "Starting Chemistry Simulator (headless mode)..."
        BEVY_HEADLESS=1 cargo run
        ;;
    *)
        echo "Usage: $0 [debug|dev|release|headless]"
        echo "  debug (default) - Run in debug mode (requires display)"
        echo "  dev             - Run in dev mode with auto-reload on code changes"
        echo "  release         - Build and run in release mode (requires display)"
        echo "  headless        - Run in headless mode (no display required)"
        exit 1
        ;;
esac

