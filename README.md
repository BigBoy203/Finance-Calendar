# Finance Calendar (web version)

This is a browser-based version of Finance Calendar. It's the same app as
the desktop version, with one important difference in how it stores data.

## How this version stores data

The desktop app saves a JSON file on your computer. This web version instead
saves your data inside the browser itself, using a browser database called
IndexedDB. Nothing is sent to a server - your data never leaves this device,
and no account or login is required.

The tradeoff: this data is tied to one specific browser, on one specific
device. It will not show up if you open the app in a different browser
(say, Firefox instead of Chrome), in a private/incognito window, or on a
different computer or phone. It can also be lost if you (or your browser)
ever clear that browser's site data.

Because of this, the app includes a couple of safety nets:

- **Settings → Advanced → Data & backups**: a "Download backup (.json)"
  button that saves your current data as a file you can keep anywhere (a
  cloud drive folder, a USB drive, email it to yourself, etc.). There's no
  "import" button yet - this is a snapshot for safekeeping, not a sync
  feature, but it means your data isn't trapped if something goes wrong.
- **A reminder every Monday** nudging you to download a backup, if you
  haven't already grabbed one that day. Turn this off anytime from the same
  Settings → Advanced section.
- **"Get desktop app" in the sidebar** (bottom-left) and inside the Monday
  reminder - downloads the real desktop app, which saves to a normal file on
  your computer instead of browser storage, if you'd rather not think about
  any of this.

## Running it

This is a set of static files - there's no server-side code and nothing to
install. Two ways to run it:

**Option A - just open it.** Double-click `index.html` to open it directly
in your browser. This works in Chrome and Edge. (Some browsers are stricter
about IndexedDB on `file://` pages, so if data doesn't seem to be saving,
use Option B instead.)

**Option B - serve it locally (more reliable).** From a terminal in this
folder:

```
npx serve .
```

or, if you have Python installed:

```
python3 -m http.server 8000
```

then open the address it prints (e.g. `http://localhost:8000`) in your
browser.

**Hosting it for real:** since this is just static files, you can drop this
entire folder onto any static web host (GitHub Pages, Netlify, Vercel, a
plain Apache/Nginx folder, etc.) and it will work the same way - just make
sure the whole folder (including `assets/`, `vendor/`, and `downloads/`)
gets uploaded together.

## Files

- `index.html`, `app.js`, `styles.css` - the app itself
- `storage.js` - the IndexedDB storage layer (this is the only file that
  differs from the desktop app's data-handling code; everything else is
  identical)
- `vendor/` - React
- `assets/` - icon and logo
- `downloads/FinanceCalendar.exe` - the desktop app, offered for download
  from inside the web app
