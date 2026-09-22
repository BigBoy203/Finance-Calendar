
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
