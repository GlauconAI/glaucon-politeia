# Work Tracker Version UI Refinement

## Goal

Reduce toolbar and card density while preserving Project-scoped version behavior and Project Owner version-management capability.

## Approved behavior

- On desktop, place the Project Version filter immediately after the Project picker on the same toolbar row. On narrow screens, controls may wrap vertically without horizontal overflow.
- Keep version options scoped to the selected Project. Changing Project resets the version filter to `all`, then renders only versions whose `project_key` matches the new Project.
- Render compact Work Item card badges: system Backlog becomes `待`; numeric labels use an uppercase `V` prefix and remove redundant trailing `.0`, for example `v1.0` → `V1` and `v0.2` → `V0.2`. Do not show version status in the card badge; color continues to communicate lifecycle state and full labels remain available in the filter.
- Remove the admin-facing `管理版本` entry from the Work Tracker header. Keep the existing version tables, RPCs, repository methods, and owner workflows intact so Project Owners can continue creating and maintaining versions through the controlled workflow.

## Scope

Change only Work Tracker presentation, compact-label formatting, and regression tests. No database migration, permission broadening, or version data rewrite.

## Acceptance

- Desktop toolbar order is Project picker → Project Version → item count.
- Switching Projects updates version options and clears any incompatible version selection.
- Cards show `待`, `V1`, or the compact normalized stored identifier; the Manual/claim badge is no longer displaced by a long version-status string.
- The Work Tracker page contains no visible `管理版本` entry.
- Existing create/edit Item version requirements, filtering, detail return context, and Project preference remain passing.
