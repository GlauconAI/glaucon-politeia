import { type NextRequest } from "next/server";

import { resolveOrchestratorRequest } from "@/lib/orchestrator/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return resolveOrchestratorRequest(request);
}
