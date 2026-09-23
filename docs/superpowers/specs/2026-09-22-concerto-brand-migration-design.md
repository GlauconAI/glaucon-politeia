# Concerto Brand Migration Design

## Status

- Product: `Concerto — Work & Collaboration System`
- Parent brand: `Sinfonia — Multi-Agent System`
- Owner: Plato
- Decision owner: Glaucon
- Decision: approved on 2026-09-22
- Scope: visible brand layer only
- Canonical brand source: `plato-academy/projects/openclaw-orchestrator/sinfonia-brand-foundation-v1.md`

## Goal

Make Concerto the clear user-facing name of the existing Work Tracker product while preserving every workflow, authority boundary, route, data contract, and historical record underneath it.

The migration should let a user understand three facts immediately:

1. **Concerto** is the product name.
2. **Work & Collaboration System** is what the product does.
3. A **Work Item** remains the individual unit of tracked work.

## Chosen approach

Adapt the existing Partitura brand-lockup pattern. Change only current product-facing names, descriptions, metadata, navigation labels, accessibility labels, errors, and current operator documentation.

Do not add collaboration features, redesign the workflow, migrate routes or data, introduce a second implementation, or rename stable technical identifiers. This is a brand-layer migration, not a product rebuild.

## Product lockup

The canonical visible lockup is:

> **CONCERTO**
>
> Work & Collaboration System
>
> *Where work and minds move in concert.*

The `/work-tracker` hero should render this hierarchy in the existing visual system:

- keep `402v /work-tracker` as the technical path eyebrow;
- change the primary heading from `Work Tracker` to `Concerto`;
- add `Work & Collaboration System` as the functional subtitle;
- add the approved slogan;
- keep the current admin-only access and authority status line unchanged.

## Product boundary

Concerto is the user-facing product that supports work tracking and collaboration across humans and Agents. Its existing surface already covers Ideas, Features, Bugs, workflow state, ownership, Agent assignment and bounded claim, Project and Stage binding, Ready Gate, evidence, review, audit history, and completion.

This release does not claim new capabilities. It names the product according to the capabilities that already exist.

## Naming boundary

### Use `Concerto`

Use `Concerto` when current UI or current operator documentation names the product itself:

- product heading, functional subtitle, and slogan;
- browser metadata;
- authenticated global navigation;
- product-level accessibility labels;
- product root return links and item breadcrumbs;
- user-facing availability and data-loading errors;
- Project Control references to the product integration;
- current README, acceptance documentation, and release-channel copy.

### Use `Work Item`

Use `Work Item` for an individual tracked unit. Existing labels for Idea, Feature, Bug, Project, Owner, Agent, Stage, Gate, Evidence, Review, and History remain direct workflow vocabulary.

### Preserve `Work Tracker`

Keep `Work Tracker` only where it is an established technical compatibility identifier or an immutable historical statement:

- `/work-tracker` and `/work-tracker/items/[id]` routes;
- legacy redirect behavior under `/dashboard/work-items/[id]`;
- source paths, component and exported symbol names, CSS classes, test filenames, data-testid values, script filenames, and npm command names;
- API, database, RPC, schema, migration, Registry, and release-channel identifiers;
- historical specs, plans, reports, evidence, audit records, and already published release notes;
- canonical data or test-fixture values whose content happens to contain `Work Tracker`;
- an explicit compatibility note explaining that Concerto retains the `/work-tracker` technical route.

No current product surface should present `Work Tracker` as a competing product name.

## Information architecture

### Root surface

The product page keeps the existing Quick Capture, filters, views, board, list, timeline, and access behavior. Only the product lockup and product-naming copy change.

### Global navigation

The authenticated operator link changes from `Work Tracker` to `Concerto` while retaining `href="/work-tracker"` and the current authorization condition.

### Work Item detail

The detail breadcrumb becomes `Concerto / Item`, and the return link becomes `返回 Concerto`. The canonical item route and back-link target remain unchanged.

### Project Control integration

Current UI copy should describe bound `Concerto items`, not `Work Tracker cards`. Binding fields, read models, mutations, and authority rules remain unchanged.

### Browser metadata

The route family receives the title `Concerto — Work & Collaboration System` and a concise description based on the approved slogan. Routes and indexing behavior do not change.

## Accessibility

- The main heading has the accessible name `Concerto`.
- The functional subtitle and slogan are readable text, not CSS-generated content.
- Product-level regions and controls use `Concerto` in accessible names.
- Error and status messages that name the product use `Concerto`.
- Existing focus order, keyboard workflow, status semantics, and authorization behavior remain unchanged.

## Error and empty states

All current fallback behavior and privacy boundaries remain unchanged. Copy that explicitly names the product changes to `Concerto`; domain-specific Work Item language remains intact.

## Current documentation

README and current product/release documentation should introduce `Concerto — Work & Collaboration System` at the first meaningful mention. Technical commands and paths remain verbatim. Historical evidence is not rewritten.

## Non-goals

- no new collaboration, messaging, commenting, assignment, notification, or synchronization feature;
- no workflow-state, Ready Gate, claim, review, ownership, or authorization change;
- no route, API, schema, database, RPC, migration, or data rewrite;
- no new logo, color system, component library, or information-architecture redesign;
- no Maestro, Contrappunto, Opus, or Baton implementation;
- no OpenClaw runtime, Gateway, Automation, or P7 Usage Guardian change.

## Testing

Use test-driven updates for the visible naming contract:

1. Root page renders `Concerto`, `Work & Collaboration System`, and the approved slogan.
2. Root page no longer uses `Work Tracker` as the product heading.
3. Browser metadata uses `Concerto — Work & Collaboration System`.
4. Authenticated global navigation links `Concerto` to `/work-tracker`.
5. Product-level accessibility labels use `Concerto`.
6. Work Item detail and Project Control surfaces use the new product name.
7. User-facing unavailable/error copy uses `Concerto`.
8. Routes, technical names, authorization, privacy, workflow, evidence, and audit behavior remain unchanged.
9. A reverse repository audit classifies every remaining exact `Work Tracker` occurrence as technical compatibility, immutable history, or canonical content.
10. Desktop and 390px browser acceptance show no overflow, clipped lockup, or console error.

## Release boundary

This is a normal Dashboard production release through the existing low-friction release process. It does not change OpenClaw runtime configuration, Gateway state, Automations, Orchestrator schemas, or the current P7 Usage Guardian Shadow Work.

The release is complete only after focused tests, the full `npm run release:verify` gate, independent review, production deployment, and production smoke against the exact released commit.

## Acceptance criteria

- Users see `Concerto — Work & Collaboration System` as one clear product identity.
- The approved slogan appears on the root product surface.
- All current user-visible product references are consistent, including accessibility and error copy.
- `/work-tracker` and every existing integration continue to work unchanged.
- `Work Item` remains the unambiguous name of an individual tracked unit.
- No technical identifier or historical record is renamed.
- No new collaboration capability is introduced.
