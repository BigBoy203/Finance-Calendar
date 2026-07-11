/* ---------------- Mobile support ----------------
 * Layout switching is driven by a media query rather than user-agent
 * sniffing, so it reacts correctly to rotation, split-screen, and a desktop
 * browser window simply being made narrow. The breakpoint here must match
 * the one in styles.css.
 */

const MOBILE_BREAKPOINT = 768;

// True while the viewport is phone-sized. Re-renders on resize/rotate.
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
    // addEventListener on MediaQueryList isn't in older Safari; fall back
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

// The five destinations that get a slot in the bottom bar. Everything else
// (Essentials / Credit cards / Subscriptions) lives behind the "Bills" tab,
// which opens All Bills - that page already links onward to each of them.
const MOBILE_TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'late', label: 'Late', icon: 'alert' },
  { id: 'allbills', label: 'Bills', icon: 'allbills' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

// Which bottom tab should light up for a given page. Sub-pages of All Bills
// keep the Bills tab active so the user never sees "no tab selected".
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

function MobileTabBar({ page, setPage, lateCount, needsAttentionCount }) {
  const activeTab = TAB_FOR_PAGE[page] || page;
  return h('nav', { className: 'mobile-tabbar' },
    MOBILE_TABS.map((tab) => {
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

// Compact top bar shown on mobile in place of the sidebar brand block.
// A three-column grid keeps the title optically centered no matter how wide
// the left icon or right button are. Sub-pages get a back arrow.
function MobileHeader({ title, onQuickAdd, onBack, onHome, onSync }) {
  return h('header', { className: 'mobile-header' },
    h('div', { className: 'mobile-header-left' },
      onBack
        ? h('button', { className: 'mobile-header-back', onClick: onBack, 'aria-label': 'Back' }, '\u2039')
        : h('button', { className: 'mobile-header-logo-btn', onClick: onHome, 'aria-label': 'Home' },
            h('img', { src: 'assets/icon.svg', alt: '', className: 'mobile-header-logo' })
          )
    ),
    h('h1', { className: 'mobile-header-title' }, title || 'Finance Calendar'),
    h('div', { className: 'mobile-header-right' },
      onSync
        ? h('button', { className: 'mobile-header-sync', onClick: onSync, 'aria-label': 'Sync data' },
            h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
              h('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6' })
            )
          )
        : null,
      onQuickAdd
        ? h('button', { className: 'mobile-header-add', onClick: onQuickAdd, 'aria-label': 'Quick add' },
            h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' },
              h('path', { d: 'M12 5v14M5 12h14' })
            )
          )
        : null
    )
  );
}

// Pages that live under All bills on mobile and therefore need a back arrow.
const MOBILE_SUBPAGES = ['essentials', 'creditcards', 'subscriptions'];

// Existing modals become bottom sheets on mobile purely through CSS
// (see the .modal-overlay / .modal-content rules in the mobile block), so
// there's no separate sheet component to keep in sync.

// Adds swipe-down-to-dismiss to a sheet. Attach the returned handlers to the
// grabber element; dragging it down past a threshold calls onClose.
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
