/* ---------------- Calendar Page ---------------- */

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_FULL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Short currency for tight calendar cells: $1,240 -> $1.2k, $95 -> $95.
function fmtCompact(amount, currency) {
  const sym = (currency === 'EUR') ? '\u20ac' : (currency === 'GBP') ? '\u00a3' : '$';
  const n = Math.round(Number(amount) || 0);
  if (n >= 1000) {
    const k = n / 1000;
    return `${sym}${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return `${sym}${n}`;
}

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
  // mobile: 'grid' (month overview) or 'agenda' (list of active days)
  const [view, setView] = useState('grid');
  // drives the slide animation on month change: 'left' | 'right' | null
  const [slideDir, setSlideDir] = useState(null);

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
    setSlideDir(delta > 0 ? 'left' : 'right');
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    setSelectedDay(null);
  }

  // Numeric amount for an occurrence: override wins, else a range midpoint,
  // else the plain amount. Used for the mobile day totals.
  function occAmount(o) {
    if (o.hasOverride) return Number(o.amount) || 0;
    if (o.isRange) {
      const min = Number(o.amountMin) || 0;
      const max = Number(o.amountMax) || 0;
      return (min + max) / 2;
    }
    return Number(o.amount) || 0;
  }

  // Per-day summary for the mobile grid (Option A): a few colored dots showing
  // what kind of items land that day, plus the day's net dollar movement.
  const daySummary = useMemo(() => {
    const map = {};
    Object.keys(occByDate).forEach((dateStr) => {
      const items = occByDate[dateStr];
      let outflow = 0;
      const colors = [];
      items.forEach((o) => {
        const amt = occAmount(o) || 0;
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

  // Agenda view (Option C): only days that have something, in date order.
  const agendaDays = useMemo(() => {
    return Object.keys(occByDate)
      .filter((ds) => {
        const d = parseYmd(ds);
        return d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear();
      })
      .sort()
      .map((ds) => ({ dateStr: ds, items: occByDate[ds] }));
  }, [occByDate, cursor]);
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

  // swipe left/right on the grid to change months (mobile)
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
    // horizontal, decisive, and not mostly-vertical scroll
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      changeMonth(dx < 0 ? 1 : -1);
    }
  }

  // ---------------- MOBILE calendar (grid A + agenda C) ----------------
  if (isMobile) {
    const monthLabel = `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;

    const gridView = h('div', { className: 'calm-grid-wrap' },
      h('div', { className: 'calm-dow' },
        dowLabels.map((dn) => h('div', { key: dn, className: 'calm-dow-cell' }, dn.slice(0, 1)))
      ),
      h('div', { className: 'calm-weeks' },
        weeks.map((week, wi) => {
          // range pills that touch this week
          const weekPills = rangeSegments.filter((seg) => seg.week === wi);
          return h('div', { key: wi, className: 'calm-week' },
            h('div', { className: 'calm-week-cells' },
              week.map((cd) => {
                const dateStr = ymd(cd);
                const inMonth = cd.getMonth() === cursor.getMonth();
                const isToday = dateStr === todayStr;
                const isSelected = selectedDay === dateStr;
                const sum = daySummary[dateStr];
                // dots exclude range entries (shown as pills)
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
            // spanning range pills for this week
            weekPills.length ? h('div', { className: 'calm-pills' },
              weekPills.map((seg) => {
                const leftPct = (seg.startCol / 7) * 100;
                const widthPct = ((seg.endCol - seg.startCol + 1) / 7) * 100;
                return h('button', {
                  key: seg.key,
                  className: `calm-pill${seg.paid ? ' paid' : ''}${seg.isStart ? ' start' : ''}${seg.isEnd ? ' end' : ''}`,
                  style: { left: `${leftPct}%`, width: `${widthPct}%`, '--pill': seg.color, color: readableTextOn(seg.color) },
                  onClick: () => setSelectedDay(seg.occDate),
                  title: seg.name
                }, seg.showLabel ? seg.name : '\u00a0');
              })
            ) : null
          );
        })
      )
    );

    const agendaView = agendaDays.length === 0
      ? h('div', { className: 'calm-agenda-empty' }, 'Nothing scheduled this month.')
      : h('div', { className: 'calm-agenda' },
          agendaDays.map(({ dateStr, items }) => {
            const d = parseYmd(dateStr);
            const isToday = dateStr === todayStr;
            return h('div', { key: dateStr, className: 'calm-ag-day' },
              h('button', { className: `calm-ag-date${isToday ? ' today' : ''}`, onClick: () => setSelectedDay(dateStr) },
                h('span', { className: 'calm-ag-d' }, d.getDate()),
                h('span', { className: 'calm-ag-w' }, DOW_FULL[d.getDay()].slice(0, 3))
              ),
              h('div', { className: 'calm-ag-items' },
                items.map((o, i) => {
                  const income = o.kind === 'income';
                  const paid = !income && isPaid(data, o.id, o.occDate);
                  const late = !paid && !income &&
                    (isForcedLate(data, o.id, o.occDate) || (parseYmd(o.occDate) < today && !isDismissedLate(data, o.id, o.occDate)));
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
        );

    return h('div', { className: 'calendar-page calm' },
      h('div', { className: 'calm-header' },
        h('button', { className: 'calm-nav', onClick: () => changeMonth(-1), 'aria-label': 'Previous month' }, '\u2039'),
        h('div', { className: 'calm-title-wrap' },
          h('h2', { className: 'calm-title' }, monthLabel),
          !isCurrentMonth ? h('button', { className: 'today-btn', onClick: goToday }, 'Today') : null
        ),
        h('button', { className: 'calm-nav', onClick: () => changeMonth(1), 'aria-label': 'Next month' }, '\u203a')
      ),

      // grid / agenda toggle
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
  const sheet = useSheetDismiss(onClose);
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
      h('div', { className: 'sheet-grabber', ...sheet, 'aria-label': 'Close' }),
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

