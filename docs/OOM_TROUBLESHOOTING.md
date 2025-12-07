# Out of Memory (OOM) Troubleshooting

## Problem

The linker is being killed (signal 9) during compilation, indicating an Out of Memory error. This happens even though the project is relatively simple.

## Root Causes

### 1. Bevy is Large
- **Bevy 0.17 with default features** includes many heavy dependencies:
  - Audio system (rodio, cpal, alsa)
  - Rendering pipeline (wgpu, naga, shader compilation)
  - UI system (cosmic-text, font rendering)
  - Window management (winit, wayland, X11)
- **Debug builds** are 5-10x larger than release builds
- **Linking phase** requires loading all object files into memory simultaneously

### 2. Memory Constraints
- Current setup: ~7.7GB total RAM, ~4.3GB available
- Swap is fully utilized (1GB)
- Target directory: 8.1GB (2.7GB of rlib files)
- Linker needs to hold all symbols in memory during linking

### 3. Parallel Compilation
- Cargo defaults to using all CPU cores
- Each parallel job consumes memory
- Multiple jobs + linker = memory pressure

## Solutions

### Solution 0: Increase Devcontainer Memory (Recommended)

The most effective solution is to increase the memory available to the devcontainer:

#### Option A: Using Docker Compose (Recommended)

1. **Create `docker-compose.yml`** in `.devcontainer/`:
   ```yaml
   version: '3.8'
   services:
     chem-game:
       image: mcr.microsoft.com/devcontainers/rust:1-1-bullseye
       volumes:
         - ..:/workspaces/chem-game:cached
       command: sleep infinity
       deploy:
         resources:
           limits:
             memory: 8G      # Increase this based on your system
             cpus: '4'
           reservations:
             memory: 4G
             cpus: '2'
       mem_limit: 8g          # Alternative syntax
       mem_reservation: 4g
       environment:
         - CARGO_BUILD_JOBS=1
       stdin_open: true
       tty: true
   ```

2. **Update `devcontainer.json`** to use docker-compose:
   ```json
   {
     "dockerComposeFile": "docker-compose.yml",
     "service": "chem-game",
     "workspaceFolder": "/workspaces/chem-game"
   }
   ```

3. **Rebuild the devcontainer** in VS Code

#### Option B: Docker Desktop Settings

If using Docker Desktop directly:

1. Open Docker Desktop
2. Go to Settings → Resources
3. Increase Memory slider (recommended: 8GB+ for Bevy projects)
4. Increase Swap if available (recommended: 2GB+)
5. Click "Apply & Restart"

#### Option C: WSL2 Configuration (Windows)

If using WSL2:

1. Create/edit `C:\Users\YourUsername\.wslconfig`:
   ```
   [wsl2]
   memory=8GB
   swap=2GB
   processors=4
   ```

2. Restart WSL2:
   ```powershell
   wsl --shutdown
   ```

**Pros:** Most effective, allows full compilation
**Cons:** Requires system resources, may need to restart devcontainer

### Solution 1: Reduce Parallel Jobs (Quick Fix)

Limit the number of parallel compilation jobs:

```bash
# Set environment variable
export CARGO_BUILD_JOBS=1

# Or use in command
CARGO_BUILD_JOBS=1 cargo test --test integration_tests wasm_canvas_should_be_interactive
```

**Pros:** Immediate fix, reduces memory usage
**Cons:** Slower compilation

### Solution 2: Use Release Mode for Tests

Release builds use less memory during linking:

```bash
cargo test --test integration_tests wasm_canvas_should_be_interactive --release
```

**Pros:** Faster linking, less memory, optimized code
**Cons:** Slower compilation, harder to debug

### Solution 3: Disable Unnecessary Bevy Features

Reduce Bevy's footprint by disabling unused features:

```toml
# In Cargo.toml
[dependencies]
bevy = { version = "0.17", default-features = false, features = [
    "bevy_asset",
    "bevy_core_pipeline",
    "bevy_gizmos",
    "bevy_render",
    "bevy_sprite",
    "bevy_text",
    "bevy_ui",
    "bevy_winit",
    "bevy_window",
    "bevy_transform",
    "bevy_hierarchy",
    "bevy_input",
    "bevy_time",
    "bevy_log",
    "bevy_app",
    "bevy_ecs",
    "bevy_reflect",
    "bevy_math",
    "bevy_utils",
    "bevy_tasks",
    "bevy_diagnostic",
    "bevy_core",
    "default_font",
    "png",
    "webgl2",
    # Remove these to save memory:
    # "bevy_audio",      # Heavy audio dependencies
    # "bevy_pbr",        # 3D rendering (not needed for 2D)
    # "hdr",             # HDR support
] }
```

**Pros:** Significantly reduces memory usage
**Cons:** May break if code uses disabled features

### Solution 4: Configure Linker Settings

Optimize linker memory usage:

```toml
# In .cargo/config.toml
[build]
jobs = 1  # Reduce parallel jobs

[target.'cfg(not(target_arch = "wasm32"))']
rustflags = [
    "-C", "link-arg=-Wl,--no-keep-memory",  # Use less memory
    "-C", "link-arg=-Wl,--reduce-memory-overheads",
]

[profile.dev]
opt-level = 1  # Some optimization even in dev mode
incremental = true
```

**Pros:** Reduces linker memory usage
**Cons:** Slightly slower compilation

### Solution 5: Increase Swap Space

Add more swap space to handle memory spikes:

```bash
# Check current swap
free -h

# Add swap file (if needed)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

**Pros:** Handles memory spikes
**Cons:** Slower (swap is disk-based)

### Solution 6: Use Incremental Compilation

Enable incremental compilation to reduce memory usage:

```toml
# In Cargo.toml or .cargo/config.toml
[profile.dev]
incremental = true
```

**Pros:** Faster rebuilds, less memory per compilation
**Cons:** Uses more disk space

### Solution 7: Clean Build Artifacts

Remove old build artifacts to free memory:

```bash
# Clean everything
cargo clean

# Or clean just test artifacts
cargo clean --tests
```

**Pros:** Frees disk space and memory
**Cons:** Next build will be slower

## Recommended Approach

For this project, use a combination:

1. **Immediate fix:** Reduce parallel jobs
   ```bash
   export CARGO_BUILD_JOBS=1
   ```

2. **Long-term:** Optimize Bevy features
   - Disable `bevy_audio` if not needed
   - Disable `bevy_pbr` (3D rendering) for 2D-only project

3. **For tests:** Use release mode
   ```bash
   cargo test --release
   ```

## Memory Usage Breakdown

- **Bevy dependencies:** ~2.7GB of rlib files
- **Linker memory:** ~2-4GB during linking
- **Parallel jobs:** ~500MB-1GB per job
- **Total needed:** ~4-6GB for full parallel build

## Quick Test

Test with minimal memory usage:

```bash
# Single job, release mode
CARGO_BUILD_JOBS=1 cargo test --test integration_tests wasm_canvas_should_be_interactive --release
```

This should work even with limited memory.

