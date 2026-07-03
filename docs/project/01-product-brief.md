# Product Brief

## Working Name

Glaucon Politeia, with the initial product identity inherited from the previous `Vibe Academy` concept.

## Product Goal

Build a personal website that works as a durable AI coding learning archive, lightweight community-style publishing platform, and `402v Publishing System` for HTML artifacts. The site should support public reading, authenticated writing, profiles, comments, likes, bookmarks, tags, search, public/private HTML publishing, and later independent experimental modules such as Prompt capture, a local TODO tool, and a 3D navigation lab.

## Primary Audience

- The site owner, as the main author and administrator.
- Visitors interested in AI coding workflows, Trae usage notes, project retrospectives, and pitfall logs.
- Future authenticated trusted users who may comment, bookmark, and interact with published content.
- The owner and trusted agents publishing generated HTML reports or hand-authored HTML pages to `402v.com`.

## Product Shape

The core product is a dynamic content application, not a static blog. It should use database-backed posts, profiles, tags, comments, reactions, bookmarks, and HTML artifacts. The visual structure can keep the previous dev.to-inspired three-column reading experience, but the engineering model should be built for authenticated runtime behavior.

The publishing system packages three assets into one direction:

- The existing `402v.com` / Glaucon Politeia site.
- The local `html-artifact-publisher` generator that turns reports into portable HTML site packages.
- A new publish path that inserts an existing HTML page into Supabase and exposes it through `402v.com/posts/<slug>` as either public or login-required private content.

## Release Priorities

### P0: Core Publishing Loop

The first shippable product must let trusted users log in, maintain profiles, publish posts, read posts, search, browse tags, comment, like, and bookmark. Public self-registration is not part of the production owner-publishing model.

### P0.1: HTML Artifact Publishing

Extend the core publishing loop so a local HTML file can be published to `402v.com` with `public` or `private` visibility. Markdown posts remain supported; HTML posts render in a sandboxed viewer.

### P1: Personal Utility And UX Polish

Add the local TODO tool, avatar upload, stronger empty/error states, and mobile refinements.

### P2: Prompt Capture And Admin

Add automatic Prompt capture and the admin backend after the main product is stable. This subsystem has privacy, security, retention, and admin authorization complexity, so it should not block the P0 launch.

### P3: 3D Lab

Add the Bruno Simon-inspired 3D navigation experiment as a separate experience after the content product has shipped.

## Explicit Non-Goals For P0

- Billing, subscriptions, teams, organizations, invitations, or SaaS dashboards.
- Multi-author public CMS workflows.
- Public self-registration and public OAuth signup.
- Public creation of new tags from the editor.
- Prompt capture, prompt admin, and 3D lab in the first release.
- Arbitrary unsandboxed HTML execution in the main application document.

## Success Criteria

- A visitor can discover and read published posts from home, tags, search, and detail pages.
- A signed-in user can publish a Markdown post, comment, like, and bookmark.
- The owner can publish a local HTML artifact to `402v.com`.
- The owner can edit, republish, draft, or delete existing Markdown and HTML posts from the publishing backend.
- Anonymous visitors can read public posts and public HTML artifacts.
- Logged-in users can read private published posts and private HTML artifacts.
- Private user state is protected by Supabase RLS and verified by tests.
- The application can be extended with independent modules without rewriting the core layout, auth, or data access patterns.
