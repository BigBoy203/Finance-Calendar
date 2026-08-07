
const SOURCE_GROUP_LABELS = {
  majorBills: 'Essentials',
  subscriptions: 'Subscriptions',
  creditCards: 'Credit cards',
  oneTimeEntries: 'One-time',
  incomeSources: 'Income'
};

function useMonthFinancials(data, cursor) {
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

  const oneTimeThisMonth = useMemo(() => data.oneTimeEntries.filter((e) => {
    if (!e.date) return false;
    const d = parseYmd(e.date);
    return d >= monthStart && d <= monthEnd;
  }), [data.oneTimeEntries, cursor]);

  const oneTimePayments = useMemo(
    () => oneTimeThisMonth
      .filter((e) => e.oneTimeKind === 'payment')
      .map((e) => ({ ...oneTimeOccurrence(data, e), sourceList: 'oneTimeEntries' })),
    [oneTimeThisMonth, data]
  );
  const oneTimeIncome = useMemo(
    () => oneTimeThisMonth.filter((e) => e.oneTimeKind === 'income'),
    [oneTimeThisMonth]
  );

  const totalBills = billOccurrences.reduce((sum, o) => sum + o.amount, 0)
    + oneTimePayments.reduce((sum, o) => sum + o.amount, 0);

  const totalProjectedIncome = incomeOccurrences.reduce((sum, o) => sum + o.amount, 0)
    + oneTimeIncome.reduce((sum, o) => sum + entryAmount(o), 0);

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
    oneTimeIncome.forEach((o) => {
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
  }, [incomeOccurrences, oneTimeIncome]);

  const incomeReceived = incomeOccurrences
    .filter((o) => parseYmd(o.occDate) <= today)
    .reduce((sum, o) => sum + o.amount, 0)
    + oneTimeIncome
      .filter((o) => parseYmd(o.date) <= today)
      .reduce((sum, o) => sum + entryAmount(o), 0);

  const billsPaid = billOccurrences
    .filter((o) => isPaid(data, o.id, o.occDate))
    .reduce((sum, o) => sum + o.amount, 0)
    + oneTimePayments
      .filter((o) => isPaid(data, o.id, o.occDate))
      .reduce((sum, o) => sum + o.amount, 0);

  const allTiles = useMemo(
    () => [...billOccurrences, ...oneTimePayments].sort((a, b) => {
      const aPaid = isPaid(data, a.id, a.occDate);
      const bPaid = isPaid(data, b.id, b.occDate);
      if (aPaid !== bPaid) return aPaid ? 1 : -1;
      return a.occDate.localeCompare(b.occDate);
    }),
    [billOccurrences, oneTimePayments, data]
  );

  const cashFlowSeries = useMemo(() => {
    const dayCount = monthEnd.getDate();
    const billsByDay = new Array(dayCount + 1).fill(0);
    const incomeByDay = new Array(dayCount + 1).fill(0);

    [...billOccurrences, ...oneTimePayments].forEach((o) => {
      billsByDay[parseYmd(o.occDate).getDate()] += o.amount;
    });
    incomeOccurrences.forEach((o) => {
      incomeByDay[parseYmd(o.occDate).getDate()] += o.amount;
    });
    oneTimeIncome.forEach((o) => {
      incomeByDay[parseYmd(o.date).getDate()] += entryAmount(o);
    });

    let runningBills = 0;
    let runningIncome = 0;
    const points = [];
    for (let day = 1; day <= dayCount; day++) {
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
  }, [billOccurrences, oneTimePayments, incomeOccurrences, oneTimeIncome, cursor]);

  const lastMonthTotals = useMemo(() => {
    const lastStart = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    const lastEnd = new Date(cursor.getFullYear(), cursor.getMonth(), 0);

    const lastBills = expandAll(allBills, 'bill', lastStart, lastEnd, data);
    const lastIncome = expandAll(data.incomeSources, 'income', lastStart, lastEnd, data);
    const lastOneTime = data.oneTimeEntries.filter((e) => {
      if (!e.date) return false;
      const d = parseYmd(e.date);
      return d >= lastStart && d <= lastEnd;
    });
    const lastOneTimeBills = lastOneTime.filter((e) => e.oneTimeKind === 'payment')
      .reduce((sum, e) => sum + resolvedAmount(data, e, e.date), 0);
    const lastOneTimeIncome = lastOneTime.filter((e) => e.oneTimeKind === 'income')
      .reduce((sum, e) => sum + resolvedAmount(data, e, e.date), 0);

    return {
      totalBills: lastBills.reduce((sum, o) => sum + o.amount, 0) + lastOneTimeBills,
      totalIncome: lastIncome.reduce((sum, o) => sum + o.amount, 0) + lastOneTimeIncome
    };
  }, [data, cursor]);

  const monthSummary = useMemo(() => {
    const billRows = [...billOccurrences, ...oneTimePayments];
    const incomeRows = [...incomeOccurrences, ...oneTimeIncome.map((o) => ({ ...o, amount: resolvedAmount(data, o, o.date) }))];

    const biggestBill = billRows.reduce((max, o) => (!max || o.amount > max.amount ? o : max), null);
    const biggestIncome = incomeRows.reduce((max, o) => (!max || o.amount > max.amount ? o : max), null);
    const avgBill = billRows.length > 0 ? billRows.reduce((s, o) => s + o.amount, 0) / billRows.length : 0;

    return { biggestBill, biggestIncome, avgBill, billCount: billRows.length };
  }, [billOccurrences, oneTimePayments, incomeOccurrences, oneTimeIncome, data]);

  const next7Days = useMemo(() => {
    const start = new Date(today);
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    const within = (dateStr) => {
      const d = parseYmd(dateStr);
      return d >= start && d <= end;
    };

    const bills7 = expandAll(allBills, 'bill', start, end, data).map((o) => ({ ...o, sourceList: sourceListById[o.id] }));
    const income7 = expandAll(data.incomeSources, 'income', start, end, data).map((o) => ({ ...o, sourceList: 'incomeSources' }));
    const oneTime7 = data.oneTimeEntries
      .filter((e) => e.date && within(e.date))
      .map((e) => ({ ...oneTimeOccurrence(data, e), sourceList: 'oneTimeEntries' }));

    return [...bills7, ...income7, ...oneTime7].sort((a, b) => a.occDate.localeCompare(b.occDate));
  }, [data, cursor]);

  return {
    today,
    monthStart,
    monthEnd,
    billOccurrences,
    incomeOccurrences,
    oneTimePayments,
    oneTimeIncome,
    totalBills,
    totalProjectedIncome,
    projectedIncomeRange,
    hasIncomeRange: projectedIncomeRange.min !== projectedIncomeRange.max,
    incomeReceived,
    billsPaid,
    allTiles,
    cashFlowSeries,
    lastMonthTotals,
    monthSummary,
    next7Days
  };
}

function useNextCheck(data) {
  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 62);

    const checks = [
      ...expandAll(data.incomeSources, 'income', today, horizon, data),
      ...data.oneTimeEntries
        .filter((e) => e.oneTimeKind === 'income' && e.date && parseYmd(e.date) >= today && parseYmd(e.date) <= horizon)
        .map((e) => oneTimeOccurrence(data, e))
    ].sort((a, b) => a.occDate.localeCompare(b.occDate));

    const check = checks[0] || null;
    const windowEnd = new Date(today);
    if (check) {
      const d = parseYmd(check.occDate);
      windowEnd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    } else {
      windowEnd.setDate(windowEnd.getDate() + 14);
    }

    const grace = data.settings.lateGraceDays || 0;
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - grace);

    const sourceListById = buildSourceListLookup(data);
    const oneTimeIds = new Set(data.oneTimeEntries.map((e) => e.id));
    const listFor = (o) => sourceListById[o.id] || (oneTimeIds.has(o.id) ? 'oneTimeEntries' : undefined);

    const upcoming = [
      ...expandAll(getAllBillLikeEntries(data), 'bill', windowStart, windowEnd, data),
      ...data.oneTimeEntries
        .filter((e) => e.oneTimeKind === 'payment' && e.date && parseYmd(e.date) >= windowStart && parseYmd(e.date) <= windowEnd)
        .map((e) => oneTimeOccurrence(data, e))
    ].filter((o) => !isPaid(data, o.id, o.occDate));

    const seen = new Set();
    const bills = [...getLateBills(data), ...upcoming]
      .filter((o) => {
        const key = `${o.id}|${o.occDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((o) => ({ ...o, sourceList: listFor(o) }))
      .sort((a, b) => a.occDate.localeCompare(b.occDate));

    return {
      check,
      windowEnd,
      bills,
      due: bills.reduce((sum, o) => sum + o.amount, 0),
      checkAmount: check ? check.amount : 0,
      overdueCount: bills.filter((o) => parseYmd(o.occDate) < today).length
    };
  }, [data]);
}

function OverviewSwitch({ view, setView }) {
  return h('div', { className: 'ov-switch', role: 'tablist' },
    ['calendar', 'overview'].map((id) => h('button', {
      key: id,
      className: `ov-switch-btn${view === id ? ' on' : ''}`,
      onClick: () => { haptic('light'); setView(id); },
      role: 'tab',
      'aria-selected': view === id
    }, id === 'calendar' ? 'Calendar' : 'Overview'))
  );
}

function OverviewPage({ data, setData, isMobile, onAddEntry, view, setView }) {
  const body = view === 'calendar'
    ? h(CalendarPage, { data, setData, isMobile, onAddEntry })
    : h(MonthOverview, { data, setData, isMobile });

  if (isMobile) return body;

  return h('div', { className: 'ov-page' },
    h(OverviewSwitch, { view, setView }),
    body
  );
}

function MonthOverview({ data, setData, isMobile }) {
  const currency = data.settings.currency;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [groupBy, setGroupBy] = useState('source');
  const [filter, setFilter] = useState('bills');
  const [priceModal, setPriceModal] = useState(null);

  const fin = useMonthFinancials(data, cursor);

  const breakdown = useMemo(() => {
    const rows = [];
    if (filter === 'bills' || filter === 'both') {
      fin.billOccurrences.forEach((o) => rows.push(o));
      fin.oneTimePayments.forEach((o) => rows.push(o));
    }
    if (filter === 'income' || filter === 'both') {
      fin.incomeOccurrences.forEach((o) => rows.push(o));
      fin.oneTimeIncome.forEach((o) => {
        rows.push({ ...o, amount: resolvedAmount(data, o, o.date), sourceList: 'oneTimeEntries' });
      });
    }

    const sc = data.settings.sectionColors || {};
    const sourceColorFor = (o) => {
      if (o.sourceList === 'oneTimeEntries') return o.kind === 'income' ? sc.oneTimeIncome : sc.oneTimePayments;
      return sc[o.sourceList];
    };

    const groups = {};
    rows.forEach((o) => {
      if (groupBy === 'source') {
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
  }, [fin, groupBy, filter, data]);

  function changeMonth(delta) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const monthHeader = h('div', { className: 'home-month-header' },
    h('button', { onClick: () => changeMonth(-1), 'aria-label': 'Previous month' }, '<'),
    h('h1', { className: 'home-month-title' }, monthLabel),
    h('button', { onClick: () => changeMonth(1), 'aria-label': 'Next month' }, '>')
  );

  const next7List = fin.next7Days.length === 0
    ? h('p', { className: 'empty-state' }, 'Nothing due in the next 7 days.')
    : h('div', { className: 'ov-next7' },
        fin.next7Days.map((o, i) => h('div', {
          key: `${o.id}-${o.occDate}-${i}`,
          className: 'list-item clickable',
          onClick: () => setPriceModal(o)
        },
          h('div', null,
            h('p', { className: 'list-item-name' }, o.name),
            h('p', { className: 'list-item-sub' }, formatDate(parseYmd(o.occDate), data.settings))
          ),
          h('span', {
            className: 'list-item-amount',
            style: { color: o.kind === 'income' ? 'var(--text-success)' : 'inherit', fontSize: '12px' }
          }, `${o.kind === 'income' ? '+' : ''}${occAmountLabel(o, currency)}`)
        ))
      );

  const chart = h(CashFlowChart, { points: fin.cashFlowSeries, currency });
  const donut = h(CategoryDonut, { data: breakdown, currency, groupBy, setGroupBy, filter, setFilter });
  const glance = h(MonthSummaryCard, {
    summary: fin.monthSummary,
    currency,
    incomeReceived: fin.incomeReceived,
    projectedIncome: fin.totalProjectedIncome,
    incomeRange: fin.hasIncomeRange ? fin.projectedIncomeRange : null
  });
  const compare = h(MonthComparisonCard, {
    lastMonth: fin.lastMonthTotals,
    thisMonth: { totalBills: fin.totalBills, totalIncome: fin.totalProjectedIncome },
    currency
  });

  const priceModalEl = priceModal ? h(PriceOverrideModal, {
    data, setData, occ: priceModal, currency,
    onClose: () => setPriceModal(null)
  }) : null;

  if (isMobile) {
    return h('div', { className: 'month-overview' },
      monthHeader,
      h('p', { className: 'section-title' }, 'Next 7 days'),
      next7List,
      h('div', { className: 'ov-stack' }, chart, donut, glance, compare),
      priceModalEl
    );
  }

  return h('div', { className: 'month-overview' },
    monthHeader,
    h('div', { className: 'home-chart-row' },
      h('div', { className: 'home-chart-main' }, chart),
      h('div', { className: 'home-chart-side' },
        h('p', { className: 'section-title', style: { marginTop: '0', marginBottom: '8px' } }, 'Next 7 days'),
        next7List
      )
    ),
    h('div', { className: 'home-bottom-row' },
      donut,
      h('div', { className: 'home-side-cards' }, glance, compare)
    ),
    priceModalEl
  );
}
