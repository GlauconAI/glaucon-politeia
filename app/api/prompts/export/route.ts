import { NextResponse, type NextRequest } from "next/server";

import { buildPromptCsv, parsePromptAdminFilters } from "@/lib/prompts/admin";
import { getCurrentPromptAdmin } from "@/lib/prompts/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const currentAdmin = await getCurrentPromptAdmin();

  if (!currentAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filters = parsePromptAdminFilters(request.nextUrl.searchParams);
  let query = createSupabaseAdminClient()
    .from("prompts")
    .select("id,created_at,source_url,user_id,content,marked,marked_reason,flags")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (filters.q) {
    query = query.ilike("content", `%${filters.q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  }

  if (filters.marked !== undefined) {
    query = query.eq("marked", filters.marked);
  }

  if (filters.sensitive !== undefined) {
    query = query.contains("flags", { has_sensitive: filters.sensitive });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(buildPromptCsv(data ?? []), {
    headers: {
      "content-disposition": "attachment; filename=prompts.csv",
      "content-type": "text/csv; charset=utf-8",
    },
  });
}
