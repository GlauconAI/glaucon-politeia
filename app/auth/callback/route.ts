import { NextResponse, type NextRequest } from "next/server";

import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirectTo = getSafeRedirectPath(requestUrl.searchParams.get("redirectTo"));

  if (!code) {
    const authUrl = new URL("/auth", requestUrl.origin);
    authUrl.searchParams.set("error", "Missing OAuth code");
    authUrl.searchParams.set("redirectTo", redirectTo);
    return NextResponse.redirect(authUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const authUrl = new URL("/auth", requestUrl.origin);
    authUrl.searchParams.set("error", error.message);
    authUrl.searchParams.set("redirectTo", redirectTo);
    return NextResponse.redirect(authUrl);
  }

  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
}
