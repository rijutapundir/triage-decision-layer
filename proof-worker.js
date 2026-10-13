/* Runs the proof simulation off the main thread. sim.js rewrites LIFT_TABLE
   while it runs, so it gets its own copy of the engine here, never the feed's. */
importScripts('data.js', 'engine.js', 'sim.js');
const t0 = Date.now();
const result = runProof({ MERCHANT_POLICY, decide, scoreAction, checkGates, isAllowed, LIFT_TABLE, LADDER });
result.ms = Date.now() - t0;
postMessage(result);
