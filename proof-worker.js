/* Runs the proof simulation off the main thread. sim.js rewrites LIFT_TABLE
   while it runs, so it gets its own copy of the engine here, never the feed's. */
importScripts('data.js', 'engine.js', 'sim.js');
const E = { MERCHANT_POLICY, decide, scoreAction, checkGates, isAllowed, LIFT_TABLE, LADDER,
            diagnose, SHIPPING_SUBSIDY };
const sim = makeSim(E);
let t0 = Date.now();
const proof = sim.proof();
proof.ms = Date.now() - t0;
postMessage({ kind: 'proof', result: proof });
t0 = Date.now();
const handover = sim.handover();
handover.ms = Date.now() - t0;
postMessage({ kind: 'handover', result: handover });
