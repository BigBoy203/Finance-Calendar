
function attentionSummary(items, currency) {
  const late = items.filter((o) => o.late);
  const priced = items.filter((o) => !o.late && o.needsPrice);
  const lateTotal = late.reduce((sum, o) => sum + o.amount, 0);

  if (late.length && priced.length) {
    return `${fmtCurrency(lateTotal, currency)} past due across ${late.length} ${late.length === 1 ? 'bill' : 'bills'}, and ${priced.length} more ${priced.length === 1 ? 'needs' : 'need'} the real amount.`;
  }
  if (late.length) {
    return `${fmtCurrency(lateTotal, currency)} past due across ${late.length} ${late.length === 1 ? 'bill' : 'bills'} — tap one to mark it paid or clear the late flag.`;
  }
  if (priced.length) {
    return `${priced.length} ${priced.length === 1 ? 'item only has' : 'items only have'} a price range — enter the real amount so your totals are right.`;
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
      o.needsPrice ? h('span', { className: 'att-need' }, 'Needs the real amount') : null
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
const BILL_GROUPS = ['majorBills', 'subscriptions', 'creditCards'];
const BILL_ADD_LABELS = { majorBills: '+ Add a bill', subscriptions: '+ Add a subscription' };

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
    if (e.sourceList === 'creditCards') { setPage('creditcards'); return; }
    setEditing({ sourceList: e.sourceList, form: { ...entryToFormShape(e), _isNew: false } });
  }

  function openAdd(sourceList) {
    const category = sourceList === 'subscriptions' ? 'Streaming' : 'Other';
    setEditing({ sourceList, form: { ...blankEntry({ freq: 'monthly', category }), _isNew: true } });
  }

  function handleEditSubmit(cleaned) {
    const { _isNew, ...entry } = cleaned;
    const next = _isNew
      ? { ...data, [editing.sourceList]: [...data[editing.sourceList], entry] }
      : applyEditedEntry(data, editing.sourceList, cleaned);
    setData(logActivity(next, `${_isNew ? 'Added' : 'Edited'} "${entry.name}"`));
    setEditing(null);
  }

  const unified = useMemo(() => {
    const rows = [];

    data.majorBills.forEach((e) => rows.push({ ...e, sourceList: 'majorBills' }));
    data.subscriptions.forEach((e) => rows.push({ ...e, sourceList: 'subscriptions' }));
    getCreditCardPaymentEntries(data).forEach((e) => rows.push({ ...e, sourceList: 'creditCards' }));

    const nextOf = (e) => { const d = nextDueDate(e); return d ? ymd(d) : '9999'; };
    return rows.map((e) => ({ ...e, _next: nextOf(e) })).sort((a, b) => a._next.localeCompare(b._next));
  }, [data]);

  const grouped = useMemo(() => {
    const map = { majorBills: [], subscriptions: [], creditCards: [] };
    unified.forEach((e) => map[e.sourceList].push(e));
    return BILL_GROUPS.map((key) => [key, map[key]]);
  }, [unified]);

  const visibleGroups = categoryFilter === 'all' ? grouped : grouped.filter(([key]) => key === categoryFilter);

  const groupMonthlyTotals = useMemo(() => {
    const totals = {};
    grouped.forEach(([key, rows]) => {
      totals[key] = rows.reduce((sum, e) => sum + monthlyAmount(e), 0);
    });
    return totals;
  }, [grouped]);

  const lateCount = attention.filter((o) => o.late).length;
  const visibleAttention = showAllAttention ? attention : attention.slice(0, ATTENTION_PREVIEW);

  const attentionBlock = h('div', { className: 'attention-section' },
      h('button', {
        className: 'attention-header',
        onClick: () => { haptic('light'); setAttentionCollapsed(!attentionCollapsed); },
        'aria-expanded': !attentionCollapsed
      },
        h(Icon, { name: 'alert' }),
        h('span', { className: 'attention-title' }, 'Needs attention'),
        attention.length > 0
          ? h('span', { className: `nav-badge round${lateCount > 0 ? '' : ' attention'}` }, attention.length)
          : null,
        h('span', { className: `drop-chevron${attentionCollapsed ? '' : ' open'}` }, '\u203a')
      ),
      !attentionCollapsed ? h('div', { className: 'attention-body' },
        h('div', { className: 'info-banner' }, attentionSummary(attention, currency)),
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
      h('p', { className: 'bill-filter-caption' }, 'What your regular bills cost in a month'),
      h('button', {
        className: `bill-filter-chip${categoryFilter === 'all' ? ' active' : ''}`,
        onClick: () => setCategoryFilter('all')
      },
        h('span', { className: 'bill-filter-label' }, 'All'),
        h('span', { className: 'bill-filter-total' }, fmtCurrency(
          Object.values(groupMonthlyTotals).reduce((a, b) => a + b, 0), currency))
      ),
      grouped.filter(([, rows]) => rows.length > 0).map(([key]) =>
        h('button', {
          key,
          className: `bill-filter-chip${categoryFilter === key ? ' active' : ''}`,
          onClick: () => setCategoryFilter(key)
        },
          h('span', { className: 'bill-filter-label' }, SOURCE_GROUP_LABELS[key]),
          h('span', { className: 'bill-filter-total' }, fmtCurrency(groupMonthlyTotals[key] || 0, currency))
        )
      )
    );

  return h('div', { className: 'page-stack' },
    isMobile ? null : h('h2', null, 'Bills'),

    attentionBlock,
    filterBlock,

    h('div', { className: 'bill-groups' },
      visibleGroups.map(([key, rows]) =>
        h('div', { key, className: 'bill-group' },
          h('div', { className: 'category-group-header' },
            h('span', null, SOURCE_GROUP_LABELS[key]),
            rows.length ? h('span', { className: 'category-group-count' }, rows.length) : null
          ),
          rows.length ? h('div', { className: 'entry-list' },
            rows.map((e) => h(EntryRow, {
              key: `${e.sourceList}-${e.id}`,
              name: e.name,
              sub: scheduleLabel(e, data),
              amount: entryAmountLabel(e, currency),
              color: getEntryColor(e, data),
              onClick: () => openEdit(e)
            }))
          ) : null,
          key === 'creditCards'
            ? h('button', { className: 'add-row', onClick: () => setPage('creditcards') },
                rows.length ? 'Manage credit cards' : '+ Add a credit card')
            : h('button', { className: 'add-row', onClick: () => openAdd(key) }, BILL_ADD_LABELS[key])
        )
      )
    ),

    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null,

    editing ? h(EntryFormModal, Object.assign(
      { data, entry: editing.form, onSubmit: handleEditSubmit, onClose: () => setEditing(null), submitLabel: 'Save' },
      getEditModalConfig(editing.sourceList),
      editing.form._isNew
        ? { title: editing.sourceList === 'subscriptions' ? 'Add a subscription' : 'Add a bill', submitLabel: 'Add' }
        : {
            deleteLabel: `Delete ${editing.form.name || 'this entry'}`,
            onDelete: () => { deleteEntry({ ...editing.form, sourceList: editing.sourceList }); setEditing(null); }
          }
    )) : null
  );
}
