# Work Tracker Compact Density Production Evidence

Date: 2026-08-26  
Production URL: `https://402v.com/work-tracker`  
Final GitHub `main`: `2309d1b830d56aadd699e4bdf865b241a9fb7615`  
Vercel deployment: `6113667073`  
Deployment URL: `https://glaucon-politeia-3hb9tlt25-plato-8448s-projects.vercel.app`

## Release contents

- `40fb87a`: compact-density design and implementation plan.
- `43872de`: remove duplicate board framing; add the compact toolbar; reduce Work Tracker hero, controls, tabs, cards, badges, three-dot trigger, and menu typography.
- `2309d1b`: restore protected Observatory surfaces by using the already-authenticated server client for the administrator Profile lookup.

`Manual` remains the claim-policy label for an Item that is not eligible for autonomous Agent claiming. It means a human/admin must initiate or coordinate progression; it is not the Item type, state, Project, or owner. Its production rendering is now `10px` high-priority-supporting text inside a `20px` badge.

## TDD evidence

- Board structural test first failed because `Daily write surface`, the duplicate level-two `Work Tracker` title, audit copy, and Project availability count still rendered.
- After the toolbar implementation, `tests/observatory-work-tracker-board.test.tsx` passed `9/9`.
- Production authorization regression test first failed because `getCurrentObservatoryAdmin()` still called the separate admin client.
- After moving the Profile lookup onto the authenticated server client, `tests/observatory-repository.test.ts` passed `31/31`.

## Final release gates

- Full Vitest suite: `122/122` files and `825/825` tests passed with `--maxWorkers=1 --maxConcurrency=1`.
- One earlier concurrent full-suite run produced a single unrelated `html-note-kit-update` 20-second resource-contention timeout; that exact test passed `1/1` in isolation before the final full green run.
- ESLint: passed.
- TypeScript: passed.
- Next.js 16.2.6 production build: passed; `28/28` static pages generated and `/work-tracker` compiled.
- `git diff --check`: passed before each implementation commit.
- GitHub commit status: Vercel `success` / `Deployment has completed`.

## Production incident found during acceptance

The first UI deployment completed successfully, but authenticated Work Tracker and Dashboard requests returned `AUTH_DEPENDENCY_FAILED` (`ObservatoryAdminAuthError`). Vercel runtime logs showed the same failure before the compact-density deployment, so the UI change did not introduce it.

Evidence isolated the boundary:

- `/profile/me` authenticated successfully and redirected to `/profile/glaucon`, proving Supabase user authentication was healthy.
- Work Tracker and Dashboard both failed only inside `getCurrentObservatoryAdmin()`.
- The separate admin Profile lookup depended on `SUPABASE_SECRET_KEY`; the existing user-scoped Profile lookup already identified the same administrator and was live.
- Database policy allows Profile reads, while `profiles_prevent_admin_escalation` blocks a non-admin from changing `is_admin`; moving the read to the authenticated server client preserves fail-closed authorization without the redundant service-key dependency.

After `2309d1b`, both `/work-tracker` and `/dashboard` rendered successfully in a clean authenticated browser session with zero console messages and an empty runtime error buffer.

## Desktop acceptance — 1280 × 900

- Exactly one `Work Tracker` heading remains; the implementation-oriented audit copy is absent.
- Project search and filter are `36px` high with `12px` text and widths `240px` / `300px`.
- `9 of 9 items` is `11px`, `36px` high, and bottom-aligned in the same toolbar row as both controls.
- Active/completed tab: `13px`, `32px` high.
- Four columns render at `285px` each; page width is `1280/1280` with no page-level overflow.
- Column titles are `14px`; card titles are `13px`.
- `Manual` badge is `10px` / `20px`; three-dot trigger is `26×24px`.
- Open transition menu is `132px` wide; actions are `12px` / `30px` and expose only legal transitions.

## Mobile acceptance — 390 × 844

- Page width is `390/390`; no page-level horizontal overflow.
- Toolbar stacks cleanly; Project controls remain `36px` high and `340px` wide.
- Item count remains `11px` and right-aligned.
- The four-column board scrolls only inside its container (`340px` client width, `1070px` scroll width, `overflow-x: auto`).
- Exactly one `Work Tracker` heading remains.

## Acceptance safety and artifacts

- Acceptance did not create, edit, transition, claim, or delete any production Item.
- The dedicated `402v-admin` browser session was closed after verification, leaving no profile lock.
- Screenshots:
  - `/Users/glaucon/.openclaw/tmp/work-tracker-density-desktop-final.png`
  - `/Users/glaucon/.openclaw/tmp/work-tracker-density-menu-final.png`
  - `/Users/glaucon/.openclaw/tmp/work-tracker-density-mobile-final.png`

