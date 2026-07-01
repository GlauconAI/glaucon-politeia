import { HtmlArtifactView } from "@/components/posts/HtmlArtifactView";
import { MarkdownView } from "@/components/posts/MarkdownView";
import type { PostContentFormat } from "@/lib/posts/content";

type PostBodyProps = {
  contentFormat: PostContentFormat;
  contentMd: string;
  contentHtml: string;
  title: string;
};

export function PostBody({
  contentFormat,
  contentMd,
  contentHtml,
  title,
}: PostBodyProps) {
  if (contentFormat === "html") {
    return <HtmlArtifactView html={contentHtml} title={title} />;
  }

  return <MarkdownView content={contentMd} />;
}
