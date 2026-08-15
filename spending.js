
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

function purchaseEntries(data) {
  return (data.oneTimeEntries || []).filter((e) => e.oneTimeKind === 'payment' && e.date);
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

function BudgetModal({ categories, budget, onSave, onRemove, onClose }) {
  const overlay = useOverlayDismiss(onClose);
  const [category, setCategory] = useState(budget.category || categories[0] || 'Other');
  const [amount, setAmount] = useState(budget.amount ? String(budget.amount) : '');
  const editing = !!budget.category;

  function save() {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) return;
    haptic('success');
    onSave(category, value);
  }

  return h('div', Object.assign({ className: 'modal-overlay as-window' }, overlay),
    h('div', { className: 'modal-content as-window' },
      h('div', { className: 'modal-window-head' },
        h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px' } },
          editing ? `${budget.category} — monthly budget` : 'New monthly budget'),
        h('button', { className: 'modal-x', onClick: onClose, 'aria-label': 'Close' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
            h('path', { d: 'M6 6l12 12M18 6L6 18' })
          )
        )
      ),

      editing ? null : h('div', { className: 'setup-field' },
        h('label', null, 'Category'),
        h('select', { value: category, onChange: (e) => setCategory(e.target.value) },
          categories.map((c) => h('option', { key: c, value: c }, c)))
      ),

      h('div', { className: 'setup-field' },
        h('label', null, 'Amount per month'),
        h('input', {
          type: 'number',
          inputMode: 'decimal',
          placeholder: '0',
          value: amount,
          onChange: (e) => setAmount(e.target.value)
        }),
        h('p', { className: 'setup-hint' },
          'Budgets cover day-to-day spending only — bills and subscriptions are tracked on the Bills tab.')
      ),

      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        editing
          ? h('button', { className: 'danger-text', onClick: () => { haptic('heavy'); onRemove(budget.category); } }, 'Remove')
          : h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'primary', onClick: save }, 'Save')
      )
    )
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
        `${fmtCurrency(row.spent, currency)} of ${fmtCurrency(row.budget, currency)}`)
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
        : `${fmtCurrency(left, currency)} left${showPerDay ? ` \u00b7 ${fmtCurrency(perDay, currency)} a day for ${daysLeft} more ${daysLeft === 1 ? 'day' : 'days'}` : ' this month'}`)
  );
}

function SpendingPage({ data, setData, isMobile, onAddEntry }) {
  const currency = data.settings.currency;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [budgetModal, setBudgetModal] = useState(null);
  const [priceModal, setPriceModal] = useState(null);
  const [showAllPurchases, setShowAllPurchases] = useState(false);

  const fin = useMonthFinancials(data, cursor);
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
  const leftForLife = income - recurringTotal - spent;
  const hasIncome = income > 0;

  const byCategory = useMemo(() => {
    const map = {};
    purchases.forEach((o) => {
      const key = o.category || 'Other';
      map[key] = (map[key] || 0) + o.amount;
    });
    return map;
  }, [purchases]);

  const budgetRows = useMemo(() => {
    const keys = new Set([...Object.keys(budgets), ...Object.keys(byCategory)]);
    return [...keys]
      .map((category) => ({
        category,
        budget: Number(budgets[category]) || 0,
        spent: byCategory[category] || 0
      }))
      .sort((a, b) => {
        if (!!a.budget !== !!b.budget) return a.budget ? -1 : 1;
        if (a.budget && b.budget) return (b.spent / b.budget) - (a.spent / a.budget);
        return b.spent - a.spent;
      });
  }, [budgets, byCategory]);

  const budgeted = budgetRows.filter((r) => r.budget > 0);
  const unbudgeted = budgetRows.filter((r) => r.budget <= 0);
  const budgetTotal = budgeted.reduce((sum, r) => sum + r.budget, 0);
  const budgetSpent = budgeted.reduce((sum, r) => sum + r.spent, 0);

  const history = useMemo(() => spendingHistory(data, cursor), [data, cursor]);
  const lastMonthSpent = history.length > 1 ? history[history.length - 2].total : 0;
  const spendDelta = spent - lastMonthSpent;
  const topCategory = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a])[0];
  const suggestions = useMemo(() => (isCurrentMonth ? repeatBuys(data) : []), [data, isCurrentMonth]);

  const unusedCategories = ONE_TIME_PAYMENT_CATEGORIES.filter((c) => !budgets[c]);

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
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const pool = spent + Math.max(0, leftForLife);
  const spentPct = pool > 0 ? Math.min(100, (spent / pool) * 100) : 0;
  const monthPct = (daysElapsed / daysThisMonth) * 100;
  const pace = (isCurrentMonth && hasIncome && pool > 0)
    ? (spentPct <= monthPct
        ? `You're pacing under your money for the month.`
        : `You're spending faster than the month is passing.`)
    : null;

  const hero = h('section', { className: `spend-hero${leftForLife < 0 ? ' short' : ''}` },
    h('p', { className: 'spend-hero-label' },
      hasIncome ? (isCurrentMonth ? 'Left for daily life' : 'Was left for daily life') : 'Spent this month'),
    h('p', { className: 'spend-hero-value' },
      fmtCurrency(hasIncome ? leftForLife : spent, currency)),
    h('p', { className: 'spend-hero-sub' },
      hasIncome
        ? `${fmtCurrency(income, currency)} in, ${fmtCurrency(recurringTotal, currency)} of bills, ${fmtCurrency(spent, currency)} spent`
        : `${purchases.length} ${purchases.length === 1 ? 'purchase' : 'purchases'} logged · add an income source to see what's left`),
    hasIncome ? h('div', { className: 'spend-bar' },
      h('span', { className: 'spend-bar-fill', style: { width: `${spentPct}%` } }),
      isCurrentMonth ? h('span', { className: 'spend-bar-pace', style: { left: `${monthPct}%` } }) : null
    ) : null,
    (hasIncome && isCurrentMonth) ? h('p', { className: 'spend-hero-rate' },
      leftForLife > 0
        ? `${fmtCurrency(leftForLife / Math.max(1, daysLeft), currency)} a day for the ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`
        : 'This month is already spent — anything more comes out of savings'
    ) : null,
    pace ? h('p', { className: 'spend-note', style: { margin: 0 } }, pace) : null
  );

  const quickLog = h('div', { className: 'spend-quick' },
    h('button', { className: 'setup-chip custom', onClick: () => { haptic('medium'); onAddEntry({ date: todayYmd() }); } },
      h('span', { className: 'setup-chip-plus' }, '+'), 'Log a purchase'),
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
  );

  const dueAgain = suggestions.filter((s) => s.gap > 0 && s.daysSince >= s.gap)[0];
  const suggestionHint = dueAgain
    ? h('p', { className: 'spend-note' },
        `You buy ${dueAgain.name} about every ${dueAgain.gap} ${dueAgain.gap === 1 ? 'day' : 'days'} \u2014 it has been ${dueAgain.daysSince}.`)
    : null;

  const resetsOn = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const budgetSection = h('section', { className: 'spend-section' },
    h('div', { className: 'row-between' },
      h('div', null,
        h('p', { className: 'section-title', style: { margin: 0 } }, 'Monthly budgets'),
        h('p', { className: 'spend-caption' },
          budgeted.length > 0
            ? `${monthLabel} \u00b7 starts over ${formatDate(resetsOn, data.settings)}`
            : 'One amount per category, for a whole month')
      ),
      budgeted.length > 0
        ? h('span', { className: 'spend-section-total' },
            `${fmtCurrency(budgetSpent, currency)} of ${fmtCurrency(budgetTotal, currency)}`)
        : null
    ),
    budgeted.length === 0
      ? h('div', { className: 'info-banner', style: { marginTop: '8px' } },
          h('p', { style: { margin: 0, fontSize: '13px' } },
            'Set a budget for the things you buy often — groceries, gas, eating out. Every purchase you log fills the bar, so you can see what is left without doing the math.')
        )
      : h('div', { className: 'budget-list' },
          budgeted.map((row) => h(BudgetRow, {
            key: row.category, row, currency, daysLeft,
            onOpen: (r) => setBudgetModal({ category: r.category, amount: r.budget })
          }))
        ),
    unusedCategories.length > 0
      ? h('button', { className: 'spend-add-budget', onClick: () => setBudgetModal({}) },
          budgeted.length === 0 ? '+ Set your first budget' : '+ Add another budget')
      : null,
    unbudgeted.length > 0
      ? h('div', { className: 'spend-unbudgeted' },
          h('p', { className: 'spend-unbudgeted-head' }, 'No budget yet'),
          unbudgeted.map((row) => h('button', {
            key: row.category,
            className: 'spend-unbudgeted-row',
            onClick: () => setBudgetModal({ category: row.category, amount: 0 })
          },
            h('span', { className: 'budget-swatch', style: { background: categoryColor(row.category) } }),
            h('span', { className: 'spend-unbudgeted-name' }, row.category),
            h('span', { className: 'spend-unbudgeted-amt' }, fmtCurrency(row.spent, currency)),
            h('span', { className: 'att-chevron' }, '›')
          ))
        )
      : null
  );

  const visiblePurchases = showAllPurchases ? purchases : purchases.slice(0, PURCHASE_PREVIEW);
  const purchaseSection = h('section', { className: 'spend-section' },
    h('div', { className: 'row-between' },
      h('p', { className: 'section-title', style: { margin: 0 } }, 'Purchases'),
      h('span', { className: 'spend-section-total' }, fmtCurrency(spent, currency))
    ),
    purchases.length === 0
      ? h('p', { className: 'empty-state' },
          isCurrentMonth
            ? 'Nothing logged yet this month. Log a coffee, a tank of gas, a grocery run — anything you spend outside your bills.'
            : 'Nothing was logged this month.')
      : h('div', { className: 'spend-rows' },
          visiblePurchases.map((o) => h('button', {
            key: `${o.id}-${o.occDate}`,
            className: 'spend-row',
            onClick: () => setPriceModal(o)
          },
            h('span', { className: 'budget-swatch', style: { background: categoryColor(o.category || 'Other') } }),
            h('span', { className: 'spend-row-text' },
              h('span', { className: 'spend-row-name' }, o.name),
              h('span', { className: 'spend-row-sub' },
                o.name === o.category
                  ? formatDate(parseYmd(o.occDate), data.settings)
                  : `${formatDate(parseYmd(o.occDate), data.settings)} · ${o.category || 'Other'}`)
            ),
            h('span', { className: 'spend-row-amt' }, occAmountLabel(o, currency))
          )),
          purchases.length > PURCHASE_PREVIEW
            ? h('button', { className: 'att-more', onClick: () => setShowAllPurchases(!showAllPurchases) },
                showAllPurchases ? 'Show less' : `Show all ${purchases.length}`)
            : null
        )
  );

  const historyMax = Math.max(...history.map((b) => b.total), 1);
  const hasHistory = history.some((b) => b.total > 0);
  const trendSection = !hasHistory ? null : h('section', { className: 'spend-section' },
    h('div', null,
      h('p', { className: 'section-title', style: { margin: 0 } }, 'Day-to-day spending by month'),
      h('p', { className: 'spend-caption' }, `Totals for the last ${SPEND_HISTORY_MONTHS} months`)
    ),
    h('div', { className: 'spend-bars' },
      history.map((b, i) => h('div', { key: b.key, className: `spend-bar-col${i === history.length - 1 ? ' current' : ''}` },
        h('span', { className: 'spend-bar-value' }, b.total > 0 ? fmtCompact(b.total, currency) : ''),
        h('span', { className: 'spend-bar-track' },
          h('span', { className: 'spend-bar-col-fill', style: { height: `${(b.total / historyMax) * 100}%` } })
        ),
        h('span', { className: 'spend-bar-label' }, b.label)
      ))
    ),
    h('div', { className: 'spend-stats' },
      h('div', { className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, 'Per day'),
        h('span', { className: 'spend-stat-value' }, fmtCurrency(spent / Math.max(1, daysElapsed), currency))
      ),
      h('div', { className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, 'vs last month'),
        h('span', {
          className: 'spend-stat-value',
          style: { color: spendDelta > 0 ? 'var(--late-red)' : 'var(--text-success)' }
        }, `${spendDelta >= 0 ? '+' : '-'}${fmtCurrency(Math.abs(spendDelta), currency)}`)
      ),
      h('div', { className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, 'Top category'),
        h('span', { className: 'spend-stat-value small' }, topCategory || '—')
      ),
      h('div', { className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, 'Purchases'),
        h('span', { className: 'spend-stat-value' }, purchases.length)
      )
    )
  );

  const modals = h(React.Fragment, null,
    budgetModal ? h(BudgetModal, {
      categories: budgetModal.category ? [budgetModal.category] : unusedCategories,
      budget: budgetModal,
      onSave: saveBudget,
      onRemove: removeBudget,
      onClose: () => setBudgetModal(null)
    }) : null,
    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null
  );

  const monthHeader = h('div', { className: 'home-month-header' },
    h('button', { onClick: () => changeMonth(-1), 'aria-label': 'Previous month' }, '<'),
    h('h1', { className: 'home-month-title' }, monthLabel),
    h('button', { onClick: () => changeMonth(1), 'aria-label': 'Next month' }, '>')
  );

  if (isMobile) {
    return h('div', { className: 'spend-page' },
      monthHeader,
      hero,
      isCurrentMonth ? quickLog : null,
      isCurrentMonth ? suggestionHint : null,
      budgetSection,
      purchaseSection,
      trendSection,
      modals
    );
  }

  return h('div', { className: 'spend-page' },
    monthHeader,
    h('div', { className: 'spend-desktop' },
      h('div', null,
        hero,
        isCurrentMonth ? quickLog : null,
        isCurrentMonth ? suggestionHint : null,
        budgetSection
      ),
      h('div', null, purchaseSection, trendSection)
    ),
    modals
  );
}
