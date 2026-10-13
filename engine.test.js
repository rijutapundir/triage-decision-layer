/* Run in a terminal:  node engine.test.js
   Or paste into the browser console on the prototype page.
   These tests are the argument of the product, stated as assertions. */
const { decide, diagnose, scoreAction, resolveCase, summarizeDay,
        LIFT_TABLE, ACTION_COSTS, SHIPPING_SUBSIDY } = require('./engine.js');
const { MERCHANT_POLICY, CASES, DEMO_CONTEXT } = require('./data.js');

const LIFT_TABLE_AT_START = JSON.parse(JSON.stringify(LIFT_TABLE));
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else      { fail++; console.log('  FAIL  ' + name + (detail ? '  ->  ' + detail : '')); }
}
const base = { consentedChannels:['whatsapp','push','voice','email'],
               hasOptedOut:false, contactsThisWeek:0, codRiskScore:0.1,
               couponApplied:false, priorOrders:0, holdoutSeed:0.9 };

console.log('\nTRIAGE engine tests\n');

// 1. A cheap self-healing failure must not get an expensive action.
const a = decide({ ...base, id:'T1', orderValue:679, paymentMethod:'upi',
                   bank:'PhonePe', failureCode:'UPI_TIMEOUT',
                   sessionEndStage:'payment_attempt', isRepeatBuyer:true,
                   priorOrders:3 }, MERCHANT_POLICY, {});
check('Low value UPI timeout picks a link, not a call',
      a.chosen.action === 'payment_link', a.chosen.action);

// 2. A high value failure that does not self-heal must justify the call.
const b = decide({ ...base, id:'T2', orderValue:6399, paymentMethod:'card',
                   bank:'HDFC', failureCode:'BANK_DECLINE',
                   sessionEndStage:'payment_attempt', isRepeatBuyer:false },
                 MERCHANT_POLICY, {});
check('High value bank decline justifies a voice call',
      b.chosen.action === 'voice_call', b.chosen.action);

// 3. Doing nothing must win when no action covers its own cost.
const c = decide({ ...base, id:'T3', orderValue:449, paymentMethod:'card',
                   bank:'ICICI', failureCode:'NO_ATTEMPT',
                   sessionEndStage:'shipping', isRepeatBuyer:false },
                 MERCHANT_POLICY, {});
check('Low value hesitation is held, not contacted',
      c.chosen.action === 'hold', c.chosen.action);

// 4. Consent beats economics, always.
const d = decide({ ...base, id:'T4', orderValue:8000, paymentMethod:'card',
                   bank:'HDFC', failureCode:'BANK_DECLINE',
                   sessionEndStage:'payment_attempt', isRepeatBuyer:true,
                   hasOptedOut:true }, MERCHANT_POLICY, {});
check('An opted out customer is never contacted, whatever the cart is worth',
      d.blocked && d.gate.kind === 'consent', JSON.stringify(d.gate));

// 5. The contact cap holds.
const e = decide({ ...base, id:'T5', orderValue:5000, paymentMethod:'card',
                   bank:'Axis', failureCode:'BANK_DECLINE',
                   sessionEndStage:'payment_attempt', isRepeatBuyer:true,
                   contactsThisWeek:3 }, MERCHANT_POLICY, {});
check('Contact cap stops a case that is otherwise worth calling',
      e.blocked && e.gate.kind === 'frequency', JSON.stringify(e.gate));

// 6. A systemic outage stops outreach entirely.
const f = decide({ ...base, id:'T6', orderValue:5000, paymentMethod:'card',
                   bank:'HDFC', failureCode:'BANK_DECLINE',
                   sessionEndStage:'payment_attempt', isRepeatBuyer:true },
                 MERCHANT_POLICY,
                 { systemicFailure:true, systemicFailureKey:'HDFC' });
check('Clustered bank failures stop outreach and alert the merchant',
      f.blocked && f.gate.kind === 'systemic', JSON.stringify(f.gate));

// 7. Tightening the discount ceiling must change decisions, not just display.
//    Free shipping is off here so the discount wins clearly: with the subsidy
//    costed on converted orders, free shipping beats the discount on almost
//    every hesitation case, and the test would have nothing to detect.
const noShip = { ...MERCHANT_POLICY,
                 allowedActions: MERCHANT_POLICY.allowedActions.filter(x => x !== 'free_shipping') };
const tight  = { ...noShip, discountCeilingPct: 0.0,
                 allowedActions: noShip.allowedActions.filter(x => x !== 'discount') };
const t7 = { ...base, id:'T7', orderValue:5000, paymentMethod:'card', bank:'ICICI',
             failureCode:'NO_ATTEMPT', sessionEndStage:'payment_method', isRepeatBuyer:false,
             consentedChannels:['whatsapp','push','email'] };
const g1 = decide(t7, noShip, {});
const g2 = decide(t7, tight, {});
check('Removing discounts from policy changes the chosen action',
      g1.chosen.action !== g2.chosen.action,
      g1.chosen.action + ' vs ' + g2.chosen.action);

// 8. The day's summary counts holdout cases as no contact (QA ISSUE-001).
const day = CASES.map(c => resolveCase(c, MERCHANT_POLICY, DEMO_CONTEXT));
const sum = summarizeDay(day);
const holdouts = day.filter(r => r.arm === 'holdout');
const actuallyContacted = day.filter(r => !r.d.blocked && r.taken.action !== 'hold').length;
const actualCost = day.filter(r => !r.d.blocked).reduce((t, r) => t + r.taken.cost, 0);
check('Holdout cases are summarised as no contact, at no cost',
      holdouts.length > 0 &&
      holdouts.some(r => r.d.chosen.action !== 'hold') &&          // guard: the test has teeth
      holdouts.every(r => r.taken.action === 'hold' && r.taken.cost === 0) &&
      sum.counts.contact === actuallyContacted &&
      Math.abs(sum.totalCost - actualCost) < 1e-9,
      'contact ' + sum.counts.contact + ' vs ' + actuallyContacted);

// 9. The shipping subsidy is paid only on recovered orders (QA ISSUE-003).
const t9 = { ...base, id:'T9', orderValue:2000, paymentMethod:'card', bank:'ICICI',
             failureCode:'NO_ATTEMPT', sessionEndStage:'shipping', isRepeatBuyer:false,
             contactsThisWeek:1 };
const fs9 = scoreAction(t9, 'free_shipping', MERCHANT_POLICY);
const fatigue9 = MERCHANT_POLICY.contactFatigueCost * (1 + 0.5 * t9.contactsThisWeek);
const pRecover = LIFT_TABLE[diagnose(t9)].baseline + fs9.lift;
const expectedCost = ACTION_COSTS.free_shipping + fatigue9 + pRecover * SHIPPING_SUBSIDY;
check('Free shipping costs contact + fatigue + p(recover) x subsidy',
      Math.abs(fs9.cost - (ACTION_COSTS.free_shipping + fatigue9)) < 1e-9 &&
      Math.abs(fs9.cost + fs9.expectedSubsidy - expectedCost) < 1e-9 &&
      Math.abs(fs9.expectedGain -
        (pRecover * t9.orderValue * MERCHANT_POLICY.assumedMarginPct - expectedCost)) < 1e-9,
      'cost ' + fs9.cost.toFixed(2) + ' + subsidy ' + fs9.expectedSubsidy.toFixed(2) +
      ' vs expected ' + expectedCost.toFixed(2));

// 10. The four cases in the product note are in the feed, acted on, with the note's reasons.
const NOTE_CASES = {
  'CHK-4100': ['payment_link',  'Twice the net value of retry prompt for ₹0.60 more'],
  'CHK-4111': ['voice_call',    'Beats payment link by ₹552'],
  'CHK-4140': ['hold',          'did not clear the margin hurdle'],
  'CHK-4141': ['free_shipping', 'Beats approved discount by ₹23']
};
const noteRows = day.filter(r => NOTE_CASES[r.c.id]);
check('The product note\'s four cases are treated and decided as the note says',
      noteRows.length === 4 && noteRows.every(r =>
        r.arm === 'treated' &&
        r.d.chosen.action === NOTE_CASES[r.c.id][0] &&
        r.d.reason.includes(NOTE_CASES[r.c.id][1])),
      noteRows.map(r => r.c.id + ' ' + r.arm + ' ' + r.d.chosen.action + ': ' + r.d.reason).join(' | '));

// 11. sim.js reproduces the product note's PROOF table, and matches the reference script.
//     Last, because both simulations rewrite LIFT_TABLE while they run (and restore it).
if (typeof require !== 'undefined') {
  const engine = require('./engine.js');
  const simjs  = require('./sim.js');
  const proof  = simjs.runProof({ ...engine, MERCHANT_POLICY });
  simjs.shipAsProven(proof, simjs.runHandover({ ...engine, MERCHANT_POLICY }));
  const NOTE_PROOF = {               // rows of the note's PROOF table, in column order
    defaultPct: [100, 100,  75,  99],
    earlyPct:   [115,  86,  94,  99],
    maturePct:  [123,  98, 104, 108],
    shippedPct: [123, 100, 104,  99]  // Triage only where its holdout proved it by week 8
  };
  const got = k => proof.merchants.map(m => m[k]);
  check('Proof simulation reproduces the note\'s PROOF table',
        Object.keys(NOTE_PROOF).every(k => JSON.stringify(got(k)) === JSON.stringify(NOTE_PROOF[k])),
        Object.keys(NOTE_PROOF).map(k => k + ' ' + got(k).join('/')).join(', '));

  // Run the untouched reference script and read its console.table output.
  const fs = require('fs'), vm = require('vm');
  let refRows = null;
  vm.runInNewContext(fs.readFileSync(__dirname + '/reference/proof_sim_reference.js', 'utf8'),
    { require, __dirname: __dirname + '/reference', console: { table: r => { refRows = r; }, log() {} } });
  const refLine = (r, n) => Object.values(r).slice(1, 5).map(s => +s.match(n)[1]);
  const het = refRows.filter(r => r.scenario.startsWith('lifts differ'));
  check('sim.js matches reference/proof_sim_reference.js exactly',
        het.length === 2 &&
        JSON.stringify(refLine(het[0], /def (\d+)%/)) === JSON.stringify(got('defaultPct')) &&
        JSON.stringify(refLine(het[0], /tri (\d+)%/)) === JSON.stringify(got('earlyPct')) &&
        JSON.stringify(refLine(het[1], /tri (\d+)%/)) === JSON.stringify(got('maturePct')),
        het.map(r => JSON.stringify(r)).join(' | '));
  // 12. Handover timeline: takeover only where the holdout proves Triage ahead.
  const ho = require('./sim.js').runHandover({ ...engine, MERCHANT_POLICY });
  const byName = Object.fromEntries(ho.merchants.map(m => [m.name, m]));
  check('Handover: electronics stays on the default; fashion and beauty hand over',
        byName['High-ticket electronics'].takeoverWeek === null &&
        byName['High-ticket electronics'].provenBehindWeek !== null &&
        byName['Low-ticket fashion'].takeoverWeek === 3 &&
        byName['High-margin D2C beauty'].takeoverWeek === 1,
        ho.merchants.map(m => m.name + ' takeover ' + m.takeoverWeek + ' behind ' + m.provenBehindWeek).join(', '));
  check('Handover: a takeover happens only in a week whose lower bound clears zero',
        ho.merchants.every(m => m.weeks.every(w =>
          w.running === 'default' || (m.takeoverWeek && w.week >= m.takeoverWeek)) &&
          (!m.takeoverWeek || m.weeks[m.takeoverWeek - 1].diffLoPct > 0)));

  // 13. Live learning: after 8 simulated weeks every shown interval is narrower than at week 0.
  const learner = require('./learn.js').createLearner(
    { ...engine, ...require('./data.js') },
    simjs.makeSim({ ...engine, MERCHANT_POLICY }).truthFor('Home decor (Kaara-like)'));
  const w0 = learner.state().pairs.map(p => p.widthPp);
  let wk; for (let i = 0; i < 8; i++) wk = learner.step();
  check('Live learning: after 8 weeks every shown interval is narrower than at week 0',
        wk.week === 8 && wk.pairs.length === 6 && wk.pairs.every((p, i) => p.widthPp < w0[i]),
        wk.pairs.map((p, i) => p.label + ' ' + w0[i].toFixed(1) + '->' + p.widthPp.toFixed(1)).join(', '));

  check('Simulations leave the engine\'s lift table as they found it',
        JSON.stringify(engine.LIFT_TABLE) === JSON.stringify(LIFT_TABLE_AT_START));
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
if (fail > 0 && typeof process !== 'undefined') process.exitCode = 1;
