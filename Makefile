.PHONY: help test build dev clean lint format check install

help: ## Show this help message
	@echo "Chemistry Simulator - Build and Test Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install: ## Install dependencies
	@echo "Installing dependencies..."
	npm install

dev: ## Run development server with hot reload
	@echo "Starting Chemistry Simulator (dev mode with hot reload)..."
	@echo "The game will automatically reload when you save changes"
	@echo "Open http://localhost:8000 in your browser"
	@echo "Press Ctrl+C to stop"
	npm run dev

build: ## Build the project for production
	@echo "Building project..."
	npm run build

test: ## Run all tests
	@echo "Running tests..."
	npm test

lint: ## Run ESLint
	@echo "Running ESLint..."
	npm run lint

format: ## Format code with Prettier
	@echo "Formatting code..."
	npm run format

check: ## Run type checking
	@echo "Checking TypeScript..."
	npm run type-check || npx tsc --noEmit

clean: ## Clean build artifacts and node_modules
	@echo "Cleaning build artifacts..."
	rm -rf dist node_modules .vite

check-all: lint format check test ## Run all checks (lint, format, type-check, tests)
