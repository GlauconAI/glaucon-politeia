# M9 Prompt Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide admin-only prompt review, filtering, batch operations, export, stats, and retention.

**Architecture:** Admin checks use the authenticated user plus the service-role Supabase client to verify `profiles.is_admin`. Browser UI calls admin route handlers; route handlers perform filtering and mutations with the admin client. Retention is protected by a separate secret.

**Tech Stack:** Next.js route handlers, Supabase service client, React client component, SQL RPCs, Vitest.

---

- [x] Add admin helper tests for filters, CSV, stats buckets, and retention secret checks.
- [x] Implement prompt admin helpers and authorization helper.
- [x] Add admin list, bulk, export, stats, and retention APIs.
- [x] Add prompt admin page and client UI.
- [x] Add stats and archival RPC migration.
- [x] Run verification.
- [x] Commit M9 implementation.
