import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardRouteNav } from "@/components/observatory/DashboardRouteNav";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";

export const dynamic = "force-dynamic";

function safeDashboardPath(value: string | null): string {
  return value?.startsWith("/dashboard") ? value : "/dashboard";
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [currentAdmin, requestHeaders] = await Promise.all([
    getCurrentObservatoryAdmin(),
    headers(),
  ]);

  if (!currentAdmin) {
    const redirectTo = safeDashboardPath(
      requestHeaders.get("x-dashboard-path"),
    );
    redirect(
      `/auth?${new URLSearchParams({ redirectTo }).toString()}`,
    );
  }

  return (
    <div className="dashboard-route-shell">
      <DashboardRouteNav />
      {children}
    </div>
  );
}
