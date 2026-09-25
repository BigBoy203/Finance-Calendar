
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
      `Check estimated at ${fmtCurrency(estimate.amount, currency)} \u2014 average of your last ${estimate.count} recorded paychecks`
    ) : null,

    takes.length > 0 ? h('p', { className: 'nextcheck-est' },
      `${takes.map((t) => t.name.replace(/ payback$/, '')).join(' and ')} ${takes.length === 1 ? 'takes' : 'take'} ${fmtCurrency(takes.reduce((sum, t) => sum + t.amount, 0), currency)} back from this check \u2014 the figures above already count it`
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
    { key: netKey, label: 'Net', color: 'var(--accent)', signed: true }
  ];

  return h('section', { className: 'stats-section' },
    h(SectionHead, {
      title: 'Cash flow',
      caption: hovered ? `Day ${hovered.day}` : (view === 'cumulative' ? 'Running totals through the month' : 'What moves each day'),
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
        title: pushedTo ? `Pushed to ${formatDate(parseYmd(pushedTo), data.settings)}` : 'Push to next check',
        sub: pushedTo
          ? 'Tap to pull it back to this pay period'
          : `Moves it to ${formatDate(parseYmd(pushTo), data.settings)} on Home \u2014 the calendar and totals stay put`,
        mark: pushedTo ? '\u2713' : '\u203a',
        onClick: togglePush
      }) : null,
      h(ActionRow, {
        active: covered > 0,
        title: covered > 0 ? `Covering ${fmtCurrency(covered, currency)}` : 'Cover part of it',
        sub: covered > 0
          ? `${fmtCurrency(Math.max(0, fullAmount - covered), currency)} still owed`
          : 'Put down what you can, carry the rest',
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
            ? 'Clear the covered amount'
            : (pushTo && !pushedTo)
              ? `Cover ${fmtCurrency(coverVal, currency)} \u00b7 push the rest`
              : `Cover ${fmtCurrency(coverVal, currency)}`)
      ) : null
    ) : null,

    isIncome ? null : h('div', { className: 'action-list' },
      h(ActionRow, {
        active: paid,
        title: paid ? 'Paid' : 'Mark as paid',
        sub: paid ? 'Tap to undo' : 'Check it off for this date',
        mark: paid ? '\u2713' : '\u203a',
        onClick: togglePaid
      }),
      forced
        ? h(ActionRow, { active: true, tone: 'late', title: 'Marked late', sub: 'Tap to clear', mark: '\u2713', onClick: toggleLate })
        : late
          ? h(ActionRow, { tone: 'late', title: 'Late', sub: 'Tap to dismiss the late flag', onClick: dismissLate })
          : paid ? null : h(ActionRow, { title: 'Mark as late', sub: 'Flag this date', onClick: toggleLate })
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
