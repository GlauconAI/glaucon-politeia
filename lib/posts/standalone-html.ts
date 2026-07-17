import { NextResponse } from "next/server";

const artifactCsp = [
  "sandbox allow-scripts allow-forms allow-modals allow-popups",
  "default-src 'none'",
  "style-src 'unsafe-inline' https:",
  "script-src 'unsafe-inline' 'unsafe-eval' https:",
  "img-src data: blob: https:",
  "font-src data: https:",
  "connect-src https:",
  "media-src data: blob: https:",
  "frame-src https:",
  "form-action https:",
].join("; ");

export function createStandaloneHtmlResponse(html: string) {
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": artifactCsp,
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
