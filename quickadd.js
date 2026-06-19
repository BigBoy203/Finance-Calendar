/* ---------------- Quick Add Modal ---------------- */

const ENTRY_TYPES = [
  { id: 'bill', label: 'Bill' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'oneTimePayment', label: 'One-time payment' },
  { id: 'oneTimeIncome', label: 'One-time income' }
];

function QuickAddModal({ data, setData, initialDate, onClose }) {
  const [type, setType] = useState('bill');
  const [form, setForm] = useState(() => blankEntry({
    date: initialDate || todayYmd(),
    freq: 'monthly',
    category: 'Other'
  }));

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  useEffect(() => {
    // adjust sensible defaults when type changes
    if (type === 'oneTimePayment') {
      setForm((f) => ({ ...f, freq: 'none', category: ONE_TIME_PAYMENT_CATEGORIES.includes(f.category) ? f.category : 'Other' }));
    } else if (type === 'oneTimeIncome') {
      setForm((f) => ({ ...f, freq: 'none', category: ONE_TIME_INCOME_CATEGORIES.includes(f.category) ? f.category : 'Paycheck' }));
    } else if (type === 'subscription') {
      setForm((f) => ({ ...f, freq: f.freq === 'none' ? 'monthly' : f.freq, category: MINOR_CATEGORIES.includes(f.category) ? f.category : 'Streaming' }));
    } else if (type === 'bill') {
      setForm((f) => ({ ...f, freq: f.freq === 'none' ? 'monthly' : f.freq, category: MAJOR_CATEGORIES.includes(f.category) ? f.category : 'Other' }));
    }
  }, [type]);

  function submit() {
    if (!form.name.trim()) return;
    const entry = {
      ...form,
      amount: form.amount === '' ? 0 : parseFloat(form.amount) || 0,
      amountMin: form.amountMin === '' ? 0 : parseFloat(form.amountMin) || 0,
      amountMax: form.amountMax === '' ? 0 : parseFloat(form.amountMax) || 0
    };

    if (type === 'bill') {
      setData(logActivity({ ...data, majorBills: [...data.majorBills, entry] }, `Added bill "${entry.name}"`));
    } else if (type === 'subscription') {
      setData(logActivity({ ...data, subscriptions: [...data.subscriptions, entry] }, `Added subscription "${entry.name}"`));
    } else if (type === 'oneTimePayment') {
      setData(logActivity({ ...data, oneTimeEntries: [...data.oneTimeEntries, { ...entry, freq: 'none', oneTimeKind: 'payment' }] }, `Added one-time payment "${entry.name}"`));
    } else if (type === 'oneTimeIncome') {
      setData(logActivity({ ...data, oneTimeEntries: [...data.oneTimeEntries, { ...entry, freq: 'none', oneTimeKind: 'income' }] }, `Added one-time income "${entry.name}"`));
    }
    onClose();
  }

  const categories = type === 'subscription' ? MINOR_CATEGORIES
    : type === 'bill' ? MAJOR_CATEGORIES
    : type === 'oneTimePayment' ? ONE_TIME_PAYMENT_CATEGORIES
    : type === 'oneTimeIncome' ? ONE_TIME_INCOME_CATEGORIES
    : null;
  const showFreq = type === 'bill' || type === 'subscription';
  const dateLabel = type === 'oneTimeIncome' ? 'Date received' : (type === 'oneTimePayment' ? 'Date paid' : 'Due date');

  return h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content' },
      h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, 'Add entry'),

      h('div', null,
        h('label', null, 'Type'),
        h('div', { className: 'type-selector' },
          ENTRY_TYPES.map((t) =>
            h('div', {
              key: t.id,
              className: `type-option${type === t.id ? ' selected' : ''}`,
              onClick: () => setType(t.id)
            }, t.label)
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
                h('label', null, 'Min amount'),
                h('input', { type: 'number', value: form.amountMin, onChange: (e) => update('amountMin', e.target.value), style: { width: '100%' } })
              ),
              h('div', { style: { flex: 1 } },
                h('label', null, 'Max amount'),
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
              h('label', null, dateLabel),
              h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value), style: { width: '100%' } })
            )
      ),
      (type === 'bill' || type === 'subscription')
        ? h('button', { className: 'toggle-link', onClick: () => update('useDateRange', !form.useDateRange) },
            form.useDateRange ? 'Use single date' : 'Use date range')
        : null,

      showFreq ? h('div', null,
        h('label', null, 'Frequency'),
        h('select', { value: form.freq, onChange: (e) => update('freq', e.target.value), style: { width: '100%' } },
          FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
      ) : null,

      categories ? h('div', null,
        h('label', null, 'Category'),
        h('select', { value: form.category, onChange: (e) => update('category', e.target.value), style: { width: '100%' } },
          categories.map((c) => h('option', { key: c, value: c }, c)))
      ) : null,

      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'primary', onClick: submit }, 'Add')
      )
    )
  );
}
