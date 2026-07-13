
function EntryFormModal({ title, entry, categories, dateLabel, showFreq, submitLabel, onSubmit, onClose }) {
  const [form, setForm] = useState(() => ({ ...entry }));

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  function submit() {
    if (!form.name.trim()) return;
    onSubmit({
      ...form,
      amount: form.amount === '' ? 0 : parseFloat(form.amount) || 0,
      amountMin: form.amountMin === '' ? 0 : parseFloat(form.amountMin) || 0,
      amountMax: form.amountMax === '' ? 0 : parseFloat(form.amountMax) || 0
    });
  }

  const useFreq = showFreq !== false;

  return h('div', { className: 'modal-overlay as-window', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content as-window' },
      h('div', { className: 'modal-window-head' },
        h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, title),
        h('button', { className: 'modal-x', onClick: onClose, 'aria-label': 'Close' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
            h('path', { d: 'M6 6l12 12M18 6L6 18' })
          )
        )
      ),
      h('div', null,
        h('label', null, 'Name'),
        h('input', { type: 'text', value: form.name, onChange: (e) => update('name', e.target.value), style: { width: '100%' } })
      ),
      h('div', { style: { display: 'flex', gap: '8px' } },
        form.useAmountRange
          ? h(React.Fragment, null,
              h('div', { style: { flex: 1 } },
                h('label', null, 'Min'),
                h('input', { type: 'number', value: form.amountMin, onChange: (e) => update('amountMin', e.target.value), style: { width: '100%' } })
              ),
              h('div', { style: { flex: 1 } },
                h('label', null, 'Max'),
                h('input', { type: 'number', value: form.amountMax, onChange: (e) => update('amountMax', e.target.value), style: { width: '100%' } })
              )
            )
          : h('div', { style: { flex: 1 } },
              h('label', null, 'Amount'),
              h('input', { type: 'number', value: form.amount, onChange: (e) => update('amount', e.target.value), style: { width: '100%' } })
            )
      ),
      h('button', { className: 'toggle-link', onClick: () => update('useAmountRange', !form.useAmountRange) },
        form.useAmountRange ? 'Use fixed amount' : 'Use amount range'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        form.useDateRange
          ? h(React.Fragment, null,
              h('div', { style: { flex: 1 } },
                h('label', null, 'Start date'),
                h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value), style: { width: '100%' } })
              ),
              h('div', { style: { flex: 1 } },
                h('label', null, 'End date'),
                h('input', { type: 'date', value: form.dateEnd, onChange: (e) => update('dateEnd', e.target.value), style: { width: '100%' } })
              )
            )
          : h('div', { style: { flex: 1 } },
              h('label', null, dateLabel || 'Date'),
              h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value), style: { width: '100%' } })
            )
      ),
      h('button', { className: 'toggle-link', onClick: () => update('useDateRange', !form.useDateRange) },
        form.useDateRange ? 'Use single date' : 'Use date range'),
      useFreq ? h('div', null,
        h('label', null, 'Frequency'),
        h('select', { value: form.freq, onChange: (e) => update('freq', e.target.value), style: { width: '100%' } },
          FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
      ) : null,
      categories ? h('div', null,
        h('label', null, 'Category'),
        h('select', { value: form.category, onChange: (e) => update('category', e.target.value), style: { width: '100%' } },
          (categories.includes(form.category) ? categories : [form.category, ...categories]).map((c) => h('option', { key: c, value: c }, c)))
      ) : null,
      h('div', null,
        h('label', null, 'Calendar color'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h('div', { className: 'checkbox-row', style: { margin: 0 } },
            h('input', {
              type: 'checkbox',
              id: 'use-custom-color',
              checked: !!form.color,
              onChange: (e) => update('color', e.target.checked ? '#888888' : '')
            }),
            h('label', { htmlFor: 'use-custom-color', style: { margin: 0 } }, 'Use a custom color')
          ),
          form.color ? h('input', {
            type: 'color', value: form.color, onChange: (e) => update('color', e.target.value), className: 'color-input'
          }) : null
        )
      ),
      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'primary', onClick: submit }, submitLabel || 'Save')
      )
    )
  );
}

function entryToFormShape(entry) {
  return {
    id: entry.id,
    name: entry.name || '',
    amount: entry.amount === undefined || entry.amount === null ? '' : String(entry.amount),
    amountMin: entry.amountMin === undefined || entry.amountMin === null ? '' : String(entry.amountMin),
    amountMax: entry.amountMax === undefined || entry.amountMax === null ? '' : String(entry.amountMax),
    useAmountRange: !!entry.useAmountRange,
    date: entry.date || todayYmd(),
    dateEnd: entry.dateEnd || '',
    useDateRange: !!entry.useDateRange,
    freq: entry.freq || 'monthly',
    category: entry.category || '',
    color: entry.color || '',
    oneTimeKind: entry.oneTimeKind
  };
}

function getEditModalConfig(sourceList, entry) {
  if (sourceList === 'majorBills') {
    return { title: 'Edit bill', categories: MAJOR_CATEGORIES, dateLabel: 'Due date', showFreq: true };
  }
  if (sourceList === 'subscriptions') {
    return { title: 'Edit subscription', categories: MINOR_CATEGORIES, dateLabel: 'Billing date', showFreq: true };
  }
  if (sourceList === 'incomeSources') {
    return { title: 'Edit income source', categories: null, dateLabel: 'Next pay date', showFreq: true };
  }

  const isIncome = entry && entry.oneTimeKind === 'income';
  return {
    title: isIncome ? 'Edit one-time income' : 'Edit one-time payment',
    categories: isIncome ? ONE_TIME_INCOME_CATEGORIES : ONE_TIME_PAYMENT_CATEGORIES,
    dateLabel: 'Date',
    showFreq: false
  };
}

function applyEditedEntry(data, sourceList, cleaned) {
  const { _isNew, ...entry } = cleaned;
  if (sourceList === 'majorBills') {
    return { ...data, majorBills: data.majorBills.map((e) => (e.id === entry.id ? entry : e)) };
  }
  if (sourceList === 'subscriptions') {
    return { ...data, subscriptions: data.subscriptions.map((e) => (e.id === entry.id ? entry : e)) };
  }
  if (sourceList === 'incomeSources') {
    return { ...data, incomeSources: data.incomeSources.map((e) => (e.id === entry.id ? entry : e)) };
  }
  if (sourceList === 'oneTimeEntries') {
    return {
      ...data,
      oneTimeEntries: data.oneTimeEntries.map((e) => (e.id === entry.id ? { ...entry, oneTimeKind: e.oneTimeKind } : e))
    };
  }
  return data;
}
