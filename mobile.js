
const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  const query = `(max-width: ${MOBILE_BREAKPOINT}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);

    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    setIsMobile(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return isMobile;
}

const MOBILE_TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'add', label: 'Add', icon: 'plus', isAdd: true },
  { id: 'late', label: 'Late', icon: 'alert' },
  { id: 'allbills', label: 'Expenses', icon: 'allbills' }
];

const TAB_FOR_PAGE = {
  home: 'home',
  calendar: 'calendar',
  late: 'late',
  allbills: 'allbills',
  essentials: 'allbills',
  creditcards: 'allbills',
  subscriptions: 'allbills',
  settings: 'settings'
};

function MobileTabBar({ page, setPage, onAdd, lateCount, needsAttentionCount }) {
  const activeTab = TAB_FOR_PAGE[page] || page;
  return h('nav', { className: 'mobile-tabbar' },
    MOBILE_TABS.map((tab) => {

      if (tab.isAdd) {
        return h('button', {
          key: tab.id,
          className: 'mobile-tab-add',
          onClick: () => { haptic('medium'); onAdd(); },
          'aria-label': 'Add expense'
        },
          h('svg', { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round' },
            h('path', { d: 'M12 5v14M5 12h14' })
          )
        );
      }
      const active = activeTab === tab.id;
      let badge = null;
      if (tab.id === 'late' && lateCount > 0) badge = lateCount;
      if (tab.id === 'allbills' && needsAttentionCount > 0) badge = needsAttentionCount;
      return h('button', {
        key: tab.id,
        className: `mobile-tab${active ? ' active' : ''}`,
        onClick: () => setPage(tab.id),
        'aria-label': tab.label,
        'aria-current': active ? 'page' : undefined
      },
        h('span', { className: 'mobile-tab-icon' },
          h(Icon, { name: tab.icon }),
          badge != null ? h('span', { className: 'mobile-tab-badge' }, badge > 99 ? '99+' : badge) : null
        ),
        h('span', { className: 'mobile-tab-label' }, tab.label)
      );
    })
  );
}

function MobileHeader({ title, onSettings, onBack, onSync, lastExported }) {
  return h('header', { className: 'mobile-header' },
    h('div', { className: 'mobile-header-left' },
      onBack
        ? h('button', { className: 'mobile-header-back', onClick: onBack, 'aria-label': 'Back' }, '\u2039')
        : (onSync
            ? h('button', { className: 'mobile-header-sync-group', onClick: onSync, 'aria-label': 'Sync data' },
                h('span', { className: 'mobile-header-sync-icon' },
                  h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                    h('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6' })
                  )
                ),
                h('span', { className: 'mobile-header-sync-label' }, lastExported || 'Not synced')
              )
            : null)
    ),
    h('h1', { className: 'mobile-header-title' }, title || 'Finance Calendar'),
    h('div', { className: 'mobile-header-right' },
      onSettings
        ? h('button', { className: 'mobile-header-settings', onClick: onSettings, 'aria-label': 'Settings' },
            h('svg', { width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
              h('circle', { cx: 12, cy: 12, r: 3 }),
              h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' })
            )
          )
        : null
    )
  );
}

const MOBILE_SUBPAGES = ['essentials', 'creditcards', 'subscriptions'];

function useSheetDismiss(onClose) {
  const startY = useRef(null);
  const dragY = useRef(0);
  const sheetRef = useRef(null);

  function findSheet(el) {
    while (el && !(el.classList && el.classList.contains('modal-content'))) el = el.parentElement;
    return el;
  }
  function onTouchStart(e) {
    startY.current = e.touches[0].clientY;
    sheetRef.current = findSheet(e.currentTarget);
  }
  function onTouchMove(e) {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    dragY.current = Math.max(0, dy);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dragY.current}px)`;
  }
  function onTouchEnd() {
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.18s ease';
      sheetRef.current.style.transform = '';
      const el = sheetRef.current;
      setTimeout(() => { if (el) el.style.transition = ''; }, 200);
    }
    if (dragY.current > 90) onClose();
    startY.current = null;
    dragY.current = 0;
  }
  return { onTouchStart, onTouchMove, onTouchEnd, onClick: onClose };
}
