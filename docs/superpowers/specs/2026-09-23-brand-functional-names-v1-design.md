# Sinfonia Brand and Functional Names v1 Design

## Goal

Separate formal product branding from everyday functional language, upgrade Partitura's product definition, and return Concerto's functional subtitle to `Work Tracker`.

## Canonical naming

- `Sinfonia — Multi-Agent System`
- `Partitura — AI System Handbook`; everyday name: `Dashboard`
- `Maestro — Multi-Agent Orchestrator`; everyday name: `Orchestrator`
- `Concerto — Work Tracker`; everyday name: `Work Tracker`
- `Contrappunto — Autonomous Execution System`; everyday name: `Auto System`
- `Notturno — Night Operations`; everyday name: `Night Operations`

Italian names are brand names used in product titles, visual identity, and formal introductions. Everyday collaboration, spoken instructions, technical documentation, and runtime operations should prefer the functional names because they are easier to recognize in speech and voice input. `Sinfonia` remains the system's standalone proper name.

## Partitura definition

Partitura is a continuously updated AI System Handbook. It organizes Agents, Projects, Automations, collaboration relationships, operating state, rules, and audit evidence into a human-readable whole so that people can understand, direct, and audit an evolving AI system. The Dashboard is the live interface of the Handbook, not its complete product definition.

The existing slogan remains `The score for a society of minds.` The `/dashboard` route, Dashboard code identifiers, APIs, schemas, databases, and historical evidence remain unchanged.

## Concerto definition

Concerto retains the formal brand and returns its functional subtitle to `Work Tracker`. The existing slogan remains `Where work and minds move in concert.` The `/work-tracker` route, Work Item terminology, code identifiers, APIs, schemas, databases, and historical evidence remain unchanged.

## Scope

Update current user-visible product subtitles, browser metadata, accessibility labels where they describe the product, and current brand documentation. Do not rewrite historical specs, reports, migration records, technical identifiers, routes, or data.

## Acceptance

- Partitura shows `AI System Handbook` in the product surface and metadata.
- Concerto shows `Work Tracker` in the product surface and metadata.
- Current brand documentation contains the brand/functional-name rule and the complete canonical mapping.
- Existing slogans, routes, behavior, permissions, data, and technical identifiers remain unchanged.
- Focused tests, `npm run release:verify`, desktop/mobile browser acceptance, CI, Preview, Production deployment, and production smoke pass.
