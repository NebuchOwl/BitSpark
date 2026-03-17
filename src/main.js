import './style.css';

import { Command, open as openUrl } from '@tauri-apps/plugin-shell';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readFile } from '@tauri-apps/plugin-fs';
import { tempDir, appCacheDir, join } from '@tauri-apps/api/path';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getOptimizerArgs, codecsByBackend } from './utils/optimizer-logic.js';

// --- Global Error Handling (Production Debugging) ---
window.addEventListener('error', (event) => {
  const msg = event.message || 'Unknown Error';
  const stack = event.error?.stack || 'No Stack';
  // Logger might not be init yet, so safe check
  if (window.processManager && window.Logger) {
    window.Logger.log({ type: 'error', message: `Global Error: ${msg}`, details: stack });
  }
  // Fallback toast
  if (window.showToast) window.showToast(`Critical: ${msg}`, 'error');
  console.error('[Global Error]', msg);
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason);
  if (window.processManager && window.Logger) {
    window.Logger.log({ type: 'error', message: `Promise Error: ${msg}`, details: 'Unhandled Rejection' });
  }
  console.error('[Unhandled Rejection]', msg);
});


const SUPPORTED_EXTENSIONS = [
  'mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'mpeg', 'mpg', 'm4v',
  '3gp', '3g2', 'gif', 'apng', 'webp', 'avif',
  'braw', 'r3d', 'dng', 'mxf',
  'm3u8', 'ts', 'mpd', 'm2ts', 'mts', 'vob'
];


// --- Toast Notification System ---
const toastContainer = document.getElementById('toast-container');

// Global Settings Init (Hoisted to top)
let appSettings = {
  theme: 'theme-cosmic',
  notifications: true,
  outputDir: null
};


window.showToast = function (message, type = 'info') {
  // Ensure container exists if called early
  if (!toastContainer) return;

  const toast = document.createElement('div');

  // Theme-aware, responsive, transparent styling
  const baseClasses = 'bg-gray-800/95 backdrop-blur-md shadow-xl p-4 rounded-r-lg border-l-4 flex items-center gap-3 transform transition-all duration-300 opacity-0 translate-x-10 pointer-events-auto z-50 mb-3 w-[90vw] md:w-auto md:max-w-sm';

  const typeConfig = {
    success: {
      classes: 'border-green-500 text-white',
      icon: `<svg class="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>`
    },
    error: {
      classes: 'border-red-500 text-white',
      icon: `<svg class="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>`
    },
    info: {
      classes: 'border-blue-500 text-white',
      icon: `<svg class="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>`
    }
  };

  const config = typeConfig[type] || typeConfig.info;
  toast.className = `${baseClasses} ${config.classes}`;

  // Icon element
  const iconDiv = document.createElement('div');
  iconDiv.innerHTML = config.icon;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'flex-1 font-medium text-sm break-all line-clamp-3';
  msgDiv.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ml-2 text-gray-400 hover:text-white font-bold opacity-70 hover:opacity-100 transition-opacity';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => toast.remove());

  toast.appendChild(iconDiv);
  toast.appendChild(msgDiv);
  toast.appendChild(closeBtn);

  toastContainer.appendChild(toast);

  // Animate In
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-x-10');
  });

  // Auto Dismiss
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-x-10');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Logo Animation Helper
// Logo Animation Helper
function toggleLogoAnimation(active) {
  const logos = [document.getElementById('app-logo'), document.getElementById('titlebar-icon')];

  logos.forEach(logo => {
    if (logo) {
      if (active) logo.classList.add('animate-spin-slow');
      else logo.classList.remove('animate-spin-slow');
    }
  });
}

// Override default alert
window.alert = (msg) => window.showToast(msg, 'info');

// --- Tauri Native File Drop Registry ---
const tauriDropListeners = new Map();
let tauriDropListenerInitialized = false;
let currentHoveredDropzone = null;

async function initTauriFileDrop() {
  if (tauriDropListenerInitialized) return;
  tauriDropListenerInitialized = true;

  try {
    // Tauri v2 correct API: getCurrentWebview().onDragDropEvent()
    const webview = getCurrentWebview();

    await webview.onDragDropEvent((event) => {
      const type = event.payload.type;

      if (type === 'over') {
        // User is hovering with files
        const position = event.payload.position;

        // Find which dropzone is under the cursor
        const hoveredElement = document.elementFromPoint(position.x, position.y);

        // Update visual feedback for all registered dropzones
        for (const [element, _] of tauriDropListeners) {
          if (element.contains(hoveredElement) || element === hoveredElement) {
            element.classList.add('border-purple-500', 'bg-gray-800/50');
            currentHoveredDropzone = element;
          } else {
            element.classList.remove('border-purple-500', 'bg-gray-800/50');
          }
        }
      }
      else if (type === 'drop') {
        // User dropped files
        const paths = event.payload.paths;
        if (!paths || paths.length === 0) return;

        console.log('[Tauri] Files dropped:', paths);

        // Use the currently hovered dropzone, or find closest one
        if (currentHoveredDropzone && tauriDropListeners.has(currentHoveredDropzone)) {
          currentHoveredDropzone.classList.remove('border-purple-500', 'bg-gray-800/50');
          tauriDropListeners.get(currentHoveredDropzone)(paths);
        } else {
          // Fallback: use first registered listener
          const firstEntry = tauriDropListeners.entries().next().value;
          if (firstEntry) {
            firstEntry[0].classList.remove('border-purple-500', 'bg-gray-800/50');
            firstEntry[1](paths);
          }
        }

        currentHoveredDropzone = null;
      }
      else if (type === 'cancel' || type === 'leave') {
        // User cancelled or left the window
        for (const [element] of tauriDropListeners) {
          element.classList.remove('border-purple-500', 'bg-gray-800/50');
        }
        currentHoveredDropzone = null;
      }
    });

    console.log('[Tauri] Native file drop initialized with onDragDropEvent');
  } catch (e) {
    console.warn('[Tauri] Native file drop not available:', e);
  }
}

// --- Unified Drag & Drop Handler ---
function setupUnifiedDragDrop(element, onFilesDropped) {
  if (!element) return;

  // Register for Tauri native events (Windows/macOS/Linux)
  tauriDropListeners.set(element, onFilesDropped);
  initTauriFileDrop();

  // HTML5 Drag & Drop (fallback for web preview and visual feedback)
  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    element.classList.add('border-purple-500', 'bg-gray-800/50');
  });

  element.addEventListener('dragleave', (e) => {
    e.preventDefault();
    element.classList.remove('border-purple-500', 'bg-gray-800/50');
  });

  element.addEventListener('drop', (e) => {
    e.preventDefault();
    element.classList.remove('border-purple-500', 'bg-gray-800/50');

    // Try HTML5 File API with path extraction (works in some Tauri configs)
    if (e.dataTransfer.files.length > 0) {
      const paths = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        // Tauri v2 may expose path on File object in some scenarios
        if (f.path) paths.push(f.path);
        else if (f.webkitRelativePath) paths.push(f.webkitRelativePath);
        else if (f.name) paths.push(f.name); // Fallback (may not have full path)
      }

      if (paths.length > 0) {
        // Enforce valid absolute paths (must contain separators)
        const validPaths = paths.filter(p => p && (p.includes('/') || p.includes('\\')));

        if (validPaths.length > 0) {
          onFilesDropped(validPaths);
        } else {
          console.warn('[DragDrop] Dropped files do not have valid absolute paths. Browser limitations?');
        }
      }
      // Otherwise, Tauri native event will handle it
    }
  });
}

// --- Global Drag Prevention ---
window.addEventListener('dragover', (e) => {
  e.preventDefault();
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
});

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const dropContent = document.getElementById('drop-content');
const filePreview = document.getElementById('file-preview');
const filenameEl = document.getElementById('filename');
const filesizeEl = document.getElementById('filesize');
const changeFileBtn = document.getElementById('change-file-btn');
const optionsPanel = document.getElementById('options-panel');
const optimizeBtn = document.getElementById('optimize-btn');

let selectedFiles = [];
let currentChildProcess = null; // Still useful for tracking if we want to kill globally?
// But processManager handles it now. I'll leave it as null.

// Drag and Drop Logic
// Drag and Drop Logic (Unified)
const manualUploadBtn = document.getElementById('manual-upload-btn');

setupUnifiedDragDrop(dropzone, (paths) => {
  selectedFiles = paths;
  handleFileSelect(selectedFiles);
});

// Bind click to the button explicitly, prevent bubbling if needed or just let it work
manualUploadBtn.addEventListener('click', async (e) => {
  e.stopPropagation(); // prevent dropzone click if we keep that?
  // Actually we remove the dropzone click listener to avoid double triggers/confusion
  triggerFileSelect();
});

// Also keep dropzone click as fallback? No, let's rely on the button to be explicit as requested.
// But user expects big area to be clickable? 
// Let's make the Whole area NOT clickable for file dialog, ONLY the button, to differentiate.
// Or we keep both.
// User said "There is no button". 
// Step 1: Add button. (Done in HTML)
// Step 2: Bind button.

async function triggerFileSelect() {
  try {
    const selection = await open({
      multiple: true,
      filters: [{
        name: 'Video',
        extensions: SUPPORTED_EXTENSIONS
      }]
    });

    if (selection) {
      if (Array.isArray(selection)) selectedFiles = selection;
      else selectedFiles = [selection];

      handleFileSelect(selectedFiles);
    }
  } catch (err) {
    console.error("Failed to open dialog:", err);
  }
}

changeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetUI();
});

function handleFileSelect(files) {
  if (!files || files.length === 0) return;

  dropContent.classList.add('hidden');
  filePreview.classList.remove('hidden');
  filePreview.classList.add('flex');

  if (files.length === 1) {
    const path = files[0];
    const name = path.replace(/^.*[\\\/]/, '');
    filenameEl.textContent = name;
    filesizeEl.textContent = 'Ready to encode';
  } else {
    filenameEl.textContent = `${files.length} Files Selected`;
    filesizeEl.textContent = 'Batch Mode';
  }

  optionsPanel.classList.remove('opacity-50', 'pointer-events-none');
}

function resetUI() {
  selectedFiles = [];
  dropContent.classList.remove('hidden');
  filePreview.classList.add('hidden');
  filePreview.classList.remove('flex');
  optionsPanel.classList.add('opacity-50', 'pointer-events-none');
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- Advanced Controls Init ---
const modeSimpleBtn = document.getElementById('mode-simple-btn');
const modeAdvancedBtn = document.getElementById('mode-advanced-btn');
const panelSimple = document.getElementById('panel-simple');
const panelAdvanced = document.getElementById('panel-advanced');
const advCodec = document.getElementById('adv-codec');
const advPreset = document.getElementById('adv-preset');
const advCrf = document.getElementById('adv-crf');
const advCrfVal = document.getElementById('adv-crf-val');
const advResolution = document.getElementById('adv-resolution');
const advAudio = document.getElementById('adv-audio');
const advCustom = document.getElementById('adv-custom');
const advResCustom = document.getElementById('adv-res-custom');
const advResW = document.getElementById('adv-res-w');
const advResH = document.getElementById('adv-res-h');
const advFps = document.getElementById('adv-fps');
const advFpsCustom = document.getElementById('adv-fps-custom');
const advBackend = document.getElementById('adv-backend');

// --- Dynamic Codec Logic ---
// --- Dynamic Codec Logic ---
// Imported from ./utils/optimizer-logic.js

function updateAdvCodecs() {
  if (!advBackend || !advCodec) return;
  const backend = advBackend.value;
  const options = codecsByBackend[backend] || codecsByBackend.cpu;
  advCodec.innerHTML = '';
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt.val;
    el.textContent = opt.label;
    advCodec.appendChild(el);
  });
}

if (advBackend) {
  advBackend.addEventListener('change', updateAdvCodecs);
  // Init on load
  updateAdvCodecs();
}

let isAdvancedMode = false;

// --- Logger System ---
const Logger = {
  logs: [],
  MAX_LOGS: 50, // Keep last 50 logs

  init() {
    const saved = localStorage.getItem('appLogs');
    if (saved) {
      try {
        this.logs = JSON.parse(saved);
      } catch (e) { console.error("Log parse error", e); }
    }
  },

  log(details) {
    const entry = {
      id: Date.now().toString(36),
      timestamp: new Date().toISOString(),
      ...details
    };

    this.logs.unshift(entry); // Add to top
    if (this.logs.length > this.MAX_LOGS) this.logs.pop(); // Cap size

    this.save();
    this.render();
  },

  save() {
    localStorage.setItem('appLogs', JSON.stringify(this.logs));
  },

  clear() {
    this.logs = [];
    this.save();
    this.render();
  },

  render() {
    const container = document.getElementById('logs-container');
    if (!container) return; // Might be hidden/not ready

    if (this.logs.length === 0) {
      container.innerHTML = '<div class="text-gray-600 italic">No logs recorded yet...</div>';
      return;
    }

    container.innerHTML = this.logs.map(log => {
      let colorClass = 'text-gray-300';
      if (log.type === 'error') colorClass = 'text-red-400 font-bold';
      if (log.type === 'success') colorClass = 'text-green-400';
      if (log.type === 'info') colorClass = 'text-blue-300';

      return `<div class="border-b border-gray-800 pb-1 mb-1 font-mono text-xs break-all">
         <span class="text-gray-600">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
         <span class="${colorClass}">${log.message}</span>
         ${log.details ? `<div class="text-gray-500 pl-4 mt-1 bg-black/20 p-1 rounded">${log.details}</div>` : ''}
      </div>`;
    }).join('');
  }
};

// --- Process Manager (Queue) ---
const processManager = {
  queue: [],
  history: [],
  isProcessing: false,
  viewMode: 'active', // 'active' | 'history'

  init() {
    this.load();
    Logger.init();
    this.bindEvents();
  },

  bindEvents() {
    // Static Queue Controls
    const btnActive = document.getElementById('queue-view-active');
    const btnHistory = document.getElementById('queue-view-history');

    if (btnActive) btnActive.addEventListener('click', () => this.setView('active'));
    if (btnHistory) btnHistory.addEventListener('click', () => this.setView('history'));

    // Queue Clear Button
    const btnClear = document.getElementById('queue-clear-btn');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (this.viewMode === 'history') this.clearHistory();
        else this.clearCompleted();
      });
    }

    // Logs Modal Controls
    const logsClose = document.getElementById('modal-logs-close-btn');
    const logsHeaderClose = document.getElementById('modal-logs-header-close-btn');
    const logsCopy = document.getElementById('modal-logs-copy-btn');

    if (logsClose) logsClose.addEventListener('click', () => document.getElementById('modal-logs').classList.add('hidden'));
    if (logsHeaderClose) logsHeaderClose.addEventListener('click', () => document.getElementById('modal-logs').classList.add('hidden'));
    if (logsCopy) logsCopy.addEventListener('click', () => this.copyLogs());

    // Event Delegation for Queue List
    const list = document.getElementById('queue-list');
    if (list) {
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        // Prevent default if it's a form submission (unlikely but safe)
        e.preventDefault();
        e.stopPropagation();

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        Logger.log({ type: 'info', message: `UI Interaction: ${action} on ${id}` });

        if (!action) return;

        if (action === 'view-logs') this.viewLogs(id);
        if (action === 'retry') this.retryJob(id);
        if (action === 'cancel') this.cancelJob(id);
      });
    } else {
      console.error("Queue List element not found during binding!");
    }
  },

  setView(mode) {
    this.viewMode = mode;
    this.updateUI();

    const btnActive = document.getElementById('queue-view-active');
    const btnHistory = document.getElementById('queue-view-history');

    if (mode === 'active') {
      if (btnActive) { btnActive.classList.remove('bg-gray-700', 'text-gray-400'); btnActive.classList.add('bg-purple-600', 'text-white'); }
      if (btnHistory) { btnHistory.classList.remove('bg-purple-600', 'text-white'); btnHistory.classList.add('bg-gray-700', 'text-gray-400'); }
    } else {
      if (btnHistory) { btnHistory.classList.remove('bg-gray-700', 'text-gray-400'); btnHistory.classList.add('bg-purple-600', 'text-white'); }
      if (btnActive) { btnActive.classList.remove('bg-purple-600', 'text-white'); btnActive.classList.add('bg-gray-700', 'text-gray-400'); }
    }
  },

  viewLogs(id) {
    const job = this.queue.find(j => j.id === id) || this.history.find(j => j.id === id);
    if (!job) return;

    const modal = document.getElementById('modal-logs');
    const modalId = document.getElementById('modal-logs-id');
    const modalTitle = document.getElementById('modal-logs-title');
    const modalContent = document.getElementById('modal-logs-content');

    if (modal && modalContent) {
      modalId.textContent = `ID: ${job.id.substr(0, 8)}`;
      modalTitle.textContent = `${job.name} Logs`;
      modalContent.textContent = (job.logs && job.logs.length > 0) ? job.logs.join('\n') : "No detailed logs available.";
      modal.classList.remove('hidden');
      // Auto scroll to bottom
      modalContent.scrollTop = modalContent.scrollHeight;
    }
    this.currentLogJobId = id;
  },

  copyLogs() {
    const modalContent = document.getElementById('modal-logs-content');
    if (modalContent) {
      navigator.clipboard.writeText(modalContent.textContent).then(() => {
        showToast('Logs copied to clipboard', 'success');
      });
    }
  },



  save() {
    const cleanQueue = this.queue.map(j => {
      // eslint-disable-next-line no-unused-vars
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
      try { this.history = JSON.parse(hist); } catch (e) { console.error(e); }
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
        this.updateUI();
      } catch (e) {
        console.error("Failed to load queue", e);
      }
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
    this.updateUI();
    this.processNext();
    showToast(`Queued: ${job.name}`, 'info');
    Logger.log({ type: 'info', message: `Job Queued: ${job.name} (${job.type})` });
  },

  retryJob(id) {
    const job = this.queue.find(j => j.id === id);
    if (!job) return;

    // Clone job but reset status/id
    const newJob = {
      ...job,
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      status: 'pending',
      progress: 0,
      info: 'Queued (Retry)',
      logs: [],
      child: undefined
    };

    this.queue.push(newJob);
    this.save();
    this.updateUI();
    this.processNext();
    showToast(`Retrying: ${job.name}`, 'info');
    Logger.log({ type: 'info', message: `Job Retried: ${job.name}` });
  },

  clearHistory() {
    this.history = [];
    this.save();
    this.updateUI();
    showToast('History cleared', 'info');
  },

  clearCompleted() {
    const activeStatues = ['pending', 'processing'];
    const completed = this.queue.filter(j => !activeStatues.includes(j.status));

    // Move to history
    completed.forEach(j => {
      j.completedAt = new Date().toISOString();
      this.history.unshift(j);
    });

    // Cap history size
    if (this.history.length > 50) this.history = this.history.slice(0, 50);

    this.queue = this.queue.filter(j => activeStatues.includes(j.status));
    this.save();
    this.updateUI();
    showToast(`${completed.length} tasks moved to History`, 'info');
  },

  cancelJob(id) {
    const job = this.queue.find(j => j.id === id);
    if (!job) return;

    if (job.status === 'processing' && job.child) {
      job.status = 'cancelled';
      job.info = 'Cancelled';
      job.child.kill().catch(e => console.error(e));
      this.isProcessing = false;
      this.save();
      this.updateUI();
      document.dispatchEvent(new Event('queue-updated')); // Signal
      Logger.log({ type: 'error', message: `Job Cancelled: ${job.name}`, details: 'User terminated process.' });
      this.processNext();
    } else {
      // If it was already done/failed, move to history instead of just deleting?
      if (['done', 'failed', 'cancelled'].includes(job.status)) {
        job.completedAt = new Date().toISOString();
        this.history.unshift(job);
        if (this.history.length > 50) this.history = this.history.slice(0, 50);
        this.save(); // Save history
      }

      this.queue = this.queue.filter(j => j.id !== id);
      this.save();
      this.updateUI();
      Logger.log({ type: 'info', message: `Job Removed/Archived: ${job.name}` });
    }
  },

  async processNext() {
    if (this.isProcessing) return;
    const job = this.queue.find(j => j.status === 'pending');

    if (!job) {
      toggleLogoAnimation(false); // No more jobs, stop animation
      return;
    }

    this.isProcessing = true;
    toggleLogoAnimation(true); // Start animation
    job.status = 'processing';
    job.info = 'Starting...';
    this.save();
    this.updateUI();

    try {
      showToast(`Spawning FFmpeg...`, 'info');
      const cmd = Command.sidecar(job.command, job.args);

      // --- Robust Log Handling (Universal) ---
      const handleLog = (line) => {
        const text = (typeof line === 'string') ? line : new TextDecoder().decode(line || new Uint8Array());
        job.logs.push(text);

        // Parse Progress
        // Duration: 00:00:05.12
        const durMatch = text.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
        if (durMatch && !job.durationSec) {
          job.durationSec = parseTimeHelper(durMatch[1] + ':' + durMatch[2] + ':' + durMatch[3]);
        }

        // time=00:00:02.45
        if (job.durationSec) {
          const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
          if (timeMatch) {
            const currentSec = parseTimeHelper(timeMatch[1] + ':' + timeMatch[2] + ':' + timeMatch[3]);
            const percent = Math.min(100, (currentSec / job.durationSec) * 100);

            if (Math.abs(percent - job.progress) > 0.5) { // Update significantly
              job.progress = percent;

              // Direct DOM update for smoothness and performance
              const row = document.getElementById(`job-${job.id}`);
              if (row) {
                const fill = row.querySelector('.queue-progress-fill');
                const percentText = row.querySelector('.text-xs span:last-child'); // Approx target

                if (fill) fill.style.width = `${percent}%`;
                // If the bar wasn't there (0%), we might need to full update, but the new renderer handles it.
                // If it's pure 0->1 transition, the element might not exist yet.
                // We'll rely on updateUI() for the first show, or handle it here.
                if (!fill) this.updateUI();
              }
            }
          }
        }

        // Real-time update
        if (this.currentLogJobId === job.id) {
          const el = document.getElementById('modal-logs-content');
          if (el) {
            el.textContent += text + '\n';
            el.scrollTop = el.scrollHeight;
          }
        }
      };

      // Register listeners (Try both API styles to be safe)
      cmd.on('stdout', handleLog);
      cmd.on('stderr', handleLog);
      if (cmd.stdout && typeof cmd.stdout.on === 'function') {
        cmd.stdout.on('data', handleLog);
      }
      if (cmd.stderr && typeof cmd.stderr.on === 'function') {
        cmd.stderr.on('data', handleLog);
      }

      cmd.on('close', data => {
        if (job.status === 'cancelled') return;
        if (data.code === 0) {
          job.status = 'done';
          job.progress = 100;
          job.info = 'Complete';
          showToast(`Finished: ${job.name}`, 'success');
          Logger.log({ type: 'success', message: `Job Finished: ${job.name}` });
        } else {
          job.status = 'failed';
          job.info = `Exit Code: ${data.code}`;
          showToast(`Failed: ${job.name} (Code ${data.code})`, 'error');
          Logger.log({ type: 'error', message: `Job Failed: ${job.name}`, details: `Exit Code: ${data.code}` });
        }
        this.isProcessing = false;
        job.progress = 100;
        this.save();
        this.updateUI();
        this.processNext();
      });

      cmd.on('error', err => {
        if (job.status === 'cancelled') return;
        job.status = 'failed';
        job.info = 'Error';
        const msg = JSON.stringify(err);
        job.logs.push(`Spawn Error: ${msg}`);
        showToast(`Spawn Error: ${msg}`, 'error');
        this.isProcessing = false;
        this.save();
        this.updateUI();
        this.processNext();
        Logger.log({ type: 'error', message: `Execution Error: ${job.name}`, details: msg });
      });

      const child = await cmd.spawn();
      job.child = child;
      showToast(`Process Started (PID: ${child.pid})`, 'success');

    } catch (e) {
      job.status = 'failed';
      job.info = 'Exception';
      showToast(`Exception: ${e.message}`, 'error');
      console.error(e);
      this.isProcessing = false;
      this.save();
      this.updateUI();
      toggleLogoAnimation(false);
      this.processNext();
      Logger.log({ type: 'error', message: `Process Exception: ${job.name}`, details: e.toString() });
    }
  },

  updateUI() {
    const container = document.getElementById('queue-list');
    const clearBtn = document.getElementById('queue-clear-btn');
    if (!container) return;

    if (this.viewMode === 'history') {
      // History View - Show clear button for history
      if (clearBtn) {
        if (this.history.length > 0) {
          clearBtn.classList.remove('hidden');
          clearBtn.textContent = 'Clear History';
        } else {
          clearBtn.classList.add('hidden');
        }
      }

      if (this.history.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-10">No history available</div>';
        return;
      }

      container.innerHTML = this.history.map(job => `
        <div class="queue-item opacity-75">
          <div class="flex justify-between items-center">
            <div>
              <div class="font-bold text-gray-300">${job.name}</div>
              <div class="text-xs text-gray-500 uppercase">${job.type} • ${new Date(job.completedAt || Date.now()).toLocaleString()}</div>
            </div>
            <div class="status-badge ${this.getStatusClass(job.status)}">${job.status}</div>
          </div>
          <div class="flex justify-between items-center mt-1">
             <div class="text-xs text-gray-500">${job.info || 'Archived'}</div>
             <button data-action="view-logs" data-id="${job.id}" class="text-xs text-purple-400 hover:text-purple-300 underline">View Logs</button>
          </div>
        </div>
      `).join('');
      return;
    }

    // Active View
    const hasCompleted = this.queue.some(j => ['done', 'failed', 'cancelled'].includes(j.status));
    if (clearBtn) {
      if (hasCompleted) {
        clearBtn.classList.remove('hidden');
        clearBtn.textContent = 'Clear Completed';
      } else {
        clearBtn.classList.add('hidden');
      }
    }

    if (this.queue.length === 0) {
      container.innerHTML = '<div class="text-center text-gray-500 py-10">No active tasks</div>';
      return;
    }

    container.innerHTML = this.queue.map((job, index) => {
      return `
      <div class="queue-item" id="job-${job.id}" data-index="${index}">
        <div class="flex justify-between items-center">
          <div>
            <div class="font-bold text-white">${job.name}</div>
            <div class="text-xs text-gray-400 uppercase">${job.type}</div>
          </div>
          <div class="flex items-center gap-3">
             <div class="status-badge ${this.getStatusClass(job.status)}">${job.status}</div>
             
             ${(job.status === 'failed' || job.status === 'cancelled') ?
          `<button class="text-gray-400 hover:text-purple-400 px-1 text-lg" data-action="retry" data-id="${job.id}" title="Retry">⟳</button>` : ''}
               
             <button class="text-gray-400 hover:text-red-400 px-2 text-lg font-bold" data-action="cancel" data-id="${job.id}" title="Remove/Cancel">×</button>
          </div>
        </div>
        ${(job.status === 'processing' || (['pending', 'cancelled', 'done'].includes(job.status) && job.progress > 0)) ? `
        <div class="queue-progress-bar mt-2">
            <div class="queue-progress-fill${job.status !== 'processing' ? ' queue-progress-fill-static' : ''}" style="width: ${job.progress}%"></div>
        </div>` : ''}
        <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>${job.info}</span>
            <div class="flex gap-3">
               <button data-action="view-logs" data-id="${job.id}" class="text-xs text-purple-400 hover:text-purple-300 underline">Logs</button>
               ${job.progress > 0 ? `<span>${Math.round(job.progress)}%</span>` : ''}
            </div>
        </div>
      </div>
    `;
    }).join('');
  },

  getStatusClass(status) {
    if (status === 'processing') return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    if (status === 'done') return 'bg-green-500/20 text-green-400 border border-green-500/30';
    if (status === 'failed') return 'bg-red-500/20 text-red-400 border border-red-500/30';
    if (status === 'cancelled') return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
    return 'bg-gray-700 text-gray-400 border border-gray-600';
  }
};

window.processManager = processManager;

function parseTimeHelper(timeStr) {
  const [h, m, s] = timeStr.split(':');
  return (parseFloat(h) * 3600) + (parseFloat(m) * 60) + parseFloat(s);
}

if (modeSimpleBtn && modeAdvancedBtn) {
  modeSimpleBtn.addEventListener('click', () => setOptimizerMode(false));
  modeAdvancedBtn.addEventListener('click', () => setOptimizerMode(true));
}

function setOptimizerMode(advanced) {
  isAdvancedMode = advanced;
  if (advanced) {
    modeSimpleBtn.classList.replace('bg-gray-700', 'text-gray-400');
    modeSimpleBtn.classList.remove('text-white', 'shadow');
    modeSimpleBtn.classList.add('bg-gray-800');

    modeAdvancedBtn.classList.replace('text-gray-400', 'bg-gray-700');
    modeAdvancedBtn.classList.add('text-white', 'shadow');
    modeAdvancedBtn.classList.remove('bg-gray-800');

    panelSimple.classList.add('hidden');
    panelAdvanced.classList.remove('hidden');
  } else {
    modeAdvancedBtn.classList.replace('bg-gray-700', 'text-gray-400');
    modeAdvancedBtn.classList.remove('text-white', 'shadow');
    modeAdvancedBtn.classList.add('bg-gray-800');

    modeSimpleBtn.classList.replace('text-gray-400', 'bg-gray-700');
    modeSimpleBtn.classList.add('text-white', 'shadow');
    modeSimpleBtn.classList.remove('bg-gray-800');

    panelAdvanced.classList.add('hidden');
    panelSimple.classList.remove('hidden');
  }
}

if (advCrf) {
  advCrf.addEventListener('input', (e) => {
    advCrfVal.textContent = e.target.value;
  });
}

if (advResolution) {
  advResolution.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      advResCustom.classList.remove('hidden');
    } else {
      advResCustom.classList.add('hidden');
    }
  });
}

if (advFps) {
  advFps.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      advFpsCustom.classList.remove('hidden');
    } else {
      advFpsCustom.classList.add('hidden');
    }
  });
}

// Option Buttons (Simple Mode)
const optionBtns = document.querySelectorAll('.option-btn');
let currentQuality = 'low';

optionBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    optionBtns.forEach(b => {
      b.classList.remove('ring-2', 'ring-purple-500', 'bg-gray-700');
      b.classList.add('bg-gray-800');
    });
    btn.classList.remove('bg-gray-800');
    btn.classList.add('ring-2', 'ring-purple-500', 'bg-gray-700');
    currentQuality = btn.dataset.quality;
  });
});

// Init Default quality (Set visual state)
const defaultBtn = document.querySelector(`.option-btn[data-quality="${currentQuality}"]`) || optionBtns[0];
if (defaultBtn) {
  defaultBtn.classList.add('ring-2', 'ring-purple-500', 'bg-gray-700');
  defaultBtn.classList.remove('bg-gray-800');
}





/* --- Optimizer Logic --- */
optimizeBtn.addEventListener('click', async () => {
  if (!selectedFiles || selectedFiles.length === 0) return showToast('No files selected', 'error');

  // Validate file paths before processing
  const validFiles = selectedFiles.filter(f => f && (f.includes('/') || f.includes('\\')));

  if (validFiles.length === 0) return showToast('Invalid file paths selected. Please re-select files.', 'error');
  if (validFiles.length < selectedFiles.length) {
    showToast(`${selectedFiles.length - validFiles.length} invalid files skipped.`, 'info');
    selectedFiles = validFiles;
  }

  const isBatch = selectedFiles.length > 1;
  let outputDir = null;

  if (isBatch) {
    outputDir = await open({
      directory: true,
      multiple: false,
      title: "Select Output Folder for Batch Processing"
    });
    if (!outputDir) return;
  }

  // Capture settings once
  // Capture settings once
  const config = {
    isAdvancedMode,
    advCodec: advCodec ? advCodec.value : '',
    advCrf: advCrf ? advCrf.value : '',
    advPreset: advPreset ? advPreset.value : '',
    advBackend: advBackend ? advBackend.value : '',
    advResolution: advResolution ? advResolution.value : '',
    advResW: advResW ? advResW.value : '',
    advResH: advResH ? advResH.value : '',
    advFps: advFps ? advFps.value : '',
    advFpsCustom: advFpsCustom ? advFpsCustom.value : '',
    advAudio: advAudio ? advAudio.value : '',
    advCustom: advCustom ? advCustom.value : '',
    currentQuality,
    encoderMode: document.getElementById('encoder-select') ? document.getElementById('encoder-select').value : ''
  };
  const baseArgs = getOptimizerArgs(config);

  // Determine extension
  let defaultExt = '.mp4';
  if (isAdvancedMode && advCodec && advCodec.value === 'prores_ks') defaultExt = '.mov';
  else if (isAdvancedMode && advCodec && advCodec.value === 'gif') defaultExt = '.gif';

  for (const input of selectedFiles) {
    let output;

    if (isBatch) {
      const name = input.split(/[\\/]/).pop();
      const lastDot = name.lastIndexOf('.');
      const base = lastDot > -1 ? name.substring(0, lastDot) : name;

      if (outputDir) {
        // Output dir explicitly selected in Batch Mode
        output = await join(outputDir, `${base}_optimized${defaultExt}`);
      } else if (appSettings.outputDir) {
        // Default Settings Output Dir
        output = await join(appSettings.outputDir, `${base}_optimized${defaultExt}`);
      } else {
        // In-place fallback
        output = input.replace(/(\.[^.]+)$/, '_optimized' + defaultExt);
      }

    } else {
      const defaultName = input.split(/[\\/]/).pop().replace(/(\.[^.]+)$/, '_optimized' + defaultExt);
      const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : input.replace(/(\.[^.]+)$/, '_optimized' + defaultExt);

      output = await save({
        defaultPath: defaultPath,
        filters: [{ name: 'Video', extensions: [defaultExt.substring(1)] }]
      });
      if (!output) continue;
    }

    const args = ['-i', input, ...baseArgs, '-y', output];

    // Add to global process manager
    processManager.addJob({
      name: input.split(/[\\/]/).pop(),
      type: 'Optimize',
      command: 'ffmpeg',
      args: args,
      output: output
    });
  }

  resetUI();
  showToast(`${isBatch ? 'Files' : 'File'} added to Queue`, 'success');
});

// getOptimizerArgs moved to utils logic

// Navigation Logic
const navBtns = document.querySelectorAll('.nav-btn');
const viewSections = document.querySelectorAll('.view-section');

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;

    // Update Buttons
    // Update Buttons
    navBtns.forEach(b => {
      b.classList.remove('bg-purple-600/20', 'text-purple-300', 'border', 'border-purple-500/30');
      b.classList.add('text-gray-400', 'hover-theme');
    });
    btn.classList.remove('text-gray-400', 'hover-theme');
    btn.classList.add('bg-purple-600/20', 'text-purple-300', 'border', 'border-purple-500/30');

    // Update Views
    viewSections.forEach(section => {
      if (section.id === targetId) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    });
  });
});

// --- Trimmer Logic ---
const trimDropzone = document.getElementById('trim-dropzone');
const trimUploadContent = document.getElementById('trim-upload-content');
const videoContainer = document.getElementById('video-container');
const trimVideoPreview = document.getElementById('trim-video-preview');
const trimChangeFile = document.getElementById('trim-change-file');
const trimControls = document.getElementById('trim-controls');
const trimStartInput = document.getElementById('trim-start');
const trimEndInput = document.getElementById('trim-end');
const setStartBtn = document.getElementById('set-start-btn');
const setEndBtn = document.getElementById('set-end-btn');
// --- Trimmer Elements ---
const trimActionBtn = document.getElementById('trim-action-btn');
const openExternalBtn = document.getElementById('open-external-btn');
const timelineTrack = document.getElementById('timeline-track');
const handleStart = document.getElementById('handle-start');
const handleEnd = document.getElementById('handle-end');
const rangeBar = document.getElementById('timeline-range-bar');
const dispStart = document.getElementById('timeline-start-display');
const dispEnd = document.getElementById('timeline-end-display');
const dispTotalStart = document.getElementById('timeline-total-start');
const dispTotalEnd = document.getElementById('timeline-total-end');

let trimFilePath = null;
let trimState = {
  duration: 0,
  start: 0,
  end: 0,
  isDraggingStart: false,
  isDraggingEnd: false
};

// Helper: Format seconds to HH:MM:SS (or HH:MM:SS.mmm)
function formatTime(seconds, highPrecision = false) {
  if (!seconds && seconds !== 0) return "00:00:00";
  const date = new Date(0);
  date.setSeconds(seconds); // Handles float seconds (ms) partially? No, setSeconds is integer.

  // Custom format to ensure MS precision
  const iso = new Date(seconds * 1000).toISOString();
  // ISO: 1970-01-01T00:00:00.000Z
  if (highPrecision) {
    return iso.substr(11, 12); // HH:MM:SS.mmm
  }
  return iso.substr(11, 8); // HH:MM:SS
}

// Update Timeline Visuals based on State
function updateTimelineUI() {
  const { duration, start, end } = trimState;
  if (duration === 0) return;

  const startPercent = (start / duration) * 100;
  const endPercent = (end / duration) * 100;

  // Handles
  handleStart.style.left = `${startPercent}%`;
  handleEnd.style.left = `${endPercent}%`;

  // Range Bar
  rangeBar.style.left = `${startPercent}%`;
  rangeBar.style.width = `${endPercent - startPercent}%`;

  // Visual Text (Clean)
  dispStart.textContent = formatTime(start);
  dispEnd.textContent = formatTime(end);
}

// Drag Logic with Mouse Events
function getSecondsFromEvent(e) {
  const rect = timelineTrack.getBoundingClientRect();
  let x = e.clientX - rect.left;
  // Clamp
  if (x < 0) x = 0;
  if (x > rect.width) x = rect.width;

  const percent = x / rect.width;
  return percent * trimState.duration;
}

// Mouse Down Handlers
handleStart.addEventListener('mousedown', (e) => {
  trimState.isDraggingStart = true;
  e.stopPropagation();
});

handleEnd.addEventListener('mousedown', (e) => {
  trimState.isDraggingEnd = true;
  e.stopPropagation();
});

// Global Mouse Move/Up
document.addEventListener('mousemove', (e) => {
  if (!trimState.isDraggingStart && !trimState.isDraggingEnd) return;

  const sec = getSecondsFromEvent(e);

  if (trimState.isDraggingStart) {
    // Clamp: start < end
    let newStart = sec;
    if (newStart >= trimState.end) newStart = trimState.end - 0.1;
    if (newStart < 0) newStart = 0;

    trimState.start = newStart;
    trimVideoPreview.currentTime = newStart; // Seek
  }
  else if (trimState.isDraggingEnd) {
    // Clamp: end > start
    let newEnd = sec;
    if (newEnd <= trimState.start) newEnd = trimState.start + 0.1;
    if (newEnd > trimState.duration) newEnd = trimState.duration;

    trimState.end = newEnd;
    trimVideoPreview.currentTime = newEnd;
  }

  updateTimelineUI();
});

document.addEventListener('mouseup', () => {
  trimState.isDraggingStart = false;
  trimState.isDraggingEnd = false;
});

// Video Metadata Loaded (Duration)
// Video Metadata Loaded (Duration)
trimVideoPreview.addEventListener('loadedmetadata', () => {
  const dur = trimVideoPreview.duration || 0;
  trimState.duration = dur;

  // Default: Trim first 10s or full if short
  trimState.start = 0;
  trimState.end = Math.min(dur, 10);
  if (trimState.end <= 0) trimState.end = dur;

  // Update Totals
  dispTotalStart.textContent = "00:00:00";
  dispTotalEnd.textContent = formatTime(dur);

  updateTimelineUI();

  // Generate Filmstrip
  // Filmstrip generation disabled by user request
});



// Trimmer Drag & Drop (Unified)
setupUnifiedDragDrop(trimDropzone, (paths) => {
  if (paths.length > 0) {
    loadTrimVideo(paths[0]); // Load first file
  }
});

trimDropzone.addEventListener('click', () => {
  if (!trimFilePath) loadTrimVideo();
});

async function loadTrimVideo(optionalPath = null) {
  try {
    let file = optionalPath;

    if (!file) {
      file = await open({
        multiple: false,
        filters: [{ name: 'Video', extensions: SUPPORTED_EXTENSIONS }]
      });
    }

    if (file) {
      trimFilePath = file;

      // Use Local Streaming Server (Axum) for reliable playback
      const port = 18493;
      const assetUrl = `http://localhost:${port}/stream?file=${encodeURIComponent(file)}`;

      console.log("Loading Stream:", assetUrl);

      trimVideoPreview.src = assetUrl;

      trimUploadContent.classList.add('hidden');
      videoContainer.classList.remove('hidden');
      trimControls.classList.remove('opacity-50', 'pointer-events-none');

      // Reset State
      trimState.start = 0;
      trimState.end = 10; // Will update on metadata load
      updateTimelineUI();

      openExternalBtn.classList.remove('hidden');
    }
  } catch (e) {
    console.error(e);
  }
}

trimVideoPreview.onerror = (e) => {
  console.error("Video Load Error", e);
  openExternalBtn.classList.remove('hidden');
};

openExternalBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (trimFilePath) {
    try {
      await invoke('open_file_in_system', { path: trimFilePath });
    } catch (err) {
      alert("Failed to open system player: " + err);
    }
  }
});

trimDropzone.addEventListener('click', (e) => {
  if (!trimFilePath) loadTrimVideo();
});

trimChangeFile.addEventListener('click', (e) => {
  e.stopPropagation();
  loadTrimVideo();
});

// --- Trim Logic ---
const trimModeRadios = document.querySelectorAll('input[name="trim-mode"]');
const trimBackendSelector = document.getElementById('trim-backend-selector');
const trimBackend = document.getElementById('trim-backend');

// UI Toggle Logic
trimModeRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value !== 'copy') {
      trimBackendSelector.classList.remove('hidden');
    } else {
      trimBackendSelector.classList.add('hidden');
    }
  });
});

trimActionBtn.addEventListener('click', async () => {
  if (!trimFilePath) return;

  const lastDot = trimFilePath.lastIndexOf('.');
  const ext = trimFilePath.substring(lastDot);
  const name = trimFilePath.split(/[\\/]/).pop();

  // Decide Mode
  // If no radio is checked (shouldn't happen due to default), fallback to copy
  const selectedRadio = document.querySelector('input[name="trim-mode"]:checked');
  const selectedMode = selectedRadio ? selectedRadio.value : 'copy';

  const suffix = selectedMode === 'copy' ? '_trimmed' : `_${selectedMode}`;

  const defaultName = name.substring(0, name.lastIndexOf('.')) + suffix + ext;
  const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : trimFilePath.substring(0, lastDot) + suffix + ext;

  const output = await save({ defaultPath, filters: [{ name: 'Video', extensions: [ext.substring(1)] }] });
  if (!output) return;

  const startStr = formatTime(trimState.start, true);
  const durationStr = formatTime(trimState.end - trimState.start, true);

  // --- Logic Branching --- //
  if (selectedMode !== 'copy') {
    // 1. Trim to Temp
    const tempD = await tempDir();
    const tempTrimPath = await join(tempD, `temp_trim_${Date.now()}${ext}`);

    // Trim Command (Fast Copy)
    const trimArgs = [
      '-ss', startStr, '-i', trimFilePath, '-t', durationStr,
      '-c', 'copy', '-map', '0', '-avoid_negative_ts', 'make_zero', '-y', tempTrimPath
    ];

    // 2. Add Trim Job
    const trimJobId = processManager.addJob({
      name: `Pre-Trim: ${name}`,
      type: 'Trim (Temp)',
      command: 'ffmpeg',
      args: trimArgs,
      output: tempTrimPath
    });

    // 3. Chain Optimize Job
    const backend = trimBackend ? trimBackend.value : 'cpu';
    const optArgs = ['-i', tempTrimPath];

    // Codec & Quality Logic
    let crf = '23'; // Default Balanced
    if (selectedMode === 'max') crf = '28'; // More compression

    // Backend Flags
    switch (backend) {
      case 'nvidia':
        optArgs.push('-c:v', 'h264_nvenc', '-cq', crf, '-preset', 'p4');
        break;
      case 'amd':
        optArgs.push('-c:v', 'h264_amf', '-rc', 'cqp', '-qp-i', crf, '-qp-p', crf, '-quality', 'balanced');
        break;
      case 'intel':
        optArgs.push('-c:v', 'h264_qsv', '-global_quality', crf, '-preset', 'medium');
        break;
      case 'cpu':
      default:
        optArgs.push('-c:v', 'libx264', '-crf', crf, '-preset', selectedMode === 'max' ? 'slow' : 'medium');
        break;
    }

    // Audio (Copy to preserve quality unless we add audio options later)
    optArgs.push('-c:a', 'copy');

    // Final Output
    optArgs.push('-y', output);

    processManager.addJob({
      name: `Compress (${selectedMode}): ${name}`,
      type: 'Optimize',
      command: 'ffmpeg',
      args: optArgs,
      output: output
    });

    showToast(`Queued: Trim + Opt (${selectedMode})`, 'success');

  } else {
    // Standard Trim
    const args = [
      '-ss', startStr, '-i', trimFilePath, '-t', durationStr,
      '-c', 'copy', '-map', '0', '-avoid_negative_ts', 'make_zero', '-y', output
    ];

    processManager.addJob({
      name: `Trim: ${trimFilePath.split(/[\\/]/).pop()}`,
      type: 'Trim',
      command: 'ffmpeg',
      args: args,
      output: output
    });

    showToast(`Trim task added to Queue`, 'success');
  }
});

// --- Converter Logic ---
const converterDropzone = document.getElementById('converter-dropzone');
const converterFileInput = document.getElementById('converter-file-input');
const converterSelectBtn = document.getElementById('converter-select-btn');
const converterUploadContent = document.getElementById('converter-upload-content');
const converterFileInfo = document.getElementById('converter-file-info');
const converterFilename = document.getElementById('converter-filename');
const converterChangeBtn = document.getElementById('converter-change-btn');
const converterControls = document.getElementById('converter-controls');
const convertFormatSelect = document.getElementById('convert-format-select');
const convertActionBtn = document.getElementById('convert-action-btn');

let converterFiles = [];

// Populate Formats
const EXT_TO_LABEL = {
  'mp4': 'MP4 (H.264/AAC)',
  'mkv': 'MKV (Matroska)',
  'mov': 'MOV (QuickTime)',
  'avi': 'AVI',
  'webm': 'WebM (VP9/Opus)',
  'gif': 'GIF (Animated)',
  'mp3': 'MP3 (Audio Only)',
  'wav': 'WAV (Audio Only)',
  'flv': 'FLV',
  'wmv': 'WMV'
};
const CONVERT_TARGETS = Object.keys(EXT_TO_LABEL);

CONVERT_TARGETS.forEach(ext => {
  const opt = document.createElement('option');
  opt.value = ext;
  opt.textContent = EXT_TO_LABEL[ext];
  convertFormatSelect.appendChild(opt);
});

async function loadConverterFile() {
  try {
    const selection = await open({
      multiple: true,
      filters: [{ name: 'Media', extensions: SUPPORTED_EXTENSIONS }]
    });
    if (selection) {
      if (Array.isArray(selection)) converterFiles = selection;
      else converterFiles = [selection];

      setupConverterFile(converterFiles);
    }
  } catch (e) {
    console.error(e);
  }
}

function setupConverterFile(files) {
  if (!files || files.length === 0) return;

  converterUploadContent.classList.add('hidden');
  converterFileInfo.classList.remove('hidden');
  converterFileInfo.classList.add('flex');
  converterControls.classList.remove('opacity-50', 'pointer-events-none');

  if (files.length === 1) {
    const name = files[0].replace(/^.*[\\\/]/, '');
    converterFilename.textContent = name;
  } else {
    converterFilename.textContent = `${files.length} Files Selected (Batch)`;
  }
}

// Converter Drag & Drop (Unified)
setupUnifiedDragDrop(converterDropzone, (paths) => {
  converterFiles = paths;
  setupConverterFile(converterFiles);
});

converterDropzone.addEventListener('click', (e) => {
  if (converterFiles.length === 0) loadConverterFile();
});

// --- Preview Logic ---
const previewBtn = document.getElementById('preview-btn'); // Needs to be added to HTML
if (previewBtn) {
  previewBtn.addEventListener('click', async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      showToast('Please select a video first', 'info');
      return;
    }
    const filePath = selectedFiles[0]; // Use selectedFiles array

    toggleLogoAnimation(true);
    showToast('Generating Preview...', 'info');

    try {
      // Generate paths for BOTH original (transcoded to safe MP4) and optimized
      const clips = await generatePreviewClips(filePath);
      if (clips) {
        showToast('Preview Ready!', 'success');
        openPreviewModal(clips.orig, clips.opt);
      }
    } catch (err) {
      showToast('Preview Failed', 'error');
      console.error(err);
    } finally {
      toggleLogoAnimation(false);
    }
  });
}

// Generate 5s Preview Clip
// Generate 5s Preview Clips (Original & Optimized)
async function generatePreviewClips(inputPath) {
  const tempD = await tempDir();
  const timestamp = Date.now();
  const pathOrig = await join(tempD, `preview_orig_${timestamp}.mp4`);
  const pathOpt = await join(tempD, `preview_opt_${timestamp}.mp4`);

  // 1. Generate "Original" Preview (Transcode to standardized MP4 for browser)
  const cmdOrig = Command.sidecar('ffmpeg', [
    '-ss', '0', '-t', '5', '-i', inputPath,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-c:a', 'aac',
    '-y', pathOrig
  ]);

  // 2. Generate "Optimized" Preview (Force .mp4 container)
  const baseArgs = getOptimizerArgs();
  const cmdOpt = Command.sidecar('ffmpeg', [
    '-ss', '0', '-t', '5', '-i', inputPath,
    ...baseArgs,
    '-y', pathOpt
  ]);

  // Run both in parallel
  await Promise.all([
    new Promise((resolve, reject) => {
      cmdOrig.on('close', (d) => d.code === 0 ? resolve() : reject(`Orig preview failed: ${d.code}`));
      cmdOrig.on('error', reject);
      cmdOrig.spawn();
    }),
    new Promise((resolve, reject) => {
      cmdOpt.on('close', (d) => d.code === 0 ? resolve() : reject(`Opt preview failed: ${d.code}`));
      cmdOpt.on('error', reject);
      cmdOpt.spawn();
    })
  ]);

  return { orig: pathOrig, opt: pathOpt };
}

// --- Modal & Sync Logic ---
function openPreviewModal(originalPath, optimizedPath) {
  const modal = document.getElementById('compare-modal');
  const vidOrig = document.getElementById('preview-original');
  const vidOpt = document.getElementById('preview-optimized');
  const slider = document.getElementById('compare-slider');
  const overlay = document.getElementById('compare-overlay');
  const closeBtn = document.getElementById('compare-close-btn');

  // Load sources with proper Tauri asset URL
  console.log('Original Path:', originalPath);
  console.log('Optimized Path:', optimizedPath);

  const srcOrig = convertFileSrc(originalPath);
  const srcOpt = convertFileSrc(optimizedPath);

  console.log('Converted Orig:', srcOrig);
  console.log('Converted Opt:', srcOpt);

  vidOrig.src = srcOrig;
  vidOpt.src = srcOpt;

  // Debug Error Listeners
  vidOrig.onerror = (e) => console.error('Video Original Error:', vidOrig.error, e);
  vidOpt.onerror = (e) => console.error('Video Optimized Error:', vidOpt.error, e);

  // Reset UI
  overlay.style.width = '50%';
  slider.style.left = '50%';
  modal.classList.remove('hidden');

  // Sync Logic
  let isSyncing = false;
  const sync = (source, target) => {
    if (isSyncing) return;
    isSyncing = true;
    if (Math.abs(source.currentTime - target.currentTime) > 0.1) {
      target.currentTime = source.currentTime;
    }
    if (source.paused !== target.paused) {
      source.paused ? target.pause() : target.play();
    }
    isSyncing = false;
  };

  const master = vidOpt; // Optimized as master (usually shorter load)
  const slave = vidOrig;

  master.onplay = () => slave.play();
  master.onpause = () => slave.pause();
  master.onseeking = () => slave.currentTime = master.currentTime;
  master.onseeked = () => slave.currentTime = master.currentTime;
  master.ontimeupdate = () => {
    if (Math.abs(master.currentTime - slave.currentTime) > 0.2) {
      slave.currentTime = master.currentTime;
    }
  };

  // Drag Logic
  let isDragging = false;
  const container = slider.parentElement;

  const onMove = (e) => {
    if (!isDragging) return;
    const rect = container.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

    slider.style.left = `${percent}%`;
    overlay.style.width = `${percent}%`;
  };

  slider.addEventListener('mousedown', () => isDragging = true);
  window.addEventListener('mouseup', () => isDragging = false);
  window.addEventListener('mousemove', onMove);

  // Close Logic
  closeBtn.onclick = () => {
    modal.classList.add('hidden');
    vidOrig.pause(); vidOrig.src = '';
    vidOpt.pause(); vidOpt.src = '';
    // Optional: Delete temp file here or keep for cache
  };
}

converterSelectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  loadConverterFile();
});

converterChangeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  loadConverterFile();
});

convertActionBtn.addEventListener('click', async () => {
  if (!converterFiles || converterFiles.length === 0) return;

  const isBatch = converterFiles.length > 1;
  const targetExt = convertFormatSelect.value;
  let fileQueue = [];

  // --- Paths ---
  if (!isBatch) {
    const converterFilePath = converterFiles[0];
    const lastDot = converterFilePath.lastIndexOf('.');
    const defaultPath = converterFilePath.substring(0, lastDot) + '_converted.' + targetExt;
    const output = await save({ defaultPath, filters: [{ name: 'Media', extensions: [targetExt] }] });
    if (!output) return;
    fileQueue.push({ input: converterFilePath, output: output });
  } else {
    const dir = await open({ directory: true, multiple: false, title: "Select Output Folder for Converted Files" });
    if (!dir) return;
    converterFiles.forEach(f => {
      const name = f.replace(/^.*[\\\/]/, '');
      const lastDot = name.lastIndexOf('.');
      const base = lastDot > -1 ? name.substring(0, lastDot) : name;
      fileQueue.push({ input: f, output: `${dir}/${base}_converted.${targetExt}` });
    });
  }

  // --- Queue Submission ---
  fileQueue.forEach(item => {
    processManager.addJob({
      name: item.input.split(/[\\/]/).pop(),
      type: 'Convert',
      command: 'ffmpeg',
      args: ['-i', item.input, '-y', item.output],
      output: item.output
    });
  });

  converterFiles = [];
  setupConverterFile([]);
  converterUploadContent.classList.remove('hidden');
  converterFileInfo.classList.add('hidden');

  showToast(`${fileQueue.length} items added to Queue`, 'success');
});

// --- Settings Logic Removed (Replaced by Global appSettings) ---

/* --- Video Merger Logic --- */
const mergerView = document.getElementById('view-merger');
const mergerAddBtn = document.getElementById('merger-add-btn');
const mergerActionBtn = document.getElementById('merger-action-btn');
const mergerListEl = document.getElementById('merger-list');
let mergerFiles = [];

if (mergerAddBtn) {
  // Merger Drag & Drop (Unified)
  setupUnifiedDragDrop(mergerListEl, (paths) => {
    mergerFiles = [...mergerFiles, ...paths];
    renderMergerList();
  });

  mergerAddBtn.addEventListener('click', async () => {
    const selection = await open({
      multiple: true,
      filters: [{ name: 'Video', extensions: SUPPORTED_EXTENSIONS }]
    });
    if (selection) {
      const newFiles = Array.isArray(selection) ? selection : [selection];
      mergerFiles = [...mergerFiles, ...newFiles];
      renderMergerList();
    }
  });
}

function renderMergerList() {
  mergerListEl.innerHTML = '';
  if (mergerFiles.length === 0) {
    mergerListEl.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-gray-500 space-y-2">
            <svg class="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            <p>Drag and drop files here to start</p>
        </div>`;
    mergerActionBtn.disabled = true;
    mergerActionBtn.classList.add('opacity-50', 'cursor-not-allowed');
    return;
  }

  mergerActionBtn.disabled = false;
  mergerActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');

  mergerFiles.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600';
    const name = file.split(/[\\/]/).pop();

    row.innerHTML = `
         <div class="flex items-center space-x-3 overflow-hidden">
            <span class="text-gray-400 font-mono text-xs w-6">${index + 1}.</span>
            <span class="text-white text-sm truncate w-64">${name}</span>
         </div>
         <div class="flex space-x-2">
            <button class="p-1 hover:text-purple-400" onclick="window.moveMergerItem(${index}, -1)">↑</button>
            <button class="p-1 hover:text-purple-400" onclick="window.window.moveMergerItem(${index}, 1)">↓</button>
            <button class="p-1 hover:text-red-400" onclick="window.removeMergerItem(${index})">×</button>
         </div>
       `;
    mergerListEl.appendChild(row);
  });
}

window.moveMergerItem = (index, dir) => {
  if (dir === -1 && index > 0) {
    [mergerFiles[index], mergerFiles[index - 1]] = [mergerFiles[index - 1], mergerFiles[index]];
  } else if (dir === 1 && index < mergerFiles.length - 1) {
    [mergerFiles[index], mergerFiles[index + 1]] = [mergerFiles[index + 1], mergerFiles[index]];
  }
  renderMergerList();
};
window.removeMergerItem = (index) => {
  mergerFiles.splice(index, 1);
  renderMergerList();
};

if (mergerActionBtn) {
  mergerActionBtn.addEventListener('click', async () => {
    if (mergerFiles.length < 2) {
      showToast('Select at least 2 files', 'error');
      return;
    }

    const output = await save({ defaultPath: appSettings.outputDir ? await join(appSettings.outputDir, 'merged_video.mp4') : undefined, filters: [{ name: 'Video', extensions: ['mp4'] }] });
    if (!output) return;

    try {
      // Generate Concat List with proper path escaping
      // Escape single quotes in file paths for FFmpeg concat format
      const listContent = mergerFiles.map(f => {
        const escapedPath = f.replace(/\\/g, '/').replace(/'/g, "'\\''");
        return `file '${escapedPath}'`;
      }).join('\n');

      const tempD = await tempDir();
      const listPath = await join(tempD, `concat_list_${Date.now()}.txt`);

      console.log('[Merge] Writing concat list to:', listPath);
      console.log('[Merge] Files to merge:', mergerFiles);

      await writeTextFile(listPath, listContent);

      const args = ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', output];

      processManager.addJob({
        name: `Merge ${mergerFiles.length} files`,
        type: 'Merge',
        command: 'ffmpeg',
        args: args,
        output: output
      });

      mergerFiles = [];
      renderMergerList();
      showToast('Merge task queued', 'success');
      Logger.log({ type: 'info', message: `Merge queued: ${mergerFiles.length} files → ${output}` });

    } catch (e) {
      console.error('[Merge Error]', e);
      const errorMsg = e.message || e.toString() || 'Unknown error';
      showToast(`Merge failed: ${errorMsg}`, 'error');
      Logger.log({ type: 'error', message: 'Merge Error', details: errorMsg });
    }
  });
}

/* --- Audio Tools Logic --- */
const audioDropzone = document.getElementById('audio-dropzone');
const btnExtract = document.getElementById('btn-extract-mp3');
const btnMute = document.getElementById('btn-mute-audio');
const btnNormalize = document.getElementById('btn-normalize-audio');
let audioFile = null;

if (audioDropzone) {
  // Audio Drag & Drop (Unified)
  setupUnifiedDragDrop(audioDropzone, (paths) => {
    if (paths.length > 0) {
      audioFile = paths[0];
      updateAudioUI();
    }
  });

  audioDropzone.addEventListener('click', async () => {
    const file = await open({ filters: [{ name: 'Video', extensions: SUPPORTED_EXTENSIONS }] });
    if (file) {
      audioFile = file;
      updateAudioUI();
    }
  });
}

function updateAudioUI() {
  if (audioFile) {
    document.getElementById('audio-file-content').classList.add('hidden');
    document.getElementById('audio-file-info').classList.remove('hidden');
    document.getElementById('audio-file-info').classList.add('flex');
    document.getElementById('audio-filename').textContent = audioFile.split(/[\\/]/).pop();
    document.getElementById('audio-actions').classList.remove('opacity-50', 'pointer-events-none');
  }
}

// Extract
if (btnExtract) {
  btnExtract.addEventListener('click', async () => {
    // Extract Logic
    if (!audioFile) return;
    const name = audioFile.split(/[\\/]/).pop();
    const defaultName = name.replace(/\.[^.]+$/, '.mp3');
    const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : audioFile.replace(/\.[^.]+$/, '.mp3');

    const output = await save({ defaultPath, filters: [{ name: 'Audio', extensions: ['mp3'] }] });
    if (!output) return;

    runAudioCommand(['-i', audioFile, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', output]);
  });
}
// Mute
if (btnMute) {
  btnMute.addEventListener('click', async () => {
    // Mute Logic
    if (!audioFile) return;
    const name = audioFile.split(/[\\/]/).pop();
    const defaultName = name.replace(/\.[^.]+$/, '_muted.mp4');
    const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : audioFile.replace(/\.[^.]+$/, '_muted.mp4');

    const output = await save({ defaultPath, filters: [{ name: 'Video', extensions: ['mp4'] }] });
    if (!output) return;

    runAudioCommand(['-i', audioFile, '-c:v', 'copy', '-an', '-y', output]);
  });
}
// Normalize
if (btnNormalize) {
  // Normalize Logic (Fixing garbage and implementing logic)
  btnNormalize.addEventListener('click', async () => {
    if (!audioFile) return;
    const name = audioFile.split(/[\\/]/).pop();
    const defaultName = name.replace(/\.[^.]+$/, '_norm.mp4');
    const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : audioFile.replace(/\.[^.]+$/, '_norm.mp4');

    const output = await save({ defaultPath, filters: [{ name: 'Video', extensions: ['mp4'] }] });
    if (!output) return;

    // Loudnorm filter
    runAudioCommand(['-i', audioFile, '-af', 'loudnorm', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-y', output]);
  });
}

async function runAudioCommand(args) {
  if (!audioFile) return;
  processManager.addJob({
    name: `Audio: ${audioFile.split(/[\\/]/).pop()}`,
    type: 'Audio',
    command: 'ffmpeg',
    args: args
  });
}

/* --- Inspector Logic --- */
const inspectorDropzone = document.getElementById('inspector-dropzone');
if (inspectorDropzone) {
  // Inspector Drag & Drop (Unified)
  setupUnifiedDragDrop(inspectorDropzone, (paths) => {
    if (paths.length > 0) inspectFile(paths[0]);
  });

  inspectorDropzone.addEventListener('click', async () => {
    const file = await open({ filters: [{ name: 'Video', extensions: SUPPORTED_EXTENSIONS }] });
    if (file) inspectFile(file);
  });
}

async function inspectFile(path) {
  document.getElementById('inspector-results').classList.remove('hidden');
  document.getElementById('meta-raw').textContent = "Loading...";

  try {
    const cmd = Command.sidecar('ffmpeg', ['-i', path, '-hide_banner']);
    const res = await cmd.execute(); // FFmpeg returns 1 on "no output file" but prints stderr

    // Output is in output (which is stdout+stderr?) or stderr?
    // Command.sidecar output structure: { code, stdout, stderr }
    const output = res.stderr;
    document.getElementById('meta-raw').textContent = output;

    // Parse basic info
    const durMatch = output.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d+)/);
    const bitMatch = output.match(/bitrate: (\d+ kb\/s)/);
    const streamMatch = output.match(/Stream #0:0.*: Video: (.*)/); // simplistic

    if (durMatch) document.getElementById('meta-duration').textContent = durMatch[1];
    if (bitMatch) document.getElementById('meta-bitrate').textContent = bitMatch[1];
    if (streamMatch) {
      const details = streamMatch[1].split(',');
      if (details[0]) document.getElementById('meta-container').textContent = details[0]; // codec
      // Size usually in stream details too "1920x1080"
      const resMatch = streamMatch[1].match(/(\d{3,5}x\d{3,5})/);
      if (resMatch) document.getElementById('meta-size').textContent = resMatch[1];
    }

  } catch (e) {
    console.error(e);
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  console.log("App Initializing... v2 NEW UI");
  initTheme();
  loadSettings();
  processManager.init();
  initQueueDragDrop();
});

function initQueueDragDrop() {
  const queueZone = document.getElementById('view-queue');
  if (!queueZone) return;

  queueZone.addEventListener('dragover', e => {
    e.preventDefault();
    // Visual feedback
    queueZone.classList.add('bg-purple-900/10');
  });

  queueZone.addEventListener('dragleave', e => {
    e.preventDefault();
    queueZone.classList.remove('bg-purple-900/10');
  });

  queueZone.addEventListener('drop', e => {
    e.preventDefault();
    queueZone.classList.remove('bg-purple-900/10');

    const paths = [];
    if (e.dataTransfer.files.length) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        if (f.path) paths.push(f.path);
        // Fallback for some browsers/environments if path is hidden, but Tauri usually exposes it.
      }
    }

    if (paths.length > 0) {
      queueFilesDefault(paths);
    }
  });
}

function queueFilesDefault(paths) {
  paths.forEach(path => {
    // Default: Optimize H.264
    const lastDot = path.lastIndexOf('.');
    const output = path.substring(0, lastDot) + '_optimized.mp4';

    processManager.addJob({
      name: `Auto-Opt: ${path.replace(/^.*[\\\/]/, '')}`,
      type: 'Optimizer',
      command: 'ffmpeg',
      args: ['-i', path, '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', '-y', output],
      output: output
    });
  });
  showToast(`${paths.length} files added to queue`, 'success');
}

/* --- Settings & Theme Logic (Variables Defined at Top) --- */

// Note: loadSettings functions etc. are defined below and used by init.

function loadSettings() {
  const s = localStorage.getItem('appSettings');
  if (s) {
    try {
      appSettings = { ...appSettings, ...JSON.parse(s) };
    } catch (e) { console.error("Settings parse error", e); }
  }
  applySettings();
  initSettingsUI();
}

function saveSettings() {
  localStorage.setItem('appSettings', JSON.stringify(appSettings));
}

function applySettings() {
  // Theme Application
  const body = document.body;
  body.classList.remove('theme-cosmic', 'theme-light', 'theme-midnight', 'theme-sunset');
  if (appSettings.theme && appSettings.theme !== 'theme-cosmic') {
    body.classList.add(appSettings.theme);
  }

  // Update UI State
  const btns = document.querySelectorAll('.theme-btn');
  btns.forEach(btn => {
    if (btn.dataset.theme === appSettings.theme) {
      btn.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-gray-900');
    } else {
      btn.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-gray-900');
    }
  });

  // Update Notification Checkbox
  const notifCheck = document.getElementById('setting-notifications');
  if (notifCheck) {
    notifCheck.checked = appSettings.notifications;
  }

  // Update Output Dir Label
  const dirLabel = document.getElementById('setting-output-dir-label');
  if (dirLabel) {
    dirLabel.textContent = appSettings.outputDir ? appSettings.outputDir : "Always ask for location";
    dirLabel.title = appSettings.outputDir || "";
  }
}

function initTheme() {
  // Kept for backward compatibility with existing calls
}

function initSettingsUI() {
  // 1. Settings Tab Navigation (Event Delegation)
  const settingsContainer = document.getElementById('view-settings');
  if (settingsContainer) {
    settingsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.settings-nav-btn');
      if (!btn) return;

      // Reset tabs
      document.querySelectorAll('.settings-nav-btn').forEach(b => {
        b.classList.remove('active', 'bg-gray-800', 'text-white');
        b.classList.add('text-gray-400');
      });

      // Activate clicked
      btn.classList.remove('text-gray-400');
      btn.classList.add('active', 'bg-gray-800', 'text-white');

      // Switch content
      const targetId = `tab-content-${btn.dataset.tab}`;
      document.querySelectorAll('.settings-tab-content').forEach(content => {
        if (content.id === targetId) content.classList.remove('hidden');
        else content.classList.add('hidden');
      });
    });
  }

  // 2. Theme Buttons (Event Delegation)
  // We can attach to a parent or just use old logic if elements exist
  const themeContainer = document.getElementById('tab-content-appearance');
  if (themeContainer) {
    themeContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-btn');
      if (!btn) return;

      appSettings.theme = btn.dataset.theme;
      saveSettings();
      applySettings();
    });
  } else {
    // Fallback
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        appSettings.theme = btn.dataset.theme;
        saveSettings();
        applySettings();
      });
    });
  }

  // 3. Notification Checkbox
  const notifCheck = document.getElementById('setting-notifications');
  if (notifCheck) {
    notifCheck.addEventListener('change', (e) => {
      appSettings.notifications = e.target.checked;
      saveSettings();
    });
  }

  // 4. Set Output Directory
  const btnSetDir = document.getElementById('btn-set-output-dir');
  if (btnSetDir) {
    if (btnSetDir) {
      btnSetDir.addEventListener('click', async () => {
        try {
          console.log("Opening directory dialog...");
          const selected = await open({
            directory: true,
            multiple: false,
            title: "Select Default Export Folder"
          });
          if (selected) {
            appSettings.outputDir = selected;
            saveSettings();
            applySettings();
          }
        } catch (e) {
          console.error("Failed to select directory", e);
          // Fallback or user info
        }
      });
    }
  }

  // 5. Logs Logic
  const btnRefreshLogs = document.getElementById('btn-refresh-logs');
  if (btnRefreshLogs) {
    btnRefreshLogs.addEventListener('click', () => {
      Logger.init();
      Logger.render();
    });
  }

  const btnClearLogs = document.getElementById('btn-clear-logs');
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      if (confirm('Clear all application logs?')) {
        Logger.clear();
      }
    });
  }

  // 6. About Links
  const btnGithub = document.getElementById('btn-about-github');
  if (btnGithub) {
    btnGithub.addEventListener('click', () => {
      openUrl('https://github.com/NebuchOwl/video-optimizer');
    });
  }

  // Initial Render of Logs
  Logger.render();
}

// Override showToast to respect settings
const originalShowToast = window.showToast;
window.showToast = function (msg, type) {
  if (appSettings.notifications === false) return;
  if (originalShowToast) originalShowToast(msg, type);
};

// --- Preset Manager ---
const presetManager = {
  presets: {},

  init() {
    this.load();
    this.updateDropdown();

    // Listeners
    const select = document.getElementById('user-preset-select');
    const saveBtn = document.getElementById('btn-save-preset');
    const delBtn = document.getElementById('btn-del-preset');

    // Watch relevant inputs to switch to "Unsaved" state
    const inputs = ['adv-backend', 'adv-codec', 'adv-preset', 'adv-crf', 'adv-resolution', 'adv-fps', 'adv-audio', 'adv-custom'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => this.resetSelection());
        el.addEventListener('input', () => this.resetSelection());
      }
    });

    if (select) {
      select.addEventListener('change', (e) => {
        if (e.target.value) this.apply(e.target.value);
        else this.toggleDelete(false);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const name = prompt("Enter preset name:");
        if (name) this.save(name);
      });
    }

    if (delBtn) {
      delBtn.addEventListener('click', () => {
        const name = select.value;
        if (name && confirm(`Delete preset "${name}"?`)) {
          this.delete(name);
        }
      });
    }
  },

  load() {
    const data = localStorage.getItem('userPresets');
    if (data) {
      try { this.presets = JSON.parse(data); } catch (e) { console.error(e); }
    }
  },

  save(name) {
    if (!name.trim()) return;

    // Capture current state
    const config = {
      backend: document.getElementById('adv-backend')?.value,
      codec: document.getElementById('adv-codec')?.value,
      preset: document.getElementById('adv-preset')?.value,
      crf: document.getElementById('adv-crf')?.value,
      resolution: document.getElementById('adv-resolution')?.value,
      resW: document.getElementById('adv-res-w')?.value,
      resH: document.getElementById('adv-res-h')?.value,
      fps: document.getElementById('adv-fps')?.value,
      fpsVal: document.getElementById('adv-fps-custom')?.value,
      audio: document.getElementById('adv-audio')?.value,
      custom: document.getElementById('adv-custom')?.value
    };

    this.presets[name] = config;
    localStorage.setItem('userPresets', JSON.stringify(this.presets));
    this.updateDropdown();

    // Select it
    const select = document.getElementById('user-preset-select');
    if (select) {
      select.value = name;
      this.toggleDelete(true);
    }
    showToast(`Preset "${name}" saved`, 'success');
  },

  delete(name) {
    delete this.presets[name];
    localStorage.setItem('userPresets', JSON.stringify(this.presets));
    this.updateDropdown();
    this.resetSelection();
    showToast(`Preset "${name}" deleted`, 'info');
  },

  apply(name) {
    const config = this.presets[name];
    if (!config) return;

    // Helper to safely set value and trigger change
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) {
        el.value = val;
        el.dispatchEvent(new Event('change'));
      }
    };

    set('adv-backend', config.backend);

    setTimeout(() => {
      set('adv-codec', config.codec);
      set('adv-preset', config.preset);
      set('adv-crf', config.crf);
      // Update CRF Display
      const crfDisp = document.getElementById('adv-crf-val');
      if (crfDisp) crfDisp.textContent = config.crf;

      set('adv-resolution', config.resolution);
      if (config.resolution === 'custom') {
        document.getElementById('adv-res-w').value = config.resW || '';
        document.getElementById('adv-res-h').value = config.resH || '';
      }

      set('adv-fps', config.fps);
      if (config.fps === 'custom') {
        document.getElementById('adv-fps-custom').value = config.fpsVal || '';
      }

      set('adv-audio', config.audio);
      set('adv-custom', config.custom);

      this.toggleDelete(true);
    }, 50);
  },

  updateDropdown() {
    const select = document.getElementById('user-preset-select');
    if (!select) return;

    // Keep first option
    const current = select.value;
    // Save children except options? No, rebuild.
    select.innerHTML = '<option value="">-- Current Settings --</option>';

    Object.keys(this.presets).forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    // Restore selection if exists
    if (this.presets[current]) select.value = current;
  },

  resetSelection() {
    const select = document.getElementById('user-preset-select');
    if (select) select.value = "";
    this.toggleDelete(false);
  },

  toggleDelete(canDelete) {
    const btn = document.getElementById('btn-del-preset');
    if (btn) {
      if (canDelete) btn.classList.remove('hidden');
      else btn.classList.add('hidden');
    }
  }
};


// Scroll Reveal Observer
const observerOptions = {
  root: null,
  rootMargin: '0px',
  threshold: 0.1
};

const scrollObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
      observer.unobserve(entry.target); // Only animate once
    }
  });
}, observerOptions);

function initScrollAnimations() {
  document.querySelectorAll('.scroll-reveal').forEach(el => {
    scrollObserver.observe(el);
  });
}

// --- Batch Manager ---
const batchManager = {
  files: [],
  isSimpleMode: true,

  init() {
    const dropzone = document.getElementById('batch-dropzone');
    const input = document.getElementById('batch-file-input');
    const simpleBtn = document.getElementById('batch-mode-simple');
    const advBtn = document.getElementById('batch-mode-advanced');
    const startBtn = document.getElementById('batch-start-btn');
    const clearBtn = document.getElementById('batch-clear-btn');
    const simplePanel = document.getElementById('batch-panel-simple');
    const advPanel = document.getElementById('batch-panel-advanced-v2');

    // Drag & Drop
    if (dropzone) {
      if (typeof setupUnifiedDragDrop === 'function') {
        setupUnifiedDragDrop(dropzone, (paths) => this.addFiles(paths));
      }

      // Use Tauri Native Dialog exclusively for click (Fixes multiple dialogs issue)
      dropzone.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const selected = await open({ multiple: true, filters: [{ name: 'Video', extensions: SUPPORTED_EXTENSIONS }] });
          if (selected) this.addFiles(selected);
        } catch (err) { console.error(err); }
      });
    }

    if (input) {
      input.addEventListener('change', (e) => {
        if (e.target.files.length) {
          const paths = [];
          for (const f of e.target.files) {
            if (f.path) paths.push(f.path);
            else if (f.name) paths.push(f.name);
          }
          if (paths.length) this.addFiles(paths);
        }
      });
      // Redundant dropzone click listener removed to prevent double dialogs

    }

    // Mode Toggle (Handled by initBatchAdvanced mainly, but we sync state here)
    if (simpleBtn && advBtn && simplePanel && advPanel) {
      simpleBtn.addEventListener('click', () => {
        this.isSimpleMode = true;
        // UI Classes handled by initBatchAdvanced or here redundancy is fine as long as IDs match
        simplePanel.classList.remove('hidden');
        advPanel.classList.add('hidden');
        advPanel.style.display = '';

        simpleBtn.className = 'flex-1 px-4 py-2 rounded-md text-xs font-bold bg-gray-700 text-white shadow transition-all';
        advBtn.className = 'flex-1 px-4 py-2 rounded-md text-xs font-bold text-gray-400 hover:text-white transition-all';
      });

      advBtn.addEventListener('click', () => {
        this.isSimpleMode = false;
        advPanel.classList.remove('hidden');
        advPanel.style.display = 'block';
        simplePanel.classList.add('hidden');

        advBtn.className = 'flex-1 px-4 py-2 rounded-md text-xs font-bold bg-gray-700 text-white shadow transition-all';
        simpleBtn.className = 'flex-1 px-4 py-2 rounded-md text-xs font-bold text-gray-400 hover:text-white transition-all';
      });
    }

    // Option Buttons
    document.querySelectorAll('.batch-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.batch-opt-btn').forEach(b => b.classList.remove('active', 'ring-2', 'ring-purple-500', 'bg-gray-800'));
        btn.classList.add('active', 'ring-2', 'ring-purple-500', 'bg-gray-800');
      });
    });

    if (clearBtn) clearBtn.addEventListener('click', () => {
      this.files = [];
      this.updateUI();
    });

    if (startBtn) startBtn.addEventListener('click', () => this.startBatch());

    // --- Batch Advanced UI Init ---
    const bAdvBackend = document.getElementById('batch-adv-backend');
    const bAdvRes = document.getElementById('batch-adv-resolution');
    const bAdvFps = document.getElementById('batch-adv-fps');
    const bAdvCrf = document.getElementById('batch-adv-crf');

    if (bAdvBackend) {
      bAdvBackend.addEventListener('change', () => this.updateBatchCodecs());
      this.updateBatchCodecs(); // Init
    }

    if (bAdvRes) {
      bAdvRes.addEventListener('change', (e) => {
        const custom = document.getElementById('batch-adv-res-custom');
        if (custom) {
          if (e.target.value === 'custom') {
            custom.classList.remove('hidden');
            custom.style.display = 'flex'; // Ensure flex layout
          } else {
            custom.classList.add('hidden');
            custom.style.display = 'none';
          }
        }
      });
    }

    if (bAdvFps) {
      bAdvFps.addEventListener('change', (e) => {
        const custom = document.getElementById('batch-adv-fps-custom');
        if (custom) {
          if (e.target.value === 'custom') {
            custom.classList.remove('hidden');
            custom.style.display = 'block';
          } else {
            custom.classList.add('hidden');
            custom.style.display = 'none';
          }
        }
      });
    }

    if (bAdvCrf) {
      bAdvCrf.addEventListener('input', (e) => {
        const valInfo = document.getElementById('batch-adv-crf-val');
        if (valInfo) valInfo.textContent = e.target.value;
      });
    }

    // Initial UI state
    this.updateUI();
  },

  updateBatchCodecs() {
    const backendEl = document.getElementById('batch-adv-backend');
    const codecEl = document.getElementById('batch-adv-codec');
    if (!backendEl || !codecEl) return;

    const backend = backendEl.value;
    const options = codecsByBackend[backend] || codecsByBackend.cpu;

    // Save current selection if possible
    const current = codecEl.value;

    codecEl.innerHTML = '';
    options.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.val;
      el.textContent = opt.label;
      codecEl.appendChild(el);
    });

    // Try restore
    if (current && options.find(o => o.val === current)) {
      codecEl.value = current;
    }
  },

  addFiles(paths) {
    if (!paths) return;
    const arrayPaths = Array.isArray(paths) ? paths : [paths];

    // Validate absolute paths (Must contain separators)
    const validPaths = arrayPaths.filter(p => p && (p.includes('/') || p.includes('\\')));

    if (validPaths.length < arrayPaths.length) {
      console.warn("Ignored files with invalid paths (browser restriction?)");
      if (window.showToast) window.showToast("Some files skipped (invalid path)", "error");
    }

    // Avoid duplicates
    const newFiles = validPaths.filter(p => !this.files.includes(p));
    this.files = [...this.files, ...newFiles];
    this.updateUI();
    if (newFiles.length > 0) showToast(`${newFiles.length} files added to Batch`, 'success');
  },

  removeFile(index) {
    this.files.splice(index, 1);
    this.updateUI();
  },

  updateUI() {
    const list = document.getElementById('batch-list');
    const clearBtn = document.getElementById('batch-clear-btn');
    if (!list) return;

    if (this.files.length === 0) {
      list.innerHTML = '<div class="h-full flex flex-col items-center justify-center text-gray-500 space-y-2 opacity-50"><span class="text-sm">Queue is empty</span></div>';
      if (clearBtn) clearBtn.classList.add('hidden');
      return;
    }

    if (clearBtn) clearBtn.classList.remove('hidden');

    list.innerHTML = this.files.map((file, i) => {
      const name = file.replace(/^.*[\\\/]/, '');
      return `
         <div class="flex justify-between items-center bg-gray-900/50 p-3 rounded-lg border border-gray-700/50 group hover:border-purple-500/50 transition-colors">
            <span class="text-xs text-gray-300 truncate font-mono">${name}</span>
            <button onclick="batchManager.removeFile(${i})" class="text-gray-500 hover:text-red-400 font-bold px-2">×</button>
         </div>
       `;
    }).join('');
  },

  async startBatch() {
    if (this.files.length === 0) return showToast('No files in batch queue', 'error');

    const args = [];
    // Determine extension early
    let ext = '.mp4';
    if (this.isSimpleMode) {
      const formatSelect = document.getElementById('batch-format-simple');
      ext = formatSelect ? formatSelect.value : '.mp4';
    } else {
      // Advanced mode fallback logic
      const formatSelect = document.getElementById('batch-format-simple');
      ext = formatSelect ? formatSelect.value : '.mp4';
    }

    // --- Simple Mode Logic ---
    if (this.isSimpleMode) {
      const qualityBtn = document.querySelector('.batch-opt-btn.active');
      const quality = qualityBtn ? qualityBtn.dataset.q : 'medium'; // low, medium, high
      const unitSelect = document.getElementById('batch-unit-simple');
      const unit = unitSelect ? unitSelect.value : 'cpu';

      // Base Codec Selection
      let codec = 'libx264';
      if (unit === 'nvidia') codec = 'h264_nvenc';
      else if (unit === 'amd') codec = 'h264_amf';
      else if (unit === 'intel') codec = 'h264_qsv';

      // WebM Safety Override & Optimization
      if (ext === '.webm') {
        codec = 'libvpx-vp9'; // Force VP9 for WebM compatibility
        // Note: Avoiding 'vp9_nvenc' for now due to variable driver support.
        // We will optimize CPU encoding instead.
      }

      args.push('-c:v', codec);

      // --- Args By Codec Type ---
      if (codec === 'libvpx-vp9') {
        // Optimizing VP9 Speed (Critical for WebM)
        // -row-mt 1: Multi-threading
        // -cpu-used 3: Speed/Quality balance (0=slowest, 5=fastest for encode)
        args.push('-row-mt', '1', '-threads', '0', '-cpu-used', '3');

        // VP9 Constant Quality Mode
        if (quality === 'medium') args.push('-crf', '32', '-b:v', '0');
        else if (quality === 'low') args.push('-crf', '36', '-b:v', '0');
        else if (quality === 'high') args.push('-crf', '25', '-b:v', '0');
      }
      else {
        // Standard H.264 / HEVC Logic
        // CPU Logic
        if (unit.startsWith('cpu')) {
          // High Quality (medium size)
          if (quality === 'medium') args.push('-crf', '23', '-preset', 'medium');
          // Balanced (good quality, smaller) -> actually 'low' on UI is 'Balanced'
          else if (quality === 'low') args.push('-crf', '26', '-preset', 'fast');
          // Max Compression (smallest size) -> 'high' on UI
          else if (quality === 'high') args.push('-crf', '30', '-preset', 'slow');

          // CPU Low handling
          if (unit === 'cpu-low') {
            // Could add -threads 2 here if needed
          }
        }
        // GPU Logic
        else {
          if (unit === 'nvidia') {
            if (quality === 'medium') args.push('-cq', '23', '-preset', 'p4');
            else if (quality === 'low') args.push('-cq', '28', '-preset', 'p2');
            else if (quality === 'high') args.push('-cq', '32', '-preset', 'p6');
          }
          else {
            // AMF/QSV
            if (quality === 'medium') args.push('-qp', '23');
            else if (quality === 'low') args.push('-qp', '28');
            else if (quality === 'high') args.push('-qp', '32');
          }
        }
      }

      if (ext === '.webm') {
        args.push('-c:a', 'libvorbis'); // WebM requires Vorbis or Opus
      } else {
        args.push('-c:a', 'aac'); // Default Audio for MP4/MKV/MOV
      }
    }
    // --- Advanced Mode Logic ---
    else {
      // 1. Processing Unit (handled implicitly by Codec selection, but we verify codec)
      let codec = document.getElementById('batch-adv-codec').value;

      // WebM Safety Check in Advanced Mode
      if (ext === '.webm') {
        const isCompatible = codec.includes('vp9') || codec.includes('vp8') || codec.includes('av1') || codec.includes('libvpx') || codec.includes('libaom');
        if (!isCompatible && !codec.includes('copy')) {
          showToast("Forcing VP9 codec for WebM compatibility", "info");
          codec = 'libvpx-vp9'; // Auto-fix
        }
      }

      args.push('-c:v', codec);

      // 2. Preset
      const preset = document.getElementById('batch-adv-preset').value;
      if (preset && !codec.includes('copy')) args.push('-preset', preset);

      // 3. CRF / Quality
      const crf = document.getElementById('batch-adv-crf').value;
      if (crf && !codec.includes('copy')) {
        // If GPU, might need adjustment, but user selected "CRF" on UI.
        // We pass it as -crf. If encoder rejects, user has to know (Advanced mode).
        // Smart tweak: NVENC uses -cq for crf-like behavior.
        if (codec.includes('nvenc')) args.push('-cq', crf);
        else if (codec.includes('amf') || codec.includes('qsv')) args.push('-qp', crf);
        else args.push('-crf', crf);
      }

      // 4. Resolution
      const resVal = document.getElementById('batch-adv-resolution').value;
      if (resVal === 'custom') {
        const w = document.getElementById('batch-adv-res-w').value;
        const h = document.getElementById('batch-adv-res-h').value;
        if (w && h) args.push('-vf', `scale=${w}:${h}`);
      } else if (resVal !== 'original') {
        args.push('-vf', `scale=${resVal}`);
      }

      // 5. FPS
      const fpsVal = document.getElementById('batch-adv-fps').value;
      if (fpsVal === 'custom') {
        const fps = document.getElementById('batch-adv-fps-custom').value;
        if (fps) args.push('-r', fps);
      } else if (fpsVal !== 'original') {
        args.push('-r', fpsVal);
      }

      // 6. Audio
      const audio = document.getElementById('batch-adv-audio').value;

      if (audio === 'none') {
        args.push('-an');
      }
      else if (ext === '.webm' && (audio === 'copy' || audio === 'aac')) {
        // Auto-fix for WebM: Force libvorbis if copy/aac selected (since AAC is invalid in WebM)
        // Note: If source is already Vorbis, copy would work, but we can't know source codec easily here. 
        // Safer to re-encode to Vorbis for WebM target.
        args.push('-c:a', 'libvorbis');
      }
      else if (audio === 'copy') {
        args.push('-c:a', 'copy');
      }
      else {
        args.push('-c:a', audio);
      }

      // 7. Custom
      const custom = document.getElementById('batch-adv-custom').value;
      if (custom) {
        // rudimentary split, might break on quotes
        args.push(...custom.trim().split(/\s+/));
      }

      // Ext? Advanced doesn't have format selector in UI?
      // Re-use Simple Format selector or assume MP4? 
      // The Plan said "Full Parity", original Advanced Panel doesn't specific format often (it's input dependent or mp4).
      // Let's check existing Advanced Panel... it didn't have Format selector either, just Resolution.
      // We will default to MP4 for consistency or use the toggle from Simple mode if visible?
      // Best to grab from the simple selector even if hidden, or default to .mp4
      // ext was already determined at top of function


      // Safety fix for WebM in Advanced Mode if Audio is 'copy' or 'aac' (incompatible)
      if (ext === '.webm') {
        const audio = document.getElementById('batch-adv-audio').value;
        // If user selected incompatible audio or default copy which might be AAC
        if (audio === 'aac' || audio === 'copy') {
          // We can't easily force it if user explicitly said copy, but for WebM it will likely fail if source is AAC.
          // Let's warn or silent auto-fix only if it's AAC standard.
          // Actually, remove the previous audio push if we override?
          // It's cleaner to handle the push here.
        }
      }
    }

    showToast(`Queuing ${this.files.length} jobs...`, 'info');

    // Add to Process Manager
    for (const input of this.files) {
      const name = input.replace(/^.*[\\\/]/, '');
      const base = name.lastIndexOf('.') > -1 ? name.substring(0, name.lastIndexOf('.')) : name;

      const outputDir = appSettings.outputDir;
      const output = outputDir ? await join(outputDir, `${base}_batch${ext}`) : input.replace(/(\.[^.]+)$/, `_batch${ext}`);
      const finalOutput = (output === input) ? `${input}-batch${ext}` : output; // Safety

      processManager.addJob({
        name: name,
        type: 'Batch',
        command: 'ffmpeg',
        args: ['-i', input, ...args, '-y', finalOutput],
        output: finalOutput
      });
    }

    this.files = [];
    this.updateUI();

    const queueBtn = document.querySelector('[data-target="view-queue"]');
    if (queueBtn) queueBtn.click();
  }
};

window.batchManager = batchManager; // Expose for inline onclick

// --- Batch Advanced Mode Logic ---
function initBatchAdvanced() {
  const batchModeSimpleFn = document.getElementById('batch-mode-simple');
  const batchModeAdvFn = document.getElementById('batch-mode-advanced');
  const batchPanelSimple = document.getElementById('batch-panel-simple');
  const batchPanelAdvanced = document.getElementById('batch-panel-advanced-v2');

  const batchAdvBackend = document.getElementById('batch-adv-backend');
  const batchAdvCodec = document.getElementById('batch-adv-codec');
  const batchAdvCrf = document.getElementById('batch-adv-crf');
  const batchAdvCrfVal = document.getElementById('batch-adv-crf-val');

  const batchAdvResolution = document.getElementById('batch-adv-resolution');
  const batchAdvResCustom = document.getElementById('batch-adv-res-custom');
  const batchAdvFps = document.getElementById('batch-adv-fps');
  const batchAdvFpsCustom = document.getElementById('batch-adv-fps-custom');

  // 1. Toggle Mode
  function setBatchMode(mode) {
    if (mode === 'advanced') {
      // Show Advanced
      if (batchPanelSimple) batchPanelSimple.classList.add('hidden');

      if (batchPanelAdvanced) {
        batchPanelAdvanced.classList.remove('hidden');
        batchPanelAdvanced.style.display = 'block'; // Force display
      }

      if (batchModeAdvFn) {
        batchModeAdvFn.classList.remove('text-gray-400', 'bg-transparent');
        batchModeAdvFn.classList.add('bg-gray-700', 'text-white', 'shadow');
      }

      if (batchModeSimpleFn) {
        batchModeSimpleFn.classList.add('text-gray-400', 'bg-transparent');
        batchModeSimpleFn.classList.remove('bg-gray-700', 'text-white', 'shadow');
      }

      // Update global state if needed, or just let batchManager read DOM checks
      if (window.batchManager) window.batchManager.isAdvanced = true;
    } else {
      // Show Simple
      if (batchPanelAdvanced) {
        batchPanelAdvanced.classList.add('hidden');
        batchPanelAdvanced.style.display = ''; // Reset
      }

      if (batchPanelSimple) batchPanelSimple.classList.remove('hidden');

      if (batchModeSimpleFn) {
        batchModeSimpleFn.classList.remove('text-gray-400', 'bg-transparent');
        batchModeSimpleFn.classList.add('bg-gray-700', 'text-white', 'shadow');
      }

      if (batchModeAdvFn) {
        batchModeAdvFn.classList.add('text-gray-400', 'bg-transparent');
        batchModeAdvFn.classList.remove('bg-gray-700', 'text-white', 'shadow');
      }

      if (window.batchManager) window.batchManager.isAdvanced = false;
    }
  }

  if (batchModeSimpleFn && batchModeAdvFn) {
    batchModeSimpleFn.addEventListener('click', () => setBatchMode('simple'));
    batchModeAdvFn.addEventListener('click', () => setBatchMode('advanced'));
  }

  // 2. Codec Population (Reusing global codecsByBackend)
  function updateBatchCodecs() {
    if (!batchAdvBackend || !batchAdvCodec) return;
    const backend = batchAdvBackend.value;
    // Ensure codecsByBackend is available (from global scope)
    const options = (typeof codecsByBackend !== 'undefined' ? codecsByBackend[backend] : []) || [];

    batchAdvCodec.innerHTML = '';
    options.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.val;
      el.textContent = opt.label;
      batchAdvCodec.appendChild(el);
    });
  }

  if (batchAdvBackend) {
    batchAdvBackend.addEventListener('change', updateBatchCodecs);
    updateBatchCodecs(); // Init
  }

  // 3. CRF Slider
  if (batchAdvCrf) {
    batchAdvCrf.addEventListener('input', (e) => {
      if (batchAdvCrfVal) batchAdvCrfVal.textContent = e.target.value;
    });
  }

  // 4. Custom Fields Toggle
  if (batchAdvResolution) {
    batchAdvResolution.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        batchAdvResCustom.classList.remove('hidden');
        batchAdvResCustom.classList.add('flex'); // Ensure flex
      } else {
        batchAdvResCustom.classList.add('hidden');
        batchAdvResCustom.classList.remove('flex');
      }
    });
  }

  if (batchAdvFps) {
    batchAdvFps.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        batchAdvFpsCustom.classList.remove('hidden');
        batchAdvFpsCustom.classList.add('block'); // Input is block usually
      } else {
        batchAdvFpsCustom.classList.add('hidden');
        batchAdvFpsCustom.classList.remove('block');
      }
    });
  }

  // 5. Presets Logic (Mini-Manager)
  const presetSelect = document.getElementById('batch-user-preset-select');
  const btnSave = document.getElementById('batch-btn-save-preset');
  const btnDel = document.getElementById('batch-btn-del-preset');

  function loadBatchPresets() {
    if (!presetSelect) return;
    const saved = localStorage.getItem('userPresets');
    let presets = {};
    if (saved) {
      try { presets = JSON.parse(saved); } catch (e) { console.error(e); }
    }

    // Clear old options (keep first)
    while (presetSelect.options.length > 1) {
      presetSelect.remove(1);
    }

    Object.keys(presets).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      presetSelect.appendChild(opt);
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const name = await window.prompt("Enter preset name:");
      if (!name) return;

      const settings = {
        backend: batchAdvBackend?.value,
        codec: batchAdvCodec?.value,
        preset: document.getElementById('batch-adv-preset')?.value,
        crf: document.getElementById('batch-adv-crf')?.value,
        resolution: batchAdvResolution?.value,
        resW: document.getElementById('batch-adv-res-w')?.value,
        resH: document.getElementById('batch-adv-res-h')?.value,
        fps: batchAdvFps?.value,
        fpsCustom: batchAdvFpsCustom?.value,
        audio: document.getElementById('batch-adv-audio')?.value,
        custom: document.getElementById('batch-adv-custom')?.value,
      };

      const saved = localStorage.getItem('userPresets');
      let presets = saved ? JSON.parse(saved) : {};
      presets[name] = settings;
      localStorage.setItem('userPresets', JSON.stringify(presets));

      loadBatchPresets();
      presetSelect.value = name;
      if (window.showToast) window.showToast(`Preset "${name}" saved!`, 'success');
    });
  }

  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      const name = presetSelect.value;
      if (!name) return; // Reset?

      const saved = localStorage.getItem('userPresets');
      if (!saved) return;
      const presets = JSON.parse(saved);
      const s = presets[name];
      if (!s) return;

      // Apply
      if (batchAdvBackend) { batchAdvBackend.value = s.backend; updateBatchCodecs(); }
      // Wait for codec update
      setTimeout(() => {
        if (batchAdvCodec) batchAdvCodec.value = s.codec;
      }, 0);

      const elConfig = {
        'batch-adv-preset': s.preset,
        'batch-adv-crf': s.crf,
        'batch-adv-resolution': s.resolution,
        'batch-adv-res-w': s.resW,
        'batch-adv-res-h': s.resH,
        'batch-adv-fps': s.fps,
        'batch-adv-fps-custom': s.fpsCustom,
        'batch-adv-audio': s.audio,
        'batch-adv-custom': s.custom
      };

      for (const [id, val] of Object.entries(elConfig)) {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
      }

      // Update UI states
      if (batchAdvCrfVal) batchAdvCrfVal.textContent = s.crf;
      if (batchAdvResolution) batchAdvResolution.dispatchEvent(new Event('change'));
      if (batchAdvFps) batchAdvFps.dispatchEvent(new Event('change'));
    });

    // Init load
    loadBatchPresets();
  }
}

// --- About Links & Version Logic ---
function initAboutLinks() {
  const githubBtn = document.getElementById('btn-about-github');
  const websiteBtn = document.getElementById('btn-about-website');

  if (githubBtn) {
    githubBtn.addEventListener('click', async () => {
      try {
        await openUrl('https://github.com/NebuchOwl/BitSpark');
      } catch (e) {
        console.error('Failed to open GitHub:', e);
      }
    });
  }

  if (websiteBtn) {
    websiteBtn.addEventListener('click', async () => {
      try {
        await openUrl('https://github.com/NebuchOwl');
      } catch (e) {
        console.error('Failed to open Website:', e);
      }
    });
  }

  // Inject version and build ID from Vite env (set by CI)
  const version = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const buildNumber = import.meta.env.VITE_BUILD_NUMBER || 'dev';

  const versionBadge = document.getElementById('about-version-badge');
  if (versionBadge) {
    versionBadge.textContent = `BETA ${version}`;
  }

  const buildIdEl = document.getElementById('about-build-id');
  if (buildIdEl) {
    buildIdEl.textContent = `b${version}-${buildNumber}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  presetManager.init();
  if (window.processManager) window.processManager.init();
  if (window.batchManager) window.batchManager.init();
  initBatchAdvanced(); // Initialize Batch Advanced Logic
  initAboutLinks(); // Initialize About Links

  initScrollAnimations();

  // --- Window Controls ---
  const appWindow = getCurrentWindow();
  document.getElementById('titlebar-minimize')?.addEventListener('click', () => {
    appWindow.minimize().catch(e => console.error('Minimize error:', e));
  });
  document.getElementById('titlebar-maximize')?.addEventListener('click', () => {
    appWindow.toggleMaximize().catch(e => console.error('Maximize error:', e));
  });
  document.getElementById('titlebar-close')?.addEventListener('click', () => {
    appWindow.close().catch(e => console.error('Close error:', e));
  });

  // Navigation Patch - Ensure Batch button works if not covered by existing logic or double-bind is fine
  // (Assuming existing logic uses delegated listener or we just add a new one)
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (!target) return;

      // Hide all view sections
      document.querySelectorAll('.view-section').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('flex'); // Important for flex layouts
        if (el.classList.contains('dynamic-flex')) el.classList.remove('dynamic-flex-active'); // if used
      });

      // Show target
      const targetEl = document.getElementById(target);
      if (targetEl) {
        targetEl.classList.remove('hidden');
        // Restore flex if needed (checking class list in HTML)
        if (targetEl.classList.contains('dynamic-flex')) targetEl.classList.add('flex'); // or rely on CSS
        else targetEl.classList.add('flex'); // Force flex for views usually
      }

      // Update Nav State
      document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('bg-purple-600/20', 'text-purple-300', 'border-purple-500/30');
        b.classList.add('text-gray-400', 'hover-theme');
      });
      btn.classList.add('bg-purple-600/20', 'text-purple-300', 'border-purple-500/30');
      btn.classList.remove('text-gray-400', 'hover-theme');
    });
  });
});
