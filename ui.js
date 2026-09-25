
function CloseX({ onClick }) {
  return h('button', { className: 'modal-x', onClick, 'aria-label': 'Close' },
    h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.8, strokeLinecap: 'round' },
      h('path', { d: 'M6 6l12 12M18 6L6 18' })
    )
  );
}

function Sheet({ title, sub, head, onClose, foot, tall, className, children }) {
  const overlay = useOverlayDismiss(onClose);
  const drag = useSheetDismiss(onClose);
  return h('div', Object.assign({ className: 'modal-overlay' }, overlay),
    h('div', {
      className: ['modal-content', tall ? 'tall' : '', className || ''].filter(Boolean).join(' '),
      role: 'dialog',
      'aria-modal': true
    },
      h('div', { className: 'sheet-head', onTouchStart: drag.onTouchStart, onTouchMove: drag.onTouchMove, onTouchEnd: drag.onTouchEnd },
        head || h('div', { className: 'sheet-heading' },
          h('p', { className: 'sheet-title' }, title),
          sub ? h('p', { className: 'sheet-sub' }, sub) : null
        ),
        h(CloseX, { onClick: onClose })
      ),
      h('div', { className: 'sheet-body' }, children),
      foot ? h('div', { className: 'sheet-foot' }, foot) : null
    )
  );
}

function Field({ label, hint, children }) {
  return h('div', { className: 'setup-field' },
    label ? h('label', null, label) : null,
    children,
    hint ? h('p', { className: 'setup-hint' }, hint) : null
  );
}

function currencySymbol(currency) {
  return fmtCurrency(0, currency).replace(/[\d.,\s]/g, '') || '$';
}

function AmountField({ value, onChange, currency, autoFocus, placeholder, label, negative }) {
  return h('div', { className: 'amt-block' },
    label ? h('p', { className: 'qa-label' }, label) : null,
    h('label', { className: 'amt-field' },
      h('span', { className: 'amt-sym' }, `${negative ? '−' : ''}${currencySymbol(currency)}`),
      h('input', {
        className: 'amt-input',
        type: 'number',
        inputMode: 'decimal',
        placeholder: placeholder || '0',
        autoFocus,
        value,
        onChange: (e) => onChange(e.target.value)
      })
    )
  );
}

function PickChips({ options, value, onPick, labelFor }) {
  return h('div', { className: 'chip-row' },
    options.map((o) => h('button', {
      key: o,
      className: `pick-chip${value === o ? ' on' : ''}`,
      onClick: () => { haptic('light'); onPick(o); }
    }, labelFor ? labelFor(o) : o))
  );
}

function ChipScroller({ options, value, onPick, dotFor, reveal }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const on = reveal && el && el.querySelector('.pick-chip.on');
    if (on) el.scrollLeft = Math.max(0, on.offsetLeft - el.offsetLeft - 16);
  }, []);
  return h('div', { className: 'chip-scroll', ref },
    options.map((o) => h('button', {
      key: o,
      className: `pick-chip${value === o ? ' on' : ''}`,
      onClick: () => { haptic('light'); onPick(o); }
    },
      dotFor ? h('span', { className: 'pick-dot', style: { background: dotFor(o) } }) : null,
      o
    ))
  );
}

function openPicker(e) {
  try { if (e.currentTarget.showPicker) e.currentTarget.showPicker(); } catch (err) {}
}

function DateField({ value, onChange, settings, placeholder }) {
  return h('div', { className: `date-field${value ? '' : ' empty'}` },
    h('span', { className: 'date-field-text' },
      value
        ? formatDate(parseYmd(value), settings, { weekday: 'short', year: value.slice(0, 4) !== todayYmd().slice(0, 4) })
        : (placeholder || 'Pick a date')),
    h('svg', { className: 'date-field-icon', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('path', { d: 'M4 6h16v14H4zM8 3v5M16 3v5M4 11h16' })
    ),
    h('input', { type: 'date', value: value || '', onClick: openPicker, onChange: (e) => { if (e.target.value) onChange(e.target.value); } })
  );
}

function DateChips({ value, onChange, settings }) {
  const today = todayYmd();
  const yesterday = yesterdayYmd();
  const custom = value !== today && value !== yesterday;
  const pick = (d) => { haptic('light'); onChange(d); };
  return h('div', { className: 'date-chips' },
    h('button', { className: `pick-chip${value === today ? ' on' : ''}`, onClick: () => pick(today) }, 'Today'),
    h('button', { className: `pick-chip${value === yesterday ? ' on' : ''}`, onClick: () => pick(yesterday) }, 'Yesterday'),
    h('label', { className: `pick-chip date-chip${custom ? ' on' : ''}` },
      custom ? formatDate(parseYmd(value), settings) : 'Other day',
      h('input', { type: 'date', value, onClick: openPicker, onChange: (e) => { if (e.target.value) pick(e.target.value); } })
    )
  );
}

const FREQ_CHIP_LABELS = { none: 'Once', weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly', yearly: 'Yearly' };

function FreqChips({ value, onPick, withOnce }) {
  return h(ChipToggle, {
    wide: true,
    value,
    onChange: onPick,
    options: (withOnce ? FREQS : RECURRING_FREQS).map((f) => ({ id: f, label: FREQ_CHIP_LABELS[f] }))
  });
}

function SettingSwitch({ id, title, sub, checked, onChange }) {
  return h('label', { className: 'switch-row', htmlFor: id },
    h('span', { className: 'switch-text' },
      h('span', { className: 'switch-title' }, title),
      sub ? h('span', { className: 'switch-sub' }, sub) : null
    ),
    h('input', {
      type: 'checkbox',
      id,
      className: 'switch',
      checked,
      onChange: (e) => { haptic('light'); onChange(e.target.checked); }
    })
  );
}

function ActionRow({ title, sub, onClick, active, tone, mark }) {
  return h('button', { className: `action-row${active ? ' active' : ''}${tone ? ' ' + tone : ''}`, onClick },
    h('span', { className: 'action-text' },
      h('span', { className: 'action-title' }, title),
      sub ? h('span', { className: 'action-sub' }, sub) : null
    ),
    h('span', { className: 'action-mark' }, mark || '›')
  );
}

function DeleteRow({ label, sub, armedLabel, onConfirm }) {
  const [armed, setArmed] = useState(false);
  return h('div', { className: 'action-list' },
    h(ActionRow, {
      tone: 'danger',
      title: armed ? (armedLabel || 'Tap again to delete') : label,
      sub: armed ? 'This cannot be undone' : sub,
      onClick: () => {
        if (!armed) { haptic('warn'); setArmed(true); return; }
        haptic('heavy');
        onConfirm();
      }
    })
  );
}

function SectionHead({ title, caption, right }) {
  return h('div', { className: 'section-head' },
    h('div', { className: 'section-head-text' },
      h('p', { className: 'stats-title' }, title),
      caption ? h('p', { className: 'stats-caption' }, caption) : null
    ),
    right || null
  );
}

function Pager({ pages, index, onIndex }) {
  const ref = useRef(null);
  const placed = useRef(false);
  const settle = useRef(null);

  useEffect(() => () => clearTimeout(settle.current), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * el.clientWidth;
    if (!placed.current) {
      placed.current = true;
      el.scrollLeft = target;
      return;
    }
    if (Math.abs(el.scrollLeft - target) > 2) el.scrollTo({ left: target, behavior: 'smooth' });
  }, [index]);

  function onScroll(e) {
    const el = e.currentTarget;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (next !== index) onIndex(next);
    }, 90);
  }

  return h('div', { className: 'pager-wrap' },
    h('div', { className: 'pager-tabs' },
      h(ChipToggle, {
        wide: true,
        value: index,
        onChange: onIndex,
        options: pages.map((p, i) => ({ id: i, label: p.label }))
      })
    ),
    h('div', { className: 'pager', ref, onScroll },
      pages.map((p) => h('div', { key: p.id, className: 'pager-page' },
        h('div', { className: 'pager-page-inner' }, p.body)
      ))
    )
  );
}
