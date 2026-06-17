// IndexedDB-backed storage shim for the web build of Finance Calendar.
// Exposes the same window.api.loadData()/saveData() interface the desktop
// (Electron) build exposes via contextBridge, so none of the app's
// components or logic need to know which build they're running in.

(function () {
  const DB_NAME = 'finance-calendar';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  const DATA_KEY = 'finance-data';

  function getDefaultData() {
    return {
      onboardingComplete: false,
      incomeSources: [],
      majorBills: [],
      subscriptions: [],
      oneTimeEntries: [],
      creditCards: [],
      paidHistory: {},
      dismissedLate: {},
      forcedLate: {},
      overrides: {},
      settings: {
        theme: 'system',
        accent: 'blue',
        currency: 'USD',
        firstDayOfWeek: 0,
        lateGraceDays: 0,
        needsAttentionLookaheadDays: 7,
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
        // web-only setting: weekly backup reminder (Mondays)
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
      sectionColors: { ...defaults.settings.sectionColors, ...((data.settings && data.settings.sectionColors) || {}) }
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
      await dbSet(DATA_KEY, data);
      return { success: true };
    } catch (err) {
      console.error('Failed to save data to IndexedDB:', err);
      return { success: false, error: String(err) };
    }
  }

  window.api = { loadData, saveData };
})();
