---
name: verify
description: Build, launch, and drive the Finance Calendar web app headlessly to verify UI changes at an iPhone-sized viewport.
---

# Verify Finance Calendar

Static site, no build server. Rebuild `app.js` first (concat command in CLAUDE.md), then:

1. Serve the repo root: `python3 -m http.server 8123 --bind 127.0.0.1 &`
2. Drive with `playwright-core` (npm install it in the scratchpad; browser at `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` or `/opt/pw-browsers/chromium`). Context: `viewport 390x844, deviceScaleFactor 2, isMobile, hasTouch, colorScheme 'dark'`.
3. Storage is IndexedDB: db `finance-calendar`, object store `kv`, key `finance-data`. Fresh loads land on the onboarding wizard — to skip it, `page.evaluate` a seed write with `onboardingComplete: true` plus any entries needed, then `page.reload()`. Minimal seed shape: all top-level arrays/objects from `getDefaultData()` in `storage.js` (missing settings keys are merged in).
4. Navigation: bottom tab bar texts `Home / Calendar / Late / Expenses`; the raised ＋ is `.mobile-tab-add`. List items open edit modals on click.
5. Attach `pageerror`/console-error listeners — a TDZ mistake in the concat order is a silent black screen.

Gotchas: `/_vercel/insights/script.js` 404s locally — expected, ignore. Kill the server by port match when done.
