#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const defaultDbPath =
  "/Volumes/homes/kimimaro/09 归档和备份/博客&App/402v/ghost.db";

const args = parseArgs(process.argv.slice(2));
const source = loadGhostSource(args.dbPath);
const importPlan = buildImportPlan(source, args.authorId);

if (args.dryRun) {
  console.log(JSON.stringify(importPlan, null, 2));
  process.exit(0);
}

const env = readEnv(".env.local");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required in .env.local");
}

const supabase = createClient(url, secret, {
  auth: {
    persistSession: false,
  },
});

const authorId = args.authorId || (await resolveAuthorId(supabase));
const plan = buildImportPlan(source, authorId);
const result = await importIntoSupabase(supabase, plan);
console.log(JSON.stringify(result, null, 2));

function parseArgs(values) {
  const dbPath = readFlag(values, "--db") || defaultDbPath;
  const authorId = readFlag(values, "--author-id") || "";
  const dryRun = values.includes("--dry-run");

  if (!dbPath || !existsSync(dbPath)) {
    fail(`--db must point to an existing Ghost SQLite database: ${dbPath}`);
  }

  if (dryRun && !authorId.trim()) {
    fail("--author-id is required for --dry-run");
  }

  return {
    authorId: authorId.trim(),
    dbPath,
    dryRun,
  };
}

function readFlag(values, flag) {
  const index = values.indexOf(flag);
  return index === -1 ? undefined : values[index + 1];
}

function loadGhostSource(dbPath) {
  const posts = queryJson(
    dbPath,
    `
      select
        id,
        title,
        slug,
        markdown,
        html,
        image,
        status,
        created_at,
        updated_at,
        published_at
      from posts
      order by
        case when status = 'draft' then 1 else 0 end,
        case when published_at is null then created_at else published_at end,
        id
    `,
  );
  const tags = queryJson(dbPath, "select id, name, slug from tags order by id");
  const postTags = queryJson(
    dbPath,
    "select post_id, tag_id from posts_tags order by post_id, tag_id",
  );

  return { postTags, posts, tags };
}

function queryJson(dbPath, sql) {
  const output = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }).trim();

  return output ? JSON.parse(output) : [];
}

function buildImportPlan(source, authorId) {
  const tagsById = new Map(source.tags.map((tag) => [tag.id, normalizeTag(tag)]));
  const postSlugMap = new Map(
    source.posts.map((post) => [
      normalizeSlug(post.slug || post.title || `ghost-${post.id}`),
      normalizeSlug(post.slug || post.title || `ghost-${post.id}`),
    ]),
  );
  const tagSlugsByPostId = new Map();

  for (const relation of source.postTags) {
    const tag = tagsById.get(relation.tag_id);
    if (!tag) continue;
    const existing = tagSlugsByPostId.get(relation.post_id) || [];
    existing.push(tag.slug);
    tagSlugsByPostId.set(relation.post_id, existing);
  }

  const usedTagSlugs = new Set();
  const posts = source.posts.map((post) => {
    const tagSlugs = [...new Set(tagSlugsByPostId.get(post.id) || [])];
    for (const slug of tagSlugs) {
      usedTagSlugs.add(slug);
    }

    const status = "published";
    const markdown = rewriteGhostLinks((post.markdown || "").trim(), postSlugMap);
    const html = (post.html || "").trim();

    return {
      old_ghost_id: post.id,
      author_id: authorId,
      slug: normalizeSlug(post.slug || post.title || `ghost-${post.id}`),
      title: decodeEntities(post.title || `Ghost post ${post.id}`).trim(),
      excerpt: createExcerpt(markdown || stripHtmlToText(html)),
      content_md: markdown || stripHtmlToText(html),
      content_html: "",
      content_format: "markdown",
      visibility: "public",
      status,
      published_at:
        timestampToIso(post.published_at) || timestampToIso(post.created_at),
      created_at: timestampToIso(post.created_at),
      updated_at: timestampToIso(post.updated_at) || timestampToIso(post.created_at),
      image: post.image || "",
      tagSlugs,
    };
  });

  const tags = [...tagsById.values()].filter((tag) => usedTagSlugs.has(tag.slug));

  return {
    summary: {
      sourcePosts: posts.length,
      published: posts.filter((post) => post.status === "published").length,
      drafts: posts.filter((post) => post.status === "draft").length,
      usedTags: tags.length,
    },
    tags,
    posts,
  };
}

function rewriteGhostLinks(markdown, postSlugMap) {
  return markdown.replace(
    /https?:\/\/(?:www\.)?402v\.com\/([^)\s#?]+)\/?/gi,
    (_match, rawPath) => {
      const path = String(rawPath).replace(/^\/+|\/+$/g, "");

      if (path.startsWith("tag/")) {
        return `/tags/${normalizeSlug(path.slice(4))}`;
      }

      const slug = normalizeSlug(path);
      return `/posts/${postSlugMap.get(slug) || slug}`;
    },
  );
}

function normalizeTag(tag) {
  const name = decodeEntities(tag.name || tag.slug || `tag-${tag.id}`).trim();
  return {
    old_ghost_id: tag.id,
    name,
    slug: normalizeSlug(tag.slug || name),
    description: "Imported from Ghost backup.",
  };
}

function normalizeSlug(value) {
  return (
    decodeEntities(String(value))
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 96)
      .replace(/-+$/g, "") || "ghost-post"
  );
}

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/");
}

function timestampToIso(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null;
  }

  return new Date(numberValue).toISOString();
}

function stripHtmlToText(html) {
  return decodeEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createExcerpt(markdown, maxLength = 140) {
  const normalized = decodeEntities(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\s>*+-]+/gm, "")
    .replace(/[*_~>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const candidate = normalized.slice(0, maxLength).trimEnd();
  const lastSpace = candidate.lastIndexOf(" ");
  const trimmed =
    lastSpace > 0 ? candidate.slice(0, lastSpace).trimEnd() : candidate;

  return `${trimmed}...`;
}

async function resolveAuthorId(supabase) {
  const { data: admins, error: adminError } = await supabase
    .from("profiles")
    .select("user_id,username,is_admin")
    .eq("is_admin", true)
    .limit(1);

  if (adminError) {
    fail(adminError.message);
  }

  if (admins?.[0]?.user_id) {
    return admins[0].user_id;
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id,username")
    .limit(1);

  if (error) {
    fail(error.message);
  }

  if (!profiles?.[0]?.user_id) {
    fail("No profile found to use as import author");
  }

  return profiles[0].user_id;
}

async function importIntoSupabase(supabase, plan) {
  const existingTags = await selectAll(supabase, "tags", "id,slug");
  const tagIdBySlug = new Map(existingTags.map((tag) => [tag.slug, tag.id]));
  const tagsToCreate = plan.tags.filter((tag) => !tagIdBySlug.has(tag.slug));
  let createdTags = 0;

  if (tagsToCreate.length > 0) {
    const { data, error } = await supabase
      .from("tags")
      .insert(
        tagsToCreate.map((tag) => ({
          name: tag.name,
          slug: tag.slug,
          description: tag.description,
        })),
      )
      .select("id,slug");

    if (error) {
      fail(error.message);
    }

    createdTags = data?.length ?? 0;
    for (const tag of data ?? []) {
      tagIdBySlug.set(tag.slug, tag.id);
    }
  }

  const existingPosts = await selectAll(supabase, "posts", "id,slug");
  const existingPostSlugs = new Set(existingPosts.map((post) => post.slug));
  const postsToCreate = plan.posts.filter((post) => !existingPostSlugs.has(post.slug));
  let createdPosts = 0;
  let createdPostTags = 0;

  for (const post of postsToCreate) {
    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_id: post.author_id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content_md: post.content_md,
        content_html: post.content_html,
        content_format: post.content_format,
        visibility: post.visibility,
        status: post.status,
        published_at: post.published_at,
        created_at: post.created_at,
        updated_at: post.updated_at,
      })
      .select("id,slug")
      .single();

    if (error) {
      fail(`Failed to insert ${post.slug}: ${error.message}`);
    }

    createdPosts += 1;
    const rows = post.tagSlugs
      .map((slug) => tagIdBySlug.get(slug))
      .filter(Boolean)
      .map((tagId) => ({
        post_id: data.id,
        tag_id: tagId,
      }));

    if (rows.length > 0) {
      const { error: tagError } = await supabase.from("post_tags").insert(rows);
      if (tagError) {
        fail(`Failed to tag ${post.slug}: ${tagError.message}`);
      }
      createdPostTags += rows.length;
    }
  }

  return {
    sourcePosts: plan.summary.sourcePosts,
    plannedPublished: plan.summary.published,
    plannedDrafts: plan.summary.drafts,
    plannedTags: plan.summary.usedTags,
    createdTags,
    skippedExistingTags: plan.summary.usedTags - createdTags,
    createdPosts,
    skippedExistingPosts: plan.posts.length - createdPosts,
    createdPostTags,
  };
}

async function selectAll(supabase, table, columns) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (error) {
      fail(error.message);
    }

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) {
      return rows;
    }
    from += pageSize;
  }
}

function readEnv(path) {
  const values = {};

  if (!existsSync(path)) {
    return values;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
