/* ---------------- Settings Page ---------------- */

const SECTION_COLOR_LABELS = [
  { key: 'majorBills', label: 'Essentials' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'creditCards', label: 'Credit card payments' },
  { key: 'incomeSources', label: 'Income' },
  { key: 'oneTimePayments', label: 'One-time payments' },
  { key: 'oneTimeIncome', label: 'One-time income' }
];

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'colors', label: 'Calendar colors' },
  { id: 'advanced', label: 'Advanced' }
];

// --- custom accent picker ------------------------------------------------
// Native <input type="color"> gives a cramped picker on iOS, so we roll our
// own from range sliders (which behave identically everywhere) plus a hex
// field. Hue/saturation/lightness cover the full spectrum with real control.

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
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } },
      h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)', width: '68px', flexShrink: 0 } }, label),
      h('input', {
        type: 'range', min, max, value,
        onChange: (e) => onInput(Number(e.target.value)),
        className: 'accent-slider',
        style: { flex: 1, background: trackBg }
      })
    );

  return h('div', { className: 'custom-accent-picker' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' } },
      h('span', { className: 'accent-preview', style: { background: hex } }),
      h('input', {
        type: 'text',
        value: hex,
        onChange: (e) => {
          let v = e.target.value.trim();
          if (v && v[0] !== '#') v = '#' + v;
          onChange(v);
        },
        placeholder: '#378ADD',
        style: { width: '120px', fontFamily: 'monospace' },
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
      data, setData, currency, updateSetting,
      onAddIncome: openAddIncome, onEditIncome: openEditIncome, onDeleteIncome: deleteIncome
    });
  } else if (tab === 'colors') {
    tabContent = h(ColorsTab, { data, updateSectionColor });
  } else {
    tabContent = h(AdvancedTab, { data, setData, updateSetting, onRestart, confirming, setConfirming });
  }

  return h('div', null,
    h('h2', { style: { marginBottom: '2px' } }, 'Settings'),
    h('p', { className: 'version-label' }, `Web version ${WEB_VERSION}`),
    h('div', { className: 'segmented', style: { marginTop: '12px', marginBottom: '16px', maxWidth: '420px' } },
      SETTINGS_TABS.map((t) =>
        h('div', { key: t.id, className: tab === t.id ? 'selected' : '', onClick: () => setTab(t.id) }, t.label)
      )
    ),
    tabContent,

    editingIncome ? h(EntryFormModal, {
      title: editingIncome._isNew ? 'Add income source' : 'Edit income source',
      entry: editingIncome,
      categories: null,
      dateLabel: 'Next pay date',
      submitLabel: editingIncome._isNew ? 'Add' : 'Save',
      onSubmit: handleIncomeSubmit,
      onClose: () => setEditingIncome(null)
    }) : null
  );
}

/* ---------------- General tab ---------------- */

function GeneralTab({ data, setData, currency, updateSetting, onAddIncome, onEditIncome, onDeleteIncome }) {
  return h('div', null,
    // Income sources
    h('div', { className: 'card' },
      h('div', { className: 'row-between' },
        h('p', { style: { margin: 0, fontWeight: 500 } }, 'Income sources'),
        h('button', { onClick: onAddIncome }, '+ Add')
      ),
      data.incomeSources.length === 0
        ? h('p', { className: 'empty-state' }, 'No income sources added yet.')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } },
            data.incomeSources.map((e) => {
              const d = parseYmd(e.date);
              const dateLabel = formatDate(d, data.settings);
              return h('div', { key: e.id, className: 'list-item clickable', onClick: () => onEditIncome(e) },
                h('div', null,
                  h('p', { className: 'list-item-name' }, e.name),
                  h('p', { className: 'list-item-sub' }, `${dateLabel} - ${FREQ_LABELS[e.freq] || e.freq}`)
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                  h('span', { className: 'list-item-amount', style: { color: 'var(--text-success)' } }, `+${entryAmountLabel(e, currency)}`),
                  h('button', {
                    className: 'x-btn',
                    onClick: (ev) => { ev.stopPropagation(); onDeleteIncome(e); },
                    'aria-label': `Delete ${e.name}`
                  }, '\u00d7')
                )
              );
            })
          )
    ),

    // Appearance
    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Appearance'),
      h('label', null, 'Theme'),
      h('div', { className: 'segmented', style: { marginBottom: '12px' } },
        ['system', 'light', 'dark'].map((t) =>
          h('div', {
            key: t,
            className: data.settings.theme === t ? 'selected' : '',
            onClick: () => updateSetting('theme', t)
          }, t.charAt(0).toUpperCase() + t.slice(1))
        )
      ),
      h('label', null, 'Accent color'),
      h('div', { className: 'swatch-row', style: { marginBottom: '12px' } },
        ACCENTS.map((a) =>
          h('div', {
            key: a.id,
            className: `swatch${data.settings.accent === a.id ? ' selected' : ''}`,
            style: { background: a.hex },
            title: a.label,
            onClick: () => updateSetting('accent', a.id)
          })
        ),
        // custom: a color well that opens the slider picker below
        h('label', {
          className: `swatch swatch-custom${data.settings.accent === 'custom' ? ' selected' : ''}`,
          title: 'Custom color',
          onClick: () => updateSetting('accent', 'custom'),
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
      h('label', null, 'First day of week'),
      h('div', { className: 'segmented' },
        [{ id: 0, label: 'Sunday' }, { id: 1, label: 'Monday' }].map((o) =>
          h('div', {
            key: o.id,
            className: data.settings.firstDayOfWeek === o.id ? 'selected' : '',
            onClick: () => updateSetting('firstDayOfWeek', o.id)
          }, o.label)
        )
      )
    ),

    // Currency & late bills
    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Currency & bills'),
      h('label', null, 'Currency'),
      h('select', {
        value: data.settings.currency,
        onChange: (e) => updateSetting('currency', e.target.value),
        style: { width: '160px', marginBottom: '12px' }
      }, CURRENCIES.map((c) => h('option', { key: c, value: c }, c))),
      h('div', { style: { marginBottom: '12px' } },
        h('label', null, 'Grace period before a bill is marked late (days)'),
        h('input', {
          type: 'number', min: 0, max: 30,
          value: data.settings.lateGraceDays,
          onChange: (e) => updateSetting('lateGraceDays', parseInt(e.target.value, 10) || 0),
          style: { width: '100px' }
        })
      ),
      h('div', { style: { marginBottom: '12px' } },
        h('label', null, 'Flag range-priced bills under "Needs attention" this many days before they\u2019re due'),
        h('input', {
          type: 'number', min: 0, max: 60,
          value: data.settings.needsAttentionLookaheadDays,
          onChange: (e) => updateSetting('needsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0),
          style: { width: '100px' }
        })
      ),
      h('div', { style: { marginBottom: '12px' } },
        h('label', null, 'Flag range-priced paychecks/income under "Needs attention" this many days before they\u2019re due'),
        h('input', {
          type: 'number', min: 0, max: 60,
          value: data.settings.incomeNeedsAttentionLookaheadDays,
          onChange: (e) => updateSetting('incomeNeedsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0),
          style: { width: '100px' }
        })
      ),
      h('div', { className: 'checkbox-row' },
        h('input', {
          type: 'checkbox',
          id: 'auto-deduct-cc',
          checked: data.settings.autoDeductCardPayments !== false,
          onChange: (e) => updateSetting('autoDeductCardPayments', e.target.checked)
        }),
        h('label', { htmlFor: 'auto-deduct-cc', style: { margin: 0 } }, 'Automatically deduct from a credit card\u2019s balance when its payment is marked paid')
      )
    )
  );
}

/* ---------------- Calendar colors tab ---------------- */

function ColorsTab({ data, updateSectionColor }) {
  return h('div', null,
    h('div', { className: 'card' },
      h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Section colors'),
      h('p', { style: { margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)' } },
        'These colors are used for chips and bars on the calendar. Any individual bill, subscription, ' +
        'income source, or one-time entry can override its color from its edit window.'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        SECTION_COLOR_LABELS.map(({ key, label }) =>
          h('div', { key, className: 'row-between' },
            h('span', { style: { fontSize: '14px' } }, label),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('input', {
                type: 'color',
                value: data.settings.sectionColors[key] || '#888888',
                onChange: (e) => updateSectionColor(key, e.target.value),
                className: 'color-input'
              }),
              h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' } },
                (data.settings.sectionColors[key] || '#888888').toUpperCase())
            )
          )
        )
      )
    )
  );
}

/* ---------------- Advanced tab ---------------- */

/* ---------------- Sync card ---------------- */

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

function SyncCard({ data, setData, embedded }) {
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [conflict, setConflict] = useState(null); // { incoming } when file is older
  const supportsFile = Sync.supportsFileSystem;

  useEffect(() => {
    Sync.hasLinkedFile().then(setLinked);
  }, []);

  const lastModified = data.lastModified;

  function flash(ok, text) { setMsg({ ok, text }); }

  // Save / push current data out to the sync file (or share sheet on phone).
  async function handleSync() {
    setBusy(true); setMsg(null);
    // one stamp shared by both the written file and the local copy, so a
    // later Load doesn't see a millisecond drift and cry "conflict"
    const stamp = Date.now();
    const stamped = { ...data, lastModified: stamp };
    const res = await Sync.writeOut(stamped);
    setBusy(false);
    if (res.ok) {
      setData(stamped, { lastModified: stamp });
      flash(true, res.mode === 'file'
        ? 'Synced to your file.'
        : 'Exported \u2014 choose where to save it (Files, LocalSend, etc.).');
    } else if (res.canceled) {
      // no-op
    } else {
      flash(false, res.error || 'Could not sync.');
    }
  }

  // Pull data in. Desktop reads the linked file; phone opens a picker. Newest
  // wins: if the incoming copy is older, we ask before replacing.
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
    const incomingTime = incoming.lastModified || 0;
    const localTime = data.lastModified || 0;
    if (incomingTime < localTime) {
      // older file - don't clobber newer local data without asking
      setConflict({ incoming });
      return;
    }
    applyIncoming(incoming);
    flash(true, 'Loaded the latest data.');
  }

  function applyIncoming(incoming) {
    // keep the file's own stamp so local and file stay in agreement
    setData(incoming, { lastModified: incoming.lastModified || Date.now() });
    setConflict(null);
  }

  async function handleLink(existing) {
    setBusy(true); setMsg(null);
    const res = existing ? await Sync.linkExistingFile() : await Sync.linkFile();
    setBusy(false);
    if (res.ok) {
      setLinked(true);
      if (existing) {
        // linking an existing file - offer to load from it immediately
        await handleLoad();
      } else {
        // brand new file - write current data into it so it's not empty
        await handleSync();
      }
    } else if (!res.canceled) {
      flash(false, res.error || 'Could not link a file.');
    }
  }

  async function handleUnlink() {
    await Sync.forgetFile();
    setLinked(false);
    flash(true, 'Unlinked. This device no longer auto-syncs to that file.');
  }

  return h('div', { className: embedded ? '' : 'card', style: embedded ? { marginTop: '4px' } : { marginTop: '12px' } },
    embedded ? null : h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Sync'),
    h('p', { style: { margin: '0 0 10px', fontSize: '13px', color: 'var(--text-secondary)' } },
      supportsFile
        ? 'Keep this device in step with a single data file. Link it once, then Sync writes your latest data to it and Load pulls the newest back in. Your data stays on your device and in your own file \u2014 never on a server.'
        : 'Sync exports your data through the share sheet (Save to Files, LocalSend, and so on) and loads it back when you switch devices. Newest data always wins. Nothing is sent to a server.'),

    h('div', { className: 'sync-status' },
      h('span', { className: 'sync-dot', style: { background: lastModified ? 'var(--text-success)' : 'var(--text-tertiary)' } }),
      h('span', { style: { fontSize: '13px' } },
        'Last change: ', h('strong', null, relativeTime(lastModified)))
    ),

    // desktop: link controls
    supportsFile ? h('div', { style: { marginTop: '10px' } },
      linked
        ? h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
            h('span', { className: 'sync-linked-pill' }, '\u2713 File linked'),
            h('button', { className: 'link-btn', onClick: handleUnlink }, 'Unlink')
          )
        : h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button', { onClick: () => handleLink(false), disabled: busy }, 'Create sync file'),
            h('button', { onClick: () => handleLink(true), disabled: busy }, 'Link existing file')
          )
    ) : null,

    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' } },
      h('button', { className: 'primary', onClick: handleSync, disabled: busy },
        busy ? 'Working\u2026' : (supportsFile && linked ? 'Sync now' : 'Export / share')),
      h('button', { onClick: handleLoad, disabled: busy },
        supportsFile && linked ? 'Load from file' : 'Load from file\u2026')
    ),

    msg ? h('p', { style: { margin: '10px 0 0', fontSize: '13px', color: msg.ok ? 'var(--text-success)' : 'var(--late-red)' } }, msg.text) : null,

    conflict ? h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) setConflict(null); } },
      h('div', { className: 'modal-content' },
        h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px' } }, 'That file is older'),
        h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
          `The data you're loading was last changed ${relativeTime(conflict.incoming.lastModified)}, but this device has newer changes from ${relativeTime(data.lastModified)}. Loading it will replace your newer data.`),
        h('div', { className: 'row-between', style: { marginTop: '4px' } },
          h('button', { onClick: () => setConflict(null) }, 'Keep mine'),
          h('button', { className: 'danger-text', onClick: () => { applyIncoming(conflict.incoming); flash(true, 'Loaded the older file.'); } }, 'Load it anyway')
        )
      )
    ) : null
  );
}

// A modal wrapper around the sync controls, opened from the sidebar button
// (desktop) and the header sync icon (mobile) so sync isn't buried in Settings.
function SyncModal({ data, setData, onClose }) {
  return h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content' },
      h('div', { className: 'row-between' },
        h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px' } }, 'Sync'),
        h('button', { className: 'icon-btn', onClick: onClose, 'aria-label': 'Close' }, '\u00d7')
      ),
      h(SyncCard, { data, setData, embedded: true })
    )
  );
}

function AdvancedTab({ data, setData, updateSetting, onRestart, confirming, setConfirming }) {
  const [importWarning, setImportWarning] = useState(false); // show warning modal before import
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

  return h('div', null,
    h('div', { className: 'card' },
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Display'),
      h('label', null, 'Date format'),
      h('div', { className: 'segmented', style: { marginBottom: '12px' } },
        [
          { id: 'short', label: 'Jun 15' },
          { id: 'long', label: 'June 15, 2026' },
          { id: 'iso', label: '2026-06-15' }
        ].map((o) =>
          h('div', {
            key: o.id,
            className: data.settings.dateFormat === o.id ? 'selected' : '',
            onClick: () => updateSetting('dateFormat', o.id)
          }, o.label)
        )
      ),
      h('label', null, 'Density'),
      h('div', { className: 'segmented', style: { marginBottom: '12px' } },
        [{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }].map((o) =>
          h('div', {
            key: o.id,
            className: data.settings.density === o.id ? 'selected' : '',
            onClick: () => updateSetting('density', o.id)
          }, o.label)
        )
      ),
      h('div', { className: 'checkbox-row' },
        h('input', {
          type: 'checkbox',
          id: 'show-week-numbers',
          checked: !!data.settings.showWeekNumbers,
          onChange: (e) => updateSetting('showWeekNumbers', e.target.checked)
        }),
        h('label', { htmlFor: 'show-week-numbers', style: { margin: 0 } }, 'Show week numbers on the calendar')
      )
    ),

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Custom CSS'),
      h('p', { style: { margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary)' } },
        'For advanced users - add your own CSS to override styles. Applied live; clear the box to remove it.'),
      h('textarea', {
        value: data.settings.customCss || '',
        onChange: (e) => updateSetting('customCss', e.target.value),
        placeholder: '.sidebar { font-family: monospace; }',
        className: 'custom-css-input',
        rows: 8
      })
    ),

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Activity log'),
      (!data.activityLog || data.activityLog.length === 0)
        ? h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--text-secondary)' } }, 'Nothing logged yet.')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' } },
            data.activityLog.slice(0, 25).map((entry) =>
              h('div', { key: entry.id, style: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px' } },
                h('span', null, entry.message),
                h('span', { style: { color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontSize: '12px' } }, formatLogTimestamp(entry.timestamp))
              )
            )
          )
    ),

    h(SyncCard, { data, setData }),

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Data portability'),
      h('p', { style: { margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)' } },
        'Export your data as a .json file to back it up or move it to another computer. ',
        'Import a previously exported file to restore or transfer your data \u2014 this will permanently replace everything currently saved in this app.'),
      h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
        h('button', { onClick: handleExport }, 'Export data (.json)'),
        h('button', { onClick: () => setImportWarning(true) }, 'Import from .json file')
      ),
      exportSuccess ? h('p', { style: { margin: '8px 0 0', fontSize: '13px', color: 'var(--text-success)' } }, 'Export saved successfully.') : null,
      exportError ? h('p', { style: { margin: '8px 0 0', fontSize: '13px', color: 'var(--late-red)' } }, exportError) : null,
      importSuccess ? h('p', { style: { margin: '8px 0 0', fontSize: '13px', color: 'var(--text-success)' } }, 'Data imported successfully. Your app is now showing the imported data.') : null,
      importError ? h('p', { style: { margin: '8px 0 0', fontSize: '13px', color: 'var(--late-red)' } }, importError) : null,
      h('div', { className: 'checkbox-row', style: { marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid var(--border-tertiary)' } },
        h('input', {
          type: 'checkbox',
          id: 'backup-reminder',
          checked: data.settings.backupReminderEnabled !== false,
          onChange: (e) => updateSetting('backupReminderEnabled', e.target.checked)
        }),
        h('label', { htmlFor: 'backup-reminder', style: { margin: 0 } }, 'Remind me to download a backup every Monday')
      )
    ),

    importWarning ? h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) setImportWarning(false); } },
      h('div', { className: 'modal-content' },
        h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px', color: 'var(--late-red)' } }, '\u26a0\ufe0f This will delete all your current data'),
        h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
          'Importing a file will permanently erase all your current bills, income, subscriptions, credit cards, history, and settings. ',
          'This cannot be undone. Your current data will be gone immediately and replaced with whatever is in the file you choose.'),
        h('p', { style: { margin: 0, fontSize: '14px', fontWeight: 500 } }, 'Are you absolutely sure you want to continue?'),
        h('div', { className: 'row-between' },
          h('button', { onClick: () => setImportWarning(false) }, 'Cancel \u2014 keep my current data'),
          h('button', { className: 'danger-text', style: { borderColor: 'var(--late-red)' }, onClick: handleImportConfirmed }, 'Yes, delete and import')
        )
      )
    ) : null,

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Reset all data'),
      h('p', { style: { margin: '0 0 12px', fontSize: '14px', color: 'var(--text-secondary)' } },
        'This clears your income, bills, subscriptions, and paid history, then takes you back through setup.'),
      confirming
        ? h('div', { style: { display: 'flex', gap: '8px' } },
            h('button', { onClick: () => setConfirming(false) }, 'Cancel'),
            h('button', { className: 'danger-text', onClick: onRestart }, 'Yes, reset everything')
          )
        : h('button', { className: 'danger-text', onClick: () => setConfirming(true) }, 'Reset and run setup again')
    ),

    h('div', { className: 'card about-card', style: { marginTop: '12px' } },
      h('img', { src: 'assets/icon.svg', alt: '', className: 'about-logo' }),
      h('div', null,
        h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Finance Calendar'),
        h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
          'Stores all data locally on this computer in a JSON file - nothing is sent anywhere.')
      )
    )
  );
}
