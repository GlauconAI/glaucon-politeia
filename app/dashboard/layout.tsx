import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DashboardRouteNav } from "@/components/observatory/DashboardRouteNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partitura — AI System Handbook",
  description: "The score for a society of minds.",
};

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
