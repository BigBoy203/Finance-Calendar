// IndexedDB-backed storage shim for the web build of Finance Calendar.
//
// The desktop (Electron) build exposes window.api via a preload bridge; this
// file recreates the same interface in the browser so none of the app's
// components need to know which build they're running in. loadData/saveData
// persist to IndexedDB; exportData/importData use a blob download and a file
// picker in place of the desktop's native dialogs.

(function () {
  const DB_NAME = 'finance-calendar';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  const DATA_KEY = 'finance-data';

  // Mirrors the desktop build's default data shape (src/main.js), plus a
  // couple of web-only settings for the Monday backup reminder.
  function getDefaultData() {
    return {
      onboardingComplete: false,
      lastModified: 0,
      incomeSources: [],
      majorBills: [],
      subscriptions: [],
      oneTimeEntries: [],
      creditCards: [],
      paidHistory: {},
      dismissedLate: {},
      forcedLate: {},
      removedOccurrences: {},
      activityLog: [],
      overrides: {},
      settings: {
        theme: 'system',
        accent: 'blue',
        accentCustom: '#378ADD',
        currency: 'USD',
        firstDayOfWeek: 0,
        lateGraceDays: 0,
        needsAttentionLookaheadDays: 7,
        incomeNeedsAttentionLookaheadDays: 1,
        autoDeductCardPayments: true,
        installDate: null,
        dateFormat: 'short',
        showWeekNumbers: false,
        density: 'comfortable',
        customCss: '',
        sectionColors: {
          majorBills: '#D85A5A',
          subscriptions: '#D8A857',
          creditCards: '#8B6FD6',
          incomeSources: '#4FAE6B',
          oneTimePayments: '#D8845A',
          oneTimeIncome: '#4FAE6B'
        },
        // web-only: weekly "download a backup" reminder
        backupReminderEnabled: true,
        lastBackupReminderShown: null
      }
    };
  }

  // Fills in any fields missing from an older saved blob so the app never
  // reads undefined for something it expects.
  function mergeDeep(defaults, data) {
    const out = { ...defaults, ...data };
    out.settings = {
      ...defaults.settings,
      ...(data.settings || {}),
      sectionColors: {
        ...defaults.settings.sectionColors,
        ...((data.settings && data.settings.sectionColors) || {})
      }
    };
    return out;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve({ success: true });
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadData() {
    try {
      const raw = await dbGet(DATA_KEY);
      if (!raw) {
        const initial = getDefaultData();
        await dbSet(DATA_KEY, initial);
        return initial;
      }
      return mergeDeep(getDefaultData(), raw);
    } catch (err) {
      console.error('Failed to load data from IndexedDB, using defaults:', err);
      return getDefaultData();
    }
  }

  async function saveData(data) {
    try {
      // Preserve an explicit lastModified if the caller set one (so a synced
      // file and the local copy can share the exact same stamp); otherwise
      // advance it now.
      const stamped = { ...data, lastModified: data.lastModified || Date.now() };
      await dbSet(DATA_KEY, stamped);
      return { success: true, lastModified: stamped.lastModified };
    } catch (err) {
      console.error('Failed to save data to IndexedDB:', err);
      return { success: false, error: String(err) };
    }
  }

  // Export: serialize current data and trigger a browser download. Browsers
  // don't report whether the user actually saved the file, so this resolves
  // success once the download is triggered.
  async function exportData() {
    try {
      const data = await loadData();
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-calendar-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // Import: open a file picker, read and validate the chosen JSON, then
  // overwrite IndexedDB and return the parsed data. Mirrors the desktop
  // contract: { success, data?, error?, canceled? }.
  function importData() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';

      let settled = false;
      const finish = (result) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) {
          finish({ success: false, canceled: true });
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const parsed = JSON.parse(reader.result);
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.majorBills)) {
              finish({ success: false, error: 'This file doesn\u2019t look like a Finance Calendar backup. Import cancelled.' });
              return;
            }
            const merged = mergeDeep(getDefaultData(), parsed);
            await saveData(merged);
            finish({ success: true, data: merged });
          } catch (err) {
            finish({ success: false, error: `Failed to import: ${err.message || String(err)}` });
          }
        };
        reader.onerror = () => finish({ success: false, error: 'Could not read the selected file.' });
        reader.readAsText(file);
      };

      // Best-effort cancel detection: if the window regains focus and no file
      // was chosen shortly after, treat it as cancelled. Not perfectly
      // reliable across browsers, but only affects whether a "cancelled"
      // message shows - the import itself is unaffected.
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            finish({ success: false, canceled: true });
          }
        }, 500);
      };
      window.addEventListener('focus', onFocus);

      input.click();
    });
  }

  window.api = { loadData, saveData, exportData, importData };
})();
