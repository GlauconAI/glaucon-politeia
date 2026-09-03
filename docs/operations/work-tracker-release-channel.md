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

Routine editing and local verification stay inside the Plato workspace-write sandbox. Prepare a clean release branch with the host-owned zero-argument entry:

```text
/Users/glaucon/.openclaw/agents/plato/agent/bin/work-tracker-release-prepare.sh
```

It uses a clean fixed environment, validates the exact repository/remote/branch/history, performs a non-force push to the fixed remote, and creates or reuses only a same-repository PR targeting `main`. Pull-request checks run in GitHub Actions. The following remain outside the permanent allowlist and require an explicit production authorization:

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

The report emits two deliberately separate scopes. `workTracker` contains project rollout proxy counters and keeps `manualApprovalCount: null` because current runtime data cannot reliably attribute a displayed prompt to this project. `operatorApprovals` contains real user decisions for all Plato activity in the period and is labeled `plato-agent-wide`. The approval database query reads only status/decision/terminal-reason fields; output never contains command, conversation, device, credential, or presentation data.

Review four complete weekly windows before proposing broader adoption. Success means routine development has no human prompts, production work is normally one explicit gate, denied calls do not rise, and no permission scope is widened to compensate.
