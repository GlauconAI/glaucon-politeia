# Work Tracker Compact Density Design

**Goal:** Reduce repeated framing and visual weight so the Work Tracker shows more operational information without weakening workflow semantics or accessibility.

## Context and decision

The page-level hero already names and explains Work Tracker. The board repeats that title, adds an implementation-oriented audit note, and puts the Item count in a separate heading row. The Project controls, view tabs, card actions, and claim-policy badge then compete at nearly the same visual weight.

Three approaches were considered:

1. **Recommended — one compact density system.** Remove the duplicate board heading and audit copy, compose the Project controls and Item count as one toolbar, and use a consistent four-level type scale across the hero, toolbar, tabs, columns, cards, badges, and menus.
2. **Point fixes only.** Reduce isolated font sizes without changing structure. This leaves the duplicate heading and extra vertical rows, so it does not solve the hierarchy problem.
3. **Minimal board chrome.** Hide most labels and metadata. This gains density but removes useful Project, state, priority, type, and claim-policy context.

The first approach best matches the requested balance: compact but still auditable.

## Information hierarchy

- The page hero remains the only Work Tracker title and description.
- The board starts with one compact toolbar containing Project search, Project filter, and the visible/total Item count.
- The active/completed tabs remain on their own row below the toolbar.
- The four work groups remain unchanged. The nine canonical states and legal transitions remain unchanged.
- Card metadata remains type, exact state, priority, Project, and claim policy.

## Density and typography

- Work Tracker page hero: smaller than the generic Observatory hero, with a 36px desktop cap.
- Toolbar controls: 36px high; labels and Item count use 11–12px supporting text.
- View tabs: 32px high and 13px text.
- Column title: 14px; canonical-state description: 10px.
- Card title: 13px, semibold/bold, 1.35 line-height.
- Type/state/priority/Project/claim badges: 10px and 20px minimum height.
- Three-dot trigger: 26×24px; menu actions: 12px and 30px minimum height.
- The board keeps a 44px minimum target for primary actions elsewhere; the compact three-dot trigger is an exception because it is a low-frequency secondary control, retains a clear focus state, and is paired with a larger menu target.

## `Manual` meaning

`Manual` is a claim-policy label. It means the Item is not currently eligible for autonomous Agent claiming under the bounded-claim rules. The Item can still be advanced through the audited workflow, but a human/admin must initiate or explicitly coordinate that work. It is not the Item type, state, or owner.

This change keeps the label and its contract, but makes it visually subordinate to title, type, state, priority, and Project.

## Responsive behavior

- Desktop: two Project controls and the Item count share one row.
- Narrow desktop/tablet: controls shrink within bounded widths; the Item count remains at the right edge when space allows.
- Mobile: the toolbar stacks without page-level horizontal overflow; the four-column board continues to scroll only inside the board.

## Testing and acceptance

- Component tests prove the duplicate board title/copy are gone, the toolbar owns the Item count, and the board-specific picker omits its redundant availability count.
- Existing workflow, filtering, URL persistence, view switching, menu transitions, and claim-policy tests continue to pass.
- Fresh Vitest, ESLint, TypeScript, and production build gates must pass.
- Production browser acceptance at 1280px and 390×844 verifies density, containment, menu readability, and zero console/runtime errors without mutating Items.

