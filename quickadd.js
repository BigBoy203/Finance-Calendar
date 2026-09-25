
const ENTRY_TYPES = [
  { id: 'oneTimePayment', label: 'Purchase', icon: '\u{1F4B3}', desc: 'Something you bought' },
  { id: 'bill', label: 'Bill', icon: '\u{1F4C5}', desc: 'Rent, utilities — anything that repeats' },
  { id: 'subscription', label: 'Subscription', icon: '\u{1F504}', desc: 'Renews on its own, or a payment plan' },
  { id: 'oneTimeIncome', label: 'Income', icon: '\u{1F4B0}', desc: 'Money coming in once' },
  { id: 'advance', label: 'Advance', icon: '⚡', desc: 'Borrowed now, paid back from a paycheck' }
];

const RECURRING_FREQS = ['weekly', 'biweekly', 'monthly', 'yearly'];

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

function TypeList({ type, onPick }) {
  return h('div', { className: 'type-list' },
    ENTRY_TYPES.map((t) => h('button', {
      key: t.id,
      className: `type-row${type === t.id ? ' on' : ''}`,
      onClick: () => onPick(t.id)
    },
      h('span', { className: 'type-row-icon' }, t.icon),
      h('span', { className: 'type-row-text' },
        h('span', { className: 'type-row-name' }, t.label),
        h('span', { className: 'type-row-desc' }, t.desc)
      ),
      h('span', { className: 'type-row-mark' }, type === t.id ? '✓' : '')
    ))
  );
}

function QuickAddModal({ data, setData, initialDate, initialType, preset, entry: editing, onClose }) {
  const currency = data.settings.currency;
  const isEdit = !!editing;

  const [type, setType] = useState(() => {
    if (isEdit) return editing.oneTimeKind === 'income' ? 'oneTimeIncome' : 'oneTimePayment';
    return initialType || 'oneTimePayment';
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [useRange, setUseRange] = useState(() => isEdit && !!editing.useAmountRange);
  const [useSpan, setUseSpan] = useState(false);
  const [useRepeatEnd, setUseRepeatEnd] = useState(false);
  const [plan, setPlan] = useState(null);
  const wasPaid = isEdit && isPaid(data, editing.id, editing.date);
  const [alreadyPaid, setAlreadyPaid] = useState(() => (isEdit ? wasPaid : true));
  const [paidTouched, setPaidTouched] = useState(isEdit);
  const adv = useAdvanceForm(data, null);

  const [form, setForm] = useState(() => {
    if (isEdit) {
      const shaped = entryToFormShape(editing);
      const override = getOverride(data, editing.id, editing.date);
      if (hasAmountOverride(override) && !editing.useAmountRange) shaped.amount = String(override.amount);
      return { ...blankEntry({}), ...shaped, freq: 'none' };
    }
    const startType = initialType || 'oneTimePayment';
    const recurring = startType === 'bill' || startType === 'subscription';
    return blankEntry({
      date: initialDate || todayYmd(),
      freq: recurring ? 'monthly' : 'none',
      name: (preset && preset.name) || '',
      amount: (preset && preset.amount) ? String(preset.amount) : '',
      category: (preset && preset.category) || defaultCategoryForType(startType)
    });
  });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function pickType(next) {
    haptic('light');
    setType(next);
    setPickerOpen(false);
    if (next === 'advance') return;
    setForm((f) => {
      const list = categoriesForType(next);
      return {
        ...f,
        freq: (next === 'bill' || next === 'subscription') ? (f.freq === 'none' ? 'monthly' : f.freq) : 'none',
        category: list.includes(f.category) ? f.category : defaultCategoryForType(next)
      };
    });
    if (next !== 'bill' && next !== 'subscription') {
      setUseSpan(false);
      setUseRepeatEnd(false);
      setPlan(null);
    }
  }

  function pickCategory(category) {
    update('category', category);
    if (category === PAYMENT_PLAN && !useRepeatEnd) {
      setUseRepeatEnd(true);
      setPlan({ auto: true });
      update('repeatUntil', planEnd(form.date, form.freq, { auto: true }));
    }
  }

  function setDate(value) {
    setForm((f) => ({ ...f, date: value, repeatUntil: planEnd(value, f.freq, plan) || f.repeatUntil }));
    if (!paidTouched) setAlreadyPaid(value <= todayYmd());
  }

  function setFreq(freq) {
    setForm((f) => ({ ...f, freq, repeatUntil: planEnd(f.date, freq, plan) || f.repeatUntil }));
  }

  function pickCount(count) {
    setPlan({ count });
    update('repeatUntil', untilForCount(form.date, form.freq, count));
  }

  function toggleRepeatEnd(on) {
    setUseRepeatEnd(on);
    if (!on) setPlan(null);
    if (on && !form.repeatUntil) {
      setPlan({ auto: true });
      update('repeatUntil', planEnd(form.date, form.freq, { auto: true }));
    }
  }

  const isPurchase = type === 'oneTimePayment';
  const isRecurring = type === 'bill' || type === 'subscription';
  const isAdvance = type === 'advance';
  const categories = useMemo(() => categoriesByUse(data, type), [data.oneTimeEntries, type]);
  const typeInfo = ENTRY_TYPES.find((t) => t.id === type);

  const amountValue = useRange
    ? (parseFloat(form.amountMin) || 0) + (parseFloat(form.amountMax) || 0)
    : parseFloat(form.amount) || 0;
  const canSave = isAdvance ? adv.canSave : amountValue > 0;

  const dateLabel = type === 'oneTimeIncome' ? 'Date received'
    : isPurchase ? 'Date paid'
    : type === 'subscription' ? 'Billing date'
    : 'Due date';

  function saveEdit(entry) {
    const oldKey = `${editing.id}|${editing.date}`;
    const newKey = `${entry.id}|${entry.date}`;
    const paidHistory = { ...data.paidHistory };
    const paidAt = { ...(data.paidAt || {}) };
    const overrides = { ...(data.overrides || {}) };
    const oldStamp = paidAt[oldKey];
    delete paidHistory[oldKey];
    delete paidAt[oldKey];
    delete overrides[oldKey];
    if (isPurchase && alreadyPaid) {
      paidHistory[newKey] = true;
      if (!wasPaid) paidAt[newKey] = Date.now();
      else if (oldStamp) paidAt[newKey] = oldStamp;
    }
    const kind = isPurchase ? 'payment' : 'income';
    const { _isNew, ...clean } = entry;
    setData(logActivity({
      ...data,
      paidHistory,
      paidAt,
      overrides,
      oneTimeEntries: data.oneTimeEntries.map((e) => (e.id === editing.id ? { ...e, ...clean, oneTimeKind: kind } : e))
    }, `Edited "${entry.name}"`));
    onClose();
  }

  function deleteEntry() {
    const key = `${editing.id}|${editing.date}`;
    const paidHistory = { ...data.paidHistory };
    const paidAt = { ...(data.paidAt || {}) };
    const overrides = { ...(data.overrides || {}) };
    delete paidHistory[key];
    delete paidAt[key];
    delete overrides[key];
    setData(logActivity({
      ...data,
      paidHistory,
      paidAt,
      overrides,
      oneTimeEntries: data.oneTimeEntries.filter((e) => e.id !== editing.id)
    }, `Deleted "${editing.name}"`));
    onClose();
  }

  function submit() {
    if (!canSave) return;
    haptic('success');
    if (isAdvance) {
      setData(saveAdvance(data, adv.build(), null));
      onClose();
      return;
    }
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

    if (isEdit) {
      saveEdit(entry);
      return;
    }

    if (type === 'bill') {
      setData(logActivity({ ...data, majorBills: [...data.majorBills, entry] }, `Added bill "${name}"`));
    } else if (type === 'subscription') {
      setData(logActivity({ ...data, subscriptions: [...data.subscriptions, entry] }, `Added subscription "${name}"`));
    } else if (isPurchase) {
      const next = { ...data, oneTimeEntries: [...data.oneTimeEntries, { ...entry, oneTimeKind: 'payment' }] };
      if (alreadyPaid) {
        const key = `${entry.id}|${entry.date}`;
        next.paidHistory = { ...data.paidHistory, [key]: true };
        next.paidAt = { ...(data.paidAt || {}), [key]: Date.now() };
      }
      setData(logActivity(next, `Logged "${name}"`));
    } else {
      setData(logActivity({
        ...data,
        oneTimeEntries: [...data.oneTimeEntries, { ...entry, oneTimeKind: 'income', loggedAt: Date.now() }]
      }, `Added income "${name}"`));
    }
    onClose();
  }

  const head = isEdit
    ? h('div', { className: 'sheet-heading' },
        h('p', { className: 'sheet-title' }, isPurchase ? 'Edit purchase' : 'Edit income'),
        h('p', { className: 'sheet-sub' }, `Logged for ${formatDate(parseYmd(editing.date), data.settings, { weekday: true })}`)
      )
    : h('button', {
        className: `type-btn${pickerOpen ? ' open' : ''}`,
        onClick: () => { haptic('light'); setPickerOpen(!pickerOpen); },
        'aria-expanded': pickerOpen
      },
        h('span', { className: 'type-btn-icon' }, typeInfo.icon),
        h('span', { className: 'type-btn-text' },
          h('span', { className: 'type-btn-name' }, pickerOpen ? 'What are you adding?' : typeInfo.label),
          h('span', { className: 'type-btn-desc' }, pickerOpen ? 'Pick one below' : 'Tap to change')
        ),
        h('span', { className: 'type-btn-caret' }, '›')
      );

  const amountBlock = useRange
    ? h('div', { className: 'setup-entry-grid' },
        h(Field, { label: 'Least it can be' },
          h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountMin, onChange: (e) => update('amountMin', e.target.value) })
        ),
        h(Field, { label: 'Most it can be' },
          h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountMax, onChange: (e) => update('amountMax', e.target.value) })
        )
      )
    : h(AmountField, { value: form.amount, onChange: (v) => update('amount', v), currency, autoFocus: !isEdit });

  const categoryBlock = h('div', { className: 'qa-block' },
    h('p', { className: 'qa-label' }, 'Category'),
    h(ChipScroller, {
      key: type,
      options: categories,
      value: form.category,
      onPick: pickCategory,
      dotFor: isPurchase ? categoryColor : null,
      reveal: isEdit || !!(preset && preset.category)
    })
  );

  const nameBlock = h(Field, { label: 'Name' },
    h('input', {
      type: 'text',
      placeholder: `Optional — defaults to “${form.category}”`,
      value: form.name,
      onChange: (e) => update('name', e.target.value)
    })
  );

  const dateBlock = isRecurring
    ? h('div', { className: 'setup-entry-grid single' },
        h(Field, { label: type === 'subscription' ? 'First billing date' : 'First due date' },
          h(DateField, { value: form.date, onChange: setDate, settings: data.settings })
        )
      )
    : h('div', { className: 'qa-block' },
        h('p', { className: 'qa-label' }, dateLabel),
        h(DateChips, { value: form.date, onChange: setDate, settings: data.settings })
      );

  const repeatBlock = isRecurring ? h('div', { className: 'qa-block' },
    h('p', { className: 'qa-label' }, 'Repeats'),
    h(FreqChips, { value: form.freq, onPick: setFreq })
  ) : null;

  const options = h('div', { className: 'switch-list' },
    isPurchase
      ? h(SettingSwitch, {
          id: 'qa-paid',
          title: 'Already paid for',
          sub: alreadyPaid ? 'Counts as spent right away' : 'Stays on the calendar until you mark it paid',
          checked: alreadyPaid,
          onChange: (v) => { setPaidTouched(true); setAlreadyPaid(v); }
        })
      : null,
    h(SettingSwitch, {
      id: 'qa-range',
      title: 'The amount varies',
      sub: useRange ? 'Enter the lowest and highest it could be' : null,
      checked: useRange,
      onChange: setUseRange
    }),
    isRecurring
      ? h(SettingSwitch, {
          id: 'qa-end',
          title: form.category === PAYMENT_PLAN ? 'It ends after the last payment' : 'It stops on a date',
          sub: useRepeatEnd && form.repeatUntil
            ? `Last one ${formatDate(parseYmd(form.repeatUntil), data.settings)}`
            : null,
          checked: useRepeatEnd,
          onChange: toggleRepeatEnd
        })
      : null,
    isRecurring
      ? h(SettingSwitch, {
          id: 'qa-span',
          title: 'It spans several days',
          sub: useSpan ? 'Shows as a bar across those days on the calendar' : null,
          checked: useSpan,
          onChange: setUseSpan
        })
      : null
  );

  const repeatEndBlock = (isRecurring && useRepeatEnd) ? h(RepeatEndBlock, {
    form,
    amount: useRange ? amountValue / 2 : amountValue,
    currency,
    settings: data.settings,
    onUntil: (d) => { setPlan(null); update('repeatUntil', d); },
    onCount: pickCount
  }) : null;

  const spanBlock = (isRecurring && useSpan) ? h(Field, { label: 'Last day it covers' },
    h(DateField, { value: form.dateEnd, onChange: (d) => update('dateEnd', d), settings: data.settings, placeholder: 'Pick the last day' })
  ) : null;

  const saveLabel = !canSave
    ? (isAdvance ? 'Enter the amount and payback' : 'Enter an amount')
    : isEdit
      ? 'Save changes'
      : isAdvance
        ? `Log ${fmtCurrency(parseFloat(adv.form.amount) || 0, currency)} advance`
        : `Add ${typeInfo.label.toLowerCase()}${useRange ? '' : ` · ${fmtCurrency(amountValue, currency)}`}`;

  let body;
  if (pickerOpen) {
    body = h(TypeList, { type, onPick: pickType });
  } else if (isAdvance) {
    body = h(AdvanceFields, { data, adv, autoFocus: true });
  } else {
    body = h(React.Fragment, null,
      amountBlock,
      categoryBlock,
      nameBlock,
      dateBlock,
      repeatBlock,
      options,
      repeatEndBlock,
      spanBlock,
      isEdit ? h(DeleteRow, {
        label: `Delete this ${isPurchase ? 'purchase' : 'income'}`,
        sub: 'Takes it off the calendar and out of your totals',
        onConfirm: deleteEntry
      }) : null
    );
  }

  return h(Sheet, {
    head,
    tall: true,
    className: 'qa-sheet',
    onClose,
    foot: pickerOpen ? null : h('div', { className: 'sheet-actions' },
      h('button', { className: 'primary', onClick: submit, disabled: !canSave }, saveLabel)
    )
  }, body);
}
