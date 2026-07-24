# 402v HTML Note Kit

`402v HTML Note Kit` turns a compact Markdown note into a polished standalone HTML file. The output uses the same core design tokens as 402v, opens directly from disk, and can be published unchanged through the existing 402v HTML publisher.

## Quick Start

Create a starter:

```bash
npm run html:note -- init /tmp/agent-memory-system --title "Agent Memory System"
```

Build it:

```bash
npm run html:note -- build /tmp/agent-memory-system/note.md
```

The output is `/tmp/agent-memory-system/note.html`.

Use `--output <path>` to choose another output file. Existing files are protected; add `--force` only when replacement is intentional.

## Authoring Model

- HTML is the primary reading, archive, and publishing artifact.
- Markdown is an optional convenient input for people and agents.
- There is no required JSON source file.
- The tool does not impose a canonical-source or edit-prohibition rule.

Supported content includes headings, paragraphs, emphasis, links, images, lists, task lists, quotes/callouts, GFM tables, fenced code, and flow diagrams.

Frontmatter is optional:

```markdown
---
title: Agent Memory System
description: One source, many reading surfaces.
eyebrow: 402v Knowledge
lang: zh-CN
---
```

## Flow Diagrams

Use a Mermaid-compatible v1 subset:

````markdown
```mermaid
flowchart LR
A[Markdown] --> B{Build}
B -->|pass| C[HTML]
B -->|revise| D[Revise]
D --> A
```
````

Supported directions are `LR` and `TD`. Supported nodes are:

- `A[Box]`
- `B{Decision}`
- `C(Pill)`
- labeled arrows such as `A -->|pass| B`

Diagrams render to inline SVG during the build, so the final HTML has no Mermaid runtime or network dependency.

## Images

Relative and absolute local PNG, JPEG, GIF, WebP, AVIF, and SVG files are embedded as data URIs. Missing files, unsupported formats, and files larger than 10 MB fail the build with a clear error. Remote HTTP images remain remote.

## Publish To 402v

After reviewing the generated file, use the existing publisher:

```bash
npm run publish:html -- \
  --input /tmp/agent-memory-system/note.html \
  --title "Agent Memory System" \
  --slug agent-memory-system \
  --author-id <admin-user-id> \
  --visibility private \
  --dry-run
```

Remove `--dry-run` and add `--publish` only when the publishing action is authorized.
