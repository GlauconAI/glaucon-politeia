import { createExcerpt } from "@/lib/posts/text";

export type PostVisibility = "public" | "private";
export type PostContentFormat = "markdown" | "html";

type ContentInput = {
  contentFormat?: string;
  content?: string;
  contentHtml?: string;
};

export function normalizePostVisibility(value: unknown): PostVisibility {
  if (value === undefined || value === null || value === "") {
    return "public";
  }

  if (value === "public" || value === "private") {
    return value;
  }

  throw new Error("Visibility must be public or private");
}

export function normalizePostContentFormat(value: unknown): PostContentFormat {
  if (value === undefined || value === null || value === "") {
    return "markdown";
  }

  if (value === "markdown" || value === "html") {
    return value;
  }

  throw new Error("Content format must be markdown or html");
}

export function stripHtmlToText(html: string) {
  return html
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

export function normalizePostContentInput(input: ContentInput) {
  const contentFormat = normalizePostContentFormat(input.contentFormat);

  if (contentFormat === "html") {
    const contentHtml = (input.contentHtml ?? input.content ?? "").trim();

    if (!contentHtml) {
      throw new Error("HTML content is required");
    }

    return {
      contentFormat,
      contentMd: "",
      contentHtml,
      excerpt: createExcerpt(stripHtmlToText(contentHtml)),
    };
  }

  const contentMd = (input.content ?? "").trim();

  if (!contentMd) {
    throw new Error("Markdown content is required");
  }

  return {
    contentFormat,
    contentMd,
    contentHtml: "",
    excerpt: createExcerpt(contentMd),
  };
}
