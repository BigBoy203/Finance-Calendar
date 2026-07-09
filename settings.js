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
        )
      ),
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
      ),
      // The sidebar isn't rendered on mobile, so the desktop download lives
      // here too - it's the only place a phone user would find it.
      h('div', { style: { marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid var(--border-tertiary)' } },
        h('a', {
          href: 'downloads/FinanceCalendar.exe',
          download: 'FinanceCalendar.exe',
          style: { fontSize: '13px', color: 'var(--accent-text)' }
        }, 'Download the Windows desktop app'),
        h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: 'var(--text-tertiary)' } },
          'The desktop app saves to a file on your computer instead of browser storage.')
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
      h('img', { src: 'assets/icon.png', alt: '', className: 'about-logo' }),
      h('div', null,
        h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Finance Calendar'),
        h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
          'Stores all data locally on this computer in a JSON file - nothing is sent anywhere.')
      )
    )
  );
}
