import { describe, expect, it } from "vitest";

import { createStandaloneHtmlResponse } from "@/lib/posts/standalone-html";

describe("createStandaloneHtmlResponse", () => {
  it("returns the exact HTML as a sandboxed top-level document", async () => {
    const html = "<!doctype html><html><body><h1>Artifact</h1></body></html>";
    const response = createStandaloneHtmlResponse(html);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(html);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("content-security-policy")).not.toContain(
      "allow-same-origin",
    );
  });
});
