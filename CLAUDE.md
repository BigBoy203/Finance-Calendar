# Finance Calendar — web build

Personal bill / income / cash-flow tracker being grown into a full expense tracker. Plain-static React (no bundler, no JSX, `React.createElement` via `h`), deployed to Vercel at finance-calendar-web.vercel.app by pushing to this GitHub repo. Owner tests on a real iPhone in Safari and sends screenshots; mobile is the primary experience.

## CRITICAL BUILD RULES — follow exactly

The ONLY JS file that runs in the browser is `app.js`. The individual source files do nothing at runtime; they are concatenated into `app.js`. After editing ANY source file, rebuild:

```
cat app_core.js mobile.js entryform.js wizard.js quickadd.js home.js late.js calendar.js bills.js subscriptions.js creditcards.js allbills.js settings.js > app.js
echo "" >> app.js
echo "ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));" >> app.js
node --check app.js
```

- `storage.js` and `sync.js` load as separate script tags in `index.html` (before `app.js`) and define globals `window.api` and `Sync`. NEVER concatenate them into `app.js`.
- `sw.js` is the service worker (offline app-shell cache, network-first). It is standalone: never concatenated, never a script tag — `app_core.js` registers it as `sw.js?v=WEB_VERSION`, so bumping `WEB_VERSION` is what rolls the offline cache. Any new file the shell needs at runtime must be added to the `SHELL` list in `sw.js`.
- `index.html` loads only: vendor react, storage.js, sync.js, app.js — in that order. Vercel analytics is injected dynamically and ONLY on `*.vercel.app` hostnames — keep it out of packaged/native builds.
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

- All state lives in one JSON object persisted through `window.api` (localStorage on web, Electron file storage on desktop). `persist(next, opts)` stamps `lastModified`.
- Paid state: `data.paidHistory["entryId|YYYY-MM-DD"] = true`. Per-occurrence overrides in `data.overrides` keyed the same way.
- Mobile detection: `useIsMobile()` (matchMedia ≤768px). Mobile UI: fixed shell, bottom tab bar Home · Calendar · [＋ raised circle] · Late · Expenses; Settings is the gear in the header; Sync button top-left with "last synced" label under it.
- Modal rule: big forms and dialogs = centered window (`.modal-overlay.as-window` + `.modal-content.as-window` + `.modal-window-head` + `.modal-x`). Only the calendar day-detail stays a slide-up sheet.
- Form field system (wizard, edit modals, quick-add all share it): `.setup-field` (small uppercase label + full-width 40px input) inside `.setup-entry-grid` (2-col), inline `.setup-link` toggles joined by `.setup-link-dot` ("Amount range · Date range"). Do NOT use the old pattern of stacked full-width fields with underlined `.toggle-link` buttons in forms — on mobile those balloon to 40px rows and wreck spacing (`.toggle-link` survives only for the allbills info banner). `.setup-field` label/input selectors are direct-child scoped (`>`) so nested checkbox/color rows keep normal styling — keep them that way.
- Mobile calendar: `.calm-*` classes; dot grid + compact daily totals, Month/Agenda toggle, spanning range pills in a reserved lane below each week (lane-stacked when ranges overlap). IMPORTANT: mobile has `button { min-height: 40px }` — any new small button-like element must be added to the exemption list (`min-height: 0`) or it balloons.
- Onboarding (`wizard.js`): welcome screen → income → bills → subscriptions → credit cards. Bills/subs start EMPTY with tap-to-add suggestion chips. Mid-month rule: on the final step (if today > 1st) a default-on toggle marks already-passed bills this month as paid so nothing shows falsely late on day one.
- Add window (`quickadd.js`): icon tiles Purchase (default) / Bill / Subscription / Income.
- Haptics: `haptic('light|medium|success|warn|heavy')` helper; respects `settings.hapticsEnabled`. iOS Safari does not support web vibration — that's expected, don't "fix" it.

## iOS hard limits (do not fight these)

- No background tasks, no silent filesystem writes, no auto-folder creation from a web app. One-tap share-sheet export is the floor on iPhone.
- File inputs MUST be attached to the DOM (`document.body.appendChild`) or iOS never fires `change`. No focus-based cancel timeouts — iOS loses the race. Both are already handled in `storage.js` and `sync.js`; keep it that way.
- apple-touch-icon must be PNG (`assets/icon-180.png`), regenerated from `assets/icon.svg`.

## Deploy

Owner pushes with GitHub Desktop; Vercel auto-deploys. Typical shipped files per change: `app.js` and/or `styles.css`, occasionally `index.html`, `storage.js`, `sync.js`, `assets/*`. Tell the owner exactly which files changed after each task.

## Sibling project

`finance-tracker-v11` (separate folder/repo) is the Electron desktop app sharing this renderer code, plus desktop-only `trading.js`, `market.js`, trader-mode income, and `src/main.js` + `src/preload.js` (`window.api.isDesktop = true`). When told to port changes there: same concat plus `market.js trading.js` at the end, keep web-only bits gated behind `!window.api.isDesktop`.

## Roadmap (owner's stated priorities)

Next big update: spending insights / category breakdown for day-to-day expenses, plus a suggestion system based on purchase frequency. Later: keep desktop in sync. Always flag honest difficulty and scope concerns BEFORE building, not midway.
