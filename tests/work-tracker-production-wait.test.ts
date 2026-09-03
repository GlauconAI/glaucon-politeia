import { describe, expect, it, vi } from "vitest";

import {
  DEPLOYMENT_ENVIRONMENT,
  GITHUB_REPOSITORY,
  buildDeploymentsUrl,
  waitForProductionDeployment,
} from "@/scripts/release/work-tracker-wait-for-production.mjs";

describe("Work Tracker production deployment wait", () => {
  it("uses an explicit GET for the fixed repository, exact SHA, and Production environment", () => {
    const sha = "a".repeat(40);
    const url = new URL(buildDeploymentsUrl(sha));
    expect(GITHUB_REPOSITORY).toBe("GlauconAI/glaucon-politeia");
    expect(DEPLOYMENT_ENVIRONMENT).toBe("Production");
    expect(url.pathname).toBe("/repos/GlauconAI/glaucon-politeia/deployments");
    expect(url.searchParams.get("sha")).toBe(sha);
    expect(url.searchParams.get("environment")).toBe("Production");
  });

  it("rejects invalid commit SHAs before making a request", () => {
    expect(() => buildDeploymentsUrl("main")).toThrow(/sha/i);
  });

  it("waits for the exact deployment status and returns on success", async () => {
    const sha = "b".repeat(40);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 42,
              sha,
              environment: "Production",
              statuses_url: "https://api.github.com/repos/GlauconAI/glaucon-politeia/deployments/42/statuses",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ state: "success" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      waitForProductionDeployment({
        sha,
        token: "test-token",
        fetchImpl,
        sleep: async () => {},
        timeoutMs: 1_000,
      }),
    ).resolves.toMatchObject({ ok: true, deploymentId: 42, state: "success" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
  });

  it("fails closed when GitHub reports a terminal deployment failure", async () => {
    const sha = "c".repeat(40);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 43,
              sha,
              environment: "Production",
              statuses_url: "https://api.github.com/repos/GlauconAI/glaucon-politeia/deployments/43/statuses",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ state: "failure" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      waitForProductionDeployment({
        sha,
        token: "test-token",
        fetchImpl,
        sleep: async () => {},
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow(/failure/i);
  });

  it("times out when no exact Production deployment appears", async () => {
    const sha = "d".repeat(40);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      waitForProductionDeployment({
        sha,
        token: "test-token",
        fetchImpl,
        sleep: async () => {},
        timeoutMs: -1,
      }),
    ).rejects.toThrow(/timed out/i);
  });

  it("rejects a deployment status URL outside the fixed deployment id", async () => {
    const sha = "e".repeat(40);
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 44,
            sha,
            environment: "Production",
            statuses_url:
              "https://api.github.com/repos/GlauconAI/glaucon-politeia/deployments/999/statuses",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      waitForProductionDeployment({
        sha,
        token: "test-token",
        fetchImpl,
        sleep: async () => {},
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow(/status url/i);
  });

  it("uses the newest matching deployment when GitHub returns duplicates", async () => {
    const sha = "f".repeat(40);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 45,
              sha,
              environment: "Production",
              statuses_url:
                "https://api.github.com/repos/GlauconAI/glaucon-politeia/deployments/45/statuses",
            },
            {
              id: 46,
              sha,
              environment: "Production",
              statuses_url:
                "https://api.github.com/repos/GlauconAI/glaucon-politeia/deployments/46/statuses",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ state: "success" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      waitForProductionDeployment({
        sha,
        token: "test-token",
        fetchImpl,
        sleep: async () => {},
        timeoutMs: 1_000,
      }),
    ).resolves.toMatchObject({ deploymentId: 46 });
    expect(fetchImpl.mock.calls[1]?.[0]).toContain("/deployments/46/statuses");
  });
});
