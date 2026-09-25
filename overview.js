
const SOURCE_GROUP_LABELS = {
  majorBills: 'Essentials',
  subscriptions: 'Subscriptions',
  creditCards: 'Credit cards',
  oneTimeEntries: 'One-time',
  incomeSources: 'Income',
  advances: 'Advances'
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
    () => [
      ...expandAll(data.incomeSources, 'income', monthStart, monthEnd, data).map((o) => ({ ...o, sourceList: 'incomeSources' })),
      ...advanceInflows(data, monthStart, monthEnd)
    ],
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
      .reduce((sum, o) => sum + o.amount, 0)
    + [...billOccurrences, ...oneTimePayments]
      .filter((o) => !isPaid(data, o.id, o.occDate))
      .reduce((sum, o) => sum + Math.min(coveredAmount(data, o.id, o.occDate), o.amount), 0);

  const allTiles = useMemo(
    () => [...billOccurrences, ...oneTimePayments].map((o) => {
      const covered = coveredAmount(data, o.id, o.occDate);
      if (covered <= 0 || isPaid(data, o.id, o.occDate)) return o;
      return { ...o, covered, amount: Math.max(0, o.amount - covered) };
    }).sort((a, b) => {
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
    const lastOneTimeBills = purchaseEntries(data)
      .filter((e) => {
        const d = parseYmd(e.date);
        return d >= lastStart && d <= lastEnd;
      })
      .reduce((sum, e) => sum + resolvedAmount(data, e, e.date), 0);

    return {
      totalBills: lastBills.reduce((sum, o) => sum + o.amount, 0) + lastOneTimeBills
    };
  }, [data, cursor]);

  const monthSummary = useMemo(() => {
    const billRows = [...billOccurrences, ...oneTimePayments];
    const biggestBill = billRows.reduce((max, o) => (!max || o.amount > max.amount ? o : max), null);
    const avgBill = billRows.length > 0 ? billRows.reduce((s, o) => s + o.amount, 0) / billRows.length : 0;

    return { biggestBill, avgBill, billCount: billRows.length };
  }, [billOccurrences, oneTimePayments]);

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
    incomeReceived,
    billsPaid,
    allTiles,
    cashFlowSeries,
    lastMonthTotals,
    monthSummary
  };
}

function useNextCheck(data, period) {
  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 400);
    const afterToday = new Date(today);
    afterToday.setDate(afterToday.getDate() + 1);

    const checks = [
      ...expandAll(data.incomeSources, 'income', afterToday, horizon, data),
      ...data.oneTimeEntries
        .filter((e) => e.oneTimeKind === 'income' && e.date && parseYmd(e.date) >= afterToday && parseYmd(e.date) <= horizon)
        .map((e) => oneTimeOccurrence(data, e))
    ].sort((a, b) => a.occDate.localeCompare(b.occDate));

    const idx = Math.max(0, Math.min(period || 0, checks.length - 1));
    const check = checks[idx] || null;
    const estimate = (check && check.isEstimate) ? { amount: check.amount, count: check.estimateCount } : null;
    const windowEnd = new Date(today);
    if (check) {
      const d = parseYmd(check.occDate);
      windowEnd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    } else {
      windowEnd.setDate(windowEnd.getDate() + 14);
    }

    const grace = data.settings.lateGraceDays || 0;
    const windowStart = new Date(today);
    if (idx > 0) {
      const prev = parseYmd(checks[idx - 1].occDate);
      windowStart.setFullYear(prev.getFullYear(), prev.getMonth(), prev.getDate());
      windowStart.setDate(windowStart.getDate() + 1);
    } else {
      windowStart.setDate(windowStart.getDate() - grace);
    }

    const lookback = new Date(today);
    lookback.setDate(lookback.getDate() - 120);
    const pastChecks = [
      ...expandAll(data.incomeSources, 'income', lookback, today, data),
      ...data.oneTimeEntries
        .filter((e) => e.oneTimeKind === 'income' && e.date && parseYmd(e.date) >= lookback && parseYmd(e.date) <= today)
        .map((e) => oneTimeOccurrence(data, e))
    ].sort((a, b) => a.occDate.localeCompare(b.occDate));
    const lastCheck = pastChecks.length ? pastChecks[pastChecks.length - 1] : null;

    const spendStart = new Date(windowStart);
    if (idx === 0 && lastCheck) {
      const last = parseYmd(lastCheck.occDate);
      spendStart.setFullYear(last.getFullYear(), last.getMonth(), last.getDate());
    }
    const spendStartStr = ymd(spendStart);

    const listFor = resolveSourceList(data);
    const startStr = ymd(windowStart);
    const endStr = ymd(windowEnd);
    const landsHere = (target) => target >= startStr && target <= endStr;

    const upcoming = [
      ...expandAll(getAllBillLikeEntries(data).filter((e) => !e.autoRepay), 'bill', windowStart, windowEnd, data),
      ...data.oneTimeEntries
        .filter((e) => e.oneTimeKind === 'payment' && e.date && parseYmd(e.date) >= windowStart && parseYmd(e.date) <= windowEnd)
        .map((e) => oneTimeOccurrence(data, e))
    ].filter((o) => !isPaid(data, o.id, o.occDate));

    const entryById = buildEntryLookup(data);
    const removed = data.removedOccurrences || {};
    const pulled = Object.keys(data.deferred || {}).map((key) => {
      const sep = key.lastIndexOf('|');
      const entryId = key.slice(0, sep);
      const occDate = key.slice(sep + 1);
      const target = deferredTo(data, entryId, occDate);
      if (!target || !landsHere(target)) return null;
      if (occDate >= startStr && occDate <= endStr) return null;
      if (isPaid(data, entryId, occDate) || removed[key]) return null;
      const entry = entryById[entryId];
      if (!entry || entry.oneTimeKind === 'income') return null;
      if (entry.oneTimeKind === 'payment') return oneTimeOccurrence(data, entry);
      const override = getOverride(data, entryId, occDate);
      return {
        ...entry,
        occDate,
        amount: hasAmountOverride(override) ? Number(override.amount) || 0 : entryAmount(entry),
        isRange: !!entry.useAmountRange,
        hasOverride: hasAmountOverride(override),
        kind: 'bill'
      };
    }).filter(Boolean);

    const remainingOf = (o) => Math.max(0, o.amount - coveredAmount(data, o.id, o.occDate));
    const pushedOut = [];
    const seen = new Set();
    const bills = [...(idx === 0 ? getLateBills(data) : []), ...upcoming, ...pulled]
      .filter((o) => {
        const key = `${o.id}|${o.occDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        const target = deferredTo(data, o.id, o.occDate);
        if (target && !landsHere(target)) {
          pushedOut.push({ ...o, target, amount: remainingOf(o) });
          return false;
        }
        return true;
      })
      .map((o) => ({
        ...o,
        sourceList: listFor(o),
        pushedTo: deferredTo(data, o.id, o.occDate),
        covered: coveredAmount(data, o.id, o.occDate),
        amount: remainingOf(o)
      }))
      .sort((a, b) => a.occDate.localeCompare(b.occDate));

    const nextCheckDate = checks[idx + 1] ? checks[idx + 1].occDate : null;

    const spent = purchaseEntries(data)
      .filter((e) => e.date >= spendStartStr && e.date <= endStr && isPaid(data, e.id, e.date))
      .reduce((sum, e) => sum + oneTimeOccurrence(data, e).amount, 0);

    const takes = check
      ? getAdvanceEntries(data).filter((e) => e.autoRepay && e.date === check.occDate)
      : [];
    const taken = takes.reduce((sum, e) => sum + e.amount, 0);

    return {
      check,
      windowStart,
      windowEnd,
      bills,
      period: idx,
      hasPrev: idx > 0,
      hasNext: idx + 1 < checks.length,
      due: bills.reduce((sum, o) => sum + o.amount, 0),
      checkAmount: check ? check.amount - taken : 0,
      takes,
      estimate,
      overdueCount: bills.filter((o) => parseYmd(o.occDate) < today).length,
      spent,
      spendStart,
      pushTo: nextCheckDate,
      pushedOut: {
        count: pushedOut.length,
        amount: pushedOut.reduce((sum, o) => sum + o.amount, 0),
        to: pushedOut.reduce((soonest, o) => (soonest && soonest <= o.target ? soonest : o.target), null)
      }
    };
  }, [data, period]);
}


function Chevron({ dir }) {
  return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('path', { d: dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7' })
  );
}

function MonthHeader({ cursor, onChange }) {
  const label = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const now = new Date();
  const offset = (now.getFullYear() - cursor.getFullYear()) * 12 + (now.getMonth() - cursor.getMonth());
  return h('div', { className: 'month-head' },
    h('button', { className: 'month-nav', onClick: () => { haptic('light'); onChange(-1); }, 'aria-label': 'Previous month' }, h(Chevron, { dir: 'left' })),
    h('div', { className: 'month-title-wrap' },
      h('h1', { className: 'month-title' }, label),
      offset !== 0 ? h('button', { className: 'today-btn', onClick: () => { haptic('light'); onChange(offset); } }, 'Today') : null
    ),
    h('button', { className: 'month-nav', onClick: () => { haptic('light'); onChange(1); }, 'aria-label': 'Next month' }, h(Chevron, { dir: 'right' }))
  );
}

function OverviewSwitch({ view, setView }) {
  return h('div', { className: 'ov-switch', role: 'tablist' },
    [{ id: 'calendar', label: 'Calendar' }, { id: 'stats', label: 'Statistics' }].map((t) => h('button', {
      key: t.id,
      className: `ov-switch-btn${view === t.id ? ' on' : ''}`,
      onClick: () => { haptic('light'); setView(t.id); },
      role: 'tab',
      'aria-selected': view === t.id
    }, t.label))
  );
}

function OverviewPage({ data, setData, isMobile, onAddEntry, view, setView }) {
  const body = view === 'calendar'
    ? h(CalendarPage, { data, setData, isMobile, onAddEntry })
    : h(StatisticsPage, { data, isMobile });

  if (isMobile) return body;

  return h('div', { className: 'ov-page' },
    h(OverviewSwitch, { view, setView }),
    body
  );
}

function StatisticsPage({ data, isMobile }) {
  const currency = data.settings.currency;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [groupBy, setGroupBy] = useState('source');
  const [filter, setFilter] = useState('bills');

  const fin = useMonthFinancials(data, cursor);

  const breakdown = useMemo(() => {
    const rows = [];
    if (filter === 'bills') {
      fin.billOccurrences.forEach((o) => rows.push(o));
      fin.oneTimePayments.forEach((o) => rows.push(o));
    }
    if (filter === 'income') {
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
          ? (o.kind === 'income' ? 'One-time income' : 'Purchases')
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

  const now = new Date();
  const isCurrentMonth = cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();
  const sc = data.settings.sectionColors || {};
  const colors = { income: sc.incomeSources || '#4FAE6B', bills: sc.majorBills || '#D85A5A' };

  const monthHeader = h(MonthHeader, { cursor, onChange: changeMonth });
  const chart = h(CashFlowChart, {
    points: fin.cashFlowSeries, currency, colors,
    todayDay: isCurrentMonth ? now.getDate() : null
  });
  const donut = h(CategoryDonut, { data: breakdown, currency, groupBy, setGroupBy, filter, setFilter });
  const glance = h(GlanceGrid, { fin, currency });

  if (isMobile) {
    return h('div', { className: 'stats-page' }, monthHeader, chart, donut, glance);
  }

  return h('div', { className: 'stats-page' },
    monthHeader,
    h('div', { className: 'stats-desktop' },
      h('div', { className: 'stats-col' }, chart, glance),
      h('div', { className: 'stats-col' }, donut)
    )
  );
}
