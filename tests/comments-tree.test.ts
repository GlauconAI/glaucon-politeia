import { describe, expect, it } from "vitest";

import { buildCommentTree } from "@/lib/comments/tree";

describe("comment tree", () => {
  it("groups replies under their parent comment", () => {
    const tree = buildCommentTree([
      { id: "reply", parent_id: "root", created_at: "2026-01-01T00:01:00Z" },
      { id: "root", parent_id: null, created_at: "2026-01-01T00:00:00Z" },
    ]);

    expect(tree).toEqual([
      {
        id: "root",
        parent_id: null,
        created_at: "2026-01-01T00:00:00Z",
        replies: [
          {
            id: "reply",
            parent_id: "root",
            created_at: "2026-01-01T00:01:00Z",
            replies: [],
          },
        ],
      },
    ]);
  });
});
