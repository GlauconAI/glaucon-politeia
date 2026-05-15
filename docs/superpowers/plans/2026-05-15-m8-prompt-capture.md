# M8 Prompt Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture prompt-like submissions into Supabase with privacy guardrails, idempotency, and retry behavior.

**Architecture:** Client-only capture logic lives in `components/prompts` and pure browser helpers live in `lib/prompts`. The API route validates payloads before inserting into the `prompts` table.

**Tech Stack:** Next.js route handlers, Supabase, React client component, TypeScript, Vitest.

---

- [x] Add prompt payload validation and sensitive-content detection tests.
- [x] Add prompt capture browser-helper tests.
- [x] Implement prompt validation, sensitive-content detection, queue, and idempotency helpers.
- [x] Add prompts migration with RLS and indexes.
- [x] Add `POST /api/prompts`.
- [x] Add global prompt capture provider.
- [x] Run verification.
- [x] Commit M8 implementation.
