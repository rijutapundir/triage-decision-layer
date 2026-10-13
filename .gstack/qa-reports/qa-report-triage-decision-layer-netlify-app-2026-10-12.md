# QA Report: Triage (triage-decision-layer.netlify.app)

| Field | Value |
|-------|-------|
| **Date** | 2026-10-12 (UTC) |
| **URL** | https://triage-decision-layer.netlify.app/ |
| **Branch / Commit** | not a git repository (`C:\Users\rijut\triage`); evidence revision label `deployed-netlify-2026-10-12` |
| **PR** | — |
| **Caller / authority** | /qa-only, report-only. No product code, tests or config touched. |
| **Tier** | Full (browser) |
| **Scope** | Full app: Decision feed, case detail, Policy, Outcomes, Holdout, 375px mobile |
| **Driver** | gstack headless Chromium (`$B`). Aside not available on Windows. |
| **Probe budget / guarded command time** | 900 s configured / not summed (per-command start/finish receipts kept in the session output) |
| **Total session elapsed** | unmeasured |
| **Stop reason** | Scoped contracts tested; stopped with ~8 min of budget left |
| **Pages visited** | 4 views (single-page app) + case detail panel |
| **Screenshots** | 9 |
| **Framework** | Plain static HTML/JS (`index.html`, `app.js`, `engine.js`, `data.js`, `style.css`), no framework, no backend calls, no local/session storage |
| **Evidence verdict** | **inconclusive** (materialize tool: browser-only run, no functional evidence rows). Findings below rest on browser checkpoints and screenshots. |

## Charters

| # | Contract | Risk | Entrypoint | Isolation | Exit condition | Outcome |
|---|----------|------|------------|-----------|----------------|---------|
| C1 | Home page loads, renders its main UI, no console errors | Blank/broken deploy | `$B goto /` + snapshot, console | Headless fresh profile, no cookies | Page text + console captured | Pass |
| C2 | Every same-origin link and asset resolves | Broken nav/asset 404 | `$B links`, network list | Read-only GETs | All links classified | Pass (5 assets 200; 4 nav links are in-app `href="#"`) |
| C3 | Core flow (filters, search, case detail, policy draft → approve) produces coherent results that update on input change | Wrong/stale decision output | Snapshot refs, click/fill | Client-side only (verified no API calls/storage) | Each control exercised once | Pass for feed/policy mechanics; **ISSUE-001** on cross-view consistency |
| C4 | Edge inputs (no-match search, filter combos) do not break UI or throw | Uncaught exceptions | Same controls | Same as C3 | Errors checked after each interaction | Pass ("No cases match." empty state, 0 console errors) |
| C5 | Mobile 375px layout usable | Unusable on phone | viewport 375x812, DOM measurement | Read-only | Screenshot + overflow measurement | **Fail: ISSUE-002** |
| C6 | Basic accessibility | Access barriers | DOM audit | Read-only | Findings listed | Pass (DOM-level only) |
| C7 | Performance reasonable | Slow first load | `$B network` | Read-only | Timings recorded | Not scored (one sample) |

Isolation note: the target is non-local, so mutating actions would need approval. `$B network` (checkpoint 014) showed only 5 static GETs and no storage keys. "Approve policy" therefore changes only in-memory state in the headless tab and touches no account or server.

## Health Score: 92/100 (provisional: Performance not scored, Accessibility DOM-only)

| Category | Score | Basis |
|----------|-------|-------|
| Console | 100 | 0 errors across all views and interactions |
| Links | 100 | 0 broken destinations |
| Visual | 85 | ISSUE-002 (High) |
| Functional | 77 | ISSUE-001 (High), ISSUE-003 (Medium) |
| UX | 94 | ISSUE-004, ISSUE-008 (Low) |
| Performance | not scored | One cold load: HTML 4037 ms, assets 337–762 ms. Too few samples to judge. |
| Content | 91 | ISSUE-005, 006, 007 (Low) |
| Accessibility | 100 (provisional) | landmarks, labelled controls, `aria-current` on nav, rows `role=button` + tabbable, Escape closes detail |

Score = 82.55 / 0.90 tested weight = 91.7, rounded to 92.

## Top 3 Things to Fix

1. **ISSUE-001: The Decision feed counts and charges holdout cases as contacted, but the Holdout view says they got no contact.**
2. **ISSUE-002: At 375px the 240px sidebar stays open and clips the feed and KPI cards.**
3. **ISSUE-003: Free shipping is costed at ₹60.80 per contacted case, while the discount is costed only on recovered orders.**

## Console Health

No console errors observed on any view or after any interaction (checked after probes 001, 010, 011, 013, 016, 017, 019, 020).

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 1 |
| Low | 5 |
| **Total** | **8** |

## Issues

### ISSUE-001: The Decision feed counts and charges holdout cases as contacted, but the Holdout view says they got no contact.

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | https://triage-decision-layer.netlify.app/ (Decision feed vs Holdout views) |

**Observed:** On a fresh default-policy load, the feed shows all 6 Holdout-tagged cases with a paid action: CHK-4139, 4126, 4106, 4131 "Payment link ₹9.80"; CHK-4134, 4118 "Voice call + link ₹27.50". They count toward "32 contacted" and the ₹516.70 Total cost ("Messaging, calls and fatigue across contacted cases"). The Holdout view lists the same 6 IDs as "No contact (holdout)". Explore cases have the same problem in reverse: the feed shows the engine's pick (CHK-4114 "Payment link ₹9.80", CHK-4121 "No contact ₹0.00"), while the Holdout view says Free shipping happened for both. Under the draft policy tested in probes 016–019 the mismatch persists (feed 27 contacted; Holdout view: 5 of those are holdout no-contact).

**Expected:** The feed's "contacted" count and Total cost should reflect what actually happened (holdout = no contact, ₹0; explore = the randomly assigned action and its cost). Otherwise each holdout row should be visibly marked "would have chosen" and left out of the contacted/cost KPIs.

**Evidence:** [checkpoint 001](exploration-001.json), [checkpoint 019](exploration-019.json), [checkpoint 023](exploration-023.json), [checkpoint 024](exploration-024.json); screenshots `screenshots/initial.png`, `screenshots/page-holdout.png`.

**Confirmation:** Replay-confirmed. Seen first under the draft policy (018 vs 019), then replayed on a fresh default load (023 vs 024).

**Hypothesis (untested):** The feed renders `decide()` output, while holdout/explore assignment is applied only on the Holdout view.

**Repro Steps:**
1. Open https://triage-decision-layer.netlify.app/. Find CHK-4139: "Payment link · Holdout · ₹9.80". The header says 32 contacted.
2. Click **Holdout** in the sidebar.
3. **Observe:** the CHK-4139 row says "What happened: No contact (holdout)".

---

### ISSUE-002: At 375px the 240px sidebar stays open and clips the feed and KPI cards.

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | visual |
| **URL** | https://triage-decision-layer.netlify.app/ |

**Observed:** At a 375×812 viewport, `aside.sidebar` stays visible at 240px wide. The KPI cards extend to x=484 and the top-bar badge/avatar to x=545, all clipped. Page scrollWidth = 375, so the overflow is cut off rather than scrollable. Card text ("27 contacted, 8…", "₹514.5…") is truncated. There is no menu toggle.

**Expected:** On narrow screens the sidebar collapses (or becomes a drawer) and content gets the full width.

**Evidence:** [checkpoint 021](exploration-021.json); `screenshots/mobile-feed.png`.

**Confirmation:** Observed once (DOM measurement + screenshot), not replayed.

---

### ISSUE-003: Free shipping is costed at ₹60.80 per contacted case, while the discount is costed only on recovered orders.

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | Outcomes view; case detail panel |

**Observed:** Outcomes spend table: Free shipping 432 cases, ₹26,266 spend, 84 recoveries. That is ₹60.80 per contacted case, which matches charging the ₹60 subsidy on every case. Footnote: "Free shipping includes the ₹60 subsidy". The discount row is described as "10% margin given away on recovered orders". In the CHK-4139 detail panel, Free shipping cost is ₹69.80, against ₹9.80 for both Approved discount and Payment link.

**Expected:** A shipping subsidy is only paid when the order is placed, so it should be treated like the discount (84 × ₹60 ≈ ₹5,040, not ~₹25,900). As modelled, the engine is biased against Free shipping, and the Outcomes cost-per-recovery (₹312.69) is overstated.

**Evidence:** [checkpoint 011](exploration-011.json), [checkpoint 020](exploration-020.json); `screenshots/page-outcomes.png`, `screenshots/case-detail.png`.

**Confirmation:** Observed once; the per-case figure is derived arithmetic from displayed numbers. Whether this was intended as a modelling choice is unknown.

---

### ISSUE-004: In-app navigation never changes the URL.

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |

**Observed:** The sidebar links have `href="#"`. After clicking Policy, `location.href` stayed `https://triage-decision-layer.netlify.app/`. Views and open cases cannot be linked or bookmarked.
**Expected:** Each view (and ideally each case) has its own hash or route.
**Evidence:** [checkpoint 013](exploration-013.json). **Confirmation:** observed once. Back/refresh behaviour not tested.

### ISSUE-005: Holdout and Explore are labelled "10% of eligible cases" but are 6 of 35 (17%).

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |

**Observed:** "Of 35 eligible cases today", Holdout 6 "10% of eligible cases, no contact", Explore 6 "10% get a random allowed action".
**Expected:** Show the actual share, or word it as the target rate ("target 10%").
**Evidence:** [checkpoint 019](exploration-019.json), [checkpoint 024](exploration-024.json). **Confirmation:** seen in both runs.

### ISSUE-006: The no-contact action has four names, and amounts mix "Rs" and "₹".

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |

**Observed:** "Hold" (legend), "Held" (tab), "No contact" (feed row), "Hold, no contact" (policy and detail). Reason strings say "Beats retry prompt by Rs 20" while every other amount uses ₹.
**Evidence:** [checkpoint 001](exploration-001.json), [checkpoint 005](exploration-005.json), [checkpoint 013](exploration-013.json).

### ISSUE-007: The reason "took the cheaper rung" appears when the two options cost the same and the chosen one also has the higher net value.

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |

**Observed:** CHK-4139 (default policy): "Equivalent to approved discount in net value; took the cheaper rung". The detail table shows Payment link ₹9.80 / net ₹15.57 and Approved discount ₹9.80 / net ₹12.81.
**Evidence:** [checkpoint 011](exploration-011.json).

### ISSUE-008: The case detail says "Not allowed" without giving the reason.

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |

**Observed:** On CHK-4139 (₹599), Voice call + link has the highest net value (₹23.81) and is marked only "Not allowed". The reason is the ₹1,500 voice minimum, which appears only on the Policy page.
**Evidence:** [checkpoint 011](exploration-011.json), [checkpoint 013](exploration-013.json).

---

## What passed

- KPI cards match the rows: 40 cases, cost sum ₹516.70 (default) and ₹514.50 (after the draft approval), discount-avoided count 6.
- Tabs and legend filters return exact subsets (Held 3, Blocked 5, Voice 13). Search ANDs with the active filter. A no-match search shows "No cases match."
- Policy draft: turning off Payment link enables Approve, shows "Draft, not yet approved" and "19 of 40 decisions change". Approving updates the feed (27/8/5).
- Voice calls only go to orders ≥ ₹1,500. Contact-cap blocks show "3 of 3".
- Outcomes arithmetic checks out (spend, recoveries, per-action rates, cost per recovery, ₹1,57,178 net).
- Pilot sizing (1,230 cases ≈ 31 days at 40/day) is consistent.

## Proposed regression tests (not written, report-only)

Existing harness: `engine.test.js` (run with `node engine.test.js`, no framework).

1. **Feed summary treats holdout as no contact.** Build the feed for the default dataset; assert every case with `holdout` has action `hold`/cost 0 in the summary used for "contacted" and Total cost, matching the Holdout view's "What happened".
   Value: protects=feed contacted count and total cost exclude holdout cases; fails_when=feed summarises decide() output without applying holdout/explore; why_new=engine.test.js asserts decide()/diagnose() only, not feed aggregation; seam=none; no_claim=visual rendering of the feed (data-level only)
2. **Free shipping subsidy is charged only on recovery.** For a fixed case, assert Free shipping expected cost = contact cost + fatigue + p(recover) × ₹60, mirroring how the discount is costed.
   Value: protects=free shipping cost parity with discount costing; fails_when=the ₹60 subsidy is added to every contact; why_new=no existing test covers per-action cost composition; seam=none; no_claim=whether merchants want the subsidy modelled differently (product decision)

No test framework detected beyond the plain Node script. Bootstrapping one belongs in a separate, user-authorized `/qa` session.

## Limits and not-run coverage

- Evidence verdict from `gstack-qa-evidence materialize`: **inconclusive** ("no evidence rows", expected for a browser-only run).
- Long snapshot/text outputs are referenced to `raw/NNN.txt` or the session output, not copied inline into checkpoints.
- Probe 004 batched four clicks (a loop-rule deviation). Its results were discarded and re-run singly (005–007).
- Performance: one cold sample only. Accessibility: DOM audit only (no contrast measurement, no screen reader).
- Not tested: Back/refresh after navigation, Reset to default, sliders and contact +/- controls, the tablet breakpoint.
- Project-state copy of this report: **blocked**. No gstack project slug/state directory is established for this non-git folder.
- No durable learnings written: /qa-only grants no learning-store permission.

## Checkpoints

[checkpoint 001](exploration-001.json) · [checkpoint 002](exploration-002.json) · [checkpoint 003](exploration-003.json) · [checkpoint 004](exploration-004.json) · [checkpoint 005](exploration-005.json) · [checkpoint 006](exploration-006.json) · [checkpoint 007](exploration-007.json) · [checkpoint 008](exploration-008.json) · [checkpoint 009](exploration-009.json) · [checkpoint 010](exploration-010.json) · [checkpoint 011](exploration-011.json) · [checkpoint 012](exploration-012.json) · [checkpoint 013](exploration-013.json) · [checkpoint 014](exploration-014.json) · [checkpoint 015](exploration-015.json) · [checkpoint 016](exploration-016.json) · [checkpoint 017](exploration-017.json) · [checkpoint 018](exploration-018.json) · [checkpoint 019](exploration-019.json) · [checkpoint 020](exploration-020.json) · [checkpoint 021](exploration-021.json) · [checkpoint 022](exploration-022.json) · [checkpoint 023](exploration-023.json) · [checkpoint 024](exploration-024.json)

Baseline for future `--regression` runs: [baseline.json](baseline.json)
