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

function CalendarPage({ data, setData, onAddEntry }) {
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
              const occs = (occByDate[dateStr] || []).filter((o) => !rangeEntryIds.has(o.id));
              const isToday = dateStr === todayStr;
              const isPast = cd < today;
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

        h('div', { className: 'range-overlay' },
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

