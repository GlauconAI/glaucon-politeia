# Concerto Agent Work Item Tools V1 — Release Report

## Release candidate

- Implementation commit: `9d3d070`
- Branch: `feat/concerto-agent-work-item-tools-v1`
- Work: `work_14b548e5d66250cef37e65a1`

## Delivered

- Concerto Agent Work Item list, get, create, update, transition, assign, and
  evidence APIs.
- Supabase service-role RPC boundary with optimistic concurrency, durable
  idempotency, canonical Project Owner authorization, and Agent-attributed
  audit events.
- `openclaw-concerto` Plugin exposing nine typed tools, including the existing
  self-claim and submit-to-review lifecycle.
- Agent usage and API contract documentation.
- A bounded production migration runner with `check`, `apply`, and `status`.

## Verification evidence

- `npm run release:verify`: 154 files and 1104 tests passed; lint, typecheck,
  and diff-check passed.
- `npm run build`: production Next.js build passed and emitted both Concerto
  API routes.
- `npm --prefix openclaw-plugin test`: 8/8 passed.
- `openclaw plugins build --check --root openclaw-plugin`: metadata up to date.
- Production Supabase rollback-only migration/RPC probe: catalog, RLS,
  privileges, create/update, two audit events, and two idempotency records
  passed; the transaction was rolled back.

## Production sequence

1. Publish the reviewed repository commit through the Work Tracker release
   channel.
2. Apply migration `20260926000100_concerto_agent_work_item_api` once preview
   checks are green.
3. Merge and wait for the exact production deployment and production smoke.
4. Configure the protected per-Agent token map and install the Plugin package.
5. Stop at `READY_FOR_ACTIVATION`.
6. During an idle window, an independent Operator performs a complete Gateway
   restart and checks Plugin/tool health.

## Activation status

The web/API release may be activated through the normal production channel.
The OpenClaw Plugin must not be hot reloaded or activated from this Agent turn.
Its runtime activation remains `READY_FOR_ACTIVATION` until the independent
idle Gateway restart is completed.
