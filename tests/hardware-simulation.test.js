
import { describe, it, expect } from 'vitest';
import { getOptimizerArgs } from '../src/utils/optimizer-logic.js';

describe('Hardware Simulation & Command Generation', () => {

  const baseConfig = {
    isAdvancedMode: false,
    currentQuality: 'medium',
    encoderMode: 'cpu-low',
    advCodec: 'copy',
    advCrf: '23',
    advPreset: 'medium',
    advBackend: 'cpu',
    advResolution: 'original',
    advFps: 'original',
    advAudio: 'copy'
  };

  it('should generate valid CPU command (Simple Mode)', () => {
    const args = getOptimizerArgs({
      ...baseConfig,
      isAdvancedMode: false,
      encoderMode: 'cpu-low' // Force CPU Low
    });
    // Expected: -vcodec libx264 -crf 18 -preset medium -threads 2
    expect(args).toContain('-vcodec');
    expect(args).toContain('libx264');
    expect(args).toContain('-threads');
    expect(args).toContain('2');
  });

  it('should generate valid NVIDIA command (Simple Mode)', () => {
    const args = getOptimizerArgs({
      ...baseConfig,
      isAdvancedMode: false,
      encoderMode: 'gpu-nvidia'
    });
    // Expected: -c:v h264_nvenc -cq 18 -preset p4
    expect(args).toContain('-c:v');
    expect(args).toContain('h264_nvenc');
    expect(args).toContain('-preset');
    expect(args).toContain('p4');
  });

  it('should generate valid AMD command (Simple Mode)', () => {
    const args = getOptimizerArgs({
      ...baseConfig,
      isAdvancedMode: false,
      encoderMode: 'gpu-amd'
    });
    expect(args).toContain('h264_amf');
    expect(args).toContain('-rc');
    expect(args).toContain('cqp');
  });

  it('should generate valid Intel QSV command (Simple Mode)', () => {
    const args = getOptimizerArgs({
      ...baseConfig,
      isAdvancedMode: false,
      encoderMode: 'gpu-intel'
    });
    expect(args).toContain('h264_qsv');
    expect(args).toContain('-global_quality');
  });

  // --- Advanced Mode Simulations ---

  it('should handle custom resolution scaling', () => {
    const args = getOptimizerArgs({
      ...baseConfig,
      isAdvancedMode: true,
      advCodec: 'libx264',
      advResolution: 'custom',
      advResW: '1280',
      advResH: '720'
    });
    expect(args).toContain('-vf');
    expect(args).toContain('scale=1280:720');
  });

  it('should handle FPS conversion', () => {
    const args = getOptimizerArgs({
      ...baseConfig,
      isAdvancedMode: true,
      advCodec: 'libx264',
      advFps: '60'
    });
    expect(args).toContain('-r');
    expect(args).toContain('60');
  });

  it('should handle Audio removal', () => {
    const args = getOptimizerArgs({
      ...baseConfig,
      isAdvancedMode: true,
      advAudio: 'none'
    });
    expect(args).toContain('-an');
  });

  it('should inject Custom Flags', () => {
    const args = getOptimizerArgs({
      ...baseConfig,
      isAdvancedMode: true,
      advCustom: '-tune animation -profile:v high'
    });
    expect(args).toContain('-tune');
    expect(args).toContain('animation');
    expect(args).toContain('-profile:v');
    expect(args).toContain('high');
  });

});
