
const ENTRY_TYPES = [
  { id: 'oneTimePayment', label: 'Purchase', icon: '\u{1F4B3}', desc: 'Something you bought' },
  { id: 'bill', label: 'Bill', icon: '\u{1F4C5}', desc: 'Recurring' },
  { id: 'subscription', label: 'Subscription', icon: '\u{1F504}', desc: 'Auto-renewing' },
  { id: 'oneTimeIncome', label: 'Income', icon: '\u{1F4B0}', desc: 'Money in' }
];

const RECURRING_FREQS = ['weekly', 'biweekly', 'monthly', 'yearly'];

function currencySymbol(currency) {
  return fmtCurrency(0, currency).replace(/[\d.,\s]/g, '') || '$';
}

function categoriesForType(type) {
  if (type === 'subscription') return MINOR_CATEGORIES;
  if (type === 'bill') return MAJOR_CATEGORIES;
  if (type === 'oneTimeIncome') return ONE_TIME_INCOME_CATEGORIES;
  return ONE_TIME_PAYMENT_CATEGORIES;
}

function categoriesByUse(data, type) {
  const list = categoriesForType(type);
  if (type !== 'oneTimePayment') return list;
  const counts = {};
  (data.oneTimeEntries || []).forEach((e) => {
    if (e.oneTimeKind !== 'payment' || !e.category) return;
    counts[e.category] = (counts[e.category] || 0) + 1;
  });
  return list.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || list.indexOf(a) - list.indexOf(b));
}

function defaultCategoryForType(type) {
  if (type === 'subscription') return 'Streaming';
  if (type === 'bill') return 'Other';
  if (type === 'oneTimeIncome') return 'Paycheck';
  return 'Groceries';
}

function PickChips({ options, value, onPick }) {
  return h('div', { className: 'chip-row' },
    options.map((o) => h('button', {
      key: o,
      className: `pick-chip${value === o ? ' on' : ''}`,
      onClick: () => { haptic('light'); onPick(o); }
    }, o))
  );
}

function QuickAddModal({ data, setData, initialDate, preset, onClose }) {
  const overlay = useOverlayDismiss(onClose);
  const currency = data.settings.currency;

  const [type, setType] = useState('oneTimePayment');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [useRange, setUseRange] = useState(false);
  const [useSpan, setUseSpan] = useState(false);
  const [useRepeatEnd, setUseRepeatEnd] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(true);
  const [paidTouched, setPaidTouched] = useState(false);

  const [form, setForm] = useState(() => blankEntry({
    date: initialDate || todayYmd(),
    freq: 'none',
    name: (preset && preset.name) || '',
    amount: (preset && preset.amount) ? String(preset.amount) : '',
    category: (preset && preset.category) || defaultCategoryForType('oneTimePayment')
  }));

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function pickType(next) {
    haptic('light');
    setType(next);
    setPickerOpen(false);
    setForm((f) => {
      const list = categoriesForType(next);
      return {
        ...f,
        freq: (next === 'bill' || next === 'subscription') ? (f.freq === 'none' ? 'monthly' : f.freq) : 'none',
        category: list.includes(f.category) ? f.category : defaultCategoryForType(next)
      };
    });
    if (next !== 'oneTimePayment') {
      setUseSpan(false);
      setUseRepeatEnd(false);
    }
  }

  function setDate(value) {
    update('date', value);
    if (!paidTouched) setAlreadyPaid(value <= todayYmd());
  }

  const isPurchase = type === 'oneTimePayment';
  const isRecurring = type === 'bill' || type === 'subscription';
  const categories = useMemo(() => categoriesByUse(data, type), [data.oneTimeEntries, type]);
  const typeInfo = ENTRY_TYPES.find((t) => t.id === type);

  const amountValue = useRange
    ? (parseFloat(form.amountMin) || 0) + (parseFloat(form.amountMax) || 0)
    : parseFloat(form.amount) || 0;
  const canSave = amountValue > 0;

  const dateLabel = type === 'oneTimeIncome' ? 'Date received'
    : isPurchase ? 'Date paid'
    : type === 'subscription' ? 'Billing date'
    : 'Due date';

  function submit() {
    if (!canSave) return;
    haptic('success');
    const name = form.name.trim() || form.category;
    const entry = {
      ...form,
      name,
      useAmountRange: useRange,
      useDateRange: isRecurring && useSpan,
      dateEnd: (isRecurring && useSpan) ? form.dateEnd : '',
      repeatUntil: (isRecurring && useRepeatEnd) ? form.repeatUntil : '',
      freq: isRecurring ? form.freq : 'none',
      amount: form.amount === '' ? 0 : parseFloat(form.amount) || 0,
      amountMin: form.amountMin === '' ? 0 : parseFloat(form.amountMin) || 0,
      amountMax: form.amountMax === '' ? 0 : parseFloat(form.amountMax) || 0
    };

    if (type === 'bill') {
      setData(logActivity({ ...data, majorBills: [...data.majorBills, entry] }, `Added bill "${name}"`));
    } else if (type === 'subscription') {
      setData(logActivity({ ...data, subscriptions: [...data.subscriptions, entry] }, `Added subscription "${name}"`));
    } else if (isPurchase) {
      const next = { ...data, oneTimeEntries: [...data.oneTimeEntries, { ...entry, oneTimeKind: 'payment' }] };
      if (alreadyPaid) {
        next.paidHistory = { ...data.paidHistory, [`${entry.id}|${entry.date}`]: true };
      }
      setData(logActivity(next, `Logged "${name}"`));
    } else {
      setData(logActivity({ ...data, oneTimeEntries: [...data.oneTimeEntries, { ...entry, oneTimeKind: 'income' }] }, `Added income "${name}"`));
    }
    onClose();
  }

  const header = h('div', { className: 'qa-head' },
    h('button', {
      className: 'qa-type',
      onClick: () => { haptic('light'); setPickerOpen(!pickerOpen); },
      'aria-expanded': pickerOpen
    },
      h('span', { className: 'qa-emoji' }, typeInfo.icon),
      h('span', { className: 'qa-type-name' },
        typeInfo.label,
        h('span', { className: `qa-type-caret${pickerOpen ? ' open' : ''}` }, '›')
      ),
      h('span', { className: 'qa-type-desc' }, pickerOpen ? 'Pick what you are adding' : typeInfo.desc)
    ),
    pickerOpen ? h('div', { className: 'type-tiles' },
      ENTRY_TYPES.map((t) =>
        h('button', {
          key: t.id,
          className: `type-tile${type === t.id ? ' selected' : ''}`,
          onClick: () => pickType(t.id)
        },
          h('span', { className: 'type-tile-icon' }, t.icon),
          h('span', { className: 'type-tile-name' }, t.label)
        )
      )
    ) : null
  );

  const amountBlock = useRange
    ? h('div', { className: 'setup-entry-grid' },
        h('div', { className: 'setup-field' },
          h('label', null, 'Least it can be'),
          h('input', {
            type: 'number', inputMode: 'decimal', placeholder: '0',
            value: form.amountMin, onChange: (e) => update('amountMin', e.target.value)
          })
        ),
        h('div', { className: 'setup-field' },
          h('label', null, 'Most it can be'),
          h('input', {
            type: 'number', inputMode: 'decimal', placeholder: '0',
            value: form.amountMax, onChange: (e) => update('amountMax', e.target.value)
          })
        )
      )
    : h('div', { className: 'qa-amount' },
        h('span', { className: 'qa-amount-sym' }, currencySymbol(currency)),
        h('input', {
          className: 'qa-amount-input',
          type: 'number',
          inputMode: 'decimal',
          placeholder: '0',
          autoFocus: true,
          value: form.amount,
          onChange: (e) => update('amount', e.target.value)
        })
      );

  const categoryBlock = h('div', { className: 'qa-block' },
    h('p', { className: 'qa-label' }, 'Category'),
    h(PickChips, { options: categories, value: form.category, onPick: (c) => update('category', c) })
  );

  const nameBlock = h('div', { className: 'setup-field' },
    h('label', null, 'Name (optional)'),
    h('input', {
      type: 'text',
      placeholder: `Defaults to "${form.category}"`,
      value: form.name,
      onChange: (e) => update('name', e.target.value)
    })
  );

  const dateBlock = h('div', { className: 'qa-block' },
    h('p', { className: 'qa-label' }, dateLabel),
    h('div', { className: 'qa-date-row' },
      !isRecurring ? h('div', { className: 'chip-row' },
        h('button', {
          className: `pick-chip${form.date === todayYmd() ? ' on' : ''}`,
          onClick: () => { haptic('light'); setDate(todayYmd()); }
        }, 'Today'),
        h('button', {
          className: `pick-chip${form.date === yesterdayYmd() ? ' on' : ''}`,
          onClick: () => { haptic('light'); setDate(yesterdayYmd()); }
        }, 'Yesterday')
      ) : null,
      h('input', {
        className: 'qa-date-input',
        type: 'date',
        value: form.date,
        onChange: (e) => setDate(e.target.value)
      })
    )
  );

  const repeatBlock = isRecurring ? h('div', { className: 'qa-block' },
    h('p', { className: 'qa-label' }, 'Repeats'),
    h(PickChips, {
      options: RECURRING_FREQS,
      value: form.freq,
      onPick: (f) => update('freq', f)
    })
  ) : null;

  function optionRow(id, checked, onChange, label, revealed) {
    return h('div', { className: 'qa-option' },
      h('div', { className: 'checkbox-row' },
        h('input', { type: 'checkbox', id, checked, onChange: (e) => { haptic('light'); onChange(e.target.checked); } }),
        h('label', { htmlFor: id, style: { margin: 0 } }, label)
      ),
      checked && revealed ? h('div', { className: 'qa-reveal' }, revealed) : null
    );
  }

  const options = h('div', { className: 'qa-options' },
    isPurchase
      ? optionRow('qa-paid', alreadyPaid, (v) => { setPaidTouched(true); setAlreadyPaid(v); },
          'Already paid for', null)
      : null,
    optionRow('qa-range', useRange, setUseRange, 'The amount varies', null),
    isRecurring
      ? optionRow('qa-span', useSpan, setUseSpan, 'It spans several days',
          h('div', { className: 'setup-field' },
            h('label', null, 'Last day'),
            h('input', { type: 'date', value: form.dateEnd, onChange: (e) => update('dateEnd', e.target.value) })
          ))
      : null,
    isRecurring
      ? optionRow('qa-end', useRepeatEnd, (v) => {
          setUseRepeatEnd(v);
          if (v && !form.repeatUntil) update('repeatUntil', defaultRepeatUntil(form.date));
        }, 'It stops on a date',
          h('div', { className: 'setup-field' },
            h('label', null, 'Last payment'),
            h('input', { type: 'date', value: form.repeatUntil, onChange: (e) => update('repeatUntil', e.target.value) })
          ))
      : null
  );

  return h('div', Object.assign({ className: 'modal-overlay as-window' }, overlay),
    h('div', { className: 'modal-content as-window qa-modal' },
      h('button', { className: 'modal-x qa-x', onClick: onClose, 'aria-label': 'Close' },
        h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
          h('path', { d: 'M6 6l12 12M18 6L6 18' })
        )
      ),

      header,
      amountBlock,
      categoryBlock,
      nameBlock,
      dateBlock,
      repeatBlock,
      options,

      h('div', { className: 'qa-actions' },
        canSave ? null : h('p', { className: 'qa-hint' }, 'Enter an amount to save this.'),
        h('div', { className: 'qa-foot' },
          h('button', { onClick: onClose }, 'Cancel'),
          h('button', { className: 'primary', onClick: submit, disabled: !canSave },
            `Add ${typeInfo.label.toLowerCase()}`)
        )
      )
    )
  );
}
