#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SESSION_ROOT = join(
  homedir(),
  ".openclaw/agents/plato/agent/codex-home/sessions",
);
const DEFAULT_REPO_MARKER = "/glaucon-politeia";
const MAX_SESSION_FILES = 5_000;

function payloadText(payload) {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return "";
  }
}

function readRecords(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export function analyzeApprovalSessions(
  sessionPaths,
  { repoMarker = DEFAULT_REPO_MARKER, since, now = new Date() },
) {
  const report = {
    periodStart: since.toISOString(),
    periodEnd: now.toISOString(),
    relevantSessions: 0,
    escalationRequests: 0,
    gatewayExecCalls: 0,
    deniedCalls: 0,
    manualApprovalCount: null,
    manualApprovalNote:
      "Codex rollout metadata cannot prove whether an escalation reached a human; reconcile this field with the operator prompt count.",
  };

  for (const path of sessionPaths) {
    const records = readRecords(path);
    const recordsInWindow = records.filter((record) => {
      const timestamp = Date.parse(String(record.timestamp ?? ""));
      return (
        Number.isFinite(timestamp) &&
        timestamp >= since.getTime() &&
        timestamp <= now.getTime()
      );
    });
    const relevant = records.some((record) => {
      if (record.type === "session_meta") {
        return String(record.payload?.cwd ?? "").includes(repoMarker);
      }
      if (
        record.type === "response_item" &&
        record.payload?.type === "custom_tool_call"
      ) {
        return String(record.payload?.input ?? "").includes(repoMarker);
      }
      return false;
    });
    if (!relevant || recordsInWindow.length === 0) continue;

    report.relevantSessions += 1;
    for (const record of recordsInWindow) {
      if (record.type !== "response_item") continue;
      if (record.payload?.type === "custom_tool_call") {
        const input = String(record.payload?.input ?? "");
        if (/sandbox_permissions\s*[:=]\s*["']require_escalated["']/u.test(input)) {
          report.escalationRequests += 1;
        }
        if (/tools\.gateway_exec\s*\(/u.test(input)) {
          report.gatewayExecCalls += 1;
        }
      }
      if (record.payload?.type === "custom_tool_call_output") {
        const output = payloadText(record.payload);
        if (/SYSTEM_RUN_DENIED|approval cannot safely bind|approval rejected/iu.test(output)) {
          report.deniedCalls += 1;
        }
      }
    }
  }

  return report;
}

export function formatApprovalReport(report) {
  return JSON.stringify(report, null, 2);
}

function discoverSessionFiles(root, since) {
  const files = [];
  const queue = [root];
  while (queue.length > 0 && files.length < MAX_SESSION_FILES) {
    const current = queue.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) queue.push(path);
      else if (
        entry.isFile() &&
        entry.name.endsWith(".jsonl") &&
        statSync(path).mtime >= since
      ) {
        files.push(path);
      }
    }
  }
  return files.sort();
}

function parseDays(argv) {
  if (argv.length === 0) return 7;
  if (argv.length !== 2 || argv[0] !== "--days") {
    throw new Error("usage: work-tracker-approval-report.mjs [--days 1..31]");
  }
  const days = Number(argv[1]);
  if (!Number.isInteger(days) || days < 1 || days > 31) {
    throw new Error("--days must be an integer from 1 to 31");
  }
  return days;
}

function main() {
  const days = parseDays(process.argv.slice(2));
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
  const files = discoverSessionFiles(DEFAULT_SESSION_ROOT, since);
  const report = analyzeApprovalSessions(files, { since, now });
  process.stdout.write(`${formatApprovalReport(report)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exitCode = 1;
  }
}
