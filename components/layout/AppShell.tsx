import type { ReactNode } from "react";

import { Header } from "@/components/layout/Header";

type AppShellProps = {
  children: ReactNode;
  userEmail: string | null;
};

export function AppShell({ children, userEmail }: AppShellProps) {
  return (
    <div className="app-shell">
      <Header userEmail={userEmail} />
      <main className="main-content archive-main">{children}</main>
    </div>
  );
}
