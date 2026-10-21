# QA Report: Triage local build (localhost:8766)

| Field | Value |
|-------|-------|
| **Date** | 2026-10-21 |
| **URL** | http://localhost:8766/ (static server over the repo root; index.html, app.js, style.css byte-identical to deploy/) |
| **Branch** | master |
| **Commit** | cdf062c plus an uncommitted app.js change (override tag in the scored table), copied to deploy/ |
| **PR** | — |
| **Caller / authority** | /qa-only, user-invoked. Report only; no product changes |
| **Tier** | Full, browser surface. Desktop 1280x800 and mobile 390x844 |
| **Scope** | Decision feed, an override, Policy, Audit log, Default vs Triage, Outcomes, Holdout, For evaluators |
| **Driver** | gstack headless browser (`$B`); Aside unavailable on Windows |
| **Isolation** | Local static site, no backend; in-page actions changed only the test tab's in-memory state |
| **Probe budget / guarded command time** | 900 s / about 42 s (sum of started-to-finished receipt spans, probes 001–006) |
| **Total session elapsed** | unmeasured |
| **Pages visited** | 8 views at desktop, 7 at 390px (feed, Policy, Audit log, Default vs Triage, Outcomes, Holdout, For evaluators) |
| **Screenshots** | 5 (`screenshots/`) |
| **Framework** | None (vanilla JS, hash routing). `engine.test.js` covers engine, simulation and learning; no DOM test framework. Run `/qa` to bootstrap one in a separate, user-authorized repair session |
| **Evidence verdict** | inconclusive (open: no evidence rows). The evidence tool's verdict for a browser-only run with no functional captures; browser findings rest on the linked checkpoints and screenshots |

## Charters

| ID | Contract (expected) | Risk | Entrypoint | Exit condition | Outcome |
|----|--------------------|------|------------|----------------|---------|
| C1 | Decision feed loads: hero, guide, 42 cases, From the note tab with 4 cases, no console errors | Demo opens broken | `/` | text + console read | Pass (001) |
| C2 | Override CHK-4111 to Payment link: row shows "(your override)"; scored table tags Voice call "Chosen" and Payment link "Your override"; note line shown; clearing removes both | New feature broken | case panel | tags + note read before/after | Pass (002) |
| C3 | Override equal to Triage's pick shows only "Chosen" and no note | Wrong tag on edge case | case panel + Policy | tags read | Pass (003) |
| C4 | Policy: switch off discounts, approve; impact list, feed and audit update; an override the policy forbids is cleared and logged | Policy flow broken | `#policy` | impact, feed, audit read | Pass (003) |
| C5 | Audit log lists session start, overrides, approvals | Log missing events | `#audit` | rows read | Pass (003) |
| C6 | Default vs Triage: Kaara chart, callout, Learning panel steps and resets | Merchant view broken | `#proof` | panel state read | Works (004); ISSUE-001 |
| C7 | Outcomes, Holdout (counts sum to eligible), For evaluators (table, summary, other charts) render | Views broken | nav | text read | Pass (004); ISSUE-001 also on evaluator note |
| C8 | 390x844: every view scrolls to bottom, no sideways page scroll, case panel opens/scrolls/closes, tables scroll inside cards | Mobile unusable | all views | measurements + screenshots | Pass (005, 006); ISSUE-002 |
| C9 | Console clean across flows | Runtime errors | all | console --errors | Pass: no errors in 001–006 |

## Health Score: 98/100 (provisional)

Accessibility and Performance not tested and excluded; tested weight 0.75.

| Category | Score | Basis |
|----------|-------|-------|
| Console | 100 | 0 errors in probes 001–006 |
| Links | 100 | 8 of 8 hash routes reached their view |
| Visual | 97 | ISSUE-003 (Low) |
| Functional | 100 | override, policy, pause-free flows, learning, navigation all behaved as contracted |
| UX | 97 | ISSUE-002 (Low) |
| Performance | not scored | not measured |
| Content | 92 | ISSUE-001 (Medium) |
| Accessibility | not scored | not tested |

Score = (15 + 10 + 9.7 + 20 + 14.55 + 4.6) / 0.75 = 98.5, rounded to 98.

## Top 3 Things to Fix

1. **ISSUE-001: Copy says Triage is ahead where the chart says level or behind.** The Default vs Triage callout says "Triage looks ahead in your holdout" and the hero chip says "Triage ahead but not yet proven for your store", while Kaara's chart on the same page says "Triage is level with or behind it, and the holdout has not proved it ahead (lower bound −11.6%)".
2. **ISSUE-002: On a phone, the case panel's Close button scrolls out of view.** After scrolling the panel down to the scored table, the header with Close is no longer visible; closing needs a scroll back to the top.
3. **ISSUE-003: Lift values wrap onto two lines in the scored table.** "11.0 pp" renders as "11.0" over "pp" in the panel at both 1280px and 390px.

## Console Health

| Error | Count | First seen |
|-------|-------|------------|
| none | 0 | — |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 2 |
| **Total** | **3** |

## Issues

### ISSUE-001: Copy says Triage is ahead where the chart says level or behind

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | content |
| **URL** | `/#proof`, `/` (hero), `/#evaluators` |

**Observed:** The Default vs Triage callout says "Triage looks ahead in your holdout" and the hero chip says "Triage ahead but not yet proven for your store", while Kaara's chart on the same page says "Triage is level with or behind it, and the holdout has not proved it ahead (lower bound −11.6%)". On For evaluators, the note says fashion and home decor "run ~3% ahead" while their charts say "level with or behind".

**Expected:** One message per merchant across hero, callout, chart status and note.

**Evidence:** [checkpoint 001](exploration-001.json) (hero), [checkpoint 004](exploration-004.json) (callout, Kaara status, evaluator note and statuses). **Confirmation:** static copy, observed on two loads. Known from an earlier review; unchanged in this build.

**Hypothesis:** the callout, chip and note read the mature-estimate table (Triage 103% vs default 100% for Kaara), while chart statuses read the holdout's pooled week-8 interval, whose midpoint is negative.

---

### ISSUE-002: On a phone, the case panel's Close button scrolls out of view

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |
| **URL** | `/#feed` at 390x844, case CHK-4111 |

**Observed:** After scrolling the panel down to the scored table, the header with Close is no longer visible; closing needs a scroll back to the top.

**Expected:** Close stays reachable while the panel content scrolls (for example a sticky header).

**Evidence:** [checkpoint 005](exploration-005.json), `screenshots/mobile-override-panel-viewport.png`. **Confirmation:** observed once (probe 006); panel scroll position 483 px. Not checked with real touch input.

---

### ISSUE-003: Lift values wrap onto two lines in the scored table

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | case panel, desktop and 390px |

**Observed:** "11.0 pp" renders as "11.0" over "pp" in the panel at both 1280px and 390px (also 17.0, 33.0, 36.3).

**Expected:** Value and unit on one line.

**Evidence:** `screenshots/desktop-override-panel.png`, `screenshots/mobile-override-panel-viewport.png`. **Confirmation:** seen in two screenshots.

---

## The new override tag (C2, C3)

- Override to Payment link on CHK-4111: tags read Payment link "Your override", Voice call + link "Chosen"; the note "Scores are Triage's own. Your override changes what this customer gets, not the analysis." appears; feed row reads "Payment link (your override) | Engine pick: Voice call + link". Clearing the override removed the tag and the note ([checkpoint 002](exploration-002.json)).
- Override equal to Triage's pick (voice switched off, so Triage picks Payment link): only "Chosen", no note; dropdown reads "Payment link (your override, same as Triage)" ([checkpoint 003](exploration-003.json)).
- Same tags and note at 390px ([checkpoint 005](exploration-005.json)).

## Coverage limits

- Accessibility and Performance not tested.
- `$B` viewport emulation reports `maxTouchPoints` 0: scrolling was checked by script, not by touch gestures.
- `screenshots/mobile-override-panel.png` is a full-page capture and shows the document under the fixed panel; `mobile-override-panel-viewport.png` shows what a user sees.
- Probe 006 (final) has no checkpoint by design.

## Proposed test (not written)

None proposed: the override tag lives in app.js's DOM rendering, which has no test harness; a unit test would need a production seam.

## Checkpoints

[checkpoint 001](exploration-001.json) · [checkpoint 002](exploration-002.json) · [checkpoint 003](exploration-003.json) · [checkpoint 004](exploration-004.json) · [checkpoint 005](exploration-005.json)

## Fixes Applied

None. Report-only run.
