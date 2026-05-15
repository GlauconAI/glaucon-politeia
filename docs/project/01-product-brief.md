# Product Brief

## Working Name

Glaucon Politeia, with the initial product identity inherited from the previous `Vibe Academy` concept.

## Product Goal

Build a personal website that works as a durable AI coding learning archive and lightweight community-style publishing platform. The site should support public reading, authenticated writing, profiles, comments, likes, bookmarks, tags, search, and later independent experimental modules such as Prompt capture, a local TODO tool, and a 3D navigation lab.

## Primary Audience

- The site owner, as the main author and administrator.
- Visitors interested in AI coding workflows, Trae usage notes, project retrospectives, and pitfall logs.
- Future authenticated users who may comment, bookmark, and interact with published content.

## Product Shape

The core product is a dynamic content application, not a static blog. It should use database-backed posts, profiles, tags, comments, reactions, and bookmarks. The visual structure can keep the previous dev.to-inspired three-column reading experience, but the engineering model should be built for authenticated runtime behavior.

## Release Priorities

### P0: Core Publishing Loop

The first shippable product must let users sign up, maintain profiles, publish posts, read posts, search, browse tags, comment, like, and bookmark.

### P1: Personal Utility And UX Polish

Add the local TODO tool, avatar upload, stronger empty/error states, and mobile refinements.

### P2: Prompt Capture And Admin

Add automatic Prompt capture and the admin backend after the main product is stable. This subsystem has privacy, security, retention, and admin authorization complexity, so it should not block the P0 launch.

### P3: 3D Lab

Add the Bruno Simon-inspired 3D navigation experiment as a separate experience after the content product has shipped.

## Explicit Non-Goals For P0

- Billing, subscriptions, teams, organizations, invitations, or SaaS dashboards.
- Full CMS admin for all content.
- Article edit/delete UI, unless intentionally pulled into a later milestone.
- Public creation of new tags from the editor.
- Prompt capture, prompt admin, and 3D lab in the first release.

## Success Criteria

- A visitor can discover and read published posts from home, tags, search, and detail pages.
- A signed-in user can publish a Markdown post, comment, like, and bookmark.
- Private user state is protected by Supabase RLS and verified by tests.
- The application can be extended with independent modules without rewriting the core layout, auth, or data access patterns.
