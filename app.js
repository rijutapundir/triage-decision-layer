/* =============================================================================
   TRIAGE - app
   Five views: Decision feed, Policy, Proof, Outcomes, Holdout. Every case runs through
   resolveCase() in engine.js, which applies decide() and the holdout/explore
   arms in one place. Only Outcomes and the pilot-size card use fixed numbers.
   ============================================================================= */

(function () {
  const context = DEMO_CONTEXT;

  /* Policy state, in memory for this session only.
     approved: what the Decision feed uses. draft: what the Policy screen edits. */
  const clone = p => JSON.parse(JSON.stringify(p));
  let approved = clone(MERCHANT_POLICY);
  let draft    = clone(approved);

  const METHOD_LABEL = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', cod: 'COD' };
  const GATE_LABEL   = { systemic: 'Blocked, outage', consent: 'Blocked, opted out', frequency: 'Blocked, contact cap' };
  const gateLabel = d => GATE_LABEL[d.gate.kind] || 'Blocked';

  const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const inr2 = n => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = n => (n < 0 ? '−' : '') + inr2(Math.abs(n));
  const pct = n => (n * 100).toFixed(1) + ' pp';
  const minus1 = n => (n < 0 ? '−' : '') + Math.abs(n).toFixed(1);   // "−4.1", never "-4.1"

  function esc(s) {
    return String(s).replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function ago(min) {
    if (min < 60) return min + ' min ago';
    const h = Math.floor(min / 60), m = min % 60;
    return h + 'h ' + m + 'm ago';
  }

  function method(c) {
    return (METHOD_LABEL[c.paymentMethod] || c.paymentMethod) + (c.bank ? ' · ' + c.bank : '');
  }

  /* A row is { c, d, arm, taken } from resolveCase(): d is the engine's
     decision, taken is what actually happens once the arm is applied. */
  function kind(r) {
    if (r.d.blocked) return 'blocked';
    return r.taken.action === 'hold' ? 'hold' : 'contact';
  }

  // The four worked examples in the product note.
  const NOTE_CASE_IDS = ['CHK-4100', 'CHK-4111', 'CHK-4140', 'CHK-4141'];
  const isNoteCase = r => NOTE_CASE_IDS.includes(r.c.id);

  // Mix key: the action actually taken, or 'blocked' when a gate stopped it.
  const mixKey = r => (r.d.blocked ? 'blocked' : r.taken.action);
  // The engine's decision, for the policy change list: that is what a policy changes.
  const decisionKey   = d => (d.blocked ? 'blocked' : d.chosen.action);
  const decisionLabel = d => (d.blocked ? gateLabel(d) : d.chosen.label);

  /* ---------- Merchant control: overrides, pause, audit log ----------
     Applied on top of the engine, never inside it. An overridden case leaves
     the holdout and explore arms: overrides may teach diagnosis, never lift. */
  const overrides = {};          // caseId -> action the merchant chose
  let paused = false;
  const audit = [];
  function logEvent(who, what) {
    audit.unshift({ at: new Date(), who, what });
    if (!document.getElementById('view-audit').hidden) renderAudit();
  }

  function applyMerchant(r) {
    if (r.d.blocked) return r;
    const hold = r.d.scored.find(s => s.action === 'hold');
    if (paused) return { ...r, arm: 'paused', taken: hold };
    const o = overrides[r.c.id];
    if (o) return { ...r, arm: 'override', taken: r.d.scored.find(s => s.action === o) || hold };
    return r;
  }

  /* ---------- Engine runs ---------- */
  function runAll(policy) {
    return CASES
      .map(c => applyMerchant(resolveCase(c, policy, context)))
      .sort((a, b) => a.c.minutesAgo - b.c.minutesAgo);
  }
  /* Cash is what is actually paid at contact time: messaging, telephony, agent
     time (ACTION_COSTS). The scored cost also carries contact fatigue, an
     expected future cost that is never paid out, so it is reported apart. */
  const cashCost    = r => (r.d.blocked ? 0 : ACTION_COSTS[r.taken.action]);
  const fatigueCost = r => (r.d.blocked ? 0 : r.taken.cost - ACTION_COSTS[r.taken.action]);
  function summarize(rows) {
    const s = summarizeDay(rows);
    s.cashSpend   = rows.reduce((t, r) => t + cashCost(r), 0);
    s.fatigueCost = rows.reduce((t, r) => t + fatigueCost(r), 0);
    return s;
  }

  const avoidedSub = n => n + (n === 1 ? ' case' : ' cases') + ' where a discount scored highest and was refused';

  document.getElementById('merchant-name').textContent = approved.merchantName;
  document.getElementById('avatar').textContent =
    approved.merchantName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  /* =========================================================================
     DECISION FEED
     ========================================================================= */
  const feed      = document.getElementById('feed');
  const filterBar = document.getElementById('filters');
  const mixEl     = document.getElementById('mix');
  let rows = [];
  let filter = { type: 'kind', value: 'all' };

  function renderFeed() {
    rows = runAll(approved);
    const { counts, cashSpend, discountAvoided, discountAvoidedCases } = summarize(rows);

    document.getElementById('summary').innerHTML = [
      ['Cases', rows.length, 'Contacted ' + counts.contact + ' · Hold ' + counts.hold + ' · Blocked ' + counts.blocked],
      ['Cash spend', inr2(cashSpend), 'Messaging, calls and agent time actually paid'],
      ['Discount avoided', inr(discountAvoided), avoidedSub(discountAvoidedCases), true]
    ].map(([k, v, sub, key]) =>
      '<div class="card stat' + (key ? ' stat-key' : '') + '"><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div>' +
      (sub ? '<div class="stat-sub">' + esc(sub) + '</div>' : '') + '</div>').join('');

    /* Filter tabs (by kind) */
    const FILTERS = [['all', 'All', rows.length], ['note', 'From the note', rows.filter(isNoteCase).length],
                     ['contact', 'Contacted', counts.contact],
                     ['hold', 'Hold', counts.hold], ['blocked', 'Blocked', counts.blocked]];
    filterBar.innerHTML = FILTERS.map(([f, label, n]) =>
      '<button type="button" class="tab" data-kind="' + f + '">' + label +
      ' <span class="count">' + n + '</span></button>').join('');

    /* Decision mix (by action), ladder order, blocked last */
    const mixCounts = {};
    rows.forEach(r => { const k = mixKey(r); mixCounts[k] = (mixCounts[k] || 0) + 1; });
    const mix = LADDER.concat('blocked').filter(k => mixCounts[k]).map(k => ({
      key: k, n: mixCounts[k],
      label: k === 'blocked' ? 'Blocked' : k === 'hold' ? 'Hold' : ACTION_LABEL[k]
    }));
    mixEl.innerHTML =
      '<div class="mix-bar">' + mix.map(m =>
        '<button type="button" class="mix-seg seg-' + m.key + '" data-action="' + m.key +
        '" style="flex-grow:' + m.n + '" title="' + esc(m.label + ': ' + m.n) +
        '" aria-label="' + esc(m.label + ', ' + m.n + ' cases') + '"></button>').join('') +
      '</div><div class="mix-legend">' + mix.map(m =>
        '<button type="button" class="mix-key" data-action="' + m.key + '"><span class="swatch seg-' + m.key + '"></span>' +
        esc(m.label) + ' <span class="count">' + m.n + '</span></button>').join('') + '</div>';
    // A new policy can remove the action being filtered on.
    if (filter.type === 'action' && !mixCounts[filter.value]) filter = { type: 'kind', value: 'all' };

    /* Rows */
    feed.innerHTML = rows.map((r, i) => {
      const { c, d, arm, taken } = r;
      const k = kind(r);
      let actionText = d.blocked ? gateLabel(d) : taken.label;
      let pickLine = '';
      if (arm === 'holdout') {
        actionText = ACTION_LABEL.hold + ' (holdout)';
        pickLine = 'Would have chosen: ' + d.chosen.label;
      } else if (arm === 'explore') {
        actionText = taken.label + ' (explore)';
        pickLine = 'Engine pick: ' + d.chosen.label;
      } else if (arm === 'override' && taken.action !== d.chosen.action) {
        actionText = taken.label + ' (your override)';
        pickLine = 'Engine pick: ' + d.chosen.label;
      } else if (arm === 'paused') {
        actionText = ACTION_LABEL.hold + ' (paused)';
        pickLine = 'Engine pick: ' + d.chosen.label;
      }
      const cost = cashCost(r);
      return (
        '<div class="feed-row row-' + k + (isNoteCase(r) ? ' row-note' : '') + '" data-i="' + i + '" data-action="' + mixKey(r) + '" tabindex="0" role="button">' +
          '<div><div>' + ago(c.minutesAgo) + '</div><div class="sub">' + esc(c.id) + '</div></div>' +
          '<div><div class="order-val">' + inr(c.orderValue) + '</div><div class="sub">' + esc(method(c)) + '</div></div>' +
          '<div>' + esc(d.causeLabel) + '</div>' +
          '<div><span class="action">' + esc(actionText) + '</span>' +
            (pickLine ? '<div class="sub pick">' + esc(pickLine) + '</div>' : '') + '</div>' +
          '<div class="reason col-reason">' + esc(d.reason) + '</div>' +
          '<div class="num">' + inr2(cost) + '</div>' +
        '</div>'
      );
    }).join('');

    applyFilter();
  }

  function applyFilter() {
    let shown = 0;
    feed.querySelectorAll('.feed-row').forEach(r => {
      const byFilter = filter.type === 'kind'
        ? (filter.value === 'all' || r.classList.contains('row-' + filter.value))
        : r.dataset.action === filter.value;
      r.hidden = !byFilter;
      if (!r.hidden) shown++;
    });
    document.getElementById('feed-empty').hidden = shown > 0;
    filterBar.querySelectorAll('.tab').forEach(x => {
      const on = filter.type === 'kind' && x.dataset.kind === filter.value;
      x.classList.toggle('active', on); x.setAttribute('aria-pressed', on);
    });
    mixEl.querySelectorAll('[data-action]').forEach(x => {
      const on = filter.type === 'action' && x.dataset.action === filter.value;
      x.classList.toggle('active', on); x.setAttribute('aria-pressed', on);
    });
    mixEl.classList.toggle('filtering', filter.type === 'action');
  }

  filterBar.addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (btn) { filter = { type: 'kind', value: btn.dataset.kind }; applyFilter(); }
  });
  mixEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    // Clicking the active segment again clears it.
    filter = (filter.type === 'action' && filter.value === btn.dataset.action)
      ? { type: 'kind', value: 'all' } : { type: 'action', value: btn.dataset.action };
    applyFilter();
  });

  /* ---------- Detail panel ---------- */
  const panel = document.getElementById('detail');
  const shell = document.querySelector('.shell');
  let selected = null;

  function open(i) {
    const { c, d, arm, taken } = rows[i];
    if (selected) selected.classList.remove('selected');
    selected = feed.querySelector('[data-i="' + i + '"]');
    selected.classList.add('selected');

    document.getElementById('detail-id').textContent = c.id + ' · ' + c.item;
    document.getElementById('detail-sub').textContent = ago(c.minutesAgo) + ' · ' + d.causeLabel;

    const facts = [
      ['Order value', inr(c.orderValue)],
      ['Payment', method(c)],
      ['Failure code', c.failureCode],
      ['Session ended at', c.sessionEndStage],
      ['Repeat buyer', c.isRepeatBuyer ? 'Yes, ' + c.priorOrders + ' prior orders' : 'No'],
      ['Contacts this week', c.contactsThisWeek + ' of ' + approved.contactBudgetPerCustomerPerWeek],
      ['Consented channels', (c.consentedChannels || []).join(', ') || 'None'],
      ['Baseline recovery', Math.round(LIFT_TABLE[d.cause].baseline * 100) + '% with no contact']
    ];

    const winner = d.chosen.action;
    const scoreRows = d.scored.map(s => {
      const cls = [
        s.action === winner ? 'winner' : '',
        s.action === 'hold' ? 'hold' : '',
        s.allowed ? '' : 'not-allowed'
      ].join(' ');
      let tag = '';
      if (s.action === winner) tag = d.blocked ? 'Forced by gate' : 'Chosen';
      else if (!s.allowed) tag = notAllowedReason(s.action, c, approved) || 'Not allowed';
      else if (s.action === 'hold') tag = 'Do nothing';
      return '<tr class="' + cls + '">' +
        '<td>' + esc(s.label) + (tag ? '<span class="tag">' + tag + '</span>' : '') + '</td>' +
        '<td>' + pct(s.lift) + '</td>' +
        '<td>' + signed(s.expectedGain) + '</td>' +
        '<td>' + inr2(s.cost) + '</td>' +
        '<td class="' + (s.netValue < 0 ? 'neg' : '') + '">' + signed(s.netValue) + '</td>' +
      '</tr>';
    }).join('');

    document.getElementById('detail-body').innerHTML =
      '<h3>Decision</h3>' +
      '<div class="card callout' + (d.blocked ? ' blocked' : '') + '">' +
        '<strong>' + esc(d.blocked ? gateLabel(d) : d.chosen.label) + '.</strong> ' + esc(d.reason) +
        (d.isCloseCall
          ? '<div class="close-call"><strong>Close call.</strong> ' + esc(d.alternative.label) + ' scored within 20%.' +
            (d.alternative.action === 'discount' ? ' Took the option that gives away no margin.'
              : d.chosen.cost < d.alternative.cost ? ' Took the cheaper rung.' : '') + '</div>'
          : '') +
        (arm === 'holdout'
          ? '<div class="arm-note"><strong>Holdout.</strong> This case gets no contact, so the lift can be measured. ' +
            'The engine pick above was not acted on.</div>'
          : arm === 'explore'
          ? '<div class="arm-note"><strong>Explore.</strong> This case gets ' + esc(taken.label.toLowerCase()) +
            ' at random (' + inr2(ACTION_COSTS[taken.action]) + ' cash), so per-action lift can be estimated.</div>'
          : arm === 'override' && taken.action !== d.chosen.action
          ? '<div class="arm-note"><strong>Your override.</strong> This case gets ' + esc(taken.label.toLowerCase()) +
            '. It leaves the holdout measurement: overrides can teach diagnosis, never lift.</div>'
          : arm === 'paused'
          ? '<div class="arm-note"><strong>Recovery paused.</strong> No customer is contacted until you resume.</div>'
          : '') +
      '</div>' +
      overrideHtml(rows[i]) +
      '<h3>Case</h3>' +
      '<div class="facts">' + facts.map(([k, v]) =>
        '<div><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div></div>').join('') + '</div>' +
      '<h3>Every action scored</h3>' +
      '<table class="scores"><thead><tr>' +
        '<th>Action</th><th>Lift</th><th>Expected gain</th><th>Cost incl. fatigue</th><th>Net value</th>' +
      '</tr></thead><tbody>' + scoreRows + '</tbody></table>' +
      '<p class="note">Net value is measured against holding. Cost here includes notional contact fatigue, so it is higher than the cash cost in the feed. ' +
        'All lifts and costs are engine assumptions, not measurements.</p>';

    panel.classList.add('open');
    shell.classList.add('panel-open');
    lockPage(true);
    panel.setAttribute('aria-hidden', 'false');
  }

  function overrideHtml({ c, d }) {
    if (d.blocked) {
      return '<h3>Your call</h3><p class="note">A gate stopped contact for this customer, so it cannot be overridden.</p>';
    }
    const cur = overrides[c.id] || '';
    const offered = d.scored.filter(s => s.allowed && s.action !== d.chosen.action);
    // The override in force is always shown and selected, even when Triage now picks the same action.
    const inForce = cur && !offered.some(s => s.action === cur)
      ? '<option value="' + cur + '" selected>' + esc(ACTION_LABEL[cur]) + ' (your override, same as Triage)</option>' : '';
    const opts = '<option value=""' + (cur ? '' : ' selected') + '>Triage\'s decision: ' + esc(d.chosen.label) + '</option>' + inForce +
      offered.map(s =>
        '<option value="' + s.action + '"' + (cur === s.action ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('');
    return '<h3>Your call</h3>' +
      '<label class="override"><span>Override this decision</span><select id="override" data-case="' + esc(c.id) + '">' + opts + '</select></label>' +
      '<p class="note">Only actions your policy allows are offered. Every override is logged.</p>';
  }

  document.getElementById('detail-body').addEventListener('change', e => {
    if (e.target.id !== 'override') return;
    const id = e.target.dataset.case, v = e.target.value;
    const r = rows.find(x => x.c.id === id);
    if (v) { overrides[id] = v; logEvent('Merchant', 'Overrode ' + id + ': ' + r.d.chosen.label + ' → ' + ACTION_LABEL[v]); }
    else   { delete overrides[id]; logEvent('Merchant', 'Cleared override on ' + id + ', back to ' + r.d.chosen.label); }
    refresh();
    open(rows.findIndex(x => x.c.id === id));
  });

  /* Re-render whatever depends on the merchant layer. */
  function refresh() {
    renderFeed();
    renderBanner();
    const v = viewFromHash();
    if (v === 'holdout') renderHoldout();
  }

  function renderBanner() {
    const el = document.getElementById('feed-banner');
    const pauseBtn = document.getElementById('pause');
    pauseBtn.textContent = paused ? 'Resume recovery' : 'Pause recovery';
    pauseBtn.setAttribute('aria-pressed', paused);
    pauseBtn.classList.toggle('on', paused);
    const msgs = [];
    if (context.systemicFailure) {
      const n = rows.filter(r => r.d.blocked && r.d.gate.kind === 'systemic').length;
      msgs.push('<strong>Alert: failures are clustered at ' + esc(context.systemicFailureKey) + '.</strong> ' +
        'This looks like a bank outage, not ' + n + ' customers changing their minds. Outreach to these ' + n +
        ' cases has stopped; they are marked "Blocked, outage" below.');
    }
    if (paused) msgs.push('<strong>Recovery paused.</strong> Triage still decides and logs every case, but no customer is contacted until you resume.');
    el.innerHTML = msgs.map(m => '<p>' + m + '</p>').join('');
    el.hidden = !msgs.length;
  }

  document.getElementById('outage').addEventListener('click', () => {
    context.systemicFailure = !context.systemicFailure;
    const btn = document.getElementById('outage');
    btn.textContent = context.systemicFailure ? 'End HDFC outage' : 'Simulate HDFC outage';
    btn.setAttribute('aria-pressed', context.systemicFailure);
    btn.classList.toggle('on', context.systemicFailure);
    logEvent('Merchant', (context.systemicFailure ? 'Started' : 'Ended') + ' a simulated ' + context.systemicFailureKey + ' outage');
    if (context.systemicFailure) logEvent('Triage', 'Failures clustered at ' + context.systemicFailureKey + ': outreach to those cases stopped, merchant alerted');
    refresh();
  });

  document.getElementById('pause').addEventListener('click', () => {
    paused = !paused;
    logEvent('Merchant', paused ? 'Paused all recovery' : 'Resumed recovery');
    refresh();
  });

  function renderAudit() {
    const t = document.getElementById('audit-table');
    t.innerHTML = '<thead><tr><th>Time</th><th>Who</th><th>What</th></tr></thead><tbody>' +
      audit.map(a => '<tr><td>' + esc(a.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })) +
        '</td><td>' + esc(a.who) + '</td><td>' + esc(a.what) + '</td></tr>').join('') + '</tbody>';
  }

  /* Phones: the case panel is full screen, so pin the page behind it.
     position:fixed holds on iOS Safari, where overflow:hidden alone does not. */
  const phone = window.matchMedia('(max-width: 767px)');
  let lockedAt = null;
  function lockPage(on) {
    const b = document.body.style;
    if (on && phone.matches && lockedAt === null) {
      lockedAt = window.scrollY;
      document.documentElement.classList.add('panel-lock');
      b.position = 'fixed'; b.top = -lockedAt + 'px'; b.left = '0'; b.right = '0';
    } else if (!on && lockedAt !== null) {
      document.documentElement.classList.remove('panel-lock');
      b.position = b.top = b.left = b.right = '';
      window.scrollTo(0, lockedAt);
      lockedAt = null;
    }
  }

  function close() {
    panel.classList.remove('open');
    shell.classList.remove('panel-open');
    lockPage(false);
    panel.setAttribute('aria-hidden', 'true');
    if (selected) selected.classList.remove('selected');
    selected = null;
  }

  feed.addEventListener('click', e => {
    const row = e.target.closest('.feed-row');
    if (row) open(+row.dataset.i);
  });
  feed.addEventListener('keydown', e => {
    const row = e.target.closest('.feed-row');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(+row.dataset.i); }
  });
  document.getElementById('detail-close').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  /* =========================================================================
     POLICY
     ========================================================================= */

  /* Control ranges. These bound what the merchant can choose; they are not
     results, so they live here rather than in data.js. */
  const RANGES = {
    discountCeilingPct:              { min: 0,    max: 0.25,  step: 0.01 },
    contactBudgetPerCustomerPerWeek: { min: 0,    max: 7,     step: 1 },
    minOrderValueForVoice:           { min: 0,    max: 10000, step: 100 },
    assumedMarginPct:                { min: 0.10, max: 0.60,  step: 0.01 }
  };
  const asPct = v => Math.round(v * 100) + '%';
  const CHANGE_LIST_CAP = 8;

  const SLIDERS = [
    { key: 'discountCeilingPct', label: 'Discount ceiling', fmt: asPct,
      help: 'The largest discount Triage may offer. At 0% discounts are off.' },
    { key: 'minOrderValueForVoice', label: 'Minimum order value for a voice call', fmt: inr,
      help: 'Calls cost more than messages, so small carts never get one.' },
    { key: 'assumedMarginPct', label: 'Assumed margin', fmt: asPct,
      help: 'Razorpay does not hold your cost of goods, so you supply this. It sets what a recovered order is worth.' }
  ];

  const policyControls = document.getElementById('policy-controls');

  function controlsHtml() {
    const rungs = LADDER.map(a => {
      if (a === 'hold') {
        return '<div class="toggle-row locked"><span class="toggle-label">' + esc(ACTION_LABEL.hold) +
          '</span><span class="lock">Always available</span></div>';
      }
      const on = draft.allowedActions.includes(a);
      return '<label class="toggle-row"><span class="toggle-label">' + esc(ACTION_LABEL[a]) + '</span>' +
        '<span class="switch-wrap"><input type="checkbox" class="switch" data-action="' + a + '"' + (on ? ' checked' : '') +
        '><svg class="switch-check" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 6.2 2 2 4-4.4"/></svg></span></label>';
    }).join('');

    const slider = s => {
      const r = RANGES[s.key];
      return '<div class="control">' +
        '<div class="control-head"><label for="ctl-' + s.key + '">' + esc(s.label) + '</label>' +
        '<span class="control-val" data-val="' + s.key + '">' + esc(s.fmt(draft[s.key])) + '</span></div>' +
        '<input type="range" id="ctl-' + s.key + '" data-key="' + s.key + '" min="' + r.min + '" max="' + r.max +
        '" step="' + r.step + '" value="' + draft[s.key] + '">' +
        '<div class="range-ends"><span>' + esc(s.fmt(r.min)) + '</span><span>' + esc(s.fmt(r.max)) + '</span></div>' +
        '<p class="help">' + esc(s.help) + '</p></div>';
    };

    const b = RANGES.contactBudgetPerCustomerPerWeek;
    const budget = draft.contactBudgetPerCustomerPerWeek;
    const stepper =
      '<div class="control">' +
        '<div class="control-head"><span>Contact budget per customer per week</span></div>' +
        '<div class="stepper">' +
          '<button type="button" class="btn" data-step="-1" aria-label="Fewer contacts"' + (budget <= b.min ? ' disabled' : '') + '>−</button>' +
          '<span class="stepper-val" data-val="contactBudgetPerCustomerPerWeek">' + budget + '</span>' +
          '<button type="button" class="btn" data-step="1" aria-label="More contacts"' + (budget >= b.max ? ' disabled' : '') + '>+</button>' +
        '</div>' +
        '<p class="help">Once a customer has been contacted this many times in a week, Triage stops.</p>' +
      '</div>';

    return '<div class="card section"><h2>Allowed actions</h2>' +
        '<p class="help">Only switched-on actions can ever be chosen.</p>' +
        '<div class="toggles">' + rungs + '</div></div>' +
      '<div class="card section"><h2>Limits</h2>' +
        slider(SLIDERS[0]) + stepper + slider(SLIDERS[1]) + '</div>' +
      '<div class="card section"><h2>Economics</h2>' +
        slider(SLIDERS[2]) + '</div>';
  }

  function samePolicy(a, b) {
    const norm = p => JSON.stringify({ ...p, allowedActions: LADDER.filter(x => p.allowedActions.includes(x)) });
    return norm(a) === norm(b);
  }

  function renderImpact() {
    const before = runAll(approved), after = runAll(draft);
    const sb = summarize(before), sa = summarize(after);
    const byId = new Map(before.map(r => [r.c.id, r.d]));

    const changed = after
      .filter(({ c, d }) => decisionKey(byId.get(c.id)) !== decisionKey(d))
      .map(({ c, d }) => ({ id: c.id, from: decisionLabel(byId.get(c.id)), to: decisionLabel(d) }))
      .sort((x, y) => x.id.localeCompare(y.id));

    /* Change badge vs the approved policy. good = which direction is better:
       'down' for cost, 'up' for discount avoided, null when neither is better. */
    const delta = (now, was, fmt, good) => {
      if (Math.abs(now - was) < 0.005) return '<span class="chg flat">No change</span>';
      const up = now > was;
      const tone = good == null ? 'neutral' : (up === (good === 'up') ? 'good' : 'bad');
      return '<span class="chg ' + tone + '">' + (up ? '↑' : '↓') + ' from ' + esc(fmt ? fmt(was) : was) + '</span>';
    };

    const stat = (k, v, d, extra) => '<div class="istat"><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div>' +
      d + (extra ? '<div class="stat-sub">' + esc(extra) + '</div>' : '') + '</div>';

    const shown = changed.slice(0, CHANGE_LIST_CAP);
    const list = changed.length
      ? '<ul class="changes">' + shown.map(ch =>
          '<li><span class="cid">' + esc(ch.id) + '</span><span class="from">' + esc(ch.from) +
          '</span><span class="arrow" aria-label="becomes">→</span><span class="to">' + esc(ch.to) + '</span></li>').join('') +
        '</ul>' +
        (changed.length > shown.length ? '<p class="more">and ' + (changed.length - shown.length) + ' more</p>' : '')
      : '<p class="help">No decisions change. The draft behaves exactly like the approved policy.</p>';

    document.getElementById('impact').innerHTML =
      '<div class="headline' + (changed.length ? ' has-changes' : '') + '"><strong>' + changed.length + ' of ' + after.length +
        '</strong> decisions change</div>' +
      list +
      '<div class="istats">' +
        stat('Contacted', sa.counts.contact, delta(sa.counts.contact, sb.counts.contact)) +
        stat('Hold', sa.counts.hold, delta(sa.counts.hold, sb.counts.hold)) +
        stat('Blocked', sa.counts.blocked, delta(sa.counts.blocked, sb.counts.blocked)) +
        stat('Cash spend', inr2(sa.cashSpend), delta(sa.cashSpend, sb.cashSpend, inr2, 'down'),
          '+ ' + inr2(sa.fatigueCost) + ' notional fatigue cost') +
        stat('Discount avoided', inr(sa.discountAvoided),
          delta(Math.round(sa.discountAvoided), Math.round(sb.discountAvoided), inr, 'up'),
          avoidedSub(sa.discountAvoidedCases)) +
      '</div>';

    const dirty = !samePolicy(draft, approved);
    const status = document.getElementById('policy-status');
    status.textContent = dirty ? 'Draft, not yet approved' : 'Approved. The Decision feed is using this policy.';
    status.classList.toggle('draft', dirty);
    document.getElementById('approve').disabled = !dirty;
  }

  function renderPolicy() {
    policyControls.innerHTML = controlsHtml();
    renderImpact();
  }

  // Sliders update the draft live without re-rendering, so dragging stays smooth.
  policyControls.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.key) {
      draft[t.dataset.key] = +t.value;
      const s = SLIDERS.find(x => x.key === t.dataset.key);
      policyControls.querySelector('[data-val="' + t.dataset.key + '"]').textContent = s.fmt(draft[t.dataset.key]);
      renderImpact();
    }
  });
  policyControls.addEventListener('change', e => {
    const t = e.target;
    if (t.classList.contains('switch')) {
      const a = t.dataset.action;
      draft.allowedActions = t.checked
        ? LADDER.filter(x => x === a || draft.allowedActions.includes(x))
        : draft.allowedActions.filter(x => x !== a);
      renderImpact();
    }
  });
  policyControls.addEventListener('click', e => {
    const btn = e.target.closest('[data-step]');
    if (!btn) return;
    const r = RANGES.contactBudgetPerCustomerPerWeek;
    const v = draft.contactBudgetPerCustomerPerWeek + +btn.dataset.step;
    draft.contactBudgetPerCustomerPerWeek = Math.min(r.max, Math.max(r.min, v));
    renderPolicy();
  });

  document.getElementById('approve').addEventListener('click', () => {
    const changes = Object.keys(draft).filter(k => k !== 'allowedActions' && draft[k] !== approved[k])
      .map(k => k + ' ' + approved[k] + ' → ' + draft[k]);
    const on  = draft.allowedActions.filter(a => !approved.allowedActions.includes(a)).map(a => ACTION_LABEL[a] + ' on');
    const off = approved.allowedActions.filter(a => !draft.allowedActions.includes(a)).map(a => ACTION_LABEL[a] + ' off');
    logEvent('Merchant', 'Approved policy: ' + (on.concat(off, changes).join(', ') || 'no changes'));
    approved = clone(draft);
    // Nothing outside the approved policy ever runs, overrides included.
    Object.keys(overrides).forEach(id => {
      const c = CASES.find(x => x.id === id);
      if (overrides[id] !== 'hold' && !isAllowed(overrides[id], c, approved)) {
        logEvent('Triage', 'Override cleared: ' + ACTION_LABEL[overrides[id]] + ' no longer allowed by policy (' + id + ')');
        delete overrides[id];
      }
    });
    renderFeed();
    renderImpact();
  });
  document.getElementById('reset').addEventListener('click', () => {
    draft = clone(DEFAULT_POLICY);
    renderPolicy();
  });

  /* =========================================================================
     OUTCOMES
     Simulated. Unlike the feed and the policy screen, these numbers do not
     come from the engine: they stand in for what a randomised holdout would
     measure in production.
     ========================================================================= */
  const SIMULATED_OUTCOMES = {
    window: '30-day pilot',
    failedCheckouts: 12000,
    avgOrderValue: 1400,                 // rupees
    marginPct: 0.35,

    // Randomised arms. The holdout gets no contact at all.
    holdout: { cases: 1200,  recovered: 174 },
    treated: { cases: 10800, recovered: 2022 },
    incrementalCi95Pp: [2.1, 6.3],       // 95% CI on the treated - holdout gap

    /* Treated arm, split by the action Triage chose. Discount and free shipping
       spend is counted on recovered orders only (margin given away, subsidy). */
    byAction: [
      { action: 'hold',          cases: 4728, spend: 0,     recoveries: 678 },
      { action: 'retry_prompt',  cases: 1500, spend: 300,   recoveries: 240 },
      { action: 'payment_link',  cases: 2700, spend: 2160,  recoveries: 600 },
      { action: 'voice_call',    cases: 720,  spend: 10080, recoveries: 228 },
      { action: 'free_shipping', cases: 432,  spend: 5386,  recoveries: 84 },
      { action: 'discount',      cases: 720,  spend: 27456, recoveries: 192 }
    ],

    spendNote: 'Discount and free shipping are costed on recovered orders only: 10% margin and the ₹60 subsidy.',
    note: 'Simulated outcomes for demonstration. In production, these come from the randomised holdout.'
  };

  function renderOutcomes() {
    const o = SIMULATED_OUTCOMES;
    const pct1 = r => (r * 100).toFixed(1) + '%';
    const sum = k => o.byAction.reduce((t, r) => t + r[k], 0);

    /* Everything below is derived from the arms and the per-action rows, so the
       cards, chart and table cannot disagree with each other. */
    const holdoutRate   = o.holdout.recovered / o.holdout.cases;
    const treatedRate   = o.treated.recovered / o.treated.cases;
    const liftPp        = (treatedRate - holdoutRate) * 100;
    const incOrders     = Math.round(o.treated.recovered - o.treated.cases * holdoutRate);
    const incMargin     = incOrders * o.avgOrderValue * o.marginPct;
    const totalSpend    = sum('spend');
    const netMargin     = incMargin - totalSpend;
    const costPerInc    = totalSpend / incOrders;
    const costPerRecov  = totalSpend / o.treated.recovered;
    const [ciLo, ciHi]  = o.incrementalCi95Pp;

    document.getElementById('outcome-stats').innerHTML = [
      ['Incremental recovery rate', '+' + liftPp.toFixed(1) + 'pp',
        pct1(treatedRate) + ' treated vs ' + pct1(holdoutRate) + ' holdout · 95% CI +' + ciLo.toFixed(1) + ' to +' + ciHi.toFixed(1) + 'pp'],
      ['Incremental orders', '+' + incOrders.toLocaleString('en-IN'),
        'Orders that would not have happened without contact'],
      ['Net incremental margin', inr(netMargin),
        inr(incMargin) + ' margin from incremental orders, minus ' + inr(totalSpend) + ' spend'],
      ['Cost per incremental order', inr(costPerInc),
        'vs ' + inr(costPerRecov) + ' per recovery. Most recoveries would have happened anyway.']
    ].map(([k, v, sub]) =>
      '<div class="card stat"><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div>' +
      '<div class="stat-sub">' + esc(sub) + '</div></div>').join('');

    /* Spend table. Cost per recovery shows a dash where nothing was spent. */
    const label = a => ACTION_LABEL[a];
    const perRecovery = (spend, rec) => (spend > 0 && rec > 0) ? inr2(spend / rec) : '—';
    const num = n => n.toLocaleString('en-IN');

    document.getElementById('spend-table').innerHTML =
      '<thead><tr><th>Action</th><th class="num">Cases</th><th class="num">Spend</th>' +
      '<th class="num">Recoveries</th><th class="num">Cost per recovery</th></tr></thead><tbody>' +
      o.byAction.map(r =>
        '<tr><td><span class="swatch seg-' + r.action + '"></span>' + esc(label(r.action)) + '</td>' +
        '<td class="num">' + num(r.cases) + '</td>' +
        '<td class="num">' + inr(r.spend) + '</td>' +
        '<td class="num">' + num(r.recoveries) + '</td>' +
        '<td class="num">' + perRecovery(r.spend, r.recoveries) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td>' +
        '<td class="num">' + num(sum('cases')) + '</td>' +
        '<td class="num">' + inr(totalSpend) + '</td>' +
        '<td class="num">' + num(sum('recoveries')) + '</td>' +
        '<td class="num">' + inr2(costPerRecov) + '</td>' +
      '</tr></tfoot>';
    document.getElementById('spend-footnote').textContent = o.spendNote;

    document.getElementById('sim-note').textContent = o.note;
  }

  /* =========================================================================
     HOLDOUT
     Computed from the same resolveCase() rows as the feed, under the approved
     policy, so the two can never disagree. Only the power-check card is fixed copy.
     ========================================================================= */
  const holdoutTable = document.getElementById('holdout-table');

  function renderHoldout() {
    const p = approved;
    const eligible = runAll(p).filter(({ d }) => !d.blocked);
    const inArm = a => eligible.filter(r => r.arm === a);
    const holdout = inArm('holdout'), explore = inArm('explore'), treated = inArm('treated');
    const overridden = inArm('override'), paused = inArm('paused');

    // Price of measuring: the net value Triage expected from its choice, given up on holdout cases.
    const price = holdout.reduce((t, { d }) => t + d.chosen.netValue, 0);
    const share = x => Math.round(x * 100) + '%';
    const ofToday = (n, target) => n + ' of ' + eligible.length + ' today (target ' + share(target) + '; small samples vary)';

    document.getElementById('holdout-stats').innerHTML = [
      ['Treated', treated.length + overridden.length,
        'Of ' + eligible.length + ' eligible cases today: ' + treated.length + ' acted on as chosen' +
        (overridden.length ? ', ' + overridden.length + ' treated (override)' : '') +
        (paused.length ? '. ' + paused.length + ' held while paused' : '')],
      ['Holdout · target ' + share(p.holdoutShare), holdout.length, ofToday(holdout.length, p.holdoutShare) + '. No contact.'],
      ['Explore · target ' + share(p.exploreShare), explore.length, ofToday(explore.length, p.exploreShare) + '. A random allowed action.'],
      ['Price of measuring', inr(price), 'Expected value given up today to keep the measurement honest', true]
    ].map(([k, v, sub, key]) =>
      '<div class="card stat' + (key ? ' stat-price' : '') + '"><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div>' +
      '<div class="stat-sub">' + esc(sub) + '</div></div>').join('');

    const listed = holdout.concat(explore).sort((a, b) => a.c.id.localeCompare(b.c.id));
    holdoutTable.innerHTML =
      '<thead><tr><th>Case ID</th><th>Order</th><th>Cause</th><th>Triage would have chosen</th><th>What happened</th></tr></thead><tbody>' +
      (listed.length ? listed.map(({ c, d, arm, taken }) => {
        const happened = arm === 'holdout'
          ? '<span class="happened hold">' + esc(ACTION_LABEL.hold) + ' (holdout)</span>'
          : '<span class="happened explore">' + esc(taken.label) + ' (explore)</span>';
        return '<tr data-case="' + esc(c.id) + '" tabindex="0">' +
          '<td>' + esc(c.id) + '</td>' +
          '<td><div class="order-val">' + inr(c.orderValue) + '</div><div class="sub">' + esc(method(c)) + '</div></td>' +
          '<td>' + esc(d.causeLabel) + '</td>' +
          '<td>' + esc(d.chosen.label) + '</td>' +
          '<td>' + happened + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="empty">No holdout or explore cases today.</td></tr>') +
      '</tbody>';
  }

  // Rows open the same detail panel as the feed.
  function openCase(id) {
    const i = rows.findIndex(r => r.c.id === id);
    if (i >= 0) open(i);
  }
  holdoutTable.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-case]');
    if (tr) openCase(tr.dataset.case);
  });
  holdoutTable.addEventListener('keydown', e => {
    const tr = e.target.closest('tr[data-case]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCase(tr.dataset.case); }
  });

  /* =========================================================================
     PROOF
     The seeded simulation behind the note's PROOF table (sim.js), run in a
     Web Worker at page load. Nothing on this view is typed in by hand.
     ========================================================================= */
  let proof = null;
  const PROOF_ROWS = [
    ['defaultPct', 'Best single default: link to all, call above ₹1,500'],
    ['earlyPct',   'Triage alone, first weeks, 10% explore'],
    ['maturePct',  'Triage alone, estimates mature, 5% explore'],
    ['shippedPct', 'As shipped: Triage only where its holdout proved it', 'shipped']
  ];
  const shortName = n => n.replace(' (Kaara-like)', ', Kaara-like');
  const pctCell = (v, extra) => '<td class="num' + (v < 90 ? ' amber' : '') + (extra || '') + '">' + v + '%</td>';

  function renderProof() {
    const table = document.getElementById('proof-table');
    if (!proof) {
      table.innerHTML = '<tbody><tr><td class="empty">Running 16,000 simulated checkouts in your browser…</td></tr></tbody>';
      return;
    }
    const ms = proof.merchants;
    table.innerHTML =
      '<thead><tr><th>vs best fixed rule in hindsight</th>' + ms.map(m => '<th class="num">' + esc(shortName(m.name)) + '</th>').join('') +
      '<th class="num">Worst</th></tr></thead><tbody>' +
      PROOF_ROWS.map(([k, label, cls]) =>
        '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(label) + '</td>' +
        ms.map(m => pctCell(m[k])).join('') +
        pctCell(Math.min(...ms.map(m => m[k]))) + '</tr>').join('') +
      '</tbody>';
    document.getElementById('proof-foot').textContent =
      '2,000 synthetic checkouts per merchant (seed 7), each merchant with its own true response: lifts vary by merchant (sd 0.4). ' +
      '100% = the best of six fixed rules for that merchant, picked in hindsight; over 100% = more net margin than that rule; amber = below 90%. ' +
      'Triage gets no thresholds and pays for noise and exploring. Net margin excludes the notional fatigue cost. ' +
      'As shipped: Triage where its holdout proved it ahead by week ' + proof.provenBy + ' (' +
      ms.filter(m => m.triageShipped).map(m => shortName(m.name)).join('; ') +
      '), the default elsewhere. Computed in your browser in ' + (proof.ms / 1000).toFixed(1) + 's.';
    const unproven = ms.filter(m => !m.triageShipped && m.triageWins);
    document.getElementById('proof-note').textContent = unproven.map(m =>
      shortName(m.name).replace(', Kaara-like', '') + ' stays on the default: Triage runs ~' + (m.maturePct - m.defaultPct) +
      '% ahead but its holdout has not proven it by week 16.').join(' ');

    document.getElementById('rules-table').innerHTML =
      '<thead><tr><th>Fixed rule</th>' + ms.map(m => '<th class="num">' + esc(shortName(m.name)) + '</th>').join('') + '</tr></thead><tbody>' +
      proof.rules.map(r => '<tr' + (r === proof.defaultRule ? ' class="is-default"' : '') + '><td>' + esc(r) +
        (r === proof.defaultRule ? '<span class="tag">Default</span>' : '') + '</td>' +
        ms.map(m => '<td class="num' + (m.bestRule === r ? ' best' : '') + (m.rulePct[r] < 0 ? ' neg' : '') + '">' +
          (m.rulePct[r] < 0 ? '−' + Math.abs(m.rulePct[r]) : m.rulePct[r]) + '%</td>').join('') + '</tr>').join('') +
      '</tbody>';
  }

  function renderHero() {
    // The merchant's own view: its mode only, never other merchants' numbers.
    document.getElementById('hero-foot').innerHTML =
      '<span class="mode-chip">Running: best default · Triage ahead but not yet proven for your store</span>' +
      '<a href="#proof">See Default vs Triage →</a>';
  }

  /* ---------- Handover timeline ----------
     One small chart per merchant: weekly net margin of Triage and of the
     default, as % of that merchant's best fixed rule. Shaded weeks = Triage
     running, which starts only once the holdout's lower bound clears zero. */
  let handover = null;
  const KAARA = 'Home decor (Kaara-like)';

  function status(m) {
    if (m.takeoverWeek) return { cls: 'on', text: 'Triage takes over in week ' + m.takeoverWeek + ', once the holdout proves it ahead.' };
    // Judge by the latest week, not by an early dip of the bound.
    const last = m.weeks[m.weeks.length - 1];
    if (last.diffHiPct < 0) return { cls: 'off', text: 'Stays on the default: by week ' + last.week + ' the holdout shows Triage behind it.' };
    const ahead = last.diffLoPct + last.diffHiPct > 0;
    return { cls: 'wait', text: 'Still on the default at week ' + last.week + ': Triage ' +
      (ahead ? 'looks ahead, but the holdout has not proved it' : 'is level with or behind it, and the holdout has not proved it ahead') +
      ' (lower bound ' + minus1(last.diffLoPct) + '%).' };
  }

  function miniChart(m) {
    const W = 300, H = 150, L = 34, R = 8, T = 10, B = 24;
    const n = m.weeks.length, lo = 60, hi = 130;
    const x = w => L + (w - 0.5) * (W - L - R) / n;
    const y = v => T + (hi - Math.max(lo, Math.min(hi, v))) * (H - T - B) / (hi - lo);
    const bw = (W - L - R) / n;
    const shade = m.weeks.filter(w => w.running === 'triage')
      .map(w => '<rect class="hv-on" x="' + (x(w.week) - bw / 2) + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '"/>').join('');
    const grid = [70, 100, 130].map(v => '<line class="hv-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
      '<text class="hv-tick" x="' + (L - 4) + '" y="' + (y(v) + 3) + '">' + v + '%</text>').join('');
    const line = k => m.weeks.map((w, i) => (i ? 'L' : 'M') + x(w.week).toFixed(1) + ' ' + y(w[k]).toFixed(1)).join(' ');
    const xt = m.weeks.map(w => '<text class="hv-tick hv-x" x="' + x(w.week) + '" y="' + (H - 8) + '">' + w.week + '</text>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(m.name + ': ' + status(m).text) + '">' +
      shade + grid + xt +
      '<path class="hv-default" d="' + line('defaultPct') + '"/>' +
      '<path class="hv-triage" d="' + line('triagePct') + '"/>' +
      m.weeks.map(w => '<circle class="hv-dot" cx="' + x(w.week) + '" cy="' + y(w.triagePct) + '" r="2.5"/>').join('') +
      '</svg>';
  }

  function renderHandover(elId, list, single) {
    const el = document.getElementById(elId);
    if (!handover) { el.innerHTML = ''; return; }
    el.innerHTML =
      '<div class="card proof-card' + (single ? ' hv-single' : '') + '">' +
        '<div class="card-head"><h2>Handover: the default runs until a holdout proves Triage ahead</h2>' +
          '<p class="muted">Net margin per week as % of each merchant\'s best fixed rule. ' +
          '<span class="hv-key hv-key-triage"></span>Triage <span class="hv-key hv-key-default"></span>Default ' +
          '<span class="hv-key hv-key-on"></span>Triage running</p></div>' +
        '<div class="hv-grid-wrap">' + list.map(m => {
          const st = status(m);
          return '<div class="hv-cell"><div class="hv-name">' + esc(shortName(m.name)) + '</div>' + miniChart(m) +
            '<p class="hv-status st-' + st.cls + '">' + esc(st.text) + '</p></div>';
        }).join('') + '</div>' +
        '<p class="table-foot">' + (single ? 'Simulated for a home decor store like yours. ' : 'Same merchants, checkouts and true response as the table above. ') + 'Triage\'s lift estimates get less noisy each week ' +
          '(sd 0.35 in week 1 to 0.15 in week ' + handover.weeks + ') and explore falls from 10% to 5%. Each week ' +
          handover.perWeek.toLocaleString('en-IN') + ' failed checkouts are split half to Triage, half to the default. ' +
          'Triage takes over when the lower 95% bound of its advantage, pooled over the weeks so far, clears zero. ' +
          'The bound comes from each checkout\'s pay-or-not outcome noise. Weekly points use two noisy estimate draws, so they wobble. ' +
          'Computed in your browser in ' + (handover.ms / 1000).toFixed(1) + 's.</p>' +
      '</div>';
  }

  const renderKaara  = () => renderHandover('handover', handover ? handover.merchants.filter(m => m.name === KAARA) : [], true);
  const renderOthers = () => renderHandover('handover-others', handover ? handover.merchants.filter(m => m.name !== KAARA) : [], false);

  function proofReady(msg) {
    if (msg.kind === 'proof') proof = msg.result;
    if (msg.kind === 'handover') handover = msg.result;
    renderHero();
    if (viewFromHash() === 'proof') renderKaara();
    if (viewFromHash() === 'evaluators') { renderProof(); renderOthers(); }
  }

  function startProof() {
    try {
      const w = new Worker('proof-worker.js');
      w.onmessage = e => { proofReady(e.data); if (e.data.kind === 'proof') w.terminate(); };
      w.onerror = e => { e.preventDefault(); w.terminate(); runProofHere(); };
    } catch (err) { runProofHere(); }
  }
  /* Fallback when workers are unavailable (e.g. opened from file://). sim.js
     restores LIFT_TABLE before returning, and nothing renders mid-run. */
  function runProofHere() {
    const sim = makeSim({ MERCHANT_POLICY, decide, scoreAction, checkGates, isAllowed, LIFT_TABLE, LADDER,
                          diagnose, SHIPPING_SUBSIDY });
    setTimeout(() => {
      const t0 = Date.now();
      const p = sim.proof(), h = sim.handover();
      p.ms = h.ms = Date.now() - t0;
      shipAsProven(p, h);
      proofReady({ kind: 'handover', result: h });
      proofReady({ kind: 'proof', result: p });
    }, 50);
  }

  /* =========================================================================
     LEARNING, LIVE
     learn.js in its own worker. Each click simulates one week for Kaara and
     returns the posterior state; nothing here touches the feed's engine.
     ========================================================================= */
  const learnBtn = document.getElementById('learn-step');
  let learnWorker = null, learnWidth0 = null;
  const pp = n => minus1(n);

  function renderLearn(s) {
    if (s.week === 0) learnWidth0 = s.pairs.map(p => p.widthPp);
    document.getElementById('learn-week').textContent = s.week ? '· week ' + s.week : '· before any data';
    document.getElementById('learn-table').innerHTML =
      '<thead><tr><th>Cause × action</th><th class="num">Estimated lift</th><th class="num">90% interval</th>' +
      '<th class="num">Interval width</th><th class="num">Observed</th></tr></thead><tbody>' +
      s.pairs.map((p, i) => '<tr><td>' + esc(p.label) + '</td>' +
        '<td class="num">' + pp(p.liftPp) + ' pp</td>' +
        '<td class="num">' + pp(p.loPp) + ' to ' + pp(p.hiPp) + '</td>' +
        '<td class="num">±' + (p.widthPp / 2).toFixed(1) +
          (s.week && learnWidth0 ? ' <span class="narrow">(' + minus1(p.widthPp / 2 - learnWidth0[i] / 2) + ')</span>' : '') + '</td>' +
        '<td class="num">' + p.n.toLocaleString('en-IN') + '</td></tr>').join('') + '</tbody>';
    const ch = document.getElementById('learn-changes');
    const wasOpen = ch.open;
    ch.innerHTML = '<summary>Decisions that would change with this week\'s estimates: <strong>' + s.changes.length + '</strong>' +
      ' <span class="muted">of ' + s.casesChecked + ' feed cases</span></summary>' +
      (s.changes.length
        ? '<ul>' + s.changes.map(c => '<li><span class="cid">' + esc(c.id) + '</span> ' + esc(c.from) + ' → <strong>' + esc(c.to) +
            '</strong><div class="muted">' + esc(c.reason) + '</div></li>').join('') + '</ul>'
        : '<p class="muted">None yet: with no data the estimates equal the built-in assumptions.</p>');
    ch.open = wasOpen;
    const v = s.vsDefault;
    document.getElementById('learn-margin').innerHTML =
      (v ? '<div><strong>Triage vs default:</strong> ' + (v.perCheckout < 0 ? '−' : '+') + '₹' + Math.abs(v.perCheckout).toFixed(1) +
            ' net margin per checkout (' + (v.pct < 0 ? '' : '+') + minus1(v.pct) + '%), lower bound ' +
            (v.lo < 0 ? '−' : '+') + '₹' + Math.abs(v.lo).toFixed(1) +
            ' <span class="mode-chip ' + (v.lo > 0 ? 'mode-on">Proven: Triage would take over' : '">Not proven: the default keeps running') + '</span>' +
            '<div class="muted">' + v.n.toLocaleString('en-IN') + ' Triage and default checkouts so far.</div></div>'
         : '<div class="muted">Triage vs default appears after the first simulated week.</div>') +
      '<p>Triage takes over when the lower bound clears zero.</p>';
    learnBtn.disabled = false;
  }

  function startLearn() {
    if (learnWorker) return;
    try {
      learnWorker = new Worker('learn-worker.js');
      learnWorker.onmessage = e => renderLearn(e.data);
      learnWorker.onerror = e => { e.preventDefault();
        document.getElementById('learn-margin').innerHTML = '<p class="muted">Live learning needs Web Workers; open the deployed site.</p>'; };
    } catch (err) { learnWorker = null; }
  }
  learnBtn.addEventListener('click', () => { if (!learnWorker) return; learnBtn.disabled = true; learnWorker.postMessage('step'); });
  document.getElementById('learn-reset').addEventListener('click', () => { if (!learnWorker) return; learnBtn.disabled = true; learnWorker.postMessage('reset'); });

  /* =========================================================================
     START HERE GUIDE
     Dismissal is remembered in localStorage when available; the head script
     applies it before first paint, so the feed never shifts.
     ========================================================================= */
  const GUIDE_KEY = 'triage.guideDismissed';
  const setGuide = off => {
    document.documentElement.classList.toggle('guide-off', off);
    try { off ? localStorage.setItem(GUIDE_KEY, '1') : localStorage.removeItem(GUIDE_KEY); } catch (e) {}
  };
  document.getElementById('guide-close').addEventListener('click', () => setGuide(true));
  document.getElementById('show-guide').addEventListener('click', () => {
    setGuide(false);
    if (location.hash !== '#feed') location.hash = '#feed';
    document.querySelector('.content').scrollTop = 0; window.scrollTo(0, 0);
  });
  document.getElementById('guide').addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a || (!a.dataset.case && !a.hasAttribute('data-outage'))) return;   // plain links just navigate
    e.preventDefault();
    const onFeed = location.hash === '#feed' || location.hash === '';
    if (!onFeed) location.hash = '#feed';
    setTimeout(() => {
      if (a.dataset.case) openCase(a.dataset.case);
      else if (!context.systemicFailure) document.getElementById('outage').click();
    }, onFeed ? 0 : 60);
  });

  /* =========================================================================
     NAVIGATION
     ========================================================================= */
  const VIEWS = { feed: 'Decision feed', policy: 'Policy', audit: 'Audit log', proof: 'Default vs Triage', outcomes: 'Outcomes',
                  holdout: 'Holdout', evaluators: 'For evaluators' };
  const viewFromHash = () => {
    const v = location.hash.replace(/^#/, '');
    return VIEWS[v] ? v : 'feed';
  };

  function show(view) {
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
    document.querySelectorAll('.nav-item[data-view]').forEach(n => {
      const on = n.dataset.view === view;
      n.classList.toggle('active', on);
      if (on) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    close();
    if (view === 'policy') renderPolicy();
    if (view === 'audit') renderAudit();
    if (view === 'proof') { renderKaara(); startLearn(); }
    if (view === 'evaluators') { renderProof(); renderOthers(); }
    if (view === 'outcomes') renderOutcomes();
    if (view === 'holdout') renderHoldout();
    document.querySelector('.content').scrollTop = 0; window.scrollTo(0, 0);
    document.title = 'Triage · ' + VIEWS[view];
  }

  // The nav links carry #feed, #policy, ... so the URL is the source of truth
  // and Back / Forward / refresh all land on the right view.
  window.addEventListener('hashchange', () => show(viewFromHash()));

  logEvent('Triage', 'Session started. ' + CASES.length + ' cases decided under the approved policy; holdout ' +
    Math.round(approved.holdoutShare * 100) + '%, explore ' + Math.round(approved.exploreShare * 100) + '%');
  renderFeed();
  renderBanner();
  renderHero();
  show(viewFromHash());
  startProof();
})();
