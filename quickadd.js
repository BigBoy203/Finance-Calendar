
const ENTRY_TYPES = [
  { id: 'oneTimePayment', label: 'Purchase', icon: '\u{1F4B3}', desc: 'A single expense' },
  { id: 'bill', label: 'Bill', icon: '\u{1F4C5}', desc: 'Recurring' },
  { id: 'subscription', label: 'Subscription', icon: '\u{1F504}', desc: 'Auto-renewing' },
  { id: 'oneTimeIncome', label: 'Income', icon: '\u{1F4B0}', desc: 'Money in' }
];

function QuickAddModal({ data, setData, initialDate, onClose }) {
  const [type, setType] = useState('oneTimePayment');
  const [form, setForm] = useState(() => blankEntry({
    date: initialDate || todayYmd(),
    freq: 'none',
    category: 'Other'
  }));

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  useEffect(() => {

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
    haptic('success');
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

  return h('div', { className: 'modal-overlay as-window', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content as-window' },
      h('div', { className: 'modal-window-head' },
        h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, 'Add expense'),
        h('button', { className: 'modal-x', onClick: onClose, 'aria-label': 'Close' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
            h('path', { d: 'M6 6l12 12M18 6L6 18' })
          )
        )
      ),

      h('div', { className: 'type-tiles' },
        ENTRY_TYPES.map((t) =>
          h('button', {
            key: t.id,
            className: `type-tile${type === t.id ? ' selected' : ''}`,
            onClick: () => setType(t.id)
          },
            h('span', { className: 'type-tile-icon' }, t.icon),
            h('span', { className: 'type-tile-name' }, t.label),
            h('span', { className: 'type-tile-desc' }, t.desc)
          )
        )
      ),

      h('div', { className: 'setup-field' },
        h('label', null, 'Name'),
        h('input', { type: 'text', value: form.name, onChange: (e) => update('name', e.target.value) })
      ),

      h('div', { className: 'setup-entry-grid' },
        form.useAmountRange
          ? h(React.Fragment, null,
              h('div', { className: 'setup-field' },
                h('label', null, 'Min'),
                h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountMin, onChange: (e) => update('amountMin', e.target.value) })
              ),
              h('div', { className: 'setup-field' },
                h('label', null, 'Max'),
                h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountMax, onChange: (e) => update('amountMax', e.target.value) })
              )
            )
          : h('div', { className: 'setup-field' },
              h('label', null, 'Amount'),
              h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amount, onChange: (e) => update('amount', e.target.value) })
            ),
        form.useDateRange
          ? h(React.Fragment, null,
              h('div', { className: 'setup-field' },
                h('label', null, 'Start'),
                h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value) })
              ),
              h('div', { className: 'setup-field' },
                h('label', null, 'End'),
                h('input', { type: 'date', value: form.dateEnd, onChange: (e) => update('dateEnd', e.target.value) })
              )
            )
          : h('div', { className: 'setup-field' },
              h('label', null, dateLabel),
              h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value) })
            ),
        showFreq ? h('div', { className: 'setup-field' },
          h('label', null, 'Repeats'),
          h('select', { value: form.freq, onChange: (e) => update('freq', e.target.value) },
            FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
        ) : null,
        categories ? h('div', { className: 'setup-field' },
          h('label', null, 'Category'),
          h('select', { value: form.category, onChange: (e) => update('category', e.target.value) },
            categories.map((c) => h('option', { key: c, value: c }, c)))
        ) : null
      ),

      h('div', { className: 'setup-entry-links' },
        h('button', { className: 'setup-link', onClick: () => update('useAmountRange', !form.useAmountRange) },
          form.useAmountRange ? 'Fixed amount' : 'Amount range'),
        showFreq ? h(React.Fragment, null,
          h('span', { className: 'setup-link-dot' }, '·'),
          h('button', { className: 'setup-link', onClick: () => update('useDateRange', !form.useDateRange) },
            form.useDateRange ? 'Single date' : 'Date range')
        ) : null
      ),

      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'primary', onClick: submit }, type === 'oneTimeIncome' ? 'Add income' : 'Add expense')
      )
    )
  );
}
