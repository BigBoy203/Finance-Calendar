
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
