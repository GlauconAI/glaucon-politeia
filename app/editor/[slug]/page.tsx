import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { deletePostAction, updatePostAction } from "@/app/editor/actions";
import { getCurrentUserAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EditorPostPageProps = {
  params: Promise<{ slug: string }>;
};

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EditorPostPage({ params }: EditorPostPageProps) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const access = await getCurrentUserAccess(supabase);

  if (!access.user) {
    redirect(`/auth?redirectTo=/editor/${slug}`);
  }

  if (!access.canPublish) {
    redirect("/");
  }

  const [{ data: post }, { data: tags }] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, slug, title, content_md, content_html, content_format, visibility, status, post_tags(tag_id,tags(id,slug,name))",
      )
      .eq("slug", slug)
      .maybeSingle(),
    supabase.from("tags").select("id, slug, name").order("slug"),
  ]);

  if (!post) {
    notFound();
  }

  const contentFormat = post.content_format === "html" ? "html" : "markdown";
  const content = contentFormat === "html" ? (post.content_html ?? "") : (post.content_md ?? "");
  const selectedTagIds = new Set(
    post.post_tags?.map((item: any) => item.tag_id ?? first(item.tags)?.id).filter(Boolean) ?? [],
  );

  return (
    <section className="editor-page publish-page">
      <header className="editor-hero">
        <div>
          <p className="eyebrow shell-path">
            <Link href="/editor">402v /editor</Link> <span>/{post.slug}</span>
          </p>
          <h1>
            <span>Edit</span> output
          </h1>
          <p>&gt; update, republish, draft, or remove an existing output</p>
        </div>
        <div className="shell-status-line" aria-label="Post status">
          <span>status: {post.status}</span>
          <span>visibility: {post.visibility}</span>
          <span>format: {contentFormat}</span>
        </div>
      </header>

      <form action={updatePostAction} className="editor-form publish-form">
        <input type="hidden" name="postId" value={post.id} />
        <div className="publish-layout">
          <div
            className="publish-panel publish-content-panel"
            role="group"
            aria-labelledby="post-content-heading"
          >
            <div className="publish-panel-heading">
              <p className="eyebrow">Content</p>
              <h2 id="post-content-heading">Post content</h2>
            </div>

            <label className="field-stack" htmlFor="post-title">
              <span>Title</span>
              <input
                id="post-title"
                name="title"
                required
                autoComplete="off"
                defaultValue={post.title}
              />
            </label>

            <label className="field-stack" htmlFor="post-slug">
              <span>Slug</span>
              <input
                id="post-slug"
                name="slug"
                required
                autoComplete="off"
                defaultValue={post.slug}
              />
            </label>

            <label className="field-stack field-stack-grow" htmlFor="post-content">
              <span>Body</span>
              <small>
                Replace the HTML artifact or Markdown note, then save as a draft or publish.
              </small>
              <textarea
                id="post-content"
                name="content"
                required
                rows={20}
                spellCheck
                defaultValue={content}
              />
            </label>
          </div>

          <div
            className="publish-panel publish-settings-panel"
            role="group"
            aria-labelledby="publish-settings-heading"
          >
            <div className="publish-panel-heading">
              <p className="eyebrow">Settings</p>
              <h2 id="publish-settings-heading">Publish settings</h2>
            </div>

            <fieldset className="editor-fieldset">
              <legend>Visibility</legend>
              <div className="segmented-fields publish-segments">
                <label>
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    defaultChecked={post.visibility === "public"}
                  />
                  <span>
                    <strong>Public</strong>
                    <small>Readable on the web</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    defaultChecked={post.visibility !== "public"}
                  />
                  <span>
                    <strong>Private</strong>
                    <small>Login required</small>
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className="editor-fieldset">
              <legend>Format</legend>
              <div className="segmented-fields publish-segments">
                <label>
                  <input
                    type="radio"
                    name="contentFormat"
                    value="markdown"
                    defaultChecked={contentFormat === "markdown"}
                  />
                  <span>
                    <strong>Markdown</strong>
                    <small>Notes and essays</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="contentFormat"
                    value="html"
                    defaultChecked={contentFormat === "html"}
                  />
                  <span>
                    <strong>HTML</strong>
                    <small>Sandboxed artifact</small>
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className="editor-fieldset">
              <legend>Tags</legend>
              <p className="field-hint">Select up to 3 tags for discovery.</p>
              <div className="tag-picker publish-tag-picker">
                {tags?.length ? (
                  tags.map((tag) => (
                    <label key={tag.id}>
                      <input
                        type="checkbox"
                        name="tagIds"
                        value={tag.id}
                        defaultChecked={selectedTagIds.has(tag.id)}
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="empty-text">No tags available.</p>
                )}
              </div>
            </fieldset>

            <div className="publish-actions">
              <button type="submit" name="intent" value="draft" className="button-secondary">
                Save draft
              </button>
              <button type="submit" name="intent" value="publish" className="button-primary">
                Publish
              </button>
            </div>

            <div className="danger-zone">
              <p className="eyebrow">Danger zone</p>
              <button
                form="delete-post-form"
                type="submit"
                className="button-secondary danger-button"
              >
                Delete post
              </button>
            </div>
          </div>
        </div>
      </form>

      <form id="delete-post-form" action={deletePostAction}>
        <input type="hidden" name="postId" value={post.id} />
      </form>
    </section>
  );
}
