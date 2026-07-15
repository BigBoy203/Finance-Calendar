
const MAJOR_CATEGORIES = ['Rent/mortgage', 'Power', 'Water', 'Gas', 'Insurance', 'Car payment', 'Phone', 'Internet', 'Credit card', 'Other'];
const MINOR_CATEGORIES = ['Streaming', 'Gaming', 'Cloud storage', 'Memberships', 'Other'];
const ONE_TIME_PAYMENT_CATEGORIES = ['Rent/mortgage', 'Power', 'Water', 'Gas', 'Insurance', 'Car payment', 'Phone', 'Internet', 'Credit card', 'Shopping', 'Medical', 'Travel', 'Gift', 'Other'];
const ONE_TIME_INCOME_CATEGORIES = ['Paycheck', 'Bonus', 'Gift', 'Refund', 'Side income', 'Other'];

const COMMON_MAJOR_BILLS = [
  { name: 'Rent/mortgage', category: 'Rent/mortgage', freq: 'monthly' },
  { name: 'Electric', category: 'Power', freq: 'monthly' },
  { name: 'Water', category: 'Water', freq: 'monthly' },
  { name: 'Internet', category: 'Internet', freq: 'monthly' },
  { name: 'Phone', category: 'Phone', freq: 'monthly' },
  { name: 'Car payment', category: 'Car payment', freq: 'monthly' },
  { name: 'Car insurance', category: 'Insurance', freq: 'monthly' }
];

const COMMON_SUBSCRIPTIONS = [
  { name: 'Spotify', category: 'Streaming', freq: 'monthly' },
  { name: 'Netflix', category: 'Streaming', freq: 'monthly' },
  { name: 'Amazon Prime', category: 'Memberships', freq: 'monthly' },
  { name: 'iCloud storage', category: 'Cloud storage', freq: 'monthly' },
  { name: 'Gym membership', category: 'Memberships', freq: 'monthly' },
  { name: 'Xbox Game Pass', category: 'Gaming', freq: 'monthly' }
];

function blankEntry(defaults) {
  return {
    id: uid(),
    name: '',
    amount: '',
    amountMin: '',
    amountMax: '',
    useAmountRange: false,
    date: todayYmd(),
    dateEnd: '',
    useDateRange: false,
    freq: 'monthly',
    category: '',
    color: '',
    ...defaults
  };
}

function presetEntry(preset, defaults) {
  return blankEntry({ ...preset, amount: '', ...defaults });
}

function OnboardingWizard({ data, isMobile, onComplete }) {
  const [phase, setPhase] = useState('welcome');
  const [step, setStep] = useState(0);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [markPastPaid, setMarkPastPaid] = useState(true);

  const [income, setIncome] = useState(
    data.incomeSources && data.incomeSources.length
      ? data.incomeSources
      : [blankEntry({ name: 'Paycheck', freq: 'biweekly', category: 'Income' })]
  );
  const [majorBills, setMajorBills] = useState(
    data.majorBills && data.majorBills.length ? data.majorBills : []
  );
  const [subscriptions, setSubscriptions] = useState(
    data.subscriptions && data.subscriptions.length ? data.subscriptions : []
  );
  const [creditCards, setCreditCards] = useState(
    data.creditCards && data.creditCards.length ? data.creditCards : []
  );

  const steps = [
    { title: 'Your income', subtitle: 'When does money come in?' },
    { title: 'Your bills', subtitle: 'The essentials you pay every month.' },
    { title: 'Subscriptions', subtitle: 'The smaller recurring stuff.' },
    { title: 'Credit cards', subtitle: 'Optional \u2014 track balances and payments. You can skip this.' }
  ];

  function updateRow(list, setList, id, field, value) {
    setList(list.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow(list, setList, defaults) {
    setList([...list, blankEntry(defaults)]);
  }

  function removeRow(list, setList, id) {
    setList(list.filter((row) => row.id !== id));
  }

  function cleanList(list) {
    return list
      .filter((row) => row.name.trim() !== '')
      .map((row) => ({
        ...row,
        amount: row.amount === '' ? 0 : parseFloat(row.amount) || 0,
        amountMin: row.amountMin === '' ? 0 : parseFloat(row.amountMin) || 0,
        amountMax: row.amountMax === '' ? 0 : parseFloat(row.amountMax) || 0
      }))
      .filter((row) => row.useAmountRange ? (row.amountMin > 0 || row.amountMax > 0) : row.amount > 0);
  }

  function handleNext() {
    haptic('light');
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      const cleanedBills = cleanList(majorBills);
      const cleanedSubs = cleanList(subscriptions);
      const cleanedCards = cleanCreditCards(creditCards);

      let finalData = {
        ...data,
        incomeSources: cleanList(income),
        majorBills: cleanedBills,
        subscriptions: cleanedSubs,
        creditCards: cleanedCards
      };

      if (markPastPaid) {
        const paid = { ...(finalData.paidHistory || {}) };
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const y = today.getFullYear();
        const m = today.getMonth();
        const markIfPast = (entryId, dueDay) => {
          if (!dueDay) return;
          const occ = new Date(y, m, Math.min(dueDay, new Date(y, m + 1, 0).getDate()));
          occ.setHours(0, 0, 0, 0);
          if (occ < today) {
            const occStr = `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, '0')}-${String(occ.getDate()).padStart(2, '0')}`;
            paid[`${entryId}|${occStr}`] = true;
          }
        };
        cleanedBills.forEach((b) => markIfPast(b.id, dayOfMonthFor(b)));
        cleanedSubs.forEach((s) => markIfPast(s.id, dayOfMonthFor(s)));
        cleanedCards.forEach((c) => { if (c.hasRecurringPayment) markIfPast(`cc-${c.id}`, dayOfMonthFor(c)); });
        finalData = { ...finalData, paidHistory: paid };
      }

      haptic('success');
      onComplete(finalData);
    }
  }

  function dayOfMonthFor(entry) {
    const raw = entry.dueDate || entry.date || entry.paymentDate;
    if (!raw) return null;
    const parts = String(raw).split('-');
    if (parts.length === 3) return parseInt(parts[2], 10);
    const d = new Date(raw);
    return isNaN(d) ? null : d.getDate();
  }

  function cleanCreditCards(list) {
    return list
      .filter((c) => c.name.trim() !== '')
      .map((c) => ({
        ...c,
        totalDebt: c.totalDebt === '' ? 0 : parseFloat(c.totalDebt) || 0,
        amountPaid: c.amountPaid === '' ? 0 : parseFloat(c.amountPaid) || 0,
        paymentAmount: c.paymentAmount === '' ? 0 : parseFloat(c.paymentAmount) || 0,
        apr: c.apr === '' ? 0 : parseFloat(c.apr) || 0,
        balanceDate: c.balanceDate || todayYmd()
      }));
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  let body;
  if (step === 0) {
    body = h(EntryList, {
      rows: income,
      categories: null,
      namePlaceholder: 'e.g. Main job paycheck',
      onChange: (id, field, value) => updateRow(income, setIncome, id, field, value),
      onAdd: () => addRow(income, setIncome, { freq: 'biweekly', category: 'Income' }),
      onRemove: (id) => removeRow(income, setIncome, id),
      addLabel: 'Add another income source',
      dateLabel: 'Next pay date'
    });
  } else if (step === 1) {
    body = h(EntryList, {
      rows: majorBills,
      categories: MAJOR_CATEGORIES,
      namePlaceholder: 'e.g. Rent',
      suggestions: COMMON_MAJOR_BILLS,
      onAddPreset: (p) => { haptic('light'); setMajorBills([...majorBills, presetEntry(p)]); },
      onChange: (id, field, value) => updateRow(majorBills, setMajorBills, id, field, value),
      onAdd: () => addRow(majorBills, setMajorBills, { category: 'Other' }),
      onRemove: (id) => removeRow(majorBills, setMajorBills, id),
      addLabel: 'Add your own',
      dateLabel: 'Due date',
      emptyHint: 'Tap the bills you have \u2014 each one becomes a card you can fill in.'
    });
  } else if (step === 2) {
    body = h(EntryList, {
      rows: subscriptions,
      categories: MINOR_CATEGORIES,
      namePlaceholder: 'e.g. Spotify',
      suggestions: COMMON_SUBSCRIPTIONS,
      onAddPreset: (p) => { haptic('light'); setSubscriptions([...subscriptions, presetEntry(p)]); },
      onChange: (id, field, value) => updateRow(subscriptions, setSubscriptions, id, field, value),
      onAdd: () => addRow(subscriptions, setSubscriptions, { freq: 'monthly', category: 'Streaming' }),
      onRemove: (id) => removeRow(subscriptions, setSubscriptions, id),
      addLabel: 'Add your own',
      dateLabel: 'Billing date',
      emptyHint: 'Tap any you pay for \u2014 skip the rest.'
    });
  } else {
    body = h(CreditCardEntryList, {
      cards: creditCards,
      onChange: (id, field, value) => setCreditCards(creditCards.map((c) => (c.id === id ? { ...c, [field]: value } : c))),
      onAdd: () => setCreditCards([...creditCards, blankCreditCard()]),
      onRemove: (id) => setCreditCards(creditCards.filter((c) => c.id !== id))
    });
  }

  async function handleImportFromFile() {
    setImportError(null);
    setImporting(true);
    const result = await window.api.importData();
    setImporting(false);
    if (result.success) {
      onComplete(result.data, { imported: true });
    } else if (!result.canceled) {
      setImportError(result.error || 'Import failed. Please check the file and try again.');
    }
  }

  if (phase === 'welcome') {
    return h('div', { className: 'wizard-shell' },
      h('div', { className: 'wizard-scroll wizard-welcome' },
        h('div', { className: 'welcome-hero' },
          h('div', { className: 'welcome-icon' },
            h('svg', { width: 56, height: 56, viewBox: '0 0 512 512' },
              h('rect', { width: 512, height: 512, rx: 115, fill: '#1f2a37' }),
              h('rect', { x: 96, y: 288, width: 58, height: 128, rx: 11, fill: '#4a9d6e' }),
              h('rect', { x: 188, y: 222, width: 58, height: 194, rx: 11, fill: '#5aa9d0' }),
              h('rect', { x: 280, y: 320, width: 58, height: 96, rx: 11, fill: '#4a9d6e' }),
              h('rect', { x: 372, y: 156, width: 58, height: 260, rx: 11, fill: '#5aa9d0' }),
              h('polyline', { points: '125,262 217,192 309,286 401,120', fill: 'none', stroke: '#fff', strokeWidth: 16, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.92 }),
              h('circle', { cx: 401, cy: 120, r: 18, fill: '#fff' })
            )
          ),
          h('h1', { className: 'welcome-title' }, 'Finance Calendar'),
          h('p', { className: 'welcome-tagline' }, 'See every bill, payment, and paycheck on one simple calendar.')
        ),
        h('div', { className: 'welcome-points' },
          h('div', { className: 'welcome-point' },
            h('span', { className: 'welcome-point-emoji' }, '\u{1F4C5}'),
            h('div', null,
              h('p', { className: 'welcome-point-title' }, 'Everything in one place'),
              h('p', { className: 'welcome-point-sub' }, 'Bills, subscriptions, and income laid out by date.'))
          ),
          h('div', { className: 'welcome-point' },
            h('span', { className: 'welcome-point-emoji' }, '\u2705'),
            h('div', null,
              h('p', { className: 'welcome-point-title' }, 'Know what\u2019s left'),
              h('p', { className: 'welcome-point-sub' }, 'Check off what\u2019s paid and see your real balance.'))
          ),
          h('div', { className: 'welcome-point' },
            h('span', { className: 'welcome-point-emoji' }, '\u{1F512}'),
            h('div', null,
              h('p', { className: 'welcome-point-title' }, 'Yours, on your device'),
              h('p', { className: 'welcome-point-sub' }, 'No account, no server. Your data stays with you.'))
          )
        )
      ),
      h('div', { className: 'wizard-foot-single' },
        h('button', { className: 'primary wizard-cta', onClick: () => { haptic('medium'); setPhase('setup'); } }, 'Get started'),
        h('button', { className: 'wizard-import-link', onClick: () => { haptic('light'); setPhase('import'); } }, 'I have a backup to import')
      )
    );
  }

  if (phase === 'import') {
    return h('div', { className: 'wizard-shell' },
      h('div', { className: 'wizard-scroll' },
        h('div', null,
          h('h2', null, 'Import your backup'),
          h('p', { style: { color: 'var(--text-secondary)', marginTop: '4px' } },
            'Do you have a .json backup from a previous install or the web version that you\u2019d like to restore?')
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' } },
          h('button', {
            className: 'primary',
            onClick: handleImportFromFile,
            disabled: importing
          }, importing ? 'Importing\u2026' : 'Yes \u2014 import my backup file'),
          h('button', { onClick: () => setPhase('setup') }, 'No \u2014 start fresh'),
          importError ? h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--late-red)' } }, importError) : null
        ),
        h('p', { style: { fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '16px' } },
          'Choosing "Import" will load your backup file and take you straight into the app with all your existing data. ',
          'Choosing "Start fresh" takes you through the quick setup wizard.')
      )
    );
  }

  return h('div', { className: 'wizard-shell' },
    h('div', { className: 'wizard-scroll' },
      h('div', { className: 'wizard-progress' },
        steps.map((s, i) => h('div', { key: i, className: `wizard-step-dot${i <= step ? ' active' : ''}` }))
      ),
      h('div', null,
        h('h2', null, steps[step].title),
        h('p', { style: { color: 'var(--text-secondary)', marginTop: '4px' } }, steps[step].subtitle)
      ),
      body,
      (step === steps.length - 1 && new Date().getDate() > 1)
        ? h('div', { className: 'wizard-midmonth' },
            h('label', { className: 'wizard-midmonth-row' },
              h('input', {
                type: 'checkbox',
                checked: markPastPaid,
                onChange: (e) => setMarkPastPaid(e.target.checked)
              }),
              h('div', null,
                h('span', { className: 'wizard-midmonth-title' }, 'Bills earlier this month are already paid'),
                h('span', { className: 'wizard-midmonth-sub' }, 'Since you\u2019re starting mid-month, we\u2019ll check off bills whose date has already passed so nothing shows up as late. You can uncheck any of them later.')
              )
            )
          )
        : null
    ),
    h('div', { className: 'row-between' },
      step > 0
        ? h('button', { onClick: handleBack }, 'Back')
        : h('div'),
      h('button', { className: 'primary', onClick: handleNext }, step < steps.length - 1 ? 'Next' : 'Finish setup')
    )
  );
}

function EntryList({ rows, categories, namePlaceholder, suggestions, onAddPreset, onChange, onAdd, onRemove, addLabel, dateLabel, emptyHint }) {
  const usedNames = new Set(rows.map((r) => r.name.trim().toLowerCase()));
  const availableChips = (suggestions || []).filter((s) => !usedNames.has(s.name.toLowerCase()));
  return h('div', { className: 'setup-list' },
    rows.length === 0 && emptyHint
      ? h('p', { className: 'setup-empty-hint' }, emptyHint)
      : null,
    rows.map((row) =>
      h(EntryCard, {
        key: row.id,
        row,
        categories,
        namePlaceholder,
        dateLabel,
        onChange: (field, value) => onChange(row.id, field, value),
        onRemove: () => onRemove(row.id)
      })
    ),
    availableChips.length
      ? h('div', { className: 'setup-chips' },
          availableChips.map((s) =>
            h('button', { key: s.name, className: 'setup-chip', onClick: () => onAddPreset(s) },
              h('span', { className: 'setup-chip-plus' }, '+'), s.name)
          ),
          h('button', { className: 'setup-chip custom', onClick: onAdd },
            h('span', { className: 'setup-chip-plus' }, '+'), addLabel || 'Add your own')
        )
      : h('button', { className: 'setup-add-row', onClick: onAdd }, `+ ${addLabel || 'Add another'}`)
  );
}

function EntryCard({ row, categories, namePlaceholder, dateLabel, onChange, onRemove }) {
  return h('div', { className: 'setup-entry' },
    h('div', { className: 'setup-entry-head' },
      h('input', {
        className: 'setup-entry-name',
        type: 'text',
        placeholder: namePlaceholder,
        value: row.name,
        onChange: (e) => onChange('name', e.target.value)
      }),
      h('button', { className: 'setup-entry-x', 'aria-label': 'Remove', onClick: onRemove },
        h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' },
          h('path', { d: 'M6 6l12 12M18 6L6 18' })
        )
      )
    ),
    h('div', { className: 'setup-entry-grid' },
      row.useAmountRange
        ? h(React.Fragment, null,
            h('div', { className: 'setup-field' },
              h('label', null, 'Min'),
              h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: row.amountMin, onChange: (e) => onChange('amountMin', e.target.value) })
            ),
            h('div', { className: 'setup-field' },
              h('label', null, 'Max'),
              h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: row.amountMax, onChange: (e) => onChange('amountMax', e.target.value) })
            )
          )
        : h('div', { className: 'setup-field' },
            h('label', null, 'Amount'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: row.amount, onChange: (e) => onChange('amount', e.target.value) })
          ),
      row.useDateRange
        ? h(React.Fragment, null,
            h('div', { className: 'setup-field' },
              h('label', null, 'Start'),
              h('input', { type: 'date', value: row.date, onChange: (e) => onChange('date', e.target.value) })
            ),
            h('div', { className: 'setup-field' },
              h('label', null, 'End'),
              h('input', { type: 'date', value: row.dateEnd, onChange: (e) => onChange('dateEnd', e.target.value) })
            )
          )
        : h('div', { className: 'setup-field' },
            h('label', null, dateLabel || 'Date'),
            h('input', { type: 'date', value: row.date, onChange: (e) => onChange('date', e.target.value) })
          ),
      h('div', { className: 'setup-field' },
        h('label', null, 'Repeats'),
        h('select', { value: row.freq, onChange: (e) => onChange('freq', e.target.value) },
          FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
      ),
      categories
        ? h('div', { className: 'setup-field' },
            h('label', null, 'Category'),
            h('select', { value: row.category || '', onChange: (e) => onChange('category', e.target.value) },
              categories.map((c) => h('option', { key: c, value: c }, c)))
          )
        : null
    ),
    h('div', { className: 'setup-entry-links' },
      h('button', { className: 'setup-link', onClick: () => onChange('useAmountRange', !row.useAmountRange) },
        row.useAmountRange ? 'Fixed amount' : 'Amount range'),
      h('span', { className: 'setup-link-dot' }, '\u00b7'),
      h('button', { className: 'setup-link', onClick: () => onChange('useDateRange', !row.useDateRange) },
        row.useDateRange ? 'Single date' : 'Date range')
    )
  );
}


function CreditCardEntryList({ cards, onChange, onAdd, onRemove }) {
  return h('div', { className: 'setup-list' },
    cards.length === 0 ? h('p', { className: 'setup-empty-hint' },
      'No credit cards added \u2014 that\u2019s fine, you can skip this entirely.') : null,
    cards.map((c) =>
      h('div', { key: c.id, className: 'setup-entry' },
        h('div', { className: 'setup-entry-head' },
          h('input', {
            className: 'setup-entry-name',
            type: 'text',
            placeholder: 'e.g. Chase Sapphire',
            value: c.name,
            onChange: (e) => onChange(c.id, 'name', e.target.value)
          }),
          h('button', { className: 'setup-entry-x', 'aria-label': 'Remove', onClick: () => onRemove(c.id) },
            h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' },
              h('path', { d: 'M6 6l12 12M18 6L6 18' })
            )
          )
        ),
        h('div', { className: 'setup-entry-grid' },
          h('div', { className: 'setup-field' },
            h('label', null, 'Total debt'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: c.totalDebt, onChange: (e) => onChange(c.id, 'totalDebt', e.target.value) })
          ),
          h('div', { className: 'setup-field' },
            h('label', null, 'Amount paid'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: c.amountPaid, onChange: (e) => onChange(c.id, 'amountPaid', e.target.value) })
          )
        ),
        h('div', { className: 'checkbox-row', style: { marginTop: '12px' } },
          h('input', {
            type: 'checkbox',
            id: `cc-recurring-${c.id}`,
            checked: c.hasRecurringPayment,
            onChange: (e) => onChange(c.id, 'hasRecurringPayment', e.target.checked)
          }),
          h('label', { htmlFor: `cc-recurring-${c.id}`, style: { margin: 0 } }, 'Has a required recurring payment')
        ),
        c.hasRecurringPayment ? h('div', { className: 'setup-entry-grid', style: { marginTop: '10px' } },
          h('div', { className: 'setup-field' },
            h('label', null, 'Payment'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: c.paymentAmount, onChange: (e) => onChange(c.id, 'paymentAmount', e.target.value) })
          ),
          h('div', { className: 'setup-field' },
            h('label', null, 'Due date'),
            h('input', { type: 'date', value: c.paymentDate, onChange: (e) => onChange(c.id, 'paymentDate', e.target.value) })
          ),
          h('div', { className: 'setup-field' },
            h('label', null, 'Repeats'),
            h('select', { value: c.paymentFreq, onChange: (e) => onChange(c.id, 'paymentFreq', e.target.value) },
              FREQS.filter((f) => f !== 'none').map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
          )
        ) : null,
        h('div', { className: 'checkbox-row', style: { marginTop: '10px' } },
          h('input', {
            type: 'checkbox',
            id: `cc-apr-${c.id}`,
            checked: c.useApr,
            onChange: (e) => onChange(c.id, 'useApr', e.target.checked)
          }),
          h('label', { htmlFor: `cc-apr-${c.id}`, style: { margin: 0 } }, 'Track APR / interest (optional)')
        ),
        c.useApr ? h('div', { className: 'setup-entry-grid', style: { marginTop: '10px' } },
          h('div', { className: 'setup-field' },
            h('label', null, 'APR %'),
            h('input', { type: 'number', inputMode: 'decimal', step: '0.01', placeholder: 'e.g. 24.99', value: c.apr, onChange: (e) => onChange(c.id, 'apr', e.target.value) })
          )
        ) : null
      )
    ),
    h('button', { className: 'setup-add-row', onClick: onAdd }, '+ Add a credit card')
  );
}
