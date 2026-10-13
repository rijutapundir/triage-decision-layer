# Triage: AI build log

**Rijuta Pundir** · ISB PGP Co'27 · Razorpay AI x PM Build Challenge, Track 2

[Live prototype](https://triage-decision-layer.netlify.app/) · [Code (this repo)](https://github.com/rijutapundir/triage-decision-layer)

> I worked on the idea, the product decisions and the design. I used AI in one repeatable loop: **brief it, let it build, have a second AI attack it, then verify myself.**

**Contents:** [1. Tools and models](#1-ai-tools-and-models-i-used) · [2. What I used them for](#2-what-i-used-them-for) · [3. Workflow, agent setup and key prompts](#3-workflow-agent-setup-and-key-prompts) · [4. How AI made the work faster and better](#4-how-ai-made-the-work-faster-and-better) · [5. One AI output I corrected](#5-one-ai-output-i-corrected-and-why) · [6. What AI did vs what I decided](#6-what-ai-did-vs-what-i-decided-myself) · [7. Limitations, risks and verification](#7-known-limitations-risks-and-verification)

<br>

## 1. AI tools and models I used

| Tool | Model | What I used it for |
|:--|:--|:--|
| **Claude and ChatGPT** | Claude Opus, GPT | Research, problem framing, the decision engine and the simulations behind my claims |
| **Claude Code** | Claude Opus | Building and testing the working prototype |
| **gstack** | Runs in Claude Code | Open-source Claude Code skills that act as a review team: `/plan-ceo-review`, a founder-style critic, and `/qa-only`, a QA lead that tests the live site in a real browser |
| **Claude in Chrome** | Claude | Reading public merchant reviews on Reddit and LinkedIn |
| **Netlify** | – | Hosting the prototype |
| **Razorpay Blade** | – | Razorpay's open-source design system, used as the prototype UI reference |

No external APIs or datasets are used in the prototype. All data is synthetic.

<br>

## 2. What I used them for

- **Research.** I reviewed research on targeted marketing and pricing, which led me to Ascarza (2018): target the customers an action changes, not the ones most at risk. That became Triage's core idea. I then researched fast decision classifiers and found Typesafe's Jev for the diagnosis step. I also studied how Agent Studio recovers checkouts today and what other competitors do. I also used AI to fact-check sources before I cited them.
- **Interview synthesis.** After my merchant and PM conversations, I had AI turn the notes into a summary, the insights, and a to-do list I then worked through. I also ran an analysis on reviews of Razorpay merchant experiences on public forums (Reddit and LinkedIn) using Claude in Chrome.
- **Testing the idea before building it.** I had Claude turn my logic into a small decision engine and run it on 160,000 simulated checkouts across 20 simulated markets, to see whether my approach really beats a simple rule, and where it doesn't.
- **Building.** I wrote the spec for each screen: what it shows, the one action on it, and what a merchant should understand. I recorded the Razorpay merchant dashboard as a visual reference. Then I used Claude Code to build from those specs, one screen at a time.
- **Drafting documents.** I gave the brief, structure and key points; AI drafted and formatted the product note and this log, and I reviewed every line and made edits wherever needed.
- **Reviewing.** I pointed gstack's reviewers at my product note and prototype, with the challenge brief, practitioner advice and the ISB case handbook as references, in that order of priority, and asked them for a stress-test and detailed review.

<br>

## 3. Workflow, agent setup and key prompts

### The loop

| Step | Who | What happens |
|:--|:--|:--|
| **1. Brief** | Me | I write what each screen or claim must do, in plain words |
| **2. Build** | Claude Code | Builds it, one screen at a time |
| **3. Attack** | gstack, a fresh Claude session, ChatGPT | Tries to break it, using the brief, practitioner advice and the ISB handbook as references |
| **4. Verify** | Me | I check every number against the engine or simulation before it goes into the note |

### Agent setup

- **The builder never reviews its own work.** Reviews ran in separate sessions or tools, and were set to report only, so nothing changed without my approval.
- **Context management.** I kept a running log of decisions in Claude Code and started a fresh session before the context was half full. Reference files stayed in the project folder instead of being pasted into chat. Confidential references are gitignored and never committed.
- **Safety net.** Every change was saved as a git version, and 16 automated tests ran after each one.

### Key prompts (shortened)

<details>
<summary><b>Researching targeted marketing and pricing</b> (Claude)</summary>

> I'm designing a system that decides which failed checkouts a merchant should act on, and with what action (a reminder, a discount or a payment-method nudge). Find peer-reviewed research on targeting marketing and pricing interventions: should you target the customers most at risk, or the ones the action actually changes? Summarise the key papers, their findings and evidence, and how each applies to checkout recovery. Give full citations so I can check every source myself before citing it.

</details>

<details>
<summary><b>Building a screen</b> (Claude Code)</summary>

> Add the Outcomes tab. It shows whether Triage's actions are actually working, by comparing treated cases with the holdout (cases deliberately left untouched). Show four headline numbers: incremental recovery rate, incremental orders, net incremental revenue, cost per incremental order. Add recovery rate by action against the holdout baseline, and a spend table. Label all numbers as simulated. Do not change the Decision feed, Policy screen, engine.js or data.js.

</details>

<details>
<summary><b>Testing the idea before building</b> (Claude)</summary>

> Turn this logic into a small decision engine. Simulate four merchant types (low-ticket fashion, high-ticket electronics, high-margin beauty, home decor) with 2,000 failed checkouts each. Compare Triage with the best single fixed rule for each merchant, early and once its estimates mature. Repeat across 20 random seeds and report the worst case, not the average.

</details>

<details>
<summary><b>Stress-testing the product note</b> (fresh Claude session, then ChatGPT)</summary>

> Review this one-page product note as a Razorpay evaluator. Use three references in this order of priority: the challenge brief, practitioner advice, and the ISB case handbook. For each evaluation criterion, say whether it is clearly covered and easy to find. List anything unclear, unproven or overclaimed. Be harsh.

</details>

<details>
<summary><b>QA on the live site</b> (gstack)</summary>

> `/qa-only https://triage-decision-layer.netlify.app/` — test every tab and control in a real browser and report bugs by severity, without fixing anything.

</details>

<br>

## 4. How AI made the work faster and better

- **Faster building, tougher testing.** Claude Code turned my screen specs into working code. Then gstack and a second AI review (Claude and ChatGPT) tried to break what it built. One QA pass caught 8 bugs before anyone else saw them.
- **Consistent over 3 weeks, managing context.** I kept a running log of decisions in Claude Code and started a fresh session before the context was half full. The reference files stayed in the project folder. So the AI never lost track of earlier decisions.
- **A better product, not just faster code.** One review pointed out that my note never compared Triage with the rule merchants already use. I tested that on 160,000 simulated checkouts in minutes. Triage only narrowly beat a well-tuned rule, so I redesigned it to start every merchant on the best default. Without that check, I would have submitted a weaker claim.
- **Speed without breaking things.** Every change was saved as a version, 16 automated tests ran on each one, and the reviews only reported issues without editing anything. Nothing changed without my approval.
- **On-brand from the start.** The AI read Razorpay's exact colours and fonts from its Blade design system, so the prototype matches Razorpay's look instead of a guess.
- **AI inside the product too.** Triage's Learning panel updates what it knows about each action from outcomes (simulated in the prototype), week by week.

<br>

## 5. One AI output I corrected, and why

**The simulation behind my main claim had a bug.**

The first version of the simulation used a random number generator that quietly lost precision in JavaScript. The results looked reasonable, so they were easy to trust. When Claude Code reviewed the code, it flagged the problem. I had it rewritten with a standard generator and re-ran all 20 simulated markets.

The corrected results changed my claim. Earlier, Triage pulled ahead for **2 of 4** merchant types by week 8. With the fixed simulation it is **1 of 4** (high-margin beauty); the other three stay on the default rule. I updated the product note and the prototype to match, even though the old number looked better.

**Why:** this was the core claim of the product. An output that looks right is not the same as one that is right, so every number in my note now comes from code anyone can re-run.

Other corrections, in short:
- AI drafted a line saying I run a store on Razorpay. My brand is not launched yet and uses a different payment gateway, so I removed it.
- An early Outcomes draft had numbers that did not add up (7 recoveries but 17 extra orders). I had the whole pilot rebuilt so every figure follows from the others.
- QA found the free-shipping cost was being charged on every message, not only on orders that converted. I had it fixed in the engine and the note.

<br>

## 6. What AI did vs what I decided myself

**What AI did:** research summaries, interview synthesis, the code for each screen from my specs, the decision engine and simulations, first drafts of the documents, and reviews that found bugs and gaps.

**Where I made the key decisions myself:**

- **Choosing the problem.** Most recovery tools decide how to contact a customer. I focused on whether to contact them at all, and if it really changes the outcome. I chose small merchants who can't set up their own rules, unlike the ones with big tech teams.
- **Keeping the merchant in control.** The merchant sets the policy once and can override any decision or pause everything. Every action is logged, and messages stop during a bank outage.
- **Designing the screens.** I decided what each screen shows and made it look like Razorpay's dashboard. I added a short guide for judges and put the evaluator details on a separate page.
- **Changing the product based on results.** My simulation showed Triage is only slightly better than a well-set simple rule. So I changed the product: every store starts on the best simple rule, and Triage takes over only where a holdout shows it earns more.
- **Deciding what to measure and what to leave out.** I measure profit per rupee spent against a holdout, not recovery rate. Version one has no new channels, no chatbot and no AI-written offers.
- **Keeping AI out of the live decision.** The live decision doesn't use an LLM, because of latency, cost and explainability. Triage has to decide while the customer is still at checkout, run on every failed payment without adding cost, and give a reason the merchant can understand.

<br>

## 7. Known limitations, risks and verification

| | |
|:--|:--|
| **Limitations** | All data is synthetic: merchant types, lifts, order values and margins are assumptions that need testing on real checkout data. The Outcomes tab is an illustrative 30-day pilot, not a measured result. Diagnosis is rule-based in the prototype. Sending real messages and connecting to Agent Studio are designed, not built. |
| **Risks** | The holdout gives up some recoveries in exchange for honest measurement. Small merchants have little data, so estimates take time, which is why everyone starts on the default rule. Too many messages hurt the brand, so each repeat contact carries a cost and merchants set a cap. Discounts can teach customers to wait, so they must clear a minimum value and stay under the merchant's ceiling. |
| **How I verified** | `node engine.test.js` runs 16 tests (engine, the note's four cases, simulation, handover, learning). `node reference/proof_sim_20worlds.js <seed>` re-runs any of the 20 simulated markets. QA reports and screenshots are in `.gstack/qa-reports/`. I checked every number in the note against the engine or simulation, and checked the git history so no confidential material was ever committed. |
