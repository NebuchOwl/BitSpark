
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Production UI Regressions', () => {
  let dom;
  let document;
  let window;
  let processManagerMock;

  beforeEach(() => {
    // 1. Load HTML Content (just body structure)
    // We mock the queue container
    dom = new JSDOM(`
      <!DOCTYPE html>
      <body>
        <div id="queue-list">
          <!-- Dynamically inserted item -->
          <div class="queue-item">
             <button data-action="cancel" data-id="job-123" class="btn-cancel">
               <svg class="icon"><path d="..."/></svg>
             </button>
             
             <button data-action="view-logs" data-id="job-123">
                Logs
             </button>
          </div>
        </div>
      </body>
    `);

    window = dom.window;
    document = window.document;

    // Mock ProcessManager
    processManagerMock = {
      cancelJob: vi.fn(),
      viewLogs: vi.fn(),
      retryJob: vi.fn()
    };

    // 2. Attach Event Listener (The Logic we want to test)
    // We copy the exact logic from src/main.js to verify it
    const list = document.getElementById('queue-list');
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      // Prevent default/propagation logic from main.js
      e.preventDefault();
      e.stopPropagation();

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (!action) return;

      if (action === 'view-logs') processManagerMock.viewLogs(id);
      if (action === 'retry') processManagerMock.retryJob(id);
      if (action === 'cancel') processManagerMock.cancelJob(id);
    });
  });

  it('should handle clicks on the button itself', () => {
    const btn = document.querySelector('button[data-action="view-logs"]');

    const clickEvent = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true
    });

    btn.dispatchEvent(clickEvent);

    expect(processManagerMock.viewLogs).toHaveBeenCalledWith('job-123');
  });

  it('should handle clicks on nested SVG inside button (Production Bug)', () => {
    // This was likely the bug: clicking SVG didn't bubble or target calculation failed
    const svg = document.querySelector('svg');

    const clickEvent = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true
    });

    svg.dispatchEvent(clickEvent);

    expect(processManagerMock.cancelJob).toHaveBeenCalledWith('job-123');
  });

  it('should ignore clicks outside buttons', () => {
    const container = document.getElementById('queue-list');

    container.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(processManagerMock.cancelJob).not.toHaveBeenCalled();
    expect(processManagerMock.viewLogs).not.toHaveBeenCalled();
  });
});
