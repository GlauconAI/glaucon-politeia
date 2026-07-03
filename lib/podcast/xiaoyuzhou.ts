const XIAOYUZHOU_PODCAST_ID = "69efc8bee5e21ce82319150f";
export const XIAOYUZHOU_PODCAST_URL = `https://www.xiaoyuzhoufm.com/podcast/${XIAOYUZHOU_PODCAST_ID}`;

export type PodcastEpisode = {
  description: string;
  durationSeconds: number | null;
  id: string;
  publishedAt: string | null;
  title: string;
  url: string;
};

export type PodcastShow = {
  author: string;
  brief: string;
  description: string;
  episodeCount: number | null;
  episodes: PodcastEpisode[];
  externalUrl: string;
  imageUrl: string | null;
  subscriptionCount: number | null;
  title: string;
};

type FetchWithNext = (
  input: string,
  init?: RequestInit & { next?: { revalidate: number } },
) => Promise<Response>;

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readImageUrl(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const image = value as { largePicUrl?: unknown; middlePicUrl?: unknown; picUrl?: unknown };
  return (
    readString(image.largePicUrl) ||
    readString(image.middlePicUrl) ||
    readString(image.picUrl) ||
    null
  );
}

function normalizeEpisode(value: unknown): PodcastEpisode | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const episode = value as {
    description?: unknown;
    duration?: unknown;
    eid?: unknown;
    pubDate?: unknown;
    title?: unknown;
  };
  const id = readString(episode.eid);
  const title = readString(episode.title);

  if (!id || !title) {
    return null;
  }

  return {
    description: readString(episode.description),
    durationSeconds: readNumber(episode.duration),
    id,
    publishedAt: readString(episode.pubDate) || null,
    title,
    url: `https://www.xiaoyuzhoufm.com/episode/${id}`,
  };
}

export function parseXiaoyuzhouPodcastPage(html: string): PodcastShow | null {
  const match = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/,
  );

  if (!match) {
    return null;
  }

  try {
    const data = JSON.parse(match[1]);
    const podcast = data?.props?.pageProps?.podcast;

    if (!podcast || typeof podcast !== "object") {
      return null;
    }

    const title = readString(podcast.title);

    if (!title) {
      return null;
    }

    const episodeItems: unknown[] = Array.isArray(podcast.episodes) ? podcast.episodes : [];
    const episodes = episodeItems
      .map(normalizeEpisode)
      .filter((episode): episode is PodcastEpisode => Boolean(episode));


    return {
      author: readString(podcast.author),
      brief: readString(podcast.brief),
      description: readString(podcast.description),
      episodeCount: readNumber(podcast.episodeCount),
      episodes,
      externalUrl: XIAOYUZHOU_PODCAST_URL,
      imageUrl: readImageUrl(podcast.image),
      subscriptionCount: readNumber(podcast.subscriptionCount),
      title,
    };
  } catch {
    return null;
  }
}

export async function loadXiaoyuzhouPodcast(fetcher: FetchWithNext = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetcher(XIAOYUZHOU_PODCAST_URL, {
      headers: {
        accept: "text/html",
      },
      next: { revalidate: 3600 },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return parseXiaoyuzhouPodcastPage(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
