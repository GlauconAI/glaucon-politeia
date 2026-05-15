import { NextResponse, type NextRequest } from "next/server";

import { parsePromptAdminFilters } from "@/lib/prompts/admin";
import { getCurrentPromptAdmin } from "@/lib/prompts/admin-auth";
import {
  detectSensitivePromptContent,
  validatePromptPayload,
} from "@/lib/prompts/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const currentAdmin = await getCurrentPromptAdmin();

  if (!currentAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filters = parsePromptAdminFilters(request.nextUrl.searchParams);
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;
  let query = createSupabaseAdminClient()
    .from("prompts")
    .select(
      "id,created_at,user_id,client_session_id,source_url,ip,user_agent,content,flags,marked,marked_reason,deleted_at",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.q) {
    query = query.ilike("content", `%${filters.q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  }

  if (filters.marked !== undefined) {
    query = query.eq("marked", filters.marked);
  }

  if (filters.sensitive !== undefined) {
    query = query.contains("flags", { has_sensitive: filters.sensitive });
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    prompts: data ?? [],
    total: count ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  });
}

export async function POST(request: NextRequest) {
  const body = validatePromptPayload(await request.json().catch(() => null));

  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;
  const flags = detectSensitivePromptContent(body.payload.content);
  const insert = await supabase
    .from("prompts")
    .insert({
      user_id: userData.user?.id ?? null,
      client_session_id: body.payload.clientSessionId,
      source_url: body.payload.sourceUrl,
      ip,
      user_agent: userAgent,
      content: body.payload.content,
      idempotency_key: body.payload.idempotencyKey,
      flags,
    })
    .select("id, created_at")
    .single();

  if (insert.error?.code === "23505") {
    const existing = await supabase
      .from("prompts")
      .select("id, created_at")
      .eq("client_session_id", body.payload.clientSessionId)
      .eq("idempotency_key", body.payload.idempotencyKey)
      .maybeSingle();

    if (existing.data) {
      return NextResponse.json({
        id: existing.data.id,
        createdAt: existing.data.created_at,
        idempotent: true,
      });
    }
  }

  if (insert.error) {
    return NextResponse.json({ error: insert.error.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: insert.data.id, createdAt: insert.data.created_at },
    { status: 201 },
  );
}
