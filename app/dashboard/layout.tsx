import type { ReactNode } from "react";

import { DashboardRouteNav } from "@/components/observatory/DashboardRouteNav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="dashboard-route-shell">
      <DashboardRouteNav />
      {children}
    </div>
  );
}
