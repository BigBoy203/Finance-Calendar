# Finance Calendar

A personal bill, income, and cash-flow tracker that runs entirely in the
browser. No account, no server, no build step - a set of static files you can
open or host anywhere. Phone-first: the layout is designed around an iPhone
and expands to a sidebar on wider screens.

## How it stores data

Your data lives inside the browser itself, in a browser database called
IndexedDB. Nothing is sent anywhere, and no login is required.

The tradeoff: that data is tied to one browser on one device. It won't appear
in a different browser, in a private window, or on another machine, and it can
be lost if that browser's site data is cleared.

Because of that there are a few safety nets:

- **Settings -> Advanced -> Data portability**: "Export data (.json)" saves a
  backup you can keep anywhere; "Import from .json file" restores one (after a
  clear warning, since importing replaces everything currently saved). This is
  also how you move data between browsers or devices.
- **Sync** (sidebar / header button): keeps a device in step with a single
  data file. Where the File System Access API exists you link a file once and
  Sync writes to it; elsewhere it exports through the share sheet. Newest data
  always wins.
- **A Monday reminder** to download a backup, which can be turned off in the
  same Settings section.

Importing is offered as the very first onboarding step, so a backup can be
restored before anything is entered by hand.

## Getting around

- **Home** - a gradient hero with how the month is going so far, the "Before
  your next paycheck" card (what's due before the next paycheck, with
  pay-period arrows), and a collapsible "Bills this month" list.
- **Overview** - two views behind one switch: **Calendar** (month grid or
  agenda) and **Statistics** (cash flow, category donut, at a glance).
- **+** - the add window: Purchase, Bill, Subscription (including payment
  plans, which end after a set number of payments), Income, or Advance.
- **Wallet** - swipe (or tap the names at the top) between four pages:
  - **Balance** - how much money you actually have. You tell it your balance;
    paychecks add to it and the bills you mark paid and purchases you log take
    from it. The first time you open the Wallet tab each month it asks for your
    balance again and shows how close its math was. Advances (EarnIn, Dave,
    work, family...) live here too, with an optional flat fee, rate, or APR,
    and can be paid back automatically from your next paycheck.
  - **Budget** - what's left to spend this month, how that adds up, and your
    budgets.
  - **Spending** - "Buy again" shortcuts, "Where it went", and this month's
    purchases.
  - **Trends** - a six-month chart and a few numbers for the month.
  Turn wallet tracking off in Settings and the tab becomes **Spending** without
  the Balance page. Settings → Advanced can reset your spending history
  (purchases and balance updates) without touching bills or income.
- **Bills** - "Needs attention" at the top (anything past due or still using a
  price range), then your Essentials, Subscriptions, and Credit cards, each
  with its own "Add" row.
- **Settings** - the gear in the header (a sidebar item on desktop).

The layout switches at 768px via a media query rather than user-agent
sniffing, so it also reacts to rotation, split screen, and a narrowed desktop
window. Saved to a home screen it runs without browser chrome, offline, and
accounts for notches and home indicators.

## Running it

Static files - nothing to install.

**Option A - just open it.** Double-click `index.html`. Some browsers restrict
IndexedDB on `file://` pages, so if data doesn't seem to save, use Option B.

**Option B - serve it locally.** From a terminal in this folder:

```
npx serve .
```

or, with Python:

```
python3 -m http.server 8000
```

then open the address it prints.

**Hosting it:** drop the whole folder onto any static host (Vercel, GitHub
Pages, Netlify, plain Apache/Nginx), including `assets/` and `vendor/`.

## Files

- `index.html`, `app.js`, `styles.css` - the app
- `storage.js` - the IndexedDB layer plus export/import
- `sync.js` - file-based sync and the share-sheet fallback
- `sw.js` - service worker (offline app-shell cache)
- `vendor/` - React
- `assets/` - icons and logo

`app.js` is generated. The individual source files do nothing at runtime;
they're concatenated in a fixed order. After editing any of them, rebuild:

```
cat app_core.js mobile.js ui.js entryform.js wizard.js quickadd.js home.js \
    calendar.js overview.js spending.js wallet.js \
    creditcards.js allbills.js settings.js > app.js
echo "" >> app.js
echo "ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));" >> app.js
```

`storage.js` and `sync.js` load as their own script tags and must never be
concatenated into `app.js`. `mobile.js` sits second, right after
`app_core.js`, followed by `ui.js` (the shared sheet and form pieces).

The wallet and advance math has a dependency-free test suite:
`node .claude/skills/verify/wallet.test.js` (run it after rebuilding).
