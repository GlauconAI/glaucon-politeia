# ADR 0001: Start From A Thin Next.js And Supabase Foundation

## Status

Accepted.

## Context

The legacy Trae materials describe a dynamic personal publishing product with authentication, profiles, posts, comments, likes, bookmarks, tags, Prompt capture, admin workflows, local TODO tooling, and a 3D lab.

The old implementation notes also mention static blog-template assumptions such as local MDX, generated tags, generated search indexes, and build-time content. Those assumptions do not fit a runtime community product.

Large SaaS templates were considered but add billing, teams, subscription roles, dashboards, and other product assumptions unrelated to this site.

## Decision

Use a thin Next.js App Router + TypeScript + Tailwind + Supabase foundation. The official Supabase Next.js starter is the preferred reference, but product behavior should be implemented in this repository with project-owned schema, RLS, routes, components, and tests.

## Consequences

Positive:

- Minimal inherited complexity.
- Product schema and permissions stay explicit.
- Easier to reason about privacy and RLS.
- Better long-term fit for custom content, Prompt capture, and experiments.

Negative:

- More business features must be built directly.
- Initial velocity may be slower than adapting a feature-heavy template.

## Guardrails

- Do not import SaaS billing/team concepts unless the product scope changes.
- Do not reintroduce local-MDX content as the primary data model.
- Keep optional subsystems independent from the core publishing loop.
