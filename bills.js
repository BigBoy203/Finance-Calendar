
function BillsPage({ data, setData, onAddEntry }) {
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

  return h('div', null,
    h('div', { className: 'row-between' },
      h('h2', { style: { margin: 0 } }, 'Essentials'),
      h('button', { onClick: openAdd }, '+ Add')
    ),
    h('p', { style: { color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' } },
      'Income sources can be managed from Settings.'),
    list.length === 0
      ? h('p', { className: 'empty-state' }, 'No bills added yet.')
      : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } },
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
      title: editing._isNew ? 'Add bill' : 'Edit bill',
      entry: editing,
      categories: MAJOR_CATEGORIES,
      dateLabel: 'Due date',
      submitLabel: editing._isNew ? 'Add' : 'Save',
      onSubmit: handleSubmit,
      onClose: () => setEditing(null)
    }) : null
  );
}
