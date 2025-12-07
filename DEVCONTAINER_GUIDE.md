# Devcontainer Testing Guide

This guide explains how to test and run the game from within VS Code in a devcontainer.

## Development Mode (Recommended) ✅

**Best for:** Devcontainer development, easy testing, no X11 setup

### Quick Start

**Single command:**
```bash
make dev
# or
npm run dev
```

This one command:
- Starts Vite dev server on port 8000
- Enables Hot Module Replacement (HMR)
- Automatically reloads on code changes
- Just open your browser to see updates!

VS Code will automatically forward port 8000. Open `http://localhost:8000` in your browser.

**Advantages:**
- ✅ No X11 required
- ✅ Works on any OS
- ✅ Easy to share (just URL)
- ✅ Browser DevTools for debugging
- ✅ Hot Module Replacement (HMR) for instant updates
- ✅ Native web performance

## Recommended Workflow

### For Active Development

**Use dev mode:**
```bash
# Start dev server with HMR
make dev
```

This will:
- Start Vite dev server
- Watch for file changes
- Automatically reload changed modules
- Serve assets automatically

### For Production Testing

**Build and test production version:**
```bash
# Build for production
make build

# Serve production build (optional)
npx vite preview
```

## VS Code Port Forwarding

VS Code automatically forwards ports defined in `devcontainer.json`:
- Port 8000: Vite dev server (default)
- Port 5173: Alternative Vite port (if configured)

To manually forward a port:
1. Open VS Code's Ports panel (bottom)
2. Click "Forward a Port"
3. Enter the port number
4. Click the globe icon to open in browser

## Troubleshooting

### Dev Server Doesn't Start

1. **Check Node.js version:**
   ```bash
   node --version  # Should be v18 or higher
   ```

2. **Check port availability:**
   - Port 8000 might be in use
   - Change port in `vite.config.ts` if needed

3. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules
   npm install
   ```

### Port Not Forwarding

1. Check VS Code Ports panel
2. Verify port is in `devcontainer.json` `forwardPorts`
3. Try manually forwarding the port

### HMR Doesn't Work

1. **Check browser console:**
   - Look for HMR connection errors
   - Refresh the page if needed

2. **Verify file watching:**
   - Vite uses native file watching
   - Should work automatically in devcontainer

### TypeScript Errors

1. **Check tsconfig.json:**
   - Ensure paths are correct
   - Check include/exclude patterns

2. **Run type check:**
   ```bash
   make check
   ```

## Comparison

| Method | Setup | Performance | Devcontainer Friendly | Best For |
|--------|-------|-------------|----------------------|----------|
| Dev Mode (Vite) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Perfect | Development |

## Next Steps

- See [DEV_GUIDE.md](DEV_GUIDE.md) for development workflow
- See [README.md](README.md) for project overview
- See [TESTING.md](TESTING.md) for testing guide
