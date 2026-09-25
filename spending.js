
const SPEND_HISTORY_MONTHS = 6;
const PURCHASE_PREVIEW = 6;
const REPEAT_BUY_LIMIT = 4;

function categoryColor(category) {
  const known = ONE_TIME_PAYMENT_CATEGORIES.indexOf(category);
  if (known >= 0) return DONUT_COLORS[known % DONUT_COLORS.length];
  let hash = 0;
  for (let i = 0; i < (category || '').length; i++) hash = (hash * 31 + category.charCodeAt(i)) | 0;
  return DONUT_COLORS[Math.abs(hash) % DONUT_COLORS.length];
}

function categoryTotals(data, monthKey) {
  const map = {};
  purchaseEntries(data).forEach((e) => {
    if (e.date.slice(0, 7) !== monthKey) return;
    const key = e.category || 'Other';
    map[key] = (map[key] || 0) + resolvedAmount(data, e, e.date);
  });
  return map;
}

function spendingHistory(data, cursor) {
  const buckets = [];
  for (let back = SPEND_HISTORY_MONTHS - 1; back >= 0; back--) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - back, 1);
    buckets.push({ key: ymd(d).slice(0, 7), label: MONTH_NAMES[d.getMonth()].slice(0, 3), total: 0 });
  }
  const byKey = {};
  buckets.forEach((b) => { byKey[b.key] = b; });
  purchaseEntries(data).forEach((e) => {
    const bucket = byKey[e.date.slice(0, 7)];
    if (bucket) bucket.total += resolvedAmount(data, e, e.date);
  });
  return buckets;
}

function repeatBuys(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = {};

  purchaseEntries(data).forEach((e) => {
    const key = e.name.trim().toLowerCase();
    if (!key) return;
    (groups[key] = groups[key] || []).push(e);
  });

  return Object.values(groups)
    .filter((rows) => rows.length >= 2)
    .map((rows) => {
      const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
      const last = sorted[sorted.length - 1];
      const gaps = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(daysBetween(parseYmd(sorted[i - 1].date), parseYmd(sorted[i].date)));
      }
      const gap = Math.round(gaps.reduce((sum, n) => sum + n, 0) / gaps.length);
      const recent = sorted.slice(-3);
      const typical = recent.reduce((sum, e) => sum + resolvedAmount(data, e, e.date), 0) / recent.length;
      return {
        name: last.name,
        category: last.category,
        amount: Math.round(typical * 100) / 100,
        count: sorted.length,
        gap,
        daysSince: daysBetween(parseYmd(last.date), today)
      };
    })
    .sort((a, b) => (b.daysSince - b.gap) - (a.daysSince - a.gap))
    .slice(0, REPEAT_BUY_LIMIT);
}

function BudgetModal({ categories, budget, currency, onSave, onRemove, onClose }) {
  const [category, setCategory] = useState(budget.category || categories[0] || 'Other');
  const [amount, setAmount] = useState(budget.amount ? String(budget.amount) : '');
  const editing = !!budget.category;
  const value = parseFloat(amount);
  const canSave = !isNaN(value) && value > 0;

  function save() {
    if (!canSave) return;
    haptic('success');
    onSave(category, value);
  }

  return h(Sheet, {
    title: editing ? `${budget.category} budget` : 'New monthly budget',
    sub: 'Day-to-day spending only — bills live on the Bills tab',
    onClose,
    foot: h('div', { className: 'sheet-actions' },
      h('button', { className: 'primary', onClick: save, disabled: !canSave },
        canSave ? `Save ${fmtCurrency(value, currency)} a month` : 'Enter an amount')
    )
  },
    editing ? null : h('div', { className: 'qa-block' },
      h('p', { className: 'qa-label' }, 'Category'),
      h(PickChips, { options: categories, value: category, onPick: setCategory })
    ),
    h(AmountField, { label: 'Amount per month', value: amount, onChange: setAmount, currency, autoFocus: editing }),
    editing ? h(DeleteRow, {
      label: 'Remove this budget',
      sub: 'Purchases stay — only the limit goes',
      armedLabel: 'Tap again to remove',
      onConfirm: () => onRemove(budget.category)
    }) : null
  );
}

function BudgetRow({ row, currency, daysLeft, onOpen }) {
  const pct = row.budget > 0 ? Math.min(100, (row.spent / row.budget) * 100) : 0;
  const left = row.budget - row.spent;
  const over = left < 0;
  const perDay = (!over && daysLeft > 0) ? left / daysLeft : 0;
  const showPerDay = perDay >= 1;

  return h('button', { className: 'budget-row', onClick: () => onOpen(row) },
    h('span', { className: 'budget-top' },
      h('span', { className: 'budget-name' },
        h('span', { className: 'budget-swatch', style: { background: categoryColor(row.category) } }),
        row.category
      ),
      h('span', { className: 'budget-figure' },
        h('b', null, fmtCurrency(row.spent, currency)), ` of ${fmtCurrency(row.budget, currency)}`)
    ),
    h('span', { className: 'budget-bar' },
      h('span', {
        className: `budget-bar-fill${over ? ' over' : ''}`,
        style: { width: `${over ? 100 : pct}%`, background: over ? undefined : categoryColor(row.category) }
      })
    ),
    h('span', { className: `budget-meta${over ? ' over' : ''}` },
      over
        ? `${fmtCurrency(-left, currency)} over this month`
        : `${fmtCurrency(left, currency)} left${showPerDay ? ` · ${fmtCurrency(perDay, currency)} a day for ${daysLeft} more ${daysLeft === 1 ? 'day' : 'days'}` : ' this month'}`)
  );
}

function SpendingPage({ data, setData, onAddEntry, pageIndex, setPageIndex }) {
  const currency = data.settings.currency;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [budgetModal, setBudgetModal] = useState(null);
  const [priceModal, setPriceModal] = useState(null);
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const [catFilter, setCatFilter] = useState(null);
  const [balanceSheet, setBalanceSheet] = useState(() => (balanceUpdateDue(data) ? 'prompt' : null));
  const [advanceEdit, setAdvanceEdit] = useState(null);

  useEffect(() => {
    if (balanceSheet === 'prompt') setPageIndex(0);
  }, []);

  const fin = useMonthFinancials(data, cursor);
  const nextCheck = useNextCheck(data, 0);
  const hasWallet = walletOn(data);
  const summary = useMemo(() => (hasWallet ? walletSummary(data) : null), [data, hasWallet]);
  const budgets = data.budgets || {};

  const now = new Date();
  const isCurrentMonth = cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();
  const daysThisMonth = fin.monthEnd.getDate();
  const daysElapsed = isCurrentMonth ? now.getDate() : daysThisMonth;
  const daysLeft = isCurrentMonth ? daysThisMonth - now.getDate() + 1 : 0;

  const purchases = useMemo(
    () => fin.oneTimePayments.slice().sort((a, b) => b.occDate.localeCompare(a.occDate)),
    [fin.oneTimePayments]
  );
  const spent = purchases.reduce((sum, o) => sum + o.amount, 0);
  const recurringTotal = fin.billOccurrences.reduce((sum, o) => sum + o.amount, 0);
  const income = fin.totalProjectedIncome;
  const advanceIn = fin.incomeOccurrences.filter((o) => o.sourceList === 'advances').reduce((sum, o) => sum + o.amount, 0);
  const leftToSpend = income - recurringTotal - spent;
  const hasIncome = income > 0;

  const monthKey = ymd(cursor).slice(0, 7);
  const prevCursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  const prevKey = ymd(prevCursor).slice(0, 7);
  const prevMonthName = MONTH_NAMES[prevCursor.getMonth()];
  const monthName = MONTH_NAMES[cursor.getMonth()];

  const byCategory = useMemo(() => categoryTotals(data, monthKey), [data, monthKey]);
  const prevTotals = useMemo(() => categoryTotals(data, prevKey), [data, prevKey]);
  const hasPrev = Object.keys(prevTotals).length > 0;

  const breakdown = useMemo(() => Object.keys(byCategory)
    .map((category) => {
      const amount = byCategory[category];
      const prev = prevTotals[category] || 0;
      return {
        category,
        amount,
        prev,
        delta: amount - prev,
        pct: spent > 0 ? Math.round((amount / spent) * 100) : 0
      };
    })
    .sort((a, b) => b.amount - a.amount), [byCategory, prevTotals, spent]);

  const budgeted = useMemo(() => Object.keys(budgets)
    .map((category) => ({ category, budget: Number(budgets[category]) || 0, spent: byCategory[category] || 0 }))
    .filter((r) => r.budget > 0)
    .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget)), [budgets, byCategory]);
  const budgetTotal = budgeted.reduce((sum, r) => sum + r.budget, 0);
  const budgetSpent = budgeted.reduce((sum, r) => sum + r.spent, 0);
  const unusedCategories = useMemo(() => ONE_TIME_PAYMENT_CATEGORIES
    .filter((c) => !budgets[c])
    .sort((a, b) => (byCategory[b] || 0) - (byCategory[a] || 0)), [budgets, byCategory]);

  const history = useMemo(() => spendingHistory(data, cursor), [data, cursor]);
  const lastMonthSpent = history.length > 1 ? history[history.length - 2].total : 0;
  const spendDelta = spent - lastMonthSpent;
  const suggestions = useMemo(() => (isCurrentMonth ? repeatBuys(data) : []), [data, isCurrentMonth]);

  function saveBudget(category, amount) {
    setData(logActivity(
      { ...data, budgets: { ...budgets, [category]: amount } },
      `Set ${category} budget to ${fmtCurrency(amount, currency)}`));
    setBudgetModal(null);
  }

  function removeBudget(category) {
    const next = { ...budgets };
    delete next[category];
    setData(logActivity({ ...data, budgets: next }, `Removed the ${category} budget`));
    setBudgetModal(null);
  }

  function changeMonth(delta) {
    setShowAllPurchases(false);
    setCatFilter(null);
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  const monthHeader = h(MonthHeader, { cursor, onChange: changeMonth });
  const logAdvance = () => { haptic('medium'); onAddEntry({ date: todayYmd(), type: 'advance' }); };
  const advancesBlock = h(AdvancesSection, { data, onOpen: setAdvanceEdit, onAdd: logAdvance, showEmpty: hasWallet });

  const balancePage = h(React.Fragment, null,
    h(WalletCard, {
      data,
      summary,
      nextCheck,
      due: !!summary && data.settings.walletMonthlyCheck !== false && summary.check.date.slice(0, 7) < todayYmd().slice(0, 7),
      onUpdate: () => { haptic('medium'); setBalanceSheet('manual'); }
    }),
    summary ? h(WalletActivity, { data, summary }) : null,
    advancesBlock
  );

  const pool = spent + Math.max(0, leftToSpend);
  const spentPct = pool > 0 ? Math.min(100, (spent / pool) * 100) : 0;
  const monthPct = (daysElapsed / daysThisMonth) * 100;
  const pace = (isCurrentMonth && hasIncome && pool > 0)
    ? (spentPct <= monthPct
        ? 'On track — you’re spending slower than the month is going by.'
        : 'Heads up — you’re spending faster than the month is going by.')
    : null;

  const hero = h('section', { className: `spend-hero${leftToSpend < 0 ? ' short' : ''}` },
    h('p', { className: 'spend-hero-label' },
      hasIncome ? (isCurrentMonth ? 'Left to spend this month' : `Left to spend in ${monthName}`) : `Spent in ${monthName}`),
    h('p', { className: 'spend-hero-value' }, fmtCurrency(hasIncome ? leftToSpend : spent, currency)),
    hasIncome ? h('div', { className: 'spend-bar' },
      h('span', { className: 'spend-bar-fill', style: { width: `${spentPct}%` } }),
      isCurrentMonth ? h('span', { className: 'spend-bar-pace', style: { left: `${monthPct}%` } }) : null
    ) : null,
    (hasIncome && isCurrentMonth) ? h('p', { className: 'spend-hero-rate' },
      leftToSpend > 0
        ? `That’s about ${fmtCurrency(leftToSpend / Math.max(1, daysLeft), currency)} a day for the ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left.`
        : 'This month’s money is used up — anything more comes out of savings.'
    ) : null,
    pace ? h('p', { className: 'spend-hero-pace' }, pace) : null,
    hasIncome ? null : h('p', { className: 'spend-hero-sub' }, 'Add an income source in Settings to see what’s left to spend.')
  );

  const heroMath = hasIncome ? h('section', { className: 'spend-section' },
    h(SectionHead, { title: 'How this month adds up', caption: `Everything scheduled for ${monthName}` }),
    h('div', { className: 'calc-list' },
      h('div', { className: 'calc-row' },
        h('span', null, advanceIn > 0 ? `Money coming in, including ${fmtCurrency(advanceIn, currency)} of advances` : 'Money coming in'),
        h('span', { className: 'calc-amt good' }, signedMoney(income, currency))),
      h('div', { className: 'calc-row' },
        h('span', null, 'Bills and subscriptions'),
        h('span', { className: 'calc-amt' }, signedMoney(-recurringTotal, currency))),
      h('div', { className: 'calc-row' },
        h('span', null, 'Already spent on purchases'),
        h('span', { className: 'calc-amt' }, signedMoney(-spent, currency))),
      h('div', { className: 'calc-row total' },
        h('span', null, 'Left to spend'),
        h('span', { className: 'calc-amt' }, fmtCurrency(leftToSpend, currency)))
    )
  ) : null;

  const resetsOn = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const budgetSection = h('section', { className: 'spend-section' },
    h(SectionHead, {
      title: 'Budgets',
      caption: budgeted.length > 0
        ? `Monthly limits · reset ${formatDate(resetsOn, data.settings)}`
        : 'A monthly limit per category',
      right: budgeted.length > 0
        ? h('span', { className: 'section-total' }, `${fmtCurrency(budgetSpent, currency)} of ${fmtCurrency(budgetTotal, currency)}`)
        : null
    }),
    budgeted.length === 0
      ? h('div', { className: 'info-banner' },
          'Set a limit for the things you buy often — groceries, gas, eating out. Every purchase you log fills the bar, so you can see what’s left without doing the math.')
      : h('div', { className: 'budget-list' },
          budgeted.map((row) => h(BudgetRow, {
            key: row.category, row, currency, daysLeft,
            onOpen: (r) => setBudgetModal({ category: r.category, amount: r.budget })
          }))
        ),
    unusedCategories.length > 0
      ? h('button', { className: 'add-row', onClick: () => setBudgetModal({}) },
          budgeted.length === 0 ? '+ Set your first budget' : '+ Add a budget')
      : null
  );

  const budgetPage = h(React.Fragment, null,
    monthHeader,
    hero,
    heroMath,
    budgetSection,
    hasWallet ? null : advancesBlock
  );

  const dueAgain = suggestions.filter((s) => s.gap > 0 && s.daysSince >= s.gap)[0];
  const buyAgain = suggestions.length === 0 ? null : h('section', { className: 'spend-section' },
    h(SectionHead, { title: 'Buy again', caption: 'Things you buy often — tap one to log it' }),
    h('div', { className: 'chip-row' },
      suggestions.map((s) =>
        h('button', {
          key: s.name,
          className: 'setup-chip',
          onClick: () => { haptic('light'); onAddEntry({ date: todayYmd(), preset: { name: s.name, category: s.category, amount: s.amount } }); }
        },
          h('span', { className: 'setup-chip-plus' }, '+'),
          `${s.name} · ${fmtCurrency(s.amount, currency)}`
        )
      )
    ),
    dueAgain ? h('p', { className: 'spend-note' },
      `You buy ${dueAgain.name} about every ${dueAgain.gap} ${dueAgain.gap === 1 ? 'day' : 'days'} — it’s been ${dueAgain.daysSince}.`) : null
  );

  function deltaNote(row) {
    if (!hasPrev) return null;
    if (row.prev === 0) return { text: 'new this month', dir: 'flat' };
    if (Math.abs(row.delta) < 1) return { text: `about the same as ${prevMonthName}`, dir: 'flat' };
    return {
      text: `${fmtCurrency(Math.abs(row.delta), currency)} ${row.delta > 0 ? 'more' : 'less'} than ${prevMonthName}`,
      dir: row.delta > 0 ? 'up' : 'down'
    };
  }

  const breakdownSection = purchases.length === 0 ? null : h('section', { className: 'spend-section' },
    h(SectionHead, {
      title: 'Where it went',
      caption: catFilter
        ? `Showing only ${catFilter} below · tap it again to show everything`
        : 'Tap a category to see just those purchases',
      right: h('span', { className: 'section-total' }, fmtCurrency(spent, currency))
    }),
    h('div', { className: 'cat-list' },
      breakdown.map((row) => {
        const note = deltaNote(row);
        const on = catFilter === row.category;
        return h('button', {
          key: row.category,
          className: `cat-row${on ? ' on' : ''}`,
          onClick: () => {
            haptic('light');
            setShowAllPurchases(false);
            setCatFilter(on ? null : row.category);
          }
        },
          h('span', { className: 'cat-top' },
            h('span', { className: 'cat-name' },
              h('span', { className: 'budget-swatch', style: { background: categoryColor(row.category) } }),
              row.category
            ),
            h('span', { className: 'cat-figure' }, fmtCurrency(row.amount, currency))
          ),
          h('span', { className: 'cat-bar' },
            h('span', {
              className: 'cat-bar-fill',
              style: { width: `${Math.max(2, row.pct)}%`, background: categoryColor(row.category) }
            })
          ),
          h('span', { className: 'cat-meta' },
            `${row.pct}% of your spending`,
            note ? h('span', { className: `cat-delta ${note.dir}` }, note.text) : null
          )
        );
      })
    )
  );

  const filtered = catFilter ? purchases.filter((o) => (o.category || 'Other') === catFilter) : purchases;
  const filteredTotal = catFilter ? filtered.reduce((sum, o) => sum + o.amount, 0) : spent;
  const visiblePurchases = showAllPurchases ? filtered : filtered.slice(0, PURCHASE_PREVIEW);
  const purchaseSection = h('section', { className: 'spend-section' },
    h(SectionHead, {
      title: 'Purchases',
      caption: catFilter ? `${catFilter} only` : `Everything you logged in ${monthName}`,
      right: purchases.length > 0 ? h('span', { className: 'section-total' }, fmtCurrency(filteredTotal, currency)) : null
    }),
    purchases.length === 0
      ? h('p', { className: 'empty-state' },
          isCurrentMonth
            ? 'Nothing logged yet this month. Tap + to log a coffee, a tank of gas, a grocery run — anything you spend outside your bills.'
            : 'Nothing was logged this month.')
      : h('div', { className: 'entry-list' },
          visiblePurchases.map((o) => h(EntryRow, {
            key: `${o.id}-${o.occDate}`,
            name: o.name,
            sub: o.name === o.category
              ? formatDate(parseYmd(o.occDate), data.settings, { weekday: true })
              : `${formatDate(parseYmd(o.occDate), data.settings)} · ${o.category || 'Other'}`,
            amount: occAmountLabel(o, currency),
            color: categoryColor(o.category || 'Other'),
            onClick: () => setPriceModal(o)
          }))
        ),
    filtered.length > PURCHASE_PREVIEW
      ? h('button', { className: 'att-more', onClick: () => setShowAllPurchases(!showAllPurchases) },
          showAllPurchases ? 'Show less' : `Show all ${filtered.length}`)
      : null
  );

  const spendingPage = h(React.Fragment, null,
    monthHeader,
    isCurrentMonth ? buyAgain : null,
    breakdownSection,
    purchaseSection
  );

  const historyMax = Math.max(...history.map((b) => b.total), 1);
  const hasHistory = history.some((b) => b.total > 0);
  const trendsPage = h(React.Fragment, null,
    monthHeader,
    h('section', { className: 'spend-section' },
      h(SectionHead, {
        title: 'Spending by month',
        caption: `Purchases you logged, over the ${SPEND_HISTORY_MONTHS} months up to ${monthName}`
      }),
      hasHistory
        ? h('div', { className: 'spend-bars' },
            history.map((b, i) => h('div', { key: b.key, className: `spend-bar-col${i === history.length - 1 ? ' current' : ''}` },
              h('span', { className: 'spend-bar-value' }, b.total > 0 ? fmtCompact(b.total, currency) : ''),
              h('span', { className: 'spend-bar-track' },
                h('span', { className: 'spend-bar-col-fill', style: { height: `${(b.total / historyMax) * 100}%` } })
              ),
              h('span', { className: 'spend-bar-label' }, b.label)
            ))
          )
        : h('p', { className: 'empty-state' }, 'Once you’ve logged a few purchases, this shows how each month compares.')
    ),
    h('section', { className: 'spend-section' },
      h(SectionHead, { title: `${monthName} in numbers` }),
      h('div', { className: 'spend-stats' },
        h('div', { className: 'spend-stat' },
          h('span', { className: 'spend-stat-label' }, 'Per day'),
          h('span', { className: 'spend-stat-value' }, fmtCurrency(spent / Math.max(1, daysElapsed), currency)),
          h('span', { className: 'spend-stat-sub' }, 'on purchases')
        ),
        h('div', { className: 'spend-stat' },
          h('span', { className: 'spend-stat-label' }, `vs ${prevMonthName}`),
          h('span', { className: `spend-stat-value ${spendDelta > 0 ? 'bad' : 'good'}` },
            `${spendDelta >= 0 ? '+' : '−'}${fmtCurrency(Math.abs(spendDelta), currency)}`),
          h('span', { className: 'spend-stat-sub' }, spendDelta > 0 ? 'more spent' : 'less spent')
        ),
        h('div', { className: 'spend-stat' },
          h('span', { className: 'spend-stat-label' }, 'Typical purchase'),
          h('span', { className: 'spend-stat-value' }, fmtCurrency(spent / Math.max(1, purchases.length), currency)),
          h('span', { className: 'spend-stat-sub' }, 'average')
        ),
        h('div', { className: 'spend-stat' },
          h('span', { className: 'spend-stat-label' }, 'Purchases'),
          h('span', { className: 'spend-stat-value' }, purchases.length),
          h('span', { className: 'spend-stat-sub' }, 'logged')
        )
      )
    )
  );

  const pages = [
    hasWallet ? { id: 'balance', label: 'Balance', body: balancePage } : null,
    { id: 'budget', label: 'Budget', body: budgetPage },
    { id: 'spending', label: 'Spending', body: spendingPage },
    { id: 'trends', label: 'Trends', body: trendsPage }
  ].filter(Boolean);

  return h('div', { className: 'spend-page' },
    h(Pager, { pages, index: Math.min(pageIndex, pages.length - 1), onIndex: setPageIndex }),
    budgetModal ? h(BudgetModal, {
      categories: budgetModal.category ? [budgetModal.category] : unusedCategories,
      budget: budgetModal,
      currency,
      onSave: saveBudget,
      onRemove: removeBudget,
      onClose: () => setBudgetModal(null)
    }) : null,
    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null,
    balanceSheet ? h(BalanceSheet, {
      data,
      setData,
      prompted: balanceSheet === 'prompt',
      onClose: () => setBalanceSheet(null)
    }) : null,
    advanceEdit ? h(AdvanceSheet, { data, setData, advance: advanceEdit, onClose: () => setAdvanceEdit(null) }) : null
  );
}
