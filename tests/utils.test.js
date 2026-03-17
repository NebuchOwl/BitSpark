/**
 * Unit Tests for Utility Functions
 * Tests helper functions used across the application
 */

import { describe, it, expect } from 'vitest';

// Utility functions extracted for testing
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const parseTimeHelper = (timeStr) => {
  const [h, m, s] = timeStr.split(':');
  return (parseFloat(h) * 3600) + (parseFloat(m) * 60) + parseFloat(s);
};

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const SUPPORTED_EXTENSIONS = [
  'mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'mpeg', 'mpg', 'm4v',
  '3gp', '3g2', 'gif', 'apng', 'webp', 'avif',
  'braw', 'r3d', 'dng', 'mxf',
  'm3u8', 'ts', 'mpd', 'm2ts', 'mts', 'vob'
];

const isValidExtension = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
};

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 Bytes');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(104857600)).toBe('100 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('should respect decimal places', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 3)).toBe('1.5 KB');
  });
});

describe('parseTimeHelper', () => {
  it('should parse simple time strings', () => {
    expect(parseTimeHelper('00:00:00')).toBe(0);
    expect(parseTimeHelper('00:00:01')).toBe(1);
    expect(parseTimeHelper('00:01:00')).toBe(60);
    expect(parseTimeHelper('01:00:00')).toBe(3600);
  });

  it('should parse complex time strings', () => {
    expect(parseTimeHelper('01:30:45')).toBe(5445);
    expect(parseTimeHelper('02:15:30')).toBe(8130);
  });

  it('should handle fractional seconds', () => {
    expect(parseTimeHelper('00:00:01.5')).toBe(1.5);
    expect(parseTimeHelper('00:01:30.25')).toBe(90.25);
  });

  it('should handle FFmpeg format (with decimals)', () => {
    expect(parseTimeHelper('00:05:23.45')).toBeCloseTo(323.45, 2);
  });
});

describe('formatTime', () => {
  it('should format zero seconds', () => {
    expect(formatTime(0)).toBe('00:00:00');
  });

  it('should format seconds only', () => {
    expect(formatTime(45)).toBe('00:00:45');
  });

  it('should format minutes and seconds', () => {
    expect(formatTime(125)).toBe('00:02:05');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatTime(3661)).toBe('01:01:01');
    expect(formatTime(7384)).toBe('02:03:04');
  });

  it('should handle large values', () => {
    expect(formatTime(36000)).toBe('10:00:00');
  });
});

describe('isValidExtension', () => {
  it('should accept supported video formats', () => {
    expect(isValidExtension('video.mp4')).toBe(true);
    expect(isValidExtension('video.mkv')).toBe(true);
    expect(isValidExtension('video.mov')).toBe(true);
    expect(isValidExtension('video.avi')).toBe(true);
    expect(isValidExtension('video.webm')).toBe(true);
  });

  it('should accept professional formats', () => {
    expect(isValidExtension('footage.braw')).toBe(true);
    expect(isValidExtension('raw.r3d')).toBe(true);
    expect(isValidExtension('raw.mxf')).toBe(true);
  });

  it('should accept image sequence formats', () => {
    expect(isValidExtension('animation.gif')).toBe(true);
    expect(isValidExtension('animated.apng')).toBe(true);
    expect(isValidExtension('image.webp')).toBe(true);
  });

  it('should accept streaming formats', () => {
    expect(isValidExtension('stream.m3u8')).toBe(true);
    expect(isValidExtension('stream.ts')).toBe(true);
    expect(isValidExtension('video.m2ts')).toBe(true);
  });

  it('should reject unsupported formats', () => {
    expect(isValidExtension('document.pdf')).toBe(false);
    expect(isValidExtension('image.jpg')).toBe(false);
    expect(isValidExtension('audio.mp3')).toBe(false);
    expect(isValidExtension('file.txt')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(isValidExtension('VIDEO.MP4')).toBe(true);
    expect(isValidExtension('Video.MKV')).toBe(true);
  });

  it('should handle files with multiple dots', () => {
    expect(isValidExtension('my.video.file.mp4')).toBe(true);
    expect(isValidExtension('project.v2.final.mkv')).toBe(true);
  });
});

describe('File Path Handling', () => {
  const getFileName = (path) => path.replace(/^.*[\\/]/, '');
  const getExtension = (path) => path.split('.').pop()?.toLowerCase() || '';
  const getDirectory = (path) => {
    const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return lastSlash > 0 ? path.substring(0, lastSlash) : '';
  };

  it('should extract filename from Windows path', () => {
    expect(getFileName('C:\\Users\\test\\Videos\\movie.mp4')).toBe('movie.mp4');
  });

  it('should extract filename from Unix path', () => {
    expect(getFileName('/home/user/videos/movie.mp4')).toBe('movie.mp4');
  });

  it('should get extension from filename', () => {
    expect(getExtension('video.mp4')).toBe('mp4');
    expect(getExtension('video.MKV')).toBe('mkv');
  });

  it('should get directory from full path', () => {
    expect(getDirectory('C:\\Users\\test\\Videos\\movie.mp4')).toBe('C:\\Users\\test\\Videos');
    expect(getDirectory('/home/user/videos/movie.mp4')).toBe('/home/user/videos');
  });
});
