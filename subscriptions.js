
function SubscriptionsPage({ data, setData }) {
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
  const total = list.reduce((sum, e) => sum + monthlyAmount(e), 0);

  return h('div', { className: 'page-stack' },
    h('div', { className: 'sub-head' },
      h('h2', { className: 'sub-title' }, 'Subscriptions'),
      h('p', { className: 'sub-caption' },
        list.length === 0
          ? 'Streaming, apps, memberships \u2014 anything that renews on its own.'
          : `${list.length} ${list.length === 1 ? 'subscription' : 'subscriptions'} \u00b7 about ${fmtCurrency(total, currency)} a month \u00b7 ${fmtCurrency(total * 12, currency)} a year`)
    ),
    list.length === 0
      ? h('p', { className: 'empty-state' }, 'No subscriptions added yet.')
      : h('div', { className: 'entry-list' },
          list.map((e) => h(EntryRow, {
            key: e.id,
            name: e.name,
            sub: scheduleLabel(e, data),
            amount: entryAmountLabel(e, currency),
            color: getEntryColor({ ...e, sourceList: 'subscriptions' }, data),
            onClick: () => openEdit(e)
          }))
        ),
    h('button', { className: 'add-row', onClick: openAdd }, '+ Add a subscription'),

    editing ? h(EntryFormModal, {
      data,
      title: editing._isNew ? 'Add subscription' : 'Edit subscription',
      entry: editing,
      categories: MINOR_CATEGORIES,
      dateLabel: 'Billing date',
      submitLabel: editing._isNew ? 'Add' : 'Save',
      onSubmit: handleSubmit,
      onDelete: editing._isNew ? null : () => { deleteEntry(editing); setEditing(null); },
      deleteLabel: `Delete ${editing.name || 'this subscription'}`,
      onClose: () => setEditing(null)
    }) : null
  );
}
