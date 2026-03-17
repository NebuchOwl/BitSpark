
import { describe, it, expect } from 'vitest';
import { getBinaryName } from '../scripts/setup-ffmpeg.mjs';

describe('Cross-Platform Binary Setup', () => {

  // Phase 1 check: Does it handle Windows variants?
  it('should resolve Windows x64 correctly', () => {
    expect(getBinaryName('win32', 'x64')).toBe('ffmpeg-x86_64-pc-windows-msvc.exe');
  });

  it('should resolve Windows 32-bit (ia32) correctly', () => {
    expect(getBinaryName('win32', 'ia32')).toBe('ffmpeg-i686-pc-windows-msvc.exe');
  });

  it('should resolve Windows ARM64 correctly', () => {
    expect(getBinaryName('win32', 'arm64')).toBe('ffmpeg-aarch64-pc-windows-msvc.exe');
  });

  // Phase 1 check: Does it handle Linux variants?
  it('should resolve Linux x64 correctly', () => {
    expect(getBinaryName('linux', 'x64')).toBe('ffmpeg-x86_64-unknown-linux-gnu');
  });

  it('should resolve Linux 32-bit correctly', () => {
    expect(getBinaryName('linux', 'ia32')).toBe('ffmpeg-i686-unknown-linux-gnu');
  });

  it('should resolve Linux ARM64 correctly', () => {
    expect(getBinaryName('linux', 'arm64')).toBe('ffmpeg-aarch64-unknown-linux-gnu');
  });

  it('should resolve Linux ARMv7 correctly', () => {
    expect(getBinaryName('linux', 'arm')).toBe('ffmpeg-armv7-unknown-linux-gnueabihf');
  });

  // Phase 1 check: Does it handle MacOS variants?
  it('should resolve MacOS Intel correctly', () => {
    expect(getBinaryName('darwin', 'x64')).toBe('ffmpeg-x86_64-apple-darwin');
  });

  it('should resolve MacOS Silicon correctly', () => {
    expect(getBinaryName('darwin', 'arm64')).toBe('ffmpeg-aarch64-apple-darwin');
  });

  it('should throw error for unsupported platform', () => {
    expect(() => getBinaryName('freebsd', 'x64')).toThrow();
  });
});
