import type { MetadataRoute } from "next";

import { collectionRoutes } from "@/lib/posts/collections";
import { getPublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const siteUrl = "https://402v.com";

const staticPaths = ["", ...collectionRoutes.map((route) => route.href), "/earth-revolution", "/search"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries = staticPaths.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
  }));

  if (!getPublicEnv().configured) {
    return staticEntries;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: posts } = await supabase
      .from("posts")
      .select("slug, updated_at, published_at")
      .eq("status", "published")
      .eq("visibility", "public")
      .limit(1000);

    return [
      ...staticEntries,
      ...((posts ?? []).map((post) => ({
        url: `${siteUrl}/posts/${post.slug}`,
        lastModified: new Date(post.updated_at ?? post.published_at ?? now),
      })) as MetadataRoute.Sitemap),
    ];
  } catch {
    return staticEntries;
  }
}
