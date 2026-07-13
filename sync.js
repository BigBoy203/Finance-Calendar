
const Sync = (function () {
  const HANDLE_KEY = 'sync-file-handle';
  const DB_NAME = 'finance-calendar';
  const STORE = 'kv';

  const supportsFileSystem = typeof window !== 'undefined'
    && 'showSaveFilePicker' in window
    && 'showOpenFilePicker' in window;

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

  async function ensurePermission(handle, mode) {
    if (!handle || !handle.queryPermission) return true;
    const opts = { mode: mode || 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

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

  function readFromPicker() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';

      input.accept = '.json,application/json,text/plain,text/json';

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
