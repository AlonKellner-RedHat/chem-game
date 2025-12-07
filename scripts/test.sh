#!/bin/bash
# Test runner script for Chemistry Simulator

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Parse arguments
TEST_TYPE="${1:-all}"

case "$TEST_TYPE" in
    unit)
        print_status "Running unit tests..."
        cargo test --lib
        ;;
    integration)
        print_status "Running integration tests..."
        cargo test --test integration_tests
        ;;
    all|*)
        print_status "Running all tests..."
        cargo test --lib --test integration_tests
        ;;
esac

print_status "Tests completed successfully!"

