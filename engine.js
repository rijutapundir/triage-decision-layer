/* =============================================================================
   TRIAGE - decision engine
   Picks the cheapest action that still works for a failed/abandoned checkout.

   HONESTY NOTE: every number in LIFT_TABLE and ACTION_COSTS is an ASSUMPTION.
   None of it is measured. In a real pilot these are replaced by estimates from
   a randomised holdout. They are kept in one place, named, so they are easy to
   audit and easy to challenge.
   ============================================================================= */

/* ---------- 1. The ladder, cheapest first ---------------------------------- */
const LADDER = [
  'hold', 'retry_prompt', 'payment_link', 'voice_call',
  'free_shipping', 'discount', 'human_followup'
];

const ACTION_LABEL = {
  hold:            'Hold',
  retry_prompt:    'Retry prompt',
  payment_link:    'Payment link',
  voice_call:      'Voice call + link',
  free_shipping:   'Free shipping',
  discount:        'Approved discount',
  human_followup:  'Human follow up'
};

/* Direct cost of taking the action, in rupees. Messaging, telephony, agent time.
   free_shipping and discount also cost something on each CONVERTED order (the
   shipping subsidy, the margin given away). That is handled in scoreAction(). */
const ACTION_COSTS = {
  hold:           0,
  retry_prompt:   0.20,   // in-app / push nudge
  payment_link:   0.80,   // WhatsApp template
  voice_call:    14.00,   // voice agent + telephony
  free_shipping:  0.80,   // message cost; subsidy is paid only on converted orders
  discount:       0.80,   // message cost; discount eats margin, added separately
  human_followup:120.00   // support agent time
};

const SHIPPING_SUBSIDY = 60;  // rupees per shipped order, assumption

/* Every contact carries an expected future cost: some share of customers opt out
   or sour on the brand. Without this, a Rs 0.80 WhatsApp message is so cheap that
   messaging everyone always "pays", which is exactly the behaviour this product
   exists to stop. The merchant can tune it on the Policy screen. */
const CONTACT_FATIGUE_COST = 9;   // rupees per contact, rises with recent contacts

/* ---------- 2. Diagnosis ---------------------------------------------------
   Rules, not a model. The failure code and how the session ended are enough to
   separate the causes that matter, and rules are explainable to a merchant.   */
function diagnose(c) {
  if (c.failureCode === 'UPI_TIMEOUT' || c.failureCode === 'PSP_TIMEOUT')
    return 'upi_timeout';
  if (c.failureCode === 'BANK_DECLINE' || c.failureCode === 'INSUFFICIENT_FUNDS')
    return 'bank_decline';
  if (c.failureCode === 'OTP_FAILED' || c.failureCode === 'OTP_ABANDONED')
    return 'otp_dropoff';
  if (c.failureCode === 'NO_ATTEMPT' && c.sessionEndStage === 'shipping')
    return 'price_hesitation';
  if (c.failureCode === 'NO_ATTEMPT' && c.sessionEndStage === 'payment_method')
    return 'price_hesitation';
  if (c.paymentMethod === 'cod' && c.codRiskScore >= 0.6)
    return 'cod_risk';
  return 'price_hesitation';
}

const CAUSE_LABEL = {
  upi_timeout:      'UPI timeout',
  bank_decline:     'Bank decline',
  otp_dropoff:      'OTP drop off',
  price_hesitation: 'Price hesitation',
  cod_risk:         'COD risk'
};

/* ---------- 3. Lift assumptions --------------------------------------------
   baseline = share who complete the purchase with NO contact at all.
   lift[action] = percentage points ADDED by that action, over baseline.
   The whole product rests on the fact that these differ sharply by cause.     */
const LIFT_TABLE = {
  upi_timeout: {      // most of these resolve themselves on a second attempt
    baseline: 0.42,
    lift: { retry_prompt:0.09, payment_link:0.14, voice_call:0.15,
            free_shipping:0.15, discount:0.16, human_followup:0.16 }
  },
  bank_decline: {     // rarely self-resolves; needs a prompt to switch method
    baseline: 0.09,
    lift: { retry_prompt:0.04, payment_link:0.11, voice_call:0.29,
            free_shipping:0.12, discount:0.17, human_followup:0.33 }
  },
  otp_dropoff: {
    baseline: 0.25,
    lift: { retry_prompt:0.10, payment_link:0.17, voice_call:0.21,
            free_shipping:0.17, discount:0.19, human_followup:0.23 }
  },
  price_hesitation: { // contact barely moves it; only an economic change does
    baseline: 0.07,
    lift: { retry_prompt:0.01, payment_link:0.04, voice_call:0.06,
            free_shipping:0.09, discount:0.11, human_followup:0.08 }
  },
  cod_risk: {
    baseline: 0.15,
    lift: { retry_prompt:0.02, payment_link:0.06, voice_call:0.18,
            free_shipping:0.08, discount:0.10, human_followup:0.20 }
  }
};

/* Segment adjustments. Deliberately few and deliberately explainable. */
function adjustLift(base, c, action) {
  let L = base;
  if (c.isRepeatBuyer) L *= 1.10;                       // knows the brand already
  if (action === 'voice_call') {
    if (c.orderValue >= 3000) L *= 1.25;                // worth picking up for
    else if (c.orderValue < 800) L *= 0.70;             // often ignored
  }
  if (action === 'free_shipping' && c.sessionEndStage !== 'shipping') L *= 0.6;
  return L;
}

/* ---------- 4. Scoring -----------------------------------------------------
   netValue = lift x orderValue x effectiveMargin  -  cost of the action.
   A discount is not a cost line, it is a margin reduction, which is why a
   10% coupon on a large cart can lose to free shipping.                       */
function scoreAction(c, action, policy) {
  const cause  = diagnose(c);
  const table  = LIFT_TABLE[cause];
  const margin = policy.assumedMarginPct;

  /* The counterfactual. This is the whole idea in one line: what the merchant
     earns if we do nothing at all. Every action is judged against it. */
  const valueIfWeDoNothing = table.baseline * c.orderValue * margin;

  if (action === 'hold') {
    return { action, label: ACTION_LABEL[action], lift: 0, cost: 0,
             expectedGain: valueIfWeDoNothing, netValue: 0,
             reason: Math.round(table.baseline * 100) +
                     '% of these recover with no contact at all.' };
  }

  const lift = adjustLift(table.lift[action] || 0, c, action);

  /* Discount and free shipping are not cost lines. Each is paid on EVERY
     converted order, including the ones that would have converted anyway:
     the discount as margin given away, free shipping as the subsidy. Nothing
     is paid on orders that do not convert. That is what makes blanket
     discounting expensive, and keeps free shipping from being overcharged. */
  let effMargin       = margin;
  let perOrderSubsidy = 0;
  const cost          = ACTION_COSTS[action];

  if (action === 'discount')      effMargin       = margin - policy.discountCeilingPct;
  if (action === 'free_shipping') perOrderSubsidy = SHIPPING_SUBSIDY;

  const fatigue = (policy.contactFatigueCost !== undefined
                     ? policy.contactFatigueCost : CONTACT_FATIGUE_COST)
                  * (1 + 0.5 * (c.contactsThisWeek || 0));

  const convertedRate  = table.baseline + lift;
  const valueIfWeAct   = convertedRate * (c.orderValue * effMargin - perOrderSubsidy) - cost - fatigue;

  /* Margin handed back on the expected converted orders. Reported so the
     merchant can see what choosing a cheaper rung saved. */
  const marginGiveaway = action === 'discount'
    ? convertedRate * c.orderValue * policy.discountCeilingPct : 0;
  // Subsidy expected to be paid, on converted orders only.
  const expectedSubsidy = convertedRate * perOrderSubsidy;

  return { action, label: ACTION_LABEL[action], lift,
           cost: cost + fatigue,
           expectedGain: valueIfWeAct,
           netValue: valueIfWeAct - valueIfWeDoNothing,
           marginGiveaway, expectedSubsidy,
           reason: '' };
}

/* ---------- 5. Gates -------------------------------------------------------
   Checked BEFORE scoring. A gate can stop everything regardless of economics. */
function checkGates(c, policy, context) {
  if (context && context.systemicFailure &&
      context.systemicFailureKey === (c.bank || c.paymentMethod)) {
    return { blocked: true, kind: 'systemic',
             message: 'Failures are clustered at ' + (c.bank || c.paymentMethod) +
                      '. Outreach stopped and the merchant alerted.' };
  }
  if (c.hasOptedOut) {
    return { blocked: true, kind: 'consent',
             message: 'Customer has opted out of all recovery contact.' };
  }
  if (c.contactsThisWeek >= policy.contactBudgetPerCustomerPerWeek) {
    return { blocked: true, kind: 'frequency',
             message: 'Contact cap reached (' + c.contactsThisWeek + ' of ' +
                      policy.contactBudgetPerCustomerPerWeek + ' this week).' };
  }
  return { blocked: false };
}

const ACTION_CHANNEL = { payment_link:'whatsapp', retry_prompt:'push',
                         voice_call:'voice', free_shipping:'whatsapp',
                         discount:'whatsapp', human_followup:'voice' };
const CHANNEL_LABEL  = { whatsapp:'WhatsApp', push:'push', voice:'voice', email:'email' };

/* Why an action is not allowed for this case, or null if it is allowed. */
function notAllowedReason(action, c, policy) {
  if (action === 'hold') return null;
  if (!policy.allowedActions.includes(action)) return 'Off in policy';
  /* A retry prompt only makes sense if a payment was actually attempted.
     If the customer never got that far, there is nothing to retry. */
  if (action === 'retry_prompt' &&
      (c.failureCode === 'NO_ATTEMPT' ||
       c.sessionEndStage === 'shipping' || c.sessionEndStage === 'payment_method'))
    return 'No payment attempt to retry';
  if (action === 'voice_call' && c.orderValue < policy.minOrderValueForVoice)
    return 'Below \u20B9' + policy.minOrderValueForVoice.toLocaleString('en-IN') + ' voice minimum';
  if (action === 'discount' && policy.discountCeilingPct <= 0) return 'Discounts off';
  const chan = ACTION_CHANNEL[action];
  if (chan && c.consentedChannels && !c.consentedChannels.includes(chan))
    return 'No ' + (CHANNEL_LABEL[chan] || chan) + ' consent';
  return null;
}

function isAllowed(action, c, policy) {
  return notAllowedReason(action, c, policy) === null;
}

/* ---------- 6. The decision ------------------------------------------------ */
const CLOSE_CALL_BAND    = 0.20;  // within 20% of the best net value = a close call
/* Discount hurdle, in rupees. The cost of a discount is certain while its lift
   is an assumption, and repeated discounting trains customers to wait for one,
   a cost this model does not capture. So a discount must clear a hurdle over
   the best non-discount action rather than win on a hair. */
const DISCOUNT_HURDLE    = 20;
/* Gaps smaller than this (rupees) are reported as equivalent, never as a margin. */
const EQUIVALENCE_GAP    = 20;

/* Wording for a tie. "Cheaper rung" only when the winner really costs less.
   Against a discount the honest reason is the margin it would give away. */
function equivalence(winner, other) {
  const base = 'Equivalent to ' + other.label.toLowerCase() + ' in net value';
  if (other.action === 'discount')  return base + '; took the option that gives away no margin.';
  if (winner.cost < other.cost)     return base + '; took the cheaper rung.';
  return base + '.';
}

function decide(c, policy, context) {
  const cause = diagnose(c);
  const gate  = checkGates(c, policy, context);

  const scored = LADDER.map(a => {
    const s = scoreAction(c, a, policy);
    s.allowed = isAllowed(a, c, policy);
    return s;
  });

  if (gate.blocked) {
    return { caseId:c.id, cause, causeLabel:CAUSE_LABEL[cause], scored,
             chosen: scored[0], blocked:true, gate,
             reason: gate.message, outOfPolicy:false };
  }

  const best = list => list.reduce((a,b) => (b.netValue > a.netValue ? b : a), list[0]);

  let eligible = scored.filter(s => s.allowed);
  let top      = best(eligible);

  // Discount hurdle: refuse the discount unless it clearly beats everything else.
  let refusedDiscount = null;
  if (top.action === 'discount') {
    const nonDiscount = eligible.filter(s => s.action !== 'discount');
    const bestOther   = best(nonDiscount);
    if (bestOther && top.netValue - bestOther.netValue < DISCOUNT_HURDLE) {
      refusedDiscount = top;
      eligible = nonDiscount;
      top      = bestOther;
    }
  }

  /* Close calls. The lifts are assumptions, so a gap inside 20% of the best
     net value is not a difference we can measure. Among everything that close,
     take the cheapest rung (earliest in LADDER). */
  const closeSet = eligible.filter(s =>
    s.netValue >= top.netValue - CLOSE_CALL_BAND * Math.abs(top.netValue));
  const winner   = closeSet.reduce((a,b) =>
    (LADDER.indexOf(b.action) < LADDER.indexOf(a.action) ? b : a), closeSet[0]);
  const isCloseCall = closeSet.length > 1;
  const alternative = isCloseCall
    ? closeSet.filter(s => s.action !== winner.action)
              .sort((a,b) => b.netValue - a.netValue)[0]
    : undefined;

  // The runner-up is what makes the reason meaningful: we explain the gap.
  const others   = eligible.filter(s => s.action !== winner.action)
                           .sort((a,b) => b.netValue - a.netValue);
  const runnerUp = others[0];

  let reason;
  if (refusedDiscount) {
    reason = CAUSE_LABEL[cause] + '. Discount scored higher but did not clear the margin hurdle; took ' +
             winner.label.toLowerCase() + ' instead.';
  } else if (isCloseCall) {
    reason = CAUSE_LABEL[cause] + '. ' + equivalence(winner, alternative);
  } else if (winner.action === 'hold') {
    const best = runnerUp ? runnerUp.label.toLowerCase() : 'any allowed action';
    reason = 'Expected lift does not cover the cost of ' + best +
             '. Baseline recovery is ' +
             Math.round(LIFT_TABLE[cause].baseline * 100) + '% with no contact.';
  } else if (runnerUp) {
    const gap = winner.netValue - runnerUp.netValue;
    /* A small rupee gap can still be a large ratio on a small cart. When the
       winner is worth well over the runner-up, say so as a ratio, not a margin. */
    const ratio = runnerUp.netValue > 0 ? winner.netValue / runnerUp.netValue : 0;
    if (gap < EQUIVALENCE_GAP && ratio >= 1.5) {
      const times = ratio >= 1.75 && ratio < 2.5 ? 'Twice' : 'About ' + ratio.toFixed(1) + 'x';
      const extra = winner.cost - runnerUp.cost;
      reason = CAUSE_LABEL[cause] + '. ' + times + ' the net value of ' +
               runnerUp.label.toLowerCase() +
               (extra > 0 ? ' for ₹' + extra.toFixed(2) + ' more.' : '.');
    } else if (gap < EQUIVALENCE_GAP) {
      /* A gap this small is inside the noise of the assumed lifts. Do not
         state it as a precise rupee margin. Only claim the cheaper rung when
         that is actually what was taken. */
      reason = CAUSE_LABEL[cause] + '. ' + equivalence(winner, runnerUp);
    } else {
      reason = CAUSE_LABEL[cause] + '. Beats ' + runnerUp.label.toLowerCase() +
               ' by \u20B9' + Math.round(gap) + ' in net value' +
               (winner.cost < runnerUp.cost
                 ? ' and costs \u20B9' + (runnerUp.cost - winner.cost).toFixed(2) + ' less.'
                 : '.');
    }
  } else {
    reason = CAUSE_LABEL[cause] + '. Only allowed action.';
  }

  // A recommendation the merchant has not pre-approved goes to review instead.
  const outOfPolicy = !policy.allowedActions.includes(winner.action) && winner.action !== 'hold';

  return { caseId:c.id, cause, causeLabel:CAUSE_LABEL[cause], scored,
           chosen:winner, runnerUp, blocked:false, gate, reason, outOfPolicy,
           isCloseCall, alternative, refusedDiscount };
}

/* ---------- 7. Holdout ----------------------------------------------------- */
function assignArm(c, policy) {
  if (c.holdoutSeed < policy.holdoutShare)                      return 'holdout';
  if (c.holdoutSeed < policy.holdoutShare + policy.exploreShare) return 'explore';
  return 'treated';
}

/* ---------- 8. What actually happens ---------------------------------------
   The single source for arms, used by the feed, the Holdout view and the tests.
   Gated cases never get an arm: a gate stops contact for them anyway.
     treated -> the engine's pick
     holdout -> Hold, no contact, so the lift can be measured
     explore -> one allowed contact action, picked deterministically from the
                seed's position inside the explore band                      */
function exploreAction(c, d, policy) {
  const allowed = d.scored.filter(s => s.allowed && s.action !== 'hold');
  if (!allowed.length) return null;
  const i = Math.floor(((c.holdoutSeed - policy.holdoutShare) / policy.exploreShare) * allowed.length);
  return allowed[Math.min(Math.max(i, 0), allowed.length - 1)];
}

function resolveCase(c, policy, context) {
  const d = decide(c, policy, context);
  if (d.blocked) return { c, d, arm: null, taken: d.chosen };
  const arm = assignArm(c, policy);
  const hold = d.scored.find(s => s.action === 'hold');
  let taken = d.chosen;
  if (arm === 'holdout') taken = hold;
  if (arm === 'explore') taken = exploreAction(c, d, policy) || hold;
  return { c, d, arm, taken };
}

/* What the day looks like once arms are applied. Contacted / hold / blocked
   and total cost count what was actually done, not what the engine picked.
   Discount avoided counts treated cases only: elsewhere the engine's pick
   was overridden by the measurement design, not by the hurdle. */
function summarizeDay(resolved) {
  const counts = { contact: 0, hold: 0, blocked: 0 };
  let totalCost = 0, discountAvoided = 0, discountAvoidedCases = 0;
  resolved.forEach(({ d, arm, taken }) => {
    if (d.blocked) { counts.blocked++; return; }
    counts[taken.action === 'hold' ? 'hold' : 'contact']++;
    totalCost += taken.cost;
    if (arm !== 'treated') return;
    const allowed = d.scored.filter(s => s.allowed);
    const top = allowed.reduce((a, b) => (b.netValue > a.netValue ? b : a), allowed[0]);
    if (top.action === 'discount' && d.chosen.action !== 'discount') {
      discountAvoided += top.marginGiveaway;
      discountAvoidedCases++;
    }
  });
  return { counts, totalCost, discountAvoided, discountAvoidedCases };
}

if (typeof module !== 'undefined') {
  module.exports = { LADDER, ACTION_LABEL, ACTION_COSTS, CAUSE_LABEL,
                     LIFT_TABLE, diagnose, scoreAction, decide, assignArm,
                     checkGates, isAllowed, notAllowedReason, exploreAction,
                     resolveCase, summarizeDay, SHIPPING_SUBSIDY };
}
