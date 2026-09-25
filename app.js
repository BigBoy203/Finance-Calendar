const { useState, useEffect, useMemo, useCallback, useRef } = React;
const h = React.createElement;

const WEB_VERSION = '5.2';

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=' + WEB_VERSION).catch(() => {});
  });
}

let _hapticsEnabled = true;
function setHapticsEnabled(on) { _hapticsEnabled = !!on; }
function haptic(kind) {
  try {
    if (!_hapticsEnabled) return;
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    const patterns = { light: 8, medium: 15, success: [10, 40, 10], warn: [20, 60, 20], heavy: 25 };
    navigator.vibrate(patterns[kind] || patterns.light);
  } catch (e) {}
}

let _scrollLocks = 0;

function useOverlayDismiss(onClose) {
  const startedOnOverlay = useRef(false);
  useEffect(() => {
    const panes = Array.from(document.querySelectorAll('.main-content, .wizard-shell'));
    const saved = panes.map((p) => p.scrollTop);
    _scrollLocks++;
    document.body.classList.add('modal-open');
    return () => {
      _scrollLocks--;
      if (_scrollLocks <= 0) {
        _scrollLocks = 0;
        document.body.classList.remove('modal-open');
      }
      panes.forEach((p, i) => { p.scrollTop = saved[i]; });
    };
  }, []);
  return {
    onPointerDown: (e) => { startedOnOverlay.current = e.target === e.currentTarget; },
    onClick: (e) => {
      const dismiss = startedOnOverlay.current && e.target === e.currentTarget;
      startedOnOverlay.current = false;
      if (dismiss) onClose();
    }
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fmtCurrency(n, currency) {
  const num = Number(n) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(num);
  } catch (e) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  }
}

function fmtRange(min, max, currency) {
  const whole = (n) => {
    const text = fmtCurrency(n, currency);
    return Number(n) % 1 === 0 ? text.replace(/[.,]00(?=\D*$)/, '') : text;
  };
  return `${whole(min)}\u2013${whole(max)}`;
}

function ymd(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayYmd() {
  return ymd(new Date());
}

function yesterdayYmd() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

function formatDate(date, settings, opts) {
  const fmt = (settings && settings.dateFormat) || 'short';
  const includeWeekday = opts && opts.weekday;
  const weekdayStyle = includeWeekday === 'short' ? 'short' : 'long';
  const forceYear = opts && opts.year;
  if (fmt === 'iso') {
    const base = ymd(date);
    return includeWeekday ? `${date.toLocaleDateString('en-US', { weekday: weekdayStyle })}, ${base}` : base;
  }
  if (fmt === 'long') {
    return date.toLocaleDateString('en-US', {
      weekday: includeWeekday ? weekdayStyle : undefined,
      month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  return date.toLocaleDateString('en-US', {
    weekday: includeWeekday ? weekdayStyle : undefined,
    month: 'short', day: 'numeric',
    year: forceYear ? 'numeric' : undefined
  });
}

function formatLogTimestamp(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

const FREQS = ['none', 'weekly', 'biweekly', 'monthly', 'yearly'];
const FREQ_LABELS = {
  none: 'one-time',
  weekly: 'weekly',
  biweekly: 'biweekly',
  monthly: 'monthly',
  yearly: 'yearly'
};

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addIntervals(anchor, freq, count) {
  const d = new Date(anchor);
  if (freq === 'weekly') {
    d.setDate(d.getDate() + 7 * count);
    return d;
  }
  if (freq === 'biweekly') {
    d.setDate(d.getDate() + 14 * count);
    return d;
  }
  if (freq === 'monthly') {
    const anchorDay = anchor.getDate();
    const targetMonthIndex = anchor.getMonth() + count;
    const targetYear = anchor.getFullYear() + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const clampedDay = Math.min(anchorDay, daysInMonth(targetYear, normalizedMonthIndex));
    return new Date(targetYear, normalizedMonthIndex, clampedDay);
  }
  if (freq === 'yearly') {
    const anchorDay = anchor.getDate();
    const targetYear = anchor.getFullYear() + count;

    const clampedDay = Math.min(anchorDay, daysInMonth(targetYear, anchor.getMonth()));
    return new Date(targetYear, anchor.getMonth(), clampedDay);
  }
  return d;
}

function hexWithAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255, g = (int >> 8) & 255, b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function entryAmount(entry) {
  if (entry.useAmountRange) {
    const min = Number(entry.amountMin) || 0;
    const max = Number(entry.amountMax) || 0;
    return (min + max) / 2;
  }
  return Number(entry.amount) || 0;
}

function entryAmountLabel(entry, currency) {
  if (entry.useAmountRange) {
    const min = Number(entry.amountMin) || 0;
    const max = Number(entry.amountMax) || 0;
    return fmtRange(min, max, currency);
  }
  return fmtCurrency(entry.amount, currency);
}

function monthlyAmount(entry) {
  const amount = entryAmount(entry) || 0;
  if (entry.freq === 'weekly') return amount * 52 / 12;
  if (entry.freq === 'biweekly') return amount * 26 / 12;
  if (entry.freq === 'yearly') return amount / 12;
  return amount;
}

function defaultRepeatUntil(dateStr) {
  return ymd(addIntervals(dateStr ? parseYmd(dateStr) : new Date(), 'yearly', 1));
}

function repeatLabel(entry, settings) {
  const base = FREQ_LABELS[entry.freq] || entry.freq || 'one-time';
  if (!entry.repeatUntil || !entry.freq || entry.freq === 'none') return base;
  return `${base} until ${formatDate(parseYmd(entry.repeatUntil), settings)}`;
}

function nextDueDate(entry) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 400);
  const next = expandEntry(entry, today, horizon)[0];
  return next ? parseYmd(next.occDate) : null;
}

function scheduleLabel(entry, data) {
  const settings = data.settings;
  const next = nextDueDate(entry);
  const plan = entry.category === PAYMENT_PLAN ? planProgress(data, entry) : null;
  const when = next
    ? (entry.freq && entry.freq !== 'none' ? `Next ${formatDate(next, settings)}` : formatDate(next, settings))
    : (plan ? 'Paid off' : 'Ended');
  const repeat = plan
    ? (plan.left > 0 ? `${plan.left} of ${plan.total} payments left` : null)
    : repeatLabel(entry, settings);
  return [when, repeat, !plan && entry.category !== entry.name ? entry.category : ''].filter(Boolean).join(' \u00b7 ');
}

function expandEntry(entry, rangeStart, rangeEnd) {
  const occurrences = [];
  if (!entry.date) return occurrences;
  let cur = parseYmd(entry.date);
  let end = new Date(rangeEnd);
  const freq = entry.freq || 'none';

  if (entry.repeatUntil && freq !== 'none') {
    const until = parseYmd(entry.repeatUntil);
    if (until < end) end = until;
    if (end < rangeStart) return occurrences;
  }

  if (freq === 'none') {

    if (cur >= rangeStart && cur <= end) {
      occurrences.push({ ...entry, occDate: ymd(cur) });
    }
    return occurrences;
  }

  const anchor = parseYmd(entry.date);
  let count = 0;
  let safety = 0;
  cur = addIntervals(anchor, freq, count);
  while (cur < rangeStart && safety < 3000) {
    count++;
    cur = addIntervals(anchor, freq, count);
    safety++;
  }
  safety = 0;
  while (cur <= end && safety < 600) {
    occurrences.push({ ...entry, occDate: ymd(cur) });
    count++;
    cur = addIntervals(anchor, freq, count);
    safety++;
  }
  return occurrences;
}

function expandAll(entries, kind, rangeStart, rangeEnd, data) {
  const all = [];
  const removed = (data && data.removedOccurrences) || {};
  const todayStr = todayYmd();
  entries.forEach((entry) => {
    const estimate = (data && kind === 'income') ? incomeEstimate(data, entry) : null;
    expandEntry(entry, rangeStart, rangeEnd).forEach((occ) => {
      if (removed[`${entry.id}|${occ.occDate}`]) return;
      const override = data ? getOverride(data, entry.id, occ.occDate) : null;
      const hasOverride = hasAmountOverride(override);
      const isEstimate = !!estimate && !hasOverride && occ.occDate > todayStr;
      all.push({
        ...occ,
        kind,
        amount: hasOverride ? Number(override.amount) || 0 : (isEstimate ? estimate.amount : entryAmount(entry)),
        isRange: !!entry.useAmountRange,
        hasOverride,
        isEstimate,
        estimateCount: isEstimate ? estimate.count : 0
      });
    });
  });
  return all;
}

function removeOccurrence(data, entryId, occDate) {
  const key = `${entryId}|${occDate}`;
  return { ...data, removedOccurrences: { ...(data.removedOccurrences || {}), [key]: true } };
}

function logActivity(data, message) {
  const entry = { id: uid(), timestamp: new Date().toISOString(), message };
  return { ...data, activityLog: [entry, ...(data.activityLog || [])].slice(0, 50) };
}

function getOverride(data, entryId, occDate) {
  return data.overrides ? data.overrides[`${entryId}|${occDate}`] : null;
}

function hasAmountOverride(override) {
  return !!(override && override.amount !== undefined && override.amount !== null);
}

function resolvedAmount(data, entry, occDate) {
  const override = getOverride(data, entry.id, occDate);
  return hasAmountOverride(override) ? Number(override.amount) || 0 : entryAmount(entry);
}

function oneTimeOccurrence(data, entry) {
  const override = getOverride(data, entry.id, entry.date);
  const hasOverride = hasAmountOverride(override);
  return {
    ...entry,
    occDate: entry.date,
    amount: hasOverride ? Number(override.amount) || 0 : entryAmount(entry),
    isRange: !!entry.useAmountRange,
    hasOverride,
    isOneTime: true,
    kind: entry.oneTimeKind === 'income' ? 'income' : 'bill'
  };
}

function occAmountLabel(occ, currency) {
  if (occ.covered > 0) {
    return fmtCurrency(occ.amount, currency);
  }
  if (occ.hasOverride) {
    return fmtCurrency(occ.amount, currency);
  }
  if (occ.isEstimate) {
    return `\u2248${fmtCurrency(occ.amount, currency)}`;
  }
  if (occ.isRange) {
    const min = Number(occ.amountMin) || 0;
    const max = Number(occ.amountMax) || 0;
    return fmtRange(min, max, currency);
  }
  return fmtCurrency(occ.amount, currency);
}

function isPaid(data, entryId, occDate) {
  if (data.paidHistory[`${entryId}|${occDate}`]) return true;
  return String(entryId).startsWith('adv-') && occDate <= todayYmd() && isAutoAdvance(data, entryId);
}

function isDismissedLate(data, entryId, occDate) {
  return !!data.dismissedLate[`${entryId}|${occDate}`];
}

function isForcedLate(data, entryId, occDate) {
  return !!(data.forcedLate && data.forcedLate[`${entryId}|${occDate}`]);
}

function toggleForcedLate(data, entryId, occDate) {
  const key = `${entryId}|${occDate}`;
  const nextForced = { ...(data.forcedLate || {}) };
  const nextDismissed = { ...data.dismissedLate };
  const nextPaid = { ...data.paidHistory };
  const nextPaidAt = { ...(data.paidAt || {}) };
  if (nextForced[key]) {
    delete nextForced[key];
  } else {
    nextForced[key] = true;
    delete nextDismissed[key];
    delete nextPaid[key];
    delete nextPaidAt[key];
  }
  return { ...data, forcedLate: nextForced, dismissedLate: nextDismissed, paidHistory: nextPaid, paidAt: nextPaidAt };
}

function deferredTo(data, entryId, occDate) {
  const target = data.deferred ? data.deferred[`${entryId}|${occDate}`] : null;
  if (!target) return null;
  return target >= todayYmd() ? target : null;
}

function setDeferred(data, entryId, occDate, targetYmd) {
  const key = `${entryId}|${occDate}`;
  const next = { ...(data.deferred || {}) };
  if (targetYmd) next[key] = targetYmd; else delete next[key];
  return { ...data, deferred: next };
}

function coveredAmount(data, entryId, occDate) {
  return Number((data.covered || {})[`${entryId}|${occDate}`]) || 0;
}

function setCovered(data, entryId, occDate, amount) {
  const key = `${entryId}|${occDate}`;
  const next = { ...(data.covered || {}) };
  const log = { ...(data.coverLog || {}) };
  if (amount > 0) {
    next[key] = amount;
    log[key] = { amount, at: Date.now() };
  } else {
    delete next[key];
    delete log[key];
  }
  return { ...data, covered: next, coverLog: log };
}

function togglePaidStatus(data, entryId, occDate) {
  const key = `${entryId}|${occDate}`;
  const nextPaid = { ...data.paidHistory };
  const nextPaidAt = { ...(data.paidAt || {}) };
  const nextForced = { ...(data.forcedLate || {}) };
  const nextDeferred = { ...(data.deferred || {}) };
  const nextCovered = { ...(data.covered || {}) };
  const wasPaid = !!nextPaid[key];
  if (wasPaid) {
    delete nextPaid[key];
    delete nextPaidAt[key];
  } else {
    nextPaid[key] = true;
    nextPaidAt[key] = Date.now();
    delete nextForced[key];
    delete nextDeferred[key];
    delete nextCovered[key];
  }

  let nextCreditCards = data.creditCards;
  const autoDeduct = data.settings.autoDeductCardPayments !== false;
  if (autoDeduct && entryId.startsWith('cc-')) {
    const cardId = entryId.slice(3);
    const card = (data.creditCards || []).find((c) => c.id === cardId);
    if (card && card.hasRecurringPayment) {
      const amount = Number(card.paymentAmount) || 0;
      const delta = wasPaid ? -amount : amount;
      nextCreditCards = data.creditCards.map((c) =>
        c.id === cardId ? { ...c, amountPaid: Math.max(0, (Number(c.amountPaid) || 0) + delta) } : c
      );
    }
  }

  return { ...data, paidHistory: nextPaid, paidAt: nextPaidAt, forcedLate: nextForced, deferred: nextDeferred, covered: nextCovered, creditCards: nextCreditCards };
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function getEarliestTrackedDate(data) {
  if (data.settings && data.settings.installDate) {
    return parseYmd(data.settings.installDate);
  }
  return new Date(2000, 0, 1);
}

function readableTextOn(hex) {
  let c = (hex || '#888888').replace('#', '');
  if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
  const num = parseInt(c, 16) || 0x888888;
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1a1a1a' : '#ffffff';
}

function getEntryColor(o, data) {
  if (o.color) return o.color;
  const sc = (data.settings && data.settings.sectionColors) || {};
  if (o.sourceList === 'majorBills') return sc.majorBills;
  if (o.sourceList === 'subscriptions') return sc.subscriptions;
  if (o.sourceList === 'creditCards') return sc.creditCards;
  if (o.sourceList === 'incomeSources') return sc.incomeSources;
  if (o.sourceList === 'advances') return sc.advances;
  if (o.sourceList === 'oneTimeEntries') {
    return o.kind === 'income' ? sc.oneTimeIncome : sc.oneTimePayments;
  }
  return o.kind === 'income' ? sc.incomeSources : sc.majorBills;
}

function getCurrentCardBalance(card) {
  const principal = Math.max(0, (Number(card.totalDebt) || 0) - (Number(card.amountPaid) || 0));
  if (!card.useApr || !card.apr || principal <= 0) return principal;

  const apr = Number(card.apr) || 0;
  const monthlyRate = apr / 100 / 12;
  const dailyRate = monthlyRate / 30;

  const start = card.balanceDate ? parseYmd(card.balanceDate) : new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, daysBetween(start, today));

  return principal * (1 + dailyRate * days);
}

function isCardPaymentLate(card, data) {
  if (!card.hasRecurringPayment || !card.paymentAmount || !card.paymentDate) return false;
  const lateBills = getLateBills(data);
  return lateBills.some((o) => o.id === `cc-${card.id}`);
}

function getCardProjection(card, data, months) {
  months = months || 12;
  const apr = card.useApr && card.apr ? Number(card.apr) || 0 : 0;
  const monthlyRate = apr / 100 / 12;
  const hasPayment = card.hasRecurringPayment && Number(card.paymentAmount) > 0;
  const payment = hasPayment ? Number(card.paymentAmount) || 0 : 0;
  const late = isCardPaymentLate(card, data);

  let balance = getCurrentCardBalance(card);
  const points = [{ month: 0, label: 'Now', balance, interest: 0, principalPaid: 0 }];

  for (let m = 1; m <= months; m++) {
    const interest = balance * monthlyRate;
    let principalPaid = 0;

    const skipThisPayment = late && m === 1;
    if (hasPayment && !skipThisPayment && balance > 0) {
      const towardPrincipal = Math.max(0, payment - interest);
      principalPaid = Math.min(balance, towardPrincipal);
    }
    balance = Math.max(0, balance + interest - principalPaid);
    points.push({ month: m, label: `+${m}mo`, balance, interest, principalPaid });
    if (balance <= 0) break;
  }

  return points;
}

function buildSourceListLookup(data) {
  const map = {};
  data.majorBills.forEach((e) => { map[e.id] = 'majorBills'; });
  data.subscriptions.forEach((e) => { map[e.id] = 'subscriptions'; });
  getCreditCardPaymentEntries(data).forEach((e) => { map[e.id] = 'creditCards'; });
  getAdvanceEntries(data).forEach((e) => { map[e.id] = 'advances'; });
  data.incomeSources.forEach((e) => { map[e.id] = 'incomeSources'; });
  return map;
}

function purchaseEntries(data) {
  return (data.oneTimeEntries || []).filter((e) => e.oneTimeKind === 'payment' && e.date);
}

function getAllBillLikeEntries(data) {
  return [...data.majorBills, ...data.subscriptions, ...getCreditCardPaymentEntries(data), ...getAdvanceEntries(data)];
}

function getCreditCardPaymentEntries(data) {
  if (!data.creditCards) return [];
  return data.creditCards
    .filter((c) => c.hasRecurringPayment && c.paymentAmount && c.paymentDate)
    .map((c) => ({
      id: `cc-${c.id}`,
      name: `${c.name} payment`,
      amount: Number(c.paymentAmount) || 0,
      amountMin: 0,
      amountMax: 0,
      useAmountRange: false,
      date: c.paymentDate,
      dateEnd: '',
      useDateRange: false,
      freq: c.paymentFreq || 'monthly',
      category: 'Credit card'
    }));
}

function getLateBills(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const grace = data.settings.lateGraceDays || 0;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - grace);

  const pastRangeStart = getEarliestTrackedDate(data);
  const pastRangeEnd = new Date(cutoff);
  pastRangeEnd.setDate(pastRangeEnd.getDate() - 1);
  if (pastRangeEnd < pastRangeStart) return [];

  const allBills = getAllBillLikeEntries(data);
  const occs = expandAll(allBills, 'bill', pastRangeStart, pastRangeEnd, data);
  const late = occs.filter((o) => !isPaid(data, o.id, o.occDate) && !isDismissedLate(data, o.id, o.occDate));

  const autoLate = late
    .map((o) => ({ ...o, daysLate: daysBetween(parseYmd(o.occDate), today), forcedLate: false }));

  const autoLateKeys = new Set(autoLate.map((o) => `${o.id}|${o.occDate}`));

  const forcedKeys = Object.keys(data.forcedLate || {}).filter((k) => data.forcedLate[k]);
  const entryById = buildEntryLookup(data);
  const forced = [];
  forcedKeys.forEach((key) => {
    if (autoLateKeys.has(key)) return;
    const sep = key.lastIndexOf('|');
    const entryId = key.slice(0, sep);
    const occDate = key.slice(sep + 1);
    if (isPaid(data, entryId, occDate)) return;
    const entry = entryById[entryId];
    if (!entry) return;
    const override = getOverride(data, entryId, occDate);
    forced.push({
      ...entry,
      occDate,
      amount: hasAmountOverride(override) ? Number(override.amount) || 0 : entryAmount(entry),
      isRange: !!entry.useAmountRange,
      hasOverride: hasAmountOverride(override),
      kind: 'bill',
      daysLate: daysBetween(parseYmd(occDate), today),
      forcedLate: true
    });
  });

  return [...autoLate, ...forced].sort((a, b) => b.daysLate - a.daysLate);
}

function resolveSourceList(data) {
  const byId = buildSourceListLookup(data);
  const oneTimeIds = new Set(data.oneTimeEntries.map((e) => e.id));
  return (occ) => byId[occ.id] || (oneTimeIds.has(occ.id) ? 'oneTimeEntries' : undefined);
}

function lateState(data, occ) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (data.settings.lateGraceDays || 0));
  const paid = isPaid(data, occ.id, occ.occDate);
  const forced = isForcedLate(data, occ.id, occ.occDate);
  const dismissed = isDismissedLate(data, occ.id, occ.occDate);
  const late = !paid && occ.kind !== 'income' && !occ.isOneTime
    && (forced || (parseYmd(occ.occDate) < cutoff && !dismissed));
  return { paid, forced, dismissed, late, daysLate: daysBetween(parseYmd(occ.occDate), today) };
}

function getAttentionItems(data) {
  const listFor = resolveSourceList(data);
  const byKey = new Map();

  getLateBills(data).forEach((o) => {
    byKey.set(`${o.id}|${o.occDate}`, { ...o, sourceList: listFor(o), late: true, needsPrice: false });
  });

  getNeedsAttention(data).forEach((o) => {
    const key = `${o.id}|${o.occDate}`;
    const prev = byKey.get(key);
    byKey.set(key, {
      ...(prev || {}),
      ...o,
      sourceList: listFor(o),
      needsPrice: true,
      late: !!(o.late || (prev && prev.late)),
      forcedLate: !!(o.forcedLate || (prev && prev.forcedLate)),
      daysLate: Math.max(o.daysLate || 0, (prev && prev.daysLate) || 0)
    });
  });

  return [...byKey.values()].sort((a, b) => {
    if (a.late !== b.late) return a.late ? -1 : 1;
    if (a.late) return b.daysLate - a.daysLate;
    return a.occDate.localeCompare(b.occDate);
  });
}

function buildEntryLookup(data) {
  const map = {};
  data.majorBills.forEach((e) => { map[e.id] = e; });
  data.subscriptions.forEach((e) => { map[e.id] = e; });
  getCreditCardPaymentEntries(data).forEach((e) => { map[e.id] = e; });
  getAdvanceEntries(data).forEach((e) => { map[e.id] = e; });
  data.oneTimeEntries.forEach((e) => { map[e.id] = e; });
  return map;
}

function getNeedsAttention(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const grace = data.settings.lateGraceDays || 0;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - grace);

  const rangeStart = getEarliestTrackedDate(data);

  const lookaheadEnd = (days) => {
    const end = new Date(today);
    end.setDate(end.getDate() + days);
    return end;
  };
  const settingOr = (value, fallback) => (value === undefined || value === null ? fallback : value);
  const billRangeEnd = lookaheadEnd(settingOr(data.settings.needsAttentionLookaheadDays, 7));
  const incomeRangeEnd = lookaheadEnd(settingOr(data.settings.incomeNeedsAttentionLookaheadDays, 1));

  const inRange = (occDate, end) => {
    const d = parseYmd(occDate);
    return d >= rangeStart && d <= end;
  };

  const billOccs = expandAll(getAllBillLikeEntries(data), 'bill', rangeStart, billRangeEnd, data);
  const oneTimePayments = data.oneTimeEntries
    .filter((e) => e.oneTimeKind === 'payment' && e.date)
    .map((e) => oneTimeOccurrence(data, e))
    .filter((o) => inRange(o.occDate, billRangeEnd));

  const incomeOccs = expandAll(data.incomeSources, 'income', rangeStart, incomeRangeEnd, data);
  const oneTimeIncome = data.oneTimeEntries
    .filter((e) => e.oneTimeKind === 'income' && e.date)
    .map((e) => oneTimeOccurrence(data, e))
    .filter((o) => inRange(o.occDate, incomeRangeEnd));

  const candidates = [...billOccs, ...oneTimePayments, ...incomeOccs, ...oneTimeIncome].filter((o) =>
    o.isRange && !o.useDateRange && !o.hasOverride
  );

  const candidateKeys = new Set(candidates.map((o) => `${o.id}|${o.occDate}`));
  const entryById = buildEntryLookup(data);
  const extraForced = Object.keys(data.forcedLate || {})
    .filter((k) => data.forcedLate[k] && !candidateKeys.has(k))
    .map((key) => {
      const sep = key.lastIndexOf('|');
      const entryId = key.slice(0, sep);
      const occDate = key.slice(sep + 1);
      const entry = entryById[entryId];
      if (!entry || !entry.useAmountRange || entry.useDateRange) return null;
      if (getOverride(data, entryId, occDate)) return null;
      return { ...entry, occDate, amount: entryAmount(entry), isRange: true, hasOverride: false, kind: 'bill' };
    })
    .filter(Boolean);

  return [...candidates, ...extraForced]
    .map((o) => {
      const occDate = parseYmd(o.occDate);

      const late = (o.kind === 'income' || o.isOneTime)
        ? false
        : (isForcedLate(data, o.id, o.occDate) || (occDate < cutoff && !isPaid(data, o.id, o.occDate)));
      return { ...o, late, daysLate: late ? daysBetween(occDate, today) : 0 };
    })
    .sort((a, b) => {
      if (a.late !== b.late) return a.late ? -1 : 1;
      return a.occDate.localeCompare(b.occDate);
    });
}

const _averageCache = new WeakMap();

function averagePaycheck(data, entry) {
  const key = `${entry.id}|${entry.date}|${entry.freq}|${entry.repeatUntil || ''}`;
  let cached = _averageCache.get(data);
  if (!cached) { cached = {}; _averageCache.set(data, cached); }
  if (cached[key]) return cached[key];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const removed = data.removedOccurrences || {};
  const amounts = expandEntry(entry, getEarliestTrackedDate(data), today)
    .filter((occ) => !removed[`${entry.id}|${occ.occDate}`])
    .map((occ) => getOverride(data, entry.id, occ.occDate))
    .filter(hasAmountOverride)
    .map((o) => Number(o.amount) || 0);

  cached[key] = amounts.length < 2
    ? { amount: 0, count: amounts.length, ready: false }
    : { amount: amounts.reduce((sum, n) => sum + n, 0) / amounts.length, count: amounts.length, ready: true };
  return cached[key];
}

function incomeEstimate(data, entry) {
  if (!entry.useAvgEstimate || !entry.useAmountRange) return null;
  const avg = averagePaycheck(data, entry);
  return avg.ready ? avg : null;
}

const ACCENTS = [
  { id: 'blue', label: 'Blue', hex: '#378ADD' },
  { id: 'teal', label: 'Teal', hex: '#1D9E75' },
  { id: 'purple', label: 'Purple', hex: '#7F77DD' },
  { id: 'coral', label: 'Coral', hex: '#D85A30' },
  { id: 'pink', label: 'Pink', hex: '#D4537E' },
  { id: 'green', label: 'Green', hex: '#639922' }
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [page, setPage] = useState('home');
  const [quickAdd, setQuickAdd] = useState(null);
  const [overviewView, setOverviewView] = useState('calendar');
  const [walletPage, setWalletPage] = useState(0);

  useEffect(() => {
    const panes = document.querySelectorAll('.main-content, .main-content.mobile');
    panes.forEach((p) => { if (p) p.scrollTop = 0; });
    window.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    setHapticsEnabled(data && data.settings ? data.settings.hapticsEnabled !== false : true);
  }, [data && data.settings && data.settings.hapticsEnabled]);

  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [syncModal, setSyncModal] = useState(false);
  const [syncBanner, setSyncBanner] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!window.api || typeof window.api.loadData !== 'function') {
      setLoadError('Storage layer (storage.js) did not load. Make sure all files were kept together, and try serving this folder over http:// instead of opening the file directly.');
      setLoading(false);
      return;
    }
    window.api.loadData()
      .then((d) => {
        setData(d);
        setLoading(false);

        if (window.Sync && Sync.supportsFileSystem) {
          Sync.hasLinkedFile().then((linked) => {
            if (!linked) return;
            Sync.readLinked().then((res) => {
              if (res.ok && res.data && (res.data.lastModified || 0) > (d.lastModified || 0)) {
                setSyncBanner({ incoming: res.data });
              }
            }).catch(() => {});
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load data:', err);
        setLoadError(String((err && err.message) || err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!data || !data.onboardingComplete) return;
    if (data.settings.backupReminderEnabled === false) return;
    if (new Date().getDay() !== 1) return;
    if (data.settings.lastBackupReminderShown === todayYmd()) return;
    setShowBackupPrompt(true);
  }, [data && data.onboardingComplete, data && data.settings && data.settings.backupReminderEnabled]);

  function dismissBackupPrompt() {
    setShowBackupPrompt(false);
    persist({ ...data, settings: { ...data.settings, lastBackupReminderShown: todayYmd() } });
  }

  async function downloadBackupNow() {
    await window.api.exportData();
    dismissBackupPrompt();
  }

  useEffect(() => {
    if (!data) return;
    document.documentElement.setAttribute('data-theme', data.settings.theme || 'system');
    document.documentElement.setAttribute('data-density', data.settings.density || 'comfortable');

    const root = document.documentElement;
    if (data.settings.accent === 'custom' && data.settings.accentCustom) {

      root.setAttribute('data-accent', 'custom');
      const hex = data.settings.accentCustom;
      root.style.setProperty('--accent', hex);
      root.style.setProperty('--accent-bg', hexWithAlpha(hex, 0.14));
      root.style.setProperty('--accent-text', hex);
    } else {
      root.setAttribute('data-accent', data.settings.accent || 'blue');

      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-bg');
      root.style.removeProperty('--accent-text');
    }
  }, [
    data && data.settings && data.settings.theme,
    data && data.settings && data.settings.accent,
    data && data.settings && data.settings.accentCustom,
    data && data.settings && data.settings.density
  ]);

  useEffect(() => {
    if (!data) return;
    let styleEl = document.getElementById('custom-css');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = data.settings.customCss || '';
  }, [data && data.settings && data.settings.customCss]);

  const persist = useCallback((next, opts) => {

    const stamped = { ...next, lastModified: (opts && opts.lastModified) || Date.now() };
    setData(stamped);
    window.api.saveData(stamped);
    return stamped;
  }, []);

  const attention = useMemo(() => (data && data.onboardingComplete ? getAttentionItems(data) : []), [data]);

  if (loading) {
    return h('div', { className: 'main-content' }, h('p', null, 'Loading...'));
  }

  if (loadError || !data) {
    return h('div', { className: 'main-content', style: { maxWidth: '520px' } },
      h('h2', null, 'Couldn\u2019t load Finance Calendar'),
      h('p', { style: { color: 'var(--text-secondary)' } },
        loadError || 'Something went wrong loading the app and no data was returned.'),
      h('p', { style: { color: 'var(--text-secondary)', fontSize: '13px' } },
        'If you opened this by double-clicking index.html, try serving the folder with a local server instead ' +
        '(for example, "npx serve ." or "python3 -m http.server" from this folder) and open the address it gives you. ' +
        'See README.md for details.')
    );
  }

  if (!data.onboardingComplete) {
    return h(OnboardingWizard, {
      data,
      onComplete: (next) => {
        persist({
          ...next,
          onboardingComplete: true,
          settings: { ...next.settings, installDate: next.settings.installDate || todayYmd() }
        });

      }
    });
  }

  const hasWallet = walletOn(data);
  const spendingLabel = hasWallet ? 'Wallet' : 'Spending';

  const NAV_ITEMS = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'overview', label: 'Overview', icon: 'calendar' },
    { id: 'spending', label: spendingLabel, icon: hasWallet ? 'wallet' : 'bag' },
    { id: 'allbills', label: 'Bills', icon: 'allbills' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];


  let pageContent;
  if (page === 'home') {
    pageContent = h(HomePage, { data, setData: persist, isMobile });
  } else if (page === 'overview') {
    pageContent = h(OverviewPage, {
      data, setData: persist, isMobile,
      onAddEntry: (date) => setQuickAdd({ date }),
      view: overviewView, setView: setOverviewView
    });
  } else if (page === 'spending') {
    pageContent = h(SpendingPage, {
      data, setData: persist,
      onAddEntry: (opts) => setQuickAdd(opts),
      pageIndex: walletPage, setPageIndex: setWalletPage
    });
  } else if (page === 'creditcards') {
    pageContent = h(CreditCardsPage, { data, setData: persist });
  } else if (page === 'allbills') {
    pageContent = h(AllBillsPage, { data, setData: persist, attention, isMobile, setPage });
  } else if (page === 'settings') {
    pageContent = h(SettingsPage, { data, setData: persist, onRestart: () => persist({ ...getBlankData(), onboardingComplete: false }) });
  }

  const quickAddEl = quickAdd ? h(QuickAddModal, {
    data,
    setData: persist,
    initialDate: quickAdd.date,
    initialType: quickAdd.type,
    preset: quickAdd.preset,
    onClose: () => setQuickAdd(null)
  }) : null;

  const promptEl = showBackupPrompt ? h(BackupReminderModal, {
    onDownloadBackup: downloadBackupNow,
    onDismiss: dismissBackupPrompt
  }) : null;

  const syncBannerEl = syncBanner ? h('div', { className: 'sync-banner' },
    h('span', { className: 'sync-banner-text' }, 'A newer version of your data is in your synced file.'),
    h('div', { className: 'sync-banner-actions' },
      h('button', { onClick: () => setSyncBanner(null) }, 'Ignore'),
      h('button', { className: 'primary', onClick: () => {
        persist({ ...syncBanner.incoming }, { lastModified: syncBanner.incoming.lastModified || Date.now() });
        setSyncBanner(null);
      } }, 'Load it')
    )
  ) : null;

  if (isMobile) {
    const pageTitle = ({
      home: 'Home', overview: 'Overview', spending: spendingLabel,
      allbills: 'Bills', creditcards: 'Credit cards', settings: 'Settings'
    })[page] || 'Finance Calendar';

    return h('div', { className: 'app-shell mobile' },
      h(MobileHeader, {
        title: pageTitle,
        titleEl: page === 'overview'
          ? h(OverviewSwitch, { view: overviewView, setView: setOverviewView })
          : null,
        onSettings: () => setPage('settings'),
        onSync: () => setSyncModal(true),
        onBack: MOBILE_SUBPAGES.includes(page) ? () => setPage('allbills') : null,
        lastExported: data.settings && data.settings.lastExported
          ? relativeTime(data.settings.lastExported)
          : null
      }),
      h('div', { className: 'main-content mobile' }, syncBannerEl, pageContent),
      syncModal ? h(SyncModal, { data, setData: persist, onClose: () => setSyncModal(false) }) : null,
      h(MobileTabBar, {
        page,
        setPage,
        onAdd: () => setQuickAdd({ date: todayYmd() }),
        attentionCount: attention.length,
        walletOn: hasWallet
      }),
      quickAddEl,
      promptEl
    );
  }

  return h('div', { className: 'app-shell' },
    h('div', { className: 'sidebar' },
      h('div', { className: 'sidebar-brand' },
        h('img', { src: 'assets/icon.svg', alt: '', className: 'sidebar-logo' }),
        h('h1', null, 'Finance Calendar')
      ),
      NAV_ITEMS.map((item) => {
        const active = page === item.id || (item.id === 'allbills' && page === 'creditcards');
        return h('div', {
          key: item.id,
          className: `sidebar-link${active ? ' active' : ''}`,
          onClick: () => setPage(item.id)
        },
          h(Icon, { name: item.icon }),
          item.label,
          item.id === 'allbills' && attention.length > 0
            ? h('span', { className: 'nav-badge round attention' }, attention.length)
            : null
        );
      }),

      h('div', { className: 'sidebar-foot' },
        h('button', {
          className: 'sidebar-foot-btn',
          onClick: () => setSyncModal(true),
          'aria-label': 'Sync data',
          title: 'Sync your data'
        }, h(Icon, { name: 'refresh' }))
      )
    ),
    h('div', { className: 'main-content' }, syncBannerEl, pageContent),
    syncModal ? h(SyncModal, { data, setData: persist, onClose: () => setSyncModal(false) }) : null,
    quickAddEl,
    promptEl
  );
}

function BackupReminderModal({ onDownloadBackup, onDismiss }) {
  return h(Sheet, {
    title: 'Weekly backup reminder',
    onClose: onDismiss,
    foot: h('div', { className: 'sheet-actions' },
      h('button', { onClick: onDismiss }, 'Later'),
      h('button', { className: 'primary', onClick: onDownloadBackup }, 'Download backup')
    )
  },
    h('p', { className: 'sheet-lead' },
      'Your data lives in this browser only. It\u2019s a good habit to download a backup every so often, in case this browser\u2019s data ever gets cleared.'),
    h('p', { className: 'setup-hint' }, 'You can turn this reminder off in Settings \u2192 Advanced.')
  );
}

function getBlankData() {
  return {
    onboardingComplete: false,
    lastModified: 0,
    incomeSources: [],
    majorBills: [],
    subscriptions: [],
    oneTimeEntries: [],
    creditCards: [],
    advances: [],
    budgets: {},
    wallet: { checks: [], snoozed: null },
    paidHistory: {},
    paidAt: {},
    coverLog: {},
    dismissedLate: {},
    forcedLate: {},
    deferred: {},
    covered: {},
    removedOccurrences: {},
    activityLog: [],
    overrides: {},
    settings: {
      theme: 'system',
      accent: 'blue',
      accentCustom: '#378ADD',
      currency: 'USD',
      firstDayOfWeek: 0,
      lateGraceDays: 0,
      needsAttentionLookaheadDays: 7,
      incomeNeedsAttentionLookaheadDays: 1,
      autoDeductCardPayments: true,
      installDate: null,
      dateFormat: 'short',
      density: 'comfortable',
      customCss: '',
      sectionColors: {
        majorBills: '#D85A5A',
        subscriptions: '#D8A857',
        creditCards: '#8B6FD6',
        incomeSources: '#4FAE6B',
        oneTimePayments: '#D8845A',
        oneTimeIncome: '#4FAE6B',
        advances: '#5AA8D8'
      },
      walletEnabled: true,
      walletMonthlyCheck: true,
      walletNegative: false,
      walletOverdraftLimit: 0,
      backupReminderEnabled: true,
      hapticsEnabled: true,
      lastBackupReminderShown: null
    }
  };
}

function Icon({ name }) {
  const paths = {
    home: 'M3 12l9-9 9 9M5 10v10h14V10',
    calendar: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
    settings: 'M 18.24 8.40 L 20.79 9.28 L 20.79 14.72 L 18.24 15.60 L 18.75 18.25 L 14.04 20.97 L 12.00 19.20 L 9.96 20.97 L 5.25 18.25 L 5.76 15.60 L 3.21 14.72 L 3.21 9.28 L 5.76 8.40 L 5.25 5.75 L 9.96 3.03 L 12.00 4.80 L 14.04 3.03 L 18.75 5.75 Z M 8.8 12 A 3.2 3.2 0 1 0 15.2 12 A 3.2 3.2 0 1 0 8.8 12 Z',
    alert: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    allbills: 'M9 2h6l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM14 2v6h6M9 13h6M9 17h6',
    bag: 'M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2',
    wallet: 'M4 6.5A2.5 2.5 0 016.5 4H17v3.5M4 6.5V18a2 2 0 002 2h14V7.5H6.5A2.5 2.5 0 014 6.5zM16.5 14h.01',
    refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6'
  };
  return h('svg', {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
  }, h('path', { d: paths[name] || '' }));
}

const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  const query = `(max-width: ${MOBILE_BREAKPOINT}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);

    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    setIsMobile(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return isMobile;
}

function mobileTabs(walletOn) {
  return [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'overview', label: 'Overview', icon: 'calendar' },
    { id: 'add', label: 'Add', isAdd: true },
    walletOn ? { id: 'spending', label: 'Wallet', icon: 'wallet' } : { id: 'spending', label: 'Spending', icon: 'bag' },
    { id: 'allbills', label: 'Bills', icon: 'allbills' }
  ];
}

const TAB_FOR_PAGE = {
  home: 'home',
  overview: 'overview',
  spending: 'spending',
  allbills: 'allbills',
  creditcards: 'allbills'
};

function MobileTabBar({ page, setPage, onAdd, attentionCount, walletOn }) {
  const activeTab = TAB_FOR_PAGE[page] || page;
  return h('nav', { className: 'mobile-tabbar' },
    mobileTabs(walletOn).map((tab) => {

      if (tab.isAdd) {
        return h('button', {
          key: tab.id,
          className: 'mobile-tab-add',
          onClick: () => { haptic('medium'); onAdd(); },
          'aria-label': 'Add'
        },
          h('span', { className: 'mobile-tab-add-disc' },
            h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round' },
              h('path', { d: 'M12 5v14M5 12h14' })
            )
          )
        );
      }
      const active = activeTab === tab.id;
      const badge = (tab.id === 'allbills' && attentionCount > 0) ? attentionCount : null;
      return h('button', {
        key: tab.id,
        className: `mobile-tab${active ? ' active' : ''}`,
        onClick: () => setPage(tab.id),
        'aria-label': tab.label,
        'aria-current': active ? 'page' : undefined
      },
        h('span', { className: 'mobile-tab-icon' },
          h(Icon, { name: tab.icon }),
          badge != null ? h('span', { className: 'mobile-tab-badge' }, badge > 99 ? '99+' : badge) : null
        ),
        h('span', { className: 'mobile-tab-label' }, tab.label)
      );
    })
  );
}

function MobileHeader({ title, titleEl, onSettings, onBack, onSync, lastExported }) {
  return h('header', { className: 'mobile-header' },
    h('div', { className: 'mobile-header-left' },
      onBack
        ? h('button', { className: 'mobile-header-back', onClick: onBack, 'aria-label': 'Back' }, '\u2039')
        : (onSync
            ? h('button', { className: 'mobile-header-sync-group', onClick: onSync, 'aria-label': 'Sync data' },
                h('span', { className: 'mobile-header-sync-icon' },
                  h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                    h('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6' })
                  )
                ),
                h('span', { className: 'mobile-header-sync-label' }, lastExported || 'Not synced')
              )
            : null)
    ),
    titleEl || h('h1', { className: 'mobile-header-title' }, title || 'Finance Calendar'),
    h('div', { className: 'mobile-header-right' },
      onSettings
        ? h('button', { className: 'mobile-header-settings', onClick: onSettings, 'aria-label': 'Settings' },
            h('svg', { width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
              h('circle', { cx: 12, cy: 12, r: 3 }),
              h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' })
            )
          )
        : null
    )
  );
}

const MOBILE_SUBPAGES = ['creditcards'];

function useSheetDismiss(onClose) {
  const startY = useRef(null);
  const dragY = useRef(0);
  const sheetRef = useRef(null);

  function findSheet(el) {
    while (el && !(el.classList && el.classList.contains('modal-content'))) el = el.parentElement;
    return el;
  }
  function onTouchStart(e) {
    startY.current = e.touches[0].clientY;
    sheetRef.current = findSheet(e.currentTarget);
  }
  function onTouchMove(e) {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    dragY.current = Math.max(0, dy);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dragY.current}px)`;
  }
  function onTouchEnd() {
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.18s ease';
      sheetRef.current.style.transform = '';
      const el = sheetRef.current;
      setTimeout(() => { if (el) el.style.transition = ''; }, 200);
    }
    if (dragY.current > 90) onClose();
    startY.current = null;
    dragY.current = 0;
  }
  return { onTouchStart, onTouchMove, onTouchEnd };
}

function CloseX({ onClick }) {
  return h('button', { className: 'modal-x', onClick, 'aria-label': 'Close' },
    h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.8, strokeLinecap: 'round' },
      h('path', { d: 'M6 6l12 12M18 6L6 18' })
    )
  );
}

function Sheet({ title, sub, head, onClose, foot, tall, className, children }) {
  const overlay = useOverlayDismiss(onClose);
  const drag = useSheetDismiss(onClose);
  return h('div', Object.assign({ className: 'modal-overlay' }, overlay),
    h('div', {
      className: ['modal-content', tall ? 'tall' : '', className || ''].filter(Boolean).join(' '),
      role: 'dialog',
      'aria-modal': true
    },
      h('div', { className: 'sheet-head', onTouchStart: drag.onTouchStart, onTouchMove: drag.onTouchMove, onTouchEnd: drag.onTouchEnd },
        head || h('div', { className: 'sheet-heading' },
          h('p', { className: 'sheet-title' }, title),
          sub ? h('p', { className: 'sheet-sub' }, sub) : null
        ),
        h(CloseX, { onClick: onClose })
      ),
      h('div', { className: 'sheet-body' }, children),
      foot ? h('div', { className: 'sheet-foot' }, foot) : null
    )
  );
}

function Field({ label, hint, children }) {
  return h('div', { className: 'setup-field' },
    label ? h('label', null, label) : null,
    children,
    hint ? h('p', { className: 'setup-hint' }, hint) : null
  );
}

function currencySymbol(currency) {
  return fmtCurrency(0, currency).replace(/[\d.,\s]/g, '') || '$';
}

function AmountField({ value, onChange, currency, autoFocus, placeholder, label, negative }) {
  return h('div', { className: 'amt-block' },
    label ? h('p', { className: 'qa-label' }, label) : null,
    h('label', { className: 'amt-field' },
      h('span', { className: 'amt-sym' }, `${negative ? '−' : ''}${currencySymbol(currency)}`),
      h('input', {
        className: 'amt-input',
        type: 'number',
        inputMode: 'decimal',
        placeholder: placeholder || '0',
        autoFocus,
        value,
        onChange: (e) => onChange(e.target.value)
      })
    )
  );
}

function PickChips({ options, value, onPick, labelFor }) {
  return h('div', { className: 'chip-row' },
    options.map((o) => h('button', {
      key: o,
      className: `pick-chip${value === o ? ' on' : ''}`,
      onClick: () => { haptic('light'); onPick(o); }
    }, labelFor ? labelFor(o) : o))
  );
}

function ChipScroller({ options, value, onPick, dotFor, reveal }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const on = reveal && el && el.querySelector('.pick-chip.on');
    if (on) el.scrollLeft = Math.max(0, on.offsetLeft - el.offsetLeft - 16);
  }, []);
  return h('div', { className: 'chip-scroll', ref },
    options.map((o) => h('button', {
      key: o,
      className: `pick-chip${value === o ? ' on' : ''}`,
      onClick: () => { haptic('light'); onPick(o); }
    },
      dotFor ? h('span', { className: 'pick-dot', style: { background: dotFor(o) } }) : null,
      o
    ))
  );
}

function openPicker(e) {
  try { if (e.currentTarget.showPicker) e.currentTarget.showPicker(); } catch (err) {}
}

function DateField({ value, onChange, settings, placeholder }) {
  return h('div', { className: `date-field${value ? '' : ' empty'}` },
    h('span', { className: 'date-field-text' },
      value
        ? formatDate(parseYmd(value), settings, { weekday: 'short', year: value.slice(0, 4) !== todayYmd().slice(0, 4) })
        : (placeholder || 'Pick a date')),
    h('svg', { className: 'date-field-icon', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('path', { d: 'M4 6h16v14H4zM8 3v5M16 3v5M4 11h16' })
    ),
    h('input', { type: 'date', value: value || '', onClick: openPicker, onChange: (e) => { if (e.target.value) onChange(e.target.value); } })
  );
}

function DateChips({ value, onChange, settings }) {
  const today = todayYmd();
  const yesterday = yesterdayYmd();
  const custom = value !== today && value !== yesterday;
  const pick = (d) => { haptic('light'); onChange(d); };
  return h('div', { className: 'date-chips' },
    h('button', { className: `pick-chip${value === today ? ' on' : ''}`, onClick: () => pick(today) }, 'Today'),
    h('button', { className: `pick-chip${value === yesterday ? ' on' : ''}`, onClick: () => pick(yesterday) }, 'Yesterday'),
    h('label', { className: `pick-chip date-chip${custom ? ' on' : ''}` },
      custom ? formatDate(parseYmd(value), settings) : 'Other day',
      h('input', { type: 'date', value, onClick: openPicker, onChange: (e) => { if (e.target.value) pick(e.target.value); } })
    )
  );
}

const FREQ_CHIP_LABELS = { none: 'Once', weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly', yearly: 'Yearly' };

function FreqChips({ value, onPick, withOnce }) {
  return h(ChipToggle, {
    wide: true,
    value,
    onChange: onPick,
    options: (withOnce ? FREQS : RECURRING_FREQS).map((f) => ({ id: f, label: FREQ_CHIP_LABELS[f] }))
  });
}

function SettingSwitch({ id, title, sub, checked, onChange }) {
  return h('label', { className: 'switch-row', htmlFor: id },
    h('span', { className: 'switch-text' },
      h('span', { className: 'switch-title' }, title),
      sub ? h('span', { className: 'switch-sub' }, sub) : null
    ),
    h('input', {
      type: 'checkbox',
      id,
      className: 'switch',
      checked,
      onChange: (e) => { haptic('light'); onChange(e.target.checked); }
    })
  );
}

function ActionRow({ title, sub, onClick, active, tone, mark }) {
  return h('button', { className: `action-row${active ? ' active' : ''}${tone ? ' ' + tone : ''}`, onClick },
    h('span', { className: 'action-text' },
      h('span', { className: 'action-title' }, title),
      sub ? h('span', { className: 'action-sub' }, sub) : null
    ),
    h('span', { className: 'action-mark' }, mark || '›')
  );
}

function DeleteRow({ label, sub, armedLabel, onConfirm }) {
  const [armed, setArmed] = useState(false);
  return h('div', { className: 'action-list' },
    h(ActionRow, {
      tone: 'danger',
      title: armed ? (armedLabel || 'Tap again to delete') : label,
      sub: armed ? 'This cannot be undone' : sub,
      onClick: () => {
        if (!armed) { haptic('warn'); setArmed(true); return; }
        haptic('heavy');
        onConfirm();
      }
    })
  );
}

function SectionHead({ title, caption, right }) {
  return h('div', { className: 'section-head' },
    h('div', { className: 'section-head-text' },
      h('p', { className: 'stats-title' }, title),
      caption ? h('p', { className: 'stats-caption' }, caption) : null
    ),
    right || null
  );
}

function Pager({ pages, index, onIndex }) {
  const ref = useRef(null);
  const placed = useRef(false);
  const settle = useRef(null);

  useEffect(() => () => clearTimeout(settle.current), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * el.clientWidth;
    if (!placed.current) {
      placed.current = true;
      el.scrollLeft = target;
      return;
    }
    if (Math.abs(el.scrollLeft - target) > 2) el.scrollTo({ left: target, behavior: 'smooth' });
  }, [index]);

  function onScroll(e) {
    const el = e.currentTarget;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (next !== index) onIndex(next);
    }, 90);
  }

  return h('div', { className: 'pager-wrap' },
    h('div', { className: 'pager-tabs' },
      h(ChipToggle, {
        wide: true,
        value: index,
        onChange: onIndex,
        options: pages.map((p, i) => ({ id: i, label: p.label }))
      })
    ),
    h('div', { className: 'pager', ref, onScroll },
      pages.map((p) => h('div', { key: p.id, className: 'pager-page' },
        h('div', { className: 'pager-page-inner' }, p.body)
      ))
    )
  );
}

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

const MAJOR_CATEGORIES = ['Rent/mortgage', 'Power', 'Water', 'Gas', 'Insurance', 'Car payment', 'Phone', 'Internet', 'Credit card', 'Other'];
const MINOR_CATEGORIES = ['Streaming', 'Gaming', 'Cloud storage', 'Memberships', 'Payment plan', 'Other'];
const ONE_TIME_PAYMENT_CATEGORIES = ['Groceries', 'Food & drink', 'Gas', 'Shopping', 'Household', 'Health', 'Transport', 'Entertainment', 'Pets', 'Gifts', 'Travel', 'Other'];
const ONE_TIME_INCOME_CATEGORIES = ['Paycheck', 'Bonus', 'Gift', 'Refund', 'Side income', 'Other'];

const COMMON_MAJOR_BILLS = [
  { name: 'Rent/mortgage', category: 'Rent/mortgage', freq: 'monthly' },
  { name: 'Electric', category: 'Power', freq: 'monthly' },
  { name: 'Water', category: 'Water', freq: 'monthly' },
  { name: 'Internet', category: 'Internet', freq: 'monthly' },
  { name: 'Phone', category: 'Phone', freq: 'monthly' },
  { name: 'Car payment', category: 'Car payment', freq: 'monthly' },
  { name: 'Car insurance', category: 'Insurance', freq: 'monthly' }
];

const COMMON_SUBSCRIPTIONS = [
  { name: 'Spotify', category: 'Streaming', freq: 'monthly' },
  { name: 'Netflix', category: 'Streaming', freq: 'monthly' },
  { name: 'Amazon Prime', category: 'Memberships', freq: 'monthly' },
  { name: 'iCloud storage', category: 'Cloud storage', freq: 'monthly' },
  { name: 'Gym membership', category: 'Memberships', freq: 'monthly' },
  { name: 'Xbox Game Pass', category: 'Gaming', freq: 'monthly' }
];

function blankEntry(defaults) {
  return {
    id: uid(),
    name: '',
    amount: '',
    amountMin: '',
    amountMax: '',
    useAmountRange: false,
    date: todayYmd(),
    dateEnd: '',
    useDateRange: false,
    freq: 'monthly',
    repeatUntil: '',
    useAvgEstimate: false,
    category: '',
    color: '',
    ...defaults
  };
}

function OnboardingWizard({ data, onComplete }) {
  const [phase, setPhase] = useState('welcome');
  const [step, setStep] = useState(0);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [markPastPaid, setMarkPastPaid] = useState(true);

  const [income, setIncome] = useState(
    data.incomeSources && data.incomeSources.length
      ? data.incomeSources
      : [blankEntry({ name: 'Paycheck', freq: 'biweekly', category: 'Income' })]
  );
  const [majorBills, setMajorBills] = useState(
    data.majorBills && data.majorBills.length ? data.majorBills : []
  );
  const [subscriptions, setSubscriptions] = useState(
    data.subscriptions && data.subscriptions.length ? data.subscriptions : []
  );
  const [creditCards, setCreditCards] = useState(
    data.creditCards && data.creditCards.length ? data.creditCards : []
  );

  const steps = [
    { title: 'Your income', subtitle: 'When does money come in?' },
    { title: 'Your bills', subtitle: 'The essentials you pay every month.' },
    { title: 'Subscriptions', subtitle: 'The smaller recurring stuff.' },
    { title: 'Credit cards', subtitle: 'Optional \u2014 track balances and payments. You can skip this.' }
  ];

  function updateRow(list, setList, id, field, value) {
    setList(list.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, [field]: value };
      if (field === 'category' && value === PAYMENT_PLAN && !row.repeatUntil && next.freq !== 'none') {
        next.repeatUntil = untilForCount(next.date, next.freq, defaultPlanCount(next.freq));
      }
      return next;
    }));
  }

  function addRow(list, setList, defaults) {
    setList([...list, blankEntry(defaults)]);
  }

  function removeRow(list, setList, id) {
    setList(list.filter((row) => row.id !== id));
  }

  function cleanList(list) {
    return list
      .filter((row) => row.name.trim() !== '')
      .map((row) => ({
        ...row,
        amount: row.amount === '' ? 0 : parseFloat(row.amount) || 0,
        amountMin: row.amountMin === '' ? 0 : parseFloat(row.amountMin) || 0,
        amountMax: row.amountMax === '' ? 0 : parseFloat(row.amountMax) || 0
      }))
      .filter((row) => row.useAmountRange ? (row.amountMin > 0 || row.amountMax > 0) : row.amount > 0);
  }

  function handleNext() {
    haptic('light');
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      const cleanedBills = cleanList(majorBills);
      const cleanedSubs = cleanList(subscriptions);
      const cleanedCards = cleanCreditCards(creditCards);

      let finalData = {
        ...data,
        incomeSources: cleanList(income),
        majorBills: cleanedBills,
        subscriptions: cleanedSubs,
        creditCards: cleanedCards
      };

      if (markPastPaid) {
        const paid = { ...(finalData.paidHistory || {}) };
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const y = today.getFullYear();
        const m = today.getMonth();
        const markIfPast = (entryId, dueDay) => {
          if (!dueDay) return;
          const occ = new Date(y, m, Math.min(dueDay, new Date(y, m + 1, 0).getDate()));
          occ.setHours(0, 0, 0, 0);
          if (occ < today) {
            const occStr = `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, '0')}-${String(occ.getDate()).padStart(2, '0')}`;
            paid[`${entryId}|${occStr}`] = true;
          }
        };
        cleanedBills.forEach((b) => markIfPast(b.id, dayOfMonthFor(b)));
        cleanedSubs.forEach((s) => markIfPast(s.id, dayOfMonthFor(s)));
        cleanedCards.forEach((c) => { if (c.hasRecurringPayment) markIfPast(`cc-${c.id}`, dayOfMonthFor(c)); });
        finalData = { ...finalData, paidHistory: paid };
      }

      haptic('success');
      onComplete(finalData);
    }
  }

  function dayOfMonthFor(entry) {
    const raw = entry.dueDate || entry.date || entry.paymentDate;
    if (!raw) return null;
    const parts = String(raw).split('-');
    if (parts.length === 3) return parseInt(parts[2], 10);
    const d = new Date(raw);
    return isNaN(d) ? null : d.getDate();
  }

  function cleanCreditCards(list) {
    return list
      .filter((c) => c.name.trim() !== '')
      .map((c) => ({
        ...c,
        totalDebt: c.totalDebt === '' ? 0 : parseFloat(c.totalDebt) || 0,
        amountPaid: c.amountPaid === '' ? 0 : parseFloat(c.amountPaid) || 0,
        paymentAmount: c.paymentAmount === '' ? 0 : parseFloat(c.paymentAmount) || 0,
        apr: c.apr === '' ? 0 : parseFloat(c.apr) || 0,
        balanceDate: c.balanceDate || todayYmd()
      }));
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  let body;
  if (step === 0) {
    body = h(EntryList, {
      rows: income,
      categories: null,
      namePlaceholder: 'e.g. Main job paycheck',
      onChange: (id, field, value) => updateRow(income, setIncome, id, field, value),
      onAdd: () => addRow(income, setIncome, { freq: 'biweekly', category: 'Income' }),
      onRemove: (id) => removeRow(income, setIncome, id),
      addLabel: 'Add another income source',
      dateLabel: 'Next pay date',
      settings: data.settings
    });
  } else if (step === 1) {
    body = h(EntryList, {
      rows: majorBills,
      categories: MAJOR_CATEGORIES,
      namePlaceholder: 'e.g. Rent',
      suggestions: COMMON_MAJOR_BILLS,
      onAddPreset: (p) => { haptic('light'); setMajorBills([...majorBills, blankEntry(p)]); },
      onChange: (id, field, value) => updateRow(majorBills, setMajorBills, id, field, value),
      onAdd: () => addRow(majorBills, setMajorBills, { category: 'Other' }),
      onRemove: (id) => removeRow(majorBills, setMajorBills, id),
      addLabel: 'Add your own',
      dateLabel: 'Due date',
      settings: data.settings,
      emptyHint: 'Tap the bills you have \u2014 each one becomes a card you can fill in.'
    });
  } else if (step === 2) {
    body = h(EntryList, {
      rows: subscriptions,
      categories: MINOR_CATEGORIES,
      namePlaceholder: 'e.g. Spotify',
      suggestions: COMMON_SUBSCRIPTIONS,
      onAddPreset: (p) => { haptic('light'); setSubscriptions([...subscriptions, blankEntry(p)]); },
      onChange: (id, field, value) => updateRow(subscriptions, setSubscriptions, id, field, value),
      onAdd: () => addRow(subscriptions, setSubscriptions, { freq: 'monthly', category: 'Streaming' }),
      onRemove: (id) => removeRow(subscriptions, setSubscriptions, id),
      addLabel: 'Add your own',
      dateLabel: 'Billing date',
      settings: data.settings,
      emptyHint: 'Tap any you pay for \u2014 skip the rest.'
    });
  } else {
    body = h(CreditCardEntryList, {
      cards: creditCards,
      settings: data.settings,
      onChange: (id, field, value) => setCreditCards(creditCards.map((c) => (c.id === id ? { ...c, [field]: value } : c))),
      onAdd: () => setCreditCards([...creditCards, blankCreditCard()]),
      onRemove: (id) => setCreditCards(creditCards.filter((c) => c.id !== id))
    });
  }

  async function handleImportFromFile() {
    setImportError(null);
    setImporting(true);
    const result = await window.api.importData();
    setImporting(false);
    if (result.success) {
      onComplete(result.data, { imported: true });
    } else if (!result.canceled) {
      setImportError(result.error || 'Import failed. Please check the file and try again.');
    }
  }

  if (phase === 'welcome') {
    return h('div', { className: 'wizard-shell' },
      h('div', { className: 'wizard-scroll wizard-welcome' },
        h('div', { className: 'welcome-hero' },
          h('div', { className: 'welcome-icon' },
            h('svg', { width: 56, height: 56, viewBox: '0 0 512 512' },
              h('rect', { width: 512, height: 512, rx: 115, fill: '#1f2a37' }),
              h('rect', { x: 96, y: 288, width: 58, height: 128, rx: 11, fill: '#4a9d6e' }),
              h('rect', { x: 188, y: 222, width: 58, height: 194, rx: 11, fill: '#5aa9d0' }),
              h('rect', { x: 280, y: 320, width: 58, height: 96, rx: 11, fill: '#4a9d6e' }),
              h('rect', { x: 372, y: 156, width: 58, height: 260, rx: 11, fill: '#5aa9d0' }),
              h('polyline', { points: '125,262 217,192 309,286 401,120', fill: 'none', stroke: '#fff', strokeWidth: 16, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.92 }),
              h('circle', { cx: 401, cy: 120, r: 18, fill: '#fff' })
            )
          ),
          h('h1', { className: 'welcome-title' }, 'Finance Calendar'),
          h('p', { className: 'welcome-tagline' }, 'See every bill, payment, and paycheck on one simple calendar.')
        ),
        h('div', { className: 'welcome-points' },
          h('div', { className: 'welcome-point' },
            h('span', { className: 'welcome-point-emoji' }, '\u{1F4C5}'),
            h('div', null,
              h('p', { className: 'welcome-point-title' }, 'Everything in one place'),
              h('p', { className: 'welcome-point-sub' }, 'Bills, subscriptions, and income laid out by date.'))
          ),
          h('div', { className: 'welcome-point' },
            h('span', { className: 'welcome-point-emoji' }, '\u2705'),
            h('div', null,
              h('p', { className: 'welcome-point-title' }, 'Know what\u2019s left'),
              h('p', { className: 'welcome-point-sub' }, 'Check off what\u2019s paid and see your real balance.'))
          ),
          h('div', { className: 'welcome-point' },
            h('span', { className: 'welcome-point-emoji' }, '\u{1F512}'),
            h('div', null,
              h('p', { className: 'welcome-point-title' }, 'Yours, on your device'),
              h('p', { className: 'welcome-point-sub' }, 'No account, no server. Your data stays with you.'))
          )
        )
      ),
      h('div', { className: 'wizard-foot-single' },
        h('button', { className: 'primary wizard-cta', onClick: () => { haptic('medium'); setPhase('setup'); } }, 'Get started'),
        h('button', { className: 'wizard-import-link', onClick: () => { haptic('light'); setPhase('import'); } }, 'I have a backup to import')
      )
    );
  }

  if (phase === 'import') {
    return h('div', { className: 'wizard-shell' },
      h('div', { className: 'wizard-scroll' },
        h('div', { className: 'wizard-head' },
          h('h2', { className: 'wizard-title' }, 'Import your backup'),
          h('p', { className: 'wizard-sub' },
            'Do you have a .json backup from another browser or device that you\u2019d like to restore?')
        ),
        h('div', { className: 'wizard-import-actions' },
          h('button', {
            className: 'primary',
            onClick: handleImportFromFile,
            disabled: importing
          }, importing ? 'Importing\u2026' : 'Yes \u2014 import my backup file'),
          h('button', { onClick: () => setPhase('setup') }, 'No \u2014 start fresh'),
          importError ? h('p', { className: 'form-msg bad' }, importError) : null
        ),
        h('p', { className: 'setup-hint' },
          'Import loads your backup and takes you straight into the app with all your existing data. Start fresh takes you through the quick setup.')
      )
    );
  }

  return h('div', { className: 'wizard-shell' },
    h('div', { className: 'wizard-scroll' },
      h('div', { className: 'wizard-progress' },
        steps.map((s, i) => h('div', { key: i, className: `wizard-step-dot${i <= step ? ' active' : ''}` }))
      ),
      h('div', { className: 'wizard-head' },
        h('p', { className: 'wizard-step' }, `Step ${step + 1} of ${steps.length}`),
        h('h2', { className: 'wizard-title' }, steps[step].title),
        h('p', { className: 'wizard-sub' }, steps[step].subtitle)
      ),
      body,
      (step === steps.length - 1 && new Date().getDate() > 1)
        ? h('div', { className: 'switch-list wizard-midmonth' },
            h(SettingSwitch, {
              id: 'wiz-midmonth',
              title: 'Bills earlier this month are already paid',
              sub: 'Since you\u2019re starting mid-month, bills whose date has passed get checked off so nothing shows up as late. You can uncheck any of them later.',
              checked: markPastPaid,
              onChange: setMarkPastPaid
            })
          )
        : null
    ),
    h('div', { className: 'wizard-foot' },
      step > 0 ? h('button', { onClick: handleBack }, 'Back') : null,
      h('button', { className: 'primary', onClick: handleNext }, step < steps.length - 1 ? 'Next' : 'Finish setup')
    )
  );
}

function EntryList({ rows, categories, namePlaceholder, suggestions, onAddPreset, onChange, onAdd, onRemove, addLabel, dateLabel, emptyHint, settings }) {
  const usedNames = new Set(rows.map((r) => r.name.trim().toLowerCase()));
  const availableChips = (suggestions || []).filter((s) => !usedNames.has(s.name.toLowerCase()));
  return h('div', { className: 'setup-list' },
    rows.length === 0 && emptyHint
      ? h('p', { className: 'setup-empty-hint' }, emptyHint)
      : null,
    rows.map((row) =>
      h(EntryCard, {
        key: row.id,
        row,
        categories,
        namePlaceholder,
        dateLabel,
        settings,
        onChange: (field, value) => onChange(row.id, field, value),
        onRemove: () => onRemove(row.id)
      })
    ),
    availableChips.length
      ? h('div', { className: 'setup-chips' },
          availableChips.map((s) =>
            h('button', { key: s.name, className: 'setup-chip', onClick: () => onAddPreset(s) },
              h('span', { className: 'setup-chip-plus' }, '+'), s.name)
          ),
          h('button', { className: 'setup-chip custom', onClick: onAdd },
            h('span', { className: 'setup-chip-plus' }, '+'), addLabel || 'Add your own')
        )
      : h('button', { className: 'setup-add-row', onClick: onAdd }, `+ ${addLabel || 'Add another'}`)
  );
}

function EntryCard({ row, categories, namePlaceholder, dateLabel, settings, onChange, onRemove }) {
  const recurring = row.freq !== 'none';
  return h('div', { className: 'setup-entry' },
    h('div', { className: 'setup-entry-head' },
      h('input', {
        className: 'setup-entry-name',
        type: 'text',
        placeholder: namePlaceholder,
        value: row.name,
        onChange: (e) => onChange('name', e.target.value)
      }),
      h('button', { className: 'setup-entry-x', 'aria-label': 'Remove', onClick: onRemove },
        h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' },
          h('path', { d: 'M6 6l12 12M18 6L6 18' })
        )
      )
    ),
    h('div', { className: 'setup-entry-grid' },
      row.useAmountRange
        ? h(React.Fragment, null,
            h('div', { className: 'setup-field' },
              h('label', null, 'Min'),
              h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: row.amountMin, onChange: (e) => onChange('amountMin', e.target.value) })
            ),
            h('div', { className: 'setup-field' },
              h('label', null, 'Max'),
              h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: row.amountMax, onChange: (e) => onChange('amountMax', e.target.value) })
            )
          )
        : h('div', { className: 'setup-field' },
            h('label', null, 'Amount'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: row.amount, onChange: (e) => onChange('amount', e.target.value) })
          ),
      row.useDateRange
        ? h(React.Fragment, null,
            h(Field, { label: 'Start' }, h(DateField, { value: row.date, onChange: (d) => onChange('date', d), settings })),
            h(Field, { label: 'End' }, h(DateField, { value: row.dateEnd, onChange: (d) => onChange('dateEnd', d), settings, placeholder: 'Pick a day' }))
          )
        : h(Field, { label: dateLabel || 'Date' }, h(DateField, { value: row.date, onChange: (d) => onChange('date', d), settings })),
      h('div', { className: 'setup-field' },
        h('label', null, 'Repeats'),
        h('select', { value: row.freq, onChange: (e) => onChange('freq', e.target.value) },
          FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
      ),
      (recurring && row.repeatUntil)
        ? h(Field, { label: row.category === PAYMENT_PLAN ? 'Last payment' : 'Repeat ends' },
            h(DateField, { value: row.repeatUntil, onChange: (d) => onChange('repeatUntil', d), settings })
          )
        : null,
      categories
        ? h('div', { className: 'setup-field' },
            h('label', null, 'Category'),
            h('select', { value: row.category || '', onChange: (e) => onChange('category', e.target.value) },
              categories.map((c) => h('option', { key: c, value: c }, c)))
          )
        : null
    ),
    h('div', { className: 'setup-entry-links' },
      h('button', { className: 'setup-link', onClick: () => onChange('useAmountRange', !row.useAmountRange) },
        row.useAmountRange ? 'Fixed amount' : 'Amount range'),
      h('button', { className: 'setup-link', onClick: () => onChange('useDateRange', !row.useDateRange) },
        row.useDateRange ? 'Single date' : 'Date range'),
      recurring
        ? h('button', { className: 'setup-link', onClick: () => onChange('repeatUntil', row.repeatUntil ? '' : defaultRepeatUntil(row.date)) },
            row.repeatUntil ? 'Repeats forever' : 'End repeat')
        : null
    )
  );
}


function CreditCardEntryList({ cards, settings, onChange, onAdd, onRemove }) {
  return h('div', { className: 'setup-list' },
    cards.length === 0 ? h('p', { className: 'setup-empty-hint' },
      'No credit cards added — that’s fine, you can skip this entirely.') : null,
    cards.map((c) =>
      h('div', { key: c.id, className: 'setup-entry' },
        h('div', { className: 'setup-entry-head' },
          h('input', {
            className: 'setup-entry-name',
            type: 'text',
            placeholder: 'e.g. Chase Sapphire',
            value: c.name,
            onChange: (e) => onChange(c.id, 'name', e.target.value)
          }),
          h('button', { className: 'setup-entry-x', 'aria-label': 'Remove', onClick: () => onRemove(c.id) },
            h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' },
              h('path', { d: 'M6 6l12 12M18 6L6 18' })
            )
          )
        ),
        h('div', { className: 'setup-entry-grid' },
          h(Field, { label: 'Total debt' },
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: c.totalDebt, onChange: (e) => onChange(c.id, 'totalDebt', e.target.value) })
          ),
          h(Field, { label: 'Amount paid' },
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: c.amountPaid, onChange: (e) => onChange(c.id, 'amountPaid', e.target.value) })
          )
        ),
        h('div', { className: 'switch-list' },
          h(SettingSwitch, {
            id: `cc-recurring-${c.id}`,
            title: 'Has a monthly payment',
            checked: !!c.hasRecurringPayment,
            onChange: (v) => onChange(c.id, 'hasRecurringPayment', v)
          }),
          h(SettingSwitch, {
            id: `cc-apr-${c.id}`,
            title: 'Track interest',
            checked: !!c.useApr,
            onChange: (v) => onChange(c.id, 'useApr', v)
          })
        ),
        (c.hasRecurringPayment || c.useApr) ? h('div', { className: 'setup-entry-grid' },
          c.hasRecurringPayment ? h(Field, { label: 'Payment' },
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: c.paymentAmount, onChange: (e) => onChange(c.id, 'paymentAmount', e.target.value) })
          ) : null,
          c.hasRecurringPayment ? h(Field, { label: 'Due date' },
            h(DateField, { value: c.paymentDate, onChange: (d) => onChange(c.id, 'paymentDate', d), settings })
          ) : null,
          c.hasRecurringPayment ? h(Field, { label: 'Repeats' },
            h('select', { value: c.paymentFreq, onChange: (e) => onChange(c.id, 'paymentFreq', e.target.value) },
              FREQS.filter((f) => f !== 'none').map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
          ) : null,
          c.useApr ? h(Field, { label: 'APR %' },
            h('input', { type: 'number', inputMode: 'decimal', step: '0.01', placeholder: 'e.g. 24.99', value: c.apr, onChange: (e) => onChange(c.id, 'apr', e.target.value) })
          ) : null
        ) : null
      )
    ),
    h('button', { className: 'setup-add-row', onClick: onAdd }, '+ Add a credit card')
  );
}

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

const DONUT_COLORS = ['#D85A5A', '#D8A857', '#8B6FD6', '#4FAE6B', '#D8845A', '#5AA8D8', '#C75AA8', '#7A8C5A', '#4FAEA0', '#7FC44F', '#B15AC7', '#5A73C7'];

const OVERDUE_FOLD = 3;

function PushedMark({ title }) {
  return h('span', { className: 'push-mark', title },
    h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('path', { d: 'M4 12h14' }),
      h('path', { d: 'M13 7l5 5-5 5' })
    )
  );
}

function BillChecklist({ rows, data, currency, onToggle, onOpen }) {
  return h('div', { className: 'bill-checklist' },
    rows.map((o) => {
      const { paid, late } = lateState(data, o);
      const accentColor = getEntryColor(o, data) || '#D85A5A';
      return h('div', {
        key: `${o.id}-${o.occDate}`,
        className: `bill-check-row${paid ? ' paid' : ''}`,
        onClick: () => onOpen(o)
      },
        o.autoRepay
          ? h('span', { className: 'auto-mark', title: 'Taken from your paycheck automatically' }, 'Auto')
          : h('input', {
              type: 'checkbox',
              checked: paid,
              onClick: (e) => e.stopPropagation(),
              onChange: () => onToggle(o),
              'aria-label': `Mark ${o.name} paid`
            }),
        h('span', { className: 'bill-check-accent', style: { background: accentColor } }),
        h('div', { className: 'bill-check-text' },
          h('p', { className: 'bill-check-name' },
            late ? h('span', { className: 'late-dot', title: 'Late' }) : null,
            o.pushedTo ? h(PushedMark, { title: `Moved to ${formatDate(parseYmd(o.pushedTo), data.settings)}` }) : null,
            o.name
          ),
          h('p', { className: 'bill-check-sub' },
            `${formatDate(parseYmd(o.occDate), data.settings)} \u00b7 ${o.category || (FREQ_LABELS[o.freq] || o.freq)}`)
        ),
        h('span', { className: 'bill-check-amount' },
          occAmountLabel(o, currency),
          o.covered > 0 ? h('span', { className: 'bill-check-of' },
            `of ${fmtCurrency(o.amount + o.covered, currency)}`) : null
        )
      );
    })
  );
}

function BillTileGrid({ rows, data, currency, onToggle, onOpen }) {
  return h('div', { className: 'bill-tile-grid' },
    rows.map((o) => {
      const { paid, late } = lateState(data, o);
      const accentColor = getEntryColor(o, data) || '#D85A5A';
      return h('div', {
        key: `${o.id}-${o.occDate}`,
        className: `bill-tile${paid ? ' paid' : ''}`,
        style: { borderLeft: `3px solid ${accentColor}` },
        onClick: () => onOpen(o)
      },
        h('div', { className: 'bill-tile-top' },
          h('p', { className: 'bill-tile-name' },
            late ? h('span', { className: 'late-dot', title: 'Late' }) : null,
            o.pushedTo ? h(PushedMark, { title: `Moved to ${formatDate(parseYmd(o.pushedTo), data.settings)}` }) : null,
            o.name
          ),
          o.autoRepay
            ? h('span', { className: 'auto-mark' }, 'Auto')
            : h('input', {
                type: 'checkbox',
                checked: paid,
                onClick: (e) => e.stopPropagation(),
                onChange: () => onToggle(o),
                'aria-label': `Mark ${o.name} paid`
              })
        ),
        h('p', { className: 'bill-tile-amount' },
          occAmountLabel(o, currency),
          o.covered > 0 ? h('span', { className: 'bill-tile-of' },
            `of ${fmtCurrency(o.amount + o.covered, currency)}`) : null
        ),
        h('p', { className: 'bill-tile-sub' },
          `${formatDate(parseYmd(o.occDate), data.settings)} \u2014 ${o.category || (FREQ_LABELS[o.freq] || o.freq)}`)
      );
    })
  );
}

function NextCheckCard({ data, currency, nextCheck, renderList, onPrev, onNext }) {
  const [overdueOpen, setOverdueOpen] = useState(false);
  const { check, windowStart, windowEnd, bills, due, checkAmount, estimate, overdueCount, period, hasPrev, hasNext, pushedOut, spent, spendStart, takes } = nextCheck;
  const dateLabel = formatDate(windowEnd, data.settings, { weekday: true });

  const headingText = period === 0
    ? 'Before your next paycheck'
    : period === 1 ? 'The next pay period' : `${period} pay periods ahead`;

  const whenText = check
    ? `${check.name} \u00b7 ${dateLabel}`
    : `No paycheck scheduled \u2014 showing bills through ${dateLabel}`;

  const noteText = overdueCount > 0
    ? `${overdueCount} overdue \u00b7 ${bills.length} to pay`
    : `${bills.length} to pay`;

  const todayStr = todayYmd();
  const overdue = bills.filter((o) => o.occDate < todayStr);
  const upcoming = bills.filter((o) => o.occDate >= todayStr);
  const shortfall = due + spent - checkAmount;
  const billsPct = checkAmount > 0 ? Math.min(100, (due / checkAmount) * 100) : 0;
  const spentPct = checkAmount > 0 ? Math.max(0, Math.min(100 - billsPct, (spent / checkAmount) * 100)) : 0;
  const rangeText = `${formatDate(windowStart, data.settings)} \u2013 ${formatDate(windowEnd, data.settings)}`;

  return h('section', { className: `nextcheck${overdueCount > 0 ? ' urgent' : ''}` },
    h('div', { className: 'nextcheck-top' },
      h('div', { className: 'nextcheck-when' },
        h('p', { className: 'nextcheck-label' }, headingText),
        h('p', { className: 'nextcheck-sub' }, whenText)
      ),
      h('div', { className: 'nextcheck-figure' },
        h('p', { className: 'nextcheck-due' }, fmtCurrency(due, currency)),
        h('p', { className: 'nextcheck-note' }, noteText)
      )
    ),

    (hasPrev || hasNext) ? h('div', { className: 'nextcheck-nav' },
      h('button', {
        className: 'nextcheck-nav-btn',
        onClick: onPrev,
        disabled: !hasPrev,
        'aria-label': 'Previous pay period'
      }, '\u2039'),
      h('span', { className: 'nextcheck-nav-range' }, rangeText),
      h('button', {
        className: 'nextcheck-nav-btn',
        onClick: onNext,
        disabled: !hasNext,
        'aria-label': 'Next pay period'
      }, '\u203a')
    ) : null,

    checkAmount > 0 ? h('div', { className: 'nextcheck-bar' },
      h('span', { className: `nextcheck-bar-fill${shortfall > 0 ? ' over' : ''}`, style: { width: `${billsPct}%` } }),
      spent > 0 ? h('span', {
        className: `nextcheck-bar-spent${shortfall > 0 ? ' over' : ''}`,
        style: { width: `${spentPct}%` }
      }) : null
    ) : null,

    checkAmount > 0 ? h('p', { className: `nextcheck-verdict${shortfall > 0 ? ' short' : ''}` },
      shortfall > 0
        ? `${fmtCurrency(shortfall, currency)} more than this paycheck covers`
        : `${fmtCurrency(-shortfall, currency)} of this paycheck left after bills${spent > 0 ? ' and spending' : ''}`
    ) : null,

    spent > 0 ? h('p', { className: 'nextcheck-spent' },
      `${fmtCurrency(spent, currency)} spent on purchases since ${formatDate(spendStart, data.settings)}`
    ) : null,

    estimate ? h('p', { className: 'nextcheck-est' },
      `Paycheck estimated at ${fmtCurrency(estimate.amount, currency)} \u2014 the average of your last ${estimate.count}`
    ) : null,

    takes.length > 0 ? h('p', { className: 'nextcheck-est' },
      `${takes.map((t) => t.name.replace(/ payback$/, '')).join(' and ')} ${takes.length === 1 ? 'takes' : 'take'} ${fmtCurrency(takes.reduce((sum, t) => sum + t.amount, 0), currency)} back out of this paycheck \u2014 already counted above`
    ) : null,

    bills.length === 0
      ? h('p', { className: 'empty-state' },
          pushedOut.count > 0
            ? 'Everything here was moved to a later paycheck.'
            : period === 0 ? 'Nothing due before then \u2014 you\u2019re clear.' : 'Nothing due in this pay period.')
      : overdueCount > OVERDUE_FOLD
        ? h(React.Fragment, null,
            h('button', {
              className: 'overdue-fold',
              onClick: () => { haptic('light'); setOverdueOpen(!overdueOpen); },
              'aria-expanded': overdueOpen
            },
              h('span', { className: 'late-dot' }),
              h('span', { className: 'overdue-fold-text' },
                h('span', { className: 'overdue-fold-title' }, `${overdueCount} overdue`),
                h('span', { className: 'overdue-fold-sub' }, overdueOpen ? 'Tap to hide them' : 'Tap to see them and tick off what you\u2019ve paid')
              ),
              h('span', { className: 'overdue-fold-amt' }, fmtCurrency(overdue.reduce((sum, o) => sum + o.amount, 0), currency)),
              h('span', { className: `drop-chevron${overdueOpen ? ' open' : ''}` }, '\u203a')
            ),
            overdueOpen ? renderList(overdue) : null,
            upcoming.length > 0 ? renderList(upcoming) : null
          )
        : renderList(bills),

    pushedOut.count > 0 ? h('p', { className: 'nextcheck-pushed' },
      h(PushedMark, { title: 'Moved to a later paycheck' }),
      `${pushedOut.count} moved to your ${formatDate(parseYmd(pushedOut.to), data.settings)} paycheck \u00b7 ${fmtCurrency(pushedOut.amount, currency)}`
    ) : null
  );
}

function HomePage({ data, setData, isMobile }) {
  const currency = data.settings.currency;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [priceModal, setPriceModal] = useState(null);
  const [billsOpen, setBillsOpen] = useState(false);
  const [period, setPeriod] = useState(0);

  const fin = useMonthFinancials(data, cursor);
  const nextCheck = useNextCheck(data, period);

  const now = new Date();
  const isCurrentMonth = cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();

  function togglePaid(o) {
    const wasPaid = isPaid(data, o.id, o.occDate);
    haptic(wasPaid ? 'light' : 'success');
    let next = togglePaidStatus(data, o.id, o.occDate);
    next = logActivity(next, `${wasPaid ? 'Unmarked' : 'Marked'} "${o.name}" as paid`);
    setData(next);
  }

  function changeMonth(delta) {
    setPeriod(0);
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  const netSoFar = fin.incomeReceived - fin.billsPaid;
  const leftToPay = Math.max(0, fin.totalBills - fin.billsPaid);
  const coveredPct = fin.totalBills > 0 ? Math.min(100, (fin.billsPaid / fin.totalBills) * 100) : 0;

  const Renderer = isMobile ? BillChecklist : BillTileGrid;
  const listProps = { data, currency, onToggle: togglePaid, onOpen: (o) => setPriceModal({ occ: o }) };
  const checkListProps = { ...listProps, onOpen: (o) => setPriceModal({ occ: o, inCheckCard: true }) };

  return h('div', { className: `home-page${isMobile ? ' mobile-home' : ''}` },
    h('div', { className: `home-wash${netSoFar >= 0 ? '' : ' neg'}` },
      h(MonthHeader, { cursor, onChange: changeMonth }),
      h('div', { className: 'home-hero' },
        h('p', { className: 'home-hero-label' }, isCurrentMonth ? 'So far this month' : `${MONTH_NAMES[cursor.getMonth()]} so far`),
        h('p', {
          className: 'home-hero-value',
          style: { color: netSoFar >= 0 ? 'var(--text-success)' : 'var(--late-red)' }
        }, `${netSoFar >= 0 ? '+' : ''}${fmtCurrency(netSoFar, currency)}`),
        h('p', { className: 'home-hero-sub' }, 'Money that came in, minus what you\u2019ve paid out')
      )
    ),

    isCurrentMonth ? h(NextCheckCard, {
      data, currency, nextCheck,
      renderList: (rows) => h(Renderer, Object.assign({ rows }, checkListProps)),
      onPrev: () => { haptic('light'); setPeriod(Math.max(0, nextCheck.period - 1)); },
      onNext: () => { haptic('light'); setPeriod(nextCheck.period + 1); }
    }) : null,

    h('section', { className: 'drop-card' },
      h('button', {
        className: 'drop-head',
        onClick: () => { haptic('light'); setBillsOpen((v) => !v); },
        'aria-expanded': billsOpen
      },
        h('span', { className: 'drop-head-text' },
          h('span', { className: 'drop-head-title' }, 'Bills this month'),
          h('span', { className: 'drop-head-sub' },
            `${fmtCurrency(fin.billsPaid, currency)} paid \u00b7 ${fmtCurrency(leftToPay, currency)} to go`)
        ),
        h('span', { className: 'drop-head-amt' }, fmtCurrency(fin.totalBills, currency)),
        h('span', { className: `drop-chevron${billsOpen ? ' open' : ''}` }, '\u203a')
      ),
      h('div', { className: 'drop-bar' },
        h('span', { className: 'drop-bar-fill', style: { width: `${coveredPct}%` } })
      ),
      billsOpen ? h('div', { className: 'drop-body' },
        fin.allTiles.length === 0
          ? h('p', { className: 'empty-state' }, 'Nothing scheduled this month.')
          : h(Renderer, Object.assign({ rows: fin.allTiles }, listProps))
      ) : null
    ),

    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal.occ, currency,
      inCheckCard: !!priceModal.inCheckCard,
      pushTo: nextCheck.pushTo,
      onClose: () => setPriceModal(null)
    }) : null
  );
}

function GlanceGrid({ fin, currency }) {
  const s = fin.monthSummary;
  const billsDelta = fin.totalBills - fin.lastMonthTotals.totalBills;
  const hasLast = fin.lastMonthTotals.totalBills > 0;
  const tiles = [
    s.biggestBill ? { label: 'Biggest bill', value: fmtCurrency(s.biggestBill.amount, currency), sub: s.biggestBill.name } : null,
    { label: 'Average payment', value: fmtCurrency(s.avgBill, currency), sub: `across ${s.billCount} ${s.billCount === 1 ? 'payment' : 'payments'}` },
    { label: 'Money in so far', value: fmtCurrency(fin.incomeReceived, currency), sub: `of ${fmtCurrency(fin.totalProjectedIncome, currency)} expected`, tone: 'good' },
    hasLast ? {
      label: 'vs last month',
      value: `${billsDelta > 0 ? '+' : billsDelta < 0 ? '−' : ''}${fmtCurrency(Math.abs(billsDelta), currency)}`,
      sub: Math.abs(billsDelta) < 1 ? 'about the same going out' : billsDelta > 0 ? 'more going out' : 'less going out',
      tone: Math.abs(billsDelta) < 1 ? null : billsDelta > 0 ? 'bad' : 'good'
    } : null
  ].filter(Boolean);

  return h('section', { className: 'stats-section' },
    h(SectionHead, { title: 'At a glance' }),
    h('div', { className: 'spend-stats' },
      tiles.map((t) => h('div', { key: t.label, className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, t.label),
        h('span', { className: `spend-stat-value${t.tone ? ' ' + t.tone : ''}` }, t.value),
        h('span', { className: 'spend-stat-sub' }, t.sub)
      ))
    )
  );
}

function ChipToggle({ options, value, onChange, wide }) {
  return h('div', { className: `chip-toggle${wide ? ' wide' : ''}`, role: 'tablist' },
    options.map((o) => h('button', {
      key: o.id,
      role: 'tab',
      'aria-selected': value === o.id,
      className: `chip-toggle-btn${value === o.id ? ' on' : ''}`,
      onClick: () => { haptic('light'); onChange(o.id); }
    }, o.label))
  );
}

function CashFlowChart({ points, currency, todayDay, colors }) {
  const [view, setView] = useState('cumulative');
  const [hoverIdx, setHoverIdx] = useState(null);

  if (points.length === 0) return null;

  const billsKey = view === 'cumulative' ? 'bills' : 'dailyBills';
  const incomeKey = view === 'cumulative' ? 'income' : 'dailyIncome';
  const netKey = view === 'cumulative' ? 'net' : 'dailyNet';

  const allVals = points.flatMap((p) => [p[billsKey], p[incomeKey], p[netKey]]);
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);

  const W = 360, H = 190, PAD_L = 8, PAD_R = 8, PAD_T = 14, PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const range = maxVal - minVal || 1;
  const xAt = (i) => PAD_L + i * stepX;
  const scaleY = (v) => PAD_T + innerH - ((v - minVal) / range) * innerH;
  const zeroY = scaleY(0);

  const pathFor = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${scaleY(p[key]).toFixed(1)}`).join(' ');
  const areaFor = (key) => `${pathFor(key)} L ${xAt(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${xAt(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const ticks = [1, 8, 15, 22, points.length].filter((d, i, arr) => d <= points.length && arr.indexOf(d) === i);
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;
  const last = points[points.length - 1];

  function pick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((x - PAD_L) / (stepX || 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  }

  const shown = hovered || last;
  const series = [
    { key: incomeKey, label: 'In', color: colors.income },
    { key: billsKey, label: 'Out', color: colors.bills },
    { key: netKey, label: 'Left', color: 'var(--accent)', signed: true }
  ];

  return h('section', { className: 'stats-section' },
    h(SectionHead, {
      title: 'Cash flow',
      caption: hovered ? `Day ${hovered.day}` : (view === 'cumulative' ? 'Totals so far on each day \u2014 drag across to see one' : 'What comes in and goes out each day'),
      right: h(ChipToggle, {
        value: view,
        onChange: (v) => { setView(v); setHoverIdx(null); },
        options: [{ id: 'cumulative', label: 'Running' }, { id: 'daily', label: 'Daily' }]
      })
    }),
    h('div', { className: 'cf-legend' },
      series.map((s) => h('span', { key: s.label, className: 'cf-legend-item' },
        h('span', { className: 'cf-legend-dot', style: { background: s.color } }),
        h('span', { className: 'cf-legend-label' }, s.label),
        h('span', { className: 'cf-legend-value' },
          `${s.signed && shown[s.key] > 0 ? '+' : ''}${fmtCompact(shown[s.key], currency)}`)
      ))
    ),
    h('svg', {
      viewBox: `0 0 ${W} ${H}`,
      className: 'cashflow-chart',
      onPointerDown: pick,
      onPointerMove: pick,
      onPointerLeave: () => setHoverIdx(null)
    },
      h('defs', null,
        h('linearGradient', { id: 'cf-net-fill', x1: 0, y1: 0, x2: 0, y2: 1 },
          h('stop', { offset: '0%', stopColor: 'var(--accent)', stopOpacity: 0.28 }),
          h('stop', { offset: '100%', stopColor: 'var(--accent)', stopOpacity: 0 })
        )
      ),
      [0.25, 0.5, 0.75].map((f) => h('line', {
        key: f, x1: PAD_L, x2: W - PAD_R, y1: PAD_T + innerH * f, y2: PAD_T + innerH * f,
        stroke: 'var(--border-tertiary)', strokeWidth: 1
      })),
      h('line', { x1: PAD_L, y1: zeroY, x2: W - PAD_R, y2: zeroY, stroke: 'var(--border-secondary)', strokeWidth: 1 }),
      todayDay ? h('line', {
        x1: xAt(todayDay - 1), x2: xAt(todayDay - 1), y1: PAD_T - 6, y2: H - PAD_B,
        stroke: 'var(--text-tertiary)', strokeWidth: 1, strokeDasharray: '3 3'
      }) : null,
      todayDay ? h('text', {
        x: xAt(todayDay - 1), y: PAD_T - 7, fontSize: 9, fill: 'var(--text-tertiary)',
        textAnchor: todayDay > points.length - 3 ? 'end' : todayDay < 3 ? 'start' : 'middle'
      }, 'today') : null,
      ticks.map((d) => h('text', {
        key: `t-${d}`, x: xAt(d - 1), y: H - 6, fontSize: 10, fill: 'var(--text-tertiary)',
        textAnchor: d === 1 ? 'start' : d === points.length ? 'end' : 'middle'
      }, d)),
      h('path', { d: areaFor(netKey), fill: 'url(#cf-net-fill)', stroke: 'none' }),
      h('path', { d: pathFor(billsKey), fill: 'none', stroke: colors.bills, strokeWidth: 2, strokeLinejoin: 'round' }),
      h('path', { d: pathFor(incomeKey), fill: 'none', stroke: colors.income, strokeWidth: 2, strokeLinejoin: 'round' }),
      h('path', { d: pathFor(netKey), fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.4, strokeLinejoin: 'round' }),
      hovered ? h('g', null,
        h('line', {
          x1: xAt(hoverIdx), x2: xAt(hoverIdx), y1: PAD_T, y2: H - PAD_B,
          stroke: 'var(--text-secondary)', strokeWidth: 1
        }),
        series.map((s) => h('circle', {
          key: s.label, cx: xAt(hoverIdx), cy: scaleY(hovered[s.key]), r: 3.5,
          fill: s.color, stroke: 'var(--bg-primary)', strokeWidth: 1.5
        }))
      ) : null
    )
  );
}

function CategoryDonut({ data: rows, currency, groupBy, setGroupBy, filter, setFilter }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const size = 140, r = 54, cx = 70, cy = 70;
  const circumference = 2 * Math.PI * r;

  let offsetAcc = 0;
  const segments = rows.map((row) => {
    const dash = row.pct * circumference;
    const seg = { ...row, dash, offset: offsetAcc };
    offsetAcc += dash;
    return seg;
  });

  return h('section', { className: 'stats-section' },
    h(SectionHead, {
      title: filter === 'income' ? 'Where it comes from' : 'Where it goes',
      caption: groupBy === 'source' ? 'Grouped by kind' : 'Grouped by category',
      right: h(ChipToggle, {
        value: filter,
        onChange: setFilter,
        options: [{ id: 'bills', label: 'Out' }, { id: 'income', label: 'In' }]
      })
    }),
    rows.length === 0
      ? h('p', { className: 'empty-state' }, 'Nothing to show this month.')
      : h('div', { className: 'donut-wrap' },
          h('svg', { viewBox: `0 0 ${size} ${size}`, className: 'donut' },
            h('circle', { cx, cy, r, fill: 'none', stroke: 'var(--bg-tertiary)', strokeWidth: 18 }),
            segments.map((seg, i) => h('circle', {
              key: i,
              cx, cy, r,
              fill: 'none',
              stroke: seg.color,
              strokeWidth: 18,
              strokeDasharray: `${Math.max(0, seg.dash - 1.5)} ${circumference - Math.max(0, seg.dash - 1.5)}`,
              strokeDashoffset: -seg.offset,
              transform: `rotate(-90 ${cx} ${cy})`
            })),
            h('text', { x: cx, y: cy - 2, textAnchor: 'middle', fontSize: 14, fontWeight: 700, fill: 'var(--text-primary)' }, fmtCompact(total, currency)),
            h('text', { x: cx, y: cy + 14, textAnchor: 'middle', fontSize: 10, fill: 'var(--text-tertiary)' }, 'this month')
          ),
          h('div', { className: 'donut-legend' },
            segments.map((seg, i) => h('div', { key: i, className: 'donut-legend-row' },
              h('span', { className: 'budget-swatch', style: { background: seg.color } }),
              h('span', { className: 'donut-legend-label' }, seg.label),
              h('span', { className: 'donut-legend-amt' }, fmtCurrency(seg.amount, currency)),
              h('span', { className: 'donut-legend-pct' }, `${Math.round(seg.pct * 100)}%`)
            ))
          )
        ),
    rows.length === 0 ? null : h('div', { className: 'stats-foot' },
      h(ChipToggle, {
        value: groupBy,
        onChange: setGroupBy,
        options: [{ id: 'source', label: 'By kind' }, { id: 'category', label: 'By category' }]
      })
    )
  );
}

function PriceOverrideModal(props) {
  const { data, occ } = props;
  if (occ.advanceId) {
    const advance = (data.advances || []).find((a) => a.id === occ.advanceId);
    if (advance) return h(AdvanceSheet, { data, setData: props.setData, advance, onClose: props.onClose });
  }
  const oneTime = occ.isOneTime || occ.sourceList === 'oneTimeEntries'
    ? data.oneTimeEntries.find((e) => e.id === occ.id)
    : null;
  if (oneTime) {
    return h(QuickAddModal, { data, setData: props.setData, entry: oneTime, onClose: props.onClose });
  }
  return h(OccurrenceHub, props);
}

function OccurrenceHub({ data, setData, occ, currency, inCheckCard, pushTo, onClose }) {
  const existing = getOverride(data, occ.id, occ.occDate);
  const initialPrice = existing && existing.amount !== undefined ? String(existing.amount) : '';
  const [price, setPrice] = useState(initialPrice);
  const [cover, setCover] = useState(() => {
    const already = coveredAmount(data, occ.id, occ.occDate);
    return already > 0 ? String(already) : '';
  });
  const [coverOpen, setCoverOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  function save() {
    if (price === initialPrice) { onClose(); return; }
    haptic('success');
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
    setData(logActivity({ ...data, overrides: next }, `Cleared price override for "${occ.name}"`));
    onClose();
  }

  const { paid, forced, late } = lateState(data, occ);
  const pushedTo = deferredTo(data, occ.id, occ.occDate);
  const covered = coveredAmount(data, occ.id, occ.occDate);
  const fullAmount = hasAmountOverride(existing) ? Number(existing.amount) || 0 : entryAmount(occ);
  const coverVal = Math.min(parseFloat(cover) || 0, fullAmount);
  const remaining = Math.max(0, fullAmount - coverVal);
  const isIncome = occ.kind === 'income';

  function applyCover() {
    haptic('success');
    let next = setCovered(data, occ.id, occ.occDate, coverVal);
    if (coverVal > 0 && pushTo && !pushedTo) {
      next = setDeferred(next, occ.id, occ.occDate, pushTo);
    }
    next = logActivity(next, coverVal > 0
      ? `Paid ${fmtCurrency(coverVal, currency)} of "${occ.name}"`
      : `Cleared the part payment on "${occ.name}"`);
    setData(next);
    setCoverOpen(false);
  }

  function togglePush() {
    haptic(pushedTo ? 'light' : 'medium');
    const target = pushedTo ? null : pushTo;
    let next = setDeferred(data, occ.id, occ.occDate, target);
    next = logActivity(next, target
      ? `Moved "${occ.name}" to the ${formatDate(parseYmd(target), data.settings)} paycheck`
      : `Moved "${occ.name}" back to this paycheck`);
    setData(next);
  }

  function togglePaid() {
    haptic(paid ? 'light' : 'success');
    let next = togglePaidStatus(data, occ.id, occ.occDate);
    next = logActivity(next, `${paid ? 'Unmarked' : 'Marked'} "${occ.name}" as paid`);
    setData(next);
  }

  function toggleLate() {
    haptic('warn');
    let next = toggleForcedLate(data, occ.id, occ.occDate);
    next = logActivity(next, `${forced ? 'Unmarked' : 'Marked'} "${occ.name}" as late`);
    setData(next);
  }

  function dismissLate() {
    haptic('light');
    const key = `${occ.id}|${occ.occDate}`;
    setData(logActivity(
      { ...data, dismissedLate: { ...data.dismissedLate, [key]: true } },
      `Dismissed late status for "${occ.name}"`));
  }

  function removeThisOccurrence() {
    setData(logActivity(removeOccurrence(data, occ.id, occ.occDate), `Removed "${occ.name}" from calendar for ${occ.occDate}`));
    onClose();
  }

  const editable = ['majorBills', 'subscriptions', 'incomeSources'].includes(occ.sourceList);

  function openEdit() {
    const entry = (data[occ.sourceList] || []).find((e) => e.id === occ.id);
    if (entry) setEditing({ ...entryToFormShape(entry), _isNew: false });
  }

  function saveEdit(cleaned) {
    setData(logActivity(applyEditedEntry(data, occ.sourceList, cleaned), `Edited "${cleaned.name}"`));
    setEditing(null);
    onClose();
  }

  if (editing) {
    return h(EntryFormModal, Object.assign(
      { data, entry: editing, onSubmit: saveEdit, onClose: () => setEditing(null), submitLabel: 'Save' },
      getEditModalConfig(occ.sourceList)
    ));
  }

  const dateLabel = formatDate(parseYmd(occ.occDate), data.settings, { weekday: true, year: true });
  const templateLabel = occ.isRange
    ? fmtRange(occ.amountMin, occ.amountMax, currency)
    : fmtCurrency(entryAmount(occ), currency);
  const showCheckActions = inCheckCard && !isIncome && !paid;

  return h(Sheet, {
    title: occ.name,
    sub: `${dateLabel} \u00b7 usually ${templateLabel}`,
    onClose,
    foot: h('div', { className: 'sheet-actions' },
      existing ? h('button', { onClick: clearOverride }, 'Clear price') : null,
      h('button', { className: 'primary', onClick: save }, price === initialPrice ? 'Done' : 'Save price')
    )
  },
    h(AmountField, {
      label: isIncome ? 'What actually came in' : 'What it actually cost this time',
      value: price,
      onChange: setPrice,
      currency,
      placeholder: String(Math.round(entryAmount(occ) * 100) / 100)
    }),
    h('p', { className: 'setup-hint tight' }, 'Only changes this date \u2014 every other date keeps the usual amount.'),

    showCheckActions ? h('div', { className: 'action-list' },
      pushTo ? h(ActionRow, {
        active: !!pushedTo,
        title: pushedTo ? `Moved to your ${formatDate(parseYmd(pushedTo), data.settings)} paycheck` : 'Pay it from the next paycheck',
        sub: pushedTo
          ? 'Tap to move it back to this paycheck'
          : `Moves it to your ${formatDate(parseYmd(pushTo), data.settings)} paycheck on Home \u2014 the due date on the calendar stays the same`,
        mark: pushedTo ? '\u2713' : '\u203a',
        onClick: togglePush
      }) : null,
      h(ActionRow, {
        active: covered > 0,
        title: covered > 0 ? `${fmtCurrency(covered, currency)} paid so far` : 'Pay part of it now',
        sub: covered > 0
          ? `${fmtCurrency(Math.max(0, fullAmount - covered), currency)} still owed`
          : 'Pay what you can now and the rest later',
        mark: h('span', { className: `drop-chevron${coverOpen ? ' open' : ''}` }, '\u203a'),
        onClick: () => { haptic('light'); setCoverOpen((v) => !v); }
      }),
      coverOpen ? h('div', { className: 'cover-panel' },
        h('input', {
          type: 'number',
          inputMode: 'decimal',
          placeholder: `Up to ${fmtCurrency(fullAmount, currency)}`,
          value: cover,
          onChange: (e) => setCover(e.target.value)
        }),
        h('div', { className: 'chip-row' },
          h('button', {
            className: 'pick-chip',
            onClick: () => { haptic('light'); setCover(String(Math.round((fullAmount / 2) * 100) / 100)); }
          }, `Half \u00b7 ${fmtCurrency(fullAmount / 2, currency)}`),
          cover !== '' ? h('button', {
            className: 'pick-chip',
            onClick: () => { haptic('light'); setCover(''); }
          }, 'Clear') : null
        ),
        h('p', { className: 'setup-hint tight' },
          coverVal > 0
            ? `${fmtCurrency(remaining, currency)} would still be owed`
            : 'Enter what you can put toward it now'),
        h('button', {
          className: 'cover-go',
          onClick: applyCover,
          disabled: coverVal <= 0 && covered <= 0
        },
          coverVal <= 0
            ? 'Clear the part payment'
            : (pushTo && !pushedTo)
              ? `Pay ${fmtCurrency(coverVal, currency)} \u00b7 rest from next paycheck`
              : `Pay ${fmtCurrency(coverVal, currency)} now`)
      ) : null
    ) : null,

    isIncome ? null : h('div', { className: 'action-list' },
      h(ActionRow, {
        active: paid,
        title: paid ? 'Paid' : 'Mark as paid',
        sub: paid ? 'Tap to undo' : 'Marks this date as paid',
        mark: paid ? '\u2713' : '\u203a',
        onClick: togglePaid
      }),
      forced
        ? h(ActionRow, { active: true, tone: 'late', title: 'Marked late', sub: 'Tap to clear', mark: '\u2713', onClick: toggleLate })
        : late
          ? h(ActionRow, { tone: 'late', title: 'Late', sub: 'Tap to clear the late flag', onClick: dismissLate })
          : paid ? null : h(ActionRow, { title: 'Mark as late', sub: 'Flags this date as late', onClick: toggleLate })
    ),

    editable ? h('div', { className: 'action-list' },
      h(ActionRow, {
        title: `Edit ${occ.name}`,
        sub: 'Change the amount, date or how often it repeats',
        onClick: openEdit
      })
    ) : null,

    h(DeleteRow, {
      label: 'Remove this date',
      sub: 'Only this date \u2014 the rest of the schedule stays',
      armedLabel: 'Tap again to remove',
      onConfirm: removeThisOccurrence
    })
  );
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_FULL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function fmtCompact(amount, currency) {
  const sym = currencySymbol(currency);
  const n = Math.round(Number(amount) || 0);
  const sign = n < 0 ? '\u2212' : '';
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}${sym}${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${sign}${sym}${abs}`;
}

function getDateRangeSpans(data, allBills, gridStart, gridEnd) {
  const spans = [];

  function addFromEntry(e, kind, sourceList) {
    if (!e.useDateRange || !e.date || !e.dateEnd) return;
    const baseStart = parseYmd(e.date);
    const baseEnd = parseYmd(e.dateEnd);
    if (baseEnd < baseStart) return;
    const offsetDays = daysBetween(baseStart, baseEnd);

    if (!e.freq || e.freq === 'none') {
      if (baseEnd >= gridStart && baseStart <= gridEnd) {
        spans.push({ id: e.id, occDate: e.date, name: e.name, kind, sourceList, color: e.color, startDate: baseStart, endDate: baseEnd });
      }
      return;
    }

    const removed = data.removedOccurrences || {};
    expandEntry(e, gridStart, gridEnd).forEach((occ) => {
      if (removed[`${e.id}|${occ.occDate}`]) return;
      const occStart = parseYmd(occ.occDate);
      const occEnd = new Date(occStart);
      occEnd.setDate(occEnd.getDate() + offsetDays);
      if (occEnd >= gridStart && occStart <= gridEnd) {
        spans.push({ id: e.id, occDate: occ.occDate, name: e.name, kind, sourceList, color: e.color, startDate: occStart, endDate: occEnd });
      }
    });
  }

  function sourceListFor(e, fallback) {
    if (data.majorBills.includes(e)) return 'majorBills';
    if (data.subscriptions.includes(e)) return 'subscriptions';
    if (data.incomeSources.includes(e)) return 'incomeSources';
    return fallback;
  }

  allBills.forEach((e) => addFromEntry(e, 'bill', sourceListFor(e, 'creditCards')));
  data.incomeSources.forEach((e) => addFromEntry(e, 'income', 'incomeSources'));
  data.oneTimeEntries.forEach((e) => addFromEntry(e, e.oneTimeKind === 'income' ? 'income' : 'bill', 'oneTimeEntries'));

  return spans;
}

function CalendarPage({ data, setData, isMobile, onAddEntry }) {
  const currency = data.settings.currency;
  const firstDow = data.settings.firstDayOfWeek || 0;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(null);

  const [view, setView] = useState('grid');

  const [slideDir, setSlideDir] = useState(null);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const gridStart = new Date(monthStart);

  let leadingDays = (monthStart.getDay() - firstDow + 7) % 7;
  gridStart.setDate(gridStart.getDate() - leadingDays);
  const gridEnd = new Date(monthEnd);
  let trailingDays = (firstDow - 1 - monthEnd.getDay() + 7) % 7;
  gridEnd.setDate(gridEnd.getDate() + trailingDays);

  const allBills = getAllBillLikeEntries(data);

  const sourceListById = useMemo(() => buildSourceListLookup(data), [data]);

  const occurrences = useMemo(() => {
    const recurring = [
      ...expandAll(allBills, 'bill', gridStart, gridEnd, data),
      ...expandAll(data.incomeSources, 'income', gridStart, gridEnd, data)
    ].map((o) => ({ ...o, sourceList: sourceListById[o.id] }));
    const oneTime = data.oneTimeEntries
      .filter((e) => {
        if (!e.date) return false;
        const d = parseYmd(e.date);
        return d >= gridStart && d <= gridEnd;
      })
      .map((e) => ({ ...oneTimeOccurrence(data, e), sourceList: 'oneTimeEntries' }));
    return [...recurring, ...oneTime, ...advanceInflows(data, gridStart, gridEnd)];
  }, [data, cursor]);

  const occByDate = useMemo(() => {
    const map = {};
    occurrences.forEach((o) => {
      (map[o.occDate] = map[o.occDate] || []).push(o);
    });
    return map;
  }, [occurrences]);

  const rangeSpans = useMemo(() => getDateRangeSpans(data, allBills, gridStart, gridEnd), [data, cursor]);
  const rangeEntryIds = useMemo(() => new Set(rangeSpans.map((s) => s.id)), [rangeSpans]);

  function changeMonth(delta) {
    setSlideDir(delta > 0 ? 'left' : 'right');
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    setSelectedDay(null);
  }

  const daySummary = useMemo(() => {
    const map = {};
    Object.keys(occByDate).forEach((dateStr) => {
      const items = occByDate[dateStr];
      let outflow = 0;
      const colors = [];
      items.forEach((o) => {
        const amt = Number(o.amount) || 0;
        if (o.kind === 'income') {
          outflow -= amt;
          colors.push({ c: getEntryColor(o, data) || '#4FAE6B', income: true });
        } else {
          const paid = isPaid(data, o.id, o.occDate);
          outflow += amt;
          colors.push({ c: paid ? 'var(--text-tertiary)' : (getEntryColor(o, data) || '#D85A5A'), income: false });
        }
      });
      map[dateStr] = { total: outflow, colors, count: items.length };
    });
    return map;
  }, [occByDate, data]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);

  const agendaDays = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const rows = [];
    let gapStart = null;
    const flushGap = (endDay) => {
      if (gapStart == null) return;
      rows.push({ type: 'gap', start: gapStart, end: endDay });
      gapStart = null;
    };
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = ymd(new Date(y, m, day));
      const items = occByDate[ds];
      const isToday = ds === todayStr;
      if ((items && items.length) || isToday) {
        flushGap(day - 1);
        rows.push({ type: 'day', dateStr: ds, items: items || [] });
      } else {
        if (gapStart == null) gapStart = day;
      }
    }
    flushGap(daysInMonth);
    return rows;
  }, [occByDate, cursor, todayStr]);

  const cells = [];
  let d = new Date(gridStart);
  while (d <= gridEnd) {
    cells.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const dowLabels = [];
  for (let i = 0; i < 7; i++) dowLabels.push(DOW_FULL[(firstDow + i) % 7]);

  const selectedOccs = selectedDay ? (occByDate[selectedDay] || []) : [];

  const rangeSegments = useMemo(() => {
    const segments = [];
    weeks.forEach((week, wi) => {
      const weekStart = week[0];
      const weekEnd = week[6];
      rangeSpans.forEach((s) => {
        if (s.endDate < weekStart || s.startDate > weekEnd) return;
        const start = s.startDate < weekStart ? weekStart : s.startDate;
        const end = s.endDate > weekEnd ? weekEnd : s.endDate;
        const startCol = daysBetween(weekStart, start);
        const endCol = daysBetween(weekStart, end);
        const paid = isPaid(data, s.id, s.occDate);
        const midDays = Math.floor(daysBetween(s.startDate, s.endDate) / 2);
        const midDate = new Date(s.startDate);
        midDate.setDate(midDate.getDate() + midDays);
        const showLabel = midDate >= weekStart && midDate <= weekEnd;
        segments.push({
          key: `${s.id}-${s.occDate}-${wi}`,
          week: wi,
          startCol, endCol,
          isStart: ymd(start) === ymd(s.startDate),
          isEnd: ymd(end) === ymd(s.endDate),
          color: getEntryColor(s, data) || '#888888',
          name: s.name,
          occDate: s.occDate,
          paid,
          showLabel
        });
      });
    });
    return segments;
  }, [weeks, rangeSpans, data]);

  const swipeStart = useRef(null);
  function onTouchStart(e) {
    if (e.touches.length !== 1) { swipeStart.current = null; return; }
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    if (!swipeStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.current.x;
    const dy = t.clientY - swipeStart.current.y;
    swipeStart.current = null;

    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      changeMonth(dx < 0 ? 1 : -1);
    }
  }

  if (isMobile) {
    const gridView = h('div', { className: 'calm-grid-wrap' },
      h('div', { className: 'calm-dow' },
        dowLabels.map((dn) => h('div', { key: dn, className: 'calm-dow-cell' }, dn.slice(0, 1)))
      ),
      h('div', { className: 'calm-weeks' },
        weeks.map((week, wi) => {
          const weekPills = rangeSegments.filter((seg) => seg.week === wi);
          const lanes = [];
          weekPills.forEach((seg) => {
            let laneIdx = lanes.findIndex((lane) => lane.every((p) => seg.startCol > p.endCol || seg.endCol < p.startCol));
            if (laneIdx === -1) { laneIdx = lanes.length; lanes.push([]); }
            lanes[laneIdx].push(seg);
            seg._lane = laneIdx;
          });
          const laneCount = lanes.length;
          return h('div', { key: wi, className: 'calm-week', style: { '--lanes': laneCount } },
            h('div', { className: 'calm-week-cells' },
              week.map((cd) => {
                const dateStr = ymd(cd);
                const inMonth = cd.getMonth() === cursor.getMonth();
                const isToday = dateStr === todayStr;
                const isSelected = selectedDay === dateStr;
                const sum = daySummary[dateStr];
                const dotColors = sum
                  ? sum.colors.filter((_, idx) => {
                      const o = occByDate[dateStr][idx];
                      return !rangeEntryIds.has(o.id);
                    })
                  : [];
                const dots = dotColors.slice(0, 4);
                return h('button', {
                  key: dateStr,
                  className: `calm-cell${inMonth ? '' : ' out'}${isToday ? ' today' : ''}${isSelected ? ' sel' : ''}`,
                  onClick: () => setSelectedDay(dateStr)
                },
                  h('span', { className: 'calm-dnum' }, cd.getDate()),
                  dots.length
                    ? h('span', { className: 'calm-dots' },
                        dots.map((dc, i) => h('span', { key: i, className: 'calm-dot', style: { background: dc.c } })),
                        dotColors.length > 4 ? h('span', { className: 'calm-dot-more' }, '+') : null
                      )
                    : null,
                  (sum && inMonth && sum.total !== 0)
                    ? h('span', { className: `calm-amt${sum.total < 0 ? ' pos' : ''}` },
                        sum.total < 0
                          ? `+${fmtCompact(Math.abs(sum.total), currency)}`
                          : fmtCompact(sum.total, currency))
                    : null
                );
              })
            ),
            laneCount ? h('div', { className: 'calm-pills', style: { height: `${laneCount * 17}px` } },
              weekPills.map((seg) => {
                const leftPct = (seg.startCol / 7) * 100;
                const widthPct = ((seg.endCol - seg.startCol + 1) / 7) * 100;
                return h('button', {
                  key: seg.key,
                  className: `calm-pill${seg.paid ? ' paid' : ''}${seg.isStart ? ' start' : ''}${seg.isEnd ? ' end' : ''}`,
                  style: {
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: `${seg._lane * 17}px`,
                    '--pill': seg.color,
                    color: readableTextOn(seg.color)
                  },
                  onClick: () => setSelectedDay(seg.occDate),
                  title: seg.name
                }, seg.showLabel ? seg.name : '\u00a0');
              })
            ) : null
          );
        })
      )
    );

    const monthNm = MONTH_NAMES[cursor.getMonth()].slice(0, 3);
    const gapLabel = (row) => row.start === row.end
      ? `${monthNm} ${row.start}`
      : `${monthNm} ${row.start}\u2013${row.end}`;

    const agendaView = agendaDays.length === 0
      ? h('div', { className: 'calm-agenda-empty' }, 'Nothing scheduled this month.')
      : h('div', { className: 'calm-agenda-scroll' }, h('div', { className: 'calm-agenda' },
          agendaDays.map((row, ri) => {
            if (row.type === 'gap') {
              return h('div', { key: `gap-${ri}`, className: 'calm-ag-gap' },
                h('span', { className: 'calm-ag-gap-range' }, gapLabel(row)),
                h('span', { className: 'calm-ag-gap-label' }, 'Nothing scheduled')
              );
            }
            const dateStr = row.dateStr;
            const items = row.items;
            const d = parseYmd(dateStr);
            const isToday = dateStr === todayStr;
            return h('div', { key: dateStr, className: `calm-ag-day${isToday ? ' is-today' : ''}` },
              h('button', { className: `calm-ag-date${isToday ? ' today' : ''}`, onClick: () => setSelectedDay(dateStr) },
                h('span', { className: 'calm-ag-d' }, d.getDate()),
                h('span', { className: 'calm-ag-w' }, DOW_FULL[d.getDay()].slice(0, 3))
              ),
              h('div', { className: 'calm-ag-items' },
                items.length === 0
                  ? h('span', { className: 'calm-ag-today-empty' }, 'Nothing today')
                  : items.map((o, i) => {
                  const income = o.kind === 'income';
                  const { paid, late } = lateState(data, o);
                  const color = income ? (getEntryColor(o, data) || '#4FAE6B') : (getEntryColor(o, data) || '#D85A5A');
                  return h('button', {
                    key: `${o.id}-${o.occDate}-${i}`,
                    className: `calm-ag-item${paid ? ' paid' : ''}`,
                    onClick: () => setSelectedDay(dateStr)
                  },
                    h('span', { className: 'calm-ag-stripe', style: { background: paid ? 'var(--text-tertiary)' : color } }),
                    late ? h('span', { className: 'late-dot' }) : null,
                    h('span', { className: 'calm-ag-name' }, o.name),
                    h('span', { className: 'calm-ag-amt', style: income ? { color: 'var(--text-success)' } : null },
                      `${income ? '+' : ''}${occAmountLabel(o, currency)}`)
                  );
                })
              )
            );
          })
        ));

    return h('div', { className: 'calendar-page calm' },
      h(MonthHeader, { cursor, onChange: changeMonth }),

      h('div', { className: 'calm-toggle' },
        h(ChipToggle, {
          value: view,
          onChange: setView,
          options: [{ id: 'grid', label: 'Month' }, { id: 'agenda', label: 'Agenda' }]
        })
      ),

      h('div', {
        className: 'calm-swipe',
        onTouchStart: onTouchStart,
        onTouchEnd: onTouchEnd
      },
        h('div', {
          key: `${cursor.getFullYear()}-${cursor.getMonth()}-${view}`,
          className: `calm-slide${slideDir ? ' slide-' + slideDir : ''}`
        }, view === 'grid' ? gridView : agendaView)
      ),

      selectedDay ? h(DayDetailModal, {
        data, setData, currency,
        dateStr: selectedDay,
        occs: selectedOccs,
        onClose: () => setSelectedDay(null),
        onAddEntry: () => onAddEntry(selectedDay)
      }) : null
    );
  }

  return h('div', { className: 'calendar-page' },
    h('div', {
      className: 'calendar-swipe-area',
      onTouchStart: isMobile ? onTouchStart : undefined,
      onTouchEnd: isMobile ? onTouchEnd : undefined
    },
    h('div', { className: 'calendar-week-row dow-row' },
      h('div', { className: 'calendar-grid dow-grid' },
        dowLabels.map((dn) => h('div', { key: dn, className: 'calendar-dow' }, dn))
      )
    ),

    h('div', { className: 'calendar-body', style: { '--week-count': weeks.length } },
      h('div', { className: 'calendar-grid-wrap' },
        h('div', { className: 'calendar-grid months' },
          weeks.map((week, wi) =>
            week.map((cd) => {
              const dateStr = ymd(cd);
              const inMonth = cd.getMonth() === cursor.getMonth();

              const occs = (occByDate[dateStr] || []).filter((o) => !rangeEntryIds.has(o.id));
              const isToday = dateStr === todayStr;

              return h('div', {
                key: dateStr,
                className: `calendar-cell${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}`,
                onClick: () => setSelectedDay(dateStr)
              },
                h('span', { className: 'calendar-date' }, cd.getDate()),
                h('div', { className: 'calendar-chip-stack' },
                  occs.slice(0, 4).map((o, i) => {
                    let style;
                    let extraClass = '';
                    let lateFlag = false;
                    if (o.kind === 'income') {
                      const bg = getEntryColor(o, data) || '#4FAE6B';
                      style = { background: bg, color: readableTextOn(bg) };
                    } else {
                      const { paid, late } = lateState(data, o);
                      if (paid) {
                        extraClass = ' paid';
                        style = { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' };
                      } else {
                        lateFlag = late;
                        const bg = getEntryColor(o, data) || '#D85A5A';
                        style = { background: bg, color: readableTextOn(bg) };
                      }
                    }
                    return h('div', {
                      key: `${o.id}-${o.occDate}-${i}`,
                      className: `calendar-chip${extraClass}`,
                      style
                    }, lateFlag ? h('span', { className: 'late-dot', title: 'Late' }) : null, o.name);
                  }),
                  occs.length > 4 ? h('span', { className: 'calendar-chip-more' }, `+${occs.length - 4} more`) : null
                )
              );
            })
          )
        ),

        isMobile ? null : h('div', { className: 'range-overlay' },
          rangeSegments.map((seg) => {
            const leftPct = (seg.startCol / 7) * 100;
            const widthPct = ((seg.endCol - seg.startCol + 1) / 7) * 100;
            const top = `calc(${seg.week} * (100% / var(--week-count)) + 14px)`;
            return h('div', {
              key: seg.key,
              className: `range-segment${seg.paid ? ' paid' : ''}`,
              style: {
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top,
                '--range-color': seg.color,
                '--range-text': readableTextOn(seg.color)
              },
              onClick: () => setSelectedDay(seg.occDate),
              title: seg.name
            },
              seg.isStart ? h('div', { className: 'range-marker range-marker-start' }) : null,
              h('div', { className: 'range-line' }),
              seg.showLabel ? h('div', { className: 'range-label' }, seg.name) : null,
              seg.showLabel ? h('div', { className: 'range-line' }) : null,
              seg.isEnd ? h('div', { className: 'range-marker range-marker-end' }) : null
            );
          })
        )
      )
    )
    ),

    selectedDay ? h(DayDetailModal, {
      data, setData, currency,
      dateStr: selectedDay,
      occs: selectedOccs,
      onClose: () => setSelectedDay(null),
      onAddEntry: () => onAddEntry(selectedDay)
    }) : null
  );
}

function DayDetailModal({ data, setData, currency, dateStr, occs, onClose, onAddEntry }) {
  const [priceModal, setPriceModal] = useState(null);

  function togglePaid(o) {
    const wasPaid = isPaid(data, o.id, o.occDate);
    haptic(wasPaid ? 'light' : 'success');
    let next = togglePaidStatus(data, o.id, o.occDate);
    next = logActivity(next, `${wasPaid ? 'Unmarked' : 'Marked'} "${o.name}" as paid`);
    setData(next);
  }

  const date = parseYmd(dateStr);
  const out = occs.filter((o) => o.kind !== 'income').reduce((sum, o) => sum + o.amount, 0);
  const inflow = occs.filter((o) => o.kind === 'income').reduce((sum, o) => sum + o.amount, 0);
  const summary = [
    out > 0 ? `${fmtCurrency(out, currency)} out` : null,
    inflow > 0 ? `${fmtCurrency(inflow, currency)} in` : null
  ].filter(Boolean).join(' \u00b7 ');

  return h(Sheet, {
    title: formatDate(date, data.settings, { weekday: true }),
    sub: occs.length === 0 ? 'Nothing scheduled' : summary,
    className: 'day-modal',
    onClose,
    foot: h('div', { className: 'sheet-actions' },
      h('button', { onClick: () => { onClose(); onAddEntry(); } }, `+ Add something on ${formatDate(date, data.settings)}`)
    )
  },
    occs.length === 0 ? null : h('div', { className: 'entry-list' },
      occs.map((o, i) => {
        const income = o.kind === 'income';
        const { paid, late } = lateState(data, o);
        return h('div', {
          key: `${o.id}-${i}`,
          className: `day-row${paid && !income ? ' paid' : ''}`,
          onClick: () => setPriceModal(o)
        },
          income
            ? h('span', { className: 'entry-row-swatch', style: { background: getEntryColor(o, data) || '#4FAE6B' } })
            : o.autoRepay
              ? h('span', { className: 'auto-mark' }, 'Auto')
              : h('input', {
                  type: 'checkbox',
                  checked: paid,
                  onClick: (e) => e.stopPropagation(),
                  onChange: () => togglePaid(o),
                  'aria-label': `Mark ${o.name} paid`
                }),
          h('span', { className: 'entry-row-text' },
            h('span', { className: 'entry-row-name' },
              late ? h('span', { className: 'late-dot', title: 'Late' }) : null,
              o.name),
            h('span', { className: 'entry-row-sub' },
              income
                ? (o.sourceList === 'advances' ? 'Advance' : 'Income')
                : [paid ? (o.autoRepay ? 'Taken from paycheck' : 'Paid') : (late ? 'Late' : null), o.category || SOURCE_GROUP_LABELS[o.sourceList]].filter(Boolean).join(' \u00b7 '))
          ),
          h('span', { className: `entry-row-amt${income ? ' positive' : ''}` },
            `${income ? '+' : ''}${occAmountLabel(o, currency)}`),
          h('span', { className: 'att-chevron' }, '\u203a')
        );
      })
    ),

    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null
  );
}

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

function walletFloor(data) {
  if (!data.settings.walletNegative) return 0;
  const limit = Number(data.settings.walletOverdraftLimit) || 0;
  return limit > 0 ? -limit : -Infinity;
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
  const floor = walletFloor(data);
  const [amount, setAmount] = useState('');
  const [below, setBelow] = useState(() => floor < 0 && !!summary && summary.balance < 0);
  const typed = parseFloat(amount);
  const entered = amount !== '' && !isNaN(typed);
  const value = below ? -Math.abs(typed) : typed;
  const tooLow = entered && value < floor;
  const canSave = entered && !tooLow;
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
        canSave ? `Save ${fmtCurrency(value, currency)}`
          : tooLow ? (floor === 0 ? 'Can’t go below zero' : 'Past your overdraft limit')
          : 'Enter your balance')
    )
  },
    h('p', { className: 'sheet-lead' },
      'How much money do you have right now? Add up your bank account and any cash. Include any paycheck that has already landed.'),
    h(AmountField, { value: amount, onChange: setAmount, currency, autoFocus: true, negative: below }),
    floor < 0 ? h(ChipToggle, {
      wide: true,
      value: below,
      onChange: setBelow,
      options: [{ id: false, label: 'Above zero' }, { id: true, label: 'Below zero' }]
    }) : null,
    tooLow ? h('p', { className: 'setup-hint warn' },
      floor === 0
        ? 'Your balance is set to never go below zero. If you’re overdrawn, turn on “My balance can go below zero” in Settings.'
        : `Your overdraft limit is ${fmtCurrency(-floor, currency)}. If your bank changed it, update it in Settings.`) : null,
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
  const floor = walletFloor(data);
  const limit = floor < 0 && Number.isFinite(floor) ? -floor : 0;
  const payday = nextCheck && nextCheck.check
    ? `your ${formatDate(parseYmd(nextCheck.check.occDate), data.settings)} paycheck`
    : 'your next paycheck';
  const sub = balance >= 0
    ? 'The money in your account right now, as far as the app knows'
    : floor === 0
      ? 'Your account can’t go below zero, so something may be missing — tap Update balance'
      : !limit
        ? 'Overdrawn — your account is below zero'
        : balance >= floor
          ? `Overdrawn — you can go ${fmtCurrency(balance - floor, currency)} lower before your ${fmtCurrency(limit, currency)} limit`
          : `That’s ${fmtCurrency(floor - balance, currency)} past your ${fmtCurrency(limit, currency)} overdraft limit`;
  const safeTone = afterBills >= 0 ? '' : afterBills >= floor ? ' warn' : ' short';

  return h('section', { className: `wallet-card${balance < 0 ? ' short' : ''}` },
    h('div', { className: 'wallet-top' },
      h('p', { className: 'wallet-label' }, 'Available now'),
      due ? h('span', { className: 'wallet-pill' }, 'Update due') : null
    ),
    h('p', { className: 'wallet-balance' }, fmtCurrency(balance, currency)),
    h('p', { className: 'wallet-sub' }, sub),
    billsDue > 0 ? h('p', { className: `wallet-safe${safeTone}` },
      afterBills >= 0
        ? `After the ${fmtCurrency(billsDue, currency)} of bills due before ${payday}, you’ll have ${fmtCurrency(afterBills, currency)} left.`
        : afterBills >= floor
          ? `After the ${fmtCurrency(billsDue, currency)} of bills due before ${payday}, you’d be ${fmtCurrency(-afterBills, currency)} below zero${limit ? ` — inside your ${fmtCurrency(limit, currency)} overdraft` : ''}.`
          : balance < floor
            ? `The ${fmtCurrency(billsDue, currency)} of bills due before ${payday} would take you to ${fmtCurrency(afterBills, currency)}.`
            : `You’re ${fmtCurrency(floor - afterBills, currency)} short of the ${fmtCurrency(billsDue, currency)} of bills due before ${payday}${limit ? `, even with your ${fmtCurrency(limit, currency)} overdraft` : ''}.`) : null,
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

function blankCreditCard() {
  return {
    id: uid(),
    name: '',
    totalDebt: '',
    amountPaid: '',
    hasRecurringPayment: false,
    paymentAmount: '',
    paymentDate: todayYmd(),
    paymentFreq: 'monthly',
    useApr: false,
    apr: '',
    balanceDate: todayYmd()
  };
}

function CreditCardSheet({ data, card, onSave, onDelete, onClose }) {
  const currency = data.settings.currency;
  const [form, setForm] = useState(() => (card ? { ...blankCreditCard(), ...card } : blankCreditCard()));
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const canSave = form.name.trim() !== '';

  return h(Sheet, {
    title: card ? 'Edit credit card' : 'Add a credit card',
    tall: true,
    onClose,
    foot: h('div', { className: 'sheet-actions' },
      h('button', { className: 'primary', onClick: () => { if (canSave) { haptic('success'); onSave(form); } }, disabled: !canSave },
        canSave ? (card ? 'Save' : 'Add card') : 'Give it a name')
    )
  },
    h(Field, { label: 'Name' },
      h('input', { type: 'text', placeholder: 'e.g. Chase Sapphire', value: form.name, onChange: (e) => set('name', e.target.value) })
    ),
    h('div', { className: 'setup-entry-grid' },
      h(Field, { label: 'Total debt' },
        h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.totalDebt, onChange: (e) => set('totalDebt', e.target.value) })
      ),
      h(Field, { label: 'Paid so far' },
        h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountPaid, onChange: (e) => set('amountPaid', e.target.value) })
      )
    ),
    h('div', { className: 'switch-list' },
      h(SettingSwitch, {
        id: 'cc-recurring',
        title: 'Has a monthly payment',
        sub: 'Shows on the calendar and counts toward your bills',
        checked: !!form.hasRecurringPayment,
        onChange: (v) => set('hasRecurringPayment', v)
      }),
      h(SettingSwitch, {
        id: 'cc-apr',
        title: 'Track interest',
        sub: 'Simple monthly interest on what is left, updated as days pass',
        checked: !!form.useApr,
        onChange: (v) => set('useApr', v)
      })
    ),
    form.hasRecurringPayment ? h('div', { className: 'reveal-block' },
      h('div', { className: 'setup-entry-grid' },
        h(Field, { label: 'Payment' },
          h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.paymentAmount, onChange: (e) => set('paymentAmount', e.target.value) })
        ),
        h(Field, { label: 'Due date' },
          h(DateField, { value: form.paymentDate, onChange: (d) => set('paymentDate', d), settings: data.settings })
        )
      ),
      h('div', { className: 'qa-block' },
        h('p', { className: 'qa-label' }, 'Repeats'),
        h(FreqChips, { value: form.paymentFreq, onPick: (f) => set('paymentFreq', f) })
      )
    ) : null,
    form.useApr ? h(Field, { label: 'APR %' },
      h('input', { type: 'number', inputMode: 'decimal', step: '0.01', placeholder: 'e.g. 24.99', value: form.apr, onChange: (e) => set('apr', e.target.value) })
    ) : null,
    card ? h(DeleteRow, {
      label: 'Delete this card',
      sub: 'Removes the card and its payments from the calendar',
      onConfirm: onDelete
    }) : null
  );
}

function CreditCardsPage({ data, setData }) {
  const currency = data.settings.currency;
  const [editing, setEditing] = useState(null);
  const [projectionCard, setProjectionCard] = useState(null);

  const cards = data.creditCards || [];

  const totalOwedNow = cards.reduce((sum, c) => sum + getCurrentCardBalance(c), 0);

  function submitForm(form) {
    const totalDebt = form.totalDebt === '' ? 0 : parseFloat(form.totalDebt) || 0;
    const amountPaid = form.amountPaid === '' ? 0 : parseFloat(form.amountPaid) || 0;
    const existing = editing.card;
    const principalChanged = !existing || existing.totalDebt !== totalDebt || existing.amountPaid !== amountPaid;
    const entry = {
      ...form,
      totalDebt,
      amountPaid,
      paymentAmount: form.paymentAmount === '' ? 0 : parseFloat(form.paymentAmount) || 0,
      apr: form.apr === '' ? 0 : parseFloat(form.apr) || 0,
      balanceDate: principalChanged ? todayYmd() : (form.balanceDate || todayYmd())
    };
    if (existing) {
      setData(logActivity({ ...data, creditCards: cards.map((c) => (c.id === existing.id ? entry : c)) }, `Edited credit card "${entry.name}"`));
    } else {
      setData(logActivity({ ...data, creditCards: [...cards, entry] }, `Added credit card "${entry.name}"`));
    }
    setEditing(null);
  }

  function deleteCard(card) {
    setData(logActivity({ ...data, creditCards: cards.filter((c) => c.id !== card.id) }, `Deleted credit card "${card.name}"`));
    setEditing(null);
  }

  const monthlyPayments = cards
    .filter((c) => c.hasRecurringPayment)
    .reduce((sum, c) => sum + monthlyAmount({ amount: c.paymentAmount, freq: c.paymentFreq }), 0);

  return h('div', { className: 'page-stack' },
    h('div', { className: 'sub-head' },
      h('h2', { className: 'sub-title' }, 'Credit cards'),
      h('p', { className: 'sub-caption' },
        cards.length === 0
          ? 'Track what you owe, what you have paid, and when it will be gone.'
          : `${cards.length} ${cards.length === 1 ? 'card' : 'cards'} · ${fmtCurrency(totalOwedNow, currency)} owed now${monthlyPayments > 0 ? ` · about ${fmtCurrency(monthlyPayments, currency)} a month in payments` : ''}`)
    ),

    cards.length === 0
      ? h('p', { className: 'empty-state' }, 'No credit cards added yet.')
      : h('div', { className: 'card-grid' },
          cards.map((c) => {
            const total = Number(c.totalDebt) || 0;
            const paid = Number(c.amountPaid) || 0;
            const currentBalance = getCurrentCardBalance(c);
            const accruedInterest = Math.max(0, currentBalance - Math.max(0, total - paid));
            const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
            const nextPay = c.hasRecurringPayment && c.paymentDate
              ? nextDueDate({ date: c.paymentDate, freq: c.paymentFreq || 'monthly' })
              : null;
            const late = isCardPaymentLate(c, data);
            return h('div', { key: c.id, className: 'credit-card-tile' },
              h('button', { className: 'cc-main', onClick: () => setEditing({ card: c }) },
                h('span', { className: 'cc-top' },
                  h('span', { className: 'cc-name' }, c.name),
                  h('span', { className: 'att-chevron' }, '›')
                ),
                h('span', { className: 'cc-owed' }, fmtCurrency(currentBalance, currency)),
                h('span', { className: 'cc-owed-label' },
                  `owed now${accruedInterest > 0.005 ? ` · ${fmtCurrency(accruedInterest, currency)} of it interest` : ''}`),
                h('span', { className: 'credit-card-progress' },
                  h('span', { className: 'credit-card-progress-bar', style: { width: `${pct}%` } })
                ),
                h('span', { className: 'cc-meta' },
                  h('span', null, `${fmtCurrency(paid, currency)} of ${fmtCurrency(total, currency)} paid`),
                  h('span', null, `${pct}%`)
                ),
                (c.hasRecurringPayment || (c.useApr && c.apr)) ? h('span', { className: `cc-pay${late ? ' late' : ''}` },
                  [
                    c.hasRecurringPayment
                      ? `${fmtCurrency(c.paymentAmount, currency)} ${FREQ_LABELS[c.paymentFreq] || c.paymentFreq}${late ? ' · payment late' : nextPay ? ` · next ${formatDate(nextPay, data.settings)}` : ''}`
                      : null,
                    c.useApr && c.apr ? `${c.apr}% APR` : null
                  ].filter(Boolean).join(' · ')
                ) : null
              ),
              c.useApr && c.apr
                ? h('button', { className: 'cc-link', onClick: () => setProjectionCard(c) }, 'See the payoff projection ›')
                : null
            );
          })
        ),
    h('button', { className: 'add-row', onClick: () => setEditing({ card: null }) }, '+ Add a card'),

    projectionCard ? h(ProjectionModal, {
      card: projectionCard, data, currency,
      onClose: () => setProjectionCard(null)
    }) : null,

    editing ? h(CreditCardSheet, {
      data,
      card: editing.card,
      onSave: submitForm,
      onDelete: () => deleteCard(editing.card),
      onClose: () => setEditing(null)
    }) : null
  );
}

function ProjectionModal({ card, data, currency, onClose }) {
  const points = useMemo(() => getCardProjection(card, data, 12), [card, data]);
  const late = isCardPaymentLate(card, data);

  const maxBalance = Math.max(...points.map((p) => p.balance), 1);
  const willPayOff = points[points.length - 1].balance <= 0 && points.length <= 12;

  const W = 360, H = 160, PAD = 28;
  const stepX = (W - PAD * 2) / Math.max(1, points.length - 1);
  const scaleY = (v) => H - PAD - (v / maxBalance) * (H - PAD * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${PAD + i * stepX} ${scaleY(p.balance)}`)
    .join(' ');

  const barPoints = points.slice(1);
  const maxBar = Math.max(...barPoints.map((p) => p.interest + p.principalPaid), 1);
  const barW = (W - PAD * 2) / Math.max(1, barPoints.length) - 4;

  return h(Sheet, { title: `${card.name} payoff`, sub: 'Projected over the next 12 months', onClose },
    late ? h('div', { className: 'info-banner' },
      'This card’s recurring payment is currently late, so the next payment isn’t counted in month 1.') : null,

    h('div', { className: 'sheet-section' },
      h('p', { className: 'qa-label' }, 'Balance'),
      h('svg', { viewBox: `0 0 ${W} ${H}`, className: 'projection-chart' },
        h('line', { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: 'var(--border-secondary)', strokeWidth: 1 }),
        h('path', { d: linePath, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.4, strokeLinejoin: 'round' }),
        points.map((p, i) =>
          h('circle', { key: i, cx: PAD + i * stepX, cy: scaleY(p.balance), r: 2.5, fill: 'var(--accent)' })
        ),
        h('text', { x: PAD, y: 14, fontSize: 10, fill: 'var(--text-secondary)' }, fmtCurrency(maxBalance, currency)),
        h('text', { x: PAD, y: H - PAD - 4, fontSize: 10, fill: 'var(--text-secondary)' }, fmtCurrency(0, currency))
      )
    ),

    barPoints.length > 0 ? h('div', { className: 'sheet-section' },
      h('p', { className: 'qa-label' }, 'Interest vs. principal per payment'),
      h('svg', { viewBox: `0 0 ${W} ${H}`, className: 'projection-chart' },
        h('line', { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: 'var(--border-secondary)', strokeWidth: 1 }),
        barPoints.map((p, i) => {
          const x = PAD + i * ((W - PAD * 2) / barPoints.length) + 2;
          const interestH = (p.interest / maxBar) * (H - PAD * 2);
          const principalH = (p.principalPaid / maxBar) * (H - PAD * 2);
          return h(React.Fragment, { key: i },
            h('rect', { x, y: H - PAD - interestH - principalH, width: barW, height: principalH, rx: 2, fill: 'var(--accent)' }),
            h('rect', { x, y: H - PAD - interestH, width: barW, height: interestH, rx: 2, fill: 'var(--late-red)' })
          );
        })
      ),
      h('div', { className: 'chart-key' },
        h('span', { className: 'chart-key-item' }, h('span', { className: 'chart-key-dot accent' }), 'Principal'),
        h('span', { className: 'chart-key-item' }, h('span', { className: 'chart-key-dot late' }), 'Interest')
      )
    ) : null,

    h('p', { className: `form-msg ${willPayOff ? 'good' : ''}` },
      willPayOff
        ? `At this rate, ${card.name} is paid off within ${points.length - 1} month${points.length - 1 === 1 ? '' : 's'}.`
        : card.hasRecurringPayment
          ? 'At this rate, this balance won’t be paid off within 12 months with the current payment.'
          : 'No recurring payment is set, so this balance keeps growing with interest.')
  );
}

function attentionSummary(items, currency) {
  const late = items.filter((o) => o.late);
  const priced = items.filter((o) => !o.late && o.needsPrice);
  const lateTotal = late.reduce((sum, o) => sum + o.amount, 0);

  if (late.length && priced.length) {
    return `${fmtCurrency(lateTotal, currency)} past due across ${late.length} ${late.length === 1 ? 'bill' : 'bills'}, and ${priced.length} more ${priced.length === 1 ? 'needs' : 'need'} the real amount.`;
  }
  if (late.length) {
    return `${fmtCurrency(lateTotal, currency)} past due across ${late.length} ${late.length === 1 ? 'bill' : 'bills'} — tap one to mark it paid or clear the late flag.`;
  }
  if (priced.length) {
    return `${priced.length} ${priced.length === 1 ? 'item only has' : 'items only have'} a price range — enter the real amount so your totals are right.`;
  }
  return 'All clear — everything is paid and every amount is filled in.';
}

function AttentionRow({ o, data, currency, onOpen }) {
  const dateLabel = formatDate(parseYmd(o.occDate), data.settings, { year: true });
  const ageText = o.daysLate === 0 ? 'due today' : `${o.daysLate} ${o.daysLate === 1 ? 'day' : 'days'} late`;

  return h('button', { className: `att-row${o.late ? ' late' : ''}`, onClick: () => onOpen(o) },
    h('span', { className: 'att-text' },
      h('span', { className: 'att-name' }, o.name),
      h('span', { className: 'att-sub' },
        `${o.late ? 'Was due' : 'Due'} ${dateLabel}${o.category ? ' · ' + o.category : ''}`),
      o.needsPrice ? h('span', { className: 'att-need' }, 'Needs the real amount') : null
    ),
    h('span', { className: 'att-side' },
      o.late ? h('span', { className: 'age-pill' }, ageText) : null,
      h('span', { className: 'att-amt' },
        `${o.kind === 'income' ? '+' : ''}${occAmountLabel(o, currency)}`)
    ),
    h('span', { className: 'att-chevron' }, '›')
  );
}

const ATTENTION_PREVIEW = 5;
const BILL_GROUPS = ['majorBills', 'subscriptions', 'creditCards'];
const BILL_ADD_LABELS = { majorBills: '+ Add a bill', subscriptions: '+ Add a subscription' };

function AllBillsPage({ data, setData, attention, isMobile, setPage }) {
  const currency = data.settings.currency;

  const [attentionCollapsed, setAttentionCollapsed] = useState(() => attention.length === 0);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [editing, setEditing] = useState(null);
  const [priceModal, setPriceModal] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  function deleteEntry(o) {
    let next = null;
    if (o.sourceList === 'majorBills') {
      next = { ...data, majorBills: data.majorBills.filter((e) => e.id !== o.id) };
    } else if (o.sourceList === 'subscriptions') {
      next = { ...data, subscriptions: data.subscriptions.filter((e) => e.id !== o.id) };
    }

    if (next) setData(logActivity(next, `Deleted "${o.name}"`));
  }

  function openEdit(e) {
    if (e.sourceList === 'creditCards') { setPage('creditcards'); return; }
    setEditing({ sourceList: e.sourceList, form: { ...entryToFormShape(e), _isNew: false } });
  }

  function openAdd(sourceList) {
    const category = sourceList === 'subscriptions' ? 'Streaming' : 'Other';
    setEditing({ sourceList, form: { ...blankEntry({ freq: 'monthly', category }), _isNew: true } });
  }

  function handleEditSubmit(cleaned) {
    const { _isNew, ...entry } = cleaned;
    const next = _isNew
      ? { ...data, [editing.sourceList]: [...data[editing.sourceList], entry] }
      : applyEditedEntry(data, editing.sourceList, cleaned);
    setData(logActivity(next, `${_isNew ? 'Added' : 'Edited'} "${entry.name}"`));
    setEditing(null);
  }

  const unified = useMemo(() => {
    const rows = [];

    data.majorBills.forEach((e) => rows.push({ ...e, sourceList: 'majorBills' }));
    data.subscriptions.forEach((e) => rows.push({ ...e, sourceList: 'subscriptions' }));
    getCreditCardPaymentEntries(data).forEach((e) => rows.push({ ...e, sourceList: 'creditCards' }));

    const nextOf = (e) => { const d = nextDueDate(e); return d ? ymd(d) : '9999'; };
    return rows.map((e) => ({ ...e, _next: nextOf(e) })).sort((a, b) => a._next.localeCompare(b._next));
  }, [data]);

  const grouped = useMemo(() => {
    const map = { majorBills: [], subscriptions: [], creditCards: [] };
    unified.forEach((e) => map[e.sourceList].push(e));
    return BILL_GROUPS.map((key) => [key, map[key]]);
  }, [unified]);

  const visibleGroups = categoryFilter === 'all' ? grouped : grouped.filter(([key]) => key === categoryFilter);

  const groupMonthlyTotals = useMemo(() => {
    const totals = {};
    grouped.forEach(([key, rows]) => {
      totals[key] = rows.reduce((sum, e) => sum + monthlyAmount(e), 0);
    });
    return totals;
  }, [grouped]);

  const lateCount = attention.filter((o) => o.late).length;
  const visibleAttention = showAllAttention ? attention : attention.slice(0, ATTENTION_PREVIEW);

  const attentionBlock = h('div', { className: 'attention-section' },
      h('button', {
        className: 'attention-header',
        onClick: () => { haptic('light'); setAttentionCollapsed(!attentionCollapsed); },
        'aria-expanded': !attentionCollapsed
      },
        h(Icon, { name: 'alert' }),
        h('span', { className: 'attention-title' }, 'Needs attention'),
        attention.length > 0
          ? h('span', { className: `nav-badge round${lateCount > 0 ? '' : ' attention'}` }, attention.length)
          : null,
        h('span', { className: `drop-chevron${attentionCollapsed ? '' : ' open'}` }, '\u203a')
      ),
      !attentionCollapsed ? h('div', { className: 'attention-body' },
        h('div', { className: 'info-banner' }, attentionSummary(attention, currency)),
        attention.length > 0
          ? h('div', { className: 'att-list' },
              visibleAttention.map((o) => h(AttentionRow, {
                key: `${o.id}-${o.occDate}`, o, data, currency, onOpen: setPriceModal
              })),
              attention.length > ATTENTION_PREVIEW
                ? h('button', { className: 'att-more', onClick: () => setShowAllAttention(!showAllAttention) },
                    showAllAttention ? 'Show less' : `Show all ${attention.length}`)
                : null
            )
          : null
      ) : null
    );

  const filterBlock = h('div', { className: 'bill-filter-row' },
      h('p', { className: 'bill-filter-caption' }, 'What your regular bills cost in a month'),
      h('button', {
        className: `bill-filter-chip${categoryFilter === 'all' ? ' active' : ''}`,
        onClick: () => setCategoryFilter('all')
      },
        h('span', { className: 'bill-filter-label' }, 'All'),
        h('span', { className: 'bill-filter-total' }, fmtCurrency(
          Object.values(groupMonthlyTotals).reduce((a, b) => a + b, 0), currency))
      ),
      grouped.filter(([, rows]) => rows.length > 0).map(([key]) =>
        h('button', {
          key,
          className: `bill-filter-chip${categoryFilter === key ? ' active' : ''}`,
          onClick: () => setCategoryFilter(key)
        },
          h('span', { className: 'bill-filter-label' }, SOURCE_GROUP_LABELS[key]),
          h('span', { className: 'bill-filter-total' }, fmtCurrency(groupMonthlyTotals[key] || 0, currency))
        )
      )
    );

  return h('div', { className: 'page-stack' },
    isMobile ? null : h('h2', null, 'Bills'),

    attentionBlock,
    filterBlock,

    h('div', { className: 'bill-groups' },
      visibleGroups.map(([key, rows]) =>
        h('div', { key, className: 'bill-group' },
          h('div', { className: 'category-group-header' },
            h('span', null, SOURCE_GROUP_LABELS[key]),
            rows.length ? h('span', { className: 'category-group-count' }, rows.length) : null
          ),
          rows.length ? h('div', { className: 'entry-list' },
            rows.map((e) => h(EntryRow, {
              key: `${e.sourceList}-${e.id}`,
              name: e.name,
              sub: scheduleLabel(e, data),
              amount: entryAmountLabel(e, currency),
              color: getEntryColor(e, data),
              onClick: () => openEdit(e)
            }))
          ) : null,
          key === 'creditCards'
            ? h('button', { className: 'add-row', onClick: () => setPage('creditcards') },
                rows.length ? 'Manage credit cards' : '+ Add a credit card')
            : h('button', { className: 'add-row', onClick: () => openAdd(key) }, BILL_ADD_LABELS[key])
        )
      )
    ),

    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null,

    editing ? h(EntryFormModal, Object.assign(
      { data, entry: editing.form, onSubmit: handleEditSubmit, onClose: () => setEditing(null), submitLabel: 'Save' },
      getEditModalConfig(editing.sourceList),
      editing.form._isNew
        ? { title: editing.sourceList === 'subscriptions' ? 'Add a subscription' : 'Add a bill', submitLabel: 'Add' }
        : {
            deleteLabel: `Delete ${editing.form.name || 'this entry'}`,
            onDelete: () => { deleteEntry({ ...editing.form, sourceList: editing.sourceList }); setEditing(null); }
          }
    )) : null
  );
}

const SECTION_COLOR_LABELS = [
  { key: 'majorBills', label: 'Essentials' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'creditCards', label: 'Credit card payments' },
  { key: 'incomeSources', label: 'Income' },
  { key: 'oneTimePayments', label: 'Purchases' },
  { key: 'oneTimeIncome', label: 'One-time income' },
  { key: 'advances', label: 'Advances' }
];

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'colors', label: 'Calendar colors' },
  { id: 'advanced', label: 'Advanced' }
];

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return { h: 210, s: 70, l: 54 };
  const int = parseInt(m[1], 16);
  let r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function CustomAccentPicker({ hex, onChange }) {
  const { h: hue, s: sat, l: lig } = hexToHsl(hex);
  const setHsl = (nh, ns, nl) => onChange(hslToHex(nh, ns, nl));

  const row = (label, value, min, max, onInput, trackBg) =>
    h('label', { className: 'accent-slider-row' },
      h('span', { className: 'accent-slider-label' }, label),
      h('input', {
        type: 'range', min, max, value,
        onChange: (e) => onInput(Number(e.target.value)),
        className: 'accent-slider',
        style: { background: trackBg }
      })
    );

  return h('div', { className: 'custom-accent-picker' },
    h('div', { className: 'accent-hex-row' },
      h('span', { className: 'accent-preview', style: { background: hex } }),
      h('input', {
        type: 'text',
        className: 'accent-hex',
        value: hex,
        onChange: (e) => {
          let v = e.target.value.trim();
          if (v && v[0] !== '#') v = '#' + v;
          onChange(v);
        },
        placeholder: '#378ADD',
        maxLength: 7
      })
    ),
    row('Hue', hue, 0, 360, (v) => setHsl(v, sat, lig),
      'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'),
    row('Saturation', sat, 0, 100, (v) => setHsl(hue, v, lig),
      `linear-gradient(to right,${hslToHex(hue, 0, lig)},${hslToHex(hue, 100, lig)})`),
    row('Lightness', lig, 0, 100, (v) => setHsl(hue, sat, v),
      `linear-gradient(to right,#000,${hslToHex(hue, sat, 50)},#fff)`)
  );
}

function SettingsPage({ data, setData, onRestart }) {
  const [tab, setTab] = useState('general');
  const [editingIncome, setEditingIncome] = useState(null);
  const currency = data.settings.currency;

  function updateSetting(field, value) {
    setData({ ...data, settings: { ...data.settings, [field]: value } });
  }

  function updateSectionColor(key, hex) {
    setData({ ...data, settings: { ...data.settings, sectionColors: { ...data.settings.sectionColors, [key]: hex } } });
  }

  function openAddIncome() {
    setEditingIncome({ ...blankEntry({ freq: 'biweekly', category: 'Income' }), _isNew: true });
  }

  function openEditIncome(entry) {
    setEditingIncome({ ...entryToFormShape(entry), _isNew: false });
  }

  function handleIncomeSubmit(cleaned) {
    if (editingIncome._isNew) {
      const { _isNew, ...entry } = cleaned;
      setData(logActivity({ ...data, incomeSources: [...data.incomeSources, entry] }, `Added income source "${entry.name}"`));
    } else {
      setData(logActivity(applyEditedEntry(data, 'incomeSources', cleaned), `Edited "${cleaned.name}"`));
    }
    setEditingIncome(null);
  }

  function deleteIncome(entry) {
    setData(logActivity({ ...data, incomeSources: data.incomeSources.filter((e) => e.id !== entry.id) }, `Deleted income source "${entry.name}"`));
  }

  let tabContent;
  if (tab === 'general') {
    tabContent = h(GeneralTab, {
      data, currency, updateSetting,
      onAddIncome: openAddIncome, onEditIncome: openEditIncome
    });
  } else if (tab === 'colors') {
    tabContent = h(ColorsTab, { data, updateSectionColor });
  } else {
    tabContent = h(AdvancedTab, { data, setData, updateSetting, onRestart });
  }

  return h('div', { className: 'page-stack' },
    h('h2', { className: 'sub-title' }, 'Settings'),
    h('div', { className: 'settings-tabs' },
      h(ChipToggle, { wide: true, options: SETTINGS_TABS, value: tab, onChange: setTab })
    ),
    tabContent,

    editingIncome ? h(EntryFormModal, {
      data,
      title: editingIncome._isNew ? 'Add income source' : 'Edit income source',
      entry: editingIncome,
      categories: null,
      dateLabel: 'Pay date',
      isIncome: true,
      submitLabel: editingIncome._isNew ? 'Add' : 'Save',
      onSubmit: handleIncomeSubmit,
      onDelete: editingIncome._isNew ? null : () => { deleteIncome(editingIncome); setEditingIncome(null); },
      deleteLabel: `Delete ${editingIncome.name || 'this income source'}`,
      onClose: () => setEditingIncome(null)
    }) : null
  );
}

function WalletSettingsCard({ data, updateSetting }) {
  const on = walletOn(data);
  const summary = on ? walletSummary(data) : null;
  const currency = data.settings.currency;
  return h('div', { className: 'card' },
    h('p', { className: 'settings-card-title' }, 'Wallet'),
    h('p', { className: 'settings-card-sub' },
      summary
        ? `Balance ${fmtCurrency(summary.balance, currency)} \u00b7 last updated ${formatDate(parseYmd(summary.check.date), data.settings)}`
        : 'Keeps a running total of the money you actually have. You tell it your balance on the Wallet tab and it keeps count from there.'),
    h('div', { className: 'switch-list' },
      h(SettingSwitch, {
        id: 'wallet-on',
        title: 'Track my wallet',
        sub: 'Adds a Wallet tab \u2014 paychecks add to your balance, bills and purchases take away from it',
        checked: on,
        onChange: (v) => updateSetting('walletEnabled', v)
      }),
      on ? h(SettingSwitch, {
        id: 'wallet-monthly',
        title: 'Ask for my balance each month',
        sub: 'The Wallet tab asks the first time you open it in a new month',
        checked: data.settings.walletMonthlyCheck !== false,
        onChange: (v) => updateSetting('walletMonthlyCheck', v)
      }) : null,
      on ? h(SettingSwitch, {
        id: 'wallet-negative',
        title: 'My balance can go below zero',
        sub: 'Turn on if your bank allows overdraft, or you use something like SpotMe',
        checked: !!data.settings.walletNegative,
        onChange: (v) => updateSetting('walletNegative', v)
      }) : null
    ),
    on && data.settings.walletNegative ? h('div', { className: 'setup-entry-grid single' },
      h(Field, {
        label: 'Overdraft limit',
        hint: 'How far below zero your bank lets you go. Leave it blank if there’s no set limit.'
      },
        h('input', {
          type: 'number', inputMode: 'decimal', min: 0, placeholder: 'No limit',
          value: data.settings.walletOverdraftLimit || '',
          onChange: (e) => updateSetting('walletOverdraftLimit', Math.max(0, parseFloat(e.target.value) || 0))
        })
      )
    ) : null
  );
}

function GeneralTab({ data, currency, updateSetting, onAddIncome, onEditIncome }) {
  return h('div', { className: 'settings-stack' },

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Income sources'),
      h('p', { className: 'settings-card-sub' }, 'Paychecks and anything else that lands on a schedule.'),
      data.incomeSources.length === 0
        ? h('p', { className: 'empty-state' }, 'No income sources added yet.')
        : h('div', { className: 'entry-list' },
            data.incomeSources.map((e) => {
              const avg = (e.useAvgEstimate && e.useAmountRange) ? averagePaycheck(data, e) : null;
              return h(EntryRow, {
                key: e.id,
                name: e.name,
                sub: scheduleLabel(e, data),
                note: avg
                  ? (avg.ready
                      ? `About ${fmtCurrency(avg.amount, currency)} a paycheck \u00b7 the average of your last ${avg.count}`
                      : `Averaging starts after 2 paychecks with a real amount \u2014 ${avg.count} so far`)
                  : null,
                amount: `+${entryAmountLabel(e, currency)}`,
                positive: true,
                color: getEntryColor({ ...e, sourceList: 'incomeSources' }, data),
                onClick: () => onEditIncome(e)
              });
            })
          ),
      h('button', { className: 'add-row', onClick: onAddIncome }, '+ Add an income source')
    ),

    h(WalletSettingsCard, { data, updateSetting }),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Appearance'),
      h('p', { className: 'qa-label' }, 'Theme'),
      h(ChipToggle, {
        wide: true,
        options: [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }],
        value: data.settings.theme,
        onChange: (t) => updateSetting('theme', t)
      }),
      h('p', { className: 'qa-label' }, 'Accent color'),
      h('div', { className: 'swatch-row' },
        ACCENTS.map((a) =>
          h('button', {
            key: a.id,
            className: `swatch${data.settings.accent === a.id ? ' selected' : ''}`,
            style: { background: a.hex },
            'aria-label': a.label,
            onClick: () => { haptic('light'); updateSetting('accent', a.id); }
          })
        ),
        h('button', {
          className: `swatch swatch-custom${data.settings.accent === 'custom' ? ' selected' : ''}`,
          'aria-label': 'Custom color',
          onClick: () => { haptic('light'); updateSetting('accent', 'custom'); },
          style: data.settings.accent === 'custom' && data.settings.accentCustom
            ? { background: data.settings.accentCustom }
            : undefined
        })
      ),
      data.settings.accent === 'custom'
        ? h(CustomAccentPicker, {
            hex: data.settings.accentCustom || '#378ADD',
            onChange: (hex) => updateSetting('accentCustom', hex)
          })
        : null,
      h('p', { className: 'qa-label' }, 'First day of week'),
      h(ChipToggle, {
        wide: true,
        options: [{ id: 0, label: 'Sunday' }, { id: 1, label: 'Monday' }],
        value: data.settings.firstDayOfWeek,
        onChange: (v) => updateSetting('firstDayOfWeek', v)
      })
    ),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Money & bills'),
      h('div', { className: 'setup-entry-grid' },
        h(Field, { label: 'Currency' },
          h('select', {
            value: data.settings.currency,
            onChange: (e) => updateSetting('currency', e.target.value)
          }, CURRENCIES.map((c) => h('option', { key: c, value: c }, c)))
        ),
        h(Field, { label: 'Late after' },
          h('input', {
            type: 'number', inputMode: 'numeric', min: 0, max: 30,
            value: data.settings.lateGraceDays,
            onChange: (e) => updateSetting('lateGraceDays', parseInt(e.target.value, 10) || 0)
          })
        ),
        h(Field, { label: 'Flag bills early' },
          h('input', {
            type: 'number', inputMode: 'numeric', min: 0, max: 60,
            value: data.settings.needsAttentionLookaheadDays,
            onChange: (e) => updateSetting('needsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0)
          })
        ),
        h(Field, { label: 'Flag income early' },
          h('input', {
            type: 'number', inputMode: 'numeric', min: 0, max: 60,
            value: data.settings.incomeNeedsAttentionLookaheadDays,
            onChange: (e) => updateSetting('incomeNeedsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0)
          })
        )
      ),
      h('p', { className: 'setup-hint' },
        'All in days. Late after: how long a bill can go past its due date before it shows as late. Flag early: how far ahead a bill or paycheck that has a price range asks you for the real amount.'),
      h('div', { className: 'switch-list' },
        h(SettingSwitch, {
          id: 'auto-deduct-cc',
          title: 'Pay down card balances',
          sub: 'Marking a card payment paid subtracts it from that card\u2019s balance',
          checked: data.settings.autoDeductCardPayments !== false,
          onChange: (v) => updateSetting('autoDeductCardPayments', v)
        }),
        h(SettingSwitch, {
          id: 'haptics',
          title: 'Vibrate on taps',
          sub: 'Android only \u2014 iPhone Safari does not allow web vibration',
          checked: data.settings.hapticsEnabled !== false,
          onChange: (v) => { updateSetting('hapticsEnabled', v); if (v) haptic('medium'); }
        })
      )
    )
  );
}

function ColorsTab({ data, updateSectionColor }) {
  return h('div', { className: 'settings-stack' },
    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Section colors'),
      h('p', { className: 'settings-card-sub' },
        'Used for dots, bars and chips on the calendar. Any single bill, subscription or income source can use its own color from its edit window.'),
      h('div', { className: 'color-list' },
        SECTION_COLOR_LABELS.map(({ key, label }) =>
          h('label', { key, className: 'color-row' },
            h('span', { className: 'color-row-swatch', style: { background: data.settings.sectionColors[key] || '#888888' } }),
            h('span', { className: 'color-row-name' }, label),
            h('span', { className: 'color-row-hex' }, (data.settings.sectionColors[key] || '#888888').toUpperCase()),
            h('input', {
              type: 'color',
              value: data.settings.sectionColors[key] || '#888888',
              onChange: (e) => updateSectionColor(key, e.target.value)
            })
          )
        )
      )
    )
  );
}

function relativeTime(ms) {
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function SyncCard({ data, setData }) {
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [conflict, setConflict] = useState(null);
  const supportsFile = Sync.supportsFileSystem;

  useEffect(() => {
    Sync.hasLinkedFile().then(setLinked);
  }, []);

  function flash(ok, text) { setMsg({ ok, text }); }

  async function handleSync() {
    setBusy(true); setMsg(null);
    const stamp = Date.now();
    const stamped = { ...data, lastModified: stamp };
    const res = await Sync.writeOut(stamped);
    setBusy(false);
    if (res.ok) {
      const withStamp = { ...stamped, settings: { ...stamped.settings, lastExported: stamp } };
      setData(withStamp, { lastModified: stamp });
      flash(true, res.mode === 'file'
        ? 'Synced to your file.'
        : 'Exported — choose where to save it (Files, LocalSend, etc.).');
    } else if (!res.canceled) {
      flash(false, res.error || 'Could not sync.');
    }
  }

  async function handleLoad() {
    setBusy(true); setMsg(null);
    const res = (supportsFile && linked) ? await Sync.readLinked() : await Sync.readFromPicker();
    setBusy(false);
    if (!res.ok) {
      if (res.canceled) return;
      if (res.noFile) { flash(false, 'No sync file linked yet.'); return; }
      if (res.empty) { flash(false, 'The sync file is empty.'); return; }
      flash(false, res.error || 'Could not load.');
      return;
    }
    const incoming = res.data;
    if ((incoming.lastModified || 0) < (data.lastModified || 0)) {
      setConflict({ incoming });
      return;
    }
    applyIncoming(incoming);
    flash(true, 'Loaded the latest data.');
  }

  function applyIncoming(incoming) {
    setData(incoming, { lastModified: incoming.lastModified || Date.now() });
    setConflict(null);
  }

  async function handleLink(existing) {
    setBusy(true); setMsg(null);
    const res = existing ? await Sync.linkExistingFile() : await Sync.linkFile();
    setBusy(false);
    if (res.ok) {
      setLinked(true);
      if (existing) await handleLoad(); else await handleSync();
    } else if (!res.canceled) {
      flash(false, res.error || 'Could not link a file.');
    }
  }

  async function handleUnlink() {
    await Sync.forgetFile();
    setLinked(false);
    flash(true, 'Unlinked. This device no longer auto-syncs to that file.');
  }

  return h('div', { className: 'sync-card' },
    h('p', { className: 'sheet-lead' },
      supportsFile
        ? 'Keep this device in step with a single data file. Link it once, then Sync writes your latest data to it and Load pulls the newest back in. Your data stays on your device and in your own file — never on a server.'
        : 'Sync exports your data through the share sheet (Save to Files, LocalSend, and so on) and loads it back when you switch devices. Newest data always wins. Nothing is sent to a server.'),

    h('div', { className: 'sync-status' },
      h('span', { className: `sync-dot${data.lastModified ? ' on' : ''}` }),
      h('span', null, 'Last change: ', h('strong', null, relativeTime(data.lastModified))),
      linked ? h('span', { className: 'sync-linked-pill' }, '✓ File linked') : null
    ),

    supportsFile ? h('div', { className: 'button-row' },
      linked
        ? h('button', { onClick: handleUnlink, disabled: busy }, 'Unlink file')
        : h(React.Fragment, null,
            h('button', { onClick: () => handleLink(false), disabled: busy }, 'Create sync file'),
            h('button', { onClick: () => handleLink(true), disabled: busy }, 'Link existing file')
          )
    ) : null,

    h('div', { className: 'button-row' },
      h('button', { onClick: handleLoad, disabled: busy }, 'Load from file'),
      h('button', { className: 'primary', onClick: handleSync, disabled: busy },
        busy ? 'Working…' : (supportsFile && linked ? 'Sync now' : 'Export / share'))
    ),

    msg ? h('p', { className: `form-msg ${msg.ok ? 'good' : 'bad'}` }, msg.text) : null,

    conflict ? h(Sheet, {
      title: 'That file is older',
      onClose: () => setConflict(null),
      foot: h('div', { className: 'sheet-actions' },
        h('button', { onClick: () => setConflict(null) }, 'Keep mine'),
        h('button', { className: 'danger', onClick: () => { applyIncoming(conflict.incoming); flash(true, 'Loaded the older file.'); } }, 'Load it anyway')
      )
    },
      h('p', { className: 'sheet-lead' },
        `The data you're loading was last changed ${relativeTime(conflict.incoming.lastModified)}, but this device has newer changes from ${relativeTime(data.lastModified)}. Loading it will replace your newer data.`)
    ) : null
  );
}

function SyncModal({ data, setData, onClose }) {
  return h(Sheet, { title: 'Sync', onClose },
    h(SyncCard, { data, setData })
  );
}

function AdvancedTab({ data, setData, updateSetting, onRestart }) {
  const [importWarning, setImportWarning] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [spendReset, setSpendReset] = useState(0);

  async function handleExport() {
    setExportError(null);
    setExportSuccess(false);
    const result = await window.api.exportData();
    if (result.success) {
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } else if (!result.canceled) {
      setExportError(result.error || 'Export failed.');
    }
  }

  async function handleImportConfirmed() {
    setImportWarning(false);
    setImportError(null);
    setImportSuccess(false);
    const result = await window.api.importData();
    if (result.success) {
      setData(result.data);
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 4000);
    } else if (!result.canceled) {
      setImportError(result.error || 'Import failed.');
    }
  }

  return h('div', { className: 'settings-stack' },
    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Display'),
      h('p', { className: 'qa-label' }, 'Date format'),
      h(ChipToggle, {
        wide: true,
        options: [
          { id: 'short', label: 'Jun 15' },
          { id: 'long', label: 'June 15, 2026' },
          { id: 'iso', label: '2026-06-15' }
        ],
        value: data.settings.dateFormat,
        onChange: (v) => updateSetting('dateFormat', v)
      }),
      h('p', { className: 'qa-label' }, 'Density'),
      h(ChipToggle, {
        wide: true,
        options: [{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }],
        value: data.settings.density,
        onChange: (v) => updateSetting('density', v)
      })
    ),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Data portability'),
      h('p', { className: 'settings-card-sub' },
        'Export your data as a .json file to back it up or move it to another device. Importing a file replaces everything currently saved in this app.'),
      h('div', { className: 'button-row' },
        h('button', { onClick: handleExport }, 'Export data'),
        h('button', { onClick: () => setImportWarning(true) }, 'Import a file')
      ),
      exportSuccess ? h('p', { className: 'form-msg good' }, 'Export saved.') : null,
      exportError ? h('p', { className: 'form-msg bad' }, exportError) : null,
      importSuccess ? h('p', { className: 'form-msg good' }, 'Data imported. The app is now showing the imported data.') : null,
      importError ? h('p', { className: 'form-msg bad' }, importError) : null,
      h('div', { className: 'switch-list' },
        h(SettingSwitch, {
          id: 'backup-reminder',
          title: 'Weekly backup reminder',
          sub: 'A nudge every Monday to download a copy of your data',
          checked: data.settings.backupReminderEnabled !== false,
          onChange: (v) => updateSetting('backupReminderEnabled', v)
        })
      )
    ),

    importWarning ? h(Sheet, {
      title: 'This replaces all your data',
      onClose: () => setImportWarning(false),
      foot: h('div', { className: 'sheet-actions' },
        h('button', { onClick: () => setImportWarning(false) }, 'Keep my data'),
        h('button', { className: 'danger', onClick: handleImportConfirmed }, 'Delete and import')
      )
    },
      h('p', { className: 'sheet-lead' },
        'Importing a file permanently erases your current bills, income, subscriptions, credit cards, wallet, history and settings, and replaces them with whatever is in the file. This cannot be undone.')
    ) : null,

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Custom CSS'),
      h('p', { className: 'settings-card-sub' },
        'For advanced users — add your own CSS to override styles. Applied live; clear the box to remove it.'),
      h('textarea', {
        value: data.settings.customCss || '',
        onChange: (e) => updateSetting('customCss', e.target.value),
        placeholder: '.sidebar { font-family: monospace; }',
        className: 'custom-css-input',
        rows: 6
      })
    ),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Activity log'),
      (!data.activityLog || data.activityLog.length === 0)
        ? h('p', { className: 'settings-card-sub' }, 'Nothing logged yet.')
        : h('div', { className: 'log-list' },
            data.activityLog.slice(0, 25).map((entry) =>
              h('div', { key: entry.id, className: 'log-row' },
                h('span', { className: 'log-text' }, entry.message),
                h('span', { className: 'log-time' }, formatLogTimestamp(entry.timestamp))
              )
            )
          )
    ),

    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Start fresh'),
      h('p', { className: 'settings-card-sub' },
        'Resetting spending history deletes every purchase you\u2019ve logged and your past balance updates, so the Wallet starts over. Your bills, income, budgets and advances stay.'),
      h(DeleteRow, {
        key: spendReset,
        label: 'Reset spending history',
        sub: 'The Wallet will ask for your balance again',
        armedLabel: 'Tap again to reset spending history',
        onConfirm: () => { setData(resetSpendingHistory(data)); setSpendReset((n) => n + 1); }
      }),
      h(DeleteRow, {
        label: 'Reset everything',
        sub: 'Deletes all your data and runs setup again',
        armedLabel: 'Tap again to delete everything',
        onConfirm: onRestart
      }),
      spendReset ? h('p', { className: 'form-msg good' }, 'Spending history cleared. Open the Wallet tab to enter your balance.') : null
    ),

    h('div', { className: 'card about-card' },
      h('img', { src: 'assets/icon.svg', alt: '', className: 'about-logo' }),
      h('div', null,
        h('p', { className: 'settings-card-title' }, 'Finance Calendar'),
        h('p', { className: 'settings-card-sub' }, `Version ${WEB_VERSION} · all data stays on this device — nothing is sent anywhere.`)
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
