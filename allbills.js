
function attentionSummary(items, currency) {
  const late = items.filter((o) => o.late);
  const priced = items.filter((o) => !o.late && o.needsPrice);
  const lateTotal = late.reduce((sum, o) => sum + o.amount, 0);

  if (late.length && priced.length) {
    return `${fmtCurrency(lateTotal, currency)} past due across ${late.length} ${late.length === 1 ? 'bill' : 'bills'}, and ${priced.length} more ${priced.length === 1 ? 'needs' : 'need'} a real price.`;
  }
  if (late.length) {
    return `${fmtCurrency(lateTotal, currency)} past due across ${late.length} ${late.length === 1 ? 'bill' : 'bills'} — tap one to pay it off or dismiss it.`;
  }
  if (priced.length) {
    return `${priced.length} ${priced.length === 1 ? 'entry still uses' : 'entries still use'} a price range — add the real amount to keep your totals honest.`;
  }
  return 'All clear — everything is paid and every amount is filled in.';
}

function AttentionRow({ o, data, currency, onOpen }) {
  const dateLabel = formatDate(parseYmd(o.occDate), data.settings, { year: true });
  const ageText = o.daysLate === 0 ? 'due today' : `${o.daysLate} ${o.daysLate === 1 ? 'day' : 'days'} late`;

  return h('button', { className: `att-row${o.late ? ' late' : ''}`, onClick: () => onOpen(o) },
    h('span', { className: 'att-text' },
      h('span', { className: 'att-name' }, o.name),
      h('span', { className: 'att-sub' },
        `${o.late ? 'Was due' : 'Due'} ${dateLabel}${o.category ? ' · ' + o.category : ''}`),
      o.needsPrice ? h('span', { className: 'att-need' }, 'Needs a real price') : null
    ),
    h('span', { className: 'att-side' },
      o.late ? h('span', { className: 'age-pill' }, ageText) : null,
      h('span', { className: 'att-amt' },
        `${o.kind === 'income' ? '+' : ''}${occAmountLabel(o, currency)}`)
    ),
    h('span', { className: 'att-chevron' }, '›')
  );
}

const ATTENTION_PREVIEW = 5;

function AllBillsPage({ data, setData, attention, isMobile, setPage }) {
  const currency = data.settings.currency;

  const [attentionCollapsed, setAttentionCollapsed] = useState(() => attention.length === 0);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [editing, setEditing] = useState(null);
  const [priceModal, setPriceModal] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  function deleteEntry(o) {
    let next = null;
    if (o.sourceList === 'majorBills') {
      next = { ...data, majorBills: data.majorBills.filter((e) => e.id !== o.id) };
    } else if (o.sourceList === 'subscriptions') {
      next = { ...data, subscriptions: data.subscriptions.filter((e) => e.id !== o.id) };
    }

    if (next) setData(logActivity(next, `Deleted "${o.name}"`));
  }

  function openEdit(e) {
    if (e.sourceList === 'creditCards') return;
    setEditing({ sourceList: e.sourceList, form: { ...entryToFormShape(e), _isNew: false } });
  }

  function handleEditSubmit(cleaned) {
    let next = applyEditedEntry(data, editing.sourceList, cleaned);
    next = logActivity(next, `Edited "${cleaned.name}"`);
    setData(next);
    setEditing(null);
  }

  const unified = useMemo(() => {
    const rows = [];

    data.majorBills.forEach((e) => rows.push({ ...e, sourceList: 'majorBills' }));
    data.subscriptions.forEach((e) => rows.push({ ...e, sourceList: 'subscriptions' }));
    getCreditCardPaymentEntries(data).forEach((e) => rows.push({ ...e, sourceList: 'creditCards' }));

    return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [data]);

  const SOURCE_GROUP_ORDER = ['majorBills', 'subscriptions', 'creditCards'];

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

  const groupMonthlyTotals = useMemo(() => {
    const totals = {};
    grouped.forEach(([key, rows]) => {
      totals[key] = rows.reduce((sum, e) => sum + (entryAmount(e) || 0), 0);
    });
    return totals;
  }, [grouped]);

  const lateCount = attention.filter((o) => o.late).length;
  const visibleAttention = showAllAttention ? attention : attention.slice(0, ATTENTION_PREVIEW);

  const attentionBlock = h('div', { className: 'attention-section' },
      h('div', { className: 'row-between attention-header', onClick: () => setAttentionCollapsed(!attentionCollapsed) },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h(Icon, { name: 'alert' }),
          h('p', { style: { margin: 0, fontWeight: 500 } }, 'Needs attention'),
          attention.length > 0
            ? h('span', { className: `nav-badge round${lateCount > 0 ? '' : ' attention'}` }, attention.length)
            : null
        ),
        h('button', { onClick: (e) => { e.stopPropagation(); setAttentionCollapsed(!attentionCollapsed); } },
          attentionCollapsed ? 'Expand' : 'Minimize')
      ),
      !attentionCollapsed ? h('div', { style: { marginTop: '10px' } },
        h('div', { className: 'info-banner' },
          h('p', { style: { margin: 0, fontSize: '13px' } }, attentionSummary(attention, currency))
        ),
        attention.length > 0
          ? h('div', { className: 'att-list' },
              visibleAttention.map((o) => h(AttentionRow, {
                key: `${o.id}-${o.occDate}`, o, data, currency, onOpen: setPriceModal
              })),
              attention.length > ATTENTION_PREVIEW
                ? h('button', { className: 'att-more', onClick: () => setShowAllAttention(!showAllAttention) },
                    showAllAttention ? 'Show less' : `Show all ${attention.length}`)
                : null
            )
          : null
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
              }, '›')
            : null
        )
      )
    );

  return h('div', null,
    isMobile ? null : h('h2', null, 'Bills'),

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
                  const editable = e.sourceList !== 'creditCards';
                  return h('div', {
                    key: `${e.sourceList}-${e.id}`,
                    className: `list-item${editable ? ' clickable' : ''}`,
                    onClick: editable ? () => openEdit(e) : undefined
                  },
                    h('div', null,
                      h('p', { className: 'list-item-name' }, e.name),
                      h('p', { className: 'list-item-sub' }, `${dateLabel} - ${repeatLabel(e, data.settings)}${e.category ? ' - ' + e.category : ''}`)
                    ),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                      h('span', { className: 'list-item-amount' }, entryAmountLabel(e, currency)),
                      editable ? h('button', {
                        className: 'x-btn',
                        onClick: (ev) => { ev.stopPropagation(); deleteEntry(e); },
                        'aria-label': `Delete ${e.name}`
                      }, '×') : null
                    )
                  );
                })
              )
            )
          )
        ),

    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null,

    editing ? h(EntryFormModal, Object.assign(
      { data, entry: editing.form, onSubmit: handleEditSubmit, onClose: () => setEditing(null), submitLabel: 'Save' },
      getEditModalConfig(editing.sourceList, editing.form)
    )) : null
  );
}
