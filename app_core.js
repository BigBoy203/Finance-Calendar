const { useState, useEffect, useMemo, useCallback } = React;
const h = React.createElement;

/* ---------------- Helpers ---------------- */

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

// Formats a Date according to the user's dateFormat setting.
// 'short' -> "Jun 15", 'long' -> "June 15, 2026", 'iso' -> "2026-06-15"
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
  // short
  return date.toLocaleDateString('en-US', {
    weekday: includeWeekday ? 'long' : undefined,
    month: 'short', day: 'numeric',
    year: forceYear ? 'numeric' : undefined
  });
}

// Formats an ISO timestamp for the activity log - relative for anything
// from today, otherwise a short date + time.
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

// Days in a given month. monthIndex is 0-based (0 = January).
function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Computes the Nth occurrence after `anchor` for a given frequency, always
// measuring from the original anchor date rather than chaining from a
// previous (possibly clamped) occurrence. This matters for monthly/yearly
// frequencies: a bill due on the 30th should land on Feb 28/29 in February,
// then go right back to the 30th in March - not stay stuck at 28 forever,
// which is what would happen if each step clamped relative to the last one.
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
    // handles Feb 29 on a leap year rolling into a non-leap year
    const clampedDay = Math.min(anchorDay, daysInMonth(targetYear, anchor.getMonth()));
    return new Date(targetYear, anchor.getMonth(), clampedDay);
  }
  return d;
}

// Returns the display amount for an entry (midpoint if range, otherwise fixed amount)
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
    return `${fmtCurrency(min, currency)}-${fmtCurrency(max, currency)}`;
  }
  return fmtCurrency(entry.amount, currency);
}

// Expand a single entry into occurrences within [rangeStart, rangeEnd] (inclusive, Date objects)
function expandEntry(entry, rangeStart, rangeEnd) {
  const occurrences = [];
  if (!entry.date) return occurrences;
  let cur = parseYmd(entry.date);
  const end = new Date(rangeEnd);
  const freq = entry.freq || 'none';

  if (freq === 'none') {
    // If a date range is used, treat every day in the range as relevant only for display,
    // but for bill/income purposes we anchor on the start date.
    if (cur >= rangeStart && cur <= end) {
      occurrences.push({ ...entry, occDate: ymd(cur) });
    }
    return occurrences;
  }

  // Always measure occurrences as "N intervals from the original anchor
  // date" rather than repeatedly stepping from the previous occurrence -
  // this prevents short-month clamping (e.g. the 30th landing on Feb 28)
  // from permanently drifting the day-of-month in later months.
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

// Expand a list of entries (with a "kind" tag) within a date range.
// Applies per-occurrence price overrides from data.overrides when present.
function expandAll(entries, kind, rangeStart, rangeEnd, data) {
  const all = [];
  const removed = (data && data.removedOccurrences) || {};
  entries.forEach((entry) => {
    expandEntry(entry, rangeStart, rangeEnd).forEach((occ) => {
      if (removed[`${entry.id}|${occ.occDate}`]) return; // this single date was removed; rule untouched
      const override = data ? getOverride(data, entry.id, occ.occDate) : null;
      const hasOverride = hasAmountOverride(override);
      all.push({
        ...occ,
        kind,
        amount: hasOverride ? Number(override.amount) || 0 : entryAmount(entry),
        isRange: !!entry.useAmountRange,
        hasOverride
      });
    });
  });
  return all;
}

// Removes a single occurrence of a recurring entry without touching the
// recurring rule, so past and future occurrences are unaffected.
function removeOccurrence(data, entryId, occDate) {
  const key = `${entryId}|${occDate}`;
  return { ...data, removedOccurrences: { ...(data.removedOccurrences || {}), [key]: true } };
}

// Appends a message to the activity log shown in Settings. Newest first,
// capped at 50 entries.
function logActivity(data, message) {
  const entry = { id: uid(), timestamp: new Date().toISOString(), message };
  return { ...data, activityLog: [entry, ...(data.activityLog || [])].slice(0, 50) };
}

function getOverride(data, entryId, occDate) {
  return data.overrides ? data.overrides[`${entryId}|${occDate}`] : null;
}

// True when an override actually sets a price (vs. being absent or blank).
function hasAmountOverride(override) {
  return !!(override && override.amount !== undefined && override.amount !== null);
}

// Effective amount for one occurrence of an entry on a given date: the
// per-occurrence override if one is set, otherwise the entry's own amount.
function resolvedAmount(data, entry, occDate) {
  const override = getOverride(data, entry.id, occDate);
  return hasAmountOverride(override) ? Number(override.amount) || 0 : entryAmount(entry);
}

// Turns a one-time entry into the occurrence shape the UI works with
// (occDate, resolved amount, range/override flags, bill-or-income kind).
function oneTimeOccurrence(data, entry) {
  const override = getOverride(data, entry.id, entry.date);
  const hasOverride = hasAmountOverride(override);
  return {
    ...entry,
    occDate: entry.date,
    amount: hasOverride ? Number(override.amount) || 0 : entryAmount(entry),
    isRange: !!entry.useAmountRange,
    hasOverride,
    kind: entry.oneTimeKind === 'income' ? 'income' : 'bill'
  };
}

// Display label for an occurrence: shows the actual price if an override is set,
// otherwise the range or fixed amount from the template.
function occAmountLabel(occ, currency) {
  if (occ.hasOverride) {
    return fmtCurrency(occ.amount, currency);
  }
  if (occ.isRange) {
    const min = Number(occ.amountMin) || 0;
    const max = Number(occ.amountMax) || 0;
    return `${fmtCurrency(min, currency)}-${fmtCurrency(max, currency)}`;
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

// Toggles a manual "mark as late" override for a specific occurrence and
// returns the updated data object. Clears any dismissal so the override
// actually shows up.
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
    delete nextPaid[key]; // can't be marked late and paid at the same time
  }
  return { ...data, forcedLate: nextForced, dismissedLate: nextDismissed, paidHistory: nextPaid };
}

// Toggles paid status for an occurrence, clearing any manual "late" flag at
// the same time since a bill can't be both paid and marked late. If the
// occurrence is a credit card's recurring payment (synthetic "cc-{cardId}"
// id) and auto-deduct is on, the card's amountPaid moves by the payment
// amount in the same direction.
function togglePaidStatus(data, entryId, occDate) {
  const key = `${entryId}|${occDate}`;
  const nextPaid = { ...data.paidHistory };
  const nextForced = { ...(data.forcedLate || {}) };
  const wasPaid = !!nextPaid[key];
  if (wasPaid) {
    delete nextPaid[key];
  } else {
    nextPaid[key] = true;
    delete nextForced[key];
  }

  let nextCreditCards = data.creditCards;
  const autoDeduct = data.settings.autoDeductCardPayments !== false;
  if (autoDeduct && entryId.startsWith('cc-')) {
    const cardId = entryId.slice(3);
    const card = (data.creditCards || []).find((c) => c.id === cardId);
    if (card && card.hasRecurringPayment) {
      const amount = Number(card.paymentAmount) || 0;
      const delta = wasPaid ? -amount : amount; // unmarking paid reverses the deduction
      nextCreditCards = data.creditCards.map((c) =>
        c.id === cardId ? { ...c, amountPaid: Math.max(0, (Number(c.amountPaid) || 0) + delta) } : c
      );
    }
  }

  return { ...data, paidHistory: nextPaid, forcedLate: nextForced, creditCards: nextCreditCards };
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// A fresh install should start with zero past-due items. Late/needs-attention
// lookups never look further back than the date setup was completed.
function getEarliestTrackedDate(data) {
  if (data.settings && data.settings.installDate) {
    return parseYmd(data.settings.installDate);
  }
  return new Date(2000, 0, 1);
}

// Picks black or white text for a given background color using a simple
// luminance check, so chips stay readable whatever color is chosen.
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

// Returns the effective base color for an occurrence: its own override if
// set, otherwise the section default for its sourceList/kind.
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

// Returns the current outstanding balance for a card, applying simple
// monthly interest (APR / 12) prorated daily since balanceDate, on the
// principal as of balanceDate (totalDebt - amountPaid at that time).
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

// Checks whether this card's recurring payment is currently late (overdue,
// unpaid, not dismissed) using the same logic as the late payments page.
function isCardPaymentLate(card, data) {
  if (!card.hasRecurringPayment || !card.paymentAmount || !card.paymentDate) return false;
  const lateBills = getLateBills(data);
  return lateBills.some((o) => o.id === `cc-${card.id}`);
}

// Builds a month-by-month projection of a card's balance for `months` months
// ahead. Each entry: { month index (0 = current), label, balance, interest, principalPaid }.
// If the card has a recurring payment, it's subtracted each period (split
// into interest vs principal) unless that period's payment would be the
// currently-late one, which is skipped.
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
    // skip the very first period's payment if it's currently late - that
    // payment hasn't actually reduced the balance yet
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

// Builds a lookup of id -> which list/category an entry's template lives in
// (majorBills, subscriptions, creditCards, incomeSources). Used to resolve
// an occurrence's color and category consistently across pages.
function buildSourceListLookup(data) {
  const map = {};
  data.majorBills.forEach((e) => { map[e.id] = 'majorBills'; });
  data.subscriptions.forEach((e) => { map[e.id] = 'subscriptions'; });
  getCreditCardPaymentEntries(data).forEach((e) => { map[e.id] = 'creditCards'; });
  data.incomeSources.forEach((e) => { map[e.id] = 'incomeSources'; });
  return map;
}

function getAllBillLikeEntries(data) {
  return [...data.majorBills, ...data.subscriptions, ...getCreditCardPaymentEntries(data)];
}

// Converts credit cards with a recurring required payment into bill-like
// entries so they show up on the calendar, home, and late payments pages.
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

// Returns overdue, unpaid, non-dismissed occurrences (recurring + one-time payments),
// sorted oldest-first, each annotated with daysLate.
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

  const lateOneTime = data.oneTimeEntries
    .filter((e) => e.oneTimeKind === 'payment' && e.date && parseYmd(e.date) < cutoff && parseYmd(e.date) >= pastRangeStart &&
      !isPaid(data, e.id, e.date) && !isDismissedLate(data, e.id, e.date))
    .map((e) => oneTimeOccurrence(data, e));

  const autoLate = [...late, ...lateOneTime]
    .map((o) => ({ ...o, daysLate: daysBetween(parseYmd(o.occDate), today), forcedLate: false }));

  const autoLateKeys = new Set(autoLate.map((o) => `${o.id}|${o.occDate}`));

  // manually forced-late occurrences - can be any date, including the future,
  // and aren't limited by the install-date cutoff since the user is
  // deliberately flagging them
  const forcedKeys = Object.keys(data.forcedLate || {}).filter((k) => data.forcedLate[k]);
  const entryById = buildEntryLookup(data);
  const forced = [];
  forcedKeys.forEach((key) => {
    if (autoLateKeys.has(key)) return; // already counted, avoid duplicates
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

// Builds a lookup of id -> entry across every bill-like source (essentials,
// subscriptions, credit card payments, one-time entries), used to resolve a
// manually forced-late key back to its full entry details.
function buildEntryLookup(data) {
  const map = {};
  data.majorBills.forEach((e) => { map[e.id] = e; });
  data.subscriptions.forEach((e) => { map[e.id] = e; });
  getCreditCardPaymentEntries(data).forEach((e) => { map[e.id] = e; });
  data.oneTimeEntries.forEach((e) => { map[e.id] = e; });
  return map;
}

// Returns occurrences that use an amount range (and not a date range), have
// no price override yet, and are due within the lookahead window or are
// already overdue+unpaid. Each is annotated with `late` (bool) and `daysLate`.
function getNeedsAttention(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const grace = data.settings.lateGraceDays || 0;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - grace);

  const rangeStart = getEarliestTrackedDate(data);

  // bills and income each get their own "days before due" lookahead window
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

  // also pull in any manually forced-late range-priced occurrences that fall
  // outside the normal lookback/lookahead window (e.g. flagged far in the past).
  // this only applies to bills - income is never forced-late.
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
      // income is never flagged late - it just keeps showing as "needs
      // attention" (not yet priced) until a real amount is entered
      const late = o.kind === 'income' ? false : (isForcedLate(data, o.id, o.occDate) || (occDate < cutoff && !isPaid(data, o.id, o.occDate)));
      return { ...o, late, daysLate: late ? daysBetween(occDate, today) : 0 };
    })
    .sort((a, b) => {
      if (a.late !== b.late) return a.late ? -1 : 1;
      return a.occDate.localeCompare(b.occDate);
    });
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

/* ---------------- Top-level App ---------------- */

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [page, setPage] = useState('home');
  const [billsExpanded, setBillsExpanded] = useState(true);
  const [postSetupPrompt, setPostSetupPrompt] = useState(false);
  const [quickAdd, setQuickAdd] = useState(null); // { date } or null
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);

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
      })
      .catch((err) => {
        console.error('Failed to load data:', err);
        setLoadError(String((err && err.message) || err));
        setLoading(false);
      });
  }, []);

  // Monday backup reminder - browser data can be cleared, so nudge the user
  // to download a backup. Shows at most once per day, only on Mondays, only
  // if they haven't turned it off in Settings.
  useEffect(() => {
    if (!data || !data.onboardingComplete) return;
    if (data.settings.backupReminderEnabled === false) return;
    if (new Date().getDay() !== 1) return; // 1 = Monday
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

  // apply theme/accent/density to <html>
  useEffect(() => {
    if (!data) return;
    document.documentElement.setAttribute('data-theme', data.settings.theme || 'system');
    document.documentElement.setAttribute('data-accent', data.settings.accent || 'blue');
    document.documentElement.setAttribute('data-density', data.settings.density || 'comfortable');
  }, [
    data && data.settings && data.settings.theme,
    data && data.settings && data.settings.accent,
    data && data.settings && data.settings.density
  ]);

  // inject user-provided custom CSS
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

  const persist = useCallback((next) => {
    setData(next);
    window.api.saveData(next);
  }, []);

  const lateBills = useMemo(() => (data && data.onboardingComplete ? getLateBills(data) : []), [data]);
  const needsAttention = useMemo(() => (data && data.onboardingComplete ? getNeedsAttention(data) : []), [data]);

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
        setPostSetupPrompt(true);
      }
    });
  }

  if (postSetupPrompt) {
    return h(PostSetupPrompt, {
      onAdd: () => { setPostSetupPrompt(false); setQuickAdd({ date: todayYmd() }); },
      onSkip: () => setPostSetupPrompt(false)
    });
  }

  const NAV_ITEMS = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'late', label: 'Late payments', icon: 'alert' },
    {
      id: 'allbills', label: 'All bills', icon: 'allbills',
      children: [
        { id: 'essentials', label: 'Essentials', icon: 'list' },
        { id: 'creditcards', label: 'Credit cards', icon: 'card' },
        { id: 'subscriptions', label: 'Subscriptions', icon: 'apps' }
      ]
    },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];

  const lateTotal = lateBills.reduce((sum, o) => sum + o.amount, 0);
  const needsAttentionCount = needsAttention.length;

  let pageContent;
  if (page === 'home') {
    pageContent = h(HomePage, { data, setData: persist });
  } else if (page === 'calendar') {
    pageContent = h(CalendarPage, { data, setData: persist, onAddEntry: (date) => setQuickAdd({ date }) });
  } else if (page === 'late') {
    pageContent = h(LatePage, { data, setData: persist, lateBills });
  } else if (page === 'essentials') {
    pageContent = h(BillsPage, { data, setData: persist, onAddEntry: (date) => setQuickAdd({ date }) });
  } else if (page === 'subscriptions') {
    pageContent = h(SubscriptionsPage, { data, setData: persist, onAddEntry: (date) => setQuickAdd({ date }) });
  } else if (page === 'creditcards') {
    pageContent = h(CreditCardsPage, { data, setData: persist });
  } else if (page === 'allbills') {
    pageContent = h(AllBillsPage, { data, setData: persist, needsAttention, onAddEntry: (date) => setQuickAdd({ date }) });
  } else if (page === 'settings') {
    pageContent = h(SettingsPage, { data, setData: persist, onRestart: () => persist({ ...getBlankData(), onboardingComplete: false }) });
  }

  return h('div', { className: 'app-shell' },
    h('div', { className: 'sidebar' },
      h('div', { className: 'sidebar-brand' },
        h('img', { src: 'assets/icon.png', alt: '', className: 'sidebar-logo' }),
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
            item.label,
            item.id === 'late' && lateTotal > 0
              ? h('span', { className: 'nav-badge' }, fmtCurrency(lateTotal, data.settings.currency))
              : null
          );
        }

        // "All bills" is both a page and a dropdown: clicking it (or its
        // caret) navigates to the page and toggles the child links.
        const openBills = () => { setPage(item.id); setBillsExpanded((v) => !v); };
        return h('div', { key: item.id },
          h('div', {
            className: `sidebar-link${page === item.id ? ' active' : ''}`,
            onClick: openBills
          },
            h(Icon, { name: item.icon }),
            item.label,
            needsAttentionCount > 0
              ? h('span', { className: 'nav-badge round attention' }, needsAttentionCount)
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
      h('a', {
        className: 'sidebar-link sidebar-download',
        href: 'downloads/FinanceCalendar.exe',
        download: 'FinanceCalendar.exe'
      },
        h(Icon, { name: 'download' }),
        'Get desktop app'
      )
    ),
    h('div', { className: 'main-content' }, pageContent),
    quickAdd ? h(QuickAddModal, {
      data,
      setData: persist,
      initialDate: quickAdd.date,
      onClose: () => setQuickAdd(null)
    }) : null,
    showBackupPrompt ? h(BackupReminderModal, {
      onDownloadBackup: downloadBackupNow,
      onDismiss: dismissBackupPrompt
    }) : null
  );
}

/* ---------------- Weekly Backup Reminder Modal (web only) ---------------- */

function BackupReminderModal({ onDownloadBackup, onDismiss }) {
  return h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onDismiss(); } },
    h('div', { className: 'modal-content' },
      h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, 'Weekly backup reminder'),
      h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
        'This web version keeps your data in this browser only. It\u2019s a good habit to download a backup ',
        'every so often, in case this browser\u2019s data ever gets cleared.'),
      h('button', { className: 'primary', onClick: onDownloadBackup }, 'Download backup (.json)'),
      h('a', {
        className: 'backup-modal-exe-link',
        href: 'downloads/FinanceCalendar.exe',
        download: 'FinanceCalendar.exe',
        onClick: onDismiss
      }, 'Or get the desktop app, which saves to a file on your computer automatically'),
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
    incomeSources: [],
    majorBills: [],
    subscriptions: [],
    oneTimeEntries: [],
    creditCards: [],
    paidHistory: {},
    dismissedLate: {},
    forcedLate: {},
    removedOccurrences: {},
    activityLog: [],
    overrides: {},
    settings: {
      theme: 'system',
      accent: 'blue',
      currency: 'USD',
      firstDayOfWeek: 0,
      lateGraceDays: 0,
      needsAttentionLookaheadDays: 7,
      incomeNeedsAttentionLookaheadDays: 1,
      autoDeductCardPayments: true,
      installDate: null,
      dateFormat: 'short',
      showWeekNumbers: false,
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
    download: 'M12 3v12M7 10l5 5 5-5M5 21h14'
  };
  return h('svg', {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
  }, h('path', { d: paths[name] || '' }));
}
