import type { ReactNode } from "react";

import { Header } from "@/components/layout/Header";
import { RightRail } from "@/components/layout/RightRail";
import { Sidebar } from "@/components/layout/Sidebar";

type AppShellProps = {
  children: ReactNode;
  userEmail: string | null;
};

export function AppShell({ children, userEmail }: AppShellProps) {
  return (
    <div className="app-shell">
      <Header userEmail={userEmail} />
      <div className="shell-grid">
        <Sidebar />
        <main className="main-content">{children}</main>
        <RightRail />
      </div>
    </div>
  );
}
