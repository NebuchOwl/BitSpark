# Video Optimizer
![License](https://img.shields.io/github/license/NebuchOwl/video-optimizer?style=for-the-badge&color=blue)
![Version](https://img.shields.io/github/v/release/NebuchOwl/video-optimizer?style=for-the-badge&color=orange)
![Downloads](https://img.shields.io/github/downloads/NebuchOwl/video-optimizer/total?style=for-the-badge&color=green)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=for-the-badge)
**Video Optimizer** is a high-performance media toolkit built with **Tauri v2**, **Rust**, and **FFmpeg**. Designed for speed and simplicity, it allows you to compress, convert, trim, and analyze video files through a stunning, modern interface.
![Screenshot Placeholder](https://via.placeholder.com/800x450.png?text=Application+Screenshot)
---
## ✨ Features
### 🎬 Optimization & Conversion
*   **Smart Compression**: Significantly reduce file size without visible quality loss using **H.264**, **H.265 (HEVC)**, and **AV1**.
*   **Hardware Acceleration**: Full support for **NVIDIA (NVENC)**, **AMD (AMF)**, and **Intel (QSV)** allowing for lightning-fast exports.
*   **Batch Processing**: Queue multiple files and let the optimizer run in the background.
### ✂️ Precision Editing
*   **Lossless Trimming**: Cut unwanted segments instantly without re-encoding.
*   **Frame-Accurate Player**: Review your footage with a built-in high-performance player.
### 🎧 Audio Lab
*   **Extraction**: Convert video audio to MP3/AAC instantly.
*   **Normalization**: Fix audio levels automatically.
### 🎨 Modern UI
*   **Theming**: Switch between **Cosmic**, **Light**, **Midnight**, and **Sunset** themes.
*   **Respnsive**: Adaptive layout that works on various screen sizes.
---
## 🛠️ Tech Stack
*   **Core**: [Rust](https://www.rust-lang.org/) (Tauri v2)
*   **Frontend**: JavaScript, [Tailwind CSS](https://tailwindcss.com/)
*   **Engine**: [FFmpeg 6.0+](https://ffmpeg.org/) (Sidecar Binary)
---
## 🚀 Getting Started
### Prerequisites
*   **Node.js** (v18 or newer)
*   **Rust** (Latest stable)
### Installation
1.  **Clone the Repository**
    ```bash
    git clone https://github.com/NebuchOwl/video-optimizer.git
    cd video-optimizer
    ```
2.  **Install Dependencies**
    ```bash
    npm install
    ```
3.  **Setup FFmpeg**
    ```bash
    node scripts/setup-ffmpeg.mjs
    ```
4.  **Run Locally**
    ```bash
    npm run tauri dev
    ```
5.  **Build for Production**
    ```bash
    npm run tauri build
    ```
---
## 🤝 Contributing
We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to set up the development environment and submit pull requests.
## 📄 License
**Video Optimizer** is available for personal and educational use.
See [LICENSE.txt](LICENSE.txt) for more details.
---
<p align="center">
  Made with ❤️ by <a href="https://github.com/NebuchOwl">NebuchOwl</a>
</p>

The use of this software does **not** grant any patent or codec license.
Certain codecs (e.g. H.264, H.265/HEVC, ProRes, AAC) may be subject to patent or licensing restrictions.

Users are solely responsible for ensuring compliance with all applicable codec and patent laws.
