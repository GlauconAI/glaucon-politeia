# Work Tracker Release Channel

## Local development gate

Run:

```bash
npm run release:verify
```

This first removes only the reproducible `.next/types` output, then runs the full test suite with one worker, lint, typecheck, and `git diff --check`. It is intentionally offline-capable. The default Turbopack production build and production dependency audit run in GitHub Actions; Turbopack binds a temporary local port that the Codex workspace sandbox correctly blocks.

## Read-only production smoke test

Run:

```bash
npm run release:smoke
```

The command only requests the fixed production origin `https://402v.com` and the paths `/` and `/work-tracker`. It accepts no custom destination and performs no authenticated or write action.

## Release boundary

Routine editing and local verification stay inside the Plato workspace-write sandbox. Pull-request checks run in GitHub Actions. The following remain outside the permanent allowlist and require an explicit production authorization:

- PR merge or production branch update.
- Supabase schema/data migration.
- Vercel production release outside the existing GitHub integration.
- Force push, deletion, credential, role, or permission changes.

Batch normal production changes into one release request that names the branch, commit, PR, migration files, and target environment. Any new risk category receives a separate review.

## Weekly approval report

Run:

```bash
npm run release:approval-report -- --days 7
```

The report scans Plato Codex rollout metadata and emits counts only. It does not emit conversation text, command text, or credentials. `manualApprovalCount` remains `null` because rollout metadata cannot prove which escalations reached a human; the weekly automation reconciles it with the operator-visible prompt count.

Review four complete weekly windows before proposing broader adoption. Success means routine development has no human prompts, production work is normally one explicit gate, denied calls do not rise, and no permission scope is widened to compensate.
