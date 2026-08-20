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

- **Home** - a gradient hero with net-so-far, the "Before your next check"
  card (what's due before the next paycheck, with pay-period arrows), and a
  collapsible "Bills this month" list.
- **Overview** - two views behind one switch: **Calendar** (month grid or
  agenda) and **Statistics** (next 7 days, cash flow, category donut, at a
  glance, vs. last month).
- **+** - the add window: Purchase, Bill, Subscription, or Income.
- **Spending** - day-to-day money: what's left for daily life this month after
  bills and what you've already spent, two-tap re-logging of things you buy
  often, monthly budgets by category, "Where it went" (each category's share of
  the month against last month's, tap one to filter the list), this month's
  purchases, and a six-month trend.
- **Bills** - "Needs attention" at the top (anything past due or still using a
  price range), then recurring commitments grouped into Essentials,
  Subscriptions, and Credit cards.
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
cat app_core.js mobile.js entryform.js wizard.js quickadd.js home.js \
    calendar.js overview.js spending.js bills.js subscriptions.js \
    creditcards.js allbills.js settings.js > app.js
echo "" >> app.js
echo "ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));" >> app.js
```

`storage.js` and `sync.js` load as their own script tags and must never be
concatenated into `app.js`. `mobile.js` sits second, right after
`app_core.js`.
