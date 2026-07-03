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

export function PodcastFeature({ podcast }: { podcast: PodcastShow | null }) {
  const show = podcast ?? fallbackPodcast;
  const episodeCount = formatCount(show.episodeCount, "episode", "episodes");
  const subscriptionCount = formatCount(show.subscriptionCount, "subscriber", "subscribers");
  const latestEpisodes = show.episodes.slice(0, 5);

  return (
    <section className="podcast-feature" aria-label="Agora Intelligence Podcast">
      <div className="podcast-feature-main">
        <div className="podcast-cover" aria-hidden="true">
          {show.imageUrl ? (
            <Image src={show.imageUrl} alt="" width={170} height={170} unoptimized />
          ) : (
            <span>AI</span>
          )}
        </div>
        <div className="podcast-copy">
          <p className="eyebrow">Podcast</p>
          <h1>{show.title}</h1>
          <p className="podcast-brief">{show.brief}</p>
          <p>{show.description}</p>
          <div className="podcast-meta">
            <span>{show.author}</span>
            {episodeCount ? <span>{episodeCount}</span> : null}
            {subscriptionCount ? <span>{subscriptionCount}</span> : null}
          </div>
          <div className="podcast-actions">
            <a className="button-primary" href={show.externalUrl} target="_blank" rel="noreferrer">
              Subscribe
            </a>
            <a className="button-secondary" href={show.externalUrl} target="_blank" rel="noreferrer">
              Open in Xiaoyuzhou
            </a>
          </div>
        </div>
      </div>
      <div className="podcast-episodes" aria-label="Latest podcast episodes">
        <div className="podcast-episodes-heading">
          <span>Latest</span>
          <small>Synced from Xiaoyuzhou</small>
        </div>
        {latestEpisodes.length ? (
          latestEpisodes.map((episode) => (
            <a
              key={episode.id}
              className="podcast-episode"
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
    </section>
  );
}
