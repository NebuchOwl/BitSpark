export const codecsByBackend = {
  cpu: [
    { val: 'libx264', label: 'H.264 (Standard)' },
    { val: 'libx265', label: 'H.265 (HEVC)' },
    { val: 'libaom-av1', label: 'AV1 (Next Gen)' },
    { val: 'libvpx-vp9', label: 'VP9 (Web)' },
    { val: 'prores_ks', label: 'ProRes (Editing)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ],
  'cpu-low': [
    { val: 'libx264', label: 'H.264 (Standard)' },
    { val: 'libx265', label: 'H.265 (HEVC)' },
    { val: 'libaom-av1', label: 'AV1 (Next Gen)' },
    { val: 'libvpx-vp9', label: 'VP9 (Web)' },
    { val: 'prores_ks', label: 'ProRes (Editing)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ],
  nvidia: [
    { val: 'h264_nvenc', label: 'H.264 (NVIDIA GPU)' },
    { val: 'hevc_nvenc', label: 'H.265 (NVIDIA GPU)' },
    { val: 'av1_nvenc', label: 'AV1 (NVIDIA RTX 40+)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ],
  amd: [
    { val: 'h264_amf', label: 'H.264 (AMD GPU)' },
    { val: 'hevc_amf', label: 'H.265 (AMD GPU)' },
    { val: 'av1_amf', label: 'AV1 (AMD RDNA3+)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ],
  intel: [
    { val: 'h264_qsv', label: 'H.264 (Intel GPU)' },
    { val: 'hevc_qsv', label: 'H.265 (Intel GPU)' },
    { val: 'vp9_qsv', label: 'VP9 (Intel GPU)' },
    { val: 'av1_qsv', label: 'AV1 (Intel Arc)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ]
};

export function getOptimizerArgs(config) {
  const {
    isAdvancedMode,
    advCodec,
    advCrf,
    advPreset,
    advBackend,
    advResolution,
    advResW,
    advResH,
    advFps,
    advFpsCustom,
    advAudio,
    advCustom,
    currentQuality,
    encoderMode
  } = config;

  const args = [];
  if (isAdvancedMode) {
    const codec = advCodec;
    if (codec !== 'copy') {
      args.push('-c:v', codec);

      // Hardware specific flags
      if (codec.includes('nvenc')) {
        args.push('-cq', advCrf);
        let pVal = 'p4'; // Default Medium
        if (advPreset.includes('fast')) pVal = 'p2';
        if (advPreset.includes('slow')) pVal = 'p6';
        args.push('-preset', pVal);
      } else if (codec.includes('amf')) {
        args.push('-rc', 'cqp');
        args.push('-qp-i', advCrf);
        args.push('-qp-p', advCrf);
        let qVal = 'balanced';
        if (advPreset.includes('fast')) qVal = 'speed';
        if (advPreset.includes('slow')) qVal = 'quality';
        args.push('-quality', qVal);
      } else if (codec.includes('qsv')) {
        args.push('-global_quality', advCrf);
        args.push('-preset', advPreset);
      } else if (codec === 'prores_ks') {
        args.push('-profile:v', '3');
        args.push('-pix_fmt', 'yuv422p10le');
      } else {
        // CPU
        args.push('-crf', advCrf);
        if (advBackend === 'cpu-low') {
          args.push('-threads', '2');
        }
        if (!codec.includes('libvpx')) {
          args.push('-preset', advPreset);
        } else {
          args.push('-b:v', '0');
        }
      }
    } else {
      args.push('-c:v', 'copy');
    }

    // Resolution
    if (advResolution === 'custom') {
      const w = advResW || -1;
      const h = advResH || -1;
      if (w != -1 || h != -1) args.push('-vf', `scale=${w}:${h}`);
    } else if (advResolution !== 'original') {
      args.push('-vf', `scale=${advResolution}`);
    }
    // FPS
    if (advFps === 'custom') {
      if (advFpsCustom) args.push('-r', advFpsCustom);
    } else if (advFps !== 'original') {
      args.push('-r', advFps);
    }
    // Audio
    if (advAudio === 'none') {
      args.push('-an');
    } else if (advAudio !== 'copy') {
      args.push('-c:a', advAudio);
    } else {
      args.push('-c:a', 'copy');
    }
    // Custom
    if (advCustom && advCustom.trim()) {
      args.push(...advCustom.trim().split(/\s+/));
    }

  } else {
    // Simple Mode
    let crf = '23';
    if (currentQuality === 'medium') crf = '18';
    if (currentQuality === 'high') crf = '28';

    switch (encoderMode) {
      case 'gpu-nvidia': args.push('-c:v', 'h264_nvenc', '-cq', crf, '-preset', 'p4'); break;
      case 'gpu-amd': args.push('-c:v', 'h264_amf', '-rc', 'cqp', '-qp-i', crf, '-qp-p', crf); break;
      case 'gpu-intel': args.push('-c:v', 'h264_qsv', '-global_quality', crf); break;
      case 'cpu-low': args.push('-vcodec', 'libx264', '-crf', crf, '-preset', 'medium', '-threads', '2'); break;
      default: args.push('-vcodec', 'libx264', '-crf', crf, '-preset', 'fast'); break;
    }
  }
  return args;
}
