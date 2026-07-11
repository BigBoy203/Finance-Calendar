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
  // which editor page each group's edit arrow opens (mobile only)
  const SUBPAGE_FOR_GROUP = {
    majorBills: 'essentials',
    subscriptions: 'subscriptions',
    creditCards: 'creditcards'
  };
  const grouped = useMemo(() => {
    const map = {};
    unified.forEach((e) => {
      (map[e.sourceList] = map[e.sourceList] || []).push(e);
    });
    return SOURCE_GROUP_ORDER.filter((key) => map[key] && map[key].length > 0).map((key) => [key, map[key]]);
  }, [unified]);

  const visibleGroups = categoryFilter === 'all' ? grouped : grouped.filter(([key]) => key === categoryFilter);

  // monthly total per group, for the little summary cards on the filter chips
  const groupMonthlyTotals = useMemo(() => {
    const totals = {};
    grouped.forEach(([key, rows]) => {
      totals[key] = rows.reduce((sum, e) => {
        if (e.kind === 'income') return sum;
        return sum + (entryAmount(e) || 0);
      }, 0);
    });
    return totals;
  }, [grouped]);

  const attentionBlock = h('div', { className: 'attention-section' },
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
    );

  const filterBlock = h('div', { className: 'bill-filter-row' },
      h('button', {
        className: `bill-filter-chip${categoryFilter === 'all' ? ' active' : ''}`,
        onClick: () => setCategoryFilter('all')
      },
        h('span', { className: 'bill-filter-label' }, 'All'),
        h('span', { className: 'bill-filter-total' }, fmtCurrency(
          Object.values(groupMonthlyTotals).reduce((a, b) => a + b, 0), currency))
      ),
      SOURCE_GROUP_ORDER.filter((key) => grouped.some(([k]) => k === key)).map((key) =>
        h('button', {
          key,
          className: `bill-filter-chip${categoryFilter === key ? ' active' : ''}`,
          onClick: () => setCategoryFilter(key)
        },
          h('span', { className: 'bill-filter-label' }, SOURCE_GROUP_LABELS[key]),
          h('span', { className: 'bill-filter-total' }, fmtCurrency(groupMonthlyTotals[key] || 0, currency)),
          (isMobile && setPage && SUBPAGE_FOR_GROUP[key])
            ? h('span', {
                className: 'bill-filter-edit',
                onClick: (e) => { e.stopPropagation(); setPage(SUBPAGE_FOR_GROUP[key]); },
                'aria-label': `Edit ${SOURCE_GROUP_LABELS[key]}`
              }, '\u203a')
            : null
        )
      )
    );

  return h('div', null,
    isMobile ? null : h('h2', null, 'All bills'),

    // Needs attention sits at the very top so anything requiring a real price
    // is the first thing seen; the category filter chips follow.
    attentionBlock,
    filterBlock,

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
