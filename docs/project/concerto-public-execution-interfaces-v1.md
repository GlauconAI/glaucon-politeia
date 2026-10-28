# Concerto public execution interfaces v1

Status: implementation candidate only. No live migration, deployment, credentials,
Gateway activation, real Item mutation, or Wenya integration is performed here.
Existing create/update/transition/assignment/evidence/claim interfaces are unchanged.

## Supported HTTP and typed Plugin ports

All HTTP calls use the existing protected Agent Bearer authentication. Actor and
current Project Owner authority come from the server and current Registry
(`project_owner` before group `owner`), never from request parameters.

| HTTP | Plugin tool | Arguments |
| --- | --- | --- |
| `GET /api/concerto/operations` | `concerto_get_operation` | `project_ref`, `operation_key`, optional `operation_agent_id` |
| `POST /api/concerto/work-items/:id/execution-binding` | `concerto_bind_work_item_execution` | `work_item_id`, `expected_version`, `expected_project_revision`, `plan_revision`, `stage_id`, `work_package_id`, `idempotency_key`, optional `intake_fingerprint` |
| Existing `GET /api/concerto/project-work-snapshot` | `concerto_get_project_work_snapshot` | `project_key`, optional `expected_revision` |

HTTP uses camelCase query/body keys: `projectRef`, `operationKey`,
`operationAgentId`; binding body `expectedVersion`, `expectedProjectRevision`,
`planRevision`, `stageId`, `workPackageId`, `idempotencyKey`, `intakeFingerprint`.
Snapshot query uses existing `projectKey` and `expectedRevision`.
`operationAgentId` is only a lookup selector: it defaults to the authenticated
actor. Only the current canonical Project Owner may select another actor.
Unknown or cross-project operation receipts return `{ "operation": null }`.
The route rejects unknown query/body fields and does not expose database errors.
All responses are no-store.

Binding response: `{ workItem, operation }`; all existing Item list/get/mutation
public projections now add nullable `projectKey`, `planRevision`, `stageId`, and
`workPackageId` consistently for authoritative replay readback.
Snapshot response preserves the existing complete v1 snapshot, with its exact
32-character revision and total count; it is not a limited item-list projection.

## Durable receipt and recovery

Receipt shape (lookup and binding return the same immutable operation):

```json
{
  "operationId": "uuid",
  "operationKind": "bind_execution",
  "actorAgentId": "plato",
  "projectRef": "shared/example",
  "idempotencyKey": "intake:tracker",
  "requestFingerprint": "sha256-of-original-service-request",
  "workItemId": "uuid",
  "result": { "workItem": {}, "intakeFingerprint": "optional-intake-sha256-or-null" },
  "createdAt": "timestamp"
}
```

`result` is the ledger's exact original JSON, not a refreshed current Item.
Existing create/update/etc. receipts are readable, with their original result
and actual request fingerprint; no intake fingerprint is invented for them.
Receipts require both original-result and current-Item Project scope to match,
so an Item moved to another Project does not leak its historical receipt there.

The server hashes explicit canonical original-request fields in stable order:
actor, Project, Item ID, expected Item version, expected complete Project revision,
Plan revision, Stage ID, Work Package ID, and optional intake decision fingerprint.
The immutable intake hash is recorded in both the ledger result and audit event.
It is caller-provided decision identity, not independent proof of authorization.

A Core client may normalize the final binding receipt as:
`{ key: idempotencyKey, fingerprint: result.intakeFingerprint,
item_id: result.workItem.id, item_version: result.workItem.version }`.
It must validate Project/actor/key/action and required intake fingerprint first;
never substitute the service `requestFingerprint` for the intake fingerprint.
Use distinct keys for preceding create/update substeps and final `:tracker`
binding. On a timeout, query that exact actor/Project/key before retrying.
Retry the exact original body: changing concurrency tokens with the same key
is an idempotency conflict. Exact duplicate binding requests return the original
receipt without incrementing version, even when original concurrency tokens are
now stale. No failed mutation leaves an operation receipt or audit event.

## Mutation and concurrency contract

The writer is current-Owner-only, for non-retired/non-archived Registry Projects.
Eligible Item states are inbox, triage, ready, and reopened. In-progress, review,
done, blocked, and waiting Items cannot be rebound by this port. Product Version
binding is retained exactly; it must belong to the same Project and be open
(not released, archived, or cancelled). Version binding kind is not changed.
The new writer reuses existing validation triggers and audit/operation tables.

The transaction uses the existing actor/key advisory lock, a PostgreSQL
`SHARE ROW EXCLUSIVE` lock on `observatory_work_items`, then the existing complete
snapshot RPC to compare `expectedProjectRevision`, followed by exact Item version
checking. The table lock covers INSERT/UPDATE/DELETE from legacy writers that do
not participate in a Project advisory-lock convention. It is deliberately
conservative and serializes this short binding transaction with all Work Item
writes. Product Version row `FOR SHARE` protects its status during binding.
Item update, version increment, audit event, and receipt insertion commit together.

Errors: 400 `INVALID_REQUEST`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`,
409 `SNAPSHOT_DRIFT` / `VERSION_CONFLICT` / `INVALID_TRANSITION` /
`IDEMPOTENCY_CONFLICT`, 503 `UNAVAILABLE`. Snapshot drift requires a fresh complete
snapshot and renewed decision; it is not permission to auto-update the token.

## Deployment verification still required

The source/mocked-route/migration-contract and Plugin tests are supplemented by
`scripts/concerto/verify-public-interfaces-local.mjs`. It accepts only an explicit
loopback maintenance URL in `CONCERTO_DISPOSABLE_PG_URL` (no query overrides),
creates and drops its own random isolated database, and executes the actual CRUD,
complete-snapshot, and candidate migrations plus the exact existing version
validation trigger on a minimal faithful predecessor schema. The fixture omits
unrelated Supabase profiles/claim/UI tables; auth role/UID functions are local
shims. PostgreSQL 18.4 verification passed eight groups covering permissions,
owner checks, audit/receipt atomicity, replay/conflict, actor/Project isolation,
508-Item completeness, closed versions/states, and a real two-connection legacy
insert race. This is isolated SQL evidence, not a deployed API/Gateway check.

Before claiming operational readiness, an independently
authorized deployment must apply migration `20261027000100`, deploy the server,
install/activate the updated Plugin during its normal activation window, and
verify in an isolated authorized test Project:

1. Service-role-only EXECUTE and denied public/anon/authenticated calls; no table
   grants accidentally added. Owner reassignment and actor/Project receipt
   isolation, including unknown keys and caller authority-injection attempts.
2. Atomic successful binding with audit plus durable original result; exact
   duplicate returns identical receipt and one version increment/event; same key
   with changed intake hash, Item, Project, or binding conflicts.
3. All forbidden states and closed/mismatched Product Versions, including status
   races; rejection leaves no mutation, event, or receipt.
4. Two concurrent connections: any legacy create/update/delete on any Item in
   the target Project between snapshot acquisition and binding yields drift or
   is serialized until after commit. Verify the complete snapshot detects Items
   beyond ordinary list limits, even when the bound Item itself is unchanged.
5. Timeout recovery through operation lookup and complete fresh-Agent typed-tool
   calls; existing wrappers retain their contracts. No Wenya Item/Graph/schedule
   or Core fixture is a substitute for these supported-backend checks.

## Bounded migration release entry

Use the dedicated entry, not generic `supabase:apply-missing`:

```sh
npm run observatory:concerto-public-interfaces:deploy -- status
npm run observatory:concerto-public-interfaces:deploy -- check
# Separate production authorization, PR CI and Preview are required before apply:
npm run observatory:concerto-public-interfaces:deploy -- apply
```

The launcher reads the existing `.env.local` internally (or the existing
`GLAUCON_POLITEIA_ENV_FILE` file setting), pins the production Supabase identity,
exact migration version/path and prints only redacted metadata. It accepts no
URL, SQL or extra command arguments. The only permitted DB URL flags are exact
`pgbouncer=true` and `sslmode=require`, with no duplicates; flags are stripped
before connection and TLS is enforced independently. Endpoint, credential,
path, protocol and other query overrides fail closed.

`status` is strictly read-only. `check` uses one native postgres.js transaction
for migration/history/catalog/grants/real RPC/audit/replay verification and
unconditionally rolls it back. Protected Item timestamps/versions, audit IDs,
operation IDs/fingerprints, Product Versions and migration-history digests must
match afterward. Expected permission/idempotency failures use native child
savepoints. A separate read-only transaction verifies denial recovery, a healthy
subsequent query and actual COMMIT, detecting parent-driver scope poisoning.
`apply` commits only schema/history: its real probe is rolled back through a
native savepoint, then committed semantic status is checked separately. A
post-commit verification failure emits the explicit
`CONCERTO_PUBLIC_APPLY_COMMITTED_VERIFY_STATUS` marker; inspect status before any
retry. Recovery remains forward-only; never remove audit/operation history.

Verification evidence for this candidate:

- Disposable PostgreSQL 18.4: 11 groups pass, including fresh rollback rehearsal,
  LOCAL-only apply with zero surviving probe rows, already-applied rehearsal,
  read-only status/COMMIT isolation, and the eight original SQL contract groups.
- Production read-only status: migration remains unapplied.
- Production rollback-only rehearsal: success; all five semantic catalog
  invariants, 29 individually checked grants, two audit events/two operation
  receipts, original-result replay and native expected-error isolation verified;
  protected-state digests unchanged after rollback.
- Migration SHA-256:
  `249e2577db9a6f241986fcc6777d96f8a963fcd9989b3a5bca2f4a7c97325a36`.
- Independent source review reported no Important/Critical finding. No production
  apply, app release, Plugin activation, merge or PR was performed by this entry's
  preparation work. Live availability remains a separate deployment gate.
