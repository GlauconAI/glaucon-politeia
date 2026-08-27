# Orchestrator Shell Alignment Design

## Goal

Make `/orchestrator` use the same authenticated 402v page shell, top navigation, hero hierarchy, spacing, and responsive behavior as Dashboard and Work Tracker while preserving the published Orchestrator HTML artifact unchanged.

## Current problem

`/orchestrator` is implemented as a route handler that returns a standalone HTML document. Route handlers bypass the root React layout, so the page has no 402v site header and no convenient navigation back to Dashboard or Work Tracker.

## Chosen design

Use the existing React app shell for `/orchestrator` and isolate the published standalone artifact in an iframe.

- Replace `app/orchestrator/route.ts` with `app/orchestrator/page.tsx`.
- Render the same `observatory-page` and `observatory-hero` structure used by Dashboard and Work Tracker.
- Keep the existing admin authorization gate on the page.
- Move the raw HTML response to `/orchestrator/artifact` and retain its independent admin authorization gate.
- Embed `/orchestrator/artifact` in a titled iframe. This preserves the artifact's scripts and styles without allowing them to collide with the 402v shell.
- Reuse the global operator header as the return/navigation mechanism. Dashboard, Orchestrator, and Work Tracker remain peer links.

## Alternatives considered

1. Inject the artifact HTML into the React page. Rejected because a complete HTML document, global CSS, and scripts can conflict with the site shell.
2. Modify the generated artifact to duplicate the 402v header. Rejected because it creates a second navigation implementation and couples the artifact generator to site chrome.
3. Open the artifact in a separate tab. Rejected because it does not solve the missing in-page navigation.

## Visual and responsive contract

- The page uses the shared site header and compact operator hero.
- The artifact frame fills the available content width and has a bounded minimum height on desktop.
- On phones, hero content stacks and the iframe remains within the viewport with no page-level horizontal overflow.
- The iframe has an accessible title and a visible fallback link to the artifact endpoint.

## Security and failure behavior

- Anonymous visitors to `/orchestrator` redirect to `/auth?redirectTo=/orchestrator` before rendering.
- Anonymous direct requests to `/orchestrator/artifact` receive the same redirect.
- Missing published artifact behavior remains a non-sensitive 404 JSON response inside the frame.
- The published artifact HTML is served byte-for-byte by the artifact endpoint.

## Verification

- Unit tests cover the page authorization gate, shared hero, iframe source/title, and artifact endpoint behavior.
- CSS contract tests cover iframe sizing and phone containment.
- Full Vitest, ESLint, TypeScript, and Next.js production build gates must pass.
- Production acceptance checks authenticated desktop and 390×844 mobile rendering, operator navigation, iframe loading, overflow, and console/runtime errors without mutating production data.
