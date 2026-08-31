# Orchestrator Single-Document Scroll Design

## Goal

Remove the nested vertical scrolling from `/orchestrator` so the outer 402v document owns the only vertical scrollbar while preserving the published Artifact's CSS, JavaScript, authorization, and CSP isolation.

## Approved design

Keep the Artifact in its sandboxed iframe. Add a small native bridge to the published Artifact that measures the live root height with `ResizeObserver` and reports it to the parent with `postMessage`. A client-side frame component accepts messages only from its own iframe window, validates bounded numeric payloads, and sets the iframe height to the reported content height.

Because an auto-height iframe no longer scrolls internally, the bridge also intercepts same-document section links and reports the target offset. The parent scrolls the outer document to that offset while accounting for the sticky 402v header. Metadata, Scene, and Project disclosure changes trigger a new height report.

## Reuse gate

- Reuse: browser-native `ResizeObserver`, `MutationObserver`, `postMessage`, and `scrollTo`.
- Adapt: existing sandboxed iframe, `/orchestrator/artifact` authorization, and standalone HTML response.
- Build: one bounded message bridge and one React frame wrapper.
- No third-party iframe-resizer dependency is justified for this single same-product surface.

## Security and failure behavior

- Keep the CSP sandbox without `allow-same-origin`.
- The parent accepts messages only when `event.source === iframe.contentWindow` and the payload matches the exact channel/type/value contract.
- Reject non-finite, non-positive, or excessive heights.
- The iframe keeps its existing minimum height and internal scrolling until the first valid height message, so a bridge failure remains usable.
- Do not change Artifact registry data or post identity.

## Alternatives considered

1. **Native auto-height bridge — selected.** Preserves isolation and produces one vertical scrollbar with dynamic content support.
2. Render the complete Artifact directly in React. Rejected because global document CSS and scripts would collide with the site shell.
3. Use a very large fixed iframe height. Rejected because it creates blank space, cannot respond to disclosure changes, and is brittle across breakpoints.

## Acceptance

- Before the first valid message, the iframe remains usable with its current minimum height.
- After a valid height message, the iframe height follows the Artifact and the inner vertical scrollbar disappears.
- Opening and closing dynamic disclosure regions updates the outer page height.
- Overview / Runtime / Principles / Flows / Scenes / Projects links scroll the outer document to the intended section.
- Desktop and 390px mobile have no page-level horizontal overflow, no nested vertical scroll, and no browser errors.
- Production keeps private authorization, the existing post identity, CSP isolation, and exact stored/served Artifact bytes.
