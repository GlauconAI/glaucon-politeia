# Dashboard Source Repository Observatory Design

**Status:** Approved for implementation by Glaucon on 2026-07-23
**Scope:** Add a read-only Source Repository Observatory slice to M1 System Observatory
**Out of scope:** Knowledge Base Observatory volume/type statistics, GitHub write operations, repository content indexing, CI/deployment inspection, and Agent Claim activation

## 1. Outcome

The Dashboard must answer:

1. Which source-code Git repositories are maintained across the Multi-Agent system?
2. Is each repository located in the Obsidian Vault or an OpenClaw Agent workspace?
3. Which Agent or top-level knowledge area maintains it?
4. Which local repository maps to which GitHub `owner/repo`?
5. What are the current branch, HEAD, last commit time, working-tree state, and evidenced activity state?

Discovery covers both explicit trusted roots:

- `/Users/glaucon/.openclaw/workspace`
- `/Users/glaucon/Obsidian/Glaucon's Vault`

Knowledge Base Observatory remains paused for the next cycle and is not implemented by this slice.

## 2. Considered Approaches

### A. Encode repositories only as generic System Observatory assets

This is the smallest schema change, but typed Git facts would be compressed into label arrays. The UI and validation would depend on label-name conventions, and repository/project mapping would be fragile.

### B. Add a typed v4 repository inventory and project repository assets

This keeps repository facts strict and queryable while also integrating each repository into the existing asset/relationship topology. It preserves old v1-v3 Snapshot compatibility and gives the UI a stable contract.

### C. Maintain a separate hand-authored repository registry

This gives precise curation but immediately becomes another source of truth. It would drift from local Git state and fail the requested automatic discovery outcome.

**Decision:** Use approach B. The Collector remains authoritative for observed local Git metadata; exact mappings are derived conservatively and unknown facts remain unknown.

## 3. Architecture

The existing pipeline remains:

`trusted Mac Collector → strict Snapshot → privacy validation → Supabase → admin-only Dashboard`

The collection schema advances to `4.0.0`. Stored v1-v3 Snapshots remain readable.

New units:

- `source-repository-schema.ts`: strict repository and source-health contracts;
- `source-repository-discovery.ts`: bounded two-root discovery plus Git metadata projection;
- `SourceRepositoryInventory.tsx`: searchable, filterable, semantic repository inventory.

Modified units:

- `asset-schema.ts`: add the `repository` asset kind and `source_repositories` source domain;
- `collection-schema.ts`: add the v4 envelope;
- `collector.ts`: add deterministic v3 → v4 upgrade and digest recomputation;
- `scripts/observatory/collect.ts`: collect repository metadata only when explicit system roots are supplied;
- `ObservatoryOverview.tsx`: display repository summary and inventory for v4 Snapshots;
- existing privacy and collector tests: verify no raw path, credential, remote URL secret, or file content enters the Snapshot.

No new runtime dependency or graph library is added.

## 4. Repository Contract

Every repository record contains:

- stable hashed logical `id`;
- display `name`;
- `scope`: `workspace` or `vault`;
- safe `local_ref`, such as `workspace/plato/glaucon-politeia` or `vault/plato-academy/dashboard`;
- `maintainer_agent_id` when the repository is under an Agent workspace;
- `knowledge_area` when the repository is under a Vault top-level area;
- sanitized GitHub `owner`, `repo`, and canonical HTTPS URL when `origin` is a recognized `github.com` remote;
- current branch or explicit detached state;
- full HEAD object ID;
- locally evidenced default branch when `refs/remotes/origin/HEAD` is available;
- last commit timestamp;
- working-tree state: `clean`, `dirty`, or `unknown`;
- activity state: `active`, `stale`, or `unknown`;
- archive state: `archived`, `active`, or `unknown`;
- exact-match `registry_project_keys`;
- collection time, health, authority, and logical source.

Activity is derived only from the latest local commit:

- `active`: latest commit is no more than 180 days old;
- `stale`: latest commit is older than 180 days;
- `unknown`: no valid commit timestamp is available.

Archive state is never inferred from recency. Local-only v1 collection reports `unknown` unless a future trusted GitHub enrichment source provides the fact. This slice does not call the GitHub API.

## 5. Discovery And Mapping Rules

Discovery:

- validates each configured root as a real, non-symlink directory;
- never follows directory symlinks;
- skips generated, dependency, cache, backup, hidden, and worktree-container directories;
- recognizes a repository from a real `.git` directory or a `.git` file whose resolved Git directory remains inside one of the two allowed roots;
- bounds traversal depth, visited directories, repository count, command time, and command output;
- deduplicates repositories by canonical Git common-directory identity;
- runs only fixed `git` executable/argv command families with `shell: false`.

The Collector may inspect Git output to derive booleans and strict fields, but it never publishes filenames from `git status`, commit messages, authors, emails, raw remote URLs, or absolute paths.

Mapping:

- the first workspace path segment maps to an existing Agent ID only on exact match;
- the first Vault path segment becomes the top-level knowledge area;
- registry project mapping uses exact normalized equality against project key suffix, canonical name, or title;
- ambiguous or unmatched projects produce an empty mapping instead of a guess.

## 6. Asset And Relationship Projection

Each typed repository also becomes a `repository` asset with safe summary and whitelisted labels.

Relationships are emitted only when both endpoints exist:

- `agent:<id> → repository:<id>` with kind `maintains`;
- `knowledge:<area> → repository:<id>` with kind `contains`.

Registry project links remain in the typed `registry_project_keys` field because registry projects are not currently System Inventory asset endpoints.

## 7. UI

The Source Repository Observatory appears inside M1 after Source Health and before the generic System Inventory.

It provides:

- total repositories, GitHub-linked repositories, dirty repositories, and stale repositories;
- search across name, GitHub slug, Agent, knowledge area, logical source, branch, and linked project;
- native filters for scope, working-tree state, and activity;
- a semantic list containing owner/scope, GitHub mapping, branch/HEAD, last commit, clean/dirty, activity, archive state, and linked projects;
- clear empty, partial, unknown, and failed-source states.

The component is keyboard accessible and does not depend on hover, drag, canvas, or pointer-only interaction.

## 8. Failure And Privacy Behavior

- One unreadable or invalid repository is omitted and counted in a sanitized source-health result; it does not discard healthy repositories.
- Root or traversal limit failure marks `source_repositories` failed and preserves the prior last-known-good Snapshot because publication occurs only after full schema/privacy validation.
- Git command stderr is never copied into output.
- Credential-bearing HTTPS remotes, SSH remotes, query strings, fragments, emails, usernames, and absolute paths are stripped before validation.
- Local repository names and safe logical owner/area names are allowed; arbitrary nested private path segments are replaced by the repository name plus a non-reversible hash.
- No repository files, commit messages, diffs, or untracked filenames are read into the Snapshot.

## 9. Verification And Release Boundary

Tests cover:

- two-root discovery and owner/knowledge mapping;
- `.git` directory, allowed `.git` file, symlink rejection, deduplication, depth/entry/repository bounds;
- GitHub remote sanitization including credential-bearing and SCP-style forms;
- clean/dirty/detached/missing-metadata states;
- exact registry mapping without fuzzy guesses;
- strict v4 schema, v1-v3 compatibility, and digest recomputation;
- repository asset/relationship integrity;
- UI search, filters, empty/unknown/failed states, and keyboard-visible semantics;
- adversarial privacy fixtures for absolute paths, tokens, emails, raw remotes, commit messages, and status filenames.

The implementation stops at a local Production Candidate Gate: focused tests, full tests, lint, typecheck, production build, real two-root collection with privacy verification, and code review. Production publication, Git push, Vercel deployment, or refresh-job mutation require a separate explicit release authorization.
