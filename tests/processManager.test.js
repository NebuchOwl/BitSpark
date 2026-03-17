/**
 * Unit Tests for ProcessManager
 * Tests queue management, job lifecycle, and history functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock showToast
globalThis.showToast = vi.fn();

// ProcessManager implementation (extracted for testing)
const createProcessManager = () => ({
  queue: [],
  history: [],
  isProcessing: false,
  viewMode: 'active',

  save() {
    const cleanQueue = this.queue.map(j => {
      const { child, ...rest } = j;
      return rest;
    });
    localStorage.setItem('processQueue', JSON.stringify(cleanQueue));
    localStorage.setItem('processHistory', JSON.stringify(this.history));
  },

  load() {
    const data = localStorage.getItem('processQueue');
    const hist = localStorage.getItem('processHistory');
    if (hist) {
      try { this.history = JSON.parse(hist); } catch (e) { /* ignore */ }
    }
    if (data) {
      try {
        this.queue = JSON.parse(data).map(j => {
          if (j.status === 'processing' || j.status === 'pending') {
            j.status = 'failed';
            j.info = 'Interrupted (Restarted)';
          }
          return j;
        });
      } catch (e) { /* ignore */ }
    }
  },

  addJob(jobConfig) {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const job = {
      id,
      status: 'pending',
      progress: 0,
      info: 'Waiting...',
      logs: [],
      ...jobConfig
    };
    this.queue.push(job);
    this.save();
    return job;
  },

  clearCompleted() {
    const activeStatues = ['pending', 'processing'];
    const completed = this.queue.filter(j => !activeStatues.includes(j.status));

    completed.forEach(j => {
      j.completedAt = new Date().toISOString();
      this.history.unshift(j);
    });

    if (this.history.length > 50) this.history = this.history.slice(0, 50);
    this.queue = this.queue.filter(j => activeStatues.includes(j.status));
    this.save();
    return completed.length;
  },

  clearHistory() {
    this.history = [];
    this.save();
  },

  cancelJob(id) {
    const job = this.queue.find(j => j.id === id);
    if (!job) return false;

    this.queue = this.queue.filter(j => j.id !== id);
    this.save();
    return true;
  },

  setView(mode) {
    this.viewMode = mode;
  }
});

describe('ProcessManager', () => {
  let pm;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    pm = createProcessManager();
  });

  describe('Job Queue Operations', () => {
    it('should add a job to the queue', () => {
      const job = pm.addJob({ name: 'Test Video', type: 'optimize' });

      expect(pm.queue).toHaveLength(1);
      expect(job.status).toBe('pending');
      expect(job.name).toBe('Test Video');
      expect(job.id).toBeDefined();
    });

    it('should generate unique job IDs', () => {
      const job1 = pm.addJob({ name: 'Video 1', type: 'optimize' });
      const job2 = pm.addJob({ name: 'Video 2', type: 'trim' });

      expect(job1.id).not.toBe(job2.id);
    });

    it('should initialize job with default values', () => {
      const job = pm.addJob({ name: 'Test', type: 'convert' });

      expect(job.progress).toBe(0);
      expect(job.info).toBe('Waiting...');
      expect(job.logs).toEqual([]);
    });
  });

  describe('Queue Persistence', () => {
    it('should save queue to localStorage', () => {
      pm.addJob({ name: 'Test', type: 'optimize' });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'processQueue',
        expect.any(String)
      );
    });

    it('should load queue from localStorage', () => {
      const savedQueue = JSON.stringify([
        { id: 'test-1', name: 'Saved Job', status: 'done' }
      ]);
      localStorage.getItem.mockReturnValueOnce(savedQueue);

      pm.load();

      expect(pm.queue).toHaveLength(1);
      expect(pm.queue[0].name).toBe('Saved Job');
    });

    it('should mark interrupted jobs as failed on load', () => {
      const savedQueue = JSON.stringify([
        { id: 'test-1', name: 'Processing Job', status: 'processing' }
      ]);
      localStorage.getItem.mockReturnValueOnce(savedQueue);

      pm.load();

      expect(pm.queue[0].status).toBe('failed');
      expect(pm.queue[0].info).toBe('Interrupted (Restarted)');
    });
  });

  describe('Clear Operations', () => {
    it('should move completed jobs to history', () => {
      pm.queue = [
        { id: '1', name: 'Done Job', status: 'done' },
        { id: '2', name: 'Pending Job', status: 'pending' }
      ];

      const movedCount = pm.clearCompleted();

      expect(movedCount).toBe(1);
      expect(pm.queue).toHaveLength(1);
      expect(pm.queue[0].status).toBe('pending');
      expect(pm.history).toHaveLength(1);
      expect(pm.history[0].name).toBe('Done Job');
    });

    it('should clear all history', () => {
      pm.history = [
        { id: '1', name: 'Old Job 1' },
        { id: '2', name: 'Old Job 2' }
      ];

      pm.clearHistory();

      expect(pm.history).toHaveLength(0);
    });

    it('should cap history at 50 items', () => {
      // Add 60 completed jobs
      for (let i = 0; i < 60; i++) {
        pm.queue.push({ id: `job-${i}`, name: `Job ${i}`, status: 'done' });
      }

      pm.clearCompleted();

      expect(pm.history.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Cancel Job', () => {
    it('should remove a job from queue', () => {
      pm.queue = [
        { id: 'job-1', name: 'Job 1', status: 'pending' },
        { id: 'job-2', name: 'Job 2', status: 'pending' }
      ];

      const result = pm.cancelJob('job-1');

      expect(result).toBe(true);
      expect(pm.queue).toHaveLength(1);
      expect(pm.queue[0].id).toBe('job-2');
    });

    it('should return false for non-existent job', () => {
      pm.queue = [{ id: 'job-1', name: 'Job 1', status: 'pending' }];

      const result = pm.cancelJob('non-existent');

      expect(result).toBe(false);
      expect(pm.queue).toHaveLength(1);
    });
  });

  describe('View Mode', () => {
    it('should switch between active and history views', () => {
      expect(pm.viewMode).toBe('active');

      pm.setView('history');
      expect(pm.viewMode).toBe('history');

      pm.setView('active');
      expect(pm.viewMode).toBe('active');
    });
  });
});

describe('Edge Cases', () => {
  let pm;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    pm = createProcessManager();
  });

  it('should handle empty queue gracefully', () => {
    const movedCount = pm.clearCompleted();
    expect(movedCount).toBe(0);
  });

  it('should handle corrupted localStorage data', () => {
    localStorage.getItem.mockReturnValueOnce('not valid json');

    // Should not throw
    expect(() => pm.load()).not.toThrow();
  });

  it('should handle multiple rapid job additions', () => {
    for (let i = 0; i < 100; i++) {
      pm.addJob({ name: `Rapid Job ${i}`, type: 'test' });
    }

    expect(pm.queue).toHaveLength(100);

    // All IDs should be unique
    const ids = pm.queue.map(j => j.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(100);
  });
});
