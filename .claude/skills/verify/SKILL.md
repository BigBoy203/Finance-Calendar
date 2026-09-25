---
name: verify
description: Build, launch, and drive the Finance Calendar web app headlessly to verify UI changes at an iPhone-sized viewport.
---

# Verify Finance Calendar

Static site, no build server. Rebuild `app.js` first (concat command in CLAUDE.md), then:

1. Money math: `node .claude/skills/verify/wallet.test.js`. Plain Node, no dependencies. It loads the built `app.js` in a VM with React stubbed (`useMemo(fn)` just calls `fn`, so hooks like `useNextCheck` / `useMonthFinancials` run directly) and the clock frozen at 2026-09-25 14:00 local. Add a case whenever wallet, advance, paid/covered, next-check or payment-plan rules change.
2. Serve the repo root: `python3 -m http.server 8123 --bind 127.0.0.1 &`
3. Drive with `playwright-core` (npm install it in the scratchpad; browser at `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` or `/opt/pw-browsers/chromium`). Context: `viewport 390x844, deviceScaleFactor 2, isMobile, hasTouch, colorScheme 'dark'`. Also check 375x812 (mini/SE) and 430x932 (Pro Max), and a light-mode pass (`settings.theme: 'light'`).
4. Storage is IndexedDB: db `finance-calendar`, object store `kv`, key `finance-data`. Fresh loads land on the onboarding wizard — to skip it, `page.evaluate` a seed write with `onboardingComplete: true` plus any entries needed, then `page.reload()`. Minimal seed shape: all top-level arrays/objects from `getDefaultData()` in `storage.js` (missing settings keys are merged in). A seed with no wallet check opens the "Monthly wallet check" sheet on load — include `wallet: { checks: [{ id, at, date, amount, expected: null }] }` dated this month to skip it, or close it with `.modal-x`.
5. Navigation: bottom tab bar texts `Home / Overview / Wallet / Bills` (`Spending` when `settings.walletEnabled` is false); the raised ＋ is `.mobile-tab-add`; on desktop the sidebar rows are `.sidebar-link`. List items open edit sheets on click. Every dialog is a `Sheet`: close with the last `.modal-x`, primary action is `.sheet-foot .primary`, scroll with the last `.sheet-body`. In the Add window the type switcher is `.type-btn` → `.type-row`; categories are `.chip-scroll .pick-chip`; segmented controls are `.chip-toggle-btn`.
6. Keyboard: set `--kb` (e.g. `336px`) and `--sheet-safe: 0px` on `document.documentElement` while a sheet is open to see the layout iOS gets with the keyboard up.
7. Attach `pageerror`/console-error listeners — a TDZ mistake in the concat order is a silent black screen.

Gotchas: the service worker (`sw.js`) registers even on 127.0.0.1 — always use a fresh browser context per run so its cache can't serve stale files; test offline behavior with `context.setOffline(true)` after one full online load. Vercel analytics is hostname-gated and never loads locally. Kill the server by port match when done.
