#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const PRODUCTION_ORIGIN = "https://402v.com";
export const SMOKE_PATHS = ["/", "/work-tracker"];
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

export function validateSmokeResponse({ requestedPath, finalUrl, status, contentType }) {
  const final = new URL(finalUrl);
  if (final.origin !== PRODUCTION_ORIGIN) {
    throw new Error(`${requestedPath}: unexpected origin ${final.origin}`);
  }
  if (status < 200 || status >= 400) {
    throw new Error(`${requestedPath}: unexpected HTTP status ${status}`);
  }
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(`${requestedPath}: expected HTML response`);
  }
}

async function fetchOnce(pathname) {
  const response = await fetch(new URL(pathname, PRODUCTION_ORIGIN), {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "user-agent": "glaucon-politeia-release-smoke/1" },
  });
  validateSmokeResponse({
    requestedPath: pathname,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
  });
  return {
    path: pathname,
    status: response.status,
    finalPath: new URL(response.url).pathname,
  };
}

export async function runSmokeTest() {
  const results = [];
  for (const pathname of SMOKE_PATHS) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        results.push(await fetchOnce(pathname));
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
  }
  return { ok: true, origin: PRODUCTION_ORIGIN, results };
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error("release:smoke does not accept a custom URL or path");
  }
  const result = await runSmokeTest();
  process.stdout.write(`RELEASE_SMOKE_RESULT=${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`RELEASE_SMOKE_ERROR=${JSON.stringify({ message: error.message })}\n`);
    process.exitCode = 1;
  }
}
