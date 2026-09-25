
const BALANCE_HISTORY = 24;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function nextPaycheckAfter(data, dateStr) {
  const start = parseYmd(dateStr);
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 400);
  const removed = data.removedOccurrences || {};
  let best = null;
  data.incomeSources.forEach((e) => {
    const next = expandEntry(e, start, end).find((occ) => !removed[`${e.id}|${occ.occDate}`]);
    if (next && (!best || next.occDate < best)) best = next.occDate;
  });
  return best;
}

function advanceRepayDate(data, a) {
  if (a.repayFromCheck) return nextPaycheckAfter(data, a.date) || a.repayDate || null;
  return a.repayDate || null;
}

function advanceCost(a, repayDate) {
  const amount = Number(a.amount) || 0;
  if (a.feeType === 'flat') return round2(a.fee);
  if (a.feeType !== 'rate') return 0;
  const rate = (Number(a.rate) || 0) / 100;
  if (a.rateBasis !== 'apr') return round2(amount * rate);
  const days = Math.max(1, daysBetween(parseYmd(a.date), parseYmd(repayDate || a.date)));
  return round2(amount * rate * days / 365);
}

function advanceTotal(a, repayDate) {
  return round2((Number(a.amount) || 0) + advanceCost(a, repayDate));
}

const _advanceCache = new WeakMap();

function getAdvanceEntries(data) {
  if (!data.advances || data.advances.length === 0) return [];
  const cached = _advanceCache.get(data);
  if (cached) return cached;
  const entries = data.advances.map((a) => {
    const date = advanceRepayDate(data, a);
    if (!date) return null;
    return {
      id: `adv-${a.id}`,
      advanceId: a.id,
      name: `${a.name || 'Advance'} payback`,
      amount: advanceTotal(a, date),
      amountMin: 0,
      amountMax: 0,
      useAmountRange: false,
      date,
      dateEnd: '',
      useDateRange: false,
      freq: 'none',
      category: 'Advance',
      autoRepay: !!a.repayFromCheck
    };
  }).filter(Boolean);
  _advanceCache.set(data, entries);
  return entries;
}

function isAutoAdvance(data, entryId) {
  return getAdvanceEntries(data).some((e) => e.id === entryId && e.autoRepay);
}

function advanceInflows(data, rangeStart, rangeEnd) {
  const from = ymd(rangeStart);
  const to = ymd(rangeEnd);
  return (data.advances || [])
    .filter((a) => a.date >= from && a.date <= to)
    .map((a) => ({
      id: `advin-${a.id}`,
      advanceId: a.id,
      name: `${a.name || 'Advance'} advance`,
      amount: round2(a.amount),
      date: a.date,
      occDate: a.date,
      freq: 'none',
      category: 'Advance',
      kind: 'income',
      sourceList: 'advances',
      isRange: false,
      hasOverride: false
    }));
}

function advanceStatus(data, a) {
  const repayDate = advanceRepayDate(data, a);
  const total = advanceTotal(a, repayDate);
  const todayStr = todayYmd();
  const paidBack = repayDate
    ? (a.repayFromCheck ? repayDate <= todayStr : isPaid(data, `adv-${a.id}`, repayDate))
    : false;
  return {
    repayDate,
    total,
    cost: round2(total - (Number(a.amount) || 0)),
    paidBack,
    late: !paidBack && !!repayDate && repayDate < todayStr
  };
}

function lastBalance(data) {
  const checks = (data.wallet && data.wallet.checks) || [];
  return checks[0] || null;
}

function walletMoves(data, check) {
  const todayStr = todayYmd();
  const dayAt = (d) => parseYmd(d).getTime();
  const after = (date, stamp) => date > check.date || (date === check.date && (Number(stamp) || 0) > check.at);
  const paidAt = data.paidAt || {};
  const coverLog = data.coverLog || {};
  const removed = data.removedOccurrences || {};
  const moves = [];

  const incomeStart = parseYmd(check.date);
  incomeStart.setDate(incomeStart.getDate() + 1);
  const today = parseYmd(todayStr);
  if (incomeStart <= today) {
    expandAll(data.incomeSources, 'income', incomeStart, today, data).forEach((o) => {
      moves.push({ key: `${o.id}|${o.occDate}`, name: o.name, date: o.occDate, at: dayAt(o.occDate), amount: o.amount, kind: 'Paycheck' });
    });
  }

  data.oneTimeEntries.forEach((e) => {
    if (!e.date) return;
    const key = `${e.id}|${e.date}`;
    if (e.oneTimeKind === 'income') {
      if (e.date > todayStr || !after(e.date, e.loggedAt)) return;
      moves.push({ key, name: e.name, date: e.date, at: dayAt(e.date), amount: resolvedAmount(data, e, e.date), kind: 'Income' });
    } else if (e.oneTimeKind === 'payment') {
      if (!data.paidHistory[key] || !after(e.date, paidAt[key])) return;
      moves.push({ key, name: e.name, date: e.date, at: dayAt(e.date), amount: -resolvedAmount(data, e, e.date), kind: 'Purchase' });
    }
  });

  const bills = {};
  getAllBillLikeEntries(data).forEach((e) => { bills[e.id] = e; });
  const splitKey = (key) => {
    const sep = key.lastIndexOf('|');
    return { entry: bills[key.slice(0, sep)], occDate: key.slice(sep + 1) };
  };

  Object.keys(paidAt).forEach((key) => {
    const at = Number(paidAt[key]) || 0;
    if (at <= check.at || !data.paidHistory[key] || removed[key]) return;
    const { entry, occDate } = splitKey(key);
    if (!entry || entry.autoRepay) return;
    const cover = coverLog[key];
    const credit = cover && cover.at <= check.at ? Number(cover.amount) || 0 : 0;
    const amount = Math.max(0, resolvedAmount(data, entry, occDate) - credit);
    if (amount > 0) moves.push({ key, name: entry.name, date: ymd(new Date(at)), at, amount: -amount, kind: 'Bill paid' });
  });

  Object.keys(data.covered || {}).forEach((key) => {
    const log = coverLog[key];
    if (!log || !(log.at > check.at) || data.paidHistory[key] || removed[key]) return;
    const { entry, occDate } = splitKey(key);
    if (!entry) return;
    const amount = Math.min(Number(data.covered[key]) || 0, resolvedAmount(data, entry, occDate));
    if (amount > 0) moves.push({ key: `${key}|part`, name: entry.name, date: ymd(new Date(log.at)), at: log.at, amount: -amount, kind: 'Part payment' });
  });

  (data.advances || []).forEach((a) => {
    if (a.date <= todayStr && after(a.date, a.createdAt)) {
      moves.push({ key: `advin-${a.id}`, name: `${a.name || 'Advance'} advance`, date: a.date, at: dayAt(a.date), amount: round2(a.amount), kind: 'Advance', advanceId: a.id });
    }
    if (!a.repayFromCheck) return;
    const repayDate = advanceRepayDate(data, a);
    if (repayDate && repayDate > check.date && repayDate <= todayStr) {
      moves.push({ key: `adv-${a.id}`, name: `${a.name || 'Advance'} payback`, date: repayDate, at: dayAt(repayDate) + 1, amount: -advanceTotal(a, repayDate), kind: 'Taken from paycheck', advanceId: a.id });
    }
  });

  return moves.sort((a, b) => b.at - a.at);
}

function walletSummary(data) {
  const check = lastBalance(data);
  if (!check) return null;
  const moves = walletMoves(data, check);
  const moneyIn = moves.filter((m) => m.amount > 0).reduce((sum, m) => sum + m.amount, 0);
  const moneyOut = moves.filter((m) => m.amount < 0).reduce((sum, m) => sum - m.amount, 0);
  return { check, moves, moneyIn, moneyOut, balance: round2(check.amount + moneyIn - moneyOut) };
}

function walletOn(data) {
  return data.settings.walletEnabled !== false;
}

function balanceUpdateDue(data) {
  if (!walletOn(data) || data.settings.walletMonthlyCheck === false) return false;
  const todayStr = todayYmd();
  if (data.wallet && data.wallet.snoozed === todayStr) return false;
  const last = lastBalance(data);
  return !last || last.date.slice(0, 7) < todayStr.slice(0, 7);
}

function recordBalance(data, amount) {
  const summary = walletSummary(data);
  const check = {
    id: uid(),
    at: Date.now(),
    date: todayYmd(),
    amount: round2(amount),
    expected: summary ? summary.balance : null
  };
  const checks = [check, ...((data.wallet && data.wallet.checks) || [])].slice(0, BALANCE_HISTORY);
  return logActivity(
    { ...data, wallet: { ...(data.wallet || {}), checks, snoozed: null } },
    `Updated balance to ${fmtCurrency(check.amount, data.settings.currency)}`
  );
}

function snoozeBalancePrompt(data) {
  return { ...data, wallet: { ...(data.wallet || { checks: [] }), snoozed: todayYmd() } };
}

function resetSpendingHistory(data) {
  const gone = new Set(purchaseEntries(data).map((e) => `${e.id}|${e.date}`));
  const keep = (map) => {
    const out = {};
    Object.keys(map || {}).forEach((k) => { if (!gone.has(k)) out[k] = map[k]; });
    return out;
  };
  return logActivity({
    ...data,
    oneTimeEntries: data.oneTimeEntries.filter((e) => e.oneTimeKind !== 'payment'),
    paidHistory: keep(data.paidHistory),
    paidAt: keep(data.paidAt),
    overrides: keep(data.overrides),
    forcedLate: keep(data.forcedLate),
    dismissedLate: keep(data.dismissedLate),
    deferred: keep(data.deferred),
    covered: keep(data.covered),
    coverLog: keep(data.coverLog),
    removedOccurrences: keep(data.removedOccurrences),
    wallet: { checks: [], snoozed: null }
  }, 'Reset spending history');
}

function signedMoney(n, currency) {
  if (Math.abs(n) < 0.005) return fmtCurrency(0, currency);
  return `${n > 0 ? '+' : '−'}${fmtCurrency(Math.abs(n), currency)}`;
}

function balanceDiffText(diff, currency) {
  if (Math.abs(diff) < 0.005) return { text: 'Exactly what the app thought', tone: 'good' };
  return diff > 0
    ? { text: `${fmtCurrency(diff, currency)} more than the app thought`, tone: 'good' }
    : { text: `${fmtCurrency(-diff, currency)} less than the app thought — something may not be logged yet`, tone: 'bad' };
}

function BalanceSheet({ data, setData, prompted, onClose }) {
  const currency = data.settings.currency;
  const summary = useMemo(() => walletSummary(data), [data]);
  const [amount, setAmount] = useState('');
  const value = parseFloat(amount);
  const canSave = amount !== '' && !isNaN(value);
  const diff = (summary && canSave) ? round2(value - summary.balance) : null;
  const note = diff === null ? null : balanceDiffText(diff, currency);

  function save() {
    if (!canSave) return;
    haptic('success');
    setData(recordBalance(data, value));
    onClose();
  }

  function later() {
    haptic('light');
    setData(snoozeBalancePrompt(data));
    onClose();
  }

  return h(Sheet, {
    title: !summary ? 'What’s your balance?' : prompted ? 'New month — update your balance' : 'Update your balance',
    sub: formatDate(new Date(), data.settings, { weekday: true }),
    onClose: prompted ? later : onClose,
    foot: h('div', { className: 'sheet-actions' },
      prompted ? h('button', { onClick: later }, 'Not now') : null,
      h('button', { className: 'primary', onClick: save, disabled: !canSave },
        canSave ? `Save ${fmtCurrency(value, currency)}` : 'Save')
    )
  },
    h('p', { className: 'sheet-lead' },
      'How much money do you have right now? Add up your bank account and any cash. Include any paycheck that has already landed.'),
    h(AmountField, { value: amount, onChange: setAmount, currency, autoFocus: true }),
    summary ? h('div', { className: 'calc-list' },
      h('div', { className: 'calc-row' },
        h('span', null, 'The app thinks you have'),
        h('span', { className: 'calc-amt' }, fmtCurrency(summary.balance, currency))
      ),
      note ? h('div', { className: `calc-row note ${note.tone}` }, h('span', null, note.text)) : null
    ) : null,
    h('p', { className: 'setup-hint' },
      summary
        ? (prompted
            ? 'A new month started, so the app is checking its math against your real balance. You can turn this off in Settings.'
            : 'Whatever you enter becomes your new starting point.')
        : 'After this, paychecks add to your balance and bills and purchases come out of it. You can turn this off in Settings.')
  );
}

function WalletCard({ data, summary, nextCheck, due, onUpdate }) {
  const currency = data.settings.currency;
  if (!summary) {
    return h('section', { className: 'wallet-card' },
      h('p', { className: 'wallet-label' }, 'Wallet'),
      h('p', { className: 'wallet-empty-title' }, 'How much money do you have?'),
      h('p', { className: 'wallet-sub' },
        'Enter your balance once. After that, paychecks add to it and bills and purchases come out of it.'),
      h('div', { className: 'wallet-actions' },
        h('button', { className: 'wallet-btn solid', onClick: onUpdate }, 'Enter my balance'))
    );
  }

  const balance = summary.balance;
  const billsDue = nextCheck ? nextCheck.due : 0;
  const afterBills = balance - billsDue;
  const payday = nextCheck && nextCheck.check
    ? `your ${formatDate(parseYmd(nextCheck.check.occDate), data.settings)} paycheck`
    : 'your next paycheck';

  return h('section', { className: `wallet-card${balance < 0 ? ' short' : ''}` },
    h('div', { className: 'wallet-top' },
      h('p', { className: 'wallet-label' }, 'Available now'),
      due ? h('span', { className: 'wallet-pill' }, 'Update due') : null
    ),
    h('p', { className: 'wallet-balance' }, fmtCurrency(balance, currency)),
    h('p', { className: 'wallet-sub' }, 'The money in your account right now, as far as the app knows'),
    billsDue > 0 ? h('p', { className: `wallet-safe${afterBills < 0 ? ' short' : ''}` },
      afterBills >= 0
        ? `After the ${fmtCurrency(billsDue, currency)} of bills due before ${payday}, you’ll have ${fmtCurrency(afterBills, currency)} left.`
        : `You’re ${fmtCurrency(-afterBills, currency)} short of the ${fmtCurrency(billsDue, currency)} of bills due before ${payday}.`) : null,
    h('div', { className: 'wallet-actions' },
      h('button', { className: `wallet-btn${due ? ' solid' : ''}`, onClick: onUpdate }, 'Update balance')
    )
  );
}

const ACTIVITY_PREVIEW = 8;

function WalletActivity({ data, summary }) {
  const currency = data.settings.currency;
  const [showAll, setShowAll] = useState(false);
  const { check, moves, moneyIn, moneyOut, balance } = summary;
  const checkDate = formatDate(parseYmd(check.date), data.settings);
  const checks = (data.wallet && data.wallet.checks) || [];
  const visible = showAll ? moves : moves.slice(0, ACTIVITY_PREVIEW);

  return h(React.Fragment, null,
    h('section', { className: 'spend-section' },
      h(SectionHead, { title: 'How your balance adds up' }),
      h('div', { className: 'calc-list' },
        h('div', { className: 'calc-row' },
          h('span', null, `Your balance on ${checkDate}`),
          h('span', { className: 'calc-amt' }, fmtCurrency(check.amount, currency))),
        h('div', { className: 'calc-row' },
          h('span', null, 'Money in since then'),
          h('span', { className: 'calc-amt good' }, signedMoney(moneyIn, currency))),
        h('div', { className: 'calc-row' },
          h('span', null, 'Money out since then'),
          h('span', { className: 'calc-amt' }, signedMoney(-moneyOut, currency))),
        h('div', { className: 'calc-row total' },
          h('span', null, 'Available now'),
          h('span', { className: 'calc-amt' }, fmtCurrency(balance, currency)))
      )
    ),
    h('section', { className: 'spend-section' },
      h(SectionHead, {
        title: 'What changed',
        caption: moves.length === 0 ? `Nothing has moved since ${checkDate}` : `Since ${checkDate}, newest first`
      }),
      moves.length === 0
        ? h('p', { className: 'empty-state' }, 'Paychecks, bills you mark paid and purchases you log will show up here.')
        : h('div', { className: 'entry-list' },
            visible.map((m) => h(EntryRow, {
              key: m.key,
              name: m.name,
              sub: `${m.kind} · ${formatDate(parseYmd(m.date), data.settings)}`,
              amount: signedMoney(m.amount, currency),
              positive: m.amount > 0,
              color: m.amount > 0 ? 'var(--text-success)' : 'var(--border-secondary)'
            }))
          ),
      moves.length > ACTIVITY_PREVIEW
        ? h('button', { className: 'att-more', onClick: () => setShowAll(!showAll) },
            showAll ? 'Show less' : `Show all ${moves.length}`)
        : null
    ),
    checks.length > 1 ? h('section', { className: 'spend-section' },
      h(SectionHead, { title: 'Past balance updates', caption: 'What you had, and how close the app was' }),
      h('div', { className: 'entry-list' },
        checks.map((c) => {
          const diff = c.expected === null || c.expected === undefined ? null : round2(c.amount - c.expected);
          return h(EntryRow, {
            key: c.id,
            name: formatDate(parseYmd(c.date), data.settings, { year: true }),
            sub: diff === null
              ? 'Your first balance'
              : Math.abs(diff) < 0.005 ? 'Matched the app exactly' : `${fmtCurrency(Math.abs(diff), currency)} ${diff > 0 ? 'more' : 'less'} than expected`,
            amount: fmtCurrency(c.amount, currency),
            color: diff === null || Math.abs(diff) < 1 ? 'var(--text-success)' : diff > 0 ? 'var(--accent)' : 'var(--text-warning)'
          });
        })
      )
    ) : null
  );
}

function AdvancesSection({ data, onOpen, onAdd, showEmpty }) {
  const currency = data.settings.currency;
  const [showPaid, setShowPaid] = useState(false);
  const rows = useMemo(() => (data.advances || [])
    .map((a) => ({ a, s: advanceStatus(data, a) }))
    .sort((x, y) => (x.s.repayDate || '').localeCompare(y.s.repayDate || '')), [data]);
  const open = rows.filter((r) => !r.s.paidBack);
  const paid = rows.filter((r) => r.s.paidBack).reverse();
  if (rows.length === 0 && !showEmpty) return null;
  const owed = open.reduce((sum, r) => sum + r.s.total, 0);

  const row = ({ a, s }) => h(EntryRow, {
    key: a.id,
    name: a.name || 'Advance',
    sub: s.paidBack
      ? `Paid back ${formatDate(parseYmd(s.repayDate), data.settings)}`
      : s.late
        ? `Was due ${formatDate(parseYmd(s.repayDate), data.settings)} · not marked paid back`
        : a.repayFromCheck
          ? `Comes out of your ${formatDate(parseYmd(s.repayDate), data.settings)} paycheck`
          : `Pay back by ${formatDate(parseYmd(s.repayDate), data.settings)}`,
    note: s.cost > 0 && !s.paidBack ? `${fmtCurrency(a.amount, currency)} + ${fmtCurrency(s.cost, currency)} fee` : null,
    amount: fmtCurrency(s.total, currency),
    color: s.late ? 'var(--late-red)' : getEntryColor({ sourceList: 'advances' }, data),
    onClick: () => onOpen(a)
  });

  return h('section', { className: 'spend-section' },
    h(SectionHead, {
      title: 'Advances',
      caption: rows.length === 0
        ? 'Money borrowed against a paycheck — EarnIn, Dave, work, family'
        : open.length > 0
          ? `${fmtCurrency(owed, currency)} still to pay back`
          : 'All paid back'
    }),
    open.length > 0 ? h('div', { className: 'entry-list' }, open.map(row)) : null,
    paid.length > 0
      ? h('button', { className: 'att-more', onClick: () => setShowPaid(!showPaid) },
          showPaid ? 'Hide paid back' : `Paid back (${paid.length})`)
      : null,
    showPaid ? h('div', { className: 'entry-list' }, paid.map(row)) : null,
    h('button', { className: 'add-row', onClick: onAdd }, '+ Log an advance')
  );
}

const FEE_TYPES = [
  { id: 'none', label: 'No fee' },
  { id: 'flat', label: 'Flat fee' },
  { id: 'rate', label: 'Interest rate' }
];

function useAdvanceForm(data, advance) {
  const todayStr = todayYmd();
  const [form, setForm] = useState(() => advance
    ? {
        amount: String(advance.amount),
        name: advance.name || '',
        date: advance.date,
        repayFromCheck: !!advance.repayFromCheck,
        repayDate: advance.repayDate || '',
        feeType: advance.feeType || 'none',
        fee: advance.fee ? String(advance.fee) : '',
        rate: advance.rate ? String(advance.rate) : '',
        rateBasis: advance.rateBasis || 'once'
      }
    : {
        amount: '',
        name: '',
        date: todayStr,
        repayFromCheck: data.incomeSources.length > 0,
        repayDate: '',
        feeType: 'none',
        fee: '',
        rate: '',
        rateBasis: 'once'
      });
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const nextCheckDate = nextPaycheckAfter(data, form.date);
  const repayFromCheck = form.repayFromCheck && !!nextCheckDate;
  const repayDate = repayFromCheck ? nextCheckDate : form.repayDate;
  const draft = {
    amount: parseFloat(form.amount) || 0,
    date: form.date,
    feeType: form.feeType,
    fee: parseFloat(form.fee) || 0,
    rate: parseFloat(form.rate) || 0,
    rateBasis: form.rateBasis
  };
  const cost = advanceCost(draft, repayDate);
  const total = round2(draft.amount + cost);
  const canSave = draft.amount > 0 && !!repayDate && repayDate >= form.date;

  function build() {
    return {
      ...(advance || {}),
      id: advance ? advance.id : uid(),
      name: form.name.trim() || 'Advance',
      amount: draft.amount,
      date: form.date,
      createdAt: advance ? advance.createdAt : Date.now(),
      repayFromCheck,
      repayDate,
      feeType: form.feeType,
      fee: draft.fee,
      rate: draft.rate,
      rateBasis: form.rateBasis
    };
  }

  return { form, set, nextCheckDate, repayFromCheck, repayDate, cost, total, canSave, build };
}

function AdvanceFields({ data, adv, autoFocus }) {
  const currency = data.settings.currency;
  const { form, set, nextCheckDate, repayFromCheck, repayDate, cost, total } = adv;
  const usedNames = [...new Set((data.advances || []).map((a) => a.name).filter((n) => n && n !== form.name))].slice(0, 6);

  return h(React.Fragment, null,
    h(AmountField, { value: form.amount, onChange: (v) => set('amount', v), currency, autoFocus, label: 'How much you got' }),
    h(Field, { label: 'Who it’s from' },
      h('input', { type: 'text', placeholder: 'e.g. EarnIn, Dave, work', value: form.name, onChange: (e) => set('name', e.target.value) })
    ),
    usedNames.length > 0 ? h(PickChips, { options: usedNames, value: form.name, onPick: (n) => set('name', n) }) : null,
    h('div', { className: 'qa-block' },
      h('p', { className: 'qa-label' }, 'Date you got it'),
      h(DateChips, { value: form.date, onChange: (d) => set('date', d), settings: data.settings })
    ),
    h('div', { className: 'switch-list' },
      h(SettingSwitch, {
        id: 'adv-from-check',
        title: 'Take it out of my next paycheck',
        sub: nextCheckDate
          ? `Paid back automatically from your ${formatDate(parseYmd(nextCheckDate), data.settings, { weekday: true })} paycheck`
          : 'Add an income source in Settings to use this',
        checked: repayFromCheck,
        onChange: (v) => set('repayFromCheck', v)
      })
    ),
    repayFromCheck ? null : h(Field, { label: 'Pay it back on' },
      h(DateField, { value: form.repayDate, onChange: (d) => set('repayDate', d), settings: data.settings, placeholder: 'Pick the payback date' })
    ),
    h('div', { className: 'qa-block' },
      h('p', { className: 'qa-label' }, 'Fee or interest'),
      h(ChipToggle, {
        wide: true,
        options: FEE_TYPES,
        value: form.feeType,
        onChange: (id) => set('feeType', id)
      })
    ),
    form.feeType === 'flat' ? h(Field, { label: 'Fee' },
      h('input', { type: 'number', inputMode: 'decimal', placeholder: '0.00', value: form.fee, onChange: (e) => set('fee', e.target.value) })
    ) : null,
    form.feeType === 'rate' ? h('div', { className: 'setup-entry-grid' },
      h(Field, { label: 'Rate %' },
        h('input', { type: 'number', inputMode: 'decimal', placeholder: 'e.g. 5', value: form.rate, onChange: (e) => set('rate', e.target.value) })
      ),
      h(Field, { label: 'Charged' },
        h(ChipToggle, {
          wide: true,
          value: form.rateBasis,
          onChange: (v) => set('rateBasis', v),
          options: [{ id: 'once', label: 'Once' }, { id: 'apr', label: 'Per year' }]
        })
      )
    ) : null,
    (parseFloat(form.amount) || 0) > 0 ? h('div', { className: 'calc-list' },
      h('div', { className: 'calc-row' },
        h('span', null, 'You got'),
        h('span', { className: 'calc-amt' }, fmtCurrency(parseFloat(form.amount) || 0, currency))),
      cost > 0 ? h('div', { className: 'calc-row' },
        h('span', null, form.feeType === 'rate' && form.rateBasis === 'apr' ? 'Interest until payback' : 'Fee'),
        h('span', { className: 'calc-amt' }, fmtCurrency(cost, currency))) : null,
      h('div', { className: 'calc-row total' },
        h('span', null, repayDate
          ? `You pay back ${formatDate(parseYmd(repayDate), data.settings)}`
          : 'You pay back'),
        h('span', { className: 'calc-amt' }, fmtCurrency(total, currency)))
    ) : null,
    repayDate && repayDate < form.date
      ? h('p', { className: 'setup-hint warn' }, 'The payback date is before the day you got it.')
      : null
  );
}

function saveAdvance(data, record, previous) {
  let next = previous
    ? { ...data, advances: (data.advances || []).map((a) => (a.id === record.id ? record : a)) }
    : { ...data, advances: [...(data.advances || []), record] };
  if (previous && !previous.repayFromCheck && !record.repayFromCheck && previous.repayDate !== record.repayDate) {
    const oldKey = `adv-${record.id}|${previous.repayDate}`;
    const newKey = `adv-${record.id}|${record.repayDate}`;
    if (next.paidHistory[oldKey]) {
      const paidHistory = { ...next.paidHistory, [newKey]: true };
      const paidAt = { ...(next.paidAt || {}), [newKey]: (next.paidAt || {})[oldKey] || Date.now() };
      delete paidHistory[oldKey];
      delete paidAt[oldKey];
      next = { ...next, paidHistory, paidAt };
    }
  }
  const currency = data.settings.currency;
  return logActivity(next, previous
    ? `Edited advance "${record.name}"`
    : `Logged a ${fmtCurrency(record.amount, currency)} advance from ${record.name}`);
}

function removeAdvance(data, advance) {
  const prefix = `adv-${advance.id}|`;
  const strip = (map) => {
    const out = { ...(map || {}) };
    Object.keys(out).forEach((k) => { if (k.startsWith(prefix)) delete out[k]; });
    return out;
  };
  return logActivity({
    ...data,
    advances: (data.advances || []).filter((a) => a.id !== advance.id),
    paidHistory: strip(data.paidHistory),
    paidAt: strip(data.paidAt),
    forcedLate: strip(data.forcedLate),
    dismissedLate: strip(data.dismissedLate)
  }, `Deleted advance "${advance.name}"`);
}

function AdvanceSheet({ data, setData, advance, onClose }) {
  const adv = useAdvanceForm(data, advance);
  const status = advanceStatus(data, advance);
  const manual = !advance.repayFromCheck && !!status.repayDate;

  function save() {
    if (!adv.canSave) return;
    haptic('success');
    setData(saveAdvance(data, adv.build(), advance));
    onClose();
  }

  function togglePaidBack() {
    haptic(status.paidBack ? 'light' : 'success');
    const next = togglePaidStatus(data, `adv-${advance.id}`, status.repayDate);
    setData(logActivity(next, `${status.paidBack ? 'Unmarked' : 'Marked'} "${advance.name}" as paid back`));
  }

  return h(Sheet, {
    title: 'Edit advance',
    sub: `${advance.name || 'Advance'} · ${formatDate(parseYmd(advance.date), data.settings)}`,
    tall: true,
    onClose,
    foot: h('div', { className: 'sheet-actions' },
      h('button', { className: 'primary', onClick: save, disabled: !adv.canSave }, 'Save changes'))
  },
    manual ? h('div', { className: 'action-list' },
      h(ActionRow, {
        active: status.paidBack,
        title: status.paidBack ? 'Paid back' : 'Mark as paid back',
        sub: status.paidBack ? 'Tap to undo' : `${fmtCurrency(status.total, data.settings.currency)} due ${formatDate(parseYmd(status.repayDate), data.settings)}`,
        mark: status.paidBack ? '✓' : '›',
        onClick: togglePaidBack
      })
    ) : null,
    h(AdvanceFields, { data, adv }),
    h(DeleteRow, {
      label: 'Delete this advance',
      sub: 'Takes it off your wallet, calendar and paycheck',
      onConfirm: () => { setData(removeAdvance(data, advance)); onClose(); }
    })
  );
}
