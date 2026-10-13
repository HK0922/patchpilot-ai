# Three-minute demo

## 0:00 - 0:30: State the problem

"PatchPilot turns a software bug into a small, tested patch and a reviewable evidence trail. It separates model proposals from tools that change code and execute tests. I used AI to accelerate implementation, and I supervise scope, evidence, and final approval."

Open the hosted replay or local app. Explain the mode immediately: the hosted page replays executed fixture evidence using known recipes; it is not executing a live LLM.

## 0:30 - 1:10: Successful repair

Choose pagination. Show the one-item-short slice, corrected endpoint, and page-size-one regression. In Tests, show failing original tests, the new regression failing on original code, and the final seven-test passing suite. In Plan, show scoped targets.

## 1:10 - 1:55: Recovery

Replay the invoice Activity. The first float-offset patch fails negative-credit rounding. Tests return evidence; the second attempt uses Decimal with explicit half-up rounding. Inspect the diff and protected existing tests.

Do not describe the scripted provider as independently learning this solution. The fixture checks the workflow's failed-candidate and retry behavior.

## 1:55 - 2:20: Refused edit

Choose the prohibited-operation probe. The policy gate stops it before application; there is no diff. Failed candidates are not offered as verified patches.

## 2:20 - 2:45: Measurement

Open Evaluation. Explain the 3/4 one-attempt and 4/4 retry-loop fixture results and 28 passing final-suite tests. State why these measure orchestration rather than model accuracy. Explain the held-out live-model experiment.

## 2:45 - 3:00: Human review

Open Review. In the local app, add a review note and approve or reject. Download the patch and PR description. The engine never applies, pushes, or merges code.

## Be ready to explain

- Why typed outputs instead of free-form commands?
- Why must the regression fail on original source?
- Why Docker for live runs?
- Which cancellation points are immediate, and which wait for a model request?
- Why is the first invoice patch insufficient?
- What evidence would justify a claim about real model success or efficiency?
- Which parts did AI implement, and which checks did you supervise?
