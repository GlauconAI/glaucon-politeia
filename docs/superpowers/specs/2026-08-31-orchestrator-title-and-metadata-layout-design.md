# Orchestrator Title and Metadata Layout Design

## Goal

Give the Orchestrator control surface more usable reading width and remove the duplicate product title while preserving every navigation target, registry datum, and authorization boundary.

## Approved interpretation

The annotated screenshot and explicit production authorization approve these changes:

1. Replace the outer shell heading `Orchestrator` with `Openclaw Orchestrator｜Multi-Agent 编排系统设计`.
2. Remove the same product-title label from the inner artifact navigation bar. Keep the 402v brand, artifact path, section links, and standalone status.
3. Remove the fixed right metadata rail from the two-column reading layout.
4. Reintroduce its complete `Contract`, `Control`, and `Artifact` content in a closed-by-default `System metadata` disclosure above the article. When opened, the three groups use a desktop three-column grid and a single-column mobile stack.
5. Let the article use the full artifact width at all breakpoints.

## Meaning of the metadata

- `Contract` identifies the canonical registry block, registry version, validated projections, and delivery mode.
- `Control` states runtime governance invariants: Scenes are not created automatically, Thin Runtime does not participate in catalog synchronization, and audit is read-only.
- `Artifact` records delivery mechanics: HTML format, 402v interactive layout, and local/402v delivery.

These are low-frequency diagnostic facts. They remain available, but they do not deserve permanent sidebar width or sticky positioning.

## Alternatives considered

1. **Collapsed metadata disclosure above the article — selected.** Maximizes primary width, keeps all metadata accessible, and solves the clipped `Artifact` card on short frames.
2. Non-sticky right rail. Makes `Artifact` reachable while scrolling but continues to narrow the article.
3. Horizontal always-visible metadata strip. Restores width but adds constant vertical noise and makes mobile scanning worse.

## Boundaries

- Do not modify the orchestration registry JSON, its runtime script, section ordering, section anchors, project data, authorization logic, or other 402v pages.
- Preserve private visibility and the existing `openclaw-orchestrator` post identity.
- The shell code change requires the normal test/lint/typecheck/build/readiness/audit/deploy/push release gate.
- The HTML content update requires Kit verification, exact data-block preservation, exact stored hash verification, and authenticated desktop/mobile production acceptance.

## Acceptance

- The outer page has exactly one level-one heading with the full title.
- The inner `.orchestrator-nav` contains no product-title `<span>` and retains all six section links.
- `.artifact-layout` is one column and has no sticky metadata rail.
- A closed `System metadata` disclosure is present before the main article and contains all three original metadata groups.
- At 1280px and 390px there is no page-level horizontal overflow, the article uses the available artifact width, metadata expands/collapses, and `Runtime` navigation still works.
- Production stores and serves the exact verified candidate, and the 402v deployment is `READY` on the `402v.com` alias.

