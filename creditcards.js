
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

function CreditCardSheet({ data, card, onSave, onDelete, onClose }) {
  const currency = data.settings.currency;
  const [form, setForm] = useState(() => (card ? { ...blankCreditCard(), ...card } : blankCreditCard()));
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const canSave = form.name.trim() !== '';

  return h(Sheet, {
    title: card ? 'Edit credit card' : 'Add a credit card',
    tall: true,
    onClose,
    foot: h('div', { className: 'sheet-actions' },
      h('button', { className: 'primary', onClick: () => { if (canSave) { haptic('success'); onSave(form); } }, disabled: !canSave },
        canSave ? (card ? 'Save' : 'Add card') : 'Give it a name')
    )
  },
    h(Field, { label: 'Name' },
      h('input', { type: 'text', placeholder: 'e.g. Chase Sapphire', value: form.name, onChange: (e) => set('name', e.target.value) })
    ),
    h('div', { className: 'setup-entry-grid' },
      h(Field, { label: 'Total debt' },
        h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.totalDebt, onChange: (e) => set('totalDebt', e.target.value) })
      ),
      h(Field, { label: 'Paid so far' },
        h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.amountPaid, onChange: (e) => set('amountPaid', e.target.value) })
      )
    ),
    h('div', { className: 'switch-list' },
      h(SettingSwitch, {
        id: 'cc-recurring',
        title: 'Has a monthly payment',
        sub: 'Shows on the calendar and counts toward your bills',
        checked: !!form.hasRecurringPayment,
        onChange: (v) => set('hasRecurringPayment', v)
      }),
      h(SettingSwitch, {
        id: 'cc-apr',
        title: 'Track interest',
        sub: 'Simple monthly interest on what is left, updated as days pass',
        checked: !!form.useApr,
        onChange: (v) => set('useApr', v)
      })
    ),
    form.hasRecurringPayment ? h('div', { className: 'reveal-block' },
      h('div', { className: 'setup-entry-grid' },
        h(Field, { label: 'Payment' },
          h('input', { type: 'number', inputMode: 'decimal', placeholder: '0', value: form.paymentAmount, onChange: (e) => set('paymentAmount', e.target.value) })
        ),
        h(Field, { label: 'Due date' },
          h(DateField, { value: form.paymentDate, onChange: (d) => set('paymentDate', d), settings: data.settings })
        )
      ),
      h('div', { className: 'qa-block' },
        h('p', { className: 'qa-label' }, 'Repeats'),
        h(FreqChips, { value: form.paymentFreq, onPick: (f) => set('paymentFreq', f) })
      )
    ) : null,
    form.useApr ? h(Field, { label: 'APR %' },
      h('input', { type: 'number', inputMode: 'decimal', step: '0.01', placeholder: 'e.g. 24.99', value: form.apr, onChange: (e) => set('apr', e.target.value) })
    ) : null,
    card ? h(DeleteRow, {
      label: 'Delete this card',
      sub: 'Removes the card and its payments from the calendar',
      onConfirm: onDelete
    }) : null
  );
}

function CreditCardsPage({ data, setData }) {
  const currency = data.settings.currency;
  const [editing, setEditing] = useState(null);
  const [projectionCard, setProjectionCard] = useState(null);

  const cards = data.creditCards || [];

  const totalOwedNow = cards.reduce((sum, c) => sum + getCurrentCardBalance(c), 0);

  function submitForm(form) {
    const totalDebt = form.totalDebt === '' ? 0 : parseFloat(form.totalDebt) || 0;
    const amountPaid = form.amountPaid === '' ? 0 : parseFloat(form.amountPaid) || 0;
    const existing = editing.card;
    const principalChanged = !existing || existing.totalDebt !== totalDebt || existing.amountPaid !== amountPaid;
    const entry = {
      ...form,
      totalDebt,
      amountPaid,
      paymentAmount: form.paymentAmount === '' ? 0 : parseFloat(form.paymentAmount) || 0,
      apr: form.apr === '' ? 0 : parseFloat(form.apr) || 0,
      balanceDate: principalChanged ? todayYmd() : (form.balanceDate || todayYmd())
    };
    if (existing) {
      setData(logActivity({ ...data, creditCards: cards.map((c) => (c.id === existing.id ? entry : c)) }, `Edited credit card "${entry.name}"`));
    } else {
      setData(logActivity({ ...data, creditCards: [...cards, entry] }, `Added credit card "${entry.name}"`));
    }
    setEditing(null);
  }

  function deleteCard(card) {
    setData(logActivity({ ...data, creditCards: cards.filter((c) => c.id !== card.id) }, `Deleted credit card "${card.name}"`));
    setEditing(null);
  }

  const monthlyPayments = cards
    .filter((c) => c.hasRecurringPayment)
    .reduce((sum, c) => sum + monthlyAmount({ amount: c.paymentAmount, freq: c.paymentFreq }), 0);

  return h('div', { className: 'page-stack' },
    h('div', { className: 'sub-head' },
      h('h2', { className: 'sub-title' }, 'Credit cards'),
      h('p', { className: 'sub-caption' },
        cards.length === 0
          ? 'Track what you owe, what you have paid, and when it will be gone.'
          : `${cards.length} ${cards.length === 1 ? 'card' : 'cards'} · ${fmtCurrency(totalOwedNow, currency)} owed now${monthlyPayments > 0 ? ` · about ${fmtCurrency(monthlyPayments, currency)} a month in payments` : ''}`)
    ),

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
              h('button', { className: 'cc-main', onClick: () => setEditing({ card: c }) },
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
                ? h('button', { className: 'cc-link', onClick: () => setProjectionCard(c) }, 'See the payoff projection ›')
                : null
            );
          })
        ),
    h('button', { className: 'add-row', onClick: () => setEditing({ card: null }) }, '+ Add a card'),

    projectionCard ? h(ProjectionModal, {
      card: projectionCard, data, currency,
      onClose: () => setProjectionCard(null)
    }) : null,

    editing ? h(CreditCardSheet, {
      data,
      card: editing.card,
      onSave: submitForm,
      onDelete: () => deleteCard(editing.card),
      onClose: () => setEditing(null)
    }) : null
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

  return h(Sheet, { title: `${card.name} payoff`, sub: 'Projected over the next 12 months', onClose },
    late ? h('div', { className: 'info-banner' },
      'This card’s recurring payment is currently late, so the next payment isn’t counted in month 1.') : null,

    h('div', { className: 'sheet-section' },
      h('p', { className: 'qa-label' }, 'Balance'),
      h('svg', { viewBox: `0 0 ${W} ${H}`, className: 'projection-chart' },
        h('line', { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: 'var(--border-secondary)', strokeWidth: 1 }),
        h('path', { d: linePath, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.4, strokeLinejoin: 'round' }),
        points.map((p, i) =>
          h('circle', { key: i, cx: PAD + i * stepX, cy: scaleY(p.balance), r: 2.5, fill: 'var(--accent)' })
        ),
        h('text', { x: PAD, y: 14, fontSize: 10, fill: 'var(--text-secondary)' }, fmtCurrency(maxBalance, currency)),
        h('text', { x: PAD, y: H - PAD - 4, fontSize: 10, fill: 'var(--text-secondary)' }, fmtCurrency(0, currency))
      )
    ),

    barPoints.length > 0 ? h('div', { className: 'sheet-section' },
      h('p', { className: 'qa-label' }, 'Interest vs. principal per payment'),
      h('svg', { viewBox: `0 0 ${W} ${H}`, className: 'projection-chart' },
        h('line', { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: 'var(--border-secondary)', strokeWidth: 1 }),
        barPoints.map((p, i) => {
          const x = PAD + i * ((W - PAD * 2) / barPoints.length) + 2;
          const interestH = (p.interest / maxBar) * (H - PAD * 2);
          const principalH = (p.principalPaid / maxBar) * (H - PAD * 2);
          return h(React.Fragment, { key: i },
            h('rect', { x, y: H - PAD - interestH - principalH, width: barW, height: principalH, rx: 2, fill: 'var(--accent)' }),
            h('rect', { x, y: H - PAD - interestH, width: barW, height: interestH, rx: 2, fill: 'var(--late-red)' })
          );
        })
      ),
      h('div', { className: 'chart-key' },
        h('span', { className: 'chart-key-item' }, h('span', { className: 'chart-key-dot accent' }), 'Principal'),
        h('span', { className: 'chart-key-item' }, h('span', { className: 'chart-key-dot late' }), 'Interest')
      )
    ) : null,

    h('p', { className: `form-msg ${willPayOff ? 'good' : ''}` },
      willPayOff
        ? `At this rate, ${card.name} is paid off within ${points.length - 1} month${points.length - 1 === 1 ? '' : 's'}.`
        : card.hasRecurringPayment
          ? 'At this rate, this balance won’t be paid off within 12 months with the current payment.'
          : 'No recurring payment is set, so this balance keeps growing with interest.')
  );
}
