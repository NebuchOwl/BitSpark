# Developer & Contributing Guide
Thank you for your interest in improving **Video Optimizer**! This guide focuses on helping you understand the codebase, set up your development environment, and build the application for different platforms.
## 🏗️ Project Architecture
Video Optimizer uses the **Tauri v2** framework, combining a high-performance Rust backend with a modern web-based frontend.
### Folder Structure
| Path | Description |
| :--- | :--- |
| **`src/`** | **Frontend Code** (UI). Contains `main.js` (core logic), `style.css` (Tailwind), and `index.html`. |
| **`src-tauri/`** | **Backend Code** (System). Contains Rust entry points (`lib.rs`, `main.rs`) and configuration. |
| **`src-tauri/binaries/`** | External tools (FFmpeg) packaged with the app. |
| **`scripts/`** | Helper scripts for build automation and setup. |
### Key Concepts
1.  **Sidecar Integration (FFmpeg)**
    *   We do not process video using JavaScript or Rust directly. Instead, we bundle a pre-compiled `ffmpeg` binary.
    *   The app spawns this binary as a child process to handle heavy media tasks.
    *   *Reference*: `src-tauri/src/lib.rs` (Command management).
2.  **Local Streaming Server**
    *   To bypass browser security restrictions on local files, we spin up a local Rust server (Axum) on port `18493`.
    *   This allows smooth streaming of large video files directly to the frontend player.
---
## 🌍 Cross-Platform Development
Video Optimizer is designed for Windows, macOS, and Linux.
### 1. The FFmpeg Sidecar
Tauri requires specific binaries for each platform. We use `ffmpeg-static` to source these.
Run the setup script to automatically fetch and rename the correct binary for your OS:
```bash
npm install
node scripts/setup-ffmpeg.mjs
```
### 2. Development Mode
To start the app in development mode with hot-reloading:
```bash
npm run tauri dev
```
### 3. Building for Release
To build the optimized production executable (Installer):
```bash
npm run tauri build
```
*   **Windows Output**: `src-tauri/target/release/bundle/nsis/` (.exe)
*   **Linux Output**: `src-tauri/target/release/bundle/deb/` (.deb)
*   **macOS Output**: `src-tauri/target/release/bundle/dmg/` (.dmg)
---
## 📦 Release Process
We follow a manual release process to ensure quality and precision.
1.  **Build**: Run `npm run tauri build` to generate the installers.
2.  **Draft Release**: Go to the GitHub Releases page.
3.  **Template**: Use the `RELEASE_TEMPLATE.md` file in this repository to structure your release notes.
4.  **Upload**: Attach the generated installers (e.g., `VideoOptimizer_Setup_x64.exe`) to the release.
5.  **Publish**: tagging the release (e.g., `v1.0.0`).
---
## ⚡ Coding Standards
*   **Clean Code**: Variables should be descriptive (`videoPath` vs `v`).
*   **Modern JS**: Use `async/await` and ES6+ modules.
*   **Rust Safety**: Avoid `unwrap()` in production code used `match` or `if let`.
*   **Commits**: Use semantic commit messages (e.g., `feat: add trimming`, `fix: resolve crash`).

