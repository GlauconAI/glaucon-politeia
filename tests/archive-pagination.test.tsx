import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollectionPage } from "@/app/collection-page";

const queryState = vi.hoisted(() => ({
  filters: [] as Array<[string, string]>,
  inFilters: [] as Array<[string, string[]]>,
  range: null as [number, number] | null,
  selectColumns: "",
  selectOptions: null as { count?: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: (columns: string, options?: { count?: string }) => {
        queryState.selectColumns = columns;
        queryState.selectOptions = options ?? null;

        const query = {
          eq(column: string, value: string) {
            queryState.filters.push([column, value]);
            return query;
          },
          in(column: string, value: string[]) {
            queryState.inFilters.push([column, value]);
            return query;
          },
          order() {
            return query;
          },
          async range(from: number, to: number) {
            queryState.range = [from, to];
            return {
              count: 82,
              data: [
                {
                  id: "post-25",
                  slug: "page-two-post",
                  title: "Page Two Post",
                  excerpt: "Loaded from page two.",
                  published_at: "2026-07-01T00:00:00.000Z",
                  visibility: "public",
                  content_format: "markdown",
                  profiles: { username: "glaucon", display_name: "Glaucon" },
                  post_tags: [],
                },
              ],
            };
          },
          async limit() {
            return {
              count: null,
              data: [
                {
                  id: "post-fragment",
                  slug: "tagged-fragment",
                  title: "Tagged Fragment",
                  excerpt: "Loaded through a server-side tag filter.",
                  published_at: "2015-08-19T00:00:00.000Z",
                  visibility: "public",
                  content_format: "markdown",
                  profiles: { username: "glaucon", display_name: "Glaucon" },
                  post_tags: [{ tags: { slug: "fragments", name: "Fragments" } }],
                },
              ],
            };
          },
        };

        return query;
      },
    }),
  }),
}));

vi.mock("@/lib/posts/engagement", () => ({
  attachPostEngagementCounts: async (_supabase: unknown, posts: any[]) => posts,
}));

describe("archive pagination", () => {
  it("loads the requested archive page with a bounded range", async () => {
    queryState.filters = [];
    queryState.inFilters = [];
    queryState.range = null;
    queryState.selectColumns = "";
    queryState.selectOptions = null;

    render(await (CollectionPage as any)({ slug: "archive", page: 2 }));

    expect(queryState.selectOptions).toEqual({ count: "exact" });
    expect(queryState.filters).toContainEqual(["status", "published"]);
    expect(queryState.filters).toContainEqual(["visibility", "public"]);
    expect(queryState.range).toEqual([24, 47]);
    expect(screen.getByText("Page Two Post")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Page 1" })).toHaveAttribute(
      "href",
      "/archive?page=1",
    );
    expect(screen.getByRole("link", { name: "Page 3" })).toHaveAttribute(
      "href",
      "/archive?page=3",
    );
  });

  it("filters tagged collections in the database before applying the collection limit", async () => {
    queryState.filters = [];
    queryState.inFilters = [];
    queryState.range = null;
    queryState.selectColumns = "";
    queryState.selectOptions = null;

    render(await (CollectionPage as any)({ slug: "fragments" }));

    expect(queryState.selectColumns).toContain("post_tags!inner");
    expect(queryState.inFilters).toContainEqual(["post_tags.tags.slug", ["fragments"]]);
    expect(screen.getByText("Tagged Fragment")).toBeInTheDocument();
  });
});
