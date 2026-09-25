const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const NOW = new Date(2026, 8, 25, 14, 0, 0).getTime();

function load() {
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(NOW); else super(...args);
    }
    static now() { return NOW; }
  }
  const src = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'app.js'), 'utf8')
    .replace(/ReactDOM\.createRoot[^\n]*\n?$/, '');
  const noop = () => {};
  const React = {
    useState: (v) => [typeof v === 'function' ? v() : v, noop],
    useEffect: noop,
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (v) => ({ current: v }),
    createElement: (...a) => a,
    Fragment: 'frag'
  };
  const ctx = {
    React, Date: FakeDate, Math, JSON, Intl, Object, Array, Number, String, Set, Map, WeakMap, Boolean, console,
    navigator: {}, window: { addEventListener: noop, matchMedia: null }, document: {}
  };
  vm.createContext(ctx);
  const names = ['walletMoves', 'walletSummary', 'balanceUpdateDue', 'recordBalance', 'snoozeBalancePrompt', 'lastBalance',
    'advanceCost', 'advanceTotal', 'advanceRepayDate', 'nextPaycheckAfter', 'getAdvanceEntries', 'advanceInflows', 'advanceStatus',
    'isPaid', 'togglePaidStatus', 'setCovered', 'getLateBills', 'getAttentionItems', 'useNextCheck', 'useMonthFinancials',
    'planProgress', 'paymentCount', 'untilForCount', 'scheduleLabel', 'saveAdvance', 'removeAdvance', 'toggleForcedLate', 'getBlankData', 'resetSpendingHistory'];
  vm.runInContext(src + '\n;globalThis.__t = {' + names.join(',') + '};', ctx);
  return ctx.__t;
}

const t = load();

function base(extra) {
  const d = t.getBlankData();
  d.onboardingComplete = true;
  d.settings.installDate = '2026-08-01';
  return Object.assign(d, extra || {});
}
const e = (id, name, amount, date, freq, category, more) => Object.assign({
  id, name, amount, amountMin: 0, amountMax: 0, useAmountRange: false, date, dateEnd: '', useDateRange: false,
  freq, repeatUntil: '', useAvgEstimate: false, category, color: ''
}, more || {});
const at = (y, m, d, hh) => new Date(y, m - 1, d, hh || 12).getTime();
const check = (date, amount, hh) => ({ id: 'c', date, amount, at: at(+date.slice(0, 4), +date.slice(5, 7), +date.slice(8, 10), hh || 9), expected: null });

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (err) { console.log('  FAIL ' + name + '\n       ' + err.message); process.exitCode = 1; }
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg || ''} expected ${b}, got ${a}`);

test('no check means no summary and a due prompt', () => {
  const d = base();
  assert.strictEqual(t.walletSummary(d), null);
  assert.strictEqual(t.balanceUpdateDue(d), true);
});

test('check this month is not due; last month is; snoozed today is not; disabled is not', () => {
  const d = base({ wallet: { checks: [check('2026-09-01', 100)], snoozed: null } });
  assert.strictEqual(t.balanceUpdateDue(d), false);
  const old = base({ wallet: { checks: [check('2026-08-30', 100)], snoozed: null } });
  assert.strictEqual(t.balanceUpdateDue(old), true);
  assert.strictEqual(t.balanceUpdateDue(t.snoozeBalancePrompt(old)), false);
  const off = base({ wallet: { checks: [] } });
  off.settings.walletEnabled = false;
  assert.strictEqual(t.balanceUpdateDue(off), false);
  const quiet = base({ wallet: { checks: [] } });
  quiet.settings.walletMonthlyCheck = false;
  assert.strictEqual(t.balanceUpdateDue(quiet), false);
});

test('paychecks after the check date add; one on the check date does not', () => {
  const d = base({
    incomeSources: [e('pay', 'Pay', 1000, '2026-09-01', 'biweekly', 'Income')],
    wallet: { checks: [check('2026-09-01', 500)] }
  });
  const s = t.walletSummary(d);
  near(s.moneyIn, 1000, 'only Sep 15 counts (Sep 29 is future)');
  near(s.balance, 1500);
});

test('purchases count by date, and on the check date only when logged after the check', () => {
  const d = base({
    wallet: { checks: [check('2026-09-10', 1000, 9)] },
    oneTimeEntries: [
      e('a', 'Before', 10, '2026-09-09', 'none', 'Gas', { oneTimeKind: 'payment' }),
      e('b', 'Same day early', 20, '2026-09-10', 'none', 'Gas', { oneTimeKind: 'payment' }),
      e('c', 'Same day late', 30, '2026-09-10', 'none', 'Gas', { oneTimeKind: 'payment' }),
      e('d', 'After', 40, '2026-09-12', 'none', 'Gas', { oneTimeKind: 'payment' }),
      e('x', 'Unpaid', 50, '2026-09-12', 'none', 'Gas', { oneTimeKind: 'payment' }),
      e('y', 'Backdated logged later', 60, '2026-09-08', 'none', 'Gas', { oneTimeKind: 'payment' })
    ],
    paidHistory: { 'a|2026-09-09': true, 'b|2026-09-10': true, 'c|2026-09-10': true, 'd|2026-09-12': true, 'y|2026-09-08': true },
    paidAt: { 'b|2026-09-10': at(2026, 9, 10, 8), 'c|2026-09-10': at(2026, 9, 10, 15), 'd|2026-09-12': at(2026, 9, 12), 'y|2026-09-08': at(2026, 9, 20) }
  });
  const s = t.walletSummary(d);
  near(s.moneyOut, 70, 'c + d');
  near(s.balance, 930);
});

test('bills count when marked paid after the check, whatever their due date', () => {
  const d = base({
    majorBills: [e('rent', 'Rent', 1200, '2026-01-01', 'monthly', 'Rent/mortgage'), e('ph', 'Phone', 60, '2026-01-20', 'monthly', 'Phone')],
    wallet: { checks: [check('2026-09-05', 2000)] },
    paidHistory: { 'rent|2026-09-01': true, 'rent|2026-08-01': true, 'ph|2026-09-20': true, 'ph|2026-10-20': true },
    paidAt: { 'rent|2026-09-01': at(2026, 9, 1), 'rent|2026-08-01': at(2026, 9, 6), 'ph|2026-09-20': at(2026, 9, 21), 'ph|2026-10-20': at(2026, 9, 24) }
  });
  const s = t.walletSummary(d);
  near(s.moneyOut, 1200 + 60 + 60, 'late August rent paid after + two phone payments (one early)');
});

test('marking paid through togglePaidStatus stamps now and unmarking removes it', () => {
  let d = base({ majorBills: [e('ph', 'Phone', 60, '2026-01-20', 'monthly', 'Phone')], wallet: { checks: [check('2026-09-01', 100)] } });
  d = t.togglePaidStatus(d, 'ph', '2026-09-20');
  assert.strictEqual(d.paidAt['ph|2026-09-20'], NOW);
  near(t.walletSummary(d).balance, 40);
  d = t.togglePaidStatus(d, 'ph', '2026-09-20');
  assert.strictEqual(d.paidAt['ph|2026-09-20'], undefined);
  near(t.walletSummary(d).balance, 100);
});

test('part payment before the check is not double counted when the rest is paid after', () => {
  let d = base({ majorBills: [e('ph', 'Phone', 100, '2026-01-20', 'monthly', 'Phone')] });
  d = t.setCovered(d, 'ph', '2026-09-20', 40);
  d.coverLog['ph|2026-09-20'].at = at(2026, 9, 2);
  d.wallet = { checks: [check('2026-09-03', 1000)] };
  d = t.togglePaidStatus(d, 'ph', '2026-09-20');
  near(t.walletSummary(d).moneyOut, 60);
});

test('part payment after the check counts while unpaid, and the full amount once paid', () => {
  let d = base({ majorBills: [e('ph', 'Phone', 100, '2026-01-20', 'monthly', 'Phone')], wallet: { checks: [check('2026-09-01', 1000)] } });
  d = t.setCovered(d, 'ph', '2026-09-20', 40);
  near(t.walletSummary(d).moneyOut, 40);
  d = t.togglePaidStatus(d, 'ph', '2026-09-20');
  near(t.walletSummary(d).moneyOut, 100);
});

test('advance cost: flat, one-time rate and APR', () => {
  near(t.advanceCost({ amount: 200, feeType: 'flat', fee: 5.99 }, '2026-10-02'), 5.99);
  near(t.advanceCost({ amount: 200, feeType: 'rate', rate: 5, rateBasis: 'once', date: '2026-09-23' }, '2026-10-02'), 10);
  near(t.advanceCost({ amount: 200, feeType: 'rate', rate: 36.5, rateBasis: 'apr', date: '2026-09-22' }, '2026-10-02'), 2);
  near(t.advanceCost({ amount: 200, feeType: 'none' }, '2026-10-02'), 0);
});

const payd = () => [e('pay', 'Pay', 1400, '2026-09-18', 'biweekly', 'Income')];

test('advance taken from the next paycheck lands on that payday and is auto-paid once it arrives', () => {
  const adv = { id: 'a1', name: 'EarnIn', amount: 200, date: '2026-09-23', createdAt: at(2026, 9, 23), repayFromCheck: true, repayDate: '', feeType: 'flat', fee: 6 };
  const d = base({ incomeSources: payd(), advances: [adv] });
  assert.strictEqual(t.advanceRepayDate(d, adv), '2026-10-02');
  const entry = t.getAdvanceEntries(d)[0];
  assert.strictEqual(entry.id, 'adv-a1');
  near(entry.amount, 206);
  assert.strictEqual(t.isPaid(d, 'adv-a1', '2026-10-02'), false);
  const early = base({ incomeSources: [e('pay', 'Pay', 1400, '2026-09-11', 'biweekly', 'Income')], advances: [{ ...adv, date: '2026-09-12' }] });
  assert.strictEqual(t.advanceRepayDate(early, early.advances[0]), '2026-09-25');
  assert.strictEqual(t.isPaid(early, 'adv-a1', '2026-09-25'), true);
  assert.strictEqual(t.getLateBills(early).length, 0);
});

test('advance taken on payday repays from the following check', () => {
  const adv = { id: 'a1', name: 'X', amount: 100, date: '2026-10-02', repayFromCheck: true };
  const d = base({ incomeSources: payd(), advances: [adv] });
  assert.strictEqual(t.advanceRepayDate(d, adv), '2026-10-16');
});

test('manual payback goes late when unpaid, and counts in the wallet once marked paid', () => {
  const adv = { id: 'm', name: 'Mom', amount: 100, date: '2026-09-10', createdAt: at(2026, 9, 10), repayFromCheck: false, repayDate: '2026-09-20', feeType: 'none' };
  let d = base({ advances: [adv], wallet: { checks: [check('2026-09-05', 500)] } });
  assert.ok(t.getLateBills(d).some((o) => o.id === 'adv-m'), 'late');
  near(t.walletSummary(d).balance, 600, 'inflow counted');
  d = t.togglePaidStatus(d, 'adv-m', '2026-09-20');
  near(t.walletSummary(d).balance, 500, 'payback counted once');
  assert.ok(!t.getLateBills(d).some((o) => o.id === 'adv-m'), 'no longer late');
});

test('wallet: auto payback deducts on payday and inflow adds on the day taken', () => {
  const adv = { id: 'a1', name: 'EarnIn', amount: 200, date: '2026-09-15', createdAt: at(2026, 9, 15), repayFromCheck: true, feeType: 'flat', fee: 5 };
  const d = base({
    incomeSources: [e('pay', 'Pay', 1000, '2026-09-11', 'biweekly', 'Income')],
    advances: [adv],
    wallet: { checks: [check('2026-09-12', 300)] }
  });
  const s = t.walletSummary(d);
  near(s.moneyIn, 200 + 1000, 'advance + Sep 25 paycheck');
  near(s.moneyOut, 205, 'payback from Sep 25 check');
  near(s.balance, 1295);
});

test('marking an auto payback paid by hand never double counts', () => {
  const adv = { id: 'a1', name: 'EarnIn', amount: 200, date: '2026-09-15', createdAt: at(2026, 9, 15), repayFromCheck: true, feeType: 'none' };
  let d = base({ incomeSources: [e('pay', 'Pay', 1000, '2026-09-11', 'biweekly', 'Income')], advances: [adv], wallet: { checks: [check('2026-09-12', 0)] } });
  const before = t.walletSummary(d).balance;
  d = t.togglePaidStatus(d, 'adv-a1', '2026-09-25');
  near(t.walletSummary(d).balance, before);
});

test('next check nets the auto payback out of the paycheck and keeps it off the bill list', () => {
  const adv = { id: 'a1', name: 'EarnIn', amount: 200, date: '2026-09-23', createdAt: at(2026, 9, 23), repayFromCheck: true, feeType: 'flat', fee: 6 };
  const d = base({ incomeSources: payd(), advances: [adv], majorBills: [e('ph', 'Phone', 60, '2026-01-28', 'monthly', 'Phone')], paidHistory: { 'ph|2026-08-28': true } });
  const nc = t.useNextCheck(d, 0);
  assert.strictEqual(nc.check.occDate, '2026-10-02');
  near(nc.checkAmount, 1400 - 206);
  assert.strictEqual(nc.takes.length, 1);
  assert.ok(!nc.bills.some((o) => o.id === 'adv-a1'), 'payback not listed as a bill');
  near(nc.due, 60);
});

test('month financials count the advance as money in and the payback as money out', () => {
  const adv = { id: 'a1', name: 'EarnIn', amount: 200, date: '2026-09-23', repayFromCheck: false, repayDate: '2026-09-29', feeType: 'none' };
  const d = base({ incomeSources: payd(), advances: [adv] });
  const fin = t.useMonthFinancials(d, new Date(2026, 8, 1));
  near(fin.totalProjectedIncome, 1400 + 200);
  near(fin.totalBills, 200);
  assert.ok(fin.incomeOccurrences.some((o) => o.sourceList === 'advances'));
});

test('recordBalance stores what the app expected', () => {
  let d = base({ incomeSources: [e('pay', 'Pay', 1000, '2026-09-11', 'biweekly', 'Income')], wallet: { checks: [check('2026-09-01', 100)] } });
  d = t.recordBalance(d, 1150);
  const c = t.lastBalance(d);
  near(c.expected, 2100);
  near(c.amount, 1150);
  assert.strictEqual(c.date, '2026-09-25');
  assert.strictEqual(t.walletSummary(d).moves.length, 0);
  near(t.walletSummary(d).balance, 1150);
});

test('payment plans: count, end date from count, and payments left', () => {
  assert.strictEqual(t.untilForCount('2026-09-14', 'monthly', 6), '2027-02-14');
  assert.strictEqual(t.untilForCount('2026-09-14', 'biweekly', 4), '2026-10-26');
  const plan = e('p', 'Affirm', 50, '2026-07-14', 'monthly', 'Payment plan', { repeatUntil: '2026-12-14' });
  assert.strictEqual(t.paymentCount(plan), 6);
  const d = base({ subscriptions: [plan], paidHistory: { 'p|2026-10-14': true } });
  const prog = t.planProgress(d, plan);
  assert.strictEqual(prog.total, 6);
  assert.strictEqual(prog.left, 2, 'Nov and Dec (Oct already paid early)');
  assert.strictEqual(t.scheduleLabel(plan, d), 'Next Oct 14 · 2 of 6 payments left');
});

test('deleting an advance clears its payback history', () => {
  const adv = { id: 'm', name: 'Mom', amount: 100, date: '2026-09-10', repayFromCheck: false, repayDate: '2026-09-20', feeType: 'none' };
  let d = base({ advances: [adv] });
  d = t.togglePaidStatus(d, 'adv-m', '2026-09-20');
  d = t.removeAdvance(d, adv);
  assert.strictEqual(d.advances.length, 0);
  assert.strictEqual(Object.keys(d.paidHistory).length, 0);
  assert.strictEqual(Object.keys(d.paidAt).length, 0);
});

test('moving a manual payback date keeps it paid', () => {
  const adv = { id: 'm', name: 'Mom', amount: 100, date: '2026-09-10', repayFromCheck: false, repayDate: '2026-09-20', feeType: 'none' };
  let d = base({ advances: [adv] });
  d = t.togglePaidStatus(d, 'adv-m', '2026-09-20');
  d = t.saveAdvance(d, { ...adv, repayDate: '2026-09-22' }, adv);
  assert.strictEqual(t.isPaid(d, 'adv-m', '2026-09-22'), true);
  assert.strictEqual(t.isPaid(d, 'adv-m', '2026-09-20'), false);
});

test('forcing a bill late clears its paid stamp', () => {
  let d = base({ majorBills: [e('ph', 'Phone', 60, '2026-01-20', 'monthly', 'Phone')] });
  d = t.togglePaidStatus(d, 'ph', '2026-09-20');
  d = t.toggleForcedLate(d, 'ph', '2026-09-20');
  assert.strictEqual(d.paidAt['ph|2026-09-20'], undefined);
});

test('raw imported data without wallet fields does not crash', () => {
  const d = base();
  delete d.wallet; delete d.advances; delete d.paidAt; delete d.coverLog;
  assert.strictEqual(t.walletSummary(d), null);
  assert.strictEqual(t.getAdvanceEntries(d).length, 0);
  assert.strictEqual(t.balanceUpdateDue(d), true);
});

test('resetting spending history drops purchases and balance updates only', () => {
  const buy = e('p1', 'Coffee', 5, '2026-09-20', 'none', 'Food & drink', { oneTimeKind: 'payment' });
  const gift = e('g1', 'Gift', 40, '2026-09-18', 'none', 'Gift', { oneTimeKind: 'income' });
  const phone = e('ph', 'Phone', 60, '2026-01-20', 'monthly', 'Phone');
  let d = base({
    oneTimeEntries: [buy, gift],
    majorBills: [phone],
    budgets: { 'Food & drink': 200 },
    wallet: { checks: [check('2026-09-01', 500)], snoozed: null }
  });
  d = t.togglePaidStatus(d, 'p1', '2026-09-20');
  d = t.togglePaidStatus(d, 'ph', '2026-09-20');
  const r = t.resetSpendingHistory(d);
  assert.deepStrictEqual(r.oneTimeEntries.map((x) => x.id), ['g1']);
  assert.strictEqual(r.paidHistory['p1|2026-09-20'], undefined);
  assert.strictEqual(r.paidAt['p1|2026-09-20'], undefined);
  assert.strictEqual(r.paidHistory['ph|2026-09-20'], true);
  assert.strictEqual(r.majorBills.length, 1);
  assert.strictEqual(r.budgets['Food & drink'], 200);
  assert.strictEqual(r.wallet.checks.length, 0);
  assert.strictEqual(t.walletSummary(r), null);
  assert.strictEqual(t.balanceUpdateDue(r), true);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
