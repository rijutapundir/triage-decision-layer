/* =============================================================================
   TRIAGE - proof simulation
   A port of reference/proof_sim_reference.js, the seeded script behind the
   PROOF table in the product note. Same seed, same call order, same numbers:
   engine.test.js checks this file against the reference and against the note.

   What it does, per merchant (2,000 synthetic checkouts each):
     - each merchant's TRUE lifts differ from the engine's table (sd 0.4)
     - six fixed rules are scored against that truth; the best one, chosen in
       hindsight, is 100%
     - "Triage alone" decides with NOISY lift estimates (early: noise 0.35 and
       10% explore; mature: noise 0.15 and 5% explore) and is scored against
       the same truth. It is not online learning: noise is set, not learned.

   Net margin excludes the notional contact-fatigue cost. Runs in a Web Worker
   in the browser (proof-worker.js) because it rewrites LIFT_TABLE while it runs.
   ============================================================================= */

function makeSim(E) {
  const { MERCHANT_POLICY, decide, scoreAction, checkGates, isAllowed, LIFT_TABLE, LADDER,
          diagnose, SHIPPING_SUBSIDY } = E;

  /* ---- Unchanged from the reference, apart from layout ---- */
  const TRUE = JSON.parse(JSON.stringify(LIFT_TABLE));
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd();
                        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pick = w => { let r = rnd() * w.reduce((a, b) => a + b[1], 0);
                      for (const [k, x] of w) { if ((r -= x) <= 0) return k; } return w[w.length - 1][0]; };
  const logU = (a, b) => Math.round(Math.exp(Math.log(a) + rnd() * (Math.log(b) - Math.log(a))));

  const MERCHANTS = {
    'Low-ticket fashion':      { aov: [300, 1500],   margin: 0.45, mix: [['UPI_TIMEOUT', 35], ['BANK_DECLINE', 10], ['OTP_FAILED', 10], ['NO_ATTEMPT', 45]], repeat: 0.25 },
    'High-ticket electronics': { aov: [6000, 45000], margin: 0.10, mix: [['UPI_TIMEOUT', 15], ['BANK_DECLINE', 45], ['OTP_FAILED', 25], ['NO_ATTEMPT', 15]], repeat: 0.15 },
    'High-margin D2C beauty':  { aov: [600, 3000],   margin: 0.65, mix: [['UPI_TIMEOUT', 25], ['BANK_DECLINE', 20], ['OTP_FAILED', 15], ['NO_ATTEMPT', 40]], repeat: 0.45 },
    'Home decor (Kaara-like)': { aov: [500, 6500],   margin: 0.35, mix: [['UPI_TIMEOUT', 20], ['BANK_DECLINE', 40], ['OTP_FAILED', 10], ['NO_ATTEMPT', 30]], repeat: 0.30 }
  };

  function gen(m, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const fc = pick(m.mix); const rep = rnd() < m.repeat;
      out.push({ id: 'X' + i, orderValue: logU(m.aov[0], m.aov[1]), paymentMethod: fc === 'UPI_TIMEOUT' ? 'upi' : 'card',
        bank: 'B' + (i % 7), failureCode: fc,
        sessionEndStage: fc === 'NO_ATTEMPT' ? (rnd() < 0.55 ? 'shipping' : 'payment_method') : 'payment_attempt',
        isRepeatBuyer: rep, priorOrders: rep ? 2 : 0, codRiskScore: 0.1,
        consentedChannels: rnd() < 0.85 ? ['whatsapp', 'push', 'voice', 'email'] : ['whatsapp', 'push'],
        hasOptedOut: rnd() < 0.04,
        contactsThisWeek: rnd() < 0.08 ? 3 : (rnd() < 0.2 ? 1 : 0), holdoutSeed: rnd(), minutesAgo: 5 });
    }
    return out;
  }
  function setTable(t) { for (const k in t) { LIFT_TABLE[k].baseline = t[k].baseline; for (const a in t[k].lift) LIFT_TABLE[k].lift[a] = t[k].lift[a]; } }
  // Net margin, excluding the notional fatigue cost.
  const NV = (c, a, P) => a === 'hold' ? 0 : scoreAction(c, a, P).netValue + P.contactFatigueCost * (1 + 0.5 * (c.contactsThisWeek || 0));

  const RULES = {
    'Link to all':                          (c, P) => 'payment_link',
    'Link to all, call above ₹1,500':       (c, P) => c.orderValue >= 1500 ? 'voice_call' : 'payment_link',
    'Link to all, call above ₹5,000':       (c, P) => c.orderValue >= 5000 ? 'voice_call' : 'payment_link',
    'Call above ₹1,500, coupon otherwise':  (c, P) => c.orderValue >= 1500 ? 'voice_call' : 'discount',
    'Coupon to all':                        (c, P) => 'discount',
    'Link, coupon if no payment attempt':   (c, P) => c.failureCode === 'NO_ATTEMPT' ? 'discount' : 'payment_link'
  };
  const DEFAULT_RULE = 'Link to all, call above ₹1,500';
  const allowedFallback = (c, a, P) => { if (a === 'hold') return 'hold'; if (isAllowed(a, c, P)) return a;
    if (a !== 'payment_link' && isAllowed('payment_link', c, P)) return 'payment_link'; return 'hold'; };

  /* setups: when given, record each merchant's cases and truth and skip
     scoring Triage. The random draws still happen, so the sequence (and every
     merchant's cases and truth) is identical to a scored run. */
  function run(hetSd, noiseSd, explore, setups) {
    seed = 7; const out = {};
    for (const [mn, m] of Object.entries(MERCHANTS)) {
      const cases = gen(m, 2000);
      const P = { ...MERCHANT_POLICY, assumedMarginPct: m.margin, minOrderValueForVoice: 0 };
      const elig = cases.filter(c => !checkGates(c, P, { systemicFailure: false }).blocked);
      // Merchant-specific truth
      const truth = JSON.parse(JSON.stringify(TRUE));
      if (hetSd > 0) for (const k in truth) for (const a in truth[k].lift) truth[k].lift[a] *= Math.exp(hetSd * gauss());
      setTable(truth);
      const rr = {};
      for (const [rn, f] of Object.entries(RULES)) rr[rn] = elig.reduce((t, c) => t + NV(c, allowedFallback(c, f(c, P), P), P), 0);
      const bestNet = Math.max(...Object.values(rr));
      let tot = 0; const draws = 10;
      for (let d = 0; d < draws; d++) {
        const est = JSON.parse(JSON.stringify(truth));
        for (const k in est) for (const a in est[k].lift) est[k].lift[a] *= Math.exp(noiseSd * gauss());
        if (setups) continue;
        let s = 0;
        for (const c of elig) {
          setTable(est); const a = decide(c, P, {}).chosen.action; setTable(truth);
          const al = LADDER.filter(x => isAllowed(x, c, P));
          const ex = al.reduce((t, x) => t + NV(c, x, P), 0) / al.length;
          s += (1 - explore) * NV(c, a, P) + explore * ex;
        }
        tot += s;
      }
      if (setups) setups[mn] = { elig, truth, P, best: bestNet };
      out[mn] = { best: bestNet, def: rr[DEFAULT_RULE], tri: tot / draws, rules: rr };
    }
    setTable(TRUE);
    return out;
  }
  /* ---- End of the reference logic ---- */

  function proof() {
  // The note's rows 3 and 4: lifts differ by merchant (sd 0.4), early then mature.
  const early  = run(0.4, 0.35, 0.10);
  const mature = run(0.4, 0.15, 0.05);

  const pct = (x, best) => Math.round(100 * x / best);
  const merchants = Object.keys(MERCHANTS).map(name => {
    const e = early[name], m = mature[name];
    const bestRule = Object.keys(m.rules).find(r => m.rules[r] === m.best);
    return {
      name,
      bestRule,
      bestNet: m.best,
      defaultPct: pct(m.def, m.best),
      earlyPct:   pct(e.tri, e.best),
      maturePct:  pct(m.tri, m.best),
      triageWins: m.tri > m.def,
      rulePct: Object.fromEntries(Object.entries(m.rules).map(([r, v]) => [r, pct(v, m.best)]))
    };
  });
  return { defaultRule: DEFAULT_RULE, rules: Object.keys(RULES), merchants };
  }

  /* ---- Handover timeline -------------------------------------------------
     Same merchants, cases and true response as the proof. Each week Triage's
     lift estimates get less noisy (sd 0.35 in week 1 to 0.15 in week 8) and
     explore falls from 10% to 5%. Half of each week's failed checkouts go to
     Triage, half stay on the default. Triage takes over in the first week the
     lower 95% bound of (Triage - default) net margin per checkout, pooled over
     the weeks so far, clears zero. Uncertainty is the outcome noise of each
     checkout (paid or not), computed, not sampled, so no lucky draw decides it. */
  function outcome(c, a, P) {
    const base = LIFT_TABLE[diagnose(c)].baseline;
    const margin = P.assumedMarginPct;
    if (a === 'hold') return { p: base, W: c.orderValue * margin };
    const s = scoreAction(c, a, P);
    const eff = a === 'discount' ? margin - P.discountCeilingPct : margin;
    return { p: base + s.lift, W: c.orderValue * eff - (a === 'free_shipping' ? SHIPPING_SUBSIDY : 0) };
  }
  // Mean and per-checkout variance of realised net margin for a list of [case, action].
  function armStats(pairs, P) {
    let m = 0, m2 = 0, within = 0;
    for (const [c, a] of pairs) {
      const v = NV(c, a, P), o = outcome(c, a, P);
      m += v; m2 += v * v; within += o.p * (1 - o.p) * o.W * o.W;
    }
    const n = pairs.length; m /= n;
    return { mean: m, variance: within / n + (m2 / n - m * m) };
  }

  function handover(opt) {
    const o = Object.assign({ weeks: 8, perWeek: 2800, draws: 2 }, opt);
    const setups = {};
    run(0.4, 0.15, 0.05, setups);
    seed = 11;                       // the timeline's own stream; the proof is untouched
    const result = [];
    for (const [mn, su] of Object.entries(setups)) {
      const { elig, truth, P, best } = su;
      setTable(truth);
      const perCase = best / elig.length;
      const def = armStats(elig.map(c => [c, allowedFallback(c, RULES[DEFAULT_RULE](c, P), P)]), P);
      // Exploring costs: that share of checkouts gets a random allowed action.
      const ex = elig.reduce((t, c) => { const al = LADDER.filter(x => isAllowed(x, c, P));
        return t + al.reduce((u, x) => u + NV(c, x, P), 0) / al.length; }, 0) / elig.length;
      const n = o.perWeek / 2;
      const weeks = []; let sumDiff = 0, sumVar = 0, takeover = null, provenBehind = null;
      for (let w = 1; w <= o.weeks; w++) {
        const f = (w - 1) / (o.weeks - 1);
        const noiseSd = 0.35 - 0.20 * f, explore = 0.10 - 0.05 * f;
        let mean = 0, variance = 0;
        for (let d = 0; d < o.draws; d++) {
          const est = JSON.parse(JSON.stringify(truth));
          for (const k in est) for (const a in est[k].lift) est[k].lift[a] *= Math.exp(noiseSd * gauss());
          const pairs = elig.map(c => { setTable(est); const a = decide(c, P, {}).chosen.action; setTable(truth); return [c, a]; });
          const st = armStats(pairs, P);
          mean += ((1 - explore) * st.mean + explore * ex) / o.draws;
          variance += st.variance / o.draws;
        }
        sumDiff += mean - def.mean;
        sumVar  += (variance + def.variance) / n;
        const diff = sumDiff / w, se = Math.sqrt(sumVar) / w;
        const lo = diff - 1.96 * se, hi = diff + 1.96 * se;
        if (takeover === null && lo > 0) takeover = w;
        if (provenBehind === null && hi < 0) provenBehind = w;   // the default is proven better
        weeks.push({ week: w, noiseSd, explore,
                     triagePct: 100 * mean / perCase, defaultPct: 100 * def.mean / perCase,
                     diffLoPct: 100 * lo / perCase, diffHiPct: 100 * hi / perCase,
                     running: takeover !== null ? 'triage' : 'default' });
      }
      result.push({ name: mn, takeoverWeek: takeover, provenBehindWeek: provenBehind, weeks });
    }
    setTable(TRUE);
    return { perWeek: o.perWeek, weeks: o.weeks, merchants: result };
  }

  return { proof, handover };
}

/* As shipped: the better of the default and mature Triage, but Triage only
   where its holdout proved it ahead by the end of the handover window. */
function shipAsProven(proof, handover) {
  const byName = Object.fromEntries(handover.merchants.map(h => [h.name, h]));
  proof.merchants.forEach(m => {
    const h = byName[m.name];
    m.triageShipped = !!(h && h.takeoverWeek && h.takeoverWeek <= handover.weeks);
    m.shippedPct = m.triageShipped ? Math.max(m.defaultPct, m.maturePct) : m.defaultPct;
  });
  proof.provenBy = handover.weeks;
  return proof;
}

function runProof(E) { return makeSim(E).proof(); }
function runHandover(E, opt) { return makeSim(E).handover(opt); }

if (typeof module !== 'undefined') module.exports = { makeSim, runProof, runHandover, shipAsProven };
