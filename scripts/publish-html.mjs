#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const args = parseArgs(process.argv.slice(2));
const html = readFileSync(args.input, "utf8").trim();

if (!html) {
  fail("Input HTML file is empty");
}

const payload = {
  author_id: args.authorId,
  slug: args.slug,
  title: args.title,
  excerpt: stripHtmlToText(html).slice(0, 140),
  content_md: "",
  content_html: html,
  content_format: "html",
  visibility: args.visibility,
  status: args.publish ? "published" : "draft",
  published_at: args.publish ? new Date().toISOString() : null,
};

if (args.dryRun) {
  await new Promise((resolve, reject) => {
    process.stdout.write(
      `${JSON.stringify({ ...payload, tag_slugs: args.tagSlugs }, null, 2)}\n`,
      (error) => (error ? reject(error) : resolve()),
    );
  });
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

const { data, error } = await supabase
  .from("posts")
  .insert(payload)
  .select("id, slug")
  .single();

if (error) {
  fail(error.message);
}

if (args.tagSlugs.length > 0) {
  const { data: tags, error: tagLookupError } = await supabase
    .from("tags")
    .select("id, slug")
    .in("slug", args.tagSlugs);

  if (tagLookupError) {
    fail(tagLookupError.message);
  }

  const foundSlugs = new Set((tags ?? []).map((tag) => tag.slug));
  const missingSlugs = args.tagSlugs.filter((slug) => !foundSlugs.has(slug));

  if (missingSlugs.length > 0) {
    fail(`Unknown tags: ${missingSlugs.join(", ")}`);
  }

  const { error: postTagError } = await supabase.from("post_tags").insert(
    (tags ?? []).map((tag) => ({
      post_id: data.id,
      tag_id: tag.id,
    })),
  );

  if (postTagError) {
    fail(postTagError.message);
  }
}

console.log(JSON.stringify({ id: data.id, slug: data.slug }, null, 2));

function parseArgs(values) {
  const input = readFlag(values, "--input");
  const title = readFlag(values, "--title");
  const slug = readFlag(values, "--slug") || slugify(title || basename(input || ""));
  const authorId = readFlag(values, "--author-id");
  const visibility = readFlag(values, "--visibility") || "private";
  const tagSlugs = readFlags(values, "--tag")
    .map((value) => slugify(value))
    .filter(Boolean)
    .slice(0, 3);
  const dryRun = values.includes("--dry-run");
  const publish = values.includes("--publish");

  if (!input || !existsSync(input)) {
    fail("--input must point to an existing HTML file");
  }

  if (!title?.trim()) {
    fail("--title is required");
  }

  if (!authorId?.trim()) {
    fail("--author-id is required");
  }

  if (!["public", "private"].includes(visibility)) {
    fail("--visibility must be public or private");
  }

  return {
    input,
    title: title.trim(),
    slug,
    authorId: authorId.trim(),
    visibility,
    tagSlugs,
    dryRun,
    publish,
  };
}

function readFlag(values, flag) {
  const index = values.indexOf(flag);
  return index === -1 ? undefined : values[index + 1];
}

function readFlags(values, flag) {
  return values.flatMap((value, index) =>
    value === flag && typeof values[index + 1] === "string" ? [values[index + 1]] : [],
  );
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return slug || "html-artifact";
}

function stripHtmlToText(htmlValue) {
  return htmlValue
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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
