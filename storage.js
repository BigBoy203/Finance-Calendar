
(function () {
  const DB_NAME = 'finance-calendar';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  const DATA_KEY = 'finance-data';

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

        backupReminderEnabled: true,
        lastBackupReminderShown: null
      }
    };
  }

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

      const stamped = { ...data, lastModified: data.lastModified || Date.now() };
      await dbSet(DATA_KEY, stamped);
      return { success: true, lastModified: stamped.lastModified };
    } catch (err) {
      console.error('Failed to save data to IndexedDB:', err);
      return { success: false, error: String(err) };
    }
  }

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

  function importData() {
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
      const finish = (result) => {
        if (!settled) {
          settled = true;
          cleanup();
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

      input.click();
    });
  }

  window.api = { loadData, saveData, exportData, importData };
})();
