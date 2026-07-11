/* ---------------- Sync layer ----------------
 * Local-first sync with no server. Two modes:
 *
 *   Desktop (Chrome/Edge): the File System Access API lets us hold a handle
 *   to a user-chosen .json file across sessions (persisted in IndexedDB).
 *   After the one-time pick, Sync writes to that file and reads from it
 *   directly - no dialogs, no Files app.
 *
 *   iOS Safari (and anything without the API): falls back to a blob download
 *   (which routes through the iOS share sheet -> Save to Files / LocalSend)
 *   and a file-picker import.
 *
 * Conflict rule: newest wins, compared on data.lastModified. Reads never
 * silently replace newer local data - the caller is told and decides.
 */

const Sync = (function () {
  const HANDLE_KEY = 'sync-file-handle';
  const DB_NAME = 'finance-calendar';
  const STORE = 'kv';

  const supportsFileSystem = typeof window !== 'undefined'
    && 'showSaveFilePicker' in window
    && 'showOpenFilePicker' in window;

  // ---- tiny IndexedDB helpers (handles must live in IDB, not localStorage,
  // because a FileSystemFileHandle is a structured-clonable object) ----
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      let store;
      try {
        store = db.transaction(STORE, 'readonly').objectStore(STORE);
      } catch (e) { resolve(null); return; }
      const r = store.get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbDel(key) {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // ---- file handle lifecycle (desktop) ----
  async function getSavedHandle() {
    if (!supportsFileSystem) return null;
    try { return await idbGet(HANDLE_KEY); } catch (e) { return null; }
  }
  async function hasLinkedFile() {
    return !!(await getSavedHandle());
  }
  async function forgetFile() {
    await idbDel(HANDLE_KEY);
  }

  // Verify (and if needed, re-request) permission on a stored handle. Browsers
  // may require a fresh user gesture after a restart, so this is called from
  // within click handlers.
  async function ensurePermission(handle, mode) {
    if (!handle || !handle.queryPermission) return true;
    const opts = { mode: mode || 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

  // Let the user choose / create the sync file (desktop). One-time.
  async function linkFile() {
    if (!supportsFileSystem) return { ok: false, unsupported: true };
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'finance-calendar-data.json',
        types: [{ description: 'Finance Calendar data', accept: { 'application/json': ['.json'] } }]
      });
      await idbSet(HANDLE_KEY, handle);
      return { ok: true };
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, canceled: true };
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  // Pick an existing file to link + read from (desktop "connect to existing").
  async function linkExistingFile() {
    if (!supportsFileSystem) return { ok: false, unsupported: true };
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Finance Calendar data', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      await idbSet(HANDLE_KEY, handle);
      return { ok: true };
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, canceled: true };
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  function parseAndValidate(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.majorBills)) {
      throw new Error('That file doesn\u2019t look like Finance Calendar data.');
    }
    return parsed;
  }

  // ---- write ----
  // Desktop: write to the linked file. Phone/unsupported: trigger a download
  // (routes through the share sheet). `data` should already carry a current
  // lastModified stamp.
  async function writeOut(data) {
    const json = JSON.stringify(data, null, 2);
    const handle = await getSavedHandle();
    if (supportsFileSystem && handle) {
      const ok = await ensurePermission(handle, 'readwrite');
      if (!ok) return { ok: false, error: 'Permission to write the sync file was denied.' };
      try {
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        return { ok: true, mode: 'file' };
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    }
    // fallback: download / share sheet
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-calendar-data-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { ok: true, mode: 'download' };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  // ---- read ----
  // Desktop: read the linked file. Returns the parsed data (caller compares
  // lastModified and decides whether to apply).
  async function readLinked() {
    const handle = await getSavedHandle();
    if (!supportsFileSystem || !handle) return { ok: false, noFile: true };
    const ok = await ensurePermission(handle, 'read');
    if (!ok) return { ok: false, error: 'Permission to read the sync file was denied.' };
    try {
      const file = await handle.getFile();
      const text = await file.text();
      if (!text.trim()) return { ok: false, empty: true };
      const parsed = parseAndValidate(text);
      return { ok: true, data: parsed };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  // Phone/unsupported: open a file picker and read the chosen file.
  function readFromPicker() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      // iOS is picky about accept filters and can grey out valid .json files
      // saved from other apps, so accept broadly and validate after reading.
      input.accept = '.json,application/json,text/plain,text/json';
      // iOS Safari will not reliably fire 'change' for a detached input, so it
      // must live in the DOM. Keep it invisible and off-layout.
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.opacity = '0';
      document.body.appendChild(input);

      let settled = false;
      const cleanup = () => { if (input.parentNode) input.parentNode.removeChild(input); };
      const finish = (r) => { if (!settled) { settled = true; cleanup(); resolve(r); } };

      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) { finish({ ok: false, canceled: true }); return; }
        const reader = new FileReader();
        reader.onload = () => {
          try { finish({ ok: true, data: parseAndValidate(reader.result) }); }
          catch (err) { finish({ ok: false, error: String((err && err.message) || err) }); }
        };
        reader.onerror = () => finish({ ok: false, error: 'Could not read the file.' });
        reader.readAsText(file);
      };
      // No focus-based cancel timeout: on iOS it fires before the file is
      // handed over and wrongly reports a cancel. If the user backs out, the
      // promise simply stays pending until the next attempt, which is
      // harmless. A cancel is only reported when the picker returns no file.
      input.click();
    });
  }

  return {
    supportsFileSystem,
    hasLinkedFile,
    linkFile,
    linkExistingFile,
    forgetFile,
    writeOut,
    readLinked,
    readFromPicker
  };
})();
