# Development Guide

This guide explains how to develop the Chemistry Simulator with Vite's Hot Module Replacement (HMR).

## Quick Start: Dev Mode with Hot Reload

### Recommended: Use Dev Mode

```bash
# Start dev mode (hot module replacement)
make dev
# or
npm run dev
```

**What this does:**
- Starts Vite dev server on port 8000
- Watches for changes in `.ts` files
- Automatically reloads changed modules without full page refresh (HMR)
- Assets (images, fonts, etc.) are served and reload automatically
- Fast iteration cycle

### Alternative: Production Build

```bash
# Build for production
make build
# or
npm run build
```

## How Hot Module Replacement Works

### Code Changes (TypeScript files)

**Vite's Hot Module Replacement (HMR):**
- When you save a `.ts` file, Vite detects the change
- Only the changed module is reloaded
- Game state is preserved when possible
- No full page reload needed for most changes
- Instant feedback in the browser

**No installation needed** - Vite handles everything automatically!

### Asset Changes (Images, Fonts, etc.)

**Vite's asset handling:**
- Assets in `assets/` directory are served by Vite
- When you modify an asset file, the browser reloads it
- Works for:
  - Images (`.png`, `.jpg`, etc.)
  - Fonts (`.ttf`, `.otf`)
  - JSON files
  - Other static assets

**No configuration needed** - it works automatically!

## Development Workflow

### 1. Start Dev Mode

```bash
make dev
```

This will:
1. Start Vite dev server
2. Watch for file changes
3. Enable HMR for instant updates
4. Serve assets automatically

### 2. Make Changes

**Edit TypeScript code:**
- Save the file
- Browser automatically updates with changes
- No manual refresh needed (HMR)

**Edit assets:**
- Save the asset file
- Browser reloads the asset
- No restart needed!

### 3. Check for Errors (Fast Feedback)

In another terminal, run:
```bash
make check
# or
npx tsc --noEmit
```

This gives you instant feedback on TypeScript errors without running the dev server.

## Available Commands

### Development Commands

```bash
make dev          # Run dev server with HMR
make build        # Build for production
make check        # Type check without building
make test         # Run tests
make lint         # Run ESLint
make format       # Format code with Prettier
```

### Direct npm Commands

```bash
npm run dev       # Start dev server
npm run build     # Build for production
npm test          # Run tests
npm run lint      # Run ESLint
npm run format    # Format code
```

## Tips for Fast Development

### 1. Use Browser DevTools

**Chrome/Edge DevTools:**
- Open DevTools (F12)
- Use Console for debugging
- Use Sources tab for breakpoints
- Use Network tab for asset loading

**Firefox DevTools:**
- Similar features to Chrome
- Excellent for debugging

### 2. TypeScript Error Checking

**Use VS Code:**
- TypeScript errors show inline
- Hover for type information
- Auto-completion and navigation

**Use terminal:**
```bash
make check  # Fast type checking
```

### 3. Asset Development

**For asset changes:**
- No restart needed!
- Just save the asset file
- Browser automatically reloads it

**Supported asset types:**
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`
- Fonts: `.ttf`, `.otf`, `.woff`, `.woff2`
- JSON: `.json`
- Text: `.txt`, `.md`

### 4. Debugging

**Use browser DevTools:**
- Set breakpoints in Sources tab
- Use Console for logging
- Inspect Phaser3 game objects

**Use console.log:**
```typescript
console.log('Debug info:', variable);
```

**Use debugger statement:**
```typescript
debugger; // Pauses execution in DevTools
```

## Troubleshooting

### Dev Server Doesn't Start

**Check Node.js version:**
```bash
node --version  # Should be v18 or higher
```

**Check port availability:**
- Port 8000 might be in use
- Change port in `vite.config.ts` if needed

**Reinstall dependencies:**
```bash
rm -rf node_modules
npm install
```

### HMR Doesn't Work

**Check browser console:**
- Look for HMR connection errors
- Refresh the page if needed

**Verify file watching:**
- Vite uses native file watching
- Should work automatically

### TypeScript Errors

**Check tsconfig.json:**
- Ensure paths are correct
- Check include/exclude patterns

**Run type check:**
```bash
make check
```

### Slow Development

**Check for large files:**
- Large assets can slow down HMR
- Optimize images if needed

**Clear Vite cache:**
```bash
rm -rf .vite
```

## Best Practices

1. **Use `make dev` for active development**
   - Fastest iteration cycle
   - Automatic HMR

2. **Use `make check` for quick error checking**
   - Faster than full build
   - No dev server needed

3. **Test production build before committing**
   ```bash
   make build
   ```

4. **Run tests frequently**
   ```bash
   make test
   ```

5. **Format code before committing**
   ```bash
   make format
   ```

6. **Lint code before committing**
   ```bash
   make lint
   ```

## Next Steps

- See [README.md](README.md) for project overview
- See [TESTING.md](TESTING.md) for testing guide
- See [docs/](docs/) for architecture documentation
