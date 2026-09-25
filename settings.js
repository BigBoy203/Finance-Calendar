
const SECTION_COLOR_LABELS = [
  { key: 'majorBills', label: 'Essentials' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'creditCards', label: 'Credit card payments' },
  { key: 'incomeSources', label: 'Income' },
  { key: 'oneTimePayments', label: 'Purchases' },
  { key: 'oneTimeIncome', label: 'One-time income' },
  { key: 'advances', label: 'Advances' }
];

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'colors', label: 'Calendar colors' },
  { id: 'advanced', label: 'Advanced' }
];

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return { h: 210, s: 70, l: 54 };
  const int = parseInt(m[1], 16);
  let r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function CustomAccentPicker({ hex, onChange }) {
  const { h: hue, s: sat, l: lig } = hexToHsl(hex);
  const setHsl = (nh, ns, nl) => onChange(hslToHex(nh, ns, nl));

  const row = (label, value, min, max, onInput, trackBg) =>
    h('label', { className: 'accent-slider-row' },
      h('span', { className: 'accent-slider-label' }, label),
      h('input', {
        type: 'range', min, max, value,
        onChange: (e) => onInput(Number(e.target.value)),
        className: 'accent-slider',
        style: { background: trackBg }
      })
    );

  return h('div', { className: 'custom-accent-picker' },
    h('div', { className: 'accent-hex-row' },
      h('span', { className: 'accent-preview', style: { background: hex } }),
      h('input', {
        type: 'text',
        className: 'accent-hex',
        value: hex,
        onChange: (e) => {
          let v = e.target.value.trim();
          if (v && v[0] !== '#') v = '#' + v;
          onChange(v);
        },
        placeholder: '#378ADD',
        maxLength: 7
      })
    ),
    row('Hue', hue, 0, 360, (v) => setHsl(v, sat, lig),
      'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'),
    row('Saturation', sat, 0, 100, (v) => setHsl(hue, v, lig),
      `linear-gradient(to right,${hslToHex(hue, 0, lig)},${hslToHex(hue, 100, lig)})`),
    row('Lightness', lig, 0, 100, (v) => setHsl(hue, sat, v),
      `linear-gradient(to right,#000,${hslToHex(hue, sat, 50)},#fff)`)
  );
}

function SettingsPage({ data, setData, onRestart }) {
  const [tab, setTab] = useState('general');
  const [confirming, setConfirming] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [walletCheck, setWalletCheck] = useState(false);
  const currency = data.settings.currency;

  function updateSetting(field, value) {
    setData({ ...data, settings: { ...data.settings, [field]: value } });
  }

  function updateSectionColor(key, hex) {
    setData({ ...data, settings: { ...data.settings, sectionColors: { ...data.settings.sectionColors, [key]: hex } } });
  }

  function openAddIncome() {
    setEditingIncome({ ...blankEntry({ freq: 'biweekly', category: 'Income' }), _isNew: true });
  }

  function openEditIncome(entry) {
    setEditingIncome({ ...entryToFormShape(entry), _isNew: false });
  }

  function handleIncomeSubmit(cleaned) {
    if (editingIncome._isNew) {
      const { _isNew, ...entry } = cleaned;
      setData(logActivity({ ...data, incomeSources: [...data.incomeSources, entry] }, `Added income source "${entry.name}"`));
    } else {
      setData(logActivity(applyEditedEntry(data, 'incomeSources', cleaned), `Edited "${cleaned.name}"`));
    }
    setEditingIncome(null);
  }

  function deleteIncome(entry) {
    setData(logActivity({ ...data, incomeSources: data.incomeSources.filter((e) => e.id !== entry.id) }, `Deleted income source "${entry.name}"`));
  }

  let tabContent;
  if (tab === 'general') {
    tabContent = h(GeneralTab, {
      data, currency, updateSetting,
      onAddIncome: openAddIncome, onEditIncome: openEditIncome,
      onWalletCheck: () => setWalletCheck(true)
    });
  } else if (tab === 'colors') {
    tabContent = h(ColorsTab, { data, updateSectionColor });
  } else {
    tabContent = h(AdvancedTab, { data, setData, updateSetting, onRestart, confirming, setConfirming });
  }

  return h('div', { className: 'page-stack' },
    h('h2', { className: 'sub-title' }, 'Settings'),
    h('div', { className: 'settings-tabs' },
      h(ChipToggle, { wide: true, options: SETTINGS_TABS, value: tab, onChange: setTab })
    ),
    tabContent,
    walletCheck ? h(WalletCheckSheet, { data, setData, onClose: () => setWalletCheck(false) }) : null,

    editingIncome ? h(EntryFormModal, {
      data,
      title: editingIncome._isNew ? 'Add income source' : 'Edit income source',
      entry: editingIncome,
      categories: null,
      dateLabel: 'Pay date',
      isIncome: true,
      submitLabel: editingIncome._isNew ? 'Add' : 'Save',
      onSubmit: handleIncomeSubmit,
      onDelete: editingIncome._isNew ? null : () => { deleteIncome(editingIncome); setEditingIncome(null); },
      deleteLabel: `Delete ${editingIncome.name || 'this income source'}`,
      onClose: () => setEditingIncome(null)
    }) : null
  );
}

function WalletSettingsCard({ data, updateSetting, onWalletCheck }) {
  const on = walletOn(data);
  const summary = on ? walletSummary(data) : null;
  const currency = data.settings.currency;
  return h('div', { className: 'card' },
    h('p', { className: 'settings-card-title' }, 'Wallet'),
    h('p', { className: 'settings-card-sub' },
      summary
        ? `${fmtCurrency(summary.balance, currency)} available \u00b7 last wallet check ${formatDate(parseYmd(summary.check.date), data.settings)}`
        : 'A running balance of the money you actually have, kept honest by a quick check each month.'),
    h('div', { className: 'switch-list' },
      h(SettingSwitch, {
        id: 'wallet-on',
        title: 'Track my wallet',
        sub: 'Turns Spending into your Wallet \u2014 paychecks add to it, bills and purchases take from it',
        checked: on,
        onChange: (v) => {
          updateSetting('walletEnabled', v);
          if (v && !lastWalletCheck(data)) onWalletCheck();
        }
      }),
      on ? h(SettingSwitch, {
        id: 'wallet-monthly',
        title: 'Monthly wallet check',
        sub: 'Asks what you have the first time you open the app each month',
        checked: data.settings.walletMonthlyCheck !== false,
        onChange: (v) => updateSetting('walletMonthlyCheck', v)
      }) : null
    ),
    on ? h('div', { className: 'action-list' },
      h(ActionRow, {
        title: 'Do a wallet check now',
        sub: 'Tell the app what you have so the balance matches your bank',
        onClick: onWalletCheck
      })
    ) : null
  );
}

function GeneralTab({ data, currency, updateSetting, onAddIncome, onEditIncome, onWalletCheck }) {
  return h('div', { className: 'settings-stack' },

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Income sources'),
      h('p', { className: 'settings-card-sub' }, 'Paychecks and anything else that lands on a schedule.'),
      data.incomeSources.length === 0
        ? h('p', { className: 'empty-state' }, 'No income sources added yet.')
        : h('div', { className: 'entry-list' },
            data.incomeSources.map((e) => {
              const avg = (e.useAvgEstimate && e.useAmountRange) ? averagePaycheck(data, e) : null;
              return h(EntryRow, {
                key: e.id,
                name: e.name,
                sub: scheduleLabel(e, data),
                note: avg
                  ? (avg.ready
                      ? `\u2248${fmtCurrency(avg.amount, currency)} estimated \u00b7 average of your last ${avg.count} checks`
                      : `Estimating \u2014 ${avg.count} of 2 checks recorded so far`)
                  : null,
                amount: `+${entryAmountLabel(e, currency)}`,
                positive: true,
                color: getEntryColor({ ...e, sourceList: 'incomeSources' }, data),
                onClick: () => onEditIncome(e)
              });
            })
          ),
      h('button', { className: 'add-row', onClick: onAddIncome }, '+ Add an income source')
    ),

    h(WalletSettingsCard, { data, updateSetting, onWalletCheck }),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Appearance'),
      h('p', { className: 'qa-label' }, 'Theme'),
      h(ChipToggle, {
        wide: true,
        options: [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }],
        value: data.settings.theme,
        onChange: (t) => updateSetting('theme', t)
      }),
      h('p', { className: 'qa-label' }, 'Accent color'),
      h('div', { className: 'swatch-row' },
        ACCENTS.map((a) =>
          h('button', {
            key: a.id,
            className: `swatch${data.settings.accent === a.id ? ' selected' : ''}`,
            style: { background: a.hex },
            'aria-label': a.label,
            onClick: () => { haptic('light'); updateSetting('accent', a.id); }
          })
        ),
        h('button', {
          className: `swatch swatch-custom${data.settings.accent === 'custom' ? ' selected' : ''}`,
          'aria-label': 'Custom color',
          onClick: () => { haptic('light'); updateSetting('accent', 'custom'); },
          style: data.settings.accent === 'custom' && data.settings.accentCustom
            ? { background: data.settings.accentCustom }
            : undefined
        })
      ),
      data.settings.accent === 'custom'
        ? h(CustomAccentPicker, {
            hex: data.settings.accentCustom || '#378ADD',
            onChange: (hex) => updateSetting('accentCustom', hex)
          })
        : null,
      h('p', { className: 'qa-label' }, 'First day of week'),
      h(ChipToggle, {
        wide: true,
        options: [{ id: 0, label: 'Sunday' }, { id: 1, label: 'Monday' }],
        value: data.settings.firstDayOfWeek,
        onChange: (v) => updateSetting('firstDayOfWeek', v)
      })
    ),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Money & bills'),
      h('div', { className: 'setup-entry-grid' },
        h(Field, { label: 'Currency' },
          h('select', {
            value: data.settings.currency,
            onChange: (e) => updateSetting('currency', e.target.value)
          }, CURRENCIES.map((c) => h('option', { key: c, value: c }, c)))
        ),
        h(Field, { label: 'Late after' },
          h('input', {
            type: 'number', inputMode: 'numeric', min: 0, max: 30,
            value: data.settings.lateGraceDays,
            onChange: (e) => updateSetting('lateGraceDays', parseInt(e.target.value, 10) || 0)
          })
        ),
        h(Field, { label: 'Flag bills early' },
          h('input', {
            type: 'number', inputMode: 'numeric', min: 0, max: 60,
            value: data.settings.needsAttentionLookaheadDays,
            onChange: (e) => updateSetting('needsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0)
          })
        ),
        h(Field, { label: 'Flag income early' },
          h('input', {
            type: 'number', inputMode: 'numeric', min: 0, max: 60,
            value: data.settings.incomeNeedsAttentionLookaheadDays,
            onChange: (e) => updateSetting('incomeNeedsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0)
          })
        )
      ),
      h('p', { className: 'setup-hint' },
        'All in days. Late after: how long past due before a bill counts as late. Flag early: how far ahead a bill or paycheck with a price range shows up under Needs attention, so you can fill in the real amount.'),
      h('div', { className: 'switch-list' },
        h(SettingSwitch, {
          id: 'auto-deduct-cc',
          title: 'Pay down card balances',
          sub: 'Marking a card payment paid subtracts it from that card\u2019s balance',
          checked: data.settings.autoDeductCardPayments !== false,
          onChange: (v) => updateSetting('autoDeductCardPayments', v)
        }),
        h(SettingSwitch, {
          id: 'haptics',
          title: 'Vibrate on taps',
          sub: 'Android only \u2014 iPhone Safari does not allow web vibration',
          checked: data.settings.hapticsEnabled !== false,
          onChange: (v) => { updateSetting('hapticsEnabled', v); if (v) haptic('medium'); }
        })
      )
    )
  );
}

function ColorsTab({ data, updateSectionColor }) {
  return h('div', { className: 'settings-stack' },
    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Section colors'),
      h('p', { className: 'settings-card-sub' },
        'Used for dots, bars and chips on the calendar. Any single bill, subscription or income source can use its own color from its edit window.'),
      h('div', { className: 'color-list' },
        SECTION_COLOR_LABELS.map(({ key, label }) =>
          h('label', { key, className: 'color-row' },
            h('span', { className: 'color-row-swatch', style: { background: data.settings.sectionColors[key] || '#888888' } }),
            h('span', { className: 'color-row-name' }, label),
            h('span', { className: 'color-row-hex' }, (data.settings.sectionColors[key] || '#888888').toUpperCase()),
            h('input', {
              type: 'color',
              value: data.settings.sectionColors[key] || '#888888',
              onChange: (e) => updateSectionColor(key, e.target.value)
            })
          )
        )
      )
    )
  );
}

function relativeTime(ms) {
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function SyncCard({ data, setData }) {
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [conflict, setConflict] = useState(null);
  const supportsFile = Sync.supportsFileSystem;

  useEffect(() => {
    Sync.hasLinkedFile().then(setLinked);
  }, []);

  function flash(ok, text) { setMsg({ ok, text }); }

  async function handleSync() {
    setBusy(true); setMsg(null);
    const stamp = Date.now();
    const stamped = { ...data, lastModified: stamp };
    const res = await Sync.writeOut(stamped);
    setBusy(false);
    if (res.ok) {
      const withStamp = { ...stamped, settings: { ...stamped.settings, lastExported: stamp } };
      setData(withStamp, { lastModified: stamp });
      flash(true, res.mode === 'file'
        ? 'Synced to your file.'
        : 'Exported — choose where to save it (Files, LocalSend, etc.).');
    } else if (!res.canceled) {
      flash(false, res.error || 'Could not sync.');
    }
  }

  async function handleLoad() {
    setBusy(true); setMsg(null);
    const res = (supportsFile && linked) ? await Sync.readLinked() : await Sync.readFromPicker();
    setBusy(false);
    if (!res.ok) {
      if (res.canceled) return;
      if (res.noFile) { flash(false, 'No sync file linked yet.'); return; }
      if (res.empty) { flash(false, 'The sync file is empty.'); return; }
      flash(false, res.error || 'Could not load.');
      return;
    }
    const incoming = res.data;
    if ((incoming.lastModified || 0) < (data.lastModified || 0)) {
      setConflict({ incoming });
      return;
    }
    applyIncoming(incoming);
    flash(true, 'Loaded the latest data.');
  }

  function applyIncoming(incoming) {
    setData(incoming, { lastModified: incoming.lastModified || Date.now() });
    setConflict(null);
  }

  async function handleLink(existing) {
    setBusy(true); setMsg(null);
    const res = existing ? await Sync.linkExistingFile() : await Sync.linkFile();
    setBusy(false);
    if (res.ok) {
      setLinked(true);
      if (existing) await handleLoad(); else await handleSync();
    } else if (!res.canceled) {
      flash(false, res.error || 'Could not link a file.');
    }
  }

  async function handleUnlink() {
    await Sync.forgetFile();
    setLinked(false);
    flash(true, 'Unlinked. This device no longer auto-syncs to that file.');
  }

  return h('div', { className: 'sync-card' },
    h('p', { className: 'sheet-lead' },
      supportsFile
        ? 'Keep this device in step with a single data file. Link it once, then Sync writes your latest data to it and Load pulls the newest back in. Your data stays on your device and in your own file — never on a server.'
        : 'Sync exports your data through the share sheet (Save to Files, LocalSend, and so on) and loads it back when you switch devices. Newest data always wins. Nothing is sent to a server.'),

    h('div', { className: 'sync-status' },
      h('span', { className: `sync-dot${data.lastModified ? ' on' : ''}` }),
      h('span', null, 'Last change: ', h('strong', null, relativeTime(data.lastModified))),
      linked ? h('span', { className: 'sync-linked-pill' }, '✓ File linked') : null
    ),

    supportsFile ? h('div', { className: 'button-row' },
      linked
        ? h('button', { onClick: handleUnlink, disabled: busy }, 'Unlink file')
        : h(React.Fragment, null,
            h('button', { onClick: () => handleLink(false), disabled: busy }, 'Create sync file'),
            h('button', { onClick: () => handleLink(true), disabled: busy }, 'Link existing file')
          )
    ) : null,

    h('div', { className: 'button-row' },
      h('button', { onClick: handleLoad, disabled: busy }, 'Load from file'),
      h('button', { className: 'primary', onClick: handleSync, disabled: busy },
        busy ? 'Working…' : (supportsFile && linked ? 'Sync now' : 'Export / share'))
    ),

    msg ? h('p', { className: `form-msg ${msg.ok ? 'good' : 'bad'}` }, msg.text) : null,

    conflict ? h(Sheet, {
      title: 'That file is older',
      onClose: () => setConflict(null),
      foot: h('div', { className: 'sheet-actions' },
        h('button', { onClick: () => setConflict(null) }, 'Keep mine'),
        h('button', { className: 'danger', onClick: () => { applyIncoming(conflict.incoming); flash(true, 'Loaded the older file.'); } }, 'Load it anyway')
      )
    },
      h('p', { className: 'sheet-lead' },
        `The data you're loading was last changed ${relativeTime(conflict.incoming.lastModified)}, but this device has newer changes from ${relativeTime(data.lastModified)}. Loading it will replace your newer data.`)
    ) : null
  );
}

function SyncModal({ data, setData, onClose }) {
  return h(Sheet, { title: 'Sync', onClose },
    h(SyncCard, { data, setData })
  );
}

function AdvancedTab({ data, setData, updateSetting, onRestart, confirming, setConfirming }) {
  const [importWarning, setImportWarning] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  async function handleExport() {
    setExportError(null);
    setExportSuccess(false);
    const result = await window.api.exportData();
    if (result.success) {
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } else if (!result.canceled) {
      setExportError(result.error || 'Export failed.');
    }
  }

  async function handleImportConfirmed() {
    setImportWarning(false);
    setImportError(null);
    setImportSuccess(false);
    const result = await window.api.importData();
    if (result.success) {
      setData(result.data);
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 4000);
    } else if (!result.canceled) {
      setImportError(result.error || 'Import failed.');
    }
  }

  return h('div', { className: 'settings-stack' },
    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Display'),
      h('p', { className: 'qa-label' }, 'Date format'),
      h(ChipToggle, {
        wide: true,
        options: [
          { id: 'short', label: 'Jun 15' },
          { id: 'long', label: 'June 15, 2026' },
          { id: 'iso', label: '2026-06-15' }
        ],
        value: data.settings.dateFormat,
        onChange: (v) => updateSetting('dateFormat', v)
      }),
      h('p', { className: 'qa-label' }, 'Density'),
      h(ChipToggle, {
        wide: true,
        options: [{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }],
        value: data.settings.density,
        onChange: (v) => updateSetting('density', v)
      })
    ),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Sync'),
      h(SyncCard, { data, setData })
    ),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Data portability'),
      h('p', { className: 'settings-card-sub' },
        'Export your data as a .json file to back it up or move it to another device. Importing a file replaces everything currently saved in this app.'),
      h('div', { className: 'button-row' },
        h('button', { onClick: handleExport }, 'Export data'),
        h('button', { onClick: () => setImportWarning(true) }, 'Import a file')
      ),
      exportSuccess ? h('p', { className: 'form-msg good' }, 'Export saved.') : null,
      exportError ? h('p', { className: 'form-msg bad' }, exportError) : null,
      importSuccess ? h('p', { className: 'form-msg good' }, 'Data imported. The app is now showing the imported data.') : null,
      importError ? h('p', { className: 'form-msg bad' }, importError) : null,
      h('div', { className: 'switch-list' },
        h(SettingSwitch, {
          id: 'backup-reminder',
          title: 'Weekly backup reminder',
          sub: 'A nudge every Monday to download a copy of your data',
          checked: data.settings.backupReminderEnabled !== false,
          onChange: (v) => updateSetting('backupReminderEnabled', v)
        })
      )
    ),

    importWarning ? h(Sheet, {
      title: 'This replaces all your data',
      onClose: () => setImportWarning(false),
      foot: h('div', { className: 'sheet-actions' },
        h('button', { onClick: () => setImportWarning(false) }, 'Keep my data'),
        h('button', { className: 'danger', onClick: handleImportConfirmed }, 'Delete and import')
      )
    },
      h('p', { className: 'sheet-lead' },
        'Importing a file permanently erases your current bills, income, subscriptions, credit cards, wallet, history and settings, and replaces them with whatever is in the file. This cannot be undone.')
    ) : null,

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Custom CSS'),
      h('p', { className: 'settings-card-sub' },
        'For advanced users — add your own CSS to override styles. Applied live; clear the box to remove it.'),
      h('textarea', {
        value: data.settings.customCss || '',
        onChange: (e) => updateSetting('customCss', e.target.value),
        placeholder: '.sidebar { font-family: monospace; }',
        className: 'custom-css-input',
        rows: 6
      })
    ),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Activity log'),
      (!data.activityLog || data.activityLog.length === 0)
        ? h('p', { className: 'settings-card-sub' }, 'Nothing logged yet.')
        : h('div', { className: 'log-list' },
            data.activityLog.slice(0, 25).map((entry) =>
              h('div', { key: entry.id, className: 'log-row' },
                h('span', { className: 'log-text' }, entry.message),
                h('span', { className: 'log-time' }, formatLogTimestamp(entry.timestamp))
              )
            )
          )
    ),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Reset all data'),
      h('p', { className: 'settings-card-sub' },
        'Clears your income, bills, subscriptions, wallet and paid history, then takes you back through setup.'),
      confirming
        ? h('div', { className: 'button-row' },
            h('button', { onClick: () => setConfirming(false) }, 'Cancel'),
            h('button', { className: 'danger', onClick: onRestart }, 'Yes, reset everything')
          )
        : h('div', { className: 'button-row' },
            h('button', { className: 'danger', onClick: () => setConfirming(true) }, 'Reset and run setup again')
          )
    ),

    h('div', { className: 'card about-card' },
      h('img', { src: 'assets/icon.svg', alt: '', className: 'about-logo' }),
      h('div', null,
        h('p', { className: 'settings-card-title' }, 'Finance Calendar'),
        h('p', { className: 'settings-card-sub' }, `Version ${WEB_VERSION} · all data stays on this device — nothing is sent anywhere.`)
      )
    )
  );
}
