# Concerto Agent Work Item Tools V1

## Purpose

Give registered OpenClaw Agents a typed, browser-free path to operate Concerto Work Items while preserving Concerto as the operational authority.

## Architecture

```text
Agent turn
  -> openclaw-concerto typed tool
  -> Concerto Agent API
  -> policy + schema validation
  -> existing repository / Supabase RPC
  -> Work Item and immutable audit events
```

The Plugin is a transport adapter. Concerto performs authorization and lifecycle validation. Agents must not write Supabase directly.

## V1 tools

- `concerto_list_work_items`: list only items visible to the caller.
- `concerto_get_work_item`: read one visible item and its allowed actions.
- `concerto_create_work_item`: create an Inbox item assigned to the caller.
- `concerto_update_work_item`: update mutable content on an item assigned to the caller; Project Owners may update their Project items.
- `concerto_transition_work_item`: ordinary Agents may move their own item through non-terminal execution states and may submit `in_progress -> review`; Project Owners may perform allowed transitions on their Project and alone may perform `review -> done` or `done -> reopened`.
- `concerto_assign_work_item`: Project Owners assign an item in their Project to a registered Agent. Ordinary Agents cannot assign another Agent.
- `concerto_add_evidence`: add HTTP(S) evidence to a visible item.
- `concerto_claim_work_item` and `concerto_complete_claim`: thin wrappers around the existing claim lifecycle. Completion submits the Work Item to Review.

## Identity and authorization

- The Plugin derives `agentId` from the trusted OpenClaw tool context.
- The Plugin selects the matching bearer token from protected Gateway configuration. Callers cannot provide or override `agentId`.
- Concerto authenticates the bearer token with the existing constant-time token verifier.
- Project ownership comes from the canonical registry snapshot, normalized to the runtime Agent ID.
- Ordinary Agents can see items assigned to themselves and items in Projects they own.
- Project Owners can assign, update, and transition items in their Projects.
- Only a Project Owner can move `review -> done` or `done -> reopened`.
- Existing claim eligibility, authorized paths, lease, and completion rules remain authoritative.

## Mutation contract

Every mutation requires:

- `expectedVersion` for optimistic concurrency;
- `idempotencyKey` for create and other repeatable command boundaries;
- strict JSON with bounded size;
- an allowed lifecycle transition;
- an audit event whose `agent_id` is the authenticated principal.

Responses return the current Work Item version and allowed actions. Errors are stable machine codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_TRANSITION`, `READY_GATE_FAILED`, `IDEMPOTENCY_CONFLICT`, and `UNAVAILABLE`.

## Operational boundary

- Human browser UI remains supported and unchanged.
- Agent tools never automate Chrome and never receive a Supabase service-role credential.
- The V1 excludes bulk mutation, deletion, cross-Project scheduling, and natural-language command execution.
- Production API deployment follows the Work Tracker release channel.
- Plugin activation requires an independent idle Gateway restart; no active Agent turn performs Plugin reload or Gateway restart.

## Acceptance

1. A registered ordinary Agent can list, read, create, update, self-claim, add evidence, and submit its own execution to Review without Chrome.
2. An ordinary Agent cannot assign another Agent, complete final acceptance, spoof another Agent, or access unrelated items.
3. A Project Owner can assign registered Agents and perform final allowed transitions only inside owned Projects.
4. Stale versions and repeated idempotency keys fail safely.
5. Every accepted mutation produces an Agent-attributed audit event.
6. OpenClaw tools return structured success and error results without exposing tokens.
