#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const GITHUB_REPOSITORY = "GlauconAI/glaucon-politeia";
export const DEPLOYMENT_ENVIRONMENT = "Production";
const GITHUB_API_ORIGIN = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1_000;
const DEFAULT_POLL_INTERVAL_MS = 15_000;
const TERMINAL_FAILURE_STATES = new Set(["error", "failure", "inactive"]);

function validateSha(sha) {
  if (!/^[0-9a-f]{40}$/u.test(sha)) {
    throw new Error("GITHUB_SHA must be a full lowercase hexadecimal commit SHA");
  }
  return sha;
}

export function buildDeploymentsUrl(sha) {
  const url = new URL(`/repos/${GITHUB_REPOSITORY}/deployments`, GITHUB_API_ORIGIN);
  url.searchParams.set("sha", validateSha(sha));
  url.searchParams.set("environment", DEPLOYMENT_ENVIRONMENT);
  url.searchParams.set("per_page", "10");
  return url.toString();
}

function requestHeaders(token) {
  if (!token) throw new Error("GITHUB_TOKEN is required");
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "glaucon-politeia-production-smoke/1",
    "x-github-api-version": "2022-11-28",
  };
}

async function fetchJson(fetchImpl, url, token) {
  const parsed = new URL(url);
  if (parsed.origin !== GITHUB_API_ORIGIN) {
    throw new Error("refusing a deployment URL outside api.github.com");
  }
  if (!parsed.pathname.startsWith(`/repos/${GITHUB_REPOSITORY}/`)) {
    throw new Error("refusing a deployment URL outside the fixed repository");
  }
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "error",
    headers: requestHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub Deployments API returned HTTP ${response.status}`);
  return response.json();
}

function selectExactDeployment(deployments, sha) {
  if (!Array.isArray(deployments)) throw new Error("unexpected deployments response");
  return deployments
    .filter(
      (deployment) =>
      deployment?.sha === sha &&
      deployment?.environment === DEPLOYMENT_ENVIRONMENT &&
      Number.isInteger(deployment?.id) &&
      typeof deployment?.statuses_url === "string",
    )
    .sort((left, right) => right.id - left.id)[0];
}

function validateStatusesUrl(deployment) {
  const parsed = new URL(deployment.statuses_url);
  const expectedPath = `/repos/${GITHUB_REPOSITORY}/deployments/${deployment.id}/statuses`;
  if (parsed.origin !== GITHUB_API_ORIGIN || parsed.pathname !== expectedPath) {
    throw new Error("deployment status URL does not match the fixed deployment id");
  }
  return parsed.toString();
}

export async function waitForProductionDeployment({
  sha,
  token,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
} = {}) {
  validateSha(sha);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const deployments = await fetchJson(fetchImpl, buildDeploymentsUrl(sha), token);
    const deployment = selectExactDeployment(deployments, sha);
    if (deployment) {
      const statuses = await fetchJson(fetchImpl, validateStatusesUrl(deployment), token);
      if (!Array.isArray(statuses)) throw new Error("unexpected deployment statuses response");
      const state = statuses[0]?.state;
      if (state === "success") {
        return { ok: true, deploymentId: deployment.id, state, sha };
      }
      if (TERMINAL_FAILURE_STATES.has(state)) {
        throw new Error(`production deployment ended in ${state}`);
      }
    }
    await sleep(pollIntervalMs);
  }
  throw new Error("timed out waiting for the exact Production deployment");
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error("release:wait-production does not accept arguments");
  }
  const result = await waitForProductionDeployment({
    sha: process.env.GITHUB_SHA ?? "",
    token: process.env.GITHUB_TOKEN ?? "",
  });
  process.stdout.write(`WORK_TRACKER_PRODUCTION_DEPLOYMENT=${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `WORK_TRACKER_PRODUCTION_DEPLOYMENT_ERROR=${JSON.stringify({ message: error.message })}\n`,
    );
    process.exitCode = 1;
  }
}
