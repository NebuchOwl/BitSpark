import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// Use createRequire to import ffmpeg-static dynamically if needed, 
// or just standard import if we are in ESM. 
// However, ffmpeg-static provides a property 'path' that is the executable path.
// But it only gives the path for the CURRENT platform.

const require = createRequire(import.meta.url);

// --- Configuration ---
export const TARGETS = {
  // Windows
  'win32-x64': {
    triple: 'x86_64-pc-windows-msvc',
    ext: '.exe',
    url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' // Example
  },
  'win32-ia32': {
    triple: 'i686-pc-windows-msvc',
    ext: '.exe',
    url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' // Usually contains both or separate
  },
  'win32-arm64': {
    triple: 'aarch64-pc-windows-msvc',
    ext: '.exe',
    url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
  },
  // Linux
  'linux-x64': {
    triple: 'x86_64-unknown-linux-gnu',
    ext: '',
    url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
  },
  'linux-ia32': {
    triple: 'i686-unknown-linux-gnu',
    ext: '',
    url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-i686-static.tar.xz'
  },
  'linux-arm64': {
    triple: 'aarch64-unknown-linux-gnu',
    ext: '',
    url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz'
  },
  'linux-arm': {
    triple: 'armv7-unknown-linux-gnueabihf',
    ext: '',
    url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-armhf-static.tar.xz'
  },
  // MacOS
  'darwin-x64': {
    triple: 'x86_64-apple-darwin',
    ext: '',
    url: 'https://evermeet.cx/ffmpeg/ffmpeg-latest-mac.zip'
  },
  'darwin-arm64': {
    triple: 'aarch64-apple-darwin',
    ext: '',
    url: 'https://evermeet.cx/ffmpeg/ffmpeg-latest-mac.zip' // Universal or specific
  }
};

export function getTargetInfo(platform, arch) {
  // Normalize arch
  let normalizedArch = arch;
  if (arch === 'x64') normalizedArch = 'x64';
  if (arch === 'ia32') normalizedArch = 'ia32';
  if (arch === 'arm64') normalizedArch = 'arm64';
  if (arch === 'arm') normalizedArch = 'arm';

  const key = `${platform}-${normalizedArch}`;
  return TARGETS[key];
}

export function getBinaryName(platform, arch) {
  const info = getTargetInfo(platform, arch);
  if (!info) {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }
  return `ffmpeg-${info.triple}${info.ext}`;
}

async function main() {
  const platform = process.platform;
  const arch = process.arch;

  console.log(`[Setup] Detected Host: ${platform}-${arch}`);

  const info = getTargetInfo(platform, arch);
  if (!info) {
    console.error(`[Setup] Error: Platform ${platform}-${arch} is not supported by this script configuration.`);
    process.exit(1);
  }

  const targetName = `ffmpeg-${info.triple}${info.ext}`;
  const binariesDir = path.join(process.cwd(), 'src-tauri', 'binaries');

  if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true });
  }

  const targetPath = path.join(binariesDir, targetName);

  // Try to use ffmpeg-static first as it is reliable for the host
  try {
    let ffmpegPath;
    try {
      ffmpegPath = require('ffmpeg-static');
    } catch (e) {
      console.warn("[Setup] ffmpeg-static not found or failed to load. Fallback needed?");
    }

    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      console.log(`[Setup] Found ffmpeg-static at: ${ffmpegPath}`);
      console.log(`[Setup] Copying to: ${targetPath}`);
      
      // Ensure source is readable
      fs.accessSync(ffmpegPath, fs.constants.R_OK);
      
      fs.copyFileSync(ffmpegPath, targetPath);

      if (platform !== 'win32') {
        console.log(`[Setup] Setting executable permissions for Unix...`);
        fs.chmodSync(targetPath, 0o755);
      }
      console.log(`[Setup] Success! Binary ready at ${targetPath}`);
    } else {
      console.error(`[Setup] Failed to locate ffmpeg binary via ffmpeg-static.`);
      // Future: Implement download logic here using info.url
      console.log(`[Setup] Please manually download ${info.url} and place it at ${targetPath}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`[Setup] Error during setup: ${e.message}`);
    process.exit(1);
  }
}

// execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
