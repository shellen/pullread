// ABOUTME: Tauri compatibility shim — loaded before all other viewer modules
// ABOUTME: Detects Tauri environment and provides cross-platform helpers

// Detect if running inside a Tauri WebView
window.PR_TAURI = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);

/**
 * Cross-platform folder picker.
 * Uses Tauri dialog plugin when available, falls back to /api/pick-folder.
 */
window.prPickFolder = async function () {
  if (window.PR_TAURI) {
    try {
      const { open } = window.__TAURI__.dialog || await import('@tauri-apps/plugin-dialog');
      const path = await open({ directory: true, title: 'Choose Output Folder' });
      if (path) return { path: path };
      return { cancelled: true };
    } catch (e) {
      console.warn('Tauri dialog failed, falling back to API:', e);
    }
  }
  // Fallback: use the Bun server's osascript-based picker
  try {
    var res = await fetch('/api/pick-folder', { method: 'POST' });
    return await res.json();
  } catch (e) {
    return { cancelled: true, error: e.message };
  }
};

/**
 * Listen for file-change events from the Tauri backend.
 * Falls back to polling /api/files-changed if not in Tauri.
 */
window.prListenFilesChanged = async function (callback) {
  if (window.PR_TAURI) {
    try {
      const { listen } = window.__TAURI__.event || await import('@tauri-apps/api/event');
      await listen('files:changed', function () { callback(); });
      return true; // Event-based, no polling needed
    } catch (e) {
      console.warn('Tauri event listen failed:', e);
    }
  }
  return false; // Caller should fall back to polling
};

/**
 * Send a notification via Tauri or ignore silently.
 */
window.prNotify = async function (title, body) {
  if (window.PR_TAURI) {
    try {
      const { sendNotification, isPermissionGranted } = window.__TAURI__.notification || await import('@tauri-apps/plugin-notification');
      if (await isPermissionGranted()) {
        sendNotification({ title: title, body: body });
      }
    } catch (e) {
      console.warn('Tauri notification failed:', e);
    }
  }
};

/**
 * Open a URL in the system default browser.
 * Uses Tauri shell plugin when available, falls back to window.open.
 */
window.prOpenExternal = async function (url) {
  if (window.PR_TAURI) {
    try {
      const shell = window.__TAURI__.shell || await import('@tauri-apps/plugin-shell');
      await shell.open(url);
      return;
    } catch (e) {
      console.warn('Tauri shell open failed, falling back:', e);
    }
  }
  window.open(url, '_blank');
};

/**
 * Save content to a file with a native save dialog.
 * Uses Tauri dialog plugin + server endpoint when available,
 * falls back to blob download in browser mode.
 */
window.prSaveFile = async function (content, defaultFilename, mimeType) {
  if (window.PR_TAURI) {
    try {
      const dialog = window.__TAURI__.dialog || await import('@tauri-apps/plugin-dialog');
      const ext = defaultFilename.split('.').pop() || 'md';
      const filePath = await dialog.save({
        defaultPath: defaultFilename,
        filters: [{ name: ext.toUpperCase() + ' file', extensions: [ext] }],
      });
      if (!filePath) return false; // User cancelled
      var res = await fetch('/api/write-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: content }),
      });
      if (!res.ok) throw new Error('Server write failed');
      return true;
    } catch (e) {
      console.warn('Tauri save failed, falling back to blob download:', e);
    }
  }
  // Fallback: blob download
  var blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
};

// Log Tauri detection result
if (window.PR_TAURI) {
  console.log('[PullRead] Running inside Tauri WebView');
} else {
  console.log('[PullRead] Running in standalone browser mode');
}
