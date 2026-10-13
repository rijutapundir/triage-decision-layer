# Triage: a decision layer for Agent Studio

Razorpay AI PM Build Challenge, Track 2 (Recover and Grow with AI). Rijuta Pundir, ISB PGP Co'27.

**Live prototype:** https://triage-decision-layer.netlify.app/

Agent Studio's cart recovery agent decides *how* to recover a failed or abandoned checkout. Triage decides *whether* it is worth recovering, which action is cheapest, and whether the action worked. It starts every merchant on the best default rule and takes over only where a holdout proves it earns more.

All data is synthetic. No external APIs or datasets. No Razorpay branding.

## What's in the prototype

| View | What it shows |
|---|---|
| Decision feed | 42 failed or abandoned checkouts for one merchant (Kaara Living), each with Triage's action, cost and a plain reason. A "From the note" tab holds the product note's four worked cases. A "Start here" guide walks a first-time evaluator through five clicks. |
| Policy | Allowed actions, discount ceiling, contact cap, voice minimum and margin, with the live impact of a draft before it is approved. |
| Audit log | Policy approvals, overrides, pause and outage events for the session. |
| Default vs Triage | The merchant's own holdout, week by week, and a "Learning, live" panel that simulates weeks of outcomes and updates Beta posteriors per cause × action. |
| Outcomes, Holdout | A simulated 30-day pilot (aggregate) and today's holdout and explore cases. |
| For evaluators | The four-merchant comparison (one example world, seed 7) and a 20-world robustness summary. |

Merchant controls: per-case override, global pause, and a simulated HDFC outage.

## Repository layout

| Path | Contents |
|---|---|
| `index.html`, `style.css`, `app.js` | The app (vanilla JS, hash routing, no build step) |
| `engine.js` | Diagnosis, scoring, gates, holdout and explore arms |
| `data.js` | Synthetic cases and the merchant's policy |
| `sim.js`, `proof-worker.js` | Four-merchant simulation and handover timeline, run in a Web Worker |
| `learn.js`, `learn-worker.js` | The "Learning, live" panel |
| `engine.test.js` | Tests (engine, the note's cases, simulation, handover, learning) |
| `reference/` | Standalone reference simulations and the 20-world results |
| `deploy/` | Exactly what Netlify serves (see `netlify.toml`) |
| `Triage_Product_Note.*`, `Triage_AI_Build_Log.*` | Submission documents |
| `docs/` | The CEO-style scope review that set the final build plan |
| `.gstack/qa-reports/` | Browser QA reports, evidence and screenshots |

## Run it

No install needed. Open `index.html` through any static server (the simulations use Web Workers, which need http, not file://), for example:

```bash
npx serve deploy
```

Run the tests:

```bash
node engine.test.js
```

`deploy/` is a copy of the site files; keep it in sync before deploying.

## Not included

The challenge brief and other reference material used during the build are confidential or private and are not part of this repository.
