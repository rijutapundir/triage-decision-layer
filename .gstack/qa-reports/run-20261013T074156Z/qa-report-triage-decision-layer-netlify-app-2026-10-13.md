# QA Report: Triage (triage-decision-layer.netlify.app)

| Field | Value |
|-------|-------|
| **Date** | 2026-10-13 |
| **URL** | https://triage-decision-layer.netlify.app/ |
| **Branch** | master |
| **Commit** | da38e40. Live files match `deploy/` byte for byte except a Netlify-injected HTML comment in index.html (checked with curl before the run) |
| **PR** | — |
| **Caller / authority** | /qa-only, user-invoked. Report only; no product changes |
| **Tier** | Full, browser surface. Desktop 1280x800 and mobile 375x812 |
| **Scope** | Full app: Decision feed, Policy, Audit log, Proof, Outcomes, Holdout, case panel, top-bar controls |
| **Driver** | gstack headless browser (`$B`); Aside unavailable on Windows |
| **Isolation** | Static site, no backend, no accounts. In-page controls changed only in-memory state of the test tab |
| **Probe budget / guarded command time** | 900 s / about 137 s (sum of started-to-finished receipt spans, probes 001–017) |
| **Total session elapsed** | unmeasured |
| **Pages visited** | 6 views at desktop, 6 at mobile |
| **Screenshots** | 5 (`screenshots/`) |
| **Framework** | None (vanilla JS, hash routing). `engine.test.js` covers the engine and simulation only; no DOM/browser test framework. Run `/qa` to bootstrap one in a separate, user-authorized repair session |
| **Evidence verdict** | inconclusive (open: no evidence rows). This is the evidence tool's verdict for a browser-only run with no functional captures; browser findings below rest on the linked checkpoints and screenshots |

## Charters

| ID | Contract (expected) | Risk | Entrypoint | Isolation | Exit condition | Outcome |
|----|--------------------|------|------------|-----------|----------------|---------|
| C1 | Feed loads with hero, 42 cases, no console errors; hero fills with proof ranges (75–100%, 100–123%) and Kaara mode line | First 30 s broken or blank | `/` | read-only | text + console captured | Pass (003) |
| C2 | "From the note" tab shows exactly CHK-4100/4111/4140/4141 with the note's actions and reasons | Note claims unfindable | `/` tab | read-only | 4 rows verified | Pass (004) |
| C3 | Proof view renders the PROOF table (100/100/75/99; 115/86/94/99; 123/98/104/108; 123/100/104/108), rules table and 4 handover charts | Headline evidence missing | `/#proof` | read-only | values read | Pass on values; ISSUE-002 (006) |
| C4 | Case panel opens; override changes the row, logs to Audit log; clearing restores | Control claim broken | feed row | in-tab state | row + audit verified | Pass (007); clearing not probed |
| C5 | Pause makes Contacted 0 with banner; resume restores; outage blocks 8 HDFC cases with alert | Trust/failure claims broken | top bar | in-tab state | counts verified | Pass (008) |
| C6 | Policy: toggling an action shows live impact; approve updates feed and logs | Policy flow broken | `/#policy` | in-tab state | impact + audit verified | Pass (009); ISSUE-001 found next (010, 013) |
| C7 | Outcomes, Holdout, Audit views render without errors; back/refresh keep view | Navigation broken | nav | read-only | each view read | Pass (014); ISSUE-005 |
| C8 | 375px: no horizontal scroll on every view; nav usable; proof tables scroll inside cards | Mobile unusable | all views | read-only | scrollWidth per view | 5 of 6 views pass; ISSUE-003 (015, 016) |
| C9 | Console clean across all flows; all same-origin assets 200 | Errors / broken links | all | read-only | console + links | No console errors in 003, 014, 017; assets 200 checked pre-run only |

## Health Score: 96/100 (provisional)

Accessibility and Performance were not tested and are excluded; tested weight 0.75.

| Category | Score | Basis |
|----------|-------|-------|
| Console | 100 | 0 errors in probes 003, 014, 017 |
| Links | 100 | 6 of 6 hash routes load their view; external asset status not probed in-browser |
| Visual | 92 | ISSUE-003 (Medium) |
| Functional | 92 | ISSUE-001 (Medium) |
| UX | 100 | no UX findings |
| Performance | not scored | Proof compute observed at 2.3 s and 6.7–8.0 s across loads; not measured systematically |
| Content | 83 | ISSUE-002 (Medium), ISSUE-004, ISSUE-005, ISSUE-006 (Low) |
| Accessibility | not scored | not tested |

Score = (15 + 10 + 9.2 + 18.4 + 15 + 4.15) / 0.75 = 95.7, rounded to 96.

## Top 3 Things to Fix

1. **ISSUE-001: An override survives a policy that forbids its action.** After CHK-4100 was overridden to Approved discount and discounts were switched off and approved, the row still showed "Approved discount (your override)", and the override dropdown showed "Triage's decision".
2. **ISSUE-002: The Proof page and hero contradict each other on home decor.** The "As shipped: Triage only where it wins" row counts Home decor at 108%, while the handover chart on the same page says Home decor is "Still on the default at week 8", and the hero shows "Running: best default" beside "As shipped, Triage reaches 100–123%".
3. **ISSUE-003: At 375px the Audit log table runs past its card.** The table is 725 px wide inside an unscrolled card; the "What" text is cut off and the content area scrolls sideways.

## Console Health

| Error | Count | First seen |
|-------|-------|------------|
| none | 0 | — |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 3 |
| **Total** | **6** |

## Issues

### ISSUE-001: An override survives a policy that forbids its action

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | https://triage-decision-layer.netlify.app/#feed, #policy |

**Observed:** After CHK-4100 was overridden to Approved discount and discounts were switched off and approved, the row still showed "Approved discount (your override)", and the override dropdown showed "Triage's decision". Dropdown options after the policy change: `["":Triage's decision: Payment link, hold, retry_prompt, free_shipping]`, value `""`, while the callout still says "This case gets approved discount."

**Expected:** The Policy page promises "Nothing outside it ever runs." An override to an action the approved policy no longer allows should be dropped or flagged, and the dropdown should show the override that is in force.

**Evidence:** [checkpoint 010](exploration-010.json) (first observation), [checkpoint 013](exploration-013.json) (exact replay from a fresh load, probe 013). **Confirmation:** replay-confirmed.

**Hypothesis (untested):** overrides are applied after the engine without re-checking the approved policy, and the dropdown is built only from currently allowed actions, so it cannot show the active one. Whether the merchant can clear it from the dropdown (selecting the already-shown "Triage's decision" fires no change) was not probed.

**Repro Steps:**
1. Open `/`, click CHK-4100, set "Override this decision" to Approved discount.
2. Open Policy, switch off Approved discount, click Approve policy.
3. Return to the feed. **Observe:** CHK-4100 still reads "Approved discount (your override)"; reopening the panel shows the dropdown on "Triage's decision".

**Proposed test (not written):** browser check at the real boundary, since the merchant layer has no exported seam.
Value: protects=policy promise that nothing outside the approved policy runs, incl. overrides; fails_when=an override to a now-disallowed action still sets the taken action; why_new=engine.test.js covers the engine only, not app.js merchant layer; seam=none; no_claim=none beyond protects

---

### ISSUE-002: The Proof page and hero contradict each other on home decor

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | content |
| **URL** | https://triage-decision-layer.netlify.app/#proof and `/` |

**Observed:** The "As shipped: Triage only where it wins" row counts Home decor at 108%, while the handover chart on the same page says Home decor is "Still on the default at week 8", and the hero shows "Running: best default" beside "As shipped, Triage reaches 100–123%". The proof footnote also lists Home decor among merchants where Triage is shipped.

**Expected:** One story per merchant: either home decor is shipped on Triage (and the handover shows a takeover), or the As-shipped row and footnote count home decor at its default (99%) until the holdout proves Triage.

**Evidence:** [checkpoint 006](exploration-006.json) (proof table, footnote, handover statuses), [checkpoint 003](exploration-003.json) (hero text), `screenshots/desktop-feed.png`, `screenshots/desktop-proof.png`. **Confirmation:** observed on two separate loads (probes 003/006 and 017); static content.

---

### ISSUE-003: At 375px the Audit log table runs past its card

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual |
| **URL** | https://triage-decision-layer.netlify.app/#audit at 375x812 |

**Observed:** The table is 725 px wide inside an unscrolled card; the "What" text is cut off and the content area scrolls sideways (`.content` scrollWidth 742 vs clientWidth 375). Outcomes and Holdout tables also exceed 375 px but scroll inside their cards (`overflow-x: auto`), as intended.

**Expected:** No sideways scroll of the page content at 375 px; long audit text wraps or the table scrolls inside its card like the other tables.

**Evidence:** [checkpoint 015](exploration-015.json), [checkpoint 016](exploration-016.json), `screenshots/mobile-audit.png`, `screenshots/mobile-outcomes.png`, `screenshots/mobile-holdout.png`. **Confirmation:** measured on probe 015 and again on probe 016.

---

### ISSUE-004: A stale override stays labelled after the engine's pick matches it

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | https://triage-decision-layer.netlify.app/#feed |

**Observed:** After CHK-4111 was overridden to Payment link and Voice call was then switched off in policy, the row reads "Payment link (your override) | Engine pick: Payment link".

**Expected:** When the engine's pick equals the override, the row reads as the engine's decision (or the override is retired), not as a disagreement.

**Evidence:** [checkpoint 010](exploration-010.json) (`c4111` field). **Confirmation:** observed once; not replayed.

---

### ISSUE-005: Holdout arms do not add up once a case is overridden

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | https://triage-decision-layer.netlify.app/#holdout |

**Observed:** With one override active, Holdout showed Treated 24, Holdout 6, Explore 6 "of 37 eligible", which sums to 36.

**Expected:** Every eligible case is counted somewhere, e.g. an "Overridden by you" count.

**Evidence:** [checkpoint 014](exploration-014.json). State carried over from probe 013 because the gotos were hash-only (disclosed in limits). **Confirmation:** observed once.

---

### ISSUE-006: Copy nits

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | `/`, `/#proof` |

**Observed:** CHK-4140's reason ("Discount scored higher but did not clear the margin hurdle; took hold instead.") lacks the cause prefix every other reason has ("Price hesitation. …"). The lower bound prints as "-4.1%" with a hyphen, while the rules table uses "−61%".

**Evidence:** [checkpoint 004](exploration-004.json), [checkpoint 006](exploration-006.json). **Confirmation:** static text.

---

## Not a bug, but worth knowing for the demo

- Turning on "Simulate HDFC outage" blocks CHK-4111, one of the four "From the note" cases ([checkpoint 008](exploration-008.json)). That is the gate working as designed.
- The hero's proof ranges and Kaara mode line appear a few seconds after load while the simulation runs; "Running the proof simulation…" shows meanwhile.

## Coverage limits

- Accessibility and Performance not tested.
- Links: hash routes verified in-browser; asset HTTP status checked with curl before the run, not as a probe.
- Clearing an override (C4) was not probed.
- Harness errors, not product behaviour: checkpoints 002 (browser server restart; an unguarded `console --errors` also ran on about:blank without a checkpoint), 005 (synchronous read), 011 and 012 (JSON-escaped regex). Checkpoint 001 was written from the tool output after the probe ran.
- Probe 017 (desktop screenshots, console clean) was the final probe and has no checkpoint by design.

## Checkpoints

[checkpoint 001](exploration-001.json) · [checkpoint 002](exploration-002.json) · [checkpoint 003](exploration-003.json) · [checkpoint 004](exploration-004.json) · [checkpoint 005](exploration-005.json) · [checkpoint 006](exploration-006.json) · [checkpoint 007](exploration-007.json) · [checkpoint 008](exploration-008.json) · [checkpoint 009](exploration-009.json) · [checkpoint 010](exploration-010.json) · [checkpoint 011](exploration-011.json) · [checkpoint 012](exploration-012.json) · [checkpoint 013](exploration-013.json) · [checkpoint 014](exploration-014.json) · [checkpoint 015](exploration-015.json) · [checkpoint 016](exploration-016.json)

## Fixes Applied

None. Report-only run.
