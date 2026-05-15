import { NextResponse } from "next/server";

import { createHourlyPromptBuckets } from "@/lib/prompts/admin";
import { getCurrentPromptAdmin } from "@/lib/prompts/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const currentAdmin = await getCurrentPromptAdmin();

  if (!currentAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  const rpc = await admin.rpc("prompt_hourly_stats", { since_at: since });

  if (!rpc.error && rpc.data) {
    return NextResponse.json({ buckets: rpc.data });
  }

  const { data, error } = await admin
    .from("prompts")
    .select("created_at")
    .gte("created_at", since)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ buckets: createHourlyPromptBuckets(data ?? []) });
}
