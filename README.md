# Finance Calendar (web version)

This is the browser-based build of Finance Calendar, converted from desktop
version 7.2. It's the same app and the same features, with one difference in
how it stores data.

## How this version stores data

The desktop app saves a JSON file on your computer. This web version saves
your data inside the browser itself, using a browser database called
IndexedDB. Nothing is sent to a server - your data never leaves this device,
and no account or login is required.

The tradeoff: this data is tied to one specific browser on one specific
device. It won't appear if you open the app in a different browser, in a
private/incognito window, or on another machine. It can also be lost if you
(or the browser) clear that browser's site data.

Because of that, the app has a few safety nets:

- **Settings -> Advanced -> Data portability**: "Export data (.json)" saves a
  backup file you can keep anywhere; "Import from .json file" restores one
  (after a clear warning, since importing replaces everything currently
  saved). These also let you move data between browsers or devices, and to or
  from the desktop app - the file format is identical.
- **A Monday reminder** to download a backup, shown once on Mondays unless you
  turn it off in the same Settings section.
- **"Get desktop app"** at the bottom of the sidebar (and in the Monday
  reminder), which downloads the desktop build - it saves to a normal file on
  your computer instead of browser storage.

Importing during first-time setup is offered as the very first onboarding
step, so you can restore a backup before entering anything by hand.

## Running it

This is a set of static files - no server-side code, nothing to install.

**Option A - just open it.** Double-click `index.html`. Works in Chrome and
Edge. Some browsers restrict IndexedDB on `file://` pages, so if data doesn't
seem to save, use Option B.

**Option B - serve it locally (more reliable).** From a terminal in this
folder:

```
npx serve .
```

or, with Python:

```
python3 -m http.server 8000
```

then open the address it prints.

**Hosting it:** since it's all static files, you can drop this whole folder
onto any static host (GitHub Pages, Netlify, Vercel, plain Apache/Nginx).
Upload the entire folder together, including `assets/`, `vendor/`, and
`downloads/`.

## Files

- `index.html`, `app.js`, `styles.css` - the app
- `storage.js` - the IndexedDB storage layer and the browser versions of
  export/import; this is the only file that differs in substance from the
  desktop build's data handling
- `vendor/` - React
- `assets/` - icon and logo
- `downloads/FinanceCalendar.exe` - the desktop app offered for download from
  inside the web app (replace this with the current desktop build)

## Updating from a newer desktop version later

The renderer files here (`app_core.js`, `home.js`, `calendar.js`, etc.) are
copied straight from the desktop build's `renderer/` folder. To re-sync after
desktop changes, copy those files over, keep this `storage.js` and
`index.html`, re-check that any new data-model fields are reflected in
`storage.js`'s defaults, then rebuild `app.js` by concatenating the renderer
files in the same order the desktop build uses.
