import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ProductsPage from "@/app/products/page";

vi.mock("@/lib/podcast/xiaoyuzhou", () => ({
  XIAOYUZHOU_PODCAST_URL: "https://www.xiaoyuzhoufm.com/podcast/69efc8bee5e21ce82319150f",
  loadXiaoyuzhouPodcast: async () => ({
    title: "Agora Intelligence",
    author: "GlauconAI",
    brief: "AI Driven Everything!",
    description: "A show about AI systems.",
    episodeCount: 22,
    subscriptionCount: 20,
    imageUrl: "https://image.example/show.jpg",
    externalUrl: "https://www.xiaoyuzhoufm.com/podcast/69efc8bee5e21ce82319150f",
    episodes: [
      {
        id: "episode-1",
        title: "AI 下一次跃迁：从刷题到上岗学习",
        description: "First episode description.",
        durationSeconds: 1628,
        publishedAt: "2026-07-03T00:11:11.653Z",
        url: "https://www.xiaoyuzhoufm.com/episode/episode-1",
      },
    ],
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => {
        const query = {
          eq() {
            return query;
          },
          order() {
            return query;
          },
          async limit() {
            return {
              count: null,
              data: [],
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

describe("products podcast feature", () => {
  it("renders the Agora Intelligence podcast entry above product posts", async () => {
    render(await ProductsPage());

    const region = screen.getByRole("region", { name: "Agora Intelligence Podcast" });
    expect(within(region).getByRole("heading", { name: "Agora Intelligence" })).toBeInTheDocument();
    expect(within(region).getByText("AI Driven Everything!")).toBeInTheDocument();
    expect(within(region).getByText("22 episodes")).toBeInTheDocument();
    expect(within(region).getByText("20 subscribers")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      "https://www.xiaoyuzhoufm.com/podcast/69efc8bee5e21ce82319150f",
    );
    expect(
      within(region).getByRole("link", { name: /AI 下一次跃迁：从刷题到上岗学习/ }),
    ).toHaveAttribute("href", "https://www.xiaoyuzhoufm.com/episode/episode-1");
  });
});
