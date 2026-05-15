# RLS Verification Record

## Verified By Migration Review

- `profiles`: public read, own insert/update, admin update.
- `posts`: public published read, author draft read, author/admin mutations.
- `tags`: public read, admin mutations.
- `post_tags`: readable-post select, author/admin writes.
- `comments`: readable-post select, own insert/update/delete.
- `post_reactions`: public aggregate-compatible read, own insert/delete.
- `bookmarks`: own/admin read, own insert/delete.

## Verified In Remote Project

- Required launch tags are readable with the publishable key.
- Raw bookmark rows are not exposed to anonymous users by policy design.

## Pending Manual Checks

- Authenticated non-owner cannot read another author's draft.
- Authenticated non-owner cannot update/delete another user's comment.
- Avatar object writes are restricted to the user's own folder after avatar migration is applied.
