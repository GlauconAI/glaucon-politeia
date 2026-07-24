import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { createStandaloneHtmlResponse } from "@/lib/posts/standalone-html";
import {
  copyResponseCookies,
  createProxyCookieAdapter,
} from "@/lib/supabase/proxy";

type VisiblePost = {
  content_format: string;
  content_html: string | null;
};

type VisiblePostLoader = (
  request: NextRequest,
  response: NextResponse,
  slug: string,
) => Promise<VisiblePost | null>;

async function loadVisiblePost(
  request: NextRequest,
  response: NextResponse,
  slug: string,
): Promise<VisiblePost | null> {
  const env = getPublicEnv();
  if (!env.configured) return null;

  const supabase = createServerClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: createProxyCookieAdapter(request, response),
    },
  );
  await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("posts")
    .select("content_format,content_html")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  return error ? null : data;
}

export async function resolvePostRequest(
  request: NextRequest,
  loader: VisiblePostLoader = loadVisiblePost,
) {
  const continuation = NextResponse.next();
  const slug = request.nextUrl.pathname.slice("/posts/".length);
  if (!slug || slug.includes("/")) return continuation;

  const post = await loader(request, continuation, slug);
  if (post?.content_format !== "html" || !post.content_html) {
    return continuation;
  }

  const standalone = createStandaloneHtmlResponse(post.content_html);
  copyResponseCookies(continuation, standalone);
  return standalone;
}

export async function proxy(request: NextRequest) {
  return resolvePostRequest(request);
}

export const config = { matcher: ["/posts/:slug"] };
