# Orchestrator Site Entry Design

## Goal

Publish the current OpenClaw Orchestrator interactive HTML artifact to 402v and expose it as an operator-level entry beside Dashboard and Publish.

## Decisions

- Add an admin-only `Orchestrator` header action between `Dashboard` and `Publish`.
- Use `/orchestrator` as the stable top-level operator route.
- Store the standalone HTML in the existing Supabase `posts` table under the private, published slug `openclaw-orchestrator`.
- Have `/orchestrator` verify the current Observatory administrator, load the published HTML through the server-only Supabase admin client, and return the exact standalone document with the existing artifact security headers.
- Redirect unauthenticated and non-admin visitors to `/auth?redirectTo=/orchestrator`.
- Do not iframe, duplicate, or partially re-render the Orchestrator interface in Next.js.

## Release contract

The canonical Orchestrator HTML remains the source artifact. Publication copies its exact bytes into the existing post record. Website deployment changes only the operator navigation and protected delivery route. Production acceptance requires focused tests, the complete test suite, lint, typecheck, production build, artifact hash agreement, and authenticated/anonymous browser smoke tests.

