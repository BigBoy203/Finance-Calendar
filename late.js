/* ---------------- Late Payments Page ---------------- */

function LatePage({ data, setData, lateBills }) {
  const currency = data.settings.currency;
  const [priceModal, setPriceModal] = useState(null);

  const total = lateBills.reduce((sum, o) => sum + o.amount, 0);

  function togglePaid(entryId, occDate) {
    setData(togglePaidStatus(data, entryId, occDate));
  }

  function dismissLate(o) {
    if (o.forcedLate) {
      setData(toggleForcedLate(data, o.id, o.occDate));
    } else {
      const key = `${o.id}|${o.occDate}`;
      setData({ ...data, dismissedLate: { ...data.dismissedLate, [key]: true } });
    }
  }

  function ageClass(days) {
    if (days < 0) return 'age-low';
    return days >= 14 ? 'age-high' : 'age-low';
  }

  function ageLabel(days) {
    if (days < 0) return `due in ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
    if (days === 0) return 'due today';
    if (days === 1) return '1 day late';
    return `${days} days late`;
  }

  return h('div', null,
    h('h2', null, 'Late payments'),
    h('p', { style: { color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' } },
      'Bills past their due date (plus any grace period) that haven\u2019t been marked paid show up here.'),

    h('div', { className: 'late-banner' },
      h('div', null,
        h('p', { className: 'late-banner-label' }, 'Total currently overdue'),
        h('p', { className: 'late-banner-amount' }, fmtCurrency(total, currency))
      ),
      h(Icon, { name: 'alert' })
    ),

    lateBills.length === 0
      ? h('p', { className: 'empty-state' }, 'Nothing overdue right now - you\u2019re all caught up.')
      : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          lateBills.map((o) => {
            const d = parseYmd(o.occDate);
            const dateLabel = formatDate(d, data.settings, { year: true });
            return h('div', { key: `${o.id}-${o.occDate}`, className: 'list-item', style: { borderColor: 'var(--late-red)' } },
              h('div', null,
                h('p', { className: 'list-item-name' }, o.name),
                h('p', { className: 'list-item-sub' }, `Was due ${dateLabel} - ${occAmountLabel(o, currency)}${o.category ? ' - ' + o.category : ''}`),
                o.forcedLate ? h('span', { className: 'badge badge-danger', style: { marginTop: '2px', display: 'inline-block' } }, 'Marked late') : null
              ),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { className: `age-pill ${ageClass(o.daysLate)}` }, ageLabel(o.daysLate)),
                h('button', { onClick: () => setPriceModal(o) }, 'Set price'),
                h('button', { className: 'primary', onClick: () => togglePaid(o.id, o.occDate) }, 'Pay now (ASAP)'),
                h('button', { className: 'danger-text', onClick: () => dismissLate(o) }, o.forcedLate ? 'Unmark late' : 'Dismiss')
              )
            );
          })
        ),

    priceModal ? h(PriceOverrideModal, {
      data, setData, occ: priceModal, currency,
      onClose: () => setPriceModal(null)
    }) : null
  );
}
