/* ---------------- Home Page ---------------- */

const DONUT_COLORS = ['#D85A5A', '#D8A857', '#8B6FD6', '#4FAE6B', '#D8845A', '#5AA8D8', '#C75AA8', '#7A8C5A'];

function HomePage({ data, setData, isMobile }) {
  const currency = data.settings.currency;
  const [breakdownGroupBy, setBreakdownGroupBy] = useState('source'); // 'source' | 'category'
  const [breakdownFilter, setBreakdownFilter] = useState('bills'); // 'bills' | 'income' | 'both'
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [priceModal, setPriceModal] = useState(null); // occurrence object or null
  // mobile only: hides the charts behind a toggle so the page opens compact
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
    .map((e) => ({ ...oneTimeOccurrence(data, e), sourceList: 'oneTimeEntries' })), [oneTimeThisMonth, data]);

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

  // all bills this month, paid or not - for the tile grid. Paid bills sort
  // to the end so the grid stays focused on what still needs attention.
  const allTiles = useMemo(() => {
    return [...billOccurrences, ...oneTimePaymentsThisMonth]
      .sort((a, b) => {
        const aPaid = isPaid(data, a.id, a.occDate);
        const bPaid = isPaid(data, b.id, b.occDate);
        if (aPaid !== bPaid) return aPaid ? 1 : -1;
        return a.occDate.localeCompare(b.occDate);
      });
  }, [billOccurrences, oneTimePaymentsThisMonth, data]);

  function togglePaid(o) {
    const wasPaid = isPaid(data, o.id, o.occDate);
    let next = togglePaidStatus(data, o.id, o.occDate);
    next = logActivity(next, `${wasPaid ? 'Unmarked' : 'Marked'} "${o.name}" as paid`);
    setData(next);
  }

  // Day-by-day cumulative totals across the month, for the cash-flow chart -
  // one running total for bills, one for income, so their overlap/timing is
  // visible at a glance.
  const cashFlowSeries = useMemo(() => {
    const daysInMonth = monthEnd.getDate();
    const billsByDay = new Array(daysInMonth + 1).fill(0);
    const incomeByDay = new Array(daysInMonth + 1).fill(0);

    [...billOccurrences, ...oneTimePaymentsThisMonth].forEach((o) => {
      const day = parseYmd(o.occDate).getDate();
      billsByDay[day] += o.amount;
    });
    incomeOccurrences.forEach((o) => {
      const day = parseYmd(o.occDate).getDate();
      incomeByDay[day] += o.amount;
    });
    oneTimeIncomeThisMonth.forEach((o) => {
      const day = parseYmd(o.date).getDate();
      incomeByDay[day] += entryAmount(o);
    });

    let runningBills = 0;
    let runningIncome = 0;
    const points = [];
    for (let day = 1; day <= daysInMonth; day++) {
      runningBills += billsByDay[day];
      runningIncome += incomeByDay[day];
      points.push({
        day,
        bills: runningBills,
        income: runningIncome,
        net: runningIncome - runningBills,
        dailyBills: billsByDay[day],
        dailyIncome: incomeByDay[day],
        dailyNet: incomeByDay[day] - billsByDay[day]
      });
    }
    return points;
  }, [billOccurrences, oneTimePaymentsThisMonth, incomeOccurrences, oneTimeIncomeThisMonth, cursor]);

  // last month's totals, for the comparison card
  const lastMonthTotals = useMemo(() => {
    const lastMonthStart = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    const lastMonthEnd = new Date(cursor.getFullYear(), cursor.getMonth(), 0);

    const lastBills = expandAll(allBills, 'bill', lastMonthStart, lastMonthEnd, data);
    const lastIncome = expandAll(data.incomeSources, 'income', lastMonthStart, lastMonthEnd, data);
    const lastOneTime = data.oneTimeEntries.filter((e) => {
      if (!e.date) return false;
      const d = parseYmd(e.date);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });
    const lastOneTimeBills = lastOneTime.filter((e) => e.oneTimeKind === 'payment')
      .reduce((sum, e) => sum + resolvedAmount(data, e, e.date), 0);
    const lastOneTimeIncome = lastOneTime.filter((e) => e.oneTimeKind === 'income')
      .reduce((sum, e) => sum + resolvedAmount(data, e, e.date), 0);

    const totalBillsLast = lastBills.reduce((sum, o) => sum + o.amount, 0) + lastOneTimeBills;
    const totalIncomeLast = lastIncome.reduce((sum, o) => sum + o.amount, 0) + lastOneTimeIncome;
    return { totalBills: totalBillsLast, totalIncome: totalIncomeLast };
  }, [data, cursor]);

  // summary stats - biggest bill, biggest income source, average bill size
  const monthSummary = useMemo(() => {
    const billRows = [...billOccurrences, ...oneTimePaymentsThisMonth];
    const incomeRows = [...incomeOccurrences, ...oneTimeIncomeThisMonth.map((o) => ({ ...o, amount: resolvedAmount(data, o, o.date) }))];

    const biggestBill = billRows.reduce((max, o) => (!max || o.amount > max.amount ? o : max), null);
    const biggestIncome = incomeRows.reduce((max, o) => (!max || o.amount > max.amount ? o : max), null);
    const avgBill = billRows.length > 0 ? billRows.reduce((s, o) => s + o.amount, 0) / billRows.length : 0;

    return { biggestBill, biggestIncome, avgBill, billCount: billRows.length };
  }, [billOccurrences, oneTimePaymentsThisMonth, incomeOccurrences, oneTimeIncomeThisMonth, data]);

  const SOURCE_GROUP_LABELS = {
    majorBills: 'Essentials',
    subscriptions: 'Subscriptions',
    creditCards: 'Credit cards',
    oneTimeEntries: 'One-time',
    incomeSources: 'Income'
  };

  const breakdownData = useMemo(() => {
    const rows = [];
    if (breakdownFilter === 'bills' || breakdownFilter === 'both') {
      billOccurrences.forEach((o) => rows.push(o));
      oneTimePaymentsThisMonth.forEach((o) => rows.push(o));
    }
    if (breakdownFilter === 'income' || breakdownFilter === 'both') {
      incomeOccurrences.forEach((o) => rows.push(o));
      oneTimeIncomeThisMonth.forEach((o) => {
        rows.push({ ...o, amount: resolvedAmount(data, o, o.date), sourceList: 'oneTimeEntries' });
      });
    }

    const sc = data.settings.sectionColors || {};
    // for one-time entries, payments and income use separate configurable
    // colors even though they share a sourceList key
    const sourceColorFor = (o) => {
      if (o.sourceList === 'oneTimeEntries') return o.kind === 'income' ? sc.oneTimeIncome : sc.oneTimePayments;
      return sc[o.sourceList];
    };

    const groups = {};
    rows.forEach((o) => {
      if (breakdownGroupBy === 'source') {
        // one-time payments and one-time income are tracked as separate
        // groups (they have separate colors), even though both live under
        // the oneTimeEntries sourceList
        const groupKey = o.sourceList === 'oneTimeEntries' ? `oneTimeEntries:${o.kind}` : o.sourceList;
        const label = o.sourceList === 'oneTimeEntries'
          ? (o.kind === 'income' ? 'One-time income' : 'One-time payments')
          : (SOURCE_GROUP_LABELS[o.sourceList] || 'Other');
        if (!groups[groupKey]) groups[groupKey] = { label, amount: 0, color: sourceColorFor(o) || DONUT_COLORS[0] };
        groups[groupKey].amount += o.amount;
      } else {
        const key = o.category || 'Other';
        if (!groups[key]) groups[key] = { label: key, amount: 0, color: null };
        groups[key].amount += o.amount;
      }
    });

    const total = Object.values(groups).reduce((s, v) => s + v.amount, 0);
    return Object.values(groups)
      .sort((a, b) => b.amount - a.amount)
      .map((g, i) => ({ ...g, pct: total > 0 ? g.amount / total : 0, color: g.color || DONUT_COLORS[i % DONUT_COLORS.length] }));
  }, [billOccurrences, oneTimePaymentsThisMonth, incomeOccurrences, oneTimeIncomeThisMonth, breakdownGroupBy, breakdownFilter, data]);

  // next 7 days, bills and income combined, chronological - independent of
  // the month being viewed, since due dates can straddle month boundaries
  const next7Days = useMemo(() => {
    const start = new Date(today);
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    const within = (dateStr) => {
      const d = parseYmd(dateStr);
      return d >= start && d <= end;
    };

    const billOccs7 = expandAll(allBills, 'bill', start, end, data).map((o) => ({ ...o, sourceList: sourceListById[o.id] }));
    const incomeOccs7 = expandAll(data.incomeSources, 'income', start, end, data).map((o) => ({ ...o, sourceList: 'incomeSources' }));
    const oneTime7 = data.oneTimeEntries
      .filter((e) => e.date && within(e.date))
      .map((e) => ({ ...oneTimeOccurrence(data, e), sourceList: 'oneTimeEntries' }));

    return [...billOccs7, ...incomeOccs7, ...oneTime7].sort((a, b) => a.occDate.localeCompare(b.occDate));
  }, [data, cursor]);

  function changeMonth(delta) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // --- shared pieces used by both layouts ---
  const next7List = next7Days.length === 0
    ? h('p', { className: 'empty-state' }, 'Nothing due in the next 7 days.')
    : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        next7Days.map((o, i) => {
          const dateLabel = formatDate(parseYmd(o.occDate), data.settings);
          return h('div', { key: `${o.id}-${o.occDate}-${i}`, className: 'list-item clickable', onClick: () => setPriceModal(o) },
            h('div', null,
              h('p', { className: 'list-item-name' }, o.name),
              h('p', { className: 'list-item-sub' }, dateLabel)
            ),
            h('span', {
              className: 'list-item-amount',
              style: { color: o.kind === 'income' ? 'var(--text-success)' : 'inherit', fontSize: '12px' }
            }, `${o.kind === 'income' ? '+' : ''}${occAmountLabel(o, currency)}`)
          );
        })
      );

  const netSoFar = incomeReceived - billsPaid;
  const netProjected = totalProjectedIncome - totalBills;

  if (isMobile) {
    return h('div', null,
      h('div', { className: 'home-month-header' },
        h('button', { onClick: () => changeMonth(-1), 'aria-label': 'Previous month' }, '<'),
        h('h1', { className: 'home-month-title' }, monthLabel),
        h('button', { onClick: () => changeMonth(1), 'aria-label': 'Next month' }, '>')
      ),

      // four headline numbers, evenly squared off
      h('div', { className: 'metric-grid-2x2' },
        h('div', { className: 'metric-card' },
          h('p', { className: 'metric-label' }, 'Bills this month'),
          h('p', { className: 'metric-value' }, fmtCurrency(totalBills, currency))
        ),
        h('div', { className: 'metric-card' },
          h('p', { className: 'metric-label' }, 'Income so far'),
          h('p', { className: 'metric-value', style: { color: 'var(--text-success)' } }, fmtCurrency(incomeReceived, currency))
        ),
        h('div', { className: 'metric-card' },
          h('p', { className: 'metric-label' }, 'Covered so far'),
          h('p', { className: 'metric-value', style: { color: 'var(--text-warning)' } }, fmtCurrency(billsPaid, currency)),
          h('p', { className: 'metric-foot' }, `of ${fmtCurrency(totalBills, currency)} \u00b7 ${fmtCurrency(Math.max(0, totalBills - billsPaid), currency)} left`)
        ),
        h('div', { className: 'metric-card' },
          h('p', { className: 'metric-label' }, 'Projected income'),
          h('p', { className: 'metric-value' }, fmtCurrency(totalProjectedIncome, currency)),
          hasIncomeRange
            ? h('p', { className: 'metric-foot' }, `${fmtCurrency(projectedIncomeRange.min, currency)}\u2013${fmtCurrency(projectedIncomeRange.max, currency)}`)
            : h('p', { className: 'metric-foot' }, `${fmtCurrency(incomeReceived, currency)} received`)
        )
      ),

      // the wide card from the sketch: both net figures side by side
      h('div', { className: 'metric-card net-card' },
        h('div', { className: 'net-card-half' },
          h('p', { className: 'metric-label' }, 'Net so far'),
          h('p', { className: 'metric-value', style: { color: netSoFar >= 0 ? 'var(--text-success)' : 'var(--late-red)' } },
            `${netSoFar >= 0 ? '+' : ''}${fmtCurrency(netSoFar, currency)}`)
        ),
        h('div', { className: 'net-card-half net-card-half-right' },
          h('p', { className: 'metric-label' }, 'Net projected'),
          h('p', { className: 'metric-value', style: { color: netProjected >= 0 ? 'var(--text-success)' : 'var(--late-red)' } },
            `${netProjected >= 0 ? '+' : ''}${fmtCurrency(netProjected, currency)}`)
        )
      ),

      // bills as a tickable checklist rather than tiles
      h('p', { className: 'section-title' }, 'Bills this month'),
      allTiles.length === 0
        ? h('p', { className: 'empty-state' }, 'Nothing scheduled this month.')
        : h('div', { className: 'bill-checklist' },
            allTiles.map((o) => {
              const paid = isPaid(data, o.id, o.occDate);
              const late = !paid && (isForcedLate(data, o.id, o.occDate) || (parseYmd(o.occDate) < today && !isDismissedLate(data, o.id, o.occDate)));
              const dateLabel = formatDate(parseYmd(o.occDate), data.settings);
              const accentColor = getEntryColor(o, data) || '#D85A5A';
              return h('div', {
                key: `${o.id}-${o.occDate}`,
                className: `bill-check-row${paid ? ' paid' : ''}`,
                onClick: () => setPriceModal(o)
              },
                h('input', {
                  type: 'checkbox',
                  checked: paid,
                  onClick: (e) => e.stopPropagation(),
                  onChange: () => togglePaid(o),
                  'aria-label': `Mark ${o.name} paid`
                }),
                h('span', { className: 'bill-check-accent', style: { background: accentColor } }),
                h('div', { className: 'bill-check-text' },
                  h('p', { className: 'bill-check-name' },
                    late ? h('span', { className: 'late-dot', title: 'Late' }) : null,
                    o.name
                  ),
                  h('p', { className: 'bill-check-sub' }, `${dateLabel} \u00b7 ${o.category || (FREQ_LABELS[o.freq] || o.freq)}`)
                ),
                h('span', { className: 'bill-check-amount' }, occAmountLabel(o, currency))
              );
            })
          ),

      h('p', { className: 'section-title' }, 'Next 7 days'),
      next7List,

      // everything analytical hides behind this until asked for
      h('label', { className: 'advanced-toggle' },
        h('input', {
          type: 'checkbox',
          checked: advancedOpen,
          onChange: (e) => setAdvancedOpen(e.target.checked)
        }),
        h('span', null, 'Advanced view'),
        h('span', { className: 'advanced-toggle-hint' }, advancedOpen ? 'Hide charts' : 'Show charts')
      ),

      advancedOpen ? h('div', { className: 'advanced-panel' },
        h(CashFlowChart, { points: cashFlowSeries, currency }),
        h(CategoryDonut, {
          data: breakdownData, currency,
          groupBy: breakdownGroupBy, setGroupBy: setBreakdownGroupBy,
          filter: breakdownFilter, setFilter: setBreakdownFilter
        }),
        h(MonthSummaryCard, { summary: monthSummary, currency }),
        h(MonthComparisonCard, { lastMonth: lastMonthTotals, thisMonth: { totalBills, totalIncome: totalProjectedIncome }, currency })
      ) : null,

      priceModal ? h(PriceOverrideModal, {
        data, setData, occ: priceModal, currency,
        onClose: () => setPriceModal(null)
      }) : null
    );
  }

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

    h('div', { className: 'grid-2', style: { marginTop: '10px' } },
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Net so far'),
        h('p', { className: 'metric-value', style: { color: (incomeReceived - billsPaid) >= 0 ? 'var(--text-success)' : 'var(--late-red)' } },
          `${(incomeReceived - billsPaid) >= 0 ? '+' : ''}${fmtCurrency(incomeReceived - billsPaid, currency)}`)
      ),
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Net projected for month'),
        h('p', { className: 'metric-value', style: { color: (totalProjectedIncome - totalBills) >= 0 ? 'var(--text-success)' : 'var(--late-red)' } },
          `${(totalProjectedIncome - totalBills) >= 0 ? '+' : ''}${fmtCurrency(totalProjectedIncome - totalBills, currency)}`)
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
                  onChange: () => togglePaid(o),
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
    }) : null,

    h('div', { className: 'home-chart-row' },
      h('div', { className: 'home-chart-main' },
        h(CashFlowChart, { points: cashFlowSeries, currency })
      ),
      h('div', { className: 'home-chart-side' },
        h('p', { className: 'section-title', style: { marginTop: '0', marginBottom: '8px' } }, 'Next 7 days'),
        next7List
      )
    ),

    h('div', { className: 'home-bottom-row' },
      h(CategoryDonut, {
        data: breakdownData, currency,
        groupBy: breakdownGroupBy, setGroupBy: setBreakdownGroupBy,
        filter: breakdownFilter, setFilter: setBreakdownFilter
      }),
      h('div', { className: 'home-side-cards' },
        h(MonthSummaryCard, { summary: monthSummary, currency }),
        h(MonthComparisonCard, { lastMonth: lastMonthTotals, thisMonth: { totalBills, totalIncome: totalProjectedIncome }, currency })
      )
    )
  );
}

/* ---------------- Month Summary Card ---------------- */

function MonthSummaryCard({ summary, currency }) {
  return h('div', { className: 'card' },
    h('p', { style: { margin: '0 0 10px', fontWeight: 500 } }, 'This month at a glance'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' } },
      summary.biggestBill ? h('div', { className: 'row-between' },
        h('span', { style: { color: 'var(--text-secondary)' } }, 'Biggest bill'),
        h('span', null, `${summary.biggestBill.name} - ${fmtCurrency(summary.biggestBill.amount, currency)}`)
      ) : null,
      summary.biggestIncome ? h('div', { className: 'row-between' },
        h('span', { style: { color: 'var(--text-secondary)' } }, 'Biggest income'),
        h('span', { style: { color: 'var(--text-success)' } }, `${summary.biggestIncome.name} - ${fmtCurrency(summary.biggestIncome.amount, currency)}`)
      ) : null,
      h('div', { className: 'row-between' },
        h('span', { style: { color: 'var(--text-secondary)' } }, `Average bill (${summary.billCount})`),
        h('span', null, fmtCurrency(summary.avgBill, currency))
      ),
      (!summary.biggestBill && !summary.biggestIncome) ? h('p', { className: 'empty-state', style: { margin: 0 } }, 'Nothing scheduled this month yet.') : null
    )
  );
}

/* ---------------- Month Comparison Card ---------------- */

function MonthComparisonCard({ lastMonth, thisMonth, currency }) {
  const billsDelta = thisMonth.totalBills - lastMonth.totalBills;
  const incomeDelta = thisMonth.totalIncome - lastMonth.totalIncome;

  function deltaLabel(delta, goodIsUp) {
    if (Math.abs(delta) < 0.01) return { text: 'No change', color: 'var(--text-tertiary)' };
    const up = delta > 0;
    const good = goodIsUp ? up : !up;
    return {
      text: `${up ? '+' : ''}${fmtCurrency(delta, currency)} vs last month`,
      color: good ? 'var(--text-success)' : 'var(--late-red)'
    };
  }

  const billsInfo = deltaLabel(billsDelta, false);
  const incomeInfo = deltaLabel(incomeDelta, true);

  return h('div', { className: 'card' },
    h('p', { style: { margin: '0 0 10px', fontWeight: 500 } }, 'vs. last month'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' } },
      h('div', null,
        h('p', { style: { margin: 0, color: 'var(--text-secondary)' } }, 'Bills'),
        h('p', { style: { margin: 0 } }, `${fmtCurrency(thisMonth.totalBills, currency)} `,
          h('span', { style: { color: billsInfo.color, fontSize: '12px' } }, billsInfo.text))
      ),
      h('div', null,
        h('p', { style: { margin: 0, color: 'var(--text-secondary)' } }, 'Income'),
        h('p', { style: { margin: 0 } }, `${fmtCurrency(thisMonth.totalIncome, currency)} `,
          h('span', { style: { color: incomeInfo.color, fontSize: '12px' } }, incomeInfo.text))
      )
    )
  );
}

/* ---------------- Cumulative cash flow chart ---------------- */

function CashFlowChart({ points, currency }) {
  const [view, setView] = useState('cumulative'); // 'cumulative' | 'daily'
  const [hoverIdx, setHoverIdx] = useState(null);

  if (points.length === 0) return null;

  const billsKey = view === 'cumulative' ? 'bills' : 'dailyBills';
  const incomeKey = view === 'cumulative' ? 'income' : 'dailyIncome';
  const netKey = view === 'cumulative' ? 'net' : 'dailyNet';

  const allVals = points.flatMap((p) => [p[billsKey], p[incomeKey], p[netKey]]);
  const maxVal = Math.max(...allVals, 1);
  const minVal = view === 'daily' ? Math.min(...allVals, 0) : 0;

  const W = 760, H = 200, PAD_L = 56, PAD_R = 16, PAD_T = 16, PAD_B = 24;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const range = maxVal - minVal || 1;
  const scaleY = (v) => PAD_T + innerH - ((v - minVal) / range) * innerH;
  const zeroY = scaleY(0);

  const pathFor = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${PAD_L + i * stepX} ${scaleY(p[key])}`).join(' ');

  // a handful of evenly-spaced day labels along the x-axis (avoid crowding for long months)
  const labelEvery = points.length > 20 ? 5 : points.length > 10 ? 2 : 1;
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return h('div', null,
    h('div', { className: 'row-between' },
      h('p', { className: 'section-title', style: { margin: 0 } }, 'Cash flow this month'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
        h('div', { style: { display: 'flex', gap: '14px', fontSize: '12px', color: 'var(--text-secondary)' } },
          h('span', null, h('span', { style: { display: 'inline-block', width: 10, height: 10, background: 'var(--text-success)', marginRight: '4px', borderRadius: '2px' } }), 'Income'),
          h('span', null, h('span', { style: { display: 'inline-block', width: 10, height: 10, background: 'var(--late-red)', marginRight: '4px', borderRadius: '2px' } }), 'Bills'),
          h('span', null, h('span', { style: { display: 'inline-block', width: 10, height: 10, background: 'var(--accent)', marginRight: '4px', borderRadius: '2px' } }), 'Net')
        ),
        h('select', { value: view, onChange: (e) => setView(e.target.value), style: { fontSize: '12px', padding: '4px 8px' } },
          h('option', { value: 'cumulative' }, 'Running total'),
          h('option', { value: 'daily' }, 'Per day')
        )
      )
    ),
    h('div', { style: { position: 'relative' } },
      h('svg', {
        viewBox: `0 0 ${W} ${H}`,
        className: 'cashflow-chart',
        onMouseLeave: () => setHoverIdx(null)
      },
        // horizontal gridlines + scale labels
        h('line', { x1: PAD_L, y1: PAD_T, x2: PAD_L, y2: H - PAD_B, stroke: 'var(--border-tertiary)', strokeWidth: 1 }),
        h('line', { x1: PAD_L, y1: zeroY, x2: W - PAD_R, y2: zeroY, stroke: 'var(--border-tertiary)', strokeWidth: 1 }),
        h('text', { x: PAD_L - 8, y: PAD_T + 4, fontSize: 10, fill: 'var(--text-secondary)', textAnchor: 'end' }, fmtCurrency(maxVal, currency)),
        h('text', { x: PAD_L - 8, y: zeroY + 4, fontSize: 10, fill: 'var(--text-secondary)', textAnchor: 'end' }, fmtCurrency(0, currency)),
        minVal < 0 ? h('text', { x: PAD_L - 8, y: H - PAD_B + 4, fontSize: 10, fill: 'var(--text-secondary)', textAnchor: 'end' }, fmtCurrency(minVal, currency)) : null,

        points.map((p, i) => (
          i % labelEvery === 0 ? h('text', {
            key: `lbl-${i}`,
            x: PAD_L + i * stepX,
            y: H - PAD_B + 16,
            fontSize: 9,
            fill: 'var(--text-tertiary)',
            textAnchor: 'middle'
          }, p.day) : null
        )),

        h('path', { d: pathFor(billsKey), fill: 'none', stroke: 'var(--late-red)', strokeWidth: 2 }),
        h('path', { d: pathFor(incomeKey), fill: 'none', stroke: 'var(--text-success)', strokeWidth: 2 }),
        h('path', { d: pathFor(netKey), fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.5, strokeDasharray: '4 3' }),

        hovered ? h('line', {
          x1: PAD_L + hoverIdx * stepX, y1: PAD_T, x2: PAD_L + hoverIdx * stepX, y2: H - PAD_B,
          stroke: 'var(--border-secondary)', strokeWidth: 1
        }) : null,

        // invisible hit zones, one per data point, for hover detection
        points.map((p, i) => h('rect', {
          key: `hit-${i}`,
          x: PAD_L + i * stepX - (stepX / 2 || 6),
          y: PAD_T,
          width: stepX || 12,
          height: innerH,
          fill: 'transparent',
          onMouseEnter: () => setHoverIdx(i)
        }))
      ),
      hovered ? h('div', {
        className: 'cashflow-tooltip',
        style: {
          left: `${Math.min(82, Math.max(10, (PAD_L + hoverIdx * stepX) / W * 100))}%`
        }
      },
        h('p', { className: 'cashflow-tooltip-day' }, `Day ${hovered.day}`),
        h('p', { style: { color: 'var(--text-success)' } }, `Income: ${fmtCurrency(hovered[incomeKey], currency)}`),
        h('p', { style: { color: 'var(--late-red)' } }, `Bills: ${fmtCurrency(hovered[billsKey], currency)}`),
        h('p', { style: { color: 'var(--accent)' } }, `Net: ${hovered[netKey] >= 0 ? '+' : ''}${fmtCurrency(hovered[netKey], currency)}`)
      ) : null
    )
  );
}

/* ---------------- Category Breakdown Donut ---------------- */

function CategoryDonut({ data: rows, currency, groupBy, setGroupBy, filter, setFilter }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const size = 160, r = 60, cx = 80, cy = 80;
  const circumference = 2 * Math.PI * r;

  let offsetAcc = 0;
  const segments = rows.map((row) => {
    const dash = row.pct * circumference;
    const seg = { ...row, dash, offset: offsetAcc };
    offsetAcc += dash;
    return seg;
  });

  return h('div', null,
    h('div', { className: 'row-between' },
      h('p', { className: 'section-title', style: { margin: 0 } }, 'Where it goes'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('select', { value: filter, onChange: (e) => setFilter(e.target.value), style: { fontSize: '12px', padding: '4px 8px' } },
          h('option', { value: 'bills' }, 'Bills'),
          h('option', { value: 'income' }, 'Income'),
          h('option', { value: 'both' }, 'Both')
        ),
        h('select', { value: groupBy, onChange: (e) => setGroupBy(e.target.value), style: { fontSize: '12px', padding: '4px 8px' } },
          h('option', { value: 'source' }, 'By source type'),
          h('option', { value: 'category' }, 'By category')
        )
      )
    ),
    rows.length === 0
      ? h('p', { className: 'empty-state' }, 'Nothing to show for this filter.')
      : h('div', { style: { display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', marginTop: '8px' } },
          h('svg', { viewBox: `0 0 ${size} ${size}`, style: { width: '160px', height: '160px', flexShrink: 0 } },
            segments.map((seg, i) => h('circle', {
              key: i,
              cx, cy, r,
              fill: 'none',
              stroke: seg.color,
              strokeWidth: 24,
              strokeDasharray: `${seg.dash} ${circumference - seg.dash}`,
              strokeDashoffset: -seg.offset,
              transform: `rotate(-90 ${cx} ${cy})`
            })),
            h('text', { x: cx, y: cy - 4, textAnchor: 'middle', fontSize: 13, fontWeight: 600, fill: 'var(--text-primary)' }, fmtCurrency(total, currency)),
            h('text', { x: cx, y: cy + 12, textAnchor: 'middle', fontSize: 10, fill: 'var(--text-secondary)' }, 'total')
          ),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' } },
            segments.map((seg, i) => h('div', { key: i, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '13px' } },
              h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                h('span', { style: { width: 9, height: 9, borderRadius: '50%', background: seg.color, display: 'inline-block', flexShrink: 0 } }),
                seg.label
              ),
              h('span', { style: { color: 'var(--text-secondary)' } }, `${fmtCurrency(seg.amount, currency)} (${Math.round(seg.pct * 100)}%)`)
            ))
          )
        )
  );
}

/* ---------------- Price Override Modal ---------------- */

function PriceOverrideModal({ data, setData, occ, currency, onClose }) {
  const sheet = useSheetDismiss(onClose);
  const existing = getOverride(data, occ.id, occ.occDate);
  const [price, setPrice] = useState(existing && existing.amount !== undefined ? String(existing.amount) : '');
  const [confirmRemove, setConfirmRemove] = useState(false);

  function save() {
    const val = price === '' ? null : parseFloat(price);
    const key = `${occ.id}|${occ.occDate}`;
    const next = { ...data.overrides };
    if (val === null || isNaN(val)) {
      delete next[key];
    } else {
      next[key] = { amount: val };
    }
    let nextData = { ...data, overrides: next };
    if (val !== null && !isNaN(val)) {
      nextData = logActivity(nextData, `Set price for "${occ.name}" to ${fmtCurrency(val, currency)}`);
    }
    setData(nextData);
    onClose();
  }

  function clearOverride() {
    const key = `${occ.id}|${occ.occDate}`;
    const next = { ...data.overrides };
    delete next[key];
    let nextData = logActivity({ ...data, overrides: next }, `Cleared price override for "${occ.name}"`);
    setData(nextData);
    onClose();
  }

  const forcedLate = isForcedLate(data, occ.id, occ.occDate);
  function toggleLate() {
    let next = toggleForcedLate(data, occ.id, occ.occDate);
    next = logActivity(next, `${forcedLate ? 'Unmarked' : 'Marked'} "${occ.name}" as late`);
    setData(next);
  }

  function removeThisOccurrence() {
    let next;
    if (occ.sourceList === 'oneTimeEntries') {
      next = { ...data, oneTimeEntries: data.oneTimeEntries.filter((e) => e.id !== occ.id) };
      next = logActivity(next, `Removed "${occ.name}"`);
    } else {
      next = removeOccurrence(data, occ.id, occ.occDate);
      next = logActivity(next, `Removed "${occ.name}" from calendar for ${occ.occDate}`);
    }
    setData(next);
    onClose();
  }

  const d = parseYmd(occ.occDate);
  const dateLabel = formatDate(d, data.settings, { weekday: true, year: true });
  const templateLabel = occ.isRange
    ? `${fmtCurrency(occ.amountMin, currency)}-${fmtCurrency(occ.amountMax, currency)}`
    : fmtCurrency(entryAmount(occ), currency);

  return h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content' },
      h('div', { className: 'sheet-grabber', ...sheet, 'aria-label': 'Close' }),
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

      occ.kind !== 'income' ? h('div', { className: 'row-between', style: { paddingTop: '8px', borderTop: '0.5px solid var(--border-tertiary)' } },
        h('div', null,
          h('p', { style: { margin: 0, fontSize: '13px', fontWeight: 500 } }, 'Late status'),
          h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--text-secondary)' } },
            forcedLate ? 'Manually marked late.' : 'Mark this occurrence late regardless of its due date.')
        ),
        h('button', { onClick: toggleLate }, forcedLate ? 'Unmark late' : 'Mark as late')
      ) : null,

      h('div', { className: 'row-between', style: { paddingTop: '8px', borderTop: '0.5px solid var(--border-tertiary)' } },
        h('div', null,
          h('p', { style: { margin: 0, fontSize: '13px', fontWeight: 500 } }, 'Remove this occurrence'),
          h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--text-secondary)' } },
            occ.sourceList === 'oneTimeEntries' ? 'Deletes this entry entirely.' : 'Only this date - the recurring rule is unaffected.')
        ),
        confirmRemove
          ? h('button', { className: 'danger-text', onClick: removeThisOccurrence }, 'Confirm remove?')
          : h('button', { className: 'danger-text', onClick: () => setConfirmRemove(true) }, 'Remove')
      ),

      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        existing ? h('button', { className: 'danger-text', onClick: clearOverride }, 'Clear override') : h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'primary', onClick: save }, 'Save')
      )
    )
  );
}
