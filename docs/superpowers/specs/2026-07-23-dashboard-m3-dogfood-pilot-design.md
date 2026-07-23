# Dashboard M3 Dogfood Pilot Design

**Status:** Recommended verification design pre-approved by Glaucon's 2026-07-23 instruction to continue M3 using Plato's recommended choices.

**Scope:** Deliver OBS-F502 after the Low-risk Agent Claim Engine passes its local Gate.

## Outcome

Use the engine itself to complete one small Feature and one small Bug through selection, claim, bounded implementation, heartbeat, independent verification, evidence submission, human review, and Done. Produce a pilot review and policy revision recommendation without allowing a high-risk action to cross the human Gate.

## Pilot items

The disposable pilot database contains two owner-approved Low-risk items:

1. Feature: add a compact claim-eligibility badge to Work Tracker Board cards.
2. Bug: correct the first real claim-engine defect discovered by the independent pilot verification. If verification finds no defect, use the predefined accessibility bug: expired/cancelled claims must never expose an active-lease status or action.

Each item has acceptance criteria, owner, priority, Dashboard/M3 references, exact authorized repository-relative paths, and allowed action classes. Neither item authorizes production deployment, external writes, credentials, scheduler changes, or Gateway control.

## Execution loop

For each item:

1. the authenticated pilot runner requests a claim with a unique idempotency key;
2. the engine returns the item and immutable execution boundary;
3. the implementation begins from a clean Git commit;
4. a heartbeat proves lease renewal;
5. tests are written red-first and the diff is checked against authorized paths;
6. an independent verification command runs outside the implementation loop;
7. completion submits a bounded summary and HTTPS commit evidence;
8. the engine moves the item to Review;
9. the administrator performs the final Done transition.

The pilot uses only a disposable local Supabase stack and a fixture runner token. It does not create a permanent credential or production work item.

## Audit review

The review records:

- selected items and eligibility inputs;
- claim, heartbeat, completion, and final approval versions;
- lease durations and whether any expiry/recovery occurred;
- exact transition/event counts;
- evidence links;
- authorized-path versus actual-diff comparison;
- tests and independent verification;
- any denied high-risk claim;
- policy revision recommendations.

## Acceptance

The pilot passes only when:

- exactly one Feature and one Bug reach Done;
- both were automatically claimed from Ready;
- all writes remain inside their authorized paths;
- at least one heartbeat occurs;
- a deliberately high-risk item is denied;
- independent verification passes;
- evidence and claim history are complete;
- no claim bypasses Review or the human Done Gate;
- the final review recommends either retaining the initial policy or a precise bounded revision.

The pilot review is stored at `docs/dashboard-m3-dogfood-pilot-review.md` and is included in the final M3 candidate Gate.
