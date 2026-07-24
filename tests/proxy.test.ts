import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  copyResponseCookies,
  createProxyCookieAdapter,
} from "@/lib/supabase/proxy";
import {
  resolvePostRequest,
} from "@/proxy";

describe("standalone HTML proxy", () => {
  it("returns exact HTML for a visible HTML post", async () => {
    const html = "<!doctype html><html><body>full page</body></html>";
    const loader = vi.fn().mockResolvedValue({
      content_format: "html",
      content_html: html,
    });
    const request = new NextRequest("https://402v.com/posts/artifact");

    const response = await resolvePostRequest(request, loader);

    expect(loader).toHaveBeenCalledWith(
      request,
      expect.any(NextResponse),
      "artifact",
    );
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(await response.text()).toBe(html);
  });

  it("falls through for Markdown and unavailable posts", async () => {
    const request = new NextRequest("https://402v.com/posts/note");
    const markdown = await resolvePostRequest(
      request,
      vi.fn().mockResolvedValue({
        content_format: "markdown",
        content_html: null,
      }),
    );
    const missing = await resolvePostRequest(
      request,
      vi.fn().mockResolvedValue(null),
    );

    expect(markdown.headers.get("x-middleware-next")).toBe("1");
    expect(missing.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes request cookies to Supabase and copies refreshed cookies", () => {
    const request = new NextRequest("https://402v.com/posts/private", {
      headers: { cookie: "session=old" },
    });
    const continuation = NextResponse.next();
    const adapter = createProxyCookieAdapter(request, continuation);

    expect(adapter.getAll()).toEqual(
      expect.arrayContaining([{ name: "session", value: "old" }]),
    );
    adapter.setAll(
      [{ name: "session", value: "new", options: { httpOnly: true } }],
      { "Cache-Control": "private, no-store" },
    );

    const standalone = NextResponse.next();
    copyResponseCookies(continuation, standalone);
    expect(standalone.cookies.get("session")?.value).toBe("new");
    expect(continuation.headers.get("cache-control")).toBe(
      "private, no-store",
    );
  });
});
