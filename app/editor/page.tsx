import { savePostAction } from "@/app/editor/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditorPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tags").select("id, slug, name").order("slug");

  return (
    <section className="editor-page">
      <h1>写作</h1>
      <form action={savePostAction} className="editor-form">
        <label>
          标题
          <input name="title" required />
        </label>
        <fieldset>
          <legend>标签（最多 3 个）</legend>
          <div className="tag-picker">
            {data?.map((tag) => (
              <label key={tag.id}>
                <input type="checkbox" name="tagIds" value={tag.id} />
                {tag.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Markdown 正文
          <textarea name="content" required rows={16} />
        </label>
        <div className="editor-actions">
          <button type="submit" name="intent" value="draft" className="button-secondary">
            保存草稿
          </button>
          <button type="submit" name="intent" value="publish" className="button-primary">
            发布
          </button>
        </div>
      </form>
    </section>
  );
}
