import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import {
  getCurrentObservatoryAdmin,
  type ObservatoryAdminProfile,
} from "@/lib/observatory/admin-auth";
import { createStandaloneHtmlResponse } from "@/lib/posts/standalone-html";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const ORCHESTRATOR_ARTIFACT_SLUG = "openclaw-orchestrator";

type OrchestratorRequestDependencies = {
  getCurrentAdmin(): Promise<ObservatoryAdminProfile | null>;
  loadArtifactHtml(): Promise<string | null>;
};

async function loadPublishedOrchestratorHtml(): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("posts")
    .select("content_format, content_html")
    .eq("slug", ORCHESTRATOR_ARTIFACT_SLUG)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.content_format === "html" && data.content_html
    ? data.content_html
    : null;
}

const defaultDependencies: OrchestratorRequestDependencies = {
  getCurrentAdmin: getCurrentObservatoryAdmin,
  loadArtifactHtml: loadPublishedOrchestratorHtml,
};

export async function resolveOrchestratorRequest(
  request: NextRequest,
  dependencies: OrchestratorRequestDependencies = defaultDependencies,
) {
  const currentAdmin = await dependencies.getCurrentAdmin();

  if (!currentAdmin) {
    return NextResponse.redirect(
      new URL("/auth?redirectTo=/orchestrator", request.url),
    );
  }

  const html = await dependencies.loadArtifactHtml();

  if (!html) {
    return NextResponse.json(
      { error: "Orchestrator artifact is unavailable." },
      { status: 404 },
    );
  }

  return createStandaloneHtmlResponse(html);
}
