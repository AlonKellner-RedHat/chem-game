# Chemistry Simulator

A 2D chemistry simulation game built with TypeScript and Phaser3.

## Project Status

Phase 0: Foundation Setup - **In Progress**

## Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)

### System Dependencies

No additional system dependencies required. The devcontainer automatically installs Node.js and npm.

## Building

```bash
npm install
npm run build
```

## Running

### Development Mode (Recommended)

**Dev Server with Hot Reload:**
```bash
# Start development server with hot module replacement
make dev
# or
npm run dev
```

This command:
- ✅ Starts Vite dev server on port 8000
- ✅ Automatically reloads when you save changes (HMR)
- ✅ Open http://localhost:8000 in your browser
- ✅ No build step needed for development

Perfect for devcontainer development - runs natively in browser!

### Production Build

```bash
# Build for production
make build
# or
npm run build
```

The built files will be in the `dist/` directory.

## Testing

See [TESTING.md](TESTING.md) for detailed testing guide.

**Quick Start:**
```bash
# Run all tests
make test
# or
npm test
```

## Project Structure

```
chem-game/
  src/
    main.ts                 # Application entry point
    scenes/
      GameScene.ts          # Main game scene
    core/                   # Core game systems
      Grid.ts               # Grid system
      InputManager.ts       # Input handling
      DebugView.ts          # Debug view system
    config/
      gameConfig.ts         # Phaser3 game configuration
    types/
      index.ts              # TypeScript type definitions
  tests/                    # Test files
  assets/
    sprites/                # Sprite assets
    fonts/                  # Font assets
  .devcontainer/            # Devcontainer configuration
```

## Devcontainer

This project includes a devcontainer configuration for VS Code. Open the project in VS Code and select "Reopen in Container" when prompted.

**Testing in Devcontainer:**
- **Recommended:** Use dev mode (`make dev` or `npm run dev`) - runs in browser
- See [DEVCONTAINER_GUIDE.md](DEVCONTAINER_GUIDE.md) for all testing options

The devcontainer includes:
- Node.js and npm
- TypeScript
- ESLint and Prettier
- Git configuration
- Port forwarding for dev server (port 8000)

## Current Features

- ✅ Phaser3 game setup
- ✅ Grid system with snapping
- ✅ Input system with mouse tracking
- ✅ Debug view system (basic)
- ✅ Basic rendering pipeline
- ✅ Test framework setup

## Next Steps

See the implementation plan in `docs/12_Demo_Build_Plan.md` for the full roadmap.
