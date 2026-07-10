const { useState, useEffect, useMemo, useCallback } = React;
const h = React.createElement;

// Shown under the Settings heading. Bump this when the web build changes.
const WEB_VERSION = '0.7';

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
    pageContent = h(HomePage, { data, setData: persist, isMobile });
  } else if (page === 'calendar') {
    pageContent = h(CalendarPage, { data, setData: persist, isMobile, onAddEntry: (date) => setQuickAdd({ date }) });
  } else if (page === 'late') {
    pageContent = h(LatePage, { data, setData: persist, lateBills });
  } else if (page === 'essentials') {
    pageContent = h(BillsPage, { data, setData: persist, onAddEntry: (date) => setQuickAdd({ date }) });
  } else if (page === 'subscriptions') {
    pageContent = h(SubscriptionsPage, { data, setData: persist, onAddEntry: (date) => setQuickAdd({ date }) });
  } else if (page === 'creditcards') {
    pageContent = h(CreditCardsPage, { data, setData: persist });
  } else if (page === 'allbills') {
    pageContent = h(AllBillsPage, { data, setData: persist, needsAttention, isMobile, setPage, onAddEntry: (date) => setQuickAdd({ date }) });
  } else if (page === 'settings') {
    pageContent = h(SettingsPage, { data, setData: persist, onRestart: () => persist({ ...getBlankData(), onboardingComplete: false }) });
  }

  // Mobile: a compact top bar + a native-style bottom tab bar replace the
  // sidebar entirely. The page components themselves are unchanged; they
  // adapt through CSS and the isMobile flag they receive via context below.
  if (isMobile) {
    const pageTitle = ({
      home: 'Home', calendar: 'Calendar', late: 'Late payments',
      allbills: 'All bills', essentials: 'Essentials', creditcards: 'Credit cards',
      subscriptions: 'Subscriptions', settings: 'Settings'
    })[page] || 'Finance Calendar';

    return h('div', { className: 'app-shell mobile' },
      h(MobileHeader, {
        title: pageTitle,
        onQuickAdd: () => setQuickAdd({ date: todayYmd() }),
        onBack: MOBILE_SUBPAGES.includes(page) ? () => setPage('allbills') : null
      }),
      h('div', { className: 'main-content mobile' }, pageContent),
      h(MobileTabBar, {
        page,
        setPage,
        lateCount: lateBills.length,
        needsAttentionCount
      }),
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
/* ---------------- Mobile support ----------------
 * Layout switching is driven by a media query rather than user-agent
 * sniffing, so it reacts correctly to rotation, split-screen, and a desktop
 * browser window simply being made narrow. The breakpoint here must match
 * the one in styles.css.
 */

const MOBILE_BREAKPOINT = 768;

// True while the viewport is phone-sized. Re-renders on resize/rotate.
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
    // addEventListener on MediaQueryList isn't in older Safari; fall back
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

// The five destinations that get a slot in the bottom bar. Everything else
// (Essentials / Credit cards / Subscriptions) lives behind the "Bills" tab,
// which opens All Bills - that page already links onward to each of them.
const MOBILE_TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'late', label: 'Late', icon: 'alert' },
  { id: 'allbills', label: 'Bills', icon: 'allbills' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

// Which bottom tab should light up for a given page. Sub-pages of All Bills
// keep the Bills tab active so the user never sees "no tab selected".
const TAB_FOR_PAGE = {
  home: 'home',
  calendar: 'calendar',
  late: 'late',
  allbills: 'allbills',
  essentials: 'allbills',
  creditcards: 'allbills',
  subscriptions: 'allbills',
  settings: 'settings'
};

function MobileTabBar({ page, setPage, lateCount, needsAttentionCount }) {
  const activeTab = TAB_FOR_PAGE[page] || page;
  return h('nav', { className: 'mobile-tabbar' },
    MOBILE_TABS.map((tab) => {
      const active = activeTab === tab.id;
      let badge = null;
      if (tab.id === 'late' && lateCount > 0) badge = lateCount;
      if (tab.id === 'allbills' && needsAttentionCount > 0) badge = needsAttentionCount;
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

// Compact top bar shown on mobile in place of the sidebar brand block.
// A three-column grid keeps the title optically centered no matter how wide
// the left icon or right button are. Sub-pages get a back arrow.
function MobileHeader({ title, onQuickAdd, onBack }) {
  return h('header', { className: 'mobile-header' },
    h('div', { className: 'mobile-header-left' },
      onBack
        ? h('button', { className: 'mobile-header-back', onClick: onBack, 'aria-label': 'Back' }, '\u2039')
        : h('img', { src: 'assets/icon.png', alt: '', className: 'mobile-header-logo' })
    ),
    h('h1', { className: 'mobile-header-title' }, title || 'Finance Calendar'),
    h('div', { className: 'mobile-header-right' },
      onQuickAdd
        ? h('button', { className: 'mobile-header-add', onClick: onQuickAdd, 'aria-label': 'Quick add' },
            h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' },
              h('path', { d: 'M12 5v14M5 12h14' })
            )
          )
        : null
    )
  );
}

// Pages that live under All bills on mobile and therefore need a back arrow.
const MOBILE_SUBPAGES = ['essentials', 'creditcards', 'subscriptions'];

// Existing modals become bottom sheets on mobile purely through CSS
// (see the .modal-overlay / .modal-content rules in the mobile block), so
// there's no separate sheet component to keep in sync.
/* ---------------- Shared Entry Form Modal (add/edit) ---------------- */

// A reusable modal for adding or editing a bill-like entry (name, amount or
// amount range, date or date range, frequency, category). Used by Essentials,
// Subscriptions, and one-time entries on All Bills.
//
// Props:
//   title       - modal heading, e.g. "Edit bill"
//   entry       - the entry object to edit (already in form-shape: strings for numbers)
//   categories  - array of category options, or null to hide the category field
//   dateLabel   - label for the date field when not using a date range
//   showFreq    - whether to show the frequency selector (default true)
//   submitLabel - label for the save/add button
//   onSubmit    - called with the cleaned entry (numbers parsed) on save
//   onClose     - called to dismiss the modal
function EntryFormModal({ title, entry, categories, dateLabel, showFreq, submitLabel, onSubmit, onClose }) {
  const [form, setForm] = useState(() => ({ ...entry }));

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  function submit() {
    if (!form.name.trim()) return;
    onSubmit({
      ...form,
      amount: form.amount === '' ? 0 : parseFloat(form.amount) || 0,
      amountMin: form.amountMin === '' ? 0 : parseFloat(form.amountMin) || 0,
      amountMax: form.amountMax === '' ? 0 : parseFloat(form.amountMax) || 0
    });
  }

  const useFreq = showFreq !== false;

  return h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content' },
      h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, title),
      h('div', null,
        h('label', null, 'Name'),
        h('input', { type: 'text', value: form.name, onChange: (e) => update('name', e.target.value), style: { width: '100%' } })
      ),
      h('div', { style: { display: 'flex', gap: '8px' } },
        form.useAmountRange
          ? h(React.Fragment, null,
              h('div', { style: { flex: 1 } },
                h('label', null, 'Min'),
                h('input', { type: 'number', value: form.amountMin, onChange: (e) => update('amountMin', e.target.value), style: { width: '100%' } })
              ),
              h('div', { style: { flex: 1 } },
                h('label', null, 'Max'),
                h('input', { type: 'number', value: form.amountMax, onChange: (e) => update('amountMax', e.target.value), style: { width: '100%' } })
              )
            )
          : h('div', { style: { flex: 1 } },
              h('label', null, 'Amount'),
              h('input', { type: 'number', value: form.amount, onChange: (e) => update('amount', e.target.value), style: { width: '100%' } })
            )
      ),
      h('button', { className: 'toggle-link', onClick: () => update('useAmountRange', !form.useAmountRange) },
        form.useAmountRange ? 'Use fixed amount' : 'Use amount range'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        form.useDateRange
          ? h(React.Fragment, null,
              h('div', { style: { flex: 1 } },
                h('label', null, 'Start date'),
                h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value), style: { width: '100%' } })
              ),
              h('div', { style: { flex: 1 } },
                h('label', null, 'End date'),
                h('input', { type: 'date', value: form.dateEnd, onChange: (e) => update('dateEnd', e.target.value), style: { width: '100%' } })
              )
            )
          : h('div', { style: { flex: 1 } },
              h('label', null, dateLabel || 'Date'),
              h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value), style: { width: '100%' } })
            )
      ),
      h('button', { className: 'toggle-link', onClick: () => update('useDateRange', !form.useDateRange) },
        form.useDateRange ? 'Use single date' : 'Use date range'),
      useFreq ? h('div', null,
        h('label', null, 'Frequency'),
        h('select', { value: form.freq, onChange: (e) => update('freq', e.target.value), style: { width: '100%' } },
          FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
      ) : null,
      categories ? h('div', null,
        h('label', null, 'Category'),
        h('select', { value: form.category, onChange: (e) => update('category', e.target.value), style: { width: '100%' } },
          (categories.includes(form.category) ? categories : [form.category, ...categories]).map((c) => h('option', { key: c, value: c }, c)))
      ) : null,
      h('div', null,
        h('label', null, 'Calendar color'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
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
      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'primary', onClick: submit }, submitLabel || 'Save')
      )
    )
  );
}

// Converts a stored entry (numbers) into form-shape (strings) for editing,
// filling in any fields that might be missing from older saved data.
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
    category: entry.category || '',
    color: entry.color || '',
    oneTimeKind: entry.oneTimeKind
  };
}

// Returns { title, categories, dateLabel, showFreq } for the edit modal based
// on which list the entry being edited lives in.
function getEditModalConfig(sourceList, entry) {
  if (sourceList === 'majorBills') {
    return { title: 'Edit bill', categories: MAJOR_CATEGORIES, dateLabel: 'Due date', showFreq: true };
  }
  if (sourceList === 'subscriptions') {
    return { title: 'Edit subscription', categories: MINOR_CATEGORIES, dateLabel: 'Billing date', showFreq: true };
  }
  if (sourceList === 'incomeSources') {
    return { title: 'Edit income source', categories: null, dateLabel: 'Next pay date', showFreq: true };
  }
  // one-time entries - no frequency, but category is editable
  const isIncome = entry && entry.oneTimeKind === 'income';
  return {
    title: isIncome ? 'Edit one-time income' : 'Edit one-time payment',
    categories: isIncome ? ONE_TIME_INCOME_CATEGORIES : ONE_TIME_PAYMENT_CATEGORIES,
    dateLabel: 'Date',
    showFreq: false
  };
}

// Applies an edited entry back to the right list in `data` and returns the
// updated data object. `sourceList` of 'creditCards' is a no-op (managed on
// the Credit cards page).
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

/* ---------------- Onboarding Wizard ---------------- */

const MAJOR_CATEGORIES = ['Rent/mortgage', 'Power', 'Water', 'Gas', 'Insurance', 'Car payment', 'Phone', 'Internet', 'Credit card', 'Other'];
const MINOR_CATEGORIES = ['Streaming', 'Gaming', 'Cloud storage', 'Memberships', 'Other'];
const ONE_TIME_PAYMENT_CATEGORIES = ['Rent/mortgage', 'Power', 'Water', 'Gas', 'Insurance', 'Car payment', 'Phone', 'Internet', 'Credit card', 'Shopping', 'Medical', 'Travel', 'Gift', 'Other'];
const ONE_TIME_INCOME_CATEGORIES = ['Paycheck', 'Bonus', 'Gift', 'Refund', 'Side income', 'Other'];

const COMMON_MAJOR_BILLS = [
  { name: 'Rent/mortgage', category: 'Rent/mortgage', freq: 'monthly' },
  { name: 'Electric', category: 'Power', freq: 'monthly' },
  { name: 'Water', category: 'Water', freq: 'monthly' },
  { name: 'Gas', category: 'Gas', freq: 'monthly' },
  { name: 'Car insurance', category: 'Insurance', freq: 'monthly' },
  { name: 'Health insurance', category: 'Insurance', freq: 'monthly' },
  { name: 'Car payment', category: 'Car payment', freq: 'monthly' },
  { name: 'Phone', category: 'Phone', freq: 'monthly' },
  { name: 'Internet', category: 'Internet', freq: 'monthly' }
];

const COMMON_SUBSCRIPTIONS = [
  { name: 'Spotify', category: 'Streaming', freq: 'monthly' },
  { name: 'Netflix', category: 'Streaming', freq: 'monthly' },
  { name: 'Disney+', category: 'Streaming', freq: 'monthly' },
  { name: 'Xbox Game Pass', category: 'Gaming', freq: 'monthly' },
  { name: 'PlayStation Plus', category: 'Gaming', freq: 'monthly' },
  { name: 'iCloud storage', category: 'Cloud storage', freq: 'monthly' },
  { name: 'Google One', category: 'Cloud storage', freq: 'monthly' },
  { name: 'Amazon Prime', category: 'Memberships', freq: 'monthly' },
  { name: 'Gym membership', category: 'Memberships', freq: 'monthly' }
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
    category: '',
    color: '',
    ...defaults
  };
}

function presetEntry(preset, defaults) {
  return blankEntry({ ...preset, amount: '', ...defaults });
}

function OnboardingWizard({ data, onComplete }) {
  const [phase, setPhase] = useState('import'); // 'import' | 'setup'
  const [step, setStep] = useState(0);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);

  const [income, setIncome] = useState(
    data.incomeSources && data.incomeSources.length
      ? data.incomeSources
      : [blankEntry({ name: 'Paycheck', freq: 'biweekly', category: 'Income' })]
  );
  const [majorBills, setMajorBills] = useState(
    data.majorBills && data.majorBills.length
      ? data.majorBills
      : COMMON_MAJOR_BILLS.map((p) => presetEntry(p))
  );
  const [subscriptions, setSubscriptions] = useState(
    data.subscriptions && data.subscriptions.length
      ? data.subscriptions
      : COMMON_SUBSCRIPTIONS.map((p) => presetEntry(p))
  );
  const [creditCards, setCreditCards] = useState(
    data.creditCards && data.creditCards.length ? data.creditCards : []
  );

  const steps = [
    { title: 'Your income', subtitle: 'Add each paycheck or income source - amount, date, and how often it arrives.' },
    { title: 'Major expenses', subtitle: 'We started you off with common bills - fill in amounts, remove anything that doesn\u2019t apply, or add more.' },
    { title: 'Subscriptions & extras', subtitle: 'Same idea for smaller recurring charges. Remove what you don\u2019t have, fill in the rest.' },
    { title: 'Credit cards', subtitle: 'Optional - add any credit card balances you want to track. You can skip this and add cards later.' }
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
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete({
        ...data,
        incomeSources: cleanList(income),
        majorBills: cleanList(majorBills),
        subscriptions: cleanList(subscriptions),
        creditCards: cleanCreditCards(creditCards)
      });
    }
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
      addLabel: '+ Add another income source',
      dateLabel: 'Next pay date'
    });
  } else if (step === 1) {
    body = h(EntryList, {
      rows: majorBills,
      categories: MAJOR_CATEGORIES,
      namePlaceholder: 'e.g. Rent',
      onChange: (id, field, value) => updateRow(majorBills, setMajorBills, id, field, value),
      onAdd: () => addRow(majorBills, setMajorBills, { category: 'Other' }),
      onRemove: (id) => removeRow(majorBills, setMajorBills, id),
      addLabel: '+ Add another expense',
      dateLabel: 'Due date'
    });
  } else if (step === 2) {
    body = h(EntryList, {
      rows: subscriptions,
      categories: MINOR_CATEGORIES,
      namePlaceholder: 'e.g. Spotify',
      onChange: (id, field, value) => updateRow(subscriptions, setSubscriptions, id, field, value),
      onAdd: () => addRow(subscriptions, setSubscriptions, { freq: 'monthly', category: 'Streaming' }),
      onRemove: (id) => removeRow(subscriptions, setSubscriptions, id),
      addLabel: '+ Add another subscription',
      dateLabel: 'Billing date'
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
      onComplete(result.data);
    } else if (!result.canceled) {
      setImportError(result.error || 'Import failed. Please check the file and try again.');
    }
  }

  // Step 0 of onboarding: ask if the user has an existing backup to import.
  // No warning needed here since there is no saved data yet at this point.
  if (phase === 'import') {
    return h('div', { className: 'wizard-shell' },
      h('div', null,
        h('h2', null, 'Welcome to Finance Calendar'),
        h('p', { style: { color: 'var(--text-secondary)', marginTop: '4px' } },
          'Do you have a .json backup from a previous install or the web version that you\u2019d like to restore?')
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
    );
  }

  return h('div', { className: 'wizard-shell' },
    h('div', { className: 'wizard-progress' },
      steps.map((s, i) => h('div', { key: i, className: `wizard-step-dot${i <= step ? ' active' : ''}` }))
    ),
    h('div', null,
      h('h2', null, steps[step].title),
      h('p', { style: { color: 'var(--text-secondary)', marginTop: '4px' } }, steps[step].subtitle)
    ),
    body,
    h('div', { className: 'row-between' },
      step > 0
        ? h('button', { onClick: handleBack }, 'Back')
        : h('div'),
      h('button', { className: 'primary', onClick: handleNext }, step < steps.length - 1 ? 'Next' : 'Finish setup')
    )
  );
}

/* A single entry as a card row, with optional amount/date range toggles */
function EntryList({ rows, categories, namePlaceholder, onChange, onAdd, onRemove, addLabel, dateLabel }) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
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
    h('button', { onClick: onAdd }, addLabel)
  );
}

function EntryCard({ row, categories, namePlaceholder, dateLabel, onChange, onRemove }) {
  return h('div', { className: 'setup-entry' },
    h('div', { className: 'setup-entry-top' },
      h('input', {
        type: 'text',
        placeholder: namePlaceholder,
        value: row.name,
        onChange: (e) => onChange('name', e.target.value)
      }),
      categories ? h('select', {
        value: row.category || '',
        onChange: (e) => onChange('category', e.target.value),
        style: { width: '150px' }
      }, categories.map((c) => h('option', { key: c, value: c }, c))) : null,
      h('button', { className: 'x-btn', 'aria-label': 'Remove', onClick: onRemove }, '\u00d7')
    ),
    h('div', { className: 'setup-entry-fields' },
      row.useAmountRange
        ? h(React.Fragment, null,
            h('div', null,
              h('label', null, 'Min'),
              h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: row.amountMin, onChange: (e) => onChange('amountMin', e.target.value) })
            ),
            h('div', null,
              h('label', null, 'Max'),
              h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: row.amountMax, onChange: (e) => onChange('amountMax', e.target.value) })
            )
          )
        : h('div', null,
            h('label', null, 'Amount'),
            h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: row.amount, onChange: (e) => onChange('amount', e.target.value) })
          ),
      row.useDateRange
        ? h(React.Fragment, null,
            h('div', null,
              h('label', null, 'Start date'),
              h('input', { className: 'field-date', type: 'date', value: row.date, onChange: (e) => onChange('date', e.target.value) })
            ),
            h('div', null,
              h('label', null, 'End date'),
              h('input', { className: 'field-date', type: 'date', value: row.dateEnd, onChange: (e) => onChange('dateEnd', e.target.value) })
            )
          )
        : h('div', null,
            h('label', null, dateLabel || 'Date'),
            h('input', { className: 'field-date', type: 'date', value: row.date, onChange: (e) => onChange('date', e.target.value) })
          ),
      h('div', null,
        h('label', null, 'Frequency'),
        h('select', { className: 'field-freq', value: row.freq, onChange: (e) => onChange('freq', e.target.value) },
          FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
      )
    ),
    h('div', { style: { display: 'flex', gap: '14px' } },
      h('button', { className: 'toggle-link', onClick: () => onChange('useAmountRange', !row.useAmountRange) },
        row.useAmountRange ? 'Use fixed amount' : 'Use amount range'),
      h('button', { className: 'toggle-link', onClick: () => onChange('useDateRange', !row.useDateRange) },
        row.useDateRange ? 'Use single date' : 'Use date range')
    )
  );
}

/* ---------------- Post-setup prompt ---------------- */

function PostSetupPrompt({ onAdd, onSkip }) {
  return h('div', { className: 'wizard-shell' },
    h('div', { className: 'card', style: { textAlign: 'center', padding: '2rem' } },
      h('h2', null, 'Setup complete'),
      h('p', { style: { color: 'var(--text-secondary)' } },
        'Would you like to add any prior entries - past bills, one-time payments, or one-time income - before getting started?'),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '1rem' } },
        h('button', { onClick: onSkip }, 'Skip for now'),
        h('button', { className: 'primary', onClick: onAdd }, 'Add an entry')
      )
    )
  );
}

/* ---------------- Credit card entry list (setup step) ---------------- */

function CreditCardEntryList({ cards, onChange, onAdd, onRemove }) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    cards.length === 0 ? h('p', { style: { color: 'var(--text-secondary)', fontSize: '14px' } },
      'No credit cards added yet - that\u2019s fine, you can add or skip this entirely.') : null,
    cards.map((c) =>
      h('div', { key: c.id, className: 'setup-entry' },
        h('div', { className: 'setup-entry-top' },
          h('input', {
            type: 'text',
            placeholder: 'e.g. Chase Sapphire',
            value: c.name,
            onChange: (e) => onChange(c.id, 'name', e.target.value)
          }),
          h('button', { className: 'x-btn', 'aria-label': 'Remove', onClick: () => onRemove(c.id) }, '\u00d7')
        ),
        h('div', { className: 'setup-entry-fields' },
          h('div', null,
            h('label', null, 'Total debt'),
            h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: c.totalDebt, onChange: (e) => onChange(c.id, 'totalDebt', e.target.value) })
          ),
          h('div', null,
            h('label', null, 'Amount paid'),
            h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: c.amountPaid, onChange: (e) => onChange(c.id, 'amountPaid', e.target.value) })
          )
        ),
        h('div', { className: 'checkbox-row' },
          h('input', {
            type: 'checkbox',
            id: `cc-recurring-${c.id}`,
            checked: c.hasRecurringPayment,
            onChange: (e) => onChange(c.id, 'hasRecurringPayment', e.target.checked)
          }),
          h('label', { htmlFor: `cc-recurring-${c.id}`, style: { margin: 0 } }, 'Has a required recurring payment')
        ),
        c.hasRecurringPayment ? h('div', { className: 'setup-entry-fields' },
          h('div', null,
            h('label', null, 'Payment amount'),
            h('input', { className: 'field-amount', type: 'number', placeholder: '0', value: c.paymentAmount, onChange: (e) => onChange(c.id, 'paymentAmount', e.target.value) })
          ),
          h('div', null,
            h('label', null, 'Due date'),
            h('input', { className: 'field-date', type: 'date', value: c.paymentDate, onChange: (e) => onChange(c.id, 'paymentDate', e.target.value) })
          ),
          h('div', null,
            h('label', null, 'Frequency'),
            h('select', { className: 'field-freq', value: c.paymentFreq, onChange: (e) => onChange(c.id, 'paymentFreq', e.target.value) },
              FREQS.filter((f) => f !== 'none').map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
          )
        ) : null,
        h('div', { className: 'checkbox-row' },
          h('input', {
            type: 'checkbox',
            id: `cc-apr-${c.id}`,
            checked: c.useApr,
            onChange: (e) => onChange(c.id, 'useApr', e.target.checked)
          }),
          h('label', { htmlFor: `cc-apr-${c.id}`, style: { margin: 0 } }, 'Track APR / interest (optional)')
        ),
        c.useApr ? h('div', { className: 'setup-entry-fields' },
          h('div', null,
            h('label', null, 'APR %'),
            h('input', { className: 'field-amount', type: 'number', step: '0.01', placeholder: 'e.g. 24.99', value: c.apr, onChange: (e) => onChange(c.id, 'apr', e.target.value) })
          )
        ) : null
      )
    ),
    h('button', { onClick: onAdd }, '+ Add a credit card')
  );
}

/* ---------------- Quick Add Modal ---------------- */

const ENTRY_TYPES = [
  { id: 'bill', label: 'Bill' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'oneTimePayment', label: 'One-time payment' },
  { id: 'oneTimeIncome', label: 'One-time income' }
];

function QuickAddModal({ data, setData, initialDate, onClose }) {
  const [type, setType] = useState('bill');
  const [form, setForm] = useState(() => blankEntry({
    date: initialDate || todayYmd(),
    freq: 'monthly',
    category: 'Other'
  }));

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  useEffect(() => {
    // adjust sensible defaults when type changes
    if (type === 'oneTimePayment') {
      setForm((f) => ({ ...f, freq: 'none', category: ONE_TIME_PAYMENT_CATEGORIES.includes(f.category) ? f.category : 'Other' }));
    } else if (type === 'oneTimeIncome') {
      setForm((f) => ({ ...f, freq: 'none', category: ONE_TIME_INCOME_CATEGORIES.includes(f.category) ? f.category : 'Paycheck' }));
    } else if (type === 'subscription') {
      setForm((f) => ({ ...f, freq: f.freq === 'none' ? 'monthly' : f.freq, category: MINOR_CATEGORIES.includes(f.category) ? f.category : 'Streaming' }));
    } else if (type === 'bill') {
      setForm((f) => ({ ...f, freq: f.freq === 'none' ? 'monthly' : f.freq, category: MAJOR_CATEGORIES.includes(f.category) ? f.category : 'Other' }));
    }
  }, [type]);

  function submit() {
    if (!form.name.trim()) return;
    const entry = {
      ...form,
      amount: form.amount === '' ? 0 : parseFloat(form.amount) || 0,
      amountMin: form.amountMin === '' ? 0 : parseFloat(form.amountMin) || 0,
      amountMax: form.amountMax === '' ? 0 : parseFloat(form.amountMax) || 0
    };

    if (type === 'bill') {
      setData(logActivity({ ...data, majorBills: [...data.majorBills, entry] }, `Added bill "${entry.name}"`));
    } else if (type === 'subscription') {
      setData(logActivity({ ...data, subscriptions: [...data.subscriptions, entry] }, `Added subscription "${entry.name}"`));
    } else if (type === 'oneTimePayment') {
      setData(logActivity({ ...data, oneTimeEntries: [...data.oneTimeEntries, { ...entry, freq: 'none', oneTimeKind: 'payment' }] }, `Added one-time payment "${entry.name}"`));
    } else if (type === 'oneTimeIncome') {
      setData(logActivity({ ...data, oneTimeEntries: [...data.oneTimeEntries, { ...entry, freq: 'none', oneTimeKind: 'income' }] }, `Added one-time income "${entry.name}"`));
    }
    onClose();
  }

  const categories = type === 'subscription' ? MINOR_CATEGORIES
    : type === 'bill' ? MAJOR_CATEGORIES
    : type === 'oneTimePayment' ? ONE_TIME_PAYMENT_CATEGORIES
    : type === 'oneTimeIncome' ? ONE_TIME_INCOME_CATEGORIES
    : null;
  const showFreq = type === 'bill' || type === 'subscription';
  const dateLabel = type === 'oneTimeIncome' ? 'Date received' : (type === 'oneTimePayment' ? 'Date paid' : 'Due date');

  return h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content' },
      h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, 'Add entry'),

      h('div', null,
        h('label', null, 'Type'),
        h('div', { className: 'type-selector' },
          ENTRY_TYPES.map((t) =>
            h('div', {
              key: t.id,
              className: `type-option${type === t.id ? ' selected' : ''}`,
              onClick: () => setType(t.id)
            }, t.label)
          )
        )
      ),

      h('div', null,
        h('label', null, 'Name'),
        h('input', { type: 'text', value: form.name, onChange: (e) => update('name', e.target.value), style: { width: '100%' } })
      ),

      h('div', { style: { display: 'flex', gap: '8px' } },
        form.useAmountRange
          ? h(React.Fragment, null,
              h('div', { style: { flex: 1 } },
                h('label', null, 'Min amount'),
                h('input', { type: 'number', value: form.amountMin, onChange: (e) => update('amountMin', e.target.value), style: { width: '100%' } })
              ),
              h('div', { style: { flex: 1 } },
                h('label', null, 'Max amount'),
                h('input', { type: 'number', value: form.amountMax, onChange: (e) => update('amountMax', e.target.value), style: { width: '100%' } })
              )
            )
          : h('div', { style: { flex: 1 } },
              h('label', null, 'Amount'),
              h('input', { type: 'number', value: form.amount, onChange: (e) => update('amount', e.target.value), style: { width: '100%' } })
            )
      ),
      h('button', { className: 'toggle-link', onClick: () => update('useAmountRange', !form.useAmountRange) },
        form.useAmountRange ? 'Use fixed amount' : 'Use amount range'),

      h('div', { style: { display: 'flex', gap: '8px' } },
        form.useDateRange
          ? h(React.Fragment, null,
              h('div', { style: { flex: 1 } },
                h('label', null, 'Start date'),
                h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value), style: { width: '100%' } })
              ),
              h('div', { style: { flex: 1 } },
                h('label', null, 'End date'),
                h('input', { type: 'date', value: form.dateEnd, onChange: (e) => update('dateEnd', e.target.value), style: { width: '100%' } })
              )
            )
          : h('div', { style: { flex: 1 } },
              h('label', null, dateLabel),
              h('input', { type: 'date', value: form.date, onChange: (e) => update('date', e.target.value), style: { width: '100%' } })
            )
      ),
      (type === 'bill' || type === 'subscription')
        ? h('button', { className: 'toggle-link', onClick: () => update('useDateRange', !form.useDateRange) },
            form.useDateRange ? 'Use single date' : 'Use date range')
        : null,

      showFreq ? h('div', null,
        h('label', null, 'Frequency'),
        h('select', { value: form.freq, onChange: (e) => update('freq', e.target.value), style: { width: '100%' } },
          FREQS.map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
      ) : null,

      categories ? h('div', null,
        h('label', null, 'Category'),
        h('select', { value: form.category, onChange: (e) => update('category', e.target.value), style: { width: '100%' } },
          categories.map((c) => h('option', { key: c, value: c }, c)))
      ) : null,

      h('div', { className: 'row-between', style: { marginTop: '4px' } },
        h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'primary', onClick: submit }, 'Add')
      )
    )
  );
}
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
        h('div', null,
          h('p', { className: 'metric-label' }, 'Net so far'),
          h('p', { className: 'metric-value', style: { color: netSoFar >= 0 ? 'var(--text-success)' : 'var(--late-red)' } },
            `${netSoFar >= 0 ? '+' : ''}${fmtCurrency(netSoFar, currency)}`)
        ),
        h('div', { className: 'net-card-divider' }),
        h('div', null,
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
/* ---------------- Late Payments Page ---------------- */

function LatePage({ data, setData, lateBills }) {
  const currency = data.settings.currency;
  const [priceModal, setPriceModal] = useState(null);

  const total = lateBills.reduce((sum, o) => sum + o.amount, 0);

  function togglePaid(o) {
    const wasPaid = isPaid(data, o.id, o.occDate);
    let next = togglePaidStatus(data, o.id, o.occDate);
    next = logActivity(next, `${wasPaid ? 'Unmarked' : 'Marked'} "${o.name}" as paid`);
    setData(next);
  }

  function dismissLate(o) {
    let next;
    if (o.forcedLate) {
      next = toggleForcedLate(data, o.id, o.occDate);
      next = logActivity(next, `Unmarked "${o.name}" as late`);
    } else {
      const key = `${o.id}|${o.occDate}`;
      next = logActivity({ ...data, dismissedLate: { ...data.dismissedLate, [key]: true } }, `Dismissed late status for "${o.name}"`);
    }
    setData(next);
  }

  function ageClass(days) {
    if (days < 0) return 'age-low';
    return days >= 14 ? 'age-high' : 'age-low';
  }

  function ageLabel(days) {
    if (days < 0) return `due in ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
    if (days === 0) return 'due today';
    if (days === 1) return '1 day late';
    return `${days} days late`;
  }

  return h('div', null,
    h('h2', null, 'Late payments'),
    h('p', { style: { color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' } },
      'Bills past their due date (plus any grace period) that haven\u2019t been marked paid show up here.'),

    h('div', { className: 'late-banner' },
      h('div', null,
        h('p', { className: 'late-banner-label' }, 'Total currently overdue'),
        h('p', { className: 'late-banner-amount' }, fmtCurrency(total, currency))
      ),
      h(Icon, { name: 'alert' })
    ),

    lateBills.length === 0
      ? h('p', { className: 'empty-state' }, 'Nothing overdue right now - you\u2019re all caught up.')
      : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          lateBills.map((o) => {
            const d = parseYmd(o.occDate);
            const dateLabel = formatDate(d, data.settings, { year: true });
            return h('div', { key: `${o.id}-${o.occDate}`, className: 'list-item', style: { borderColor: 'var(--late-red)' } },
              h('div', null,
                h('p', { className: 'list-item-name' }, o.name),
                h('p', { className: 'list-item-sub' }, `Was due ${dateLabel} - ${occAmountLabel(o, currency)}${o.category ? ' - ' + o.category : ''}`),
                o.forcedLate ? h('span', { className: 'badge badge-danger', style: { marginTop: '2px', display: 'inline-block' } }, 'Marked late') : null
              ),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { className: `age-pill ${ageClass(o.daysLate)}` }, ageLabel(o.daysLate)),
                h('button', { onClick: () => setPriceModal(o) }, 'Set price'),
                h('button', { className: 'primary', onClick: () => togglePaid(o) }, 'Pay now (ASAP)'),
                h('button', { className: 'danger-text', onClick: () => dismissLate(o) }, o.forcedLate ? 'Unmark late' : 'Dismiss')
              )
            );
          })
        ),

    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null
  );
}
/* ---------------- Calendar Page ---------------- */

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_FULL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ISO-8601 week number for a given date.
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d - firstThursday) / 86400000;
  return 1 + Math.round(diff / 7);
}

// Builds a list of { startDate, endDate, name, kind, id, occDate } spans for
// entries that use a date range (and are not also recurring in a way that
// makes a span ambiguous - recurring date-range entries shift their span by
// the same offset as each occurrence).
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

    // recurring with a date range - shift the span for each occurrence
    const removed = data.removedOccurrences || {};
    expandEntry(e, gridStart, gridEnd).forEach((occ) => {
      if (removed[`${e.id}|${occ.occDate}`]) return; // single occurrence removed, rule untouched
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

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const gridStart = new Date(monthStart);
  // shift so the grid starts on firstDow
  let leadingDays = (monthStart.getDay() - firstDow + 7) % 7;
  gridStart.setDate(gridStart.getDate() - leadingDays);
  const gridEnd = new Date(monthEnd);
  let trailingDays = (firstDow - 1 - monthEnd.getDay() + 7) % 7;
  gridEnd.setDate(gridEnd.getDate() + trailingDays);

  const allBills = getAllBillLikeEntries(data);

  // quick lookup so each occurrence knows which list its template entry lives in
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

  // entries whose occurrence ALSO has a date range get excluded from the
  // normal day-chip list so they don't show twice - they're rendered as a
  // thin connector overlay between their start/end markers instead.
  const rangeSpans = useMemo(() => getDateRangeSpans(data, allBills, gridStart, gridEnd), [data, cursor]);
  const rangeEntryIds = useMemo(() => new Set(rangeSpans.map((s) => s.id)), [rangeSpans]);

  // Mobile can't draw the connector bars, so instead each day inside a span
  // gets a dashed band. Map every date string to the span covering it.
  const rangeDayMap = useMemo(() => {
    const map = {};
    rangeSpans.forEach((s) => {
      const cur = new Date(s.startDate);
      while (cur <= s.endDate) {
        const key = ymd(cur);
        if (!map[key]) {
          map[key] = {
            color: s.color || (s.kind === 'income' ? '#4FAE6B' : '#D85A5A'),
            isStart: key === ymd(s.startDate),
            isEnd: key === ymd(s.endDate),
            name: s.name
          };
        }
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [rangeSpans]);

  function changeMonth(delta) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    setSelectedDay(null);
  }

  const cells = [];
  let d = new Date(gridStart);
  while (d <= gridEnd) {
    cells.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  // split into week rows of 7
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const dowLabels = [];
  for (let i = 0; i < 7; i++) dowLabels.push(DOW_FULL[(firstDow + i) % 7]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);

  const showWeekNumbers = !!data.settings.showWeekNumbers;
  const selectedOccs = selectedDay ? (occByDate[selectedDay] || []) : [];

  // range connectors: each span becomes one or more per-week pixel-percent
  // segments (a span crossing a week boundary is split so it never has to
  // affect row height - it's drawn as an overlay positioned over the grid).
  const rangeSegments = useMemo(() => {
    const segments = [];
    weeks.forEach((week, wi) => {
      const weekStart = week[0];
      const weekEnd = week[6];
      rangeSpans.forEach((s) => {
        if (s.endDate < weekStart || s.startDate > weekEnd) return;
        const start = s.startDate < weekStart ? weekStart : s.startDate;
        const end = s.endDate > weekEnd ? weekEnd : s.endDate;
        const startCol = daysBetween(weekStart, start); // 0-indexed
        const endCol = daysBetween(weekStart, end); // 0-indexed
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

  return h('div', { className: 'calendar-page' },
    h('div', { className: 'calendar-header' },
      h('button', { onClick: () => changeMonth(-1), 'aria-label': 'Previous month' }, '<'),
      h('h2', { style: { margin: 0 } }, `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`),
      h('button', { onClick: () => changeMonth(1), 'aria-label': 'Next month' }, '>')
    ),
    h('div', { className: 'calendar-week-row dow-row' },
      showWeekNumbers ? h('div', { className: 'week-number-gutter' }) : null,
      h('div', { className: 'calendar-grid dow-grid' },
        dowLabels.map((dn) => h('div', { key: dn, className: 'calendar-dow' }, dn))
      )
    ),

    h('div', { className: 'calendar-body', style: { '--week-count': weeks.length } },
      showWeekNumbers ? h('div', { className: 'week-number-col' },
        weeks.map((week, wi) => h('div', { key: wi, className: 'week-number-gutter' }, getISOWeekNumber(week[0])))
      ) : null,

      h('div', { className: 'calendar-grid-wrap' },
        h('div', { className: 'calendar-grid months' },
          weeks.map((week, wi) =>
            week.map((cd) => {
              const dateStr = ymd(cd);
              const inMonth = cd.getMonth() === cursor.getMonth();
              // Range entries are drawn as bars (desktop) or a dashed band
              // (mobile), so they're kept out of the per-day list either way.
              const occs = (occByDate[dateStr] || []).filter((o) => !rangeEntryIds.has(o.id));
              const isToday = dateStr === todayStr;
              const isPast = cd < today;
              const isSelected = selectedDay === dateStr;

              // Phones can't fit the desktop chips, but a truncated name is far
              // more useful than an anonymous dot - so show up to two, then a
              // count. Days inside a date range get a dashed band beneath.
              if (isMobile) {
                const band = rangeDayMap[dateStr];
                const shown = occs.slice(0, 2);
                const extra = occs.length - shown.length;
                return h('button', {
                  key: dateStr,
                  className: `calendar-cell mobile${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`,
                  onClick: () => setSelectedDay(dateStr)
                },
                  h('span', { className: 'calendar-date' }, cd.getDate()),
                  band ? h('span', {
                    className: `cal-range-band${band.isStart ? ' start' : ''}${band.isEnd ? ' end' : ''}`,
                    style: { borderColor: band.color },
                    title: band.name
                  }) : null,
                  h('span', { className: 'cal-names' },
                    shown.map((o, i) => {
                      const paid = o.kind !== 'income' && isPaid(data, o.id, o.occDate);
                      const late = !paid && o.kind !== 'income' &&
                        (isForcedLate(data, o.id, o.occDate) || (parseYmd(o.occDate) < today && !isDismissedLate(data, o.id, o.occDate)));
                      const color = o.kind === 'income'
                        ? (getEntryColor(o, data) || '#4FAE6B')
                        : (getEntryColor(o, data) || '#D85A5A');
                      return h('span', {
                        key: `${o.id}-${o.occDate}-${i}`,
                        className: `cal-name${paid ? ' paid' : ''}${late ? ' late' : ''}`,
                        style: { borderLeftColor: paid ? 'var(--text-tertiary)' : color }
                      }, o.name);
                    }),
                    extra > 0 ? h('span', { className: 'cal-name more' }, `+${extra}`) : null
                  )
                );
              }

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
                      const paid = isPaid(data, o.id, o.occDate);
                      if (paid) {
                        extraClass = ' paid';
                        style = { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' };
                      } else {
                        lateFlag = isForcedLate(data, o.id, o.occDate) || (isPast && !isDismissedLate(data, o.id, o.occDate));
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

        // Range bars are drawn across the grid; on a phone-width grid there
        // is no room for them, and their entries still appear in the day sheet.
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

/* ---------------- Day Detail Modal ---------------- */

function DayDetailModal({ data, setData, currency, dateStr, occs, onClose, onAddEntry }) {
  const [priceModal, setPriceModal] = useState(null);
  const [editing, setEditing] = useState(null); // { sourceList, form } or null
  const [confirmRemove, setConfirmRemove] = useState(null); // `${id}|${occDate}` or null

  function togglePaid(o) {
    const wasPaid = isPaid(data, o.id, o.occDate);
    let next = togglePaidStatus(data, o.id, o.occDate);
    next = logActivity(next, `${wasPaid ? 'Unmarked' : 'Marked'} "${o.name}" as paid`);
    setData(next);
  }

  function openEdit(o) {
    if (o.sourceList === 'creditCards') return; // managed on Credit cards page
    setEditing({ sourceList: o.sourceList, form: { ...entryToFormShape(o), _isNew: false } });
  }

  function handleEditSubmit(cleaned) {
    let next = applyEditedEntry(data, editing.sourceList, cleaned);
    next = logActivity(next, `Edited "${cleaned.name}"`);
    setData(next);
    setEditing(null);
  }

  function toggleLate(o) {
    const wasLate = isForcedLate(data, o.id, o.occDate);
    let next = toggleForcedLate(data, o.id, o.occDate);
    next = logActivity(next, `${wasLate ? 'Unmarked' : 'Marked'} "${o.name}" as late`);
    setData(next);
  }

  function removeThisOccurrence(o) {
    let next;
    if (o.sourceList === 'oneTimeEntries') {
      // one-time entries have exactly one occurrence - "remove" means delete it outright
      next = { ...data, oneTimeEntries: data.oneTimeEntries.filter((e) => e.id !== o.id) };
      next = logActivity(next, `Removed "${o.name}"`);
    } else {
      next = removeOccurrence(data, o.id, o.occDate);
      next = logActivity(next, `Removed "${o.name}" from calendar for ${o.occDate}`);
    }
    setData(next);
    setConfirmRemove(null);
  }

  const dateLabel = formatDate(parseYmd(dateStr), data.settings, { weekday: true, year: true });

  return h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content day-modal' },
      h('div', { className: 'row-between' },
        h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, dateLabel),
        h('button', { className: 'icon-btn', onClick: onClose, 'aria-label': 'Close' }, '\u00d7')
      ),
      h('button', { onClick: () => { onClose(); onAddEntry(); }, style: { alignSelf: 'flex-start' } }, '+ Add entry'),

      occs.length === 0
        ? h('p', { className: 'empty-state' }, 'Nothing scheduled this day.')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            occs.map((o, i) => {
              const paid = o.kind === 'bill' && isPaid(data, o.id, o.occDate);
              const editable = o.sourceList !== 'creditCards';
              const forcedLate = o.kind === 'bill' && isForcedLate(data, o.id, o.occDate);
              const removeKey = `${o.id}|${o.occDate}`;
              const confirming = confirmRemove === removeKey;
              const removeLabel = o.sourceList === 'oneTimeEntries' ? 'Remove' : 'Remove from calendar';
              return h('div', { key: `${o.id}-${i}`, className: 'list-item' },
                h('div', { className: 'checkbox-row' },
                  o.kind === 'bill' ? h('input', {
                    type: 'checkbox',
                    checked: paid,
                    onChange: () => togglePaid(o),
                    'aria-label': `Mark ${o.name} paid`
                  }) : null,
                  h('div', null,
                    h('p', { className: 'list-item-name' }, o.name),
                    h('p', { className: 'list-item-sub' }, o.kind === 'income' ? 'Income' : (o.category || 'Bill')),
                    forcedLate ? h('span', { className: 'badge badge-danger', style: { marginTop: '2px', display: 'inline-block' } }, 'Marked late') : null
                  )
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
                  h('span', {
                    className: 'list-item-amount',
                    style: { color: o.kind === 'income' ? 'var(--text-success)' : 'inherit' }
                  }, `${o.kind === 'income' ? '+' : ''}${occAmountLabel(o, currency)}`),
                  h('button', { onClick: () => setPriceModal(o) }, 'Set price'),
                  o.kind === 'bill' ? h('button', { onClick: () => toggleLate(o) }, forcedLate ? 'Unmark late' : 'Mark as late') : null,
                  editable ? h('button', { onClick: () => openEdit(o) }, 'Edit') : null,
                  confirming
                    ? h('button', { className: 'danger-text', onClick: () => removeThisOccurrence(o) }, 'Confirm remove?')
                    : h('button', { className: 'danger-text', onClick: () => setConfirmRemove(removeKey) }, removeLabel)
                )
              );
            })
          ),

      priceModal ? h(PriceOverrideModal, {
        data, setData, occ: priceModal, currency,
        onClose: () => setPriceModal(null)
      }) : null,

      editing ? h(EntryFormModal, Object.assign(
        { entry: editing.form, onSubmit: handleEditSubmit, onClose: () => setEditing(null), submitLabel: 'Save' },
        getEditModalConfig(editing.sourceList, editing.form)
      )) : null
    )
  );
}

/* ---------------- Essentials Page ---------------- */

function BillsPage({ data, setData, onAddEntry }) {
  const currency = data.settings.currency;
  const [editing, setEditing] = useState(null); // form-shape object while a bill is being added/edited, else null

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

  return h('div', null,
    h('div', { className: 'row-between' },
      h('h2', { style: { margin: 0 } }, 'Essentials'),
      h('button', { onClick: openAdd }, '+ Add')
    ),
    h('p', { style: { color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' } },
      'Income sources can be managed from Settings.'),
    list.length === 0
      ? h('p', { className: 'empty-state' }, 'No bills added yet.')
      : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } },
          list.map((e) => {
            const d = parseYmd(e.date);
            const dateLabel = formatDate(d, data.settings);
            return h('div', { key: e.id, className: 'list-item clickable', onClick: () => openEdit(e) },
              h('div', null,
                h('p', { className: 'list-item-name' }, e.name),
                h('p', { className: 'list-item-sub' }, `${dateLabel} - ${FREQ_LABELS[e.freq] || e.freq}${e.category ? ' - ' + e.category : ''}`)
              ),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                h('span', { className: 'list-item-amount' }, entryAmountLabel(e, currency)),
                h('button', {
                  className: 'x-btn',
                  onClick: (ev) => { ev.stopPropagation(); deleteEntry(e); },
                  'aria-label': `Delete ${e.name}`
                }, '\u00d7')
              )
            );
          })
        ),

    editing ? h(EntryFormModal, {
      title: editing._isNew ? 'Add bill' : 'Edit bill',
      entry: editing,
      categories: MAJOR_CATEGORIES,
      dateLabel: 'Due date',
      submitLabel: editing._isNew ? 'Add' : 'Save',
      onSubmit: handleSubmit,
      onClose: () => setEditing(null)
    }) : null
  );
}
/* ---------------- Subscriptions Page ---------------- */

function SubscriptionsPage({ data, setData, onAddEntry }) {
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
  const total = list.reduce((sum, e) => {
    let monthly = entryAmount(e);
    if (e.freq === 'weekly') monthly *= 4.33;
    else if (e.freq === 'biweekly') monthly *= 2.17;
    else if (e.freq === 'yearly') monthly /= 12;
    return sum + monthly;
  }, 0);

  return h('div', null,
    h('div', { className: 'row-between' },
      h('h2', { style: { margin: 0 } }, 'Subscriptions & extras'),
      h('button', { onClick: openAdd }, '+ Add')
    ),
    h('div', { className: 'metric-card', style: { marginTop: '12px', marginBottom: '12px' } },
      h('p', { className: 'metric-label' }, 'Approx. monthly total'),
      h('p', { className: 'metric-value' }, fmtCurrency(total, currency))
    ),
    list.length === 0
      ? h('p', { className: 'empty-state' }, 'No subscriptions added yet.')
      : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          list.map((e) => {
            const d = parseYmd(e.date);
            const dateLabel = formatDate(d, data.settings);
            return h('div', { key: e.id, className: 'list-item clickable', onClick: () => openEdit(e) },
              h('div', null,
                h('p', { className: 'list-item-name' }, e.name),
                h('p', { className: 'list-item-sub' }, `${dateLabel} - ${FREQ_LABELS[e.freq] || e.freq}${e.category ? ' - ' + e.category : ''}`)
              ),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                h('span', { className: 'list-item-amount' }, entryAmountLabel(e, currency)),
                h('button', {
                  className: 'x-btn',
                  onClick: (ev) => { ev.stopPropagation(); deleteEntry(e); },
                  'aria-label': `Delete ${e.name}`
                }, '\u00d7')
              )
            );
          })
        ),

    editing ? h(EntryFormModal, {
      title: editing._isNew ? 'Add subscription' : 'Edit subscription',
      entry: editing,
      categories: MINOR_CATEGORIES,
      dateLabel: 'Billing date',
      submitLabel: editing._isNew ? 'Add' : 'Save',
      onSubmit: handleSubmit,
      onClose: () => setEditing(null)
    }) : null
  );
}
/* ---------------- Credit Cards Page ---------------- */

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
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => blankCreditCard());
  const [projectionCard, setProjectionCard] = useState(null);

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
    setEditingId(null);
    setForm(blankCreditCard());
    setShowForm(true);
  }

  function openEditForm(card) {
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
    const card = cards.find((c) => c.id === id);
    setData(logActivity({ ...data, creditCards: cards.filter((c) => c.id !== id) }, `Deleted credit card "${card ? card.name : id}"`));
  }

  return h('div', null,
    h('div', { className: 'row-between' },
      h('h2', { style: { margin: 0 } }, 'Credit cards'),
      h('button', { onClick: openAddForm }, '+ Add')
    ),

    cards.length > 0 ? h('div', { className: 'grid-2', style: { marginTop: '12px' } },
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Total debt'),
        h('p', { className: 'metric-value' }, fmtCurrency(totals.totalDebt, currency))
      ),
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Total paid so far'),
        h('p', { className: 'metric-value', style: { color: 'var(--text-success)' } }, fmtCurrency(totals.totalPaid, currency))
      ),
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Remaining across all cards'),
        h('p', { className: 'metric-value', style: { color: 'var(--text-warning)' } }, fmtCurrency(totalRemaining, currency))
      ),
      h('div', { className: 'metric-card' },
        h('p', { className: 'metric-label' }, 'Owed now (with interest)'),
        h('p', { className: 'metric-value', style: { color: 'var(--text-danger)' } }, fmtCurrency(totalOwedNow, currency))
      )
    ) : null,

    h('p', { className: 'section-title' }, 'Your cards'),
    cards.length === 0
      ? h('p', { className: 'empty-state' }, 'No credit cards added yet.')
      : h('div', { className: 'card-grid' },
          cards.map((c) => {
            const total = Number(c.totalDebt) || 0;
            const paid = Number(c.amountPaid) || 0;
            const currentBalance = getCurrentCardBalance(c);
            const accruedInterest = Math.max(0, currentBalance - Math.max(0, total - paid));
            const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
            return h('div', { key: c.id, className: 'credit-card-tile' },
              h('div', { className: 'row-between' },
                h('p', { className: 'list-item-name' }, c.name),
                h('button', { className: 'x-btn', onClick: () => deleteCard(c.id), 'aria-label': `Delete ${c.name}` }, '\u00d7')
              ),
              h('div', { className: 'credit-card-progress' },
                h('div', { className: 'credit-card-progress-bar', style: { width: `${pct}%` } })
              ),
              h('div', { className: 'row-between' },
                h('span', { className: 'list-item-sub' }, `${fmtCurrency(paid, currency)} paid of ${fmtCurrency(total, currency)}`),
                h('span', { className: 'list-item-sub' }, `${pct}%`)
              ),
              h('p', { style: { margin: '4px 0 0', fontWeight: 600, fontSize: '15px' } }, `${fmtCurrency(currentBalance, currency)} owed now`),
              c.useApr && c.apr ? h('p', { className: 'list-item-sub', style: { margin: '2px 0 0' } },
                `${c.apr}% APR${accruedInterest > 0.005 ? ` - ${fmtCurrency(accruedInterest, currency)} interest accrued` : ''}`
              ) : null,
              c.hasRecurringPayment ? h('p', { className: 'list-item-sub', style: { margin: '4px 0 0' } },
                `${fmtCurrency(c.paymentAmount, currency)} due ${formatDate(parseYmd(c.paymentDate), data.settings)} - ${FREQ_LABELS[c.paymentFreq] || c.paymentFreq}`
              ) : null,
              h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
                h('button', { onClick: () => openEditForm(c) }, 'Edit'),
                c.useApr && c.apr ? h('button', { onClick: () => setProjectionCard(c) }, 'View projection') : null
              )
            );
          })
        ),

    projectionCard ? h(ProjectionModal, {
      card: projectionCard, data, currency,
      onClose: () => setProjectionCard(null)
    }) : null,

    showForm ? h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) setShowForm(false); } },
      h('div', { className: 'modal-content' },
        h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, editingId ? 'Edit credit card' : 'Add credit card'),
        h('div', null,
          h('label', null, 'Name'),
          h('input', { type: 'text', placeholder: 'e.g. Chase Sapphire', value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), style: { width: '100%' } })
        ),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('div', { style: { flex: 1 } },
            h('label', null, 'Total debt'),
            h('input', { type: 'number', value: form.totalDebt, onChange: (e) => setForm({ ...form, totalDebt: e.target.value }), style: { width: '100%' } })
          ),
          h('div', { style: { flex: 1 } },
            h('label', null, 'Amount paid so far'),
            h('input', { type: 'number', value: form.amountPaid, onChange: (e) => setForm({ ...form, amountPaid: e.target.value }), style: { width: '100%' } })
          )
        ),
        h('div', { className: 'checkbox-row' },
          h('input', {
            type: 'checkbox',
            id: 'cc-recurring',
            checked: form.hasRecurringPayment,
            onChange: (e) => setForm({ ...form, hasRecurringPayment: e.target.checked })
          }),
          h('label', { htmlFor: 'cc-recurring', style: { margin: 0 } }, 'This card has a required recurring payment')
        ),
        form.hasRecurringPayment ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('div', { style: { display: 'flex', gap: '8px' } },
            h('div', { style: { flex: 1 } },
              h('label', null, 'Payment amount'),
              h('input', { type: 'number', value: form.paymentAmount, onChange: (e) => setForm({ ...form, paymentAmount: e.target.value }), style: { width: '100%' } })
            ),
            h('div', { style: { flex: 1 } },
              h('label', null, 'Due date'),
              h('input', { type: 'date', value: form.paymentDate, onChange: (e) => setForm({ ...form, paymentDate: e.target.value }), style: { width: '100%' } })
            )
          ),
          h('div', null,
            h('label', null, 'Frequency'),
            h('select', { value: form.paymentFreq, onChange: (e) => setForm({ ...form, paymentFreq: e.target.value }), style: { width: '100%' } },
              FREQS.filter((f) => f !== 'none').map((f) => h('option', { key: f, value: f }, FREQ_LABELS[f])))
          ),
          h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--text-secondary)' } },
            'This payment will show up on the calendar and count toward your bills.')
        ) : null,
        h('div', { className: 'checkbox-row' },
          h('input', {
            type: 'checkbox',
            id: 'cc-apr',
            checked: form.useApr,
            onChange: (e) => setForm({ ...form, useApr: e.target.checked })
          }),
          h('label', { htmlFor: 'cc-apr', style: { margin: 0 } }, 'Track APR / interest')
        ),
        form.useApr ? h('div', null,
          h('label', null, 'APR %'),
          h('input', { type: 'number', step: '0.01', placeholder: 'e.g. 24.99', value: form.apr, onChange: (e) => setForm({ ...form, apr: e.target.value }), style: { width: '160px' } }),
          h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' } },
            'Simple monthly interest on the remaining balance. The balance shown updates as days pass.')
        ) : null,
        h('div', { className: 'row-between', style: { marginTop: '4px' } },
          h('button', { onClick: () => setShowForm(false) }, 'Cancel'),
          h('button', { className: 'primary', onClick: submitForm }, editingId ? 'Save' : 'Add')
        )
      )
    ) : null
  );
}

/* ---------------- Projection Modal ---------------- */

function ProjectionModal({ card, data, currency, onClose }) {
  const points = useMemo(() => getCardProjection(card, data, 12), [card, data]);
  const late = isCardPaymentLate(card, data);

  const maxBalance = Math.max(...points.map((p) => p.balance), 1);
  const willPayOff = points[points.length - 1].balance <= 0 && points.length <= 12;

  // line chart geometry
  const W = 360, H = 160, PAD = 28;
  const stepX = (W - PAD * 2) / Math.max(1, points.length - 1);
  const scaleY = (v) => H - PAD - (v / maxBalance) * (H - PAD * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${PAD + i * stepX} ${scaleY(p.balance)}`)
    .join(' ');

  // bar chart: skip month 0 (it has no interest/principal split)
  const barPoints = points.slice(1);
  const maxBar = Math.max(...barPoints.map((p) => p.interest + p.principalPaid), 1);
  const barW = (W - PAD * 2) / Math.max(1, barPoints.length) - 4;

  return h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal-content', style: { width: '420px' } },
      h('div', { className: 'row-between' },
        h('p', { style: { margin: 0, fontWeight: 500, fontSize: '16px' } }, `${card.name} - projection`),
        h('button', { className: 'icon-btn', onClick: onClose, 'aria-label': 'Close' }, '\u00d7')
      ),

      late ? h('div', { className: 'info-banner' },
        h('p', { style: { margin: 0, fontSize: '13px' } },
          'This card\u2019s recurring payment is currently late, so the next payment isn\u2019t factored into month 1 of this projection.')
      ) : null,

      h('p', { className: 'list-item-sub', style: { margin: 0 } }, 'Projected balance over the next 12 months'),
      h('svg', { viewBox: `0 0 ${W} ${H}`, className: 'projection-chart' },
        // baseline
        h('line', { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: 'var(--border-tertiary)', strokeWidth: 1 }),
        h('path', { d: linePath, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2 }),
        points.map((p, i) =>
          h('circle', { key: i, cx: PAD + i * stepX, cy: scaleY(p.balance), r: 2.5, fill: 'var(--accent)' })
        ),
        h('text', { x: PAD, y: 14, fontSize: 10, fill: 'var(--text-secondary)' }, fmtCurrency(maxBalance, currency)),
        h('text', { x: PAD, y: H - PAD - 4, fontSize: 10, fill: 'var(--text-secondary)' }, fmtCurrency(0, currency))
      ),

      barPoints.length > 0 ? h(React.Fragment, null,
        h('p', { className: 'list-item-sub', style: { margin: '8px 0 0' } }, 'Interest vs. principal per payment'),
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
/* ---------------- All Bills Page ---------------- */

function AllBillsPage({ data, setData, needsAttention, isMobile, setPage, onAddEntry }) {
  const currency = data.settings.currency;
  // Nothing to act on means nothing worth taking up space - start collapsed.
  const [attentionCollapsed, setAttentionCollapsed] = useState(() => needsAttention.length === 0);
  const [showInfo, setShowInfo] = useState(false);
  const [editing, setEditing] = useState(null); // { sourceList, entry } or null
  const [categoryFilter, setCategoryFilter] = useState('all');

  const lateAttention = needsAttention.filter((o) => o.late);
  const upcomingAttention = needsAttention.filter((o) => !o.late);

  function deleteEntry(o) {
    if (o.kind !== 'bill' && o.kind !== 'income') return;
    let next = null;
    if (o.sourceList === 'majorBills') {
      next = { ...data, majorBills: data.majorBills.filter((e) => e.id !== o.id) };
    } else if (o.sourceList === 'subscriptions') {
      next = { ...data, subscriptions: data.subscriptions.filter((e) => e.id !== o.id) };
    } else if (o.sourceList === 'oneTimeEntries') {
      next = { ...data, oneTimeEntries: data.oneTimeEntries.filter((e) => e.id !== o.id) };
    }
    // credit card payments are managed from the Credit Cards page
    if (next) setData(logActivity(next, `Deleted "${o.name}"`));
  }

  function openEdit(e) {
    if (e.sourceList === 'creditCards') return; // managed on Credit cards page
    setEditing({ sourceList: e.sourceList, form: { ...entryToFormShape(e), _isNew: false } });
  }

  function handleEditSubmit(cleaned) {
    let next = applyEditedEntry(data, editing.sourceList, cleaned);
    next = logActivity(next, `Edited "${cleaned.name}"`);
    setData(next);
    setEditing(null);
  }

  // build the unified list - one row per template entry (not per occurrence)
  const unified = useMemo(() => {
    const rows = [];

    data.majorBills.forEach((e) => rows.push({ ...e, sourceList: 'majorBills', sourceLabel: 'Essential', kind: 'bill' }));
    data.subscriptions.forEach((e) => rows.push({ ...e, sourceList: 'subscriptions', sourceLabel: 'Subscription', kind: 'bill' }));
    getCreditCardPaymentEntries(data).forEach((e) => rows.push({ ...e, sourceList: 'creditCards', sourceLabel: 'Credit card', kind: 'bill' }));
    data.oneTimeEntries.forEach((e) => rows.push({
      ...e,
      sourceList: 'oneTimeEntries',
      sourceLabel: e.oneTimeKind === 'income' ? 'One-time income' : 'One-time payment',
      kind: e.oneTimeKind === 'income' ? 'income' : 'bill'
    }));

    return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [data]);

  // group rows by source type (Essentials / Subscriptions / Credit cards / One-time)
  const SOURCE_GROUP_ORDER = ['majorBills', 'subscriptions', 'creditCards', 'oneTimeEntries'];
  const SOURCE_GROUP_LABELS = {
    majorBills: 'Essentials',
    subscriptions: 'Subscriptions',
    creditCards: 'Credit cards',
    oneTimeEntries: 'One-time entries'
  };
  const grouped = useMemo(() => {
    const map = {};
    unified.forEach((e) => {
      (map[e.sourceList] = map[e.sourceList] || []).push(e);
    });
    return SOURCE_GROUP_ORDER.filter((key) => map[key] && map[key].length > 0).map((key) => [key, map[key]]);
  }, [unified]);

  const categoryOptions = ['all', ...SOURCE_GROUP_ORDER.filter((key) => grouped.some(([k]) => k === key))];
  const visibleGroups = categoryFilter === 'all' ? grouped : grouped.filter(([key]) => key === categoryFilter);

  return h('div', null,
    isMobile ? null : h('h2', null, 'All bills'),

    // On mobile the sidebar's sub-links are gone, so the editors for each
    // group are reached from here instead.
    isMobile && setPage ? h('div', { className: 'subnav-chips' },
      h('button', { className: 'subnav-chip', onClick: () => setPage('essentials') }, 'Essentials'),
      h('button', { className: 'subnav-chip', onClick: () => setPage('creditcards') }, 'Credit cards'),
      h('button', { className: 'subnav-chip', onClick: () => setPage('subscriptions') }, 'Subscriptions')
    ) : null,

    h('div', { className: 'attention-section' },
      h('div', { className: 'row-between attention-header', onClick: () => setAttentionCollapsed(!attentionCollapsed) },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h(Icon, { name: 'alert' }),
          h('p', { style: { margin: 0, fontWeight: 500 } }, 'Needs attention'),
          lateAttention.length > 0 ? h('span', { className: 'nav-badge round' }, lateAttention.length) : null
        ),
        h('button', { onClick: (e) => { e.stopPropagation(); setAttentionCollapsed(!attentionCollapsed); } },
          attentionCollapsed ? 'Expand' : 'Minimize')
      ),
      !attentionCollapsed ? h('div', { style: { marginTop: '10px' } },
        h('div', { className: 'info-banner' },
          h('p', { style: { margin: 0, fontSize: '13px' } },
            `These bills and paychecks use a price range instead of a fixed amount. Bills are flagged here starting ${data.settings.needsAttentionLookaheadDays} day${data.settings.needsAttentionLookaheadDays === 1 ? '' : 's'} before they're due, and income starting ${data.settings.incomeNeedsAttentionLookaheadDays} day${data.settings.incomeNeedsAttentionLookaheadDays === 1 ? '' : 's'} before. Fill in the actual amount once you know it - totals and projections stay more accurate when these are kept up to date. `,
            h('button', { className: 'toggle-link', onClick: () => setShowInfo(!showInfo) }, showInfo ? 'Hide details' : 'Why does this matter?')
          ),
          showInfo ? h('p', { style: { margin: '8px 0 0', fontSize: '13px' } },
            'Until a real amount is entered, range-based bills and income use their midpoint for totals on Home and the Calendar. ',
            'If a bill is past due and still showing a range, it also appears in Late payments using that midpoint - entering the real ',
            'amount here updates both places without changing the usual range for future occurrences. Income is never marked late - ',
            'it simply keeps showing here until a real amount is entered. Both lookahead windows are adjustable in Settings.'
          ) : null
        ),
        needsAttention.length === 0
          ? h('p', { className: 'empty-state' }, 'Nothing needs a price right now.')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } },
              lateAttention.map((o) => h(AttentionRow, { key: `${o.id}-${o.occDate}`, o, data, setData, currency })),
              upcomingAttention.map((o) => h(AttentionRow, { key: `${o.id}-${o.occDate}`, o, data, setData, currency }))
            )
      ) : null
    ),

    h('div', { className: 'row-between' },
      h('p', { className: 'section-title', style: { margin: 0 } }, 'Everything'),
      h('select', {
        value: categoryFilter,
        onChange: (e) => setCategoryFilter(e.target.value),
        style: { width: '200px' }
      }, categoryOptions.map((key) => h('option', { key, value: key }, key === 'all' ? 'All' : SOURCE_GROUP_LABELS[key])))
    ),

    unified.length === 0
      ? h('p', { className: 'empty-state' }, 'Nothing added yet.')
      : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '8px' } },
          visibleGroups.map(([key, rows]) =>
            h('div', { key },
              h('div', { className: 'category-group-header' },
                h('span', null, SOURCE_GROUP_LABELS[key]),
                h('span', { className: 'category-group-count' }, rows.length)
              ),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } },
                rows.map((e) => {
                  const d = e.date ? parseYmd(e.date) : null;
                  const dateLabel = d ? formatDate(d, data.settings) : '';
                  const freqLabel = e.freq && e.freq !== 'none' ? FREQ_LABELS[e.freq] : 'one-time';
                  const editable = e.sourceList !== 'creditCards';
                  return h('div', {
                    key: `${e.sourceList}-${e.id}`,
                    className: `list-item${editable ? ' clickable' : ''}`,
                    onClick: editable ? () => openEdit(e) : undefined
                  },
                    h('div', null,
                      h('p', { className: 'list-item-name' }, e.name),
                      h('p', { className: 'list-item-sub' }, `${dateLabel} - ${freqLabel}${e.category ? ' - ' + e.category : ''}`)
                    ),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                      h('span', {
                        className: 'list-item-amount',
                        style: { color: e.kind === 'income' ? 'var(--text-success)' : 'inherit' }
                      }, `${e.kind === 'income' ? '+' : ''}${entryAmountLabel(e, currency)}`),
                      editable ? h('button', {
                        className: 'x-btn',
                        onClick: (ev) => { ev.stopPropagation(); deleteEntry(e); },
                        'aria-label': `Delete ${e.name}`
                      }, '\u00d7') : null
                    )
                  );
                })
              )
            )
          )
        ),

    editing ? h(EntryFormModal, Object.assign(
      { entry: editing.form, onSubmit: handleEditSubmit, onClose: () => setEditing(null), submitLabel: 'Save' },
      getEditModalConfig(editing.sourceList, editing.form)
    )) : null
  );
}

/* A single row in the "needs attention" list with an inline price input */
function AttentionRow({ o, data, setData, currency }) {
  const [price, setPrice] = useState('');

  function save() {
    const val = parseFloat(price);
    if (isNaN(val)) return;
    const key = `${o.id}|${o.occDate}`;
    let next = { ...data, overrides: { ...data.overrides, [key]: { amount: val } } };
    next = logActivity(next, `Set price for "${o.name}" to ${fmtCurrency(val, currency)}`);
    setData(next);
  }

  const d = parseYmd(o.occDate);
  const dateLabel = formatDate(d, data.settings, { year: true });
  const forcedLate = isForcedLate(data, o.id, o.occDate);
  const ageText = o.daysLate < 0 ? `due in ${Math.abs(o.daysLate)}d` : `${o.daysLate} days late`;
  const isIncome = o.kind === 'income';

  return h('div', { className: 'list-item', style: o.late ? { borderColor: 'var(--late-red)' } : null },
    h('div', null,
      h('p', { className: 'list-item-name' }, o.name),
      h('p', { className: 'list-item-sub' },
        `${o.late ? 'Was due' : 'Due'} ${dateLabel} - usual range `,
        h('span', { style: { color: isIncome ? 'var(--text-success)' : 'inherit' } },
          `${isIncome ? '+' : ''}${fmtCurrency(o.amountMin, currency)}-${isIncome ? '+' : ''}${fmtCurrency(o.amountMax, currency)}`)),
      forcedLate ? h('span', { className: 'badge badge-danger', style: { marginTop: '2px', display: 'inline-block' } }, 'Marked late') : null
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      o.late ? h('span', { className: 'age-pill age-high' }, ageText) : null,
      h('input', {
        type: 'number', placeholder: 'Actual price', value: price,
        onChange: (e) => setPrice(e.target.value), style: { width: '110px' }
      }),
      h('button', { className: 'primary', onClick: save }, 'Save')
    )
  );
}
/* ---------------- Settings Page ---------------- */

const SECTION_COLOR_LABELS = [
  { key: 'majorBills', label: 'Essentials' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'creditCards', label: 'Credit card payments' },
  { key: 'incomeSources', label: 'Income' },
  { key: 'oneTimePayments', label: 'One-time payments' },
  { key: 'oneTimeIncome', label: 'One-time income' }
];

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'colors', label: 'Calendar colors' },
  { id: 'advanced', label: 'Advanced' }
];

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
      data, setData, currency, updateSetting,
      onAddIncome: openAddIncome, onEditIncome: openEditIncome, onDeleteIncome: deleteIncome
    });
  } else if (tab === 'colors') {
    tabContent = h(ColorsTab, { data, updateSectionColor });
  } else {
    tabContent = h(AdvancedTab, { data, setData, updateSetting, onRestart, confirming, setConfirming });
  }

  return h('div', null,
    h('h2', { style: { marginBottom: '2px' } }, 'Settings'),
    h('p', { className: 'version-label' }, `Web version ${WEB_VERSION}`),
    h('div', { className: 'segmented', style: { marginTop: '12px', marginBottom: '16px', maxWidth: '420px' } },
      SETTINGS_TABS.map((t) =>
        h('div', { key: t.id, className: tab === t.id ? 'selected' : '', onClick: () => setTab(t.id) }, t.label)
      )
    ),
    tabContent,

    editingIncome ? h(EntryFormModal, {
      title: editingIncome._isNew ? 'Add income source' : 'Edit income source',
      entry: editingIncome,
      categories: null,
      dateLabel: 'Next pay date',
      submitLabel: editingIncome._isNew ? 'Add' : 'Save',
      onSubmit: handleIncomeSubmit,
      onClose: () => setEditingIncome(null)
    }) : null
  );
}

/* ---------------- General tab ---------------- */

function GeneralTab({ data, setData, currency, updateSetting, onAddIncome, onEditIncome, onDeleteIncome }) {
  return h('div', null,
    // Income sources
    h('div', { className: 'card' },
      h('div', { className: 'row-between' },
        h('p', { style: { margin: 0, fontWeight: 500 } }, 'Income sources'),
        h('button', { onClick: onAddIncome }, '+ Add')
      ),
      data.incomeSources.length === 0
        ? h('p', { className: 'empty-state' }, 'No income sources added yet.')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } },
            data.incomeSources.map((e) => {
              const d = parseYmd(e.date);
              const dateLabel = formatDate(d, data.settings);
              return h('div', { key: e.id, className: 'list-item clickable', onClick: () => onEditIncome(e) },
                h('div', null,
                  h('p', { className: 'list-item-name' }, e.name),
                  h('p', { className: 'list-item-sub' }, `${dateLabel} - ${FREQ_LABELS[e.freq] || e.freq}`)
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                  h('span', { className: 'list-item-amount', style: { color: 'var(--text-success)' } }, `+${entryAmountLabel(e, currency)}`),
                  h('button', {
                    className: 'x-btn',
                    onClick: (ev) => { ev.stopPropagation(); onDeleteIncome(e); },
                    'aria-label': `Delete ${e.name}`
                  }, '\u00d7')
                )
              );
            })
          )
    ),

    // Appearance
    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Appearance'),
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
        )
      ),
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

    // Currency & late bills
    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Currency & bills'),
      h('label', null, 'Currency'),
      h('select', {
        value: data.settings.currency,
        onChange: (e) => updateSetting('currency', e.target.value),
        style: { width: '160px', marginBottom: '12px' }
      }, CURRENCIES.map((c) => h('option', { key: c, value: c }, c))),
      h('div', { style: { marginBottom: '12px' } },
        h('label', null, 'Grace period before a bill is marked late (days)'),
        h('input', {
          type: 'number', min: 0, max: 30,
          value: data.settings.lateGraceDays,
          onChange: (e) => updateSetting('lateGraceDays', parseInt(e.target.value, 10) || 0),
          style: { width: '100px' }
        })
      ),
      h('div', { style: { marginBottom: '12px' } },
        h('label', null, 'Flag range-priced bills under "Needs attention" this many days before they\u2019re due'),
        h('input', {
          type: 'number', min: 0, max: 60,
          value: data.settings.needsAttentionLookaheadDays,
          onChange: (e) => updateSetting('needsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0),
          style: { width: '100px' }
        })
      ),
      h('div', { style: { marginBottom: '12px' } },
        h('label', null, 'Flag range-priced paychecks/income under "Needs attention" this many days before they\u2019re due'),
        h('input', {
          type: 'number', min: 0, max: 60,
          value: data.settings.incomeNeedsAttentionLookaheadDays,
          onChange: (e) => updateSetting('incomeNeedsAttentionLookaheadDays', parseInt(e.target.value, 10) || 0),
          style: { width: '100px' }
        })
      ),
      h('div', { className: 'checkbox-row' },
        h('input', {
          type: 'checkbox',
          id: 'auto-deduct-cc',
          checked: data.settings.autoDeductCardPayments !== false,
          onChange: (e) => updateSetting('autoDeductCardPayments', e.target.checked)
        }),
        h('label', { htmlFor: 'auto-deduct-cc', style: { margin: 0 } }, 'Automatically deduct from a credit card\u2019s balance when its payment is marked paid')
      )
    )
  );
}

/* ---------------- Calendar colors tab ---------------- */

function ColorsTab({ data, updateSectionColor }) {
  return h('div', null,
    h('div', { className: 'card' },
      h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Section colors'),
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

/* ---------------- Advanced tab ---------------- */

function AdvancedTab({ data, setData, updateSetting, onRestart, confirming, setConfirming }) {
  const [importWarning, setImportWarning] = useState(false); // show warning modal before import
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
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Display'),
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
      ),
      h('div', { className: 'checkbox-row' },
        h('input', {
          type: 'checkbox',
          id: 'show-week-numbers',
          checked: !!data.settings.showWeekNumbers,
          onChange: (e) => updateSetting('showWeekNumbers', e.target.checked)
        }),
        h('label', { htmlFor: 'show-week-numbers', style: { margin: 0 } }, 'Show week numbers on the calendar')
      )
    ),

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Custom CSS'),
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
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Activity log'),
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

    h('div', { className: 'card', style: { marginTop: '12px' } },
      h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Data portability'),
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
      h('div', { className: 'checkbox-row', style: { marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid var(--border-tertiary)' } },
        h('input', {
          type: 'checkbox',
          id: 'backup-reminder',
          checked: data.settings.backupReminderEnabled !== false,
          onChange: (e) => updateSetting('backupReminderEnabled', e.target.checked)
        }),
        h('label', { htmlFor: 'backup-reminder', style: { margin: 0 } }, 'Remind me to download a backup every Monday')
      ),
      // The sidebar isn't rendered on mobile, so the desktop download lives
      // here too - it's the only place a phone user would find it.
      h('div', { style: { marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid var(--border-tertiary)' } },
        h('a', {
          href: 'downloads/FinanceCalendar.exe',
          download: 'FinanceCalendar.exe',
          style: { fontSize: '13px', color: 'var(--accent-text)' }
        }, 'Download the Windows desktop app'),
        h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: 'var(--text-tertiary)' } },
          'The desktop app saves to a file on your computer instead of browser storage.')
      )
    ),

    importWarning ? h('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) setImportWarning(false); } },
      h('div', { className: 'modal-content' },
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
      h('p', { style: { margin: '0 0 8px', fontWeight: 500 } }, 'Reset all data'),
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
      h('img', { src: 'assets/icon.png', alt: '', className: 'about-logo' }),
      h('div', null,
        h('p', { style: { margin: '0 0 4px', fontWeight: 500 } }, 'Finance Calendar'),
        h('p', { style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' } },
          'Stores all data locally on this computer in a JSON file - nothing is sent anywhere.')
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
