import { savePostAction } from "@/app/editor/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditorPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tags").select("id, slug, name").order("slug");

  return (
    <section className="editor-page publish-page">
      <header className="editor-hero">
        <div>
          <p className="eyebrow shell-path">402v /editor</p>
          <h1>
            <span>Publish</span> command
          </h1>
          <p>&gt; write a Markdown note or place an HTML artifact</p>
        </div>
        <div className="shell-status-line" aria-label="Publish status">
          <span>mode: compose</span>
          <span>visibility: public/private</span>
          <span>format: markdown/html</span>
        </div>
      </header>

      <form action={savePostAction} className="editor-form publish-form">
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
                placeholder="Name this output"
              />
            </label>

            <label className="field-stack field-stack-grow" htmlFor="post-content">
              <span>Body</span>
              <small>
                Paste Markdown or a complete HTML document. Choose the matching
                format before publishing.
              </small>
              <textarea
                id="post-content"
                name="content"
                required
                rows={20}
                spellCheck
                placeholder="# Note title&#10;&#10;Start writing..."
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
                  <input type="radio" name="visibility" value="public" defaultChecked />
                  <span>
                    <strong>Public</strong>
                    <small>Readable on the web</small>
                  </span>
                </label>
                <label>
                  <input type="radio" name="visibility" value="private" />
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
                  <input type="radio" name="contentFormat" value="markdown" defaultChecked />
                  <span>
                    <strong>Markdown</strong>
                    <small>Notes and essays</small>
                  </span>
                </label>
                <label>
                  <input type="radio" name="contentFormat" value="html" />
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
                {data?.length ? (
                  data.map((tag) => (
                    <label key={tag.id}>
                      <input type="checkbox" name="tagIds" value={tag.id} />
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
          </div>
        </div>
      </form>
    </section>
  );
}
