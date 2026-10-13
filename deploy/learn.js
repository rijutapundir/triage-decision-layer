/* =============================================================================
   TRIAGE - live learning (Default vs Triage page)
   One simulated week at a time for Kaara (the home decor merchant in sim.js):
   outcomes are drawn from that merchant's TRUE response with a fixed seed, and
   Triage updates a Beta posterior per cause x action from what it observes:
     - holdout (no contact)      -> baseline rate per cause
     - explore, Triage, default  -> conversion rate per cause x action
   The prior is the engine's LIFT_TABLE, held weakly (PRIOR_N pseudo-checkouts).

   Each week ~2,000 checkouts are split: 10% holdout, 10% explore (a random
   allowed action), 40% Triage (decide() on the current posterior means), 40%
   the default rule. Triage vs default is measured on realised outcomes only.

   decide() reads the global LIFT_TABLE, so the learner swaps its estimates in
   and restores them before returning. In the browser it runs in its own Web
   Worker (learn-worker.js): the feed's LIFT_TABLE is never touched.
   ============================================================================= */

function createLearner(E, setup, opt) {
  const { decide, scoreAction, isAllowed, checkGates, diagnose, LIFT_TABLE, LADDER,
          ACTION_COSTS, SHIPPING_SUBSIDY, CAUSE_LABEL, ACTION_LABEL, CASES, MERCHANT_POLICY } = E;
  const o = Object.assign({ perWeek: 2000, seed: 2026, priorN: 20 }, opt);
  const PRIOR = JSON.parse(JSON.stringify(LIFT_TABLE));
  const { elig, truth, P } = setup;

  /* The six cause x action pairs behind most of a home decor store's decisions. */
  const SHOWN = [
    ['bank_decline', 'voice_call'], ['bank_decline', 'payment_link'],
    ['upi_timeout', 'payment_link'], ['upi_timeout', 'retry_prompt'],
    ['price_hesitation', 'free_shipping'], ['price_hesitation', 'discount']
  ];

  let seed, week, base, act, margin;
  /* mulberry32. Not sim.js's LCG: that one overflows exact float integers, so
     consecutive draws correlate, and here they would bias which explore action
     a customer gets against whether that customer pays. */
  const rnd = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function setTable(t) {
    for (const k in t) { LIFT_TABLE[k].baseline = t[k].baseline; for (const a in t[k].lift) LIFT_TABLE[k].lift[a] = t[k].lift[a]; }
  }
  // Run fn with table t in LIFT_TABLE, then put the engine's own table back.
  function withTable(t, fn) {
    const saved = JSON.parse(JSON.stringify(LIFT_TABLE));
    setTable(t);
    try { return fn(); } finally { setTable(saved); }
  }

  function reset() {
    seed = o.seed; week = 0;
    base = {}; act = {};
    for (const k in PRIOR) {
      const b0 = PRIOR[k].baseline;
      base[k] = { a: b0 * o.priorN, b: (1 - b0) * o.priorN, n: 0 };
      act[k] = {};
      for (const a in PRIOR[k].lift) {
        const p = Math.min(0.99, b0 + PRIOR[k].lift[a]);
        act[k][a] = { a: p * o.priorN, b: (1 - p) * o.priorN, n: 0 };
      }
    }
    margin = { tri: { n: 0, s: 0, ss: 0 }, def: { n: 0, s: 0, ss: 0 } };
  }

  const mean = d => d.a / (d.a + d.b);
  const variance = d => d.a * d.b / ((d.a + d.b) ** 2 * (d.a + d.b + 1));

  // Posterior means as an engine table. Lift is clamped at zero, as in the prior.
  function estimate() {
    const t = JSON.parse(JSON.stringify(PRIOR));
    for (const k in t) {
      t[k].baseline = mean(base[k]);
      for (const a in t[k].lift) t[k].lift[a] = Math.max(0, mean(act[k][a]) - t[k].baseline);
    }
    return t;
  }

  const DEFAULT_RULE = c => {
    const want = c.orderValue >= 1500 ? 'voice_call' : 'payment_link';
    if (isAllowed(want, c, P)) return want;
    return isAllowed('payment_link', c, P) ? 'payment_link' : 'hold';
  };

  /* Draw one checkout's outcome under the TRUE response: paid or not, and
     the realised net margin (order margin minus cash spent). */
  function outcome(c, a) {
    return withTable(truth, () => {
      const p0 = LIFT_TABLE[diagnose(c)].baseline;
      const p = a === 'hold' ? p0 : p0 + scoreAction(c, a, P).lift;
      const eff = a === 'discount' ? P.assumedMarginPct - P.discountCeilingPct : P.assumedMarginPct;
      const W = c.orderValue * eff - (a === 'free_shipping' ? SHIPPING_SUBSIDY : 0);
      const paid = rnd() < p;
      return { paid, net: (paid ? W : 0) - (ACTION_COSTS[a] || 0) };
    });
  }

  function observe(c, a, paid) {
    const k = diagnose(c);
    const d = a === 'hold' ? base[k] : act[k][a];
    if (!d) return;
    if (paid) d.a++; else d.b++;
    d.n++;
  }

  function step() {
    const est = estimate();
    const add = (m, x) => { m.n++; m.s += x; m.ss += x * x; };
    for (let i = 0; i < o.perWeek; i++) {
      const c = elig[Math.floor(rnd() * elig.length)];
      const u = rnd();
      let a, arm;
      if (u < 0.10) { a = 'hold'; arm = 'holdout'; }
      else if (u < 0.20) {
        const al = LADDER.filter(x => x !== 'hold' && isAllowed(x, c, P));
        a = al.length ? al[Math.floor(rnd() * al.length)] : 'hold'; arm = 'explore';
      }
      else if (u < 0.60) { a = withTable(est, () => decide(c, P, {}).chosen.action); arm = 'triage'; }
      else { a = DEFAULT_RULE(c); arm = 'default'; }
      const r = outcome(c, a);
      if (arm === 'holdout' || a !== 'hold') observe(c, a, r.paid);
      if (arm === 'triage') add(margin.tri, r.net);
      if (arm === 'default') add(margin.def, r.net);
    }
    week++;
    return state();
  }

  function state() {
    const est = estimate();
    const pairs = SHOWN.map(([k, a]) => {
      const lift = mean(act[k][a]) - mean(base[k]);
      const half = 1.645 * Math.sqrt(variance(act[k][a]) + variance(base[k]));   // 90% interval
      return { cause: k, action: a, label: CAUSE_LABEL[k] + ' × ' + ACTION_LABEL[a],
               liftPp: 100 * lift, loPp: 100 * (lift - half), hiPp: 100 * (lift + half), widthPp: 200 * half,
               n: act[k][a].n, nBase: base[k].n };
    });

    // The feed's cases under the merchant's approved default policy, prior vs learned.
    const changes = [];
    CASES.forEach(c => {
      if (checkGates(c, MERCHANT_POLICY, {}).blocked) return;
      const before = decide(c, MERCHANT_POLICY, {});
      const after = withTable(est, () => decide(c, MERCHANT_POLICY, {}));
      if (before.chosen.action !== after.chosen.action)
        changes.push({ id: c.id, from: before.chosen.label, to: after.chosen.label, reason: after.reason });
    });

    const stat = m => {
      if (m.n < 2) return null;
      const mu = m.s / m.n;
      return { n: m.n, mean: mu, variance: (m.ss - m.n * mu * mu) / (m.n - 1) };
    };
    const T = stat(margin.tri), D = stat(margin.def);
    let vsDefault = null;
    if (T && D) {
      const diff = T.mean - D.mean, se = Math.sqrt(T.variance / T.n + D.variance / D.n);
      vsDefault = { perCheckout: diff, lo: diff - 1.96 * se, hi: diff + 1.96 * se,
                    pct: 100 * diff / D.mean, loPct: 100 * (diff - 1.96 * se) / D.mean, n: T.n + D.n };
    }
    return { week, perWeek: o.perWeek, casesChecked: CASES.filter(c => !checkGates(c, MERCHANT_POLICY, {}).blocked).length,
             pairs, changes, vsDefault };
  }

  reset();
  return { step, state, reset: () => { reset(); return state(); } };
}

if (typeof module !== 'undefined') module.exports = { createLearner };
