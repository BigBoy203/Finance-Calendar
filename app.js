const { useState, useEffect, useMemo, useCallback, useRef } = React;
const h = React.createElement;

const WEB_VERSION = '4.2';

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
  const forceYear = opts && opts.year;
  if (fmt === 'iso') {
    const base = ymd(date);
    return includeWeekday ? `${date.toLocaleDateString('en-US', { weekday: 'long' })}, ${base}` : base;
  }
  if (fmt === 'long') {
    return date.toLocaleDateString('en-US', {
      weekday: includeWeekday ? 'long' : undefined,
      month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  return date.toLocaleDateString('en-US', {
    weekday: includeWeekday ? 'long' : undefined,
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

function scheduleLabel(entry, settings) {
  const next = nextDueDate(entry);
  const when = next
    ? (entry.freq && entry.freq !== 'none' ? `Next ${formatDate(next, settings)}` : formatDate(next, settings))
    : 'Ended';
  return [when, repeatLabel(entry, settings), entry.category !== entry.name ? entry.category : ''].filter(Boolean).join(' \u00b7 ');
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
  return !!data.paidHistory[`${entryId}|${occDate}`];
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
  if (nextForced[key]) {
    delete nextForced[key];
  } else {
    nextForced[key] = true;
    delete nextDismissed[key];
    delete nextPaid[key];
  }
  return { ...data, forcedLate: nextForced, dismissedLate: nextDismissed, paidHistory: nextPaid };
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
  if (amount > 0) next[key] = amount; else delete next[key];
  return { ...data, covered: next };
}

function togglePaidStatus(data, entryId, occDate) {
  const key = `${entryId}|${occDate}`;
  const nextPaid = { ...data.paidHistory };
  const nextForced = { ...(data.forcedLate || {}) };
  const nextDeferred = { ...(data.deferred || {}) };
  const nextCovered = { ...(data.covered || {}) };
  const wasPaid = !!nextPaid[key];
  if (wasPaid) {
    delete nextPaid[key];
  } else {
    nextPaid[key] = true;
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

  return { ...data, paidHistory: nextPaid, forcedLate: nextForced, deferred: nextDeferred, covered: nextCovered, creditCards: nextCreditCards };
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
  data.incomeSources.forEach((e) => { map[e.id] = 'incomeSources'; });
  return map;
}

function purchaseEntries(data) {
  return (data.oneTimeEntries || []).filter((e) => e.oneTimeKind === 'payment' && e.date);
}

function getAllBillLikeEntries(data) {
  return [...data.majorBills, ...data.subscriptions, ...getCreditCardPaymentEntries(data)];
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
  const [billsExpanded, setBillsExpanded] = useState(true);
  const [quickAdd, setQuickAdd] = useState(null);
  const [overviewView, setOverviewView] = useState('calendar');

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

  const NAV_ITEMS = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'overview', label: 'Overview', icon: 'calendar' },
    { id: 'spending', label: 'Spending', icon: 'bag' },
    {
      id: 'allbills', label: 'Bills', icon: 'allbills',
      children: [
        { id: 'essentials', label: 'Essentials', icon: 'list' },
        { id: 'creditcards', label: 'Credit cards', icon: 'card' },
        { id: 'subscriptions', label: 'Subscriptions', icon: 'apps' }
      ]
    },
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
      data, setData: persist, isMobile,
      onAddEntry: (opts) => setQuickAdd(opts)
    });
  } else if (page === 'essentials') {
    pageContent = h(BillsPage, { data, setData: persist });
  } else if (page === 'subscriptions') {
    pageContent = h(SubscriptionsPage, { data, setData: persist });
  } else if (page === 'creditcards') {
    pageContent = h(CreditCardsPage, { data, setData: persist });
  } else if (page === 'allbills') {
    pageContent = h(AllBillsPage, { data, setData: persist, attention, isMobile, setPage });
  } else if (page === 'settings') {
    pageContent = h(SettingsPage, { data, setData: persist, onRestart: () => persist({ ...getBlankData(), onboardingComplete: false }) });
  }

  const syncBannerEl = syncBanner ? h('div', { className: 'sync-banner' },
    h('span', { style: { fontSize: '13px' } }, 'A newer version of your data is in your synced file.'),
    h('div', { style: { display: 'flex', gap: '8px', flexShrink: 0 } },
      h('button', { className: 'sync-banner-dismiss', onClick: () => setSyncBanner(null) }, 'Ignore'),
      h('button', { className: 'primary', onClick: () => {
        persist({ ...syncBanner.incoming }, { lastModified: syncBanner.incoming.lastModified || Date.now() });
        setSyncBanner(null);
      } }, 'Load it')
    )
  ) : null;

  if (isMobile) {
    const pageTitle = ({
      home: 'Home', overview: 'Overview', spending: 'Spending',
      allbills: 'Bills', essentials: 'Essentials', creditcards: 'Credit cards',
      subscriptions: 'Subscriptions', settings: 'Settings'
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
        attentionCount: attention.length
      }),
      quickAdd ? h(QuickAddModal, {
        data,
        setData: persist,
        initialDate: quickAdd.date,
        preset: quickAdd.preset,
        onClose: () => setQuickAdd(null)
      }) : null,
      showBackupPrompt ? h(BackupReminderModal, {
        onDownloadBackup: downloadBackupNow,
        onDismiss: dismissBackupPrompt
      }) : null
    );
  }

  return h('div', { className: 'app-shell' },
    h('div', { className: 'sidebar' },
      h('div', { className: 'sidebar-brand' },
        h('img', { src: 'assets/icon.svg', alt: '', className: 'sidebar-logo' }),
        h('h1', null, 'Finance Calendar')
      ),
      NAV_ITEMS.map((item) => {
        if (!item.children) {
          return h('div', {
            key: item.id,
            className: `sidebar-link${page === item.id ? ' active' : ''}`,
            onClick: () => setPage(item.id)
          },
            h(Icon, { name: item.icon }),
            item.label
          );
        }

        const openBills = () => { setPage(item.id); setBillsExpanded((v) => !v); };
        return h('div', { key: item.id },
          h('div', {
            className: `sidebar-link${page === item.id ? ' active' : ''}`,
            onClick: openBills
          },
            h(Icon, { name: item.icon }),
            item.label,
            attention.length > 0
              ? h('span', { className: 'nav-badge round attention' }, attention.length)
              : null,
            h('span', { className: `sidebar-caret${billsExpanded ? ' open' : ''}` }, '\u203a')
          ),
          billsExpanded ? h('div', { className: 'sidebar-sublist' },
            item.children.map((child) => h('div', {
              key: child.id,
              className: `sidebar-link sidebar-sublink${page === child.id ? ' active' : ''}`,
              onClick: () => setPage(child.id)
            },
              h(Icon, { name: child.icon }),
              child.label
            ))
          ) : null
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
    quickAdd ? h(QuickAddModal, {
      data,
      setData: persist,
      initialDate: quickAdd.date,
      preset: quickAdd.preset,
      onClose: () => setQuickAdd(null)
    }) : null,
    showBackupPrompt ? h(BackupReminderModal, {
      onDownloadBackup: downloadBackupNow,
      onDismiss: dismissBackupPrompt
    }) : null
  );
}

function BackupReminderModal({ onDownloadBackup, onDismiss }) {
  const overlay = useOverlayDismiss(onDismiss);
  return h('div', Object.assign({ className: 'modal-overlay as-window' }, overlay),
    h('div', { className: 'modal-content as-window' },
      h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, 'Weekly backup reminder'),
      h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
        'Your data lives in this browser only. It\u2019s a good habit to download a backup ',
        'every so often, in case this browser\u2019s data ever gets cleared.'),
      h('button', { className: 'primary', onClick: onDownloadBackup }, 'Download backup (.json)'),
      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        h('button', { onClick: onDismiss }, 'Remind me later'),
        h('span', null)
      ),
      h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--text-tertiary)' } },
        'You can turn this reminder off anytime in Settings \u2192 Advanced.')
    )
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
    budgets: {},
    paidHistory: {},
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
        oneTimeIncome: '#4FAE6B'
      },
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
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    settings: 'M 18.24 8.40 L 20.79 9.28 L 20.79 14.72 L 18.24 15.60 L 18.75 18.25 L 14.04 20.97 L 12.00 19.20 L 9.96 20.97 L 5.25 18.25 L 5.76 15.60 L 3.21 14.72 L 3.21 9.28 L 5.76 8.40 L 5.25 5.75 L 9.96 3.03 L 12.00 4.80 L 14.04 3.03 L 18.75 5.75 Z M 8.8 12 A 3.2 3.2 0 1 0 15.2 12 A 3.2 3.2 0 1 0 8.8 12 Z',
    alert: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    card: 'M2 7h20v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7zM2 10h20M6 15h4',
    allbills: 'M9 2h6l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM14 2v6h6M9 13h6M9 17h6',
    bag: 'M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2',
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

const MOBILE_TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'overview', label: 'Overview', icon: 'calendar' },
  { id: 'add', label: 'Add', icon: 'plus', isAdd: true },
  { id: 'spending', label: 'Spending', icon: 'bag' },
  { id: 'allbills', label: 'Bills', icon: 'allbills' }
];

const TAB_FOR_PAGE = {
  home: 'home',
  overview: 'overview',
  spending: 'spending',
  allbills: 'allbills',
  essentials: 'allbills',
  creditcards: 'allbills',
  subscriptions: 'allbills'
};

function MobileTabBar({ page, setPage, onAdd, attentionCount }) {
  const activeTab = TAB_FOR_PAGE[page] || page;
  return h('nav', { className: 'mobile-tabbar' },
    MOBILE_TABS.map((tab) => {

      if (tab.isAdd) {
        return h('button', {
          key: tab.id,
          className: 'mobile-tab-add',
          onClick: () => { haptic('medium'); onAdd(); },
          'aria-label': 'Add expense'
        },
          h('svg', { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round' },
            h('path', { d: 'M12 5v14M5 12h14' })
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

const MOBILE_SUBPAGES = ['essentials', 'creditcards', 'subscriptions'];

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
  return { onTouchStart, onTouchMove, onTouchEnd, onClick: onClose };
}

function EntryRow({ name, sub, note, amount, positive, color, onClick }) {
  return h('button', { className: 'entry-row', onClick },
    h('span', { className: 'entry-row-swatch', style: { background: color || 'var(--border-secondary)' } }),
    h('span', { className: 'entry-row-text' },
      h('span', { className: 'entry-row-name' }, name),
      sub ? h('span', { className: 'entry-row-sub' }, sub) : null,
      note ? h('span', { className: 'entry-row-note' }, note) : null
    ),
    h('span', { className: `entry-row-amt${positive ? ' positive' : ''}` }, amount),
    h('span', { className: 'att-chevron' }, '\u203a')
  );
}

function EntryFormModal({ data, title, entry, categories, dateLabel, showFreq, isIncome, submitLabel, onSubmit, onDelete, deleteLabel, onClose }) {
  const [form, setForm] = useState(() => ({ ...entry }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const overlay = useOverlayDismiss(onClose);

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  function submit() {
    if (!form.name.trim()) return;
    onSubmit({
      ...form,
      repeatUntil: form.freq === 'none' ? '' : form.repeatUntil,
      useAvgEstimate: canEstimate && form.useAvgEstimate,
      amount: form.amount === '' ? 0 : parseFloat(form.amount) || 0,
      amountMin: form.amountMin === '' ? 0 : parseFloat(form.amountMin) || 0,
      amountMax: form.amountMax === '' ? 0 : parseFloat(form.amountMax) || 0
    });
  }

  const useFreq = showFreq !== false;
  const recurring = useFreq && form.freq !== 'none';
  const canEstimate = !!isIncome && !!form.useAmountRange;
  const avg = canEstimate ? averagePaycheck(data, form) : null;

  return h('div', Object.assign({ className: 'modal-overlay as-window' }, overlay),
    h('div', { className: 'modal-content as-window' },
      h('div', { className: 'modal-window-head' },
        h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, title),
        h('button', { className: 'modal-x', onClick: onClose, 'aria-label': 'Close' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
            h('path', { d: 'M6 6l12 12M18 6L6 18' })
          )
        )
      ),
      h('div', { className: 'setup-field' },
        h('label', null, 'Name'),
        h('input', { type: 'text', value: form.name, onChange: (e) => update('name', e.target.value) })
      ),
      h('div', { className: 'setup-entry-grid' },
        form.useAmountRange
          ? h(React.Fragment, null,
              h('div', { className: 'setup-field' },
                h('label', null, 'Min'),
                h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountMin, onChange: (e) => update('amountMin', e.target.value) })
              ),
              h('div', { className: 'setup-field' },
                h('label', null, 'Max'),
                h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountMax, onChange: (e) => update('amountMax', e.target.value) })
              )
            )
          : h('div', { className: 'setup-field' },
              h('label', null, 'Amount'),
              h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amount, onChange: (e) => update('amount', e.target.value) })
            ),
        form.useDateRange
          ? h(React.Fragment, null,
              h('div', { className: 'setup-field' },
                h('label', null, 'Start'),
                h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value) })
              ),
              h('div', { className: 'setup-field' },
                h('label', null, 'End'),
                h('input', { type: 'date', value: form.dateEnd, onChange: (e) => update('dateEnd', e.target.value) })
              )
            )
          : h('div', { className: 'setup-field' },
              h('label', null, dateLabel || 'Date'),
              h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value) })
            ),
        useFreq ? h('div', { className: 'setup-field' },
          h('label', null, 'Repeats'),
          h('select', { value: form.freq, onChange: (e) => update('freq', e.target.value) },
            FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
        ) : null,
        (recurring && form.repeatUntil) ? h('div', { className: 'setup-field' },
          h('label', null, 'Repeat ends'),
          h('input', { type: 'date', value: form.repeatUntil, onChange: (e) => update('repeatUntil', e.target.value) })
        ) : null,
        categories ? h('div', { className: 'setup-field' },
          h('label', null, 'Category'),
          h('select', { value: form.category, onChange: (e) => update('category', e.target.value) },
            (categories.includes(form.category) ? categories : [form.category, ...categories]).map((c) => h('option', { key: c, value: c }, c)))
        ) : null
      ),
      h('div', { className: 'setup-entry-links' },
        h('button', { className: 'setup-link', onClick: () => update('useAmountRange', !form.useAmountRange) },
          form.useAmountRange ? 'Fixed amount' : 'Amount range'),
        h('button', { className: 'setup-link', onClick: () => update('useDateRange', !form.useDateRange) },
          form.useDateRange ? 'Single date' : 'Date range'),
        recurring
          ? h('button', { className: 'setup-link', onClick: () => update('repeatUntil', form.repeatUntil ? '' : defaultRepeatUntil(form.date)) },
              form.repeatUntil ? 'Repeats forever' : 'End repeat')
          : null
      ),
      canEstimate ? h('div', { className: 'setup-field' },
        h('label', null, 'Paycheck estimate'),
        h('div', { className: 'checkbox-row', style: { margin: 0 } },
          h('input', {
            type: 'checkbox',
            id: 'use-avg-estimate',
            checked: !!form.useAvgEstimate,
            onChange: (e) => update('useAvgEstimate', e.target.checked)
          }),
          h('label', { htmlFor: 'use-avg-estimate', style: { margin: 0 } }, 'Estimate future checks from past ones')
        ),
        h('p', { className: 'setup-hint' },
          avg.ready
            ? `Average of your last ${avg.count} recorded checks: ${fmtCurrency(avg.amount, data.settings.currency)}. Upcoming dates use it instead of the range.`
            : `Experimental \u2014 needs two checks with a recorded amount and you have ${avg.count}. Until then upcoming dates keep using the middle of the range.`)
      ) : null,

      h('div', { className: 'setup-field' },
        h('label', null, 'Calendar color'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          h('div', { className: 'checkbox-row', style: { margin: 0 } },
            h('input', {
              type: 'checkbox',
              id: 'use-custom-color',
              checked: !!form.color,
              onChange: (e) => update('color', e.target.checked ? '#888888' : '')
            }),
            h('label', { htmlFor: 'use-custom-color', style: { margin: 0 } }, 'Use a custom color')
          ),
          form.color ? h('input', {
            type: 'color', value: form.color, onChange: (e) => update('color', e.target.value), className: 'color-input'
          }) : null
        )
      ),
      onDelete ? h('button', {
        className: 'price-action-row danger',
        onClick: () => {
          if (!confirmDelete) { haptic('warn'); setConfirmDelete(true); return; }
          haptic('heavy');
          onDelete();
        }
      },
        h('div', null,
          h('span', { className: 'price-action-title' }, confirmDelete ? 'Tap again to delete' : (deleteLabel || 'Delete')),
          h('span', { className: 'price-action-sub' },
            confirmDelete ? 'This cannot be undone' : 'Removes it from every date it appears on')
        ),
        h('span', { className: 'price-action-chevron' }, '\u203a')
      ) : null,
      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'primary', onClick: submit }, submitLabel || 'Save')
      )
    )
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

function getEditModalConfig(sourceList, entry) {
  if (sourceList === 'majorBills') {
    return { title: 'Edit bill', categories: MAJOR_CATEGORIES, dateLabel: 'Due date', showFreq: true };
  }
  if (sourceList === 'subscriptions') {
    return { title: 'Edit subscription', categories: MINOR_CATEGORIES, dateLabel: 'Billing date', showFreq: true };
  }
  if (sourceList === 'incomeSources') {
    return { title: 'Edit income source', categories: null, dateLabel: 'Next pay date', showFreq: true, isIncome: true };
  }

  const isIncome = entry && entry.oneTimeKind === 'income';
  return {
    title: isIncome ? 'Edit one-time income' : 'Edit one-time payment',
    categories: isIncome ? ONE_TIME_INCOME_CATEGORIES : ONE_TIME_PAYMENT_CATEGORIES,
    dateLabel: 'Date',
    showFreq: false
  };
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
  if (sourceList === 'oneTimeEntries') {
    return {
      ...data,
      oneTimeEntries: data.oneTimeEntries.map((e) => (e.id === entry.id ? { ...entry, oneTimeKind: e.oneTimeKind } : e))
    };
  }
  return data;
}

const MAJOR_CATEGORIES = ['Rent/mortgage', 'Power', 'Water', 'Gas', 'Insurance', 'Car payment', 'Phone', 'Internet', 'Credit card', 'Other'];
const MINOR_CATEGORIES = ['Streaming', 'Gaming', 'Cloud storage', 'Memberships', 'Other'];
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
    setList(list.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
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
      dateLabel: 'Next pay date'
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
      emptyHint: 'Tap any you pay for \u2014 skip the rest.'
    });
  } else {
    body = h(CreditCardEntryList, {
      cards: creditCards,
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
        h('div', null,
          h('h2', null, 'Import your backup'),
          h('p', { style: { color: 'var(--text-secondary)', marginTop: '4px' } },
            'Do you have a .json backup from another browser or device that you\u2019d like to restore?')
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' } },
          h('button', {
            className: 'primary',
            onClick: handleImportFromFile,
            disabled: importing
          }, importing ? 'Importing\u2026' : 'Yes \u2014 import my backup file'),
          h('button', { onClick: () => setPhase('setup') }, 'No \u2014 start fresh'),
          importError ? h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--late-red)' } }, importError) : null
        ),
        h('p', { style: { fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '16px' } },
          'Choosing "Import" will load your backup file and take you straight into the app with all your existing data. ',
          'Choosing "Start fresh" takes you through the quick setup wizard.')
      )
    );
  }

  return h('div', { className: 'wizard-shell' },
    h('div', { className: 'wizard-scroll' },
      h('div', { className: 'wizard-progress' },
        steps.map((s, i) => h('div', { key: i, className: `wizard-step-dot${i <= step ? ' active' : ''}` }))
      ),
      h('div', null,
        h('h2', null, steps[step].title),
        h('p', { style: { color: 'var(--text-secondary)', marginTop: '4px' } }, steps[step].subtitle)
      ),
      body,
      (step === steps.length - 1 && new Date().getDate() > 1)
        ? h('div', { className: 'wizard-midmonth' },
            h('label', { className: 'wizard-midmonth-row' },
              h('input', {
                type: 'checkbox',
                checked: markPastPaid,
                onChange: (e) => setMarkPastPaid(e.target.checked)
              }),
              h('div', null,
                h('span', { className: 'wizard-midmonth-title' }, 'Bills earlier this month are already paid'),
                h('span', { className: 'wizard-midmonth-sub' }, 'Since you\u2019re starting mid-month, we\u2019ll check off bills whose date has already passed so nothing shows up as late. You can uncheck any of them later.')
              )
            )
          )
        : null
    ),
    h('div', { className: 'row-between' },
      step > 0
        ? h('button', { onClick: handleBack }, 'Back')
        : h('div'),
      h('button', { className: 'primary', onClick: handleNext }, step < steps.length - 1 ? 'Next' : 'Finish setup')
    )
  );
}

function EntryList({ rows, categories, namePlaceholder, suggestions, onAddPreset, onChange, onAdd, onRemove, addLabel, dateLabel, emptyHint }) {
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

function EntryCard({ row, categories, namePlaceholder, dateLabel, onChange, onRemove }) {
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
            h('div', { className: 'setup-field' },
              h('label', null, 'Start'),
              h('input', { type: 'date', value: row.date, onChange: (e) => onChange('date', e.target.value) })
            ),
            h('div', { className: 'setup-field' },
              h('label', null, 'End'),
              h('input', { type: 'date', value: row.dateEnd, onChange: (e) => onChange('dateEnd', e.target.value) })
            )
          )
        : h('div', { className: 'setup-field' },
            h('label', null, dateLabel || 'Date'),
            h('input', { type: 'date', value: row.date, onChange: (e) => onChange('date', e.target.value) })
          ),
      h('div', { className: 'setup-field' },
        h('label', null, 'Repeats'),
        h('select', { value: row.freq, onChange: (e) => onChange('freq', e.target.value) },
          FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
      ),
      (recurring && row.repeatUntil)
        ? h('div', { className: 'setup-field' },
            h('label', null, 'Repeat ends'),
            h('input', { type: 'date', value: row.repeatUntil, onChange: (e) => onChange('repeatUntil', e.target.value) })
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


function CreditCardEntryList({ cards, onChange, onAdd, onRemove }) {
  return h('div', { className: 'setup-list' },
    cards.length === 0 ? h('p', { className: 'setup-empty-hint' },
      'No credit cards added \u2014 that\u2019s fine, you can skip this entirely.') : null,
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
          h('div', { className: 'setup-field' },
            h('label', null, 'Total debt'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: c.totalDebt, onChange: (e) => onChange(c.id, 'totalDebt', e.target.value) })
          ),
          h('div', { className: 'setup-field' },
            h('label', null, 'Amount paid'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: c.amountPaid, onChange: (e) => onChange(c.id, 'amountPaid', e.target.value) })
          )
        ),
        h('div', { className: 'checkbox-row', style: { marginTop: '12px' } },
          h('input', {
            type: 'checkbox',
            id: `cc-recurring-${c.id}`,
            checked: c.hasRecurringPayment,
            onChange: (e) => onChange(c.id, 'hasRecurringPayment', e.target.checked)
          }),
          h('label', { htmlFor: `cc-recurring-${c.id}`, style: { margin: 0 } }, 'Has a required recurring payment')
        ),
        c.hasRecurringPayment ? h('div', { className: 'setup-entry-grid', style: { marginTop: '10px' } },
          h('div', { className: 'setup-field' },
            h('label', null, 'Payment'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: c.paymentAmount, onChange: (e) => onChange(c.id, 'paymentAmount', e.target.value) })
          ),
          h('div', { className: 'setup-field' },
            h('label', null, 'Due date'),
            h('input', { type: 'date', value: c.paymentDate, onChange: (e) => onChange(c.id, 'paymentDate', e.target.value) })
          ),
          h('div', { className: 'setup-field' },
            h('label', null, 'Repeats'),
            h('select', { value: c.paymentFreq, onChange: (e) => onChange(c.id, 'paymentFreq', e.target.value) },
              FREQS.filter((f) => f !== 'none').map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
          )
        ) : null,
        h('div', { className: 'checkbox-row', style: { marginTop: '10px' } },
          h('input', {
            type: 'checkbox',
            id: `cc-apr-${c.id}`,
            checked: c.useApr,
            onChange: (e) => onChange(c.id, 'useApr', e.target.checked)
          }),
          h('label', { htmlFor: `cc-apr-${c.id}`, style: { margin: 0 } }, 'Track APR / interest (optional)')
        ),
        c.useApr ? h('div', { className: 'setup-entry-grid', style: { marginTop: '10px' } },
          h('div', { className: 'setup-field' },
            h('label', null, 'APR %'),
            h('input', { type: 'number', inputMode: 'decimal', step: '0.01', placeholder: 'e.g. 24.99', value: c.apr, onChange: (e) => onChange(c.id, 'apr', e.target.value) })
          )
        ) : null
      )
    ),
    h('button', { className: 'setup-add-row', onClick: onAdd }, '+ Add a credit card')
  );
}

const ENTRY_TYPES = [
  { id: 'oneTimePayment', label: 'Purchase', icon: '\u{1F4B3}', desc: 'Something you bought' },
  { id: 'bill', label: 'Bill', icon: '\u{1F4C5}', desc: 'Recurring' },
  { id: 'subscription', label: 'Subscription', icon: '\u{1F504}', desc: 'Auto-renewing' },
  { id: 'oneTimeIncome', label: 'Income', icon: '\u{1F4B0}', desc: 'Money in' }
];

const RECURRING_FREQS = ['weekly', 'biweekly', 'monthly', 'yearly'];

function currencySymbol(currency) {
  return fmtCurrency(0, currency).replace(/[\d.,\s]/g, '') || '$';
}

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

function PickChips({ options, value, onPick }) {
  return h('div', { className: 'chip-row' },
    options.map((o) => h('button', {
      key: o,
      className: `pick-chip${value === o ? ' on' : ''}`,
      onClick: () => { haptic('light'); onPick(o); }
    }, o))
  );
}

function QuickAddModal({ data, setData, initialDate, preset, entry: editing, onClose }) {
  const overlay = useOverlayDismiss(onClose);
  const currency = data.settings.currency;
  const isEdit = !!editing;

  const [type, setType] = useState(() => (isEdit && editing.oneTimeKind === 'income') ? 'oneTimeIncome' : 'oneTimePayment');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [useRange, setUseRange] = useState(() => isEdit && !!editing.useAmountRange);
  const [useSpan, setUseSpan] = useState(false);
  const [useRepeatEnd, setUseRepeatEnd] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(() => (isEdit ? isPaid(data, editing.id, editing.date) : true));
  const [paidTouched, setPaidTouched] = useState(isEdit);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState(() => {
    if (isEdit) {
      const shaped = entryToFormShape(editing);
      const override = getOverride(data, editing.id, editing.date);
      if (hasAmountOverride(override) && !editing.useAmountRange) shaped.amount = String(override.amount);
      return { ...blankEntry({}), ...shaped, freq: 'none' };
    }
    return blankEntry({
      date: initialDate || todayYmd(),
      freq: 'none',
      name: (preset && preset.name) || '',
      amount: (preset && preset.amount) ? String(preset.amount) : '',
      category: (preset && preset.category) || defaultCategoryForType('oneTimePayment')
    });
  });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function pickType(next) {
    haptic('light');
    setType(next);
    setPickerOpen(false);
    setForm((f) => {
      const list = categoriesForType(next);
      return {
        ...f,
        freq: (next === 'bill' || next === 'subscription') ? (f.freq === 'none' ? 'monthly' : f.freq) : 'none',
        category: list.includes(f.category) ? f.category : defaultCategoryForType(next)
      };
    });
    if (next !== 'oneTimePayment') {
      setUseSpan(false);
      setUseRepeatEnd(false);
    }
  }

  function setDate(value) {
    update('date', value);
    if (!paidTouched) setAlreadyPaid(value <= todayYmd());
  }

  const isPurchase = type === 'oneTimePayment';
  const isRecurring = type === 'bill' || type === 'subscription';
  const categories = useMemo(() => categoriesByUse(data, type), [data.oneTimeEntries, type]);
  const typeInfo = ENTRY_TYPES.find((t) => t.id === type);

  const amountValue = useRange
    ? (parseFloat(form.amountMin) || 0) + (parseFloat(form.amountMax) || 0)
    : parseFloat(form.amount) || 0;
  const canSave = amountValue > 0;

  const dateLabel = type === 'oneTimeIncome' ? 'Date received'
    : isPurchase ? 'Date paid'
    : type === 'subscription' ? 'Billing date'
    : 'Due date';

  function saveEdit(entry) {
    const oldKey = `${editing.id}|${editing.date}`;
    const newKey = `${entry.id}|${entry.date}`;
    const paidHistory = { ...data.paidHistory };
    const overrides = { ...(data.overrides || {}) };
    delete paidHistory[oldKey];
    delete overrides[oldKey];
    if (isPurchase && alreadyPaid) paidHistory[newKey] = true;
    const kind = isPurchase ? 'payment' : 'income';
    const { _isNew, ...clean } = entry;
    setData(logActivity({
      ...data,
      paidHistory,
      overrides,
      oneTimeEntries: data.oneTimeEntries.map((e) => (e.id === editing.id ? { ...e, ...clean, oneTimeKind: kind } : e))
    }, `Edited "${entry.name}"`));
    onClose();
  }

  function deleteEntry() {
    if (!confirmDelete) { haptic('warn'); setConfirmDelete(true); return; }
    haptic('heavy');
    const key = `${editing.id}|${editing.date}`;
    const paidHistory = { ...data.paidHistory };
    const overrides = { ...(data.overrides || {}) };
    delete paidHistory[key];
    delete overrides[key];
    setData(logActivity({
      ...data,
      paidHistory,
      overrides,
      oneTimeEntries: data.oneTimeEntries.filter((e) => e.id !== editing.id)
    }, `Deleted "${editing.name}"`));
    onClose();
  }

  function submit() {
    if (!canSave) return;
    haptic('success');
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
        next.paidHistory = { ...data.paidHistory, [`${entry.id}|${entry.date}`]: true };
      }
      setData(logActivity(next, `Logged "${name}"`));
    } else {
      setData(logActivity({ ...data, oneTimeEntries: [...data.oneTimeEntries, { ...entry, oneTimeKind: 'income' }] }, `Added income "${name}"`));
    }
    onClose();
  }

  const header = isEdit ? h('div', { className: 'qa-head' },
    h('div', { className: 'qa-type' },
      h('span', { className: 'qa-emoji' }, typeInfo.icon),
      h('span', { className: 'qa-type-name' }, isPurchase ? 'Edit purchase' : 'Edit income'),
      h('span', { className: 'qa-type-desc' }, `Logged for ${formatDate(parseYmd(editing.date), data.settings, { weekday: true })}`)
    )
  ) : h('div', { className: 'qa-head' },
    h('button', {
      className: 'qa-type',
      onClick: () => { haptic('light'); setPickerOpen(!pickerOpen); },
      'aria-expanded': pickerOpen
    },
      h('span', { className: 'qa-emoji' }, typeInfo.icon),
      h('span', { className: 'qa-type-name' },
        typeInfo.label,
        h('span', { className: `qa-type-caret${pickerOpen ? ' open' : ''}` }, '›')
      ),
      h('span', { className: 'qa-type-desc' }, pickerOpen ? 'Pick what you are adding' : typeInfo.desc)
    ),
    pickerOpen ? h('div', { className: 'type-tiles' },
      ENTRY_TYPES.map((t) =>
        h('button', {
          key: t.id,
          className: `type-tile${type === t.id ? ' selected' : ''}`,
          onClick: () => pickType(t.id)
        },
          h('span', { className: 'type-tile-icon' }, t.icon),
          h('span', { className: 'type-tile-name' }, t.label)
        )
      )
    ) : null
  );

  const amountBlock = useRange
    ? h('div', { className: 'setup-entry-grid' },
        h('div', { className: 'setup-field' },
          h('label', null, 'Least it can be'),
          h('input', {
            type: 'number', inputMode: 'decimal', placeholder: '0',
            value: form.amountMin, onChange: (e) => update('amountMin', e.target.value)
          })
        ),
        h('div', { className: 'setup-field' },
          h('label', null, 'Most it can be'),
          h('input', {
            type: 'number', inputMode: 'decimal', placeholder: '0',
            value: form.amountMax, onChange: (e) => update('amountMax', e.target.value)
          })
        )
      )
    : h('div', { className: 'qa-amount' },
        h('span', { className: 'qa-amount-sym' }, currencySymbol(currency)),
        h('input', {
          className: 'qa-amount-input',
          type: 'number',
          inputMode: 'decimal',
          placeholder: '0',
          autoFocus: !isEdit,
          value: form.amount,
          onChange: (e) => update('amount', e.target.value)
        })
      );

  const categoryBlock = h('div', { className: 'qa-block' },
    h('p', { className: 'qa-label' }, 'Category'),
    h(PickChips, { options: categories, value: form.category, onPick: (c) => update('category', c) })
  );

  const nameBlock = h('div', { className: 'setup-field' },
    h('label', null, 'Name (optional)'),
    h('input', {
      type: 'text',
      placeholder: `Defaults to "${form.category}"`,
      value: form.name,
      onChange: (e) => update('name', e.target.value)
    })
  );

  const dateBlock = h('div', { className: 'qa-block' },
    h('p', { className: 'qa-label' }, dateLabel),
    h('div', { className: 'qa-date-row' },
      !isRecurring ? h('div', { className: 'chip-row' },
        h('button', {
          className: `pick-chip${form.date === todayYmd() ? ' on' : ''}`,
          onClick: () => { haptic('light'); setDate(todayYmd()); }
        }, 'Today'),
        h('button', {
          className: `pick-chip${form.date === yesterdayYmd() ? ' on' : ''}`,
          onClick: () => { haptic('light'); setDate(yesterdayYmd()); }
        }, 'Yesterday')
      ) : null,
      h('input', {
        className: 'qa-date-input',
        type: 'date',
        value: form.date,
        onChange: (e) => setDate(e.target.value)
      })
    )
  );

  const repeatBlock = isRecurring ? h('div', { className: 'qa-block' },
    h('p', { className: 'qa-label' }, 'Repeats'),
    h(PickChips, {
      options: RECURRING_FREQS,
      value: form.freq,
      onPick: (f) => update('freq', f)
    })
  ) : null;

  function optionRow(id, checked, onChange, label, revealed) {
    return h('div', { className: 'qa-option' },
      h('div', { className: 'checkbox-row' },
        h('input', { type: 'checkbox', id, checked, onChange: (e) => { haptic('light'); onChange(e.target.checked); } }),
        h('label', { htmlFor: id, style: { margin: 0 } }, label)
      ),
      checked && revealed ? h('div', { className: 'qa-reveal' }, revealed) : null
    );
  }

  const options = h('div', { className: 'qa-options' },
    isPurchase
      ? optionRow('qa-paid', alreadyPaid, (v) => { setPaidTouched(true); setAlreadyPaid(v); },
          'Already paid for', null)
      : null,
    optionRow('qa-range', useRange, setUseRange, 'The amount varies', null),
    isRecurring
      ? optionRow('qa-span', useSpan, setUseSpan, 'It spans several days',
          h('div', { className: 'setup-field' },
            h('label', null, 'Last day'),
            h('input', { type: 'date', value: form.dateEnd, onChange: (e) => update('dateEnd', e.target.value) })
          ))
      : null,
    isRecurring
      ? optionRow('qa-end', useRepeatEnd, (v) => {
          setUseRepeatEnd(v);
          if (v && !form.repeatUntil) update('repeatUntil', defaultRepeatUntil(form.date));
        }, 'It stops on a date',
          h('div', { className: 'setup-field' },
            h('label', null, 'Last payment'),
            h('input', { type: 'date', value: form.repeatUntil, onChange: (e) => update('repeatUntil', e.target.value) })
          ))
      : null
  );

  return h('div', Object.assign({ className: 'modal-overlay as-window' }, overlay),
    h('div', { className: 'modal-content as-window qa-modal' },
      h('button', { className: 'modal-x qa-x', onClick: onClose, 'aria-label': 'Close' },
        h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
          h('path', { d: 'M6 6l12 12M18 6L6 18' })
        )
      ),

      header,
      amountBlock,
      categoryBlock,
      nameBlock,
      dateBlock,
      repeatBlock,
      options,

      isEdit ? h('button', { className: 'price-action-row danger', onClick: deleteEntry },
        h('div', null,
          h('span', { className: 'price-action-title' },
            confirmDelete ? 'Tap again to delete' : `Delete this ${isPurchase ? 'purchase' : 'income'}`),
          h('span', { className: 'price-action-sub' },
            confirmDelete ? 'This cannot be undone' : 'Takes it off the calendar and out of your totals')
        ),
        h('span', { className: 'price-action-chevron' }, '\u203a')
      ) : null,

      h('div', { className: 'qa-actions' },
        canSave ? null : h('p', { className: 'qa-hint' }, 'Enter an amount to save this.'),
        h('div', { className: 'qa-foot' },
          h('button', { onClick: onClose }, 'Cancel'),
          h('button', { className: 'primary', onClick: submit, disabled: !canSave },
            isEdit ? 'Save changes' : `Add ${typeInfo.label.toLowerCase()}`)
        )
      )
    )
  );
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
        h('input', {
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
            o.pushedTo ? h(PushedMark, { title: `Pushed to ${formatDate(parseYmd(o.pushedTo), data.settings)}` }) : null,
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
            o.pushedTo ? h(PushedMark, { title: `Pushed to ${formatDate(parseYmd(o.pushedTo), data.settings)}` }) : null,
            o.name
          ),
          h('input', {
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
  const { check, windowStart, windowEnd, bills, due, checkAmount, estimate, overdueCount, period, hasPrev, hasNext, pushedOut, spent, spendStart } = nextCheck;
  const dateLabel = formatDate(windowEnd, data.settings, { weekday: true });

  const headingText = period === 0
    ? 'Before your next check'
    : period === 1 ? 'The next pay period' : `${period} pay periods ahead`;

  const whenText = check
    ? `${check.name} \u00b7 ${dateLabel}`
    : `No income scheduled \u2014 showing through ${dateLabel}`;

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
        ? `${fmtCurrency(shortfall, currency)} more than that check covers`
        : `${fmtCurrency(-shortfall, currency)} of it left over`
    ) : null,

    spent > 0 ? h('p', { className: 'nextcheck-spent' },
      `${fmtCurrency(spent, currency)} spent since ${formatDate(spendStart, data.settings)}`
    ) : null,

    estimate ? h('p', { className: 'nextcheck-est' },
      `Check estimated at ${fmtCurrency(estimate.amount, currency)} — average of your last ${estimate.count} recorded paychecks`
    ) : null,

    bills.length === 0
      ? h('p', { className: 'empty-state' },
          pushedOut.count > 0
            ? 'Everything in this stretch is pushed forward.'
            : period === 0 ? 'Nothing due before then \u2014 you\u2019re clear.' : 'Nothing due in this stretch.')
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
                h('span', { className: 'overdue-fold-sub' }, overdueOpen ? 'Tap to fold them away' : 'Tap to see them and check off what you have paid')
              ),
              h('span', { className: 'overdue-fold-amt' }, fmtCurrency(overdue.reduce((sum, o) => sum + o.amount, 0), currency)),
              h('span', { className: `drop-chevron${overdueOpen ? ' open' : ''}` }, '\u203a')
            ),
            overdueOpen ? renderList(overdue) : null,
            upcoming.length > 0 ? renderList(upcoming) : null
          )
        : renderList(bills),

    pushedOut.count > 0 ? h('p', { className: 'nextcheck-pushed' },
      h(PushedMark, { title: 'Pushed forward' }),
      `${pushedOut.count} pushed to ${formatDate(parseYmd(pushedOut.to), data.settings)} \u00b7 ${fmtCurrency(pushedOut.amount, currency)}`
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
  const netProjected = fin.totalProjectedIncome - fin.totalBills;
  const leftToPay = Math.max(0, fin.totalBills - fin.billsPaid);
  const coveredPct = fin.totalBills > 0 ? Math.min(100, (fin.billsPaid / fin.totalBills) * 100) : 0;

  const Renderer = isMobile ? BillChecklist : BillTileGrid;
  const listProps = { data, currency, onToggle: togglePaid, onOpen: (o) => setPriceModal({ occ: o }) };
  const checkListProps = { ...listProps, onOpen: (o) => setPriceModal({ occ: o, inCheckCard: true }) };

  return h('div', { className: `home-page${isMobile ? ' mobile-home' : ''}` },
    h('div', { className: `home-wash${netSoFar >= 0 ? '' : ' neg'}` },
      h(MonthHeader, { cursor, onChange: changeMonth }),
      h('div', { className: 'home-hero' },
        h('p', { className: 'home-hero-label' }, 'Net so far'),
        h('p', {
          className: 'home-hero-value',
          style: { color: netSoFar >= 0 ? 'var(--text-success)' : 'var(--late-red)' }
        }, `${netSoFar >= 0 ? '+' : ''}${fmtCurrency(netSoFar, currency)}`),
        h('p', { className: 'home-hero-proj' },
          'Projected ',
          h('b', { style: { color: netProjected >= 0 ? 'var(--text-success)' : 'var(--late-red)' } },
            `${netProjected >= 0 ? '+' : ''}${fmtCurrency(netProjected, currency)}`)
        )
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
            `${fmtCurrency(fin.billsPaid, currency)} covered \u00b7 ${fmtCurrency(leftToPay, currency)} left`)
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
    { label: 'Income so far', value: fmtCurrency(fin.incomeReceived, currency), sub: `of ${fmtCurrency(fin.totalProjectedIncome, currency)} expected`, tone: 'good' },
    hasLast ? {
      label: 'vs last month',
      value: `${billsDelta > 0 ? '+' : billsDelta < 0 ? '−' : ''}${fmtCurrency(Math.abs(billsDelta), currency)}`,
      sub: Math.abs(billsDelta) < 1 ? 'about the same going out' : billsDelta > 0 ? 'more going out' : 'less going out',
      tone: Math.abs(billsDelta) < 1 ? null : billsDelta > 0 ? 'bad' : 'good'
    } : null
  ].filter(Boolean);

  return h('section', { className: 'stats-section' },
    h('p', { className: 'stats-title' }, 'At a glance'),
    h('div', { className: 'spend-stats' },
      tiles.map((t) => h('div', { key: t.label, className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, t.label),
        h('span', { className: `spend-stat-value${t.tone ? ' ' + t.tone : ''}` }, t.value),
        h('span', { className: 'spend-stat-sub' }, t.sub)
      ))
    )
  );
}

function ChipToggle({ options, value, onChange }) {
  return h('div', { className: 'chip-toggle', role: 'tablist' },
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
    { key: netKey, label: 'Net', color: 'var(--accent)', signed: true }
  ];

  return h('section', { className: 'stats-section' },
    h('div', { className: 'stats-head' },
      h('div', null,
        h('p', { className: 'stats-title' }, 'Cash flow'),
        h('p', { className: 'stats-caption' },
          hovered ? `Day ${hovered.day}` : (view === 'cumulative' ? 'Running totals through the month' : 'What moves each day'))
      ),
      h(ChipToggle, {
        value: view,
        onChange: (v) => { setView(v); setHoverIdx(null); },
        options: [{ id: 'cumulative', label: 'Running' }, { id: 'daily', label: 'Daily' }]
      })
    ),
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
    h('div', { className: 'stats-head' },
      h('div', null,
        h('p', { className: 'stats-title' }, filter === 'income' ? 'Where it comes from' : 'Where it goes'),
        h('p', { className: 'stats-caption' }, groupBy === 'source' ? 'Grouped by kind' : 'Grouped by category')
      ),
      h(ChipToggle, {
        value: filter,
        onChange: setFilter,
        options: [{ id: 'bills', label: 'Out' }, { id: 'income', label: 'In' }]
      })
    ),
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
  const oneTime = occ.isOneTime || occ.sourceList === 'oneTimeEntries'
    ? data.oneTimeEntries.find((e) => e.id === occ.id)
    : null;
  if (oneTime) {
    return h(QuickAddModal, { data, setData: props.setData, entry: oneTime, onClose: props.onClose });
  }
  return h(OccurrenceHub, props);
}

function OccurrenceHub({ data, setData, occ, currency, inCheckCard, pushTo, onClose }) {
  const overlay = useOverlayDismiss(onClose);
  const existing = getOverride(data, occ.id, occ.occDate);
  const [price, setPrice] = useState(existing && existing.amount !== undefined ? String(existing.amount) : '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [cover, setCover] = useState(() => {
    const already = coveredAmount(data, occ.id, occ.occDate);
    return already > 0 ? String(already) : '';
  });
  const [coverOpen, setCoverOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  function save() {
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
    let nextData = logActivity({ ...data, overrides: next }, `Cleared price override for "${occ.name}"`);
    setData(nextData);
    onClose();
  }

  const { paid, forced, late } = lateState(data, occ);
  const pushedTo = deferredTo(data, occ.id, occ.occDate);
  const covered = coveredAmount(data, occ.id, occ.occDate);
  const fullAmount = hasAmountOverride(existing) ? Number(existing.amount) || 0 : entryAmount(occ);
  const coverVal = Math.min(parseFloat(cover) || 0, fullAmount);
  const remaining = Math.max(0, fullAmount - coverVal);

  function applyCover() {
    haptic('success');
    let next = setCovered(data, occ.id, occ.occDate, coverVal);
    if (coverVal > 0 && pushTo && !pushedTo) {
      next = setDeferred(next, occ.id, occ.occDate, pushTo);
    }
    next = logActivity(next, coverVal > 0
      ? `Covered ${fmtCurrency(coverVal, currency)} of "${occ.name}"`
      : `Cleared the covered amount on "${occ.name}"`);
    setData(next);
    setCoverOpen(false);
  }

  function togglePush() {
    haptic(pushedTo ? 'light' : 'medium');
    const target = pushedTo ? null : pushTo;
    let next = setDeferred(data, occ.id, occ.occDate, target);
    next = logActivity(next, target
      ? `Pushed "${occ.name}" to ${formatDate(parseYmd(target), data.settings)}`
      : `Pulled "${occ.name}" back to this pay period`);
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
    haptic('heavy');
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
      getEditModalConfig(occ.sourceList, editing)
    ));
  }

  const d = parseYmd(occ.occDate);
  const dateLabel = formatDate(d, data.settings, { weekday: true, year: true });
  const templateLabel = occ.isRange
    ? fmtRange(occ.amountMin, occ.amountMax, currency)
    : fmtCurrency(entryAmount(occ), currency);

  return h('div', Object.assign({ className: 'modal-overlay as-window' }, overlay),
    h('div', { className: 'modal-content as-window price-modal' },
      h('div', { className: 'modal-window-head' },
        h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px' } }, occ.name),
        h('button', { className: 'modal-x', onClick: onClose, 'aria-label': 'Close' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
            h('path', { d: 'M6 6l12 12M18 6L6 18' })
          )
        )
      ),

      h('div', { className: 'price-meta' },
        h('span', null, dateLabel),
        h('span', { className: 'price-meta-amt' }, templateLabel)
      ),

      h('div', { className: 'price-field' },
        h('label', null, occ.kind === 'income' ? 'What actually came in' : 'What it actually cost this time'),
        h('input', {
          type: 'number',
          inputMode: 'decimal',
          placeholder: 'e.g. 94.32',
          value: price,
          onChange: (e) => setPrice(e.target.value)
        }),
        h('p', { className: 'price-hint' },
          'Only changes this date \u2014 every other date keeps the usual amount.')
      ),

      h('div', { className: 'price-actions' },
        (inCheckCard && pushTo && occ.kind !== 'income' && !paid)
          ? h('button', { className: `price-action-row${pushedTo ? ' active' : ''}`, onClick: togglePush },
              h('div', null,
                h('span', { className: 'price-action-title' },
                  pushedTo ? `Pushed to ${formatDate(parseYmd(pushedTo), data.settings)}` : 'Push to next check'),
                h('span', { className: 'price-action-sub' },
                  pushedTo
                    ? 'Tap to pull it back to this pay period'
                    : `Moves it to ${formatDate(parseYmd(pushTo), data.settings)} on Home \u2014 the calendar and totals stay put`)
              ),
              h('span', { className: 'price-action-chevron' }, pushedTo ? '\u2713' : '\u203a')
            )
          : null,

        (inCheckCard && occ.kind !== 'income' && !paid)
          ? h('div', { className: 'price-cover-block' },
              h('button', {
                className: `price-action-row${covered > 0 ? ' active' : ''}`,
                onClick: () => { haptic('light'); setCoverOpen((v) => !v); },
                'aria-expanded': coverOpen
              },
                h('div', null,
                  h('span', { className: 'price-action-title' },
                    covered > 0 ? `Covering ${fmtCurrency(covered, currency)}` : 'Cover part of it'),
                  h('span', { className: 'price-action-sub' },
                    covered > 0
                      ? `${fmtCurrency(Math.max(0, fullAmount - covered), currency)} still owed`
                      : 'Put down what you can, carry the rest')
                ),
                h('span', { className: `price-action-chevron${coverOpen ? ' open' : ''}` }, '\u203a')
              ),
              coverOpen ? h('div', { className: 'price-cover' },
                h('input', {
                  type: 'number',
                  inputMode: 'decimal',
                  placeholder: `up to ${fmtCurrency(fullAmount, currency)}`,
                  value: cover,
                  onChange: (e) => setCover(e.target.value)
                }),
                h('div', { className: 'setup-chips' },
                  h('button', {
                    className: 'setup-chip',
                    onClick: () => { haptic('light'); setCover(String(Math.round((fullAmount / 2) * 100) / 100)); }
                  }, `Half \u00b7 ${fmtCurrency(fullAmount / 2, currency)}`),
                  cover !== '' ? h('button', {
                    className: 'setup-chip',
                    onClick: () => { haptic('light'); setCover(''); }
                  }, 'Clear') : null
                ),
                h('p', { className: 'price-cover-note' },
                  coverVal > 0
                    ? `${fmtCurrency(remaining, currency)} would still be owed`
                    : 'Enter what you can put toward it now'),
                h('button', {
                  className: 'primary price-cover-go',
                  onClick: applyCover,
                  disabled: coverVal <= 0 && covered <= 0
                },
                  coverVal <= 0
                    ? 'Clear the covered amount'
                    : (pushTo && !pushedTo)
                      ? `Cover ${fmtCurrency(coverVal, currency)} \u00b7 push the rest`
                      : `Cover ${fmtCurrency(coverVal, currency)}`)
              ) : null
            )
          : null,

        occ.kind === 'income' ? null : occ.isOneTime
          ? h('button', { className: `price-action-row${paid ? ' active' : ''}`, onClick: togglePaid },
              h('div', null,
                h('span', { className: 'price-action-title' }, paid ? 'Paid' : 'Mark as paid'),
                h('span', { className: 'price-action-sub' }, paid ? 'Tap to undo' : 'Check it off for this date')
              ),
              h('span', { className: 'price-action-chevron' }, paid ? '\u2713' : '\u203a')
            )
          : h('div', { className: 'price-action-pair' },
          h('button', { className: `price-action-row half${paid ? ' active' : ''}`, onClick: togglePaid },
            h('span', { className: 'price-action-title' }, paid ? 'Paid' : 'Mark paid'),
            h('span', { className: 'price-action-sub' }, paid ? 'Tap to undo' : 'Check it off')
          ),
          (forced
            ? h('button', { className: 'price-action-row half active', onClick: toggleLate },
                h('span', { className: 'price-action-title' }, 'Marked late'),
                h('span', { className: 'price-action-sub' }, 'Tap to clear')
              )
            : late
              ? h('button', { className: 'price-action-row half', onClick: dismissLate },
                  h('span', { className: 'price-action-title' }, 'Late'),
                  h('span', { className: 'price-action-sub' }, 'Tap to dismiss')
                )
              : h('button', { className: 'price-action-row half', onClick: toggleLate },
                  h('span', { className: 'price-action-title' }, 'Mark late'),
                  h('span', { className: 'price-action-sub' }, 'Flag this date')
                ))
        ),
        editable ? h('button', { className: 'price-action-row', onClick: openEdit },
          h('div', null,
            h('span', { className: 'price-action-title' }, `Edit ${occ.name}`),
            h('span', { className: 'price-action-sub' }, 'Change the amount, date or how often it repeats')
          ),
          h('span', { className: 'price-action-chevron' }, '\u203a')
        ) : null,
        h('button', { className: 'price-action-row danger', onClick: () => confirmRemove ? removeThisOccurrence() : setConfirmRemove(true) },
          h('div', null,
            h('span', { className: 'price-action-title' }, confirmRemove ? 'Tap again to confirm' : 'Remove this occurrence'),
            h('span', { className: 'price-action-sub' },
              occ.sourceList === 'oneTimeEntries' ? 'Deletes this entry' : 'Only this date; rule stays')
          ),
          h('span', { className: 'price-action-chevron' }, '\u203a')
        )
      ),

      h('div', { className: 'price-footer' },
        existing ? h('button', { className: 'link-btn', onClick: clearOverride }, 'Clear override') : h('span'),
        h('button', { className: 'primary', onClick: save }, 'Save')
      )
    )
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
    return [...recurring, ...oneTime];
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
  function goToday() {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
    setSelectedDay(null);
  }
  const _now = new Date();
  const isCurrentMonth = cursor.getFullYear() === _now.getFullYear() && cursor.getMonth() === _now.getMonth();

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
    const monthLabel = `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;

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
      h('div', { className: 'calm-header' },
        h('button', { className: 'calm-nav', onClick: () => changeMonth(-1), 'aria-label': 'Previous month' }, '\u2039'),
        h('div', { className: 'calm-title-wrap' },
          h('h2', { className: 'calm-title' }, monthLabel),
          !isCurrentMonth ? h('button', { className: 'today-btn', onClick: goToday }, 'Today') : null
        ),
        h('button', { className: 'calm-nav', onClick: () => changeMonth(1), 'aria-label': 'Next month' }, '\u203a')
      ),

      h('div', { className: 'calm-toggle' },
        h('button', { className: `calm-toggle-btn${view === 'grid' ? ' on' : ''}`, onClick: () => setView('grid') }, 'Month'),
        h('button', { className: `calm-toggle-btn${view === 'agenda' ? ' on' : ''}`, onClick: () => setView('agenda') }, 'Agenda')
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
        onAddEntry
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
  const sheet = useSheetDismiss(onClose);
  const overlay = useOverlayDismiss(onClose);
  const [priceModal, setPriceModal] = useState(null);

  function togglePaid(o) {
    const wasPaid = isPaid(data, o.id, o.occDate);
    haptic(wasPaid ? 'light' : 'success');
    let next = togglePaidStatus(data, o.id, o.occDate);
    next = logActivity(next, `${wasPaid ? 'Unmarked' : 'Marked'} "${o.name}" as paid`);
    setData(next);
  }

  const date = parseYmd(dateStr);
  const dateLabel = formatDate(date, data.settings, { weekday: true });
  const out = occs.filter((o) => o.kind !== 'income').reduce((sum, o) => sum + o.amount, 0);
  const inflow = occs.filter((o) => o.kind === 'income').reduce((sum, o) => sum + o.amount, 0);
  const summary = [
    out > 0 ? `${fmtCurrency(out, currency)} out` : null,
    inflow > 0 ? `${fmtCurrency(inflow, currency)} in` : null
  ].filter(Boolean).join(' \u00b7 ');

  return h('div', Object.assign({ className: 'modal-overlay' }, overlay),
    h('div', { className: 'modal-content day-modal' },
      h('div', { className: 'sheet-grabber', ...sheet, 'aria-label': 'Close' }),
      h('div', { className: 'day-head' },
        h('div', null,
          h('p', { className: 'day-title' }, dateLabel),
          h('p', { className: 'day-sub' }, occs.length === 0 ? 'Nothing scheduled' : summary)
        ),
        h('button', { className: 'modal-x', onClick: onClose, 'aria-label': 'Close' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
            h('path', { d: 'M6 6l12 12M18 6L6 18' })
          )
        )
      ),

      occs.length === 0 ? null : h('div', { className: 'entry-list day-list' },
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
                income ? 'Income' : [paid ? 'Paid' : (late ? 'Late' : null), o.category || SOURCE_GROUP_LABELS[o.sourceList]].filter(Boolean).join(' \u00b7 '))
            ),
            h('span', { className: `entry-row-amt${income ? ' positive' : ''}` },
              `${income ? '+' : ''}${occAmountLabel(o, currency)}`),
            h('span', { className: 'att-chevron' }, '\u203a')
          );
        })
      ),

      h('button', { className: 'add-row', onClick: () => { onClose(); onAddEntry(); } },
        `+ Add something on ${formatDate(date, data.settings)}`),

      priceModal ? h(PriceOverrideModal, {
        data, setData, occ: priceModal, currency,
        onClose: () => setPriceModal(null)
      }) : null
    )
  );
}

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
      ...expandAll(getAllBillLikeEntries(data), 'bill', windowStart, windowEnd, data),
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

    return {
      check,
      windowStart,
      windowEnd,
      bills,
      period: idx,
      hasPrev: idx > 0,
      hasNext: idx + 1 < checks.length,
      due: bills.reduce((sum, o) => sum + o.amount, 0),
      checkAmount: check ? check.amount : 0,
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

const UPCOMING_PREVIEW = 6;

function MonthHeader({ cursor, onChange }) {
  const label = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return h('div', { className: 'home-month-header' },
    h('button', { onClick: () => { haptic('light'); onChange(-1); }, 'aria-label': 'Previous month' }, '\u2039'),
    h('h1', { className: 'home-month-title' }, label),
    h('button', { onClick: () => { haptic('light'); onChange(1); }, 'aria-label': 'Next month' }, '\u203a')
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
    : h(StatisticsPage, { data, setData, isMobile });

  if (isMobile) return body;

  return h('div', { className: 'ov-page' },
    h(OverviewSwitch, { view, setView }),
    body
  );
}

function StatisticsPage({ data, setData, isMobile }) {
  const currency = data.settings.currency;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [groupBy, setGroupBy] = useState('source');
  const [filter, setFilter] = useState('bills');
  const [priceModal, setPriceModal] = useState(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

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
    setShowAllUpcoming(false);
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  const now = new Date();
  const isCurrentMonth = cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();
  const sc = data.settings.sectionColors || {};
  const colors = { income: sc.incomeSources || '#4FAE6B', bills: sc.majorBills || '#D85A5A' };

  const moneyIn = fin.totalProjectedIncome;
  const moneyOut = fin.totalBills;
  const net = moneyIn - moneyOut;
  const outPct = moneyIn > 0 ? Math.min(100, (moneyOut / moneyIn) * 100) : 100;

  const summary = h('section', { className: 'stats-summary' },
    h('div', { className: 'stats-summary-row' },
      h('div', { className: 'stats-summary-cell' },
        h('span', { className: 'spend-stat-label' }, 'Coming in'),
        h('span', { className: 'stats-summary-value good' }, fmtCurrency(moneyIn, currency))
      ),
      h('div', { className: 'stats-summary-cell' },
        h('span', { className: 'spend-stat-label' }, 'Going out'),
        h('span', { className: 'stats-summary-value' }, fmtCurrency(moneyOut, currency))
      )
    ),
    h('div', { className: 'stats-summary-bar' },
      h('span', { className: `stats-summary-fill${net < 0 ? ' over' : ''}`, style: { width: `${outPct}%` } })
    ),
    h('p', { className: `stats-summary-net${net < 0 ? ' short' : ''}` },
      moneyIn <= 0
        ? 'Add an income source in Settings to compare in against out.'
        : net >= 0
          ? `${fmtCurrency(net, currency)} left after everything \u2014 ${Math.round(100 - outPct)}% of what comes in`
          : `${fmtCurrency(-net, currency)} more going out than coming in`),
    fin.hasIncomeRange ? h('p', { className: 'stats-summary-range' },
      `Income could land anywhere from ${fmtRange(fin.projectedIncomeRange.min, fin.projectedIncomeRange.max, currency)}`) : null
  );

  const upcoming = fin.next7Days.filter((o) => o.kind === 'income' || !isPaid(data, o.id, o.occDate));
  const visibleUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, UPCOMING_PREVIEW);
  const todayStr = todayYmd();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = ymd(tomorrow);
  const dayWord = (dateStr) => dateStr === todayStr ? 'Today'
    : dateStr === tomorrowStr ? 'Tomorrow'
    : parseYmd(dateStr).toLocaleDateString('en-US', { weekday: 'long' });

  const next7 = h('section', { className: 'stats-section' },
    h('div', { className: 'stats-head' },
      h('div', null,
        h('p', { className: 'stats-title' }, 'Coming up'),
        h('p', { className: 'stats-caption' }, 'The next 7 days, still to pay or receive')
      )
    ),
    upcoming.length === 0
      ? h('p', { className: 'empty-state' }, 'Nothing due in the next 7 days.')
      : h('div', { className: 'entry-list' },
          visibleUpcoming.map((o, i) => h(EntryRow, {
            key: `${o.id}-${o.occDate}-${i}`,
            name: o.name,
            sub: `${dayWord(o.occDate)} \u00b7 ${formatDate(parseYmd(o.occDate), data.settings)}`,
            amount: `${o.kind === 'income' ? '+' : ''}${occAmountLabel(o, currency)}`,
            positive: o.kind === 'income',
            color: getEntryColor(o, data),
            onClick: () => setPriceModal(o)
          }))
        ),
    upcoming.length > UPCOMING_PREVIEW
      ? h('button', { className: 'att-more', onClick: () => setShowAllUpcoming(!showAllUpcoming) },
          showAllUpcoming ? 'Show less' : `Show all ${upcoming.length}`)
      : null
  );

  const monthHeader = h(MonthHeader, { cursor, onChange: changeMonth });
  const chart = h(CashFlowChart, {
    points: fin.cashFlowSeries, currency, colors,
    todayDay: isCurrentMonth ? now.getDate() : null
  });
  const donut = h(CategoryDonut, { data: breakdown, currency, groupBy, setGroupBy, filter, setFilter });
  const glance = h(GlanceGrid, { fin, currency });

  const priceModalEl = priceModal ? h(PriceOverrideModal, {
    data, setData, occ: priceModal, currency,
    onClose: () => setPriceModal(null)
  }) : null;

  if (isMobile) {
    return h('div', { className: 'stats-page' },
      monthHeader, summary, isCurrentMonth ? next7 : null, chart, donut, glance, priceModalEl
    );
  }

  return h('div', { className: 'stats-page' },
    monthHeader,
    h('div', { className: 'stats-desktop' },
      h('div', { className: 'stats-col' }, summary, chart, glance),
      h('div', { className: 'stats-col' }, isCurrentMonth ? next7 : null, donut)
    ),
    priceModalEl
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
  const [catFilter, setCatFilter] = useState(null);

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

  const monthKey = ymd(cursor).slice(0, 7);
  const prevCursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  const prevKey = ymd(prevCursor).slice(0, 7);
  const prevMonthName = MONTH_NAMES[prevCursor.getMonth()];

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
    setCatFilter(null);
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
        h('p', { className: 'stats-title' }, 'Monthly budgets'),
        h('p', { className: 'stats-caption' },
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
      ? h('button', { className: 'add-row', onClick: () => setBudgetModal({}) },
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
    h('div', { className: 'row-between' },
      h('div', null,
        h('p', { className: 'stats-title' }, 'Where it went'),
        h('p', { className: 'stats-caption' },
          catFilter
            ? `Showing ${catFilter} below \u00b7 tap it again to clear`
            : hasPrev
              ? `${breakdown.length} ${breakdown.length === 1 ? 'category' : 'categories'} \u00b7 compared with ${prevMonthName}`
              : `${breakdown.length} ${breakdown.length === 1 ? 'category' : 'categories'} this month`)
      ),
      h('span', { className: 'spend-section-total' }, fmtCurrency(spent, currency))
    ),
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
            `${row.pct}% of spending`,
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
    h('div', { className: 'row-between' },
      h('div', null,
        h('p', { className: 'stats-title' }, 'Purchases'),
        catFilter ? h('p', { className: 'stats-caption' }, `${catFilter} only`) : null
      ),
      h('span', { className: 'spend-section-total' }, fmtCurrency(filteredTotal, currency))
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
          filtered.length > PURCHASE_PREVIEW
            ? h('button', { className: 'att-more', onClick: () => setShowAllPurchases(!showAllPurchases) },
                showAllPurchases ? 'Show less' : `Show all ${filtered.length}`)
            : null
        )
  );

  const historyMax = Math.max(...history.map((b) => b.total), 1);
  const hasHistory = history.some((b) => b.total > 0);
  const trendSection = !hasHistory ? null : h('section', { className: 'spend-section' },
    h('div', null,
      h('p', { className: 'stats-title' }, 'Day-to-day spending by month'),
      h('p', { className: 'stats-caption' }, `Totals for the last ${SPEND_HISTORY_MONTHS} months`)
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
        h('span', { className: 'spend-stat-label' }, 'Avg purchase'),
        h('span', { className: 'spend-stat-value' },
          fmtCurrency(spent / Math.max(1, purchases.length), currency))
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

  const monthHeader = h(MonthHeader, { cursor, onChange: changeMonth });

  if (isMobile) {
    return h('div', { className: 'spend-page' },
      monthHeader,
      hero,
      isCurrentMonth ? quickLog : null,
      isCurrentMonth ? suggestionHint : null,
      budgetSection,
      breakdownSection,
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
      h('div', null, breakdownSection, purchaseSection, trendSection)
    ),
    modals
  );
}

function BillsPage({ data, setData }) {
  const currency = data.settings.currency;
  const [editing, setEditing] = useState(null);

  function openAdd() {
    setEditing({ ...blankEntry({ freq: 'monthly', category: 'Other' }), _isNew: true });
  }

  function openEdit(entry) {
    setEditing({ ...entryToFormShape(entry), _isNew: false });
  }

  function handleSubmit(cleaned) {
    const { _isNew, ...entry } = cleaned;
    if (_isNew) {
      setData(logActivity({ ...data, majorBills: [...data.majorBills, entry] }, `Added bill "${entry.name}"`));
    } else {
      setData(logActivity({ ...data, majorBills: data.majorBills.map((e) => (e.id === entry.id ? entry : e)) }, `Edited "${entry.name}"`));
    }
    setEditing(null);
  }

  function deleteEntry(entry) {
    setData(logActivity({ ...data, majorBills: data.majorBills.filter((e) => e.id !== entry.id) }, `Deleted "${entry.name}"`));
  }

  const list = data.majorBills;

  const total = list.reduce((sum, e) => sum + monthlyAmount(e), 0);

  return h('div', null,
    h('div', { className: 'sub-head' },
      h('h2', { className: 'sub-title' }, 'Essentials'),
      h('p', { className: 'sub-caption' },
        list.length === 0
          ? 'Rent, utilities, insurance \u2014 the bills that keep the lights on.'
          : `${list.length} ${list.length === 1 ? 'bill' : 'bills'} \u00b7 about ${fmtCurrency(total, currency)} a month`)
    ),
    list.length === 0
      ? h('p', { className: 'empty-state' }, 'No bills added yet.')
      : h('div', { className: 'entry-list' },
          list.map((e) => h(EntryRow, {
            key: e.id,
            name: e.name,
            sub: scheduleLabel(e, data.settings),
            amount: entryAmountLabel(e, currency),
            color: getEntryColor({ ...e, sourceList: 'majorBills' }, data),
            onClick: () => openEdit(e)
          }))
        ),
    h('button', { className: 'add-row', onClick: openAdd }, '+ Add a bill'),

    editing ? h(EntryFormModal, {
      data,
      title: editing._isNew ? 'Add bill' : 'Edit bill',
      entry: editing,
      categories: MAJOR_CATEGORIES,
      dateLabel: 'Due date',
      submitLabel: editing._isNew ? 'Add' : 'Save',
      onSubmit: handleSubmit,
      onDelete: editing._isNew ? null : () => { deleteEntry(editing); setEditing(null); },
      deleteLabel: `Delete ${editing.name || 'this bill'}`,
      onClose: () => setEditing(null)
    }) : null
  );
}

function SubscriptionsPage({ data, setData }) {
  const currency = data.settings.currency;
  const [editing, setEditing] = useState(null);

  function openAdd() {
    setEditing({ ...blankEntry({ freq: 'monthly', category: 'Streaming' }), _isNew: true });
  }

  function openEdit(entry) {
    setEditing({ ...entryToFormShape(entry), _isNew: false });
  }

  function handleSubmit(cleaned) {
    const { _isNew, ...entry } = cleaned;
    if (_isNew) {
      setData(logActivity({ ...data, subscriptions: [...data.subscriptions, entry] }, `Added subscription "${entry.name}"`));
    } else {
      setData(logActivity({ ...data, subscriptions: data.subscriptions.map((e) => (e.id === entry.id ? entry : e)) }, `Edited "${entry.name}"`));
    }
    setEditing(null);
  }

  function deleteEntry(entry) {
    setData(logActivity({ ...data, subscriptions: data.subscriptions.filter((e) => e.id !== entry.id) }, `Deleted "${entry.name}"`));
  }

  const list = data.subscriptions;
  const total = list.reduce((sum, e) => sum + monthlyAmount(e), 0);

  return h('div', null,
    h('div', { className: 'sub-head' },
      h('h2', { className: 'sub-title' }, 'Subscriptions'),
      h('p', { className: 'sub-caption' },
        list.length === 0
          ? 'Streaming, apps, memberships \u2014 anything that renews on its own.'
          : `${list.length} ${list.length === 1 ? 'subscription' : 'subscriptions'} \u00b7 about ${fmtCurrency(total, currency)} a month \u00b7 ${fmtCurrency(total * 12, currency)} a year`)
    ),
    list.length === 0
      ? h('p', { className: 'empty-state' }, 'No subscriptions added yet.')
      : h('div', { className: 'entry-list' },
          list.map((e) => h(EntryRow, {
            key: e.id,
            name: e.name,
            sub: scheduleLabel(e, data.settings),
            amount: entryAmountLabel(e, currency),
            color: getEntryColor({ ...e, sourceList: 'subscriptions' }, data),
            onClick: () => openEdit(e)
          }))
        ),
    h('button', { className: 'add-row', onClick: openAdd }, '+ Add a subscription'),

    editing ? h(EntryFormModal, {
      data,
      title: editing._isNew ? 'Add subscription' : 'Edit subscription',
      entry: editing,
      categories: MINOR_CATEGORIES,
      dateLabel: 'Billing date',
      submitLabel: editing._isNew ? 'Add' : 'Save',
      onSubmit: handleSubmit,
      onDelete: editing._isNew ? null : () => { deleteEntry(editing); setEditing(null); },
      deleteLabel: `Delete ${editing.name || 'this subscription'}`,
      onClose: () => setEditing(null)
    }) : null
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

function CreditCardsPage({ data, setData }) {
  const currency = data.settings.currency;
  const [showForm, setShowForm] = useState(false);
  const formOverlay = useOverlayDismiss(() => setShowForm(false));
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => blankCreditCard());
  const [projectionCard, setProjectionCard] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cards = data.creditCards || [];

  const totals = cards.reduce((acc, c) => {
    const total = Number(c.totalDebt) || 0;
    const paid = Number(c.amountPaid) || 0;
    acc.totalDebt += total;
    acc.totalPaid += paid;
    return acc;
  }, { totalDebt: 0, totalPaid: 0 });
  const totalRemaining = Math.max(0, totals.totalDebt - totals.totalPaid);
  const totalOwedNow = cards.reduce((sum, c) => sum + getCurrentCardBalance(c), 0);

  function openAddForm() {
    setConfirmDelete(false);
    setEditingId(null);
    setForm(blankCreditCard());
    setShowForm(true);
  }

  function openEditForm(card) {
    setConfirmDelete(false);
    setEditingId(card.id);
    setForm({ ...blankCreditCard(), ...card });
    setShowForm(true);
  }

  function submitForm() {
    if (!form.name.trim()) return;
    const totalDebt = form.totalDebt === '' ? 0 : parseFloat(form.totalDebt) || 0;
    const amountPaid = form.amountPaid === '' ? 0 : parseFloat(form.amountPaid) || 0;
    const existing = editingId ? cards.find((c) => c.id === editingId) : null;
    const principalChanged = !existing || existing.totalDebt !== totalDebt || existing.amountPaid !== amountPaid;
    const entry = {
      ...form,
      totalDebt,
      amountPaid,
      paymentAmount: form.paymentAmount === '' ? 0 : parseFloat(form.paymentAmount) || 0,
      apr: form.apr === '' ? 0 : parseFloat(form.apr) || 0,
      balanceDate: principalChanged ? todayYmd() : (form.balanceDate || todayYmd())
    };
    if (editingId) {
      setData(logActivity({ ...data, creditCards: cards.map((c) => (c.id === editingId ? entry : c)) }, `Edited credit card "${entry.name}"`));
    } else {
      setData(logActivity({ ...data, creditCards: [...cards, entry] }, `Added credit card "${entry.name}"`));
    }
    setShowForm(false);
  }

  function deleteCard(id) {
    if (!confirmDelete) { haptic('warn'); setConfirmDelete(true); return; }
    haptic('heavy');
    const card = cards.find((c) => c.id === id);
    setData(logActivity({ ...data, creditCards: cards.filter((c) => c.id !== id) }, `Deleted credit card "${card ? card.name : id}"`));
    setShowForm(false);
  }

  const monthlyPayments = cards
    .filter((c) => c.hasRecurringPayment)
    .reduce((sum, c) => sum + monthlyAmount({ amount: c.paymentAmount, freq: c.paymentFreq }), 0);
  const hasInterest = cards.some((c) => c.useApr && c.apr);

  const closeX = (onClick) => h('button', { className: 'modal-x', onClick, 'aria-label': 'Close' },
    h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
      h('path', { d: 'M6 6l12 12M18 6L6 18' })
    )
  );

  return h('div', null,
    h('div', { className: 'sub-head' },
      h('h2', { className: 'sub-title' }, 'Credit cards'),
      h('p', { className: 'sub-caption' },
        cards.length === 0
          ? 'Track what you owe, what you have paid, and when it will be gone.'
          : `${cards.length} ${cards.length === 1 ? 'card' : 'cards'} · ${fmtCurrency(totalOwedNow, currency)} owed now`)
    ),

    cards.length > 0 ? h('div', { className: 'spend-stats', style: { marginTop: 0, marginBottom: '16px' } },
      h('div', { className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, 'Owed now'),
        h('span', { className: 'spend-stat-value bad' }, fmtCurrency(totalOwedNow, currency)),
        h('span', { className: 'spend-stat-sub' }, hasInterest ? 'including interest' : 'across all cards')
      ),
      h('div', { className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, 'Paid so far'),
        h('span', { className: 'spend-stat-value good' }, fmtCurrency(totals.totalPaid, currency)),
        h('span', { className: 'spend-stat-sub' }, `of ${fmtCurrency(totals.totalDebt, currency)} borrowed`)
      ),
      h('div', { className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, 'Principal left'),
        h('span', { className: 'spend-stat-value' }, fmtCurrency(totalRemaining, currency)),
        h('span', { className: 'spend-stat-sub' }, 'before interest')
      ),
      h('div', { className: 'spend-stat' },
        h('span', { className: 'spend-stat-label' }, 'Payments'),
        h('span', { className: 'spend-stat-value' }, fmtCurrency(monthlyPayments, currency)),
        h('span', { className: 'spend-stat-sub' }, 'about a month')
      )
    ) : null,

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
              h('button', { className: 'cc-main', onClick: () => openEditForm(c) },
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
                ? h('button', { className: 'setup-link cc-link', onClick: () => setProjectionCard(c) }, 'See the payoff projection ›')
                : null
            );
          })
        ),
    h('button', { className: 'add-row', onClick: openAddForm }, '+ Add a card'),

    projectionCard ? h(ProjectionModal, {
      card: projectionCard, data, currency,
      onClose: () => setProjectionCard(null)
    }) : null,

    showForm ? h('div', Object.assign({ className: 'modal-overlay as-window' }, formOverlay),
      h('div', { className: 'modal-content as-window' },
        h('div', { className: 'modal-window-head' },
          h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px' } }, editingId ? 'Edit credit card' : 'Add a credit card'),
          closeX(() => setShowForm(false))
        ),
        h('div', { className: 'setup-field' },
          h('label', null, 'Name'),
          h('input', { type: 'text', placeholder: 'e.g. Chase Sapphire', value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }) })
        ),
        h('div', { className: 'setup-entry-grid' },
          h('div', { className: 'setup-field' },
            h('label', null, 'Total debt'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.totalDebt, onChange: (e) => setForm({ ...form, totalDebt: e.target.value }) })
          ),
          h('div', { className: 'setup-field' },
            h('label', null, 'Paid so far'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountPaid, onChange: (e) => setForm({ ...form, amountPaid: e.target.value }) })
          )
        ),
        h('div', { className: 'switch-list' },
          h(SettingSwitch, {
            id: 'cc-recurring',
            title: 'Has a monthly payment',
            sub: 'Shows on the calendar and counts toward your bills',
            checked: !!form.hasRecurringPayment,
            onChange: (v) => setForm({ ...form, hasRecurringPayment: v })
          })
        ),
        form.hasRecurringPayment ? h('div', { className: 'setup-entry-grid' },
          h('div', { className: 'setup-field' },
            h('label', null, 'Payment'),
            h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.paymentAmount, onChange: (e) => setForm({ ...form, paymentAmount: e.target.value }) })
          ),
          h('div', { className: 'setup-field' },
            h('label', null, 'Due date'),
            h('input', { type: 'date', value: form.paymentDate, onChange: (e) => setForm({ ...form, paymentDate: e.target.value }) })
          ),
          h('div', { className: 'setup-field' },
            h('label', null, 'Repeats'),
            h('select', { value: form.paymentFreq, onChange: (e) => setForm({ ...form, paymentFreq: e.target.value }) },
              FREQS.filter((f) => f !== 'none').map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
          )
        ) : null,
        h('div', { className: 'switch-list' },
          h(SettingSwitch, {
            id: 'cc-apr',
            title: 'Track interest',
            sub: 'Simple monthly interest on what is left, updated as days pass',
            checked: !!form.useApr,
            onChange: (v) => setForm({ ...form, useApr: v })
          })
        ),
        form.useApr ? h('div', { className: 'setup-entry-grid' },
          h('div', { className: 'setup-field' },
            h('label', null, 'APR %'),
            h('input', { type: 'number', inputMode: 'decimal', step: '0.01', placeholder: 'e.g. 24.99', value: form.apr, onChange: (e) => setForm({ ...form, apr: e.target.value }) })
          )
        ) : null,
        editingId ? h('button', { className: 'price-action-row danger', onClick: () => deleteCard(editingId) },
          h('div', null,
            h('span', { className: 'price-action-title' }, confirmDelete ? 'Tap again to delete' : 'Delete this card'),
            h('span', { className: 'price-action-sub' },
              confirmDelete ? 'This cannot be undone' : 'Removes the card and its payments from the calendar')
          ),
          h('span', { className: 'price-action-chevron' }, '›')
        ) : null,
        h('div', { className: 'row-between', style: { marginTop: '4px' } },
          h('button', { onClick: () => setShowForm(false) }, 'Cancel'),
          h('button', { className: 'primary', onClick: submitForm }, editingId ? 'Save' : 'Add card')
        )
      )
    ) : null
  );
}

function ProjectionModal({ card, data, currency, onClose }) {
  const overlay = useOverlayDismiss(onClose);
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

  return h('div', Object.assign({ className: 'modal-overlay as-window' }, overlay),
    h('div', { className: 'modal-content as-window' },
      h('div', { className: 'modal-window-head' },
        h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px' } }, `${card.name} \u2014 payoff projection`),
        h('button', { className: 'modal-x', onClick: onClose, 'aria-label': 'Close' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
            h('path', { d: 'M6 6l12 12M18 6L6 18' })
          )
        )
      ),

      late ? h('div', { className: 'info-banner' },
        h('p', { style: { margin: 0, fontSize: '13px' } },
          'This card\u2019s recurring payment is currently late, so the next payment isn\u2019t factored into month 1 of this projection.')
      ) : null,

      h('p', { className: 'stats-caption', style: { margin: 0 } }, 'Projected balance over the next 12 months'),
      h('svg', { viewBox: `0 0 ${W} ${H}`, className: 'projection-chart' },

        h('line', { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: 'var(--border-tertiary)', strokeWidth: 1 }),
        h('path', { d: linePath, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2 }),
        points.map((p, i) =>
          h('circle', { key: i, cx: PAD + i * stepX, cy: scaleY(p.balance), r: 2.5, fill: 'var(--accent)' })
        ),
        h('text', { x: PAD, y: 14, fontSize: 10, fill: 'var(--text-secondary)' }, fmtCurrency(maxBalance, currency)),
        h('text', { x: PAD, y: H - PAD - 4, fontSize: 10, fill: 'var(--text-secondary)' }, fmtCurrency(0, currency))
      ),

      barPoints.length > 0 ? h(React.Fragment, null,
        h('p', { className: 'stats-caption', style: { margin: '8px 0 0' } }, 'Interest vs. principal per payment'),
        h('svg', { viewBox: `0 0 ${W} ${H}`, className: 'projection-chart' },
          h('line', { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: 'var(--border-tertiary)', strokeWidth: 1 }),
          barPoints.map((p, i) => {
            const x = PAD + i * ((W - PAD * 2) / barPoints.length) + 2;
            const interestH = (p.interest / maxBar) * (H - PAD * 2);
            const principalH = (p.principalPaid / maxBar) * (H - PAD * 2);
            return h(React.Fragment, { key: i },
              h('rect', { x, y: H - PAD - interestH - principalH, width: barW, height: principalH, fill: 'var(--accent)' }),
              h('rect', { x, y: H - PAD - interestH, width: barW, height: interestH, fill: 'var(--text-danger)' })
            );
          })
        ),
        h('div', { style: { display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' } },
          h('span', null, h('span', { style: { display: 'inline-block', width: 10, height: 10, background: 'var(--accent)', marginRight: '4px', borderRadius: '2px' } }), 'Principal'),
          h('span', null, h('span', { style: { display: 'inline-block', width: 10, height: 10, background: 'var(--text-danger)', marginRight: '4px', borderRadius: '2px' } }), 'Interest')
        )
      ) : null,

      willPayOff
        ? h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--text-success)' } },
            `At this rate, ${card.name} is projected to be paid off within ${points.length - 1} month${points.length - 1 === 1 ? '' : 's'}.`)
        : h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--text-secondary)' } },
            card.hasRecurringPayment
              ? 'At this rate, this balance won\u2019t be paid off within 12 months with the current payment amount.'
              : 'No recurring payment is set, so this balance will keep growing with interest.')
    )
  );
}

function attentionSummary(items, currency) {
  const late = items.filter((o) => o.late);
  const priced = items.filter((o) => !o.late && o.needsPrice);
  const lateTotal = late.reduce((sum, o) => sum + o.amount, 0);

  if (late.length && priced.length) {
    return `${fmtCurrency(lateTotal, currency)} past due across ${late.length} ${late.length === 1 ? 'bill' : 'bills'}, and ${priced.length} more ${priced.length === 1 ? 'needs' : 'need'} a real price.`;
  }
  if (late.length) {
    return `${fmtCurrency(lateTotal, currency)} past due across ${late.length} ${late.length === 1 ? 'bill' : 'bills'} — tap one to pay it off or dismiss it.`;
  }
  if (priced.length) {
    return `${priced.length} ${priced.length === 1 ? 'entry still uses' : 'entries still use'} a price range — add the real amount to keep your totals honest.`;
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
      o.needsPrice ? h('span', { className: 'att-need' }, 'Needs a real price') : null
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

  function handleEditSubmit(cleaned) {
    let next = applyEditedEntry(data, editing.sourceList, cleaned);
    next = logActivity(next, `Edited "${cleaned.name}"`);
    setData(next);
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

  const SOURCE_GROUP_ORDER = ['majorBills', 'subscriptions', 'creditCards'];

  const SUBPAGE_FOR_GROUP = {
    majorBills: 'essentials',
    subscriptions: 'subscriptions',
    creditCards: 'creditcards'
  };
  const grouped = useMemo(() => {
    const map = {};
    unified.forEach((e) => {
      (map[e.sourceList] = map[e.sourceList] || []).push(e);
    });
    return SOURCE_GROUP_ORDER.filter((key) => map[key] && map[key].length > 0).map((key) => [key, map[key]]);
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
      !attentionCollapsed ? h('div', { style: { marginTop: '10px' } },
        h('div', { className: 'info-banner' },
          h('p', { style: { margin: 0, fontSize: '13px' } }, attentionSummary(attention, currency))
        ),
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
      h('p', { className: 'bill-filter-caption' }, 'About a month of recurring commitments'),
      h('button', {
        className: `bill-filter-chip${categoryFilter === 'all' ? ' active' : ''}`,
        onClick: () => setCategoryFilter('all')
      },
        h('span', { className: 'bill-filter-label' }, 'All'),
        h('span', { className: 'bill-filter-total' }, fmtCurrency(
          Object.values(groupMonthlyTotals).reduce((a, b) => a + b, 0), currency))
      ),
      SOURCE_GROUP_ORDER.filter((key) => grouped.some(([k]) => k === key)).map((key) =>
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

  return h('div', null,
    isMobile ? null : h('h2', null, 'Bills'),

    attentionBlock,
    filterBlock,

    unified.length === 0
      ? h('p', { className: 'empty-state' }, 'Nothing added yet.')
      : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '8px' } },
          visibleGroups.map(([key, rows]) =>
            h('div', { key },
              h('div', { className: 'category-group-header' },
                h('span', null, SOURCE_GROUP_LABELS[key]),
                h('span', { className: 'category-group-count' }, rows.length),
                (isMobile && setPage) ? h('button', {
                  className: 'setup-link category-group-link',
                  onClick: () => setPage(SUBPAGE_FOR_GROUP[key])
                }, key === 'creditCards' ? 'Cards \u203a' : 'Add \u203a') : null
              ),
              h('div', { className: 'entry-list' },
                rows.map((e) => h(EntryRow, {
                  key: `${e.sourceList}-${e.id}`,
                  name: e.name,
                  sub: scheduleLabel(e, data.settings),
                  amount: entryAmountLabel(e, currency),
                  color: getEntryColor(e, data),
                  onClick: () => openEdit(e)
                }))
              )
            )
          )
        ),

    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null,

    editing ? h(EntryFormModal, Object.assign(
      { data, entry: editing.form, onSubmit: handleEditSubmit, onClose: () => setEditing(null), submitLabel: 'Save' },
      getEditModalConfig(editing.sourceList, editing.form),
      {
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
  { key: 'oneTimeIncome', label: 'One-time income' }
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
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } },
      h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)', width: '68px', flexShrink: 0 } }, label),
      h('input', {
        type: 'range', min, max, value,
        onChange: (e) => onInput(Number(e.target.value)),
        className: 'accent-slider',
        style: { flex: 1, background: trackBg }
      })
    );

  return h('div', { className: 'custom-accent-picker' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' } },
      h('span', { className: 'accent-preview', style: { background: hex } }),
      h('input', {
        type: 'text',
        value: hex,
        onChange: (e) => {
          let v = e.target.value.trim();
          if (v && v[0] !== '#') v = '#' + v;
          onChange(v);
        },
        placeholder: '#378ADD',
        style: { width: '120px', fontFamily: 'monospace' },
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
  const [confirming, setConfirming] = useState(false);
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
    tabContent = h(AdvancedTab, { data, setData, updateSetting, onRestart, confirming, setConfirming });
  }

  return h('div', null,
    h('div', { className: 'sub-head' },
      h('h2', { className: 'sub-title' }, 'Settings'),
      h('p', { className: 'sub-caption' }, `Finance Calendar \u00b7 version ${WEB_VERSION}`)
    ),
    h('div', { className: 'segmented', style: { marginBottom: '16px', maxWidth: '420px' } },
      SETTINGS_TABS.map((t) =>
        h('div', { key: t.id, className: tab === t.id ? 'selected' : '', onClick: () => setTab(t.id) }, t.label)
      )
    ),
    tabContent,

    editingIncome ? h(EntryFormModal, {
      data,
      title: editingIncome._isNew ? 'Add income source' : 'Edit income source',
      entry: editingIncome,
      categories: null,
      dateLabel: 'Next pay date',
      isIncome: true,
      submitLabel: editingIncome._isNew ? 'Add' : 'Save',
      onSubmit: handleIncomeSubmit,
      onDelete: editingIncome._isNew ? null : () => { deleteIncome(editingIncome); setEditingIncome(null); },
      deleteLabel: `Delete ${editingIncome.name || 'this income source'}`,
      onClose: () => setEditingIncome(null)
    }) : null
  );
}

function GeneralTab({ data, currency, updateSetting, onAddIncome, onEditIncome }) {
  return h('div', null,

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
                sub: scheduleLabel(e, data.settings),
                note: avg
                  ? (avg.ready
                      ? `\u2248${fmtCurrency(avg.amount, currency)} estimated \u00b7 average of your last ${avg.count} checks`
                      : `Estimating \u2014 ${avg.count} of 2 checks recorded so far`)
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

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { className: 'settings-card-title' }, 'Appearance'),
      h('label', null, 'Theme'),
      h('div', { className: 'segmented', style: { marginBottom: '12px' } },
        ['system', 'light', 'dark'].map((t) =>
          h('div', {
            key: t,
            className: data.settings.theme === t ? 'selected' : '',
            onClick: () => updateSetting('theme', t)
          }, t.charAt(0).toUpperCase() + t.slice(1))
        )
      ),
      h('label', null, 'Accent color'),
      h('div', { className: 'swatch-row', style: { marginBottom: '12px' } },
        ACCENTS.map((a) =>
          h('div', {
            key: a.id,
            className: `swatch${data.settings.accent === a.id ? ' selected' : ''}`,
            style: { background: a.hex },
            title: a.label,
            onClick: () => updateSetting('accent', a.id)
          })
        ),

        h('label', {
          className: `swatch swatch-custom${data.settings.accent === 'custom' ? ' selected' : ''}`,
          title: 'Custom color',
          onClick: () => updateSetting('accent', 'custom'),
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
      h('label', null, 'First day of week'),
      h('div', { className: 'segmented' },
        [{ id: 0, label: 'Sunday' }, { id: 1, label: 'Monday' }].map((o) =>
          h('div', {
            key: o.id,
            className: data.settings.firstDayOfWeek === o.id ? 'selected' : '',
            onClick: () => updateSetting('firstDayOfWeek', o.id)
          }, o.label)
        )
      )
    ),

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { className: 'settings-card-title' }, 'Money & bills'),
      h('div', { className: 'setup-entry-grid' },
        h('div', { className: 'setup-field' },
          h('label', null, 'Currency'),
          h('select', {
            value: data.settings.currency,
            onChange: (e) => updateSetting('currency', e.target.value)
          }, CURRENCIES.map((c) => h('option', { key: c, value: c }, c)))
        ),
        h('div', { className: 'setup-field' },
          h('label', null, 'Late after'),
          h('input', {
            type: 'number', inputMode: 'numeric', min: 0, max: 30,
            value: data.settings.lateGraceDays,
            onChange: (e) => updateSetting('lateGraceDays', parseInt(e.target.value, 10) || 0)
          })
        ),
        h('div', { className: 'setup-field' },
          h('label', null, 'Flag bills early'),
          h('input', {
            type: 'number', inputMode: 'numeric', min: 0, max: 60,
            value: data.settings.needsAttentionLookaheadDays,
            onChange: (e) => updateSetting('needsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0)
          })
        ),
        h('div', { className: 'setup-field' },
          h('label', null, 'Flag income early'),
          h('input', {
            type: 'number', inputMode: 'numeric', min: 0, max: 60,
            value: data.settings.incomeNeedsAttentionLookaheadDays,
            onChange: (e) => updateSetting('incomeNeedsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0)
          })
        )
      ),
      h('p', { className: 'setup-hint' },
        'All in days. Late after: how long past due before a bill counts as late. Flag early: how far ahead a bill or paycheck with a price range shows up under Needs attention, so you can fill in the real amount.'),
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
      onChange: (e) => onChange(e.target.checked)
    })
  );
}

function ColorsTab({ data, updateSectionColor }) {
  return h('div', null,
    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Section colors'),
      h('p', { style: { margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)' } },
        'These colors are used for chips and bars on the calendar. Any individual bill, subscription, ' +
        'income source, or one-time entry can override its color from its edit window.'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        SECTION_COLOR_LABELS.map(({ key, label }) =>
          h('div', { key, className: 'row-between' },
            h('span', { style: { fontSize: '14px' } }, label),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('input', {
                type: 'color',
                value: data.settings.sectionColors[key] || '#888888',
                onChange: (e) => updateSectionColor(key, e.target.value),
                className: 'color-input'
              }),
              h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' } },
                (data.settings.sectionColors[key] || '#888888').toUpperCase())
            )
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

function SyncCard({ data, setData, embedded }) {
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [conflict, setConflict] = useState(null);
  const conflictOverlay = useOverlayDismiss(() => setConflict(null));
  const supportsFile = Sync.supportsFileSystem;

  useEffect(() => {
    Sync.hasLinkedFile().then(setLinked);
  }, []);

  const lastModified = data.lastModified;

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
        : 'Exported \u2014 choose where to save it (Files, LocalSend, etc.).');
    } else if (res.canceled) {

    } else {
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
    const incomingTime = incoming.lastModified || 0;
    const localTime = data.lastModified || 0;
    if (incomingTime < localTime) {

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
      if (existing) {

        await handleLoad();
      } else {

        await handleSync();
      }
    } else if (!res.canceled) {
      flash(false, res.error || 'Could not link a file.');
    }
  }

  async function handleUnlink() {
    await Sync.forgetFile();
    setLinked(false);
    flash(true, 'Unlinked. This device no longer auto-syncs to that file.');
  }

  return h('div', { className: embedded ? '' : 'card', style: embedded ? { marginTop: '4px' } : { marginTop: '12px' } },
    embedded ? null : h('p', { className: 'settings-card-title' }, 'Sync'),
    h('p', { style: { margin: '0 0 10px', fontSize: '13px', color: 'var(--text-secondary)' } },
      supportsFile
        ? 'Keep this device in step with a single data file. Link it once, then Sync writes your latest data to it and Load pulls the newest back in. Your data stays on your device and in your own file \u2014 never on a server.'
        : 'Sync exports your data through the share sheet (Save to Files, LocalSend, and so on) and loads it back when you switch devices. Newest data always wins. Nothing is sent to a server.'),

    h('div', { className: 'sync-status' },
      h('span', { className: 'sync-dot', style: { background: lastModified ? 'var(--text-success)' : 'var(--text-tertiary)' } }),
      h('span', { style: { fontSize: '13px' } },
        'Last change: ', h('strong', null, relativeTime(lastModified)))
    ),

    supportsFile ? h('div', { style: { marginTop: '10px' } },
      linked
        ? h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
            h('span', { className: 'sync-linked-pill' }, '\u2713 File linked'),
            h('button', { className: 'link-btn', onClick: handleUnlink }, 'Unlink')
          )
        : h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button', { onClick: () => handleLink(false), disabled: busy }, 'Create sync file'),
            h('button', { onClick: () => handleLink(true), disabled: busy }, 'Link existing file')
          )
    ) : null,

    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' } },
      h('button', { className: 'primary', onClick: handleSync, disabled: busy },
        busy ? 'Working\u2026' : (supportsFile && linked ? 'Sync now' : 'Export / share')),
      h('button', { onClick: handleLoad, disabled: busy },
        supportsFile && linked ? 'Load from file' : 'Load from file\u2026')
    ),

    msg ? h('p', { style: { margin: '10px 0 0', fontSize: '13px', color: msg.ok ? 'var(--text-success)' : 'var(--late-red)' } }, msg.text) : null,

    conflict ? h('div', Object.assign({ className: 'modal-overlay as-window' }, conflictOverlay),
      h('div', { className: 'modal-content as-window' },
        h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px' } }, 'That file is older'),
        h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
          `The data you're loading was last changed ${relativeTime(conflict.incoming.lastModified)}, but this device has newer changes from ${relativeTime(data.lastModified)}. Loading it will replace your newer data.`),
        h('div', { className: 'row-between', style: { marginTop: '4px' } },
          h('button', { onClick: () => setConflict(null) }, 'Keep mine'),
          h('button', { className: 'danger-text', onClick: () => { applyIncoming(conflict.incoming); flash(true, 'Loaded the older file.'); } }, 'Load it anyway')
        )
      )
    ) : null
  );
}

function SyncModal({ data, setData, onClose }) {
  const overlay = useOverlayDismiss(onClose);
  return h('div', Object.assign({ className: 'modal-overlay as-window' }, overlay),
    h('div', { className: 'modal-content as-window' },
      h('div', { className: 'modal-window-head' },
        h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px' } }, 'Sync'),
        h('button', { className: 'modal-x', onClick: onClose, 'aria-label': 'Close' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
            h('path', { d: 'M6 6l12 12M18 6L6 18' })
          )
        )
      ),
      h(SyncCard, { data, setData, embedded: true })
    )
  );
}

function AdvancedTab({ data, setData, updateSetting, onRestart, confirming, setConfirming }) {
  const [importWarning, setImportWarning] = useState(false);
  const importOverlay = useOverlayDismiss(() => setImportWarning(false));
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportSuccess, setExportSuccess] = useState(false);

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

  return h('div', null,
    h('div', { className: 'card' },
      h('p', { className: 'settings-card-title' }, 'Display'),
      h('label', null, 'Date format'),
      h('div', { className: 'segmented', style: { marginBottom: '12px' } },
        [
          { id: 'short', label: 'Jun 15' },
          { id: 'long', label: 'June 15, 2026' },
          { id: 'iso', label: '2026-06-15' }
        ].map((o) =>
          h('div', {
            key: o.id,
            className: data.settings.dateFormat === o.id ? 'selected' : '',
            onClick: () => updateSetting('dateFormat', o.id)
          }, o.label)
        )
      ),
      h('label', null, 'Density'),
      h('div', { className: 'segmented', style: { marginBottom: '12px' } },
        [{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }].map((o) =>
          h('div', {
            key: o.id,
            className: data.settings.density === o.id ? 'selected' : '',
            onClick: () => updateSetting('density', o.id)
          }, o.label)
        )
      )
    ),

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { className: 'settings-card-title' }, 'Custom CSS'),
      h('p', { style: { margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary)' } },
        'For advanced users - add your own CSS to override styles. Applied live; clear the box to remove it.'),
      h('textarea', {
        value: data.settings.customCss || '',
        onChange: (e) => updateSetting('customCss', e.target.value),
        placeholder: '.sidebar { font-family: monospace; }',
        className: 'custom-css-input',
        rows: 8
      })
    ),

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { className: 'settings-card-title' }, 'Activity log'),
      (!data.activityLog || data.activityLog.length === 0)
        ? h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--text-secondary)' } }, 'Nothing logged yet.')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' } },
            data.activityLog.slice(0, 25).map((entry) =>
              h('div', { key: entry.id, style: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px' } },
                h('span', null, entry.message),
                h('span', { style: { color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontSize: '12px' } }, formatLogTimestamp(entry.timestamp))
              )
            )
          )
    ),

    h(SyncCard, { data, setData }),

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { className: 'settings-card-title' }, 'Data portability'),
      h('p', { style: { margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)' } },
        'Export your data as a .json file to back it up or move it to another computer. ',
        'Import a previously exported file to restore or transfer your data \u2014 this will permanently replace everything currently saved in this app.'),
      h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
        h('button', { onClick: handleExport }, 'Export data (.json)'),
        h('button', { onClick: () => setImportWarning(true) }, 'Import from .json file')
      ),
      exportSuccess ? h('p', { style: { margin: '8px 0 0', fontSize: '13px', color: 'var(--text-success)' } }, 'Export saved successfully.') : null,
      exportError ? h('p', { style: { margin: '8px 0 0', fontSize: '13px', color: 'var(--late-red)' } }, exportError) : null,
      importSuccess ? h('p', { style: { margin: '8px 0 0', fontSize: '13px', color: 'var(--text-success)' } }, 'Data imported successfully. Your app is now showing the imported data.') : null,
      importError ? h('p', { style: { margin: '8px 0 0', fontSize: '13px', color: 'var(--late-red)' } }, importError) : null,
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

    importWarning ? h('div', Object.assign({ className: 'modal-overlay as-window' }, importOverlay),
      h('div', { className: 'modal-content as-window' },
        h('p', { style: { margin: 0, fontWeight: 600, fontSize: '16px', color: 'var(--late-red)' } }, '\u26a0\ufe0f This will delete all your current data'),
        h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
          'Importing a file will permanently erase all your current bills, income, subscriptions, credit cards, history, and settings. ',
          'This cannot be undone. Your current data will be gone immediately and replaced with whatever is in the file you choose.'),
        h('p', { style: { margin: 0, fontSize: '14px', fontWeight: 500 } }, 'Are you absolutely sure you want to continue?'),
        h('div', { className: 'row-between' },
          h('button', { onClick: () => setImportWarning(false) }, 'Cancel \u2014 keep my current data'),
          h('button', { className: 'danger-text', style: { borderColor: 'var(--late-red)' }, onClick: handleImportConfirmed }, 'Yes, delete and import')
        )
      )
    ) : null,

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { className: 'settings-card-title' }, 'Reset all data'),
      h('p', { style: { margin: '0 0 12px', fontSize: '14px', color: 'var(--text-secondary)' } },
        'This clears your income, bills, subscriptions, and paid history, then takes you back through setup.'),
      confirming
        ? h('div', { style: { display: 'flex', gap: '8px' } },
            h('button', { onClick: () => setConfirming(false) }, 'Cancel'),
            h('button', { className: 'danger-text', onClick: onRestart }, 'Yes, reset everything')
          )
        : h('button', { className: 'danger-text', onClick: () => setConfirming(true) }, 'Reset and run setup again')
    ),

    h('div', { className: 'card about-card', style: { marginTop: '12px' } },
      h('img', { src: 'assets/icon.svg', alt: '', className: 'about-logo' }),
      h('div', null,
        h('p', { className: 'settings-card-title' }, 'Finance Calendar'),
        h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
          'Stores all data locally on this device - nothing is sent anywhere.')
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
