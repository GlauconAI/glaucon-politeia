# Glaucon Politeia Project Documentation Index

This directory converts the previous Trae implementation notes into implementation-ready project documents for rebuilding the personal site as a robust, extensible product.

## Source Materials

- `docs/raw/CODEX_IMPLEMENTATION_SPEC.md`: Legacy full product implementation notes from the Trae version.
- `docs/raw/PROJECT_START_STRATEGY.md`: Legacy start strategy and phased rebuild recommendation.

These source documents are preserved as historical input. New implementation work should use the documents below as the working source of truth.

## Working Documents

1. `01-product-brief.md`
   - Product goal, audience, scope boundaries, release priorities, and explicit non-goals.

2. `02-requirements.md`
   - Functional and non-functional requirements grouped by subsystem.

3. `03-architecture.md`
   - Recommended application architecture, module boundaries, rendering strategy, and extensibility rules.

4. `04-data-permissions.md`
   - Supabase tables, privacy decisions, RLS expectations, storage, seed data, and migration rules.

5. `05-api-contracts.md`
   - API routes, request/response shapes, validation expectations, and authorization requirements.

6. `06-ux-content-system.md`
   - Layout, theme, navigation, article writing and reading flows, profile surfaces, and visual/interaction rules.

7. `07-quality-test-strategy.md`
   - Testing layers, required coverage, QA gates, security checks, and release verification.

8. `../milestones/roadmap.md`
   - Milestone plan with deliverables, acceptance criteria, dependencies, and recommended sequencing.

9. `08-legacy-analysis.md`
   - Detailed analysis of the Trae-era materials, extracted risks, subsystem boundaries, and rebuild decisions.

## Implementation Principles

- Start from a thin Next.js + Supabase foundation instead of migrating template code.
- Treat Supabase schema, RLS, and test coverage as first-class product code.
- Ship the content community loop first; keep TODO, Prompt Admin, and 3D Lab as separate milestones.
- Prefer small modules with clear ownership over a large route-centric implementation.
- Keep personal-site polish, content authoring, and future extensibility in balance.
