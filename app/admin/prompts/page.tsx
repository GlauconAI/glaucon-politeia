import { redirect } from "next/navigation";

import { PromptAdminClient } from "@/components/prompts/PromptAdminClient";
import { getCurrentPromptAdmin } from "@/lib/prompts/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function PromptAdminPage() {
  const currentAdmin = await getCurrentPromptAdmin();

  if (!currentAdmin) {
    redirect("/auth?redirectTo=/admin/prompts");
  }

  const admin = createSupabaseAdminClient();
  const { data: prompts, count } = await admin
    .from("prompts")
    .select(
      "id,created_at,user_id,source_url,content,flags,marked,marked_reason",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(0, 24);

  return (
    <section className="feed-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Prompt Admin</h1>
        </div>
      </div>
      <PromptAdminClient
        initialData={{
          prompts: prompts ?? [],
          total: count ?? 0,
          page: 1,
          pageSize: 25,
        }}
        initialStats={[]}
      />
    </section>
  );
}
