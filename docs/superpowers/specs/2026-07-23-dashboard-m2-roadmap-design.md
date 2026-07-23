# Dashboard M2 Three-track Roadmap Design

**Scope:** Complete the Roadmap vertical slice inside the existing admin-only Dashboard.

## Outcome

The Roadmap answers, from the strict v3 governance snapshot:

1. What did the Original Baseline commit to?
2. What does the Current Approved Plan forecast?
3. What actually happened?
4. Where did the first evidenced slip occur?

It remains read-only and never invents missing dates.

## Architecture

- Keep Snapshot schema `3.0.0` and the four-file allowlist.
- Extend `DeliveryGovernance` with backward-compatible `plan_revisions`, defaulting to an empty array for older v3 snapshots.
- Parse optional `Actual Start` / `Actual Finish` columns when governance documents provide them.
- Derive roadmap rows and Baseline Review deterministically in `lib/observatory/delivery-roadmap.ts`.
- Render a native semantic timeline plus a complete table fallback in `DeliveryRoadmap.tsx`; do not add Frappe Gantt.

## Date and variance rules

- A valid date is an ISO date or timestamp already accepted by the strict schema.
- `not_recorded` stays visible as `Not recorded`.
- Variance compares Actual Finish to Original Baseline when Actual exists; otherwise it compares Current Approved Plan to Original Baseline.
- Positive days are late, zero is on track, and negative days are early.
- `Off track` requires evidenced positive variance.
- `At risk` means a baseline exists but the comparison date is missing, or the item is explicitly blocked / at risk.
- `On track` requires non-positive variance with usable dates.
- `Unknown` is used when the Original Baseline is missing.
- The first slip is the earliest baseline-dated item with positive variance.

## Plan revision history

`DIR-*` rows from the existing EDAD revision table become bounded, sanitized records containing ID, date, type, summary, approval, and source. `GATE-*` rows continue to populate Gates.

## Accessibility and failure behavior

- The visual tracks are supplementary; the semantic table contains every fact.
- No drag, hover-only interaction, canvas, or pointer-only controls.
- Long ranges are normalized to CSS percentages and clamped to the visible window.
- Empty and malformed source facts render bounded explanations.
- Existing Project Cockpit remains available if the roadmap has no usable dates.

## Verification

- Unit tests cover date math, missing dates, early/on-time/late rows, first slip, and review classification.
- Projection tests cover `DIR-*` history and optional actual columns.
- Component tests cover the three labels, table fallback, empty state, and keyboard-visible semantic structure.

