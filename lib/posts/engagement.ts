type SupabaseLike = any;

type EngagementCount = {
  post_id: string;
  like_count: number;
  bookmark_count: number;
  comment_count: number;
};

const emptyCounts = {
  like_count: 0,
  bookmark_count: 0,
  comment_count: 0,
};

export async function loadPostEngagementCounts(
  supabase: SupabaseLike,
  postIds: string[],
) {
  const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)));

  if (uniquePostIds.length === 0) {
    return new Map<string, Omit<EngagementCount, "post_id">>();
  }

  const { data, error } = await supabase
    .from("post_engagement_counts")
    .select("post_id,like_count,bookmark_count,comment_count")
    .in("post_id", uniquePostIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as EngagementCount[]).map((row) => [
      row.post_id,
      {
        like_count: row.like_count,
        bookmark_count: row.bookmark_count,
        comment_count: row.comment_count,
      },
    ]),
  );
}

export async function attachPostEngagementCounts<T extends { id: string }>(
  supabase: SupabaseLike,
  posts: T[],
) {
  const counts = await loadPostEngagementCounts(
    supabase,
    posts.map((post) => post.id),
  );

  return posts.map((post) => ({
    ...post,
    post_engagement_counts: counts.get(post.id) ?? emptyCounts,
  }));
}
