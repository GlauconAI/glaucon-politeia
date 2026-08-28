# Work Tracker Item UX Design

## Goal

Make Work Tracker Items easier to operate and read by closing card action menus when focus moves elsewhere, introducing a durable assigned Agent separate from human ownership and temporary Agent Claims, and restructuring the Item detail page around the way an operator scans and updates work.

## Reuse gate

- **Reuse:** retain the existing Next.js, React, Supabase RPC, audited event, Project registry, 402v CSS-token, and native `<details>`/form foundations.
- **Adapt:** use Linear's issue-page pattern: the main narrative stays primary, stable properties live in a sidebar, assignee is visible on cards, and audit/activity remains a distinct chronological surface. Use the existing 402v visual language instead of importing a third-party component system.
- **Build:** add only the domain-specific pieces missing from the current product: durable `assigned_agent_id`, audited persistence, menu dismissal coordination, and the new detail layout.

No new UI dependency is justified. A component library would add weight and visual drift for behavior that React, semantic HTML, and the current design tokens can implement directly.

## Product decisions

### Assigned Agent semantics

`owner_id` remains the accountable human administrator required by the Ready Gate. `assigned_agent_id` is the stable Agent responsible for executing the Item. An active Claim remains a short-lived lease and never changes assignment or control authority.

Every existing Item receives an assignment during migration. Canonical Project references default assignment to the owner segment of `owner/project`; legacy references fall back to `plato`, matching the current retained operational inventory. New Quick Captures derive the initial assignment from their required canonical Project. The detail page can explicitly change it to another normalized Agent ID.

The field is non-null and constrained to lowercase Agent IDs matching `^[a-z][a-z0-9-]{0,79}$`. Updates are included in the existing optimistic-version RPC and before/after audit event.

### Card actions

Only one card menu may be open. Clicking or focusing outside it, opening another menu, pressing Escape, or submitting a transition closes it. The native `<details>` element is retained for semantic disclosure behavior, with a small board-level coordinator for controlled dismissal.

### Detail information architecture

Desktop uses a two-column issue workspace:

- A wide main column contains the editable title, description, acceptance criteria, Evidence, and Activity.
- A compact sticky sidebar contains workflow state, type, priority, Assigned Agent, human Owner, Project, milestone, Project Control binding, and Agent Claim controls.
- The page header contains the breadcrumb, Item title, state/type/version badges, and timestamps.

At tablet/mobile widths the sidebar becomes a normal single-column section. All controls remain full-width and the page must not create horizontal overflow.

## Components and data flow

1. Supabase migration adds/backfills/constrains `assigned_agent_id`, replaces create/update RPCs, and preserves authenticated-only execution.
2. `ObservatoryWorkItemRow` and update validation include `assignedAgentId`.
3. Repository reads/writes include the new column/argument.
4. The server action validates and forwards the field through the existing authorization boundary.
5. Board cards render a dedicated `Assigned · <agent>` badge; Claim state remains separate.
6. The detail component sources suggested Agent IDs only from the Agent snapshot, includes the current value even if it is not present in the current snapshot, and saves through the existing audited update action. Project owner display labels are not Agent IDs and must never become assignment options.

## Error handling and accessibility

- Invalid or missing Agent IDs fail validation before RPC execution.
- Database constraints remain the final authority and optimistic version conflicts keep their current user-facing response.
- Menus expose `aria-expanded`, close on Escape, and restore focus to their trigger after keyboard dismissal.
- Sidebar labels use explicit form associations; status feedback retains `role=status`/`role=alert`.
- The migration is transactional and fail-closed.

## Verification

- Red/green component tests for outside-click, second-menu, Escape, card assignment display, and detail assignment editing/layout landmarks.
- Schema/action/repository/migration tests for validation, select lists, RPC arguments, backfill, constraints, grants, and audit payload.
- Full Vitest suite in a single-worker configuration if the parallel HTML Kit tests reproduce their known host-load timeout; ESLint, TypeScript, and Next.js production build.
- Authenticated desktop and 390×844 production acceptance: menu dismissal, assigned Agent on cards/details, readable detail hierarchy, no page overflow, no console/runtime errors, and no production Item mutation during acceptance.
