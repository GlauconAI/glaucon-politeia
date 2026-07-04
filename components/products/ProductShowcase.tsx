import Image from "next/image";

import type { PodcastShow } from "@/lib/podcast/xiaoyuzhou";
import { XIAOYUZHOU_PODCAST_URL } from "@/lib/podcast/xiaoyuzhou";

const fallbackPodcast: PodcastShow = {
  author: "GlauconAI",
  brief: "AI Driven Everything!",
  description:
    "A Chinese podcast about learning AI with AI: prompts, context, agents, workflows, and the systems that turn thought into action.",
  episodeCount: null,
  episodes: [],
  externalUrl: XIAOYUZHOU_PODCAST_URL,
  imageUrl: null,
  subscriptionCount: null,
  title: "Agora Intelligence",
};

function formatCount(count: number | null, singular: string, plural: string) {
  if (count === null) {
    return null;
  }

  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) {
    return null;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatPublishedDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Vancouver",
    year: "numeric",
  });
}

export function ProductShowcase({ podcast }: { podcast: PodcastShow | null }) {
  const show = podcast ?? fallbackPodcast;
  const episodeCount = formatCount(show.episodeCount, "episode", "episodes");
  const subscriptionCount = formatCount(show.subscriptionCount, "subscriber", "subscribers");
  const latestEpisodes = show.episodes.slice(0, 5);

  return (
    <section className="products-showcase" aria-label="Products showcase">
      <div className="products-showcase-heading">
        <p className="eyebrow">~/products</p>
        <h1>Products</h1>
        <p>
          Active product bets and media surfaces: early childhood AI literacy, agent-era learning,
          and the notes that shape them.
        </p>
      </div>

      <div className="product-rail" aria-label="Product panels">
        <article className="product-panel product-panel-wenya" aria-label="问芽 AI">
          <div className="product-visual product-visual-wenya">
            <Image
              src="/products/wenya-logo-symbol.jpg"
              alt="问芽 AI icon"
              width={260}
              height={260}
              priority
            />
            <div className="product-loop" aria-label="Wenya AI creation loop">
              <span>Ask</span>
              <span>Choose</span>
              <span>Revise</span>
              <span>Protect</span>
              <span>Share</span>
            </div>
          </div>
          <div className="product-panel-copy">
            <div className="product-panel-kicker">
              <span>Active concept</span>
              <span>Age 2-4</span>
            </div>
            <p className="eyebrow">AI picture book studio</p>
            <h2>问芽 AI</h2>
            <p className="product-tagline">让孩子学会和 AI 一起思考</p>
            <p className="product-positioning">专为 AI 时代的孩子设计</p>
            <p>
              用三本分龄绘本，让孩子在成人陪伴下把动作、怪句子和自造规则变成自己的小作品，
              并学会选择、修改、检查和保护秘密。
            </p>
            <div className="product-meta-grid">
              <span>First-stage concept validation</span>
              <span>Picture book series</span>
              <span>Current focus: age 3 story</span>
              <span>Parent-child co-creation</span>
            </div>
          </div>
        </article>

        <article className="product-panel product-panel-podcast" aria-label="Agora Intelligence Podcast">
          <div className="product-panel-copy">
            <div className="product-panel-kicker">
              <span>Podcast</span>
              <span>Synced hourly</span>
            </div>
            <p className="eyebrow">Agora Intelligence Podcast</p>
            <h2>{show.title}</h2>
            <p className="product-tagline">{show.brief}</p>
            <p>{show.description}</p>
            <div className="product-meta-grid">
              <span>{show.author}</span>
              {episodeCount ? <span>{episodeCount}</span> : null}
              {subscriptionCount ? <span>{subscriptionCount}</span> : null}
            </div>
            <div className="product-actions">
              <a className="button-primary" href={show.externalUrl} target="_blank" rel="noreferrer">
                Subscribe
              </a>
              <a className="button-secondary" href={show.externalUrl} target="_blank" rel="noreferrer">
                Open in Xiaoyuzhou
              </a>
            </div>
          </div>
          <div className="product-visual product-visual-podcast">
            <div className="product-cover" aria-hidden="true">
              {show.imageUrl ? (
                <Image src={show.imageUrl} alt="" width={150} height={150} unoptimized />
              ) : (
                <span>AI</span>
              )}
            </div>
            <div className="product-episodes" aria-label="Latest podcast episodes">
              <div className="product-episodes-heading">
                <span>Latest episodes</span>
                <small>Xiaoyuzhou</small>
              </div>
              {latestEpisodes.length ? (
                latestEpisodes.map((episode) => (
                  <a
                    key={episode.id}
                    className="product-episode"
                    href={episode.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <strong>{episode.title}</strong>
                    <span>
                      {[formatPublishedDate(episode.publishedAt), formatDuration(episode.durationSeconds)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </a>
                ))
              ) : (
                <p className="empty-text">Latest episodes are temporarily unavailable.</p>
              )}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
