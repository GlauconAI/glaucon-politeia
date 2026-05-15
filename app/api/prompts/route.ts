import { NextResponse, type NextRequest } from "next/server";

import {
  detectSensitivePromptContent,
  validatePromptPayload,
} from "@/lib/prompts/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
