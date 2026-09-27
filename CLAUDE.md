# Finance Calendar

Read this whole file before touching anything. It is the single source of truth for what the app is, who it is for, how it is built, and what is still to do.

## 1. What this app is and who it is for

Finance Calendar is a **personal money app for one person (the owner), used almost entirely on an iPhone** as a Home Screen web app. It answers four everyday questions, in this order of importance:

1. **What do I have to pay before my next paycheck, and will the paycheck cover it?** (Home)
2. **How much money do I actually have right now?** (Wallet → Balance)
3. **How much can I still spend this month, and where did it go?** (Wallet → Budget / Spending / Trends)
4. **What is late or missing a real amount?** (Bills)

Everything is private and local: no account, no server, data lives in the phone's browser (IndexedDB). Backups are a JSON file the owner exports.

**What the owner cares about** (these are standing instructions, not history):

- **Mobile first.** The owner tests on a real iPhone in Safari and sends screenshots. The desktop web layout (sidebar) must keep working but gets its own design pass only after mobile is finished.
- **Plain language.** Anyone who has never seen the app must understand every screen. Money that arrives on a schedule is a **paycheck** (never "check"); telling the app what you have is **Update balance** / "balance update" (never "wallet check"). Sentences over jargon ("After the $X of bills due before your Oct 2 paycheck, you'll have $Y left").
- **One big number per screen.** The owner found screens with several competing big figures confusing. Each Wallet page states one headline figure at most.
- **Nothing duplicated.** Each feature lives in exactly one place (see §7).
- **Fast logging.** The Add window is the most-used screen and must stay quick.
- **iOS-native feel,** bold redesigns welcome. Avoid an "AI look" (see §5).
- **Honesty about scope.** Flag difficulty and scope concerns before building, not midway. After every task, tell the owner exactly which files changed.

**Where it runs:** https://finance-calendar-web.vercel.app — Vercel deploys the `main` branch of `BigBoy203/Finance-Calendar` automatically. Current version: **5.2** (`WEB_VERSION` in `app_core.js`).

## 2. Workflow rules (how to work on it)

### Branches and deploying

- Claude sessions develop on the branch they are assigned and push there. **Only push to `main` when the owner says so in that conversation** — pushing to `main` publishes to the owner's phone. When allowed, prefer a fast-forward (`git merge-base --is-ancestor origin/main HEAD`).
- The owner also pushes with GitHub Desktop, so fetch `main` before starting and never rewrite its history.
- Files that actually ship to the browser: `index.html`, `app.js`, `styles.css`, `storage.js`, `sync.js`, `sw.js`, `manifest.json`, `vendor/*`, `assets/*`. Everything else (the source `.js` files, docs, `.claude/`) only matters for development.

### CRITICAL BUILD RULES — follow exactly

The ONLY app JavaScript that runs in the browser is `app.js`. The source files do nothing at runtime; they are concatenated into `app.js`. After editing ANY source file, rebuild:

```
cat app_core.js mobile.js ui.js entryform.js wizard.js quickadd.js home.js calendar.js overview.js spending.js wallet.js creditcards.js allbills.js settings.js > app.js
echo "" >> app.js
echo "ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));" >> app.js
node --check app.js
```

- Commit `app.js` together with the sources; they must always match (rebuild and `git diff --quiet` should be clean).
- `storage.js` and `sync.js` load as separate script tags in `index.html` (before `app.js`) and define globals `window.api` and `Sync`. NEVER concatenate them into `app.js`.
- `sw.js` is the service worker (offline app-shell cache, network-first). It is standalone: never concatenated, never a script tag — `app_core.js` registers it as `sw.js?v=WEB_VERSION`, so bumping `WEB_VERSION` is what rolls the offline cache. Any new file the shell needs at runtime must be added to the `SHELL` list in `sw.js`.
- `index.html` loads only: vendor React, `storage.js`, `sync.js`, `app.js` — in that order. Vercel analytics is injected dynamically and ONLY on `*.vercel.app` hostnames, from the platform's own `/_vercel/insights/script.js`. The repo has no dependencies, no `package.json` and no build step — do not add one.
- After building, check for duplicate top-level definitions: `grep "^function \|^const " app.js | sed 's/(.*//' | sort | uniq -d` (must output nothing). Everything shares one global scope.
- `node --check` does NOT catch use-before-declaration (temporal dead zone). A `const` used by a `useMemo` above its declaration = black-screen crash at runtime. This has happened. Inside components, declare values ABOVE their first use.
- After any CSS edit verify brace balance: count of `{` must equal `}`. Bulk string-replace on `styles.css` has corrupted it before; prefer small targeted edits.
- Bump `WEB_VERSION` in `app_core.js` on every shipped change.

### Verifying a change

- **Money math tests:** `node .claude/skills/verify/wallet.test.js` — plain Node, no dependencies, runs against the built `app.js` in a VM with the clock frozen at 2026-09-25 14:00. Run it after touching wallet, advance, paid/covered, next-paycheck, payment-plan or reset code, and add a case when a rule changes. Currently 25 tests, all passing.
- **On-screen checks:** the recipe (static server + Playwright at iPhone size + IndexedDB seed) is in `.claude/skills/verify/SKILL.md`. Check 375, 390 and 430 widths, dark and light, and the desktop sidebar. Browser tests use the real clock, so never hard-code today's date in assertions.
- **Class check:** after UI changes, every `className` used in JS must exist in `styles.css`, and CSS for removed classes must be deleted.

### Code style — hard rules from the owner

- NO comments, labels, or explanatory notes anywhere in the code. None.
- No dead code. If a function, class, constant or asset loses its last user, delete it AND its CSS.
- Buttons and inputs must have visible borders (1px `var(--border-secondary)`); `--border-tertiary` is the hairline separator colour and is nearly invisible on dark backgrounds — never use it for interactive controls. Rows inside a grouped list (`.entry-list`, `.switch-list`, `.action-list`) are the exception: the group is the affordance.
- Avoid an "AI look": no cramped rows of mixed controls, no boxed buttons floating right of text. Prefer full-width tappable rows (title + subtext + chevron), suggestion chips, clean 2-col grids with small uppercase labels.
- Plain-static React: no JSX, `React.createElement` is aliased to `h`; hooks (`useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`) are globals from `app_core.js`.

## 3. The app, screen by screen

Mobile shell: translucent header (Sync button with "last synced" on the left, the page title or the Overview switch in the middle, Settings gear on the right) and a bottom tab bar **Home · Overview · [＋] · Wallet · Bills**. The Wallet tab is called **Spending** (without the Balance page) when wallet tracking is off. On desktop (>768px) the same pages sit behind a flat sidebar.

- **Home** (`home.js`, `HomePage`) — bill-first. A full-bleed gradient hero (`.home-wash`) with one number, "So far this month" (money that came in minus what was paid out). Then the **"Before your next paycheck"** card (`NextCheckCard`): what's due between now and the next paycheck, with the overdue ones included, a bar comparing that to the paycheck, and `‹ ›` to look at later pay periods. More than `OVERDUE_FOLD` overdue bills fold into one row. Then a collapsible **"Bills this month"** row with a paid/to-go bar. No charts on Home.
- **Overview** (`overview.js` + `calendar.js`) — one tab, two views switched by `OverviewSwitch` (it replaces the mobile header title): **Calendar** (month dot-grid with daily totals and spanning range bars, or Agenda; tapping a day opens `DayDetailModal`) and **Statistics** (`CashFlowChart` with drag-to-scrub and an In/Out/Left legend, `CategoryDonut`, `GlanceGrid` tiles).
- **＋ Add window** (`quickadd.js`, `QuickAddModal`) — Purchase · Bill · Subscription · Income · Advance. Big autofocused amount, category chips, optional name (falls back to the category), Today/Yesterday/Other day, then switches for extras ("Already paid for", "The amount varies", "It stops on a date" / "It ends after the last payment", "It spans several days"). The Save button is disabled until there's an amount and says why ("Enter an amount") — never fail silently, that was a real bug. No `<select>` in this window.
- **Wallet** (`spending.js` `SpendingPage` + `wallet.js`) — a four-page swipe pager (§6.6): **Balance** (available now, how it adds up, what changed, past balance updates, advances) · **Budget** (left to spend this month, how the month adds up, budgets) · **Spending** (Buy again chips, Where it went, purchases) · **Trends** (six-month chart, four stat tiles).
- **Bills** (`allbills.js`, `AllBillsPage`) — the only place work piles up. **Needs attention** (late bills first, then entries still using a price range), filter chips with monthly totals, then three groups that always show — Essentials, Subscriptions, Credit cards — each ending in an add row. The card group opens the **Credit cards** page (`creditcards.js`: balances, payments, APR interest, payoff projection), the only Bills sub-page. The tab badge counts the attention list.
- **Settings** (`settings.js`, the header gear) — tabs **General** (income sources, Wallet switches incl. negative balance and overdraft limit, appearance, money & bills), **Calendar colors**, **Advanced** (date format, density, export/import + weekly backup reminder, custom CSS, activity log, **Start fresh**: reset spending history / reset everything, about + version).
- **Sync** (header button → `SyncModal`) — link a data file where the browser allows it, otherwise export/load a JSON file. Newest data wins, with a warning before loading older data.
- **Onboarding** (`wizard.js`, `OnboardingWizard`) — welcome screen (with "I have a backup to import") → income → bills → subscriptions → credit cards. Bills and subscriptions start empty with tap-to-add suggestion chips. On the last step, if today is after the 1st, a default-on switch marks this month's already-passed bills as paid so nothing shows falsely late on day one. No wallet step: the Wallet tab asks for the first balance the first time it is opened. Onboarding is the one screen still on the pre-5.0 design (see §10).

## 4. Code map

Source files, in concatenation order. Several shared pieces live in files you might not expect — check here before adding something that may already exist.

| File | What's in it |
|---|---|
| `app_core.js` | `WEB_VERSION`, hooks aliases, `haptic`, `useOverlayDismiss`, formatting (`fmtCurrency`, `fmtRange`, `formatDate`, `ymd`/`parseYmd`/`todayYmd`), recurrence (`expandEntry`, `expandAll`, `nextDueDate`, `scheduleLabel`, `repeatLabel`, `monthlyAmount`), paid/late/covered/deferred state (`isPaid`, `togglePaidStatus`, `setCovered`, `setDeferred`, `lateState`, `getLateBills`, `getNeedsAttention`, `getAttentionItems`), entry lookups (`getAllBillLikeEntries`, `buildEntryLookup`, `buildSourceListLookup`, `purchaseEntries`), credit-card math, `averagePaycheck`, `logActivity` (keeps 50), the `App` component (routing, theme, prompts, sync banner), `BackupReminderModal`, `getBlankData`, `Icon` |
| `mobile.js` | `useIsMobile` (≤768px), tab bar, header, `MOBILE_SUBPAGES`, `useSheetDismiss` (swipe-down) |
| `ui.js` | Shared UI kit: `Sheet`, `CloseX`, `Field`, `AmountField`, `PickChips`, `ChipScroller`, `DateField`, `DateChips`, `FreqChips`, `SettingSwitch`, `ActionRow`, `DeleteRow`, `SectionHead`, `Pager` |
| `entryform.js` | `EntryRow` (the standard list row), `EntryFormModal` (add/edit bill, subscription, income), payment plans (`PAYMENT_PLAN`, `planEnd`, `planProgress`), `RepeatEndBlock`, `entryToFormShape`, `getEditModalConfig`, `applyEditedEntry` |
| `wizard.js` | **Category lists** (`MAJOR_CATEGORIES`, `MINOR_CATEGORIES`, `ONE_TIME_PAYMENT_CATEGORIES`, `ONE_TIME_INCOME_CATEGORIES`), suggestion presets, `blankEntry`, `OnboardingWizard` |
| `quickadd.js` | `QuickAddModal`, `TypeList`, `categoriesByUse` |
| `home.js` | `HomePage`, `NextCheckCard`, checklists, **also** `ChipToggle`, `CashFlowChart`, `CategoryDonut`, `GlanceGrid`, `PriceOverrideModal` (router) and `OccurrenceHub` |
| `calendar.js` | `CalendarPage`, `DayDetailModal`, **also** `MONTH_NAMES`, `fmtCompact` |
| `overview.js` | `useMonthFinancials`, `useNextCheck`, `MonthHeader`, `OverviewSwitch`, `OverviewPage`, `StatisticsPage`, `SOURCE_GROUP_LABELS` |
| `spending.js` | `SpendingPage` (the pager and its four pages), budgets, `categoryTotals`, `spendingHistory`, `repeatBuys` |
| `wallet.js` | Wallet math (`walletMoves`, `walletSummary`, `walletFloor`, `balanceUpdateDue`, `recordBalance`, `resetSpendingHistory`), `BalanceSheet`, `WalletCard`, `WalletActivity`, advances (math, `AdvancesSection`, `AdvanceFields`, `AdvanceSheet`) |
| `creditcards.js` | `CreditCardsPage`, `CreditCardSheet`, `ProjectionModal` |
| `allbills.js` | `AllBillsPage`, attention list |
| `settings.js` | `SettingsPage` and its tabs, `SyncCard`, `SyncModal`, `relativeTime` |

Runtime-only files: `storage.js` (IndexedDB load/save, defaults via `getDefaultData`, export/import), `sync.js` (linked-file sync, JSON download fallback, file picker), `sw.js`, `index.html` (also holds the keyboard/viewport script, §9), `manifest.json`, `vendor/` (React 18.3.1 UMD production builds), `assets/` (icons).

## 5. Design system

- iOS-native look. Colours are tokens on `:root` / `[data-theme]` in `styles.css`: `--bg-page` (black in dark, `#f2f2f7` in light), `--bg-primary` cards, `--bg-sheet` / `--bg-cell` for sheets. Components never hard-code a surface — they use `--surface` (card or cell) and `--surface-2` (fill inside it). `.modal-content` re-points both to the sheet cell colours, so the same component looks right on a page and inside a sheet. The Wallet card is deliberately a dark gradient in both themes (its text colours are fixed, not tokens).
- Amounts use `font-variant-numeric: tabular-nums`. Section headings are `SectionHead` (`.stats-title` 20px + `.stats-caption` + optional `right` node such as a `ChipToggle` or `.section-total`).
- Grouped lists: `.entry-list` (rows are `EntryRow`), `.switch-list` (rows are `SettingSwitch`), `.action-list` (rows are `ActionRow`), `.calc-list` (`.calc-row` label/amount lines with an optional `.total` or `.note`). Separators are inset hairlines. Inside a `.card` these groups go flush (no nested box).
- Mobile: `button { min-height: 44px }`. Any new small button-like element must be added to the exemption list (`min-height: 0`) at the bottom of the mobile media query or it balloons.
- **Every dialog and form is a `Sheet`** (`ui.js`) — never hand-roll `.modal-overlay` markup. `Sheet({ title, sub, head, onClose, foot, tall, className })`: overlay dismissed through `useOverlayDismiss`, a head (title/sub or a custom `head` node, plus `CloseX`), a scrolling `.sheet-body`, an optional sticky `.sheet-foot` with full-width `.sheet-actions` buttons. On mobile it is a bottom sheet with a grabber and swipe-down-to-dismiss; `tall` pins it to full height for forms so it doesn't jump as fields reveal. On desktop it is a centred window. Sheets can nest.
- **Forms:** `Field({ label, hint })` = `.setup-field` (small uppercase label + full-width 46px input) inside `.setup-entry-grid` (2-col, `.single` for one). `AmountField` is the big bordered amount (`negative` shows `−$`). `ChipScroller` is one horizontal row of category chips (`reveal` scrolls the selected one into view). `DateField` / `DateChips` show a formatted date over an invisible real `<input type="date">` so iOS still opens its native picker. `.setup-field` label/input selectors are direct-child scoped (`>`) — keep them that way; `DateField` is a `div` for that reason. `.setup-hint` is the small grey explainer (`.warn` for red).
- **Choices:** multi-option switches use `ChipToggle` (`wide` for a full-width segmented control) — never a `<select>` inside a sheet (the only `<select>`s left are Settings → Currency, which is on a page, and onboarding). Booleans use `SettingSwitch` inside a `.switch-list`.
- **Lists of recurring things** use `EntryRow`: colour swatch + name + subtext + amount + chevron. Without `onClick` it is a static row. Subtext comes from `scheduleLabel(entry, data)`, which shows the **next** due date via `nextDueDate` — never the anchor/start date. Mixed frequencies convert through `monthlyAmount`. Ranges render with `fmtRange` (`$80–$140`).
- **Deleting never happens in one tap.** No `×` buttons on rows (onboarding still has them, §10): delete is a `DeleteRow` at the bottom of the edit sheet that asks "Tap again…" first. Same pattern for the resets in Settings.
- **Month navigation** everywhere is `MonthHeader` (`overview.js`): round chevrons plus a "Today" pill when off the current month.
- Haptics: `haptic('light|medium|success|warn|heavy')`, respects `settings.hapticsEnabled`. iOS Safari does not support web vibration — that's expected, don't "fix" it.

## 6. How the money works (rules that must stay right)

### 6.1 Data model

All state is one JSON object persisted through `window.api` (IndexedDB database `finance-calendar`, store `kv`, key `finance-data`). `persist(next, opts)` in `App` stamps `lastModified`. `storage.js` merges loaded data with `getDefaultData()`, **but data loaded through Sync is raw**, so always guard newer keys: `(data.advances || [])`, `(data.wallet || {})`, `(data.paidAt || {})`, `(data.budgets || {})`. Keep `getDefaultData` (`storage.js`) and `getBlankData` (`app_core.js`) in step when adding keys.

- Entries: `incomeSources`, `majorBills` (Essentials), `subscriptions`, `oneTimeEntries` (`oneTimeKind: 'payment'` = purchase, `'income'` = one-time income), `creditCards`, `advances`. Recurring entries have `{ id, name, amount, amountMin, amountMax, useAmountRange, date, dateEnd, useDateRange, freq, repeatUntil, useAvgEstimate, category, color }`.
- Per-occurrence maps, all keyed `"entryId|YYYY-MM-DD"`: `paidHistory`, `paidAt` (timestamp it was marked paid), `overrides` (actual price), `covered` + `coverLog` (part payments), `deferred` (moved to a later paycheck), `forcedLate`, `dismissedLate`, `removedOccurrences`.
- `budgets = { [category]: monthlyAmount }`, `wallet = { checks: [...], snoozed }`, `activityLog` (50 newest), `settings` (theme, accent, currency, grace/lookahead days, wallet switches, section colours, `installDate`, …).
- `settings.installDate` bounds how far back bills can count as late. Data without it looks back to the year 2000 and floods the late list — the wizard sets it; keep it when building seeds.

### 6.2 Paid, late, part-paid

- `togglePaidStatus` writes `paidHistory` + `paidAt` (cleared on unmark, force-late or delete). It deletes `covered` but leaves `coverLog`, so the wallet can tell a part payment made before a balance update from one after it.
- `lateState(data, occ)` is the one place late/paid/dismissed is decided — use it, never re-derive it inline.
- **A logged purchase is money already spent.** `QuickAddModal` marks purchases dated today or earlier as paid on save (with `paidAt`), `oneTimeOccurrence` stamps `isOneTime`, and `getLateBills` / `getNeedsAttention` / `lateState` never treat a one-time payment as late. Don't reintroduce that — it filled the attention list with things already paid for.
- `getAttentionItems` merges `getLateBills` + `getNeedsAttention` (late first, then price-needed). `App` memoizes it as `attention`; its length is the Bills badge.
- `PriceOverrideModal` routes a tapped occurrence: advances → `AdvanceSheet`, one-time entries → `QuickAddModal` (edit mode), everything else → `OccurrenceHub` (actual price, pay from the next paycheck / pay part now when opened from the Home card, mark paid, a three-state late row, "Edit <name>", remove this date).

### 6.3 Month and pay-period math

- `useMonthFinancials(data, cursor)` (`overview.js`) is the only month math; Home, Statistics and the Wallet consume it. Advance inflows count as money in; advance paybacks are bill-like entries so they count as money out.
- `useNextCheck(data, period)` builds a pay-period window. A paycheck landing today counts as already received, so paychecks are collected from tomorrow forward. Period 0 runs today → next paycheck and includes overdue bills; period n runs (paycheck n-1, paycheck n]. Auto-repaid advances are netted out of the paycheck (`takes`) instead of listed as bills. `HomePage` owns `period`.
- **Paycheck averaging:** `entry.useAvgEstimate` (income with an amount range only). `averagePaycheck` averages past paychecks that have a recorded amount; with two or more, `expandAll` swaps the estimate into every future occurrence (`isEstimate`, shown `≈$1,140`), so every screen moves together.
- **Recurrence end:** `entry.repeatUntil` (`''` = forever) caps `expandEntry`. Not to be confused with `useDateRange`/`dateEnd`, which is one bill spanning several days on the calendar.
- **Payment plans:** `PAYMENT_PLAN = 'Payment plan'` is a subscription category. Picking it turns on the end date with a default count (4 for weekly/biweekly, 6 otherwise). An auto count follows frequency changes (`{ auto: true }`), a tapped count sticks (`{ count }`), typing a date clears it. `planProgress` → "Next Oct 14 · 4 of 7 payments left" / "Paid off".

### 6.4 Wallet balance

- `settings.walletEnabled` (default on, read via `walletOn`) turns the Spending tab into the Wallet tab.
- `data.wallet.checks` = balance updates `{ id, at, date, amount, expected }`, newest first, capped at `BALANCE_HISTORY` (24). **The balance is derived, never stored:** `walletSummary(data)` = last update (`lastBalance`) + `walletMoves(data, update)`. Rules in `walletMoves` (tested — keep `wallet.test.js` in sync):
  - recurring paychecks and auto advance paybacks count when dated after the update date and not in the future;
  - purchases count by their own date: after the update date, or on it only when `paidAt` is later than the update;
  - one-time income and advance inflows the same way, using `loggedAt` / `createdAt`;
  - bills, subscriptions, card payments and manual advance paybacks count when `paidAt` is later than the update, whatever their due date, minus any `coverLog` part payment made before it; unpaid part payments count by `coverLog.at`.
- `recordBalance` saves what the app expected alongside the real figure so "Past balance updates" can show how close it was.
- **The balance question only appears on the Wallet tab.** `balanceUpdateDue` (enabled + `walletMonthlyCheck` + no update this calendar month + not snoozed today) is read by `SpendingPage` when it mounts; it opens `BalanceSheet` with `prompted` and jumps the pager to Balance. "Not now" snoozes for the day. Never prompt on load, on Home, from Settings or in onboarding.
- The card's "after bills" sentence = balance − `useNextCheck(data, 0).due`.
- **Negative balances:** `settings.walletNegative` + `settings.walletOverdraftLimit` (0 = no set limit). `walletFloor(data)` is the one place the lowest allowed balance is decided: `0` when off, `-limit` with a limit, `-Infinity` with none. The iPhone decimal keypad has no minus key, so `BalanceSheet` shows an "Above zero / Below zero" toggle when the floor is below 0; entries below the floor disable Save with the reason. `WalletCard` words an overdrawn balance against the floor, and its bills line has three tones: fine, `.warn` (inside the overdraft), `.short` (past it).
- `resetSpendingHistory(data)` (Settings → Advanced → Start fresh) removes every purchase and its keys in every per-occurrence map and clears `data.wallet`, so the Wallet asks for a fresh balance. Bills, income, one-time income, budgets and advances stay.

### 6.5 Advances

`data.advances = [{ id, name, amount, date, createdAt, repayFromCheck, repayDate, feeType: 'none'|'flat'|'rate', fee, rate, rateBasis: 'once'|'apr' }]`. `advanceRepayDate` is the first paycheck strictly after the advance date when `repayFromCheck` (falls back to the stored `repayDate`), otherwise the chosen date. `advanceCost`: flat fee, rate × amount once, or APR prorated by days until payback. `getAdvanceEntries` synthesizes one bill-like entry per advance (id `adv-<id>`, "<name> payback", `autoRepay`) that is part of `getAllBillLikeEntries`, `buildEntryLookup` and `buildSourceListLookup` (`sourceList: 'advances'`). `isPaid` treats an auto payback as paid once its date arrives, so it is never late; manual paybacks can go late and are marked paid back in `AdvanceSheet`. Checklists show an "Auto" mark instead of a checkbox for `autoRepay` rows. Advances are logged from the Add window or the "+ Log an advance" row on Wallet → Balance, and listed by `AdvancesSection`.

### 6.6 The Wallet pager

`SpendingPage` renders `Pager` (`ui.js`): a full-width `ChipToggle` of page names over a horizontal scroll-snap strip (`.pager` / `.pager-page`), one page per screen, each page scrolling on its own. Tap or swipe both work; the index lives in `App` (`walletPage`) so it survives tab switches. `.app-shell > .main-content:has(.spend-page)` turns off the outer scroll and padding for this tab. All four pages are in the DOM at once.

- **Balance** (wallet on only): `WalletCard`, `WalletActivity`, `AdvancesSection`.
- **Budget:** `MonthHeader`, hero = **left to spend** (projected income − recurring bills − logged purchases) with a per-day figure and a pace marker, "How this month adds up", budgets (`BudgetModal`, day-to-day categories only). Advances show here when the wallet is off.
- **Spending:** `MonthHeader`, "Buy again" (`repeatBuys` chips that pass a `preset` into `QuickAddModal`, current month only), "Where it went" (tap a category to filter), the month's purchases.
- **Trends:** `MonthHeader`, six-month bars, four stat tiles.

Categories: `MAJOR_CATEGORIES` (bills) and `MINOR_CATEGORIES` (subscriptions, incl. Payment plan) are recurring-bill shaped; `ONE_TIME_PAYMENT_CATEGORIES` is day-to-day spending — keep bill-shaped names out of it. `categoriesByUse` floats the ones actually bought to the front.

## 7. Things that live in exactly one place

Don't re-add duplicates; the owner asked for them to be removed.

- Sync → the header/sidebar button (`SyncModal`), not Settings.
- The month's in/out forecast → Wallet → Budget, not Home or Statistics.
- Upcoming bills → Home's next-paycheck card and the calendar, not Statistics.
- Balance updates → the Wallet tab, not Settings or onboarding.
- Adding bills/subscriptions → the Add window and the Bills tab add rows (there are no separate Essentials/Subscriptions pages).
- Credit card totals → the Credit cards page caption, no summary tiles.

## 8. Storage, backup and sync

- Data lives only in this browser on this device. If Safari's site data is cleared, it is gone; the backup file is the only safety net. Safari can also clear data for sites **not** added to the Home Screen after a stretch of not being used, so the owner should always use the Home Screen app.
- Settings → Advanced → Export data downloads a `.json` backup; Import a file replaces everything after a warning. A reminder to back up appears on Mondays (next app open), unless turned off.
- `sync.js`: on browsers with the File System Access API (desktop Chrome/Edge) you link a file once and Sync writes to it; elsewhere, including iPhone, Sync currently falls back to a plain JSON **download** (`<a download>`), not the share sheet — see to-do 1. Loading picks a file. Newest `lastModified` wins, with a warning before loading older data.
- File inputs MUST be attached to the DOM (`document.body.appendChild`) or iOS never fires `change`. No focus-based cancel timeouts — iOS loses the race. Both are handled in `storage.js` and `sync.js`; keep it that way.

## 9. iOS hard limits (do not fight these)

- No background tasks, no notifications, no silent filesystem writes, no auto-folder creation from a web app. Anything "scheduled" (the monthly balance question, the Monday backup reminder) happens on the next open — for the balance question, the next time the Wallet tab is opened.
- iOS opens a **wheel picker** for `<select>` and `<input type="date">`, which shrinks `visualViewport` exactly like a keyboard does. The script in `index.html` must only treat that shrink as the keyboard (`--kb`, and scroll a field into view) when the focused element is a real typing field — `isTypingField()`. Counting the picker as a keyboard re-lays-out the sheet mid-tap, so the next tap lands on whatever moved under the finger. This caused a real "can't change the category, it hits the buttons below or closes the window" bug; don't undo it. It also sets `--sheet-safe` to 0 while the keyboard is up so sheet feet don't keep the home-indicator padding above the keyboard.
- Overlay taps go through `useOverlayDismiss(onClose)`, which only closes when the pointer went **down and up** on the overlay itself. Never dismiss on a bare `onClick` target check — a dismissed picker fires a click that closes the sheet. Only call it from a component that is actually showing an overlay (it locks page scroll while mounted) — `Sheet` does this for you.
- The iPhone decimal keypad has no minus key; any field that can be negative needs a sign toggle (see §6.4).
- apple-touch-icon must be PNG (`assets/icon-180.png`), regenerated from `assets/icon.svg`.

## 10. To-do list

Ordered by priority. Remove an item when it's done and add new ones as you find them.

1. **Make iPhone export use the share sheet.** `sync.js` `writeOut` and `storage.js` `exportData` create an `<a download>` link, but the Sync copy promises the share sheet ("Save to Files, LocalSend…"). Use `navigator.share({ files: [new File([json], name, { type: 'application/json' })] })` when `navigator.canShare` allows it, falling back to the download. Test on the real iPhone. The backup file is the only safety net for the owner's data.
2. **Don't show setup when storage fails to load.** `storage.js` `loadData` catches any IndexedDB error and returns empty defaults, so a failed read shows the onboarding wizard, and finishing it could save over the real data. Return the error instead so `App` shows its "Couldn't load" screen.
3. **Ask the browser to keep the data.** Call `navigator.storage.persist()` once after onboarding (where supported) so the browser is less likely to evict it.
4. **Bring onboarding up to the 5.0 design.** `wizard.js` `EntryCard` / `CreditCardEntryList` still use `<select>`s, "Amount range · Date range · Repeats forever" text links and one-tap `×` remove buttons. Rebuild the cards with `ChipToggle`, `ChipScroller`, `DateField`, `SettingSwitch` and a two-tap delete, like `EntryFormModal`.
5. **Turn "Buy again" into a prediction** (owner's roadmap). `repeatBuys` already knows the average gap between purchases; say what is probably due to be bought again ("Groceries — usually every 6 days, last bought 7 days ago") rather than only offering a re-log chip.
6. **Fix the Home hero label for other months.** It reads "August so far" for a finished month and "October so far" for a future one. Use "All of August" for past months and hide or reword it for future months.
7. **Commit the on-screen test scripts.** The Playwright click-through scripts (seed data, tour, add/advance/plan/balance flows, pager, balance prompt, overdraft, onboarding, desktop) have only lived in session scratch space. Add them under `.claude/skills/verify/` (loading `playwright-core` from an environment-provided path, no `package.json`) and document them in `SKILL.md`, with dates relative to today.
8. **Small tidy-ups.** Delete the unused `assets/logo.svg` (only listed in `sw.js` `SHELL`). Refresh the `manifest.json` description to mention the wallet. Make the `index.html` load-failure message friendlier for a phone user (it currently talks about `npx serve`).
9. **Desktop layout pass** — deliberately deferred until the owner says mobile is finished.

## 11. History

- **5.0** — wallet tracking, advances, payment plans, and the iOS-style redesign (Sheets, new Add window, new design tokens).
- **5.1** — "check" → "paycheck" everywhere and a plain-language pass; balance question moved to the Wallet tab only; Wallet became a four-page swipe pager; "Reset spending history"; removed the duplicated Essentials/Subscriptions pages, Home "Projected", Statistics summary and "Coming up", the Settings Sync card, the onboarding wallet step and the credit-card tiles.
- **5.2** — negative balances with an optional overdraft limit.
