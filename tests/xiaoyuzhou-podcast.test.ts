import { describe, expect, it } from "vitest";

import { parseXiaoyuzhouPodcastPage } from "@/lib/podcast/xiaoyuzhou";

const podcastHtml = `
<!doctype html>
<html>
  <body>
    <script id="__NEXT_DATA__" type="application/json">
      {
        "props": {
          "pageProps": {
            "podcast": {
              "pid": "69efc8bee5e21ce82319150f",
              "title": "Agora Intelligence",
              "author": "GlauconAI",
              "brief": "AI Driven Everything!",
              "description": "A show about AI systems.",
              "subscriptionCount": 20,
              "episodeCount": 22,
              "image": { "picUrl": "https://image.example/show.jpg" },
              "episodes": [
                {
                  "eid": "episode-1",
                  "title": "AI 下一次跃迁：从刷题到上岗学习",
                  "description": "First episode description.",
                  "duration": 1628,
                  "pubDate": "2026-07-03T00:11:11.653Z"
                },
                {
                  "eid": "episode-2",
                  "title": "AI同事上岗：从聊天到协作代理",
                  "description": "Second episode description.",
                  "duration": 681,
                  "pubDate": "2026-07-02T20:46:59.358Z"
                }
              ]
            }
          }
        }
      }
    </script>
  </body>
</html>
`;

describe("xiaoyuzhou podcast parser", () => {
  it("extracts show metadata and latest episodes from the public page data", () => {
    const podcast = parseXiaoyuzhouPodcastPage(podcastHtml);

    expect(podcast).toEqual({
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
        {
          id: "episode-2",
          title: "AI同事上岗：从聊天到协作代理",
          description: "Second episode description.",
          durationSeconds: 681,
          publishedAt: "2026-07-02T20:46:59.358Z",
          url: "https://www.xiaoyuzhoufm.com/episode/episode-2",
        },
      ],
    });
  });

  it("returns null when the page does not include parseable podcast data", () => {
    expect(parseXiaoyuzhouPodcastPage("<html></html>")).toBeNull();
  });
});
