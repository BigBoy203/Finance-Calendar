
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
