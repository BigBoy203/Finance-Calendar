
function SubscriptionsPage({ data, setData, onAddEntry }) {
  const currency = data.settings.currency;
  const [editing, setEditing] = useState(null);

  function openAdd() {
    setEditing({ ...blankEntry({ freq: 'monthly', category: 'Streaming' }), _isNew: true });
  }

  function openEdit(entry) {
    setEditing({ ...entryToFormShape(entry), _isNew: false });
  }

  function handleSubmit(cleaned) {
    const { _isNew, ...entry } = cleaned;
    if (_isNew) {
      setData(logActivity({ ...data, subscriptions: [...data.subscriptions, entry] }, `Added subscription "${entry.name}"`));
    } else {
      setData(logActivity({ ...data, subscriptions: data.subscriptions.map((e) => (e.id === entry.id ? entry : e)) }, `Edited "${entry.name}"`));
    }
    setEditing(null);
  }

  function deleteEntry(entry) {
    setData(logActivity({ ...data, subscriptions: data.subscriptions.filter((e) => e.id !== entry.id) }, `Deleted "${entry.name}"`));
  }

  const list = data.subscriptions;
  const total = list.reduce((sum, e) => {
    let monthly = entryAmount(e);
    if (e.freq === 'weekly') monthly *= 4.33;
    else if (e.freq === 'biweekly') monthly *= 2.17;
    else if (e.freq === 'yearly') monthly /= 12;
    return sum + monthly;
  }, 0);

  return h('div', null,
    h('div', { className: 'row-between' },
      h('h2', { style: { margin: 0 } }, 'Subscriptions & extras'),
      h('button', { onClick: openAdd }, '+ Add')
    ),
    h('div', { className: 'metric-card', style: { marginTop: '12px', marginBottom: '12px' } },
      h('p', { className: 'metric-label' }, 'Approx. monthly total'),
      h('p', { className: 'metric-value' }, fmtCurrency(total, currency))
    ),
    list.length === 0
      ? h('p', { className: 'empty-state' }, 'No subscriptions added yet.')
      : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          list.map((e) => {
            const d = parseYmd(e.date);
            const dateLabel = formatDate(d, data.settings);
            return h('div', { key: e.id, className: 'list-item clickable', onClick: () => openEdit(e) },
              h('div', null,
                h('p', { className: 'list-item-name' }, e.name),
                h('p', { className: 'list-item-sub' }, `${dateLabel} - ${FREQ_LABELS[e.freq] || e.freq}${e.category ? ' - ' + e.category : ''}`)
              ),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                h('span', { className: 'list-item-amount' }, entryAmountLabel(e, currency)),
                h('button', {
                  className: 'x-btn',
                  onClick: (ev) => { ev.stopPropagation(); deleteEntry(e); },
                  'aria-label': `Delete ${e.name}`
                }, '\u00d7')
              )
            );
          })
        ),

    editing ? h(EntryFormModal, {
      title: editing._isNew ? 'Add subscription' : 'Edit subscription',
      entry: editing,
      categories: MINOR_CATEGORIES,
      dateLabel: 'Billing date',
      submitLabel: editing._isNew ? 'Add' : 'Save',
      onSubmit: handleSubmit,
      onClose: () => setEditing(null)
    }) : null
  );
}
