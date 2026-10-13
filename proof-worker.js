/* Runs the proof simulation off the main thread. sim.js rewrites LIFT_TABLE
   while it runs, so it gets its own copy of the engine here, never the feed's.
   The proof is posted after the handover: its As-shipped row depends on which
   merchants' holdouts proved Triage. */
importScripts('data.js', 'engine.js', 'sim.js');
const E = { MERCHANT_POLICY, decide, scoreAction, checkGates, isAllowed, LIFT_TABLE, LADDER,
            diagnose, SHIPPING_SUBSIDY };
const sim = makeSim(E);
let t0 = Date.now();
const proof = sim.proof();
const handover = sim.handover();
proof.ms = Date.now() - t0;
handover.ms = proof.ms;
shipAsProven(proof, handover);
postMessage({ kind: 'handover', result: handover });
postMessage({ kind: 'proof', result: proof });
