
const DONUT_COLORS = ['#D85A5A', '#D8A857', '#8B6FD6', '#4FAE6B', '#D8845A', '#5AA8D8', '#C75AA8', '#7A8C5A'];

function billRowState(data, o, today) {
  const paid = isPaid(data, o.id, o.occDate);
  const late = !paid && (isForcedLate(data, o.id, o.occDate)
    || (parseYmd(o.occDate) < today && !isDismissedLate(data, o.id, o.occDate)));
  return { paid, late };
}

function BillChecklist({ rows, data, currency, onToggle, onOpen }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return h('div', { className: 'bill-checklist' },
    rows.map((o) => {
      const { paid, late } = billRowState(data, o, today);
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
            o.name
          ),
          h('p', { className: 'bill-check-sub' },
            `${formatDate(parseYmd(o.occDate), data.settings)} \u00b7 ${o.category || (FREQ_LABELS[o.freq] || o.freq)}`)
        ),
        h('span', { className: 'bill-check-amount' }, occAmountLabel(o, currency))
      );
    })
  );
}

function BillTileGrid({ rows, data, currency, onToggle, onOpen }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return h('div', { className: 'bill-tile-grid' },
    rows.map((o) => {
      const { paid, late } = billRowState(data, o, today);
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
        h('p', { className: 'bill-tile-amount' }, occAmountLabel(o, currency)),
        h('p', { className: 'bill-tile-sub' },
          `${formatDate(parseYmd(o.occDate), data.settings)} \u2014 ${o.category || (FREQ_LABELS[o.freq] || o.freq)}`)
      );
    })
  );
}

function NextCheckCard({ data, currency, nextCheck, listEl }) {
  const { check, windowEnd, bills, due, checkAmount, overdueCount } = nextCheck;
  const dateLabel = formatDate(windowEnd, data.settings, { weekday: true });

  const whenText = check
    ? `${check.name} \u00b7 ${dateLabel}`
    : `No income scheduled \u2014 showing through ${dateLabel}`;

  const noteText = overdueCount > 0
    ? `${overdueCount} overdue \u00b7 ${bills.length} to pay`
    : `${bills.length} to pay`;

  const shortfall = due - checkAmount;
  const fillPct = checkAmount > 0 ? Math.min(100, (due / checkAmount) * 100) : 0;

  return h('section', { className: `nextcheck${overdueCount > 0 ? ' urgent' : ''}` },
    h('div', { className: 'nextcheck-top' },
      h('div', { className: 'nextcheck-when' },
        h('p', { className: 'nextcheck-label' }, 'Before your next check'),
        h('p', { className: 'nextcheck-sub' }, whenText)
      ),
      h('div', { className: 'nextcheck-figure' },
        h('p', { className: 'nextcheck-due' }, fmtCurrency(due, currency)),
        h('p', { className: 'nextcheck-note' }, noteText)
      )
    ),

    checkAmount > 0 ? h('div', { className: 'nextcheck-bar' },
      h('span', { className: `nextcheck-bar-fill${shortfall > 0 ? ' over' : ''}`, style: { width: `${fillPct}%` } })
    ) : null,

    checkAmount > 0 ? h('p', { className: `nextcheck-verdict${shortfall > 0 ? ' short' : ''}` },
      shortfall > 0
        ? `${fmtCurrency(shortfall, currency)} more than that check covers`
        : `${fmtCurrency(-shortfall, currency)} of it left over`
    ) : null,

    bills.length === 0
      ? h('p', { className: 'empty-state' }, 'Nothing due before then \u2014 you\u2019re clear.')
      : listEl
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

  const fin = useMonthFinancials(data, cursor);
  const nextCheck = useNextCheck(data);

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
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const netSoFar = fin.incomeReceived - fin.billsPaid;
  const netProjected = fin.totalProjectedIncome - fin.totalBills;
  const leftToPay = Math.max(0, fin.totalBills - fin.billsPaid);
  const coveredPct = fin.totalBills > 0 ? Math.min(100, (fin.billsPaid / fin.totalBills) * 100) : 0;

  const Renderer = isMobile ? BillChecklist : BillTileGrid;
  const listProps = { data, currency, onToggle: togglePaid, onOpen: setPriceModal };

  return h('div', { className: `home-page${isMobile ? ' mobile-home' : ''}` },
    h('div', { className: `home-wash${netSoFar >= 0 ? '' : ' neg'}` },
      h('div', { className: 'home-month-header' },
        h('button', { onClick: () => changeMonth(-1), 'aria-label': 'Previous month' }, '<'),
        h('h1', { className: 'home-month-title' }, monthLabel),
        h('button', { onClick: () => changeMonth(1), 'aria-label': 'Next month' }, '>')
      ),
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
      listEl: h(Renderer, Object.assign({ rows: nextCheck.bills }, listProps))
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
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null
  );
}

function MonthSummaryCard({ summary, currency, incomeReceived, projectedIncome, incomeRange }) {
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
      h('div', { className: 'row-between' },
        h('span', { style: { color: 'var(--text-secondary)' } }, 'Income so far'),
        h('span', { style: { color: 'var(--text-success)' } }, fmtCurrency(incomeReceived, currency))
      ),
      h('div', { className: 'row-between' },
        h('span', { style: { color: 'var(--text-secondary)' } }, 'Projected income'),
        h('span', null,
          fmtCurrency(projectedIncome, currency),
          incomeRange ? h('span', { style: { color: 'var(--text-tertiary)', marginLeft: '6px' } },
            `${fmtCurrency(incomeRange.min, currency)}\u2013${fmtCurrency(incomeRange.max, currency)}`) : null
        )
      ),
      (!summary.biggestBill && !summary.biggestIncome) ? h('p', { className: 'empty-state', style: { margin: 0 } }, 'Nothing scheduled this month yet.') : null
    )
  );
}

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

function CashFlowChart({ points, currency }) {
  const [view, setView] = useState('cumulative');
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

function PriceOverrideModal({ data, setData, occ, currency, onClose }) {
  const existing = getOverride(data, occ.id, occ.occDate);
  const [price, setPrice] = useState(existing && existing.amount !== undefined ? String(existing.amount) : '');
  const [confirmRemove, setConfirmRemove] = useState(false);

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

  const forcedLate = isForcedLate(data, occ.id, occ.occDate);
  function toggleLate() {
    haptic('warn');
    let next = toggleForcedLate(data, occ.id, occ.occDate);
    next = logActivity(next, `${forcedLate ? 'Unmarked' : 'Marked'} "${occ.name}" as late`);
    setData(next);
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

  const d = parseYmd(occ.occDate);
  const dateLabel = formatDate(d, data.settings, { weekday: true, year: true });
  const templateLabel = occ.isRange
    ? `${fmtCurrency(occ.amountMin, currency)}-${fmtCurrency(occ.amountMax, currency)}`
    : fmtCurrency(entryAmount(occ), currency);

  return h('div', { className: 'modal-overlay as-window', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
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
        h('label', null, 'Actual price for this occurrence'),
        h('input', {
          type: 'number',
          inputMode: 'decimal',
          placeholder: 'e.g. 94.32',
          value: price,
          onChange: (e) => setPrice(e.target.value)
        }),
        h('p', { className: 'price-hint' },
          'Only affects this occurrence \u2014 future months keep the usual amount.')
      ),

      h('div', { className: 'price-actions' },
        occ.kind !== 'income'
          ? h('button', { className: `price-action-row${forcedLate ? ' active' : ''}`, onClick: toggleLate },
              h('div', null,
                h('span', { className: 'price-action-title' }, forcedLate ? 'Marked late' : 'Mark late'),
                h('span', { className: 'price-action-sub' }, forcedLate ? 'Tap to clear' : 'Flag this date as late')
              ),
              h('span', { className: 'price-action-chevron' }, forcedLate ? '\u2713' : '\u203a')
            )
          : null,
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
