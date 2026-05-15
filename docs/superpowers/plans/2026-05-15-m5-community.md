# M5 Community Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comments, replies, likes, bookmarks, and owner-only comment deletion to post detail pages.

**Architecture:** Mutations are server actions under `app/posts/actions.ts`; rendering is split into post interaction and comment section components. Comment nesting is handled by a tested pure helper.

**Tech Stack:** Next.js Server Actions, Supabase, React, Vitest.

---

- [x] Add comment tree tests and helper.
- [x] Add like/bookmark/comment/delete server actions.
- [x] Add post interaction controls.
- [x] Add comment list, reply form, and author delete controls.
- [x] Wire post detail page to interactions.
- [x] Run verification.
- [ ] Commit M5 implementation.
