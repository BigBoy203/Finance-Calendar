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
      setData({ ...data, incomeSources: [...data.incomeSources, entry] });
    } else {
      setData(applyEditedEntry(data, 'incomeSources', cleaned));
    }
    setEditingIncome(null);
  }

  function deleteIncome(id) {
    setData({ ...data, incomeSources: data.incomeSources.filter((e) => e.id !== id) });
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = todayYmd();
    a.href = url;
    a.download = `finance-calendar-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    tabContent = h(AdvancedTab, { data, updateSetting, onRestart, confirming, setConfirming, onDownloadBackup: downloadBackup });
  }

  return h('div', null,
    h('h2', null, 'Settings'),
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
                    onClick: (ev) => { ev.stopPropagation(); onDeleteIncome(e.id); },
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
      h('div', null,
        h('label', null, 'Flag range-priced bills under "Needs attention" this many days before they\u2019re due'),
        h('input', {
          type: 'number', min: 0, max: 60,
          value: data.settings.needsAttentionLookaheadDays,
          onChange: (e) => updateSetting('needsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0),
          style: { width: '100px' }
        })
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

function AdvancedTab({ data, updateSetting, onRestart, confirming, setConfirming, onDownloadBackup }) {
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
      h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Data & backups'),
      h('p', { style: { margin: '0 0 10px', fontSize: '13px', color: 'var(--text-secondary)' } },
        'This web version stores your data in this browser only (IndexedDB) - it is not sent anywhere, but it ',
        'also doesn\u2019t sync between browsers or devices, and can be lost if you clear this browser\u2019s site data. ',
        'Download a backup file occasionally, especially before clearing browser data, switching browsers, or ',
        'moving to a new computer. Keep the file somewhere safe, like a cloud drive folder or an external drive.'),
      h('button', { className: 'primary', onClick: onDownloadBackup, style: { marginBottom: '10px' } }, 'Download backup (.json)'),
      h('div', { className: 'checkbox-row' },
        h('input', {
          type: 'checkbox',
          id: 'backup-reminder',
          checked: data.settings.backupReminderEnabled !== false,
          onChange: (e) => updateSetting('backupReminderEnabled', e.target.checked)
        }),
        h('label', { htmlFor: 'backup-reminder', style: { margin: 0 } }, 'Remind me to back up every Monday')
      )
    ),

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
        h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Finance Calendar (web)'),
        h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
          'Stores all data locally in this browser - nothing is sent anywhere. A desktop app version is also ',
          'available below, which keeps your data in a file on your computer instead of in the browser.')
      )
    )
  );
}
