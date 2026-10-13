/* The live learning panel's engine. Runs off the main thread with its own
   copy of the engine, so the learner's estimates never reach the feed. */
importScripts('data.js', 'engine.js', 'sim.js', 'learn.js');
const E = { MERCHANT_POLICY, CASES, decide, scoreAction, checkGates, isAllowed, diagnose, LIFT_TABLE, LADDER,
            ACTION_COSTS, SHIPPING_SUBSIDY, CAUSE_LABEL, ACTION_LABEL };
const learner = createLearner(E, makeSim(E).truthFor('Home decor (Kaara-like)'));
postMessage(learner.state());
onmessage = e => postMessage(e.data === 'reset' ? learner.reset() : learner.step());
