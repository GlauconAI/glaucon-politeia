import type { CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function createProxyCookieAdapter(
  request: NextRequest,
  response: NextResponse,
) {
  return {
    getAll: () => request.cookies.getAll(),
    setAll: (
      cookies: Array<{
        name: string;
        value: string;
        options: CookieOptions;
      }>,
      headers: Record<string, string>,
    ) => {
      for (const { name, value, options } of cookies) {
        response.cookies.set(name, value, options);
      }
      for (const [name, value] of Object.entries(headers)) {
        response.headers.set(name, value);
      }
    },
  };
}

export function copyResponseCookies(
  source: NextResponse,
  target: NextResponse,
) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}
