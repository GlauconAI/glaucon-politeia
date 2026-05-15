import { NextResponse, type NextRequest } from "next/server";

import { verifyRetentionSecret } from "@/lib/prompts/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const provided = request.headers.get("x-retention-secret") ?? body?.secret ?? null;

  if (!verifyRetentionSecret(process.env.PROMPTS_RETENTION_SECRET, provided)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = Number.parseInt(String(body?.days ?? "90"), 10);
  const boundedDays = Math.min(3650, Math.max(1, Number.isFinite(days) ? days : 90));
  const cutoff = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000).toISOString();
  const admin = createSupabaseAdminClient();
  const rpc = await admin.rpc("archive_old_prompts", { cutoff_at: cutoff });

  if (!rpc.error && typeof rpc.data === "number") {
    return NextResponse.json({ archived: rpc.data, cutoff });
  }

  const { data, error } = await admin
    .from("prompts")
    .update({ deleted_at: new Date().toISOString() })
    .lt("created_at", cutoff)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ archived: data?.length ?? 0, cutoff });
}
