# Finance Calendar — web build

Personal bill / income / cash-flow tracker being grown into a full expense tracker. Web only — there is no desktop/Electron build any more; the desktop *web* layout (sidebar) is kept working but is not the focus until mobile is finished. Plain-static React (no bundler, no JSX, `React.createElement` via `h`), deployed to Vercel at finance-calendar-web.vercel.app by pushing to this GitHub repo. Owner tests on a real iPhone in Safari and sends screenshots; mobile is the primary experience.

## CRITICAL BUILD RULES — follow exactly

The ONLY JS file that runs in the browser is `app.js`. The individual source files do nothing at runtime; they are concatenated into `app.js`. After editing ANY source file, rebuild:

```
cat app_core.js mobile.js entryform.js wizard.js quickadd.js home.js calendar.js overview.js spending.js bills.js subscriptions.js creditcards.js allbills.js settings.js > app.js
echo "" >> app.js
echo "ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));" >> app.js
node --check app.js
```

- `storage.js` and `sync.js` load as separate script tags in `index.html` (before `app.js`) and define globals `window.api` and `Sync`. NEVER concatenate them into `app.js`.
- `sw.js` is the service worker (offline app-shell cache, network-first). It is standalone: never concatenated, never a script tag — `app_core.js` registers it as `sw.js?v=WEB_VERSION`, so bumping `WEB_VERSION` is what rolls the offline cache. Any new file the shell needs at runtime must be added to the `SHELL` list in `sw.js`.
- `index.html` loads only: vendor react, storage.js, sync.js, app.js — in that order. Vercel analytics is injected dynamically and ONLY on `*.vercel.app` hostnames, straight from the platform's own `/_vercel/insights/script.js`. The repo has no dependencies, no `package.json` and no build step — do not add one.
- After building, check for duplicate top-level definitions:
  `grep "^function \|^const " app.js | sed 's/(.*//' | sort | uniq -d` (must output nothing)
- `node --check` does NOT catch use-before-declaration (temporal dead zone). A `const` used by a useMemo above its declaration = black-screen crash at runtime. This has happened. When adding hooks/consts inside components, declare dependencies ABOVE their first use.
- After any CSS edit verify brace balance: count of `{` must equal `}`. Bulk python string-replace on styles.css has corrupted it before; prefer small targeted edits.
- Bump `WEB_VERSION` in `app_core.js` on every shipped change.
- Headless UI verification recipe (serve + Playwright at iPhone viewport + IndexedDB seed): `.claude/skills/verify/SKILL.md`.

## Code style — hard rules from the owner

- NO comments, labels, or explanatory notes anywhere in the code. None.
- No dead code. If a class/function loses its last caller, delete it AND its CSS.
- After UI changes, cross-check every `className:` used in JS against `styles.css` — nothing may render unstyled.
- Buttons and inputs must have visible borders (1px `var(--border-secondary)`); `--border-tertiary` (12% opacity) is nearly invisible on dark backgrounds — do not use it for interactive controls.
- Avoid an "AI look": no cramped rows of mixed controls, no boxed buttons floating right of text. Prefer full-width tappable rows (title + subtext + chevron), suggestion chips, clean 2-col grids with small uppercase labels.

## Architecture / conventions

- All state lives in one JSON object persisted through `window.api` (IndexedDB, see `storage.js`). `persist(next, opts)` stamps `lastModified`.
- Paid state: `data.paidHistory["entryId|YYYY-MM-DD"] = true`. Per-occurrence overrides in `data.overrides` keyed the same way.
- Recurrence end date: `entry.repeatUntil` (`''` = forever) caps `expandEntry`; the forms expose it through an "End repeat" `.setup-link` after "Amount range · Date range" (recurring entries only) and `repeatLabel(entry, settings)` renders "monthly until Sep 19" in list rows. Not to be confused with `useDateRange`/`dateEnd`, which is a bill that *spans* days on the calendar.
- Mobile detection: `useIsMobile()` (matchMedia ≤768px). Mobile UI: fixed shell, bottom tab bar Home · Overview · [＋ raised circle] · Spending · Bills; Settings is the gear in the header; Sync button top-left with "last synced" label under it.
- Modal rule: big forms and dialogs = centered window (`.modal-overlay.as-window` + `.modal-content.as-window` + `.modal-window-head` + `.modal-x`). Only the calendar day-detail stays a slide-up sheet.
- Form field system (wizard and edit modals; quick-add has its own faster layout): `.setup-field` (small uppercase label + full-width 40px input) inside `.setup-entry-grid` (2-col), inline `.setup-link` toggles separated by a `::before` dot on `.setup-link + .setup-link` ("Amount range · Date range"), so a separator can never wrap onto a line alone. Do NOT go back to the old pattern of stacked full-width fields with underlined toggle buttons in forms — on mobile those balloon to 40px rows and wreck spacing. `.setup-field` label/input selectors are direct-child scoped (`>`) so nested checkbox/color rows keep normal styling — keep them that way. `.setup-hint` is the small grey explainer under a field.
- Mobile calendar: `.calm-*` classes; dot grid + compact daily totals, Month/Agenda toggle, spanning range pills in a reserved lane below each week (lane-stacked when ranges overlap). IMPORTANT: mobile has `button { min-height: 40px }` — any new small button-like element must be added to the exemption list (`min-height: 0`) or it balloons.
- Month math lives once in `useMonthFinancials(data, cursor)` (`overview.js`); `HomePage` and `StatisticsPage` both consume it. `useNextCheck(data, period)` builds a pay-period window. Income landing today counts as already received, so checks are collected from tomorrow forward; `period` indexes into them. Period 0 runs today → next check and includes overdue via `getLateBills`; period n runs (check n-1, check n] with no overdue. `HomePage` owns the `period` state and the card's `‹ ›` nav (hidden unless more than one check is ahead).
- The Calendar tab is now **Overview** (`page === 'overview'`, `OverviewPage`): a two-view tab switched by `OverviewSwitch`, which renders *in place of the mobile header title* (`MobileHeader` `titleEl` prop) and above the page on desktop. `view: 'calendar'` renders `CalendarPage`, `view: 'stats'` renders `StatisticsPage` (next 7 days + cash flow + donut + at-a-glance + vs last month). The view state lives in `App()`.
- The Bills tab (`AllBillsPage`, `page === 'allbills'`) is the only place work piles up. `getAttentionItems(data)` merges `getLateBills` + `getNeedsAttention` into one deduped list (late first, then price-needed); `App` memoizes it as `attention` and its length drives the tab badge. There is no separate Late page — `attentionSummary()` writes the blue `.info-banner` copy from what is actually in the list, `.att-row` rows open `PriceOverrideModal`, and the list caps at `ATTENTION_PREVIEW` with a "Show all" toggle. Below it: filter chips and the recurring commitments (essentials, subscriptions, credit-card payments). One-time purchases are never listed there — they live on the calendar and Home.
- `PriceOverrideModal` is the single hub for one occurrence: set the actual price, mark paid, and a three-state late row (marked late → clear / auto-late → dismiss / neither → mark late), plus remove. `lateState(data, occ)` is the one place late/paid/dismissed is decided — use it, never re-derive it inline.
- Paycheck averaging is per income source: `entry.useAvgEstimate`, offered in the income form only when the source uses an amount range. `averagePaycheck(data, entry)` (WeakMap-cached on `data`) averages past occurrences that have a recorded amount; with two or more samples `expandAll` swaps the estimate into every **future** occurrence (`isEstimate`, shown as `≈$1,140` by `occAmountLabel`), so calendar totals, statistics, projections and the next-check card all move together. Settings → General shows the running average under the source.
- The Spending tab (`spending.js`, `SpendingPage`) owns day-to-day money. Hero = **left for daily life** (`projected income − recurring bills − logged purchases`) with a per-day figure and a pace marker on the bar (`.spend-bar-pace` sits at the share of the month elapsed). `repeatBuys(data)` groups past purchases by name, works out the average gap, and offers two-tap re-logging through `.setup-chip`s that pass a `preset` into `QuickAddModal`. Budgets are `data.budgets = { [category]: monthlyAmount }`, day-to-day categories only, edited through `BudgetModal`; categories with spend but no budget get a "No budget yet" row. Below budgets sits **Where it went** (`.cat-row`): `categoryTotals(data, monthKey)` totals the month per category, `breakdown` sorts them by size with a share bar, and `deltaNote` compares each against the previous month ("$44.25 less than July", "new this month", "about the same as July") — suppressed entirely until there is a previous month to compare with. Tapping a row sets `catFilter`, which narrows the purchase list directly below it and its total; tapping the same row again clears it, as does changing month. Then the month's purchases (`.spend-row`), a six-month bar trend (hidden when there is no history) and four stat tiles.
- A logged purchase is money already spent: `QuickAddModal` marks one-time payments dated today or earlier as paid on save, `oneTimeOccurrence` stamps `isOneTime`, and `getLateBills`/`getNeedsAttention`/`lateState` never treat a one-time payment as late. Don't reintroduce that — it filled the attention list with things the owner had already paid for.
- Home is bill-first: full-bleed gradient hero (`.home-wash`, no card box), the "Before your next check" card, and a collapsible "Bills this month" row (`.drop-card`) with the covered/left progress bar. No charts on Home.
- Onboarding (`wizard.js`): welcome screen → income → bills → subscriptions → credit cards. Bills/subs start EMPTY with tap-to-add suggestion chips. Mid-month rule: on the final step (if today > 1st) a default-on toggle marks already-passed bills this month as paid so nothing shows falsely late on day one.
- Add window (`quickadd.js`) is the most-used screen and is built for speed: one emoji + type name at the top (tap it to open the four `.type-tile`s and switch), then a big autofocused amount, category `.pick-chip`s, an **optional** name that falls back to the category, and Today/Yesterday date chips. There is deliberately no `<select>` in this window — chips sidestep the iOS wheel picker entirely. Extras are checkbox rows that reveal their fields (`.qa-option` → `.qa-reveal`): "Already paid for" (purchases, defaults to on for today or earlier and marks `paidHistory` on save), "The amount varies", "It spans several days", "It stops on a date". Save is disabled until there is an amount — never fail silently, that was a real bug. Category lists: `MAJOR_CATEGORIES` (bills) and `MINOR_CATEGORIES` (subs) are recurring-bill shaped; `ONE_TIME_PAYMENT_CATEGORIES` is day-to-day spending (Groceries, Food & drink, Gas, …) — keep bill-shaped names out of it, and `categoriesByUse` floats the ones this person actually buys to the front.
- Haptics: `haptic('light|medium|success|warn|heavy')` helper; respects `settings.hapticsEnabled`. iOS Safari does not support web vibration — that's expected, don't "fix" it.

## iOS hard limits (do not fight these)

- No background tasks, no silent filesystem writes, no auto-folder creation from a web app. One-tap share-sheet export is the floor on iPhone.
- iOS opens a **wheel picker** for `<select>` and `<input type="date">`, which shrinks `visualViewport` exactly like a keyboard does. `index.html` must only treat that shrink as `--kb` (and only scroll a field into view) when the focused element is a real typing field — `isTypingField()`. Counting the picker as a keyboard re-lays-out the modal mid-tap, so the next tap lands on whatever moved under the finger. This caused a real "can't change the category, it hits the buttons below or closes the window" bug; don't undo it.
- Overlay taps go through `useOverlayDismiss(onClose)`, which only closes when the pointer went **down** and **up** on the overlay itself. Never dismiss on a bare `onClick` target check — a dismissed picker fires a click that closes the modal.
- File inputs MUST be attached to the DOM (`document.body.appendChild`) or iOS never fires `change`. No focus-based cancel timeouts — iOS loses the race. Both are already handled in `storage.js` and `sync.js`; keep it that way.
- apple-touch-icon must be PNG (`assets/icon-180.png`), regenerated from `assets/icon.svg`.

## Deploy

Owner pushes with GitHub Desktop; Vercel auto-deploys. Typical shipped files per change: `app.js` and/or `styles.css`, occasionally `index.html`, `storage.js`, `sync.js`, `assets/*`. Tell the owner exactly which files changed after each task.

## Roadmap (owner's stated priorities)

The category breakdown shipped in 3.7 (**Where it went** on Spending). Still open: turning `repeatBuys` into a real prediction — it already knows the average gap between purchases, so it can say what is due to be bought again rather than only offering a re-log chip. The desktop *web* layout is maintained but gets its own pass only once mobile is where the owner wants it. Always flag honest difficulty and scope concerns BEFORE building, not midway.
