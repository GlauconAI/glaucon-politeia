import { describe, expect, it, vi } from "vitest";

import { deletePost, updatePost } from "@/lib/posts/service";

function createUpdateSupabase() {
  const calls: any[] = [];
  const supabase = {
    from(table: string) {
      calls.push({ table });

      if (table === "posts") {
        return {
          update(payload: any) {
            calls.push({ table, update: payload });
            return {
              eq(column: string, value: string) {
                calls.push({ table, eq: [column, value] });
                return {
                  select(selection: string) {
                    calls.push({ table, select: selection });
                    return {
                      single: async () => ({
                        data: { id: value, slug: payload.slug },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "post_tags") {
        return {
          delete() {
            calls.push({ table, delete: true });
            return {
              eq(column: string, value: string) {
                calls.push({ table, eq: [column, value] });
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(rows: any[]) {
            calls.push({ table, insert: rows });
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return { calls, supabase };
}

describe("post service mutations", () => {
  it("updates an existing HTML post and replaces tags", async () => {
    const { calls, supabase } = createUpdateSupabase();

    const post = await updatePost(supabase, {
      postId: "post-1",
      slug: "Trip Page",
      title: "Trip Page",
      content: "<main><h1>Trip</h1></main>",
      contentFormat: "html",
      contentHtml: "<main><h1>Trip</h1></main>",
      tagIds: ["family", "sites"],
      publish: true,
      visibility: "public",
    });

    expect(post).toEqual({ id: "post-1", slug: "trip-page" });
    expect(calls).toContainEqual({
      table: "posts",
      update: expect.objectContaining({
        slug: "trip-page",
        title: "Trip Page",
        content_format: "html",
        content_html: "<main><h1>Trip</h1></main>",
        visibility: "public",
        status: "published",
      }),
    });
    expect(calls).toContainEqual({ table: "post_tags", delete: true });
    expect(calls).toContainEqual({
      table: "post_tags",
      insert: [
        { post_id: "post-1", tag_id: "family" },
        { post_id: "post-1", tag_id: "sites" },
      ],
    });
  });

  it("deletes a post by id", async () => {
    const deleteMock = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }));
    const supabase = {
      from: vi.fn(() => ({
        delete: deleteMock,
      })),
    };

    await deletePost(supabase, "post-1");

    expect(supabase.from).toHaveBeenCalledWith("posts");
    expect(deleteMock).toHaveBeenCalled();
  });
});
