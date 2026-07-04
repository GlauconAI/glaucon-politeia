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
          in() {
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

describe("products showcase", () => {
  it("renders Wenya AI and the Agora Intelligence podcast as product panels", async () => {
    render(await ProductsPage());

    const showcase = screen.getByRole("region", { name: "Products showcase" });
    expect(within(showcase).getByRole("heading", { name: "Products" })).toBeInTheDocument();

    const wenyaPanel = within(showcase).getByRole("article", { name: "问芽 AI" });
    expect(within(wenyaPanel).getByRole("heading", { name: "问芽 AI" })).toBeInTheDocument();
    expect(within(wenyaPanel).getByText("让孩子学会和 AI 一起思考")).toBeInTheDocument();
    expect(within(wenyaPanel).getByText("专为 AI 时代的孩子设计")).toBeInTheDocument();
    expect(within(wenyaPanel).getByText("First-stage concept validation")).toBeInTheDocument();
    expect(within(wenyaPanel).getByText("Picture book series")).toBeInTheDocument();

    const podcastPanel = within(showcase).getByRole("article", {
      name: "Agora Intelligence Podcast",
    });
    expect(within(podcastPanel).getByRole("heading", { name: "Agora Intelligence" })).toBeInTheDocument();
    expect(within(podcastPanel).getByText("AI Driven Everything!")).toBeInTheDocument();
    expect(within(podcastPanel).getByText("22 episodes")).toBeInTheDocument();
    expect(within(podcastPanel).getByText("20 subscribers")).toBeInTheDocument();
    expect(within(podcastPanel).getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      "https://www.xiaoyuzhoufm.com/podcast/69efc8bee5e21ce82319150f",
    );
    expect(
      within(podcastPanel).getByRole("link", { name: /AI 下一次跃迁：从刷题到上岗学习/ }),
    ).toHaveAttribute("href", "https://www.xiaoyuzhoufm.com/episode/episode-1");
    expect(screen.getByRole("heading", { name: "Product Notes" })).toBeInTheDocument();
  });
});
