# Data Model And Permissions

## Database Ownership

Supabase is the source of truth for user profiles, posts, tags, comments, reactions, bookmarks, prompts, and prompt archives. All production data access must be compatible with Row Level Security.

## Core Tables

### `profiles`

- `user_id uuid primary key`
- `username text unique not null`
- `display_name text not null`
- `bio text not null default ''`
- `avatar_url text not null default ''`
- `is_admin boolean not null default false`
- timestamps

Policies:

- Anyone can read profiles.
- Users can insert and update only their own profile.
- Only trusted server/admin operations can set `is_admin`.

### `posts`

- `id uuid primary key default gen_random_uuid()`
- `author_id uuid not null`
- `slug text unique not null`
- `title text not null`
- `excerpt text not null default ''`
- `content_md text not null`
- `content_format text not null default 'markdown' check in ('markdown', 'html')`
- `content_html text not null default ''`
- `visibility text not null default 'public' check in ('public', 'private')`
- `status text check in ('draft', 'published')`
- `published_at timestamptz`
- timestamps

Policies:

- Anyone can read published posts with `visibility = 'public'`.
- Authenticated users can read published posts with `visibility = 'private'`.
- Authors can read their own drafts and published posts.
- Authenticated users can create only their own posts.
- Authors can update and delete their own posts.
- A readable post means: public published, authenticated private published, own draft/published, or admin-readable.

### `tags`

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `slug text unique not null`
- `description text not null default ''`
- `created_at timestamptz`

Policies:

- Anyone can read tags.
- P0 seeds tags through `supabase/seed.sql`.
- Tag creation UI is deferred.
- Tag insert, update, and delete are admin-only in the P0 schema.

### `post_tags`

- `id uuid primary key default gen_random_uuid()`
- `post_id uuid not null`
- `tag_id uuid not null`
- `created_at timestamptz`
- unique `(post_id, tag_id)`

Policies:

- Anyone can read tags attached to public readable posts.
- Authenticated users can read tags attached to private readable posts.
- Only the post author can create or delete tag links for that post.

### `comments`

- `id uuid primary key default gen_random_uuid()`
- `post_id uuid not null`
- `author_id uuid not null`
- `parent_id uuid`
- `content_md text not null`
- timestamps

Policies:

- Anyone can read comments for public published posts.
- Authenticated users can read comments for private published posts.
- Authenticated users can create comments as themselves.
- Comment authors can update and delete their own comments.

### `post_reactions`

- `id uuid primary key default gen_random_uuid()`
- `post_id uuid not null`
- `user_id uuid not null`
- `type text not null default 'like'`
- `created_at timestamptz`
- unique `(post_id, user_id, type)`

Policies:

- Public reads are acceptable for aggregate counts.
- Authenticated users can insert and delete only their own reaction rows.

### `bookmarks`

- `id uuid primary key default gen_random_uuid()`
- `post_id uuid not null`
- `user_id uuid not null`
- `created_at timestamptz`
- unique `(post_id, user_id)`

Policies:

- Users can read, insert, and delete only their own bookmarks.
- Admins may read all if needed.
- Public pages should not select raw bookmark rows; expose counts through safe aggregate queries, views, or RPC.

### `post_engagement_counts`

Public aggregate view over published posts only:

- `post_id`
- `like_count`
- `bookmark_count`
- `comment_count`

This view exists so public pages can show engagement counts without granting public select access to raw bookmark rows.

## Prompt Tables

### `prompts`

- `id uuid primary key default gen_random_uuid()`
- nullable `user_id`
- `client_session_id text not null`
- `source_url text not null`
- `ip inet`
- `user_agent text`
- `content text not null`
- `idempotency_key text not null`
- `flags jsonb not null default '{}'`
- `marked boolean not null default false`
- `marked_reason text`
- `deleted_at timestamptz`
- `created_at timestamptz`
- generated `content_tsv`
- unique `(client_session_id, idempotency_key)`

Policies:

- Anonymous and authenticated clients can insert valid prompt rows.
- Users can read their own prompt rows.
- Admins can read, update, and soft delete all prompt rows.
- Service role handles retention archival.

### `prompts_archive`

Structure should mirror prompt fields needed for audit and retention.

Policies:

- Admins can read.
- Service role can insert/delete during archival.

## Storage

### `avatars` Bucket

- Public bucket is acceptable for avatar URLs.
- Upload path: `{user_id}/{uuid}.{ext}`.
- Users can upload and update only their own path.
- Validate file type and size in UI before upload.

## Seed Data

Required tags:

- `vibe-coding`: Vibe Coding
- `trae-solo`: Trae Solo
- `projects`: 项目
- `pitfalls`: 踩坑

Optional seed posts can be added after the core publish flow is working.

## Migration Rules

- Every schema change must be represented as a Supabase migration.
- Every table must enable RLS in the same milestone where it is introduced.
- Policies should be tested manually through anon/auth/admin clients before UI work depends on them.
- Avoid relying on client-side filtering for privacy.
