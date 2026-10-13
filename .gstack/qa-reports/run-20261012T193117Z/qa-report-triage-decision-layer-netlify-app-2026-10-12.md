# QA Report (Regression): Triage (triage-decision-layer.netlify.app)

| Field | Value |
|-------|-------|
| **Date** | 2026-10-12 (UTC) |
| **URL** | https://triage-decision-layer.netlify.app/ |
| **Mode** | Regression (Full + comparison) against [../baseline.json](../baseline.json) / [../qa-report-triage-decision-layer-netlify-app-2026-10-12.md](../qa-report-triage-decision-layer-netlify-app-2026-10-12.md) |
| **Caller / authority** | /qa-only, report-only. User approved (this session, D1) in-tab state changes: policy toggles, sliders, contact +/-, Approve policy, Reset to default; abort if any network write or storage is observed. |
| **Driver** | gstack headless Chromium (`$B`); Aside not available on Windows |
| **Budget** | 900 s, deadline guard `deadline.json` |
| **Branch / Commit** | not a git repository; evidence revision label `deployed-netlify-2026-10-12T1931Z` |
| **Scope** | Full app: Decision feed, case detail, Policy (draft → approve → reset), Outcomes, Holdout, hash routing, 375px and 768px |
| **Probe budget / guarded command time** | 900 s configured / not summed (per-command start/finish receipts kept in the session output) |
| **Total session elapsed** | unmeasured |
| **Stop reason** | All charters tested or explicitly left partial; stopped with ~5 min of budget left |
| **Pages visited** | 4 views (single-page app, hash routes) + case detail panel |
| **Screenshots** | 2 (`screenshots/mobile-feed.png`, `screenshots/tablet-feed.png`) |
| **Framework** | Plain static HTML/JS, no framework, no backend calls, no local/session storage (storage count 0 in probes 006 and 017) |
| **Evidence verdict** | **inconclusive** (materialize tool: browser-only run, "no evidence rows"). Findings rest on browser checkpoints and screenshots. |

## Charters

Source mapping (no git; file mtimes only): `app.js`, `engine.js`, `index.html`, `style.css`, `engine.test.js` changed 00:43 to 00:46 local, after the prior report (00:37). Whether the deploy includes them is unknown; checks observe the deployed site only. No TODOS.md.

| # | Contract (expected result) | Risk | Entrypoint | Isolation | Exit condition |
|---|----------|------|------------|-----------|----------------|
| R1 | ISSUE-001: feed contacted count/total cost treat holdout as no contact; feed and Holdout view agree per case | Wrong KPIs | Feed text vs Holdout view for same IDs | Fresh headless tab, client-only | Holdout IDs compared across views |
| R2 | ISSUE-002: at 375x812 sidebar collapses/drawer; nothing clipped | Unusable on phone | viewport 375x812, DOM measurement, screenshot | Read-only | Sidebar + right edges measured |
| R3 | ISSUE-003: free shipping subsidy costed on recovery like discount | Biased engine | Outcomes table; CHK-4139 detail | Read-only | Spend per case computed |
| R4 | ISSUE-004: views change URL; back/refresh restore view | Unlinkable views | Nav click, location, back, reload | Read-only nav | URL + view after back/reload |
| R5 | ISSUE-005: holdout/explore share label matches counts | Misleading copy | Holdout view text | Read-only | Label vs counts |
| R6 | ISSUE-006: one name for no-contact; one currency symbol | Copy confusion | Feed/tabs/legend/policy/detail text | Read-only | Terms enumerated |
| R7 | ISSUE-007: "cheaper rung" only when actually cheaper | Misleading reason | CHK-4139 detail | Read-only | Reason vs costs |
| R8 | ISSUE-008: "Not allowed" shows why | Friction | CHK-4139 detail | Read-only | Text inspected |
| C1 | Home loads, renders, 0 console errors | Broken deploy | goto + text + console | Fresh tab | Text + console captured |
| C2 | Assets resolve; no network writes, no storage keys | Broken assets; unapproved mutation | `$B links`, `$B network`, storage count | Read-only GETs | Mutation gate decided |
| C3 | Core flow: tabs/filters/search subsets, detail, policy draft then approve updates feed, Reset restores default | Stale/wrong output | snapshot refs, click/fill | Client-only, approved | Each control once |
| C4 | Edge inputs (no-match search, slider extremes, contact cap) never throw | Uncaught errors | Same controls | Same | Console after each |
| C5 | Tablet 768px usable | Layout break | viewport 768x1024 | Read-only | Overflow measurement |
| C6 | Basic a11y (landmarks, labels, keyboard rows, Escape closes detail) | Access barriers | DOM audit | Read-only | Findings listed |
| C7 | Performance reasonable | Slow load | `$B perf` | Read-only | Timings (not scored on one sample) |

### Charter outcomes

| # | Outcome |
|---|---------|
| R1 | **Pass (ISSUE-001 fixed).** Feed: 27 contacted · 8 hold · 5 blocked, ₹382.80 "holdout and explore included"; row costs sum to ₹382.80. All 12 holdout/explore cases match the Holdout view one-for-one (002, 004). |
| R2 | **Pass (ISSUE-002 fixed).** At 375px the sidebar becomes a full-width top tab strip; KPI cards fit; page scrollWidth 375 (022, 023). New Low: ISSUE-011. |
| R3 | **Pass (ISSUE-003 fixed).** CHK-4139 Free shipping cost ₹9.80 (was ₹69.80). Outcomes: Free shipping 432 cases, ₹5,386, 84 recoveries ≈ 84 × ₹60 + contact cost; footnote "costed on recovered orders only" (009, 011). |
| R4 | **Pass (ISSUE-004 fixed).** Nav uses `#holdout` etc.; URL changes; refresh keeps the Holdout view; Back returns to the feed (003, 006, 008). |
| R5 | **Pass (ISSUE-005 fixed).** "Holdout · target 10% … 6 of 35 today (target 10%; small samples vary)" (004). |
| R6 | **Pass (ISSUE-006 fixed).** No-contact action reads "Hold" in legend, tab, feed and policy ("Hold (holdout)" on holdout rows). All amounts use ₹; no "Rs" seen (002, 015). |
| R7 | **Pass (ISSUE-007 fixed).** CHK-4139 reason now "took the option that gives away no margin"; "took the cheaper rung" appears only on CHK-4110 (Payment link ₹9.80 vs Voice ₹23.00) (002, 009). |
| R8 | **Pass (ISSUE-008 fixed).** Voice call row says "Below ₹1,500 voice minimum"; Human follow up says "Off in policy" (009). |
| C1 | Pass. 200 on load, 0 console errors (026). |
| C2 | Pass. Only same-origin GETs (200/304), no writes, storage 0 (027, 017). |
| C3 | Pass. Payment link off → "Draft, not yet approved", "15 of 40 decisions change", preview 26 / 9 / 5 / ₹395.80; Approve applies exactly that to the feed; Reset restores the default as a draft (014–019). Search and filter tabs not re-run this pass. |
| C4 | Partial. 0 console errors after all interactions; sliders and contact +/- not exercised. |
| C5 | **Issues found:** ISSUE-009, ISSUE-010 (031–036). |
| C6 | Pass (DOM-level). Escape closes the detail panel (`display:none`, `aria-hidden=true`); `aria-current` on the active nav item (006, 035). |
| C7 | Not scored. HTML 635–987 ms, assets 294–662 ms on uncached loads (027). |

## Health Score: 99/100 (provisional: Performance not scored, Accessibility DOM-only)

| Category | Score | Basis |
|----------|-------|-------|
| Console | 100 | 0 errors |
| Links | 100 | 0 broken destinations; all 4 nav links are working hash routes |
| Visual | 94 | ISSUE-009, ISSUE-010 (Low) |
| Functional | 100 | no functional findings |
| UX | 97 | ISSUE-011 (Low) |
| Performance | not scored | too few samples |
| Content | 94 | ISSUE-012, ISSUE-013 (Low) |
| Accessibility | 100 (provisional) | DOM checks only |

Score = 88.65 / 0.90 tested weight = 98.5, rounded to 99.

## Top 3 Things to Fix

1. **ISSUE-009: At 768px with a case open, the feed shrinks to ~168px and the KPI cards run under the detail panel.**
2. **ISSUE-012: In the case detail, Net value is not Expected gain minus Cost in any row.**
3. **ISSUE-011: At 375px the Holdout tab is off-screen in the top tab strip with no cue that the strip scrolls.**

## Console Health

No console errors (`$B console --errors` after all views and interactions, checkpoint 026).

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 5 |
| **Total** | **5** |

## Issues

### ISSUE-009: At 768px with a case open, the feed shrinks to ~168px and the KPI cards run under the detail panel.

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | https://triage-decision-layer.netlify.app/ (CHK-4139 open) |

**Observed:** Viewport 768×1024 with the CHK-4139 detail open: sidebar 240px, detail panel x=408 w=360. The feed column between them is ~168px. "Decision feed" wraps onto two lines, the description wraps to 5 lines, and the KPI cards (₹382.80, "Contacted 27 · Hold 8 ·") are cut off under the panel.
**Expected:** At tablet width the panel either overlays the whole content area or the feed keeps a usable width.
**Evidence:** [checkpoint 032](exploration-032.json), [checkpoint 033](exploration-033.json); `screenshots/tablet-feed.png`.
**Confirmation:** Observed once (measurement + screenshot), not replayed. Workaround: close the panel.

**Repro Steps:**
1. Open the site at a 768px-wide viewport.
2. Click the CHK-4139 row.
3. **Observe:** the feed is squeezed into a narrow column and the KPI cards are cut off by the panel.

---

### ISSUE-010: At 768px the feed's Reason and Cost columns sit past the card edge and are reachable only by horizontal scroll.

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | https://triage-decision-layer.netlify.app/ |

**Observed:** Viewport 768, panel closed: `main` is 528px wide; feed rows are 758px wide inside a 478px `div.feed` with `overflow-x:auto`. Reason cells end at x=931 and Cost cells at x=1023, so neither is visible until the feed card is scrolled sideways.
**Expected:** The Cost column (and ideally the Reason) is visible without sideways scrolling at tablet width, or the row stacks.
**Evidence:** [checkpoint 035](exploration-035.json); probe 036 output (session transcript, not checkpointed): `DIV.feed ox=auto sw=758 cw=478`.
**Confirmation:** Observed once, not replayed.

---

### ISSUE-011: At 375px the Holdout tab is off-screen in the top tab strip with no cue that the strip scrolls.

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |
| **URL** | https://triage-decision-layer.netlify.app/ |

**Observed:** At 375×812 the strip shows "Decision feed", "Policy", "Outcomes" with Outcomes flush to the right edge. Holdout sits at x=367–471. `aside.sidebar` has `overflow-x:auto` (scrollWidth 471, clientWidth 375). After scrolling, Holdout is tappable.
**Expected:** A visible hint (fade, partial next tab or chevron) that more tabs exist, or all four tabs fit.
**Evidence:** [checkpoint 023](exploration-023.json), [checkpoint 024](exploration-024.json), [checkpoint 025](exploration-025.json); `screenshots/mobile-feed.png`.
**Confirmation:** Observed once, not replayed.

---

### ISSUE-012: In the case detail, Net value is not Expected gain minus Cost in any row.

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | Case detail panel (CHK-4139) |

**Observed:** "Every action scored" for CHK-4139: Payment link Expected gain ₹34.44, Cost ₹9.80, Net value ₹15.57; Human follow up −₹34.03, ₹129.00, −₹52.90. In every row, Net value equals Expected gain minus Hold's ₹18.87 (e.g. 34.44 − 18.87 = 15.57), so the Cost column is not subtracted again. "Expected gain" appears to already be net of cost, and Human follow up shows a negative "gain" despite the largest lift (36.3 pp).
**Expected:** Column labels let a reader reproduce Net value, e.g. "Expected value after cost", or a layout where Net = Gain − Cost − Hold.
**Evidence:** [checkpoint 009](exploration-009.json), [checkpoint 030](exploration-030.json).
**Confirmation:** Replay-confirmed (probe 009, then the same command on a fresh load in probe 030, identical output). The relationship is derived arithmetic from displayed numbers.

---

### ISSUE-013: Free shipping picks are explained as "the option that gives away no margin".

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | Decision feed |

**Observed:** CHK-4101 and CHK-4116 (Free shipping, ₹9.80): "Equivalent to approved discount in net value; took the option that gives away no margin." The Outcomes footnote says free shipping carries "the ₹60 subsidy" on recovered orders.
**Expected:** Wording that matches what was saved, e.g. "took the option that costs less than the discount".
**Evidence:** [checkpoint 002](exploration-002.json) (raw-002.txt), [checkpoint 011](exploration-011.json).
**Confirmation:** Observed in the feed text once, on two rows.

---

## Regression

| Metric | Baseline (2026-10-12, [../baseline.json](../baseline.json)) | Current ([baseline.json](baseline.json)) | Delta |
|--------|----------|---------|-------|
| Health score | 92 | 99 | +7 (provisional: coverage differs, see below) |
| Issues | 8 (2 High, 1 Medium, 5 Low) | 5 (all Low) | −3 |
| Functional | 77 | 100 | +23 |
| Visual | 85 | 94 | +9 |
| UX | 94 | 97 | +3 |
| Content | 91 | 94 | +3 |

**Fixed since baseline (all 8):** ISSUE-001 holdout counted as contacted · ISSUE-002 375px sidebar clips content · ISSUE-003 free shipping subsidy per contact · ISSUE-004 URL never changes · ISSUE-005 "10%" label vs 6 of 35 · ISSUE-006 four names / Rs vs ₹ · ISSUE-007 "cheaper rung" at equal cost · ISSUE-008 "Not allowed" without reason.

**New since baseline:** ISSUE-009, ISSUE-010 (768px, a breakpoint the baseline run did not test), ISSUE-011 (comes with the new mobile tab strip), ISSUE-012, ISSUE-013 (copy).

Coverage differences: this run added tablet 768px, refresh/Back and Reset to default; it did not re-run search/filter tabs. Category scores are not strictly like-for-like.

## What passed

- KPI cards match the rows (40 cases, ₹382.80 sum); the approved draft predicts and produces 26 / 9 / 5 / ₹395.80.
- Outcomes arithmetic reconciles: case, spend and recovery totals; per-action rates; cost per recovery ₹22.44; ₹2,23,440 − ₹45,382 = ₹1,78,058; ₹45,382 / 456 ≈ ₹100.
- Hash routing, refresh and Back; Escape closes detail; 0 console errors; static GETs only.

## Proposed regression tests (not written, report-only)

The two tests proposed in the baseline report now exist in `engine.test.js` (check 8 "Holdout cases are summarised as no contact, at no cost"; check 9 "Free shipping costs contact + fatigue + p(recover) x subsidy"). Not run here (browser-surface run).

No new tests proposed. ISSUE-009 to 011 are layout findings and the project has no browser test harness; ISSUE-012/013 are copy, where a string assertion would only freeze wording. Adding a browser layout harness belongs in a separate, user-authorized `/qa` session.

## Limits and not-run coverage

- Evidence verdict from `gstack-qa-evidence materialize`: **inconclusive** ("no evidence rows", expected for a browser-only run).
- Long outputs (002, 003, 004, 011, 013, 015, 030) are referenced to `raw-NNN.txt` or condensed in the checkpoint, with verbatim output in raw files or the session transcript.
- Probe 036 was the last probe; per the loop rule its result went to the report, not a checkpoint.
- The deadline guard killed the browse daemon on Windows when it was the daemon's parent. The daemon was started once outside the guard (setup, not a probe); every probe ran guarded.
- Not tested: sliders, contact +/-, search and filter tabs (this pass), screen reader, contrast, repeated performance samples.
- The earlier abandoned regression attempt `../run-20261012T192134Z/` (charters + 10 probes, no findings) was left untouched and not used as evidence.
- Project-state copy of this report: **blocked**. No gstack project slug/state directory is established for this non-git folder.
- One operational learning was logged through `gstack-learnings-log` (Windows deadline guard kills the browse daemon). This conflicts with the /qa-only reporting rule that skips learning-store writes without explicit permission; it is disclosed here and contains no product data.

## Checkpoints

[checkpoint 001](exploration-001.json) · [checkpoint 002](exploration-002.json) · [checkpoint 003](exploration-003.json) · [checkpoint 004](exploration-004.json) · [checkpoint 005](exploration-005.json) · [checkpoint 006](exploration-006.json) · [checkpoint 007](exploration-007.json) · [checkpoint 008](exploration-008.json) · [checkpoint 009](exploration-009.json) · [checkpoint 010](exploration-010.json) · [checkpoint 011](exploration-011.json) · [checkpoint 012](exploration-012.json) · [checkpoint 013](exploration-013.json) · [checkpoint 014](exploration-014.json) · [checkpoint 015](exploration-015.json) · [checkpoint 016](exploration-016.json) · [checkpoint 017](exploration-017.json) · [checkpoint 018](exploration-018.json) · [checkpoint 019](exploration-019.json) · [checkpoint 020](exploration-020.json) · [checkpoint 021](exploration-021.json) · [checkpoint 022](exploration-022.json) · [checkpoint 023](exploration-023.json) · [checkpoint 024](exploration-024.json) · [checkpoint 025](exploration-025.json) · [checkpoint 026](exploration-026.json) · [checkpoint 027](exploration-027.json) · [checkpoint 028](exploration-028.json) · [checkpoint 029](exploration-029.json) · [checkpoint 030](exploration-030.json) · [checkpoint 031](exploration-031.json) · [checkpoint 032](exploration-032.json) · [checkpoint 033](exploration-033.json) · [checkpoint 034](exploration-034.json) · [checkpoint 035](exploration-035.json)

Baseline for future `--regression` runs: [baseline.json](baseline.json)
