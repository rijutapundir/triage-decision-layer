# QA Report (Regression): Triage (triage-decision-layer.netlify.app)

| Field | Value |
|-------|-------|
| **Date** | 2026-10-12 (UTC) |
| **URL** | https://triage-decision-layer.netlify.app/ |
| **Mode** | Regression (Full + comparison) against `../baseline.json` / `../qa-report-triage-decision-layer-netlify-app-2026-10-12.md` |
| **Caller / authority** | /qa-only, report-only. User approved in-tab state changes (policy toggles, sliders, contact +/-, Approve policy, Reset to default) on condition that no network writes or storage are observed. |
| **Driver** | gstack headless Chromium (`$B`); Aside not available on Windows |
| **Budget** | 900 s, deadline guard `deadline.json` |

## Charters

Source mapping (no git; local file mtimes only): `app.js`, `engine.js`, `index.html`, `style.css`, `engine.test.js` were modified after the prior report was written (prior report 00:37 local, files 00:43 to 00:46). Whether the deploy includes those edits is unknown; the regression checks observe the deployed site only.

| # | Contract (expected result) | Risk | Entrypoint | Isolation | Exit condition |
|---|----------|------|------------|-----------|----------------|
| R1 | ISSUE-001: feed contacted count and total cost treat holdout cases as no contact; feed and Holdout view agree per case | Wrong KPIs | Feed text vs Holdout view text for same IDs | Fresh headless tab, client-only | Holdout IDs compared across both views |
| R2 | ISSUE-002: at 375x812 the sidebar collapses or becomes a drawer; no content clipped | Unusable on phone | viewport 375x812, DOM measurement, screenshot | Read-only | Sidebar width/visibility + element right edges measured |
| R3 | ISSUE-003: free shipping subsidy costed on recovery like the discount | Biased engine, wrong outcomes | Outcomes spend table; CHK-4139 detail | Read-only | Spend per case computed |
| R4 | ISSUE-004: views change the URL (hash/route); back/refresh restore the view | Unlinkable views | Click nav, read location, back, reload | Read-only nav | URL + view after back/reload recorded |
| R5 | ISSUE-005: holdout/explore share label matches counts | Misleading copy | Holdout view text | Read-only | Label vs counts compared |
| R6 | ISSUE-006: one name for no-contact; consistent currency symbol | Copy confusion | Feed, tabs, legend, policy, detail text | Read-only | Terms enumerated |
| R7 | ISSUE-007: "cheaper rung" reason only when the pick is actually cheaper | Misleading reason | CHK-4139 detail | Read-only | Reason vs cost table compared |
| R8 | ISSUE-008: "Not allowed" shows why | Friction | CHK-4139 detail | Read-only | Text inspected |
| C1 | Home loads, main UI renders, 0 console errors | Broken deploy | goto + text + console | Fresh tab | Text + console captured |
| C2 | Links/assets resolve; network shows no writes and no storage keys | Broken assets; unapproved mutation | `$B links`, `$B network`, storage key count | Read-only GETs | All classified; mutation gate decided |
| C3 | Core flow: tabs/filters/search subsets, case detail, policy draft then approve updates feed, Reset restores default | Stale/wrong output | Snapshot refs, click/fill | Client-only, approved | Each control exercised once |
| C4 | Edge inputs (no-match search, slider extremes, contact cap 0/max) never throw | Uncaught errors | Same controls | Same | Console checked after each |
| C5 | Tablet 768px layout usable | Layout break | viewport 768x1024 | Read-only | Screenshot + overflow measurement |
| C6 | Basic accessibility (landmarks, labels, keyboard on rows, Escape closes detail) | Access barriers | DOM audit | Read-only | Findings listed |
| C7 | Performance reasonable | Slow load | `$B perf` | Read-only | Timings recorded (not scored on one sample) |
