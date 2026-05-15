import { NextResponse, type NextRequest } from "next/server";

import { normalizeBulkAction } from "@/lib/prompts/admin";
import { getCurrentPromptAdmin } from "@/lib/prompts/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const currentAdmin = await getCurrentPromptAdmin();

  if (!currentAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id: unknown): id is string => typeof id === "string").slice(0, 100)
    : [];
  const action = normalizeBulkAction(body?.action);

  if (!action || ids.length === 0) {
    return NextResponse.json({ error: "Invalid bulk operation" }, { status: 400 });
  }

  const update =
    action === "mark"
      ? { marked: true, marked_reason: String(body?.markedReason ?? "").slice(0, 500) }
      : action === "unmark"
        ? { marked: false, marked_reason: null }
        : { deleted_at: new Date().toISOString() };
  const { error } = await createSupabaseAdminClient()
    .from("prompts")
    .update(update)
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: ids.length });
}
