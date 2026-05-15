# UX And Content System

## Global Layout

The site uses a work-focused content shell:

- Fixed top header.
- Desktop left navigation.
- Desktop right information panel.
- Center content column optimized for reading and writing.
- Mobile single-column layout.

The layout should be dense enough for repeated reading and content management, while still feeling personal and polished.

## Header

Required elements:

- Brand entry: `Vibe Academy` initially, unless renamed during branding.
- Subtitle: `Vibe First, Code Later - My AI Coding Journey`.
- Search box that navigates to `/search?q=...`.
- Write button linking to `/editor`.
- Theme toggle.
- User menu.

User menu:

- Logged out: login link to `/auth`.
- Logged in: show email or display name, profile link, and logout action.

## Left Navigation

Required links:

- `/`
- `/lab/world`
- `/todos`
- `/tags/vibe-coding`
- `/tags/trae-solo`
- `/tags/projects`
- `/tags/pitfalls`
- `/profile/me`
- `/admin/prompts`

The Prompt Admin link can remain visible but must still enforce access on the destination.

## Right Panel

Content:

- Welcome card introducing the site.
- Start writing action.
- Vibe Coding tag action.
- Popular tags.

## Home Feed

Home page includes:

- Intro card.
- Paginated published post feed.
- Empty state with write action.
- Previous/next pagination.

Article card includes:

- Title linking to detail page.
- Author linking to profile.
- Relative publish time.
- Excerpt.
- Tags.
- Like and bookmark controls with counts.

## Editor

The editor should be simple and reliable in P0:

- Title field.
- Existing tag selection, max 3.
- Markdown body.
- Save draft.
- Publish.
- Clear validation state.
- Redirect unauthenticated submitters to `/auth?redirectTo=/editor`.

Deferred:

- Editing existing posts.
- Deleting posts.
- Creating tags from the editor.

## Article Detail

Article detail includes:

- Breadcrumb.
- Title.
- Author block.
- Tags.
- Like/bookmark actions.
- Markdown body.
- Comment section.

Markdown must support code blocks, GFM tables/lists, links, inline code, and dark mode.

## Profiles

`/profile/me` is a resolver route:

- Logged out users redirect to auth.
- Logged in users without profile get one created.
- Logged in users with profile redirect to `/profile/[username]`.

Public profile page:

- Avatar.
- Display name.
- Username.
- Bio.
- Published article list.

Owner-only areas:

- Edit display name, bio, avatar.
- My articles tab showing drafts and published posts.
- My bookmarks tab.

## Search And Tags

Search page states:

- No query: ask for a keyword.
- No results: show no-result message and home link.
- Results: post card list.

Tag page states:

- Missing tag: 404.
- No posts: empty state.
- Posts: tag heading plus post list.

## TODO Tool UX

The TODO page is a compact app surface:

- Header with title, export buttons, and counts.
- Form for title, priority, and notes.
- Filter segmented control.
- Sort select.
- Stable list rows with complete, edit, delete actions.

The page must work entirely offline after load because state is localStorage-based.

## Prompt Admin UX

Admin page must favor scanability:

- Filter controls at top.
- CSV export.
- 24-hour trend.
- Paginated table.
- Batch actions.
- Marked and sensitive badges.
- Content preserves line breaks and wraps long text.

Avoid full page reloads after batch operations in the new implementation.

## 3D Lab UX

The 3D Lab is a separate experimental route, not the primary home page.

Required interactions:

- Scroll changes active card.
- Click inactive card to focus.
- Click active card to navigate.
- Hover changes cursor and focus styling.
- Enter opens active card.
- Suspense fallback prevents blank canvas.
- Mobile performance fallback or reduced effects.
