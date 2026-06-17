/* ---------------- Home Page ---------------- */

function HomePage({ data, setData }) {
  const currency = data.settings.currency;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [priceModal, setPriceModal] = useState(null); // occurrence object or null

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allBills = getAllBillLikeEntries(data);

  const sourceListById = useMemo(() => buildSourceListLookup(data), [data]);

  const billOccurrences = useMemo(
    () => expandAll(allBills, 'bill', monthStart, monthEnd, data).map((o) => ({ ...o, sourceList: sourceListById[o.id] })),
    [data, cursor]
  );
  const incomeOccurrences = useMemo(
    () => expandAll(data.incomeSources, 'income', monthStart, monthEnd, data).map((o) => ({ ...o, sourceList: 'incomeSources' })),
    [data, cursor]
  );

  // one-time entries within this month
  const oneTimeThisMonth = useMemo(() => {
    return data.oneTimeEntries.filter((e) => {
      if (!e.date) return false;
      const d = parseYmd(e.date);
      return d >= monthStart && d <= monthEnd;
    });
  }, [data.oneTimeEntries, cursor]);

  const oneTimePaymentsThisMonth = useMemo(() => oneTimeThisMonth
    .filter((e) => e.oneTimeKind === 'payment')
    .map((e) => {
      const override = getOverride(data, e.id, e.date);
      const hasOverride = override && override.amount !== undefined && override.amount !== null;
      return {
        ...e,
        occDate: e.date,
        amount: hasOverride ? Number(override.amount) || 0 : entryAmount(e),
        isRange: !!e.useAmountRange,
        hasOverride: !!hasOverride,
        kind: 'bill',
        sourceList: 'oneTimeEntries'
      };
    }), [oneTimeThisMonth, data]);

  const oneTimeIncomeThisMonth = oneTimeThisMonth.filter((e) => e.oneTimeKind === 'income');

  const totalBills = billOccurrences.reduce((sum, o) => sum + o.amount, 0)
    + oneTimePaymentsThisMonth.reduce((sum, o) => sum + o.amount, 0);

  const totalProjectedIncome = incomeOccurrences.reduce((sum, o) => sum + o.amount, 0)
    + oneTimeIncomeThisMonth.reduce((sum, o) => sum + entryAmount(o), 0);

  // range of projected income - for entries using an amount range, use min/max;
  // fixed-amount entries contribute the same value to both ends.
  const projectedIncomeRange = useMemo(() => {
    let min = 0;
    let max = 0;
    incomeOccurrences.forEach((o) => {
      if (o.useAmountRange) {
        min += Number(o.amountMin) || 0;
        max += Number(o.amountMax) || 0;
      } else {
        min += o.amount;
        max += o.amount;
      }
    });
    oneTimeIncomeThisMonth.forEach((o) => {
      if (o.useAmountRange) {
        min += Number(o.amountMin) || 0;
        max += Number(o.amountMax) || 0;
      } else {
        const amt = entryAmount(o);
        min += amt;
        max += amt;
      }
    });
    return { min, max };
  }, [incomeOccurrences, oneTimeIncomeThisMonth]);
  const hasIncomeRange = projectedIncomeRange.min !== projectedIncomeRange.max;

  const incomeReceived = incomeOccurrences
    .filter((o) => parseYmd(o.occDate) <= today)
    .reduce((sum, o) => sum + o.amount, 0)
    + oneTimeIncomeThisMonth
      .filter((o) => parseYmd(o.date) <= today)
      .reduce((sum, o) => sum + entryAmount(o), 0);

  const billsPaid = billOccurrences
    .filter((o) => isPaid(data, o.id, o.occDate))
    .reduce((sum, o) => sum + o.amount, 0)
    + oneTimePaymentsThisMonth
      .filter((o) => isPaid(data, o.id, o.occDate))
      .reduce((sum, o) => sum + o.amount, 0);

  // all bills this month, paid or not - for the tile grid
  const allTiles = useMemo(() => {
    return [...billOccurrences, ...oneTimePaymentsThisMonth]
      .sort((a, b) => a.occDate.localeCompare(b.occDate));
  }, [billOccurrences, oneTimePaymentsThisMonth]);

  function togglePaid(entryId, occDate) {
    setData(togglePaidStatus(data, entryId, occDate));
  }

  function changeMonth(delta) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return h('div', null,
    h('div', { className: 'home-month-header' },
      h('button', { onClick: () => changeMonth(-1), 'aria-label': 'Previous month' }, '<'),
      h('h1', { className: 'home-month-title' }, monthLabel),
      h('button', { onClick: () => changeMonth(1), 'aria-label': 'Next month' }, '>')
    ),

    h('div', { className: 'grid-2', style: { marginTop: '12px' } },
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Total bills this month'),
        h('p', { className: 'metric-value' }, fmtCurrency(totalBills, currency))
      ),
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Income received so far'),
        h('p', { className: 'metric-value', style: { color: 'var(--text-success)' } }, fmtCurrency(incomeReceived, currency))
      ),
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Covered so far'),
        h('p', { className: 'metric-value', style: { color: 'var(--text-warning)' } },
          `${fmtCurrency(billsPaid, currency)} / ${fmtCurrency(totalBills, currency)}`,
          h('span', { style: { opacity: 0.5, fontSize: '14px', fontWeight: 400, marginLeft: '6px' } },
            `(${fmtCurrency(Math.max(0, totalBills - billsPaid), currency)} left)`)
        )
      ),
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Projected for month'),
        h('p', { className: 'metric-value' },
          `${fmtCurrency(incomeReceived, currency)} / ${fmtCurrency(totalProjectedIncome, currency)}`,
          hasIncomeRange ? h('span', { style: { opacity: 0.5, fontSize: '14px', fontWeight: 400, marginLeft: '6px' } },
            `(${fmtCurrency(projectedIncomeRange.min, currency)}-${fmtCurrency(projectedIncomeRange.max, currency)})`) : null
        )
      )
    ),

    h('p', { className: 'section-title' }, 'Bills this month'),
    allTiles.length === 0
      ? h('p', { className: 'empty-state' }, 'Nothing scheduled this month.')
      : h('div', { className: 'bill-tile-grid' },
          allTiles.map((o) => {
            const paid = isPaid(data, o.id, o.occDate);
            const late = !paid && (isForcedLate(data, o.id, o.occDate) || (parseYmd(o.occDate) < today && !isDismissedLate(data, o.id, o.occDate)));
            const d = parseYmd(o.occDate);
            const dateLabel = formatDate(d, data.settings);
            const accentColor = getEntryColor(o, data) || '#D85A5A';
            return h('div', {
              key: `${o.id}-${o.occDate}`,
              className: `bill-tile${paid ? ' paid' : ''}`,
              style: { borderLeft: `3px solid ${accentColor}` },
              onClick: () => setPriceModal(o)
            },
              h('div', { className: 'bill-tile-top' },
                h('p', { className: 'bill-tile-name' },
                  late ? h('span', { className: 'late-dot', title: 'Late' }) : null,
                  o.name
                ),
                h('input', {
                  type: 'checkbox',
                  checked: paid,
                  onClick: (e) => e.stopPropagation(),
                  onChange: () => togglePaid(o.id, o.occDate),
                  'aria-label': `Mark ${o.name} paid`
                })
              ),
              h('p', { className: 'bill-tile-amount' }, occAmountLabel(o, currency)),
              h('p', { className: 'bill-tile-sub' }, `${dateLabel} - ${o.category || (FREQ_LABELS[o.freq] || o.freq)}`)
            );
          })
        ),

    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null
  );
}

/* ---------------- Price Override Modal ---------------- */

function PriceOverrideModal({ data, setData, occ, currency, onClose }) {
  const existing = getOverride(data, occ.id, occ.occDate);
  const [price, setPrice] = useState(existing && existing.amount !== undefined ? String(existing.amount) : '');

  function save() {
    const val = price === '' ? null : parseFloat(price);
    const key = `${occ.id}|${occ.occDate}`;
    const next = { ...data.overrides };
    if (val === null || isNaN(val)) {
      delete next[key];
    } else {
      next[key] = { amount: val };
    }
    setData({ ...data, overrides: next });
    onClose();
  }

  function clearOverride() {
    const key = `${occ.id}|${occ.occDate}`;
    const next = { ...data.overrides };
    delete next[key];
    setData({ ...data, overrides: next });
    onClose();
  }

  const forcedLate = isForcedLate(data, occ.id, occ.occDate);
  function toggleLate() {
    setData(toggleForcedLate(data, occ.id, occ.occDate));
  }

  const d = parseYmd(occ.occDate);
  const dateLabel = formatDate(d, data.settings, { weekday: true, year: true });
  const templateLabel = occ.isRange
    ? `${fmtCurrency(occ.amountMin, currency)}-${fmtCurrency(occ.amountMax, currency)}`
    : fmtCurrency(entryAmount(occ), currency);

  return h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content' },
      h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, occ.name),
      h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--text-secondary)' } }, dateLabel),
      h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--text-secondary)' } },
        `Usual amount: ${templateLabel}`),
      h('div', null,
        h('label', null, 'Actual price for this occurrence'),
        h('input', {
          type: 'number',
          placeholder: 'e.g. 94.32',
          value: price,
          onChange: (e) => setPrice(e.target.value),
          style: { width: '100%' }
        })
      ),
      h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--text-secondary)' } },
        'Setting this only affects this occurrence - future months still use the usual amount or range.'),

      h('div', { className: 'row-between', style: { paddingTop: '8px', borderTop: '0.5px solid var(--border-tertiary)' } },
        h('div', null,
          h('p', { style: { margin: 0, fontSize: '13px', fontWeight: 500 } }, 'Late status'),
          h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--text-secondary)' } },
            forcedLate ? 'Manually marked late.' : 'Mark this occurrence late regardless of its due date.')
        ),
        h('button', { onClick: toggleLate }, forcedLate ? 'Unmark late' : 'Mark as late')
      ),

      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        existing ? h('button', { className: 'danger-text', onClick: clearOverride }, 'Clear override') : h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'primary', onClick: save }, 'Save')
      )
    )
  );
}
