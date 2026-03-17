import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Robust path resolution relative to the script location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const platform = process.platform;
const arch = process.arch;

const PLATFORM_MAP = {
  win32: {
    x64: { triple: 'x86_64-pc-windows-msvc', ext: '.exe', url: 'https://github.com/BtbN/FFmpeg-Builds/releases' },
    ia32: { triple: 'i686-pc-windows-msvc', ext: '.exe', url: 'https://github.com/BtbN/FFmpeg-Builds/releases' },
    arm64: { triple: 'aarch64-pc-windows-msvc', ext: '.exe', url: 'https://github.com/BtbN/FFmpeg-Builds/releases' },
  },
  linux: {
    x64: { triple: 'x86_64-unknown-linux-gnu', ext: '', url: 'https://johnvansickle.com/ffmpeg/' },
    ia32: { triple: 'i686-unknown-linux-gnu', ext: '', url: 'https://johnvansickle.com/ffmpeg/' },
    arm64: { triple: 'aarch64-unknown-linux-gnu', ext: '', url: 'https://johnvansickle.com/ffmpeg/' },
    arm: { triple: 'armv7-unknown-linux-gnueabihf', ext: '', url: 'https://johnvansickle.com/ffmpeg/' },
  },
  darwin: {
    x64: { triple: 'x86_64-apple-darwin', ext: '', url: 'https://evermeet.cx/ffmpeg/' },
    arm64: { triple: 'aarch64-apple-darwin', ext: '', url: 'https://evermeet.cx/ffmpeg/' },
  },
};

/**
 * Resolves the Tauri target triple for sidecar binaries.
 */
export function getBinaryName(plt, arc) {
  const info = PLATFORM_MAP[plt]?.[arc] || (plt === 'linux' && arc === 'arm' ? PLATFORM_MAP.linux.arm : null);
  if (!info) {
    throw new Error(`Unsupported platform/architecture: ${plt}/${arc}`);
  }
  return `ffmpeg-${info.triple}${info.ext}`;
}

async function setup() {
  console.log(`[Setup] Starting FFmpeg sidecar preparation...`);

  const info = PLATFORM_MAP[platform]?.[arch];
  if (!info) {
    console.error(`[Setup] Unsupported platform/architecture: ${platform}/${arch}`);
    process.exit(1);
  }

  const targetName = `ffmpeg-${info.triple}${info.ext}`;
  const binDir = path.resolve(rootDir, 'src-tauri', 'bin');

  console.log(`[Setup] Root Directory: ${rootDir}`);
  console.log(`[Setup] Target Directory: ${binDir}`);
  console.log(`[Setup] Target Binary Name: ${targetName}`);

  if (!fs.existsSync(binDir)) {
    console.log(`[Setup] Creating directory: ${binDir}`);
    fs.mkdirSync(binDir, { recursive: true });
  }

  const targetPath = path.join(binDir, targetName);

  // Try to use ffmpeg-static first as it is reliable for the host
  try {
    let ffmpegPath;
    try {
      const require = createRequire(import.meta.url);
      ffmpegPath = require('ffmpeg-static');
      console.log(`[Setup] ffmpeg-static found via require: ${ffmpegPath}`);
    } catch (e) {
      console.error(`[Setup] ffmpeg-static not found via require: ${e.message}`);
      // Fallback: search in node_modules manually
      const possibleFolders = [
        path.join(rootDir, 'node_modules', 'ffmpeg-static'),
        path.join(rootDir, '..', 'node_modules', 'ffmpeg-static')
      ];

      for (const folder of possibleFolders) {
        const exeFile = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        const file = path.join(folder, exeFile);
        console.log(`[Setup] Checking fallback path: ${file}`);
        if (fs.existsSync(file)) {
          ffmpegPath = file;
          break;
        }
      }
    }

    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      console.log(`[Setup] Copying from: ${ffmpegPath}`);
      console.log(`[Setup] Copying to: ${targetPath}`);

      // Ensure source is readable
      fs.accessSync(ffmpegPath, fs.constants.R_OK);

      fs.copyFileSync(ffmpegPath, targetPath);

      if (platform !== 'win32') {
        process.stdout.write(`[Setup] Setting permissions... `);
        fs.chmodSync(targetPath, 0o755);
        process.stdout.write(`Done.\n`);
      }
      console.log(`[Setup] Success! Binary ready at ${targetPath}`);
    } else {
      console.error(`[Setup] CRITICAL: Could not find FFmpeg source binary.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[Setup] Error setup-ffmpeg script:`, err);
    process.exit(1);
  }
}

// Check if run directly
if (import.meta.url.includes(path.basename(process.argv[1]))) {
  setup().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
