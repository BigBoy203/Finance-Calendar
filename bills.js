
function BillsPage({ data, setData }) {
  const currency = data.settings.currency;
  const [editing, setEditing] = useState(null);

  function openAdd() {
    setEditing({ ...blankEntry({ freq: 'monthly', category: 'Other' }), _isNew: true });
  }

  function openEdit(entry) {
    setEditing({ ...entryToFormShape(entry), _isNew: false });
  }

  function handleSubmit(cleaned) {
    const { _isNew, ...entry } = cleaned;
    if (_isNew) {
      setData(logActivity({ ...data, majorBills: [...data.majorBills, entry] }, `Added bill "${entry.name}"`));
    } else {
      setData(logActivity({ ...data, majorBills: data.majorBills.map((e) => (e.id === entry.id ? entry : e)) }, `Edited "${entry.name}"`));
    }
    setEditing(null);
  }

  function deleteEntry(entry) {
    setData(logActivity({ ...data, majorBills: data.majorBills.filter((e) => e.id !== entry.id) }, `Deleted "${entry.name}"`));
  }

  const list = data.majorBills;

  const total = list.reduce((sum, e) => sum + monthlyAmount(e), 0);

  return h('div', null,
    h('div', { className: 'sub-head' },
      h('h2', { className: 'sub-title' }, 'Essentials'),
      h('p', { className: 'sub-caption' },
        list.length === 0
          ? 'Rent, utilities, insurance \u2014 the bills that keep the lights on.'
          : `${list.length} ${list.length === 1 ? 'bill' : 'bills'} \u00b7 about ${fmtCurrency(total, currency)} a month`)
    ),
    list.length === 0
      ? h('p', { className: 'empty-state' }, 'No bills added yet.')
      : h('div', { className: 'entry-list' },
          list.map((e) => h(EntryRow, {
            key: e.id,
            name: e.name,
            sub: scheduleLabel(e, data.settings),
            amount: entryAmountLabel(e, currency),
            color: getEntryColor({ ...e, sourceList: 'majorBills' }, data),
            onClick: () => openEdit(e)
          }))
        ),
    h('button', { className: 'add-row', onClick: openAdd }, '+ Add a bill'),

    editing ? h(EntryFormModal, {
      data,
      title: editing._isNew ? 'Add bill' : 'Edit bill',
      entry: editing,
      categories: MAJOR_CATEGORIES,
      dateLabel: 'Due date',
      submitLabel: editing._isNew ? 'Add' : 'Save',
      onSubmit: handleSubmit,
      onDelete: editing._isNew ? null : () => { deleteEntry(editing); setEditing(null); },
      deleteLabel: `Delete ${editing.name || 'this bill'}`,
      onClose: () => setEditing(null)
    }) : null
  );
}
