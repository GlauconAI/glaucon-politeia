# Partitura Brand Migration Report

## Scope

This release changes the user-facing name of the System Dashboard to:

- **Partitura**
- **System Dashboard**
- **The score for a society of minds.**

It is the first visible implementation of the Sinfonia brand architecture. The release is intentionally limited to the presentation layer.

## Unified product surfaces

The new name is applied consistently to:

- the `/dashboard` hero;
- browser title and description metadata for the route family;
- the authenticated global operator link;
- the persistent Dashboard route navigation;
- the in-page section navigation landmark;
- the route loading state;
- return links from Projects, Skills, and Automations.

## Preserved technical identifiers

The following remain unchanged by design:

- `/dashboard` and all child routes;
- `DashboardPage`, `DashboardRouteNav`, `DashboardSectionNav`, and related component/type/test identifiers;
- `dashboard-*` CSS classes, anchors, query parameters, data attributes, and source paths;
- the canonical `plato/dashboard` Project key and Project/data records whose title is `Dashboard`;
- established audit artifact names such as `Dashboard snapshot`;
- APIs, database schemas, Registry records, Automations, runtime configuration, and historical audit identifiers.

The remaining `Dashboard` matches under `app/dashboard`, `components/observatory`, and the focused tests were classified into one of those preserved technical or data categories. No remaining match is an old user-facing name for the product.

## Verification

- Focused Partitura contract suite: 38/38 passed.
- Exact remaining-reference audit: passed; no old product heading, route label, loading text, navigation landmark, access label, or root return link remains.
- Full release gate: pending.
- Desktop and mobile browser acceptance: pending.
- Release preparation and production acceptance: pending.

## Release boundary

This release does not rename the repository, route, API, schema, database, runtime service, Automation, or historical record. It does not add a Sinfonia global shell, a new logo, a new color system, or changes to Maestro, Concerto, or Contrappunto.
