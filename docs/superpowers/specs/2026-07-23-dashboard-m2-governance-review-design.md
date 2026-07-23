# Dashboard M2 Governance Reports and Review Design

**Scope:** Add deterministic weekly/monthly governance reports, data-quality findings, delay attribution, and formal read-only review.

## Outcome

The Dashboard produces an evidence-linked review of project health without writing generated conclusions back to the source documents.

## Architecture

- Derive reports in `lib/observatory/governance-reports.ts` from the validated governance snapshot and analytics result.
- Render the current formal review, weekly/monthly summaries, issues, delay attribution, data quality, revision history, and safe export in `GovernanceReview.tsx`.
- Export only the already-sanitized derived report as a bounded JSON data URL. No raw Markdown, local paths, credentials, or network requests are included.

## Review rules

- `Off track`: an evidenced positive completed/forecast variance, a blocked item, or an open high-impact blocker.
- `At risk`: open risks/dependencies, insufficient forecast evidence, explicit at-risk status, or material missing dates.
- `On track`: no off-track/at-risk condition and source health is healthy.
- Each issue contains stable ID, category, severity, summary, owner, status, evidence references, and source.
- Missing owner or evidence is reported as `Not recorded`, never guessed.

## Delay attribution

Only explicit evidence text is classified:

- scope
- dependency
- approval
- technical unknown
- rework
- capacity
- external
- unclassified

The report lists matched source records. Absence of evidence produces no attributed delay.

## Period reports

- Weekly and monthly windows end at `source.collected_at`.
- Counts and changes use dated Tasks, Runs, Gates, risks, and dependencies inside each window.
- When no dated event exists, the report says so explicitly.
- The report ID combines period, Snapshot timestamp, and a prefix of the source digest for reproducibility.

## History and audit

Plan revisions and Gates are displayed chronologically. Each generated review includes the source digest, collection time, and exact source labels. Snapshot retention remains the authoritative history; the report itself is deterministic and exportable.

## Verification

- Unit tests cover review classification, issue construction, attribution, period boundaries, deterministic IDs, and bounded export.
- Component tests cover report sections, source/owner/status/evidence fields, revision history, empty states, and the JSON download contract.

