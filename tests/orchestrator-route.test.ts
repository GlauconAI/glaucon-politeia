import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { resolveOrchestratorRequest } from "@/lib/orchestrator/route";

describe("Orchestrator route", () => {
  it("redirects non-admin visitors to authentication", async () => {
    const request = new NextRequest("https://402v.com/orchestrator/artifact");

    const response = await resolveOrchestratorRequest(request, {
      getCurrentAdmin: vi.fn().mockResolvedValue(null),
      loadArtifactHtml: vi.fn(),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://402v.com/auth?redirectTo=/orchestrator",
    );
  });

  it("serves the exact standalone artifact to administrators", async () => {
    const html = "<!doctype html><html><body>Orchestrator</body></html>";
    const request = new NextRequest("https://402v.com/orchestrator/artifact");

    const response = await resolveOrchestratorRequest(request, {
      getCurrentAdmin: vi.fn().mockResolvedValue({
        user_id: "admin-id",
        username: "glaucon",
        display_name: "Glaucon",
        is_admin: true,
      }),
      loadArtifactHtml: vi.fn().mockResolvedValue(html),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(await response.text()).toBe(html);
  });

  it("returns 404 when the published artifact is unavailable", async () => {
    const request = new NextRequest("https://402v.com/orchestrator/artifact");

    const response = await resolveOrchestratorRequest(request, {
      getCurrentAdmin: vi.fn().mockResolvedValue({
        user_id: "admin-id",
        username: "glaucon",
        display_name: "Glaucon",
        is_admin: true,
      }),
      loadArtifactHtml: vi.fn().mockResolvedValue(null),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Orchestrator artifact is unavailable.",
    });
  });
});
