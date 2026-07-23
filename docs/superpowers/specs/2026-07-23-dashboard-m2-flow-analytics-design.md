# Dashboard M2 Flow Analytics and Forecast Design

**Scope:** Add evidence-derived delivery metrics and completion forecasting to the existing strict v3 read model.

## Outcome

The view answers what is currently in progress, how work has flowed, whether a forecast is supportable, and which source facts support every metric.

## Architecture

- Do not add a writable analytics store or external chart dependency.
- Normalize delivery events from Task actual dates, Executor Run timestamps, rework tags, and Gate dates in `lib/observatory/delivery-analytics.ts`.
- Derive metrics at render time from the validated snapshot.
- Render accessible metric cards, simple native bars, provenance, and explicit insufficient-evidence states in `FlowAnalytics.tsx`.

## Metric definitions

- WIP: Tasks with Actual Start and no Actual Finish.
- Throughput: completed Tasks grouped by UTC completion day; the headline uses the latest 30-day evidence window.
- Age: elapsed full days from Actual Start to the Snapshot collection time for WIP Tasks.
- Cycle Time: elapsed hours from Actual Start to Actual Finish.
- SLE: nearest-rank 85th percentile of Cycle Time, only with at least five completed Task samples.
- Rework: completed Executor Runs with `rework=true`; only run evidence is counted.
- Prediction error: Actual Finish minus Forecast Finish for completed Features.
- Baseline variance: Actual Finish minus Baseline Finish, falling back to Forecast Finish only for the forward-looking roadmap view, never for completed prediction error.

Blocked and Waiting duration require explicit state-transition evidence. When that evidence is absent, the view reports `Not recorded`; it does not infer time from labels.

## Forecast rules

- Forecasting requires at least three completed Tasks across at least two distinct completion dates and positive observed throughput.
- Remaining work is the count of non-done Tasks.
- The point estimate uses observed average daily throughput.
- The interval uses conservative 25th and 75th percentile daily throughput; zero days are retained inside the observed evidence window.
- Confidence is `Low` for 3–4 samples, `Medium` for 5–9, and `High` for 10 or more.
- If requirements are not met, return a typed insufficient-evidence result listing the missing evidence.

## Traceability

Every metric carries source record IDs and source document labels. The UI lists those references and the Snapshot digest/time, so a value can be independently reconstructed.

## Verification

- Unit tests cover event normalization, durations, percentile calculation, WIP, throughput, forecast thresholds, intervals, confidence, prediction error, and no-fabrication behavior.
- Component tests cover available and unavailable metrics, source references, and accessible chart/table semantics.

