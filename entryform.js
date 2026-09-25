
const PAYMENT_PLAN = 'Payment plan';
const PLAN_COUNTS = [3, 4, 6, 12];

function defaultPlanCount(freq) {
  return freq === 'weekly' || freq === 'biweekly' ? 4 : 6;
}

function untilForCount(date, freq, count) {
  return ymd(addIntervals(parseYmd(date), freq, Math.max(1, count) - 1));
}

function planEnd(date, freq, plan) {
  if (!plan || !freq || freq === 'none') return null;
  return untilForCount(date, freq, plan.auto ? defaultPlanCount(freq) : plan.count);
}

function paymentCount(entry) {
  if (!entry.repeatUntil || !entry.date || !entry.freq || entry.freq === 'none') return 0;
  return expandEntry(entry, parseYmd(entry.date), parseYmd(entry.repeatUntil)).length;
}

function planProgress(data, entry) {
  const total = paymentCount(entry);
  if (!total) return null;
  const todayStr = todayYmd();
  const removed = data.removedOccurrences || {};
  const left = expandEntry(entry, parseYmd(entry.date), parseYmd(entry.repeatUntil))
    .filter((o) => !removed[`${entry.id}|${o.occDate}`] && !isPaid(data, entry.id, o.occDate) && o.occDate >= todayStr)
    .length;
  return { total, left };
}

function EntryRow({ name, sub, note, amount, positive, color, onClick }) {
  const inner = [
    h('span', { key: 's', className: 'entry-row-swatch', style: { background: color || 'var(--border-secondary)' } }),
    h('span', { key: 't', className: 'entry-row-text' },
      h('span', { className: 'entry-row-name' }, name),
      sub ? h('span', { className: 'entry-row-sub' }, sub) : null,
      note ? h('span', { className: 'entry-row-note' }, note) : null
    ),
    h('span', { key: 'a', className: `entry-row-amt${positive ? ' positive' : ''}` }, amount)
  ];
  if (!onClick) return h('div', { className: 'entry-row static' }, inner);
  return h('button', { className: 'entry-row', onClick }, inner, h('span', { className: 'att-chevron' }, '›'));
}

function RepeatEndBlock({ form, amount, currency, settings, onUntil, onCount }) {
  const total = paymentCount(form);
  return h('div', { className: 'reveal-block' },
    h(Field, { label: 'Last payment' },
      h(DateField, { value: form.repeatUntil, onChange: onUntil, settings, placeholder: 'Pick the last payment' })
    ),
    h('div', { className: 'qa-block' },
      h('p', { className: 'qa-label' }, 'Or pick how many payments'),
      h(ChipToggle, {
        wide: true,
        value: total,
        onChange: onCount,
        options: PLAN_COUNTS.map((n) => ({ id: n, label: String(n) }))
      })
    ),
    total > 0 ? h('p', { className: 'setup-hint' },
      `${total} ${total === 1 ? 'payment' : 'payments'}${amount > 0 ? ` · ${fmtCurrency(amount * total, currency)} in all` : ''} · the last one is ${formatDate(parseYmd(form.repeatUntil), settings, { year: true })}`
    ) : null
  );
}

function EntryFormModal({ data, title, entry, categories, dateLabel, showFreq, isIncome, submitLabel, onSubmit, onDelete, deleteLabel, onClose }) {
  const currency = data.settings.currency;
  const [form, setForm] = useState(() => ({ ...entry }));
  const [plan, setPlan] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const useFreq = showFreq !== false;
  const recurring = useFreq && form.freq !== 'none';
  const canEstimate = !!isIncome && !!form.useAmountRange;
  const avg = canEstimate ? averagePaycheck(data, form) : null;
  const amountValue = form.useAmountRange
    ? ((parseFloat(form.amountMin) || 0) + (parseFloat(form.amountMax) || 0)) / 2
    : parseFloat(form.amount) || 0;
  const canSave = form.name.trim() !== '';

  function withPlan(f, p) {
    const until = planEnd(f.date, f.freq, p);
    return until ? { ...f, repeatUntil: until } : f;
  }

  function pickCategory(category) {
    if (category === PAYMENT_PLAN && recurring && !form.repeatUntil) {
      setPlan({ auto: true });
      setForm((f) => withPlan({ ...f, category }, { auto: true }));
      return;
    }
    update('category', category);
  }

  function setFreq(freq) {
    setForm((f) => withPlan({ ...f, freq }, plan));
  }

  function setDate(date) {
    setForm((f) => withPlan({ ...f, date }, plan));
  }

  function toggleRepeatEnd(on) {
    if (!on) {
      setPlan(null);
      update('repeatUntil', '');
      return;
    }
    setPlan({ auto: true });
    setForm((f) => withPlan(f, { auto: true }));
  }

  function submit() {
    if (!canSave) return;
    haptic('success');
    onSubmit({
      ...form,
      repeatUntil: form.freq === 'none' ? '' : form.repeatUntil,
      useAvgEstimate: canEstimate && form.useAvgEstimate,
      amount: form.amount === '' ? 0 : parseFloat(form.amount) || 0,
      amountMin: form.amountMin === '' ? 0 : parseFloat(form.amountMin) || 0,
      amountMax: form.amountMax === '' ? 0 : parseFloat(form.amountMax) || 0
    });
  }

  const categoryList = categories
    ? (categories.includes(form.category) || !form.category ? categories : [form.category, ...categories])
    : null;

  return h(Sheet, {
    title,
    tall: true,
    onClose,
    foot: h('div', { className: 'sheet-actions' },
      h('button', { className: 'primary', onClick: submit, disabled: !canSave },
        canSave ? (submitLabel || 'Save') : 'Give it a name')
    )
  },
    form.useAmountRange
      ? h('div', { className: 'setup-entry-grid' },
          h(Field, { label: 'Least it can be' },
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountMin, onChange: (e) => update('amountMin', e.target.value) })
          ),
          h(Field, { label: 'Most it can be' },
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountMax, onChange: (e) => update('amountMax', e.target.value) })
          )
        )
      : h(AmountField, { value: form.amount, onChange: (v) => update('amount', v), currency }),

    h(Field, { label: 'Name' },
      h('input', { type: 'text', value: form.name, placeholder: isIncome ? 'e.g. Main job paycheck' : 'e.g. Rent', onChange: (e) => update('name', e.target.value) })
    ),

    categoryList ? h('div', { className: 'qa-block' },
      h('p', { className: 'qa-label' }, 'Category'),
      h(ChipScroller, { options: categoryList, value: form.category, onPick: pickCategory, reveal: true })
    ) : null,

    form.useDateRange
      ? h('div', { className: 'setup-entry-grid' },
          h(Field, { label: 'Starts' }, h(DateField, { value: form.date, onChange: setDate, settings: data.settings })),
          h(Field, { label: 'Ends' }, h(DateField, { value: form.dateEnd, onChange: (d) => update('dateEnd', d), settings: data.settings, placeholder: 'Pick a day' }))
        )
      : h(Field, { label: dateLabel || 'Date' },
          h(DateField, { value: form.date, onChange: setDate, settings: data.settings })
        ),

    useFreq ? h('div', { className: 'qa-block' },
      h('p', { className: 'qa-label' }, 'Repeats'),
      h(FreqChips, { value: form.freq, onPick: setFreq, withOnce: true })
    ) : null,

    h('div', { className: 'switch-list' },
      h(SettingSwitch, {
        id: 'ef-range',
        title: 'The amount varies',
        sub: form.useAmountRange ? 'Enter the lowest and highest it could be' : null,
        checked: !!form.useAmountRange,
        onChange: (v) => update('useAmountRange', v)
      }),
      canEstimate ? h(SettingSwitch, {
        id: 'ef-avg',
        title: 'Estimate paychecks from past ones',
        sub: avg.ready
          ? `Your last ${avg.count} paychecks averaged ${fmtCurrency(avg.amount, currency)} — upcoming paychecks use that`
          : `Needs 2 paychecks with a real amount entered — you have ${avg.count}. Until then it uses the middle of your range.`,
        checked: !!form.useAvgEstimate,
        onChange: (v) => update('useAvgEstimate', v)
      }) : null,
      recurring ? h(SettingSwitch, {
        id: 'ef-end',
        title: form.category === PAYMENT_PLAN ? 'It ends after the last payment' : 'It stops on a date',
        sub: form.repeatUntil ? `Last one ${formatDate(parseYmd(form.repeatUntil), data.settings)}` : 'Repeats until you delete it',
        checked: !!form.repeatUntil,
        onChange: toggleRepeatEnd
      }) : null,
      h(SettingSwitch, {
        id: 'ef-span',
        title: 'It spans several days',
        sub: form.useDateRange ? 'Shows as a bar across those days on the calendar' : null,
        checked: !!form.useDateRange,
        onChange: (v) => update('useDateRange', v)
      }),
      h(SettingSwitch, {
        id: 'ef-color',
        title: 'Custom calendar color',
        sub: form.color ? null : 'Uses the color for its section',
        checked: !!form.color,
        onChange: (v) => update('color', v ? '#888888' : '')
      })
    ),

    (recurring && form.repeatUntil) ? h(RepeatEndBlock, {
      form,
      amount: amountValue,
      currency,
      settings: data.settings,
      onUntil: (d) => { setPlan(null); update('repeatUntil', d); },
      onCount: (n) => { setPlan({ count: n }); setForm((f) => withPlan(f, { count: n })); }
    }) : null,

    form.color ? h('div', { className: 'color-pick' },
      h('span', { className: 'qa-label' }, 'Color'),
      h('input', { type: 'color', value: form.color, onChange: (e) => update('color', e.target.value), className: 'color-input' })
    ) : null,

    onDelete ? h(DeleteRow, {
      label: deleteLabel || 'Delete',
      sub: 'Removes it from every date it appears on',
      onConfirm: onDelete
    }) : null
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
    repeatUntil: entry.repeatUntil || '',
    useAvgEstimate: !!entry.useAvgEstimate,
    category: entry.category || '',
    color: entry.color || '',
    oneTimeKind: entry.oneTimeKind
  };
}

function getEditModalConfig(sourceList) {
  if (sourceList === 'subscriptions') {
    return { title: 'Edit subscription', categories: MINOR_CATEGORIES, dateLabel: 'Billing date', showFreq: true };
  }
  if (sourceList === 'incomeSources') {
    return { title: 'Edit income source', categories: null, dateLabel: 'Pay date', showFreq: true, isIncome: true };
  }
  return { title: 'Edit bill', categories: MAJOR_CATEGORIES, dateLabel: 'Due date', showFreq: true };
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
  return data;
}
