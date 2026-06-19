/* ---------------- Onboarding Wizard ---------------- */

const MAJOR_CATEGORIES = ['Rent/mortgage', 'Power', 'Water', 'Gas', 'Insurance', 'Car payment', 'Phone', 'Internet', 'Credit card', 'Other'];
const MINOR_CATEGORIES = ['Streaming', 'Gaming', 'Cloud storage', 'Memberships', 'Other'];
const ONE_TIME_PAYMENT_CATEGORIES = ['Rent/mortgage', 'Power', 'Water', 'Gas', 'Insurance', 'Car payment', 'Phone', 'Internet', 'Credit card', 'Shopping', 'Medical', 'Travel', 'Gift', 'Other'];
const ONE_TIME_INCOME_CATEGORIES = ['Paycheck', 'Bonus', 'Gift', 'Refund', 'Side income', 'Other'];

const COMMON_MAJOR_BILLS = [
  { name: 'Rent/mortgage', category: 'Rent/mortgage', freq: 'monthly' },
  { name: 'Electric', category: 'Power', freq: 'monthly' },
  { name: 'Water', category: 'Water', freq: 'monthly' },
  { name: 'Gas', category: 'Gas', freq: 'monthly' },
  { name: 'Car insurance', category: 'Insurance', freq: 'monthly' },
  { name: 'Health insurance', category: 'Insurance', freq: 'monthly' },
  { name: 'Car payment', category: 'Car payment', freq: 'monthly' },
  { name: 'Phone', category: 'Phone', freq: 'monthly' },
  { name: 'Internet', category: 'Internet', freq: 'monthly' }
];

const COMMON_SUBSCRIPTIONS = [
  { name: 'Spotify', category: 'Streaming', freq: 'monthly' },
  { name: 'Netflix', category: 'Streaming', freq: 'monthly' },
  { name: 'Disney+', category: 'Streaming', freq: 'monthly' },
  { name: 'Xbox Game Pass', category: 'Gaming', freq: 'monthly' },
  { name: 'PlayStation Plus', category: 'Gaming', freq: 'monthly' },
  { name: 'iCloud storage', category: 'Cloud storage', freq: 'monthly' },
  { name: 'Google One', category: 'Cloud storage', freq: 'monthly' },
  { name: 'Amazon Prime', category: 'Memberships', freq: 'monthly' },
  { name: 'Gym membership', category: 'Memberships', freq: 'monthly' }
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

function OnboardingWizard({ data, onComplete }) {
  const [phase, setPhase] = useState('import'); // 'import' | 'setup'
  const [step, setStep] = useState(0);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);

  const [income, setIncome] = useState(
    data.incomeSources && data.incomeSources.length
      ? data.incomeSources
      : [blankEntry({ name: 'Paycheck', freq: 'biweekly', category: 'Income' })]
  );
  const [majorBills, setMajorBills] = useState(
    data.majorBills && data.majorBills.length
      ? data.majorBills
      : COMMON_MAJOR_BILLS.map((p) => presetEntry(p))
  );
  const [subscriptions, setSubscriptions] = useState(
    data.subscriptions && data.subscriptions.length
      ? data.subscriptions
      : COMMON_SUBSCRIPTIONS.map((p) => presetEntry(p))
  );
  const [creditCards, setCreditCards] = useState(
    data.creditCards && data.creditCards.length ? data.creditCards : []
  );

  const steps = [
    { title: 'Your income', subtitle: 'Add each paycheck or income source - amount, date, and how often it arrives.' },
    { title: 'Major expenses', subtitle: 'We started you off with common bills - fill in amounts, remove anything that doesn\u2019t apply, or add more.' },
    { title: 'Subscriptions & extras', subtitle: 'Same idea for smaller recurring charges. Remove what you don\u2019t have, fill in the rest.' },
    { title: 'Credit cards', subtitle: 'Optional - add any credit card balances you want to track. You can skip this and add cards later.' }
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
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete({
        ...data,
        incomeSources: cleanList(income),
        majorBills: cleanList(majorBills),
        subscriptions: cleanList(subscriptions),
        creditCards: cleanCreditCards(creditCards)
      });
    }
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
      addLabel: '+ Add another income source',
      dateLabel: 'Next pay date'
    });
  } else if (step === 1) {
    body = h(EntryList, {
      rows: majorBills,
      categories: MAJOR_CATEGORIES,
      namePlaceholder: 'e.g. Rent',
      onChange: (id, field, value) => updateRow(majorBills, setMajorBills, id, field, value),
      onAdd: () => addRow(majorBills, setMajorBills, { category: 'Other' }),
      onRemove: (id) => removeRow(majorBills, setMajorBills, id),
      addLabel: '+ Add another expense',
      dateLabel: 'Due date'
    });
  } else if (step === 2) {
    body = h(EntryList, {
      rows: subscriptions,
      categories: MINOR_CATEGORIES,
      namePlaceholder: 'e.g. Spotify',
      onChange: (id, field, value) => updateRow(subscriptions, setSubscriptions, id, field, value),
      onAdd: () => addRow(subscriptions, setSubscriptions, { freq: 'monthly', category: 'Streaming' }),
      onRemove: (id) => removeRow(subscriptions, setSubscriptions, id),
      addLabel: '+ Add another subscription',
      dateLabel: 'Billing date'
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
      onComplete(result.data);
    } else if (!result.canceled) {
      setImportError(result.error || 'Import failed. Please check the file and try again.');
    }
  }

  // Step 0 of onboarding: ask if the user has an existing backup to import.
  // No warning needed here since there is no saved data yet at this point.
  if (phase === 'import') {
    return h('div', { className: 'wizard-shell' },
      h('div', null,
        h('h2', null, 'Welcome to Finance Calendar'),
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
    );
  }

  return h('div', { className: 'wizard-shell' },
    h('div', { className: 'wizard-progress' },
      steps.map((s, i) => h('div', { key: i, className: `wizard-step-dot${i <= step ? ' active' : ''}` }))
    ),
    h('div', null,
      h('h2', null, steps[step].title),
      h('p', { style: { color: 'var(--text-secondary)', marginTop: '4px' } }, steps[step].subtitle)
    ),
    body,
    h('div', { className: 'row-between' },
      step > 0
        ? h('button', { onClick: handleBack }, 'Back')
        : h('div'),
      h('button', { className: 'primary', onClick: handleNext }, step < steps.length - 1 ? 'Next' : 'Finish setup')
    )
  );
}

/* A single entry as a card row, with optional amount/date range toggles */
function EntryList({ rows, categories, namePlaceholder, onChange, onAdd, onRemove, addLabel, dateLabel }) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
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
    h('button', { onClick: onAdd }, addLabel)
  );
}

function EntryCard({ row, categories, namePlaceholder, dateLabel, onChange, onRemove }) {
  return h('div', { className: 'setup-entry' },
    h('div', { className: 'setup-entry-top' },
      h('input', {
        type: 'text',
        placeholder: namePlaceholder,
        value: row.name,
        onChange: (e) => onChange('name', e.target.value)
      }),
      categories ? h('select', {
        value: row.category || '',
        onChange: (e) => onChange('category', e.target.value),
        style: { width: '150px' }
      }, categories.map((c) => h('option', { key: c, value: c }, c))) : null,
      h('button', { className: 'x-btn', 'aria-label': 'Remove', onClick: onRemove }, '\u00d7')
    ),
    h('div', { className: 'setup-entry-fields' },
      row.useAmountRange
        ? h(React.Fragment, null,
            h('div', null,
              h('label', null, 'Min'),
              h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: row.amountMin, onChange: (e) => onChange('amountMin', e.target.value) })
            ),
            h('div', null,
              h('label', null, 'Max'),
              h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: row.amountMax, onChange: (e) => onChange('amountMax', e.target.value) })
            )
          )
        : h('div', null,
            h('label', null, 'Amount'),
            h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: row.amount, onChange: (e) => onChange('amount', e.target.value) })
          ),
      row.useDateRange
        ? h(React.Fragment, null,
            h('div', null,
              h('label', null, 'Start date'),
              h('input', { className: 'field-date', type: 'date', value: row.date, onChange: (e) => onChange('date', e.target.value) })
            ),
            h('div', null,
              h('label', null, 'End date'),
              h('input', { className: 'field-date', type: 'date', value: row.dateEnd, onChange: (e) => onChange('dateEnd', e.target.value) })
            )
          )
        : h('div', null,
            h('label', null, dateLabel || 'Date'),
            h('input', { className: 'field-date', type: 'date', value: row.date, onChange: (e) => onChange('date', e.target.value) })
          ),
      h('div', null,
        h('label', null, 'Frequency'),
        h('select', { className: 'field-freq', value: row.freq, onChange: (e) => onChange('freq', e.target.value) },
          FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
      )
    ),
    h('div', { style: { display: 'flex', gap: '14px' } },
      h('button', { className: 'toggle-link', onClick: () => onChange('useAmountRange', !row.useAmountRange) },
        row.useAmountRange ? 'Use fixed amount' : 'Use amount range'),
      h('button', { className: 'toggle-link', onClick: () => onChange('useDateRange', !row.useDateRange) },
        row.useDateRange ? 'Use single date' : 'Use date range')
    )
  );
}

/* ---------------- Post-setup prompt ---------------- */

function PostSetupPrompt({ onAdd, onSkip }) {
  return h('div', { className: 'wizard-shell' },
    h('div', { className: 'card', style: { textAlign: 'center', padding: '2rem' } },
      h('h2', null, 'Setup complete'),
      h('p', { style: { color: 'var(--text-secondary)' } },
        'Would you like to add any prior entries - past bills, one-time payments, or one-time income - before getting started?'),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '1rem' } },
        h('button', { onClick: onSkip }, 'Skip for now'),
        h('button', { className: 'primary', onClick: onAdd }, 'Add an entry')
      )
    )
  );
}

/* ---------------- Credit card entry list (setup step) ---------------- */

function CreditCardEntryList({ cards, onChange, onAdd, onRemove }) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    cards.length === 0 ? h('p', { style: { color: 'var(--text-secondary)', fontSize: '14px' } },
      'No credit cards added yet - that\u2019s fine, you can add or skip this entirely.') : null,
    cards.map((c) =>
      h('div', { key: c.id, className: 'setup-entry' },
        h('div', { className: 'setup-entry-top' },
          h('input', {
            type: 'text',
            placeholder: 'e.g. Chase Sapphire',
            value: c.name,
            onChange: (e) => onChange(c.id, 'name', e.target.value)
          }),
          h('button', { className: 'x-btn', 'aria-label': 'Remove', onClick: () => onRemove(c.id) }, '\u00d7')
        ),
        h('div', { className: 'setup-entry-fields' },
          h('div', null,
            h('label', null, 'Total debt'),
            h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: c.totalDebt, onChange: (e) => onChange(c.id, 'totalDebt', e.target.value) })
          ),
          h('div', null,
            h('label', null, 'Amount paid'),
            h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: c.amountPaid, onChange: (e) => onChange(c.id, 'amountPaid', e.target.value) })
          )
        ),
        h('div', { className: 'checkbox-row' },
          h('input', {
            type: 'checkbox',
            id: `cc-recurring-${c.id}`,
            checked: c.hasRecurringPayment,
            onChange: (e) => onChange(c.id, 'hasRecurringPayment', e.target.checked)
          }),
          h('label', { htmlFor: `cc-recurring-${c.id}`, style: { margin: 0 } }, 'Has a required recurring payment')
        ),
        c.hasRecurringPayment ? h('div', { className: 'setup-entry-fields' },
          h('div', null,
            h('label', null, 'Payment amount'),
            h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: c.paymentAmount, onChange: (e) => onChange(c.id, 'paymentAmount', e.target.value) })
          ),
          h('div', null,
            h('label', null, 'Due date'),
            h('input', { className: 'field-date', type: 'date', value: c.paymentDate, onChange: (e) => onChange(c.id, 'paymentDate', e.target.value) })
          ),
          h('div', null,
            h('label', null, 'Frequency'),
            h('select', { className: 'field-freq', value: c.paymentFreq, onChange: (e) => onChange(c.id, 'paymentFreq', e.target.value) },
              FREQS.filter((f) => f !== 'none').map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
          )
        ) : null,
        h('div', { className: 'checkbox-row' },
          h('input', {
            type: 'checkbox',
            id: `cc-apr-${c.id}`,
            checked: c.useApr,
            onChange: (e) => onChange(c.id, 'useApr', e.target.checked)
          }),
          h('label', { htmlFor: `cc-apr-${c.id}`, style: { margin: 0 } }, 'Track APR / interest (optional)')
        ),
        c.useApr ? h('div', { className: 'setup-entry-fields' },
          h('div', null,
            h('label', null, 'APR %'),
            h('input', { className: 'field-amount', type: 'number', step: '0.01', placeholder: 'e.g. 24.99', value: c.apr, onChange: (e) => onChange(c.id, 'apr', e.target.value) })
          )
        ) : null
      )
    ),
    h('button', { onClick: onAdd }, '+ Add a credit card')
  );
}

